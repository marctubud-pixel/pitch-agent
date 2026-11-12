import {isDeepStrictEqual as equal} from 'node:util';
import {PRELAYOUT_PROTOCOL,PRELAYOUT_PURPOSE,prelayoutHash,validatePrelayoutInput,validatePrelayoutReport,buildPrelayoutDirectorRequest} from './proposal-prelayout-contract.mjs';
import {imageManifest} from './image-evidence.mjs';
import {isOrdinaryHttp,ordinarySuccessfulStatus,ordinaryHasContext,ordinaryOriginMatches} from './ordinary-model-claims.mjs';
export const PRELAYOUT_COMMANDS=Object.freeze(['queue-proposal-prelayout','claim-proposal-prelayout','anchor-proposal-prelayout','finish-proposal-prelayout','interrupt-proposal-prelayout']);
const need=(ok,code)=>{if(!ok)throw Object.assign(Error(code),{code});};
const text=v=>typeof v==='string'&&v.trim()&&v.length<=2000;
export const prelayoutJobId=input=>'prelayout-'+prelayoutHash([input.sourceTuple.projectId,input.sourceTupleHash]);
export const prelayoutUnknown=p=>p.jobs.filter(j=>j.purpose===PRELAYOUT_PURPOSE&&['running','awaiting_reconciliation'].includes(j.status));
export function requirePrelayoutMetadata(p,input){
 validatePrelayoutInput(input);const t=input.sourceTuple;
 need(p.workflow?.version==='proposal-seven-v1'&&['layout','final_review'].includes(p.policies.at(-1)?.authorizedThrough),'PRELAYOUT_AUTHORIZATION_REQUIRED');
 need(p.id===t.projectId&&p.activeTaskCardId===t.task.taskCardId&&prelayoutHash(p.taskCards.find(c=>c.id===p.activeTaskCardId))===t.task.taskOriginalSha256&&prelayoutHash(p.policies.at(-1))===t.policy.sha256&&p.policies.at(-1).version===t.policy.version,'PRELAYOUT_SOURCE_STALE');
 for(const [stage,source] of Object.entries(t.sources)){const a=p.artifacts.find(a=>a.id===p.activeByStage[stage]);need(a&&a.id===source.artifactId&&a.contentHash===source.sha256,'PRELAYOUT_SOURCE_STALE');}
}
export function requirePrelayoutOwner(job,attemptId,context){const a=job?.attempts?.[0];need(job?.purpose===PRELAYOUT_PURPOSE&&a&&a.id===attemptId&&job.attempts.length===1&&equal(a.executor,context),'PRELAYOUT_CLAIM_OWNER_REQUIRED');return a;}
function receiptHash(job,a){const request=buildPrelayoutDirectorRequest(job.task.prelayoutInput);return prelayoutHash({runId:a.id,model:job.binding.model,prompt:request.prompt,outputSchema:request.outputSchema,images:imageManifest(request.images,request.imageEnvelope),imageEnvelope:request.imageEnvelope});}
export function requirePrelayoutReceipt(job,a,receipt){need(isOrdinaryHttp(receipt)&&ordinarySuccessfulStatus(receipt)&&ordinaryHasContext(receipt)&&ordinaryOriginMatches(receipt,a.httpAttemptLocator,a.id)&&receipt.providerId===job.binding.providerId&&receipt.role===job.binding.role&&receipt.taskId===job.id&&receipt.attemptId===a.id&&receipt.runId===a.id&&receipt.requestedModel===job.binding.model&&receipt.model===job.binding.model&&a.dispatchStarted===true&&a.requestHash===prelayoutHash(buildPrelayoutDirectorRequest(job.task.prelayoutInput))&&receipt.inputPacketHash===receiptHash(job,a)&&typeof receipt.responseText==='string'&&['signal','reason','error'].every(k=>receipt[k]==null),'PRELAYOUT_ORIGINAL_RECEIPT_REQUIRED');}
export function reducePrelayout(p,c,context){
 const extras={'queue-proposal-prelayout':['input','nativeRequest','binding'],'claim-proposal-prelayout':['jobId','attemptId','requestHash','executionRequest'],'anchor-proposal-prelayout':['jobId','attemptId','receipt'],'finish-proposal-prelayout':['jobId','attemptId','originalText','payloadRef','contentHash'],'interrupt-proposal-prelayout':['jobId','attemptId','error']}[c.kind];need(extras&&equal(Object.keys(c).sort(),['kind','commandId','expectedRevision',...extras,...(c.kind==='finish-proposal-prelayout'&&Object.hasOwn(c,'sourceFailure')?['sourceFailure']:[])].sort()),'PRELAYOUT_COMMAND_INVALID');
 need(context.actorType==='agent'&&['actorId','runId','contextId','now'].every(k=>text(context[k]))&&Number.isFinite(Date.parse(context.now)),'PRELAYOUT_AGENT_REQUIRED');
 if(c.kind==='queue-proposal-prelayout'){
  const input=structuredClone(c.input);requirePrelayoutMetadata(p,input);need(c.nativeRequest?.projectId===p.id&&c.nativeRequest.expectedRevision===p.revision&&c.nativeRequest.taskCardId===p.activeTaskCardId&&c.nativeRequest.policyVersion===p.policies.at(-1).version&&c.nativeRequest.copyArtifactId===input.sourceTuple.sources.copy.artifactId&&c.nativeRequest.copyContentHash===input.sourceTuple.sources.copy.sha256&&c.nativeRequest.visualArtifactId===input.sourceTuple.sources.visual.artifactId&&c.nativeRequest.visualContentHash===input.sourceTuple.sources.visual.sha256&&c.nativeRequest.sourceHash===input.sourceTuple.copyEnvelopeHash,'PRELAYOUT_SOURCE_CHANGED');need(c.binding&&equal(Object.keys(c.binding).sort(),['model','providerId','role'])&&c.binding.role==='proposal-director'&&text(c.binding.model)&&text(c.binding.providerId),'PRELAYOUT_BINDING_REQUIRED');
  need(!prelayoutUnknown(p).length,'PRELAYOUT_OUTCOME_UNKNOWN');const id=prelayoutJobId(input),prior=p.jobs.find(j=>j.id===id);
  if(prior){need(equal(prior.task.prelayoutInput,input)&&equal(prior.binding,c.binding),'PRELAYOUT_ORIGINAL_JOB_CHANGED');return;}
  p.jobs.push({id,stage:'layout',purpose:PRELAYOUT_PURPOSE,status:'queued',attempts:[],inputVersionIds:[input.sourceTuple.task.taskCardId,...Object.values(input.sourceTuple.sources).map(s=>s.artifactId)],outputVersionIds:[],binding:structuredClone(c.binding),task:{id,prelayoutInput:input,nativeRequest:structuredClone(c.nativeRequest)}});return;
 }
 const j=p.jobs.find(j=>j.id===c.jobId);need(j?.purpose===PRELAYOUT_PURPOSE&&j.stage==='layout'&&j.id===prelayoutJobId(j.task.prelayoutInput),'PRELAYOUT_JOB_REQUIRED');
 if(c.kind==='claim-proposal-prelayout'){
  requirePrelayoutMetadata(p,j.task.prelayoutInput);need(j.status==='queued'&&j.attempts.length===0&&!prelayoutUnknown(p).length&&typeof c.attemptId==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(c.attemptId)&&!p.jobs.some(j=>j.attempts?.some(a=>a.id===c.attemptId)),'PRELAYOUT_ALREADY_CLAIMED');
  need(c.executionRequest&&equal(Object.keys(c.executionRequest).sort(),['commandId','expectedRevision','jobId','projectId'])&&c.executionRequest.projectId===p.id&&c.executionRequest.jobId===j.id&&c.executionRequest.commandId===c.commandId&&c.executionRequest.expectedRevision===p.revision,'PRELAYOUT_EXECUTION_REQUEST_INVALID');
  need(c.requestHash===prelayoutHash(buildPrelayoutDirectorRequest(j.task.prelayoutInput)),'PRELAYOUT_REQUEST_CHANGED');
  j.status='running';j.attemptId=c.attemptId;j.attempts.push({id:c.attemptId,status:'running',executor:structuredClone(context),startedAt:context.now,dispatchStarted:true,requestHash:c.requestHash,executionRequest:structuredClone(c.executionRequest)});return;
 }
 const a=requirePrelayoutOwner(j,c.attemptId,context);need(['running','awaiting_reconciliation'].includes(j.status),'PRELAYOUT_ORIGINAL_ATTEMPT_REQUIRED');
 if(c.kind==='interrupt-proposal-prelayout'){need(c.error&&text(c.error.code)&&text(c.error.message),'PRELAYOUT_ERROR_REQUIRED');j.status=a.status='awaiting_reconciliation';j.error=structuredClone(c.error);return;}
 if(c.kind==='anchor-proposal-prelayout'){requirePrelayoutReceipt(j,a,c.receipt);need(!a.receipt||equal(a.receipt,c.receipt),'PRELAYOUT_RECEIPT_CHANGED');a.receipt=structuredClone(c.receipt);return;}
 need(c.kind==='finish-proposal-prelayout','PRELAYOUT_COMMAND_INVALID');requirePrelayoutReceipt(j,a,a.receipt);
 need(c.originalText===a.receipt.responseText&&prelayoutHash(c.originalText)===c.contentHash&&text(c.payloadRef),'PRELAYOUT_REPORT_BYTES_CHANGED');
 let report=null,invalid=null;try{report=validatePrelayoutReport(JSON.parse(c.originalText),j.task.prelayoutInput);}catch(e){invalid=e.code??'PRELAYOUT_REPORT_INVALID';}
 let current=!c.sourceFailure;if(c.sourceFailure)need(equal(Object.keys(c.sourceFailure),['code'])&&text(c.sourceFailure.code),'PRELAYOUT_SOURCE_FAILURE_INVALID');try{requirePrelayoutMetadata(p,j.task.prelayoutInput);}catch{current=false;}
 j.status=a.status=current?'succeeded':'succeeded_stale';delete j.error;
 const id='prelayout-report-'+prelayoutHash([p.id,j.id,a.id]);need(!p.artifacts.some(x=>x.id===id),'PRELAYOUT_REPORT_ALREADY_SAVED');
 j.prelayoutReport={id,payloadRef:c.payloadRef,contentHash:c.contentHash,sourceTupleHash:j.task.prelayoutInput.sourceTupleHash,baseInputSha256:j.task.prelayoutInput.baseInputSha256,...(c.sourceFailure?{sourceFailure:structuredClone(c.sourceFailure)}:{}),status:!current?'stale':invalid?'invalid_report':report.decision==='clear'?'clear':report.decision==='return'?'returned':'unresolved',diagnostic:invalid};j.outputVersionIds=[id];
 p.artifacts.push({id,stage:'layout',provenance:'proposal-prelayout-director-report-v1',inputVersionIds:structuredClone(j.inputVersionIds),contentHash:c.contentHash,payloadRef:c.payloadRef,author:structuredClone(context),executionReceipt:structuredClone(a.receipt),claims:[],technicalReceipts:{},proposalPrelayout:{protocol:PRELAYOUT_PROTOCOL,jobId:j.id,attemptId:a.id,sourceTupleHash:j.task.prelayoutInput.sourceTupleHash,baseInputSha256:j.task.prelayoutInput.baseInputSha256,requestHash:a.requestHash}});
 // No activeByStage.layout, release, content_review or approval record is created.
}
