# TaskFlow

เว็บจัดการงานส่วนตัวขนาดเล็กสำหรับเรียนรู้ **React + Tailwind + Hono + SQL** ใน monorepo พร้อม JWT login และ API key สำหรับ n8n

โทนขาวเทา เขียวอมฟ้า และทองอ่อนอ้างอิงภาพที่ผู้ใช้ให้มา เนื้อหาและชื่อระบบเป็น TaskFlow

## เริ่มใช้งาน

ต้องมี Node.js **22.13 ขึ้นไป** แนะนำ Node.js รุ่น LTS ที่ยังได้รับการสนับสนุน ใช้ SQLite ที่มาพร้อม Node จึงไม่ต้องติดตั้งฐานข้อมูลแยก

```powershell
npm install
npm run setup
npm run db:seed
npm run dev
```

เปิด **http://localhost:5173** สำหรับเว็บ และ **http://localhost:3000/api/health** สำหรับตรวจ API

- บัญชีเดโม: `demo@taskflow.local`
- รหัสผ่านเดโม: `TaskFlow!2026`
- สมัครบัญชีใหม่ได้ รหัสผ่านอย่างน้อย 12 ตัวอักษร
- `npm run setup` สร้าง `.env` และ JWT secret แบบสุ่มครั้งแรก โดยไม่ทับไฟล์เดิม
- `npm run db:seed` สร้างข้อมูลตัวอย่างครั้งแรก โดยไม่ลบงานเดิม
- ฐานข้อมูลจริงอยู่ที่ `data/taskflow.sqlite` และไม่เข้า Git
- บัญชีเดโมใช้เรียนรู้ในเครื่องเท่านั้น หากต้องส่งอีเมลจริง ให้สมัครด้วยอีเมลที่รับข้อความได้

## สิ่งที่ทำได้

เพิ่ม แก้ไข ลบงาน กำหนดวันส่งและความสำคัญ เปลี่ยนสถานะเป็นยังไม่เริ่ม/กำลังทำ/เสร็จแล้ว ค้นหาและกรองงาน ดูสรุปงานและงานเลยกำหนด แต่ละบัญชีเห็นเฉพาะงานของตนเอง

สร้าง API key สำหรับ n8n คัดลอกได้ครั้งเดียว ดูวันหมดอายุ ยกเลิก key และดูประวัติแจ้งเตือนได้ n8n เป็นส่วนเสริม เว็บใช้งานได้โดยไม่ต้องเปิด n8n

ลืมรหัสผ่านได้จากหน้า login เมื่อกำหนด Gmail SMTP แล้ว ระบบส่งลิงก์อายุ 15 นาที ใช้ได้ครั้งเดียว ตั้งรหัสใหม่ 12–128 ตัวอักษรและเพิกถอน session เดิมทั้งหมด ฟีเจอร์นี้ส่งจาก backend โดยตรง ไม่ต้องเปิด n8n

## ตั้งค่าอีเมลลืมรหัสผ่าน

```powershell
npm run setup:email
```

คำสั่งเติมตัวแปรอีเมลที่ขาดใน `.env` โดยไม่ทับค่าที่มีอยู่ ให้ใส่ `SMTP_USER` เป็น Gmail ผู้ส่ง และ `SMTP_PASS` เป็น **Google App Password** ของบัญชีนั้น ใช้ค่าเริ่มต้น `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_SECURE=true` พร้อม `APP_PUBLIC_URL=http://localhost:5173` สำหรับ dev หากใช้ `npm start` หลัง build ให้เปลี่ยน URL เป็น `http://localhost:3000` หรือ domain HTTPS จริง แล้วเปิด server ใหม่

ตรวจ SMTP login แบบไม่ส่งเมลด้วย `npm run mail:check` จากนั้นทดลองจากปุ่ม **ลืมรหัสผ่าน?** ด้วยบัญชีที่สมัครด้วยอีเมลรับจริง บัญชีเดโม `.local` รับอีเมลไม่ได้ การส่งผ่าน Gmail จริงต้องตั้ง credential ของคุณก่อน อ่านวิธีเปิด 2-Step Verification สร้าง App Password และแก้ปัญหาใน [คู่มือ Gmail SMTP และลืมรหัสผ่าน](docs/password-reset-gmail.md) อย่าใส่รหัสผ่าน Gmail ปกติหรือส่ง secret ในแชต

## โครงสร้าง

```text
apps/
  web/                  React + Tailwind + Vite
  api/src/
    app.ts              ประกอบ routes และ middleware
    auth.ts             สมัคร/เข้า/ออกจากระบบ ตรวจ JWT และ session
    password-reset.ts   ขอลิงก์และตั้งรหัสผ่านใหม่แบบใช้ครั้งเดียว
    mail.ts             ส่งอีเมล reset ผ่าน SMTP และสร้าง URL ที่ตั้งไว้
    tasks.ts            CRUD และสรุปงาน
    integrations.ts     API key, due tasks และประวัติแจ้งเตือน
    security.ts         scrypt, JWT, SHA-256
    db.ts / schema.sql  เปิด SQLite และสร้าง schema รุ่นแรก
packages/shared/src/    Zod schemas และ TypeScript types ที่ใช้ร่วมกัน
n8n/                    Workflow ที่ import ได้ และ Docker Compose ทางเลือก
docs/                   คู่มือ API, อ่านโค้ด, ศึกษาวิดีโอ และสคริปต์พรีเซนต์
presentation/           สไลด์ภาษาไทย
tests/                  ตรวจ API ด้วย Hono และ SQLite จริงใน memory
```

