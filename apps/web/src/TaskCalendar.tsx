import { useEffect, useState } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Plus, RefreshCw } from 'lucide-react';
import { PRIORITY_LABELS, TASK_STATUS_LABELS, type Task } from '@taskflow/shared';
import { bangkokToday, monthCalendar, shiftMonth } from './calendar-model';

export default function TaskCalendar({ tasks, loading, error, onRefresh, onSelect, onCreate }: {
  tasks:Task[];loading:boolean;error:string;onRefresh:()=>void;onSelect:(task:Task)=>void;onCreate:(date:string)=>void;
}) {
  const [today,setToday]=useState(bangkokToday);
  const [selectedMonth,setSelectedMonth]=useState<string | null>(null);
  const month=selectedMonth ?? today.slice(0,7);
  const currentMonth=month===today.slice(0,7);
  useEffect(()=>{const timer=window.setInterval(()=>setToday(bangkokToday()),60000); return ()=>window.clearInterval(timer);},[]);
  const {cells,monthTasks}=monthCalendar(`${month}-01`,tasks);
  const monthLabel=new Intl.DateTimeFormat('th-TH',{month:'long',year:'numeric',timeZone:'Asia/Bangkok'}).format(new Date(`${month}-01T12:00:00+07:00`));
  const todayCount=monthTasks.filter(task=>task.due_date===today && task.status!=='completed').length;
  const remaining=monthTasks.filter(task=>task.status!=='completed').length;
  return <div>
    <div className="page-intro flex flex-wrap items-end justify-between gap-5"><div><p className="eyebrow">Your month at a glance</p><h1 className="page-title">ปฏิทินงาน<span className="text-[#a66a5f]">.</span></h1><p className="page-description">เลื่อนดูงานตามวันครบกำหนดในแต่ละเดือน กดที่งานเพื่อดูรายละเอียดหรือแก้ไข</p></div><button className="btn-primary" onClick={()=>onCreate(currentMonth?today:`${month}-01`)}><Plus size={18}/>เพิ่มงานใหม่</button></div>
    <section className="panel mt-8 overflow-hidden" aria-label={`ปฏิทินงาน ${monthLabel}`}>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-5 py-5 sm:px-6"><div aria-live="polite"><h2 className="flex items-center gap-2 text-xl font-semibold"><CalendarDays size={22} className="text-teal-700"/>{monthLabel}</h2><p className="mt-2 text-xs leading-6 text-slate-500">{loading?'กำลังโหลดงาน…':`${monthTasks.length} งานในเดือนที่แสดง · ยังไม่เสร็จ ${remaining} งาน${currentMonth?` · ต้องส่งวันนี้ ${todayCount} งาน`:''}`}</p></div><div className="flex items-center gap-2" role="group" aria-label="เลือกเดือนปฏิทิน"><button className="icon-button" aria-label="เดือนก่อนหน้า" disabled={month==='0001-01'} onClick={()=>setSelectedMonth(shiftMonth(month,-1))}><ChevronLeft size={20}/></button><button className="btn-secondary !px-3 !py-2 !text-xs" onClick={()=>setSelectedMonth(null)} disabled={currentMonth}>เดือนปัจจุบัน</button><button className="icon-button" aria-label="เดือนถัดไป" disabled={month==='9999-12'} onClick={()=>setSelectedMonth(shiftMonth(month,1))}><ChevronRight size={20}/></button><button className="icon-button" onClick={onRefresh} disabled={loading} aria-label="รีเฟรชปฏิทิน"><RefreshCw size={18} className={loading?'animate-spin':''}/></button></div></div>
      <div className="flex flex-wrap items-center gap-2 px-5 py-3 text-xs text-slate-500"><span className="priority-badge priority-high">สูง</span><span className="priority-badge priority-medium">ปกติ</span><span className="priority-badge priority-low">ต่ำ</span><span className="inline-flex items-center gap-1"><Check size={13}/>เสร็จแล้ว</span><span className="ml-auto">กด + ในวันที่ต้องการเพื่อเพิ่มงาน</span></div>
      {error?<div role="alert" className="mx-5 mb-5 rounded-xl bg-red-50 p-4 text-sm text-red-800"><p>{error}</p><button className="mt-2 underline" onClick={onRefresh}>ลองอีกครั้ง</button></div>
      :<div className="calendar-scroll" role="region" aria-label="ตารางปฏิทินรายเดือน เลื่อนแนวนอนได้บนมือถือ" tabIndex={0} aria-busy={loading}>
        <table className="task-calendar"><caption className="sr-only">งานที่ครบกำหนดใน{monthLabel} ตามเวลาไทย</caption>
          <thead><tr>{['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'].map(day=><th key={day} scope="col">{day}</th>)}</tr></thead>
          <tbody>{Array.from({length:cells.length/7},(_,week)=><tr key={week}>{cells.slice(week*7,week*7+7).map((cell,index)=>!cell?<td key={`blank-${index}`} className="calendar-blank" aria-label="นอกเดือนที่แสดง"/>:<td key={cell.date} className={cell.date===today?'calendar-today':''}>
            <div className="calendar-day-header"><time dateTime={cell.date} aria-current={cell.date===today?'date':undefined} className={cell.date===today?'calendar-today-number':''}>{cell.day}</time>{cell.date===today&&<span className="text-[10px] font-medium text-teal-700">วันนี้</span>}<button className="calendar-add" onClick={()=>onCreate(cell.date)} disabled={loading} aria-label={`เพิ่มงานวันที่ ${cell.day} ${monthLabel}`}><Plus size={14}/></button></div>
            <div className="calendar-events">{!loading&&cell.tasks.map(task=><button key={task.id} className={`calendar-event calendar-event-${task.priority} ${task.status==='completed'?'calendar-event-done':''}`} onClick={()=>onSelect(task)} title={`${task.title} · ${PRIORITY_LABELS[task.priority]} · ${TASK_STATUS_LABELS[task.status]}`} aria-label={`${task.title} วันที่ ${cell.day} ${monthLabel} ความสำคัญ${PRIORITY_LABELS[task.priority]} ${TASK_STATUS_LABELS[task.status]}`}>
              <span className="flex items-start gap-1">{task.status==='completed'&&<Check size={12} className="mt-0.5 shrink-0"/>}<span className="min-w-0 break-words">{task.title}</span></span>{task.status!=='completed'&&task.due_date!<today&&<span className="mt-1 block text-[10px] font-medium text-red-700">เลยกำหนด</span>}
            </button>)}</div>
          </td>)}</tr>)}</tbody>
        </table>
      </div>}
      {!loading&&!error&&!monthTasks.length&&<p role="status" className="border-t border-slate-100 px-5 py-4 text-center text-sm text-slate-500">ยังไม่มีงานครบกำหนดในเดือนที่แสดง กด + ในวันที่ต้องการเพื่อเริ่มเพิ่มงาน</p>}
      <p className="border-t border-slate-100 px-5 py-3 text-xs leading-6 text-slate-500">แสดงงานตามเดือนที่เลือก · วันนี้อ้างอิงเวลาไทย · งานที่ไม่ระบุวันส่งดูได้ใน “งานทั้งหมด”</p>
    </section>
  </div>;
}
