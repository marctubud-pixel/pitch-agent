import {SIMPLE_STRATEGY,type SimpleStrategyContent,type SimpleStrategyWorkspace,type StrategyPoint} from '../../domain/simpleStrategy';
import {ServiceError} from '../../domain/service';
import {object,records,text,integer,type Snapshot} from './dto';
import {originalHash} from './intakeProjection';
import {sameAcquisitionValue as same} from './researchAcquisitionProjection';
const invalid=():never=>{throw new ServiceError('response_lost','策略响应未绑定原研究放行、原任务或原件，请保留原请求核对。',{outcomeUnknown:true,retryable:true});};
const digest=(value:unknown)=>originalHash(new TextEncoder().encode(JSON.stringify(value)));
function required(v:unknown):string{if(typeof v!=='string'||!v.trim())return invalid();return v;}
function list(v:unknown):string[]{if(!Array.isArray(v)||v.length>100||v.some(x=>typeof x!=='string'))return invalid();return v;}
function exact(value:Record<string,unknown>,keys:string[]):void{if(Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)))return invalid();}
function strategyProducer(p:Snapshot,id:unknown){return p.jobs.find(j=>j.id===id&&j.stage==='strategy'&&object(j.task).strategyContractVersion===SIMPLE_STRATEGY);}
export function bridgeSimpleJob(p:Snapshot,job:Record<string,unknown>):boolean{
 if(p.workflowVersion!=='proposal-seven-v1'||job.stage!=='strategy')return false;
 const task=object(job.task),verification=job.purpose==='verification';
 const producer=verification?p.jobs.find(j=>Array.isArray(j.outputVersionIds)&&j.outputVersionIds.includes(job.targetArtifactId)):job;
 if(!producer||object(producer.task).strategyContractVersion!==SIMPLE_STRATEGY)return false;
 const basis=object(object(producer.task).strategyBasis),handoff=object(basis.handoff);
 if(basis.version!==SIMPLE_STRATEGY||basis.projectId!==p.id||!p.cards.some(c=>c.id===basis.taskCardId)||!p.artifacts.some(a=>a.id===basis.researchArtifactId&&a.stage==='research')||!same(handoff.binding,producer.binding))return false;
 const intent=p.continuationIntents?.find(i=>i.jobId===producer.id&&i.artifactId===basis.researchArtifactId&&same(i.binding,producer.binding));
 const release=p.releases.find(r=>r.id===intent?.releaseId&&r.artifactId===basis.researchArtifactId);
 if(!intent||!release||!same(object(handoff.policy).version,object(intent.request).policyVersion))return false;
 const origin=p.simpleStrategyRequests?.find(r=>r.operation==='continue'&&r.jobId===producer.id&&object(r.request).artifactId===basis.researchArtifactId&&same(r.binding,producer.binding));
 if(!origin||!same(origin.request,intent.request))return false;
 const command=Object.values(p.processedCommands).some(x=>{try{const c=object(JSON.parse(text(x)));return c.kind==='simple-strategy-http-request'&&c.operation==='continue'&&c.jobId===producer.id&&same(c.request,origin.request);}catch{return false;}});
 if(!command)return false;
 if(verification&&!p.simpleStrategyRequests?.some(r=>r.operation==='verify'&&r.jobId===job.id&&object(r.request).artifactId===job.targetArtifactId&&same(r.binding,job.binding)))return false;
 return !verification||object(task.verificationInput).artifactId===job.targetArtifactId;
}
function pointer(source:string,location:string):unknown{
 let value:unknown;try{value=JSON.parse(source);}catch{value={text:source};}
 if(!location.startsWith('/')||/~(?![01])/u.test(location))return undefined;
 for(const part of location.slice(1).split('/')){const key=part.replaceAll('~1','/').replaceAll('~0','~');if(!value||typeof value!=='object'||!Object.hasOwn(value,key))return undefined;value=Object.fromEntries(Object.entries(value))[key];}return value;
}
function point(value:unknown,basis:Record<string,unknown>,ids:Set<string>):StrategyPoint{
 const p=object(value);exact(p,['id','text','kind','refs','limitations']);const id=required(p.id),kind=['fact','requirement','inference','assumption'].find(k=>k===p.kind);if(ids.has(id)||!kind)return invalid();ids.add(id);
 const refs=records(p.refs).map(r=>{exact(r,['sourceId','location','quote']);const source=records(basis.sources).find(s=>s.id===r.sourceId),quote=required(r.quote),location=required(r.location),leaf=source?pointer(required(source.contentText),location):undefined;
 if(!source||typeof leaf!=='string'||!leaf.includes(quote)||kind==='fact'&&source.nature!=='fact'||kind==='requirement'&&source.nature!=='requirement')return invalid();return {sourceId:required(r.sourceId),location,quote};});
 const limitations=list(p.limitations);if(kind==='assumption'?!limitations.length:!refs.length)return invalid();
 if(kind==='fact'||kind==='requirement'||kind==='inference'||kind==='assumption')return {id,text:required(p.text),kind,refs,limitations};return invalid();
}
async function content(value:unknown,basis:Record<string,unknown>,hash:unknown):Promise<SimpleStrategyContent>{
 const c=object(value),s=object(c.strategy);exact(c,['strategyContractVersion','strategyBasisHash','outputKind','status','title','summary','strategy','gaps','limitations']);exact(s,['researchConclusions','intersection','focus']);
 if(c.strategyContractVersion!==SIMPLE_STRATEGY||c.strategyBasisHash!==basis.basisHash||c.outputKind!=='strategy'||!['complete','blocked'].includes(text(c.status))||await originalHash(new TextEncoder().encode(JSON.stringify(c,null,2)))!==hash)return invalid();
 const ids=new Set<string>(),researchConclusions=records(s.researchConclusions).map(p=>point(p,basis,ids)),intersection=s.intersection===null?null:point(s.intersection,basis,ids),focus=s.focus===null?null:point(s.focus,basis,ids),gaps=list(c.gaps),limitations=list(c.limitations);
 if(list(basis.limitations).some(l=>!limitations.includes(l))||c.status==='complete'&&(!researchConclusions.length||!intersection||!focus||gaps.length)||c.status==='blocked'&&!gaps.length)return invalid();
 return {strategyContractVersion:SIMPLE_STRATEGY,strategyBasisHash:required(c.strategyBasisHash),outputKind:'strategy',status:c.status==='complete'?'complete':'blocked',title:required(c.title),summary:required(c.summary),strategy:{researchConclusions,intersection,focus},gaps,limitations};
}
export async function simpleStrategyState(value:unknown,p:Snapshot):Promise<SimpleStrategyWorkspace>{
 const root=object(value),s=object(root.strategy),cap=object(root.capability),raw=object(root.project),workflow=p.researchWorkflow??{};
 if(root.revision!==p.revision||s.protocolVersion!=='simple-strategy-workspace-v1'||cap.protocolVersion!==SIMPLE_STRATEGY||typeof cap.configured!=='boolean'||typeof cap.executionAllowed!=='boolean'||typeof cap.available!=='boolean'||cap.available===true&&cap.executionAllowed!==true||typeof s.current!=='boolean'||s.taskCardId!==p.activeTaskCardId||s.policyVersion!==p.policy.version||s.researchArtifactId!==(p.stages.find(x=>x.stage==='research')?.activeArtifactId??null))return invalid();
 const producer=s.producerJobId?strategyProducer(p,s.producerJobId):undefined,basis=producer?object(object(producer.task).strategyBasis):null,artifact=s.artifactId?p.artifacts.find(a=>a.id===s.artifactId&&a.stage==='strategy'):undefined;
 const outputIds=producer?.outputVersionIds;
 if(s.producerJobId&&(!producer||!bridgeSimpleJob(p,producer)||producer.status!==s.producerStatus||records(producer.attempts).length!==s.attemptCount)||s.artifactId&&(!artifact||!Array.isArray(outputIds)||!outputIds.includes(s.artifactId)||artifact.contentHash!==s.contentHash||object(artifact.strategyContract).version!==SIMPLE_STRATEGY))return invalid();
 if(Boolean(artifact)!==(s.content!==null))return invalid();
 if(basis){const {basisHash,...data}=basis;if(basisHash!==await digest(data))return invalid();const intent=p.continuationIntents?.find(i=>i.jobId===producer?.id);if(!intent||producer?.id!==`job-${await digest([p.id,`research-continuation-${intent.releaseId}`])}`)return invalid();for(const source of records(basis.sources))if(await originalHash(new TextEncoder().encode(required(source.contentText)))!==source.contentHash)return invalid();}
 if(s.current){
  if(!producer||!basis)return invalid();const row=p.simpleStrategyRequests?.find(r=>r.operation==='continue'&&r.jobId===producer.id),snapshot=row?object(row.snapshot):null;
  const card=p.cards.find(c=>c.id===p.activeTaskCardId)?.original,policy=records(raw.policies).at(-1),questions=p.readerPlans?.filter(q=>q.taskCardId===p.activeTaskCardId).at(-1),release=p.releases.filter(r=>r.artifactId===s.researchArtifactId).at(-1);
  const handoff=object(basis.handoff),frozenResearch=records(handoff.research).find(r=>r.artifactId===s.researchArtifactId),frozenAuthority=frozenResearch?object(frozenResearch.authority):null;
  if(!frozenResearch||!same(frozenResearch.artifact,p.artifacts.find(a=>a.id===s.researchArtifactId))||!same(handoff.taskCard,card)||!same(handoff.policy,policy)||!same(handoff.confirmations,records(raw.confirmations).filter(c=>c.taskCardId===p.activeTaskCardId)))return invalid();
  if(!frozenAuthority||Object.entries(frozenAuthority).some(([key,items])=>!same(items,records(raw[key]).filter(r=>r.artifactId===s.researchArtifactId))))return invalid();
  if(!snapshot||basis.taskCardId!==p.activeTaskCardId||basis.researchArtifactId!==s.researchArtifactId||!same(snapshot,{card,policy,researchId:s.researchArtifactId,questions,release})||!release||release.policyVersion!==p.policy.version)return invalid();
 }
 const parsed=s.content===null?null:basis&&artifact?await content(s.content,basis,s.contentHash):invalid();
 const history=records(s.history).map(a=>{if(!p.artifacts.some(x=>x.id===a.artifactId&&x.contentHash===a.contentHash&&object(x.strategyContract).version===SIMPLE_STRATEGY))return invalid();return {artifactId:required(a.artifactId),contentHash:required(a.contentHash)};});
 let verification:SimpleStrategyWorkspace['verification']=null;
 if(s.verification!==null){const r=object(s.verification),saved=p.textReports.verification.find(x=>x.id===r.id),job=p.jobs.find(j=>j.id===r.jobId);if(!saved||!same(saved,r)||r.artifactId!==s.artifactId||r.contentHash!==s.contentHash||typeof r.hasBlockingFindings!=='boolean'||!job||!bridgeSimpleJob(p,job))return invalid();verification={id:required(r.id),hasBlockingFindings:r.hasBlockingFindings,report:JSON.stringify(r.rawReport,null,2)};}
 const unknownJobs=records(s.unknownJobs).map(j=>{if(!p.jobs.some(x=>x.id===j.jobId&&x.status==='awaiting_reconciliation'&&bridgeSimpleJob(p,x)))return invalid();return {jobId:required(j.jobId),purpose:required(j.purpose)};});
 const canContinue=cap.available===true&&workflow.eligible===true&&typeof workflow.currentReleaseId==='string'&&p.releases.some(r=>r.id===workflow.currentReleaseId&&r.artifactId===s.researchArtifactId&&r.policyVersion===p.policy.version)&&p.policy.authorizedThrough!=='research'&&!producer;
 return {projectId:p.id,revision:integer(root.revision),taskCardId:required(s.taskCardId),researchArtifactId:text(s.researchArtifactId)||null,policyVersion:integer(s.policyVersion),producerJobId:text(s.producerJobId)||null,producerStatus:text(s.producerStatus)||null,artifactId:text(s.artifactId)||null,contentHash:text(s.contentHash)||null,content:parsed,current:s.current,available:cap.available,reason:required(cap.reason),canContinue,continueReason:canContinue?'':text(workflow.summary)||'当前研究尚未获本版放行或策略执行未授权。',history,verification,unknownJobs};
}
export function simpleStrategyReceipt(value:unknown,p:Snapshot,body:Record<string,unknown>,path:string):boolean{
 const root=object(value),receipt=object(root.receipt),operation=path.split('/').at(-1),row=p.simpleStrategyRequests?.find(r=>object(r.request).commandId===body.commandId),job=p.jobs.find(j=>j.id===receipt.jobId);
 if(!row||row.operation!==operation||!same(row.request,body)||receipt.commandId!==body.commandId||receipt.operation!==operation||typeof receipt.replayed!=='boolean'||receipt.jobId!==row.jobId||!job||!bridgeSimpleJob(p,job)||!same(row.binding,job.binding)||['queued','running'].includes(text(job.status)))return invalid();
 if(operation==='verify'&&!same(object(job.task).request,{purpose:'verification',artifactId:body.artifactId,commandId:body.commandId,expectedRevision:body.expectedRevision}))return invalid();
 const command=Object.values(p.processedCommands).map(x=>{try{return object(JSON.parse(text(x)));}catch{return {};}}).find(c=>c.kind==='simple-strategy-http-request'&&same(c.request,body));
 if(!command||command.jobId!==job.id||command.operation!==operation)return invalid();return object(root.strategy).current!==true;
}
