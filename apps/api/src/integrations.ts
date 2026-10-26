import { randomBytes, randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { apiKeySchema, dateSchema, reminderSchema, type ApiKey, type User, type Task, type Reminder } from '@taskflow/shared';
import { ApiError, all, get, now, bangkokDate, parseBody, transaction, type Env } from './context.ts';
import { hashApiKey } from './security.ts';
import { TASK_COLUMNS } from './tasks.ts';
import type { Database } from './db.ts';

const KEY_COLUMNS = 'id,name,prefix,created_at,expires_at,revoked_at,last_used_at';
export function keyRoutes(db: Database) {
  const routes = new Hono<Env>();
  routes.get('/', c => c.json({ keys: all<ApiKey>(db, `SELECT ${KEY_COLUMNS} FROM api_keys WHERE user_id=? ORDER BY created_at DESC`,c.get('user').id) }));
  routes.post('/', async c => {
    const body = await parseBody(c,apiKeySchema);
    const count = get<{ total: number }>(db,'SELECT COUNT(*) total FROM api_keys WHERE user_id=? AND revoked_at IS NULL AND expires_at>?',c.get('user').id,now())!.total;
    if (count >= 5) throw new ApiError(409,'KEY_LIMIT','สร้าง API key ที่ใช้งานได้สูงสุด 5 รายการ');
    const id = randomUUID(), secret = 'tf_' + randomBytes(32).toString('base64url');
    db.prepare('INSERT INTO api_keys(id,user_id,name,prefix,secret_hash,scope,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)')
      .run(id,c.get('user').id,body.name,secret.slice(0,11),hashApiKey(secret),'reminders',now(),new Date(Date.now()+30*86400_000).toISOString());
    return c.json({ key: get<ApiKey>(db,`SELECT ${KEY_COLUMNS} FROM api_keys WHERE id=?`,id), secret },201);
  });
  routes.delete('/:id', c => {
    const result = db.prepare('UPDATE api_keys SET revoked_at=COALESCE(revoked_at,?) WHERE id=? AND user_id=?').run(now(),c.req.param('id'),c.get('user').id);
    if (!result.changes) throw new ApiError(404,'NOT_FOUND','ไม่พบ API key นี้');
    return c.body(null,204);
  });
  return routes;
}
export function integrationRoutes(db: Database, production=false) {
  const routes = new Hono<Env>();
  routes.use('*', async (c,next) => {
    const raw = c.req.header('x-api-key');
    if (!raw || raw.length > 100) throw new ApiError(401,'INVALID_API_KEY','API key ไม่ถูกต้อง');
    const key = get<{ id: string; user_id: string }>(db,'SELECT id,user_id FROM api_keys WHERE secret_hash=? AND scope=? AND revoked_at IS NULL AND expires_at>?',hashApiKey(raw),'reminders',now());
    if (!key) throw new ApiError(401,'INVALID_API_KEY','API key หมดอายุหรือถูกยกเลิก');
    const user = get<User>(db,'SELECT id,name,email FROM users WHERE id=?',key.user_id);
    if (!user || (production && user.email === 'demo@taskflow.local')) throw new ApiError(401,'INVALID_API_KEY','API key ไม่ถูกต้อง');
    c.set('user',user);
    db.prepare('UPDATE api_keys SET last_used_at=? WHERE id=?').run(now(),key.id);
    await next();
  });
  routes.get('/due-tasks',c => {
    const date = c.req.query('date') ?? bangkokDate();
    if (!dateSchema.safeParse(date).success) throw new ApiError(400,'INVALID_DATE','วันที่ไม่ถูกต้อง');
    const tasks = all<Task>(db,`SELECT ${TASK_COLUMNS} FROM tasks t WHERE t.user_id=? AND t.status!='completed' AND t.due_date<=?
      AND NOT EXISTS(SELECT 1 FROM reminder_deliveries d WHERE d.task_id=t.id AND d.user_id=t.user_id AND d.notification_date=? AND d.channel='email')
      ORDER BY due_date,id LIMIT 100`,c.get('user').id,date,date);
    return c.json({ date, user: c.get('user'), tasks });
  });
  routes.post('/reminders',async c => {
    const body = await parseBody(c,reminderSchema), userId = c.get('user').id;
    const inserted = transaction(db,() => {
      for (const id of body.task_ids) {
        const task = get<{ id: string }>(db,'SELECT id FROM tasks WHERE id=? AND user_id=?',id,userId);
        if (!task) throw new ApiError(404,'NOT_FOUND','ไม่พบงานบางรายการ');
      }
      let count = 0;
      for (const id of new Set(body.task_ids)) count += Number(db.prepare('INSERT OR IGNORE INTO reminder_deliveries(id,user_id,task_id,notification_date,channel,created_at) VALUES(?,?,?,?,?,?)').run(randomUUID(),userId,id,body.date,body.channel,now()).changes);
      return count;
    });
    return c.json({ recorded: inserted });
  });
  return routes;
}
export function readReminders(db: Database,userId: string) {
  return all<Reminder>(db,`SELECT d.id,d.task_id,t.title task_title,d.notification_date,d.channel,d.created_at
    FROM reminder_deliveries d JOIN tasks t ON t.id=d.task_id WHERE d.user_id=? ORDER BY d.created_at DESC LIMIT 100`,userId);
}
