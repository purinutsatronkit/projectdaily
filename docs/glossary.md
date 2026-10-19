# คำศัพท์ TaskFlow: ใช้ทำอะไร และควรตอบให้ได้ว่าอะไร

ใช้ตารางนี้เป็นโน้ตซ้อมพรีเซนต์ ไม่ต้องย้ายทุกแถวลงสไลด์ เลือกอธิบายคำที่อยู่บน diagram หรือโค้ดที่กำลังแสดง

| คำศัพท์ | ความหมายแบบเข้าใจง่าย | ใช้ตรงไหนใน TaskFlow | คำถามหัวใจที่ควรตอบได้ |
| --- | --- | --- | --- |
| Frontend / React | ส่วนที่ผู้ใช้เห็นและกด; React แบ่ง UI เป็น components และใช้ state เก็บสถานะหน้าจอ | ฟอร์ม login/task, รายการ, filters, loading/error ใน `App.tsx` | “UI แสดงข้อมูล แต่ผู้ตัดสินสิทธิ์อยู่ที่ใด?” — Backend |
| Backend / Hono | Server รับ HTTP request แล้วเลือกโค้ดตาม method/path | `app.ts` ประกอบ routes; `auth.ts`, `tasks.ts`, `integrations.ts` ทำงานตามเรื่อง | “กดเพิ่มงานแล้วอะไรตรวจและบันทึก?” — API |
| API / HTTP / CRUD | API คือช่องทางเรียกความสามารถของระบบผ่าน request; CRUD คือเพิ่ม อ่าน แก้ ลบ | GET/POST/PATCH/DELETE `/api/tasks` | “Method และ URL บอกการกระทำใด?” |
| Middleware | โค้ดกลางที่ทำก่อน/หลัง handler และส่งต่อด้วย `next()` | Request ID, body limit, Origin check, authentication | “Request ต้องผ่านด่านใดก่อนถึง SQL?” |
| Authentication | พิสูจน์ว่าใครเป็นผู้เรียก | ตรวจ JWT/session ของ browser หรือ key ของ n8n | “ผู้เรียกคนนี้เป็นใคร?” |
| Authorization / Ownership | ตัดสินว่าผู้เรียกทำสิ่งนั้นได้หรือไม่; ownership คือเจ้าของข้อมูล | `WHERE id=? AND user_id=?`; integration จำกัดเจ้าของ key | “Login แล้วแก้งานคนอื่นได้ไหม?” — ไม่ได้ |
| JWT / Claims | Token บรรจุข้อมูลยืนยัน เช่น `sub`, `sid`, `exp`; แบบ signed มีลายเซ็นตรวจการแก้ไข | `security.ts` ใช้ jose ออก/ตรวจ JWT 30 นาที | “Payload เป็นความลับหรือไม่?” — แบบ signed นี้อ่านได้ |
| Signature / Verify | Signature ผูกข้อมูลกับ signing key; verify ตรวจลายเซ็นและ policy ก่อนเชื่อข้อมูล | HS256, issuer, audience, expiration | “Decode แล้วเชื่อได้ไหม?” — ยังไม่ได้ ต้อง verify |
| Session / Revocation | ช่วงการเข้าสู่ระบบที่ backend ยอมรับ; revocation คือยกเลิกก่อนหมดอายุ | `auth_sessions`, `revoked_at`; logout เพิกถอนแล้วลบ cookie | “Token ที่คัดลอกก่อน logout ใช้ต่อได้ไหม?” — ไม่ผ่าน session check |
| Cookie / HttpOnly / SameSite / Secure | Browser เก็บและส่ง cookie ตามเงื่อนไข; HttpOnly กัน JavaScript อ่านโดยตรง; SameSite จำกัดการส่งข้าม site; Secure ใช้กับ HTTPS | `taskflow_session` ใน browser | “Cookie ถูกส่งอัตโนมัติแล้วต้องตรวจอะไรเพิ่ม?” — สิทธิ์และต้นทางของ mutation |
| CSRF / Origin | CSRF คือเว็บอื่นพยายามให้ browser ส่ง request ด้วยตัวตนผู้ใช้; Origin ระบุ scheme/host/port ต้นทาง | ตรวจ Origin และ `sec-fetch-site` พร้อม SameSite=Lax | “HttpOnly เพียงอย่างเดียวกัน CSRF ไหม?” — ไม่ใช่ |
| Password Hash / scrypt / Salt | เก็บผลการคำนวณแทน password; scrypt เพิ่มต้นทุนการเดา; salt สุ่มต่อบัญชี | `hashPassword()` และ `checkPassword()` | “Password เหมือนกันทำไม hash ต่างกัน?” — ใช้ salt ต่างกัน |
| API Key / Scope | Secret สำหรับ integration; scope กำหนดกลุ่มความสามารถที่ key ใช้ได้ | Key ของผู้ใช้ scope `reminders`, อายุ 30 วัน, เพิกถอนได้ | “Key เรียก CRUD ของเว็บได้ไหม?” — ไม่ได้ |
| SHA-256 Digest / Key Prefix | Digest คือผล hash ของ key สุ่มสำหรับ lookup; prefix คือส่วนต้นไว้ระบุชื่อ key โดยไม่คืน secret เต็ม | `api_keys.secret_hash`, `prefix`; secret แสดงตอนสร้างครั้งเดียว | “ทำไมใช้ hash เร็วกับ key ได้?” — Key สุ่ม entropy สูง ต่างจาก password คนตั้ง |
| SQL / SQLite / Schema | SQL เป็นภาษาจัดการข้อมูลสัมพันธ์; SQLite เก็บฐานข้อมูลเป็นไฟล์; schema กำหนดตาราง/คอลัมน์/ข้อกำหนด | users, auth_sessions, tasks, api_keys, reminder_deliveries | “ข้อมูลหายเมื่อ restart ไหม?” — ไม่ ถ้าเก็บไฟล์ฐานข้อมูลเดิม |
| Prepared Statement / Parameter | เตรียมโครงสร้าง SQL แล้ว bind ค่าลง placeholder `?` โดยไม่ต่อค่าเป็นคำสั่ง | `db.prepare(...).get/run/all(...)` | “คำค้นที่มี SQL กลายเป็นคำสั่งไหม?” — เป็นค่าข้อมูล |
| Primary Key / Foreign Key | PK ระบุแถว; FK ตรวจการอ้างอิงแถวอื่นมีอยู่จริง | `tasks.id`, `tasks.user_id → users.id`; SQL cascade ลบข้อมูลลูก | “FK ตรวจสิทธิ์ผู้เรียก HTTP ไหม?” — ไม่ ต้องตรวจ owner ใน API |
| CHECK / UNIQUE / Index | CHECK ตรวจเงื่อนไขค่า; UNIQUE กันค่าซ้ำ; index ช่วยค้นข้อมูล | Enums ของ task, email ไม่ซ้ำ, receipt ไม่ซ้ำ, index ตามเจ้าของ/สถานะ/วันส่ง | “SQL ตรวจวันปฏิทินให้ไหม?” — schema นี้ไม่ตรวจ; ใช้ Zod/API |
| Transaction / Rollback | รวมการทำงานฐานข้อมูลให้สำเร็จทั้งชุดหรือยกเลิกทั้งชุด | บันทึก receipts ถ้ามี task ของคนอื่นให้ rollback | “ส่งเมลกับ SQL อยู่ transaction เดียวกันไหม?” — ไม่ |
| Monorepo / npm Workspaces | Monorepo เก็บหลาย app/package ใน repo เดียว; workspaces เชื่อม dependencies ภายใน | `apps/web`, `apps/api`, `packages/shared` | “ต้อง deploy เป็น service เดียวหรือไม่?” — ไม่จำเป็น |
| TypeScript / Zod / Runtime Validation | TypeScript ตรวจตอนเขียน/build; Zod ตรวจข้อมูลที่มีอยู่จริงตอนรัน | shared schemas ตรวจ form และ JSON ที่ API รับ | “HTTP ส่งค่าผิดแล้ว TS ปฏิเสธให้เองไหม?” — ไม่ ต้องตรวจ runtime |
| PATCH / Default | PATCH แก้เฉพาะ fields ที่ส่ง; default คือค่าเริ่มต้นเมื่อสร้าง | Create schema มี defaults; update schema ไม่มี defaults | “ส่งแค่ status แล้ว due_date คงเดิมไหม?” — คงเดิม |
| Rate Limit / Memory | จำกัดจำนวน request; memory คือข้อมูลชั่วคราวใน process | Login/register 20 ครั้งต่อ 15 นาที/IP | “รีสตาร์ทหรือหลาย server ใช้ตัวนับเดียวกันไหม?” — ไม่ |
| n8n / Schedule Trigger | เครื่องมือเชื่อมขั้นตอน automation; trigger เริ่มตามเวลานัด | ทุกวัน 07:30 `Asia/Bangkok` → GET → If → SMTP → POST | “ไม่มี n8n แล้วเว็บใช้ได้ไหม?” — ใช้ได้ |
| SMTP / Receipt / Deduplication | SMTP รับส่งต่ออีเมล; receipt เป็นประวัติที่ workflow แจ้งหลังส่ง; dedup ลดการทำซ้ำ | `reminder_deliveries` UNIQUE user/task/date/channel | “Receipt ยืนยันเข้ากล่องหรือไม่ส่งซ้ำแน่นอนไหม?” — ไม่ทั้งสองกรณี |
| Due Date / Bangkok Date | Due date เป็นวันปฏิทิน; วันนี้ของไทยคำนวณใน timezone กรุงเทพฯ | `due_date <= date` สำหรับงานไม่ completed ที่ต้องเตือน | “เลยกำหนดกับครบกำหนดวันนี้ต่างกันไหม?” — Overdue ใช้ `<`; due reminder ใช้ `<=` |
| Atomic | การทำงานทั้งชุดสำเร็จหรือไม่เกิดผลเลย | SQL transaction ทำได้ภายในฐานข้อมูล แต่การส่ง SMTP กับเขียน SQL เป็นคนละระบบ | “ส่งเมลแล้วเขียน SQL ไม่สำเร็จ ย้อนเมลกลับได้ไหม?” — ไม่ได้ |
| HTTPS / Secret Management | HTTPS เข้ารหัสข้อมูลระหว่าง browser กับ server; secret management คือเก็บและจำกัดการเข้าถึงค่าลับ | งานที่ต้องจัดก่อนเปิดใช้ภายนอก: HTTPS, JWT secret และ credentials ของ n8n | “ใส่ key ใน Git ได้ไหม?” — ไม่ควร ค่าจริงอยู่ `.env` หรือ Credentials |
| Backup / Restore / Migration | Backup สำรองข้อมูล; restore นำกลับมาใช้; migration เปลี่ยน schema อย่างมีลำดับ | SQLite ในรุ่นนี้มี schema เริ่มต้น งานเหล่านี้ต้องเตรียมเพิ่มสำหรับระบบจริง | “เปลี่ยนตารางแล้วข้อมูลเก่าอยู่ต่อได้อย่างไร?” — ต้องมี migration และทดสอบสำรอง/กู้คืน |
| Monitoring / Load Test | Monitoring ช่วยรู้เมื่อระบบผิดปกติ; load test ตรวจพฤติกรรมเมื่อมีคำขอจำนวนมาก | เป็นงานที่ต้องเพิ่มก่อนใช้ภายนอก การผ่าน 35 functional tests ไม่ใช่ผลทดสอบโหลด | “35 tests ยืนยันรับผู้ใช้ได้กี่คน?” — ไม่ได้ ต้องทดสอบโหลดแยก |

หากต้องการไล่ต่อจากศัพท์ไปยังโค้ด อ่าน [code walkthrough](./code-walkthrough.md) ส่วนคำถามซ้อมแบบเต็มอยู่ใน [presentation guide](./presentation-guide.md)
