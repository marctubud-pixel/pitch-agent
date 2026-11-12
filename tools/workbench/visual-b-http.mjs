import {isDeepStrictEqual as equal} from 'node:util';
import {DomainError} from './project.mjs';
import {requireFinalRevisionOwner} from './final-visual.mjs';
import {visualSnapshot} from './visual-a-http.mjs';
import {freezeStep, requireStepBoundary, requireTargetIdle} from './visual-b-admission.mjs';
const need = (ok, code) => {if (!ok) throw new DomainError(code, code);};
const wrap = fn => {try {return fn();} catch (e) {throw new DomainError(e.code ?? 'VISUAL_B_INVALID', e.message);}};
export const visualBSnapshot = p => ({...visualSnapshot(p), sketchArtifactId:p.activeByStage.sketch, sketchHash:p.artifacts.find(a=>a.id===p.activeByStage.sketch)?.contentHash, feedback:(p.humanFeedback??[]).filter(f=>['copy','sketch','visual'].includes(f.stage))});
export function requireVisualBWorkflow(p) {
  need(p.workflow?.version==='proposal-seven-v1' && ['visual','content_review','layout','final_review'].includes(p.policies.at(-1)?.authorizedThrough),'VISUAL_B_AUTHORIZATION_ENDPOINT');
}
export function visualBPending(p) {return (p.visualBHttpRequests??[]).filter(r=>r.advanceStarted&&!r.advanceResult).map(r=>({commandId:r.request.commandId,targetId:r.target.targetId,sourceHash:r.target.sourceHash,status:'advance_pending'}));}
export function requireVisualBNoPending(p) {need(visualBPending(p).length===0,'VISUAL_B_ADVANCE_PENDING');}
export function visualBTarget(p,id) {
  const run=p.finalVisualRuns?.find(r=>r.id===id);
  need(run && (!p.finalVisualHeadRunId || p.finalVisualHeadRunId===run.id),'VISUAL_B_TARGET_REQUIRED');
  return {phase:'final_visual',targetId:run.id,sourceHash:run.source.sourceHash};
}
export function reduceVisualBStep(p,c,context) {
  requireVisualBWorkflow(p);requireVisualBNoPending(p); need(context.actorType==='agent','EXECUTOR_REQUIRED');
  const target=visualBTarget(p,c.request?.targetId);
  const row=wrap(()=>freezeStep({request:c.request,target,snapshot:visualBSnapshot(p),method:c.method,jobs:p.jobs}));
  p.visualBHttpRequests??=[];
  need(!p.visualBHttpRequests.some(r=>r.request.commandId===c.request.commandId),'COMMAND_ID_REUSED');
  p.visualBHttpRequests.push(row);
}
export function requireVisualBClaim(p,requestId,job,boundary={kind:'actual_claim'}) {
  requireVisualBWorkflow(p);
  requireVisualBNoPending(p);
  const ledger=p.visualBHttpRequests?.find(r=>r.request.commandId===requestId);
  need(ledger,'VISUAL_B_LEDGER_REQUIRED');
  need(!ledger.revisionResult,'VISUAL_B_STEP_COMPLETED');
  return wrap(()=>requireStepBoundary({ledger,request:ledger.request,target:visualBTarget(p,ledger.target.targetId),snapshot:visualBSnapshot(p),method:ledger.method,jobs:p.jobs,jobId:job?.id,boundary}));
}
export function requireVisualBIdle(p,runId) {return wrap(()=>requireTargetIdle(p.jobs,visualBTarget(p,runId)));}
export function reduceVisualBIntent(p,c,context) {
  requireVisualBWorkflow(p);requireVisualBNoPending(p);need(context.actorType==='agent','EXECUTOR_REQUIRED');
  need(c.operation==='continue' && c.request && c.nativeRequest && c.method,'VISUAL_B_INTENT_REQUIRED');
  p.visualBHttpIntents??=[];need(!p.visualBHttpIntents.some(r=>r.request.commandId===c.request.commandId),'COMMAND_ID_REUSED');
  p.visualBHttpIntents.push(structuredClone({operation:c.operation,request:c.request,nativeRequest:c.nativeRequest,scope:c.scope,method:c.method,snapshot:visualBSnapshot(p)}));
}
export function requireVisualBReplay(row,request) {need(equal(row.request,request),'COMMAND_ID_REUSED');}
export function reduceVisualBAdvance(p,c,context) {
  requireVisualBWorkflow(p);need(context.actorType==='agent','EXECUTOR_REQUIRED');
  const row=p.visualBHttpRequests?.find(r=>r.request.commandId===c.requestId);need(row,'VISUAL_B_LEDGER_REQUIRED');
  requireVisualBIdle(p,row.target.targetId);need(equal(row.snapshot,visualBSnapshot(p)),'VISUAL_B_STALE');
  need(row.request.jobIds.every(id=>p.jobs.find(j=>j.id===id)?.status==='succeeded'),'VISUAL_B_INCOMPLETE');
  if(c.kind==='visual-b-http-advance') {need(!row.advanceStarted,'VISUAL_B_ADVANCE_ALREADY_STARTED');row.advanceStarted=true;row.advanceClaim={markerCommandId:c.commandId,claimOwner:structuredClone(context)};}
  else {need(row.advanceStarted&&!row.advanceResult,'VISUAL_B_ADVANCE_NOT_STARTED');need(c.markerCommandId===row.advanceClaim?.markerCommandId&&equal(context,row.advanceClaim?.claimOwner),'VISUAL_B_ADVANCE_CLAIM_REQUIRED');row.advanceResult=structuredClone(c.progress);}
}

