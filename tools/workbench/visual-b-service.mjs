import {randomUUID,createHash} from 'node:crypto';
import {isDeepStrictEqual as equal} from 'node:util';
import {DomainError,copyDeliveryEnvelope} from './project.mjs';
import {finalVisualSource,selectFinalVisualRun} from './final-visual.mjs';
import {visualMethod} from './visual-a-service.mjs';
import {requireVisualBWorkflow,visualBSnapshot,visualBTarget,requireVisualBClaim,requireVisualBIdle,requireVisualBReplay,requireVisualBNoPending,visualBPending,visualBRevisionResult} from './visual-b-http.mjs';
const need=(v,c)=>{if(!v)throw new DomainError(c,c);};
const actor=()=>({actorType:'agent',actorId:'visual-b-http',runId:randomUUID(),contextId:randomUUID(),now:new Date().toISOString()});
const domain=fn=>async(...args)=>{try{return await fn(...args);}catch(e){if(typeof e.code==='string'&&!(e instanceof DomainError))throw new DomainError(e.code,e.message);throw e;}};
export function createVisualBService({store,executor,executionAllowed=false}) {
  const capability=()=>({protocol:'simple-visual-b-workspace-v1',executionAllowed:Boolean(executionAllowed&&executor),configured:Boolean(executor?.finalVisualCapability?.().configured),semanticApproval:false,unknownRecoverySupported:false});
  const enabled=()=>need(executionAllowed&&executor,'VISUAL_B_EXECUTION_UNAVAILABLE');
  function status(id) {
    const p=store.read(id);let source=null,run=null,blockedReason=null;
    try {requireVisualBWorkflow(p);const s=finalVisualSource(p,copyDeliveryEnvelope);run=selectFinalVisualRun(p,s.sourceHash);source={sourceHash:s.sourceHash,sketchArtifactId:s.sketchArtifact.id,sketchContentHash:s.sketchArtifact.contentHash,runId:run?.id??`fv-${s.sourceHash}`};}catch(e){blockedReason=e.code??'VISUAL_B_SOURCE_REQUIRED';}
    const jobs=run?p.jobs.filter(j=>j.finalVisualRunId===run.id):[];
    const pending=visualBPending(p);if(pending.length)blockedReason='VISUAL_B_ADVANCE_PENDING';
    return {visualB:{source,run:run??null,blockedReason,pendingAdvances:pending,writesBlocked:pending.length>0,queuedJobIds:pending.length?[]:jobs.filter(j=>j.status==='queued'&&!j.attempts.length).map(j=>j.id),unknownJobs:jobs.filter(j=>['running','unknown','awaiting_reconciliation'].includes(j.status)).map(j=>({jobId:j.id,status:j.status})),qualityApproval:false},capability:capability(),revision:p.revision};
  }
  async function continuation(id,request) {
    enabled();let p=store.read(id);requireVisualBWorkflow(p);requireVisualBNoPending(p);
    let row=p.visualBHttpIntents?.find(r=>r.request.commandId===request.commandId);const replayed=Boolean(row);
    if(row)requireVisualBReplay(row,request);
    else {
      need(p.revision===request.expectedRevision,'REVISION_CONFLICT');
      const source=finalVisualSource(p,copyDeliveryEnvelope);
      need(request.sourceHash===source.sourceHash&&request.sketchArtifactId===source.sketchArtifact.id&&request.sketchContentHash===source.sketchArtifact.contentHash,'VISUAL_B_SOURCE_CHANGED');
      const scope={...await executor.verifyFinalVisualSource(id),noRecovery:true,prepareOnly:true};scope.onlyRunId=scope.runId;delete scope.runId;
      const existing=p.finalVisualRuns?.find(r=>r.id===scope.onlyRunId);if(existing)requireVisualBIdle(p,existing.id);
      const method=await visualMethod(p),nativeRequest={commandId:'visual-b-native-'+createHash('sha256').update(JSON.stringify([id,request.commandId])).digest('hex'),expectedRevision:request.expectedRevision+1};
      store.command(id,{kind:'visual-b-http-intent',operation:'continue',request,scope,nativeRequest,method,commandId:request.commandId,expectedRevision:request.expectedRevision},actor());
      row=store.read(id).visualBHttpIntents.at(-1);
    }
    p=store.read(id);let progress=null;
    if(!Object.hasOwn(p.processedCommands,row.nativeRequest.commandId)) {
      need(equal(row.snapshot,visualBSnapshot(p))&&equal(row.method,await visualMethod(p)),'VISUAL_B_STALE');
      progress=await executor.continueFinalVisual(id,row.nativeRequest,row.scope);
    }
    return {...status(id),receipt:{commandId:request.commandId,replayed,scope:row.scope,progress}};
  }
  async function step(id,request) {
    enabled();let p=store.read(id);requireVisualBWorkflow(p);
    let row=p.visualBHttpRequests?.find(r=>r.request.commandId===request.commandId);const replayed=Boolean(row);
    if(row){requireVisualBReplay(row,request);if(row.revisionResult)return {...status(id),receipt:{commandId:request.commandId,replayed:true,phase:request.phase,targetId:request.targetId,jobIds:request.jobIds,progress:row.revisionResult}};if(row.advanceStarted)return {...status(id),receipt:{commandId:request.commandId,replayed:true,phase:request.phase,targetId:request.targetId,jobIds:request.jobIds,progress:row.advanceResult??{status:'advance_pending',reason:'VISUAL_B_ADVANCE_RECONCILIATION_CLOSED'}}};}
    requireVisualBNoPending(p);
    if(row)requireVisualBReplay(row,request);
    else {
      need(p.revision===request.expectedRevision,'REVISION_CONFLICT');
      await executor.verifyFinalVisualSource(id,request.targetId);
      const method=await visualMethod(p);
      store.command(id,{kind:'visual-b-http-step',request,method,commandId:request.commandId,expectedRevision:request.expectedRevision},actor());row=store.read(id).visualBHttpRequests.at(-1);
    }
    async function finishRevision() {
      const current=store.read(id),result=visualBRevisionResult(current,row);
      if(!result)return null;
      need(equal(row.method,await visualMethod(current)),'VISUAL_B_STALE');
      store.command(id,{kind:'visual-b-http-revision-completed',requestId:request.commandId,commandId:`visual-b-revision-completed-${request.commandId}`,expectedRevision:current.revision},actor());
      return {...status(id),receipt:{commandId:request.commandId,replayed,phase:request.phase,targetId:request.targetId,jobIds:request.jobIds,progress:store.read(id).visualBHttpRequests.find(r=>r.request.commandId===request.commandId).revisionResult}};
    }
    for(const jobId of row.request.jobIds) {
      const completed=await finishRevision();if(completed)return completed;
      p=store.read(id);requireVisualBIdle(p,row.target.targetId);
      need(equal(row.method,await visualMethod(p)),'VISUAL_B_STALE');
      const job=p.jobs.find(j=>j.id===jobId);if(job?.status==='succeeded')continue;
      requireVisualBClaim(p,request.commandId,job,{kind:'dispatch'});
      await executor.execute(id,jobId,{visualBAdmission:{requestId:request.commandId,expectedRevision:p.revision}});
    }
    const completed=await finishRevision();if(completed)return completed;
    p=store.read(id);let progress=null;
    requireVisualBIdle(p,row.target.targetId);
    need(equal(row.snapshot,visualBSnapshot(p))&&equal(row.target,visualBTarget(p,row.target.targetId))&&equal(row.method,await visualMethod(p)),'VISUAL_B_STALE');
    row=p.visualBHttpRequests.find(r=>r.request.commandId===request.commandId);
    if(!row.advanceStarted&&row.request.jobIds.every(jobId=>p.jobs.find(j=>j.id===jobId)?.status==='succeeded')) {
      const markerCommandId=`visual-b-advance-${randomUUID()}`,claimOwner=actor();
      store.command(id,{kind:'visual-b-http-advance',requestId:request.commandId,commandId:markerCommandId,expectedRevision:p.revision},claimOwner);
      const claimed=store.read(id).visualBHttpRequests.find(r=>r.request.commandId===request.commandId)?.advanceClaim;need(claimed?.markerCommandId===markerCommandId&&equal(claimed.claimOwner,claimOwner),'VISUAL_B_ADVANCE_CLAIM_REQUIRED');
      progress=await executor.advanceFinalVisual(id,{onlyRunId:row.target.targetId,sourceHash:row.target.sourceHash,noRecovery:true,advanceRequestId:request.commandId});
      p=store.read(id);store.command(id,{kind:'visual-b-http-completed',requestId:request.commandId,markerCommandId,progress,commandId:`${markerCommandId}-completed`,expectedRevision:p.revision},claimOwner);
    } else progress=row.advanceResult??{status:'advance_pending',reason:'VISUAL_B_ADVANCE_RECONCILIATION_CLOSED'};
    return {...status(id),receipt:{commandId:request.commandId,replayed,phase:request.phase,targetId:request.targetId,jobIds:request.jobIds,progress}};
  }
  async function adopt(id,request,context) {
    enabled();const p=store.read(id);requireVisualBWorkflow(p);requireVisualBNoPending(p);
    need(context.actorType==='human','HUMAN_REQUIRED');requireVisualBIdle(p,request.runId);
    const target=visualBTarget(p,request.runId),artifact=p.artifacts.find(a=>a.id===request.artifactId);
    need(target.sourceHash===request.sourceHash&&artifact?.contentHash===request.draftHash&&artifact.finalVisual?.runId===request.runId,'FINAL_ADOPTION_STALE');
    await executor.verifyFinalVisual(id,artifact);
    store.command(id,{kind:'adopt-final-visual',artifactId:request.artifactId,draftHash:request.draftHash,reason:request.reason,visualBRequest:request,commandId:request.commandId,expectedRevision:request.expectedRevision},context);
    return {...status(id),receipt:{commandId:request.commandId,operation:'adopt'}};
  }
  async function release(id,request) {
    enabled();requireVisualBWorkflow(store.read(id));requireVisualBNoPending(store.read(id));
    const progress=await executor.releaseFinalVisual(id,request);
    return {...status(id),receipt:{commandId:request.commandId,operation:'release',progress}};
  }
  return {status,continuation:domain(continuation),step:domain(step),adopt:domain(adopt),release:domain(release),capability};
}
