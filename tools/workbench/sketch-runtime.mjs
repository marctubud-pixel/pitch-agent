import {reopenOrdinaryCompletion} from './ordinary-model-project.mjs';
import {verifyOrdinaryProject,restoreOrdinaryJob} from './ordinary-model-project.mjs';
import {invokeOrdinary,reopenOrdinary,isOrdinaryHttp,ordinarySuccessfulStatus,ordinaryHasContext} from './ordinary-model.mjs';
import {configFields,configNeed,configText,configPositive,configAllowance} from './configuration-values.mjs';
import {randomUUID} from 'node:crypto';
import {hostname} from 'node:os';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {isDeepStrictEqual as equal} from 'node:util';
import {loadImageProvider} from './image-api-provider.mjs';
import {verifySketchOriginal} from './sketch-original.mjs';
import {copyDeliveryEnvelope} from './project.mjs';
import {SKETCH_PURPOSES,sketchHash as hash,sketchRequire as need,requireConfiguredImageAllowanceAdjustment,sketchSource,requireCurrentSketchGeneration,sketchTextInput,sketchTextRequest,imageTask,sketchReviewPacket,requireReviewedSketch} from './sketch-authority.mjs';

export function createSketchRuntime({store,root,references,providers,bindings,imageStore,imageProvider,configuration}) {
  const coordinator=()=>({actorType:'agent',actorId:'sketch-coordinator',runId:randomUUID(),contextId:randomUUID(),now:new Date().toISOString()});
  const send=(id,c,context=coordinator())=>store.command(id,{...c,commandId:randomUUID(),expectedRevision:store.read(id).revision},context);
  const evidenceDir=join(root,'image-provider-evidence');
  const localEvidence=loadImageProvider({resolveCredential:()=>undefined});
  const evidenceProvider=imageProvider??localEvidence;
  const jobOf=(id,jobId)=>store.read(id).jobs.find(j=>j.id===jobId);
  function configuredBindings() {
    const image=imageProvider?.capability();
    need(image?.invocationSupported&&image.binding,'IMAGE_PROVIDER_UNAVAILABLE','A configured image provider and credential are required');
    need(configuration&&Number.isSafeInteger(configuration.maxCalls)&&configuration.maxCalls>0&&configuration.origin&&configuration.version,'IMAGE_ALLOWANCE_UNAVAILABLE','Finite trusted invocation configuration is required');
    const result={producer:bindings.reference_lead,consumer:bindings.sketch,image:image.binding};
    for(const [role,binding] of Object.entries(result).filter(([role])=>role!=='image'))need(binding&&providers[binding.providerId]?.model===binding.model,'SKETCH_OWNER_UNAVAILABLE',`Assigned ${role} provider is unavailable`);
    need(result.producer.role==='references-lead'&&result.consumer.role==='sketch-lead','SKETCH_OWNER_UNAVAILABLE','Distinct reference and sketch owner roles required');
    return result;
  }
  function requireExecution(job) {
    if(job.purpose==='image_candidate') {
      const capability=imageProvider?.capability();
      need(capability?.invocationSupported,'IMAGE_PROVIDER_UNAVAILABLE','Assigned image invocation is unavailable');
      need(equal(capability.binding,job.binding),'SKETCH_BINDING_CHANGED','Queued image assignment cannot use a replacement provider');
    } else {
      const binding=bindings[job.nodeKey==='producer'?'reference_lead':'sketch'];
      need(equal(binding,job.binding),'SKETCH_BINDING_CHANGED','Queued owner assignment cannot use a replacement provider');
      need(providers[job.binding.providerId]?.model===job.binding.model,'SKETCH_OWNER_UNAVAILABLE','Assigned owner invocation is unavailable');
    }
  }
  async function checked(projectId,g) {
    await verifyOrdinaryProject(store.read(projectId),{executionRoot:root});
    let result;
    for(let n=0;n<12;n++) {
      result=await references.checkedSelection(projectId,g?.source.dossierId);
      if(result.state.reason!=='REFERENCE_INPUT_CHANGED')break;
    }
    need(result.state.status==='ready_for_sketch','SKETCH_REFERENCE_REQUIRED',result.state.reason??'Current checked reference selection required');
    const p=store.read(projectId);
    const source=sketchSource(p,result.dossier,result.state);
    if(g) {
      need(equal(source,g.source),'SKETCH_SOURCE_STALE','Checked reference source changed');
      requireCurrentSketchGeneration(p,g,copyDeliveryEnvelope);
      for(const job of p.jobs.filter(j=>j.generationId===g.id&&j.report))await verifySketchOriginal(p,g,job,{executionRoot:root,imageStore});
    }
    return {p,source};
  }
  async function continueSketch(projectId,request) {
    need(Object.keys(request).every(k=>['commandId','expectedRevision'].includes(k)),'INVALID_SKETCH_INTENT','Only continuation identity and revision are accepted');
    const p=store.read(projectId),prior=p.sketchIntents?.find(i=>i.id===request.commandId);
    if(prior)need(equal(prior.request,request),'COMMAND_ID_REUSED','Continuation ID reused');
    else store.command(projectId,{kind:'request-sketch-continuation',request,commandId:request.commandId,expectedRevision:request.expectedRevision},coordinator());
    return advanceSketch(projectId);
  }
  async function importAnchored(projectId,job) {
    const p=store.read(projectId),g=p.sketchGenerations.find(g=>g.id===job.generationId),attempt=job.attempts.at(-1);
    const result=await evidenceProvider.recover(imageTask(p,g,job,attempt.id),attempt.id,evidenceDir,{expectedEvidence:attempt.responseEvidence});
    need(result.kind==='image'&&equal(result.receipt,attempt.receipt),'SKETCH_EVIDENCE_UNAVAILABLE','Saved success evidence could not be verified locally');
    const asset=await imageStore.ingestGenerated({projectId,result});
    await imageStore.read({projectId,imageId:asset.id,expectedHash:asset.sha256});
    send(projectId,{kind:'complete-image-candidate',jobId:job.id,attemptId:attempt.id,asset});
  }
  async function advanceSketch(projectId) {
    let p=store.read(projectId);
    for(const job of p.jobs.filter(j=>['sketch_owner','sketch_plan'].includes(j.purpose)&&['running','awaiting_reconciliation'].includes(j.status)&&j.attempts.at(-1)?.httpAttemptLocator)){
      try{const receipt=await restoreOrdinaryJob(store,root,projectId,job.id,{imageStore}),attempt=job.attempts.at(-1),raw=JSON.parse(receipt.responseText),payloadRef=join(root,attempt.id,'sketch-report.json');
      try{await writeFile(payloadRef,JSON.stringify(raw),{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;need(await readFile(payloadRef,'utf8')===JSON.stringify(raw),'SKETCH_RECEIPT_CHANGED','Retained normalized text report changed');}
      {const p=store.read(projectId),j=p.jobs.find(j=>j.id===job.id);await reopenOrdinaryCompletion(p,j,j.attempts.at(-1),{executionRoot:root,receipt,wrappers:[[payloadRef,JSON.stringify(raw)],[join(root,attempt.id,'receipt.json'),JSON.stringify(receipt)]]});}
      send(projectId,{kind:'complete-sketch-text',jobId:job.id,attemptId:attempt.id,raw,payloadRef,receipt},attempt.executor);
      }catch(error){return {status:'awaiting_reconciliation',reason:error.code??'SKETCH_EVIDENCE_UNAVAILABLE',queuedJobIds:[]};}
    }
    p=store.read(projectId);
    for(const job of p.jobs.filter(j=>j.purpose==='image_candidate'&&['running','awaiting_reconciliation'].includes(j.status)&&j.attempts.at(-1)?.responseEvidence)) {
      try{await importAnchored(projectId,job);}catch(error){return {status:'awaiting_reconciliation',reason:error.code??'SKETCH_EVIDENCE_UNAVAILABLE',queuedJobIds:[]};}
    }
    p=store.read(projectId);
    if(!p.sketchIntents?.length)return {status:'not_requested',queuedJobIds:[]};
    try {
      const {source}=await checked(projectId);
      p=store.read(projectId);
      let g=p.sketchGenerations?.find(g=>g.source.sourceHash===source.sourceHash);
      if(!g) {
        const currentBindings=configuredBindings();
        const allowance=p.imageAllowance??{id:`image-allowance-${hash(p.id)}`,maxCalls:configuration.maxCalls,origin:configuration.origin,configurationVersion:configuration.version};
        g={id:`generation-${source.sourceHash}`,source,bindings:currentBindings,allowanceFamilyId:allowance.id};
        send(projectId,{kind:'open-sketch-generation',generation:g,allowance});
      }
      p=store.read(projectId);g=p.sketchGenerations.find(x=>x.id===g.id);
      await checked(projectId,g);
      p=store.read(projectId);
      const jobs=p.jobs.filter(j=>j.generationId===g.id);
      const failed=jobs.find(j=>['awaiting_reconciliation','blocked','failed'].includes(j.status));
      const returned=jobs.find(j=>j.report?.raw.decision==='return');
      if(returned)return {status:'returned',findings:returned.report.raw.findings,queuedJobIds:[]};
      for(const node of ['producer','consumer','planner']) {
        const job=jobs.find(j=>j.nodeKey===node);
        if(!job) {send(projectId,{kind:'queue-sketch-node',generationId:g.id,nodeKey:node});break;}
        if(job.status!=='succeeded')break;
      }
      const current=store.read(projectId),queuedJobIds=current.jobs.filter(j=>j.generationId===g.id&&j.status==='queued').map(j=>j.id);
      return {generationId:g.id,status:failed?failed.status:g.plan&&jobs.filter(j=>j.purpose==='image_candidate').every(j=>j.status==='succeeded')?'candidates_ready':g.plan?'producing':'waiting_handoff_or_plan',...(failed?{reason:failed.error?.code}:{}),queuedJobIds};
    } catch(error) {return {status:'blocked',reason:error.code??'SKETCH_UNAVAILABLE',queuedJobIds:[]};}
  }
  async function execute(projectId,jobId) {
    let p=store.read(projectId),job=p.jobs.find(j=>j.id===jobId);
    if(job.status!=='queued')return job;
    const attemptId=randomUUID(),context={actorType:'agent',actorId:`sketch-worker-${attemptId}`,runId:attemptId,contextId:randomUUID(),executorHost:hostname(),executorPid:process.pid,now:new Date().toISOString()};
    let claimed=false,receipt;
    try {
      let g=p.sketchGenerations.find(g=>g.id===job.generationId);
      await checked(projectId,g);
      requireExecution(job);
      if(job.purpose==='image_candidate') {
        const task=imageTask(p,g,job,attemptId),inputs=[];
        for(const input of task.operation.images??[]) {const image=await imageStore.read({projectId,imageId:input.imageId,expectedHash:input.sha256});inputs.push({...input,...image.asset,bytes:image.bytes,imageId:input.imageId});}
        const prepared=await imageProvider.prepare(task,inputs);
        need(prepared.kind==='prepared',prepared.diagnostic??'IMAGE_PREPARE_REFUSED','Image preparation refused before dispatch');
        await checked(projectId,g);
        requireCurrentSketchGeneration(store.read(projectId),g,copyDeliveryEnvelope);
        requireExecution(job);
        send(projectId,{kind:'claim-sketch-job',jobId,attemptId,requestHash:prepared.requestHash},context);claimed=true;
        const result=await imageProvider.execute(prepared,{evidenceDir});receipt=result.receipt;
        need(result.kind==='image',result.diagnostic??receipt?.diagnostic??'IMAGE_OUTCOME_UNKNOWN','Dispatched image result requires reconciliation');
        send(projectId,{kind:'anchor-image-response',jobId,attemptId,receipt},context);
        await importAnchored(projectId,jobOf(projectId,jobId));
      } else {
        const input=sketchTextInput(p,g,job),request=sketchTextRequest(input),packet={runId:attemptId,model:job.binding.model,...request},folder=join(root,attemptId);
        await mkdir(folder,{recursive:true});await writeFile(join(folder,'packet.json'),JSON.stringify(packet),{flag:'wx'});
        await checked(projectId,g);
        requireCurrentSketchGeneration(store.read(projectId),g,copyDeliveryEnvelope);
        requireExecution(job);
        send(projectId,{kind:'claim-sketch-job',jobId,attemptId},context);claimed=true;
        receipt=await invokeOrdinary({executionRoot:root,provider:providers[job.binding.providerId],binding:job.binding,attemptId,request,runtimePacketBytes:Buffer.from(JSON.stringify(packet)),persistLocator:locator=>send(projectId,{kind:'anchor-model-http-attempt',jobId,attemptId,locator},context)});
        await writeFile(join(folder,'receipt.json'),JSON.stringify(receipt),{flag:'wx'});
        const raw=JSON.parse(receipt.responseText),payloadRef=join(folder,'sketch-report.json');
        await writeFile(payloadRef,JSON.stringify(raw),{flag:'wx'});
        await checked(projectId,g);
        {const p=store.read(projectId),j=p.jobs.find(j=>j.id===jobId);await reopenOrdinaryCompletion(p,j,j.attempts.at(-1),{executionRoot:root,receipt,wrappers:[[join(folder,'receipt.json'),JSON.stringify(receipt)],[payloadRef,JSON.stringify(raw)]]});}
        send(projectId,{kind:'complete-sketch-text',jobId,attemptId,raw,payloadRef,receipt},context);
      }
    } catch(error) {
      const current=jobOf(projectId,jobId);
      if(claimed&&current.status==='running')send(projectId,{kind:'finish-sketch-error',jobId,attemptId,error:{code:error.code??'SKETCH_EXECUTION_FAILED',message:error.message},...(receipt?{receipt}:{})},context);
      else if(!claimed&&current.status==='queued')send(projectId,{kind:'block-queued-job',jobId,error:{code:error.code??'SKETCH_INPUT_UNAVAILABLE',message:error.message}});
    }
    return jobOf(projectId,jobId);
  }
  async function sketchReviewInput(projectId,generationId) {
    const p=store.read(projectId),g=p.sketchGenerations?.find(g=>g.id===generationId);
    await checked(projectId,g);
    const packet=sketchReviewPacket(store.read(projectId),g,copyDeliveryEnvelope);
    for(const candidate of packet.candidates) {
      const current=store.read(projectId),job=current.jobs.find(j=>j.id===candidate.jobId);
      await verifySketchOriginal(current,g,job,{executionRoot:root,imageStore});
    }
    requireCurrentSketchGeneration(store.read(projectId),g,copyDeliveryEnvelope,{complete:true});
    return packet;
  }
  async function verifyReviewedSketch(projectId,artifact) {
    await sketchReviewInput(projectId,artifact.sketchGeneration?.generationId);
    const p=store.read(projectId);requireReviewedSketch(p,artifact,copyDeliveryEnvelope,{phase:'registration'});
    for(const record of [...p.reviews.filter(r=>r.artifactId===artifact.id),...p.decisions.filter(d=>artifact.sketchGeneration.dispositionIds.includes(d.id))]) {
      const folder=join(root,record.attemptId),job=p.jobs.find(j=>j.id===record.jobId);
      const bytes=await readFile(join(folder,'sketch-review.json'),'utf8');
      need(equal(JSON.parse(await readFile(join(folder,'receipt.json'),'utf8')),record.executionReceipt)&&equal(JSON.parse(await readFile(join(folder,'packet.json'),'utf8')),{runId:record.attemptId,model:job.binding.model,...job.task.request}),'SKETCH_REVIEW_REQUIRED','Saved original review request and receipt required');
      need(equal(JSON.parse(bytes),record.rawReport),'SKETCH_REVIEW_REQUIRED','Saved original review bytes required');
    }
    const bytes=await readFile(artifact.payloadRef,'utf8');need(hash(bytes)===artifact.contentHash&&equal(JSON.parse(bytes),{protocol:'reviewed-sketch-generation-v1',...artifact.sketchGeneration}),'SKETCH_REVIEW_CHANGED','Actual reviewed artifact must encode the exact reviewed generation and selected candidates');
    requireReviewedSketch(store.read(projectId),artifact,copyDeliveryEnvelope,{phase:'registration'});
  }
  async function registerReviewedSketch(projectId,artifact) {
    await verifyReviewedSketch(projectId,artifact);
    return send(projectId,{kind:'register-reviewed-sketch',artifact});
  }
  function adjustImageAllowance(projectId,adjustmentId) {
    const adjustment=configuration?.allowanceAdjustments?.find(a=>a.id===adjustmentId);
    need(adjustment,'IMAGE_ALLOWANCE_ADJUSTMENT_UNCONFIGURED','Only an explicitly named trusted local configuration adjustment can extend this family');
    requireConfiguredImageAllowanceAdjustment(adjustment);
    const old=store.read(projectId).imageAllowance?.adjustments?.find(a=>a.id===adjustmentId);
    if(old){const {priorOrigin,used,appliedBy,...configured}=old;need(equal(configured,adjustment),'IMAGE_ALLOWANCE_ADJUSTMENT_CHANGED','Applied adjustment is immutable');return store.read(projectId).imageAllowance;}
    send(projectId,{kind:'adjust-project-image-allowance',adjustment:structuredClone(adjustment)});return store.read(projectId).imageAllowance;
  }
  function capability(){try{configuredBindings();return {generationIntegrated:true,reviewExecutionIntegrated:false,available:true,liveVerification:'not_verified'};}catch(error){return {generationIntegrated:true,reviewExecutionIntegrated:false,available:false,reason:error.code,liveVerification:'not_verified'};}}
  return {capability,adjustImageAllowance,continueSketch,advanceSketch,execute,sketchReviewInput,verifyReviewedSketch,registerReviewedSketch};
}

export function validateSketchConfiguration(c) {
 configAllowance(c,'/',['maxCalls','origin','version','allowanceAdjustments']);configNeed(configPositive(c.maxCalls),'/maxCalls');
 if(c.allowanceAdjustments!==undefined){configNeed(Array.isArray(c.allowanceAdjustments),'/allowanceAdjustments');for(const a of c.allowanceAdjustments){requireConfiguredImageAllowanceAdjustment(a);configFields(a,['id','familyId','before','maxCalls','origin','configurationVersion','authority','reason'],'/allowanceAdjustments');configNeed(['id','familyId','origin','configurationVersion','authority','reason'].every(k=>configText(a[k]))&&configPositive(a.maxCalls),'/allowanceAdjustments');configFields(a.before,['maxCalls','configurationVersion'],'/allowanceAdjustments/before');configNeed(configPositive(a.before.maxCalls)&&configText(a.before.configurationVersion),'/allowanceAdjustments/before');}}
 return [{key:'reference_lead',role:'references-lead'},{key:'sketch',role:'sketch-lead'}];
}
