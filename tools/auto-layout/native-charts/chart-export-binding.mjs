import {coverageOutputLimit,checkNumericCoverage,jsonWireSize} from '../native-coverage-policy.mjs';
import {readNativeManifestFile} from '../native-manifest.mjs';
const readLayout=path=>{const checked=readNativeManifestFile(path);return {...checked,value:checked.manifest};};
import {isDeepStrictEqual as equal} from 'node:util';
import {createCanvas,GlobalFonts} from '@napi-rs/canvas';
import {parseChartEvidence,digest} from './chart-data.mjs';
import {addNativeChart,requiredNativeChartOwnerSlides} from './native-chart-writer.mjs';
import {python} from './chart-package-client.mjs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {deriveChartContent} from '../../workbench/chart-content.mjs';
import {hash,normalizeManuscript} from '../semantic-input.mjs';
import {validateNumericChartPlan} from '../semantic-charts.mjs';
import {contentContractForPacket,requireContentContract,numericContract} from '../../workbench/content-contract-versions.mjs';
import {openSync,closeSync,fstatSync,readSync} from 'node:fs';
import {createHash} from 'node:crypto';

const bound=8*1024*1024;
const legacyTextPolicy='chart-metadata-lf-v1';
const need=(ok,code)=>{if(!ok)throw new Error(code);};
const identity=p=>Object.fromEntries(['artifactId','chartId','dataHash','admissionHash'].map(k=>[k,p[k]]));
const rect=e=>({left:e.x,top:e.y,width:e.w,height:e.h});
const wireSize=(value,limit=bound)=>jsonWireSize(value,limit,'CHART_PROGRAM_BOUND');

function displayMetadata(sourceText,wrapBreaks){
 const segments=[];let display='',sourceStart=0;
 const breaks=new Set(wrapBreaks);
 for(const end of wrapBreaks){
  const before=sourceText.charCodeAt(end-1),after=sourceText.charCodeAt(end);
  need(!(before===13&&after===10)&&!(before>=0xd800&&before<=0xdbff&&after>=0xdc00&&after<=0xdfff),'CHART_V2_WRAP');
 }
 const append=(kind,start,end,text)=>{const displayStart=display.length;display+=text;segments.push({kind,sourceStart:start,sourceEnd:end,displayStart,displayEnd:display.length});};
 while(sourceStart<sourceText.length){
  if(breaks.has(sourceStart))append('wrap',sourceStart,sourceStart,'\n');
  const start=sourceStart,c=sourceText[sourceStart];
  if(c==='\r'||c==='\n'){
   sourceStart+=c==='\r'&&sourceText[sourceStart+1]==='\n'?2:1;
   append('source-newline',start,sourceStart,'\n');
  }else{
   sourceStart++;
   while(sourceStart<sourceText.length&&!breaks.has(sourceStart)&&!['\r','\n'].includes(sourceText[sourceStart]))sourceStart++;
   append('copy',start,sourceStart,sourceText.slice(start,sourceStart));
  }
 }
 return {display,segments};
}

