import type { Context, MiddlewareHandler } from 'hono';
import type { z } from 'zod';
import type { User } from '@taskflow/shared';
import type { Database } from './db.ts';
export type Env = { Variables: { user: User; sessionId: string; requestId: string } };
export type AppContext = Context<Env>;
export type Middleware = MiddlewareHandler<Env>;
export interface PasswordResetMail { to: string; resetUrl: string; expiresMinutes: number }
export interface PasswordResetConfig { publicUrl: string; send: (mail: PasswordResetMail) => Promise<void>; sendVerification?:(mail:{to:string;verifyUrl:string})=>Promise<void> }
export interface Config {
  secret: string; origins: string[]; production?: boolean; silent?: boolean; authLimit?: number;
  resetRequestLimit?: number; resetSubmitLimit?: number;
  passwordReset?: PasswordResetConfig;
  dailyEmailEnabled?: boolean;
  social?: import('./social-config.ts').SocialConfig;
  assistant?: {key?:string;model?:string;fetch?:typeof fetch};
  clientIp?: (c: AppContext) => string;
}
export class ApiError extends Error {
  constructor(public status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 429 | 500 | 503, public code: string, message: string) { super(message); }
}
export async function parseBody<T>(c: AppContext, schema: z.ZodType<T>): Promise<T> {
  const mediaType = c.req.header('content-type')?.split(';')[0].trim().toLowerCase();
  if (mediaType !== 'application/json') throw new ApiError(415, 'JSON_REQUIRED', 'กรุณาส่งข้อมูลเป็น JSON');
  let body: unknown;
  try { body = await c.req.json(); } catch { throw new ApiError(400, 'INVALID_JSON', 'รูปแบบ JSON ไม่ถูกต้อง'); }
  const result = schema.safeParse(body);
  if (!result.success) throw new ApiError(400, 'VALIDATION_ERROR', result.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง');
  return result.data;
}
export async function get<T>(db: Database, sql: string, ...values: (string | number | null)[]) { return await db.prepare(sql).get(...values) as T | undefined; }
export async function all<T>(db: Database, sql: string, ...values: (string | number | null)[]) { return await db.prepare(sql).all(...values) as T[]; }
export const now = () => new Date().toISOString();
export const bangkokDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export async function transaction<T>(db: Database, work: () => Promise<T> | T): Promise<T> {
  if ('transaction' in db) return db.transaction(async()=>await work());
  await db.exec('BEGIN IMMEDIATE');
  try { const result = await work(); await db.exec('COMMIT'); return result; }
  catch (error) { await db.exec('ROLLBACK'); throw error; }
}
