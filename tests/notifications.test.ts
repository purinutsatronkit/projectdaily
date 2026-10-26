import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../apps/api/src/db.ts';
import { readNotifications } from '../apps/api/src/notifications.ts';
import { createApp } from '../apps/api/src/app.ts';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const at=(date:string,time='07:00:00')=>new Date(`${date}T${time}+07:00`);
function fixture(t:import('node:test').TestContext) {
  const db=openDatabase(':memory:');t.after(()=>db.close());
  for(const id of ['owner','other']) db.prepare('INSERT INTO users(id,name,email,password_hash,created_at) VALUES(?,?,?,?,?)').run(id,id,`${id}@example.com`,'hash','2026-01-01');
  const task=(id:string,due='2026-10-21',user='owner')=>db.prepare("INSERT INTO tasks(id,user_id,title,priority,status,due_date,created_at,updated_at) VALUES(?,?,?,'high','pending',?,'2026-01-01','2026-01-01')").run(id,user,id,due);
  return {db,task};
}
test('daily inbox begins at 07:00 Bangkok, does not regenerate when read, and returns the next morning',t=>{
  const {db,task}=fixture(t);task('task');
  assert.equal(readNotifications(db,'owner',at('2026-10-21','06:59:59')).count,0);
  const morning=readNotifications(db,'owner',at('2026-10-21'));
  assert.equal(morning.count,1);assert.equal(morning.tasks[0].notification_date,'2026-10-21');
  db.prepare('UPDATE task_notifications SET read_at=? WHERE id=?').run(at('2026-10-21','08:00:00').toISOString(),morning.tasks[0].notification_id);
  assert.equal(readNotifications(db,'owner',at('2026-10-21','18:00:00')).count,0);
  assert.equal(readNotifications(db,'owner',at('2026-10-22','06:59:59')).count,0);
  const next=readNotifications(db,'owner',at('2026-10-22'));
  assert.equal(next.count,1);assert.notEqual(next.tasks[0].notification_id,morning.tasks[0].notification_id);
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM notification_batches WHERE user_id=?').get('owner')!.total,2);
});
test('daily snapshot catches up after downtime, deduplicates yesterday, and waits until tomorrow for newly added tasks',t=>{
  const {db,task}=fixture(t);task('first');task('private','2026-10-21','other');
  assert.equal(readNotifications(db,'owner',at('2026-10-21','12:30:00')).count,1);
  task('added after snapshot');
  assert.equal(readNotifications(db,'owner',at('2026-10-21','23:00:00')).count,1);
  const tomorrow=readNotifications(db,'owner',at('2026-10-22'));
  assert.equal(tomorrow.count,2);
  assert.ok(tomorrow.tasks.every(task=>task.notification_date==='2026-10-22'));
  db.prepare("UPDATE tasks SET status='completed' WHERE id='first'").run();
  assert.equal(readNotifications(db,'owner',at('2026-10-22','08:00:00')).count,1);
});
test('read state survives database reopen',t=>{
  const folder=mkdtempSync(join(tmpdir(),'taskflow-notification-'));const path=join(folder,'db.sqlite');
  t.after(()=>rmSync(folder,{recursive:true,force:true}));
  let db=openDatabase(path);
  db.prepare("INSERT INTO users(id,name,email,password_hash,created_at) VALUES('owner','Owner','owner@example.com','hash','2026-01-01')").run();
  db.prepare("INSERT INTO tasks(id,user_id,title,priority,status,due_date,created_at,updated_at) VALUES('first','owner','First','high','pending','2026-10-21','2026-01-01','2026-01-01')").run();
  const notification=readNotifications(db,'owner',at('2026-10-21')).tasks[0];
  db.prepare('UPDATE task_notifications SET read_at=? WHERE id=?').run('2026-10-21',notification.notification_id);
  db.close();db=openDatabase(path);
  try {assert.equal(readNotifications(db,'owner',at('2026-10-21','09:00:00')).count,0);}
  finally {db.close();}
});
test('notification read APIs require a session, scope ownership, and preserve task status',async t=>{
  const db=openDatabase(':memory:');t.after(()=>db.close());
  const app=createApp(db,{secret:'notification-test-secret-at-least-32-characters',origins:['http://localhost:5173'],silent:true});
  const register=async(email:string)=>{
    const response=await app.request('/api/auth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Owner',email,password:'Account-2026!'})});
    return {cookie:response.headers.get('set-cookie')!.split(';')[0],user:(await response.json()).user};
  };
  const owner=await register('owner@example.com'),other=await register('other@example.com');
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  db.prepare("INSERT INTO tasks(id,user_id,title,priority,status,due_date,created_at,updated_at) VALUES('task',?,'Task','high','pending',?,'2026-01-01','2026-01-01')").run(owner.user.id,date);
  const notification=readNotifications(db,owner.user.id,at(date)).tasks[0];
  const path=`/api/notifications/${notification.notification_id}/read`;
  assert.equal((await app.request(path,{method:'PATCH'})).status,401);
  assert.equal((await app.request(path,{method:'PATCH',headers:{cookie:other.cookie}})).status,404);
  assert.equal((await app.request(path,{method:'PATCH',headers:{cookie:owner.cookie,origin:'https://evil.example'}})).status,403);
  assert.equal((await app.request(path,{method:'PATCH',headers:{cookie:owner.cookie}})).status,204);
  assert.equal((await app.request(path,{method:'PATCH',headers:{cookie:owner.cookie}})).status,204);
  assert.equal((await (await app.request('/api/notifications',{headers:{cookie:owner.cookie}})).json()).count,0);
  assert.equal(db.prepare("SELECT status FROM tasks WHERE id='task'").get()!.status,'pending');
  assert.equal((await app.request('/api/notifications/read-all',{method:'POST'})).status,401);
  assert.equal((await app.request('/api/notifications/read-all',{method:'POST',headers:{cookie:owner.cookie}})).status,204);
});