const key=p=>JSON.stringify(Object.values(identity(p)));
function compile(input,plan){
 const g=input.semantic,source=g?.source,m=g?.manuscript;
 const contract=requireContentContract(source?.contentContract);
 need(numericContract(contentContractForPacket(contract.packet,source))&&g.manuscriptVersion===contract.manuscript,'CHART_V2_TUPLE');
 need(m?.schemaVersion===contract.manuscript,'CHART_V2_TUPLE');
 const {sourceHash,...body}=source;
 need(sourceHash===hash(body)&&sourceHash===g.contentBinding.sourceHash&&hash(m)===g.contentBinding.manuscriptHash&&equal(plan.contentBinding,g.contentBinding),'CHART_V2_STALE');
 need(equal(deriveChartContent(source.researchChartAdmissions,source.chartCreativeRestrictions),source.chartContent),'CHART_V2_CONTENT');
 need(equal(g.chartPlacements,m.chartPlacements)&&equal(g.chartsByIdentity,Object.fromEntries(source.chartContent.charts.map(c=>[key(c),c]))),'CHART_V2_GRAPH');
 const canonical=normalizeManuscript({schemaVersion:contract.semantic,source,manuscript:m,contentBinding:g.contentBinding,sourceLocations:g.sourceLocations,sourceLocationVersion:contract.location},input.assets);
 need(equal(g,canonical),'CHART_V2_GRAPH');
 for(const file of input.brand.font.files)need(GlobalFonts.registerFromPath(file),'CHART_V2_FONT_RESOURCE');
 validateNumericChartPlan(input,plan,createCanvas(2,2).getContext('2d'));
 const rows=[],handles=new Map(),metadataHandles=new Map(),names=new Set();let bytes=0;
 for(const [index,page]of plan.slides.entries())for(const element of page.elements){
  if(element.type!=='chart')continue;
  const ref=element.chartRef,a=source.researchChartAdmissions.find(a=>a.artifactId===ref.artifactId&&a.admissionHash===ref.admissionHash);
  need(a?.raw,'CHART_V2_ADMISSION');const parsed=parseChartEvidence(a.raw,a.sourceBinding.sources),chart=parsed.charts.find(c=>c.chartId===ref.chartId&&c.dataHash===ref.dataHash);
  need(chart&&!names.has(element.id),'CHART_V2_OCCURRENCE');names.add(element.id);
  const placement={slideNumber:index+1,name:element.id,...rect(element)},brand={fontFamily:input.brand.font.family,titleSize:20,axisSize:16,legendSize:16,labelSize:16};
  const metadata=page.elements.filter(e=>e.contentRefs?.chartOccurrenceId===ref.occurrenceId).map(e=>{
   need(e.type==='text'&&e.size>=16&&e.size<=64,'CHART_V2_METADATA');let actual='',offset=0;
   for(const end of e.wrapBreaks){need(Number.isSafeInteger(end)&&end>offset&&end<e.sourceText.length,'CHART_V2_WRAP');actual+=e.sourceText.slice(offset,end)+'\n';offset=end;}actual+=e.sourceText.slice(offset);need(actual===e.text,'CHART_V2_WRAP');
   const row={elementId:e.id,elementOccurrenceId:e.occurrenceId,text:e.text,sourceText:e.sourceText,wrapBreaks:e.wrapBreaks,contentRefs:e.contentRefs,geometry:rect(e),fontFamily:input.brand.font.family,fontSize:e.size,fontColor:e.color};
   need(!metadataHandles.has(e.id),'CHART_V2_METADATA');
   const derived=displayMetadata(e.sourceText,e.wrapBreaks);
   need(derived.display===e.text.replace(/\r\n?/g,'\n'),'CHART_V2_WRAP');
   metadataHandles.set(e.id,{row,slideNumber:index+1,element:structuredClone(e),...derived});
   return row;
  });
  const row={identity:identity(ref),catalogDigest:parsed.catalogDigest,sourcesDigest:parsed.sourcesDigest,authoredOccurrenceId:ref.occurrenceId,pageIntentId:ref.pageIntentId,elementId:element.id,elementOccurrenceId:element.occurrenceId,placement,brand,expectedChart:chart,metadata};
  bytes+=wireSize(row,bound-bytes);need(bytes<=bound,'CHART_PROGRAM_BOUND');rows.push(row);handles.set(element.id,{parsed,row});
 }
 need(rows.length===m.chartPlacements.length&&rows.length<=128,'CHART_V2_OCCURRENCE');
 const textPolicy=plan.numericCompositionVersion?'chart-metadata-lf-v2':legacyTextPolicy;
 const program={schema:'native-chart-occurrence-program-v2',textPolicy,sourceHash,manuscriptHash:hash(m),style:plan.style,slideCount:plan.slides.length,slideSize:{width:plan.width,height:plan.height},occurrences:rows};
 wireSize(program);return {program,handles,metadataHandles};
}
export function bindNativeCharts(input,plan){
 const compiled=compile(input,plan),emitted=[];
 return Object.freeze({
  textPolicy:compiled.program.textPolicy,
  textFor(element,slideNumber,name){
   const entry=compiled.metadataHandles.get(name);
   if(entry){need(element.id===name&&entry.slideNumber===slideNumber&&equal(element,entry.element),'CHART_V2_METADATA_WRITE');return entry.display;}
   need(!compiled.metadataHandles.has(element.id)&&!element.contentRefs?.chartOccurrenceId&&!element.contentRefs?.chartMetadata?.length,'CHART_V2_METADATA_WRITE');
   return element.text;
  },
  write(slide,element,slideNumber,name){
   const entry=compiled.handles.get(name);need(entry&&entry.row.placement.slideNumber===slideNumber&&equal(identity(element.chartRef),entry.row.identity)&&!emitted.some(e=>e.elementId===name),'CHART_V2_WRITE');
   const foundation=addNativeChart(slide,entry.parsed,entry.row.identity.chartId,entry.row.placement,entry.row.brand,compiled.program.textPolicy==='chart-metadata-lf-v2');
   emitted.push({elementId:name,authoredOccurrenceId:entry.row.authoredOccurrenceId,identity:entry.row.identity,foundation});
  },
  requiredOwnerSlides(){return requiredNativeChartOwnerSlides(emitted.map(e=>e.foundation));},
  verifyFinal(packagePath){
   const fresh=compile(input,plan);need(equal(compiled.program,fresh.program),'CHART_V2_STALE');
   const manifest={schema:'native-chart-occurrence-manifest-v2',programHash:digest(fresh.program),emitted};
   return verifyCompiled(packagePath,fresh,manifest);
  },
 });
}

function inspectNativeChartOccurrences(packagePath,program,manifest){
 const payload={schema:'native-chart-occurrence-inspection-v2',program,manifest};wireSize(payload);
 const input=JSON.stringify(payload);
 need(Buffer.byteLength(input)<=bound,'CHART_PROGRAM_BOUND');
 const child=spawnSync(python,[fileURLToPath(new URL('./chart-package-verify-v2.py',import.meta.url)),packagePath,'--strict-roots'],{input,encoding:'utf8',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},maxBuffer:8*1024*1024,timeout:30000});
 if(child.status!==0)throw new Error(child.stderr||child.error?.message||'CHART_PACKAGE_VERIFICATION_FAILED');
 return JSON.parse(child.stdout);
}

