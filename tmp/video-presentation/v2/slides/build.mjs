import fs from 'node:fs/promises';
import path from 'node:path';
import {Presentation,PresentationFile} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs';
import {C,text,title,sub,node,link,label,body,table,actor,message,route} from './design.mjs';
const W='C:/Users/User/Documents/ChatGPT/new Project website';
const TMP=path.join(W,'tmp/video-presentation/v2/slides');
const data=JSON.parse(await fs.readFile(path.join(W,'tmp/video-presentation/v2/slide-scripts.json'),'utf8'));
const p=Presentation.create({slideSize:{width:1280,height:720}});
const cover=await fs.readFile(path.join(W,'tmp/video-presentation/slides/cover-background.png'));
const draftOnly=process.argv.includes('--draft-only');
function add(i,{dark=false,heading}={}){
 const s=p.slides.add();s.background.fill=dark?C.navy:C.white;const d=data.slides[i-1];
 if(i!==1)title(s,i,d.title,dark);
 s.speakerNotes.text=`บทพูดสไลด์ ${i} (ประมาณ ${d.seconds} วินาที)\n\n${d.script}\n\nแหล่งข้อมูลสำหรับผู้บรรยาย\n${d.sources.join('\n')}\n\nขอบเขตการสรุป\n${data.sourceScope}\n\nคำอธิบายแผนภาพ\n${d.diagram.description}`;
 return s;
}
function note(s,value,y=622,dark=false){body(s,value,{ x: 72, y, w: 1090, h: 65 },24,dark?C.lightTeal:C.teal);}
function N(s,i,id,{ x, y, w, h },options={}){const d=data.slides[i-1].diagram.nodes.find(n=>n.id===id);return node(s,id,d.label,{ x, y, w, h },options);}

