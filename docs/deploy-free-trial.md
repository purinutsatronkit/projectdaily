# ทดลอง TaskFlow ฟรีก่อน

Vercel Hobby เปิดหน้าเว็บฟรีสำหรับการใช้งานส่วนตัวที่ไม่ใช่เชิงพาณิชย์ แต่ TaskFlow ยังมี API และฐานข้อมูล SQLite จึงทดลองด้วย Render Free Web Service ก่อน เมื่อได้ URL ของ API แล้วค่อยตั้ง Vercel ให้เปิดหน้าเว็บและส่ง `/api` ไปยัง Render

## ข้อจำกัดของรอบทดลองฟรี

- `render.yaml` ใช้ Render Free ไม่มีดิสก์ถาวร ข้อมูล SQLite ใน `/tmp` **หายได้ทุกครั้ง** ที่บริการพักเครื่อง เริ่มใหม่ หรือ redeploy ห้ามใช้เก็บบัญชี/งานจริง
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

## ขั้นต่อไป: Vercel

เมื่อรู้ URL Render ที่แน่นอนแล้ว จึงใส่ URL นั้นใน rewrite `/api` ของ Vercel และ deploy หน้าเว็บ Vite จาก repository นี้ จากนั้นเปลี่ยน `APP_ORIGIN`, `APP_PUBLIC_URL` และ OAuth redirect URIs ให้ใช้ URL Vercel เดียวกัน เพื่อให้ cookie และ callback ทำงานบนเว็บที่ผู้ใช้เปิดจริง

## เมื่อจะให้คนอื่นใช้งานจริง

ย้ายฐานข้อมูลไปพื้นที่ถาวรและใช้โฮสต์ที่ทำงานต่อเนื่องก่อน ดู [คู่มือ production](production.md) มีตัวอย่าง Blueprint แบบเสียเงินที่ `deploy/render-paid.yaml` แต่อย่าเลือกไฟล์นั้นสำหรับรอบทดลองฟรี
