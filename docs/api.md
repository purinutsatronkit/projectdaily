# TaskFlow API

Base URL สำหรับพัฒนา: `http://localhost:3000/api`

## Authentication

เว็บใช้ cookie `taskflow_session` จาก login/register มี HttpOnly, SameSite=Lax, Max-Age=1800 และ Secure เมื่อ `NODE_ENV=production` อย่าส่ง API key ใน frontend และไม่เก็บ JWT ใน localStorage

API สำหรับ n8n ใช้ header `x-api-key` ไม่ใช้ cookie และเข้าถึงงานเฉพาะเจ้าของ key

| Method | Path | สิทธิ์ | การทำงาน |
| --- | --- | --- | --- |
| POST | `/auth/register` | สาธารณะ | สมัครและเข้าสู่ระบบ |
| POST | `/auth/login` | สาธารณะ | เข้าสู่ระบบ |
| POST | `/auth/forgot-password` | สาธารณะ | รับคำขอลิงก์ตั้งรหัสผ่านใหม่ทางอีเมล |
| POST | `/auth/reset-password` | Reset token | ตั้งรหัสใหม่และเพิกถอน session เดิมทั้งหมด |
| GET | `/auth/me` | Session | ข้อมูลผู้ใช้ปัจจุบัน |
| POST | `/auth/logout` | Cookie ถ้ามี | ยกเลิก session และลบ cookie |
| GET | `/tasks` | Session | ค้นหา/กรองงานของตนเอง |
| POST | `/tasks` | Session | เพิ่มงาน |
| GET | `/tasks/:id` | Session | อ่านงานของตนเอง |
| PATCH | `/tasks/:id` | Session | แก้เฉพาะ fields ที่ส่งมา |
| DELETE | `/tasks/:id` | Session | ลบงาน |
| GET | `/summary` | Session | ยอดรวม สถานะ และงานเลยกำหนด |
| GET | `/keys` | Session | รายการ key ไม่มี secret/hash |
| POST | `/keys` | Session | สร้าง key แสดง secret ครั้งเดียว |
| DELETE | `/keys/:id` | Session | ยกเลิก key ทันที |
| GET | `/reminders` | Session | ประวัติแจ้งเตือน 100 รายการล่าสุด |
| GET | `/integrations/due-tasks` | API key | งานยังไม่เสร็จที่ถึงกำหนด |
| POST | `/integrations/reminders` | API key | บันทึกผลแจ้งเตือน |
| GET | `/health` | สาธารณะ | ตรวจ server และการเชื่อม DB |

Mutation ใช้ `Content-Type: application/json` และ backend ปฏิเสธ Origin ที่ไม่อยู่ในรายการที่ตั้งไว้ ยกเว้น DELETE/logout ที่ไม่มี body ไม่ต้องกำหนด Content-Type

## Request / response ตัวอย่าง

### ลืมรหัสผ่าน

ต้องตั้ง SMTP ที่ backend ก่อน ดู [คู่มือ Gmail SMTP](password-reset-gmail.md) ทั้งสอง endpoint ใช้ JSON และ Origin check ตามปกติ ไม่ต้องมี session cookie หรือ API key

`POST /auth/forgot-password`:

```json
{ "email": "user@example.com" }
```

เมื่อ SMTP ตั้งค่าแล้ว ตอบ **202** ด้วยข้อความเดียวกันทั้งอีเมลที่มี/ไม่มีบัญชี และกรณีติด cooldown หรือเพดานต่อบัญชี:

```json
{ "message": "หากอีเมลนี้มีบัญชีอยู่ในระบบ คุณจะได้รับลิงก์ตั้งรหัสผ่านใหม่ กรุณาตรวจกล่องจดหมายและสแปม" }
```

202 หมายถึงรับคำขอ ไม่ยืนยันว่าอีเมลส่งแล้ว หากไม่มี SMTP ตอบ **503 `SMTP_NOT_CONFIGURED`** การส่งทำงานแบบ async ใน process เดียว เมื่อส่งล้มเหลวจะลบ token ที่ยังไม่ใช้ของฉบับนั้นและ log event `password_reset_email_failed` โดยไม่ log credential หรือ reset link

`POST /auth/reset-password` ใช้ token จากลิงก์ `/reset-password#token=...`:

```json
{ "token": "<token 64 ตัวจากลิงก์อีเมล>", "password": "A-new-password!2026" }
```

ตัวอย่าง token เป็น placeholder ต้องใช้ token จริงรูปแบบ hexadecimal 64 ตัว ลิงก์มีอายุ **15 นาที** และใช้ได้ครั้งเดียว รหัสใหม่ยาว **12–128 ตัวอักษร** ช่องยืนยันรหัสผ่านตรวจที่หน้าเว็บจึงไม่ส่งมาใน body

สำเร็จตอบ **200**:

```json
{ "message": "ตั้งรหัสผ่านใหม่สำเร็จแล้ว กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่" }
```

