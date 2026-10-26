import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronDown, LoaderCircle, LogOut, ShieldCheck, Waypoints } from 'lucide-react';
import type { User } from '@taskflow/shared';
import { Avatar, displayName } from './AccountSettings';

export default function ProfileMenu({ user, onNavigate, onLogout, loggingOut }: {
  user: User; onNavigate: (view: 'account' | 'integrations') => void; onLogout: () => void; loggingOut: boolean;
}) {
  const [open,setOpen] = useState(false), id=useId();
  const root=useRef<HTMLDivElement>(null), trigger=useRef<HTMLButtonElement>(null), menu=useRef<HTMLDivElement>(null);
  function close() { setOpen(false); trigger.current?.focus(); }
  useEffect(()=>{
    if(!open) return;
    menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node)) setOpen(false);};
    document.addEventListener('pointerdown',outside);
    return ()=>document.removeEventListener('pointerdown',outside);
  },[open]);
  function keyboard(event:KeyboardEvent<HTMLDivElement>) {
    if(event.key==='Escape') { event.preventDefault(); close(); return; }
    if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const items=Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') || []);
    const index=items.indexOf(document.activeElement as HTMLButtonElement);
    const next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;
    items[next]?.focus();
  }
  function navigate(view:'account'|'integrations') { close(); onNavigate(view); }
  return <div ref={root} className="relative" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);}}>
    <button ref={trigger} type="button" className="flex items-center gap-1.5 rounded-xl p-1 transition hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-teal-600" aria-label="เมนูโปรไฟล์" aria-haspopup="menu" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(value=>!value)} onKeyDown={event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();setOpen(true);}}}>
      <Avatar user={user} className="!h-9 !w-9"/><ChevronDown size={14} className={`text-slate-500 transition ${open?'rotate-180':''}`}/>
    </button>
    {open && <div id={id} ref={menu} role="menu" aria-label="เมนูบัญชี" onKeyDown={keyboard} className="absolute right-0 top-full z-50 mt-3 w-72 max-w-[calc(100vw-32px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
      <div role="presentation" className="border-b border-slate-100 px-5 py-4"><p className="truncate text-sm font-semibold">{displayName(user)}</p><p className="mt-1 truncate text-xs text-slate-500">{user.email}</p></div>
      <div role="presentation" className="p-2">
        <button role="menuitem" type="button" className="profile-menu-item" onClick={()=>navigate('account')}><ShieldCheck size={18}/>ตั้งค่าบัญชี</button>
        <button role="menuitem" type="button" className="profile-menu-item" onClick={()=>navigate('integrations')}><Waypoints size={18}/>การเชื่อมต่อ</button>
      </div>
      <div role="presentation" className="border-t border-slate-100 p-2"><button role="menuitem" type="button" className="profile-menu-item text-red-700 hover:!bg-red-50" disabled={loggingOut} onClick={()=>{setOpen(false);onLogout();}}>{loggingOut?<LoaderCircle size={18} className="animate-spin"/>:<LogOut size={18}/>}ออกจากระบบ</button></div>
    </div>}
  </div>;
}
