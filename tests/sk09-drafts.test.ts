import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../apps/api/src/app.ts';
import { openDatabase } from '../apps/api/src/db.ts';

const data={name:'',studentId:'66',company:'',department:'',startDate:'',endDate:'',startTime:'08:00',endTime:'17:00',days:Array.from({length:5},()=>({assignment:'',result:''}))};
const config={secret:'sk09-draft-test-secret-at-least-32-characters',origins:['http://localhost:5173'],silent:true};
test('drafts save incomplete forms, isolate accounts, reject stale writes and survive database reopening',async t=>{
  const folder=mkdtempSync(join(tmpdir(),'taskflow-draft-')),path=join(folder,'data.sqlite');
  let db=openDatabase(path),app=createApp(db,config);
  t.after(()=>{db.close();rmSync(folder,{recursive:true,force:true});});
  async function register(email:string) {
    const response=await app.request('/api/auth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Draft owner',email,password:'Draft-2026!'})});
    assert.equal(response.status,201);return response.headers.get('set-cookie')!.split(';')[0];
  }
  const owner=await register('owner@example.com'),other=await register('other@example.com');
  const read=(cookie:string)=>app.request('/api/sk09/draft',{headers:{cookie}});
  const put=(cookie:string,body:unknown,origin='http://localhost:5173')=>app.request('/api/sk09/draft',{method:'PUT',headers:{cookie,origin,'content-type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await read('')).status,401);
  assert.equal((await put('',{data,version:0})).status,401);
  assert.equal((await put(owner,{data,version:0},'https://evil.example')).status,403);
  assert.equal((await (await read(owner)).json()).draft,null);
  const first=await put(owner,{data,version:0});assert.equal(first.status,200);
  const saved=(await first.json()).draft;assert.equal(saved.version,1);assert.deepEqual(saved.data,data);
  assert.equal((await (await read(other)).json()).draft,null);
  assert.equal((await (await put(owner,{data,version:0})).json()).draft.version,1,'retry after lost response is idempotent');
  assert.equal((await put(owner,{data:{...data,company:'Stale tab'},version:0})).status,409);
  const full={...data,name:'ก'.repeat(80),company:'ก'.repeat(120),department:'ก'.repeat(80),days:Array.from({length:5},()=>({assignment:'ก'.repeat(600),result:'ข'.repeat(400)}))};
  const second=await put(owner,{data:full,version:1});assert.equal(second.status,200,'maximum Thai text fits the request limit');
  assert.equal((await second.json()).draft.version,2);
  for(const patch of [{days:[]},{company:'a'.repeat(121)},{startDate:'2026-02-30'},{startDate:'9999-12-31'},{startTime:'99:99'}]) {
    assert.equal((await put(owner,{data:{...data,...patch},version:2})).status,400);
  }
  assert.equal((await put(owner,{data,version:-1})).status,400);
  assert.equal((await put(owner,{data:{...data,company:'a'.repeat(70000)},version:2})).status,413);
  assert.equal((await put(other,{data:{...data,company:'Other account'},version:0})).status,200);
  db.close();db=openDatabase(path);app=createApp(db,config);
  const restored=(await (await read(owner)).json()).draft;
  assert.deepEqual(restored.data,full);assert.equal(restored.version,2);
  assert.equal((await (await read(other)).json()).draft.data.company,'Other account');
  assert.equal((await read(owner)).headers.get('cache-control'),'no-store');
});
