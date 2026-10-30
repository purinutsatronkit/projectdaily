import { Hono } from 'hono';
import { saveSk09DraftSchema, type Sk09Draft } from '@taskflow/shared';
import { ApiError, get, now, parseBody, transaction, type Env } from './context.ts';
import type { Database } from './db.ts';

type Row = {data:string;version:number;updated_at:string};
const decode = (row:Row):Sk09Draft => ({...row,data:JSON.parse(row.data)});
export function sk09Routes(db:Database) {
  const routes=new Hono<Env>();
  const read=async (userId:string)=>await get<Row>(db,'SELECT data,version,updated_at FROM sk09_drafts WHERE user_id=?',userId);
  routes.get('/draft',async c=>{const row=await read(c.get('user').id);return c.json({draft:row?decode(row):null});});
  routes.put('/draft',async c=>{
    const body=await parseBody(c,saveSk09DraftSchema),userId=c.get('user').id,data=JSON.stringify(body.data);
    const draft=await transaction(db,async ()=>{
      const previous=await read(userId);
      // Retrying a committed request whose response was lost is safe.
      if(previous?.data===data) return decode(previous);
      if((previous?.version??0)!==body.version) throw new ApiError(409,'DRAFT_CONFLICT','ร่างถูกแก้ไขจากแท็บหรือเครื่องอื่นแล้ว กรุณาคัดลอกข้อความที่ยังต้องการเก็บ ก่อนโหลดร่างล่าสุด');
      const updated_at=now(),version=body.version+1;
      await db.prepare('INSERT INTO sk09_drafts(user_id,data,version,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data,version=excluded.version,updated_at=excluded.updated_at').run(userId,data,version,updated_at);
      return {data:body.data,version,updated_at};
    });
    return c.json({draft});
  });
  return routes;
}
