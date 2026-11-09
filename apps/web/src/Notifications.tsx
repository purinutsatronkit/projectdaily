import { useEffect, useRef, useState } from 'react';
import { Bell, CalendarDays, CheckCheck, LoaderCircle, RefreshCw, X } from 'lucide-react';
import { PRIORITY_LABELS, type Task } from '@taskflow/shared';

interface NotificationTask extends Task { notification_id: string; notification_date: string }
interface Data { today: string; through: string; tasks: NotificationTask[]; count: number }
interface PipelineNotification {id:string;project_id:string|null;repository:string;run_id:string;title:string;created_at:string}
interface MentionNotification {id:string;task_id:string;task_title:string;project_id:string|null;body:string;author_name:string;created_at:string}

function notificationReadPath(task?: NotificationTask, alert?: PipelineNotification) {
  if (alert) return '/api/github/alerts/' + encodeURIComponent(alert.id) + '/read';
  if (task) return '/api/notifications/' + encodeURIComponent(task.notification_id) + '/read';
  return '/api/notifications/read-all';
}

function removeReadItem<T>(items: T[], retain: boolean, matches?: (item: T) => boolean) {
  if (matches) return items.filter(item => !matches(item));
  return retain ? items : [];
}

function notificationTiming(dueDate: string | null, today: string) {
  const days = Math.round((Date.parse(dueDate + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000);
  if (dueDate! < today) return { tone: 'overdue', color: 'text-red-700', label: 'เลยกำหนด ' + Math.abs(days) + ' วัน' };
  if (dueDate === today) return { tone: 'today', color: 'text-amber-700', label: 'ต้องส่งวันนี้' };
  return { tone: 'soon', color: 'text-teal-700', label: 'ต้องส่งในอีก ' + days + ' วัน' };
}

async function fetchNotificationData(signal: AbortSignal, onExpired: () => void): Promise<Data | undefined> {
  const response = await fetch('/api/notifications', { credentials: 'same-origin', signal });
  if (response.status === 401) {
    onExpired();
    return;
  }
  if (!response.ok) throw new Error('โหลดการแจ้งเตือนไม่สำเร็จ');
  return response.json();
}

async function loadSecondaryNotifications(
  signal: AbortSignal, isCurrent: () => boolean,
  setMentions: (items: MentionNotification[]) => void, setChatUnread: (count: number) => void,
) {
  const options = { credentials: 'same-origin' as const, signal };
  const [mentions, chat] = await Promise.all([
    fetch('/api/notifications/mentions', options), fetch('/api/chat/unread', options),
  ]);
  if (!isCurrent()) return;
  if (mentions.ok) setMentions((await mentions.json()).mentions);
  if (chat.ok) setChatUnread((await chat.json()).count);
}

async function loadPipelineNotifications(
  signal: AbortSignal, isCurrent: () => boolean, onExpired: () => void,
  lastCheck: { current: number }, setPipeline: (items: PipelineNotification[]) => void,
  setError: (error: string) => void,
) {
  if (Date.now() - lastCheck.current < 300000) return;
  lastCheck.current = Date.now();
  try {
    const response = await fetch('/api/github/alerts', { credentials: 'same-origin', signal });
    if (response.status === 401) {
      onExpired();
      return;
    }
    if (!response.ok) throw new Error('โหลดสถานะ GitHub ไม่สำเร็จ');
    const info = await response.json();
    if (!isCurrent()) return;
    setPipeline(info.notifications);
    setError(info.failures ? 'ตรวจ pipeline บาง repository ไม่สำเร็จ ตรวจสิทธิ์ GitHub App' : '');
  } catch (error) {
    if (signal.aborted) lastCheck.current = 0;
    else if (isCurrent()) setError(error instanceof Error ? error.message : 'โหลดสถานะ GitHub ไม่สำเร็จ');
  }
}

async function finishNotificationLoad(
  work: () => Promise<void>, isCurrent: () => boolean,
  setError: (error: string) => void, setLoading: (loading: boolean) => void,
) {
  try {
    await work();
  } catch (error) {
    if (isCurrent()) setError(error instanceof Error ? error.message : 'โหลดการแจ้งเตือนไม่สำเร็จ');
  } finally {
    if (isCurrent()) setLoading(false);
  }
}

function canRefreshNotifications(force: boolean, lastCheck: number) {
  return document.visibilityState !== 'hidden' && (force || Date.now() - lastCheck >= 15000);
}

export default function Notifications({ revision, onSelect, onGitHub, onMention, onChat, onExpired }: { revision: number; onSelect: (task: Task) => void; onGitHub:(projectId:string|null)=>void; onMention:(taskId:string,projectId:string|null)=>void; onChat:()=>void; onExpired: () => void }) {
  const [open,setOpen] = useState(false), [data,setData] = useState<Data | null>(null);
  const [pipeline,setPipeline]=useState<PipelineNotification[]>([]),[pipelineError,setPipelineError]=useState('');
  const [mentions,setMentions]=useState<MentionNotification[]>([]),[chatUnread,setChatUnread]=useState(0);
  const [loading,setLoading] = useState(true), [error,setError] = useState(''), [retry,setRetry] = useState(0);
  const [reading,setReading]=useState(false);
  const currentLoad=useRef<AbortController | null>(null);
  const hasLoaded=useRef(false), lastTaskCheck=useRef(0), lastGitHubCheck=useRef(0);
  const root = useRef<HTMLDivElement>(null), button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let active = true, current: AbortController | undefined;
    async function load(forceTask=false) {
      if (!canRefreshNotifications(forceTask, lastTaskCheck.current)) return;
      lastTaskCheck.current=Date.now();
      current?.abort(); const controller = new AbortController(); current = controller;
      currentLoad.current=controller;
      if(!hasLoaded.current)setLoading(true);
      const isCurrent = () => active && !controller.signal.aborted;
      await finishNotificationLoad(async () => {
        const result = await fetchNotificationData(controller.signal, onExpired);
        if (!result || !isCurrent()) return;
        hasLoaded.current = true;
        setData(result);
        setError('');
        setLoading(false);
        await loadSecondaryNotifications(controller.signal, isCurrent, setMentions, setChatUnread);
        await loadPipelineNotifications(controller.signal, isCurrent, onExpired, lastGitHubCheck, setPipeline, setPipelineError);
      }, isCurrent, setError, setLoading);
    }
    void load(true); const timer=window.setInterval(()=>void load(),60000);
    const focus=()=>void load(); window.addEventListener('focus',focus);
    return ()=>{active=false;current?.abort();window.clearInterval(timer);window.removeEventListener('focus',focus);};
  },[revision,retry,onExpired]);
  useEffect(()=>{
    if(!open) return;
    const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node)) setOpen(false);};
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){setOpen(false);button.current?.focus();}};
    document.addEventListener('pointerdown',outside); document.addEventListener('keydown',escape);
    return ()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
  },[open]);
  function applyReadState(task?: NotificationTask, alert?: PipelineNotification) {
    setData(previous=>{
      if(!previous) return previous;
      const tasks = removeReadItem(previous.tasks, Boolean(alert), task && (item => item.notification_id === task.notification_id));
      return {...previous,tasks,count:tasks.length};
    });
    setPipeline(previous => removeReadItem(previous, Boolean(task), alert && (item => item.id === alert.id)));
    if(!task&&!alert)setMentions([]);
    if(task || alert) setOpen(false);
    if(task) onSelect(task);
    if(alert) onGitHub(alert.project_id);
  }
  async function markRead(task?:NotificationTask,alert?:PipelineNotification) {
    if(reading) return;
    currentLoad.current?.abort();setReading(true);setLoading(false);setError('');
    let saved=false;
    try {
      const response=await fetch(notificationReadPath(task, alert),{method:task||alert?'PATCH':'POST',credentials:'same-origin'});
      if(response.status===401) {onExpired();return;}
      if(!response.ok) throw new Error('บันทึกการอ่านไม่สำเร็จ กรุณาลองอีกครั้ง');
      saved=true;
      applyReadState(task, alert);
    } catch(err) {setError(err instanceof Error?err.message:'บันทึกการอ่านไม่สำเร็จ');}
    finally {setReading(false);if(saved)setRetry(value=>value+1);}
  }
  async function openMention(item:MentionNotification){try{const response=await fetch(`/api/notifications/mentions/${item.id}/read`,{method:'PATCH',credentials:'same-origin'});if(!response.ok) { throw new Error('บันทึกการอ่านไม่สำเร็จ'); }setMentions(previous=>previous.filter(v=>v.id!==item.id));setOpen(false);onMention(item.task_id,item.project_id);}catch(e){setError((e as Error).message);}}
  const count=(data?.count || 0)+pipeline.length+mentions.length+chatUnread;
  function renderNotifications() {
    if (error) return (<div role="alert" className="p-5 text-sm text-red-700"><p>{error}</p><button className="mt-3 underline" onClick={()=>setRetry(value=>value+1)}>ลองอีกครั้ง</button></div>);
    if (loading && !data) return (<div className="flex items-center justify-center gap-2 p-8 text-sm text-slate-500"><LoaderCircle size={18} className="animate-spin"/>กำลังโหลด</div>);
    if (!count) return (<div className="p-8 text-center"><CheckCheck className="mx-auto text-teal-600" size={28}/><p className="mt-3 text-sm font-medium">ไม่มีการแจ้งเตือนที่ยังไม่อ่าน</p><p className="mt-2 text-xs leading-6 text-slate-500">รอบใหม่เริ่ม 07:00 น. หากยังมีงานใกล้ส่งหรือเลยกำหนด ระบบจะเตือนอีกครั้ง</p></div>);
    return (<>{chatUnread>0&&<button type="button" className="notification-item" onClick={()=>{setOpen(false);onChat();}}><span className="notification-dot notification-dot-soon"/><span className="min-w-0 flex-1 text-left text-sm font-semibold">ข้อความส่วนตัวใหม่ {chatUnread} ข้อความ</span></button>}{mentions.map(item=><button type="button" key={item.id} className="notification-item" onClick={()=>void openMention(item)}><span className="notification-dot notification-dot-soon"/><span className="min-w-0 flex-1 text-left"><span className="block text-xs font-semibold text-teal-700">{item.author_name} กล่าวถึงคุณ</span><span className="mt-1 block text-sm font-semibold">{item.task_title}</span><span className="mt-1 block truncate text-xs text-slate-500">{item.body}</span></span></button>)}{data?.tasks.map(task=>{
          const timing = notificationTiming(task.due_date, data.today);
          return <button type="button" key={task.notification_id} className="notification-item" disabled={reading} onClick={()=>void markRead(task)}>
            <span className={`notification-dot notification-dot-${timing.tone}`} aria-hidden="true"/>
            <span className="min-w-0 flex-1"><span className={`block text-xs font-semibold ${timing.color}`}>{timing.label}</span><span className="mt-1 block break-words text-sm font-semibold">{task.title}</span><span className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500"><CalendarDays size={13}/>{new Intl.DateTimeFormat('th-TH',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Bangkok'}).format(new Date(`${task.due_date}T00:00:00+07:00`))}<span className={`priority-badge priority-${task.priority}`}>{PRIORITY_LABELS[task.priority]}</span></span></span>
          </button>;
        })}{pipeline.map(alert=><button type="button" key={alert.id} className="notification-item" disabled={reading} onClick={()=>void markRead(undefined,alert)}><span className="notification-dot notification-dot-overdue"/><span className="min-w-0 flex-1 text-left"><span className="block text-xs font-semibold text-red-700">GitHub pipeline ไม่ผ่าน</span><span className="mt-1 block break-words text-sm font-semibold">{alert.title}</span><span className="mt-1 block text-xs text-slate-500">{alert.repository} · Run #{alert.run_id}</span></span></button>)}</>);
  }
  return <div ref={root} className="relative">
    <button ref={button} type="button" className="icon-button relative !h-10 !w-10" aria-label={error ? 'การแจ้งเตือน โหลดไม่สำเร็จ' : `การแจ้งเตือน ยังไม่อ่าน ${count} รายการ`} aria-expanded={open} aria-controls="task-notifications" onClick={()=>setOpen(value=>!value)}>
      <Bell size={20}/>{error ? <span className="notification-count">!</span> : count>0 && <span className="notification-count">{count>99?'99+':count}</span>}
    </button>
    {open && <section id="task-notifications" aria-label="การแจ้งเตือนงาน" className="notification-panel">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5"><div><h2 className="font-semibold">การแจ้งเตือน</h2><p className="mt-1 text-xs leading-6 text-slate-500">งานรายวัน 07:00 น. · pipeline ล้มเหลวเมื่อสถานะเปลี่ยน</p><p className="text-xs leading-6 text-slate-500">งานเลยกำหนด วันนี้ และอีก 3 วันข้างหน้า</p>{pipelineError&&<p className="text-xs text-amber-700">{pipelineError}</p>}</div><button type="button" className="icon-button shrink-0" aria-label="ปิดการแจ้งเตือน" onClick={()=>{setOpen(false);button.current?.focus();}}><X size={17}/></button></div>
      <div className="max-h-[55dvh] overflow-y-auto overscroll-contain">
        {renderNotifications()}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3"><span className="text-xs text-slate-500">ยังไม่อ่าน {count} รายการ</span><div className="flex items-center gap-2">{count-chatUnread>0&&<button type="button" className="text-xs font-semibold text-teal-700 underline" disabled={reading||loading} onClick={()=>void markRead()}>อ่านการแจ้งเตือนทั้งหมด</button>}<button type="button" className="icon-button" aria-label="รีเฟรชการแจ้งเตือน" disabled={loading||reading} onClick={()=>{lastGitHubCheck.current=0;setRetry(value=>value+1);}}><RefreshCw size={16} className={loading?'animate-spin':''}/></button></div></div>
    </section>}
  </div>;
}
