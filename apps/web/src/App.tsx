import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowDown, ArrowRight, ArrowUp, Bell, CalendarDays, Check, CheckCheck, ChevronDown,
  Circle, Clock3, Copy, FileText, KeyRound, LayoutGrid, ListTodo, LoaderCircle,
  MoreHorizontal, Pencil, Plus, RefreshCw, Search, ShieldCheck, Sparkles,
  Trash2, Waypoints, X,
} from 'lucide-react';
import {
  apiKeySchema, forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema, taskSchema, TASK_STATUS_LABELS as STATUS_LABELS, PRIORITY_LABELS,
  type ApiKey, type Reminder, type Summary, type Task, type User, type Project,
} from '@taskflow/shared';

import AccountSettings, { displayName } from './AccountSettings';
import ProfileMenu from './ProfileMenu';
import Notifications from './Notifications';
import TaskCalendar from './TaskCalendar';
import Sk09Form from './Sk09Form';
import { useSk09Draft } from './useSk09Draft';
import { GoogleSignIn } from './SocialAccounts';
import GitHubWorkspace from './GitHubWorkspace';
import Projects from './Projects';
import TaskLinks from './TaskLinks';
import VerifyEmailPage from './VerifyEmailPage';
import AssistantChat from './AssistantChat';

type View = 'github' | 'sk09' | 'account' | 'all' | 'today' | 'integrations' | 'guide';
const oauthQuery=new URLSearchParams(window.location.search);
const oauthResult=oauthQuery.get('oauth')??'';
const oauthError=oauthQuery.get('oauth_error');
const oauthErrors=new Map([
  ['link_required','อีเมลนี้มีบัญชี TaskFlow แล้ว เข้าด้วยรหัสผ่านเดิม แล้วไปตั้งค่าบัญชีเพื่อเชื่อม Google'],
  ['already_linked','บัญชีนี้เชื่อมไว้แล้ว กรุณาตรวจบัญชีที่เลือก'],
  ['cancelled','ยกเลิกการเชื่อมต่อแล้ว'],
  ['failed','เชื่อมบัญชีไม่สำเร็จ กรุณาลองใหม่ ตรวจ redirect URI, Client ID/Secret และบัญชีทดสอบ'],
]);
const oauthMessage=oauthError?(oauthErrors.get(oauthError)??'เชื่อมบัญชีไม่สำเร็จ'):oauthResult.endsWith('-connected')?'เชื่อมบัญชีสำเร็จแล้ว':undefined;
type AuthMode = 'login' | 'register' | 'forgot';
type Notice = { message: string; kind: 'success' | 'error' };
const TODAY = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
const dateLabel = (value: string) => new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' }).format(new Date(value.length === 10 ? `${value}T12:00:00+07:00` : value));

class ApiError extends Error {
  constructor(message: string, public status: number, public requestId?: string, public code?: string) { super(message); }
}
async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: 'same-origin',
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
  });
  const result = response.status === 204 ? undefined : await response.json().catch(() => undefined);
  if (!response.ok) throw new ApiError(result?.error?.message ?? 'ไม่สามารถเชื่อมต่อระบบได้ กรุณาลองอีกครั้ง', response.status, result?.error?.request_id, result?.error?.code);
  return result as T;
}
function errorText(error: unknown) {
  if (error instanceof ApiError && error.requestId) return `${error.message} (รหัสคำขอ: ${error.requestId})`;
  return error instanceof Error ? error.message : 'เกิดข้อผิดพลาด กรุณาลองอีกครั้ง';
}
function Logo({ compact = false }: { compact?: boolean }) {
  return <div className="flex items-center gap-2.5"><img className="brand-icon" src="/favicon.ico?v=20261026" alt="" aria-hidden="true" /><div><span className="text-[25px] font-bold tracking-[-1px]">Task<span className="text-teal-700">Flow</span></span>{!compact && <span className="hidden text-[11px] font-semibold uppercase tracking-[.3em] sm:block text-slate-400">Make room for focus</span>}</div></div>;
}
function Spinner({ small = false }: { small?: boolean }) { return <LoaderCircle className={`${small ? 'h-4 w-4' : 'h-6 w-6'} animate-spin`} aria-hidden="true" />; }
function ErrorBox({ message, retry }: { message: string; retry?: () => void }) {
  return <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p>{message}</p>{retry && <button className="mt-2 font-semibold underline underline-offset-4" onClick={retry}>ลองอีกครั้ง</button>}</div>;
}
function Modal({ title, children, onClose, subtitle }: { title: string; children: ReactNode; onClose: () => void; subtitle?: string }) {
  const id = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const old = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const element = dialog.current;
    (element?.querySelector<HTMLElement>('input:not(:disabled), select:not(:disabled), textarea:not(:disabled)') ?? element?.querySelector<HTMLElement>('button:not(:disabled)'))?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
      if (event.key !== 'Tab' || !element) return;
      const items = Array.from(element.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'));
      if (!items.length) return;
      const first = items[0]; const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keyboard);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', keyboard); old?.focus(); };
  }, []);
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><div ref={dialog} role="dialog" aria-modal="true" aria-labelledby={id} className="modal-card"><div className="flex items-start justify-between gap-4"><div><h2 id={id} className="text-2xl font-bold tracking-tight">{title}</h2>{subtitle && <p className="mt-2 text-sm leading-6 text-slate-500">{subtitle}</p>}</div><button type="button" onClick={onClose} aria-label="ปิดหน้าต่าง" className="icon-button shrink-0"><X size={19} /></button></div>{children}</div></div>;
}

