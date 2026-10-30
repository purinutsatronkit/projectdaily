import {useState} from 'react';
import {Clock3,RefreshCw} from 'lucide-react';

type Change={field:string;from:string|null;to:string|null};
type Entry={id:string;task_id:string;task_title:string;event:'created'|'updated'|'deleted';changes:string;created_at:string;actor_name:string};
const fields:Record<string,string>={title:'ชื่องาน',description:'รายละเอียด',priority:'ความสำคัญ',status:'สถานะ',due_date:'วันส่ง',project_id:'โปรเจกต์',assigned_to:'ผู้รับผิดชอบ'};
const values:Record<string,string>={high:'สูง',medium:'ปกติ',low:'ต่ำ',pending:'ยังไม่เริ่ม',in_progress:'กำลังทำ',completed:'เสร็จแล้ว'};
function label(value:string|null){return value===null||value===''?'ไม่ระบุ':values[value]??value;}

export default function TaskHistory({taskId,projectId}:{taskId?:string;projectId?:string}){
  const [open,setOpen]=useState(false),[history,setHistory]=useState<Entry[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState('');
  async function load(){
    setLoading(true);setError('');
    try{const response=await fetch(taskId?`/api/tasks/${taskId}/history`:`/api/shared-projects/${projectId}/activity`,{credentials:'same-origin'});const data=await response.json();if(!response.ok)throw new Error(data?.error?.message??'โหลดประวัติไม่สำเร็จ');setHistory(data.history);}
    catch(e){setError((e as Error).message);}finally{setLoading(false);}
  }
  return <section className="rounded-xl border border-slate-200 bg-white/70 p-3 text-sm">
    <div className="flex items-center justify-between gap-2"><button type="button" className="inline-flex items-center gap-2 font-medium text-slate-700 hover:text-red-700" aria-expanded={open} onClick={()=>{setOpen(!open);if(!open)void load();}}><Clock3 size={16}/>ประวัติการเปลี่ยนแปลง{projectId?'ในโปรเจกต์':''}</button>{open&&<button type="button" className="text-slate-500 hover:text-red-700" onClick={()=>void load()} aria-label="รีเฟรชประวัติ" disabled={loading}><RefreshCw size={15}/></button>}</div>
    {open&&<div className="mt-3 border-t border-slate-100 pt-3">{loading?<p className="text-slate-500">กำลังโหลด...</p>:error?<p role="alert" className="text-red-700">{error}</p>:history.length?<ol className="max-h-72 space-y-3 overflow-y-auto">{history.map(entry=>{let changes:Change[]=[];try{changes=JSON.parse(entry.changes);}catch{/* Older malformed records have no field detail. */}return <li key={entry.id} className="border-l-2 border-red-200 pl-3"><div className="flex flex-wrap items-baseline justify-between gap-1"><strong className="text-slate-800">{entry.actor_name} {entry.event==='created'?'สร้างงาน':entry.event==='deleted'?'ลบงาน':'แก้ไขงาน'}{projectId&&` “${entry.task_title}”`}</strong><time className="text-xs text-slate-500" dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString('th-TH',{dateStyle:'medium',timeStyle:'short'})}</time></div>{changes.map((change,index)=><p key={`${change.field}-${index}`} className="mt-1 break-words text-xs text-slate-600"><span className="font-medium">{fields[change.field]??change.field}:</span> {label(change.from)} → {label(change.to)}</p>)}</li>;})}</ol>:<p className="text-slate-500">ยังไม่มีประวัติ เริ่มบันทึกตั้งแต่เปิดใช้ฟีเจอร์นี้</p>}</div>}
  </section>;
}