// 1. Retain the illustration and typographic hierarchy of v1.
{
 const s=add(1,{dark:true});s.images.add({blob:cover.buffer.slice(cover.byteOffset,cover.byteOffset+cover.byteLength),contentType:'image/png',alt:'ภาพประกอบแนวคิดระบบข้อมูลและ workflow',fit:'cover',position:{left:0,top:0,width:1280,height:720}});
 text(s,'cover-kicker','สรุปสองวิดีโอ พร้อมแผนภาพประกอบ',{ x: 72, y: 76, w: 770, h: 42 },{ size: 25, color: C.lightTeal });
 text(s,'cover-title','ระบบอัตโนมัติ\nและการออกแบบ\nซอฟต์แวร์',{ x: 72, y: 164, w: 705, h: 294 },{ size: 62, color: C.white, bold: true });
 text(s,'cover-topics','n8n และ AI    /    System Design',{ x: 72, y: 506, w: 680, h: 50 },{ size: 27, color: C.white });
 text(s,'cover-purpose','เชื่อมงานให้เดินครบกระบวนการ\nพร้อมคิดเรื่องข้อมูลและข้อผิดพลาด',{ x: 72, y: 568, w: 715, h: 90 },{ size: 27, color: '#DBECEE' });
}
// 2. Two flat columns keep the comparison readable.
{
 const s=add(2,{heading:'ภาพรวมความรู้จากสองวิดีโอ'});
 text(s,'clip1','n8n และ AI',{ x: 72, y: 205, w: 520, h: 66 },{ size: 45, color: C.teal, bold: true });
 body(s,'ทำให้งานไหลต่อกันอย่างไร',{ x: 72, y: 285, w: 520, h: 55 },32,C.navy,true);
 body(s,'รับข้อมูล เชื่อมเครื่องมือ\nให้ AI ช่วยประมวลผล และส่งต่องาน',{ x: 72, y: 362, w: 530, h: 100 },28);
 text(s,'clip2','System Design',{ x: 706, y: 205, w: 500, h: 66 },{ size: 45, color: C.teal, bold: true });
 body(s,'รักษาข้อมูลและรับมือปัญหาอย่างไร',{ x: 706, y: 285, w: 500, h: 90 },32,C.navy,true);
 body(s,'ทำโจทย์ให้ชัด วางข้อมูลและ API\nพร้อมอธิบายทางเลือกของโครงสร้าง',{ x: 706, y: 397, w: 500, h: 100 },28);
 body(s,'จุดร่วม: ข้อมูลเข้าออกชัด มีสถานะงาน และมีผู้รับผิดชอบ',{ x: 72, y: 562, w: 1136, h: 65 },30,C.teal,true);
 note(s,'ผลที่นำกลับไปใช้: กระบวนการหนึ่งงาน พร้อมเหตุผลของการออกแบบ',635);
}
// 3. Workflow includes a validation branch and a shared state store.
{
 const s=add(3,{heading:'n8n กับงานตั้งแต่รับข้อมูลจนส่งต่อ'});sub(s,'ตัวอย่างกระบวนการของผู้จัดทำจากแนวคิดในคลิป');
 const a=node(s,'form','รับฟอร์ม\nWebhook / Trigger',{ x: 72, y: 258, w: 220, h: 110 },{size:25}),b=node(s,'validate','ตรวจข้อมูล\nครบและถูกต้อง',{ x: 377, y: 258, w: 220, h: 110 },{size:26}),c=node(s,'ai','เรียก AI\nจัดหมวด / ร่างข้อความ',{ x: 682, y: 258, w: 220, h: 110 },{size:25}),d=node(s,'handoff','ส่งต่องาน\nCRM / ผู้รับผิดชอบ',{ x: 987, y: 258, w: 220, h: 110 },{size:25});
 [ [a,b],[b,c],[c,d] ].forEach(([x,y])=>link(s,x,y));label(s,'ข้อมูลพร้อม',586,218,108,24);
 const e=node(s,'review','รอตรวจ\nขอข้อมูลเพิ่ม',{ x: 377, y: 490, w: 220, h: 105 },{amber:true,size:25});
 const f=N(s,3,'status',{ x: 754, y: 490, w: 453, h: 105 },{dark:true,size:27});
 link(s,b,e,{from:'bottom',to:'top'});label(s,'ข้อมูลไม่ครบ',245,415,220,24,C.amber);
 link(s,e,f);label(s,'รอตรวจ',606,500,135,24);
 link(s,d,f,{from:'bottom',to:'top',kind:'elbow'});label(s,'บันทึกผล',1040,418,150,24);
 route(s,a,f,[[182,634],[980,634]],{fromSide:'bottom',toSide:'bottom',dashed:true});
 body(s,'บันทึกรับงานและติดตามสถานะ',{ x: 72, y: 649, w: 950, h: 42 },24,C.teal);
}
// 4. A before/after specimen shows normalization without inventing missing values.
{
 const s=add(4);sub(s,'กำหนดช่องข้อมูลกลาง ตรวจรูปแบบ และเก็บรายการที่ยังต้องยืนยัน');
 const a=node(s,'before','ก่อนจัดรูป\n\nคุณเมย์ต้องการทำเว็บไซต์ร้าน\nติดต่อ may@example.com\nยังไม่ระบุงบประมาณ',{ x: 72, y: 248, w: 385, h: 230 },{size:27});
 const b=node(s,'normalize','สกัดและตรวจ\nกฎข้อมูล + AI',{ x: 514, y: 300, w: 232, h: 125 },{dark:true,size:28});
 const c=node(s,'after','หลังจัดรูป\n\nชื่อ: เมย์\nอีเมล: may@example.com\nประเภทงาน: เว็บไซต์ร้าน\nงบประมาณ: ไม่ระบุ',{ x: 803, y: 238, w: 405, h: 250 },{size:27});
 link(s,a,b);link(s,b,c);
 const d=node(s,'check','ช่องที่ขาดหรือกำกวม\nส่งให้คนตรวจเพิ่มเติม',{ x: 803, y: 570, w: 405, h: 90 },{amber:true,size:24});link(s,c,d,{from:'bottom',to:'top'});
 body(s,'ข้อมูลสมมติสำหรับอธิบาย\nเก็บข้อความต้นฉบับไว้ประกอบการตรวจ\nระบบควรระบุว่า “ไม่ระบุ” เมื่อไม่มีข้อมูล',{ x: 72, y: 545, w: 645, h: 130 },25,C.muted);
}
// 5. Relationships keep retrieval, tools, model and conversation memory distinct.
{
 const s=add(5,{heading:'Agent เครื่องมือ ฐานความรู้ และความจำ'});sub(s,'องค์ประกอบแต่ละส่วนทำคนละหน้าที่ การเก็บบริบทไม่ได้ฝึกโมเดลใหม่');
 const input=node(s,'input','คำขอผู้ใช้',{ x: 72, y: 330, w: 210, h: 95 },{size:27}),ag=node(s,'agent','Agent\nประสานการตัดสินใจ\nและเรียกใช้เครื่องมือ',{ x: 430, y: 300, w: 310, h: 150 },{dark:true,size:27}),model=node(s,'model','Chat Model / LLM\nตีความและสร้างข้อความ',{ x: 430, y: 196, w: 310, h: 80 },{size:25}),mem=node(s,'memory','Chat Memory\nประวัติสนทนา',{ x: 430, y: 507, w: 310, h: 110 },{size:25}),tools=node(s,'tools','Tools\nค้นข้อมูล / API\nและระบบงาน',{ x: 925, y: 322, w: 283, h: 105 },{size:25}),kb=node(s,'kb','ฐานความรู้\nเอกสาร ตาราง\nและข้อมูลบริการ',{ x: 925, y: 510, w: 283, h: 105 },{size:25});
 link(s,input,ag);link(s,ag,model,{from:'top',to:'bottom',both:true});link(s,ag,mem,{from:'bottom',to:'top',both:true});link(s,ag,tools,{both:true});link(s,tools,kb,{from:'bottom',to:'top',both:true});
 label(s,'ใช้เครื่องมือ',744,324,180,24);
 body(s,'ค้นข้อมูลอ้างอิง',{ x: 780, y: 461, w: 260, h: 48 },24,C.muted);
 body(s,'ผลลัพธ์เป็นคำตอบ\nหรือคำสั่งไปยังระบบงาน',{ x: 72, y: 500, w: 300, h: 110 },25);
 note(s,'แบบจำลองความสัมพันธ์: ฐานความรู้กับประวัติสนทนาเป็นคนละหน้าที่',645);
}
// 6. Multi-agent work has explicit deliverables and a human revision path.
{
 const s=add(6);sub(s,'ตัวอย่างการจัดบทบาทในงานผลิตเนื้อหา พร้อมผลส่งมอบที่ตรวจได้');
 const a=node(s,'brief','โจทย์เนื้อหา\nผู้อ่านและเป้าหมาย',{ x: 72, y: 252, w: 200, h: 110 },{size:24}),b=node(s,'research','Research\nข้อมูลและแหล่งที่มา',{ x: 387, y: 252, w: 210, h: 110 },{size:24}),c=node(s,'outline','Outline\nหัวข้อและเหตุผล',{ x: 702, y: 252, w: 210, h: 110 },{size:26}),d=node(s,'draft','Draft\nร่างตามข้อมูล',{ x: 1007, y: 252, w: 200, h: 110 },{size:26}),e=node(s,'quality','คนตรวจคุณภาพ\nข้อเท็จจริง ภาษา\nความเหมาะสม',{ x: 702, y: 480, w: 210, h: 130 },{dark:true,size:24}),f=node(s,'approved','อนุมัติ\nพร้อมส่งต่อ',{ x: 1007, y: 480, w: 200, h: 130 },{size:27});
 link(s,a,b);link(s,b,c);link(s,c,d);route(s,d,e,[[1107,420],[807,420]],{fromSide:'bottom',toSide:'top'});link(s,e,f);
 label(s,'ร่างพร้อมข้อมูล',820,372,260,24);
 route(s,e,d,[[807,634],[1250,634],[1250,307]],{fromSide:'bottom',toSide:'right',color:C.amber});body(s,'ข้อแก้ไขจากคนตรวจกลับไปที่ร่าง',{ x: 72, y: 535, w: 550, h: 60 },25,C.amber);
 note(s,'กำหนดผลส่งมอบของแต่ละบทบาท จำนวน Agent ควรสัมพันธ์กับหน้าที่และภาระตรวจงาน',648);
}
// 7. Human revision and technical retries are deliberately separate paths.
{
 const s=add(7,{heading:'การอนุมัติโดยคนและการรับมือ API ล้มเหลว'});sub(s,'คนไม่อนุมัติ กับบริการขัดข้อง ต้องจัดการคนละเส้นทาง');
 const a=node(s,'draft','ร่างข้อความ',{ x: 72, y: 254, w: 210, h: 86 },{size:26}),b=node(s,'approval','คนตรวจ\nและตัดสินใจ',{ x: 377, y: 254, w: 225, h: 86 },{dark:true,size:26}),c=node(s,'send','โหนดเรียก API\nส่งข้อความที่อนุมัติ',{ x: 682, y: 254, w: 225, h: 86 },{size:24}),d=node(s,'done','สำเร็จ\nบันทึกผล',{ x: 1012, y: 254, w: 195, h: 86 },{size:26});link(s,a,b);link(s,b,c);link(s,c,d);label(s,'อนุมัติ',600,215,90,24);
 const rev=node(s,'revise','รอแก้ไข\nเก็บความเห็นผู้ตรวจ',{ x: 72, y: 440, w: 210, h: 100 },{amber:true,size:24});
 route(s,b,rev,[[489,402],[320,402],[320,490]],{fromSide:'bottom',toSide:'right',color:C.amber});label(s,'ยังไม่อนุมัติ',290,358,190,24,C.amber);link(s,rev,a,{from:'top',to:'bottom',color:C.amber});
 const retry=node(s,'retry','Retry On Fail\nลองโหนดเดิม\nตามเงื่อนไขที่กำหนด',{ x: 682, y: 440, w: 225, h: 105 },{size:24});link(s,c,retry,{from:'bottom',to:'top',both:true});label(s,'ขัดข้อง / ลองใหม่',800,379,280,24);
 const err=node(s,'error','Execution ล้มเหลว\nError Trigger',{ x: 377, y: 579, w: 225, h: 88 },{amber:true,size:24}),alert=node(s,'alert','บันทึก failed\nแจ้งผู้รับผิดชอบ',{ x: 72, y: 579, w: 210, h: 88 },{amber:true,size:25});
 route(s,retry,err,[[794,623]],{fromSide:'bottom',toSide:'right',color:C.amber});link(s,err,alert,{from:'left',to:'right',color:C.amber});
 body(s,'Error Workflow รับเหตุการณ์\nผู้ดูแลเลือกวิธีกู้คืน\nและตรวจงานซ้ำ',{ x: 932, y: 551, w: 276, h: 130 },24,C.muted);
 label(s,'ยังไม่สำเร็จ',610,570,250,24,C.amber);
}
// 8. These are the observed design areas, without claiming a complete five-step method.
{
 const s=add(8,{heading:'กรอบคิดในการออกแบบระบบ'});sub(s,'ลำดับอธิบายบทเรียนที่สังเคราะห์ได้ พร้อมทบทวนเหตุผลของทางเลือก');
 const a=node(s,'requirements','ทำโจทย์ให้ชัด\nผู้ใช้ งาน ขอบเขต\nและเป้าหมายคุณภาพ',{ x: 72, y: 260, w: 305, h: 150 },{size:27}),b=node(s,'data-api','กำหนดข้อมูลและ API\nสิ่งที่เก็บและวิธีติดต่อ',{ x: 487, y: 260, w: 305, h: 150 },{size:27}),c=node(s,'architecture','วางสถาปัตยกรรม\nส่วนประกอบและข้อมูล\nที่ไหลผ่าน',{ x: 902, y: 260, w: 305, h: 150 },{size:27});link(s,a,b);link(s,b,c);
 const d=node(s,'review','ทบทวนคอขวด ความล้มเหลว และข้อแลกเปลี่ยน',{ x: 487, y: 515, w: 720, h: 95 },{dark:true,size:29});link(s,c,d,{from:'bottom',to:'top',kind:'elbow'});
 route(s,d,c,[[1260,563],[1260,335]],{fromSide:'right',toSide:'right',color:C.teal});
 body(s,'ทุกส่วนต้องอธิบายเหตุผลได้\nก่อนเพิ่มความซับซ้อน',{ x: 72, y: 515, w: 335, h: 105 },28,C.teal,true);
}
// 9. A simple example includes optional cache and its update responsibility.
{
 const s=add(9);sub(s,'แบบจำลองเพื่ออธิบายแนวคิด โดย Database เป็นที่เก็บข้อมูลหลัก');
 const cl=N(s,9,'client',{ x: 72, y: 300, w: 230, h: 110 }),api=node(s,'api','API Service\nตรวจคำขอ\nทำงานตามกฎ',{ x: 432, y: 280, w: 270, h: 150 },{dark:true,size:28}),db=N(s,9,'db',{ x: 942, y: 420, w: 266, h: 115 }),cache=node(s,'cache','Cache (ทางเลือก)\nข้อมูลอ่านบ่อย\nกำหนดอายุข้อมูล',{ x: 942, y: 210, w: 266, h: 130 },{size:26});cache.line={fill:C.teal,width:2,style:'dashed'};
 link(s,cl,api,{both:true});label(s,'คำขอและผลตอบกลับ',298,239,245,24);
 link(s,api,db,{kind:'elbow',both:true});link(s,api,cache,{kind:'elbow',dashed:true,both:true});
 body(s,'API อ่าน เติม\nและปรับสำเนา',{ x: 705, y: 200, w: 235, h: 70 },24,C.teal);
 body(s,'อ่าน / เขียนข้อมูลหลัก',{ x: 667, y: 503, w: 277, h: 65 },24,C.teal);
 note(s,'Cache ไม่จำเป็นสำหรับทุกระบบ ต้องกำหนดนโยบายความสดใหม่และวิธีอัปเดตให้ตรงกับงาน',624);
}
// 10. Two separate paths explain catalog data versus media bytes.
{
 const s=add(10);sub(s,'แบบจำลองของผู้จัดทำ ไม่ใช่สถาปัตยกรรมภายในของ Spotify');
 const app=N(s,10,'app',{ x: 72, y: 278, w: 240, h: 117 },{dark:true,size:29}),catalog=N(s,10,'catalog',{ x: 475, y: 238, w: 295, h: 110 },{size:27}),meta=node(s,'metadata','ฐานข้อมูลรายการ\nชื่อเพลง ศิลปิน รายการเล่น',{ x: 942, y: 238, w: 266, h: 110 },{size:25}),delivery=node(s,'delivery','การส่งไฟล์สื่อ\nพิจารณา CDN ตามโจทย์',{ x: 475, y: 478, w: 295, h: 110 },{size:26}),media=N(s,10,'media',{ x: 942, y: 478, w: 266, h: 110 },{size:27});
 link(s,app,catalog,{kind:'elbow',both:true});label(s,'ค้นและรับข้อมูลเพลง',296,203,235,24);
 link(s,catalog,meta,{both:true});label(s,'อ่านข้อมูลรายการ',770,201,170,24);
 link(s,media,delivery,{from:'left',to:'right'});label(s,'ไฟล์ต้นทาง',770,439,170,24);
 link(s,app,delivery,{from:'bottom',to:'left',kind:'elbow',both:true});
 body(s,'ขอไฟล์สำหรับเล่น\nและรับข้อมูลเสียง',{ x: 72, y: 482, w: 342, h: 90 },25,C.teal);
 note(s,'ข้อมูลรายการช่วยค้นและเลือกเพลง ส่วนไฟล์เสียงเป็นสื่อที่อุปกรณ์ต้องรับเพื่อเล่นเพลง',642);
}
// 11. Four lifelines distinguish a new competing request from a duplicate of the same request.
{
 const s=add(11,{heading:'ระบบจอง: คำขอซ้ำกับการแย่งทรัพยากร'});sub(s,'แบบจำลองด้วยจำนวนสมมติ 1 หน่วย การตรวจจำนวนและบันทึกต้องอยู่ใน transaction');
 const a=actor(s,'ผู้ใช้ A',155,{y:222,w:180}),b=actor(s,'ผู้ใช้ B',425,{y:222,w:180}),srv=actor(s,'บริการจอง',755,{y:222,w:220}),db=actor(s,'Inventory DB',1100,{y:222,w:215});
 message(s,a,srv,333,'1. คำขอใหม่ key A',{labelX:215,labelW:500});
 message(s,srv,db,391,'2. A ล็อก / อ่านจำนวน 1',{labelX:757,labelW:345});
 message(s,b,srv,447,'3. คำขอใหม่ key B',{labelX:432,labelW:313});
 message(s,srv,db,503,'4. B ขอ lock เดียวกัน จึงรอ',{labelX:755,labelW:360});
 message(s,srv,db,563,'5. A ลดเหลือ 0 และ commit',{labelX:750,labelW:370});
 body(s,'B ได้ lock ต่อมาและพบ 0 จึงไม่รับจองเกินจำนวน',{ x: 72, y: 598, w: 1136, h: 45 },25,C.teal,true);
 body(s,'Idempotency: งานเดิมส่งซ้ำ ต้องไม่จองเพิ่ม',{ x: 72, y: 648, w: 565, h: 50 },24,C.muted);
 body(s,'Transaction / lock: คนละงานแย่งทรัพยากร',{ x: 664, y: 648, w: 544, h: 50 },24,C.muted);
}
// 12. Delivery and read state are independent events.
{
 const s=add(12,{heading:'ระบบแชต: เก็บก่อนส่งเมื่อผู้รับพร้อม'});body(s,'แบบจำลองทั่วไปเพื่ออธิบาย ไม่ใช่สถาปัตยกรรมภายในของ WhatsApp',{ x: 72, y: 155, w: 1136, h: 35 },25,C.muted);
 const a=actor(s,'ผู้ส่ง',155,{y:222,w:180}),srv=actor(s,'บริการข้อความ',490,{y:222,w:230}),store=actor(s,'ที่เก็บรอส่ง',825,{y:222,w:230}),rec=actor(s,'อุปกรณ์ผู้รับ',1120,{y:222,w:185});
 message(s,a,srv,332,'1. ส่งพร้อมรหัสข้อความ',{labelX:152,labelW:340});
 message(s,srv,store,390,'2. เก็บเมื่อผู้รับออฟไลน์',{labelX:490,labelW:345});
 message(s,rec,srv,448,'3. กลับมาออนไลน์และพร้อมรับ',{labelX:618,labelW:480});
 message(s,store,srv,506,'4. คืนข้อความที่รอส่ง',{labelX:490,labelW:335});
 message(s,srv,rec,564,'5. ส่งถึงอุปกรณ์',{labelX:700,labelW:300});
 node(s,'read','อ่านแล้ว: ต้องมีเหตุการณ์ผู้ใช้เปิดอ่านหรือกลไกเพิ่มเติม',{ x: 72, y: 620, w: 935, h: 65 },{amber:true,size:25});
 body(s,'ที่เก็บรอส่งกับประวัติแชตระยะยาวทำคนละหน้าที่',{ x: 72, y: 190, w: 1136, h: 31 },24,C.teal);
}
// 13. Every required row and column remains native/editable.
{
 const s=add(13,{heading:'กรณีศึกษาและสิ่งที่ต้องควบคุม'});
 const values=data.slides[12].diagram.labels.map((r,i)=>i===0?['กรณี','ปัญหาและข้อมูลสำคัญ',r[3],r[4]]:[r[0],r[1]+'\n'+r[2],r[3],r[4]]);
 table(s,values,{x:72,y:196,widths:[100,355,345,336],height:415,size:24});
 note(s,'เลือกกลไกตามข้อกำหนดและผลที่ต้องตรวจ แต่ละระบบไม่จำเป็นต้องใช้ส่วนประกอบเหมือนกัน',640);
}
// 14. A proposal integrates workflow, state, deduplication and human approval.
{
 const s=add(14,{heading:'ข้อเสนอระบบรับลูกค้าจากเว็บจนตอบกลับ'});sub(s,'ข้อเสนอของผู้จัดทำจากบทเรียนทั้งสองคลิป');
 const form=node(s,'form','ฟอร์มเว็บไซต์',{ x: 72, y: 246, w: 185, h: 95 },{size:27}),api=node(s,'api','API รับคำขอ\nตรวจข้อมูล\nและกฎตรวจซ้ำ',{ x: 360, y: 246, w: 225, h: 95 },{size:24}),n8n=node(s,'n8n','n8n\nประสานขั้นตอน',{ x: 688, y: 246, w: 210, h: 95 },{dark:true,size:27}),ai=node(s,'ai','AI\nจัดหมวดและร่าง',{ x: 1002, y: 246, w: 205, h: 95 },{size:26});link(s,form,api);link(s,api,n8n);link(s,n8n,ai);
 const db=node(s,'db','ที่เก็บข้อมูลหลัก\nrequest ID ลูกค้า สถานะ send log',{ x: 72, y: 462, w: 513, h: 116 },{dark:true,size:25}),human=node(s,'human','คนตรวจอนุมัติ',{ x: 688, y: 462, w: 210, h: 95 },{size:26}),send=node(s,'send','ช่องทางตอบกลับ\nส่งข้อความ\nที่อนุมัติ',{ x: 1002, y: 462, w: 205, h: 95 },{size:24});
 route(s,api,db,[[473,408],[329,408]],{fromSide:'bottom',toSide:'top'});label(s,'บันทึกก่อนประมวลผล',110,358,390,24);
 route(s,ai,human,[[1104,400],[793,400]],{fromSide:'bottom',toSide:'top'});label(s,'ร่างพร้อมข้อมูล',974,412,234,24);
 route(s,human,ai,[[650,509],[650,375],[1104,375]],{fromSide:'left',toSide:'bottom',color:C.amber});label(s,'ขอแก้ไขร่าง',675,339,250,24,C.amber);
 link(s,human,send);label(s,'อนุมัติ',903,460,96,24);
 route(s,send,db,[[1105,595],[329,595]],{fromSide:'bottom',toSide:'bottom'});body(s,'บันทึกผลการส่งและประวัติ',{ x: 652, y: 561, w: 500, h: 40 },24,C.teal);
 const failed=node(s,'failed','ส่งไม่สำเร็จ\nบันทึก failed และแจ้งคน',{ x: 72, y: 623, w: 513, h: 72 },{amber:true,size:24});route(s,send,failed,[[1105,704],[620,704],[620,659]],{fromSide:'bottom',toSide:'right',color:C.amber});link(s,failed,db,{from:'top',to:'bottom',color:C.amber});
 body(s,'request ID ช่วยตามงาน\nกันซ้ำด้วยกฎตรวจและที่เก็บผล',{ x: 646, y: 624, w: 410, h: 72 },23,C.muted);
}
// 15. Practical applications and measurement without a trial plan.
{
 const s=add(15);sub(s,'ผลที่แสดงควรมาจากการวัดจริง พร้อมระบุขอบเขตงานที่ประเมิน');
 table(s,data.slides[14].diagram.labels,{x:72,y:236,widths:[220,440,476],height:340,size:26});
 body(s,'รวมเวลาที่คนใช้ตรวจแก้ เมื่อประเมินเวลาที่ประหยัดได้\nติดตามความถูกต้อง งานซ้ำ และรายการที่ยังค้าง',{ x: 72, y: 618, w: 1090, h: 80 },27,C.teal,true);
}
// 16. Close with an editable process and the condition for expansion.
{
 const s=add(16,{dark:true,heading:'เชื่อมงานให้เดิน พร้อมรักษาความถูกต้อง'});sub(s,'n8n และ AI เชื่อมกระบวนการ ส่วน System Design ช่วยอธิบายโครงสร้าง',true);
 const a=node(s,'problem','เลือกโจทย์ชัด\nข้อมูลเข้า ผลลัพธ์\nและผู้รับผิดชอบ',{ x: 72, y: 279, w: 305, h: 150 },{size:28}),b=node(s,'connect','เชื่อมงาน\nเครื่องมือ AI\nและจุดตรวจคุณภาพ',{ x: 487, y: 279, w: 305, h: 150 },{size:28}),c=node(s,'correct','รักษาความถูกต้อง\nสถานะ งานซ้ำ\nและข้อผิดพลาด',{ x: 902, y: 279, w: 305, h: 150 },{size:28});link(s,a,b,{color:C.lightTeal});link(s,b,c,{color:C.lightTeal});
 body(s,'ประเมินด้วยคุณค่าที่วัดจริง',{ x: 72, y: 513, w: 1136, h: 60 },40,C.lightTeal,true);
 body(s,'รวมเวลาตรวจแก้และภาระดูแล\nขยายเมื่ออธิบายคุณค่าและข้อจำกัดที่พบได้',{ x: 72, y: 591, w: 1090, h: 100 },29,'#DBECEE');
}

await fs.mkdir(TMP,{recursive:true});
await fs.writeFile(path.join(TMP,'presentation.json'),JSON.stringify(p.toProto()));
for(const [i,s] of p.slides.items.entries()){
 const png=await p.export({slide:s,format:'png',scale:1});await fs.writeFile(path.join(TMP,`slide-${String(i+1).padStart(2,'0')}.png`),new Uint8Array(await png.arrayBuffer()));
 const lay=await s.export({format:'layout'});await fs.writeFile(path.join(TMP,`slide-${String(i+1).padStart(2,'0')}.layout.json`),await lay.text());console.log(`rendered ${i+1}`);
}
await (await PresentationFile.exportPptx(p)).save(path.join(TMP,'candidate.pptx'));
console.log('DRAFT_READY');
