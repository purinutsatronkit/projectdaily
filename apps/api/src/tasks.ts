import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { taskSchema, taskUpdateSchema, statuses, priorities, type Task, type Summary } from '@taskflow/shared';
import { ApiError, all, get, now, bangkokDate, parseBody, type Env } from './context.ts';
import type { Database } from './db.ts';

export const TASK_COLUMNS = 'id,title,description,priority,status,due_date,created_at,updated_at';
export function taskRoutes(db: Database) {
  const routes = new Hono<Env>();
  routes.get('/', c => {
    const { status, priority, search = '' } = c.req.query();
    if (status && !statuses.includes(status as typeof statuses[number])) throw new ApiError(400, 'INVALID_FILTER', 'สถานะไม่ถูกต้อง');
    if (priority && !priorities.includes(priority as typeof priorities[number])) throw new ApiError(400, 'INVALID_FILTER', 'ระดับความสำคัญไม่ถูกต้อง');
    if (search.length > 120) throw new ApiError(400, 'INVALID_FILTER', 'คำค้นหายาวเกินไป');
    const conditions = ['user_id=?'];
    const args = [c.get('user').id];
    if (status) { conditions.push('status=?'); args.push(status); }
    if (priority) { conditions.push('priority=?'); args.push(priority); }
    if (search) { conditions.push('(instr(lower(title),lower(?))>0 OR instr(lower(description),lower(?))>0)'); args.push(search,search); }
    const tasks = all<Task>(db, `SELECT ${TASK_COLUMNS} FROM tasks WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC,id DESC`, ...args);
    return c.json({ tasks });
  });
  routes.post('/', async c => {
    const body = await parseBody(c, taskSchema);
    const id = randomUUID(), timestamp = now(), userId = c.get('user').id;
    db.prepare('INSERT INTO tasks(id,user_id,title,description,priority,status,due_date,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(id,userId,body.title,body.description,body.priority,body.status,body.due_date,timestamp,timestamp);
    return c.json({ task: get<Task>(db, `SELECT ${TASK_COLUMNS} FROM tasks WHERE id=? AND user_id=?`, id,userId) }, 201);
  });
  routes.get('/:id', c => {
    const task = get<Task>(db, `SELECT ${TASK_COLUMNS} FROM tasks WHERE id=? AND user_id=?`, c.req.param('id'),c.get('user').id);
    if (!task) throw new ApiError(404, 'NOT_FOUND', 'ไม่พบงานนี้');
    return c.json({ task });
  });
  routes.patch('/:id', async c => {
    const body = await parseBody(c, taskUpdateSchema);
    const userId = c.get('user').id, id = c.req.param('id');
    const current = get<Task>(db, `SELECT ${TASK_COLUMNS} FROM tasks WHERE id=? AND user_id=?`, id,userId);
    if (!current) throw new ApiError(404, 'NOT_FOUND', 'ไม่พบงานนี้');
    const updated = { ...current, ...body };
    db.prepare('UPDATE tasks SET title=?,description=?,priority=?,status=?,due_date=?,updated_at=? WHERE id=? AND user_id=?')
      .run(updated.title,updated.description,updated.priority,updated.status,updated.due_date,now(),id,userId);
    return c.json({ task: get<Task>(db, `SELECT ${TASK_COLUMNS} FROM tasks WHERE id=? AND user_id=?`, id,userId) });
  });
  routes.delete('/:id', c => {
    const result = db.prepare('DELETE FROM tasks WHERE id=? AND user_id=?').run(c.req.param('id'),c.get('user').id);
    if (!result.changes) throw new ApiError(404, 'NOT_FOUND', 'ไม่พบงานนี้');
    return c.body(null,204);
  });
  return routes;
}
export function readSummary(db: Database, userId: string) {
  return get<Summary>(db, `SELECT COUNT(*) total,
    COALESCE(SUM(status='pending'),0) pending,COALESCE(SUM(status='in_progress'),0) in_progress,
    COALESCE(SUM(status='completed'),0) completed,
    COALESCE(SUM(status!='completed' AND due_date<?),0) overdue FROM tasks WHERE user_id=?`, bangkokDate(),userId)!;
}
