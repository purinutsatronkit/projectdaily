import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { resolve } from 'node:path';
import { openDatabase } from '../apps/api/src/db.ts';
import { createApp } from '../apps/api/src/app.ts';

const port = 4179;
const origin = `http://127.0.0.1:${port}`;
const db = openDatabase(':memory:');
const app = createApp(db, {
  secret: 'taskflow-playwright-isolated-secret-2026',
  origins: [origin],
  silent: true,
  authLimit: 100,
  assistant: {
    key: 'playwright-fake-key',
    fetch: (async (_url, init) => {
      const prompt=JSON.parse(String(init?.body)).contents[0].parts[0].text as string;
      const answer=prompt.includes('Playwright AI สร้างงาน')
        ? {reply:'ตรวจรายละเอียดงานก่อนยืนยัน',action:{type:'create_task',data:{title:'Playwright AI สร้างงาน',due_date:'2027-01-07'}}}
        : {reply:'กรุณาระบุคำสั่งให้ชัดเจน',action:null};
      return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(answer)}]}}]});
    }) as typeof fetch,
  },
});
const publicPath = resolve('apps/web/dist');
app.get('*', async (c, next) => c.req.path.startsWith('/api/') ? next() : serveStatic({ root: publicPath })(c, next));
app.get('*', async (c, next) => c.req.path.startsWith('/api/') ? next() : serveStatic({ path: resolve(publicPath, 'index.html') })(c, next));
const server = serve({ fetch: app.fetch, port, hostname: '127.0.0.1' });
function stop() { server.close(() => db.close()); }
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
