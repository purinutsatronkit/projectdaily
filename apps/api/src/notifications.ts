import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import type { Task } from '@taskflow/shared';
import { ApiError, all, now, transaction, type Env } from './context.ts';
import { TASK_COLUMNS, TASK_ORDER } from './tasks.ts';
import type { Database } from './db.ts';

export async function readNotifications(db:Database,userId:string,at=new Date()) {
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(at);
  const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Bangkok',hour:'2-digit',hourCycle:'h23'}).format(at));
  const end=new Date(`${today}T00:00:00Z`);end.setUTCDate(end.getUTCDate()+3);
  const through=end.toISOString().slice(0,10),timestamp=at.toISOString();
  if(hour>=7) await transaction(db,async ()=>{
    const batch=await db.prepare('INSERT OR IGNORE INTO notification_batches(user_id,notification_date,created_at) VALUES(?,?,?)').run(userId,today,timestamp);
    if(!batch.changes) return;
    // Each morning replaces yesterday's inbox; read items stay read until the
    // next day's batch. Generation also catches up after the server was offline.
    await db.prepare('UPDATE task_notifications SET read_at=? WHERE user_id=? AND read_at IS NULL AND notification_date<?').run(timestamp,userId,today);
    const tasks=await all<{id:string}>(db,"SELECT id FROM tasks WHERE user_id=? AND status!='completed' AND due_date<=?",userId,through);
    for(const task of tasks) await db.prepare('INSERT INTO task_notifications(id,user_id,task_id,notification_date,created_at) VALUES(?,?,?,?,?)').run(randomUUID(),userId,task.id,today,timestamp);
    const cutoff=new Date(end);cutoff.setUTCDate(cutoff.getUTCDate()-33);
    const oldest=cutoff.toISOString().slice(0,10);
    await db.prepare('DELETE FROM task_notifications WHERE user_id=? AND notification_date<?').run(userId,oldest);
    await db.prepare('DELETE FROM notification_batches WHERE user_id=? AND notification_date<?').run(userId,oldest);
  });
  const columns=TASK_COLUMNS.split(',').map(column=>`t.${column}`).join(',');
  const tasks=await all<Task & {notification_id:string;notification_date:string}>(db,`SELECT ${columns},n.id AS notification_id,n.notification_date FROM task_notifications n
    JOIN tasks t ON t.id=n.task_id AND t.user_id=n.user_id
    WHERE n.user_id=? AND n.read_at IS NULL AND t.status!='completed' AND t.due_date<=?
    ORDER BY ${TASK_ORDER.replace(/\b(status|due_date|priority|created_at|id)\b/g,'t.$1')}`,userId,through);
  return {today,through,tasks,count:tasks.length};
}
export function notificationRoutes(db:Database) {
  const routes=new Hono<Env>();
  routes.get('/',async c=>c.json(await readNotifications(db,c.get('user').id)));
  routes.patch('/:id/read',async c=>{
    const result=await db.prepare('UPDATE task_notifications SET read_at=COALESCE(read_at,?) WHERE id=? AND user_id=?').run(now(),c.req.param('id'),c.get('user').id);
    if(!result.changes) throw new ApiError(404,'NOT_FOUND','ไม่พบการแจ้งเตือนนี้');
    return c.body(null,204);
  });
  routes.post('/read-all',async c=>{
    await db.prepare('UPDATE task_notifications SET read_at=? WHERE user_id=? AND read_at IS NULL').run(now(),c.get('user').id);
    await db.prepare('UPDATE pipeline_notifications SET read_at=? WHERE user_id=? AND read_at IS NULL').run(now(),c.get('user').id);
    return c.body(null,204);
  });
  return routes;
}
