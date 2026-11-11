import {ordinaryOriginMatches} from './ordinary-model-claims.mjs';
import {reopenOrdinary,isOrdinaryHttp,ordinarySuccessfulStatus,ordinaryHasContext} from './ordinary-model.mjs';
import {join} from 'node:path';
import {mkdir,open,link,unlink,realpath} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual as equal} from 'node:util';
import {createIntakeDocumentStore,checkedBytes} from './intake-document-store.mjs';
import {createIntakeRuntime} from './intake-runtime.mjs';
import {createImageEvidenceStore} from './image-evidence.mjs';
import {readManagedCapture} from './source-capture-store.mjs';
import {extractHtml} from './source-acquisition.mjs';
import {validatePdfExtraction} from './intake-pdf.mjs';
import {verifyResearchDiscovery,verifyResearchResponses} from './research-search.mjs';
import {acquisitionHash as hash,acquisitionNeed as need,acquisitionPlanRequest,ACQUISITION_BRANCHES,acquisitionBranchSlice,validateAcquisitionPlan,acquisitionAdmission,acquisitionCurrent,resolveAcquisition} from './research-acquisition.mjs';

export const ACQUISITION_READ_LIMITS=Object.freeze({bytes:536870912,files:512,manifestBytes:16777216});
export function createAcquisitionReadBudget(){return {reservedBytes:0,files:0,reserve(bytes,files=1){need(Number.isSafeInteger(bytes)&&bytes>=0&&Number.isSafeInteger(files)&&files>0&&this.reservedBytes+bytes<=ACQUISITION_READ_LIMITS.bytes&&this.files+files<=ACQUISITION_READ_LIMITS.files,'ACQUISITION_ORIGINAL_LIMIT','Cumulative acquisition original read allowance exceeded');this.reservedBytes+=bytes;this.files+=files;},captureAccounting(){let reserved=0;const budget=this;return {get reservedBytes(){return reserved;},set reservedBytes(value){budget.reserve(value-reserved);reserved=value;},actualBytes:0,descriptorReads:0};}};}
function originalFiles(root,budget){const files=createIntakeDocumentStore(root),read=files.readResult;files.readResult=ref=>{budget.reserve(ref?.byteLength+1);return read(ref);};return files;}
function materialReadBytes(project,id){const d=project.intakeDocuments?.find(d=>d.id===id);need(d?.raw,'ACQUISITION_ORIGINAL_INVALID','Registered material original required');let bytes=d.raw.byteLength+(d.extraction?.byteLength??0)+(d.kind==='image'?1048576:0);if(d.origin.kind==='url_capture'){const c=project.sourceCaptures.find(c=>c.id===d.captureId),record=Buffer.from(JSON.stringify(c?.record,null,2)+'\n');need(c&&hash(record)===c.recordHash,'ACQUISITION_ORIGINAL_INVALID','Registered capture metadata changed');bytes+=record.length;}return bytes;}
export function acquisitionOriginalBounds(g){need(Array.isArray(g.branches)&&g.branches.length<=4&&new Set(g.branches.map(b=>b.kind)).size===g.branches.length,'ACQUISITION_ORIGINAL_LIMIT','Finite independent branch journals required');for(const b of g.branches){const slice=acquisitionBranchSlice(g.envelope,b.kind);need(ACQUISITION_BRANCHES.includes(b.kind)&&equal(b.allocation,slice)&&Array.isArray(b.tools)&&b.tools.every(t=>['search','capture'].includes(t.kind))&&b.tools.length<=slice.queries+slice.pageAttempts&&b.tools.filter(t=>t.kind==='search').length<=slice.queries&&b.tools.filter(t=>t.kind==='capture').length<=slice.pageAttempts,'ACQUISITION_ORIGINAL_LIMIT','Tool journal exceeds frozen branch allowance');}}