// A completed native revision retires this fixed parent request. It never admits
// child jobs or invokes advance; the child needs its own current-head request.
export function visualBRevisionResult(p,row) {
  if(!p.finalVisualHeadRunId || p.finalVisualHeadRunId===row.target.targetId)return null;
  need(equal(row.snapshot,visualBSnapshot(p)),'VISUAL_B_STALE');
  const parent=p.finalVisualRuns?.find(r=>r.id===row.target.targetId);
  const child=p.finalVisualRuns?.find(r=>r.id===p.finalVisualHeadRunId);
  need(parent&&child?.parentRunId===parent.id&&equal(parent.source,child.source)&&parent.source.sourceHash===row.target.sourceHash,'VISUAL_B_REVISION_LINEAGE_REQUIRED');
  const {job}=requireFinalRevisionOwner(p,child);
  const entry=p.finalVisualRevisionRequests.find(q=>q.request.id===child.revisionRequestId);
  need(row.request.jobIds.includes(job.id)&&entry.request.parentRunId===parent.id&&entry.request.sourceHash===row.target.sourceHash&&child.runtimeStatus==='production','VISUAL_B_REVISION_LINEAGE_REQUIRED');
  wrap(()=>requireTargetIdle(p.jobs,row.target));
  wrap(()=>requireTargetIdle(p.jobs,{...row.target,targetId:child.id}));
  for(const frozen of row.jobs) {
    const actual=p.jobs.find(j=>j.id===frozen.id);
    need(actual?.finalVisualRunId===parent.id&&equal(frozen,{id:actual.id,purpose:actual.purpose,node:actual.node,binding:actual.binding,target:actual.target??null}),'VISUAL_B_JOB_CHANGED');
    need(actual.status==='succeeded'||actual.status==='queued'&&actual.attempts.length===0,'VISUAL_B_INCOMPLETE');
  }
  return {status:'revision_committed',parentRunId:parent.id,runId:child.id,sourceHash:row.target.sourceHash,requestId:child.revisionRequestId,revisionJobId:job.id,nativeResult:structuredClone(entry.result),completedJobIds:row.request.jobIds.filter(id=>p.jobs.find(j=>j.id===id).status==='succeeded'),unexecutedJobIds:row.request.jobIds.filter(id=>p.jobs.find(j=>j.id===id).status==='queued')};
}
export function reduceVisualBRevisionCompleted(p,c,context) {
  requireVisualBWorkflow(p);requireVisualBNoPending(p);need(context.actorType==='agent','EXECUTOR_REQUIRED');
  const row=p.visualBHttpRequests?.find(r=>r.request.commandId===c.requestId);
  need(row&&!row.advanceStarted&&!row.revisionResult,'VISUAL_B_LEDGER_REQUIRED');
  const result=visualBRevisionResult(p,row);need(result,'VISUAL_B_REVISION_LINEAGE_REQUIRED');
  row.revisionResult=structuredClone(result);
}
