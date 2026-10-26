import { useCallback, useEffect, useRef, useState } from 'react';
import { sk09DraftSchema, type Sk09Draft, type Sk09DraftData, type User } from '@taskflow/shared';

async function request(options:RequestInit={}) {
  const response=await fetch('/api/sk09/draft',{...options,credentials:'same-origin',headers:{'Content-Type':'application/json'}});
  const result=await response.json();
  if(!response.ok) throw new Error(result.error?.message??'บันทึกร่างไม่สำเร็จ กรุณาลองอีกครั้ง');
  return result as {draft:Sk09Draft|null};
}

export function useSk09Draft(user:User) {
  const [data,setData]=useState<Sk09DraftData>(()=>({name:user.name,studentId:'',company:'',department:'',startDate:'',endDate:'',startTime:'08:00',endTime:'17:00',days:Array.from({length:5},()=>({assignment:'',result:''}))}));
  const [ready,setReady]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),[savedAt,setSavedAt]=useState('');
  const current=useRef(data),saved=useRef(JSON.stringify(data)),version=useRef(0),pending=useRef<Promise<void>|null>(null);
  const dirty=JSON.stringify(data)!==saved.current;

  const load=useCallback(async(signal?:AbortSignal)=>{
    setReady(false);setError('');
    try {
      const {draft}=await request({signal});
      if(signal?.aborted) return;
      if(draft) {
        const restored=sk09DraftSchema.parse(draft.data);
        current.current=restored;saved.current=JSON.stringify(restored);version.current=draft.version;
        setData(restored);setSavedAt(draft.updated_at);
      }
      setReady(true);
    } catch(err) {if(!signal?.aborted) setError(err instanceof Error?err.message:'โหลดร่างไม่สำเร็จ');}
  },[]);
  useEffect(()=>{const controller=new AbortController();void load(controller.signal);return ()=>controller.abort();},[load]);

  const save=useCallback(async()=>{
    if(pending.current) return pending.current;
    if(!ready || JSON.stringify(current.current)===saved.current) return;
    setSaving(true);setError('');
    const operation=(async()=>{
      try {
        // Serialize writes and include edits made while a previous save is in flight.
        while(JSON.stringify(current.current)!==saved.current) {
          const snapshot=current.current;
          const {draft}=await request({method:'PUT',body:JSON.stringify({version:version.current,data:snapshot})});
          if(!draft) throw new Error('บันทึกร่างไม่สำเร็จ');
          saved.current=JSON.stringify(snapshot);version.current=draft.version;setSavedAt(draft.updated_at);
        }
      } catch(err) {setError(err instanceof Error?err.message:'บันทึกร่างไม่สำเร็จ');throw err;}
      finally {pending.current=null;setSaving(false);}
    })();
    pending.current=operation;
    return operation;
  },[ready]);
  useEffect(()=>{
    if(!ready || !dirty || error) return;
    const timer=setTimeout(()=>{void save().catch(()=>{});},800);
    return ()=>clearTimeout(timer);
  },[data,ready,dirty,error,save]);
  useEffect(()=>{
    const warn=(event:BeforeUnloadEvent)=>{
      if(JSON.stringify(current.current)!==saved.current){event.preventDefault();event.returnValue='';}
    };
    window.addEventListener('beforeunload',warn);
    return ()=>window.removeEventListener('beforeunload',warn);
  },[]);
  function update(patch:Partial<Sk09DraftData>) {
    current.current={...current.current,...patch};setData(current.current);
  }
  return {data,update,ready,saving,error,savedAt,dirty,save,reload:()=>load()};
}
export type Sk09DraftController=ReturnType<typeof useSk09Draft>;