function Landing({ openAuth }: { openAuth: (mode: AuthMode) => void }) {
  return <div className="min-h-screen ">
    <header className="border-b border-slate-200/70 bg-[#fffaf8]/90 backdrop-blur-sm"><div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-4 sm:px-8"><Logo /><nav className="flex items-center gap-7"><a href="#how-it-works" className="hidden text-sm font-medium text-slate-600 transition hover:text-teal-700 sm:block">หลักการทำงาน</a><button onClick={() => openAuth('login')} className="btn-primary !rounded-full !px-3 sm:!px-6">เข้าสู่ระบบ <ArrowRight size={17} /></button></nav></div></header>
    <main>
      <section className="hero-grid relative overflow-hidden px-5 pb-16 pt-20 sm:px-8 sm:pb-24 sm:pt-24">
        <div className="hero-glow" aria-hidden="true" />
        <div className="relative mx-auto max-w-5xl text-center">
          <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-white/90 bg-white/75 px-4 py-2 text-xs font-medium text-slate-600 shadow-sm"><span className="h-2 w-2 rounded-full bg-teal-500 ring-4 ring-teal-100" />พื้นที่เล็ก ๆ สำหรับสิ่งที่อยากทำให้สำเร็จ</span>
          <h1 className="hero-title mt-7 font-bold leading-[1.3] tracking-[-.045em]">จัดงานให้ชัดเจน<br /><span className="gradient-text">ในทุกวัน</span><span className="text-[#a66a5f]">.</span></h1>
          <p className="mx-auto mt-6 max-w-lg text-base leading-8 text-slate-500 sm:text-lg">จดสิ่งที่ต้องทำ เลือกสิ่งที่สำคัญ แล้วลงมือทีละงาน<br className="hidden sm:block" />ด้วยพื้นที่ทำงานเรียบง่ายที่ช่วยให้คุณโฟกัสได้มากขึ้น</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3"><button onClick={() => openAuth('register')} className="btn-primary !px-7 !py-3.5">เริ่มจัดการงาน <ArrowRight size={18} /></button><button onClick={() => openAuth('login')} className="btn-secondary !px-7 !py-3.5">{import.meta.env.DEV ? 'ลองบัญชีตัวอย่าง' : 'เข้าสู่ระบบ'}</button></div>
          <p className="mt-4 text-xs text-slate-400">งานของคุณ • จังหวะของคุณ • ชัดเจนในที่เดียว</p>
          <div className="landing-preview mx-auto mt-14 max-w-3xl text-left" aria-label="ภาพตัวอย่างการจัดลำดับงาน">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-7"><div className="flex items-center gap-2"><LayoutGrid size={15} className="text-teal-600" /><span className="text-xs font-semibold text-slate-500">พื้นที่ของคุณ</span></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[12px] font-medium text-slate-400">ตัวอย่างหน้าจอ</span></div>
            <div className="p-5 sm:p-7"><div className="flex items-end justify-between"><div><p className="text-[13px] font-semibold uppercase tracking-[.18em] text-teal-600">One thing at a time</p><h2 className="mt-2 text-xl font-bold">วันนี้ จะเริ่มจากอะไรดี?</h2></div><span className="hidden rounded-lg bg-teal-50 px-3 py-2 text-xs font-medium text-teal-700 sm:block">โฟกัสกับสิ่งที่สำคัญ</span></div><div className="mt-6 space-y-3">{[['เตรียมสิ่งที่ต้องทำ', 'แค่เริ่มเขียน ความคิดก็ชัดขึ้น', false], ['เลือกงานสำคัญของวันนี้', 'กำหนดวันและลำดับความสำคัญ', false], ['ฉลองทุกก้าวเล็ก ๆ ที่สำเร็จ', 'ทำเสร็จแล้ว อย่าลืมให้เครดิตตัวเอง', true]].map(([title, detail, done]) => <div key={String(title)} className="flex items-center gap-4 rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3"><span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${done ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-300 bg-white'}`}>{done && <Check size={13} />}</span><div className="min-w-0 flex-1"><p className={`text-sm font-medium ${done ? 'text-slate-400 line-through' : ''}`}>{title}</p><p className="mt-1 hidden text-xs text-slate-400 sm:block">{detail}</p></div><span className={`h-2 w-2 rounded-full ${done ? 'bg-teal-500' : 'bg-[#a66a5f]'}`} /></div>)}</div></div>
          </div>
        </div>
      </section>
      <section id="how-it-works" className="border-t border-slate-200/80 bg-white/60 px-5 py-16 sm:px-8"><div className="mx-auto max-w-5xl"><div className="text-center"><p className="eyebrow">A calmer way to get things done</p><h2 className="mt-3 text-3xl font-bold tracking-tight">น้อยขั้นตอน มากความชัดเจน</h2></div><div className="mt-10 grid gap-6 md:grid-cols-3">{[{ icon: ListTodo, n: '01', title: 'เก็บงานไว้ในที่เดียว', description: 'เพิ่มงานและรายละเอียด ไม่ต้องจำทุกอย่างไว้ในหัว' }, { icon: CalendarDays, n: '02', title: 'เลือกสิ่งที่สำคัญ', description: 'ตั้งวันครบกำหนด จัดลำดับความสำคัญ และติดตามสถานะ' }, { icon: Waypoints, n: '03', title: 'รับอีเมลเตือนงาน', description: 'ยืนยันอีเมลแล้วรับสรุปงานที่ครบกำหนดโดยอัตโนมัติ' }].map(item => <div key={item.n} className="rounded-2xl border border-slate-200/70 bg-white p-7"><div className="flex items-center justify-between"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><item.icon size={22} /></span><span className="text-sm font-semibold text-[#a66a5f]">{item.n}</span></div><h3 className="mt-6 text-lg font-semibold">{item.title}</h3><p className="mt-3 text-sm leading-7 text-slate-500">{item.description}</p></div>)}</div></div></section>
    </main><footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-7 text-xs text-slate-400 sm:px-8"><span>TaskFlow — พื้นที่สำหรับความก้าวหน้าในทุกวัน</span><span>React · Hono · SQL</span></footer>
  </div>;
}

function AuthModal({ mode, setMode, onClose, onLogin, notice }: { mode: AuthMode; setMode: (mode: AuthMode) => void; onClose: () => void; onLogin: (user: User) => void; notice?: string }) {
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const registration = mode === 'register';
  if (mode === 'forgot') return <ForgotPasswordModal initialEmail={email} onClose={onClose} onBack={() => { setMode('login'); setPassword(''); setError(''); }} />;
  async function submit(event?: FormEvent, demo = false) {
    event?.preventDefault(); setError('');
    const payload = demo ? { email: 'demo@taskflow.local', password: 'TaskFlow!2026' } : { email, password, ...(registration ? { name } : {}) };
    const parsed = (registration && !demo ? registerSchema : loginSchema).safeParse(payload);
    if (!parsed.success) { setError(registration ? 'กรอกชื่ออย่างน้อย 2 ตัวอักษร อีเมลที่ถูกต้อง และรหัสผ่าน8–16 ตัวอักษร' : 'กรอกอีเมลที่ถูกต้องและรหัสผ่าน'); return; }
    setLoading(true);
    try { const result = await api<{ user: User }>(`/auth/${registration && !demo ? 'register' : 'login'}`, { method: 'POST', body: JSON.stringify(parsed.data) }); onLogin(result.user); }
    catch (err) { setError(errorText(err)); } finally { setLoading(false); }
  }
  return <Modal title={registration ? 'เริ่มพื้นที่ทำงานของคุณ' : 'ยินดีต้อนรับกลับมา'} subtitle={registration ? 'สร้างบัญชีเพื่อเก็บงานและติดตามความก้าวหน้า' : 'เข้ามาจัดลำดับงาน แล้วเริ่มวันอย่างชัดเจน'} onClose={() => { if (!loading) onClose(); }}>{notice && mode === 'login' && <p role="status" className="mt-5 rounded-xl border border-teal-100 bg-teal-50 p-4 text-sm leading-7 text-teal-800">{notice}</p>}<form className="mt-7 space-y-4" onSubmit={submit}>
    {registration && <label className="field-label">ชื่อที่ใช้แสดง<input value={name} onChange={e => setName(e.target.value)} className="field mt-2" autoComplete="name" minLength={2} maxLength={80} required disabled={loading} placeholder="ชื่อของคุณ" /></label>}
    <label className="field-label">อีเมล<input type="email" value={email} onChange={e => setEmail(e.target.value)} className="field mt-2" autoComplete="email" maxLength={200} required disabled={loading} placeholder="you@example.com" /></label>
    <label className="field-label">รหัสผ่าน<input type="password" value={password} onChange={e => setPassword(e.target.value)} className="field mt-2" autoComplete={registration ? 'new-password' : 'current-password'} minLength={registration ? 8 : 1} maxLength={registration ? 16 : 128} required disabled={loading} placeholder={registration ? '8–16 ตัวอักษร' : 'รหัสผ่านของคุณ'} /></label>
    {!registration && <div className="flex justify-end"><button type="button" disabled={loading} onClick={() => { setMode('forgot'); setPassword(''); setError(''); }} className="min-h-10 text-xs font-semibold text-teal-700 hover:underline">ลืมรหัสผ่าน?</button></div>}
    {error && <ErrorBox message={error} />}
    <button className="btn-primary w-full !py-3" disabled={loading}>{loading ? <Spinner small /> : <>{registration ? 'สร้างบัญชี' : 'เข้าสู่ระบบ'}<ArrowRight size={17} /></>}</button>
  </form><GoogleSignIn/>{!registration && import.meta.env.DEV && <><div className="my-5 flex items-center gap-3 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-200" />หรือทดลองใช้งาน<span className="h-px flex-1 bg-slate-200" /></div><button disabled={loading} className="btn-secondary w-full" onClick={() => void submit(undefined, true)}><Sparkles size={16} />เข้าสู่บัญชีตัวอย่าง</button><p className="mt-2 text-center text-xs leading-5 text-slate-400">บัญชีตัวอย่างเป็นพื้นที่ร่วมกัน ข้อมูลอาจถูกแก้ไขได้</p></>}
    <p className="mt-6 text-center text-sm text-slate-500">{registration ? 'มีบัญชีอยู่แล้ว?' : 'ยังไม่มีบัญชี?'} <button disabled={loading} onClick={() => { setMode(registration ? 'login' : 'register'); setError(''); }} className="font-semibold text-teal-700 hover:underline">{registration ? 'เข้าสู่ระบบ' : 'สร้างบัญชี'}</button></p>
  </Modal>;
}

function ForgotPasswordModal({ initialEmail, onClose, onBack }: { initialEmail: string; onClose: () => void; onBack: () => void }) {
  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) { setError('กรุณากรอกอีเมลที่ถูกต้อง'); return; }
    setLoading(true);
    try {
      const result = await api<{ message: string }>('/auth/forgot-password', { method: 'POST', body: JSON.stringify(parsed.data) });
      setMessage(result.message);
    } catch (err) { setError(errorText(err)); } finally { setLoading(false); }
  }
  return <Modal title={message ? 'รับคำขอแล้ว' : 'ลืมรหัสผ่าน?'} subtitle={message ? 'ตรวจสอบกล่องจดหมายและโฟลเดอร์สแปมของคุณ' : 'กรอกอีเมลบัญชีของคุณ เพื่อขอลิงก์ตั้งรหัสผ่านใหม่'} onClose={() => { if (!loading) onClose(); }}>
    {message ? <div className="mt-6 space-y-5"><p role="status" className="rounded-xl border border-teal-100 bg-teal-50 p-4 text-sm leading-7 text-teal-800">{message}</p><button className="btn-primary w-full" onClick={onBack}>กลับไปเข้าสู่ระบบ<ArrowRight size={17} /></button></div> : <form onSubmit={submit} className="mt-6 space-y-5">
      <label className="field-label">อีเมล<input type="email" name="email" className="field mt-2" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" maxLength={200} placeholder="you@example.com" required disabled={loading} /></label>
      {error && <ErrorBox message={error} />}
      <button className="btn-primary w-full !py-3" disabled={loading}>{loading ? <Spinner small /> : <><KeyRound size={17} />ขอลิงก์ตั้งรหัสผ่านใหม่</>}</button>
      <button type="button" className="btn-secondary w-full" onClick={onBack} disabled={loading}>กลับไปเข้าสู่ระบบ</button>
    </form>}
  </Modal>;
}

function ResetPasswordPage({ token, onLogin, onRequestNew, onComplete }: { token: string; onLogin: () => void; onRequestNew: () => void; onComplete: (message: string) => void }) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [invalidToken, setInvalidToken] = useState(!/^[a-f0-9]{64}$/i.test(token));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const criteriaId = useId();
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    const parsed = resetPasswordSchema.safeParse({ token, password });
    if (!parsed.success) { setError('รหัสผ่านใหม่ต้องมี 8–16 ตัวอักษร'); return; }
    if (password !== confirmation) { setError('รหัสผ่านทั้งสองช่องไม่ตรงกัน กรุณาตรวจสอบอีกครั้ง'); return; }
    setLoading(true);
    try {
      const result = await api<{ message: string }>('/auth/reset-password', { method: 'POST', body: JSON.stringify(parsed.data) });
      setPassword(''); setConfirmation(''); onComplete(result.message);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INVALID_RESET_TOKEN') { setInvalidToken(true); setPassword(''); setConfirmation(''); }
      setError(errorText(err));
    } finally { setLoading(false); }
  }
  return <div className="min-h-screen ">
    <header className="border-b border-slate-200/70"><div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-4 sm:px-8"><Logo /><button className="btn-secondary !px-3 sm:!px-5" onClick={onLogin} disabled={loading}>เข้าสู่ระบบ</button></div></header>
    <main className="relative isolate overflow-hidden px-4 py-10 sm:py-16"><div className="hero-glow -z-10" aria-hidden="true" /><section className="panel mx-auto w-full max-w-md p-6 sm:p-8" aria-labelledby="reset-heading">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-700"><ShieldCheck size={25} /></span>
      <p className="eyebrow mt-6">A fresh start</p><h1 id="reset-heading" className="mt-3 text-2xl font-bold leading-snug tracking-tight">{invalidToken ? 'ลิงก์นี้ใช้ไม่ได้แล้ว' : 'ตั้งรหัสผ่านใหม่'}</h1>
      {invalidToken ? <div className="mt-4 space-y-5"><p className="text-sm leading-7 text-slate-500">ลิงก์อาจหมดอายุ ถูกใช้แล้ว หรือไม่ครบถ้วน กรุณาขอลิงก์ใหม่เพื่อดำเนินการต่อ</p>{error && <ErrorBox message={error} />}<button className="btn-primary w-full" onClick={onRequestNew}>ขอลิงก์ใหม่<ArrowRight size={17} /></button><button className="btn-secondary w-full" onClick={onLogin}>กลับไปเข้าสู่ระบบ</button></div> : <>
        <p className="mt-3 text-sm leading-7 text-slate-500">เลือกรหัสผ่านใหม่สำหรับบัญชีของคุณ หลังบันทึกสำเร็จให้เข้าสู่ระบบอีกครั้ง</p>
        <form onSubmit={submit} className="mt-6 space-y-5">
          <label className="field-label">รหัสผ่านใหม่<input type={showPassword ? 'text' : 'password'} name="new_password" value={password} onChange={e => setPassword(e.target.value)} className="field mt-2" autoComplete="new-password" minLength={8} maxLength={16} aria-describedby={criteriaId} required disabled={loading} /></label>
          <p id={criteriaId} className="!mt-2 text-xs leading-6 text-slate-500">ใช้รหัสผ่าน 8–16 ตัวอักษร</p>
          <label className="field-label">ยืนยันรหัสผ่านใหม่<input type={showPassword ? 'text' : 'password'} name="confirm_password" value={confirmation} onChange={e => setConfirmation(e.target.value)} className="field mt-2" autoComplete="new-password" minLength={8} maxLength={16} required disabled={loading} /></label>
          <label className="flex min-h-10 cursor-pointer items-center gap-3 text-xs text-slate-600"><input type="checkbox" className="h-4 w-4 accent-teal-700" checked={showPassword} onChange={e => setShowPassword(e.target.checked)} disabled={loading} />แสดงรหัสผ่านทั้งสองช่อง</label>
          {error && <ErrorBox message={error} />}
          <button className="btn-primary w-full !py-3" disabled={loading}>{loading ? <Spinner small /> : <><Check size={18} />บันทึกรหัสผ่านใหม่</>}</button>
        </form>
      </>}
    </section></main>
  </div>;
}

