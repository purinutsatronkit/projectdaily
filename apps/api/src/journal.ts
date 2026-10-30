import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import { dateSchema } from '@taskflow/shared';
import { ApiError, all, get, now, parseBody, type Env } from './context.ts';
import type { Database } from './db.ts';

const entrySchema=z.object({
  work_date:dateSchema,project_id:z.uuid().nullable().default(null),
  assignment:z.string().trim().max(2000).default(''),
  result:z.string().trim().max(2000).default(''),
  evidence_url:z.union([z.literal(''),z.url().max(500).refine(v=>v.startsWith('https://'))]).default(''),
}).refine(v=>Boolean(v.assignment||v.result),{message:'กรอกงานหรือผลการฝึกอย่างน้อยหนึ่งช่อง'});
const columns='id,work_date,project_id,assignment,result,evidence_url,created_at,updated_at';
export function journalRoutes(db:Database){
  const routes=new Hono<Env>();
  routes.get('/',c=>{
    const from=dateSchema.safeParse(c.req.query('from')),to=dateSchema.safeParse(c.req.query('to'));
    if(!from.success||!to.success||from.data>to.data)throw new ApiError(400,'INVALID_DATE','ช่วงวันที่ไม่ถูกต้อง');
    const projectId=c.req.query('project_id');
    if(projectId&&!get(db,'SELECT id FROM projects WHERE id=? AND user_id=?',projectId,c.get('user').id))throw new ApiError(404,'NOT_FOUND','ไม่พบโปรเจกต์นี้');
    return c.json({entries:all(db,`SELECT ${columns} FROM work_journal WHERE user_id=? AND work_date BETWEEN ? AND ? ${projectId?'AND project_id=?':''} ORDER BY work_date DESC,created_at DESC LIMIT 400`,c.get('user').id,from.data,to.data,...(projectId?[projectId]:[]))});
  });
  routes.get('/weekly',c=>{
    const start=dateSchema.safeParse(c.req.query('start'));
    if(!start.success)throw new ApiError(400,'INVALID_DATE','วันเริ่มสัปดาห์ไม่ถูกต้อง');
    const end=new Date(`${start.data}T12:00:00Z`);end.setUTCDate(end.getUTCDate()+6);
    const finish=end.toISOString().slice(0,10),userId=c.get('user').id;
    return c.json({start:start.data,end:finish,
      entries:all(db,`SELECT ${columns} FROM work_journal WHERE user_id=? AND work_date BETWEEN ? AND ? ORDER BY work_date,created_at LIMIT 400`,userId,start.data,finish),
      tasks:all(db,'SELECT id,title,status,due_date,project_id FROM tasks WHERE user_id=? AND due_date BETWEEN ? AND ? ORDER BY due_date,title LIMIT 400',userId,start.data,finish)});
  });
  routes.post('/',async c=>{
    const body=await parseBody(c,entrySchema),userId=c.get('user').id,id=randomUUID(),stamp=now();
    if(body.project_id&&!get(db,'SELECT id FROM projects WHERE id=? AND user_id=?',body.project_id,userId))throw new ApiError(404,'NOT_FOUND','ไม่พบโปรเจกต์นี้');
    db.prepare('INSERT INTO work_journal(id,user_id,work_date,project_id,assignment,result,evidence_url,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id,userId,body.work_date,body.project_id,body.assignment,body.result,body.evidence_url,stamp,stamp);
    return c.json({entry:get(db,`SELECT ${columns} FROM work_journal WHERE id=?`,id)},201);
  });
  routes.patch('/:id',async c=>{
    const body=await parseBody(c,entrySchema),userId=c.get('user').id,id=c.req.param('id');
    if(!get(db,'SELECT id FROM work_journal WHERE id=? AND user_id=?',id,userId))throw new ApiError(404,'NOT_FOUND','ไม่พบบันทึกนี้');
    if(body.project_id&&!get(db,'SELECT id FROM projects WHERE id=? AND user_id=?',body.project_id,userId))throw new ApiError(404,'NOT_FOUND','ไม่พบโปรเจกต์นี้');
    db.prepare('UPDATE work_journal SET work_date=?,project_id=?,assignment=?,result=?,evidence_url=?,updated_at=? WHERE id=? AND user_id=?').run(body.work_date,body.project_id,body.assignment,body.result,body.evidence_url,now(),id,userId);
    return c.json({entry:get(db,`SELECT ${columns} FROM work_journal WHERE id=?`,id)});
  });
  routes.delete('/:id',c=>{
    const change=db.prepare('DELETE FROM work_journal WHERE id=? AND user_id=?').run(c.req.param('id'),c.get('user').id);
    if(!change.changes)throw new ApiError(404,'NOT_FOUND','ไม่พบบันทึกนี้');
    return c.body(null,204);
  });
  return routes;
}
