import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {PresentationFile,FileBlob} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs';
const exec=promisify(execFile);
const W='C:/Users/User/Documents/ChatGPT/new Project website';const TMP=path.join(W,'tmp/video-presentation/v2/slides');const CAND=path.join(TMP,'candidate.pptx');
const PY='C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';const SKILL='C:/Users/User/.codex/plugins/cache/openai-primary-runtime/presentations/26.1015.12040/skills/presentations/container_tools';
async function gate(name,file,args){const r=await exec(PY,['-B',path.join(SKILL,file),CAND,...args],{windowsHide:true,encoding:'utf8',maxBuffer:4*1024*1024});return [name,{exitCode:0,...JSON.parse(r.stdout)}];}
const before=createHash('sha256').update(await fs.readFile(CAND)).digest('hex');
const results=await Promise.all([
 gate('packageIntegrity','inspect_presentation_package_integrity.py',['--fail-on-findings']),
 gate('presentationLayout','inspect_presentation_layout_geometry.py',['--fail-on-findings','--expected-slide-size-emu','12192000,6858000','--validate-bullet-geometry','--validate-heading-fit','--expected-slide-count','16','--approved-font-family','Leelawadee UI','--require-native-table-slide','13','--require-native-table-slide','15']),
 gate('nativeChartTitles','native_chart_title_gate.py',[]),gate('nativeTableArithmetic','native_table_arithmetic_gate.py',[]),gate('nativeChartDiscovery','native_quantitative_chart_gate.py',['--discover-chart-slides'])]);
const presentation=await PresentationFile.importPptx(await FileBlob.load(CAND));
const details=await exec(PY,['-B',path.join(TMP,'inspect-details.py'),CAND,path.join(W,'tmp/video-presentation/v2/slide-scripts.json')],{windowsHide:true,encoding:'utf8',maxBuffer:4*1024*1024});
const after=createHash('sha256').update(await fs.readFile(CAND)).digest('hex');if(before!==after)throw Error('Candidate changed during validation');
const report={schemaVersion:'presentation-validated-before-copy.v1',claimBoundary:'Read-only validation of the candidate completed. The bundled finalizer was not executed because automatic approval review was at capacity; no finalizer publication status is claimed.',candidatePath:CAND,sha256:after,byteCount:(await fs.stat(CAND)).size,...Object.fromEntries(results),firstPartyImport:{performed:true,passed:presentation.slides.items.length===16,slideCount:presentation.slides.items.length,sha256:after},notesAndEditability:JSON.parse(details.stdout)};
report.passed=report.packageIntegrity.finding_count===0&&report.presentationLayout.finding_count===0&&report.firstPartyImport.passed&&report.notesAndEditability.passed;
await fs.writeFile(path.join(TMP,'validated-before-copy.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:report.passed,byteCount:report.byteCount,sha256:after,slides:report.firstPartyImport.slideCount,notesPass:report.notesAndEditability.allNotesPass,connectors:report.notesAndEditability.connectorCount,anchoredEndpoints:report.notesAndEditability.anchoredEndpointCount,tables:report.notesAndEditability.nativeTableOwnerSlides,layoutWarnings:report.presentationLayout.warning_count}));
