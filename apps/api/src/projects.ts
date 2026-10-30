import {randomUUID} from 'node:crypto';
import {Hono} from 'hono';
import {z} from 'zod';
import {ApiError,all,get,now,parseBody,type Env} from './context.ts';
import type {Database} from './db.ts';

const repository=z.string().regex(/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/).nullable();
const projectSchema=z.object({name:z.string().trim().min(2).max(80),description:z.string().trim().max(500).default(''),github_repo:repository.default(null),notify_pipeline:z.boolean().default(true),follow_workflow_id:z.string().regex(/^[1-9]\d{0,18}$/).nullable().default(null),create_failure_tasks:z.boolean().default(false)});
const columns='p.id,p.name,p.description,p.github_repo,p.notify_pipeline,p.follow_workflow_id,p.create_failure_tasks,p.created_at,p.updated_at,(SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id AND t.user_id=p.user_id) AS task_count';
export function projectRoutes(db:Database) {
  const routes=new Hono<Env>();
  routes.get('/',c=>c.json({projects:all(db,`SELECT ${columns} FROM projects p WHERE p.user_id=? ORDER BY p.created_at,p.id`,c.get('user').id)}));
  routes.post('/',async c=>{
    const body=await parseBody(c,projectSchema),userId=c.get('user').id,id=randomUUID(),timestamp=now();
    const count=get<{total:number}>(db,'SELECT COUNT(*) total FROM projects WHERE user_id=?',userId)!.total;
    if(count>=50)throw new ApiError(400,'PROJECT_LIMIT','สร้างโปรเจกต์ได้สูงสุด 50 รายการ');
    db.prepare('INSERT INTO projects(id,user_id,name,description,github_repo,notify_pipeline,follow_workflow_id,created_at,updated_at,create_failure_tasks) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,userId,body.name,body.description,body.github_repo,Number(body.notify_pipeline),body.follow_workflow_id,timestamp,timestamp,Number(body.create_failure_tasks));
    return c.json({project:get(db,`SELECT ${columns} FROM projects p WHERE p.id=? AND p.user_id=?`,id,userId)},201);
  });
  routes.patch('/:id',async c=>{
    const body=await parseBody(c,projectSchema.partial().refine(v=>Object.keys(v).length>0)),userId=c.get('user').id,id=c.req.param('id');
    const current=get<{name:string;description:string;github_repo:string|null;notify_pipeline:number;follow_workflow_id:string|null;create_failure_tasks:number}>(db,'SELECT name,description,github_repo,notify_pipeline,follow_workflow_id,create_failure_tasks FROM projects WHERE id=? AND user_id=?',id,userId);
    if(!current)throw new ApiError(404,'NOT_FOUND','ไม่พบโปรเจกต์นี้');
    const next={...current,...body};
    db.prepare('UPDATE projects SET name=?,description=?,github_repo=?,notify_pipeline=?,follow_workflow_id=?,create_failure_tasks=?,updated_at=? WHERE id=? AND user_id=?')
      .run(next.name,next.description,next.github_repo,Number(next.notify_pipeline),next.follow_workflow_id,Number(next.create_failure_tasks),now(),id,userId);
    return c.json({project:get(db,`SELECT ${columns} FROM projects p WHERE p.id=? AND p.user_id=?`,id,userId)});
  });
  routes.delete('/:id',c=>{
    const userId=c.get('user').id,id=c.req.param('id');
    const current=get(db,'SELECT id FROM projects WHERE id=? AND user_id=?',id,userId);
    if(!current)throw new ApiError(404,'NOT_FOUND','ไม่พบโปรเจกต์นี้');
    db.prepare('UPDATE tasks SET project_id=NULL,assigned_to=NULL WHERE user_id=? AND project_id=?').run(userId,id);
    db.prepare('DELETE FROM projects WHERE id=? AND user_id=?').run(id,userId);
    return c.body(null,204);
  });
  return routes;
}
