import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import { HTTPException } from 'hono/http-exception';
import { ApiError, type Config, type Env, type Middleware } from './context.ts';
import { authRoutes, sessionMiddleware } from './auth.ts';
import { taskRoutes, readSummary } from './tasks.ts';
import { keyRoutes, integrationRoutes, readReminders } from './integrations.ts';
import type { Database } from './db.ts';

export function createApp(db: Database,config: Config) {
  if (config.secret.length < 32) throw new Error('JWT_SECRET must have at least 32 characters. Run npm run setup.');
  const app = new Hono<Env>();
  app.use('*',async (c,next) => { c.set('requestId',randomUUID()); c.header('X-Request-ID',c.get('requestId')); await next(); });
  app.use('*',secureHeaders({ strictTransportSecurity: config.production ? 'max-age=15552000; includeSubDomains' : false }));
  app.use('/api/*',async(c,next) => { c.header('Cache-Control','no-store'); await next(); });
  app.use('/api/*',bodyLimit({ maxSize: 16 * 1024, onError: c => c.json({error:{code:'BODY_TOO_LARGE',message:'ข้อมูลมีขนาดเกิน 16 KB',request_id:c.get('requestId')}},413) }));
  app.use('/api/*',async(c,next) => {
    if (!['GET','HEAD','OPTIONS'].includes(c.req.method)) {
      const origin = c.req.header('origin');
      if ((origin && !config.origins.includes(origin)) || c.req.header('sec-fetch-site') === 'cross-site') throw new ApiError(403,'ORIGIN_DENIED','แหล่งที่มาของคำขอไม่ได้รับอนุญาต');
    }
    await next();
  });
  const attempts = new Map<string,{ count: number; until: number }>();
  const rateLimit = (bucket: string, limit: number, message: string): Middleware => async(c,next) => {
    const ip = config.clientIp?.(c) ?? 'local', time = Date.now();
    if (attempts.size > 10_000) for (const [key,value] of attempts) if (value.until <= time) attempts.delete(key);
    const key = `${bucket}:${ip}`;
    const previous = attempts.get(key), entry = previous && previous.until > time ? previous : {count:0,until:time+15*60_000};
    if (++entry.count > limit) { c.header('Retry-After',String(Math.ceil((entry.until-time)/1000))); throw new ApiError(429,'RATE_LIMITED',message); }
    attempts.set(key,entry); await next();
  };
  const authLimit = rateLimit('auth',config.authLimit ?? 20,'ลองเข้าสู่ระบบมากเกินไป กรุณารอสักครู่');
  app.use('/api/auth/login',authLimit); app.use('/api/auth/register',authLimit);
  app.use('/api/auth/forgot-password',rateLimit('reset-request',config.resetRequestLimit ?? 5,'ขอลิงก์บ่อยเกินไป กรุณารอ 15 นาทีแล้วลองใหม่'));
  app.use('/api/auth/reset-password',rateLimit('reset-submit',config.resetSubmitLimit ?? 10,'ลองตั้งรหัสผ่านบ่อยเกินไป กรุณารอ 15 นาทีแล้วลองใหม่'));
  app.route('/api/auth',authRoutes(db,config));
  const session = sessionMiddleware(db,config);
  for (const path of ['/api/tasks/*','/api/keys/*','/api/summary','/api/reminders']) app.use(path,session);
  app.route('/api/tasks',taskRoutes(db));
  app.route('/api/keys',keyRoutes(db));
  app.get('/api/summary',c => c.json({summary:readSummary(db,c.get('user').id)}));
  app.get('/api/reminders',c => c.json({reminders:readReminders(db,c.get('user').id)}));
  app.route('/api/integrations',integrationRoutes(db));
  app.get('/api/health',c => { db.prepare('SELECT 1').get(); return c.json({status:'ok',service:'taskflow-api'}); });
  app.notFound(c => c.json({error:{code:'NOT_FOUND',message:'ไม่พบเส้นทางนี้',request_id:c.get('requestId')}},404));
  app.onError((error,c) => {
    const status = error instanceof ApiError ? error.status : error instanceof HTTPException ? error.status : 500;
    const code = error instanceof ApiError ? error.code : 'INTERNAL_ERROR';
    if (status >= 500 && !config.silent) console.error(JSON.stringify({level:'error',request_id:c.get('requestId'),method:c.req.method,path:c.req.path,status}));
    return c.json({error:{code,message:status >= 500 && !(error instanceof ApiError && status === 503) ? 'ระบบเกิดข้อผิดพลาด กรุณาลองใหม่' : error.message,request_id:c.get('requestId')}},status);
  });
  return app;
}
