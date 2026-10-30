import {randomUUID} from 'node:crypto';
import type {Database} from './db.ts';
import {all,now,transaction} from './context.ts';
import type {TaskReminderMail} from './mail.ts';

type Recipient={id:string;name:string;nickname:string;email:string};
type DueTask={id:string;title:string;due_date:string;priority:string};
const bangkokDate=(at:Date)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(at);
const bangkokHour=(at:Date)=>Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Bangkok',hour:'2-digit',hourCycle:'h23'}).format(at));

export async function sendDailyReminders(db:Database,send:(mail:TaskReminderMail)=>Promise<void>,at=new Date(),skip:(userId:string)=>boolean=()=>false){
  if(bangkokHour(at)<7)return {sent:0,failed:0,tasks:0,failedUsers:[] as string[]};
  const date=bangkokDate(at);
  const recipients=await all<Recipient>(db,"SELECT id,name,nickname,email FROM users WHERE email_verified_at IS NOT NULL AND email!='demo@taskflow.local' AND NOT EXISTS (SELECT 1 FROM email_reminder_batches b WHERE b.user_id=users.id AND b.reminder_date=?) AND EXISTS (SELECT 1 FROM tasks t WHERE t.user_id=users.id AND t.status!='completed' AND t.due_date<=? AND NOT EXISTS (SELECT 1 FROM reminder_deliveries d WHERE d.user_id=users.id AND d.task_id=t.id AND d.notification_date=? AND d.channel='email')) ORDER BY id",date,date,date);
  let sent=0,failed=0,tasks=0;const failedUsers:string[]=[];
  for(const user of recipients){
    if(skip(user.id))continue;
    const due=await all<DueTask>(db,"SELECT id,title,due_date,priority FROM tasks t WHERE t.user_id=? AND t.status!='completed' AND t.due_date<=? AND NOT EXISTS (SELECT 1 FROM reminder_deliveries d WHERE d.user_id=t.user_id AND d.task_id=t.id AND d.notification_date=? AND d.channel='email') ORDER BY t.due_date,CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,t.id",user.id,date,date);
    if(!due.length)continue;
    try{
      await send({to:user.email,name:user.nickname||user.name,date,tasks:due});
      await transaction(db,async ()=>{
        await db.prepare('INSERT OR IGNORE INTO email_reminder_batches(user_id,reminder_date,sent_at) VALUES(?,?,?)').run(user.id,date,now());
        for(const task of due)await db.prepare('INSERT OR IGNORE INTO reminder_deliveries(id,user_id,task_id,notification_date,channel,created_at) VALUES(?,?,?,?,?,?)').run(randomUUID(),user.id,task.id,date,'email',now());
      });
      sent++;tasks+=due.length;
    }catch{failed++;failedUsers.push(user.id);}
  }
  return {sent,failed,tasks,failedUsers};
}

export function startDailyReminderScheduler(db:Database,send:(mail:TaskReminderMail)=>Promise<void>){
  let stopped=false,running:Promise<void>|null=null;const cooldown=new Map<string,number>();
  async function run(){
    try{
      const result=await sendDailyReminders(db,send,new Date(),userId=>(cooldown.get(userId)??0)>Date.now());
      for(const userId of result.failedUsers)cooldown.set(userId,Date.now()+15*60_000);
      if(result.sent||result.failed)console.log(JSON.stringify({event:'daily_email_reminders',sent:result.sent,failed:result.failed,tasks:result.tasks}));
    }catch{console.error(JSON.stringify({event:'daily_email_reminders_failed'}));}
  }
  function tick(){if(stopped||running)return;running=run().finally(()=>{running=null;});}
  tick();const timer=setInterval(tick,60_000);timer.unref();
  return async()=>{stopped=true;clearInterval(timer);await running;};
}
