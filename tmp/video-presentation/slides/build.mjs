import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Presentation, PresentationFile } from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs';

const workspaceDir = 'C:/Users/User/Documents/ChatGPT/new Project website';
const TMP = path.join(workspaceDir, 'tmp/video-presentation/slides');
const SKILL = 'C:/Users/User/.codex/plugins/cache/openai-primary-runtime/presentations/26.1015.12040/skills/presentations';
const scripts = JSON.parse(await fs.readFile(path.join(workspaceDir, 'tmp/video-presentation/slide-scripts.json'), 'utf8'));
const C = {navy:'#102439', teal:'#087E83', lightTeal:'#79D3CF', white:'#FFFFFF', ink:'#183247', muted:'#526A7A', pale:'#EAF3F4', line:'#C9DADD'};
const FONT='Leelawadee UI';
const p = Presentation.create({slideSize:{width:1280,height:720}});
const cover = await fs.readFile(path.join(TMP,'cover-background.png'));
const urls = [
 'https://www.youtube.com/watch?v=YY-egxTQirA',
 'https://www.freecodecamp.org/news/create-scalable-ai-automations-with-n8n',
 'https://www.youtube.com/watch?v=soTfFFIQQ8U',
 'https://www.freecodecamp.org/news/learn-how-to-design-software-systems-like-a-senior-engineer-in-our-new-course/'
];
function text(slide, name, val,x,y,w,h,size=30,color=C.ink,bold=false){
 const sh=slide.shapes.add({name, geometry:'textbox', position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});
 sh.text=val;
 sh.text.style={fontSize:size,typeface:FONT,color,bold,verticalAlignment:'top',autoFit:'none',wrap:'square',insets:0,lineSpacing:1.15};
 return sh;
}
function title(s,i,t,dark=false){
 text(s,'title',t,72,60,1136,112,44,dark?C.white:C.navy,true);
 text(s,'slide-number',String(i).padStart(2,'0'),1165,654,48,28,18,dark?C.lightTeal:C.muted);
}
function add(i,dark=false){
 const s=p.slides.add();s.background.fill=dark?C.navy:C.white;
 const d=scripts.slides[i-1];
 const source=i<=5?urls.slice(0,2):i<=7?urls.slice(2):urls;
 s.speakerNotes.text=`บทพูดสำหรับสไลด์ ${i} (ประมาณ ${d.seconds} วินาที)\n\n${d.script}\n\nข้อมูลแหล่งที่มา (สำหรับผู้บรรยาย)\n${source.join('\n')}\n\nขอบเขตการสรุป: ${scripts.sourceScope}${i>=9?'\nข้อเสนอประยุกต์ใช้ในสไลด์นี้เป็นการสังเคราะห์ของรายงาน':''}${i===1?'\nภาพปก: ภาพประกอบแนวคิดสร้างด้วย OpenAI imagegen ไม่ใช่ภาพจากวิดีโอ':''}`;
 return s;
}
function row(s,num,head,body,y,dark=false){
 text(s,'number-'+num,num,72,y,70,74,38,dark?C.lightTeal:C.teal,true);
 text(s,'heading-'+num,head,174,y,1020,46,32,dark?C.white:C.navy,true);
 text(s,'body-'+num,body,174,y+51,1020,60,27,dark?'#DBECEE':C.muted);
}

