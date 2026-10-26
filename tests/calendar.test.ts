import test from 'node:test';
import assert from 'node:assert/strict';
import { monthCalendar, shiftMonth } from '../apps/web/src/calendar-model.ts';
import type { Task } from '@taskflow/shared';

const task=(id:string,due_date:string|null,priority:Task['priority']='medium',status:Task['status']='pending'):Task=>({id,title:id,due_date,priority,status,description:'',created_at:'',updated_at:''});
test('calendar month navigation crosses years and groups the selected month',()=>{
  assert.equal(shiftMonth('2026-12',1),'2027-01');
  assert.equal(shiftMonth('2027-01',-1),'2026-12');
  assert.equal(shiftMonth('2024-03',-1),'2024-02');
  const tasks=[task('December','2026-12-31'),task('January','2027-01-01')];
  const next=monthCalendar(`${shiftMonth('2026-12',1)}-01`,tasks);
  assert.deepEqual(next.monthTasks.map(item=>item.id),['January']);
  assert.equal(next.cells.filter(Boolean).length,31);
});
test('month calendar places dates on their weekday and leaves adjacent months blank',()=>{
  const calendar=monthCalendar('2026-10-21',[]);
  assert.equal(calendar.cells.length,35);
  assert.deepEqual(calendar.cells.slice(0,4),[null,null,null,null]);
  assert.equal(calendar.cells[4]?.date,'2026-10-01');
  assert.equal(calendar.cells[34]?.date,'2026-10-31');
  const february=monthCalendar('2024-02-29',[]);
  assert.equal(february.cells.filter(Boolean).length,29);
  assert.equal(monthCalendar('2025-02-01',[]).cells.filter(Boolean).length,28);
  const december=monthCalendar('2026-12-01',[]);
  assert.equal(december.cells.filter(Boolean).length,31);
  assert.equal(december.cells.length%7,0);
});
test('calendar groups only current-month deadlines, sorts by priority, and includes completed tasks last',()=>{
  const calendar=monthCalendar('2026-10-21',[
    task('low','2026-10-21','low'),task('high','2026-10-21','high'),
    task('normal','2026-10-21'),task('done','2026-10-21','high','completed'),
    task('other day','2026-10-01'),task('previous','2026-09-30'),task('next','2026-11-01'),task('undated',null),
  ]);
  assert.equal(calendar.monthTasks.length,5);
  assert.deepEqual(calendar.cells.find(cell=>cell?.date==='2026-10-21')?.tasks.map(item=>item.id),['high','normal','low','done']);
  assert.equal(calendar.cells.find(cell=>cell?.date==='2026-10-01')?.tasks[0].id,'other day');
});
