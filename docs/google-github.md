# Google sign-in และ GitHub workspace

TaskFlow เข้าระบบด้วย Google หรืออีเมล/รหัสผ่านได้ ส่วน GitHub เชื่อมจาก **รูปโปรไฟล์ → ตั้งค่าบัญชี → บัญชีที่เชื่อมต่อ** เพื่อให้สิทธิ์ดู repository และสั่ง GitHub Actions ในนามผู้ใช้

## เริ่มใช้กับค่าที่ตั้งไว้แล้ว

1. หยุด dev server เดิมด้วย Ctrl+C แล้วรัน `npm.cmd run dev` จาก `D:\project` เปิด `http://localhost:5173` ให้ตรงกับ APP_PUBLIC_URL อย่าสลับเป็น 127.0.0.1 ระหว่าง OAuth
2. ถ้ามีบัญชี TaskFlow และงานเดิมแล้ว ให้เข้าด้วยรหัสผ่านก่อน ไปตั้งค่าบัญชีแล้วกด **เชื่อม Google** ครั้งเดียว หลังจากนั้นเข้าด้วยปุ่ม Google ได้ ระบบไม่รวมบัญชีอัตโนมัติเพียงเพราะอีเมลตรงกัน
3. ผู้ใช้ใหม่กด **เข้าสู่ระบบด้วย Google** ที่กล่อง login ได้เลย ระบบสร้างบัญชี TaskFlow หลัง Google ยืนยันอีเมล
4. ในตั้งค่าบัญชี กด **เชื่อม GitHub** แล้วอนุญาตแอป จากนั้นกด **ติดตั้งหรือเลือก repository ที่ GitHub App เข้าถึงได้** และเลือก repository ที่ต้องการ การ authorize ผู้ใช้กับการ install แอปเป็นคนละขั้นตอน ต้องครบทั้งสอง
5. เปิดเมนู **GitHub** ด้านซ้าย เลือกบัญชี/องค์กร แล้วเลือก repository ใช้แท็บ **ไฟล์ / โค้ด**, **Commits**, **Pipelines**
6. ใน Pipelines กดรายละเอียดเพื่อดู jobs, steps, checks และ annotations กดรีเฟรชเพื่อรับสถานะล่าสุด กระดิ่งจะตรวจ workflow ที่ติดตามอยู่เป็นระยะขณะเปิดเว็บ และแจ้งเมื่อพบการรันที่ล้มเหลวใหม่

ผู้ที่สร้างบัญชีด้วย Google อย่างเดียวสามารถขอรหัสผ่านผ่าน “ลืมรหัสผ่าน” ได้เมื่อ SMTP พร้อม เพื่อใช้การเปลี่ยนอีเมลที่ต้องยืนยันรหัสผ่านปัจจุบัน การแก้อีเมล TaskFlow ไม่เปลี่ยนตัวตน Google ที่เชื่อมไว้

## ตัวแปรใน .env

```dotenv
APP_ORIGIN=http://localhost:5173
APP_PUBLIC_URL=http://localhost:5173
GOOGLE_CLIENT_ID=<Google Web application client ID>
GOOGLE_CLIENT_SECRET=<Google client secret>
GITHUB_CLIENT_ID=<GitHub App client ID ไม่ใช่ App ID>
GITHUB_CLIENT_SECRET=<GitHub App client secret>
GITHUB_APP_SLUG=taskflow-thug
OAUTH_TOKEN_KEY=<ค่าสุ่ม 64 ตัวอักษร hex>
```

ใส่ค่าจริงเฉพาะ `.env` ซึ่งไม่เข้า Git และไม่ใช้ชื่อตัวแปรขึ้นต้น `VITE_` สำหรับ secret ไม่มี private key `.pem` ที่ต้องใส่สำหรับ flow นี้ ระบบใช้ GitHub App user access token

สร้าง OAUTH_TOKEN_KEY เฉพาะเมื่อยังไม่มี ด้วย `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` แล้วเก็บใน .env อย่าเปลี่ยนค่านี้ทุกครั้งที่รัน: ใช้เข้ารหัส token ที่อยู่ใน SQLite และต้องสำรองอย่างปลอดภัยคู่กับฐานข้อมูล ถ้าเปลี่ยนหรือสูญหาย ผู้ใช้ต้องเชื่อม GitHub ใหม่

