import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { accountSchema, type User } from '@taskflow/shared';
import { ApiError, get, parseBody, transaction, type Env, type Config } from './context.ts';
import { checkPassword } from './security.ts';
import {queueVerification} from './email-verification.ts';
import type { Database } from './db.ts';

export const USER_COLUMNS = "id,name,email,nickname,phone,email_verified_at,CASE WHEN avatar IS NULL THEN NULL ELSE '/api/account/avatar?v=' || avatar_version END AS avatar_url";
export async function readUser(db: Database, id: string) { return (await get<User>(db, `SELECT ${USER_COLUMNS} FROM users WHERE id=?`, id))!; }
export function accountRoutes(db: Database,config:Config) {
  const routes = new Hono<Env>();
  routes.get('/', async c => c.json({ user: await readUser(db, c.get('user').id) }));
  routes.patch('/', async c => {
    const body = await parseBody(c, accountSchema), id = c.get('user').id;
    const stored = (await get<{ email: string; password_hash: string }>(db, 'SELECT email,password_hash FROM users WHERE id=?', id))!;
    const changingEmail = body.email !== stored.email;
    if (changingEmail && (!body.current_password || !await checkPassword(body.current_password, stored.password_hash))) {
      throw new ApiError(400, 'PASSWORD_REQUIRED', 'กรอกรหัสผ่านปัจจุบันให้ถูกต้องเพื่อเปลี่ยนอีเมล');
    }
    if(changingEmail&&await get(db,'SELECT id FROM users WHERE email=?',body.email))throw new ApiError(409,'EMAIL_EXISTS','อีเมลนี้มีบัญชีแล้ว');
    try {
      await transaction(db, async () => {
        const current = (await get<{ email: string; password_hash: string }>(db, 'SELECT email,password_hash FROM users WHERE id=?', id))!;
        if (current.email !== stored.email || current.password_hash !== stored.password_hash) throw new ApiError(409, 'ACCOUNT_CHANGED', 'ข้อมูลบัญชีเปลี่ยนแล้ว กรุณารีเฟรชและลองใหม่');
        await db.prepare('UPDATE users SET name=?,nickname=?,phone=? WHERE id=?').run(body.name,body.nickname,body.phone,id);
        if(changingEmail)await queueVerification(db,config,id,body.email);
      });
    } catch (error) {
      if (String(error).includes('UNIQUE constraint')) throw new ApiError(409, 'EMAIL_EXISTS', 'อีเมลนี้มีบัญชีแล้ว');
      throw error;
    }
    return c.json({ user: await readUser(db, id),message:changingEmail?'ส่งลิงก์ยืนยันไปที่อีเมลใหม่แล้ว อีเมลเดิมยังใช้ได้จนกว่าจะยืนยัน':'บันทึกข้อมูลบัญชีแล้ว' });
  });
  routes.get('/avatar', async c => {
    const image = await get<{ avatar: Uint8Array; avatar_type: string }>(db, 'SELECT avatar,avatar_type FROM users WHERE id=?', c.get('user').id);
    if (!image?.avatar) throw new ApiError(404, 'NOT_FOUND', 'ยังไม่มีรูปโปรไฟล์');
    c.header('Content-Type', image.avatar_type);
    c.header('X-Content-Type-Options', 'nosniff');
    return c.body(new Uint8Array(image.avatar));
  });
  routes.put('/avatar', async c => {
    const bytes = Buffer.from(await c.req.arrayBuffer());
    const type = c.req.header('content-type')?.split(';')[0];
    const actual = bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png'
      : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'image/jpeg'
      : ['GIF87a','GIF89a'].includes(bytes.subarray(0,6).toString()) ? 'image/gif'
      : bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP' ? 'image/webp' : null;
    if (!actual || type !== actual) throw new ApiError(400, 'INVALID_IMAGE', 'ใช้ไฟล์ JPG, PNG, GIF หรือ WebP เท่านั้น');
    await db.prepare('UPDATE users SET avatar=?,avatar_type=?,avatar_version=? WHERE id=?').run(bytes,actual,randomUUID(),c.get('user').id);
    return c.json({ user: await readUser(db, c.get('user').id) });
  });
  routes.delete('/avatar', async c => {
    await db.prepare('UPDATE users SET avatar=NULL,avatar_type=NULL,avatar_version=NULL WHERE id=?').run(c.get('user').id);
    return c.json({ user: await readUser(db, c.get('user').id) });
  });
  return routes;
}
