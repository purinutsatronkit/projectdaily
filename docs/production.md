# เตรียมติดตั้ง TaskFlow สำหรับใช้งานจริง

เอกสารนี้ระบุค่าที่ต้องตั้งและงานที่ยังเหลือ ไม่ใช่การรับรองว่าระบบพร้อมเปิดรับสมัครทั่วไปแล้ว

## เว็บและ API

- ใช้ `npm.cmd run build` แล้ว `npm.cmd start` พร้อม process supervisor หรือ container ที่ restart อัตโนมัติ
- ตั้ง `NODE_ENV=production`, `APP_ORIGIN` และ `APP_PUBLIC_URL` เป็น HTTPS origin ของเว็บจริงเดียวกัน
- ตั้ง `JWT_SECRET` สุ่มแยกจากเครื่องพัฒนา เก็บ SMTP credential ในระบบจัดการ secrets ของโฮสต์
- เก็บ `DATABASE_PATH` บน persistent storage ของเซิร์ฟเวอร์เดียว สำรองด้วยวิธีที่รองรับ SQLite/WAL และทดสอบ restore
- ให้ HTTPS reverse proxy รับการเชื่อมต่อสาธารณะ จำกัดการเข้าถึง API โดยตรง
- `TRUSTED_PROXY_IPS` เว้นว่างโดยค่าเริ่มต้น จึงไม่เชื่อ `X-Forwarded-For` จากผู้เรียก
- ถ้าใช้ proxy ให้กำหนด IP แบบเจาะจงของ proxy ที่ควบคุมเอง คั่นด้วย comma เช่น `127.0.0.1,::1` เมื่อ proxy อยู่เครื่องเดียวกัน ให้ proxy เขียน/ต่อท้าย IP ผู้เรียกอย่างถูกต้อง และปิดช่องทาง bypass proxy จากอินเทอร์เน็ต ห้ามใช้ IP ตัวอย่างโดยไม่ตรวจ topology
- ระบบอ่าน proxy chain จากขวามาซ้ายและหยุดที่ IP แรกที่ไม่ได้อยู่ในรายการ trusted; header ผิดรูปแบบใช้ IP ของการเชื่อมต่อโดยตรง
- Rate limit ยังอยู่ใน memory ของ process เดียว ถ้ารันหลาย instance ต้องใช้ตัวนับร่วมกัน

บัญชี demo@taskflow.local ถูกปิดการสมัคร/login/session/API key เมื่อ NODE_ENV=production และเว็บที่ build แล้วซ่อนปุ่มเข้าบัญชีตัวอย่าง การทดลองเดโมให้ใช้ npm.cmd run dev

## Google และ GitHub

- ตั้ง OAuth redirect URIs ให้ตรง HTTPS domain จริง และจัดการ audience/distribution ของ Google OAuth กับ GitHub App ให้ผู้ใช้เป้าหมายเข้าถึงได้ ตาม [คู่มือ Google/GitHub](google-github.md)
- เก็บ client secrets และ `OAUTH_TOKEN_KEY` ใน secret manager สำรองคีย์เข้ารหัสคู่กับฐานข้อมูล การเปลี่ยนคีย์โดยไม่ย้าย token ทำให้ต้องเชื่อม GitHub ใหม่
- GitHub token จำกัดด้วยสิทธิ์ของผู้ใช้และ App ใช้ refresh token ที่เข้ารหัสไว้ใน process เดียว การทำหลาย instance ต้องประสานการ refresh เพื่อไม่แย่งใช้ refresh token เดิม
- ประเมิน quota/ค่าใช้จ่าย GitHub Actions ของ repository รวมถึงขั้นตอน deploy ที่การกดรัน workflow อาจเรียก
- ตาราง `pipeline_actions` บันทึกคำสั่งที่ GitHub รับแล้ว ควรกำหนด retention และ monitoring ก่อนให้บริการหลายผู้ใช้
- เพิ่ม Issues/Pull requests read ใน GitHub App แล้วให้ installation ยอมรับสิทธิ์ใหม่ จึงดูสถานะลิงก์ในงานได้
- การเตือน pipeline ตรวจผ่าน browser ที่เปิดอยู่ทุกนาที จำกัด 10 โปรเจกต์ที่เปิดติดตามและ 20 runs ล่าสุดต่อ repository งานล้มเหลวขณะเว็บปิดนานจนพ้นหน้ารายการ 20 runs อาจไม่ถูกตรวจ ควรใช้ webhook/job ที่ทนต่อ downtime เมื่อขยายบริการ
- การยืนยันอีเมลยังเป็นสถานะบัญชี ไม่ได้บังคับก่อนใช้งานทุกฟีเจอร์ รวมถึงบัญชีเดิม ต้องตัดสินนโยบายก่อนเปิดทั่วไป
- สำรองข้อมูลด้วย `npm.cmd run db:backup` และตรวจสำเนาด้วย `npm.cmd run db:restore-check -- <backup> <new-file>`; จัด retention และลบสำเนาตามนโยบายข้อมูลส่วนตัว

