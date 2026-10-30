import {randomUUID} from 'node:crypto';
import type {Database} from './db.ts';
import {ApiError,all,get,now} from './context.ts';

export type TaskState={id:string;user_id:string;project_id:string|null;title:string;description:string;priority:string;status:string;due_date:string|null;assigned_to:string|null};
type Change={field:string;from:string|null;to:string|null};
const fields=['title','description','priority','status','due_date','project_id','assigned_to'] as const;

async function display(db:Database,field:string,value:string|null){
  if(value===null)return null;
  if(field==='project_id')return (await get<{name:string}>(db,'SELECT name FROM projects WHERE id=?',value))?.name??'โปรเจกต์ที่ลบแล้ว';
  if(field==='assigned_to'){const user=await get<{name:string;nickname:string}>(db,'SELECT name,nickname FROM users WHERE id=?',value);return user?(user.nickname||user.name):'บัญชีที่ลบแล้ว';}
  return value;
}
export async function changedFields(db:Database,before:TaskState,after:TaskState):Promise<Change[]>{
  const changes:Change[]=[];
  for(const field of fields){
    if(before[field]===after[field])continue;
    changes.push({field,from:await display(db,field,before[field]),to:await display(db,field,after[field])});
  }
  return changes;
}
export async function recordTaskActivity(db:Database,task:TaskState,actorId:string|null,event:'created'|'updated'|'deleted',changes:Change[]=[]){
  await db.prepare('INSERT INTO task_activity(id,task_id,owner_id,project_id,actor_id,actor_type,task_title,event,changes,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(randomUUID(),task.id,task.user_id,task.project_id,actorId,actorId?'user':'system',task.title,event,JSON.stringify(changes),now());
}
export async function taskHistory(db:Database,taskId:string,userId:string){
  const task=await get<{user_id:string;project_id:string|null}>(db,'SELECT user_id,project_id FROM tasks WHERE id=?',taskId);
  const previous=task??await get<{owner_id:string;project_id:string|null}>(db,'SELECT owner_id,project_id FROM task_activity WHERE task_id=? ORDER BY created_at DESC LIMIT 1',taskId);
  if(!previous)throw new ApiError(404,'NOT_FOUND','ไม่พบประวัติงานนี้');
  const ownerId='user_id'in previous?previous.user_id:previous.owner_id;
  if(ownerId!==userId&&(!previous.project_id||!await get(db,'SELECT 1 FROM project_members WHERE project_id=? AND user_id=?',previous.project_id,userId)))throw new ApiError(404,'NOT_FOUND','ไม่พบประวัติงานนี้');
  return await all(db,"SELECT a.id,a.task_id,a.task_title,a.event,a.changes,a.created_at,CASE WHEN a.actor_type='system' THEN 'ระบบ' ELSE COALESCE(NULLIF(u.nickname,''),u.name,'บัญชีที่ลบแล้ว') END actor_name FROM task_activity a LEFT JOIN users u ON u.id=a.actor_id WHERE a.task_id=? AND a.owner_id=? ORDER BY a.created_at DESC,a.id DESC LIMIT 100",taskId,ownerId);
}
