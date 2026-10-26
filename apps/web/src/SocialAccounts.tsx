import {useEffect,useState} from 'react';
import {Github,Link2,ExternalLink} from 'lucide-react';

export async function socialRequest<T>(path:string,options:RequestInit={}):Promise<T> {
  const response=await fetch(`/api${path}`,{...options,credentials:'same-origin',headers:{'Content-Type':'application/json',...options.headers}});
  const data=response.status===204?null:await response.json();
  if(!response.ok) throw new Error(data?.error?.message??'เชื่อมต่อไม่สำเร็จ กรุณาลองอีกครั้ง');
  return data;
}
async function connect(provider:'google'|'github',link=false) {
  const {url}=await socialRequest<{url:string}>(`/auth/${provider}/${link&&provider==='google'?'link':'start'}`,{method:'POST',body:'{}'});
  window.location.assign(url);
}
export function GoogleSignIn() {
  const [enabled,setEnabled]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{const abort=new AbortController();void socialRequest<{google:boolean}>('/auth/providers',{signal:abort.signal}).then(v=>setEnabled(v.google)).catch(()=>{});return ()=>abort.abort();},[]);
  if(!enabled) return null;
  return <div className="mt-5"><button type="button" className="btn-secondary w-full" disabled={busy} onClick={()=>{setBusy(true);setError('');void connect('google').catch(e=>{setError(e.message);setBusy(false);});}}>{busy?'กำลังเปิด Google…':'เข้าสู่ระบบด้วย Google'}</button>{error&&<p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}</div>;
}
type Connections={accounts:{provider:string;login:string}[];google:boolean;github:boolean;install_url:string};
export default function SocialAccounts() {
  const [info,setInfo]=useState<Connections|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
  useEffect(()=>{const abort=new AbortController();void socialRequest<Connections>('/auth/connections',{signal:abort.signal}).then(setInfo).catch(e=>{if(!abort.signal.aborted)setError(e.message);});return ()=>abort.abort();},[revision]);
  async function start(provider:'google'|'github'){setBusy(true);setError('');try{await connect(provider,true);}catch(e){setError((e as Error).message);setBusy(false);}}
  async function disconnect(){if(!window.confirm('ยกเลิกการเชื่อม GitHub กับ TaskFlow? ไฟล์และ repository บน GitHub จะยังอยู่'))return;setBusy(true);setError('');try{await socialRequest('/auth/connections/github',{method:'DELETE'});setRevision(v=>v+1);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <section className="panel mt-6 p-6" aria-label="บัญชีที่เชื่อมต่อ"><h2 className="flex items-center gap-2 text-lg font-semibold"><Link2 size={20}/>บัญชีที่เชื่อมต่อ</h2><p className="mt-2 text-sm leading-7 text-slate-500">เชื่อม Google เพื่อเข้าสู่บัญชีเดิม และเชื่อม GitHub เพื่อดู repository กับ pipeline</p>
    {error&&<p role="alert" className="mt-3 text-sm text-red-700">{error} <button type="button" className="underline" onClick={()=>{setError('');setRevision(v=>v+1);}}>ลองอีกครั้ง</button></p>}
    {!info?<p className="mt-4 text-sm">กำลังโหลดการเชื่อมต่อ…</p>:<div className="mt-4 space-y-4">{(['google','github'] as const).map(provider=>{
      const account=info.accounts.find(a=>a.provider===provider);
      return <div key={provider} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4"><div><p className="font-semibold">{provider==='google'?'Google':'GitHub'}</p><p className="mt-1 text-sm text-slate-500">{account?account.login:info[provider]?'ยังไม่เชื่อมต่อ':'ผู้ดูแลยังไม่ได้ตั้งค่าบริการนี้'}</p></div><div className="flex flex-wrap gap-2">{(!account||provider==='github')&&<button type="button" className="btn-secondary" disabled={!info[provider]||busy} onClick={()=>void start(provider)}>{provider==='github'&&<Github size={16}/>} {account?'เชื่อมใหม่':`เชื่อม ${provider==='google'?'Google':'GitHub'}`}</button>}{provider==='github'&&account&&<button type="button" className="btn-secondary" disabled={busy} onClick={()=>void disconnect()}>ยกเลิกการเชื่อม</button>}</div></div>;
    })}<a className="inline-flex items-center gap-2 text-sm text-teal-700 underline" href={info.install_url} target="_blank" rel="noreferrer"><ExternalLink size={15}/>ติดตั้งหรือเลือก repository ที่ GitHub App เข้าถึงได้</a><p className="text-xs leading-6 text-slate-500">หากไม่พบ repository ให้ติดตั้ง GitHub App ให้บัญชีหรือองค์กรนั้นก่อน แล้วเลือกสิทธิ์ repository ที่ต้องการ บัญชีที่สมัครผ่าน Google สามารถตั้งรหัสผ่านด้วย “ลืมรหัสผ่าน” เมื่อต้องการใช้รหัสผ่านหรือเปลี่ยนอีเมล</p></div>}
  </section>;
}
