import {isDeepStrictEqual as equal} from 'node:util';
import {applyCommand} from './project.mjs';
import {decisionHash,proveDecisionPlan} from './local-decision-plan.mjs';
import {contributionInput} from './local-contribution-protocol.mjs';
const need=(v,code)=>{if(!v)throw Object.assign(Error(code),{code,status:409});};
export function contributionRevisionQueueProof(intent,store){
 need(intent.contributionPlan&&intent.continuation?.protocol==='local-contribution-continuation-v1'&&intent.continuation.steps[0].kind==='enqueue_revision','LOCAL_CONTRIBUTION_CONTINUATION_REQUIRED');
 const request=intent.continuation.steps[0].request,current=store.read(intent.projectId),afterFeedback=store.read(intent.projectId,intent.before.revision+1),historical={read:(id,revision)=>revision===undefined?afterFeedback:store.read(id,revision)};
 need(proveDecisionPlan(intent,historical).status==='committed','LOCAL_CONTRIBUTION_FEEDBACK_NOT_PROVEN');
 need(request.artifactId===intent.contributionPlan.sourcePins.artifactId&&request.commandId===intent.contributionPlan.proposal.commandId+'-revision'&&request.expectedRevision===afterFeedback.revision,'LOCAL_CONTRIBUTION_REVISION_REQUEST_CHANGED');
 if(!Object.hasOwn(current.processedCommands,request.commandId)){need(equal(current,afterFeedback),'LOCAL_CONTRIBUTION_REVISION_SOURCE_CHANGED');return {status:'not_queued',request};}
 const command=JSON.parse(current.processedCommands[request.commandId]),jobId='job-'+decisionHash([intent.projectId,request.commandId]),job=current.jobs.find(j=>j.id===jobId),audit=current.audit.find(a=>a.commandId===request.commandId);
 const protocol=job?.task?contributionInput(job.task):null;
 need(command.kind==='request-stage'&&command.stage===intent.request.module&&command.jobId===jobId&&equal(command.task?.revisionRequest,request)&&job?.status==='queued'&&job.attempts.length===0&&protocol?.input.revisionOf?.artifactId===request.artifactId&&protocol.feedback.some(f=>f.id===intent.contributionPlan.proposal.feedbackId)&&audit?.revision===afterFeedback.revision+1&&audit.actorId==='proposal-director','LOCAL_CONTRIBUTION_REVISION_QUEUE_CHANGED');
 const expected=applyCommand(afterFeedback,{...command,expectedRevision:afterFeedback.revision},{actorType:'agent',actorId:'proposal-director',runId:'queue-proof-only',contextId:'queue-proof-only',now:audit.at}),actual=store.read(intent.projectId,audit.revision);
 need(equal(actual,expected)&&equal(current,actual),'LOCAL_CONTRIBUTION_REVISION_QUEUE_CHANGED');
 return {status:'revision_queued',request,jobId,revision:actual.revision,disposition:'pending_review',factualAuthority:false,semanticReviewVerified:false};
}