API ใช้ SQL transaction เพื่อ claim token เปลี่ยน password hash เพิกถอนทุก `auth_sessions` ของบัญชี และทำให้ reset token อื่นของบัญชีใช้ต่อไม่ได้ พร้อมลบ cookie ปัจจุบัน ผู้ใช้ต้อง login ใหม่ หาก token ที่ส่งผ่าน schema แล้วไม่พบ หมดอายุ หรือใช้แล้ว ตอบ **400 `INVALID_RESET_TOKEN`** ส่วน body ที่ผิด schema ตอบ 400 validation error ตามปกติ

Limits: ขอลิงก์ **5 คำขอต่อ IP ใน 15 นาที**, ส่งฟอร์มตั้งรหัสใหม่ **10 ครั้งต่อ IP ใน 15 นาที** เกินคืน 429 พร้อม `Retry-After` ตัวนับ IP อยู่ใน memory ของ process ส่วนต่อบัญชีเว้น **60 วินาที** และไม่เกิน **3 ลิงก์ใน 1 ชั่วโมง** โดยนับจากประวัติใน SQL และยังคืนข้อความกลาง

### บัญชี งาน และ integration

สมัคร:

```json
{ "name": "ผู้ทดลอง", "email": "user@example.com", "password": "A-long-password!2026" }
```

เพิ่มงาน `POST /tasks`:

```json
{ "title": "เตรียมสไลด์", "description": "วาด flow การ login", "priority": "high", "due_date": "2026-10-20" }
```

Response: `{ "task": { "id": "...", "title": "...", "description": "...", "priority": "high", "status": "pending", "due_date": "2026-10-20", "created_at": "...", "updated_at": "..." } }`

สถานะ: `pending`, `in_progress`, `completed` ความสำคัญ: `low`, `medium`, `high` วันที่ว่างใช้ `null` วันต้องมีจริง เช่น `2026-02-30` ไม่ผ่าน validation

แก้สถานะ `PATCH /tasks/:id`:

```json
{ "status": "completed" }
```

Fields อื่นยังคงเดิม ห้ามอาศัยแค่ ID เพื่อให้สิทธิ์ ทุก query ใช้ `user_id` ที่ backend ได้จาก session

ค้นหา `GET /tasks?search=สไลด์&status=pending&priority=high` ค้นแบบข้อความ literal ไม่ตีความ `%` เป็น wildcard และใช้ prepared parameters

สร้าง API key `POST /keys`:

```json
{ "name": "n8n daily reminder" }
```

Response `{ "key": { "id": "...", "name": "...", "prefix": "tf_...", "expires_at": "..." }, "secret": "tf_..." }` รายละเอียด key มี created_at, revoked_at, last_used_at ด้วย เก็บ secret ที่แสดงครั้งเดียวใน Credentials ของ n8n สร้าง key ที่ยังใช้ได้สูงสุด 5 รายการต่อผู้ใช้

`GET /integrations/due-tasks` ใช้วันที่วันนี้ใน Asia/Bangkok โดยปริยาย สามารถส่ง `?date=YYYY-MM-DD` เพื่อทดสอบวันที่ที่ระบุได้

```json
{ "date": "2026-10-20", "user": { "id": "...", "name": "ผู้ทดลอง", "email": "user@example.com" }, "tasks": [] }
```

เงื่อนไข: งานของเจ้าของ key, ยังไม่ completed, due_date <= date และไม่มี reminder วันที่เดียวกัน ช่องทาง email คืนมากสุด 100 งาน ถ้ามีมากกว่านี้ต้องรันต่อหลังบันทึกชุดแรก หรือเพิ่ม pagination ในรุ่นต่อไป

บันทึกหลัง SMTP สำเร็จ `POST /integrations/reminders`:

```json
{ "task_ids": ["task-id"], "date": "2026-10-20", "channel": "email" }
```

Response `{ "recorded": 1 }` ส่งซ้ำได้โดยไม่สร้างแถวซ้ำ และจะได้ `recorded: 0` หากมีงานที่ไม่ใช่ของเจ้าของ key ทั้งชุดจะ rollback ไม่มีการบันทึกบางส่วน

## Error contract

```json
{ "error": { "code": "NOT_FOUND", "message": "ไม่พบงานนี้", "request_id": "..." } }
```

| Status | ความหมาย |
| --- | --- |
| 400 | JSON/fields/filter/date ไม่ถูกต้อง หรือ `INVALID_RESET_TOKEN` |
| 401 | ยังไม่ login, JWT/session หมดอายุ หรือ API key ใช้ไม่ได้ |
| 403 | Origin ไม่ได้รับอนุญาต |
| 404 | ไม่พบรายการ หรือผู้ใช้นี้ไม่มีสิทธิ์เข้าถึง |
| 409 | อีเมลซ้ำ หรือสร้าง key เกินจำนวน |
| 413 | Body เกิน 16 KB |
| 415 | Endpoint ที่รับ body ต้องเป็น JSON |
| 429 | ต่อ IP ใน 15 นาที: login/register 20 ครั้ง, forgot-password 5 ครั้ง, reset-password 10 ครั้ง |
| 500 | ข้อผิดพลาดภายใน ไม่ส่งรายละเอียด SQL/stack trace ให้ client |
| 503 | `SMTP_NOT_CONFIGURED` ยังไม่ได้กำหนดบริการอีเมล password reset |
