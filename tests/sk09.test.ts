import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, fiveDays, sk09Schema, thaiShortDate, type Sk09Data } from '../apps/web/src/sk09-model.ts';
import { sk09Document } from '../apps/web/src/sk09-document.ts';
const valid:Sk09Data={name:'นิสิต ทดสอบ',studentId:'66102010000',company:'บริษัททดสอบ',department:'พัฒนาระบบ',startDate:'2026-10-19',endDate:'2026-10-23',startTime:'08:00',endTime:'17:00',days:Array.from({length:5},()=>({assignment:'ทดสอบระบบ',result:'เรียนรู้การทำงาน'}))};
test('SK09 uses exactly five consecutive dates including month, year and leap-day transitions',()=>{
  assert.deepEqual(fiveDays('2026-10-19'),['2026-10-19','2026-10-20','2026-10-21','2026-10-22','2026-10-23']);
  assert.equal(addDays('2026-12-30',4),'2027-01-03');
  assert.equal(addDays('2024-02-27',4),'2024-03-02');
  assert.equal(addDays('2026-10-23',-4),'2026-10-19');
  assert.equal(thaiShortDate('2026-10-19'),'19/10/2569');
});
test('SK09 validates identity, date interval, time order and exactly five rows',()=>{
  assert.equal(sk09Schema.safeParse(valid).success,true);
  for(const patch of [{name:''},{studentId:'abcdefghi'},{company:''},{department:''},{startDate:'2026-02-30'},{endDate:'2026-10-24'},{endDate:'2026-10-22'},{endTime:'07:00'},{endTime:'08:00'},{startTime:'25:00'},{days:valid.days.slice(0,4)},{days:[...valid.days,valid.days[0]]}]) {
    assert.equal(sk09Schema.safeParse({...valid,...patch}).success,false,JSON.stringify(patch));
  }
});
test('SK09 PDF has five rows, one shared time, and blank signing fields',()=>{
  const document=sk09Document(valid,'data:image/png;base64,placeholder');
  const content=document.content as Array<any>;
  const table=content.find(item=>item.table?.headerRows===1).table;
  assert.equal(table.body.length,6);
  assert.equal(table.dontBreakRows,true);
  for(let index=0;index<5;index++) {
    assert.equal(table.body[index+1][0].text,thaiShortDate(addDays(valid.startDate,index)));
    assert.equal(table.body[index+1][1].text,'08:00-17:00');
  }
  const signatures=content.find(item=>item.unbreakable).stack.map((item:any)=>item.text).join('\n');
  assert.match(signatures,/ลงชื่อ\.+\(ผู้ควบคุมการฝึกงาน\)/);
  assert.match(signatures,/ตำแหน่ง\.+/);assert.match(signatures,/วัน\/เดือน\/ปี\.+/);
  assert.ok(!signatures.includes(valid.name));
  const multiline=sk09Document({...valid,days:valid.days.map(day=>({...day,assignment:'รายการงาน\n'.repeat(20)}))},'data:image/png;base64,placeholder');
  assert.equal((multiline.content as Array<any>).find(item=>item.table?.headerRows===1).table.dontBreakRows,false);
});