function TaskForm({ task, initialDueDate, projects, selectedProject, onClose, onSaved }: { task: Task | null; initialDueDate?: string; projects:Project[]; selectedProject:string; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(task?.title ?? ''); const [description, setDescription] = useState(task?.description ?? '');
  const [priority, setPriority] = useState<Task['priority']>(task?.priority ?? 'medium'); const [status, setStatus] = useState<Task['status']>(task?.status ?? 'pending');
  const [dueDate, setDueDate] = useState(task?.due_date ?? initialDueDate ?? ''); const [projectId,setProjectId]=useState(task?.project_id??(selectedProject==='unassigned'?'':selectedProject)); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  async function save(event: FormEvent) {
    event.preventDefault(); setError('');
    const submittedDate = new FormData(event.currentTarget as HTMLFormElement).get('due_date');
    const parsed = taskSchema.safeParse({ title, description, priority, status, due_date: typeof submittedDate === 'string' ? submittedDate || null : dueDate || null, project_id:projectId||null });
    if (!parsed.success) { setError('ชื่อควรมี 3–120 ตัวอักษร รายละเอียดไม่เกิน 2,000 ตัวอักษร และวันที่ต้องถูกต้อง'); return; }
    setLoading(true);
    try { await api(task ? `/tasks/${task.id}` : '/tasks', { method: task ? 'PATCH' : 'POST', body: JSON.stringify(parsed.data) }); onSaved(); }
    catch (err) { setError(errorText(err)); } finally { setLoading(false); }
  }
  return <Modal title={task ? 'แก้ไขงาน' : 'เพิ่มงานใหม่'} subtitle="เขียนให้ชัด เริ่มจากสิ่งที่ต้องทำให้สำเร็จ" onClose={() => { if (!loading) onClose(); }}><form onSubmit={save} className="mt-6 space-y-5">
    <label className="field-label">ชื่องาน <span className="text-teal-700">*</span><input autoFocus className="field mt-2" value={title} onChange={e => setTitle(e.target.value)} placeholder="งานต่อไปที่อยากทำให้สำเร็จ" minLength={3} maxLength={120} required disabled={loading} /></label>
    <label className="field-label">รายละเอียด <span className="font-normal text-slate-400">(ไม่บังคับ)</span><textarea className="field mt-2 min-h-28 resize-y" value={description} onChange={e => setDescription(e.target.value)} placeholder="เพิ่มข้อมูลหรือขั้นตอนที่ช่วยให้ลงมือได้ง่ายขึ้น" maxLength={2000} disabled={loading} /></label>
    <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2"><label className="field-label">ความสำคัญ<select className="field mt-2" value={priority} onChange={e => setPriority(e.target.value as Task['priority'])} disabled={loading}>{Object.entries(PRIORITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="field-label">วันครบกำหนด<input name="due_date" type="date" className="field mt-2" value={dueDate} onInput={e => setDueDate(e.currentTarget.value)} onChange={e => setDueDate(e.target.value)} disabled={loading} /></label></div>
    <label className="field-label">โปรเจกต์<select className="field mt-2" value={projectId} onChange={e=>setProjectId(e.target.value)} disabled={loading}><option value="">ยังไม่จัดโปรเจกต์</option>{projects.map(project=><option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
    {task && <TaskLinks taskId={task.id}/>}
    {task && <label className="field-label">สถานะ<select className="field mt-2" value={status} onChange={e => setStatus(e.target.value as Task['status'])} disabled={loading}>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
    {error && <ErrorBox message={error} />}
    <div className="flex justify-end gap-3 border-t border-slate-100 pt-5"><button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>ยกเลิก</button><button className="btn-primary" disabled={loading}>{loading ? <Spinner small /> : <Check size={17} />}{task ? 'บันทึกการแก้ไข' : 'เพิ่มงาน'}</button></div>
  </form></Modal>;
}

function PriorityBadge({ priority }: { priority: Task['priority'] }) {
  return <span className={`priority-badge priority-${priority}`}>{priority === 'high' ? <ArrowUp size={12} /> : priority === 'low' ? <ArrowDown size={12} /> : <MoreHorizontal size={12} />}{PRIORITY_LABELS[priority]}</span>;
}
function TaskRow({ task, edit, remove, update, busy }: { task: Task; edit: () => void; remove: () => void; update: (status: Task['status']) => void; busy: boolean }) {
  const done = task.status === 'completed'; const overdue = !done && !!task.due_date && task.due_date < TODAY();
  return <article className={`task-row task-priority-${task.priority} ${done ? 'task-done' : ''}`}>
    <button className={`task-check ${done ? 'checked' : ''}`} aria-pressed={done} aria-label={done ? `เปิดงาน ${task.title} อีกครั้ง` : `ทำเครื่องหมาย ${task.title} ว่าเสร็จแล้ว`} onClick={() => update(done ? 'pending' : 'completed')} disabled={busy}>{busy ? <Spinner small /> : done ? <Check size={15} /> : null}</button>
    <div className="task-content min-w-0 flex-1"><button className="block max-w-full truncate text-left text-sm font-semibold leading-6 hover:text-teal-700 sm:text-[17px]" onClick={edit}><span className={done ? 'text-slate-400 line-through' : ''}>{task.title}</span></button>{task.description && <p className="mt-0.5 truncate text-xs leading-6 text-slate-400">{task.description}</p>}<div className="mt-2 flex flex-wrap items-center gap-2 xl:hidden"><PriorityBadge priority={task.priority} />{task.due_date && <span className={`inline-flex items-center gap-1 text-[13px] ${overdue ? 'text-red-600' : 'text-slate-400'}`}><CalendarDays size={12} />{dateLabel(task.due_date)}{overdue && ' · เกินกำหนด'}</span>}</div></div>
    <div className="hidden w-20 shrink-0 xl:block"><PriorityBadge priority={task.priority} /></div>
    <div className="hidden w-28 shrink-0 xl:block"><span className={`flex items-center gap-1.5 text-xs ${overdue ? 'text-red-600' : 'text-slate-400'}`}><CalendarDays size={13} />{task.due_date ? dateLabel(task.due_date) : 'ไม่ระบุวัน'}</span>{overdue && <p className="ml-5 mt-1 text-[12px] text-red-500">เกินกำหนด</p>}</div>
    <label className="task-status relative shrink-0"><span className="sr-only">เปลี่ยนสถานะของ {task.title}</span><select value={task.status} onChange={e => update(e.target.value as Task['status'])} disabled={busy} className={`status-select status-${task.status}`}><option value="pending">ยังไม่เริ่ม</option><option value="in_progress">กำลังทำ</option><option value="completed">เสร็จแล้ว</option></select><ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2" /></label>
    <div className="task-actions flex shrink-0 gap-0.5"><button className="icon-button !h-10 !w-10" aria-label={`แก้ไข ${task.title}`} onClick={edit} disabled={busy}><Pencil size={14} /></button><button className="icon-button !h-10 !w-10 hover:!bg-red-50 hover:!text-red-600" aria-label={`ลบ ${task.title}`} onClick={remove} disabled={busy}><Trash2 size={14} /></button></div>
  </article>;
}

function Guide() {
  return <div className="space-y-6"><div className="page-intro"><p className="eyebrow">Understand your workspace</p><h1 className="page-title">เข้าใจระบบทีละขั้น</h1><p className="page-description">รู้ว่าแต่ละส่วนทำอะไร ก่อนนำไปต่อยอด</p></div>
    <section className="panel p-6 sm:p-8"><h2 className="text-lg font-semibold">จากหน้าจอ สู่งานที่บันทึกไว้</h2><p className="mt-2 text-sm leading-7 text-slate-500">เมื่อกดเพิ่มงาน ข้อมูลจะเดินทางผ่าน 4 ส่วนนี้</p><div className="mt-7 grid items-stretch gap-3 sm:grid-cols-2 xl:grid-cols-4">{[{ title: 'React', caption: 'หน้าจอที่คุณใช้งาน', detail: 'รับข้อมูลจากฟอร์ม' }, { title: 'Shared schema', caption: 'กติกาข้อมูลร่วมกัน', detail: 'ตรวจชื่องานและวันที่' }, { title: 'Hono API', caption: 'ผู้ดูแลคำขอ', detail: 'ตรวจสิทธิ์แล้วบันทึก' }, { title: 'SQLite', caption: 'พื้นที่เก็บข้อมูล', detail: 'เก็บงานของแต่ละบัญชี' }].map((item, index) => <div className="relative rounded-xl border border-teal-100 bg-teal-50/50 p-5" key={item.title}><span className="text-xs font-semibold text-[#a66a5f]">0{index + 1}</span><h3 className="mt-3 font-semibold text-teal-800">{item.title}</h3><p className="mt-2 text-xs leading-6 text-slate-600">{item.caption}<br />{item.detail}</p>{index < 3 && <ArrowRight size={16} className="absolute -right-2.5 top-1/2 z-10 hidden -translate-y-1/2 text-teal-500 xl:block" />}</div>)}</div></section>
    <div className="grid gap-6 md:grid-cols-2"><section className="panel p-6"><ShieldCheck className="text-teal-700" size={24} /><h2 className="mt-4 text-lg font-semibold">JWT และ Cookie</h2><p className="mt-3 text-sm leading-7 text-slate-500">หลังเข้าสู่ระบบ เซิร์ฟเวอร์ออก JWT เพื่อยืนยันบัญชี แล้วเก็บใน HttpOnly cookie เบราว์เซอร์แนบ cookie ไปพร้อมคำขอ ระบบจึงรู้ว่างานนี้เป็นของใคร</p><p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-6 text-slate-500">หัวใจหลัก: ทุกคำขอต้องตรวจตัวตนและเจ้าของงานที่ฝั่ง API เสมอ</p></section><section className="panel p-6"><Bell className="text-[#a66a5f]" size={24} /><h2 className="mt-4 text-lg font-semibold">อีเมลเตือนงานอัตโนมัติ</h2><p className="mt-3 text-sm leading-7 text-slate-500">ยืนยันอีเมลแล้วเซิร์ฟเวอร์จะส่งสรุปงานที่ครบกำหนดหลัง 07:00 น. เวลาไทย โดยไม่ต้องสร้าง API Key หรือตั้งค่า n8n</p><p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-6 text-slate-500">API Key และ n8n ยังใช้ได้เป็นตัวเลือกสำหรับการเชื่อมต่อภายนอก</p></section></div>
    <section className="panel p-6"><h2 className="text-lg font-semibold">ทำไมใช้ Monorepo?</h2><p className="mt-3 text-sm leading-7 text-slate-500">Frontend, Backend และ Shared schema อยู่ในโปรเจกต์เดียวกัน ถ้าเปลี่ยนกติกาของงาน ทั้งหน้าจอและ API จะใช้กติกาชุดเดียวกัน ลดโอกาสที่แต่ละฝั่งเข้าใจข้อมูลไม่ตรงกัน</p><div className="mt-5 flex flex-wrap gap-2"><code className="code-chip">apps/web → หน้าจอ</code><code className="code-chip">apps/api → เซิร์ฟเวอร์</code><code className="code-chip">packages/shared → กติกากลาง</code></div></section>
  </div>;
}

function Integrations({ notify, onGuide }: { notify: (notice: Notice) => void; onGuide: () => void }) {
  const exampleRequest = 'curl -H "x-api-key: YOUR_API_KEY" "http://localhost:3000/api/integrations/due-tasks"';
  const [keys, setKeys] = useState<ApiKey[]>([]); const [reminders, setReminders] = useState<Reminder[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [revision, setRevision] = useState(0);
  const [reminderSettings,setReminderSettings]=useState<{available:boolean;verified:boolean;schedule:string}|null>(null);
  const [name, setName] = useState(''); const [creating, setCreating] = useState(false); const [secret, setSecret] = useState(''); const [revoke, setRevoke] = useState<ApiKey | null>(null); const [revoking, setRevoking] = useState(false);
  useEffect(() => { const controller = new AbortController(); setLoading(true); setError(''); void Promise.all([api<{ keys: ApiKey[] }>('/keys', { signal: controller.signal }), api<{ reminders: Reminder[] }>('/reminders', { signal: controller.signal }),api<{available:boolean;verified:boolean;schedule:string}>('/reminders/settings',{signal:controller.signal})]).then(([keyData, reminderData,settings]) => { setKeys(keyData.keys); setReminders(reminderData.reminders);setReminderSettings(settings); }).catch(err => { if (!controller.signal.aborted) setError(errorText(err)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort(); }, [revision]);
  async function create(event: FormEvent) {
    event.preventDefault(); const parsed = apiKeySchema.safeParse({ name });
    if (!parsed.success) { notify({ message: 'ชื่อการเชื่อมต่อควรมี 2–60 ตัวอักษร', kind: 'error' }); return; }
    setCreating(true);
    try { const result = await api<{ key: ApiKey; secret: string }>('/keys', { method: 'POST', body: JSON.stringify(parsed.data) }); setKeys(items => [result.key, ...items]); setSecret(result.secret); setName(''); notify({ message: 'สร้าง API Key แล้ว คัดลอกและเก็บไว้ก่อนปิดหน้าจอนี้', kind: 'success' }); }
    catch (err) { notify({ message: errorText(err), kind: 'error' }); } finally { setCreating(false); }
  }
  async function copy(value: string) { try { await navigator.clipboard.writeText(value); notify({ message: 'คัดลอกแล้ว', kind: 'success' }); } catch { notify({ message: 'คัดลอกอัตโนมัติไม่ได้ กรุณาเลือกและคัดลอกข้อความด้วยตนเอง', kind: 'error' }); } }
  async function remove() { if (!revoke) return; setRevoking(true); try { await api(`/keys/${revoke.id}`, { method: 'DELETE' }); setSecret(''); setRevoke(null); setRevision(v => v + 1); notify({ message: 'ยกเลิก API Key แล้ว', kind: 'success' }); } catch (err) { notify({ message: errorText(err), kind: 'error' }); } finally { setRevoking(false); } }
  return <div className="space-y-6"><div className="page-intro"><p className="eyebrow">Connect your flow</p><h1 className="page-title">ให้ระบบช่วยเตือน</h1><p className="page-description">อีเมลเตือนงานส่งจาก TaskFlow หลังยืนยันอีเมล ไม่ต้องตั้งค่า n8n</p></div>
    <section className="integration-banner"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15"><Bell size={24} /></div><div><h2 className="text-lg font-semibold">อีเมลเตือนงานอัตโนมัติ</h2><p className="mt-2 max-w-xl text-sm leading-7 text-teal-50/80">{!reminderSettings?'กำลังตรวจสถานะ...':!reminderSettings.available?'ผู้ดูแลเว็บยังไม่ได้ตั้งค่า SMTP สำหรับส่งอีเมล':!reminderSettings.verified?'กรุณายืนยันอีเมลในตั้งค่าบัญชีก่อนรับอีเมลเตือนงาน':'พร้อมส่งสรุปงานที่ครบกำหนดหลัง 07:00 น. เวลาไทยทุกวัน หากไม่มีงานค้างจะไม่ส่งอีเมล'}</p></div></section>
    <p className="text-sm text-slate-500">การเตือนงานอัตโนมัติไม่ต้องสร้าง API Key หรือเชื่อม n8n หากเคยเปิด workflow เดิม ให้ปิดเพื่อไม่ส่งซ้ำ</p>
    <details className="panel p-5"><summary className="cursor-pointer text-sm font-semibold">การเชื่อมต่อขั้นสูง: API Key และ n8n (ไม่จำเป็น)</summary><div className="mt-5 space-y-6">
    <div className="grid gap-6 lg:grid-cols-[1.1fr_.9fr]"><section className="panel p-6"><div className="flex items-center gap-2"><KeyRound size={19} className="text-teal-700" /><h2 className="text-lg font-semibold">API Keys</h2></div><p className="mt-2 text-sm leading-6 text-slate-500">สร้างคีย์แยกสำหรับแต่ละการเชื่อมต่อ คีย์แสดงเต็มเพียงครั้งเดียว</p><form className="mt-5 flex flex-wrap gap-2 sm:flex-nowrap" onSubmit={create}><label className="min-w-0 flex-1 basis-full sm:basis-auto"><span className="sr-only">ชื่อการเชื่อมต่อ</span><input className="field" placeholder="เช่น n8n แจ้งเตือนอีเมล" value={name} minLength={2} maxLength={60} required onChange={e => setName(e.target.value)} disabled={creating} /></label><button className="btn-primary w-full shrink-0 sm:w-auto" disabled={creating}>{creating ? <Spinner small /> : <Plus size={17} />}สร้างคีย์</button></form>
      {secret && <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="text-sm font-semibold text-amber-900">คัดลอกคีย์นี้ก่อนออกจากหน้าจอ</p><p className="mt-1 text-xs leading-6 text-amber-800">เก็บใน Credentials ของ n8n หากทำหายให้ยกเลิกแล้วสร้างใหม่</p><div className="mt-3 flex items-start gap-2"><code className="min-w-0 flex-1 break-all rounded-lg border border-amber-200/80 bg-white p-3 text-xs text-slate-700">{secret}</code><button className="icon-button !bg-white" aria-label="คัดลอก API Key" onClick={() => void copy(secret)}><Copy size={17} /></button></div><button onClick={() => setSecret('')} className="mt-3 text-xs font-semibold text-amber-800 underline underline-offset-4">เก็บคีย์แล้ว ซ่อนข้อความ</button></div>}
      <div className="mt-6 space-y-3">{loading ? <div className="loading-box"><Spinner /><span>กำลังโหลดการเชื่อมต่อ</span></div> : error ? <ErrorBox message={error} retry={() => setRevision(v => v + 1)} /> : keys.length === 0 ? <p className="rounded-xl border border-dashed border-slate-200 px-5 py-8 text-center text-sm text-slate-400">ยังไม่มี API Key สำหรับการเชื่อมต่อ</p> : keys.map(key => { const inactive = !!key.revoked_at || new Date(key.expires_at) < new Date(); return <div key={key.id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-200/80 p-4"><div className="min-w-0"><p className="truncate text-sm font-semibold">{key.name}</p><p className="mt-2 font-mono text-xs text-slate-400">{key.prefix}••••••••</p><p className="mt-2 text-[13px] leading-5 text-slate-400">{key.revoked_at ? 'ยกเลิกแล้ว' : inactive ? 'หมดอายุแล้ว' : `หมดอายุ ${dateLabel(key.expires_at)}`}{key.last_used_at && ` · ใช้ล่าสุด ${dateLabel(key.last_used_at)}`}</p></div>{inactive ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[12px] text-slate-400">{key.revoked_at ? 'ยกเลิก' : 'หมดอายุ'}</span> : <button className="icon-button hover:!bg-red-50 hover:!text-red-600" aria-label={`ยกเลิกคีย์ ${key.name}`} onClick={() => setRevoke(key)}><Trash2 size={15} /></button>}</div>; })}</div>
    </section><section className="panel p-6"><h2 className="text-lg font-semibold">n8n แบบเลือกใช้</h2><ol className="mt-6 space-y-6">{[['สร้าง API Key', 'ตั้งชื่อการเชื่อมต่อ แล้วคัดลอกคีย์ที่แสดงครั้งเดียว'], ['ตั้งค่า workflow ใน n8n', 'ใช้ไฟล์ workflow ในโปรเจกต์ ตั้งเวลา API URL และ SMTP สำหรับส่งอีเมล'], ['เปิด workflow และดูผล', 'n8n อ่านงาน ส่งอีเมล และบันทึกผลสำเร็จที่ประวัติด้านล่าง']].map(([title, detail], index) => <li key={title} className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-50 text-xs font-semibold text-teal-700">{index + 1}</span><div><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-xs leading-6 text-slate-500">{detail}</p></div></li>)}</ol><div className="mt-7 rounded-xl bg-slate-50 p-4 text-xs leading-6 text-slate-500"><p className="font-semibold text-slate-700">เอกสารในโปรเจกต์</p><code className="mt-2 block">docs/n8n-setup.md</code><p className="mt-3">ไฟล์สำหรับ Import ใน n8n</p><code className="mt-1 block break-all">n8n/taskflow-daily-reminder.json</code><p className="mt-2">คีย์ใช้ได้เฉพาะงานแจ้งเตือนและบันทึกผล ไม่ใช้แทนการเข้าสู่ระบบบนเว็บ</p></div></section></div>
    <section className="panel p-6"><div className="flex items-start justify-between gap-4"><div><h2 className="font-semibold">ทดลองอ่านงานที่ต้องแจ้งเตือนผ่าน API</h2><p className="mt-2 text-xs leading-6 text-slate-500">สำหรับ n8n แบบเลือกใช้ แทน YOUR_API_KEY ด้วยคีย์ของคุณ</p></div><button className="icon-button shrink-0" aria-label="คัดลอกตัวอย่างคำสั่ง API" onClick={() => void copy(exampleRequest)}><Copy size={17} /></button></div><pre className="mt-4 overflow-x-auto rounded-xl bg-[#31272b] p-4 text-xs leading-7 text-teal-100"><code>{exampleRequest}</code></pre><p className="mt-3 text-[13px] leading-6 text-slate-400">หากเปิด n8n workflow เดิมไว้ ควรปิดเพื่อไม่ให้อีเมลจากสองระบบซ้ำกัน</p><button onClick={onGuide} className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-teal-700 hover:underline">อ่านภาพรวมและหัวใจหลักของระบบ<ArrowRight size={14} /></button></section>
    </div></details>
    <section className="panel overflow-hidden"><div className="flex items-center justify-between border-b border-slate-100 p-6"><div className="flex items-center gap-2"><Bell size={18} className="text-[#a66a5f]" /><h2 className="font-semibold">ประวัติอีเมลเตือนงาน</h2></div><button className="icon-button" onClick={() => setRevision(v => v + 1)} disabled={loading} aria-label="รีเฟรชประวัติ"><RefreshCw size={16} /></button></div>{loading ? <div className="loading-box"><Spinner /><span>กำลังโหลดประวัติ</span></div> : error ? <div className="p-6"><ErrorBox message={error} /></div> : reminders.length === 0 ? <div className="px-6 py-10 text-center"><Bell size={24} className="mx-auto text-slate-300" /><p className="mt-3 text-sm text-slate-400">ยังไม่มีการแจ้งเตือนที่บันทึกไว้</p><p className="mt-2 text-xs text-slate-400">รายการจะปรากฏหลังเซิร์ฟเวอร์ส่งอีเมลสำเร็จ</p></div> : <div className="divide-y divide-slate-100">{reminders.map(reminder => <div key={reminder.id} className="flex flex-wrap items-center justify-between gap-2 px-6 py-4"><div><p className="text-sm font-medium">{reminder.task_title}</p><p className="mt-1 text-xs text-slate-400">{dateLabel(reminder.notification_date)} · {reminder.channel === 'email' ? 'อีเมล' : reminder.channel}</p></div><span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-3 py-1 text-xs text-teal-700"><Check size={12} />บันทึกแล้ว</span></div>)}</div>}</section>
    {revoke && <Modal title="ยกเลิก API Key นี้?" subtitle={`การเชื่อมต่อ “${revoke.name}” จะเรียก API ด้วยคีย์นี้ไม่ได้อีก`} onClose={() => { if (!revoking) setRevoke(null); }}><div className="mt-7 flex justify-end gap-3"><button className="btn-secondary" disabled={revoking} onClick={() => setRevoke(null)}>เก็บคีย์ไว้</button><button className="btn-danger" disabled={revoking} onClick={() => void remove()}>{revoking && <Spinner small />}ยกเลิกคีย์</button></div></Modal>}
  </div>;
}

function Dashboard({ user, onLogout, onUserUpdated }: { user: User; onLogout: () => void; onUserUpdated: (user: User) => void }) {
  const sk09Draft=useSk09Draft(user);
  const [view, setView] = useState<View>(oauthResult.endsWith('-connected')||oauthError?'account':'all'); const [summary, setSummary] = useState<Summary | null>(null); const [tasks, setTasks] = useState<Task[]>([]);
  const [projects,setProjects]=useState<Project[]>([]),[selectedProject,setSelectedProject]=useState(''),[projectRevision,setProjectRevision]=useState(0);
  useEffect(()=>{const controller=new AbortController();void api<{projects:Project[]}>('/projects',{signal:controller.signal}).then(v=>setProjects(v.projects)).catch(()=>{});return()=>controller.abort();},[projectRevision]);
  const [search, setSearch] = useState(''); const [query, setQuery] = useState(''); const [status, setStatus] = useState(''); const [priority, setPriority] = useState('');
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [revision, setRevision] = useState(0); const [notice, setNotice] = useState<Notice | null>(oauthMessage?{message:oauthMessage,kind:oauthError?'error':'success'}:null);
  const [editor, setEditor] = useState<{ task: Task | null; dueDate?: string } | null>(null); const [deletion, setDeletion] = useState<Task | null>(null); const [deleting, setDeleting] = useState(false); const [busyId, setBusyId] = useState<string | null>(null); const [loggingOut, setLoggingOut] = useState(false);
  const taskView = ['all', 'today'].includes(view);
  useEffect(() => { const timer = window.setTimeout(() => setQuery(search.trim()), 250); return () => window.clearTimeout(timer); }, [search]);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(null), 5500); return () => window.clearTimeout(timer); }, [notice]);
  useEffect(() => {
    if (!taskView) return;
    const controller = new AbortController(); const params = new URLSearchParams();
    if (query) params.set('search', query); if (status) params.set('status', status); if (priority) params.set('priority', priority); if(selectedProject)params.set('project_id',selectedProject);
    setLoading(true); setError('');
    void Promise.all([api<{ tasks: Task[] }>(`/tasks?${params}`, { signal: controller.signal }), api<{ summary: Summary }>(`/summary?${selectedProject?`project_id=${encodeURIComponent(selectedProject)}`:''}`, { signal: controller.signal })]).then(([taskData, summaryData]) => { setTasks(taskData.tasks); setSummary(summaryData.summary); }).catch(err => { if (!controller.signal.aborted) { if (err instanceof ApiError && err.status === 401) onLogout(); else setError(errorText(err)); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [query, status, priority, selectedProject, revision, taskView, onLogout]);
  function navigate(next: View) { setView(next); setSearch(''); setQuery(''); setStatus(''); setPriority(''); }
  async function logout() { setLoggingOut(true); try { await sk09Draft.save(); await api('/auth/logout', { method: 'POST' }); onLogout(); } catch (err) { setNotice({ message: errorText(err), kind: 'error' }); } finally { setLoggingOut(false); } }
  async function update(task: Task, next: Task['status']) {
    setBusyId(task.id); try { await api(`/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ status: next }) }); setRevision(v => v + 1); setNotice({ message: next === 'completed' ? 'เยี่ยมเลย อีกหนึ่งงานที่สำเร็จแล้ว' : 'อัปเดตสถานะงานแล้ว', kind: 'success' }); } catch (err) { setNotice({ message: errorText(err), kind: 'error' }); } finally { setBusyId(null); }
  }
  async function remove() { if (!deletion) return; setDeleting(true); try { await api(`/tasks/${deletion.id}`, { method: 'DELETE' }); setDeletion(null); setRevision(v => v + 1); setNotice({ message: 'ลบงานแล้ว', kind: 'success' }); } catch (err) { setNotice({ message: errorText(err), kind: 'error' }); } finally { setDeleting(false); } }
  const visibleTasks = tasks;
  const navItems = [{ value: 'all', icon: LayoutGrid, label: 'งานทั้งหมด' }, { value: 'today', icon: CalendarDays, label: 'ปฏิทินงาน' }, { value: 'sk09', icon: FileText, label: 'บันทึก สก.09' }, { value: 'github', icon: Waypoints, label: 'GitHub' }, { value: 'guide', icon: FileText, label: 'เข้าใจระบบ' }] as const;
  const completedPercent = summary?.total ? Math.round(summary.completed / summary.total * 100) : 0;
  return <div className="app-shell">
    <aside className="sidebar"><div className="px-5 pb-7 pt-7"><button type="button" onClick={() => { setSelectedProject(''); navigate('all'); }} aria-label="กลับไปงานทั้งหมด" className="rounded-lg text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700"><Logo compact /></button></div><div className="px-3"><p className="mb-3 hidden px-3 text-[12px] font-semibold uppercase tracking-[.2em] text-slate-400 md:block">Workspace</p><nav aria-label="เมนูหลัก" className="sidebar-nav">{navItems.map(item => <button key={item.value} onClick={() => navigate(item.value)} className={`nav-item ${view === item.value ? 'active' : ''}`} aria-current={view === item.value ? 'page' : undefined}><item.icon size={18} /><span>{item.label}</span>{item.value === 'all' && summary && <span className="ml-auto hidden rounded-md px-1.5 py-0.5 text-[12px] md:block">{summary.total}</span>}</button>)}</nav></div><div className="mt-auto hidden p-4 md:block"><div className="rounded-xl border border-teal-100 bg-teal-50/60 p-4"><Sparkles size={19} className="text-[#a66a5f]" /><p className="mt-3 text-sm font-semibold">ทีละงาน ก็ไปได้ไกล</p><p className="mt-2 text-xs leading-6 text-slate-500">ความก้าวหน้าเล็ก ๆ ในทุกวัน<br />มีความหมายเสมอ</p></div></div></aside>
    <div className="min-w-0 flex-1"><header className="workspace-header"><div className="flex items-center gap-2 text-xs text-slate-400"><span className="h-1.5 w-1.5 rounded-full bg-teal-500" /><span>พื้นที่ทำงานส่วนตัว</span><span className="hidden text-slate-300 sm:inline">/</span><span className="hidden text-slate-600 sm:inline">{view === 'account' ? 'ตั้งค่าบัญชี' : view === 'integrations' ? 'การเชื่อมต่อ' : navItems.find(item => item.value === view)?.label}</span></div><div className="flex items-center gap-3"><Notifications revision={revision} onSelect={task => setEditor({ task })} onGitHub={projectId=>{if(projectId)setSelectedProject(projectId);navigate('github');}} onExpired={onLogout} /><span className="hidden text-xs text-slate-400 sm:block">{dateLabel(TODAY())}</span><ProfileMenu user={user} onNavigate={navigate} onLogout={() => void logout()} loggingOut={loggingOut} /></div></header>
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:px-10 lg:py-10"><Projects selected={selectedProject} onSelect={setSelectedProject} projects={projects} onRefresh={()=>{setProjectRevision(v=>v+1);setRevision(v=>v+1);}}/>
      {view === 'github' ? <GitHubWorkspace onAccount={() => navigate('account')} preferredRepo={projects.find(p=>p.id===selectedProject)?.github_repo??null}/> : view === 'sk09' ? <Sk09Form draft={sk09Draft} projectId={selectedProject&&selectedProject!=='unassigned'?selectedProject:null} /> : view === 'today' ? <TaskCalendar tasks={tasks} loading={loading} error={error} onRefresh={() => setRevision(value => value + 1)} onSelect={task => setEditor({ task })} onCreate={dueDate => setEditor({ task: null, dueDate })} /> : taskView ? <><div className="page-intro flex flex-wrap items-end justify-between gap-5"><div><p className="eyebrow">{'Your personal workspace'}</p><h1 className="page-title">{`สวัสดี, ${displayName(user).split(' ')[0]}`}<span className="text-[#a66a5f]">.</span></h1><p className="page-description">{'วันใหม่ เริ่มจากจัดสิ่งที่ต้องทำให้ชัดเจน'}</p></div><button className="btn-primary" onClick={() => setEditor({ task: null })}><Plus size={18} />เพิ่มงานใหม่</button></div>
      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">{[{ key: 'total', label: 'งานทั้งหมด', icon: ListTodo, color: 'bg-slate-100 text-slate-500' }, { key: 'pending', label: 'ยังไม่เริ่ม', icon: Circle, color: 'bg-amber-50 text-[#a66a5f]' }, { key: 'in_progress', label: 'กำลังทำ', icon: Clock3, color: 'bg-blue-50 text-blue-500' }, { key: 'completed', label: 'เสร็จแล้ว', icon: CheckCheck, color: 'bg-teal-50 text-teal-600' }].map(item => <div key={item.key} className="panel p-4 sm:p-5"><div className="flex items-center justify-between gap-2"><span className="text-xs text-slate-500">{item.label}</span><span className={`flex h-8 w-8 items-center justify-center rounded-lg ${item.color}`}><item.icon size={16} /></span></div><div className="mt-3 flex items-end gap-2"><strong className="text-3xl font-semibold tracking-tight">{summary ? summary[item.key as 'total' | 'pending' | 'in_progress' | 'completed'] : '—'}</strong><span className="mb-1 text-xs text-slate-400">งาน</span></div></div>)}</div>
      <section className="panel mt-6 overflow-hidden"><div className="border-b border-slate-100 px-5 py-5 sm:px-6"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><h2 className="text-base font-semibold">{'รายการงาน'}</h2>{!loading && !error && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[12px] font-medium text-slate-500">{visibleTasks.length}</span>}</div><button className="icon-button" onClick={() => setRevision(v => v + 1)} disabled={loading} aria-label="รีเฟรชงาน"><RefreshCw size={16} /></button></div><div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500"><span className="priority-badge priority-high">สูง</span><span className="priority-badge priority-medium">ปกติ</span><span className="priority-badge priority-low">ต่ำ</span><span>เรียงวันส่งใกล้สุดก่อน · วันเดียวกันเรียงตามความสำคัญ · งานเสร็จแล้วอยู่ท้าย</span></div><div className="mt-4 flex flex-wrap gap-2"><label className="relative min-w-40 flex-1"><Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><span className="sr-only">ค้นหางาน</span><input type="search" className="field !py-2.5 !pl-10" value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาชื่องานหรือรายละเอียด..." maxLength={100} /></label><label><span className="sr-only">กรองสถานะ</span><select className="field !w-auto !py-2.5 !text-xs" value={status} onChange={e => setStatus(e.target.value)}><option value="">ทุกสถานะ</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span className="sr-only">กรองความสำคัญ</span><select className="field !w-auto !py-2.5 !text-xs" value={priority} onChange={e => setPriority(e.target.value)}><option value="">ทุกความสำคัญ</option>{Object.entries(PRIORITY_LABELS).map(([value, label]) => <option key={value} value={value}>ความสำคัญ{label}</option>)}</select></label></div></div>
      {loading ? <div className="loading-box min-h-64"><Spinner /><span>กำลังโหลดงานของคุณ</span></div> : error ? <div className="p-6"><ErrorBox message={error} retry={() => setRevision(v => v + 1)} /></div> : visibleTasks.length ? <div className="divide-y divide-slate-100">{visibleTasks.map(task => <TaskRow key={task.id} task={task} edit={() => setEditor({ task })} remove={() => setDeletion(task)} update={next => void update(task, next)} busy={busyId === task.id} />)}</div> : <div className="px-6 py-14 text-center"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-teal-600"><ListTodo size={25} /></span><h3 className="mt-5 text-base font-semibold">{query || status || priority ? 'ยังไม่พบงานที่ตรงกัน' : 'เริ่มจากงานเล็ก ๆ สักหนึ่งอย่าง'}</h3><p className="mx-auto mt-2 max-w-xs text-sm leading-7 text-slate-400">{query || status || priority ? 'ลองเปลี่ยนคำค้นหาหรือตัวกรอง แล้วค้นหาอีกครั้ง' : 'เพิ่มงาน แล้วกำหนดวันที่และความสำคัญตามจังหวะของคุณ'}</p>{!query && !status && !priority && <button className="btn-secondary mx-auto mt-6" onClick={() => setEditor({ task: null })}><Plus size={16} />เพิ่มงานแรก</button>}</div>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/50 px-5 py-3.5 text-[13px] text-slate-400 sm:px-6"><span>งานจะแสดงเฉพาะในบัญชีของคุณ</span>{summary && <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-teal-500" />สำเร็จแล้ว {completedPercent}%{summary.overdue > 0 && ` · เกินกำหนด ${summary.overdue} งาน`}</span>}</div></section>
      <div className="mt-7 flex items-center justify-center gap-2 text-xs text-slate-400"><span className="h-px w-8 bg-slate-200" /><Sparkles size={12} className="text-[#a66a5f]" /><span>ทำทีละอย่าง ด้วยความตั้งใจ</span><span className="h-px w-8 bg-slate-200" /></div></> : view === 'account' ? <AccountSettings user={user} onSaved={onUserUpdated} onDeleted={onLogout} /> : view === 'integrations' ? <Integrations notify={setNotice} onGuide={() => navigate('guide')} /> : <Guide />}
    </main></div>
    {editor && <TaskForm task={editor.task} initialDueDate={editor.dueDate} projects={projects} selectedProject={selectedProject} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); setRevision(v => v + 1); setNotice({ message: editor.task ? 'บันทึกการแก้ไขแล้ว' : 'เพิ่มงานใหม่แล้ว', kind: 'success' }); }} />}
    {deletion && <Modal title="ลบงานนี้?" subtitle={`“${deletion.title}” จะถูกลบออกจากรายการของคุณ`} onClose={() => { if (!deleting) setDeletion(null); }}><div className="mt-7 flex justify-end gap-3"><button className="btn-secondary" onClick={() => setDeletion(null)} disabled={deleting}>เก็บงานไว้</button><button className="btn-danger" onClick={() => void remove()} disabled={deleting}>{deleting && <Spinner small />}ลบงาน</button></div></Modal>}
    {notice && <div className={`toast ${notice.kind === 'error' ? 'toast-error' : ''}`} role={notice.kind === 'error' ? 'alert' : 'status'}><span>{notice.kind === 'success' ? <Check size={18} /> : <Circle size={18} />}</span><p>{notice.message}</p><button onClick={() => setNotice(null)} aria-label="ปิดข้อความแจ้งเตือน"><X size={15} /></button></div>}
    <AssistantChat user={user} draft={sk09Draft} onNavigate={navigate} onChanged={()=>{setRevision(v=>v+1);setProjectRevision(v=>v+1);}} onUserUpdated={onUserUpdated}/>
  </div>;
}

export default function App() {
  // Read without changing the URL here: React StrictMode can call initializers twice.
  const [resetLink, setResetLink] = useState<{ token: string } | null>(() => /^\/reset-password\/?$/.test(window.location.pathname)
    ? { token: new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '' } : null);
  const [verificationLink]=useState<string|null>(()=>/^\/verify-email\/?$/.test(window.location.pathname)?new URLSearchParams(window.location.hash.slice(1)).get('token')??'':null);
  const openedAsReset = useRef(resetLink !== null);
  const [user, setUser] = useState<User | null>(null); const [checking, setChecking] = useState(resetLink === null&&verificationLink===null); const [authMode, setAuthMode] = useState<AuthMode | null>(oauthError?'login':null); const [connectionError, setConnectionError] = useState(''); const [revision, setRevision] = useState(0);
  const [authNotice, setAuthNotice] = useState(oauthMessage??'');
  useEffect(()=>{if(oauthResult||oauthError) window.history.replaceState(window.history.state,'',window.location.pathname);},[]);
  const clearUser = useRef(() => setUser(null)).current;
  // Keep the token in React memory and clear the fragment before the first paint.
  useLayoutEffect(() => { if (openedAsReset.current||verificationLink!==null) window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search); }, []);
  useEffect(() => { if (openedAsReset.current||verificationLink!==null) return; const controller = new AbortController(); setChecking(true); setConnectionError(''); void api<{ user: User }>('/auth/me', { signal: controller.signal }).then(result => setUser(result.user)).catch(err => { if (!controller.signal.aborted && !(err instanceof ApiError && err.status === 401)) setConnectionError(errorText(err)); }).finally(() => { if (!controller.signal.aborted) setChecking(false); }); return () => controller.abort(); }, [revision]);
  function leaveReset(mode: AuthMode, message = '') {
    setResetLink(null); setAuthMode(mode); setAuthNotice(message);
    window.history.replaceState(window.history.state, '', '/');
  }
  if (resetLink) return <ResetPasswordPage token={resetLink.token} onLogin={() => leaveReset('login')} onRequestNew={() => leaveReset('forgot')} onComplete={message => leaveReset('login', message)} />;
  if (verificationLink!==null) return <VerifyEmailPage token={verificationLink}/>;
  if (checking) return <div className="flex min-h-screen items-center justify-center "><div className="flex flex-col items-center gap-6"><Logo /><Spinner /><p className="text-xs text-slate-400">กำลังเตรียมพื้นที่ของคุณ</p></div></div>;
  return user ? <Dashboard user={user} onLogout={clearUser} onUserUpdated={setUser} /> : <><Landing openAuth={mode => { setAuthMode(mode); setAuthNotice(''); }} />{connectionError && <div className="fixed bottom-5 left-5 right-5 mx-auto max-w-xl shadow-lg"><ErrorBox message={`เชื่อมต่อ API ไม่สำเร็จ: ${connectionError}`} retry={() => setRevision(v => v + 1)} /></div>}{authMode && <AuthModal mode={authMode} notice={authNotice} setMode={mode => { setAuthMode(mode); setAuthNotice(''); }} onClose={() => { setAuthMode(null); setAuthNotice(''); }} onLogin={next => { setUser(next); setAuthMode(null); setAuthNotice(''); setConnectionError(''); }} />}</>;
}
