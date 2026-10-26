import type { Task } from '@taskflow/shared';

export const bangkokToday = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function shiftMonth(month: string, offset: number) {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0,7);
}
export function monthCalendar(today: string, tasks: Task[]) {
  const [year,month]=today.split('-').map(Number);
  const prefix=today.slice(0,7);
  const offset=new Date(Date.UTC(year,month-1,1)).getUTCDay();
  const length=new Date(Date.UTC(year,month,0)).getUTCDate();
  const priority={high:0,medium:1,low:2};
  const monthTasks=tasks.filter(task=>task.due_date?.startsWith(`${prefix}-`)).sort((a,b)=>Number(a.status==='completed')-Number(b.status==='completed') || priority[a.priority]-priority[b.priority] || a.title.localeCompare(b.title,'th') || a.id.localeCompare(b.id));
  const byDay=new Map<string,Task[]>();
  for(const task of monthTasks) { const date=task.due_date!; byDay.set(date,[...(byDay.get(date)||[]),task]); }
  const cells:Array<{date:string;day:number;tasks:Task[]}|null>=Array.from({length:offset},()=>null);
  for(let day=1;day<=length;day++) {
    const date=`${prefix}-${String(day).padStart(2,'0')}`;
    cells.push({date,day,tasks:byDay.get(date)||[]});
  }
  while(cells.length%7) cells.push(null);
  return {cells,monthTasks,year,month};
}
