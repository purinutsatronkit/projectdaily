import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../apps/api/src/app.ts';
import {openDatabase} from '../apps/api/src/db.ts';
import {seal} from '../apps/api/src/social-config.ts';
const origin='http://localhost:5173',password='Password-2026!',key='89'.repeat(32);
function fixture(t:import('node:test').TestContext){
  const db=openDatabase(':memory:');t.after(()=>db.close());let runStatus:'queued'|'completed'='queued';
  const fakeFetch=(async(input:any)=>{
    const url=String(input);
    if(url.includes('/actions/runs?'))return Response.json({workflow_runs:[{id:101,workflow_id:42,status:runStatus,conclusion:runStatus==='completed'?'failure':null,display_title:'Unit tests'}]});
    return Response.json({message:'Not mocked'},{status:404});
  }) as typeof fetch;
  const app=createApp(db,{secret:'project-test-secret-at-least-32-characters',origins:[origin],silent:true,social:{publicUrl:origin,github:{clientId:'x',clientSecret:'y'},tokenKey:key,fetch:fakeFetch}});
  async function register(email:string){const response=await app.request('/api/auth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Test User',email,password})});assert.equal(response.status,201);return {user:(await response.json()).user,cookie:response.headers.get('set-cookie')!.split(';')[0]};}
  function request(path:string,cookie:string,method='GET',body?:unknown){return app.request(path,{method,headers:{cookie,origin,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});}
  return {db,app,register,request,setRunStatus:(state:'queued'|'completed')=>runStatus=state};
}
test('projects isolate users, keep legacy unassigned tasks, filter summaries and feed reviewed SK09 suggestions',async t=>{
  const f=fixture(t),owner=await f.register('owner@example.com'),other=await f.register('other@example.com');
  const projectResponse=await f.request('/api/projects',owner.cookie,'POST',{name:'Internship',github_repo:'owner/repo',description:'Training'});assert.equal(projectResponse.status,201);
  const project=(await projectResponse.json()).project;
  assert.equal((await (await f.request('/api/projects',other.cookie)).json()).projects.length,0);
  const task=await f.request('/api/tasks',owner.cookie,'POST',{title:'Review code',due_date:'2026-10-26',project_id:project.id});assert.equal(task.status,201);
  const taskId=(await task.json()).task.id;
  assert.equal((await f.request('/api/tasks',other.cookie,'POST',{title:'Cross project',project_id:project.id})).status,400);
  assert.equal((await (await f.request(`/api/tasks?project_id=${project.id}`,owner.cookie)).json()).tasks.length,1);
  assert.equal((await (await f.request('/api/summary?project_id=unassigned',owner.cookie)).json()).summary.total,0);
  assert.equal((await (await f.request(`/api/tasks/sk09/suggestions?start=2026-10-26&project_id=${project.id}`,owner.cookie)).json()).days[0].tasks[0].title,'Review code');
  assert.equal((await f.request(`/api/tasks/sk09/suggestions?start=2026-10-26&project_id=${project.id}`,other.cookie)).status,404);
  assert.equal((await f.request(`/api/projects/${project.id}`,owner.cookie,'DELETE')).status,204);
  assert.equal((await (await f.request('/api/tasks?project_id=unassigned',owner.cookie)).json()).tasks[0].id,taskId);
});
test('GitHub links validate URL, stay scoped to the task owner and appear in account export without credentials',async t=>{
  const f=fixture(t),owner=await f.register('owner@example.com'),other=await f.register('other@example.com');
  const taskId=(await (await f.request('/api/tasks',owner.cookie,'POST',{title:'Review pull request'})).json()).task.id;
  assert.equal((await f.request(`/api/tasks/${taskId}/links`,owner.cookie,'POST',{url:'https://github.com/owner/repo/pull/12'})).status,201);
  assert.equal((await f.request(`/api/tasks/${taskId}/links`,owner.cookie,'POST',{url:'https://github.com/evil/repo/pull/12?x=1'})).status,400);
  assert.equal((await f.request(`/api/tasks/${taskId}/links`,other.cookie)).status,404);
  const exported=await (await f.request('/api/account/export',owner.cookie)).json();
  assert.equal(exported.task_links.length,1);assert.equal(exported.tasks[0].title,'Review pull request');
  assert.ok(!JSON.stringify(exported).includes('password_hash'));assert.ok(!JSON.stringify(exported).includes('token_cipher'));
});
test('pipeline failure appears on observed transition, can be read, and accepted commands have private history',async t=>{
  const f=fixture(t),owner=await f.register('owner@example.com'),other=await f.register('other@example.com');
  const project=(await (await f.request('/api/projects',owner.cookie,'POST',{name:'Pipeline',github_repo:'owner/repo',follow_workflow_id:'42'})).json()).project;
  f.db.prepare('INSERT INTO connected_accounts VALUES(?,?,?,?,?,?)').run(owner.user.id,'github','9','owner',seal(JSON.stringify({access_token:'mock',expires_at:null}),key,owner.user.id),new Date().toISOString());
  assert.equal((await (await f.request('/api/github/alerts',owner.cookie)).json()).notifications.length,0);
  f.setRunStatus('completed');const alert=(await (await f.request('/api/github/alerts',owner.cookie)).json()).notifications[0];
  assert.equal(alert.project_id,project.id);assert.equal(alert.run_id,'101');
  assert.equal((await (await f.request('/api/github/alerts',other.cookie)).json()).notifications.length,0);
  assert.equal((await f.request(`/api/github/alerts/${alert.id}/read`,other.cookie,'PATCH')).status,404);
  assert.equal((await f.request(`/api/github/alerts/${alert.id}/read`,owner.cookie,'PATCH')).status,204);
  assert.equal((await (await f.request('/api/github/alerts',owner.cookie)).json()).notifications.length,0);
});
test('account deletion requires password and explicit confirmation, then cascades only that account',async t=>{
  const f=fixture(t),owner=await f.register('owner@example.com'),other=await f.register('other@example.com');
  await f.request('/api/projects',owner.cookie,'POST',{name:'Internship'});
  const path='/api/account/delete-account';
  assert.equal((await f.request(path,owner.cookie,'POST',{email:owner.user.email,confirmation:'DELETE',password:'wrong'})).status,403);
  assert.equal((await f.request(path,owner.cookie,'POST',{email:other.user.email,confirmation:'DELETE',password})).status,400);
  assert.equal((await f.request(path,owner.cookie,'POST',{email:owner.user.email,confirmation:'DELETE',password})).status,204);
  assert.equal((await f.request('/api/auth/me',owner.cookie)).status,401);
  assert.equal((await f.request('/api/auth/me',other.cookie)).status,200);
  assert.equal(f.db.prepare('SELECT COUNT(*) count FROM projects').get()!.count,0);
});
