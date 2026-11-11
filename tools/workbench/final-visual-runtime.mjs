import {reopenOrdinaryCompletion} from './ordinary-model-project.mjs';
import {verifyOrdinaryProject,restoreOrdinaryJob,reopenOrdinaryJob} from './ordinary-model-project.mjs';
import {invokeOrdinary,reopenOrdinary,isOrdinaryHttp,ordinarySuccessfulStatus,ordinaryHasContext} from './ordinary-model.mjs';
import {verifyFinalVisualOriginal} from './final-visual-original.mjs';
import {randomUUID,createHash} from 'node:crypto';
import {hostname} from 'node:os';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {isDeepStrictEqual as equal} from 'node:util';
import {copyDeliveryEnvelope} from './project.mjs';
import {loadImageProvider} from './image-api-provider.mjs';
import {sketchHash as hash,sketchRequire as need} from './sketch-authority.mjs';
import {FINAL_VISUAL_PROTOCOL,selectFinalVisualRun,validateFinalReviewAdjustment,FINAL_AGGREGATE_PARSER,FINAL_VISUAL_PURPOSES,finalVisualSource,requireFinalCurrent,finalPanelNodes,finalBinding,finalEnvelope,finalRequest,finalOutcome,finalPayload,finalImageTask,requireFinalVisual,validateFinalReceipt,ingestFinalResponse,finalTargets,finalImages,finalReviewRequirement,requireFinalRevisionOwner} from './final-visual.mjs';

