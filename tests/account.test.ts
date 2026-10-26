import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../apps/api/src/app.ts';
import { openDatabase } from '../apps/api/src/db.ts';

const PASSWORD = 'Account-2026!';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7xkAAAAASUVORK5CYII=', 'base64');
function fixture(t: import('node:test').TestContext) {
  const db = openDatabase(':memory:'); t.after(() => db.close());
  const sent:{to:string;verifyUrl:string}[]=[];
  const app = createApp(db,{secret:'account-test-secret-at-least-32-characters',origins:['http://localhost:5173'],silent:true,passwordReset:{publicUrl:'http://localhost:5173',send:async()=>{},sendVerification:async mail=>{sent.push(mail);}}});
  async function register(email: string) {
    const response = await app.request('/api/auth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Original name',email,password:PASSWORD})});
    assert.equal(response.status,201);
    return { cookie:response.headers.get('set-cookie')!.split(';')[0], user:(await response.json()).user };
  }
  const send = (cookie: string, body: unknown) => app.request('/api/account',{method:'PATCH',headers:{cookie,'content-type':'application/json'},body:JSON.stringify(body)});
  return {db,app,register,send,sent};
}
test('account edits persist, remain scoped to their owner, and require authentication',async t => {
  const f=fixture(t), owner=await f.register('owner@example.com'), other=await f.register('other@example.com');
  assert.equal((await f.app.request('/api/account')).status,401);
  assert.equal((await f.send('',{name:'Changed',nickname:'Nick',phone:'0812345678',email:owner.user.email})).status,401);
  const response=await f.send(owner.cookie,{name:'Changed',nickname:' Nick ',phone:'+66 81-234-5678',email:owner.user.email,id:other.user.id});
  assert.equal(response.status,200); const {user}=await response.json();
  assert.equal(user.nickname,'Nick'); assert.equal(user.name,'Changed'); assert.equal(user.phone,'+66 81-234-5678');
  assert.equal((await (await f.app.request('/api/auth/me',{headers:{cookie:owner.cookie}})).json()).user.nickname,'Nick');
  assert.equal((await (await f.app.request('/api/account',{headers:{cookie:other.cookie}})).json()).user.name,'Original name');
  assert.equal((await f.send(owner.cookie,{name:'Changed',nickname:'',phone:'',email:owner.user.email})).status,200);
  assert.equal((await f.send(owner.cookie,{name:'Changed',nickname:'N',phone:'invalid',email:owner.user.email})).status,400);
});
test('email changes require a password and new-address verification before login and reminders change',async t => {
  const f=fixture(t), owner=await f.register('owner@example.com'); await f.register('taken@example.com');
  const body={name:'Owner',nickname:'Nick',phone:'',email:'new@example.com'};
  assert.equal((await f.send(owner.cookie,body)).status,400);
  assert.equal((await f.send(owner.cookie,{...body,current_password:'wrong'})).status,400);
  assert.equal((await f.send(owner.cookie,{...body,email:'taken@example.com',current_password:PASSWORD})).status,409);
  f.db.prepare('INSERT INTO password_reset_tokens(id,user_id,token_hash,expires_at,created_at) VALUES(?,?,?,?,?)').run('reset',owner.user.id,'digest','2099-01-01',new Date().toISOString());
  assert.equal((await f.send(owner.cookie,{...body,email:' NEW@EXAMPLE.COM ',current_password:PASSWORD})).status,200);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS count FROM password_reset_tokens WHERE user_id=?').get(owner.user.id)!.count,1);
  await new Promise(resolve=>setImmediate(resolve));
  const email=f.sent.find(item=>item.to==='new@example.com');assert.ok(email);
  assert.equal((await f.app.request('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'new@example.com',password:PASSWORD})})).status,401);
  const token=new URLSearchParams(new URL(email.verifyUrl).hash.slice(1)).get('token');
  assert.equal((await f.app.request('/api/auth/verify-email',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token})})).status,200);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS count FROM password_reset_tokens WHERE user_id=?').get(owner.user.id)!.count,0);
  for (const [email,status] of [['owner@example.com',401],['new@example.com',200]] as const) {
    assert.equal((await f.app.request('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password:PASSWORD})})).status,status);
  }
  const key=await (await f.app.request('/api/keys',{method:'POST',headers:{cookie:owner.cookie,'content-type':'application/json'},body:JSON.stringify({name:'Reminders'})})).json();
  const due=await (await f.app.request('/api/integrations/due-tasks',{headers:{'x-api-key':key.secret}})).json();
  assert.equal(due.user.email,'new@example.com');
});
test('avatars accept image bytes, enforce 2 MB, reject spoofed formats, and stay private',async t => {
  const f=fixture(t), owner=await f.register('owner@example.com'), other=await f.register('other@example.com');
  const put=(bytes:Buffer,type='image/png',cookie=owner.cookie) => f.app.request('/api/account/avatar',{method:'PUT',headers:{cookie,'content-type':type},body:new Uint8Array(bytes)});
  assert.equal((await put(PNG,'image/png','')).status,401);
  assert.equal((await put(Buffer.from('<svg></svg>'),'image/svg+xml')).status,400);
  assert.equal((await put(PNG,'image/jpeg')).status,400);
  assert.equal((await put(Buffer.alloc(2*1024*1024+1))).status,413);
  const boundary=Buffer.alloc(2*1024*1024); PNG.copy(boundary);
  assert.equal((await put(boundary)).status,200);
  const response=await put(PNG); assert.equal(response.status,200);
  const first=(await response.json()).user.avatar_url; assert.match(first,/^\/api\/account\/avatar\?v=/);
  assert.equal((await f.app.request(first)).status,401);
  assert.equal((await f.app.request(first,{headers:{cookie:other.cookie}})).status,404);
  const image=await f.app.request(first,{headers:{cookie:owner.cookie}});
  assert.equal(image.headers.get('content-type'),'image/png'); assert.deepEqual(Buffer.from(await image.arrayBuffer()),PNG);
  const second=await put(PNG); assert.notEqual((await second.json()).user.avatar_url,first);
  assert.equal((await f.app.request('/api/account/avatar',{method:'DELETE',headers:{cookie:owner.cookie}})).status,200);
  assert.equal((await f.app.request('/api/account/avatar',{headers:{cookie:owner.cookie}})).status,404);
});
test('account and avatar mutations reject unapproved origins',async t=>{
  const f=fixture(t), owner=await f.register('owner@example.com');
  for(const [path,method,body,type] of [
    ['/api/account','PATCH',JSON.stringify({name:'Changed',nickname:'',phone:'',email:owner.user.email}),'application/json'],
    ['/api/account/avatar','PUT',new Uint8Array(PNG),'image/png'],
    ['/api/account/avatar','DELETE',undefined,undefined],
  ] as const) {
    const headers: Record<string,string>={cookie:owner.cookie,origin:'https://unapproved.example'};
    if(type) headers['content-type']=type;
    assert.equal((await f.app.request(path,{method,headers,body})).status,403);
  }
});
test('old databases migrate without losing accounts and reopen safely',t => {
  const folder=mkdtempSync(join(tmpdir(),'taskflow-migration-')); const path=join(folder,'db.sqlite');
  t.after(()=>rmSync(folder,{recursive:true,force:true}));
  const old=new DatabaseSync(path);
  old.exec("CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,created_at TEXT NOT NULL); INSERT INTO users VALUES('old','Original','old@example.com','hash','2026-01-01');"); old.close();
  for(let i=0;i<2;i++) {
    const db=openDatabase(path);
    try { const user=db.prepare('SELECT * FROM users WHERE id=?').get('old')!; assert.equal(user.name,'Original'); assert.equal(user.nickname,''); assert.equal(user.avatar,null); }
    finally { db.close(); }
  }
});
