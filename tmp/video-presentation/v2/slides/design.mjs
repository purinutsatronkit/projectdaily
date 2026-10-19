export const C={navy:'#102439',teal:'#087E83',lightTeal:'#79D3CF',white:'#FFFFFF',ink:'#183247',muted:'#526A7A',pale:'#EAF3F4',line:'#C9DADD',amber:'#A34D18',paleAmber:'#FFF3E9'};
export const FONT='Leelawadee UI';
export function text(s,name,value,x,y,w,h,size=28,color=C.ink,bold=false,align='left'){
 const sh=s.shapes.add({name,geometry:'textbox',position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});
 sh.text=value;sh.text.style={typeface:FONT,fontSize:size,color,bold,alignment:align,verticalAlignment:'top',autoFit:'none',wrap:'square',insets:0,lineSpacing:1.13};return sh;
}
export function title(s,num,value,dark=false){text(s,'title',value,72,58,1136,106,43,dark?C.white:C.navy,true);text(s,'page',String(num).padStart(2,'0'),1165,658,48,28,18,dark?C.lightTeal:C.muted);}
export function sub(s,value,dark=false){return text(s,'subtitle',value,72,158,1136,62,25,dark?C.lightTeal:C.muted);}
export function node(s,name,label,x,y,w=220,h=100,{dark=false,teal=false,amber=false,size=27,geometry='rect'}={}){
 const fill=dark?C.navy:amber?C.paleAmber:C.pale;
 const edge=amber?C.amber:teal?C.teal:C.line;
 const sh=s.shapes.add({name,geometry,position:{left:x,top:y,width:w,height:h},fill,line:{fill:edge,width:2}});
 sh.text=label;sh.text.style={typeface:FONT,fontSize:size,color:dark?C.white:amber?C.amber:C.navy,bold:!label.includes('\n'),alignment:'center',verticalAlignment:'middle',autoFit:'none',wrap:'square',insets:{left:12,right:12,top:10,bottom:10},lineSpacing:1.1};
 if(label.includes('\n'))sh.text.get(label.split('\n')[0]).bold=true;
 return sh;
}
export function link(s,a,b,{from='right',to='left',kind='straight',dashed=false,color=C.teal,both=false,arrow=true}={}){
 const l=s.shapes.connect(a,b,{kind,fromSide:from,toSide:to,line:{fill:color,width:2.7,style:dashed?'dashed':'solid'},...(arrow?{tail:{type:'triangle',width:'med',length:'med'}}:{}),...(both?{head:{type:'triangle',width:'med',length:'med'}}:{})});return l;
}
export function label(s,value,x,y,w=250,size=24,color=C.muted){return text(s,'edge-label',value,x,y,w,65,size,color,false,'center');}
export function body(s,value,x,y,w=1136,h=100,size=27,color=C.muted,bold=false){return text(s,'body',value,x,y,w,h,size,color,bold);}
export function table(s,values,{x=72,y=220,widths=[250,886],height=360,size=25}={}){
 const rows=values.length,cols=values[0].length;
 const t=s.tables.add({rows,columns:cols,left:x,top:y,width:widths.reduce((a,b)=>a+b,0),height,columnWidths:widths,values});
 t.borders.assign({fill:C.line,width:1,style:'solid'});
 for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
  const cell=t.getCell(r,c);cell.fill=r===0?C.navy:C.white;
  cell.text.style={typeface:FONT,fontSize:r===0?size+1:size,color:r===0?C.white:c===0?C.teal:C.ink,bold:r===0||c===0,verticalAlignment:'middle',alignment:'left',insets:{left:15,right:15,top:10,bottom:10},autoFit:'none',wrap:'square',lineSpacing:1.12};
 }return t;
}
export function actor(s,name,x,{y=218,w=220}={}){
 const head=node(s,'actor-'+name,name,x-w/2,y,w,65,{dark:true,size:26});
 s.shapes.add({geometry:'line',name:'lifeline-'+name,position:{left:x,top:y+65,width:0,height:304},fill:'none',line:{fill:C.line,width:2,style:'dashed'}});
 return {head,x};
}
export function eventAnchor(s,name,x,y){return s.shapes.add({geometry:'rect',name:'event-'+name,position:{left:x-1,top:y-1,width:2,height:2},fill:'none',line:{fill:'none',width:0}});}
export function route(s,from,to,points,{fromSide='bottom',toSide='bottom',color=C.teal,dashed=false}={}){
 const anchors=points.map(([x,y],i)=>eventAnchor(s,`route-${s.shapes.items.length}-${i}`,x,y));
 const chain=[from,...anchors,to];
 for(let i=0;i<chain.length-1;i++){
  const a=chain[i],b=chain[i+1]; const ax=a.position.left+a.position.width/2,ay=a.position.top+a.position.height/2,bx=b.position.left+b.position.width/2,by=b.position.top+b.position.height/2;
  const aside=i===0?fromSide:Math.abs(bx-ax)>=Math.abs(by-ay)?(bx>ax?'right':'left'):(by>ay?'bottom':'top');
  const bside=i===chain.length-2?toSide:Math.abs(bx-ax)>=Math.abs(by-ay)?(bx>ax?'left':'right'):(by>ay?'top':'bottom');
  link(s,a,b,{from:aside,to:bside,kind:'straight',color,dashed,arrow:i===chain.length-2});
 }
}
export function message(s,a,b,y,value,{labelX,labelW,color=C.teal,dashed=false}={}){
 const from=eventAnchor(s,value+'-from',a.x,y),to=eventAnchor(s,value+'-to',b.x,y);
 link(s,from,to,{from:b.x>a.x?'right':'left',to:b.x>a.x?'left':'right',color,dashed});
 label(s,value,labelX??Math.min(a.x,b.x)+12,y-39,labelW??Math.abs(b.x-a.x)-24,24,color);
}
