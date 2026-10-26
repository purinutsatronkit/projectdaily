import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { taskSchema, taskUpdateSchema, statuses, priorities, dateSchema, type Task, type Summary } from '@taskflow/shared';
import {z} from 'zod';
import { ApiError, all, get, now, bangkokDate, parseBody, type Env } from './context.ts';
import type { Database } from './db.ts';

export const TASK_COLUMNS = 'id,title,description,priority,status,due_date,project_id,created_at,updated_at';
export const TASK_ORDER = "(status='completed'), (due_date IS NULL), due_date, CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, created_at DESC, id DESC";
export function taskRoutes(db: Database) {
  const routes = new Hono<Env>();
  routes.get('/', c => {
    const { status, priority, search = '',project_id:projectId } = c.req.query();
    if (status && !statuses.includes(status as typeof statuses[number])) throw new ApiError(400, 'INVALID_FILTER', 'สถานะไม่ถูกต้อง');
    if (priority && !priorities.includes(priority as typeof priorities[number])) throw new ApiError(400, 'INVALID_FILTER', 'ระดับความสำคัญไม่ถูกต้อง');
    if (search.length > 120) throw new ApiError(400, 'INVALID_FILTER', 'คำค้นหายาวเกินไป');
    if(projectId && projectId!=='unassigned'&&!z.uuid().safeParse(projectId).success)throw new ApiError(400,'INVALID_FILTER','โปรเจกต์ไม่ถูกต้อง');
    const conditions = ['user_id=?'];
    const args = [c.get('user').id];
    if (status) { conditions.push('status=?'); args.push(status); }
    if (priority) { conditions.push('priority=?'); args.push(priority); }
    if (search) { conditions.push('(instr(lower(title),lower(?))>0 OR instr(lower(description),lower(?))>0)'); args.push(search,search); }
    if(projectId){conditions.push(projectId==='unassigned'?'project_id IS NULL':'project_id=?');if(projectId!=='unassigned')args.push(projectId);}
    const tasks = all<Task>(db, `SELECT ${TASK_COLUMNS} FROM tasks WHERE ${conditions.join(' AND ')} ORDER BY ${TASK_ORDER}`, ...args);
    return c.json({ tasks });
  });
  routes.post('/', async c => {
    const body = await parseBody(c, taskSchema);
    const id = randomUUID(), timestamp = now(), userId = c.get('user').id;
    if(body.project_id&&!get(db,'SELECT id FROM projects WHERE id=? AND user_id=?',body.project_id,userId))throw new ApiError(400,'PROJECT_NOT_FOUND','ไม่พบโปรเจกต์นี้');
    db.prepare('INSERT INTO tasks(id,user_id,title,description,priority,status,due_date,project_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(id,userId,body.title,body.description,body.priority,body.status,body.due_date,body.project_id,timestamp,timestamp);
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
    if(updated.project_id&&!get(db,'SELECT id FROM projects WHERE id=? AND user_id=?',updated.project_id,userId))throw new ApiError(400,'PROJECT_NOT_FOUND','ไม่พบโปรเจกต์นี้');
    db.prepare('UPDATE tasks SET title=?,description=?,priority=?,status=?,due_date=?,project_id=?,updated_at=? WHERE id=? AND user_id=?')
      .run(updated.title,updated.description,updated.priority,updated.status,updated.due_date,updated.project_id,now(),id,userId);
    return c.json({ task: get<Task>(db, `SELECT ${TASK_COLUMNS} FROM tasks WHERE id=? AND user_id=?`, id,userId) });
  });
  routes.get('/:id/links',c=>{
    const userId=c.get('user').id,id=c.req.param('id');
    if(!get(db,'SELECT id FROM tasks WHERE id=? AND user_id=?',id,userId))throw new ApiError(404,'NOT_FOUND','ไม่พบงานนี้');
    return c.json({links:all(db,'SELECT id,kind,repository,number,created_at FROM task_github_links WHERE task_id=? AND user_id=? ORDER BY created_at',id,userId)});
  });
  routes.post('/:id/links',async c=>{
    const {url}=await parseBody(c,z.object({url:z.url().max(300)})),userId=c.get('user').id,id=c.req.param('id');
    if(!get(db,'SELECT id FROM tasks WHERE id=? AND user_id=?',id,userId))throw new ApiError(404,'NOT_FOUND','ไม่พบงานนี้');
    const link=new URL(url),parts=link.pathname.split('/').filter(Boolean);
    if(link.protocol!=='https:'||link.hostname!=='github.com'||link.username||link.password||link.search||link.hash||parts.length!==4||!['issues','pull'].includes(parts[2])||!/^[1-9]\d*$/.test(parts[3])||!parts.slice(0,2).every(v=>/^[A-Za-z0-9_.-]{1,100}$/.test(v)))throw new ApiError(400,'INVALID_GITHUB_LINK','ใช้ลิงก์ GitHub Issue หรือ Pull Request เท่านั้น');
    const number=Number(parts[3]);if(!Number.isSafeInteger(number))throw new ApiError(400,'INVALID_GITHUB_LINK','เลข Issue หรือ Pull Request ไม่ถูกต้อง');
    const linkId=randomUUID();
    try{db.prepare('INSERT INTO task_github_links VALUES(?,?,?,?,?,?,?)').run(linkId,userId,id,parts[2]==='issues'?'issue':'pull',`${parts[0]}/${parts[1]}`,number,now());}
    catch(error){if(String(error).includes('UNIQUE constraint'))throw new ApiError(409,'LINK_EXISTS','ลิงก์นี้อยู่ในงานแล้ว');throw error;}
    return c.json({link:get(db,'SELECT id,kind,repository,number,created_at FROM task_github_links WHERE id=?',linkId)},201);
  });
  routes.delete('/:id/links/:linkId',c=>{
    const result=db.prepare('DELETE FROM task_github_links WHERE id=? AND task_id=? AND user_id=?').run(c.req.param('linkId'),c.req.param('id'),c.get('user').id);
    if(!result.changes)throw new ApiError(404,'NOT_FOUND','ไม่พบลิงก์นี้');return c.body(null,204);
  });
  routes.delete('/:id', c => {
    const result = db.prepare('DELETE FROM tasks WHERE id=? AND user_id=?').run(c.req.param('id'),c.get('user').id);
    if (!result.changes) throw new ApiError(404, 'NOT_FOUND', 'ไม่พบงานนี้');
    return c.body(null,204);
  });
  routes.get('/sk09/suggestions',c=>{
    const start=dateSchema.safeParse(c.req.query('start'));
    if(!start.success)throw new ApiError(400,'INVALID_DATE','เลือกวันเริ่มต้นให้ถูกต้อง');
    const end=new Date(`${start.data}T00:00:00Z`);end.setUTCDate(end.getUTCDate()+4);const dates=Array.from({length:5},(_,i)=>{const day=new Date(`${start.data}T00:00:00Z`);day.setUTCDate(day.getUTCDate()+i);return day.toISOString().slice(0,10);});
    const projectId=c.req.query('project_id');
    if(projectId&&!get(db,'SELECT id FROM projects WHERE id=? AND user_id=?',projectId,c.get('user').id))throw new ApiError(404,'NOT_FOUND','ไม่พบโปรเจกต์นี้');
    const tasks=all<{id:string;title:string;description:string;due_date:string;status:string}>(db,
      `SELECT id,title,description,due_date,status FROM tasks WHERE user_id=? AND due_date BETWEEN ? AND ? ${projectId?'AND project_id=?':''} ORDER BY due_date,title LIMIT 100`,
      c.get('user').id,dates[0],dates[4],...(projectId?[projectId]:[]));
    return c.json({days:dates.map(date=>({date,tasks:tasks.filter(task=>task.due_date===date)}))});
  });
  return routes;
}
export function readSummary(db: Database, userId: string,projectId?:string) {
  return get<Summary>(db, `SELECT COUNT(*) total,
    COALESCE(SUM(status='pending'),0) pending,COALESCE(SUM(status='in_progress'),0) in_progress,
    COALESCE(SUM(status='completed'),0) completed,
    COALESCE(SUM(status!='completed' AND due_date<?),0) overdue FROM tasks WHERE user_id=? ${projectId?projectId==='unassigned'?'AND project_id IS NULL':'AND project_id=?':''}`, bangkokDate(),userId,...(projectId&&projectId!=='unassigned'?[projectId]:[]))!;
}
