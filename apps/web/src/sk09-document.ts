import type { Content, ContentText, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import { fiveDays, sk09Schema, thaiLongDate, thaiShortDate, type Sk09Data } from './sk09-model';

export function sk09Document(input:Sk09Data,logo:string):TDocumentDefinitions {
  const data=sk09Schema.parse(input), dates=fiveDays(data.startDate);
  const field=(label:string,value:string):ContentText=>({text:[{text:label},{text:`  ${value}  `,decoration:'underline',decorationStyle:'dotted'}]});
  const segmenter=new Intl.Segmenter('th',{granularity:'word'});
  // Tiny spaces provide line-break opportunities between Thai words without
  // relying on a zero-width glyph that some Sarabun builds do not contain.
  const cell=(text:string,center=false):Content=>({text:Array.from(segmenter.segment(text)).flatMap(item=>[{text:item.segment,noWrap:!item.segment.includes('\n')&&item.segment.length<35},{text:' ',fontSize:0.001}]),alignment:center?'center':'left',margin:[2,2,2,2]});
  const keepRowsTogether=data.days.every(day=>day.assignment.split('\n').length<=12&&day.result.split('\n').length<=12);
  return {
    pageSize:'A4',pageMargins:[36,24,36,30],defaultStyle:{font:'Sarabun',fontSize:10.5,lineHeight:1.3,color:'#000000'},
    info:{title:'สก.09 แบบบันทึกการฝึกสหกิจศึกษารายสัปดาห์',author:'',subject:'แบบบันทึกการฝึกสหกิจศึกษา'},
    content:[
      {image:logo,width:68,absolutePosition:{x:30,y:23}},
      {table:{widths:[36],body:[[{text:'สก. 09',fontSize:9,alignment:'center',margin:[0,3,0,3]}]]},layout:{hLineWidth:()=>.6,vLineWidth:()=>.6},absolutePosition:{x:514,y:18}},
      {stack:[{text:'แบบบันทึกการฝึกสหกิจศึกษา ภาควิชาวิทยาการคอมพิวเตอร์',bold:true,fontSize:13,alignment:'center'},
        {text:'คณะวิทยาศาสตร์ มหาวิทยาลัยศรีนครินทรวิโรฒ',bold:true,fontSize:11.5,alignment:'center',margin:[0,3,0,0]}],margin:[65,16,0,24]},
      {columns:[{width:'*',...field('ชื่อ-สกุล',data.name)},{width:220,...field('รหัสประจำตัวนิสิต',data.studentId)}],columnGap:8,margin:[0,0,0,10]},
      {columns:[{width:'*',...field('ฝึกงาน ณ บริษัท',data.company)},{width:210,...field('แผนก',data.department)}],columnGap:8,margin:[0,0,0,10]},
      {columns:[{width:'*',...field('ระหว่างวันที่',thaiLongDate(data.startDate))},{width:240,...field('ถึงวันที่',thaiLongDate(data.endDate))}],columnGap:8,margin:[0,0,0,17]},
      {table:{headerRows:1,dontBreakRows:keepRowsTogether,widths:[63,75,219,125],heights:(row:number)=>row===0?23:74,body:[
        ['วัน/เดือน/ปี','เวลาปฏิบัติงาน','งานที่ได้รับมอบหมาย','ผลการฝึกงาน'].map(text=>({text,bold:false,alignment:'center',margin:[0,2,0,2]})),
        ...data.days.map((day,index):TableCell[]=>[{text:thaiShortDate(dates[index]),alignment:'center',fontSize:9.5,noWrap:true,margin:[0,2,0,2]},
          {text:`${data.startTime}-${data.endTime}`,alignment:'center',fontSize:9.5,noWrap:true,margin:[0,2,0,2]},cell(day.assignment||' '),cell(day.result||' ')]),
      ]},layout:{hLineWidth:()=>.5,vLineWidth:()=>.5,hLineColor:()=>'#000000',vLineColor:()=>'#000000',paddingLeft:()=>4,paddingRight:()=>4,paddingTop:()=>4,paddingBottom:()=>4}},
      {unbreakable:true,stack:[
        {text:'ลงชื่อ.................................................................(ผู้ควบคุมการฝึกงาน)',alignment:'right',margin:[0,25,0,10]},
        {text:'ตำแหน่ง.............................................................................................',alignment:'right',margin:[0,0,0,10]},
        {text:'วัน/เดือน/ปี.......................................................................................',alignment:'right',margin:[0,0,0,14]},
        {text:'หมายเหตุ : ให้นิสิตบันทึกการฝึกงานประจำวัน และเก็บรวบรวมเพื่อใส่ในเล่มรายงานสหกิจศึกษา เมื่อเสร็จสิ้นการฝึกงาน',fontSize:8.1,alignment:'center'},
      ]},
    ],
  };
}

let assetsPromise:Promise<{vfs:Record<string,string>;logo:string}> | undefined;
async function base64File(url:string) {
  const response=await fetch(url); if(!response.ok) throw new Error('โหลดแบบฟอร์มหรือฟอนต์ไม่สำเร็จ กรุณาลองใหม่');
  const bytes=new Uint8Array(await response.arrayBuffer()); let text='';
  for(let offset=0;offset<bytes.length;offset+=8192) text+=String.fromCharCode(...bytes.subarray(offset,offset+8192));
  return btoa(text);
}
async function assets() {
  assetsPromise??=Promise.all([base64File('/sk09/Sarabun-Regular.ttf'),base64File('/sk09/Sarabun-Bold.ttf'),base64File('/sk09/university-logo.png')])
    .then(([normal,bold,logo])=>({vfs:{'Sarabun-Regular.ttf':normal,'Sarabun-Bold.ttf':bold},logo:`data:image/png;base64,${logo}`})).catch(error=>{assetsPromise=undefined;throw error;});
  return assetsPromise;
}
export async function sk09PdfBlob(data:Sk09Data) {
  const [{default:pdfMake},files]=await Promise.all([import('pdfmake/build/pdfmake'),assets()]);
  const pdf=pdfMake.createPdf(sk09Document(data,files.logo),undefined,{Sarabun:{normal:'Sarabun-Regular.ttf',bold:'Sarabun-Bold.ttf',italics:'Sarabun-Regular.ttf',bolditalics:'Sarabun-Bold.ttf'}},files.vfs);
  return new Promise<Blob>(resolve=>pdf.getBlob(resolve));
}
