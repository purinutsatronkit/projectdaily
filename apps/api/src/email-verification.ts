import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {Hono} from 'hono';
import {z} from 'zod';
import {ApiError,get,now,parseBody,transaction,type Config,type Env} from './context.ts';
import {sessionMiddleware} from './auth.ts';
import {trustedPublicUrl} from './mail.ts';
import type {Database} from './db.ts';

const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
export function queueVerification(db:Database,config:Config,userId:string,email:string){
  const mail=config.passwordReset;
  if(!mail?.sendVerification)throw new ApiError(503,'SMTP_NOT_CONFIGURED','ต้องตั้งค่า SMTP ก่อนยืนยันอีเมล');
  const recent=get<{total:number;latest:string|null}>(db,'SELECT COUNT(*) total,MAX(CASE WHEN email=? THEN created_at END) latest FROM email_verifications WHERE user_id=? AND created_at>?',email,userId,new Date(Date.now()-3600000).toISOString());
  if((recent?.total??0)>=3||(recent?.latest&&Date.now()-Date.parse(recent.latest)<60000))throw new ApiError(429,'EMAIL_COOLDOWN','กรุณารออย่างน้อย 1 นาที ก่อนขอลิงก์อีกครั้ง');
  const token=randomBytes(32).toString('hex'),id=randomUUID(),timestamp=now();
  db.prepare('UPDATE email_verifications SET used_at=? WHERE user_id=? AND email=? AND used_at IS NULL').run(timestamp,userId,email);
  db.prepare('INSERT INTO email_verifications VALUES(?,?,?,?,?,NULL,?)').run(id,userId,email,digest(token),new Date(Date.now()+15*60000).toISOString(),timestamp);
  const link=new URL('/verify-email',trustedPublicUrl(mail.publicUrl,!!config.production));link.hash=new URLSearchParams({token}).toString();
  setImmediate(()=>{void mail.sendVerification!({to:email,verifyUrl:link.toString()}).catch(()=>{db.prepare('DELETE FROM email_verifications WHERE id=? AND used_at IS NULL').run(id);if(!config.silent)console.error(JSON.stringify({level:'error',event:'verification_email_failed'}));});});
}
export function verificationRoutes(db:Database,config:Config){
  const routes=new Hono<Env>(),session=sessionMiddleware(db,config);
  routes.post('/request-email-verification',session,async c=>{
    await parseBody(c,z.object({}));const userId=c.get('user').id;
    const user=get<{email:string;email_verified_at:string|null}>(db,'SELECT email,email_verified_at FROM users WHERE id=?',userId)!;
    if(user.email_verified_at)return c.json({message:'อีเมลนี้ได้รับการยืนยันแล้ว'});
    queueVerification(db,config,userId,user.email);return c.json({message:'ส่งลิงก์ยืนยันแล้ว กรุณาตรวจอีเมลภายใน 15 นาที'},202);
  });
  routes.post('/verify-email',async c=>{
    const {token}=await parseBody(c,z.object({token:z.string().regex(/^[a-f0-9]{64}$/i)}));
    const record=get<{id:string;user_id:string;email:string;expires_at:string;used_at:string|null}>(db,'SELECT id,user_id,email,expires_at,used_at FROM email_verifications WHERE token_hash=?',digest(token.toLowerCase()));
    if(!record||record.used_at||record.expires_at<=now())throw new ApiError(400,'INVALID_VERIFICATION','ลิงก์หมดอายุหรือถูกใช้แล้ว');
    try{transaction(db,()=>{
      const claimed=db.prepare('UPDATE email_verifications SET used_at=? WHERE id=? AND used_at IS NULL AND expires_at>?').run(now(),record.id,now());
      if(!claimed.changes)throw new ApiError(400,'INVALID_VERIFICATION','ลิงก์หมดอายุหรือถูกใช้แล้ว');
      db.prepare('UPDATE users SET email=?,email_verified_at=? WHERE id=?').run(record.email,now(),record.user_id);
      db.prepare('DELETE FROM password_reset_tokens WHERE user_id=?').run(record.user_id);
      db.prepare('DELETE FROM email_verifications WHERE user_id=? AND id!=?').run(record.user_id,record.id);
    });}catch(error){if(String(error).includes('UNIQUE constraint'))throw new ApiError(409,'EMAIL_EXISTS','อีเมลนี้มีบัญชีอยู่แล้ว');throw error;}
    return c.json({message:'ยืนยันอีเมลสำเร็จแล้ว'});
  });
  return routes;
}
