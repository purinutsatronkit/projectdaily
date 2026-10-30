import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../apps/api/src/app.ts';
import {openDatabase} from '../apps/api/src/db.ts';
import {openTursoDatabase} from '../apps/api/src/turso-db.ts';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {join} from 'node:path';

test('private chat stores messages and files with participant-only access',async t=>{
  const db=openDatabase(':memory:');t.after(()=>db.close());
  const app=createApp(db,{secret:'chat-test-secret-at-least-32-characters',origins:['http://localhost:5173'],silent:true,authLimit:100});
  async function register(name:string,email:string){const r=await app.request('/api/auth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name,email,password:'Demo-pass-42!'})});assert.equal(r.status,201);return {cookie:r.headers.get('set-cookie')!.split(';')[0],id:(await r.json()).user.id};}
  const alice=await register('Alice','alice@example.com'),bob=await register('Bob','bob@example.com'),eve=await register('Eve','eve@example.com');
  const start=await app.request('/api/chat',{method:'POST',headers:{cookie:alice.cookie,'content-type':'application/json'},body:JSON.stringify({email:'bob@example.com'})});assert.equal(start.status,200);const room=(await start.json()).conversation.id;
  assert.equal((await app.request(`/api/chat/${room}/messages`,{headers:{cookie:eve.cookie}})).status,404);
  const form=new FormData();form.set('body','ภาพรายงาน');form.set('file',new File([Uint8Array.from([137,80,78,71,13,10,26,10,1,2,3])],'report.png',{type:'image/png'}));
  const sent=await app.request(`/api/chat/${room}/messages`,{method:'POST',headers:{cookie:alice.cookie},body:form});assert.equal(sent.status,201,await sent.text());
  const messages=(await (await app.request(`/api/chat/${room}/messages`,{headers:{cookie:bob.cookie}})).json()).messages;assert.equal(messages.length,1);assert.equal(messages[0].body,'ภาพรายงาน');assert.equal(messages[0].media_type,'image/png');
  const filePath=`/api/chat/${room}/attachments/${messages[0].attachment_id}`;
  assert.equal((await app.request(filePath,{headers:{cookie:eve.cookie}})).status,404);
  const image=await app.request(filePath,{headers:{cookie:bob.cookie}});assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/png');assert.equal((await image.arrayBuffer()).byteLength,11);
  assert.equal((await (await app.request('/api/chat/unread',{headers:{cookie:bob.cookie}})).json()).count,1);
  assert.equal((await app.request(`/api/chat/${room}/read`,{method:'POST',headers:{cookie:bob.cookie}})).status,204);
  assert.equal((await (await app.request('/api/chat/unread',{headers:{cookie:bob.cookie}})).json()).count,0);
  const duplicate=await app.request('/api/chat',{method:'POST',headers:{cookie:bob.cookie,'content-type':'application/json'},body:JSON.stringify({email:'alice@example.com'})});assert.equal((await duplicate.json()).conversation.id,room);
  const exported=await (await app.request('/api/account/export',{headers:{cookie:alice.cookie}})).json();assert.equal(exported.direct_messages.length,1);assert.equal(exported.direct_attachments.length,1);
  assert.equal((await app.request(`/api/chat/${room}/messages/${messages[0].id}`,{method:'DELETE',headers:{cookie:bob.cookie}})).status,404);
  assert.equal((await app.request(`/api/chat/${room}/messages/${messages[0].id}`,{method:'DELETE',headers:{cookie:alice.cookie}})).status,204);
  assert.equal((await app.request(filePath,{headers:{cookie:bob.cookie}})).status,404);
  assert.equal((await app.request('/api/chat',{method:'POST',headers:{cookie:alice.cookie,'content-type':'application/json'},body:JSON.stringify({email:'missing@example.com'})})).status,404);
});

test('task comments notify valid mentioned members and reject outsiders',async t=>{
  const db=openDatabase(':memory:');t.after(()=>db.close());const app=createApp(db,{secret:'comment-test-secret-at-least-32-characters',origins:['http://localhost:5173'],silent:true,authLimit:100});
  async function register(name:string,email:string){const r=await app.request('/api/auth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name,email,password:'Demo-pass-42!'})});assert.equal(r.status,201);return {cookie:r.headers.get('set-cookie')!.split(';')[0],id:(await r.json()).user.id};}
  async function send(path:string,cookie:string,method='GET',body?:unknown){return app.request(path,{method,headers:{cookie,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});}
  const owner=await register('Owner','owner@example.com'),member=await register('Member','member@example.com'),stranger=await register('Stranger','stranger@example.com');
  const project=(await (await send('/api/projects',owner.cookie,'POST',{name:'Team'})).json()).project.id;
  assert.equal((await send(`/api/shared-projects/${project}/members`,owner.cookie,'POST',{email:'member@example.com',role:'viewer'})).status,200);
  const task=(await (await send('/api/tasks',owner.cookie,'POST',{title:'Review draft',project_id:project})).json()).task.id;
  assert.equal((await send(`/api/tasks/${task}/comments`,stranger.cookie)).status,404);
  assert.equal((await send(`/api/tasks/${task}/comments`,owner.cookie,'POST',{body:'@Stranger please review',mentions:[stranger.id]})).status,400);
  const posted=await send(`/api/tasks/${task}/comments`,owner.cookie,'POST',{body:'@Member please review',mentions:[member.id]});assert.equal(posted.status,201);const comment=(await posted.json()).comment;
  const list=(await (await send(`/api/tasks/${task}/comments`,member.cookie)).json()).comments;assert.equal(list.length,1);
  const notices=(await (await send('/api/notifications/mentions',member.cookie)).json()).mentions;assert.equal(notices.length,1);assert.equal(notices[0].task_id,task);
  assert.equal((await send(`/api/tasks/${task}/comments/${comment.id}`,member.cookie,'DELETE')).status,404);
  assert.equal((await send(`/api/notifications/mentions/${notices[0].id}/read`,member.cookie,'PATCH')).status,204);
  assert.equal((await (await send('/api/notifications/mentions',member.cookie)).json()).mentions.length,0);
  assert.equal((await send(`/api/tasks/${task}/comments/${comment.id}`,owner.cookie,'DELETE')).status,204);
});

test('libSQL adapter preserves chat attachments across reopen',async t=>{
  const root=join(process.cwd(),'data');mkdirSync(root,{recursive:true});const folder=mkdtempSync(join(root,'taskflow-chat-test-'));t.after(()=>{try{rmSync(folder,{recursive:true,force:true,maxRetries:5,retryDelay:100});}catch{/* Native libSQL lock may outlive the test briefly on Windows. */}});const url=`file:${join(folder,'chat.db').replaceAll('\\','/')}`;
  let db=await openTursoDatabase(url,'');const app=createApp(db,{secret:'chat-libsql-secret-at-least-32-characters',origins:['http://localhost:5173'],silent:true});
  async function register(email:string){const r=await app.request('/api/auth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:email,email,password:'Demo-pass-42!'})});assert.equal(r.status,201);return r.headers.get('set-cookie')!.split(';')[0];}
  const first=await register('first@example.com'),second=await register('second@example.com');
  const room=(await (await app.request('/api/chat',{method:'POST',headers:{cookie:first,'content-type':'application/json'},body:JSON.stringify({email:'second@example.com'})})).json()).conversation.id;
  const form=new FormData();form.set('file',new File([Uint8Array.from([1,2,3,4])],'notes.txt',{type:'text/plain'}));
  const sent=await app.request(`/api/chat/${room}/messages`,{method:'POST',headers:{cookie:first},body:form});assert.equal(sent.status,201,await sent.text());
  const attachment=(await (await app.request(`/api/chat/${room}/messages`,{headers:{cookie:second}})).json()).messages[0].attachment_id;
  db.close();db=await openTursoDatabase(url,'');
  const reopened=createApp(db,{secret:'chat-libsql-secret-at-least-32-characters',origins:['http://localhost:5173'],silent:true});
  const file=await reopened.request(`/api/chat/${room}/attachments/${attachment}`,{headers:{cookie:second}});assert.equal(file.status,200);assert.deepEqual([...new Uint8Array(await file.arrayBuffer())],[1,2,3,4]);db.close();
});
