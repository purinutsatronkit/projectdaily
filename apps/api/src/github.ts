import {randomUUID} from 'node:crypto';
import {Hono} from 'hono';
import {z} from 'zod';
import {ApiError,get,now,parseBody,type Config,type Env} from './context.ts';
import {seal,unseal} from './social-config.ts';
import {exchange,tokenPayload} from './social.ts';
import type {Database} from './db.ts';
import {all} from './context.ts';

const segment=z.string().min(1).max(100).regex(/^[A-Za-z0-9_.-]+$/).refine(v=>v!=='.'&&v!=='..');
const numberId=z.string().regex(/^[1-9]\d{0,18}$/);
const refSchema=z.string().min(1).max(255).refine(v=>!/[\x00-\x1f]/.test(v));
const inputsSchema=z.record(z.string().min(1).max(100),z.union([z.string().max(2000),z.boolean(),z.number()])).refine(v=>Object.keys(v).length<=25);
export function githubRoutes(db:Database,config:Config) {
  const routes=new Hono<Env>(),refreshing=new Map<string,Promise<string>>();
  type Connection={token_cipher:string};
  const read=(id:string)=>get<Connection>(db,"SELECT token_cipher FROM connected_accounts WHERE user_id=? AND provider='github'",id);
  const missing=()=>new ApiError(409,'GITHUB_CONNECT','กรุณาเชื่อม GitHub อีกครั้งในตั้งค่าบัญชี');
  async function access(id:string):Promise<string> {
    const social=config.social;
    if(!social?.github||!social.tokenKey) throw new ApiError(503,'GITHUB_DISABLED','ยังไม่ได้ตั้งค่า GitHub App');
    const row=read(id);if(!row?.token_cipher) throw missing();
    let stored:{access_token:string;refresh_token?:string;expires_at:number|null};
    try {stored=JSON.parse(unseal(row.token_cipher,social.tokenKey,id));} catch {throw missing();}
    if(!stored.expires_at||stored.expires_at>Date.now()+60000) return stored.access_token;
    const inProgress=refreshing.get(id);if(inProgress) return inProgress;
    if(!stored.refresh_token) throw missing();
    const pending=(async()=>{
      try {
        const result=await exchange(social,'github',{grant_type:'refresh_token',refresh_token:stored.refresh_token!});
        const changed=db.prepare("UPDATE connected_accounts SET token_cipher=?,updated_at=? WHERE user_id=? AND provider='github' AND token_cipher=?")
          .run(seal(tokenPayload(result),social.tokenKey!,id),now(),id,row.token_cipher);
        if(!changed.changes) throw missing();
        return result.access_token as string;
      } catch {throw missing();} finally {refreshing.delete(id);}
    })();
    refreshing.set(id,pending);return pending;
  }
  async function api(userId:string,path:string,method='GET',body?:unknown):Promise<any> {
    const token=await access(userId);
    const response=await (config.social!.fetch??fetch)(`https://api.github.com${path}`,{method,headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000),redirect:'error'});
    if(!response.ok) {
      if(response.status===401) throw missing();
      if(response.status===403||response.status===429) throw new ApiError(response.status===429||response.headers.get('x-ratelimit-remaining')==='0'?429:403,'GITHUB_PERMISSION','GitHub จำกัดคำขอหรือสิทธิ์ไม่เพียงพอ ตรวจสิทธิ์ App/บัญชี แล้วลองใหม่ภายหลัง');
      if(response.status===404) throw new ApiError(404,'GITHUB_NOT_FOUND','ไม่พบข้อมูล หรือ GitHub App ยังไม่ได้รับสิทธิ์ repository นี้');
      if(response.status===422||response.status===409) throw new ApiError(400,'GITHUB_REJECTED','GitHub ไม่รับคำสั่งนี้ ตรวจ branch, workflow_dispatch, inputs และสถานะการรัน');
      throw new ApiError(503,'GITHUB_UNAVAILABLE','GitHub ไม่พร้อมใช้งาน กรุณาลองใหม่');
    }
    if(response.status===204) return null;
    const reader=response.body?.getReader();if(!reader) return null;
    const chunks:Uint8Array[]=[];let size=0;
    for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8*1024*1024){await reader.cancel();throw new ApiError(400,'GITHUB_TOO_LARGE','ข้อมูลชุดนี้มีขนาดใหญ่ กรุณาเปิดดูบน GitHub');}chunks.push(value);}
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }
  const parse=<T>(schema:z.ZodType<T>,value:unknown)=>{const result=schema.safeParse(value);if(!result.success)throw new ApiError(400,'INVALID_GITHUB_PARAMETER','พารามิเตอร์ GitHub ไม่ถูกต้อง');return result.data;};
  const page=(value:string|undefined)=>parse(z.coerce.number().int().min(1).max(1000),value??'1');
  routes.get('/actions',c=>c.json({actions:all(db,'SELECT id,repository,action,target,created_at FROM pipeline_actions WHERE user_id=? ORDER BY created_at DESC LIMIT 50',c.get('user').id)}));
  routes.get('/alerts',async c=>{
    const userId=c.get('user').id;
    const projects=all<{id:string;github_repo:string;follow_workflow_id:string|null;create_failure_tasks:number}>(db,'SELECT id,github_repo,follow_workflow_id,create_failure_tasks FROM projects WHERE user_id=? AND (notify_pipeline=1 OR create_failure_tasks=1) AND github_repo IS NOT NULL ORDER BY created_at LIMIT 10',userId);
    const connected=Boolean(read(userId));let failures=0;
    if(connected)for(const project of projects){
      const parts=project.github_repo.split('/');if(parts.length!==2||!parts.every(p=>segment.safeParse(p).success))continue;
      try{
        const response=await api(userId,`${base(parts[0],parts[1])}/actions/runs?per_page=20&page=1`);
        const hadBaseline=Boolean(get(db,'SELECT 1 FROM pipeline_observations WHERE user_id=? AND repository=? LIMIT 1',userId,project.github_repo));
        for(const run of response.workflow_runs??[]){
          if(!Number.isSafeInteger(run.id)||run.id<=0||typeof run.status!=='string')continue;
          if(project.follow_workflow_id&&String(run.workflow_id)!==project.follow_workflow_id)continue;
          const state=`${run.status}:${run.conclusion??''}`,runId=String(run.id);
          const previous=get<{state:string}>(db,'SELECT state FROM pipeline_observations WHERE user_id=? AND repository=? AND run_id=?',userId,project.github_repo,runId);
          db.prepare('INSERT INTO pipeline_observations(user_id,repository,run_id,state) VALUES(?,?,?,?) ON CONFLICT(user_id,repository,run_id) DO UPDATE SET state=excluded.state').run(userId,project.github_repo,runId,state);
          if((previous?previous.state!==state:hadBaseline)&&run.status==='completed'&&['failure','timed_out','action_required'].includes(run.conclusion)){
            const stamp=now(),title=String(run.display_title||run.name||'Pipeline').slice(0,120);
            const inserted=db.prepare('INSERT OR IGNORE INTO pipeline_notifications VALUES(?,?,?,?,?,?,?,NULL)').run(randomUUID(),userId,project.id,project.github_repo,runId,title,stamp);
            if(inserted.changes&&project.create_failure_tasks){
              const taskTitle=`ตรวจ pipeline ล้มเหลว: ${title}`.slice(0,120);
              const description=`GitHub Actions ${project.github_repo} · Run #${runId}\nhttps://github.com/${project.github_repo}/actions/runs/${runId}`;
              db.prepare('INSERT INTO tasks(id,user_id,title,description,priority,status,due_date,project_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(randomUUID(),userId,taskTitle,description,'high','pending',null,project.id,stamp,stamp);
            }
          }
        }
      }catch{failures++;}
    }
    const notifications=all(db,'SELECT id,project_id,repository,run_id,title,created_at FROM pipeline_notifications WHERE user_id=? AND read_at IS NULL ORDER BY created_at DESC LIMIT 100',userId);
    return c.json({notifications,connected,failures});
  });
  routes.patch('/alerts/:id/read',c=>{
    const result=db.prepare('UPDATE pipeline_notifications SET read_at=COALESCE(read_at,?) WHERE id=? AND user_id=?').run(now(),c.req.param('id'),c.get('user').id);
    if(!result.changes)throw new ApiError(404,'NOT_FOUND','ไม่พบการแจ้งเตือนนี้');return c.body(null,204);
  });
  routes.get('/installations',async c=>c.json(await api(c.get('user').id,`/user/installations?per_page=30&page=${page(c.req.query('page'))}`)));
  routes.get('/installations/:id/repos',async c=>c.json(await api(c.get('user').id,`/user/installations/${parse(numberId,c.req.param('id'))}/repositories?per_page=30&page=${page(c.req.query('page'))}`)));
  routes.use('/repos/:owner/:repo/*',async(c,next)=>{parse(segment,c.req.param('owner'));parse(segment,c.req.param('repo'));await next();});
  const base=(owner:string,repo:string)=>`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  routes.get('/repos/:owner/:repo/info',async c=>c.json(await api(c.get('user').id,base(c.req.param('owner'),c.req.param('repo')))));
  routes.get('/repos/:owner/:repo/issues/:number',async c=>{
    const item=await api(c.get('user').id,`${base(c.req.param('owner'),c.req.param('repo'))}/issues/${parse(numberId,c.req.param('number'))}`);
    return c.json({title:item.title,state:item.state,number:item.number,html_url:item.html_url});
  });
  routes.get('/repos/:owner/:repo/pulls/:number',async c=>{
    const item=await api(c.get('user').id,`${base(c.req.param('owner'),c.req.param('repo'))}/pulls/${parse(numberId,c.req.param('number'))}`);
    return c.json({title:item.title,state:item.state,merged:item.merged,draft:item.draft,number:item.number,html_url:item.html_url});
  });
  routes.get('/repos/:owner/:repo/files',async c=>{
    const path=parse(z.string().max(2000).refine(v=>!v.split('/').some(p=>p==='.'||p==='..')&&!/[\x00-\x1f\\]/.test(v)),c.req.query('path')??'');
    const ref=parse(refSchema,c.req.query('ref'));
    const result=await api(c.get('user').id,`${base(c.req.param('owner'),c.req.param('repo'))}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`);
    if(Array.isArray(result)) return c.json({kind:'directory',entries:result.map(({name,path,type,size}:any)=>({name,path,type,size})),limited:result.length>=1000});
    const bytes=result.encoding==='base64'&&result.size<=1024*1024?Buffer.from(result.content??'','base64'):null;
    const text=bytes?bytes.toString('utf8'):null,binary=Boolean(bytes&&(bytes.includes(0)||text!.includes('\uFFFD')));
    return c.json({kind:result.type,name:result.name,path:result.path,size:result.size,text:binary?null:text,binary,limited:!bytes});
  });
  routes.get('/repos/:owner/:repo/commits',async c=>c.json(await api(c.get('user').id,`${base(c.req.param('owner'),c.req.param('repo'))}/commits?per_page=30&page=${page(c.req.query('page'))}&sha=${encodeURIComponent(parse(refSchema,c.req.query('ref')))}`)));
  routes.get('/repos/:owner/:repo/commits/:sha',async c=>c.json(await api(c.get('user').id,`${base(c.req.param('owner'),c.req.param('repo'))}/commits/${parse(z.string().regex(/^[a-f0-9]{7,40}$/i),c.req.param('sha'))}?per_page=30&page=${page(c.req.query('page'))}`)));
  routes.get('/repos/:owner/:repo/workflows',async c=>c.json(await api(c.get('user').id,`${base(c.req.param('owner'),c.req.param('repo'))}/actions/workflows?per_page=30&page=${page(c.req.query('page'))}`)));
  routes.get('/repos/:owner/:repo/runs',async c=>c.json(await api(c.get('user').id,`${base(c.req.param('owner'),c.req.param('repo'))}/actions/runs?per_page=30&page=${page(c.req.query('page'))}`)));
  routes.get('/repos/:owner/:repo/runs/:id/jobs',async c=>c.json(await api(c.get('user').id,`${base(c.req.param('owner'),c.req.param('repo'))}/actions/runs/${parse(numberId,c.req.param('id'))}/jobs?per_page=30&page=${page(c.req.query('page'))}`)));
  routes.get('/repos/:owner/:repo/checks',async c=>c.json(await api(c.get('user').id,`${base(c.req.param('owner'),c.req.param('repo'))}/commits/${parse(z.string().regex(/^[a-f0-9]{7,40}$/i),c.req.query('sha'))}/check-runs?per_page=30&page=${page(c.req.query('page'))}`)));
  routes.get('/repos/:owner/:repo/checks/:id/annotations',async c=>c.json(await api(c.get('user').id,`${base(c.req.param('owner'),c.req.param('repo'))}/check-runs/${parse(numberId,c.req.param('id'))}/annotations?per_page=30&page=${page(c.req.query('page'))}`)));
  routes.post('/repos/:owner/:repo/workflows/:id/dispatch',async c=>{
    const body=await parseBody(c,z.object({confirm:z.literal(true),ref:refSchema,inputs:inputsSchema.default({})}));
    const id=parse(numberId,c.req.param('id')),repository=`${c.req.param('owner')}/${c.req.param('repo')}`;
    await api(c.get('user').id,`${base(c.req.param('owner'),c.req.param('repo'))}/actions/workflows/${id}/dispatches`,'POST',{ref:body.ref,inputs:body.inputs});
    db.prepare('INSERT INTO pipeline_actions VALUES(?,?,?,?,?,?)').run(randomUUID(),c.get('user').id,repository,'dispatch',id,now());
    return c.json({message:'GitHub รับคำสั่งรันแล้ว กดรีเฟรชเพื่อดูรายการรัน'});
  });
  routes.post('/repos/:owner/:repo/runs/:id/:action',async c=>{
    await parseBody(c,z.object({confirm:z.literal(true)}));
    const id=parse(numberId,c.req.param('id')),action=parse(z.enum(['rerun','cancel']),c.req.param('action'));
    await api(c.get('user').id,`${base(c.req.param('owner'),c.req.param('repo'))}/actions/runs/${id}/${action}`,'POST');
    db.prepare('INSERT INTO pipeline_actions VALUES(?,?,?,?,?,?)').run(randomUUID(),c.get('user').id,`${c.req.param('owner')}/${c.req.param('repo')}`,action,id,now());
    return c.json({message:'GitHub รับคำสั่งแล้ว กดรีเฟรชเพื่อตรวจสถานะ'});
  });
  return routes;
}