// 1 Cover. The single generated backdrop is an illustrative asset. All title text remains editable.
{
 const s=add(1,true);
 s.images.add({blob:cover.buffer.slice(cover.byteOffset,cover.byteOffset+cover.byteLength),contentType:'image/png',alt:'ภาพประกอบแนวคิดระบบข้อมูลและ workflow',fit:'cover',position:{left:0,top:0,width:1280,height:720}});
 text(s,'cover-kicker','บทเรียนจากวิดีโอ 2 เรื่อง',72,78,650,42,25,C.lightTeal);
 text(s,'cover-title','ระบบอัตโนมัติ\nและการออกแบบ\nซอฟต์แวร์',72,170,705,294,62,C.white,true);
 text(s,'cover-subtitle','n8n และ AI    /    System Design',72,515,680,50,27,C.white);
 text(s,'cover-description','สรุปสาระสำคัญและแนวทางประยุกต์ใช้',72,582,740,42,24,'#BCD4DE');
}
// 2 Parallel overview in a flat editorial composition.
{
 const s=add(2);title(s,2,scripts.slides[1].title);
 text(s,'first-video','วิดีโอที่ 1',72,208,500,34,24,C.teal,true);
 text(s,'first-topic','n8n และ AI',72,260,530,72,48,C.navy,true);
 text(s,'first-description','เชื่อมข้อมูล เครื่องมือ\nและขั้นตอนทำงาน',72,358,500,125,32,C.muted);
 text(s,'second-video','วิดีโอที่ 2',706,208,500,34,24,C.teal,true);
 text(s,'second-topic','System Design',706,260,500,72,48,C.navy,true);
 text(s,'second-description','ออกแบบข้อมูล API\nและโครงสร้างระบบ',706,358,500,125,32,C.muted);
 text(s,'common-purpose','ใช้ร่วมกันเพื่อสร้างงานที่ทำได้จริงและดูแลต่อได้',72,565,1136,65,32,C.teal,true);
}
// 3 Process expressed as editable numbered text.
{
 const s=add(3);title(s,3,scripts.slides[2].title);
 const steps=[['01','รับข้อมูล','จากฟอร์ม อีเมล หรือเหตุการณ์'],['02','เชื่อมและจัดข้อมูล','เรียก API และเตรียมข้อมูลสำหรับขั้นถัดไป'],['03','ให้ AI ช่วยประมวลผล','อ่าน ตีความ จัดหมวด หรือร่างข้อความ'],['04','ส่งต่อและเก็บสถานะ','ส่งผลลัพธ์พร้อมบันทึกว่าแต่ละงานถึงขั้นใด']];
 steps.forEach((v,i)=>row(s,...v,184+i*106));
 text(s,'examples','ตัวอย่างในคลิป: งานอีเมล งานขาย CRM และการอ่านเอกสาร',72,638,1090,34,23,C.teal);
}
// 4 Definitions set as three rows, not modular cards.
{
 const s=add(4);title(s,4,scripts.slides[3].title);
 text(s,'agent-term','Agent',72,210,305,67,48,C.teal,true);
 text(s,'agent-def','ใช้เครื่องมือและทำงานตามบทบาทที่กำหนด',405,219,790,100,31,C.ink);
 text(s,'knowledge-term','ฐานความรู้',72,334,305,67,42,C.teal,true);
 text(s,'knowledge-def','ข้อมูลสำหรับค้นและประกอบคำตอบ',405,343,790,100,31,C.ink);
 text(s,'memory-term','ความจำ',72,458,305,67,42,C.teal,true);
 text(s,'memory-def','บริบทจากงานหรือการสนทนาก่อนหน้า',405,467,790,100,31,C.ink);
 text(s,'examples','ตัวอย่างในคลิป: Google Sheets เป็นฐานความรู้\nและการแบ่งงานผลิตเนื้อหาให้หลาย Agent',72,591,1100,70,24,C.muted);
}
// 5 High contrast to mark operational concerns.
{
 const s=add(5,true);title(s,5,scripts.slides[4].title,true);
 row(s,'01','จุดอนุมัติโดยคน','ให้ผู้รับผิดชอบตรวจงานก่อนดำเนินการต่อ',196,true);
 row(s,'02','ข้อผิดพลาดและการทำงานซ้ำ','มีวิธีลองใหม่และทางเลือกสำรอง',328,true);
 row(s,'03','การติดตามงานและต้นทุน','ดูงานที่ล้มเหลวและการใช้ token',460,true);
 text(s,'takeaway','คุณค่าของระบบต้องรวมเวลาที่คนใช้ตรวจแก้ด้วย',72,618,1090,50,29,C.lightTeal,true);
}
// 6 Main observed parts of the design method, with no invented complete five-step claim.
{
 const s=add(6);title(s,6,scripts.slides[5].title);
 row(s,'01','ทำโจทย์ให้ชัด','ผู้ใช้ กรณีใช้งาน ขอบเขต และเป้าหมายคุณภาพ',194);
 row(s,'02','กำหนดข้อมูลและ API','ข้อมูลหลักอยู่ที่ใด และระบบสื่อสารกันอย่างไร',332);
 row(s,'03','วางสถาปัตยกรรม','ส่วนประกอบ เส้นทางข้อมูล และคอขวดที่อาจเกิด',470);
 text(s,'tradeoffs','ทุกทางเลือกมีต้นทุน ความซับซ้อน และผลต่อการกู้คืนระบบ',72,629,1090,42,25,C.teal,true);
}
// 7 Native editable evidence table.
{
 const s=add(7);title(s,7,scripts.slides[6].title);
 const table=s.tables.add({rows:4,columns:2,left:72,top:200,width:1136,height:355,columnWidths:[300,836],values:[['กรณีศึกษา','ประเด็นออกแบบที่เนื้อหาครอบคลุม'],['Spotify','ข้อมูลเพลง API การจัดเก็บ\nและการรองรับผู้ใช้จำนวนมาก'],['Booking.com','จำนวนคงเหลือ คำขอซ้ำ\nและการจองพร้อมกัน'],['WhatsApp','การสื่อสารทันที หลายอุปกรณ์\nและการกลับมาออนไลน์']]});
 table.borders.assign({fill:C.line,width:1,style:'solid'});
 for(let r=0;r<4;r++)for(let c=0;c<2;c++){
  const cell=table.getCell(r,c); cell.fill=r===0?C.navy:C.white;
  cell.text.style={typeface:FONT,fontSize:r===0?27:29,color:r===0?C.white:(c===0?C.teal:C.ink),bold:r===0||c===0,verticalAlignment:'middle',insets:{left:20,right:20,top:12,bottom:12},autoFit:'none',lineSpacing:1.12};
 }
 text(s,'case-study-scope','กรณีศึกษาเป็นแบบจำลองสำหรับเรียนรู้\nไม่ใช่รายละเอียดระบบภายในของบริษัท',72,593,1100,75,24,C.muted);
}
// 8 Synthesis as two introductory columns and a flat list of common principles.
{
 const s=add(8);title(s,8,scripts.slides[7].title);
 text(s,'workflow-heading','n8n และ AI',72,196,500,55,38,C.teal,true);
 text(s,'workflow-point','เชื่อมขั้นตอนให้ทำงาน\nครบกระบวนการ',72,265,510,100,32,C.ink);
 text(s,'system-heading','System Design',706,196,500,55,38,C.teal,true);
 text(s,'system-point','อธิบายว่าระบบรักษาข้อมูล\nและรับมือปัญหาอย่างไร',706,265,500,100,32,C.ink);
 text(s,'common-label','หลักที่ใช้ร่วมกัน',72,425,1100,48,30,C.navy,true);
 text(s,'common-list','ข้อมูลเข้าออกชัดเจน\nป้องกันงานซ้ำและตามงานค้างได้\nมีผู้รับผิดชอบเมื่อระบบต้องการการตัดสินใจ',72,487,1100,153,30,C.muted);
}
// 9 Proposed application is clearly labelled as a proposal.
{
 const s=add(9);title(s,9,'ระบบรับลูกค้าจากเว็บไซต์');
 text(s,'proposal-label','ตัวอย่างที่รายงานเสนอ',72,170,1100,39,25,C.teal,true);
 text(s,'process-title','ลำดับงาน',72,239,560,50,32,C.navy,true);
 text(s,'proposed-process','1  รับฟอร์มและตรวจข้อมูล\n2  บันทึกลูกค้าพร้อมรหัสคำขอ\n3  ให้ AI จัดหมวดและร่างคำตอบ\n4  คนตรวจอนุมัติก่อนส่ง\n5  บันทึกผลและติดตามงานค้าง',72,310,590,260,29,C.ink);
 text(s,'system-title','การแบ่งหน้าที่ของระบบ',738,239,470,50,32,C.navy,true);
 text(s,'n8n-role','n8n ประสานขั้นตอน',738,318,465,58,30,C.teal,true);
 text(s,'data-role','ที่เก็บข้อมูลหลักรักษา\nสถานะและประวัติ',738,397,465,110,29,C.ink);
 text(s,'metrics','วัดเวลาตอบกลับ ข้อมูลตกหล่น และงานที่ต้องแก้',72,615,1100,60,28,C.teal,true);
}
// 10 Closing retains the background family with a clean solid field.
{
 const s=add(10,true);title(s,10,scripts.slides[9].title,true);
 text(s,'closing-one','เชื่อมขั้นตอนด้วย n8n',72,193,1136,64,43,C.white,true);
 text(s,'closing-two','ตรวจโครงสร้างด้วย System Design',72,268,1136,64,43,C.lightTeal,true);
 text(s,'documents-title','งานเอกสารและงานเนื้อหา',72,403,560,47,30,C.white,true);
 text(s,'documents-point','พัฒนาผู้ช่วยที่มีจุดตรวจคุณภาพ',72,465,560,85,27,'#DBECEE');
 text(s,'portfolio-title','ผลงานและงานรับจ้าง',711,403,497,47,30,C.white,true);
 text(s,'portfolio-point','แสดงต้นแบบ เหตุผลการออกแบบ\nและผลลัพธ์ที่วัดได้',711,465,497,100,27,'#DBECEE');
 text(s,'closing-takeaway','เริ่มจากปัญหางานหนึ่งเรื่องที่อธิบายได้ชัด',72,614,1090,55,31,C.lightTeal,true);
}

