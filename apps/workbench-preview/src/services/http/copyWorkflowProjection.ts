import {bridgeCreativeCopyJob,creativeReportBound} from './copyCreativeProjection';
import type {CopyWorkspace} from '../../domain/copyWorkflow';
import {ServiceError} from '../../domain/service';
import {object,records,text,type Snapshot} from './dto';
import {bridgeSimpleJob} from './simpleStrategyProjection';
import {sameAcquisitionValue as same} from './researchAcquisitionProjection';
import {originalHash} from './intakeProjection';
const invalid=():never=>{throw new ServiceError('response_lost','文案响应的原稿、原节点或版本绑定无效，请保留原请求。',{outcomeUnknown:true,retryable:true});};
const required=(v:unknown):string=>typeof v==='string'&&v.trim()?v:invalid();
function strings(v:unknown):string[]{if(!Array.isArray(v)||v.some(x=>typeof x!=='string'))return invalid();return v;}
function bool(v:unknown):boolean{return typeof v==='boolean'?v:invalid();}
const hash=(v:unknown)=>originalHash(new TextEncoder().encode(JSON.stringify(v,null,2)));
function canonical(v:unknown):unknown {if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,x])=>[k,canonical(x)]));return v;}
function edgeFor(p:Snapshot,id:unknown){return records(p.native?.ownerEdges).find(e=>e.id===id&&e.kind==='strategy-to-copy'&&e.protocolVersion==='owner-edge-v1');}
function snapshot(p:Snapshot){const raw=p.native??{},researchId=p.stages.find(x=>x.stage==='research')?.activeArtifactId;return {card:p.cards.find(c=>c.id===p.activeTaskCardId)?.original,policy:records(raw.policies).at(-1),researchId,questions:p.readerPlans?.filter(q=>q.taskCardId===p.activeTaskCardId).at(-1),release:p.releases.filter(r=>r.artifactId===researchId).at(-1)};}
function sourceValid(p:Snapshot,e:Record<string,unknown>):boolean{
 const envelope=object(e.envelope),source=object(envelope.source),a=p.artifacts.find(a=>a.id===source.artifactId&&a.stage==='strategy');
 return Boolean(a&&a.contentHash===source.contentHash&&p.jobs.some(j=>Array.isArray(j.outputVersionIds)&&j.outputVersionIds.includes(a.id)&&bridgeSimpleJob(p,j)));
}
export function bridgeCopyJob(p:Snapshot,j:Record<string,unknown>):boolean{
 if(p.workflowVersion!=='proposal-seven-v1')return false;
 if(j.purpose==='verification'||j.purpose==='creative_review'){
  const parent=p.jobs.find(x=>x.stage==='copy'&&!x.purpose&&Array.isArray(x.outputVersionIds)&&x.outputVersionIds.includes(j.targetArtifactId));
  if(!parent||!bridgeCopyJob(p,parent)||j.stage!=='copy')return false;
  if(j.purpose==='verification')return object(object(j.task).verificationInput).artifactId===j.targetArtifactId&&object(object(j.task).verificationInput).contentHash===p.artifacts.find(a=>a.id===j.targetArtifactId)?.contentHash;
  return bridgeCreativeCopyJob(p,j,parent);
 }
 const e=edgeFor(p,j.edgeId??object(j.task).ownerEdgeId);if(!e||!sourceValid(p,e))return false;
 const env=object(e.envelope),source=object(env.source),task=object(j.task);
 if(j.purpose==='owner_acceptance'){
  const side=j.side,expected=side==='producer'?object(env.producerAssignment).binding:side==='consumer'?env.consumerBinding:null;
  return j.stage==='strategy'&&j.targetArtifactId===source.artifactId&&same(object(task.ownerInput).envelope,env)&&object(task.ownerInput).side===side&&same(j.binding,expected);
 }
 return j.stage==='copy'&&!j.purpose&&task.copyContractVersion==='copy-message-v2'&&task.ownerEnvelopeHash===env.envelopeHash&&object(e.commit??{}).jobId===j.id&&same(j.binding,env.consumerBinding);
}
export const isCopyPending=(kind:string)=>['continue_copy','confirm_strategy','step_copy','verify_copy','review_copy'].includes(kind);
export function copyReceipt(value:unknown,p:Snapshot,body:Record<string,unknown>,path:string):boolean {
 const root=object(value),r=object(root.receipt),operation=path.endsWith('strategy-continuations')?'continue':path.split('/').at(-1),row=records(p.native?.copyHttpRequests).find(x=>object(x.request).commandId===body.commandId);
 if(!row||row.operation!==operation||!same(row.request,body)||r.commandId!==body.commandId||r.operation!==operation||typeof r.replayed!=='boolean'||!same(r.jobIds,row.jobIds))return invalid();
 const ledger=Object.values(p.processedCommands).some(x=>{try{const c=object(JSON.parse(text(x)));return c.kind==='copy-http-request'&&c.operation===operation&&same(c.request,body)&&same(c.jobIds,row.jobIds);}catch{return false;}});if(!ledger)return invalid();
 if(operation==='step'&&(!same(body.jobIds,row.jobIds)||strings(row.jobIds).length<1||strings(row.jobIds).length>4||records(row.bindings).length!==strings(row.jobIds).length))return invalid();
 for(const binding of records(row.bindings)){const job=p.jobs.find(j=>j.id===binding.id);if(!job||!bridgeCopyJob(p,job)||!same(job.binding,binding.binding))return invalid();}
 return object(root.copyWorkflow).current!==true||!same(row.snapshot,{...snapshot(p),strategyId:p.stages.find(s=>s.stage==='strategy')?.activeArtifactId});
}
export async function copyState(value:unknown,p:Snapshot):Promise<CopyWorkspace>{
 const root=object(value),s=object(root.copyWorkflow),cap=object(root.capability),raw=p.native??{};
 if(root.revision!==p.revision||s.protocolVersion!=='simple-copy-workspace-v1'||cap.protocolVersion!=='simple-copy-workspace-v1'||s.taskCardId!==p.activeTaskCardId||s.strategyArtifactId!==(p.stages.find(x=>x.stage==='strategy')?.activeArtifactId??null)||s.originalsVerified!==false)return invalid();
 const strategyId=text(s.strategyArtifactId)||null,strategy=p.artifacts.find(a=>a.id===strategyId),producer=p.jobs.find(j=>Array.isArray(j.outputVersionIds)&&j.outputVersionIds.includes(strategyId));
 // Reuse the strict SIMPLE upstream authority, actual source SHA and task/policy/research binding.
 let upstreamCurrent=false;
 if(strategy&&producer){const basis=object(object(producer.task).strategyBasis),srow=p.simpleStrategyRequests?.find(r=>r.operation==='continue'&&r.jobId===producer.id),frozen=srow?object(srow.snapshot):{};
  upstreamCurrent=basis.taskCardId===p.activeTaskCardId&&basis.researchArtifactId===(p.stages.find(x=>x.stage==='research')?.activeArtifactId??null)&&object(object(basis.handoff).policy).version===p.policy.version&&same(frozen,snapshot(p));
 }
 if(bool(s.sourceCurrent)!==upstreamCurrent)return invalid();
 const e=s.edgeId?edgeFor(p,s.edgeId):undefined;
 if(s.edgeId&&(!e||!sourceValid(p,e)||object(object(e.envelope).source).artifactId!==strategyId))return invalid();
 if(e){const env=object(e.envelope),{envelopeHash,...data}=env;if(envelopeHash!==await originalHash(new TextEncoder().encode(JSON.stringify(canonical(data)))))return invalid();if(await hash(object(env.source).content)!==strategy?.contentHash)return invalid();if(s.current===true&&(!same(env.taskCard,p.cards.find(c=>c.id===p.activeTaskCardId)?.original)||!same(env.policy,records(raw.policies).at(-1))))return invalid();if(!records(raw.copyHttpRequests).some(r=>r.operation==='continue'&&object(r.request).artifactId===strategyId))return invalid();}
 const a=s.artifactId?p.artifacts.find(a=>a.id===s.artifactId&&a.stage==='copy'&&object(a.copyContract??{}).version==='copy-message-v2'):undefined;
 const copy=p.jobs.find(j=>j.id===s.copyJobId),belongs=Boolean(e&&copy&&bridgeCopyJob(p,copy)&&Array.isArray(copy.outputVersionIds)&&copy.outputVersionIds.includes(a?.id));
 if(bool(s.current)!==(upstreamCurrent&&(!a||belongs))||Boolean(a)!==(s.content!==null)||a&&a.contentHash!==s.contentHash)return invalid();
 const body=s.content===null?null:object(s.content);if(body&&(await hash(body)!==s.contentHash||body.outputKind!=='copy'||records(body.directions).length!==3||!['complete','blocked'].includes(text(body.status))))return invalid();
 const directions=body?records(body.directions).map(d=>({id:required(d.id),title:required(d.title),slogan:required(d.slogan),supportingCopy:required(d.supportingCopy),creativeExplanation:required(d.creativeExplanation),rationale:required(d.rationale),differentiation:required(d.differentiation),evidenceIds:strings(d.evidenceIds)})):[];
 if(new Set(directions.map(d=>d.id)).size!==directions.length)return invalid();
 const queuedJobIds=strings(s.queuedJobIds);for(const id of queuedJobIds){const j=p.jobs.find(j=>j.id===id);if(!j||!bridgeCopyJob(p,j)||j.status!=='queued'||records(j.attempts).length)return invalid();}
 const unknownJobs=records(s.unknownJobs).map(x=>{const j=p.jobs.find(j=>j.id===x.jobId);if(!j||j.status!=='awaiting_reconciliation'||!bridgeCopyJob(p,j))return invalid();return required(x.jobId);});
 const ownerReports=records(s.ownerReports);if(!same(ownerReports,records(raw.ownerReports).filter(r=>r.edgeId===s.edgeId)))return invalid();
 for(const r of ownerReports){const j=p.jobs.find(j=>j.id===r.jobId);if(!j||!bridgeCopyJob(p,j)||r.reportHash!==await hash(r.rawReport)||r.envelopeHash!==object(e?.envelope).envelopeHash)return invalid();}
 const reports=records(s.creativeReports);if(!same(reports,records(raw.creativeReports).filter(r=>r.artifactId===s.artifactId))||!same(s.creativePanels,records(raw.creativePanels).filter(x=>object(x.packet).artifactId===s.artifactId)))return invalid();
 for(const r of reports){const j=p.jobs.find(j=>j.id===r.jobId);if(!j||!bridgeCopyJob(p,j)||!creativeReportBound(p,r)||r.reportHash!==await hash(r.rawReport))return invalid();}
 if(s.verification!==null){const r=object(s.verification),j=p.jobs.find(j=>j.id===r.jobId);if(!j||!bridgeCopyJob(p,j)||!p.textReports.verification.some(x=>same(x,r))||r.artifactId!==s.artifactId||r.contentHash!==s.contentHash)return invalid();}
 const confirmed=records(raw.decisions).some(d=>d.artifactId===strategyId&&d.kind==='adopt-creative'&&d.human===true&&d.policyVersion===p.policy.version);if(bool(s.confirmed)!==confirmed||bool(s.humanConfirmationRequired)!==p.policy.humanGates.includes('strategy'))return invalid();
 return {projectId:p.id,revision:p.revision,strategyArtifactId:strategyId,strategyHash:strategy?required(strategy.contentHash):null,current:s.current===true,available:bool(cap.available)&&bool(cap.executionAllowed),reason:required(cap.reason),strategyVerified:p.textReports.verification.some(r=>r.artifactId===strategyId&&r.contentHash===strategy?.contentHash&&r.hasBlockingFindings===false),humanConfirmationRequired:s.humanConfirmationRequired===true,confirmed,edgeId:text(s.edgeId)||null,artifactId:text(s.artifactId)||null,contentHash:text(s.contentHash)||null,title:body?required(body.title):'三方向文案',summary:body?required(body.summary):'当前尚无已保存文案原稿。',directions,gaps:body?strings(body.gaps):[],queuedJobIds,unknownJobs,ownerReports:ownerReports.map(r=>JSON.stringify(r,null,2)),verification:s.verification===null?null:JSON.stringify(s.verification,null,2),creativeReports:reports.map(r=>({id:required(r.id),phase:required(r.phase),role:required(r.role),report:JSON.stringify(r,null,2)})),creativeDecision:s.creativeDecision===null?null:JSON.stringify(s.creativeDecision,null,2),original:body?JSON.stringify(body,null,2):null};
}
