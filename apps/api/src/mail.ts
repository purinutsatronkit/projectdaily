import nodemailer, { type Transporter } from 'nodemailer';
import { z } from 'zod';
import type { PasswordResetConfig } from './context.ts';

export interface TaskReminderMail {to:string;name:string;date:string;tasks:{title:string;due_date:string;priority:string}[]}
export interface ResetEmailService extends PasswordResetConfig { verify: () => Promise<void>; sendTaskReminder: (mail: TaskReminderMail) => Promise<void> }

const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]!));
const dateThai=(value:string)=>new Intl.DateTimeFormat('th-TH',{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Bangkok'}).format(new Date(`${value}T12:00:00+07:00`));
function emailFrame(preview:string,title:string,body:string){
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f7f2f0;color:#302b2d;font-family:Tahoma,Arial,sans-serif"><span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden">${escapeHtml(preview)}</span><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f7f2f0"><tr><td align="center" style="padding:30px 16px"><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;background:#ffffff;border:1px solid #eadfdd;border-radius:18px"><tr><td style="background:#a91f2e;padding:25px 32px;border-radius:18px 18px 0 0"><span style="color:#ffffff;font-size:23px;font-weight:700;letter-spacing:-.5px">TaskFlow</span><br><span style="color:#f9dadd;font-size:12px;letter-spacing:2px">MAKE ROOM FOR FOCUS</span></td></tr><tr><td style="padding:32px"><p style="margin:0 0 8px;color:#a91f2e;font-size:12px;font-weight:700;letter-spacing:1.5px">TASKFLOW NOTIFICATION</p><h1 style="margin:0 0 22px;color:#302b2d;font-size:25px;line-height:1.4">${escapeHtml(title)}</h1>${body}</td></tr><tr><td style="padding:20px 32px;border-top:1px solid #eee5e2;color:#83777a;font-size:12px;line-height:1.8">อีเมลนี้ส่งโดยระบบ TaskFlow<br>จัดงานให้ชัดเจนในทุกวัน</td></tr></table></td></tr></table></body></html>`;
}
function emailButton(label:string,url:string){return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:25px 0"><tr><td bgcolor="#a91f2e" style="border-radius:10px"><a href="${escapeHtml(url)}" style="display:inline-block;padding:13px 22px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none">${escapeHtml(label)}</a></td></tr></table>`;}
function emailLinkFallback(url:string){return `<p style="margin:20px 0 6px;color:#786d70;font-size:13px;line-height:1.7">หากปุ่มไม่ทำงาน คัดลอกลิงก์นี้ไปเปิดในเบราว์เซอร์</p><p style="margin:0;overflow-wrap:anywhere;word-break:break-all;color:#a91f2e;font-size:12px;line-height:1.7">${escapeHtml(url)}</p>`;}

export function trustedPublicUrl(value: string, production = false) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('APP_PUBLIC_URL must be a website origin such as http://localhost:5173 or https://tasks.example.com');
  }
  if (production && url.protocol !== 'https:') throw new Error('Production APP_PUBLIC_URL must use HTTPS.');
  return url.origin;
}

// A transport is injected so the same message can be tested against a local SMTP receiver.
export function createResetEmailService(transport: Transporter, publicUrl: string, from: { name: string; address: string }): ResetEmailService {
  return {
    publicUrl,
    verify: async () => { await transport.verify(); },
    send: async ({ to, resetUrl, expiresMinutes }) => {
      const result = await transport.sendMail({
        from, to, subject: 'ตั้งรหัสผ่านใหม่สำหรับ TaskFlow',
        text: `คุณได้รับอีเมลนี้เพราะมีการขอตั้งรหัสผ่านใหม่สำหรับบัญชี TaskFlow ของคุณ\n\nเปิดลิงก์นี้เพื่อตั้งรหัสผ่านใหม่:\n${resetUrl}\n\nลิงก์มีอายุ ${expiresMinutes} นาที และใช้ได้ครั้งเดียว\nหากคุณไม่ได้เป็นผู้ขอ ไม่ต้องดำเนินการใด ๆ รหัสผ่านของคุณจะยังไม่เปลี่ยน\nอย่าส่งต่อลิงก์นี้ให้ผู้อื่น`,
        html: emailFrame('ลิงก์ตั้งรหัสผ่านใหม่ใช้ได้ครั้งเดียวภายในเวลาที่กำหนด','ตั้งรหัสผ่านใหม่',`<p style="margin:0;color:#4e4548;font-size:15px;line-height:1.9">มีคำขอตั้งรหัสผ่านใหม่สำหรับบัญชี TaskFlow ของคุณ กดปุ่มด้านล่างเพื่อดำเนินการ</p>${emailButton('ตั้งรหัสผ่านใหม่',resetUrl)}<div style="padding:15px 18px;background:#fff6f0;border:1px solid #f3dfd4;border-radius:10px;color:#6c5150;font-size:13px;line-height:1.8">ลิงก์ใช้ได้ครั้งเดียวและหมดอายุใน <strong>${expiresMinutes} นาที</strong></div>${emailLinkFallback(resetUrl)}<p style="margin:24px 0 0;color:#786d70;font-size:13px;line-height:1.8">หากคุณไม่ได้ขอเปลี่ยนรหัสผ่าน ไม่ต้องดำเนินการใด ๆ และอย่าส่งต่อลิงก์นี้</p>`),
        disableFileAccess: true, disableUrlAccess: true,
      });
      if (!result.accepted?.length) throw new Error('SMTP_RECIPIENT_REJECTED');
    },
    sendVerification:async({to,verifyUrl})=>{
      const result=await transport.sendMail({from,to,subject:'ยืนยันอีเมลสำหรับ TaskFlow',text:`ยืนยันอีเมลสำหรับบัญชี TaskFlow\n\nเปิดลิงก์นี้ภายใน 15 นาที:\n${verifyUrl}\n\nหากคุณไม่ได้ขอยืนยันอีเมล ให้ละเว้นข้อความนี้`,html:emailFrame('ยืนยันอีเมลเพื่อเปิดใช้งานการแจ้งเตือนของ TaskFlow','ยืนยันอีเมลของคุณ',`<p style="margin:0;color:#4e4548;font-size:15px;line-height:1.9">กดปุ่มด้านล่างเพื่อยืนยันอีเมลสำหรับบัญชี TaskFlow และเปิดใช้งานการแจ้งเตือนทางอีเมล</p>${emailButton('ยืนยันอีเมล',verifyUrl)}<div style="padding:15px 18px;background:#fff6f0;border:1px solid #f3dfd4;border-radius:10px;color:#6c5150;font-size:13px;line-height:1.8">ลิงก์ยืนยันมีอายุ <strong>15 นาที</strong></div>${emailLinkFallback(verifyUrl)}<p style="margin:24px 0 0;color:#786d70;font-size:13px;line-height:1.8">หากคุณไม่ได้ขอยืนยันอีเมล สามารถละเว้นข้อความนี้ได้</p>`),disableFileAccess:true,disableUrlAccess:true});
      if(!result.accepted?.length)throw new Error('SMTP_RECIPIENT_REJECTED');
    },
    sendTaskReminder:async({to,name,date,tasks})=>{
      const labels:{[key:string]:string}={high:'สูง',medium:'ปกติ',low:'ต่ำ'};
      const lines=tasks.slice(0,100).map((task,index)=>`${index+1}. ${task.title} — กำหนดส่ง ${task.due_date} · ความสำคัญ${labels[task.priority]??'ปกติ'}`);
      const overflow=tasks.length>100?`\nและอีก ${tasks.length-100} งาน ดูทั้งหมดใน TaskFlow`:'';
      const rows=tasks.slice(0,100).map(task=>{const priority=labels[task.priority]??'ปกติ';const color=task.priority==='high'?'#a91f2e':task.priority==='low'?'#467a72':'#9a643e';return `<tr><td style="padding:14px 0;border-bottom:1px solid #eee5e2;vertical-align:top"><strong style="color:#302b2d;font-size:14px;line-height:1.7">${escapeHtml(task.title)}</strong><br><span style="color:#786d70;font-size:12px">กำหนดส่ง ${escapeHtml(dateThai(task.due_date))}</span></td><td align="right" style="padding:14px 0;border-bottom:1px solid #eee5e2;white-space:nowrap;vertical-align:top;color:${color};font-size:12px;font-weight:700">${priority}</td></tr>`;}).join('');
      const extra=tasks.length>100?`<p style="color:#786d70;font-size:13px">และอีก ${tasks.length-100} งาน ดูทั้งหมดใน TaskFlow</p>`:'';
      const result=await transport.sendMail({from,to,subject:`TaskFlow: งานที่ต้องทำ ${date}`,text:`สวัสดี ${name}\n\nงานที่ยังไม่เสร็จและครบกำหนดแล้ว ณ ${date} (${tasks.length} งาน)\n\n${lines.join('\n')}${overflow}\n\nเปิด TaskFlow เพื่อดูหรืออัปเดตงาน: ${publicUrl}\n\nอีเมลนี้ส่งอัตโนมัติหลังยืนยันอีเมลบัญชี TaskFlow`,html:emailFrame(`มีงานที่ต้องติดตาม ${tasks.length} งาน`,'งานที่ต้องติดตาม',`<p style="margin:0 0 10px;color:#4e4548;font-size:15px;line-height:1.9">สวัสดี ${escapeHtml(name)}<br>ณ วันที่ ${escapeHtml(dateThai(date))} คุณมีงานที่ยังไม่เสร็จและครบกำหนดแล้ว <strong>${tasks.length} งาน</strong></p><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:18px;border-top:2px solid #a91f2e">${rows}</table>${extra}${emailButton('เปิดรายการงาน',publicUrl)}<p style="margin:0;color:#786d70;font-size:12px;line-height:1.8">รายการนี้อ้างอิงสถานะงานใน TaskFlow ขณะส่งอีเมล</p>`),disableFileAccess:true,disableUrlAccess:true});
      if(!result.accepted?.length)throw new Error('SMTP_RECIPIENT_REJECTED');
    },
  };
}

export function resetEmailFromEnvironment(env: NodeJS.ProcessEnv = process.env): ResetEmailService | undefined {
  const user = env.SMTP_USER?.trim(), password = env.SMTP_PASS?.trim();
  if (!user || !password) return undefined;
  const address = env.SMTP_FROM?.trim() || user;
  if (!z.email().safeParse(user).success || !z.email().safeParse(address).success) throw new Error('SMTP_USER and SMTP_FROM must be email addresses.');
  const production = env.NODE_ENV === 'production';
  const publicUrl = trustedPublicUrl(env.APP_PUBLIC_URL || env.APP_ORIGIN || 'http://localhost:5173', production);
  const host = env.SMTP_HOST?.trim() || 'smtp.gmail.com';
  const port = Number(env.SMTP_PORT || 465);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SMTP_PORT is invalid.');
  if (env.SMTP_SECURE && !['true', 'false'].includes(env.SMTP_SECURE)) throw new Error('SMTP_SECURE must be true or false.');
  const secure = env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : port === 465;
  const transport = nodemailer.createTransport({
    host, port, secure, requireTLS: !secure,
    auth: { user, pass: host === 'smtp.gmail.com' ? password.replace(/\s/g, '') : password },
    connectionTimeout: 15_000, greetingTimeout: 10_000, socketTimeout: 20_000,
    logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true,
  });
  return createResetEmailService(transport, publicUrl, { name: env.SMTP_FROM_NAME?.trim() || 'TaskFlow', address });
}
