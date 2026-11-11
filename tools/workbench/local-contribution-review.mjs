import {verifyCopyDirectionRewrite} from './copy-direction-target.mjs';
import {contributionInput} from './local-contribution-protocol.mjs';
import {validateCorrectionReviewOutput} from './correction.mjs';
import {LATEST_CORRECTION_PROTOCOL} from './correction-evidence.mjs';
import {hostname} from 'node:os';
import {statfs} from 'node:fs/promises';
import {isDeepStrictEqual as equal} from 'node:util';
import {applyCommand} from './project.mjs';
import {decisionHash} from './local-decision-plan.mjs';
import {contributionRevisionQueueProof} from './local-contribution-queue.mjs';
import {readStageInvocationOriginal} from './stage-original.mjs';
import {readArtifactContent} from './artifact-content.mjs';
import {validateStageOutput} from './stage-content.mjs';
import {verifyReviewOriginal} from './review-original.mjs';
import {validateFeedbackReviewOutput,feedbackHash} from './human-feedback.mjs';
const need=(v,code)=>{if(!v)throw Object.assign(Error(code),{code,status:409});};
const local=job=>need(job?.binding?.providerId==='local-synthetic'&&job.binding.model==='synthetic','LOCAL_CONTRIBUTION_SYNTHETIC_BINDING_REQUIRED');
export async function contributionSpace(root){const s=await statfs(root);need(s.bavail*s.bsize>=3*1024**3,'LOCAL_CONTRIBUTION_DISK_REQUIRED');}
export function originalContributionQueue(intent,store){const revision=intent.continuation.queueProof?.revision;need(Number.isSafeInteger(revision),'LOCAL_CONTRIBUTION_QUEUE_PROOF_REQUIRED');const queued=store.read(intent.projectId,revision);return contributionRevisionQueueProof(intent,{read:(id,r)=>r===undefined?queued:store.read(id,r)});}
function completionReplay(store,project,job,kind,actor){
 const records=project.audit.filter(a=>a.kind===kind).map(a=>({audit:a,command:JSON.parse(project.processedCommands[a.commandId])})).filter(x=>x.command.jobId===job.id);need(records.length===1,'LOCAL_CONTRIBUTION_COMPLETION_REQUIRED');const {audit,command}=records[0],before=store.read(project.id,audit.revision-1),after=store.read(project.id,audit.revision),expected=applyCommand(before,{...command,expectedRevision:before.revision},actor);need(equal(after,expected),'LOCAL_CONTRIBUTION_COMPLETION_CHANGED');return {revision:audit.revision,commandId:audit.commandId,afterHash:decisionHash(after)};
}
export async function contributionRevisionOriginal(intent,store,executionRoot){
 const queue=originalContributionQueue(intent,store),p=store.read(intent.projectId),job=p.jobs.find(j=>j.id===queue.jobId);local(job);
 need(job.status==='succeeded'&&job.attempts.length===1&&job.attempts[0].status==='succeeded'&&job.outputVersionIds.length===1,'LOCAL_CONTRIBUTION_REVISION_NOT_COMPLETE');
 const a=p.artifacts.find(a=>a.id===job.outputVersionIds[0]),attempt=job.attempts[0],protocol=contributionInput(job.task),input=protocol.input,{baseContent,...revisionBody}=input;
 need(a&&p.activeByStage[intent.request.module]===a.id&&a.provenance==='provider_execution'&&equal(a.executionReceipt,attempt.receipt)&&equal(a.revision,revisionBody)&&input.taskCardId===p.activeTaskCardId&&input.policyVersion===p.policies.at(-1).version&&equal(protocol.feedback,p.humanFeedback.filter(f=>f.stage===job.stage&&f.taskCardId===p.activeTaskCardId))&&(protocol.kind==='typed'||input.feedbackHash===feedbackHash(protocol.feedback)),'LOCAL_CONTRIBUTION_REVISION_SOURCE_CHANGED');
 const base=p.artifacts.find(candidate=>candidate.id===input.revisionOf.artifactId);
 need(base?.contentHash===input.revisionOf.contentHash,'LOCAL_CONTRIBUTION_BASE_CHANGED');
 const originalBase=await readArtifactContent(p,base.id,executionRoot);
 need(equal(originalBase.content,input.baseContent),'LOCAL_CONTRIBUTION_BASE_CHANGED');
 const original=await readStageInvocationOriginal(p,job,attempt,{executionRoot}),output=validateStageOutput(job.stage,JSON.parse(original.outputText),{sourceRecords:job.task.sourceRecords??[],visualCatalogue:job.task.visualCatalogue??[],strategyContractVersion:job.task.strategyContractVersion,strategyBasis:job.task.strategyBasis,copyContractVersion:job.task.copyContractVersion,...(protocol.kind==='typed'?{correctionInput:input}:{revisionInput:input})}),loaded=await readArtifactContent(p,a.id,executionRoot);
 need(equal(output.content,loaded.content)&&equal(output.claims,a.claims)&&equal(output[protocol.responseField],a[protocol.responseField]),'LOCAL_CONTRIBUTION_REVISION_OUTPUT_CHANGED');
 let targetScope;
 if(intent.request.module==='copy'){
  need(intent.contributionPlan.copyTarget,'LOCAL_COPY_TARGET_SELECTION_REQUIRED');
  const originalArtifact=p.artifacts.find(a=>a.id===intent.contributionPlan.sourcePins.artifactId),originalCopy=await readArtifactContent(p,originalArtifact.id,executionRoot);
  need(originalCopy.contentText===intent.contributionPlan.sourceCopyText,'LOCAL_COPY_TARGET_CHANGED');
  targetScope=verifyCopyDirectionRewrite({artifact:originalArtifact,contentText:originalCopy.contentText,contribution:intent.request.contribution,target:intent.contributionPlan.copyTarget,revisedContent:loaded.content});
 }
 const completion=completionReplay(store,p,job,'complete-stage',a.author);
 return {artifactId:a.id,contentHash:a.contentHash,jobId:job.id,attemptId:attempt.id,originalHash:decisionHash({input:original.input,output:original.outputText}),producerResponses:structuredClone(a[protocol.responseField]),completion,...(targetScope?{targetScope}:{})};
}
function reviewQueueProof(intent,store){
 const request=intent.continuation.feedbackReviewRequest,p=store.read(intent.projectId),jobId='job-'+decisionHash([p.id,request.commandId]),job=p.jobs.find(j=>j.id===jobId),typed=p.artifacts.find(a=>a.id===request.artifactId)?.revision?.protocolVersion===LATEST_CORRECTION_PROTOCOL,purpose=typed?'correction_review':'feedback_review';need(job&&job.purpose===purpose&&job.targetArtifactId===request.artifactId&&equal(job.task.enqueueRequest,request),'LOCAL_CONTRIBUTION_REVIEW_QUEUE_CHANGED');local(job);
 const audit=p.audit.find(a=>a.commandId===request.commandId),command=JSON.parse(p.processedCommands[request.commandId]);need(audit&&command.kind===(typed?'request-correction-review':'request-feedback-review')&&command.jobId===jobId&&audit.actorId===(typed?'correction-review-director':'feedback-review-director'),'LOCAL_CONTRIBUTION_REVIEW_QUEUE_CHANGED');
 const before=store.read(p.id,audit.revision-1),after=store.read(p.id,audit.revision),expected=applyCommand(before,{...command,expectedRevision:before.revision},{actorType:'agent',actorId:audit.actorId,runId:'queue-proof-only',contextId:'queue-proof-only',now:audit.at});need(equal(after,expected),'LOCAL_CONTRIBUTION_REVIEW_QUEUE_CHANGED');return {jobId,revision:audit.revision};
}
export async function contributionFeedbackOriginal(intent,store,executionRoot){
 const revision=await contributionRevisionOriginal(intent,store,executionRoot),queue=reviewQueueProof(intent,store),p=store.read(intent.projectId),job=p.jobs.find(j=>j.id===queue.jobId),typed=job.purpose==='correction_review',reports=(typed?p.correctionReviews:p.feedbackReviews).filter(r=>r.jobId===job.id);need(job.status==='succeeded'&&job.attempts.length===1&&reports.length===1,'LOCAL_CONTRIBUTION_FEEDBACK_REVIEW_INCOMPLETE');
 const report=reports[0];need(report.artifactId===revision.artifactId&&report.contentHash===revision.contentHash&&report.context.actorId!==p.artifacts.find(a=>a.id===revision.artifactId).author.actorId&&report.executionReceipt.threadId!==p.artifacts.find(a=>a.id===revision.artifactId).executionReceipt.threadId,'LOCAL_CONTRIBUTION_REVIEW_INDEPENDENCE_REQUIRED');
 await verifyReviewOriginal(p,job.purpose,report,{executionRoot});const normalized=typed?validateCorrectionReviewOutput(report.rawReport,job.task.correctionReviewInput):validateFeedbackReviewOutput(report.rawReport,job.task.feedbackReviewInput);need(normalized.hasBlockingFindings===report.hasBlockingFindings,'LOCAL_CONTRIBUTION_REVIEW_CHANGED');
 const completion=completionReplay(store,p,job,typed?'complete-correction-review':'complete-feedback-review',report.context);
 return {revision,reportId:report.id,reportHash:report.reportHash,jobId:job.id,findings:structuredClone(normalized.findings),producerResponses:revision.producerResponses,hasBlockingFindings:normalized.hasBlockingFindings,completion,factualAuthority:false,realQualityVerified:false,released:false,approved:false};
}
export async function advanceContributionProtocol({intent,store,executor,executionRoot,persist}){
 need(['strategy','copy'].includes(intent.request.module),'LOCAL_CONTRIBUTION_STAGE_UNSUPPORTED');
 if(intent.request.module==='copy'){
  need(intent.contributionPlan.copyTarget,'LOCAL_COPY_TARGET_SELECTION_REQUIRED');
  const current=store.read(intent.projectId),source=current.artifacts.find(a=>a.id===intent.contributionPlan.sourcePins.artifactId);
  const original=await readArtifactContent(current,source.id,executionRoot);need(original.contentText===intent.contributionPlan.sourceCopyText,'LOCAL_COPY_TARGET_CHANGED');
 }
 await contributionSpace(executionRoot);const c=intent.continuation,p=()=>store.read(intent.projectId);originalContributionQueue(intent,store);
 if(['executing_revision','queueing_feedback_review','executing_feedback_review'].includes(c.status)&&!c.phaseTerminal){let dead=false;if(c.phaseOwner?.host===hostname())try{process.kill(c.phaseOwner.pid,0);}catch(e){dead=e.code==='ESRCH';}need(dead,'LOCAL_CONTRIBUTION_PHASE_WRITER_UNRESOLVED');}
 const start=async status=>{c.status=status;c.phaseOwner={host:hostname(),pid:process.pid};c.phaseTerminal=false;await persist(intent);};
 const queuedJobId=originalContributionQueue(intent,store).jobId;
 if(['revision_queued','executing_revision'].includes(c.status)){
  const job=p().jobs.find(j=>j.id===queuedJobId);local(job);
  if(job.status==='queued'){need(job.attempts.length===0,'LOCAL_CONTRIBUTION_ORIGINAL_ATTEMPT_REQUIRED');need(c.status!=='executing_revision','LOCAL_CONTRIBUTION_ORIGINAL_OUTCOME_UNKNOWN');await start('executing_revision');await executor.execute(intent.projectId,queuedJobId);}
  need(p().jobs.find(j=>j.id===queuedJobId).status==='succeeded','LOCAL_CONTRIBUTION_ORIGINAL_OUTCOME_UNKNOWN');c.revision=await contributionRevisionOriginal(intent,store,executionRoot);c.status='revision_generated_pending_feedback_review';await persist(intent);return c;
 }
 const revision=await contributionRevisionOriginal(intent,store,executionRoot);
 if(['revision_generated_pending_feedback_review','queueing_feedback_review'].includes(c.status)){
  c.feedbackReviewRequest??={artifactId:revision.artifactId,commandId:intent.contributionPlan.proposal.commandId+'-feedback-review',expectedRevision:p().revision};
  const existing=p().jobs.find(j=>equal(j.task?.enqueueRequest,c.feedbackReviewRequest));
  if(!existing){need(c.status!=='queueing_feedback_review','LOCAL_CONTRIBUTION_ORIGINAL_OUTCOME_UNKNOWN');await start('queueing_feedback_review');await executor.enqueueFeedbackReview(intent.projectId,c.feedbackReviewRequest);}
  c.reviewQueue=reviewQueueProof(intent,store);c.status='feedback_review_queued';await persist(intent);return c;
 }
 if(['feedback_review_queued','executing_feedback_review'].includes(c.status)){
  const queue=reviewQueueProof(intent,store),job=p().jobs.find(j=>j.id===queue.jobId);local(job);
  if(job.status==='queued'){need(job.attempts.length===0&&c.status!=='executing_feedback_review','LOCAL_CONTRIBUTION_ORIGINAL_OUTCOME_UNKNOWN');await start('executing_feedback_review');await executor.execute(intent.projectId,job.id);}
  need(p().jobs.find(j=>j.id===job.id).status==='succeeded','LOCAL_CONTRIBUTION_ORIGINAL_OUTCOME_UNKNOWN');c.feedbackReview=await contributionFeedbackOriginal(intent,store,executionRoot);c.status=c.feedbackReview.hasBlockingFindings?'feedback_review_unresolved':'feedback_review_addressed';await persist(intent);return c;
 }
 if(['feedback_review_addressed','feedback_review_unresolved'].includes(c.status)){const proof=await contributionFeedbackOriginal(intent,store,executionRoot);need((c.status==='feedback_review_addressed')===!proof.hasBlockingFindings,'LOCAL_CONTRIBUTION_REVIEW_STATUS_CHANGED');c.feedbackReview=proof;return c;}
 need(false,'LOCAL_CONTRIBUTION_CONTINUATION_STATE_UNSUPPORTED');
}
