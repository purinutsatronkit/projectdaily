import PdfPrinter from 'pdfmake';
import {readFileSync,createWriteStream} from 'node:fs';
import {sk09Document} from '../../apps/web/src/sk09-document.ts';
import {sk09Schema} from '../../apps/web/src/sk09-model.ts';
const fontRoot='D:/project/apps/web/public/sk09/';
const printer=new PdfPrinter({Sarabun:{normal:fontRoot+'Sarabun-Regular.ttf',bold:fontRoot+'Sarabun-Bold.ttf',italics:fontRoot+'Sarabun-Regular.ttf',bolditalics:fontRoot+'Sarabun-Bold.ttf'}});
const data=sk09Schema.parse({name:'นาย ตัวอย่าง ทดสอบ',studentId:'66102010000',company:'บริษัท ตัวอย่าง จำกัด',department:'พัฒนาระบบซอฟต์แวร์',startDate:'2026-10-19',endDate:'2026-10-23',startTime:'08:00',endTime:'17:00',days:[
 {assignment:'เตรียม Environment และเครื่องมือใช้งาน (ติดตั้ง)\nClone git ลงเครื่อง ทดลองรันเว็บไซต์บนเครื่องตนเอง',result:'เข้าใจการติดตั้งเครื่องมือและขั้นตอนการเริ่มต้นใช้งานระบบ'},
 {assignment:'เรียนรู้เรื่อง Angular Framework และทดลองสร้าง component',result:'ศึกษาการใช้ Angular Datepicker และ input component'},
 {assignment:'ทำ workshop พัฒนาเว็บไซต์และเข้าร่วมอบรม',result:'ทำ Lab เว็บไซต์ที่ได้รับมอบหมาย สำเร็จ 30%'},
 {assignment:'พัฒนาและทดสอบเว็บไซต์ตามที่ได้รับมอบหมาย',result:'ทำ Lab สำเร็จ 70% และแก้ไขข้อผิดพลาด'},
 {assignment:'สรุปผลการพัฒนาเว็บไซต์และนำเสนอผลงาน',result:'ทำ Lab สำเร็จ 100% และเข้าใจโค้ดเพิ่มเติม'},
]});
for(const [name,value] of [['sample',data],['long',{...data,company:'บริษัท เทคโนโลยีและการพัฒนาระบบสารสนเทศเพื่อการเรียนรู้และการทำงานร่วมกัน จำกัด',department:'ฝ่ายพัฒนาระบบซอฟต์แวร์และทดสอบคุณภาพ',days:data.days.map(day=>({assignment:(day.assignment+' ').repeat(3).slice(0,600),result:(day.result+' ').repeat(3).slice(0,400)}))}]] as const) {
 const document=printer.createPdfKitDocument(sk09Document(value,'data:image/png;base64,'+readFileSync(fontRoot+'university-logo.png').toString('base64')));
 const stream=createWriteStream(`D:/project/tmp/sk09/${name}.pdf`); document.pipe(stream); document.end();
 await new Promise<void>((resolve,reject)=>{stream.on('finish',resolve);stream.on('error',reject);});
 console.log(`Rendered ${name}`);
}
