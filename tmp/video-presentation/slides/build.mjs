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
function text(slide, name, val,{ x, y, w, h },size=30,color=C.ink,bold=false){
 const sh=slide.shapes.add({name, geometry:'textbox', position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});
 sh.text=val;
 sh.text.style={fontSize:size,typeface:FONT,color,bold,verticalAlignment:'top',autoFit:'none',wrap:'square',insets:0,lineSpacing:1.15};
 return sh;
}
function title(s,i,t,dark=false){
 text(s,'title',t,{ x: 72, y: 60, w: 1136, h: 112 },44,dark?C.white:C.navy,true);
 text(s,'slide-number',String(i).padStart(2,'0'),{ x: 1165, y: 654, w: 48, h: 28 },18,dark?C.lightTeal:C.muted);
}
function add(i,dark=false){
 const s=p.slides.add();s.background.fill=dark?C.navy:C.white;
 const d=scripts.slides[i-1];
 let source = urls;
 if (i <= 5) source = urls.slice(0, 2);
 else if (i <= 7) source = urls.slice(2);
 s.speakerNotes.text=`บทพูดสำหรับสไลด์ ${i} (ประมาณ ${d.seconds} วินาที)\n\n${d.script}\n\nข้อมูลแหล่งที่มา (สำหรับผู้บรรยาย)\n${source.join('\n')}\n\nขอบเขตการสรุป: ${scripts.sourceScope}${i>=9?'\nข้อเสนอประยุกต์ใช้ในสไลด์นี้เป็นการสังเคราะห์ของรายงาน':''}${i===1?'\nภาพปก: ภาพประกอบแนวคิดสร้างด้วย OpenAI imagegen ไม่ใช่ภาพจากวิดีโอ':''}`;
 return s;
}
function row(s,num,head,body,y,dark=false){
 text(s,'number-'+num,num,{ x: 72, y, w: 70, h: 74 },38,dark?C.lightTeal:C.teal,true);
 text(s,'heading-'+num,head,{ x: 174, y, w: 1020, h: 46 },32,dark?C.white:C.navy,true);
 text(s,'body-'+num,body,{ x: 174, y: y+51, w: 1020, h: 60 },27,dark?'#DBECEE':C.muted);
}