ตรวจค่าที่เซิร์ฟเวอร์อ่านแล้วโดยเปิด `/api/auth/providers` จะได้ boolean เท่านั้น ไม่แสดง secret ค่าขึ้น true หมายถึงตั้งค่าครบ ไม่ได้ยืนยันว่า provider ยอมรับ credential จนกว่าจะทำ OAuth สำเร็จ

## Google OAuth

- Google Auth Platform → Clients → Web application
- Authorized JavaScript origin: `http://localhost:5173`
- Authorized redirect URI: **`http://localhost:5173/api/auth/google/callback`**
- ตั้งชื่อแอป อีเมลติดต่อ และ audience ให้ครบ หาก console จำกัดการทดสอบ ให้เพิ่มบัญชี Google ที่จะใช้ใน Test users
- ใช้เฉพาะ `openid email profile` สำหรับ login ไม่มีสิทธิ์ Google Drive
- หากพบ redirect_uri_mismatch ตรวจ protocol, host, port และ path ให้ตรงทุกตัว

## GitHub App

เปิด Settings → Developer settings → GitHub Apps → แอปของคุณ

- Homepage URL: `http://localhost:5173`
- Redirect URI / Callback URL: **`http://localhost:5173/api/auth/github/callback`**
- Credentials → Client secrets → Generate a new client secret แล้วคัดลอกลง .env
- เปิด Expire user authorization tokens; ระบบ refresh token ที่เข้ารหัสไว้เมื่อใกล้หมดอายุ
- Request user authorization during installation: ปิดได้ เพราะเชื่อมผู้ใช้ผ่านปุ่มใน TaskFlow แยกต่างหาก
- Webhooks: ปิดได้ ระบบนี้ดึงข้อมูลผ่าน REST API
- Repository permissions: **Contents: Read-only**, **Metadata: Read-only**, **Actions: Read and write**, **Checks: Read-only**, **Issues: Read-only**, **Pull requests: Read-only**, **Commit statuses: Read-only** (หน้า task link ใช้ Issues/Pull requests เพื่อแสดงชื่อและสถานะ)
- เมื่อตั้งสิทธิ์เพิ่มภายหลัง ให้เจ้าของ installation อนุมัติสิทธิ์ใหม่ด้วย
- Install App: เลือกบัญชีและ repository แอปแบบ private ติดตั้งได้เฉพาะเจ้าของ หากจะให้คนอื่นติดตั้งต้องปรับ distribution ให้เหมาะสม

GitHub จำกัดสิทธิ์ด้วยทั้งผู้ใช้และ App: การติดตั้งแอปอย่างเดียวไม่ได้ทำให้ผู้ใช้เห็น repository ที่ตนไม่มีสิทธิ์ และปุ่มสั่งงานอาจได้ 403 หากผู้ใช้ไม่มีสิทธิ์สั่ง Actions

## รัน pipeline

เลือก workflow แล้วกด **รัน workflow** เลือก branch/tag และ inputs แบบ JSON ตามที่ workflow กำหนด กดยืนยันจึงส่งคำสั่งจริง การรันใหม่ต้องมี `workflow_dispatch` ใน workflow บน default branch เช่น:

```yaml
name: Tests
on:
  push:
  workflow_dispatch:
permissions:
  contents: read
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm test
```

ตัวอย่างนี้เป็นแนวทาง ไม่ได้ติดตั้ง workflow ให้ repository โดยอัตโนมัติ ปุ่ม **รันซ้ำ** ใช้กับ run ที่จบแล้ว และ **ยกเลิก** ใช้กับ run ที่ยังไม่จบ GitHub เป็นผู้ตัดสินสถานะและสิทธิ์สุดท้าย การสั่งรันอาจทำ deploy หาก workflow มีขั้นตอนนั้น และใช้ quota/นาที Actions ของเจ้าของ repository

