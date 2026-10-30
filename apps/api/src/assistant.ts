import { Hono } from 'hono';
import { z } from 'zod';
import { accountSchema, dateSchema, priorities, statuses } from '@taskflow/shared';
import { ApiError, all, bangkokDate, get, parseBody, type Env } from './context.ts';
import type { Database } from './db.ts';

const taskData = z.object({ title:z.string().trim().min(3).max(120), description:z.string().max(2000).default(''), priority:z.enum(priorities).default('medium'), status:z.enum(statuses).default('pending'), due_date:dateSchema.nullable().default(null) });
const projectData = z.object({ name:z.string().trim().min(2).max(80), description:z.string().max(500).default('') });
const draftData = z.object({name:z.string().max(80).optional(),studentId:z.string().max(20).optional(),company:z.string().max(120).optional(),department:z.string().max(80).optional(),startDate:dateSchema.optional(),startTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),endTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional()});
const name = z.string().trim().min(2).max(120);
const repository=z.string().regex(/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/);
export const assistantAction = z.discriminatedUnion('type',[
  z.object({type:z.literal('create_task'),data:taskData,project_name:name.optional()}),
  z.object({type:z.literal('update_task'),target:name,data:taskData.partial(),project_name:name.optional()}).refine(v=>Object.keys(v.data).length>0||!!v.project_name),
  z.object({type:z.literal('delete_task'),target:name}),
  z.object({type:z.literal('create_project'),data:projectData}),
  z.object({type:z.literal('update_project'),target:name,data:projectData.partial().refine(v=>Object.keys(v).length>0)}),
  z.object({type:z.literal('delete_project'),target:name}),
  z.object({type:z.literal('update_profile'),data:accountSchema.pick({name:true,nickname:true,phone:true}).partial().refine(v=>Object.keys(v).length>0)}),
  z.object({type:z.literal('update_sk09_draft'),data:draftData.refine(v=>Object.keys(v).length>0)}),
  z.object({type:z.literal('mark_notifications_read')}),
  z.object({type:z.literal('link_github_issue'),target:name,url:z.url().max(300)}),
  z.object({type:z.literal('github_pipeline'),kind:z.enum(['dispatch','rerun','cancel']),repository,id:z.number().int().positive(),ref:z.string().max(255).optional()}),
  z.object({type:z.literal('list_tasks'),search:z.string().max(100).optional()}),
  z.object({type:z.literal('summary')}),
  z.object({type:z.literal('navigate'),page:z.enum(['all','today','sk09','github','account','integrations','guide'])}),
]);
export type AssistantAction = z.infer<typeof assistantAction>;
type GeminiResponse={candidates?:{content?:{parts?:{text?:string}[]}}[]};