// 1 Cover. The single generated backdrop is an illustrative asset. All title text remains editable.
{
 const s=add(1,true);
 s.images.add({blob:cover.buffer.slice(cover.byteOffset,cover.byteOffset+cover.byteLength),contentType:'image/png',alt:'ภาพประกอบแนวคิดระบบข้อมูลและ workflow',fit:'cover',position:{left:0,top:0,width:1280,height:720}});
 text(s,'cover-kicker','บทเรียนจากวิดีโอ 2 เรื่อง',{ x: 72, y: 78, w: 650, h: 42 },25,C.lightTeal);
 text(s,'cover-title','ระบบอัตโนมัติ\nและการออกแบบ\nซอฟต์แวร์',{ x: 72, y: 170, w: 705, h: 294 },62,C.white,true);
 text(s,'cover-subtitle','n8n และ AI    /    System Design',{ x: 72, y: 515, w: 680, h: 50 },27,C.white);
 text(s,'cover-description','สรุปสาระสำคัญและแนวทางประยุกต์ใช้',{ x: 72, y: 582, w: 740, h: 42 },24,'#BCD4DE');
}
// 2 Parallel overview in a flat editorial composition.
{
 const s=add(2);title(s,2,scripts.slides[1].title);
 text(s,'first-video','วิดีโอที่ 1',{ x: 72, y: 208, w: 500, h: 34 },24,C.teal,true);
 text(s,'first-topic','n8n และ AI',{ x: 72, y: 260, w: 530, h: 72 },48,C.navy,true);
 text(s,'first-description','เชื่อมข้อมูล เครื่องมือ\nและขั้นตอนทำงาน',{ x: 72, y: 358, w: 500, h: 125 },32,C.muted);
 text(s,'second-video','วิดีโอที่ 2',{ x: 706, y: 208, w: 500, h: 34 },24,C.teal,true);
 text(s,'second-topic','System Design',{ x: 706, y: 260, w: 500, h: 72 },48,C.navy,true);
 text(s,'second-description','ออกแบบข้อมูล API\nและโครงสร้างระบบ',{ x: 706, y: 358, w: 500, h: 125 },32,C.muted);
 text(s,'common-purpose','ใช้ร่วมกันเพื่อสร้างงานที่ทำได้จริงและดูแลต่อได้',{ x: 72, y: 565, w: 1136, h: 65 },32,C.teal,true);
}
// 3 Process expressed as editable numbered text.
{
 const s=add(3);title(s,3,scripts.slides[2].title);
 const steps=[['01','รับข้อมูล','จากฟอร์ม อีเมล หรือเหตุการณ์'],['02','เชื่อมและจัดข้อมูล','เรียก API และเตรียมข้อมูลสำหรับขั้นถัดไป'],['03','ให้ AI ช่วยประมวลผล','อ่าน ตีความ จัดหมวด หรือร่างข้อความ'],['04','ส่งต่อและเก็บสถานะ','ส่งผลลัพธ์พร้อมบันทึกว่าแต่ละงานถึงขั้นใด']];
 steps.forEach((v,i)=>row(s,...v,184+i*106));
 text(s,'examples','ตัวอย่างในคลิป: งานอีเมล งานขาย CRM และการอ่านเอกสาร',{ x: 72, y: 638, w: 1090, h: 34 },23,C.teal);
}
// 4 Definitions set as three rows, not modular cards.
{
 const s=add(4);title(s,4,scripts.slides[3].title);
 text(s,'agent-term','Agent',{ x: 72, y: 210, w: 305, h: 67 },48,C.teal,true);
 text(s,'agent-def','ใช้เครื่องมือและทำงานตามบทบาทที่กำหนด',{ x: 405, y: 219, w: 790, h: 100 },31,C.ink);
 text(s,'knowledge-term','ฐานความรู้',{ x: 72, y: 334, w: 305, h: 67 },42,C.teal,true);
 text(s,'knowledge-def','ข้อมูลสำหรับค้นและประกอบคำตอบ',{ x: 405, y: 343, w: 790, h: 100 },31,C.ink);
 text(s,'memory-term','ความจำ',{ x: 72, y: 458, w: 305, h: 67 },42,C.teal,true);
 text(s,'memory-def','บริบทจากงานหรือการสนทนาก่อนหน้า',{ x: 405, y: 467, w: 790, h: 100 },31,C.ink);
 text(s,'examples','ตัวอย่างในคลิป: Google Sheets เป็นฐานความรู้\nและการแบ่งงานผลิตเนื้อหาให้หลาย Agent',{ x: 72, y: 591, w: 1100, h: 70 },24,C.muted);
}
// 5 High contrast to mark operational concerns.
{
 const s=add(5,true);title(s,5,scripts.slides[4].title,true);
 row(s,'01','จุดอนุมัติโดยคน','ให้ผู้รับผิดชอบตรวจงานก่อนดำเนินการต่อ',196,true);
 row(s,'02','ข้อผิดพลาดและการทำงานซ้ำ','มีวิธีลองใหม่และทางเลือกสำรอง',328,true);
 row(s,'03','การติดตามงานและต้นทุน','ดูงานที่ล้มเหลวและการใช้ token',460,true);
 text(s,'takeaway','คุณค่าของระบบต้องรวมเวลาที่คนใช้ตรวจแก้ด้วย',{ x: 72, y: 618, w: 1090, h: 50 },29,C.lightTeal,true);
}
// 6 Main observed parts of the design method, with no invented complete five-step claim.
{
 const s=add(6);title(s,6,scripts.slides[5].title);
 row(s,'01','ทำโจทย์ให้ชัด','ผู้ใช้ กรณีใช้งาน ขอบเขต และเป้าหมายคุณภาพ',194);
 row(s,'02','กำหนดข้อมูลและ API','ข้อมูลหลักอยู่ที่ใด และระบบสื่อสารกันอย่างไร',332);
 row(s,'03','วางสถาปัตยกรรม','ส่วนประกอบ เส้นทางข้อมูล และคอขวดที่อาจเกิด',470);
 text(s,'tradeoffs','ทุกทางเลือกมีต้นทุน ความซับซ้อน และผลต่อการกู้คืนระบบ',{ x: 72, y: 629, w: 1090, h: 42 },25,C.teal,true);
}
// 7 Native editable evidence table.
{
 const s=add(7);title(s,7,scripts.slides[6].title);
 const table=s.tables.add({rows:4,columns:2,left:72,top:200,width:1136,height:355,columnWidths:[300,836],values:[['กรณีศึกษา','ประเด็นออกแบบที่เนื้อหาครอบคลุม'],['Spotify','ข้อมูลเพลง API การจัดเก็บ\nและการรองรับผู้ใช้จำนวนมาก'],['Booking.com','จำนวนคงเหลือ คำขอซ้ำ\nและการจองพร้อมกัน'],['WhatsApp','การสื่อสารทันที หลายอุปกรณ์\nและการกลับมาออนไลน์']]});
 table.borders.assign({fill:C.line,width:1,style:'solid'});
 for(let r=0;r<4;r++)for(let c=0;c<2;c++){
  const cell=table.getCell(r,c); cell.fill=r===0?C.navy:C.white;
  let color = c === 0 ? C.teal : C.ink;
  if (r === 0) color = C.white;
  cell.text.style={typeface:FONT,fontSize:r===0?27:29,color,bold:r===0||c===0,verticalAlignment:'middle',insets:{left:20,right:20,top:12,bottom:12},autoFit:'none',lineSpacing:1.12};
 }
 text(s,'case-study-scope','กรณีศึกษาเป็นแบบจำลองสำหรับเรียนรู้\nไม่ใช่รายละเอียดระบบภายในของบริษัท',{ x: 72, y: 593, w: 1100, h: 75 },24,C.muted);
}
// 8 Synthesis as two introductory columns and a flat list of common principles.
{
 const s=add(8);title(s,8,scripts.slides[7].title);
 text(s,'workflow-heading','n8n และ AI',{ x: 72, y: 196, w: 500, h: 55 },38,C.teal,true);
 text(s,'workflow-point','เชื่อมขั้นตอนให้ทำงาน\nครบกระบวนการ',{ x: 72, y: 265, w: 510, h: 100 },32,C.ink);
 text(s,'system-heading','System Design',{ x: 706, y: 196, w: 500, h: 55 },38,C.teal,true);
 text(s,'system-point','อธิบายว่าระบบรักษาข้อมูล\nและรับมือปัญหาอย่างไร',{ x: 706, y: 265, w: 500, h: 100 },32,C.ink);
 text(s,'common-label','หลักที่ใช้ร่วมกัน',{ x: 72, y: 425, w: 1100, h: 48 },30,C.navy,true);
 text(s,'common-list','ข้อมูลเข้าออกชัดเจน\nป้องกันงานซ้ำและตามงานค้างได้\nมีผู้รับผิดชอบเมื่อระบบต้องการการตัดสินใจ',{ x: 72, y: 487, w: 1100, h: 153 },30,C.muted);
}
// 9 Proposed application is clearly labelled as a proposal.
{
 const s=add(9);title(s,9,'ระบบรับลูกค้าจากเว็บไซต์');
 text(s,'proposal-label','ตัวอย่างที่รายงานเสนอ',{ x: 72, y: 170, w: 1100, h: 39 },25,C.teal,true);
 text(s,'process-title','ลำดับงาน',{ x: 72, y: 239, w: 560, h: 50 },32,C.navy,true);
 text(s,'proposed-process','1  รับฟอร์มและตรวจข้อมูล\n2  บันทึกลูกค้าพร้อมรหัสคำขอ\n3  ให้ AI จัดหมวดและร่างคำตอบ\n4  คนตรวจอนุมัติก่อนส่ง\n5  บันทึกผลและติดตามงานค้าง',{ x: 72, y: 310, w: 590, h: 260 },29,C.ink);
 text(s,'system-title','การแบ่งหน้าที่ของระบบ',{ x: 738, y: 239, w: 470, h: 50 },32,C.navy,true);
 text(s,'n8n-role','n8n ประสานขั้นตอน',{ x: 738, y: 318, w: 465, h: 58 },30,C.teal,true);
 text(s,'data-role','ที่เก็บข้อมูลหลักรักษา\nสถานะและประวัติ',{ x: 738, y: 397, w: 465, h: 110 },29,C.ink);
 text(s,'metrics','วัดเวลาตอบกลับ ข้อมูลตกหล่น และงานที่ต้องแก้',{ x: 72, y: 615, w: 1100, h: 60 },28,C.teal,true);
}
// 10 Closing retains the background family with a clean solid field.
{
 const s=add(10,true);title(s,10,scripts.slides[9].title,true);
 text(s,'closing-one','เชื่อมขั้นตอนด้วย n8n',{ x: 72, y: 193, w: 1136, h: 64 },43,C.white,true);
 text(s,'closing-two','ตรวจโครงสร้างด้วย System Design',{ x: 72, y: 268, w: 1136, h: 64 },43,C.lightTeal,true);
 text(s,'documents-title','งานเอกสารและงานเนื้อหา',{ x: 72, y: 403, w: 560, h: 47 },30,C.white,true);
 text(s,'documents-point','พัฒนาผู้ช่วยที่มีจุดตรวจคุณภาพ',{ x: 72, y: 465, w: 560, h: 85 },27,'#DBECEE');
 text(s,'portfolio-title','ผลงานและงานรับจ้าง',{ x: 711, y: 403, w: 497, h: 47 },30,C.white,true);
 text(s,'portfolio-point','แสดงต้นแบบ เหตุผลการออกแบบ\nและผลลัพธ์ที่วัดได้',{ x: 711, y: 465, w: 497, h: 100 },27,'#DBECEE');
 text(s,'closing-takeaway','เริ่มจากปัญหางานหนึ่งเรื่องที่อธิบายได้ชัด',{ x: 72, y: 614, w: 1090, h: 55 },31,C.lightTeal,true);
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