export const acquisitionRoot=(root,id)=>join(root,'research-acquisition',id);
export function materialSource(document,extraction,projectId){
 if(!extraction?.text)return null;
 return {id:`material-${document.id}`,url:document.origin.finalUrl??document.origin.requestedUrl??`http://localhost/api/projects/${encodeURIComponent(projectId)}/intake/${encodeURIComponent(document.id)}`,text:extraction.text,scopeRelation:'background',verification:'captured',reason:'Selected registered intake text. Original attribution and adoption do not authenticate source facts.',provenance:{kind:'registered_intake_material',documentId:document.id,documentHash:hash(document),rawHash:document.raw.sha256,extractionHash:document.extraction?.sha256??null,textHash:hash(extraction.text)}};
}
export async function verifyAcquisitionMaterials(project,envelope,{executionRoot,readBudget=createAcquisitionReadBudget()}){
 need(envelope.materials.length<=20,'ACQUISITION_ORIGINAL_LIMIT','Finite material selection required');const draft=project.intakeDrafts?.find(d=>d.id===envelope.taskCard.draftId);if(draft){need(draft.input.materials.length<=21,'ACQUISITION_ORIGINAL_LIMIT','Finite frozen task inputs required');for(const m of draft.input.materials.filter(m=>m.kind!=='human'))readBudget.reserve(2*materialReadBytes(project,m.id),8);const job=project.jobs.find(j=>j.id===envelope.taskCard.extractionJobId),attempt=job?.attempts.at(-1);for(const ref of [attempt?.requestEvidence,attempt?.resultEvidence])readBudget.reserve(ref?.byteLength+1);}
 for(const m of envelope.materials)readBudget.reserve(materialReadBytes(project,m.document.id),4);
 const intake=createIntakeRuntime({store:{read:()=>project},root:executionRoot,providers:{},bindings:{},imageStore:createImageEvidenceStore({rootDir:join(executionRoot,'images')})});
 await intake.verifyCard(project.id,envelope.taskCard);
 const sources=[];
 for(const m of envelope.materials){
  const loaded=await intake.checkedDocument(project.id,m.document.id);need(equal(loaded.document,m.document),'ACQUISITION_ORIGINAL_INVALID','Selected registered material changed');
  const s=materialSource(loaded.document,loaded.extraction,project.id);if(s)sources.push(s);
 }
 need(equal(sources,envelope.materialSources??[]),'ACQUISITION_ORIGINAL_INVALID','Complete selected material text differs from actual original extraction');return sources;
}
export async function verifyAcquisitionCapture(root,outcome,envelope,{readBudget=createAcquisitionReadBudget()}={}){
 const responses=await verifyResearchResponses(originalFiles(root,readBudget),outcome.responseOriginals??[],envelope.limits.captureBytes);
 if(!outcome.capture){need(!outcome.source,'ACQUISITION_ORIGINAL_INVALID','No original means no admitted text');return;}
 const c=await readManagedCapture(join(root,'captures'),outcome.capture,readBudget.captureAccounting()),e=c.record.extraction;need(responses.length===1&&responses[0].raw.equals(c.raw)&&responses[0].status===c.record.httpStatus&&responses[0].url===c.record.finalUrl,'ACQUISITION_ORIGINAL_INVALID','Captured response differs from exact transport original');
 need(c.raw.length<=envelope.limits.captureBytes&&(outcome.status==='limit_exceeded'||Buffer.byteLength(e.text)<=envelope.limits.extractionBytes),'ACQUISITION_ORIGINAL_INVALID','Capture exceeds original frozen bounds');
 if(['text/html','application/xhtml+xml'].includes(c.record.mimeType)){
  const actual=extractHtml(new TextDecoder(e.charset??'utf-8').decode(c.raw),c.record.finalUrl);
  need(actual.text===e.text&&actual.method===e.method&&equal(actual.images,e.images),'ACQUISITION_ORIGINAL_INVALID','Actual HTML raw-to-text extraction changed');
 }else if(c.record.mimeType==='application/pdf'&&e.method!=='none'){
  need(outcome.pdfOriginal,'ACQUISITION_ORIGINAL_INVALID','PDF extraction tool receipt required');const pdf=await originalFiles(root,readBudget).readResult(outcome.pdfOriginal);validatePdfExtraction(pdf);
  need(pdf.rawHash===c.record.raw.sha256&&pdf.text===e.text&&equal(pdf.identity,outcome.extractionIdentity)&&equal(pdf.limits,envelope.extractorIdentity.limits)&&Object.entries(envelope.extractorIdentity.identity).every(([k,v])=>equal(pdf.identity[k],v)),'ACQUISITION_ORIGINAL_INVALID','PDF actual raw, text, tool identity or limits changed');
 }else need(!e.text,'ACQUISITION_ORIGINAL_INVALID','Unsupported images or MIME cannot provide text');
 if(outcome.source){const s=outcome.source,p=s.provenance;need(equal(s.scopeAssessment,{purpose:'unknown',object:'unknown',scenario:'unknown',time:'unknown',users:'unknown',materialType:{state:'known',mimeType:c.record.mimeType,captureRecordHash:c.recordHash},reason:'Only MIME is a parser fact. Literal query matches do not establish semantic scope.'})&&c.record.httpStatus>=200&&c.record.httpStatus<300&&e.text&&s.text===e.text&&s.url===c.record.finalUrl&&s.scopeRelation==='background'&&s.verification==='captured'&&s.id===`acquired-${hash([c.record.raw.sha256,p.extractionIdentity,e.textHash,e.locator])}`&&p.kind==='research_acquisition_capture'&&p.generationId===envelope.id&&p.captureRecordHash===c.recordHash&&p.rawSha256===c.record.raw.sha256&&p.textHash===e.textHash&&equal(p.locator,e.locator)&&equal(p.extractionIdentity,c.record.mimeType==='application/pdf'?outcome.extractionIdentity:{adapter:e.method,charset:e.charset}),'ACQUISITION_ORIGINAL_INVALID','Admitted source differs from physical raw and extraction original');}
}
export async function verifyAcquisitionGeneration(project,g,{executionRoot,historical=false,requireManifest=true,readBudget=createAcquisitionReadBudget()}={}){
 acquisitionOriginalBounds(g);acquisitionCurrent(project,g,{historical});
 const root=acquisitionRoot(executionRoot,g.envelope.id),files=originalFiles(root,readBudget);
 const envelope=await files.readResult(g.envelopeOriginal);need(equal(envelope,g.envelope),'ACQUISITION_ORIGINAL_INVALID','Physical frozen envelope changed');
 await verifyAcquisitionMaterials(project,g.envelope,{executionRoot,readBudget});
 if(g.plan){
  const plannerSaved=await loadAcquisitionToolOriginal(root,hash(['plan-result',g.envelope.id,project.jobs.find(j=>j.id===`${g.envelope.id}:plan`)?.attemptId]),readBudget);need(plannerSaved&&equal(plannerSaved.original,g.plan.resultOriginal),'ACQUISITION_ORIGINAL_INVALID','Deterministic saved planner result changed');
  const request=await files.readResult(g.plan.requestOriginal),result=await files.readResult(g.plan.resultOriginal),job=project.jobs.find(j=>j.id===`${g.envelope.id}:plan`),attempt=job?.attempts.at(-1),expected=acquisitionPlanRequest(g.envelope);
  need(request.projectId===project.id&&request.jobId===job.id&&request.attemptId===attempt.id&&equal(request.binding,g.envelope.plannerBinding)&&equal(request.request,expected),'ACQUISITION_ORIGINAL_INVALID','Original planner invocation changed');
  need(ordinaryOriginMatches(result,attempt.httpAttemptLocator,attempt.id),'ACQUISITION_ORIGINAL_INVALID','Retained planner result changed persisted HTTP origin');
  need(result.runId===attempt.id&&result.requestedModel===job.binding.model&&result.inputPacketHash===hash(JSON.stringify({runId:attempt.id,model:job.binding.model,...expected}))&&ordinarySuccessfulStatus(result)&&ordinaryHasContext(result)&&['signal','reason','error'].every(k=>result[k]==null)&&typeof result.responseText==='string'&&Buffer.byteLength(result.responseText)<=g.envelope.limits.planOutputBytes,'ACQUISITION_ORIGINAL_INVALID','Exact successful bounded planner receipt required');
  if(isOrdinaryHttp(result)){readBudget.reserve(64*1024*1024);await reopenOrdinary({executionRoot,binding:job.binding,attemptId:attempt.id,request:expected,runtimePacketBytes:Buffer.from(JSON.stringify({projectId:project.id,jobId:job.id,attemptId:attempt.id,binding:job.binding,request:expected})),receipt:result});}
  const parsed=JSON.parse(result.responseText);need(equal(validateAcquisitionPlan(parsed,g.envelope),g.plan.value)&&g.plan.planHash===hash(parsed)&&(result.parsedOutput===undefined||equal(result.parsedOutput,parsed)),'ACQUISITION_ORIGINAL_INVALID','Physical planner response does not match plan');
  if(result.paths){
   for(const [key,max]of [['input',2097152],['output',g.envelope.limits.planOutputBytes],['receipt',2097152]]){const file=result.paths[key];need(typeof file==='string'&&file.startsWith(executionRoot+'/'),'ACQUISITION_ORIGINAL_INVALID','Planner disk original must remain in managed execution root');readBudget.reserve(max+1);const bytes=await checkedBytes(file,{maxBytes:max});if(key==='output')need(bytes.toString()===result.responseText,'ACQUISITION_ORIGINAL_INVALID','Planner provider output changed');if(key==='input')need(equal(JSON.parse(bytes),{runId:attempt.id,model:job.binding.model,...expected}),'ACQUISITION_ORIGINAL_INVALID','Planner provider input changed');if(key==='receipt'){const disk=JSON.parse(bytes);need(Object.entries(disk).every(([k,v])=>equal(v,result[k])),'ACQUISITION_ORIGINAL_INVALID','Planner provider receipt changed');}}
  }
 }
 for(const b of g.branches)for(const tool of b.tools){
  need(tool.state==='completed','ACQUISITION_OUTCOME_UNKNOWN','Unknown dispatched tools require original-only reconciliation');
  const receipt=await loadAcquisitionToolOriginal(root,tool.key,readBudget);need(receipt&&receipt.key===tool.key&&receipt.generationId===g.envelope.id&&equal(receipt.argument,tool.argument)&&receipt.kind===tool.kind&&equal(receipt.original,tool.original)&&equal(receipt.outcome,tool.outcome),'ACQUISITION_ORIGINAL_INVALID','Exact deterministic dispatch original changed');
  const original=await files.readResult(tool.original);need(equal(original,tool.outcome),'ACQUISITION_ORIGINAL_INVALID','Saved tool original differs from journal');
  if(tool.kind==='search')await verifyResearchDiscovery(join(root,'search'),original,{readBudget});
  else await verifyAcquisitionCapture(root,original,g.envelope,{readBudget});
 }
 if(requireManifest){const manifest=await readAcquisitionManifest(root,g.manifest,readBudget);const expected=acquisitionAdmission(g);need(equal(g.admission,expected)&&equal(manifest,{identity:hash({envelope:g.envelope,plan:g.plan,branches:g.branches}),admission:expected}),'ACQUISITION_ORIGINAL_INVALID','Actual immutable admission manifest changed');}
 return g;
}
export async function verifyResearchAcquisitionOriginal(project,ref,options){const g=resolveAcquisition(project,ref,{historical:options?.historical??true});return verifyAcquisitionGeneration(project,g,{...options,historical:options?.historical??true});}