export function assistantRoutes(db:Database,options:{key?:string;model?:string;fetch?:typeof fetch}={}) {
  const routes=new Hono<Env>();
  routes.get('/status',c=>c.json({available:!!options.key}));
  routes.post('/plan',async c=>{
    const {message,history}=await parseBody(c,z.object({message:z.string().trim().min(2).max(600),history:z.array(z.string().trim().min(2).max(600)).max(4).default([])}));
    if(!options.key)throw new ApiError(503,'AI_NOT_CONFIGURED','ยังไม่ได้ตั้งค่า GEMINI_API_KEY ในเซิร์ฟเวอร์');
    const model=options.model??'gemini-3.5-flash-lite';
    if(!/^[a-zA-Z0-9._-]+$/.test(model))throw new ApiError(503,'AI_CONFIG','ชื่อโมเดลไม่ถูกต้อง');
    const prompt=`You are a Thai command interpreter for TaskFlow. Today in Asia/Bangkok is ${bangkokDate()}. Interpret relative dates using this date, ISO YYYY-MM-DD, Gregorian year. Return ONLY JSON {"reply":"short Thai explanation or question","action":null or one action object}. The action is a proposal requiring user confirmation; never say it is saved. If missing details or ambiguous, ask and return null. Do not invent existing IDs. Actions: create_task {type,data:{title,description?,priority?:low|medium|high,status?:pending|in_progress|completed,due_date?:YYYY-MM-DD|null},project_name?}; update_task {type,target:exact task title,data:{changed fields only},project_name?}; delete_task {type,target:exact task title}; create_project {type,data:{name,description?}}; update_project {type,target:exact project name,data:{name?,description?}}; delete_project {type,target:exact project name}; update_profile {type,data:{name?,nickname?,phone?}}; update_sk09_draft {type,data:{name?,studentId?,company?,department?,startDate?,startTime?,endTime?}}; mark_notifications_read {type}; link_github_issue {type,target:exact task title,url:GitHub Issue/Pull Request URL given by user}; github_pipeline {type,kind:dispatch|rerun|cancel,repository:owner/repo,id:numeric workflow/run ID explicitly given by user,ref:branch for dispatch}; list_tasks {type,search?}; summary {type}; navigate {type,page:all|today|sk09|github|account|integrations|guide}. For account email/password/avatar, Google/GitHub connection, API keys, SK09 PDF or daily rows, and GitHub files/commits/test details, navigate to the relevant page and explain the next control. If a request to update/delete a task or project lacks the exact target title/name, ask. Earlier messages typed by this user in this chat (context only; current message takes priority): ${JSON.stringify(history)}. Current user message: ${JSON.stringify(message)}`;
    let response:Response;
    try {response=await(options.fetch??fetch)(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':options.key},body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{responseMimeType:'application/json',temperature:0.1,maxOutputTokens:700}}),signal:AbortSignal.timeout(20_000)});}catch{throw new ApiError(503,'AI_UNAVAILABLE','ติดต่อ Gemini ไม่สำเร็จ กรุณาลองใหม่');}
    if(!response.ok){
      if(response.status===404)throw new ApiError(503,'AI_MODEL_UNAVAILABLE',`โมเดล ${model} ใช้ไม่ได้ กรุณาตรวจ GEMINI_MODEL`);
      if(response.status===429)throw new ApiError(503,'AI_QUOTA','โควตา Gemini หมดชั่วคราว กรุณาลองใหม่ภายหลัง');
      if(response.status===401||response.status===403)throw new ApiError(503,'AI_KEY_REJECTED','Gemini ไม่ยอมรับ API Key หรือโปรเจกต์นี้ไม่มีสิทธิ์ใช้โมเดล');
      throw new ApiError(503,'AI_UNAVAILABLE',`Gemini ตอบกลับไม่สำเร็จ (HTTP ${response.status})`);
    }
    const result=await response.json() as GeminiResponse;
    const raw=result.candidates?.[0]?.content?.parts?.map(p=>p.text??'').join('')??'';
    let parsed:unknown;try{parsed=JSON.parse(raw);}catch{throw new ApiError(503,'AI_FORMAT','AI ตอบกลับไม่เป็นรูปแบบที่รองรับ');}
    const envelope=z.object({reply:z.string().trim().min(1).max(500),action:z.unknown().nullable()}).safeParse(parsed);
    if(!envelope.success)throw new ApiError(503,'AI_FORMAT','AI ตอบกลับไม่ครบ');
    const proposed=envelope.data.action===null?null:assistantAction.safeParse(envelope.data.action);
    if(proposed&&!proposed.success)throw new ApiError(503,'AI_FORMAT','AI เสนอคำสั่งที่ไม่รองรับ กรุณาอธิบายใหม่');
    const action=proposed&&proposed.success?proposed.data:null;
    if(action?.type==='github_pipeline'&&(!message.includes(action.repository)||!message.includes(String(action.id))||(action.kind==='dispatch'&&(!action.ref||!message.includes(action.ref)))))return c.json({reply:'ระบุ repository, หมายเลข workflow หรือ run และ branch ให้ครบก่อนสั่ง GitHub',action:null});
    if(action?.type==='link_github_issue'&&!message.includes(action.url))return c.json({reply:'กรุณาใส่ลิงก์ GitHub Issue หรือ Pull Request ที่ต้องการผูกกับงาน',action:null});
    const userId=c.get('user').id;
    if(action?.type==='summary'){
      const row=(await get<{total:number;completed:number;overdue:number}>(db,"SELECT COUNT(*) total,COALESCE(SUM(status='completed'),0) completed,COALESCE(SUM(status!='completed' AND due_date<?),0) overdue FROM tasks WHERE user_id=?",bangkokDate(),userId))!;
      return c.json({reply:`มีงานทั้งหมด ${row.total} งาน เสร็จแล้ว ${row.completed} งาน และเลยกำหนด ${row.overdue} งาน`,action:null});
    }
    if(action?.type==='list_tasks'){
      const rows=await all<{title:string;due_date:string|null;status:string}>(db,"SELECT title,due_date,status FROM tasks WHERE user_id=? AND (?='' OR instr(lower(title),lower(?))>0) ORDER BY due_date LIMIT 20",userId,action.search??'',action.search??'');
      return c.json({reply:rows.length?rows.map(t=>`${t.title}${t.due_date?` (${t.due_date})`:''} · ${t.status}`).join('\n'):'ไม่พบงานที่ตรงกับคำค้นหา',action:null});
    }
    const resolvedFields:Record<string,string>={};
    if(action&&'target'in action){
      const table=action.type.endsWith('task')||action.type==='link_github_issue'?'tasks':'projects';
      const column=table==='tasks'?'title':'name';
      const matches=await all<{id:string}>(db,`SELECT id FROM ${table} WHERE user_id=? AND lower(${column})=lower(?) LIMIT 2`,userId,action.target);
      if(matches.length!==1)return c.json({reply:matches.length?'มีชื่อซ้ำกัน กรุณาแก้ในหน้ารายการ':'ไม่พบรายการชื่อนี้ กรุณาตรวจชื่อให้ตรง',action:null});
      resolvedFields.id=matches[0].id;
    }
    if(action&&'project_name'in action&&action.project_name){
      const matches=await all<{id:string}>(db,'SELECT id FROM projects WHERE user_id=? AND lower(name)=lower(?) LIMIT 2',userId,action.project_name);
      if(matches.length!==1)return c.json({reply:'ไม่พบโปรเจกต์ชื่อนี้ หรือมีชื่อซ้ำ กรุณาระบุให้ชัดเจน',action:null});
      resolvedFields.project_id=matches[0].id;
    }
    return c.json({reply:envelope.data.reply,action:action?{...action,...resolvedFields}:null});
  });
  return routes;
}
