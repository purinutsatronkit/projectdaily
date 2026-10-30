import {randomUUID} from 'node:crypto';
import {Hono} from 'hono';
import {z} from 'zod';
import {ApiError,all,get,now,transaction,type Env} from './context.ts';
import type {Database} from './db.ts';

const MAX_FILE=5*1024*1024,MAX_ACCOUNT=100*1024*1024,MAX_TOTAL=4*1024*1024*1024;
type Conversation={id:string;user_low:string;user_high:string};
function imageType(bytes:Uint8Array){
  const match=(signature:number[])=>signature.every((value,index)=>bytes[index]===value);
  if(match([137,80,78,71,13,10,26,10]))return'image/png';
  if(match([255,216,255]))return'image/jpeg';
  if(match([71,73,70,56,55,97])||match([71,73,70,56,57,97]))return'image/gif';
  if(bytes.length>12&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP')return'image/webp';
  return null;
}
export function directChatRoutes(db:Database){
  const routes=new Hono<Env>();
  async function access(id:string,userId:string){const room=await get<Conversation>(db,'SELECT id,user_low,user_high FROM direct_conversations WHERE id=? AND (user_low=? OR user_high=?)',id,userId,userId);if(!room)throw new ApiError(404,'NOT_FOUND','ไม่พบห้องแชทนี้');return room;}
  routes.get('/',async c=>{
    const id=c.get('user').id;
    const conversations=await all(db,`SELECT d.id,d.updated_at,u.id peer_id,u.name peer_name,u.nickname peer_nickname,u.email peer_email,
      (SELECT body FROM direct_messages WHERE conversation_id=d.id ORDER BY created_at DESC,id DESC LIMIT 1) last_message,
      (SELECT COUNT(*) FROM direct_messages m WHERE m.conversation_id=d.id AND m.sender_id<>? AND m.read_at IS NULL) unread
      FROM direct_conversations d JOIN users u ON u.id=CASE WHEN d.user_low=? THEN d.user_high ELSE d.user_low END
      WHERE d.user_low=? OR d.user_high=? ORDER BY d.updated_at DESC LIMIT 100`,id,id,id,id);
    return c.json({conversations});
  });
  routes.post('/',async c=>{
    const body=await c.req.json().catch(()=>null),parsed=z.object({email:z.email().max(200)}).safeParse(body);
    if(!parsed.success)throw new ApiError(400,'INVALID_RECIPIENT','กรอกอีเมลผู้รับให้ถูกต้อง');
    const peer=await get<{id:string}>(db,'SELECT id FROM users WHERE email=?',parsed.data.email.trim().toLowerCase());
    if(!peer||peer.id===c.get('user').id)throw new ApiError(404,'RECIPIENT_NOT_FOUND','ไม่พบบัญชีผู้รับ');
    const [low,high]=[peer.id,c.get('user').id].sort();const id=randomUUID(),stamp=now();
    await db.prepare('INSERT INTO direct_conversations VALUES(?,?,?,?,?) ON CONFLICT(user_low,user_high) DO NOTHING').run(id,low,high,stamp,stamp);
    const room=(await get<Conversation>(db,'SELECT id,user_low,user_high FROM direct_conversations WHERE user_low=? AND user_high=?',low,high))!;
    return c.json({conversation:room});
  });
  routes.get('/unread',async c=>c.json({count:(await get<{count:number}>(db,`SELECT COUNT(*) count FROM direct_messages m JOIN direct_conversations d ON d.id=m.conversation_id WHERE (d.user_low=? OR d.user_high=?) AND m.sender_id<>? AND m.read_at IS NULL`,c.get('user').id,c.get('user').id,c.get('user').id))!.count}));
  routes.get('/:id/messages',async c=>{
    const room=await access(c.req.param('id'),c.get('user').id);
    const messages=await all(db,`SELECT m.id,m.sender_id,m.body,m.created_at,m.read_at,a.id attachment_id,a.filename,a.media_type,a.size
      FROM direct_messages m LEFT JOIN direct_attachments a ON a.message_id=m.id
      WHERE m.conversation_id=? ORDER BY m.created_at DESC,m.id DESC LIMIT 100`,room.id);
    return c.json({messages:messages.reverse()});
  });
  routes.post('/:id/messages',async c=>{
    const room=await access(c.req.param('id'),c.get('user').id);
    if(!c.req.header('content-type')?.toLowerCase().startsWith('multipart/form-data;'))throw new ApiError(415,'FORM_REQUIRED','กรุณาส่งข้อความเป็นแบบฟอร์ม');
    const form=await c.req.formData().catch(()=>null);if(!form)throw new ApiError(400,'INVALID_FORM','อ่านข้อมูลไม่สำเร็จ');
    const rawBody=form.get('body'),body=typeof rawBody==='string'?rawBody.trim():'';
    const file=form.get('file');if(file!==null&&!(file instanceof File))throw new ApiError(400,'INVALID_FILE','ไฟล์ไม่ถูกต้อง');
    if(body.length>4000||(!body&&!file))throw new ApiError(400,'INVALID_MESSAGE','กรอกข้อความหรือเลือกไฟล์ ข้อความยาวได้ไม่เกิน 4,000 ตัวอักษร');
    let bytes:Uint8Array|null=null,mediaType='',filename='';
    if(file){if(file.size<1||file.size>MAX_FILE)throw new ApiError(413,'FILE_TOO_LARGE','ไฟล์ต้องไม่เกิน 5 MB');
      bytes=new Uint8Array(await file.arrayBuffer());filename=file.name.replace(/[\\/\x00-\x1f]/g,'_').trim().slice(0,150)||'file';
      if(/\.(html?|svg|js|mjs|exe|bat|cmd|ps1)$/i.test(filename))throw new ApiError(400,'FILE_TYPE','ไม่รองรับไฟล์ชนิดนี้');
      mediaType=imageType(bytes)??'application/octet-stream';
    }
    const id=randomUUID(),stamp=now();
    await transaction(db,async()=>{
      if(bytes){const used=(await get<{size:number}>(db,'SELECT COALESCE(SUM(size),0) size FROM direct_attachments WHERE uploader_id=?',c.get('user').id))!.size;if(used+bytes.length>MAX_ACCOUNT)throw new ApiError(400,'STORAGE_LIMIT','พื้นที่ไฟล์แชทของบัญชีเต็ม (100 MB)');const total=(await get<{size:number}>(db,'SELECT COALESCE(SUM(size),0) size FROM direct_attachments'))!.size;if(total+bytes.length>MAX_TOTAL)throw new ApiError(400,'STORAGE_LIMIT','พื้นที่ไฟล์รวมของระบบเต็ม กรุณาติดต่อผู้ดูแล');}
      await db.prepare('INSERT INTO direct_messages VALUES(?,?,?,?,?,NULL)').run(id,room.id,c.get('user').id,body,stamp);
      if(bytes)await db.prepare('INSERT INTO direct_attachments VALUES(?,?,?,?,?,?,?,?)').run(randomUUID(),id,c.get('user').id,filename,mediaType,bytes.length,bytes,stamp);
      await db.prepare('UPDATE direct_conversations SET updated_at=? WHERE id=?').run(stamp,room.id);
    });
    return c.json({id},201);
  });
  routes.delete('/:id/messages/:messageId',async c=>{
    const room=await access(c.req.param('id'),c.get('user').id);
    const result=await db.prepare('DELETE FROM direct_messages WHERE id=? AND conversation_id=? AND sender_id=?').run(c.req.param('messageId'),room.id,c.get('user').id);
    if(!result.changes)throw new ApiError(404,'NOT_FOUND','ไม่พบข้อความนี้');
    return c.body(null,204);
  });
  routes.post('/:id/read',async c=>{const room=await access(c.req.param('id'),c.get('user').id);await db.prepare('UPDATE direct_messages SET read_at=COALESCE(read_at,?) WHERE conversation_id=? AND sender_id<>? AND read_at IS NULL').run(now(),room.id,c.get('user').id);return c.body(null,204);});
  routes.get('/:id/attachments/:attachmentId',async c=>{
    await access(c.req.param('id'),c.get('user').id);
    const file=await db.prepare(`SELECT a.filename,a.media_type,a.data FROM direct_attachments a JOIN direct_messages m ON m.id=a.message_id WHERE a.id=? AND m.conversation_id=?`).get(c.req.param('attachmentId'),c.req.param('id')) as {filename:string;media_type:string;data:Uint8Array}|undefined;
    if(!file)throw new ApiError(404,'NOT_FOUND','ไม่พบไฟล์นี้');
    c.header('Content-Type',file.media_type);c.header('Content-Disposition',`${file.media_type.startsWith('image/')?'inline':'attachment'}; filename="file"; filename*=UTF-8''${encodeURIComponent(file.filename)}`);
    c.header('Content-Security-Policy',"default-src 'none'; sandbox");
    return c.body(new Uint8Array(file.data).buffer);
  });
  return routes;
}
