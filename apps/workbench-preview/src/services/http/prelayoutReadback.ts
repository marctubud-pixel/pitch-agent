import type {PrelayoutReadRecord,PrelayoutAttemptRecord} from '../../domain/prelayoutRead';
import {ServiceError} from '../../domain/service';
import {object,records,type Snapshot} from './dto';
import {sameAcquisitionValue as same} from './researchAcquisitionProjection';
import {sha256} from './sha256';
import {ordinarySuccess,ordinaryOriginMatches} from './sketch-contracts/ordinary.generated.mjs';
import {metadataDirectorRequest} from './prelayout-template.generated.mjs';

const PURPOSE='proposal_prelayout_check',PROTOCOL='proposal-prelayout-v1';
const SOURCE_STAGES=['research','strategy','copy','visual'];
const INPUT_KEYS=['protocol','sourceTuple','sourceTupleHash','baseInputSha256','baseProjectionSha256','directorMethod','originals','taskContainer','baseImages','images','knownLimitations','carriedLimitationsHash','imageEnvelope'];
export interface PrelayoutReadScope {jobs:Set<Record<string,unknown>>;artifacts:Set<Record<string,unknown>>;records:PrelayoutReadRecord[];physicalOriginalsVerified:false;executionEligible:false}
function bad():never {throw new ServiceError('validation','排版前检查记录未绑定原任务、原请求或报告；请保留原记录核对。');}
function need(condition:unknown):asserts condition {if(!condition)bad();}
function fields(value:Record<string,unknown>,keys:string[]):void {need(same(Object.keys(value).sort(),keys.slice().sort()));}
function required(value:unknown,max=2048):string {need(typeof value==='string'&&value.trim()&&value.length<=max);return value;}
function digest(value:unknown):string {const text=required(value,64);need(/^[a-f0-9]{64}$/.test(text));return text;}
function hash(value:unknown):string {const json=JSON.stringify(value);need(typeof json==='string');return sha256(json);}
function json(value:unknown):Record<string,unknown> {try{return object(JSON.parse(required(value,32*1024*1024)));}catch{return bad();}}
function original(value:unknown):Record<string,unknown> {
  const body=object(value);fields(body,['identity','sha256','bytes','originalText']);required(body.identity);
  const text=required(body.originalText,32*1024*1024);need(new TextEncoder().encode(text).length===body.bytes&&sha256(text)===digest(body.sha256));return json(text);
}
function commands(p:Snapshot):Record<string,unknown>[] {return Object.values(p.processedCommands).map(value=>json(value));}
function witnessed(p:Snapshot,command:Record<string,unknown>,owner?:Record<string,unknown>):void {
  const events=p.audit.filter(a=>a.commandId===command.commandId&&a.kind===command.kind);
  need(events.length===1&&events[0].revision<=p.revision);
  if(owner)need(events[0].actorId===owner.actorId&&events[0].at===owner.now);
}
function one(values:Record<string,unknown>[]):Record<string,unknown> {need(values.length===1);return values[0];}
function reportBody(text:string,input:Record<string,unknown>):{modelDecision:'clear'|'return'|'unknown';summary:string} {
  const report=json(text);fields(report,['protocol','sourceTupleHash','baseInputSha256','decision','summary','newIssues','carriedLimitationsHash']);
  const decision=report.decision;need(report.protocol===PROTOCOL&&report.sourceTupleHash===input.sourceTupleHash&&report.baseInputSha256===input.baseInputSha256&&report.carriedLimitationsHash===input.carriedLimitationsHash&&(decision==='clear'||decision==='return'||decision==='unknown'));
  const issues=records(report.newIssues);need(Array.isArray(report.newIssues)&&issues.length<=12&&(decision!=='clear'||issues.length===0)&&(decision!=='return'||issues.length>0));
  const ids=new Set<string>();for(const issue of issues){
    fields(issue,['id','category','owner','observation','references']);const id=required(issue.id,80);need(!ids.has(id));ids.add(id);required(issue.observation,2000);
    need(['new_fact_conflict','version_mismatch','missing_required_item'].includes(required(issue.category))&&['brief_owner','research_owner','strategy_owner','copy_owner','visual_owner','layout_owner'].includes(required(issue.owner)));
    const refs=records(issue.references);need(Array.isArray(issue.references)&&refs.length>0&&refs.length<=6);
    for(const ref of refs){fields(ref,['stage','pointer','quote','sourceSha256']);const stage=required(ref.stage),source=object(stage==='task'?input.taskContainer:object(input.originals)[stage]);need(ref.sourceSha256===source.sha256);
      const pointer=required(ref.pointer),quote=required(ref.quote,4000);need(pointer.startsWith('/')&&!/~(?![01])/u.test(pointer));let leaf:unknown=json(source.originalText);
      for(const part of pointer.slice(1).split('/')){need(leaf&&typeof leaf==='object');const node=Object.fromEntries(Object.entries(leaf)),key=part.replaceAll('~1','/').replaceAll('~0','~');need(Object.hasOwn(node,key));leaf=node[key];}need(typeof leaf==='string'&&leaf.includes(quote));
    }
  }
  return {modelDecision:decision,summary:required(report.summary,2000)};
}
/** Metadata identities from this one canonical response. No native IO/approval qualification is performed. */
export function prelayoutReadScope(p:Snapshot):PrelayoutReadScope {
  const scope:PrelayoutReadScope={jobs:new Set(),artifacts:new Set(),records:[],physicalOriginalsVerified:false,executionEligible:false};
  const jobs=p.jobs.filter(j=>j.purpose===PURPOSE);if(!jobs.length)return scope;
  need(p.workflowVersion==='proposal-seven-v1'&&p.native&&same(p.jobs,p.native.jobs)&&same(p.artifacts,p.native.artifacts));
  const raw=p.native,ledger=commands(p);need(new Set(p.jobs.map(j=>j.id)).size===p.jobs.length&&new Set(p.artifacts.map(a=>a.id)).size===p.artifacts.length);
  for(const job of jobs){
    need(job.stage==='layout');const task=object(job.task),input=object(task.prelayoutInput),tuple=object(input.sourceTuple),identity=object(tuple.task),policy=object(tuple.policy),sources=object(tuple.sources),binding=object(job.binding),method=object(input.directorMethod);
    fields(task,['id','prelayoutInput','nativeRequest']);fields(input,INPUT_KEYS);fields(tuple,['protocol','projectId','databaseBindingHash','task','policy','sources','methods','semantic','copyEnvelopeHash','bSourceHash','bPlanHash','directionIds','typedViews','targetImages','baseInputSha256','baseProjectionSha256']);fields(identity,['taskCardId','taskOriginalSha256','briefSha256']);fields(policy,['version','sha256']);
    need(input.protocol===PROTOCOL&&tuple.protocol==='proposal-prelayout-source-v1'&&tuple.projectId===p.id&&hash(tuple)===digest(input.sourceTupleHash)&&tuple.baseInputSha256===digest(input.baseInputSha256)&&tuple.baseProjectionSha256===digest(input.baseProjectionSha256));
    need(job.id==='prelayout-'+hash([p.id,input.sourceTupleHash])&&task.id===job.id);
    fields(binding,['providerId','model','role']);required(binding.providerId);required(binding.model);need(binding.role==='proposal-director');
    const card=one(p.cards.filter(c=>c.id===identity.taskCardId).map(c=>object(c.original))),container=original(input.taskContainer),originals=object(input.originals);fields(originals,['brief',...SOURCE_STAGES]);
    need(same(card,container)&&hash(card)===identity.taskOriginalSha256&&card.brief===object(originals.brief).originalText&&object(originals.brief).sha256===identity.briefSha256);original(originals.brief);
    fields(sources,SOURCE_STAGES);const inputs:Record<string,unknown>[]=[];
    for(const stage of SOURCE_STAGES){const source=object(sources[stage]),body=object(originals[stage]);fields(source,['artifactId','sha256']);original(body);need(body.sha256===source.sha256);const artifact=one(p.artifacts.filter(a=>a.id===source.artifactId&&a.stage===stage&&a.contentHash===source.sha256));inputs.push(artifact);}
    need(records(raw.policies).some(candidate=>candidate.version===policy.version&&hash(candidate)===policy.sha256));
    fields(method,['path','version','sha256','originalText']);need(method.path==='docs/agents/proposal-director.md'&&sha256(required(method.originalText,1024*1024))===digest(method.sha256)&&same(object(tuple.methods).director,{path:method.path,version:method.version,sha256:method.sha256}));
    need(Array.isArray(input.knownLimitations)&&hash(input.knownLimitations)===input.carriedLimitationsHash&&Array.isArray(input.images)&&records(input.images).length>0&&records(input.images).length<=32);
    const targets=records(tuple.targetImages),images=records(input.images);need(same(images,targets.map(i=>({imageId:i.imageId,sha256:i.sha256,mediaType:i.mediaType,byteLength:i.bytes,width:i.width,height:i.height}))));
    need(same(records(input.baseImages).map(({originalLocator:_l,visualArtifactId:_a,visualContentHash:_h,...image})=>image),targets));
    need(same(input.imageEnvelope,{operation:PROTOCOL,limits:{maxImages:32,maxBytes:32*1024*1024,maxPixels:80_000_000}}));
    for(const image of images){digest(image.sha256);required(image.imageId);need(['image/png','image/jpeg'].includes(required(image.mediaType))&&Number.isSafeInteger(image.byteLength)&&Number(image.byteLength)>0&&Number(image.byteLength)<=8*1024*1024&&Number.isSafeInteger(image.width)&&Number(image.width)>0&&Number.isSafeInteger(image.height)&&Number(image.height)>0);}
    const native=object(task.nativeRequest);fields(native,['projectId','expectedRevision','taskCardId','policyVersion','copyArtifactId','copyContentHash','sourceHash','visualArtifactId','visualContentHash']);need(native.projectId===p.id&&native.taskCardId===card.id&&native.policyVersion===policy.version&&native.copyArtifactId===object(sources.copy).artifactId&&native.copyContentHash===object(sources.copy).sha256&&native.visualArtifactId===object(sources.visual).artifactId&&native.visualContentHash===object(sources.visual).sha256&&native.sourceHash===tuple.copyEnvelopeHash);
    need(same(job.inputVersionIds,[card.id,...Object.values(sources).map(s=>object(s).artifactId)]));
    const queued=one(ledger.filter(c=>c.kind==='queue-proposal-prelayout'&&same(c.input,input)&&same(c.nativeRequest,native)&&same(c.binding,binding)));witnessed(p,queued);need(Number.isSafeInteger(native.expectedRevision)&&Number(native.expectedRevision)>=0&&p.audit.some(event=>event.commandId===queued.commandId&&event.kind==='queue-proposal-prelayout'&&event.revision===Number(native.expectedRevision)+1));
    const relation=p.activeTaskCardId===card.id&&hash(records(raw.policies).at(-1))===policy.sha256&&SOURCE_STAGES.every(stage=>object(raw.activeByStage)[stage]===object(sources[stage]).artifactId)?'same_inputs':'historical_inputs';
    const base={jobId:required(job.id),projectId:p.id,taskCardId:required(card.id),sourceTupleHash:digest(input.sourceTupleHash),baseInputSha256:digest(input.baseInputSha256),relation,physicalOriginalsVerified:false,executionEligible:false,humanApproval:false,finalReviewApproval:false,method:{version:required(method.version),sha256:digest(method.sha256)}} satisfies Omit<PrelayoutReadRecord,'kind'|'status'|'attempt'|'report'>;
    const attempts=records(job.attempts);need(Array.isArray(job.attempts));let record:PrelayoutReadRecord;
    if(job.status==='queued'){need(attempts.length===0&&job.attemptId===undefined&&job.prelayoutReport===undefined&&same(job.outputVersionIds,[]));record={...base,kind:'queued',status:'queued',attempt:null,report:null};}
    else {
      need(attempts.length===1);const attempt=attempts[0],status=job.status,owner=object(attempt.executor),execution=object(attempt.executionRequest),request=metadataDirectorRequest(input);
      need((status==='running'||status==='awaiting_reconciliation'||status==='succeeded'||status==='succeeded_stale')&&attempt.status===status&&job.attemptId===attempt.id&&attempt.dispatchStarted===true&&attempt.startedAt===owner.now&&owner.actorType==='agent'&&Number.isFinite(Date.parse(required(owner.now))));
      for(const key of ['actorId','runId','contextId'])required(owner[key]);fields(execution,['projectId','jobId','commandId','expectedRevision']);need(execution.projectId===p.id&&execution.jobId===job.id&&Number.isSafeInteger(execution.expectedRevision)&&Number(execution.expectedRevision)>=0&&attempt.requestHash===hash(request));
      const claim=one(ledger.filter(c=>c.kind==='claim-proposal-prelayout'&&c.commandId===execution.commandId&&c.jobId===job.id&&c.attemptId===attempt.id&&c.requestHash===attempt.requestHash&&same(c.executionRequest,execution)));witnessed(p,claim,owner);need(p.audit.some(a=>a.commandId===claim.commandId&&a.revision===Number(execution.expectedRevision)+1));
      if(attempt.httpAttemptLocator!==undefined)need(ordinaryOriginMatches(null,attempt.httpAttemptLocator,required(attempt.id)));
      if(attempt.receipt!==undefined){const receipt=object(attempt.receipt),packet={protocol:'proposal-prelayout-runtime-v1',purpose:PURPOSE,projectId:p.id,jobId:job.id,attemptId:attempt.id,binding,input,request};need(receipt.provider==='workbench-model-http-v1'&&attempt.httpAttemptLocator&&ordinarySuccess(receipt)&&ordinaryOriginMatches(receipt,attempt.httpAttemptLocator,required(attempt.id))&&receipt.providerId===binding.providerId&&receipt.role===binding.role&&receipt.model===binding.model&&receipt.requestedModel===binding.model&&receipt.taskId===job.id&&receipt.attemptId===attempt.id&&receipt.runId===attempt.id&&receipt.runtimePacketHash===hash(packet)&&receipt.inputPacketHash===hash({runId:attempt.id,model:binding.model,prompt:request.prompt,outputSchema:request.outputSchema,images:images.map(({width:_w,height:_h,...i})=>i),imageEnvelope:request.imageEnvelope}));}
      const error=job.error===undefined?null:object(job.error),displayAttempt:PrelayoutAttemptRecord={id:required(attempt.id),status,startedAt:required(attempt.startedAt),actorId:required(owner.actorId),requestHash:digest(attempt.requestHash),error:error?{code:required(error.code),message:required(error.message)}:null};
      if(status==='running'||status==='awaiting_reconciliation'){
        need(job.prelayoutReport===undefined&&same(job.outputVersionIds,[]));if(status==='awaiting_reconciliation'){need(error);const stopped=one(ledger.filter(c=>c.kind==='interrupt-proposal-prelayout'&&c.jobId===job.id&&c.attemptId===attempt.id&&same(c.error,error)));witnessed(p,stopped,owner);}record={...base,kind:'attempt',status,attempt:displayAttempt,report:null};
      }else {
        const report=object(job.prelayoutReport),artifact=one(p.artifacts.filter(a=>a.id===report.id)),receipt=object(attempt.receipt),text=required(receipt.responseText,1024*1024),reportStatus=report.status;
        need((reportStatus==='clear'||reportStatus==='returned'||reportStatus==='unresolved'||reportStatus==='invalid_report'||reportStatus==='stale')&&(status!=='succeeded_stale'||reportStatus==='stale')&&report.id==='prelayout-report-'+hash([p.id,job.id,attempt.id])&&report.sourceTupleHash===input.sourceTupleHash&&report.baseInputSha256===input.baseInputSha256&&report.contentHash===sha256(text)&&same(job.outputVersionIds,[report.id]));
        need(artifact.stage==='layout'&&artifact.provenance==='proposal-prelayout-director-report-v1'&&same(artifact.inputVersionIds,job.inputVersionIds)&&artifact.contentHash===report.contentHash&&artifact.payloadRef===report.payloadRef&&same(artifact.author,owner)&&same(artifact.executionReceipt,receipt)&&same(artifact.claims,[])&&same(artifact.technicalReceipts,{})&&same(artifact.proposalPrelayout,{protocol:PROTOCOL,jobId:job.id,attemptId:attempt.id,sourceTupleHash:input.sourceTupleHash,baseInputSha256:input.baseInputSha256,requestHash:attempt.requestHash}));
        const finish=one(ledger.filter(c=>c.kind==='finish-proposal-prelayout'&&c.jobId===job.id&&c.attemptId===attempt.id&&c.originalText===text&&c.contentHash===report.contentHash&&c.payloadRef===report.payloadRef));witnessed(p,finish,owner);
        let body:{modelDecision:'clear'|'return'|'unknown'|null;summary:string|null}={modelDecision:null,summary:null};try{body=reportBody(text,input);}catch{need(reportStatus==='invalid_report'||reportStatus==='stale');}
        need(reportStatus==='invalid_report'||reportStatus==='stale'||reportStatus===(body.modelDecision==='clear'?'clear':body.modelDecision==='return'?'returned':'unresolved'));
        scope.artifacts.add(artifact);record={...base,kind:'reported',status,attempt:displayAttempt,report:{id:required(report.id),status:reportStatus,sha256:digest(report.contentHash),originalText:text,...body}};
      }
    }
    for(const artifact of inputs)scope.artifacts.add(artifact);scope.jobs.add(job);scope.records.push(record);
  }
  return scope;
}