function verifyCompiled(packagePath,compiled,manifest){
 const proof=inspectNativeChartOccurrences(packagePath,compiled.program,manifest);
 return {program:compiled.program,manifest,proof};
}
export function verifyNativeChartOccurrences(packagePath,input,plan,manifest){
 return verifyCompiled(packagePath,compile(input,plan),manifest);
}

function readBoundedJson(path,limit=bound){
 const fd=openSync(path,'r');
 try{
  const stat=fstatSync(fd);need(stat.isFile()&&stat.size<=limit,'CHART_PROGRAM_BOUND');
  const buffer=Buffer.alloc(stat.size+1);let total=0,n;
  while(total<buffer.length&&(n=readSync(fd,buffer,total,buffer.length-total,null))>0)total+=n;
  need(total===stat.size&&fstatSync(fd).size===stat.size,'CHART_V2_FILES_CHANGED');
  const raw=buffer.subarray(0,total);return {raw,value:JSON.parse(raw.toString('utf8'))};
 }finally{closeSync(fd);}
}
export function verifyNativeObjectCoverage(packagePath,input,plan,layoutManifestPath,chartEvidencePath){
 const layout=readLayout(layoutManifestPath),saved=readBoundedJson(chartEvidencePath);
 const compiled=compile(input,plan),evidence=verifyCompiled(packagePath,compiled,saved.value.manifest);
 need(equal(evidence,saved.value),'CHART_V2_STALE_EVIDENCE');
 need(Object.keys(plan).every(key=>equal(plan[key],layout.value[key]))&&equal(layout.value.semanticContent,input.semantic),'CHART_V2_LAYOUT_BINDING');
 const resources=Object.fromEntries(Object.entries(input.assets).map(([id,a])=>[id,{sha256:a.sha256,byteLength:a.byteLength,width:a.width,height:a.height,file:a.file}]));
 need(equal(resources,layout.value.imageResources),'CHART_V2_LAYOUT_RESOURCES');
 const payload={chartEvidence:evidence,manifestSha256:createHash('sha256').update(layout.raw).digest('hex'),chartProofSha256:createHash('sha256').update(saved.raw).digest('hex')};
 wireSize(payload);
 const limit=coverageOutputLimit(layout);
 const child=spawnSync(python,[fileURLToPath(new URL('../object-coverage.py',import.meta.url)),'--numeric-stdin',packagePath,layoutManifestPath],{input:JSON.stringify(payload),env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},maxBuffer:limit,timeout:30000});
 if(child.error||child.status!==0)throw new Error(child.stderr?.toString()||child.error?.message||'NATIVE_OBJECT_COVERAGE_FAILED');
 need(Buffer.isBuffer(child.stdout)&&child.stdout.length<=limit,'NATIVE_COVERAGE_OUTPUT_BOUND');
 need(readLayout(layoutManifestPath).raw.equals(layout.raw)&&readBoundedJson(chartEvidencePath).raw.equals(saved.raw),'CHART_V2_FILES_CHANGED');
 const report=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(child.stdout));
 checkNumericCoverage(report,layout);
 return report;
}

export function preflightNativeNumericFonts(packagePath,input,plan,layoutManifestPath,chartEvidencePath,options){
 const coverage=verifyNativeObjectCoverage(packagePath,input,plan,layoutManifestPath,chartEvidencePath);
 const layout=readLayout(layoutManifestPath),saved=readBoundedJson(chartEvidencePath);
 const evidence=verifyNativeChartOccurrences(packagePath,input,plan,saved.value.manifest);
 need(equal(evidence,saved.value)&&coverage.deckSha256===evidence.proof.packageHash,'CHART_V2_STALE_EVIDENCE');
 const args=[fileURLToPath(new URL('../native-font-check.py',import.meta.url)),'preflight-numeric','--deck',packagePath,'--layout',layoutManifestPath];
 for(const key of ['out','brand','validation','fc-scan','fc-match']){need(typeof options[key]==='string'&&options[key].length>0,'NUMERIC_FONT_OPTIONS');args.push('--'+key,options[key]);}
 const child=spawnSync(python,args,{input:JSON.stringify(evidence),encoding:'utf8',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},maxBuffer:bound,timeout:30000});
 if(child.status!==0)throw new Error(child.stderr||child.error?.message||'NATIVE_FONT_PREFLIGHT_FAILED');
 need(readLayout(layoutManifestPath).raw.equals(layout.raw)&&readBoundedJson(chartEvidencePath).raw.equals(saved.raw),'CHART_V2_FILES_CHANGED');
 return {schemaVersion:'native-numeric-font-preflight.v1',deckSha256:coverage.deckSha256,chartProgramHash:evidence.manifest.programHash,sourceBound:true};
}