await fs.mkdir(TMP,{recursive:true});
await fs.writeFile(path.join(TMP,'presentation.json'),JSON.stringify(p.toProto()));
for(const [i,s] of p.slides.items.entries()){
 try {
  const png=await p.export({slide:s,format:'png',scale:1});
  await fs.writeFile(path.join(TMP,`slide-${String(i+1).padStart(2,'0')}.png`),new Uint8Array(await png.arrayBuffer()));
  console.log(`rendered ${i+1}`);
 } catch(error){console.log(`render-failure ${i+1}: ${error.message}`);}
 const layout=await s.export({format:'layout'}); await fs.writeFile(path.join(TMP,`slide-${String(i+1).padStart(2,'0')}.layout.json`),await layout.text());
}
const draft=path.join(TMP,'candidate.pptx');
await (await PresentationFile.exportPptx(p)).save(draft);
console.log(`DRAFT ${draft}`);
const {finalizePresentation}=await import(pathToFileURL(path.join(SKILL,'container_tools/artifact_tool_utils.mjs')).href);
const result=await finalizePresentation({workspaceDir,candidatePath:draft,finalPath:path.join(workspaceDir,'artifacts/video-learning-presentation.pptx'),pythonExecutable:'C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',integrityValidatorPath:path.join(SKILL,'container_tools/inspect_presentation_package_integrity.py'),layoutValidatorPath:path.join(SKILL,'container_tools/inspect_presentation_layout_geometry.py'),explicitTotalSlideCount:10,requiredNativeTableOwnerSlides:[7],requiredNativeChartOwnerSlides:[],layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-bullet-geometry','--validate-heading-fit','--require-native-table-slide','7'],fontPolicy:{basis:'design',families:[FONT]},verifyArtifactToolImport:true,receiptPath:path.join(TMP,'validation.json')});
console.log(JSON.stringify(result,null,2));
