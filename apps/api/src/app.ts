import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import { HTTPException } from 'hono/http-exception';
import { ApiError, type Config, type Env, type Middleware } from './context.ts';
import { authRoutes, sessionMiddleware } from './auth.ts';
import { taskRoutes, readSummary } from './tasks.ts';
import { notificationRoutes } from './notifications.ts';
import { keyRoutes, integrationRoutes, readReminders } from './integrations.ts';
import type { Database } from './db.ts';
import { accountRoutes } from './account.ts';
import { sk09Routes } from './sk09.ts';
import { socialRoutes } from './social.ts';
import { githubRoutes } from './github.ts';
import {projectRoutes} from './projects.ts';
import {verificationRoutes} from './email-verification.ts';
import {assistantRoutes} from './assistant.ts';
import {dataRightsRoutes} from './data-rights.ts';

export function createApp(db: Database,config: Config) {
  if (config.secret.length < 32) throw new Error('JWT_SECRET must have at least 32 characters. Run npm run setup.');
  const app = new Hono<Env>();
  app.use('*',async (c,next) => { c.set('requestId',randomUUID()); c.header('X-Request-ID',c.get('requestId')); await next(); });
  app.use('*',secureHeaders({ strictTransportSecurity: config.production ? 'max-age=15552000; includeSubDomains' : false }));
  app.use('/api/*',async(c,next) => { c.header('Cache-Control','no-store'); await next(); });
  const limit = (maxSize: number, message: string) => bodyLimit({ maxSize, onError: (c: import('./context.ts').AppContext) => c.json({error:{code:'BODY_TOO_LARGE',message,request_id:c.get('requestId')}},413) });
  app.use('/api/*', (c,next) => c.req.path === '/api/account/avatar' && c.req.method === 'PUT'
    ? limit(2 * 1024 * 1024,'รูปภาพต้องมีขนาดไม่เกิน 2 MB')(c,next)
    : c.req.path === '/api/sk09/draft' && c.req.method === 'PUT'
      ? limit(64 * 1024,'ร่างมีขนาดเกิน 64 KB')(c,next)
      : limit(16 * 1024,'ข้อมูลมีขนาดเกิน 16 KB')(c,next));
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
  for(const path of ['/api/auth/google/start','/api/auth/google/link','/api/auth/github/start']) app.use(path,authLimit);
  app.use('/api/auth/forgot-password',rateLimit('reset-request',config.resetRequestLimit ?? 5,'ขอลิงก์บ่อยเกินไป กรุณารอ 15 นาทีแล้วลองใหม่'));
  app.use('/api/auth/reset-password',rateLimit('reset-submit',config.resetSubmitLimit ?? 10,'ลองตั้งรหัสผ่านบ่อยเกินไป กรุณารอ 15 นาทีแล้วลองใหม่'));
  app.use('/api/auth/request-email-verification',rateLimit('verify-request',5,'ขอลิงก์บ่อยเกินไป กรุณารอ 15 นาที'));
  app.use('/api/auth/verify-email',rateLimit('verify-submit',10,'ลองยืนยันบ่อยเกินไป กรุณารอ 15 นาที'));
  app.route('/api/auth',authRoutes(db,config));
  app.route('/api/auth',verificationRoutes(db,config));
  app.route('/api/auth',socialRoutes(db,config));
  const session = sessionMiddleware(db,config);
  app.use('/api/github/*',session);
  app.use('/api/github/*',rateLimit('github',300,'เรียก GitHub บ่อยเกินไป กรุณารอสักครู่'));
  app.route('/api/github',githubRoutes(db,config));
  app.use('/api/projects',session);
  app.use('/api/projects/*',session);
  app.route('/api/projects',projectRoutes(db));
  app.use('/api/assistant/*',session);
  app.use('/api/assistant/plan',rateLimit('assistant',30,'ถาม AI บ่อยเกินไป กรุณารอสักครู่'));
  app.route('/api/assistant',assistantRoutes(db,config.assistant));
  app.use('/api/account',session);
  app.use('/api/account/*',session);
  app.route('/api/account',accountRoutes(db,config));
  app.route('/api/account',dataRightsRoutes(db,config));
  app.use('/api/sk09/*',session);
  app.route('/api/sk09',sk09Routes(db));
  for (const path of ['/api/tasks/*','/api/keys/*','/api/summary','/api/reminders','/api/reminders/*','/api/notifications/*']) app.use(path,session);
  app.route('/api/tasks',taskRoutes(db));
  app.route('/api/keys',keyRoutes(db));
  app.get('/api/summary',c => {
    const projectId=c.req.query('project_id');
    if(projectId&&projectId!=='unassigned'&&!db.prepare('SELECT id FROM projects WHERE id=? AND user_id=?').get(projectId,c.get('user').id))throw new ApiError(404,'NOT_FOUND','ไม่พบโปรเจกต์นี้');
    return c.json({summary:readSummary(db,c.get('user').id,projectId)});
  });
  app.route('/api/notifications',notificationRoutes(db));
  app.get('/api/reminders',c => c.json({reminders:readReminders(db,c.get('user').id)}));
  app.get('/api/reminders/settings',c=>c.json({available:config.dailyEmailEnabled!==false&&!!(config.passwordReset&&'sendTaskReminder'in config.passwordReset),verified:!!c.get('user').email_verified_at,schedule:'07:00 Asia/Bangkok'}));
  app.route('/api/integrations',integrationRoutes(db,config.production));
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
