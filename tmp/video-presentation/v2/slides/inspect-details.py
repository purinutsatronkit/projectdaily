import sys,json,zipfile,xml.etree.ElementTree as E,hashlib,re
from pathlib import Path
p=Path(sys.argv[1]); src=Path(sys.argv[2]); data=json.loads(src.read_text(encoding='utf-8'))
ns={'a':'http://schemas.openxmlformats.org/drawingml/2006/main','p':'http://schemas.openxmlformats.org/presentationml/2006/main'}
norm=lambda value:re.sub(r'\s+','',value)
checks=[];counts=[]
with zipfile.ZipFile(p) as z:
 for d in data['slides']:
  i=d['number']; notes=E.fromstring(z.read(f'ppt/notesSlides/notesSlide{i}.xml')); nt='\n'.join(''.join(t.itertext()) for t in notes.findall('.//a:t',ns))
  slide=E.fromstring(z.read(f'ppt/slides/slide{i}.xml'))
  checks.append({'slide':i,'scriptComplete':norm(d['script']) in norm(nt),'headerCorrect':f'บทพูดสไลด์{i}' in norm(nt),'scopePresent':norm(data['sourceScope']) in norm(nt),'sourcesPresent':all(url in nt for url in d['sources'])})
  counts.append({'slide':i,'nativeConnectors':len(slide.findall('.//p:cxnSp',ns)),'anchoredEndpoints':len(slide.findall('.//a:stCxn',ns))+len(slide.findall('.//a:endCxn',ns)),'nativeTables':len(slide.findall('.//a:tbl',ns))})
report={'candidate':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'byteCount':p.stat().st_size,'slideCount':len(counts),'scriptCount':len(checks),'allNotesPass':all(all(c[k] for k in ['scriptComplete','headerCorrect','scopePresent','sourcesPresent']) for c in checks),'notesChecks':checks,'objects':counts,'connectorCount':sum(c['nativeConnectors'] for c in counts),'anchoredEndpointCount':sum(c['anchoredEndpoints'] for c in counts),'nativeTableOwnerSlides':[c['slide'] for c in counts if c['nativeTables']]}
report['passed']=report['allNotesPass'] and report['slideCount']==16 and report['connectorCount']>0 and report['nativeTableOwnerSlides']==[13,15]
print(json.dumps(report,ensure_ascii=True));sys.exit(0 if report['passed'] else 1)
