import nodemailer, { type Transporter } from 'nodemailer';
import { z } from 'zod';
import type { PasswordResetConfig } from './context.ts';

export interface ResetEmailService extends PasswordResetConfig { verify: () => Promise<void> }

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
      const safeUrl = resetUrl.replace(/[&<>"']/g, value => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[value]!);
      const result = await transport.sendMail({
        from, to, subject: 'ตั้งรหัสผ่านใหม่สำหรับ TaskFlow',
        text: `คุณได้รับอีเมลนี้เพราะมีการขอตั้งรหัสผ่านใหม่สำหรับบัญชี TaskFlow ของคุณ\n\nเปิดลิงก์นี้เพื่อตั้งรหัสผ่านใหม่:\n${resetUrl}\n\nลิงก์มีอายุ ${expiresMinutes} นาที และใช้ได้ครั้งเดียว\nหากคุณไม่ได้เป็นผู้ขอ ไม่ต้องดำเนินการใด ๆ รหัสผ่านของคุณจะยังไม่เปลี่ยน\nอย่าส่งต่อลิงก์นี้ให้ผู้อื่น`,
        html: `<div lang="th" style="font-family:Tahoma,sans-serif;line-height:1.8;color:#111b26;max-width:560px;margin:auto;padding:28px"><h1 style="color:#08786f;font-size:26px">TaskFlow</h1><h2 style="font-size:22px">ตั้งรหัสผ่านใหม่</h2><p>มีการขอตั้งรหัสผ่านใหม่สำหรับบัญชีของคุณ</p><p><a href="${safeUrl}" style="display:inline-block;background:#08786f;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none">ตั้งรหัสผ่านใหม่</a></p><p>ลิงก์มีอายุ <strong>${expiresMinutes} นาที</strong> และใช้ได้ครั้งเดียว</p><p>หากกดปุ่มไม่ได้ ให้คัดลอกลิงก์นี้ไปเปิดในเบราว์เซอร์:</p><p style="overflow-wrap:anywhere">${safeUrl}</p><p style="color:#637182">หากคุณไม่ได้เป็นผู้ขอ ไม่ต้องดำเนินการใด ๆ รหัสผ่านของคุณจะยังไม่เปลี่ยน และอย่าส่งต่อลิงก์นี้ให้ผู้อื่น</p></div>`,
        disableFileAccess: true, disableUrlAccess: true,
      });
      if (!result.accepted?.length) throw new Error('SMTP_RECIPIENT_REJECTED');
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
