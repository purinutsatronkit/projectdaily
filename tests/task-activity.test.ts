import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../apps/api/src/app.ts';
import {openDatabase} from '../apps/api/src/db.ts';

const password='Demo-pass-42!';
test('task history records real changes, shared actors, deletion and enforces access',async t=>{
  const db=openDatabase(':memory:');t.after(()=>db.close());
  const app=createApp(db,{secret:'task-history-test-secret-at-least-32-characters',origins:['http://localhost:5173'],silent:true,authLimit:100});
  async function call(path:string,cookie='',method='GET',body?:unknown){return app.request(path,{method,headers:{...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});}
  async function register(name:string,email:string){const res=await call('/api/auth/register','','POST',{name,email,password});assert.equal(res.status,201);return {cookie:res.headers.get('set-cookie')!.split(';')[0],id:(await res.json()).user.id};}
  const owner=await register('Owner','owner@example.com'),editor=await register('Editor','editor@example.com'),outsider=await register('Outsider','outsider@example.com');
  const projectResponse=await call('/api/projects',owner.cookie,'POST',{name:'Alpha'});assert.equal(projectResponse.status,201);const projectId=(await projectResponse.json()).project.id;
  const memberResponse=await call(`/api/shared-projects/${projectId}/members`,owner.cookie,'POST',{email:'editor@example.com',role:'editor'});assert.equal(memberResponse.status,200);
  const taskResponse=await call(`/api/shared-projects/${projectId}/tasks`,editor.cookie,'POST',{title:'Write report'});assert.equal(taskResponse.status,201);const taskId=(await taskResponse.json()).task.id;
  assert.equal((await call(`/api/tasks/${taskId}/history`,outsider.cookie)).status,404);
  assert.equal((await call(`/api/shared-projects/${projectId}/activity`,outsider.cookie)).status,404);
  const update=await call(`/api/tasks/${taskId}`,owner.cookie,'PATCH',{status:'in_progress',priority:'high',due_date:'2026-11-02'});assert.equal(update.status,200);
  const noop=await call(`/api/tasks/${taskId}`,owner.cookie,'PATCH',{status:'in_progress'});assert.equal(noop.status,200);
  const assign=await call(`/api/shared-projects/${projectId}/tasks/${taskId}`,editor.cookie,'PATCH',{assigned_to:editor.id});assert.equal(assign.status,200);
  const historyResponse=await call(`/api/tasks/${taskId}/history`,editor.cookie);assert.equal(historyResponse.status,200);
  const history=(await historyResponse.json()).history;
  assert.equal(history.length,3);
  assert.deepEqual(history.map((e:{event:string;actor_name:string})=>[e.event,e.actor_name]),[['updated','Editor'],['updated','Owner'],['created','Editor']]);
  assert.deepEqual(JSON.parse(history[1].changes).map((c:{field:string})=>c.field),['priority','status','due_date']);
  assert.equal((await call(`/api/shared-projects/${projectId}/activity`,editor.cookie)).status,200);
  const exported=await call('/api/account/export',owner.cookie);assert.equal(exported.status,200);assert.equal((await exported.json()).task_activity.length,3);
  assert.equal((await call(`/api/tasks/${taskId}`,owner.cookie,'DELETE')).status,204);
  const deleted=(await (await call(`/api/tasks/${taskId}/history`,owner.cookie)).json()).history;
  assert.equal(deleted[0].event,'deleted');assert.equal(deleted.length,4);
  const projectHistory=(await (await call(`/api/shared-projects/${projectId}/activity`,editor.cookie)).json()).history;
  assert.equal(projectHistory[0].event,'deleted');
  assert.equal((await call(`/api/tasks/${taskId}/history`,outsider.cookie)).status,404);
  assert.equal((await call(`/api/shared-projects/${projectId}/members/${editor.id}`,owner.cookie,'DELETE')).status,204);
  assert.equal((await call(`/api/tasks/${taskId}/history`,editor.cookie)).status,404);
  assert.equal((await call(`/api/shared-projects/${projectId}/activity`,editor.cookie)).status,404);
});
