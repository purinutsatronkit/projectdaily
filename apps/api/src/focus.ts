import {randomUUID} from 'node:crypto';
import {Hono} from 'hono';
import {z} from 'zod';
import {dateSchema} from '@taskflow/shared';
import {ApiError,all,get,now,parseBody,type Env} from './context.ts';
import type {Database} from './db.ts';

const time=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const slot=z.object({task_id:z.uuid(),plan_date:dateSchema,start_time:time,end_time:time}).refine(v=>v.start_time<v.end_time,{message:'เวลาเริ่มต้องก่อนเวลาสิ้นสุด'});
export function focusRoutes(db:Database){
  const routes=new Hono<Env>();
  routes.get('/',c=>{
    const from=dateSchema.safeParse(c.req.query('from')??c.req.query('date')),to=dateSchema.safeParse(c.req.query('to')??c.req.query('date'));
    if(!from.success||!to.success||from.data>to.data)throw new ApiError(400,'INVALID_DATE','วันที่ไม่ถูกต้อง');
    return c.json({slots:all(db,'SELECT s.id,s.task_id,s.plan_date,s.start_time,s.end_time,t.title,t.status FROM task_schedule s JOIN tasks t ON t.id=s.task_id WHERE s.user_id=? AND s.plan_date BETWEEN ? AND ? ORDER BY s.plan_date,s.start_time LIMIT 500',c.get('user').id,from.data,to.data)});
  });
  routes.post('/',async c=>{
    const body=await parseBody(c,slot),userId=c.get('user').id;
    if(!get(db,'SELECT id FROM tasks WHERE id=? AND user_id=?',body.task_id,userId))throw new ApiError(404,'NOT_FOUND','ไม่พบงานนี้');
    if(get(db,'SELECT id FROM task_schedule WHERE user_id=? AND plan_date=? AND start_time<? AND end_time>? AND task_id!=?',userId,body.plan_date,body.end_time,body.start_time,body.task_id))throw new ApiError(409,'TIME_CONFLICT','ช่วงเวลานี้มีงานที่วางแผนไว้แล้ว');
    const existing=get<{id:string}>(db,'SELECT id FROM task_schedule WHERE user_id=? AND task_id=? AND plan_date=?',userId,body.task_id,body.plan_date);
    if(existing)db.prepare('UPDATE task_schedule SET start_time=?,end_time=? WHERE id=?').run(body.start_time,body.end_time,existing.id);
    else db.prepare('INSERT INTO task_schedule VALUES(?,?,?,?,?,?,?)').run(randomUUID(),userId,body.task_id,body.plan_date,body.start_time,body.end_time,now());
    return c.json({slot:get(db,'SELECT id,task_id,plan_date,start_time,end_time FROM task_schedule WHERE user_id=? AND task_id=? AND plan_date=?',userId,body.task_id,body.plan_date)});
  });
  routes.delete('/:id',c=>{const change=db.prepare('DELETE FROM task_schedule WHERE id=? AND user_id=?').run(c.req.param('id'),c.get('user').id);if(!change.changes)throw new ApiError(404,'NOT_FOUND','ไม่พบช่วงเวลานี้');return c.body(null,204);});
  return routes;
}