## n8n

- ไฟล์ `n8n/taskflow-daily-reminder.json` ตั้ง daily 07:30 และ `Asia/Bangkok` แบบ explicit แล้ว ต้อง import/ปรับ workflow ที่ใช้งานอยู่และ Publish ให้มีผล
- Credential references ใน export ต้องเลือกให้ตรงกับ credentials บน instance ปลายทาง
- แก้ URL API ทั้งสอง node ให้เข้าถึง backend ได้จากเครื่อง n8n และลิงก์ในเนื้อหาอีเมลให้เป็นโดเมนจริง
- `host.docker.internal` เหมาะกับ Docker Desktop ของเครื่องพัฒนานี้ ไม่ใช่ค่า deployment สากล
- Compose ปัจจุบันเปิด editor เฉพาะ loopback และตั้ง secure cookie เป็น false สำหรับ HTTP ในเครื่อง ถ้าเปิด editor ผ่าน HTTPS ต้องเปิด secure cookie และจำกัดผู้เข้าถึง
- สำรอง volume n8n รวม encryption key เพื่อให้กู้ credentials ได้
- `node n8n/validate-workflow.mjs` ตรวจไฟล์และ expressions แบบไม่ส่งเมล ไม่ได้ตรวจว่า workflow บน instance ถูก Publish หรือส่งอีเมลจริงได้

## งานที่ยังควรทำก่อนเปิดรับสมัครทั่วไป

- ตัดสินว่าจะบังคับยืนยันอีเมลก่อนใช้ฟีเจอร์ใด และจัดการบัญชีเดิมที่ยังไม่ยืนยัน
- durable email queue, การควบคุมส่งซ้ำ, error alerts และสิทธิ์การส่งสำหรับผู้ใช้หลายคน (workflow ปัจจุบันยังใช้ key ต่อผู้ใช้ อายุ 30 วัน)
- เผยแพร่หน้า privacy และกำหนดนโยบายเก็บข้อมูล ระยะเวลาเก็บ backup และขั้นตอนกู้คืนจริง
- pagination, การทดสอบโหลดและการตรวจ dependencies ก่อน deploy
- พิจารณาขยายความยาวรหัสผ่านที่รองรับ ปัจจุบันยังคง 8–16 ตามข้อกำหนดเดิม

## ร่าง สก.09

เก็บร่างล่าสุด 1 ฉบับต่อบัญชีในตาราง `sk09_drafts` รวมอยู่ใน backup ฐานข้อมูล บันทึกเมื่อหยุดพิมพ์ประมาณ 0.8 วินาทีหรือกดบันทึกร่าง กรอกไม่ครบได้ PDF ยังตรวจข้อมูลให้ครบก่อนสร้าง ร่างไม่มีประวัติหลายเวอร์ชันและยังไม่ส่งไป Drive/GitHub

เซิร์ฟเวอร์ตรวจ session/เจ้าของบัญชีและ version ป้องกันแท็บหรือเครื่องอื่นเขียนทับร่างเก่า กรณี conflict ให้คัดลอกส่วนที่ยังต้องการเก็บแล้วโหลดร่างล่าสุด กรณีเน็ตขาด ข้อความยังอยู่ในหน้าที่เปิดและแสดงว่ายังไม่บันทึก; การปิดหน้าโดยยืนยันออกทั้งที่มีข้อความเตือนอาจทำให้ส่วนที่ยังไม่บันทึกหาย