export function createFinalVisualRuntime({store,root,sketchReviews,providers,bindings,imageStore,imageProvider,configuration}) {
 const localImages=loadImageProvider({resolveCredential:()=>undefined});
 const evidenceDir=join(root,'image-provider-evidence');
 const context=()=>({actorType:'agent',actorId:randomUUID(),runId:randomUUID(),contextId:randomUUID(),executorHost:hostname(),executorPid:process.pid,now:new Date().toISOString()});
 const send=(id,c,ctx=context())=>store.command(id,{...c,commandId:randomUUID(),expectedRevision:store.read(id).revision},ctx);
 const currentRun=id=>{const p=store.read(id);return selectFinalVisualRun(p,finalVisualSource(p,copyDeliveryEnvelope).sourceHash);};
 const assignments=()=>Object.fromEntries([...['planner','aggregate'].map(k=>[k,bindings.visual]),...finalPanelNodes().filter(n=>n.phase!=='challenge').map(n=>[n.phase==='score'?`score_${n.role}`:n.phase==='blind'?`opposition_${n.role}`:'director',bindings[`final_visual_${n.phase==='score'?`score_${n.role}`:n.phase==='blind'?`opposition_${n.role}`:'director'}`]]),['image',imageProvider?.capability()?.binding]]);
 function available(run,job) {
  const current=job.purpose==='final_visual_image'?imageProvider?.capability()?.binding:assignments()[['planner','revision'].includes(job.node.phase)?'planner':job.node.phase==='aggregate'?'aggregate':job.node.phase==='score'?`score_${job.node.role}`:['blind','challenge'].includes(job.node.phase)?`opposition_${job.node.role}`:'director'];
  need(equal(current,job.binding),'FINAL_BINDING_CHANGED','Queued assignment changed; no substitute dispatch');
  if(job.purpose==='final_visual_image')need(imageProvider?.capability()?.invocationSupported,'IMAGE_PROVIDER_UNAVAILABLE','Assigned image invocation unavailable');
  else need(providers[job.binding.providerId]?.model===job.binding.model,'FINAL_PROVIDER_UNAVAILABLE','Assigned requested model unavailable');
 }
 async function checkCapability(run,node,images) {
  const key=['planner','revision','aggregate'].includes(node.phase)?'owner':node.phase==='score'?`score_${node.role}`:['blind','challenge'].includes(node.phase)?`opposition_${node.role}`:'director';
  const cap=run.capabilities[key],binding=finalBinding(run,node);
  need(equal(cap,configuration?.capabilities?.[key]),'FINAL_CAPABILITY_CHANGED','New dispatch requires exact frozen configured envelope');
  finalEnvelope(images,cap,binding);
  if(cap.status==='experiment_verified')for(const e of cap.evidence)need(createHash('sha256').update(await readFile(e.path)).digest('hex')===e.sha256,'FINAL_CAPABILITY_EVIDENCE_CHANGED','Bounded original experiment changed');
 }
 async function checked(id,run,visited=new Set()) {
  await verifyOrdinaryProject(store.read(id),{executionRoot:root});
  need(!visited.has(run.id),'FINAL_LINEAGE_INVALID','Acyclic actual producer ancestry required');visited.add(run.id);
  if(run.parentRunId) {const owner=requireFinalRevisionOwner(store.read(id),run);await checked(id,owner.parent,visited);}
  const p=store.read(id);requireFinalCurrent(p,run,copyDeliveryEnvelope);
  const artifact=p.artifacts.find(a=>a.id===run.source.sketchArtifact.id);
  await sketchReviews.verifyReviewedSketch(id,artifact);
  requireFinalCurrent(store.read(id),run,copyDeliveryEnvelope);
  const bytes=await readFile(artifact.payloadRef,'utf8');need(hash(bytes)===artifact.contentHash&&equal(JSON.parse(bytes),artifact.sketchGeneration),'FINAL_SOURCE_BYTES_CHANGED','Released actual readable sketch bytes required');
  for(const image of [...run.source.images,...(run.reviewImages??[])]) {const loaded=await imageStore.read({projectId:id,imageId:image.imageId,expectedHash:image.sha256});need(loaded.asset.width===image.width&&loaded.asset.height===image.height,'FINAL_SOURCE_BYTES_CHANGED','Frozen actual decoded dimensions required');}
  for(const job of p.jobs.filter(j=>j.finalVisualRunId===run.id&&j.status==='succeeded'))await verifyFinalVisualOriginal(p,run,job,{executionRoot:root,imageStore});
 }
 async function continueFinalVisual(id,request) {
  need(request&&Object.keys(request).every(k=>['commandId','expectedRevision'].includes(k))&&typeof request.commandId==='string'&&request.commandId.length>0&&request.commandId!=='__proto__'&&Number.isSafeInteger(request.expectedRevision)&&request.expectedRevision>=0,'INVALID_FINAL_INTENT','Only continuation identity and revision accepted');
  const p=store.read(id),prior=p.processedCommands[request.commandId];if(prior)need(equal(JSON.parse(prior),{kind:'request-final-visual',...request}),'COMMAND_ID_REUSED','Continuation identity changed');else store.command(id,{kind:'request-final-visual',...request},context());return advanceFinalVisual(id);
 }
 async function recover(id,run,job) {
  if(job.attempts.at(-1)?.httpAttemptLocator){await restoreOrdinaryJob(store,root,id,job.id,{imageStore});job=store.read(id).jobs.find(j=>j.id===job.id);}
  const attempt=job.attempts.at(-1);need(attempt.receipt,'FINAL_ANCHOR_REQUIRED','Unanchored dispatched uncertainty cannot retry');
  if(job.purpose==='final_visual_image') {
   const result=await localImages.recover(finalImageTask(store.read(id),run,job,attempt.id),attempt.id,evidenceDir,{expectedEvidence:attempt.receipt.responseEvidence});need(result.kind==='image'&&equal(result.receipt,attempt.receipt),'FINAL_IMAGE_ANCHOR_CHANGED','Exact protected historical image success required');const asset=await imageStore.ingestGenerated({projectId:id,result});await imageStore.read({projectId:id,imageId:asset.id,expectedHash:asset.sha256});send(id,{kind:'complete-final-visual',jobId:job.id,attemptId:attempt.id,asset});
  } else {
   const folder=join(root,attempt.id),request=finalRequest(store.read(id),run,job.node).request;
   need(equal(JSON.parse(await readFile(join(folder,'packet.json'),'utf8')),{runId:attempt.id,model:job.binding.model,...request})&&equal(JSON.parse(await readFile(join(folder,'receipt.json'),'utf8')),attempt.receipt)&&await readFile(join(folder,'response.txt'),'utf8')===attempt.receipt.responseText,'FINAL_ANCHOR_CHANGED','Exact original prepared packet and protected response required');
   if(isOrdinaryHttp(attempt.receipt))await reopenOrdinaryJob(store.read(id),job,attempt,{executionRoot:root});
   validateFinalReceipt(store.read(id),run,job,attempt,attempt.receipt);
   for(const image of attempt.receipt.images??[]) {const bytes=await readFile(image.path);need(bytes.length===image.byteLength&&createHash('sha256').update(bytes).digest('hex')===image.sha256,'FINAL_ATTACHMENT_CHANGED','Original assigned attachment bytes required');}
   await reopenOrdinaryCompletion(store.read(id),job,attempt,{executionRoot:root,receipt:attempt.receipt,wrappers:[[join(folder,'receipt.json'),JSON.stringify(attempt.receipt)],[join(folder,'response.txt'),attempt.receipt.responseText]]});
   send(id,{kind:'complete-final-visual',jobId:job.id,attemptId:attempt.id});
  }
 }
 async function advanceFinalVisual(id) {
  let p=store.read(id);if(!p.finalVisualIntents?.length)return {status:'not_requested',queuedJobIds:[]};
  try {
   let run=currentRun(id);
   if(!run) {
    const source=finalVisualSource(p,copyDeliveryEnvelope);await sketchReviews.verifyReviewedSketch(id,p.artifacts.find(a=>a.id===source.sketchArtifact.id));
    need(configuration&&configuration.capabilities,'FINAL_CONFIGURATION_REQUIRED','Locally selected finite provider configuration required');
    const assigned=assignments();need(Object.values(assigned).every(b=>b&&typeof b.providerId==='string'&&typeof b.model==='string'),'FINAL_ASSIGNMENT_REQUIRED','Actual owner, image and independent panel bindings required');
    need(assigned.planner.role==='visual-lead'&&assigned.aggregate.role==='visual-lead','FINAL_OWNER_REQUIRED','Actual visual owner must plan and aggregate');
    const allowance=p.finalVisualAllowance??{id:`final-allowance-${hash(id)}`,maxImageCalls:configuration.maxImageCalls,maxReviewCalls:configuration.maxReviewCalls,origin:configuration.origin,version:configuration.version};
    run={id:`fv-${source.sourceHash}`,protocol:FINAL_VISUAL_PROTOCOL,source,assignments:assigned,capabilities:structuredClone(configuration.capabilities),feedbackBaseline:structuredClone((p.humanFeedback??[]).filter(f=>['copy','sketch','visual'].includes(f.stage))),allowance};send(id,{kind:'open-final-visual',run});run=currentRun(id);
   }
   if(run.parentRunId)requireFinalRevisionOwner(p,run);
   const aggregate=run.reports.find(r=>r.nodeKey==='aggregate');if(aggregate&&!aggregate.valid&&aggregate.aggregateParser!==FINAL_AGGREGATE_PARSER){await checked(id,run);send(id,{kind:'reextract-final-aggregate',runId:run.id});run=currentRun(id);}
   await checked(id,run);
   for(const job of store.read(id).jobs.filter(j=>j.finalVisualRunId===run.id&&['running','awaiting_reconciliation'].includes(j.status)&&(j.attempts.at(-1)?.receipt||j.attempts.at(-1)?.httpAttemptLocator)))await recover(id,run,job);
   run=currentRun(id);p=store.read(id);
   const stuck=p.jobs.find(j=>j.finalVisualRunId===run.id&&['failed','blocked','awaiting_reconciliation'].includes(j.status));if(stuck)return {status:stuck.status,reason:stuck.error?.code,queuedJobIds:[]};
   const queue=node=>{if(!store.read(id).jobs.some(j=>j.finalVisualRunId===run.id&&j.nodeKey===node.key))send(id,{kind:'queue-final-visual',runId:run.id,node});};
   const returned=p.finalVisualReturns?.find(r=>r.parentRunId===run.id);
   if(returned) {
    if(returned.obligations.some(o=>o.kind==='condition'&&o.original.status==='unknown'))return {status:'blocked',reason:'FINAL_FACT_EVIDENCE_REQUIRED',runId:run.id,returnId:returned.id,queuedJobIds:[]};
    if(returned.preproduction)return {status:'owner_returned',reason:'FINAL_PREPRODUCTION_REVISION_UNSUPPORTED',runId:run.id,returnId:returned.id,queuedJobIds:[]};
    const requestId=`final-revision-${hash([run.id,returned.id])}`;
    let entry=p.finalVisualRevisionRequests?.find(q=>q.request.id===requestId);
    if(!entry){send(id,{kind:'request-final-visual-revision',parentRunId:run.id,returnId:returned.id,requestId});entry=store.read(id).finalVisualRevisionRequests.find(q=>q.request.id===requestId);}
    if(entry.status==='requested') {queue({key:`revision:${requestId}`,phase:'revision',role:'visual-lead',dependencies:[],requestId});const job=store.read(id).jobs.find(j=>j.finalVisualRunId===run.id&&j.nodeKey===`revision:${requestId}`);return {status:'revision_planning',runId:run.id,returnId:returned.id,queuedJobIds:job.status==='queued'?[job.id]:[]};}
    return {...entry.result,queuedJobIds:[]};
   }
   if(!run.plan)queue({key:'planner',phase:'planner',role:'visual-lead',dependencies:[]});
   else {
    for(const target of run.plan.directions.filter(d=>!run.parentRunId||run.changedDirectionIds.includes(d.directionId)).flatMap(d=>d.targets))queue({key:`image:${target.id}`,phase:'image',role:'visual-lead',dependencies:['planner']});
    const imagesReady=store.read(id).jobs.filter(j=>j.finalVisualRunId===run.id&&j.purpose==='final_visual_image').every(j=>j.status==='succeeded');
    if(imagesReady) {
     for(const image of finalImages(store.read(id),run))await imageStore.read({projectId:id,imageId:image.imageId,expectedHash:image.sha256});
     if(run.parentRunId) {const requirement=finalReviewRequirement(store.read(id),run);if(requirement.status==='converged'){send(id,{kind:'converge-final-visual',runId:run.id});return {status:'converged',runId:run.id,originalRunId:requirement.originalRunId,outcome:requirement.outcome,queuedJobIds:[]};}}
     for(const node of finalPanelNodes())if(node.dependencies.every(key=>run.reports.some(r=>r.nodeKey===key&&r.valid)))queue(node);
     run=currentRun(id);const outcome=finalOutcome(run);
     if(outcome.status==='revision_required'){const report=run.reports.find(r=>r.nodeKey==='director:director');send(id,{kind:'record-final-visual-return',parentRunId:run.id,reportId:report.id});return advanceFinalVisual(id);}
     if(outcome.status==='incomplete')return {...outcome,runId:run.id,queuedJobIds:[]};
     if(outcome.status==='reviewed') {
      queue({key:'aggregate',phase:'aggregate',role:'visual-lead',dependencies:finalPanelNodes().map(n=>n.key)});run=currentRun(id);
      const agg=run.reports.find(r=>r.nodeKey==='aggregate');
      if(agg) {
       need(agg.valid&&agg.raw.decision==='accept'&&equal(agg.raw.payload,finalPayload(store.read(id),run)),'FINAL_AGGREGATE_RETURNED','Visual owner must accept all actual pixels, copy, claims, limitations and dissent');
       let a=store.read(id).artifacts.find(a=>a.finalVisual?.runId===run.id);
       if(!a) {
        const payload=JSON.stringify(agg.raw.payload),folder=join(root,'final-visual-drafts',run.id,agg.id.replace(/[^A-Za-z0-9_-]/g,'_')),payloadRef=join(folder,'reviewed-final-visual.json');await mkdir(folder,{recursive:true});try{await writeFile(payloadRef,payload,{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;need(await readFile(payloadRef,'utf8')===payload,'FINAL_DRAFT_CHANGED','Existing exact draft changed');}
        const job=store.read(id).jobs.find(j=>j.finalVisualRunId===run.id&&j.nodeKey==='aggregate');a={id:`visual-${run.id}`,stage:'visual',provenance:'reviewed_final_visual',finalVisual:{protocol:FINAL_VISUAL_PROTOCOL,runId:run.id,sourceHash:run.source.sourceHash,planHash:run.plan.planHash,payloadHash:hash(payload)},inputVersionIds:[run.source.copyArtifactId,run.source.sketchArtifact.id],payloadRef,contentHash:hash(payload),claims:run.plan.directions.flatMap(d=>d.claims),author:job.attempts.at(-1).executor,technicalReceipts:{},executionReceipt:job.attempts.at(-1).receipt};await checked(id,run);send(id,{kind:'register-final-visual',runId:run.id,artifact:a});
       }
       await verifyFinalVisual(id,a);
       try{requireFinalVisual(store.read(id),a,copyDeliveryEnvelope);}catch(e){if(e.code==='HUMAN_GATE')return {status:'awaiting_human_adoption',artifactId:a.id,draftHash:a.contentHash,queuedJobIds:[]};throw e;}
       send(id,{kind:'release-final-visual',runId:run.id,artifactId:a.id});return {status:'ready_for_content',artifactId:a.id,payloadRef:a.payloadRef,queuedJobIds:[]};
      }
     }
    }
   }
   const jobs=store.read(id).jobs.filter(j=>j.finalVisualRunId===run.id);return {status:run.plan?'producing_or_reviewing':'planning',runId:run.id,queuedJobIds:jobs.filter(j=>j.status==='queued').map(j=>j.id)};
  }catch(e){return {status:'blocked',reason:e.code??'FINAL_EXECUTION_UNAVAILABLE',message:e.message,queuedJobIds:[]};}
 }
 async function execute(id,jobId) {
  let p=store.read(id),job=p.jobs.find(j=>j.id===jobId);if(job.status!=='queued')return job;
  const attemptId=randomUUID(),ctx={...context(),runId:attemptId};let claimed=false;
  try {
   const run=p.finalVisualRuns.find(r=>r.id===job.finalVisualRunId);if(run.parentRunId)requireFinalRevisionOwner(p,run);await checked(id,run);available(run,job);
   if(job.purpose==='final_visual_image') {
    const task=finalImageTask(p,run,job,attemptId),inputs=[];for(const input of task.operation.images){const loaded=await imageStore.read({projectId:id,imageId:input.imageId,expectedHash:input.sha256});inputs.push({...input,...loaded.asset,bytes:loaded.bytes,imageId:input.imageId});}
    const prepared=await imageProvider.prepare(task,inputs);need(prepared.kind==='prepared',prepared.diagnostic??'FINAL_PREPARE_REFUSED','Final image preparation refused before dispatch');await checked(id,run);available(run,job);send(id,{kind:'claim-final-visual',jobId,attemptId,requestHash:prepared.requestHash},ctx);claimed=true;
    const result=await imageProvider.execute(prepared,{evidenceDir});need(result.kind==='image',result.diagnostic??'FINAL_IMAGE_UNKNOWN','Dispatched image outcome remains unknown');send(id,{kind:'anchor-final-visual',jobId,attemptId,receipt:result.receipt},ctx);await recover(id,run,store.read(id).jobs.find(j=>j.id===jobId));
   } else {
    const request=finalRequest(p,run,job.node).request,images=[];for(const i of request.images)images.push((await imageStore.read({projectId:id,imageId:i.imageId,expectedHash:i.sha256})).descriptor);
    await checkCapability(run,job.node,job.node.phase==='planner'?run.source.images:finalImages(p,run));
    const folder=join(root,attemptId);await mkdir(folder,{recursive:true});await writeFile(join(folder,'packet.json'),JSON.stringify({runId:attemptId,model:job.binding.model,...request}),{flag:'wx'});
    await checked(id,run);available(run,job);await checkCapability(run,job.node,job.node.phase==='planner'?run.source.images:finalImages(store.read(id),run));send(id,{kind:'claim-final-visual',jobId,attemptId},ctx);claimed=true;
    const receipt=await invokeOrdinary({executionRoot:root,provider:providers[job.binding.providerId],binding:job.binding,attemptId,request,images,runtimePacketBytes:Buffer.from(JSON.stringify({runId:attemptId,model:job.binding.model,...request})),persistLocator:locator=>send(id,{kind:'anchor-model-http-attempt',jobId,attemptId,locator},ctx)});await writeFile(join(folder,'receipt.json'),JSON.stringify(receipt),{flag:'wx'});await writeFile(join(folder,'response.txt'),receipt.responseText,{flag:'wx'});send(id,{kind:'anchor-final-visual',jobId,attemptId,receipt},ctx);await recover(id,run,store.read(id).jobs.find(j=>j.id===jobId));
   }
  } catch(e) {
   job=store.read(id).jobs.find(j=>j.id===jobId);
   if(claimed&&job.status==='running')send(id,{kind:'fail-final-visual',jobId,attemptId,error:{code:e.code??'FINAL_UNKNOWN',message:e.message}},ctx);
   else if(!claimed&&job.status==='queued')send(id,{kind:'block-queued-job',jobId,error:{code:e.code??'FINAL_UNAVAILABLE',message:e.message}});
  }
  return store.read(id).jobs.find(j=>j.id===jobId);
 }
 async function verifyFinalVisual(id,a) {
  const run=store.read(id).finalVisualRuns?.find(r=>r.id===a.finalVisual?.runId);need(run,'FINAL_RUN_REQUIRED','Original final visual run required');await checked(id,run);requireFinalVisual(store.read(id),a,copyDeliveryEnvelope,{phase:'registration'});const bytes=await readFile(a.payloadRef,'utf8');need(hash(bytes)===a.contentHash&&equal(JSON.parse(bytes),finalPayload(store.read(id),run)),'FINAL_DRAFT_CHANGED','Actual exact complete readable payload required');return {payload:JSON.parse(bytes),images:finalImages(store.read(id),run),reviewed:finalOutcome(run)};
 }
 function adjustFinalVisualAllowance(id,adjustmentId) {
  const adjustment=configuration?.allowanceAdjustments?.find(a=>a.id===adjustmentId);need(adjustment,'FINAL_ALLOWANCE_ADJUSTMENT_UNCONFIGURED','Named trusted local final review adjustment required');validateFinalReviewAdjustment(adjustment);
  send(id,{kind:'adjust-final-visual-review-allowance',adjustment});return store.read(id).finalVisualAllowance;
 }
 return {adjustFinalVisualAllowance,continueFinalVisual,advanceFinalVisual,execute,verifyFinalVisual,capability:()=>({protocol:FINAL_VISUAL_PROTOCOL,executionIntegrated:true,configured:!!configuration,semanticApproval:false,realEnvelopeVerified:false,limits:['Real final pixel and content-consumer capacity not yet established.']})};
}