TaskFlow เก็บประวัติคำสั่งที่ GitHub รับแล้วในตาราง `pipeline_actions` ไม่เก็บ workflow inputs ในประวัติ หลังส่งคำสั่งกดรีเฟรช รายการ run อาจปรากฏช้ากว่าการรับคำสั่งเล็กน้อย หากการเชื่อมต่อขาดระหว่างส่ง ให้ตรวจรายการ run บน GitHub ก่อนกดซ้ำ

## ขอบเขตและการแก้ปัญหา

- ดูไฟล์ข้อความ UTF-8 ได้สูงสุด 1 MB; ไฟล์ binary, submodule และไฟล์ใหญ่เปิดบน GitHub แทน โฟลเดอร์จำกัดตาม Contents API ที่ 1,000 รายการ รายการอื่นมีปุ่มแบ่งหน้า
- Commit diff แสดง patch ที่ GitHub ส่งมา บางไฟล์อาจไม่มี patch หรือถูกตัด จึงมีลิงก์ไป GitHub
- ผลทดสอบแสดง jobs/steps และ checks ที่ workflow รายงาน ไม่ได้สร้างรายงาน test รายข้อเอง และไม่แปลง JUnit/HTML artifact; logs และ artifacts เปิดบน GitHub Checks อาจรวมหลาย workflow ของ commit เดียวกัน
- ไม่มีการแก้ไฟล์ push commit หรืออัปโหลดไป Drive จากหน้านี้
- 401/ข้อความให้เชื่อมใหม่: ไปตั้งค่าบัญชี → GitHub → เชื่อมใหม่; 403: ตรวจ permissions, approval ของ installation และ rate limit; 404: ตรวจว่าเลือก repository ให้ App แล้วและผู้ใช้มีสิทธิ์; 422: ตรวจ workflow_dispatch, ref และ inputs
- โปรเจกต์เชื่อม GitHub repository แบบ `owner/name` เพื่อเปิดหน้าติดตามตรง repository และแจ้งเมื่อ run ใหม่หรือ run ที่ติดตามอยู่เปลี่ยนเป็น failure/timed_out/action_required เลือกติดตามทุก workflow หรือ Workflow ID เดียวได้ ระบบเริ่มบันทึกสถานะตั้งแต่การตรวจครั้งแรก จากนั้นตรวจทุก 1 นาทีขณะเปิดเว็บ; ไม่ใช่ GitHub webhook หรือ push notification ขณะปิดเว็บ
- งานแต่ละชิ้นแนบลิงก์ GitHub Issue/PR ได้ สถานะในหน้าแก้ไขงานอาศัยสิทธิ์ Issues/Pull requests read หากไม่ได้สิทธิ์ ยังเปิดลิงก์บน GitHub ได้
- ประวัติคำสั่ง pipeline ในหน้า GitHub แสดง 50 รายการล่าสุดต่อบัญชี ไม่เก็บ workflow inputs
- ยกเลิกการเชื่อมใน TaskFlow ลบ token ที่เก็บในแอป หากต้องการเพิกถอนสิทธิ์บน GitHub ด้วย ให้ไป GitHub Settings → Applications เพื่อ revoke authorization/uninstall ด้วยตัวเอง
- หลังแก้ .env ต้องรีสตาร์ท API หาก port 5173 ถูกใช้ ให้หยุด dev server เดิมก่อนเปิดใหม่
- ใช้ `npm.cmd run build` แล้ว `npm.cmd start` ที่ port 3000 ต้องเปลี่ยน APP_ORIGIN, APP_PUBLIC_URL และ redirect URIs ทั้งสอง provider ให้ตรง port 3000 ก่อน สำหรับ production ใช้ HTTPS, NODE_ENV=production และค่า domain จริง
- OAuth state ใช้ได้ครั้งเดียว อายุ 10 นาที ผูกกับ browser และ session ของผู้เชื่อม Token GitHub เข้ารหัสด้วย AES-256-GCM ในฐานข้อมูล Session TaskFlow ยังมีอายุ 5 ชั่วโมงตามเดิม

เอกสารอ้างอิง: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect), [GitHub App user access token](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app), [GitHub App Credentials UI](https://github.blog/changelog/2026-10-13-github-app-improvements-for-least-privilege-and-management/)
