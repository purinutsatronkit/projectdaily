import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { getConnInfo } from '@hono/node-server/conninfo';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { openDatabase } from './db.ts';
import { createApp } from './app.ts';
import { resetEmailFromEnvironment } from './mail.ts';

const root = fileURLToPath(new URL('../../../',import.meta.url));
const production = process.env.NODE_ENV === 'production';
const passwordReset = resetEmailFromEnvironment();
if (!passwordReset) console.warn('Password reset email is not configured. Set SMTP_USER and SMTP_PASS in .env; see docs/password-reset-gmail.md');
if (production && !process.env.APP_ORIGIN?.startsWith('https://')) throw new Error('Production APP_ORIGIN must use HTTPS.');
const db = openDatabase(resolve(root,process.env.DATABASE_PATH ?? './data/taskflow.sqlite'));
const app = createApp(db,{secret:process.env.JWT_SECRET ?? '',production,passwordReset,
  origins:[process.env.APP_ORIGIN ?? 'http://localhost:5173',...(!production ? ['http://localhost:3000'] : [])],
  clientIp:c => getConnInfo(c).remote.address ?? 'unknown'});
const publicPath = resolve(root,'apps/web/dist');
if (existsSync(publicPath)) {
  app.get('*',async(c,next) => c.req.path.startsWith('/api/') ? next() : serveStatic({root:publicPath})(c,next));
  app.get('*',async(c,next) => c.req.path.startsWith('/api/') ? next() : serveStatic({path:resolve(publicPath,'index.html')})(c,next));
}
const port = Number(process.env.PORT ?? 3000), hostname = process.env.HOST ?? '127.0.0.1';
const server = serve({fetch:app.fetch,port,hostname},() => console.log(`TaskFlow API ready: http://localhost:${port}`));
function stop() { server.close(() => { db.close(); process.exit(0); }); }
process.once('SIGINT',stop); process.once('SIGTERM',stop);
