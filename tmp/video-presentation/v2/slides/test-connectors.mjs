import fs from 'node:fs/promises';
import {Presentation} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs';
const p=Presentation.create({slideSize:{width:1280,height:720}});const s=p.slides.add();s.background.fill='#FFFFFF';
function node(name,x,y){const n=s.shapes.add({geometry:'rect',name,position:{left:x,top:y,width:230,height:100},fill:'#102439',line:{fill:'#087E83',width:2}});n.text=name;n.text.style={typeface:'Leelawadee UI',fontSize:30,color:'#FFFFFF',alignment:'center',verticalAlignment:'middle',insets:10};return n;}
const a=node('source',150,150),b=node('target',700,150);s.shapes.connect(a,b,{kind:'straight',fromSide:'right',toSide:'left',line:{fill:'#087E83',width:3},head:{type:'triangle',width:'med',length:'med'}});
const c=node('source tail',150,400),d=node('target tail',700,400);s.shapes.connect(c,d,{kind:'straight',fromSide:'right',toSide:'left',line:{fill:'#087E83',width:3},tail:{type:'triangle',width:'med',length:'med'}});
const r=await p.export({slide:s,format:'png'});await fs.writeFile('C:/Users/User/Documents/ChatGPT/new Project website/tmp/video-presentation/v2/slides/test-connectors.png',new Uint8Array(await r.arrayBuffer()));
