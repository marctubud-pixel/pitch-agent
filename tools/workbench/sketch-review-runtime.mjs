import {reopenOrdinaryCompletion} from './ordinary-model-project.mjs';
import {verifyOrdinaryProject,restoreOrdinaryJob,reopenOrdinaryJob} from './ordinary-model-project.mjs';
import {invokeOrdinary,reopenOrdinary,isOrdinaryHttp,ordinarySuccessfulStatus,ordinaryHasContext} from './ordinary-model.mjs';
import {randomUUID,createHash} from 'node:crypto';
import {hostname} from 'node:os';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {isDeepStrictEqual as equal} from 'node:util';
import {verifySketchReviewOriginal,verifyReviewedSketchOriginal} from './sketch-review-original.mjs';
import {copyDeliveryEnvelope} from './project.mjs';
import {sketchHash as hash,sketchRequire as need} from './sketch-authority.mjs';
import {REVIEW_PROTOCOL,REVIEW_PURPOSES,REVIEW_ROLES,freezeSketchReview,buildReviewRequest,deriveSketchReviewOutcome,reviewNodeBinding,requireReviewRun,requireReviewedSketchV2,reviewEnvelope} from './sketch-review-v2.mjs';

export function createSketchReviewRuntime({store,root,sketches,providers,bindings,imageStore,configuration}) {
  const coordinator=()=>({actorType:'agent',actorId:randomUUID(),runId:randomUUID(),contextId:randomUUID(),now:new Date().toISOString()});
  const send=(id,c,context=coordinator())=>store.command(id,{...c,commandId:randomUUID(),expectedRevision:store.read(id).revision},context);
  const assignments=()=>Object.fromEntries([...REVIEW_ROLES.flatMap(role=>[`score_${role}`,`opposition_${role}`]),'director','producer','consumer'].map(key=>[key,bindings[key==='producer'?'sketch':key==='consumer'?'visual':`sketch_review_${key}`]]));
  const runOf=id=>store.read(id).sketchReviewRuns?.find(r=>r.generationId===store.read(id).sketchGenerations?.at(-1)?.id);
  function available(run,node) {
    const binding=reviewNodeBinding(run,node),current=assignments()[node.phase==='score'?`score_${node.role}`:['blind','challenge'].includes(node.phase)?`opposition_${node.role}`:node.phase==='director'?'director':node.phase];
    need(equal(current,binding)&&providers[binding.providerId]?.model===binding.model,'REVIEW_BINDING_CHANGED','Frozen review assignment unavailable; no substitute or reroll');
    const capability=run.capability;
    need(equal(capability,configuration?.capability),'REVIEW_CAPABILITY_CHANGED','New dispatch must use frozen configured envelope');
    need(capability.assignment?.providerId===binding.providerId&&capability.assignment?.model===binding.model,'REVIEW_CAPABILITY_ASSIGNMENT','Envelope evidence is bound to its explicit provider and model');
  }
  async function checkCapabilityEvidence(run){if(run.capability.status==='experiment_verified')for(const item of run.capability.evidence)need(createHash('sha256').update(await readFile(item.path)).digest('hex')===item.sha256,'REVIEW_CAPABILITY_EVIDENCE_CHANGED','Bounded experiment evidence hash changed');}
  async function checked(projectId,run) {
    await verifyOrdinaryProject(store.read(projectId),{executionRoot:root});
    await sketches.sketchReviewInput(projectId,run.generationId);
    requireReviewRun(store.read(projectId),run,copyDeliveryEnvelope);
    return verifySketchReviewOriginal(store.read(projectId),run,{executionRoot:root,imageStore});
  }
  async function verifyReviewedSketch(projectId,artifact) {
    const run=store.read(projectId).sketchReviewRuns?.find(r=>r.id===artifact.sketchGeneration?.reviewRunId);need(run,'REVIEW_V2_REQUIRED','Actual v2 run required');
    await sketches.sketchReviewInput(projectId,run.generationId);requireReviewedSketchV2(store.read(projectId),artifact,copyDeliveryEnvelope,{phase:'registration'});
    await verifyReviewedSketchOriginal(store.read(projectId),artifact,{executionRoot:root,imageStore});
  }
  async function continueSketchReview(projectId,request) {
    need(Object.keys(request).every(k=>['commandId','expectedRevision'].includes(k))&&typeof request.commandId==='string'&&request.commandId!=='__proto__'&&Number.isSafeInteger(request.expectedRevision),'INVALID_SKETCH_INTENT','Only valid continuation identity and revision accepted');
    store.command(projectId,{kind:'request-sketch-review',...request},coordinator());
    return advanceSketchReview(projectId);
  }
  async function advanceSketchReview(projectId) {
    let p=store.read(projectId);if(!p.sketchReviewIntents?.length)return {status:'not_requested',queuedJobIds:[]};
    try {
      let run=runOf(projectId);
      if(!run){const g=p.sketchGenerations?.at(-1);need(g,'SKETCH_GENERATION_REQUIRED','Completed generation required');await sketches.sketchReviewInput(projectId,g.id);p=store.read(projectId);run=freezeSketchReview(p,g,assignments(),configuration,copyDeliveryEnvelope);await checkCapabilityEvidence(run);for(const node of run.nodes)available(run,node);send(projectId,{kind:'open-sketch-review',run});run=runOf(projectId);}
      await checked(projectId,run);
      for(const job of store.read(projectId).jobs.filter(j=>j.reviewRunId===run.id&&['running','awaiting_reconciliation'].includes(j.status)&&(j.attempts.at(-1)?.receipt?.responseText!==undefined||j.attempts.at(-1)?.httpAttemptLocator))) {
        await restoreOrdinaryJob(store,root,projectId,job.id,{imageStore});
        const current=store.read(projectId).jobs.find(j=>j.id===job.id),attempt=current.attempts.at(-1),folder=join(root,attempt.id);
        need(equal(JSON.parse(await readFile(join(folder,'receipt.json'),'utf8')),attempt.receipt)&&await readFile(join(folder,'response.txt'),'utf8')===attempt.receipt.responseText,'REVIEW_ANCHOR_CHANGED','Local response anchor unavailable');
        await reopenOrdinaryCompletion(store.read(projectId),current,attempt,{executionRoot:root,receipt:attempt.receipt,wrappers:[[join(folder,'receipt.json'),JSON.stringify(attempt.receipt)],[join(folder,'response.txt'),attempt.receipt.responseText]]});
        send(projectId,{kind:'complete-sketch-review',jobId:job.id,attemptId:attempt.id});
      }
      run=runOf(projectId);p=store.read(projectId);
      const stuck=p.jobs.find(j=>j.reviewRunId===run.id&&['blocked','failed','awaiting_reconciliation'].includes(j.status));
      if(stuck)return {status:stuck.status,reason:stuck.error?.code,queuedJobIds:[]};
      let outcome=deriveSketchReviewOutcome(p,run);
      if(outcome.status==='selection_ready'){send(projectId,{kind:'extend-sketch-review',runId:run.id});run=runOf(projectId);outcome=deriveSketchReviewOutcome(store.read(projectId),run);}
      if(outcome.status==='reviewed') {
        let artifact=store.read(projectId).artifacts.find(a=>a.sketchGeneration?.reviewRunId===run.id);
        if(!artifact){
          const authority={protocol:REVIEW_PROTOCOL,reviewRunId:run.id,generationId:run.generationId,sourceHash:run.sourceHash,planHash:run.planHash,packetHash:run.packetHash,selected:outcome.selected};
          const bytes=JSON.stringify(authority),folder=join(root,run.id);await mkdir(folder,{recursive:true});const payloadRef=join(folder,'reviewed-sketch.json');
          try{await writeFile(payloadRef,bytes,{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;need(await readFile(payloadRef,'utf8')===bytes,'REVIEW_ARTIFACT_CHANGED','Existing draft differs');}
          artifact={id:`sketch-${run.id}`,stage:'sketch',provenance:'reviewed_sketch_generation',sketchGeneration:authority,inputVersionIds:[store.read(projectId).activeByStage.copy],payloadRef,contentHash:hash(bytes),claims:[],technicalReceipts:{},author:coordinator()};
          await verifyReviewedSketch(projectId,artifact);send(projectId,{kind:'register-reviewed-sketch',artifact});
        }
        await verifyReviewedSketch(projectId,artifact);
        try{requireReviewedSketchV2(store.read(projectId),artifact,copyDeliveryEnvelope);}catch(error){if(error.code==='HUMAN_GATE')return {...outcome,status:'awaiting_human_adoption',artifactId:artifact.id,queuedJobIds:[]};throw error;}
        if(!store.read(projectId).releases.some(r=>r.artifactId===artifact.id&&r.policyVersion===store.read(projectId).policies.at(-1).version))send(projectId,{kind:'release-stage',artifactId:artifact.id});
        if(store.read(projectId).policies.at(-1).authorizedThrough==='sketch')return {...outcome,status:'released_at_endpoint',artifactId:artifact.id,queuedJobIds:[]};
        if(!run.nodes.some(n=>n.phase==='producer')){send(projectId,{kind:'open-sketch-refinement',runId:run.id,artifactId:artifact.id});run=runOf(projectId);}
        const returned=run.reports.find(r=>['producer','consumer'].includes(r.phase)&&(!r.valid||r.raw.decision!=='accept'));
        if(returned)return {...outcome,status:'handoff_returned',findings:returned.raw?.findings??[],queuedJobIds:[]};
        if(run.reports.some(r=>r.phase==='consumer'&&r.valid&&r.raw.decision==='accept'))return {...outcome,status:'refinement_handoff_ready',artifactId:artifact.id,queuedJobIds:[]};
      }
      if(!['reviewing','reviewed'].includes(outcome.status))return {...outcome,queuedJobIds:[]};
      for(const node of run.nodes){p=store.read(projectId);if(p.jobs.some(j=>j.reviewRunId===run.id&&j.nodeKey===node.key)||!node.dependencies.every(key=>run.reports.some(r=>r.nodeKey===key)))continue;available(run,node);send(projectId,{kind:'queue-sketch-review',runId:run.id,nodeKey:node.key});}
      return {...outcome,runId:run.id,queuedJobIds:store.read(projectId).jobs.filter(j=>j.reviewRunId===run.id&&j.status==='queued').map(j=>j.id)};
    } catch(error){return {status:'blocked',reason:error.code??'REVIEW_EXECUTION_UNAVAILABLE',message:error.message,queuedJobIds:[]};}
  }
  async function execute(projectId,jobId) {
    let job=store.read(projectId).jobs.find(j=>j.id===jobId);if(job.status!=='queued')return job;
    const attemptId=randomUUID(),context={actorType:'agent',actorId:randomUUID(),runId:attemptId,contextId:randomUUID(),executorHost:hostname(),executorPid:process.pid,now:new Date().toISOString()};let claimed=false,receipt;
    try{
      let run=store.read(projectId).sketchReviewRuns.find(r=>r.id===job.reviewRunId);await checked(projectId,run);
      const node=run.nodes.find(n=>n.key===job.nodeKey),request=buildReviewRequest(run,node,run.reports).request,cohort=run.cohorts.find(c=>c.id===node.cohortId);available(run,node);await checkCapabilityEvidence(run);reviewEnvelope(cohort.images,run.capability);
      if(['producer','consumer'].includes(node.phase))requireReviewedSketchV2(store.read(projectId),store.read(projectId).artifacts.find(a=>a.id===run.artifactId),copyDeliveryEnvelope);
      const images=[];for(const image of request.images)images.push((await imageStore.read({projectId,imageId:image.imageId,expectedHash:image.sha256})).descriptor);
      const folder=join(root,attemptId);await mkdir(folder,{recursive:true});await writeFile(join(folder,'packet.json'),JSON.stringify({runId:attemptId,model:job.binding.model,...request}),{flag:'wx'});
      await checked(projectId,run);available(run,node);send(projectId,{kind:'claim-sketch-review',jobId,attemptId},context);claimed=true;
      receipt=await invokeOrdinary({executionRoot:root,provider:providers[job.binding.providerId],binding:job.binding,attemptId,request,images,runtimePacketBytes:Buffer.from(JSON.stringify({runId:attemptId,model:job.binding.model,...request})),persistLocator:locator=>send(projectId,{kind:'anchor-model-http-attempt',jobId,attemptId,locator},context)});
      await writeFile(join(folder,'receipt.json'),JSON.stringify(receipt),{flag:'wx'});await writeFile(join(folder,'response.txt'),receipt.responseText,{flag:'wx'});
      send(projectId,{kind:'anchor-sketch-review',jobId,attemptId,receipt},context);
      {const p=store.read(projectId),j=p.jobs.find(j=>j.id===jobId);await reopenOrdinaryCompletion(p,j,j.attempts.at(-1),{executionRoot:root,receipt,wrappers:[[join(folder,'receipt.json'),JSON.stringify(receipt)],[join(folder,'response.txt'),receipt.responseText]]});}
      send(projectId,{kind:'complete-sketch-review',jobId,attemptId},context);
    }catch(error){job=store.read(projectId).jobs.find(j=>j.id===jobId);if(claimed&&job.status==='running')send(projectId,{kind:'fail-sketch-review',jobId,attemptId,error:{code:error.code??'REVIEW_UNKNOWN',message:error.message},...(receipt||error.receipt?{receipt:receipt??error.receipt}:{})},context);else if(!claimed&&job.status==='queued')send(projectId,{kind:'block-queued-job',jobId,error:{code:error.code??'REVIEW_UNAVAILABLE',message:error.message}});}
    return store.read(projectId).jobs.find(j=>j.id===jobId);
  }
  function capability(){return {reviewExecutionIntegrated:true,protocol:REVIEW_PROTOCOL,configured:!!configuration,provenance:configuration?.capability??null,semanticApproval:false};}
  return {continueSketchReview,advanceSketchReview,execute,verifyReviewedSketch,capability};
}
