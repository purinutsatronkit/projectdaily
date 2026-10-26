import { useEffect, useRef, useState } from 'react';
import { Bell, CalendarDays, CheckCheck, LoaderCircle, RefreshCw, X } from 'lucide-react';
import { PRIORITY_LABELS, type Task } from '@taskflow/shared';

interface NotificationTask extends Task { notification_id: string; notification_date: string }
interface Data { today: string; through: string; tasks: NotificationTask[]; count: number }
interface PipelineNotification {id:string;project_id:string|null;repository:string;run_id:string;title:string;created_at:string}
export default function Notifications({ revision, onSelect, onGitHub, onExpired }: { revision: number; onSelect: (task: Task) => void; onGitHub:(projectId:string|null)=>void; onExpired: () => void }) {
  const [open,setOpen] = useState(false), [data,setData] = useState<Data | null>(null);
  const [pipeline,setPipeline]=useState<PipelineNotification[]>([]),[pipelineError,setPipelineError]=useState('');
  const [loading,setLoading] = useState(true), [error,setError] = useState(''), [retry,setRetry] = useState(0);
  const [reading,setReading]=useState(false);
  const currentLoad=useRef<AbortController | null>(null);
  const root = useRef<HTMLDivElement>(null), button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let active = true, current: AbortController | undefined;
    async function load() {
      current?.abort(); const controller = new AbortController(); current = controller;
      currentLoad.current=controller;
      setLoading(true);
      try {
        const response = await fetch('/api/notifications',{credentials:'same-origin',signal:controller.signal});
        if(response.status===401) { onExpired(); return; }
        if(!response.ok) throw new Error('โหลดการแจ้งเตือนไม่สำเร็จ');
        const result: Data = await response.json();
        if(active && !controller.signal.aborted) { setData(result); setError(''); }
        try{const github=await fetch('/api/github/alerts',{credentials:'same-origin',signal:controller.signal});if(github.status===401){onExpired();return;}if(!github.ok)throw new Error('โหลดสถานะ GitHub ไม่สำเร็จ');const info=await github.json();if(active&&!controller.signal.aborted){setPipeline(info.notifications);setPipelineError(info.failures?'ตรวจ pipeline บาง repository ไม่สำเร็จ ตรวจสิทธิ์ GitHub App':'' );}}catch(err){if(active&&!controller.signal.aborted)setPipelineError(err instanceof Error?err.message:'โหลดสถานะ GitHub ไม่สำเร็จ');}
      } catch(err) { if(active && !controller.signal.aborted) setError(err instanceof Error ? err.message : 'โหลดการแจ้งเตือนไม่สำเร็จ'); }
      finally { if(active && !controller.signal.aborted) setLoading(false); }
    }
    void load(); const timer=window.setInterval(()=>void load(),60000);
    const focus=()=>void load(); window.addEventListener('focus',focus);
    return ()=>{active=false;current?.abort();window.clearInterval(timer);window.removeEventListener('focus',focus);};
  },[revision,retry,open,onExpired]);
  useEffect(()=>{
    if(!open) return;
    const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node)) setOpen(false);};
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){setOpen(false);button.current?.focus();}};
    document.addEventListener('pointerdown',outside); document.addEventListener('keydown',escape);
    return ()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
  },[open]);
  async function markRead(task?:NotificationTask,alert?:PipelineNotification) {
    if(reading) return;
    currentLoad.current?.abort();setReading(true);setLoading(false);setError('');
    let saved=false;
    try {
      const response=await fetch(alert?`/api/github/alerts/${encodeURIComponent(alert.id)}/read`:task?`/api/notifications/${encodeURIComponent(task.notification_id)}/read`:'/api/notifications/read-all',{method:task||alert?'PATCH':'POST',credentials:'same-origin'});
      if(response.status===401) {onExpired();return;}
      if(!response.ok) throw new Error('บันทึกการอ่านไม่สำเร็จ กรุณาลองอีกครั้ง');
      saved=true;
      setData(previous=>{
        if(!previous) return previous;
        const tasks=task?previous.tasks.filter(item=>item.notification_id!==task.notification_id):alert?previous.tasks:[];
        return {...previous,tasks,count:tasks.length};
      });
      setPipeline(previous=>alert?previous.filter(item=>item.id!==alert.id):task?previous:[]);
      if(task) {setOpen(false);onSelect(task);}
      if(alert){setOpen(false);onGitHub(alert.project_id);}
    } catch(err) {setError(err instanceof Error?err.message:'บันทึกการอ่านไม่สำเร็จ');}
    finally {setReading(false);if(saved)setRetry(value=>value+1);}
  }
  const count=(data?.count || 0)+pipeline.length;
  return <div ref={root} className="relative">
    <button ref={button} type="button" className="icon-button relative !h-10 !w-10" aria-label={error ? 'การแจ้งเตือน โหลดไม่สำเร็จ' : `การแจ้งเตือน ยังไม่อ่าน ${count} รายการ`} aria-expanded={open} aria-controls="task-notifications" onClick={()=>setOpen(value=>!value)}>
      <Bell size={20}/>{error ? <span className="notification-count">!</span> : count>0 && <span className="notification-count">{count>99?'99+':count}</span>}
    </button>
    {open && <section id="task-notifications" aria-label="การแจ้งเตือนงาน" className="notification-panel">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5"><div><h2 className="font-semibold">การแจ้งเตือน</h2><p className="mt-1 text-xs leading-6 text-slate-500">งานรายวัน 07:00 น. · pipeline ล้มเหลวเมื่อสถานะเปลี่ยน</p><p className="text-xs leading-6 text-slate-500">งานเลยกำหนด วันนี้ และอีก 3 วันข้างหน้า</p>{pipelineError&&<p className="text-xs text-amber-700">{pipelineError}</p>}</div><button type="button" className="icon-button shrink-0" aria-label="ปิดการแจ้งเตือน" onClick={()=>{setOpen(false);button.current?.focus();}}><X size={17}/></button></div>
      <div className="max-h-[55dvh] overflow-y-auto overscroll-contain">
        {error ? <div role="alert" className="p-5 text-sm text-red-700"><p>{error}</p><button className="mt-3 underline" onClick={()=>setRetry(value=>value+1)}>ลองอีกครั้ง</button></div>
        : loading && !data ? <div className="flex items-center justify-center gap-2 p-8 text-sm text-slate-500"><LoaderCircle size={18} className="animate-spin"/>กำลังโหลด</div>
        : !count ? <div className="p-8 text-center"><CheckCheck className="mx-auto text-teal-600" size={28}/><p className="mt-3 text-sm font-medium">ไม่มีการแจ้งเตือนที่ยังไม่อ่าน</p><p className="mt-2 text-xs leading-6 text-slate-500">รอบใหม่เริ่ม 07:00 น. หากยังมีงานใกล้ส่งหรือเลยกำหนด ระบบจะเตือนอีกครั้ง</p></div>
        : <>{data?.tasks.map(task=>{
          const overdue=task.due_date!<data.today, today=task.due_date===data.today;
          const days=Math.round((Date.parse(`${task.due_date}T00:00:00Z`)-Date.parse(`${data.today}T00:00:00Z`))/86400000);
          return <button type="button" key={task.notification_id} className="notification-item" disabled={reading} onClick={()=>void markRead(task)}>
            <span className={`notification-dot notification-dot-${overdue?'overdue':today?'today':'soon'}`} aria-hidden="true"/>
            <span className="min-w-0 flex-1"><span className={`block text-xs font-semibold ${overdue?'text-red-700':today?'text-amber-700':'text-teal-700'}`}>{overdue?`เลยกำหนด ${Math.abs(days)} วัน`:today?'ต้องส่งวันนี้':`ต้องส่งในอีก ${days} วัน`}</span><span className="mt-1 block break-words text-sm font-semibold">{task.title}</span><span className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500"><CalendarDays size={13}/>{new Intl.DateTimeFormat('th-TH',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Bangkok'}).format(new Date(`${task.due_date}T00:00:00+07:00`))}<span className={`priority-badge priority-${task.priority}`}>{PRIORITY_LABELS[task.priority]}</span></span></span>
          </button>;
        })}{pipeline.map(alert=><button type="button" key={alert.id} className="notification-item" disabled={reading} onClick={()=>void markRead(undefined,alert)}><span className="notification-dot notification-dot-overdue"/><span className="min-w-0 flex-1 text-left"><span className="block text-xs font-semibold text-red-700">GitHub pipeline ไม่ผ่าน</span><span className="mt-1 block break-words text-sm font-semibold">{alert.title}</span><span className="mt-1 block text-xs text-slate-500">{alert.repository} · Run #{alert.run_id}</span></span></button>)}</>}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3"><span className="text-xs text-slate-500">ยังไม่อ่าน {count} รายการ</span><div className="flex items-center gap-2">{count>0&&<button type="button" className="text-xs font-semibold text-teal-700 underline" disabled={reading||loading} onClick={()=>void markRead()}>อ่านทั้งหมด</button>}<button type="button" className="icon-button" aria-label="รีเฟรชการแจ้งเตือน" disabled={loading||reading} onClick={()=>setRetry(value=>value+1)}><RefreshCw size={16} className={loading?'animate-spin':''}/></button></div></div>
    </section>}
  </div>;
}
