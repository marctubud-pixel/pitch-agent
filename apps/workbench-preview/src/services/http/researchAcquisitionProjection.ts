import {ACQUISITION_BRANCHES,type AcquisitionState} from '../../domain/researchAcquisition';
import {ServiceError} from '../../domain/service';
import {object,records,text,strings,integer,type Snapshot} from './dto';
import {originalHash,registeredOriginals} from './intakeProjection';
const bad=():never=>{throw new ServiceError('response_lost','采集记录未绑定原请求、任务卡和问题计划，请保留原提交核对。',{outcomeUnknown:true,retryable:true});};
export const sameAcquisitionValue=(a:unknown,b:unknown):boolean=>JSON.stringify(a,canonical)===JSON.stringify(b,canonical);
function canonical(_key:string,item:unknown):unknown{return item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(object(item)).sort(([a],[b])=>a<b?-1:a>b?1:0)):item;}
function strictStrings(value:unknown):string[]{if(!Array.isArray(value)||value.some(x=>typeof x!=='string')||new Set(value).size!==value.length)return bad();return strings(value);}
/** Only generations admitted by this HTTP bridge may project acquisition execution. */
export function verifyAcquisitionJobs(p:Snapshot):void{
 for(const job of p.jobs){
  const task=job.task?object(job.task):{},purpose=text(job.purpose),ref=task.researchDataBasis?object(object(task.researchDataBasis).acquisition??{}):{};
  if(!purpose.startsWith('research_acquisition_')&&!ref.generationId)continue;
  const generationId=purpose.startsWith('research_acquisition_')?task.generationId:ref.generationId;
  const g=p.acquisitions?.find(g=>object(g.envelope).id===generationId);if(!g||p.workflowVersion!=='proposal-seven-v1')return bad();
  const e=object(g.envelope),card=object(e.taskCard),start=p.acquisitionRequests?.find(r=>r.operation==='start'&&r.generationId===generationId);
  if(!start)return bad();const request=object(start.request),question=object(start.questionRegistration);
  const raw=p.processedCommands[text(request.commandId)];if(typeof raw!=='string')return bad();const command=object(JSON.parse(raw));
  if(command.kind!=='research-acquisition-http-request'||command.operation!=='start'||command.generationId!==generationId||!sameAcquisitionValue(command.request,request)||!sameAcquisitionValue(command.jobIds,[]))return bad();
  if(request.taskCardId!==card.id||!p.cards.some(c=>c.id===card.id)||question.taskCardId!==card.id||!p.readerPlans?.some(q=>sameAcquisitionValue(q,question))||!sameAcquisitionValue(request.sourceEntryIds,object(e.request).sourceEntryIds)||!sameAcquisitionValue(request.materialIds,object(e.request).materialIds)||!strings(job.inputVersionIds).includes(text(card.id)))return bad();
  if(purpose==='research_acquisition_plan'){
   if(job.id!==`${generationId}:plan`||task.id!==job.id||task.parentId!==generationId||!sameAcquisitionValue(job.binding,e.plannerBinding))return bad();
  }else if(purpose==='research_acquisition_branch'){
   if(!ACQUISITION_BRANCHES.some(k=>k===task.branchKind)||job.id!==`${generationId}:${task.branchKind}`||task.id!==job.id||task.parentId!==generationId||!sameAcquisitionValue(job.binding,{providerId:'local-research-tools',model:'bounded-public-capture-v1',role:task.branchKind})||!g.plan||!records(g.branches).some(b=>b.kind===task.branchKind))return bad();
  }else if(purpose.startsWith('research_acquisition_'))return bad();
  else if(job.stage!=='research'||ref.protocolVersion!=='research-acquisition-v1'||ref.envelopeHash!==e.envelopeHash||ref.planHash!==object(g.plan).planHash||ref.admissionHash!==object(g.admission).admissionHash||!sameAcquisitionValue(ref.manifest,g.manifest)||!sameAcquisitionValue(job.binding,e.producerBinding)||!sameAcquisitionValue(task.researchQuestionRegistration,question))return bad();
 }
}
/** Mirrors the native applicability check against frozen inputs; history still keeps its own ledger. */
async function currentAcquisitionInputs(value:unknown,p:Snapshot,g:Record<string,unknown>):Promise<boolean>{
 const raw=object(value),e=object(g.envelope),request=object(e.request),card=p.cards.find(c=>c.id===p.activeTaskCardId)?.original;
 const origin=p.acquisitionRequests?.find(r=>r.operation==='start'&&r.generationId===e.id),plan=p.readerPlans?.filter(r=>r.taskCardId===p.activeTaskCardId).at(-1);
 if(!card||p.acquisitions?.at(-1)!==g||!origin||!plan||!sameAcquisitionValue(card,e.taskCard)||!sameAcquisitionValue(origin.questionRegistration,plan))return false;
 const digest=(v:unknown)=>originalHash(new TextEncoder().encode(JSON.stringify(v)));
 const core=Object.fromEntries(['id','taskCardId','taskCardHash','method','questions','readerCount'].map(k=>[k,plan[k]]));
 if(plan.taskCardHash!==await digest(card)||plan.registrationHash!==await digest(core))return false;
 const confirmations=records(raw.confirmations).filter(c=>c.taskCardId===p.activeTaskCardId);
 if(!confirmations.length||!sameAcquisitionValue(confirmations,e.confirmations)||!sameAcquisitionValue(records(raw.policies).at(-1),e.policy))return false;
 const sourceIds=strictStrings(request.sourceEntryIds),frozenSources=records(e.manualSources);
 if(!sameAcquisitionValue(sourceIds,frozenSources.map(s=>s.id)))return false;
 for(const frozen of frozenSources){
  const source=p.sourceEntries.find(s=>s.id===frozen.id);if(!source||source.taskCardId!==p.activeTaskCardId)return false;
  const {recordHash,...data}=source;
  if(recordHash!==await digest(data)||object(frozen.provenance).sourceEntryHash!==recordHash)return false;
 }
 const materialIds=strictStrings(request.materialIds),frozenMaterials=records(e.materials);
 if(!sameAcquisitionValue(materialIds,frozenMaterials.map(m=>object(m.document).id)))return false;
 for(const frozen of frozenMaterials){
  const document=p.intakeDocuments?.find(d=>d.id===object(frozen.document).id);
  if(!document||!['ready','no_text'].includes(text(document.status))||!sameAcquisitionValue(document,frozen.document))return false;
  const adoption=records(raw.intakeOperations).filter(op=>op.kind==='intake-adopt'&&records(raw.intakeDrafts).some(d=>d.id===object(op.request).draftId&&records(object(d.input).materials).some(m=>m.id===document.id)));
  if(!sameAcquisitionValue(adoption,frozen.adoption))return false;
 }
 return true;
}
export async function acquisitionState(value:unknown,p:Snapshot):Promise<AcquisitionState>{
 const v=object(value),a=object(v.acquisition),cap=object(v.capability),card=p.cards.find(c=>c.id===p.activeTaskCardId);
 if(!card?.original||v.revision!==p.revision||a.protocolVersion!=='research-acquisition-status-v1'||cap.protocolVersion!=='research-acquisition-v1'||typeof cap.materialsRootShared!=='boolean'||typeof cap.available!=='boolean'||typeof cap.configured!=='boolean'||typeof cap.executionAllowed!=='boolean'||!sameAcquisitionValue(cap.branchKinds,ACQUISITION_BRANCHES)||cap.sourceAuthenticity!=='not_verified'||cap.humanAdoption!=='not_verified'||typeof a.current!=='boolean')return bad();
 verifyAcquisitionJobs(p);
 const g=a.generationId?p.acquisitions?.find(g=>object(g.envelope).id===a.generationId):undefined,e=g?object(g.envelope):null;
 if(a.generationId&&!g||e&&a.envelopeHash!==e.envelopeHash||!['not_started','planning','collecting','sealed','blocked','awaiting_reconciliation','cancelled','cancelling'].includes(text(a.state)))return bad();
 if(e){const {envelopeHash,...data}=e;if(await originalHash(new TextEncoder().encode(JSON.stringify(data)))!==envelopeHash)return bad();}
 if(g?.plan){const plan=object(g.plan);if(a.planHash!==plan.planHash||await originalHash(new TextEncoder().encode(JSON.stringify(plan.value)))!==plan.planHash)return bad();}
 if(g?.admission){const admission=object(g.admission);if(a.catalogueHash!==admission.catalogueHash||!sameAcquisitionValue(a.coverage,admission.coverage)||!sameAcquisitionValue(a.limitations,admission.limitations))return bad();}
 const expectedCurrent=g?await currentAcquisitionInputs(v.project,p,g):false;if(a.current!==expectedCurrent)return bad();
 const target=e?object(e.taskCard):card.original;
 const hash=await originalHash(new TextEncoder().encode(JSON.stringify(target)));
 if(e&&!p.acquisitionRequests?.some(r=>r.operation==='start'&&r.generationId===a.generationId&&object(r.request).taskCardHash===hash))return bad();
 const queued=strictStrings(a.queuedJobIds),jobs=p.jobs.filter(j=>object(j.task).generationId===a.generationId||a.producerJobId===j.id);
 if(queued.some(id=>!jobs.some(j=>j.id===id&&j.status==='queued'))||a.producerJobId&&!jobs.some(j=>j.id===a.producerJobId&&j.status===a.producerStatus))return bad();
 const branches=records(a.branches).map(b=>{const kind=ACQUISITION_BRANCHES.find(k=>k===b.kind);if(!kind||!records(g?.branches).some(x=>x.kind===kind))return bad();const coverage=b.coverage===null?null:object(b.coverage);return {kind,status:text(b.status),coverageSummary:coverage?{usableExcerpts:integer(coverage.usableExcerpts),independentOrigins:integer(coverage.independentOrigins)}:null,coverage:coverage===null?'尚无结果':JSON.stringify(coverage,null,2)};});
 const originals=a.originals===null?null:object(a.originals).verified;if(originals!==null&&typeof originals!=='boolean')return bad();
 if(a.producerJobId&&a.producerStatus==='awaiting_reconciliation'&&!records(a.reconciliation).some(r=>r.jobId===a.producerJobId))a.reconciliation=[...records(a.reconciliation),{jobId:a.producerJobId}];
 const confirmed=p.confirmations.some(c=>c.taskCardId===p.activeTaskCardId),registered=Boolean(p.readerPlans?.some(q=>q.taskCardId===p.activeTaskCardId));
 return {frozenSourceIds:e?strictStrings(object(e.request).sourceEntryIds):[],frozenMaterialIds:e?strictStrings(object(e.request).materialIds):[],materialsRootShared:cap.materialsRootShared,projectId:p.id,revision:integer(v.revision),taskCardId:card.id,taskCardHash:await originalHash(new TextEncoder().encode(JSON.stringify(card.original))),generationTarget:e?{taskCardId:text(target.id),taskCardHash:hash}:null,confirmed,registered,available:cap.available===true&&cap.executionAllowed===true,reason:text(cap.reason)||'采集搜索、规划或研究生成尚未配置。',generationId:text(a.generationId)||null,current:a.current,state:text(a.state),originalsVerified:originals,queuedJobIds:queued,jobs:jobs.map(j=>({id:text(j.id),status:text(j.status)})),branches,producerJobId:text(a.producerJobId)||null,producerStatus:text(a.producerStatus)||null,limitations:strictStrings(a.limitations??[]),coverage:JSON.stringify(a.coverage??[],null,2),sources:p.sourceEntries.filter(s=>s.taskCardId===p.activeTaskCardId).map(s=>({id:text(s.id),title:text(s.title)})),materials:registeredOriginals(p).map(d=>({id:d.id,title:d.resource?.fileName||d.id,eligible:false,reason:d.taskCardId!==p.activeTaskCardId?'历史任务卡资料':'尚未核对原件与解析结果'})),reconciliation:records(a.reconciliation).map(r=>{if(!jobs.some(j=>j.id===r.jobId&&j.status==='awaiting_reconciliation'))return bad();return {jobId:text(r.jobId)};})};
}
export function acquisitionReceipt(value:unknown,p:Snapshot,body:Record<string,unknown>,path:string):boolean{
 const v=object(value),receipt=object(v.receipt),operation=path.split('/').at(-1),row=p.acquisitionRequests?.find(r=>object(r.request).commandId===body.commandId);
 if(!row||row.operation!==operation||!sameAcquisitionValue(row.request,body)||receipt.commandId!==body.commandId||typeof receipt.replayed!=='boolean'||receipt.operation!==operation||receipt.generationId!==row.generationId||!sameAcquisitionValue(receipt.jobIds,row.jobIds)||object(v.acquisition).generationId!==row.generationId)return bad();
 const command=object(JSON.parse(text(p.processedCommands[text(body.commandId)])));
 if(command.kind!=='research-acquisition-http-request'||!sameAcquisitionValue(command.request,body)||command.generationId!==row.generationId||!sameAcquisitionValue(command.jobIds,row.jobIds))return bad();
 if(operation==='step'||operation==='reconcile'){
  const ids=operation==='step'?strictStrings(body.jobIds):[text(body.jobId)];
  if(!sameAcquisitionValue(ids,row.jobIds)||ids.some(id=>!p.jobs.some(j=>j.id===id&&!['queued','running'].includes(text(j.status)))))return bad();
 }
 return object(v.acquisition).current!==true;
}
