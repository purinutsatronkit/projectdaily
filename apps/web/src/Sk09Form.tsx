import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CalendarDays, Download, Eye, FileText, LoaderCircle, Save } from 'lucide-react';
import type { Sk09DraftController } from './useSk09Draft';
import { addDays, fiveDays, sk09Schema, thaiLongDate, type Sk09Data } from './sk09-model';
import { sk09PdfBlob } from './sk09-document';

type SuggestedDay={date:string;tasks:{id:string;title:string;description:string;status:string}[]};
export default function Sk09Form({draft,projectId}:{draft:Sk09DraftController;projectId:string|null}) {
  const {data}=draft;
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[preview,setPreview]=useState('');
  const [message,setMessage]=useState(''); const busyRef=useRef(false);
  const [suggestions,setSuggestions]=useState<SuggestedDay[]|null>(null),[suggestionBusy,setSuggestionBusy]=useState(false);
  const dates=data.startDate?fiveDays(data.startDate):[];
  useEffect(()=>()=>{if(preview) URL.revokeObjectURL(preview);},[preview]);
  function update(patch:Partial<Sk09Data>) {draft.update(patch);setPreview('');setError('');setMessage('');}
  async function loadSuggestions(){if(!data.startDate){setError('เลือกช่วงวันที่ก่อนดึงงาน');return;}setSuggestionBusy(true);setError('');try{const params=new URLSearchParams({start:data.startDate});if(projectId)params.set('project_id',projectId);const response=await fetch(`/api/tasks/sk09/suggestions?${params}`,{credentials:'same-origin'});const result=await response.json();if(!response.ok)throw new Error(result.error?.message??'ดึงงานไม่สำเร็จ');setSuggestions(result.days);}catch(err){setError(err instanceof Error?err.message:'ดึงงานไม่สำเร็จ');}finally{setSuggestionBusy(false);}}
  function applySuggestions(replace:boolean){if(!suggestions)return;const next=data.days.map((day,index)=>{const titles=suggestions[index]?.tasks.map(task=>task.title).join('\n')??'';return {...day,assignment:titles&&(replace||!day.assignment.trim())?titles.slice(0,600):day.assignment};});update({days:next});setSuggestions(null);setMessage('นำชื่องานมาใส่ในร่างแล้ว ตรวจและเขียนผลการฝึกงานด้วยตนเองก่อนดาวน์โหลด');}
  function changeDate(value:string,end=false) {
    if(!value) {update({startDate:'',endDate:''});return;}
    const start=end?addDays(value,-4):value;
    update({startDate:start,endDate:addDays(start,4)});setSuggestions(null);
  }
  async function generate(download:boolean) {
    if(busyRef.current) return;
    setError('');setMessage('');
    const parsed=sk09Schema.safeParse(data);
    if(!parsed.success) {setError(parsed.error.issues[0].message);return;}
    busyRef.current=true;setBusy(true);
    try {
      const blob=await sk09PdfBlob(parsed.data),url=URL.createObjectURL(blob);setPreview(url);
      if(download) {
        const anchor=document.createElement('a');anchor.href=url;anchor.download=`SK09-${data.studentId}-${data.startDate}.pdf`;
        document.body.appendChild(anchor);anchor.click();anchor.remove();setMessage('สร้างไฟล์ PDF แล้ว หากยังไม่เห็นไฟล์ ให้ตรวจรายการดาวน์โหลดของเบราว์เซอร์');
      } else setMessage('สร้างตัวอย่าง PDF แล้ว ตรวจรูปแบบด้านล่างก่อนดาวน์โหลดได้');
    } catch(err) {setError(err instanceof Error?err.message:'สร้าง PDF ไม่สำเร็จ กรุณาลองใหม่');}
    finally {setBusy(false);busyRef.current=false;}
  }
  function submit(event:FormEvent) {event.preventDefault();void generate(true);}
  return <div>
    <div className="page-intro"><p className="eyebrow">Cooperative education</p><h1 className="page-title">บันทึกสหกิจศึกษา สก.09<span className="text-[#a66a5f]">.</span></h1><p className="page-description">กรอกข้อมูลรายสัปดาห์ 5 วัน แล้วดาวน์โหลดเป็น PDF ตามแบบฟอร์ม</p></div>
    <div className="panel mt-6 flex flex-wrap items-center justify-between gap-4 p-5">
      <div><p role="status" className="text-sm font-medium text-teal-800">{!draft.ready?'กำลังโหลดร่าง':draft.saving?'กำลังบันทึกร่าง…':draft.dirty?'มีการแก้ไขที่ยังไม่บันทึก':draft.savedAt?`บันทึกร่างแล้ว · ${new Date(draft.savedAt).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})}`:'เริ่มกรอกเพื่อบันทึกร่างอัตโนมัติ'}</p><p className="mt-1 text-xs leading-6 text-slate-500">เก็บร่างล่าสุด 1 ฉบับในบัญชีของคุณ กรอกไม่ครบก็เก็บไว้ได้ และเปิดต่อจากเครื่องอื่นได้</p>
      {draft.error&&<div role="alert" className="mt-2 text-sm text-red-700">{draft.error}<button type="button" className="ml-2 underline" disabled={draft.saving} onClick={()=>{if(!draft.dirty||window.confirm('โหลดร่างจากระบบแทนข้อความที่ยังไม่บันทึกในหน้านี้?')) {setPreview('');void draft.reload();}}}>โหลดร่างล่าสุด</button></div>}</div>
      <button type="button" className="btn-secondary" disabled={!draft.ready||draft.saving||!draft.dirty} onClick={()=>void draft.save().catch(()=>{})}><Save size={18}/>บันทึกร่าง</button>
    </div>
    <fieldset disabled={!draft.ready}>
    <form onSubmit={submit} className="mt-7 space-y-6">
      <fieldset disabled={busy} className="panel space-y-5 p-5 sm:p-7"><legend className="sr-only">ข้อมูลนิสิตและสถานที่ฝึกงาน</legend><h2 className="flex items-center gap-2 text-lg font-semibold"><FileText size={20} className="text-teal-700"/>ข้อมูลนิสิตและสถานที่ฝึกงาน</h2>
        <div className="grid gap-5 sm:grid-cols-2"><label className="field-label">ชื่อ–สกุล<input className="field mt-2" autoComplete="name" value={data.name} onChange={event=>update({name:event.target.value})} minLength={2} maxLength={80} required/></label><label className="field-label">รหัสนิสิต<input className="field mt-2" inputMode="numeric" pattern="[0-9]{8,20}" title="รหัสนิสิตเป็นตัวเลข 8–20 หลัก" value={data.studentId} onChange={event=>update({studentId:event.target.value})} minLength={8} maxLength={20} required/></label>
          <label className="field-label">ฝึกงาน ณ บริษัท<input className="field mt-2" value={data.company} onChange={event=>update({company:event.target.value})} maxLength={120} required/></label><label className="field-label">แผนก<input className="field mt-2" value={data.department} onChange={event=>update({department:event.target.value})} maxLength={80} required/></label></div>
      </fieldset>
      <fieldset disabled={busy} className="panel space-y-5 p-5 sm:p-7"><legend className="sr-only">ช่วงวันที่และเวลาปฏิบัติงาน</legend><h2 className="flex items-center gap-2 text-lg font-semibold"><CalendarDays size={20} className="text-teal-700"/>ช่วงวันที่และเวลาปฏิบัติงาน</h2>
        <div className="grid gap-5 sm:grid-cols-2"><label className="field-label">ระหว่างวันที่<input type="date" className="field mt-2" value={data.startDate} min="1900-01-01" max="9999-12-27" onInput={event=>changeDate(event.currentTarget.value)} onChange={event=>changeDate(event.target.value)} required/></label><label className="field-label">ถึงวันที่<input type="date" className="field mt-2" value={data.endDate} min="1900-01-05" max="9999-12-31" onInput={event=>changeDate(event.currentTarget.value,true)} onChange={event=>changeDate(event.target.value,true)} required/></label></div>
        <p className="text-xs leading-6 text-slate-500">ช่วงวันต้องติดกัน 5 วัน รวมวันเริ่มต้นและสิ้นสุด เปลี่ยนด้านใดด้านหนึ่ง ระบบจะปรับอีกด้านให้อัตโนมัติ เช่น จันทร์ถึงศุกร์</p>
        <div className="grid gap-5 sm:grid-cols-2"><label className="field-label">เวลาเริ่มปฏิบัติงาน<input type="time" className="field mt-2" value={data.startTime} onInput={event=>update({startTime:event.currentTarget.value})} onChange={event=>update({startTime:event.target.value})} required/></label><label className="field-label">เวลาเลิกปฏิบัติงาน<input type="time" className="field mt-2" value={data.endTime} onInput={event=>update({endTime:event.currentTarget.value})} onChange={event=>update({endTime:event.target.value})} required/></label></div>
        <p className="text-xs text-slate-500">เลือกเวลาเพียงครั้งเดียว ใช้เหมือนกันทั้ง 5 วัน ค่าเริ่มต้น 08:00–17:00</p>
      </fieldset>
      <fieldset disabled={busy} className="panel overflow-hidden"><legend className="sr-only">บันทึกงานรายวัน</legend><div className="border-b border-slate-100 p-5 sm:px-7"><h2 className="text-lg font-semibold">บันทึกงานรายวัน</h2><p className="mt-2 text-xs leading-6 text-slate-500">กรอกงานที่ได้รับมอบหมายและผลการฝึกงานของแต่ละวัน หากเป็นวันหยุดให้ระบุในช่องงาน</p></div>
        <div className="border-b border-slate-100 p-5 sm:px-7"><button type="button" className="btn-secondary" disabled={!data.startDate||suggestionBusy} onClick={()=>void loadSuggestions()}>{suggestionBusy?'กำลังดึงงาน…':'นำงานจากปฏิทินมาช่วยกรอก'}</button><p className="mt-2 text-xs text-slate-500">ใช้วันครบกำหนดของงานในช่วง 5 วันที่เลือก และเฉพาะโปรเจกต์ที่เลือกไว้ ถ้ายังไม่ได้เลือกโปรเจกต์จะดูทุกงาน</p>{suggestions&&<div className="mt-3 rounded-xl border border-teal-100 bg-teal-50 p-4 text-sm"><p className="font-semibold">ตรวจงานที่จะนำเข้า</p>{suggestions.map(day=><p key={day.date} className="mt-2">{day.date}: {day.tasks.length?day.tasks.map(task=>task.title).join(', '):'ไม่มีงาน'}</p>)}<div className="mt-3 flex flex-wrap gap-2"><button type="button" className="btn-secondary" onClick={()=>applySuggestions(false)}>เติมเฉพาะช่องว่าง</button><button type="button" className="btn-secondary" onClick={()=>applySuggestions(true)}>แทนที่ช่องงานทั้ง 5 วัน</button><button type="button" className="btn-secondary" onClick={()=>setSuggestions(null)}>ยกเลิก</button></div></div>}</div>
        {data.days.map((day,index)=><div key={index} className="border-b border-slate-100 p-5 last:border-b-0 sm:p-7"><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">วันที่ {index+1}{dates[index]?` · ${thaiLongDate(dates[index])}`:''}</h3><span className="text-xs text-teal-700">{data.startTime||'--:--'}–{data.endTime||'--:--'}</span></div><div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
          <label className="field-label">งานที่ได้รับมอบหมาย วันที่ {index+1}<textarea className="field mt-2 min-h-32 resize-y" value={day.assignment} onChange={event=>update({days:data.days.map((item,i)=>i===index?{...item,assignment:event.target.value}:item)})} maxLength={600} placeholder="ระบุงานหรือกิจกรรมที่ทำในวันนี้"/><span className="mt-1 block text-right text-xs font-normal text-slate-400">{day.assignment.length}/600</span></label>
          <label className="field-label">ผลการฝึกงาน วันที่ {index+1}<textarea className="field mt-2 min-h-32 resize-y" value={day.result} onChange={event=>update({days:data.days.map((item,i)=>i===index?{...item,result:event.target.value}:item)})} maxLength={400} placeholder="ผลลัพธ์หรือสิ่งที่ได้เรียนรู้"/><span className="mt-1 block text-right text-xs font-normal text-slate-400">{day.result.length}/400</span></label>
        </div></div>)}
      </fieldset>
      <div className="panel p-5 sm:p-7"><p className="text-sm leading-7 text-slate-600">ช่องลงชื่อผู้ควบคุมการฝึกงาน ตำแหน่ง และวัน/เดือน/ปี จะเว้นว่างพร้อมเส้นประตามต้นฉบับสำหรับลงนามภายหลัง</p><p className="mt-2 text-xs leading-6 text-slate-500">PDF ใช้กระดาษ A4 และฝังฟอนต์ภาษาไทย หากกรอกข้อความยาวเอกสารอาจมีมากกว่า 1 หน้า ระบบเก็บร่างล่าสุด ส่วนไฟล์ PDF ให้ดาวน์โหลดเก็บไว้</p>
        {error&&<p role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p>}{message&&<p role="status" className="mt-4 text-sm text-teal-700">{message}</p>}
        <div className="mt-5 flex flex-wrap justify-end gap-3"><button type="button" className="btn-secondary" disabled={busy} onClick={()=>void generate(false)}><Eye size={18}/>ดูตัวอย่าง PDF</button><button type="submit" className="btn-primary" disabled={busy}>{busy?<LoaderCircle size={18} className="animate-spin"/>:<Download size={18}/>}ดาวน์โหลด PDF</button></div>
      </div>
    </form>
    </fieldset>
    {preview&&<section className="panel mt-6 overflow-hidden" aria-label="ตัวอย่าง PDF สก.09"><div className="border-b border-slate-100 p-5"><h2 className="font-semibold">ตัวอย่างก่อนพิมพ์</h2><a href={preview} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm text-teal-700 underline">เปิด PDF ในแท็บใหม่</a></div><iframe src={preview} title="ตัวอย่างแบบบันทึกสหกิจศึกษา สก.09" className="h-[800px] w-full border-0"/></section>}
  </div>;
}
