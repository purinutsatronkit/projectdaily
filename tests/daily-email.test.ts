import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../apps/api/src/db.ts';
import {sendDailyReminders} from '../apps/api/src/daily-email.ts';
import {createResetEmailService,type TaskReminderMail} from '../apps/api/src/mail.ts';
import {createApp} from '../apps/api/src/app.ts';

const at=new Date('2026-10-28T00:01:00Z'); // 07:01 Asia/Bangkok
function fixture(t:import('node:test').TestContext){
  const db=openDatabase(':memory:');t.after(()=>db.close());
  function user(id:string,verified:boolean){db.prepare('INSERT INTO users(id,name,email,password_hash,created_at,email_verified_at) VALUES(?,?,?,?,?,?)').run(id,id,`${id}@example.test`,'unused',at.toISOString(),verified?at.toISOString():null);}
  function task(id:string,owner:string,due:string,status='pending'){db.prepare('INSERT INTO tasks(id,user_id,title,description,priority,status,due_date,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id,owner,`Task ${id}`,'','high',status,due,at.toISOString(),at.toISOString());}
  return {db,user,task};
}
test('daily email sends one summary after 07:00 only to verified accounts, then records each task',async t=>{
  const f=fixture(t),sent:TaskReminderMail[]=[];
  f.user('verified',true);f.user('unverified',false);
  f.task('overdue','verified','2026-10-27');f.task('today','verified','2026-10-28');f.task('future','verified','2026-10-29');f.task('done','verified','2026-10-27','completed');f.task('private','unverified','2026-10-28');
  const send=async(mail:TaskReminderMail)=>{sent.push(mail);};
  assert.equal((await sendDailyReminders(f.db,send,new Date('2026-10-27T23:59:00Z'))).sent,0);
  const first=await sendDailyReminders(f.db,send,at);
  assert.deepEqual({sent:first.sent,tasks:first.tasks,failed:first.failed},{sent:1,tasks:2,failed:0});
  assert.equal(sent[0].to,'verified@example.test');assert.deepEqual(sent[0].tasks.map(task=>task.title),['Task overdue','Task today']);
  assert.equal((await sendDailyReminders(f.db,send,at)).sent,0);
  f.task('added-later','verified','2026-10-28');
  assert.equal((await sendDailyReminders(f.db,send,at)).sent,0);
  assert.equal(f.db.prepare("SELECT COUNT(*) total FROM reminder_deliveries WHERE notification_date='2026-10-28'").get()!.total,2);
  assert.equal((await sendDailyReminders(f.db,send,new Date('2026-10-29T00:01:00Z'))).sent,1);
});
test('failed SMTP delivery leaves tasks eligible for retry and does not mark them sent',async t=>{
  const f=fixture(t);f.user('owner',true);f.task('task','owner','2026-10-28');
  const failure=await sendDailyReminders(f.db,async()=>{throw new Error('SMTP failed');},at);
  assert.equal(failure.failed,1);assert.equal(f.db.prepare('SELECT COUNT(*) total FROM reminder_deliveries').get()!.total,0);
  assert.equal((await sendDailyReminders(f.db,async()=>{},at)).sent,1);
});
test('task reminder mail uses the configured SMTP sender',async()=>{
  let message:{from?:unknown;to?:unknown;subject?:unknown;text?:unknown}|null=null;
  const transport={verify:async()=>true,sendMail:async(mail:typeof message)=>{message=mail;return {accepted:['owner@example.test']};}};
  const service=createResetEmailService(transport as never,'https://tasks.example.test',{name:'TaskFlow',address:'sender@example.test'});
  await service.sendTaskReminder({to:'owner@example.test',name:'Owner',date:'2026-10-28',tasks:[{title:'Send report',due_date:'2026-10-28',priority:'high'}]});
  assert.equal(message?.to,'owner@example.test');assert.match(String(message?.text),/Send report/);assert.match(String(message?.text),/https:\/\/tasks.example.test/);
});
test('reminder status is private and turns ready only after email verification',async t=>{
  const f=fixture(t);
  const mail={publicUrl:'http://localhost:5173',send:async()=>{},sendVerification:async()=>{},sendTaskReminder:async()=>{}};
  const app=createApp(f.db,{secret:'daily-email-test-secret-at-least-32-chars',origins:['http://localhost:5173'],silent:true,passwordReset:mail});
  assert.equal((await app.request('/api/reminders/settings')).status,401);
  const registered=await app.request('/api/auth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Test User',email:'owner@example.test',password:'Test!2026'})});
  const cookie=registered.headers.get('set-cookie')!.split(';')[0];
  const settings=async()=>app.request('/api/reminders/settings',{headers:{cookie}}).then(response=>response.json() as Promise<{available:boolean;verified:boolean}>);
  assert.deepEqual(await settings(),{available:true,verified:false,schedule:'07:00 Asia/Bangkok'});
  f.db.prepare('UPDATE users SET email_verified_at=? WHERE email=?').run(at.toISOString(),'owner@example.test');
  assert.equal((await settings()).verified,true);
});