export async function saveAcquisitionToolOriginal(root,key,value,maxBytes=4194304){
 need(/^[a-f0-9]{64}$/.test(key),'ACQUISITION_ORIGINAL_INVALID','Deterministic tool identity required');const dir=join(root,'tool-results');await mkdir(dir,{recursive:true});need(await realpath(dir)===dir,'ACQUISITION_ORIGINAL_INVALID','Tool original directory changed');
 const bytes=Buffer.from(JSON.stringify(value));need([4194304,16777216].includes(maxBytes)&&bytes.length<=maxBytes,'ACQUISITION_ORIGINAL_LIMIT','Immutable acquisition original exceeds its finite byte allowance');const file=join(dir,key),temporary=join(dir,`.write-${randomUUID()}`),h=await open(temporary,'wx',0o400);try{await h.writeFile(bytes);await h.sync();try{await link(temporary,file);}catch(e){if(e.code!=='EEXIST')throw e;}}finally{await h.close();await unlink(temporary);}
 const actual=await checkedBytes(file,{maxBytes});need(actual.equals(bytes),'ACQUISITION_ORIGINAL_INVALID','Deterministic tool original collision');return {sha256:hash(bytes),byteLength:bytes.length};
}
export async function loadAcquisitionToolOriginal(root,key,readBudget){if(readBudget)readBudget.reserve(4194305);need(/^[a-f0-9]{64}$/.test(key),'ACQUISITION_ORIGINAL_INVALID','Deterministic tool identity required');try{return JSON.parse(await checkedBytes(join(root,'tool-results',key),{maxBytes:4194304}));}catch(e){if(e.code==='ENOENT')return null;throw e;}}

export async function saveAcquisitionManifest(root,value){const bytes=Buffer.from(JSON.stringify(value));return saveAcquisitionToolOriginal(root,hash(bytes),value,16777216);}
export async function readAcquisitionManifest(root,ref,readBudget=createAcquisitionReadBudget()){readBudget.reserve(ref?.byteLength+1);need(/^[a-f0-9]{64}$/.test(ref?.sha256),'ACQUISITION_ORIGINAL_INVALID','Manifest byte identity required');return JSON.parse(await checkedBytes(join(root,'tool-results',ref.sha256),{...ref,maxBytes:16777216}));}
