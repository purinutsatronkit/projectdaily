import { z } from 'zod';
import { dateSchema } from '@taskflow/shared';

export function addDays(date:string, count:number) {
  const result=new Date(`${date}T00:00:00Z`); result.setUTCDate(result.getUTCDate()+count);
  return result.toISOString().slice(0,10);
}
export function fiveDays(start:string) { return Array.from({length:5},(_,index)=>addDays(start,index)); }
export const sk09Schema=z.object({
  name:z.string().trim().min(2,'กรุณากรอกชื่อ–สกุล').max(80,'ชื่อยาวเกิน 80 ตัวอักษร'),
  studentId:z.string().trim().regex(/^\d{8,20}$/,'รหัสนิสิตต้องเป็นตัวเลข 8–20 หลัก'),
  company:z.string().trim().min(1,'กรุณากรอกบริษัท').max(120),
  department:z.string().trim().min(1,'กรุณากรอกแผนก').max(80),
  startDate:z.string().min(1,'กรุณาเลือกวันเริ่มต้น').pipe(dateSchema), endDate:z.string().min(1,'กรุณาเลือกวันสิ้นสุด').pipe(dateSchema),
  startTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/,'กรุณาเลือกเวลาเริ่มปฏิบัติงาน'), endTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/,'กรุณาเลือกเวลาเลิกปฏิบัติงาน'),
  days:z.array(z.object({assignment:z.string().trim().max(600,'งานที่ได้รับมอบหมายยาวเกิน 600 ตัวอักษร'),result:z.string().trim().max(400,'ผลการฝึกงานยาวเกิน 400 ตัวอักษร')})).length(5),
}).superRefine((value,context)=>{
  if(dateSchema.safeParse(value.startDate).success && value.endDate!==addDays(value.startDate,4)) context.addIssue({code:'custom',path:['endDate'],message:'ต้องเลือกช่วงวันที่ติดกัน 5 วันเท่านั้น'});
  if(value.endTime<=value.startTime) context.addIssue({code:'custom',path:['endTime'],message:'เวลาเลิกงานต้องหลังเวลาเริ่มงาน'});
});
export type Sk09Data=z.infer<typeof sk09Schema>;
export const thaiLongDate=(date:string)=>new Intl.DateTimeFormat('th-TH',{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Bangkok'}).format(new Date(`${date}T12:00:00+07:00`));
export const thaiShortDate=(date:string)=>{const [year,month,day]=date.split('-').map(Number);return `${day}/${String(month).padStart(2,'0')}/${year+543}`;};
