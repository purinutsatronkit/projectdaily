import { useEffect, useState, type FormEvent } from 'react';
import { accountSchema, type User } from '@taskflow/shared';
import { Camera, Check, LoaderCircle, Upload } from 'lucide-react';
import SocialAccounts from './SocialAccounts';
import AccountData from './AccountData';

export const displayName = (user: User) => user.nickname || user.name;
export function Avatar({ user, className = '' }: { user: User; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [user.avatar_url]);
  return <span className={`avatar shrink-0 overflow-hidden ${className}`}>
    {user.avatar_url && !failed ? <img className="h-full w-full object-cover" src={user.avatar_url} alt={`รูปโปรไฟล์ ${displayName(user)}`} onError={() => setFailed(true)} /> : displayName(user).slice(0,1).toUpperCase()}
  </span>;
}

async function request(path: string, options: RequestInit): Promise<User> {
  const response = await fetch(`/api/account${path}`, { ...options, credentials: 'same-origin' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'บันทึกไม่สำเร็จ กรุณาลองใหม่');
  return data.user;
}
const MAX_IMAGE = 2 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg','image/png','image/gif','image/webp'];

export default function AccountSettings({ user, onSaved, onDeleted }: { user: User; onSaved: (user: User) => void; onDeleted:()=>void }) {
  const [name,setName] = useState(user.name), [nickname,setNickname] = useState(user.nickname || '');
  const [phone,setPhone] = useState(user.phone || ''), [email,setEmail] = useState(user.email);
  const [password,setPassword] = useState(''), [link,setLink] = useState('');
  const [busy,setBusy] = useState(false), [error,setError] = useState(''), [message,setMessage] = useState('');
  const changingEmail = email.trim().toLowerCase() !== user.email;
  function begin() { setBusy(true); setError(''); setMessage(''); }
  async function save(event: FormEvent) {
    event.preventDefault(); setError(''); setMessage('');
    const parsed = accountSchema.safeParse({ name,nickname,phone,email,current_password: changingEmail ? password : undefined });
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    begin();
    try {
      const response=await fetch('/api/account',{method:'PATCH',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(parsed.data)});
      const result=await response.json();if(!response.ok)throw new Error(result.error?.message??'บันทึกไม่สำเร็จ');
      const updated:User=result.user;onSaved(updated); setName(updated.name); setNickname(updated.nickname || ''); setPhone(updated.phone || ''); setEmail(updated.email); setPassword(''); setMessage(result.message??'บันทึกข้อมูลบัญชีแล้ว');
    } catch (err) { setError(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ'); } finally { setBusy(false); }
  }
  async function requestVerification(){begin();try{const response=await fetch('/api/auth/request-email-verification',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:'{}'});const result=await response.json();if(!response.ok)throw new Error(result.error?.message??'ส่งลิงก์ไม่สำเร็จ');setMessage(result.message);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function upload(blob: Blob) {
    if (!blob.size || blob.size > MAX_IMAGE) throw new Error('รูปภาพต้องมีขนาดไม่เกิน 2 MB');
    if (!IMAGE_TYPES.includes(blob.type)) throw new Error('ใช้รูป JPG, PNG, GIF หรือ WebP เท่านั้น');
    const bitmap = await createImageBitmap(blob).catch(() => { throw new Error('อ่านรูปไม่ได้ กรุณาเลือกไฟล์ภาพที่ถูกต้อง'); });
    bitmap.close();
    const updated = await request('/avatar',{method:'PUT',headers:{'Content-Type':blob.type},body:blob});
    onSaved(updated); setLink(''); setMessage('บันทึกรูปโปรไฟล์แล้ว');
  }
  async function fromFile(file?: File) {
    if (!file) return;
    begin(); try { await upload(file); } catch (err) { setError(err instanceof Error ? err.message : 'อัปโหลดไม่สำเร็จ'); } finally { setBusy(false); }
  }
  async function fromLink(event: FormEvent) {
    event.preventDefault(); begin();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const url = new URL(link);
      if (!['http:','https:'].includes(url.protocol) || url.username || url.password) throw new Error('กรุณาใช้ลิงก์รูปภาพ http หรือ https');
      const response = await fetch(url.href, {credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(20000)});
      if (!response.ok || !response.body) throw new Error('เปิดลิงก์รูปไม่ได้');
      const type = response.headers.get('content-type')?.split(';')[0] || '';
      if (!IMAGE_TYPES.includes(type)) throw new Error('ลิงก์ต้องชี้ไปยังไฟล์ JPG, PNG, GIF หรือ WebP โดยตรง');
      if (Number(response.headers.get('content-length')) > MAX_IMAGE) throw new Error('รูปภาพต้องมีขนาดไม่เกิน 2 MB');
      reader = response.body.getReader(); let size = 0; const parts: ArrayBuffer[] = [];
      while (true) {
        const chunk = await reader.read(); if (chunk.done) break;
        size += chunk.value.byteLength; if (size > MAX_IMAGE) throw new Error('รูปภาพต้องมีขนาดไม่เกิน 2 MB');
        parts.push(new Uint8Array(chunk.value).buffer);
      }
      await upload(new Blob(parts,{type}));
    } catch (err) { setError(err instanceof TypeError ? 'เว็บไซต์ต้นทางไม่อนุญาตให้โหลดรูปจากลิงก์นี้ ให้ดาวน์โหลดรูปแล้วเลือกไฟล์จากเครื่องแทน' : err instanceof Error ? err.message : 'โหลดรูปไม่สำเร็จ'); }
    finally { await reader?.cancel().catch(() => {}); setBusy(false); }
  }
  async function removeImage() {
    begin(); try { onSaved(await request('/avatar',{method:'DELETE'})); setMessage('ลบรูปโปรไฟล์แล้ว'); }
    catch (err) { setError(err instanceof Error ? err.message : 'ลบรูปไม่สำเร็จ'); } finally { setBusy(false); }
  }
  return <div className="max-w-3xl">
    <div className="page-intro"><p className="eyebrow">Your account</p><h1 className="page-title">ตั้งค่าบัญชี<span className="text-[#b6975e]">.</span></h1><p className="page-description">ปรับข้อมูลและรูปโปรไฟล์ให้เป็นคุณ</p></div>
    <div aria-live="polite" className="mt-6">{error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}{message && <p role="status" className="flex items-center gap-2 rounded-xl bg-teal-50 p-4 text-sm text-teal-800"><Check size={18}/>{message}</p>}</div>
    <section className="panel mt-6 p-5 sm:p-7"><h2 className="flex items-center gap-2 text-lg font-semibold"><Camera size={20}/>รูปโปรไฟล์</h2>
      <div className="mt-5 flex flex-wrap items-center gap-5"><Avatar user={user} className="!h-24 !w-24 !text-3xl"/><div><p className="font-semibold">{displayName(user)}</p><p className="mt-1 text-xs text-slate-500">JPG, PNG, GIF หรือ WebP ไม่เกิน 2 MB</p><div className="mt-4 flex flex-wrap gap-3"><label className={`btn-secondary cursor-pointer ${busy ? 'pointer-events-none opacity-50' : ''}`}><Upload size={16}/>เลือกไฟล์จากเครื่อง<input type="file" className="sr-only" aria-label="เลือกรูปโปรไฟล์จากเครื่อง" accept="image/jpeg,image/png,image/gif,image/webp" disabled={busy} onChange={event => { void fromFile(event.target.files?.[0]); event.target.value=''; }}/></label>{user.avatar_url && <button type="button" className="text-sm text-red-700 underline" disabled={busy} onClick={() => void removeImage()}>ลบรูป</button>}</div></div></div>
      <form onSubmit={fromLink} className="mt-6 border-t border-slate-100 pt-5"><label htmlFor="avatar-link" className="field-label">หรือใช้ลิงก์รูปภาพ</label><div className="mt-2 flex flex-col gap-3 sm:flex-row"><input id="avatar-link" type="url" className="field min-w-0 flex-1" value={link} onChange={event => setLink(event.target.value)} placeholder="https://example.com/photo.jpg" required disabled={busy}/><button className="btn-secondary shrink-0" disabled={busy || !link.trim()}>ใช้รูปจากลิงก์</button></div><p className="mt-2 text-xs leading-6 text-slate-500">รูปจะถูกคัดลอกมาเก็บในบัญชี หากต้นทางไม่อนุญาตให้โหลด ให้เลือกไฟล์จากเครื่องแทน</p></form>
    </section>
    <form onSubmit={save} className="panel mt-6 space-y-5 p-5 sm:p-7"><h2 className="text-lg font-semibold">ข้อมูลส่วนตัว</h2>
      <div className="grid gap-5 sm:grid-cols-2"><label className="field-label">ชื่อ<input className="field mt-2" autoComplete="name" value={name} onChange={event=>setName(event.target.value)} minLength={2} maxLength={80} required disabled={busy}/></label><label className="field-label">ชื่อเล่น <span className="text-xs font-normal text-slate-400">(ไม่บังคับ)</span><input className="field mt-2" autoComplete="nickname" value={nickname} onChange={event=>setNickname(event.target.value)} maxLength={40} disabled={busy}/></label></div>
      <p className="text-xs text-slate-500">ชื่อที่แสดง: {nickname.trim() || name.trim() || user.name} — หากไม่ตั้งชื่อเล่น จะใช้ชื่อปกติ</p>
      <label className="field-label block">เบอร์โทร <span className="text-xs font-normal text-slate-400">(ไม่บังคับ)</span><input type="tel" autoComplete="tel" className="field mt-2" value={phone} onChange={event=>setPhone(event.target.value)} maxLength={30} disabled={busy}/></label>
      <label className="field-label block">อีเมล<input type="email" autoComplete="email" className="field mt-2" value={email} onChange={event=>setEmail(event.target.value)} maxLength={200} required disabled={busy}/></label>
      <p className="text-xs leading-6 text-slate-500">อีเมลปัจจุบัน: {user.email} · {user.email_verified_at?'ยืนยันแล้ว':'ยังไม่ยืนยัน'} หากเปลี่ยนอีเมล ระบบจะส่งลิงก์ไปที่อีเมลใหม่ และใช้ที่อยู่เดิมจนกว่าจะยืนยัน</p>
      {!user.email_verified_at&&<button type="button" className="btn-secondary" disabled={busy} onClick={()=>void requestVerification()}>ส่งลิงก์ยืนยันอีเมลปัจจุบัน</button>}
      {changingEmail && <label className="field-label block">รหัสผ่านปัจจุบันเพื่อยืนยันการเปลี่ยนอีเมล<input type="password" autoComplete="current-password" className="field mt-2" value={password} onChange={event=>setPassword(event.target.value)} maxLength={128} required disabled={busy}/></label>}
      <div className="flex justify-end border-t border-slate-100 pt-5"><button className="btn-primary" disabled={busy}>{busy ? <LoaderCircle size={18} className="animate-spin"/> : <Check size={18}/>}บันทึกข้อมูล</button></div>
    </form>
    <SocialAccounts/>
    <AccountData user={user} onDeleted={onDeleted}/>
  </div>;
}
