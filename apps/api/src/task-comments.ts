import {randomUUID} from 'node:crypto';
import {Hono} from 'hono';
import {z} from 'zod';
import {ApiError,all,get,now,parseBody,transaction,type Env} from './context.ts';
import type {Database} from './db.ts';

type TaskAccess={id:string;title:string;user_id:string;project_id:string|null};
export async function readableTask(db:Database,id:string,userId:string):Promise<TaskAccess>{
  const task=await get<TaskAccess>(db,'SELECT id,title,user_id,project_id FROM tasks WHERE id=?',id);
  if(!task||(task.user_id!==userId&&(!task.project_id||!await get(db,'SELECT 1 FROM project_members WHERE project_id=? AND user_id=?',task.project_id,userId))))throw new ApiError(404,'NOT_FOUND','ไม่พบงานนี้');
  return task;
}
export function taskCommentRoutes(db:Database){
  const routes=new Hono<Env>();
  routes.get('/:id/mentionable',async c=>{
    const task=await readableTask(db,c.req.param('id'),c.get('user').id);
    const users=await all(db,`SELECT u.id,COALESCE(NULLIF(u.nickname,''),u.name) name FROM users u WHERE u.id=? OR u.id IN (SELECT user_id FROM project_members WHERE project_id=?) ORDER BY name`,task.user_id,task.project_id);
    return c.json({users});
  });
  routes.get('/:id/comments',async c=>{
    const task=await readableTask(db,c.req.param('id'),c.get('user').id);
    const comments=await all(db,"SELECT c.id,c.body,c.created_at,c.author_id,COALESCE(NULLIF(u.nickname,''),u.name) author_name FROM task_comments c JOIN users u ON u.id=c.author_id WHERE c.task_id=? ORDER BY c.created_at,c.id LIMIT 200",task.id);
    return c.json({comments});
  });
  routes.post('/:id/comments',async c=>{
    const task=await readableTask(db,c.req.param('id'),c.get('user').id);
    const body=await parseBody(c,z.object({body:z.string().trim().min(1).max(2000),mentions:z.array(z.uuid()).max(20).default([])}));
    const mentioned=[...new Set(body.mentions)].filter(id=>id!==c.get('user').id);
    for(const userId of mentioned){if(userId!==task.user_id&&(!task.project_id||!await get(db,'SELECT 1 FROM project_members WHERE project_id=? AND user_id=?',task.project_id,userId)))throw new ApiError(400,'INVALID_MENTION','กล่าวถึงได้เฉพาะเจ้าของงานหรือสมาชิกโปรเจกต์');}
    const id=randomUUID(),stamp=now();
    await transaction(db,async()=>{
      await db.prepare('INSERT INTO task_comments VALUES(?,?,?,?,?)').run(id,task.id,c.get('user').id,body.body,stamp);
      for(const userId of mentioned){await db.prepare('INSERT INTO task_comment_mentions VALUES(?,?)').run(id,userId);await db.prepare('INSERT INTO mention_notifications VALUES(?,?,?,?,NULL)').run(randomUUID(),id,userId,stamp);}
    });
    return c.json({comment:{id,body:body.body,created_at:stamp,author_id:c.get('user').id,author_name:c.get('user').nickname||c.get('user').name}},201);
  });
  routes.delete('/:id/comments/:commentId',async c=>{
    await readableTask(db,c.req.param('id'),c.get('user').id);
    const result=await db.prepare('DELETE FROM task_comments WHERE id=? AND task_id=? AND author_id=?').run(c.req.param('commentId'),c.req.param('id'),c.get('user').id);
    if(!result.changes)throw new ApiError(404,'NOT_FOUND','ไม่พบคอมเมนต์นี้');
    return c.body(null,204);
  });
  return routes;
}
