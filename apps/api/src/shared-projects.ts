import {randomUUID} from 'node:crypto';
import {Hono} from 'hono';
import {z} from 'zod';
import {taskSchema,taskUpdateSchema} from '@taskflow/shared';
import {ApiError,all,get,now,parseBody,type Env} from './context.ts';
import type {Database} from './db.ts';

const email=z.email().max(200);
export function sharedProjectRoutes(db:Database){
  const routes=new Hono<Env>();
  async function access(projectId:string,userId:string){
    const project=await get<{id:string;user_id:string;name:string}>(db,'SELECT id,user_id,name FROM projects WHERE id=?',projectId);
    if(!project)throw new ApiError(404,'NOT_FOUND','ไม่พบโปรเจกต์นี้');
    if(project.user_id===userId)return{project,role:'owner' as const};
    const member=await get<{role:'viewer'|'editor'}>(db,'SELECT role FROM project_members WHERE project_id=? AND user_id=?',projectId,userId);
    if(!member)throw new ApiError(404,'NOT_FOUND','ไม่พบโปรเจกต์นี้');
    return{project,role:member.role};
  }
  function requireEditor(role:string){if(role==='viewer')throw new ApiError(403,'READ_ONLY','คุณมีสิทธิ์อ่านโปรเจกต์นี้เท่านั้น');}
  routes.get('/',async c=>c.json({projects:await all(db,"SELECT p.id,p.name,p.description,p.github_repo,m.role,p.user_id AS owner_id,u.name AS owner_name FROM project_members m JOIN projects p ON p.id=m.project_id JOIN users u ON u.id=p.user_id WHERE m.user_id=? ORDER BY m.created_at DESC",c.get('user').id)}));
  routes.get('/:id',async c=>{const {project,role}=await access(c.req.param('id'),c.get('user').id);return c.json({project,role,
    members:await all(db,'SELECT u.id,u.name,u.email,m.role FROM project_members m JOIN users u ON u.id=m.user_id WHERE m.project_id=? ORDER BY m.created_at',project.id),
    tasks:await all(db,'SELECT t.id,t.title,t.description,t.priority,t.status,t.due_date,t.project_id,t.assigned_to,t.created_at,t.updated_at,u.name AS assignee_name FROM tasks t LEFT JOIN users u ON u.id=t.assigned_to WHERE t.project_id=? AND t.user_id=? ORDER BY (t.status=\'completed\'),(t.due_date IS NULL),t.due_date,t.created_at DESC LIMIT 500',project.id,project.user_id)});});
  routes.post('/:id/members',async c=>{
    const {email:address,role}=await parseBody(c,z.object({email,role:z.enum(['viewer','editor'])}));
    const {project}=await access(c.req.param('id'),c.get('user').id);
    if(project.user_id!==c.get('user').id)throw new ApiError(403,'OWNER_REQUIRED','เจ้าของโปรเจกต์เท่านั้นที่เพิ่มสมาชิกได้');
    const user=await get<{id:string}>(db,'SELECT id FROM users WHERE email=?',address.trim().toLowerCase());
    if(!user||user.id===project.user_id)throw new ApiError(400,'INVALID_MEMBER','เลือกบัญชี TaskFlow อื่นที่สมัครแล้ว');
    await db.prepare('INSERT INTO project_members(project_id,user_id,role,created_at) VALUES(?,?,?,?) ON CONFLICT(project_id,user_id) DO UPDATE SET role=excluded.role').run(project.id,user.id,role,now());
    return c.json({members:await all(db,'SELECT u.id,u.name,u.email,m.role FROM project_members m JOIN users u ON u.id=m.user_id WHERE m.project_id=?',project.id)});
  });
  routes.delete('/:id/members/:userId',async c=>{
    const {project}=await access(c.req.param('id'),c.get('user').id),target=c.req.param('userId');
    if(project.user_id!==c.get('user').id&&target!==c.get('user').id)throw new ApiError(403,'OWNER_REQUIRED','ไม่มีสิทธิ์นำสมาชิกออก');
    const change=await db.prepare('DELETE FROM project_members WHERE project_id=? AND user_id=?').run(project.id,target);
    if(!change.changes)throw new ApiError(404,'NOT_FOUND','ไม่พบสมาชิกนี้');
    await db.prepare('UPDATE tasks SET assigned_to=NULL WHERE project_id=? AND assigned_to=?').run(project.id,target);
    return c.body(null,204);
  });
  routes.post('/:id/tasks',async c=>{
    const {project,role}=await access(c.req.param('id'),c.get('user').id);requireEditor(role);
    const body=await parseBody(c,taskSchema.omit({project_id:true}).extend({assigned_to:z.uuid().nullable().default(null)}));
    if(body.assigned_to&&body.assigned_to!==project.user_id&&!await get(db,'SELECT 1 FROM project_members WHERE project_id=? AND user_id=?',project.id,body.assigned_to))throw new ApiError(400,'INVALID_ASSIGNEE','ผู้รับมอบหมายไม่อยู่ในโปรเจกต์');
    const id=randomUUID(),stamp=now();
    await db.prepare('INSERT INTO tasks(id,user_id,title,description,priority,status,due_date,project_id,created_at,updated_at,assigned_to) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,project.user_id,body.title,body.description,body.priority,body.status,body.due_date,project.id,stamp,stamp,body.assigned_to);
    return c.json({task:await get(db,'SELECT id,title,description,priority,status,due_date,project_id,assigned_to,created_at,updated_at FROM tasks WHERE id=?',id)},201);
  });
  routes.patch('/:id/tasks/:taskId',async c=>{
    const {project,role}=await access(c.req.param('id'),c.get('user').id);requireEditor(role);
    const body=await parseBody(c,taskUpdateSchema.safeExtend({assigned_to:z.uuid().nullable().optional()}).refine(v=>v.project_id===undefined,{message:'ย้ายงานข้ามโปรเจกต์จากบอร์ดนี้ไม่ได้'}));
    const current=await get<{title:string;description:string;priority:string;status:string;due_date:string|null;assigned_to:string|null}>(db,'SELECT title,description,priority,status,due_date,assigned_to FROM tasks WHERE id=? AND project_id=? AND user_id=?',c.req.param('taskId'),project.id,project.user_id);
    if(!current)throw new ApiError(404,'NOT_FOUND','ไม่พบงานนี้');
    const next={...current,...body};
    if(next.assigned_to&&next.assigned_to!==project.user_id&&!await get(db,'SELECT 1 FROM project_members WHERE project_id=? AND user_id=?',project.id,next.assigned_to))throw new ApiError(400,'INVALID_ASSIGNEE','ผู้รับมอบหมายไม่อยู่ในโปรเจกต์');
    await db.prepare('UPDATE tasks SET title=?,description=?,priority=?,status=?,due_date=?,assigned_to=?,updated_at=? WHERE id=? AND project_id=? AND user_id=?').run(next.title,next.description,next.priority,next.status,next.due_date,next.assigned_to,now(),c.req.param('taskId'),project.id,project.user_id);
    return c.json({task:await get(db,'SELECT id,title,description,priority,status,due_date,project_id,assigned_to,created_at,updated_at FROM tasks WHERE id=?',c.req.param('taskId'))});
  });
  return routes;
}
