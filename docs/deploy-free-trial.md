# ทดลอง TaskFlow ด้วย Turso Free, Render Free และ Vercel Hobby

## ฐานข้อมูล Turso ที่สร้างไว้แล้ว

1. เปิดฐานข้อมูล `taskflow` ใน [Turso Dashboard](https://app.turso.tech/) แล้วคัดลอก Database URL ที่ขึ้นต้น `libsql://`
2. สร้าง Database Token สำหรับฐานข้อมูลนี้ คัดลอกทันที และเก็บไว้ส่วนตัว ไม่ใส่ใน GitHub, ภาพหน้าจอ หรือแชต
3. เปิด [Render Dashboard](https://dashboard.render.com/) > Web Service `taskflow` > **Environment** แล้วเพิ่ม `TURSO_DATABASE_URL` และ `TURSO_AUTH_TOKEN` ด้วยค่าจาก Turso
4. หลังโค้ดรุ่น Turso ถูก push ให้เลือก **Save, rebuild, and deploy** ตรวจสถานะ Live และ `https://projectdaily-hazel.vercel.app/api/health`

สำหรับ Blueprint ที่มีอยู่แล้ว Render ไม่ถามค่า `sync: false` ที่เพิ่มภายหลัง ต้องใส่สองค่านี้ในหน้า Environment เอง. ฐานข้อมูลใหม่เริ่มว่าง บัญชีและงานจาก SQLite บน Render เดิม **ไม่ได้ย้ายอัตโนมัติ** หากมีข้อมูลที่ต้องเก็บ ให้ export ก่อนสลับฐานข้อมูล

Vercel Hobby เปิดหน้าเว็บฟรีสำหรับการใช้งานส่วนตัวที่ไม่ใช่เชิงพาณิชย์ แต่ TaskFlow ยังมี API และฐานข้อมูล SQLite จึงทดลองด้วย Render Free Web Service ก่อน เมื่อได้ URL ของ API แล้วค่อยตั้ง Vercel ให้เปิดหน้าเว็บและส่ง `/api` ไปยัง Render

## ข้อจำกัดของรอบทดลองฟรี

- `render.yaml` ใช้ Render Free ร่วมกับ Turso Free เพื่อเก็บข้อมูลถาวรในฐานข้อมูลภายนอก
- Render Free พักเครื่องหลังไม่มีการใช้งาน 15 นาที การเปิดครั้งต่อไปอาจรอประมาณ 1 นาที
- Render Free บล็อกการส่ง SMTP พอร์ต 25/465/587 จึงยังทดลองอีเมลยืนยัน, รีเซ็ตรหัส และเตือนงานด้วย Gmail SMTP ไม่ได้ ตัวตั้งเวลาเตือนงานถูกปิดใน config นี้
- ใช้รอบนี้เพื่อตรวจหน้าเว็บ การสมัคร/ล็อกอินชั่วคราว งาน ปฏิทิน และการเชื่อม API เท่านั้น อย่าเชิญผู้ใช้เก็บข้อมูลสำคัญ

## ขั้นแรก: เปิด API ทดลองบน Render

1. Commit และ push ไฟล์ `render.yaml` พร้อมโค้ดล่าสุดไป GitHub
2. เข้า [Render Dashboard](https://dashboard.render.com/) ด้วย GitHub
3. เลือก **New > Blueprint** แล้วเลือก repository และ branch ที่มี `render.yaml`
4. ตรวจว่าหน้าสรุปเป็น **Free** และ **ไม่มี persistent disk** ก่อนกดสร้าง หากแสดงค่าใช้จ่าย ให้หยุดและตรวจ plan
5. รอให้บริการขึ้นสถานะ Live แล้วเปิด `https://<ชื่อบริการ>.onrender.com/api/health` ควรเห็น `{"status":"ok","service":"taskflow-api"}`
6. ส่ง URL `https://<ชื่อบริการ>.onrender.com` ให้ผู้ช่วยเพื่อเตรียม Vercel proxy ต่อ ไม่ต้องส่ง API key หรือรหัสผ่าน

Render จะให้ URL ฟรีแบบ `*.onrender.com` และแอปเสิร์ฟหน้าเว็บกับ API จาก URL นี้อยู่แล้ว จึงลองเปิดหน้าเว็บชั่วคราวได้ ก่อนย้ายหน้าเว็บไป Vercel

## Vercel ที่เชื่อมแล้ว

หน้าเว็บหลักคือ `https://projectdaily-hazel.vercel.app` และ `vercel.json` ส่ง `/api` ไปที่ `https://taskflow-h64l.onrender.com` โดยยังคง URL ของ Vercel ใน browser. `APP_ORIGIN` และ `APP_PUBLIC_URL` บน Render ถูกตั้งเป็น URL Vercel เดียวกัน เพื่อให้คำขอจากเว็บและ cookie ทำงานร่วมกัน

หลัง Render redeploy ให้ตรวจ `https://projectdaily-hazel.vercel.app/api/health` และทดลองสมัคร/ล็อกอินด้วยข้อมูลทดสอบเท่านั้น หากต้องเปิด Google หรือ GitHub ให้เพิ่ม callback URLs ที่ใช้โดเมน Vercel ใน provider ก่อน แล้วจึงตั้ง secrets บน Render

## เมื่อจะให้คนอื่นใช้งานจริง

ย้ายฐานข้อมูลไปพื้นที่ถาวรและใช้โฮสต์ที่ทำงานต่อเนื่องก่อน ดู [คู่มือ production](production.md) มีตัวอย่าง Blueprint แบบเสียเงินที่ `deploy/render-paid.yaml` แต่อย่าเลือกไฟล์นั้นสำหรับรอบทดลองฟรี
