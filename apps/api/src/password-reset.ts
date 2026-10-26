import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { Hono } from 'hono';
import { forgotPasswordSchema, resetPasswordSchema } from '@taskflow/shared';
import { deleteCookie } from 'hono/cookie';
import { ApiError, get, now, parseBody, transaction, type Config, type Env } from './context.ts';
import type { Database } from './db.ts';
import { hashPassword } from './security.ts';
import { trustedPublicUrl } from './mail.ts';

const EXPIRES_MINUTES = 5;
const GENERIC_MESSAGE = 'หากอีเมลนี้มีบัญชีอยู่ในระบบ คุณจะได้รับลิงก์ตั้งรหัสผ่านใหม่ กรุณาตรวจกล่องจดหมายและสแปม';
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
interface ResetToken { id: string; user_id: string; token_hash: string; expires_at: string; used_at: string | null }

export function passwordResetRoutes(db: Database, config: Config) {
  const routes = new Hono<Env>();
  const mail = config.passwordReset;
  const publicUrl = mail ? trustedPublicUrl(mail.publicUrl, !!config.production) : undefined;

  routes.post('/forgot-password', async c => {
    const { email } = await parseBody(c, forgotPasswordSchema);
    if (!mail) throw new ApiError(503, 'SMTP_NOT_CONFIGURED', 'ระบบยังไม่ได้ตั้งค่าอีเมลส่งลิงก์ กรุณาให้ผู้ดูแลตั้งค่า Gmail SMTP ก่อน');
    const user = get<{ id: string; email: string }>(db, 'SELECT id,email FROM users WHERE email=?', email);
    const timestamp = now();
    // Keep at least one hour of request history for the persistent per-account limit.
    db.prepare('DELETE FROM password_reset_tokens WHERE created_at<? AND expires_at<=?')
      .run(new Date(Date.now() - 24 * 60 * 60_000).toISOString(), timestamp);
    if (user) {
      const recent = get<{ total: number; latest: string | null }>(db,
        'SELECT COUNT(*) AS total, MAX(created_at) AS latest FROM password_reset_tokens WHERE user_id=? AND created_at>?',
        user.id, new Date(Date.now() - 60 * 60_000).toISOString());
      if (!recent || (recent.total < 3 && (!recent.latest || Date.now() - Date.parse(recent.latest) >= 60_000))) {
        const token = randomBytes(32).toString('hex'), id = randomUUID();
        db.prepare('INSERT INTO password_reset_tokens(id,user_id,token_hash,expires_at,created_at) VALUES(?,?,?,?,?)')
          .run(id, user.id, digest(token), new Date(Date.now() + EXPIRES_MINUTES * 60_000).toISOString(), timestamp);
        const link = new URL('/reset-password', publicUrl);
        link.hash = new URLSearchParams({ token }).toString();
        const requestId = c.get('requestId');
        // SMTP runs after accepting the request, avoiding account-dependent network response times.
        setImmediate(() => {
          void mail.send({ to: user.email, resetUrl: link.toString(), expiresMinutes: EXPIRES_MINUTES }).catch(() => {
            db.prepare('DELETE FROM password_reset_tokens WHERE id=? AND used_at IS NULL').run(id);
            // Do not log SMTP errors: they may contain addresses, credentials, or reset links.
            if (!config.silent) console.error(JSON.stringify({ level: 'error', event: 'password_reset_email_failed', request_id: requestId }));
          });
        });
      }
    }
    return c.json({ message: GENERIC_MESSAGE }, 202);
  });

  routes.post('/reset-password', async c => {
    const { token, password } = await parseBody(c, resetPasswordSchema);
    const tokenHash = digest(token);
    const record = get<ResetToken>(db, 'SELECT id,user_id,token_hash,expires_at,used_at FROM password_reset_tokens WHERE token_hash=?', tokenHash);
    const invalid = () => new ApiError(400, 'INVALID_RESET_TOKEN', 'ลิงก์ไม่ถูกต้อง หมดอายุ หรือถูกใช้แล้ว กรุณาขอลิงก์ตั้งรหัสผ่านใหม่');
    if (!record || record.used_at || record.expires_at <= now()) throw invalid();
    const passwordHash = await hashPassword(password);
    const timestamp = now();
    transaction(db, () => {
      const claimed = db.prepare('UPDATE password_reset_tokens SET used_at=? WHERE id=? AND token_hash=? AND used_at IS NULL AND expires_at>?')
        .run(timestamp, record.id, tokenHash, timestamp);
      if (claimed.changes !== 1) throw invalid();
      db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(passwordHash, record.user_id);
      db.prepare('UPDATE auth_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL').run(timestamp, record.user_id);
      db.prepare('UPDATE password_reset_tokens SET used_at=? WHERE user_id=? AND used_at IS NULL').run(timestamp, record.user_id);
    });
    deleteCookie(c, 'taskflow_session', { path: '/', secure: !!config.production, sameSite: 'Lax' });
    return c.json({ message: 'ตั้งรหัสผ่านใหม่สำเร็จแล้ว กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่' });
  });
  return routes;
}