## คำสั่งสำคัญ

```powershell
npm run typecheck
npm test
node n8n/validate-workflow.mjs
npm run build
npm start
```

หลัง build แล้ว `npm start` ให้ Hono เสิร์ฟทั้ง frontend และ API ที่ **http://localhost:3000** เหมาะกับการเดโมโดยเปิด server เดียว ค่าพัฒนาอนุญาต Origin ทั้ง 5173 และ 3000

## เอกสารสำหรับเรียนและพรีเซนต์

- [สไลด์ล่าสุด 24 หน้า รวมระบบลืมรหัสผ่าน](presentation/output/TaskFlow-Code-Review-Updated-2026-10-14.pptx) พร้อมคำอธิบายและคำถามใน Speaker Notes
- [ไล่อ่านโค้ดทีละขั้น](docs/code-walkthrough.md)
- [API พร้อมตัวอย่าง](docs/api.md)
- [สรุปวิดีโอและแหล่งข้อมูล](docs/video-study.md)
- [ตั้งค่า n8n](docs/n8n-setup.md)
- [ลืมรหัสผ่านและตั้งค่า Gmail SMTP](docs/password-reset-gmail.md)
- [คู่มือพรีเซนต์และคำถาม code review](docs/presentation-guide.md)
- [คำศัพท์และหน้าที่ของแต่ละเครื่องมือ](docs/glossary.md)

## ขอบเขตและข้อจำกัด

นี่เป็นโปรเจกต์เรียนรู้ที่มีการตรวจสิทธิ์และทดสอบพฤติกรรมสำคัญ ไม่ได้อ้างว่าติดตั้งแล้วพร้อมรับระบบจริงทุกขนาด

- JWT มีอายุ 30 นาที ต้อง login ใหม่เมื่อหมดอายุ ไม่มี refresh token
- Password reset ต้องตั้ง SMTP ก่อน ลิงก์มีอายุ 15 นาที การส่งทำงานแบบ async ใน process เดียว ไม่มี durable queue หาก server หยุดระหว่างรอส่งอาจต้องขอลิงก์ใหม่
- SMTP ยอมรับข้อความไม่ยืนยันว่าเข้า inbox และระบบยังไม่มี email verification ตอนสมัคร
- JWT ใน HttpOnly cookie ป้องกัน JavaScript อ่าน token โดยตรง แต่ไม่ได้กำจัดความเสี่ยงจาก XSS ทั้งหมด
- API key มีอายุ 30 วัน และใช้เฉพาะ API สำหรับ reminders ของผู้สร้าง key
- Auth rate limiter เก็บใน memory ของ server เดียว รีสตาร์ทแล้วนับใหม่ จึงไม่เหมาะกับหลาย instance โดยตรง
- SQLite เหมาะกับเดโมและระบบขนาดเล็ก รุ่นนี้ไม่มีระบบ migration สำหรับ schema รุ่นต่อไป
- API รายการงานไม่มี pagination เหมาะกับข้อมูลจำนวนน้อย
- due tasks คืนได้สูงสุด 100 งานต่อครั้ง และประวัติแจ้งเตือนแสดง 100 รายการล่าสุด
- ประวัติแจ้งเตือนหมายถึง n8n รายงานว่า SMTP รับแล้ว ไม่ได้ยืนยันว่าอีเมลถึงกล่องผู้รับ
- การส่งอีเมลและบันทึกประวัติไม่ใช่ transaction เดียวกัน จึงยังมีโอกาสส่งซ้ำหากบันทึกล้มเหลวหลังส่ง หรือรัน workflow พร้อมกัน
- Workflow เตรียมไว้ให้ import แต่ต้องตั้ง API key และ SMTP เอง ไม่มี credential จริงอยู่ในไฟล์
- คลิป API/Auth ศึกษาจากคำบรรยายอังกฤษอัตโนมัติครบทั้งคลิปและ repo ผู้สอน ส่วนคลิป Monorepo ใช้หน้าอธิบาย รายการบท และ repo ผู้สอน เพราะไม่มี transcript ให้ดึง ดูรายละเอียดที่ `docs/video-study.md`

ก่อนใช้งานจริงควรจัด HTTPS, `NODE_ENV=production`, `APP_ORIGIN=https://...`, ปิดบัญชีเดโม, จัด secrets และสำรองฐานข้อมูล ทดสอบกู้คืน เพิ่ม monitoring และ migration รวมทั้งประเมิน password hashing/rate limiting ตามสภาพแวดล้อมจริง

ค่า HOST เริ่มต้นคือ `127.0.0.1` ถ้า n8n อยู่ใน Docker ให้ดูวิธีเชื่อมเครือข่ายในคู่มือ n8n ก่อนเปลี่ยน HOST
