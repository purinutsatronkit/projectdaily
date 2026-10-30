import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { openDatabase } from './db.ts';
import { hashPassword } from './security.ts';
import { bangkokDate, now, transaction } from './context.ts';
const root = fileURLToPath(new URL('../../../',import.meta.url));
if (process.env.NODE_ENV === 'production') throw new Error('Demo seed is disabled in production.');
const db = openDatabase(resolve(root,process.env.DATABASE_PATH ?? './data/taskflow.sqlite'));
const email = 'demo@taskflow.local';
if (!await db.prepare('SELECT id FROM users WHERE email=?').get(email)) {
  const userId = randomUUID(), hash = await hashPassword('TaskFlow!2026');
  const today = bangkokDate();
  const shiftDate = (days: number) => { const date = new Date(today+'T00:00:00Z'); date.setUTCDate(date.getUTCDate()+days); return date.toISOString().slice(0,10); };
  await transaction(db,async () => {
    await db.prepare('INSERT INTO users(id,name,email,password_hash,created_at) VALUES(?,?,?,?,?)').run(userId,'นที',email,hash,now());
    const tasks = [
      ['เตรียมสไลด์สำหรับ code review','อธิบาย flow การเพิ่มงาน และเหตุผลที่ตรวจสิทธิ์ใน backend','high','in_progress',today],
      ['อ่านเรื่อง JWT และ API key','สรุปว่าแต่ละอย่างใช้ยืนยันใคร และมีสิทธิ์ทำอะไร','medium','pending',today],
      ['ทดลอง workflow แจ้งเตือนใน n8n','ตั้งค่า API key และ SMTP แล้วทดลองด้วยอีเมลของตัวเอง','medium','pending',shiftDate(1)],
      ['จัดระเบียบโน้ตการเรียน','แยกหัวข้อที่เข้าใจแล้วกับหัวข้อที่ต้องทบทวน','low','pending',shiftDate(-1)],
      ['วางโครงสร้าง monorepo','แยก web, api และ shared schema ให้แต่ละส่วนมีหน้าที่ชัดเจน','medium','completed',shiftDate(-2)]
    ];
    for (const [title,description,priority,status,date] of tasks) await db.prepare('INSERT INTO tasks(id,user_id,title,description,priority,status,due_date,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(randomUUID(),userId,title,description,priority,status,date,now(),now());
  });
  console.log('Demo account created: demo@taskflow.local / TaskFlow!2026 (local learning only).');
} else console.log('Demo account already exists; kept all existing data.');
db.close();
