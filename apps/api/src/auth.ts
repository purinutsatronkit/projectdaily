import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { loginSchema, registerSchema, type User } from '@taskflow/shared';
import { hashPassword, checkPassword, issueToken, verifyToken } from './security.ts';
import { ApiError, get, now, parseBody, type Config, type Env, type Middleware } from './context.ts';
import type { Database } from './db.ts';
import { passwordResetRoutes } from './password-reset.ts';
import { readUser } from './account.ts';
import {queueVerification} from './email-verification.ts';

const COOKIE = 'taskflow_session';
export async function startSession(db:Database,config:Config,c:Parameters<Middleware>[0],user:User) {
  const id=randomUUID();
  db.prepare('INSERT INTO auth_sessions(id,user_id,expires_at,created_at) VALUES(?,?,?,?)').run(id,user.id,new Date(Date.now()+5*60*60_000).toISOString(),now());
  const token=await issueToken(user.id,id,config.secret);
  setCookie(c,COOKIE,token,{httpOnly:true,secure:!!config.production,sameSite:'Lax',path:'/',maxAge:18000});
}
export function sessionMiddleware(db: Database, config: Config): Middleware {
  return async (c, next) => {
    const token = getCookie(c, COOKIE);
    if (!token) throw new ApiError(401, 'UNAUTHORIZED', 'กรุณาเข้าสู่ระบบ');
    let user: User | undefined;
    let sid: string;
    try {
      const payload = await verifyToken(token, config.secret);
      if (!payload.sub || typeof payload.sid !== 'string') throw new Error('Missing claims');
      sid = payload.sid;
      user = get<User>(db, `SELECT u.id,u.name,u.email FROM users u JOIN auth_sessions s ON s.user_id=u.id
        WHERE s.id=? AND u.id=? AND s.revoked_at IS NULL AND s.expires_at>?`, sid, payload.sub, now());
    } catch { throw new ApiError(401, 'SESSION_EXPIRED', 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง'); }
    if (!user || (config.production && user.email === 'demo@taskflow.local')) throw new ApiError(401, 'SESSION_EXPIRED', 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง');
    c.set('user', readUser(db,user.id)); c.set('sessionId', sid!);
    await next();
  };
}
export function authRoutes(db: Database, config: Config) {
  const routes = new Hono<Env>();
  const authenticate = sessionMiddleware(db, config);
  routes.route('/', passwordResetRoutes(db, config));
  routes.post('/register', async c => {
    const body = await parseBody(c, registerSchema);
    if (config.production && body.email === 'demo@taskflow.local') throw new ApiError(400, 'DEMO_DISABLED', 'บัญชีตัวอย่างใช้ได้เฉพาะระบบพัฒนา');
    const user: User = { id: randomUUID(), name: body.name, email: body.email };
    const hash = await hashPassword(body.password);
    try { db.prepare('INSERT INTO users(id,name,email,password_hash,created_at) VALUES(?,?,?,?,?)').run(user.id,user.name,user.email,hash,now()); }
    catch (error) {
      if (String(error).includes('UNIQUE constraint')) throw new ApiError(409, 'EMAIL_EXISTS', 'อีเมลนี้มีบัญชีแล้ว');
      throw error;
    }
    await startSession(db, config, c, user);
    if(config.passwordReset?.sendVerification&&user.email!=='demo@taskflow.local')queueVerification(db,config,user.id,user.email);
    return c.json({ user: readUser(db,user.id) }, 201);
  });
  routes.post('/login', async c => {
    const body = await parseBody(c, loginSchema);
    const stored = get<User & { password_hash: string }>(db, 'SELECT id,name,email,password_hash FROM users WHERE email=?', body.email);
    // A real scrypt hash even for unknown accounts reduces timing differences.
    const fallbackHash = 'scrypt:00000000000000000000000000000000:' + '00'.repeat(64);
    const valid = await checkPassword(body.password, stored?.password_hash ?? fallbackHash);
    // A password reset can commit while scrypt runs. Never create a session from the old hash.
    const current = stored ? get<{ password_hash: string }>(db, 'SELECT password_hash FROM users WHERE id=?', stored.id) : undefined;
    if (!stored || !valid || current?.password_hash !== stored.password_hash || (config.production && stored.email === 'demo@taskflow.local')) throw new ApiError(401, 'INVALID_CREDENTIALS', 'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    const { password_hash: _hash, ...user } = stored;
    await startSession(db, config, c, user);
    return c.json({ user: readUser(db,user.id) });
  });
  routes.get('/me', authenticate, c => c.json({ user: c.get('user') }));
  routes.post('/logout', async c => {
    const token = getCookie(c, COOKIE);
    if (token) {
      try { const payload = await verifyToken(token, config.secret); if (typeof payload.sid === 'string' && payload.sub) db.prepare('UPDATE auth_sessions SET revoked_at=? WHERE id=? AND user_id=?').run(now(),payload.sid,payload.sub); }
      catch { /* Expired cookie still gets removed. */ }
    }
    deleteCookie(c, COOKIE, { path: '/', secure: !!config.production, sameSite: 'Lax' });
    return c.body(null, 204);
  });
  return routes;
}
