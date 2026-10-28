import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../apps/api/src/app.ts';
import { openDatabase } from '../apps/api/src/db.ts';

const origin='http://localhost:5173';
function fixture(t:import('node:test').TestContext,configured=true){
  const db=openDatabase(':memory:');t.after(()=>db.close());
  let answer:unknown={reply:'จะเพิ่มงานให้หลังยืนยัน',action:{type:'create_task',data:{title:'ส่งรายงาน',due_date:'2027-01-07'}}};
  const requests:string[]=[];
  const fakeFetch=(async(_input:unknown,init?:RequestInit)=>{
    requests.push(String(init?.body??''));
    return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(answer)}]}}]});
  }) as typeof fetch;
  const app=createApp(db,{secret:'assistant-test-secret-at-least-32-characters',origins:[origin],silent:true,assistant:{key:configured?'fake-key':undefined,fetch:fakeFetch}});
  async function register(email:string){const response=await app.request('/api/auth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Private Person',email,password:'Password-2026!'} )});assert.equal(response.status,201);return response.headers.get('set-cookie')!.split(';')[0];}
  const request=(path:string,cookie='',method='GET',body?:unknown)=>app.request(path,{method,headers:{cookie,origin,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  return {db,app,register,request,requests,setAnswer:(value:unknown)=>{answer=value;}};
}
test('assistant needs login, uses only the typed message, and proposes without saving',async t=>{
  const f=fixture(t),cookie=await f.register('private@example.com');
  await f.request('/api/tasks',cookie,'POST',{title:'Private task'});
  assert.equal((await f.request('/api/assistant/status')).status,401);
  const response=await f.request('/api/assistant/plan',cookie,'POST',{message:'เพิ่มงานส่งรายงานวันที่ 7 มกราปีหน้า'});
  assert.equal(response.status,200);
  const plan=await response.json();assert.equal(plan.action.type,'create_task');assert.equal(plan.action.data.due_date,'2027-01-07');
  assert.equal((await(await f.request('/api/tasks',cookie)).json()).tasks.length,1);
  assert.ok(f.requests[0].includes('เพิ่มงานส่งรายงานวันที่ 7 มกราปีหน้า'));
  assert.ok(!f.requests[0].includes('private@example.com'));
  assert.ok(!f.requests[0].includes('Private task'));
  assert.ok(!f.requests[0].includes('Private Person'));
});
test('assistant resolves only an exact task owned by the caller',async t=>{
  const f=fixture(t),owner=await f.register('owner@example.com'),other=await f.register('other@example.com');
  const created=await(await f.request('/api/tasks',owner,'POST',{title:'Review code'})).json();
  f.setAnswer({reply:'ตรวจคำสั่งก่อนลบ',action:{type:'delete_task',target:'Review code'}});
  const result=await(await f.request('/api/assistant/plan',owner,'POST',{message:'ลบงาน Review code'})).json();
  assert.equal(result.action.id,created.task.id);
  const outsider=await(await f.request('/api/assistant/plan',other,'POST',{message:'ลบงาน Review code'})).json();
  assert.equal(outsider.action,null);
  assert.equal((await(await f.request('/api/tasks',owner)).json()).tasks.length,1);
});
test('assistant rejects malformed model actions and disabled configuration',async t=>{
  const f=fixture(t),cookie=await f.register('owner@example.com');
  f.setAnswer({reply:'done',action:{type:'delete_everything'}});
  assert.equal((await f.request('/api/assistant/plan',cookie,'POST',{message:'ลบทุกอย่าง'})).status,503);
  const disabled=fixture(t,false),disabledCookie=await disabled.register('another@example.com');
  assert.equal((await disabled.request('/api/assistant/plan',disabledCookie,'POST',{message:'เพิ่มงานใหม่'})).status,503);
  assert.equal((await(await disabled.request('/api/assistant/status',disabledCookie)).json()).available,false);
});
test('assistant may use only prior messages supplied by the user, with a bounded history',async t=>{
  const f=fixture(t),cookie=await f.register('context@example.com');
  const response=await f.request('/api/assistant/plan',cookie,'POST',{message:'วันที่ 7 มกราคม',history:['เพิ่มงานส่งรายงาน']});
  assert.equal(response.status,200);
  assert.ok(f.requests[0].includes('เพิ่มงานส่งรายงาน'));
  assert.ok(!f.requests[0].includes('context@example.com'));
  assert.equal((await f.request('/api/assistant/plan',cookie,'POST',{message:'เพิ่มงานใหม่',history:Array(5).fill('ข้อความเดิม')})).status,400);
});
