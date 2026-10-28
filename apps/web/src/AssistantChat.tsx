import { useEffect, useState, type FormEvent } from 'react';
import { Bot, Send, X } from 'lucide-react';
import type { User } from '@taskflow/shared';
import type { Sk09DraftController } from './useSk09Draft';

type View='all'|'today'|'sk09'|'github'|'account'|'integrations'|'guide';
type Proposed={type:string;id?:string|number;target?:string;url?:string;page?:View;data?:Record<string,unknown>;project_id?:string;repository?:string;kind?:'dispatch'|'rerun'|'cancel';ref?:string};
type Entry={role:'user'|'assistant';text:string};
const labels:Record<string,string>={create_task:'เพิ่มงาน',update_task:'แก้ไขงาน',delete_task:'ลบงาน',create_project:'สร้างโปรเจกต์',update_project:'แก้ไขโปรเจกต์',delete_project:'ลบโปรเจกต์',update_profile:'แก้ไขโปรไฟล์',update_sk09_draft:'แก้ร่าง สก.09',mark_notifications_read:'อ่านการแจ้งเตือนทั้งหมด',link_github_issue:'ผูกลิงก์ GitHub กับงาน',github_pipeline:'สั่ง GitHub Pipeline',navigate:'เปิดหน้า'};
async function request<T>(path:string,method='GET',data?:unknown):Promise<T>{
  const response=await fetch(`/api${path}`,{method,credentials:'same-origin',headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined});
  const result=response.status===204?undefined:await response.json().catch(()=>undefined);
  if(!response.ok)throw new Error(result?.error?.message??'ทำรายการไม่สำเร็จ กรุณาลองใหม่');
  return result as T;
}
function addFourDays(date:string){const value=new Date(`${date}T00:00:00Z`);value.setUTCDate(value.getUTCDate()+4);return value.toISOString().slice(0,10);}
export default function AssistantChat({user,draft,onNavigate,onChanged,onUserUpdated}:{user:User;draft:Sk09DraftController;onNavigate:(view:View)=>void;onChanged:()=>void;onUserUpdated:(user:User)=>void}){
  const [open,setOpen]=useState(false),[available,setAvailable]=useState<boolean|null>(null),[consent,setConsent]=useState(false),[input,setInput]=useState(''),[entries,setEntries]=useState<Entry[]>([]),[pending,setPending]=useState<Proposed|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{void request<{available:boolean}>('/assistant/status').then(v=>setAvailable(v.available)).catch(()=>setAvailable(false));},[]);
  async function ask(event:FormEvent){event.preventDefault();const message=input.trim();if(!message||busy)return;setInput('');setPending(null);setError('');setEntries(previous=>[...previous,{role:'user',text:message}]);setBusy(true);
    try{const history=entries.filter(entry=>entry.role==='user').slice(-4).map(entry=>entry.text);const result=await request<{reply:string;action:Proposed|null}>('/assistant/plan','POST',{message,history});setEntries(previous=>[...previous,{role:'assistant',text:result.reply}]);if(result.action?.type==='navigate'){onNavigate(result.action.page!);setEntries(previous=>[...previous,{role:'assistant',text:'เปิดหน้าที่เกี่ยวข้องแล้ว'}]);}else setPending(result.action);}
    catch(e){setError(e instanceof Error?e.message:'AI ตอบกลับไม่สำเร็จ');}finally{setBusy(false);}
  }
  async function confirm(){const action=pending;if(!action||busy)return;setBusy(true);setError('');try{
    let message='ทำรายการสำเร็จ';
    switch(action.type){
      case 'create_task': await request('/tasks','POST',{...action.data,project_id:action.project_id??null});break;
      case 'update_task': await request(`/tasks/${encodeURIComponent(action.id!)}`,'PATCH',{...action.data,...(action.project_id?{project_id:action.project_id}:{})});break;
      case 'delete_task': await request(`/tasks/${encodeURIComponent(action.id!)}`,'DELETE');break;
      case 'create_project': await request('/projects','POST',action.data);break;
      case 'update_project': await request(`/projects/${encodeURIComponent(action.id!)}`,'PATCH',action.data);break;
      case 'delete_project': await request(`/projects/${encodeURIComponent(action.id!)}`,'DELETE');break;
      case 'update_profile':{const result=await request<{user:User}>('/account','PATCH',{name:user.name,nickname:user.nickname??'',phone:user.phone??'',email:user.email,...action.data});onUserUpdated(result.user);break;}
      case 'update_sk09_draft':{const data={...action.data};if(typeof data.startDate==='string')data.endDate=addFourDays(data.startDate);draft.update(data);await draft.save();break;}
      case 'mark_notifications_read':await request('/notifications/read-all','POST');break;
      case 'link_github_issue':await request(`/tasks/${encodeURIComponent(action.id!)}/links`,'POST',{url:action.url});break;
      case 'github_pipeline':{
        const [owner,repo]=String(action.repository).split('/');
        const root=`/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
        const path=action.kind==='dispatch'?`${root}/workflows/${action.id}/dispatch`:`${root}/runs/${action.id}/${action.kind}`;
        await request(path,'POST',action.kind==='dispatch'?{confirm:true,ref:action.ref,inputs:{}}:{confirm:true});break;
      }
      default:throw new Error('คำสั่งนี้ยังไม่รองรับ');
    }
    setPending(null);onChanged();setEntries(previous=>[...previous,{role:'assistant',text:message}]);
  }catch(e){setError(e instanceof Error?e.message:'ทำรายการไม่สำเร็จ');}finally{setBusy(false);}}
  return <>
    <button type="button" onClick={()=>setOpen(value=>!value)} className="fixed bottom-5 right-5 z-40 flex h-14 items-center gap-2 rounded-full bg-teal-700 px-5 text-sm font-semibold text-white shadow-xl hover:bg-teal-800" aria-label={open?'ปิดแชท AI':'เปิดแชท AI'} aria-expanded={open}><Bot size={22}/>ถาม AI</button>
    {open&&<section aria-label="ผู้ช่วย AI" className="fixed bottom-24 right-3 z-40 flex h-[min(680px,calc(100dvh-120px))] w-[min(420px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-teal-100 bg-white shadow-2xl sm:right-5">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4"><div><h2 className="font-semibold">ผู้ช่วย TaskFlow</h2><p className="mt-1 text-xs text-slate-500">พิมพ์สั่งงาน แล้วตรวจและยืนยันก่อนบันทึก</p></div><button type="button" className="icon-button" aria-label="ปิดแชท AI" onClick={()=>setOpen(false)}><X size={18}/></button></div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
        {available===false&&<p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">ยังไม่ได้ตั้งค่า GEMINI_API_KEY บนเซิร์ฟเวอร์</p>}
        {entries.length===0&&<div className="rounded-xl bg-teal-50 p-4 text-sm leading-6 text-teal-900"><p>ลองพิมพ์ “เพิ่มงานส่งรายงานวันที่ 7 มกราปีหน้า” หรือ “มีงานค้างกี่งาน”</p><p className="mt-2 text-xs">ส่งข้อความที่คุณพิมพ์และข้อความก่อนหน้าสูงสุด 4 รายการให้ Gemini ข้อมูลบัญชีและรายการงานถูกค้นหาภายใน TaskFlow</p></div>}
        {entries.map((entry,index)=><div key={index} className={`whitespace-pre-wrap break-words rounded-xl p-3 text-sm leading-6 ${entry.role==='user'?'ml-8 bg-teal-700 text-white':'mr-8 bg-slate-100 text-slate-800'}`}>{entry.text}</div>)}
        {pending&&<div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm"><p className="font-semibold text-amber-900">ตรวจคำสั่ง: {labels[pending.type]??pending.type}</p><pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all text-xs text-amber-950">{JSON.stringify(pending,null,2)}</pre><div className="mt-3 flex gap-2"><button type="button" className="btn-primary !py-2 !text-xs" disabled={busy} onClick={()=>void confirm()}>ยืนยันและบันทึก</button><button type="button" className="btn-secondary !py-2 !text-xs" disabled={busy} onClick={()=>setPending(null)}>ยกเลิก</button></div></div>}
        {busy&&<p role="status" className="text-sm text-slate-500">กำลังดำเนินการ…</p>}{error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      </div>
      <form onSubmit={ask} className="border-t border-slate-100 p-3"><label className="mb-2 flex items-start gap-2 text-[11px] leading-5 text-slate-600"><input type="checkbox" checked={consent} onChange={event=>setConsent(event.target.checked)} className="mt-1"/>ยินยอมส่งข้อความนี้และข้อความก่อนหน้าสูงสุด 4 รายการให้ Gemini; Free Tier อาจใช้เนื้อหาเพื่อปรับปรุงบริการของ Google</label><div className="flex gap-2"><label className="sr-only" htmlFor="assistant-message">คำสั่งสำหรับ AI</label><input id="assistant-message" className="field min-w-0 flex-1 !py-2" value={input} onChange={event=>setInput(event.target.value)} maxLength={600} placeholder="พิมพ์คำสั่ง…" disabled={busy||available===false}/><button className="btn-primary !px-3 !py-2" aria-label="ส่งคำสั่ง AI" disabled={busy||available===false||!input.trim()||!consent}><Send size={18}/></button></div></form>
    </section>}
  </>;
}
