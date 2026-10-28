import { createApp } from '../apps/api/src/app.ts';
import { openDatabase } from '../apps/api/src/db.ts';

const key=process.env.GEMINI_API_KEY?.trim();
const model=process.env.GEMINI_MODEL?.trim()||'gemini-3.5-flash-lite';
if(!key){console.error('GEMINI_API_KEY is not configured');process.exitCode=1;}
else{
  try{
    const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{
      method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},
      body:JSON.stringify({contents:[{parts:[{text:'Reply with OK'}]}],generationConfig:{maxOutputTokens:16}}),
      signal:AbortSignal.timeout(20_000),
    });
    if(response.ok){
      console.log(`Gemini OK (model: ${model})`);
      const db=openDatabase(':memory:');
      try{
        const origin='http://localhost:5173';
        const app=createApp(db,{secret:'synthetic-assistant-check-secret-2026',origins:[origin],silent:true,assistant:{key,model}});
        const registered=await app.request('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'AI Check',email:'ai-check@example.test',password:'Test!2026'})});
        const cookie=registered.headers.get('set-cookie')?.split(';')[0]??'';
        const planned=await app.request('/api/assistant/plan',{method:'POST',headers:{'Content-Type':'application/json',origin,cookie},body:JSON.stringify({message:'เพิ่มงานชื่อ ทดสอบ AI วันที่ 7 มกราคมปีหน้า'})});
        const result=await planned.json() as {action?:{type?:string};error?:{code?:string}};
        if(!planned.ok||result.action?.type!=='create_task'){
          console.error(`TaskFlow assistant check failed: HTTP ${planned.status}, code ${result.error?.code??'unexpected_action'}`);
          process.exitCode=1;
        }else console.log('TaskFlow assistant planning OK (synthetic test account)');
      }finally{db.close();}
    }
    else{
      const body=await response.json().catch(()=>({})) as {error?:{status?:string;message?:string}};
      const safe=String(body.error?.message??'').replaceAll(key,'[redacted]').slice(0,350);
      console.error(`Gemini HTTP ${response.status} (${body.error?.status??'unknown'}), model: ${model}${safe?`\n${safe}`:''}`);
      process.exitCode=1;
    }
  }catch(error){console.error(`Gemini connection failed: ${error instanceof Error?error.name:'unknown'}`);process.exitCode=1;}
}

