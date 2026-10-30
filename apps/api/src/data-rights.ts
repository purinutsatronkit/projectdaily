import {Hono} from 'hono';
import {deleteCookie} from 'hono/cookie';
import {z} from 'zod';
import {ApiError,all,get,parseBody,type Config,type Env} from './context.ts';
import type {Database} from './db.ts';
import {checkPassword} from './security.ts';

export function dataRightsRoutes(db:Database,config:Config){
  const routes=new Hono<Env>();
  routes.get('/security',async c=>{
    const record=(await get<{password_hash:string}>(db,'SELECT password_hash FROM users WHERE id=?',c.get('user').id))!;
    return c.json({password_login:record.password_hash!=='oauth-only'});
  });
  routes.get('/export',async c=>{
    const userId=c.get('user').id;
    const user=(await get<{id:string;name:string;email:string;nickname:string;phone:string;email_verified_at:string|null;avatar:Uint8Array|null;avatar_type:string|null;created_at:string}>(db,'SELECT id,name,email,nickname,phone,email_verified_at,avatar,avatar_type,created_at FROM users WHERE id=?',userId))!;
    const {avatar,avatar_type,...profile}=user;
    const data={version:1,exported_at:new Date().toISOString(),profile:{...profile,avatar:avatar?{type:avatar_type,base64:Buffer.from(avatar).toString('base64')}:null},
      projects:await all(db,'SELECT id,name,description,github_repo,notify_pipeline,follow_workflow_id,create_failure_tasks,created_at,updated_at FROM projects WHERE user_id=?',userId),
      work_journal:await all(db,'SELECT id,work_date,project_id,assignment,result,evidence_url,created_at,updated_at FROM work_journal WHERE user_id=?',userId),
      project_memberships:await all(db,'SELECT project_id,role,created_at FROM project_members WHERE user_id=?',userId),
      project_members:await all(db,'SELECT m.project_id,u.email,m.role,m.created_at FROM project_members m JOIN users u ON u.id=m.user_id JOIN projects p ON p.id=m.project_id WHERE p.user_id=?',userId),
      task_schedule:await all(db,'SELECT task_id,plan_date,start_time,end_time,created_at FROM task_schedule WHERE user_id=?',userId),
      tasks:await all(db,'SELECT id,title,description,priority,status,due_date,project_id,created_at,updated_at FROM tasks WHERE user_id=?',userId),
      task_activity:await all(db,'SELECT task_id,task_title,event,changes,created_at,actor_type FROM task_activity WHERE owner_id=? ORDER BY created_at',userId),
      task_links:await all(db,'SELECT task_id,kind,repository,number,created_at FROM task_github_links WHERE user_id=?',userId),
      sk09_draft:await get<{data:string;version:number;updated_at:string}>(db,'SELECT data,version,updated_at FROM sk09_drafts WHERE user_id=?',userId)??null,
      task_notifications:await all(db,'SELECT task_id,notification_date,created_at,read_at FROM task_notifications WHERE user_id=?',userId),
      pipeline_notifications:await all(db,'SELECT project_id,repository,run_id,title,created_at,read_at FROM pipeline_notifications WHERE user_id=?',userId),
      pipeline_actions:await all(db,'SELECT repository,action,target,created_at FROM pipeline_actions WHERE user_id=?',userId),
      reminder_deliveries:await all(db,'SELECT task_id,notification_date,channel,created_at FROM reminder_deliveries WHERE user_id=?',userId),
      connections:await all(db,'SELECT provider,login,updated_at FROM connected_accounts WHERE user_id=?',userId)};
    c.header('Content-Disposition',`attachment; filename="taskflow-export-${new Date().toISOString().slice(0,10)}.json"`);
    c.header('Content-Type','application/json; charset=utf-8');
    return c.body(JSON.stringify(data,null,2));
  });
  routes.post('/delete-account',async c=>{
    const {email,confirmation,password}=await parseBody(c,z.object({email:z.email(),confirmation:z.literal('DELETE'),password:z.string().max(128).optional()}));
    const userId=c.get('user').id;
    if(email.trim().toLowerCase()!==c.get('user').email)throw new ApiError(400,'CONFIRMATION_MISMATCH','กรอกอีเมลของบัญชีให้ตรง');
    const record=(await get<{password_hash:string}>(db,'SELECT password_hash FROM users WHERE id=?',userId))!;
    if(record.password_hash==='oauth-only'){
      const session=await get<{created_at:string}>(db,'SELECT created_at FROM auth_sessions WHERE id=? AND user_id=?',c.get('sessionId'),userId);
      if(!session||Date.now()-Date.parse(session.created_at)>10*60000)throw new ApiError(403,'RECENT_LOGIN_REQUIRED','กรุณาเข้าสู่ระบบด้วย Google ใหม่ แล้วลบบัญชีภายใน 10 นาที');
    }else if(!password||!await checkPassword(password,record.password_hash))throw new ApiError(403,'PASSWORD_REQUIRED','กรอกรหัสผ่านบัญชีให้ถูกต้อง');
    const result=await db.prepare('DELETE FROM users WHERE id=? AND email=?').run(userId,c.get('user').email);
    if(result.changes!==1)throw new ApiError(404,'NOT_FOUND','ไม่พบบัญชีนี้');
    deleteCookie(c,'taskflow_session',{path:'/',secure:!!config.production,sameSite:'Lax'});
    return c.body(null,204);
  });
  return routes;
}
