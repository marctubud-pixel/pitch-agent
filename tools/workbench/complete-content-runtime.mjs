import {contentOutputAdmission} from './content-output-admission.mjs';
import {admitContentOriginalRetention} from './content-resource-originals.mjs';
import {CONTENT_RESOURCE_PROFILE,requireContentBytes,scanContentJSON,admitContentDispatch} from './content-resource-policy.mjs';
import {ordinaryLogicalBytes,ORDINARY_HTTP_PROVIDER} from './ordinary-model.mjs';
import {persistContentPlanningOriginal,reopenContentPlanningOriginal} from './content-planning-original.mjs';
import {reopenOrdinaryCompletion} from './ordinary-model-project.mjs';
import {verifyOrdinaryProject,restoreOrdinaryJob,reopenOrdinaryJob} from './ordinary-model-project.mjs';
import {invokeOrdinary,reopenOrdinary,isOrdinaryHttp,ordinarySuccessfulStatus,ordinaryHasContext} from './ordinary-model.mjs';
import {MODEL_VIEW_CONTENT_CONTRACT,planningContentPacket,NUMERIC_CONTENT_CONTRACT,PLANNING_CONTENT_CONTRACT,numericContentPacket,contentContractForPacket} from './content-contract-versions.mjs';
import {verifyResearchDataOriginal,verifyStageOriginal} from './stage-original.mjs';
import {verifyContentOriginal} from './content-original.mjs';
import {validateFinalCapability} from './final-visual.mjs';
import {configFields,configNeed,configText,configPositive,configAllowance,configEvidence} from './configuration-values.mjs';
import {checkedLayoutContract,requireLayoutPreparationBinding,requireLayoutPreparationCurrent} from './layout-boundary.mjs';
import {readManagedLayoutBytes} from './managed-layout-bytes.mjs';
import {makeProjectedContentSource,resolveContentReferenceContext} from './content-visibility.mjs';
import {randomUUID,createHash} from 'node:crypto';
import {hostname} from 'node:os';
import {mkdir,readFile,writeFile,realpath,stat,statfs} from 'node:fs/promises';
import {join,sep} from 'node:path';
import {isDeepStrictEqual as equal} from 'node:util';
import {contentSourceEnvelope as contentSourceBuilder,copyDeliveryEnvelope} from './project.mjs';
import {finalEnvelope,requireFinalVisual} from './final-visual.mjs';
import {sketchHash as hash,sketchRequire as need} from './sketch-authority.mjs';
import {prepareContentInvocation,CONTENT_PROTOCOL,CONTENT_PURPOSES,contentNodes,contentJob,contentPlanningManifest,contentPlanningCorrection,contentAllowance,contentCalls,requireContentCurrent,contentRequest,ingestContent,validateContentReceipt,contentReviewOutcome,requireCompleteContent,completeContentLayoutContract} from './complete-content.mjs';

export function createCompleteContentRuntime({store,root,providers,bindings,imageStore,finalVisuals,configuration}) {
 const numeric=()=>numericContentPacket(configuration?.packetVersion);
 const v3=()=>['content-packet-v3',NUMERIC_CONTENT_CONTRACT.packet,PLANNING_CONTENT_CONTRACT.packet,MODEL_VIEW_CONTENT_CONTRACT.packet].includes(configuration?.packetVersion);
 const packetVersion=()=>numeric()?configuration.packetVersion:'content-packet-v3';
 const basisFor=(p,contents,packet=configuration?.packetVersion)=>contentSourceBuilder(p,contents,...(numericContentPacket(packet)?[{contract:packet===MODEL_VIEW_CONTENT_CONTRACT.packet?MODEL_VIEW_CONTENT_CONTRACT:planningContentPacket(packet)?PLANNING_CONTENT_CONTRACT:NUMERIC_CONTENT_CONTRACT}]:[]));
 const manuscriptVersion=()=>numeric()?NUMERIC_CONTENT_CONTRACT.manuscript:'complete-manuscript-v2';
 const ctx=()=>({actorType:'agent',actorId:randomUUID(),runId:randomUUID(),contextId:randomUUID(),executorHost:hostname(),executorPid:process.pid,now:new Date().toISOString()});
 const send=(id,c,context=ctx())=>store.command(id,{...c,commandId:randomUUID(),expectedRevision:store.read(id).revision},context);
 const assignments=()=>Object.fromEntries(contentNodes().map(n=>[n.key,n.key==='producer:strategy'?bindings.strategy:n.key==='producer:copy'?bindings.copy:bindings[`content_${n.key.replaceAll(':','_')}`]]));
 async function readContents(p) {
  const ids=new Set(),visit=id=>{if(ids.has(id))return;const a=p.artifacts.find(a=>a.id===id);if(!a)return;ids.add(id);[...a.inputVersionIds,...(a.revision?[a.revision.revisionOf.artifactId]:[])].forEach(visit);};visit(p.activeByStage.strategy);visit(p.activeByStage.copy);
  const base=await realpath(root),out=[];
  for(const artifactId of ids){const a=p.artifacts.find(a=>a.id===artifactId),path=await realpath(a.payloadRef),info=await stat(path),v5=planningContentPacket(configuration?.packetVersion);need(path.startsWith(base+sep)&&info.isFile()&&info.size<=(v5?CONTENT_RESOURCE_PROFILE.sourceFileBytes:1024*1024),'CONTENT_SOURCE_BYTES_UNAVAILABLE','Original source must stay in managed bounded storage');const contentText=v5?(await readManagedLayoutBytes(root,a.payloadRef,CONTENT_RESOURCE_PROFILE.sourceFileBytes)).toString('utf8'):await readFile(path,'utf8');need(hash(contentText)===a.contentHash,'CONTENT_SOURCE_BYTES_CHANGED','Exact source bytes required');out.push({artifactId,contentText});}if(planningContentPacket(configuration?.packetVersion))requireContentBytes('sourceTotalBytes',out.reduce((sum,c)=>sum+Buffer.byteLength(c.contentText),0));return out;
 }
 function currentRoot(id) {const p=store.read(id);if(numeric()){const last=p.jobs.findLast(j=>j.purpose==='complete_content_plan');return last?.task.packetVersion===packetVersion()&&(!p.contentNumericRevisionIntents?.length||last.id===p.contentNumericRevisionIntents.at(-1).rootJobId)?last:undefined;}return [...p.jobs].reverse().find(j=>j.purpose==='complete_content_plan'&&(()=>{try{requireContentCurrent(p,j,contentSourceBuilder);return true;}catch{return false;}})());}
 async function checkSpace() {const fs=await statfs(root,{bigint:true});need(fs.bavail*fs.bsize>=1073741824n,'CONTENT_STORAGE_LOW','At least one GiB free is required before another controlled dispatch');}
 async function checked(id,r,{retainingInvalidPlanning=false}={}) {
  if(planningContentPacket(r.task.packetVersion)){await reopenContentPlanningOriginal(store.read(id),r,{executionRoot:root});await admitContentOriginalRetention(store.read(id),r,{executionRoot:root});}
  await verifyOrdinaryProject(store.read(id),{executionRoot:root});
  const p=store.read(id),basis=basisFor(p,await readContents(p),r.task.packetVersion);requireContentCurrent(p,r,()=>basis);need(equal(['content-packet-v3',NUMERIC_CONTENT_CONTRACT.packet,PLANNING_CONTENT_CONTRACT.packet,MODEL_VIEW_CONTENT_CONTRACT.packet].includes(r.task.packetVersion)?makeProjectedContentSource(p,basis):basis,r.task.source),'CONTENT_SOURCE_BYTES_CHANGED','Original actual complete source bytes changed');
  const visual=p.artifacts.find(a=>a.id===r.task.source.visual.artifactId);await finalVisuals.verifyFinalVisual(id,visual);requireFinalVisual(store.read(id),visual,copyDeliveryEnvelope,{phase:'release'});
  if(['content-packet-v3',NUMERIC_CONTENT_CONTRACT.packet,PLANNING_CONTENT_CONTRACT.packet,MODEL_VIEW_CONTENT_CONTRACT.packet].includes(r.task.packetVersion))await verifyReferences(p,r.task.source.immutableBasis);
  if(numericContentPacket(r.task.packetVersion))await verifyNumericOriginals(p,r.task.source);
  for(const i of r.task.source.images)await imageStore.read({projectId:id,imageId:i.imageId,expectedHash:i.sha256});

  for(const j of p.jobs.filter(j=>j.contentRootJobId===r.id&&j.contentReport))await verifyContentOriginal(p,r,j,{executionRoot:root,retainInvalidPlan:retainingInvalidPlanning});
  for(const old of r.task.correction?.originalReports??[]){const j=p.jobs.find(j=>j.id===old.jobId),originalRoot=p.jobs.find(x=>x.id===j.contentRootJobId);await verifyContentOriginal(p,originalRoot,j,{executionRoot:root,retainInvalidPlan:true});}
 }
 async function managedBytes(path,maxBytes=8*1024*1024,http=false) {
  if(http)return readManagedLayoutBytes(root,path,maxBytes);
  const base=await realpath(root),actual=await realpath(path),info=await stat(actual);
  need(actual.startsWith(base+sep)&&info.isFile()&&info.size<=maxBytes,'CONTENT_ORIGINAL_BYTES_UNAVAILABLE','Exact bounded bytes in managed execution storage required');
  return readFile(actual);
 }
 async function verifyReferences(p,basis) {
  const context=resolveContentReferenceContext(p,basis);
  for(const record of context.records){
   const dossier=p.referenceDossiers.find(d=>d.id===record.dossierId),stored=dossier.reports.find(x=>x.id===record.reportId),receipt=stored.executionReceipt,folder=join(root,receipt.attemptId);
   need(stored.payloadRef===join(folder,'reference-report.json'),'CONTENT_REFERENCE_BYTES_CHANGED','Exact original managed reference report location required');
   const bytes=await managedBytes(stored.payloadRef,8*1024*1024,isOrdinaryHttp(receipt)),packet=JSON.parse((await managedBytes(join(folder,'packet.json'),8*1024*1024,isOrdinaryHttp(receipt))).toString('utf8'));
   if(isOrdinaryHttp(receipt)){const job=p.jobs.find(j=>j.id===receipt.taskId),attempt=job?.attempts.find(a=>a.id===receipt.attemptId);need(attempt,'CONTENT_REFERENCE_BYTES_CHANGED','Original reference producer required');await reopenOrdinaryJob(p,job,attempt,{executionRoot:root,receipt});}
   need(hash(bytes.toString('utf8'))===stored.reportHash&&equal(JSON.parse(bytes),stored.rawReport)&&packet.projectId===p.id&&packet.jobId===receipt.taskId&&packet.attemptId===receipt.attemptId&&hash({runId:receipt.attemptId,model:receipt.model,prompt:packet.prompt,outputSchema:packet.outputSchema,...(packet.images?.length?{images:packet.images}:{})})===receipt.inputPacketHash,'CONTENT_REFERENCE_BYTES_CHANGED','Original reference report and exact packet bytes required');
   for(const image of receipt.images??[]){const actual=await imageStore.read({projectId:p.id,imageId:image.imageId,expectedHash:image.sha256});need(actual.descriptor.byteLength===image.byteLength&&actual.descriptor.mediaType===image.mediaType,'CONTENT_ATTACHMENT_CHANGED','Reference original attachment bytes changed');}
  }
  return context;
 }
 async function verifyNumericOriginals(p,source) {
  for(const admission of source.researchChartAdmissions){
   const artifact=p.artifacts.find(a=>a.id===admission.artifactId);
   await verifyResearchDataOriginal(p,artifact,{executionRoot:root});
  }
  for(const id of [source.strategy.artifactId,source.copy.artifactId])await verifyStageOriginal(p,p.artifacts.find(a=>a.id===id),{executionRoot:root});
 }
 async function preflightNumericRevision(id){
  const p=store.read(id),predecessor=p.jobs.filter(j=>j.purpose==='complete_content_plan').at(-1);
  need(numericContentPacket(predecessor?.task.packetVersion),'CONTENT_NUMERIC_PREDECESSOR_STALE','Latest numeric predecessor required');
  need(!p.jobs.some(j=>CONTENT_PURPOSES.includes(j.purpose)&&j.attempts.some(a=>a.dispatchStarted&&a.status!=='succeeded')),'CONTENT_UNKNOWN_BLOCKS','Reconcile unknown originals before revision');
  const contents=await readContents(p),source=makeProjectedContentSource(p,basisFor(p,contents));
  await finalVisuals.verifyFinalVisual(id,p.artifacts.find(a=>a.id===source.visual.artifactId));
  await verifyReferences(p,source.immutableBasis);await verifyNumericOriginals(p,source);
  for(const image of source.images)await imageStore.read({projectId:id,imageId:image.imageId,expectedHash:image.sha256});
  for(const j of p.jobs.filter(j=>j.contentRootJobId===predecessor.id&&j.contentReport))await verifyContentOriginal(p,predecessor,j,{executionRoot:root});
  need(store.read(id).revision===p.revision,'REVISION_CONFLICT','Project changed during verified revision reads');
  return {predecessor,contents,source};
 }
 async function preflightContentRevision(id) {
  const p=store.read(id),predecessor=[...p.jobs].reverse().find(j=>j.purpose==='complete_content_plan'&&j.task.packetVersion!=='content-packet-v3');
  need(predecessor,'CONTENT_PROJECTION_PREDECESSOR_STALE','Known completed legacy predecessor required');
  const contents=await readContents(p),basis=contentSourceBuilder(p,contents);
  need(equal(basis,predecessor.task.source),'CONTENT_SOURCE_STALE','Current exact complete original sources required');
  await finalVisuals.verifyFinalVisual(id,p.artifacts.find(a=>a.id===basis.visual.artifactId));
  await verifyReferences(p,basis);
  if(numeric())await verifyNumericOriginals(p,basis);
  for(const image of basis.images)await imageStore.read({projectId:id,imageId:image.imageId,expectedHash:image.sha256});
  for(const job of p.jobs.filter(j=>j.contentRootJobId&&j.contentReport)){const originalRoot=p.jobs.find(r=>r.id===job.contentRootJobId);await verifyContentOriginal(p,originalRoot,job,{executionRoot:root,retainInvalidPlan:true});}
  const source=makeProjectedContentSource(p,basis),author=contentJob(p,predecessor,'author'),qualification=basis.obligations.find(o=>o.kind==='qualification');
  need(author?.contentReport&&qualification,'CONTENT_PROJECTION_FINDING_REQUIRED','Actual original giant manuscript evidence required');
  return {predecessor,contents,source,finding:{code:'CONTENT_RAW_QUALIFICATION_PROJECTION',evidenceHash:hash({sourceHash:basis.sourceHash,qualification,manuscriptHash:hash(author.contentReport.raw.manuscript)})},budget:{consumedCalls:contentCalls(p),maxCalls:contentAllowance(p).maxCalls,prospectiveCalls:contentNodes().length,requiredCumulativeCeiling:contentCalls(p)+contentNodes().length,dispatchAllowed:contentCalls(p)+contentNodes().length<=contentAllowance(p).maxCalls}};
 }
 function publicIntent(request) {
  need(request&&Object.keys(request).every(k=>['commandId','expectedRevision'].includes(k))&&typeof request.commandId==='string'&&request.commandId.length>0&&request.commandId!=='__proto__'&&Number.isSafeInteger(request.expectedRevision)&&request.expectedRevision>=0,'INVALID_CONTENT_INTENT','Only command identity and expected revision accepted');
 }
 async function reviseContent(id,request) {
  publicIntent(request);if(planningContentPacket(packetVersion()))requireConfiguredV5Profile();
  if(numeric()){
   const p=store.read(id),prior=p.processedCommands[request.commandId];
   if(prior){need(JSON.parse(prior).kind==='request-content-numeric-continuation','COMMAND_ID_REUSED','Exact numeric revision identity required');return advanceContent(id);}
   need(p.revision===request.expectedRevision,'REVISION_CONFLICT','Exact current revision required');
   const {predecessor,contents,source}=await preflightNumericRevision(id);
   store.command(id,{kind:'request-content-numeric-continuation',...(planningContentPacket(packetVersion())?{packetVersion:packetVersion()}:{}),...request,predecessorRootJobId:predecessor.id,sourceHash:source.sourceHash,sourceContents:contents,assignments:configuredAssignments(),capabilities:configuration.capabilities},ctx());
   return advanceContent(id);
  }
  need(v3(),'CONTENT_CONFIGURATION_REQUIRED','Explicit current v3 runtime configuration required');
  const p=store.read(id),prior=p.processedCommands[request.commandId];
  if(prior){const saved=JSON.parse(prior);need(equal({kind:saved.kind,commandId:saved.commandId},{kind:'request-content-visibility-continuation',commandId:request.commandId}),'COMMAND_ID_REUSED','Revision command cannot change');return advanceContent(id);}
  need(p.revision===request.expectedRevision,'REVISION_CONFLICT','Exact current project revision required');
  const {predecessor,source,finding}=await preflightContentRevision(id),assigned=configuredAssignments();
  for(const node of contentNodes()){const cap=configuration.capabilities?.[node.key];need(cap?.operation===CONTENT_PROTOCOL&&cap.packetVersion===packetVersion(),'CONTENT_CAPABILITY_REQUIRED','Prospective revision requires current explicit v3 capability for every node');finalEnvelope(source.images,{...cap,operation:'final-visual-v1'},assigned[node.key]);}
  store.command(id,{kind:'request-content-visibility-continuation',...request,predecessorRootJobId:predecessor.id,basisSourceHash:source.basisSourceHash,assignments:assigned,capabilities:structuredClone(configuration.capabilities),finding,reason:'Renew complete content authority for exact projected qualifications.'},ctx());
  return advanceContent(id);
 }
 function requireConfiguredV5Profile(){need(contentNodes().every(n=>configuration?.capabilities?.[n.key]?.resourceProfile===CONTENT_RESOURCE_PROFILE.httpResourceProfile),'CONTENT_RESOURCE_PROFILE_CHANGED','Every v5 capability must pin the generic HTTP resource profile');const assigned=assignments();need(contentNodes().every(n=>{const provider=providers[assigned[n.key]?.providerId];return provider?.adapter===ORDINARY_HTTP_PROVIDER&&provider.operatorConfig?.adapter===ORDINARY_HTTP_PROVIDER&&provider.operatorConfig.resourceProfile===CONTENT_RESOURCE_PROFILE.httpResourceProfile;}),'CONTENT_RESOURCE_PROFILE_CHANGED','Every configured v5 provider must pin the bounded HTTP profile before new effects');}
 function configuredAssignments() {const assigned=assignments();need(Object.values(assigned).every(b=>b&&typeof b.providerId==='string'&&typeof b.model==='string'),'CONTENT_ASSIGNMENT_REQUIRED','All actual source owners, author, independent judges and layout owner required');need(assigned.plan.role==='production-director'&&assigned['producer:strategy'].role==='strategy-lead'&&assigned['producer:copy'].role==='copy-lead'&&assigned.author.role==='content-author'&&assigned['layout:producer'].role==='content-author'&&assigned['layout:consumer'].role==='layout-lead','CONTENT_OWNER_REQUIRED','Production director and actual module owners required');need(contentNodes().every(n=>assigned[n.key].role===(n.key==='producer:strategy'?'strategy-lead':n.key==='producer:copy'?'copy-lead':n.role)),'CONTENT_ASSIGNMENT_REQUIRED','Independent review roles and every actual business node must match their frozen role');return assigned;}
 function ensureAllowance(id) {
  const requested=configuration?.allowance;need(requested,'CONTENT_ALLOWANCE_REQUIRED','New or corrective content work needs an explicit cumulative configured allowance');const p=store.read(id),prior=contentAllowance(p);
  if(p.contentAllowance&&prior.maxCalls===requested.maxCalls&&prior.origin===requested.origin&&prior.version===requested.version)return;
  send(id,{kind:'adjust-complete-content-allowance',maxCalls:requested.maxCalls,previousMaxCalls:requested.previousMaxCalls,origin:requested.origin,version:requested.version,reason:requested.reason});
 }
 function available(r,j) {if(planningContentPacket(r.task.packetVersion))requireConfiguredV5Profile();need(equal(assignments()[j.nodeKey],j.binding),'CONTENT_BINDING_CHANGED','Queued assignment changed; cannot silently replace');need(providers[j.binding.providerId]?.model===j.binding.model,'CONTENT_PROVIDER_UNAVAILABLE','This exact assigned provider and model unavailable');const cap=r.task.capabilities[j.nodeKey];need(equal(cap,configuration?.capabilities?.[j.nodeKey]),'CONTENT_CAPABILITY_CHANGED','Exact current operation capability required');need(cap?.operation===CONTENT_PROTOCOL&&(!['content-packet-v3',NUMERIC_CONTENT_CONTRACT.packet,PLANNING_CONTENT_CONTRACT.packet,MODEL_VIEW_CONTENT_CONTRACT.packet].includes(r.task.packetVersion)||cap.packetVersion===r.task.packetVersion),'CONTENT_CAPABILITY_REQUIRED','Content-specific envelope capability required');finalEnvelope(r.task.source.images,{...cap,operation:'final-visual-v1'},j.binding);return cap;}
 async function recover(id,r,j) {
  if(j.attempts.at(-1)?.httpAttemptLocator){await restoreOrdinaryJob(store,root,id,j.id,{imageStore});j=store.read(id).jobs.find(job=>job.id===j.id);}
  if(planningContentPacket(r.task.packetVersion))await reopenContentPlanningOriginal(store.read(id),r,{executionRoot:root});
  const p=store.read(id),a=j.attempts.at(-1),folder=join(root,a.id),request=contentRequest(p,r,j.node).request;
  let receipt=a?.receipt;
  if(!receipt&&numericContentPacket(r.task.packetVersion)){
   try{receipt=JSON.parse((await managedBytes(join(folder,'receipt.json'),planningContentPacket(r.task.packetVersion)?CONTENT_RESOURCE_PROFILE.receiptBytes:64*1024*1024,true)).toString('utf8'));}catch{need(false,'CONTENT_UNKNOWN_BLOCKS','No complete saved original receipt is available. Redispatch is forbidden');}
  }
  need(receipt,'CONTENT_UNKNOWN_BLOCKS','Unanchored unknown call cannot retry');
  need((await managedBytes(join(folder,'packet.json'),64*1024*1024,isOrdinaryHttp(receipt))).toString('utf8')===JSON.stringify({runId:a.id,model:j.binding.model,...request})&&(await managedBytes(join(folder,'receipt.json'),planningContentPacket(r.task.packetVersion)?CONTENT_RESOURCE_PROFILE.receiptBytes:64*1024*1024,isOrdinaryHttp(receipt))).toString('utf8')===JSON.stringify(receipt)&&(await managedBytes(join(folder,'response.txt'),2*1024*1024,isOrdinaryHttp(receipt))).toString('utf8')===receipt.responseText,'CONTENT_ANCHOR_CHANGED','Exact original packet, receipt and response bytes required for local recovery');
  if(isOrdinaryHttp(receipt))await reopenOrdinaryJob(p,j,a,{executionRoot:root,receipt});
  validateContentReceipt(p,r,j,a,receipt);
  for(const image of receipt.images??[]){const bytes=await readFile(image.path);need(bytes.length===image.byteLength&&createHash('sha256').update(bytes).digest('hex')===image.sha256,'CONTENT_ATTACHMENT_CHANGED','Actual original attachment bytes required for recovery');}
  if(!a.receipt)send(id,{kind:'reconcile-numeric-content',jobId:j.id,attemptId:a.id,receipt});
  await reopenOrdinaryCompletion(store.read(id),j,a,{executionRoot:root,receipt,wrappers:[[join(folder,'receipt.json'),JSON.stringify(receipt)],[join(folder,'response.txt'),receipt.responseText]]});
  send(id,{kind:'complete-complete-content',jobId:j.id,attemptId:a.id});
 }

 function requireFreshHistory(p) {
  need(!p.jobs.some(j=>j.purpose==='complete_content_plan')&&!p.contentVisibilityRevisionIntents?.length,'CONTENT_REVISION_INTENT_REQUIRED','Explicit revision required for historical content');
  need(!p.jobs.some(j=>CONTENT_PURPOSES.includes(j.purpose)&&j.attempts.some(a=>a.dispatchStarted&&a.status!=='succeeded')),'CONTENT_UNKNOWN_BLOCKS','Unknown dispatched call cannot be replaced');
 }
 async function preflightInitialContentV3(id) {
  const p=store.read(id);requireFreshHistory(p);
  const contents=await readContents(p),basis=basisFor(p,contents);
  await finalVisuals.verifyFinalVisual(id,p.artifacts.find(a=>a.id===basis.visual.artifactId));
  await verifyReferences(p,basis);
  if(numeric())await verifyNumericOriginals(p,basis);
  for(const image of basis.images)await imageStore.read({projectId:id,imageId:image.imageId,expectedHash:image.sha256});
  need(store.read(id).revision===p.revision,'REVISION_CONFLICT','Project changed during initial content source reads');
  return {revision:p.revision,contents,source:makeProjectedContentSource(p,basis)};
 }
 async function continueContent(id,request) {
  publicIntent(request);
  if(planningContentPacket(packetVersion()))requireConfiguredV5Profile();
  const p=store.read(id),prior=p.processedCommands[request.commandId];
  const command={kind:'request-complete-content',commandId:request.commandId,...(v3()?{packetVersion:packetVersion()}:{})};
  if(prior)need(prior===JSON.stringify(command),'COMMAND_ID_REUSED','Exact initial continuation identity cannot change');
  else if(v3()) {
   const existing=currentRoot(id);
   if(existing?.task.packetVersion===packetVersion()){
    need(p.revision===request.expectedRevision,'REVISION_CONFLICT','Exact current project revision required');return advanceContent(id);
   }
   requireFreshHistory(p);
   store.command(id,{...command,expectedRevision:request.expectedRevision},ctx());
  }else store.command(id,{...command,expectedRevision:request.expectedRevision},ctx());
  return advanceContent(id);
 }
 async function advanceContent(id) {
  let p=store.read(id);if(!p.contentIntents?.length&&!p.contentVisibilityRevisionIntents?.length)return {status:'not_requested',queuedJobIds:[]};
  try {
   let r=currentRoot(id);
   if(!r&&planningContentPacket(packetVersion()))requireConfiguredV5Profile();
   if(v3()&&r&&r.task.packetVersion!==packetVersion()&&!p.contentVisibilityRevisionIntents?.length)return {status:'blocked',reason:'CONTENT_REVISION_INTENT_REQUIRED',queuedJobIds:[]};
   if(numeric()&&p.contentNumericRevisionIntents?.length&&!r){
    const intent=p.contentNumericRevisionIntents.at(-1),preflight=await preflightNumericRevision(id);
    ensureAllowance(id);
    send(id,{kind:'open-content-numeric-revision',...(planningContentPacket(packetVersion())?{packetVersion:packetVersion()}:{}),intentId:intent.id,predecessorRootJobId:preflight.predecessor.id,sourceHash:preflight.source.sourceHash,sourceContents:preflight.contents,assignments:configuredAssignments(),capabilities:configuration.capabilities});r=currentRoot(id);if(planningContentPacket(r?.task.packetVersion))await persistContentPlanningOriginal(store.read(id),r,{executionRoot:root});
   }
   if(!numeric()&&v3()&&p.contentVisibilityRevisionIntents?.length&&!r){
    const intent=p.contentVisibilityRevisionIntents.at(-1),preflight=await preflightContentRevision(id);
    need(preflight.source.sourceHash===intent.sourceHash,'CONTENT_SOURCE_STALE','Prospective projection is no longer current');
    if(!preflight.budget.dispatchAllowed)return {status:'blocked',reason:'CONTENT_ALLOWANCE_EXHAUSTED',revisionIntentId:intent.id,sourceHash:intent.sourceHash,projectionHash:intent.projectionHash,budget:preflight.budget,queuedJobIds:[]};
    const assigned=configuredAssignments();need(contentNodes().every(n=>configuration.capabilities?.[n.key]?.packetVersion==='content-packet-v3'),'CONTENT_CAPABILITY_REQUIRED','Every prospective node requires explicit v3 capability');
    send(id,{kind:'open-content-visibility-revision',intentId:intent.id,sourceHash:intent.sourceHash,sourceContents:preflight.contents,assignments:assigned,capabilities:configuration.capabilities});r=currentRoot(id);if(planningContentPacket(r?.task.packetVersion))await persistContentPlanningOriginal(store.read(id),r,{executionRoot:root});
   }
   if(!r&&v3()&&!p.contentVisibilityRevisionIntents?.length){
    requireFreshHistory(p);
    const intent=p.contentIntents?.findLast(i=>i.packetVersion===packetVersion());
    need(intent,'CONTENT_INITIAL_INTENT_REQUIRED','Persisted explicit initial v3 intent required');
    need(configuration?.capabilities,'CONTENT_CONFIGURATION_REQUIRED','Explicit initial v3 operation capabilities required');
    ensureAllowance(id);
    need(contentCalls(store.read(id))+contentNodes().length<=contentAllowance(store.read(id)).maxCalls,'CONTENT_ALLOWANCE_EXHAUSTED','Full initial thirteen-node graph requires explicit remaining allowance');
    const assigned=configuredAssignments(),preflight=await preflightInitialContentV3(id);
    for(const node of contentNodes()){const cap=configuration.capabilities[node.key];need(cap?.operation===CONTENT_PROTOCOL&&cap.packetVersion===packetVersion(),'CONTENT_CAPABILITY_REQUIRED','Every initial node requires current v3 capability');finalEnvelope(preflight.source.images,{...cap,operation:'final-visual-v1'},assigned[node.key]);}
    store.command(id,{kind:packetVersion()===MODEL_VIEW_CONTENT_CONTRACT.packet?'open-initial-content-v6':planningContentPacket(packetVersion())?'open-initial-content-v5':numeric()?'open-initial-content-v4':'open-initial-content-v3',commandId:randomUUID(),expectedRevision:preflight.revision,intentId:intent.id,...(numeric()?{sourceHash:preflight.source.sourceHash}:{source:preflight.source}),sourceContents:preflight.contents,assignments:assigned,capabilities:configuration.capabilities},ctx());r=currentRoot(id);if(planningContentPacket(r?.task.packetVersion))await persistContentPlanningOriginal(store.read(id),r,{executionRoot:root});
   }
   if(!r){need(!v3(),'CONTENT_REVISION_INTENT_REQUIRED','Explicit prospective revision required before v3 activation');need(configuration?.capabilities&&configuration.packetVersion==='content-packet-v2','CONTENT_CONFIGURATION_REQUIRED','Explicit versioned content assignments and complete-image bounds required');ensureAllowance(id);const contents=await readContents(p),source=contentSourceBuilder(p,contents);await finalVisuals.verifyFinalVisual(id,p.artifacts.find(a=>a.id===source.visual.artifactId));send(id,{kind:'open-complete-content',source,sourceContents:contents,assignments:configuredAssignments(),capabilities:configuration.capabilities});r=currentRoot(id);if(planningContentPacket(r?.task.packetVersion))await persistContentPlanningOriginal(store.read(id),r,{executionRoot:root});}
   else if(r.contentReport){const projected=ingestContent(contentRequest(p,r,r.node).input,r.contentReport.receipt,contentPlanningManifest(p,r),r.task.source);if(!projected.valid&&projected.diagnostics.includes('CONTENT_PLAN_ASSIGNMENT_INVALID')){
    need(configuration?.capabilities&&configuration.packetVersion==='content-packet-v2','CONTENT_PLAN_ASSIGNMENT_INVALID','Original plan is retained but has no exact current module authority; a configured corrective planning execution is required');contentPlanningCorrection(p,r);await checked(id,r,{retainingInvalidPlanning:true});ensureAllowance(id);if(currentRoot(id)?.id===r.id)send(id,{kind:'open-complete-content',source:r.task.source,sourceContents:r.task.sourceContents,predecessorRootJobId:r.id,assignments:configuredAssignments(),capabilities:configuration.capabilities});r=currentRoot(id);if(planningContentPacket(r?.task.packetVersion))await persistContentPlanningOriginal(store.read(id),r,{executionRoot:root});
   }}
   await checked(id,r);
   for(const j of store.read(id).jobs.filter(j=>j.contentRootJobId===r.id&&['running','awaiting_reconciliation'].includes(j.status)&&(j.attempts.at(-1)?.receipt||j.attempts.at(-1)?.httpAttemptLocator||numeric()&&j.attempts.at(-1)?.dispatchStarted)))await recover(id,r,j);
   p=store.read(id);r=currentRoot(id);for(const j of p.jobs.filter(j=>j.contentRootJobId===r.id&&j.status==='blocked'&&j.attempts.length===0)){try{available(r,j);await checkSpace();send(id,{kind:'resume-complete-content',jobId:j.id});}catch{}}p=store.read(id);const bad=p.jobs.find(j=>j.contentRootJobId===r.id&&(['blocked','failed','awaiting_reconciliation'].includes(j.status)||j.contentReport&&(!j.contentReport.valid||j.contentReport.raw.decision==='return')));if(bad)return {status:'blocked',reason:bad.error?.code??bad.contentReport?.diagnostics?.[0]??'owner_return',jobId:bad.id,findings:bad.contentReport?.raw?.findings??[],queuedJobIds:[]};
   const author=contentJob(p,r,'author'),outcome=contentReviewOutcome(p,r);
   if(outcome.status==='revision_required'||outcome.status==='blocked')return {...outcome,rootJobId:r.id,queuedJobIds:[]};
   if(outcome.status==='reviewed') {
    let a=p.artifacts.find(a=>a.completeContent?.rootJobId===r.id);
    if(!a){const bytes=JSON.stringify(author.contentReport.raw.manuscript),folder=join(root,r.id),payloadRef=join(folder,'complete-manuscript.json');need(Buffer.byteLength(bytes)<=8*1024*1024,'CONTENT_DRAFT_TOO_LARGE','Complete explicit draft export exceeds bounded 8 MiB');await mkdir(folder,{recursive:true});try{await writeFile(payloadRef,bytes,{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;need(await readFile(payloadRef,'utf8')===bytes,'CONTENT_MANUSCRIPT_CHANGED','Existing reviewed draft immutable');}a={id:`manuscript-${r.id}`,stage:'content_review',provenance:'reviewed_complete_content',completeContent:{protocol:CONTENT_PROTOCOL,packetVersion:r.task.packetVersion,rootJobId:r.id,sourceHash:r.task.source.sourceHash,manuscriptHash:hash(author.contentReport.raw.manuscript),...(['content-packet-v3',NUMERIC_CONTENT_CONTRACT.packet,PLANNING_CONTENT_CONTRACT.packet,MODEL_VIEW_CONTENT_CONTRACT.packet].includes(r.task.packetVersion)?{projectionHash:r.task.source.visibility.projectionHash,manuscriptVersion:contentContractForPacket(r.task.packetVersion,r.task.source).manuscript}:{})},contentHash:hash(bytes),payloadRef,inputVersionIds:clone(r.inputVersionIds),claims:clone(r.task.source.claims),author:clone(author.attempts.at(-1).executor),executionReceipt:clone(author.attempts.at(-1).receipt),technicalReceipts:{}};send(id,{kind:'register-complete-content',rootJobId:r.id,artifact:a});}
    try{requireCompleteContent(store.read(id),a,contentSourceBuilder);}catch(e){if(e.code==='HUMAN_GATE')return {status:'awaiting_selected_human',artifactId:a.id,draftHash:a.contentHash,queuedJobIds:[]};throw e;}send(id,{kind:'release-complete-content',rootJobId:r.id,artifactId:a.id});
   }
   for(const n of contentNodes().slice(1)){p=store.read(id);r=currentRoot(id);if(n.phase.startsWith('layout_')&&outcome.status!=='reviewed')continue;if(!contentJob(p,r,n.key)&&n.dependencies.every(key=>{const x=contentJob(p,r,key)?.contentReport;return x?.valid&&(x.raw.decision===undefined||x.raw.decision==='accept');}))send(id,{kind:'queue-complete-content',rootJobId:r.id,nodeKey:n.key});}
   return contentStatus(id);
  }catch(e){return {status:'blocked',reason:e.code??'CONTENT_UNAVAILABLE',message:e.message,queuedJobIds:[]};}
 }
 function contentStatus(id) {const p=store.read(id),r=currentRoot(id);if(numeric()&&r){try{requireContentCurrent(p,r,contentSourceBuilder);}catch(error){return {status:'blocked',reason:error.code??'CONTENT_SOURCE_STALE',queuedJobIds:[]};}}if(v3()&&r&&r.task.packetVersion!==packetVersion())return {status:'blocked',reason:'CONTENT_REVISION_INTENT_REQUIRED',queuedJobIds:[]};if(!r){const intent=p.contentVisibilityRevisionIntents?.at(-1);return intent?{status:'blocked',reason:contentCalls(p)+contentNodes().length>contentAllowance(p).maxCalls?'CONTENT_ALLOWANCE_EXHAUSTED':'CONTENT_REVISION_PENDING',revisionIntentId:intent.id,sourceHash:intent.sourceHash,projectionHash:intent.projectionHash,budget:{consumedCalls:contentCalls(p),maxCalls:contentAllowance(p).maxCalls,prospectiveCalls:contentNodes().length},queuedJobIds:[]}:{status:v3()&&p.jobs.some(j=>j.purpose==='complete_content_plan')?'blocked':p.contentIntents?.length?'waiting_source':'not_requested',...(v3()&&p.jobs.some(j=>j.purpose==='complete_content_plan')?{reason:'CONTENT_REVISION_INTENT_REQUIRED'}:{}),...(p.contentIntents?.at(-1)?.packetVersion?{packetVersion:p.contentIntents.at(-1).packetVersion,initialIntentId:p.contentIntents.at(-1).id}:{}),queuedJobIds:[]};}const jobs=p.jobs.filter(j=>j.contentRootJobId===r.id),planning=r.contentReport&&ingestContent(contentRequest(p,r,r.node).input,r.contentReport.receipt,contentPlanningManifest(p,r),r.task.source),a=p.artifacts.find(a=>a.completeContent?.rootJobId===r.id),layout=contentJob(p,r,'layout:consumer');let status=layout?.contentReport?.valid&&layout.contentReport.raw.decision==='accept'?'ready_for_layout':a?'layout_handoff_pending':contentJob(p,r,'author')?.contentReport?'auditing':contentJob(p,r,'author')?'assembling':contentJob(p,r,'plan')?.contentReport?'producer_pending':'planning';const blocked=jobs.find(j=>['blocked','awaiting_reconciliation','failed'].includes(j.status)||j.contentReport&&!j.contentReport.valid||j.contentReport?.raw?.decision==='return');if(blocked||planning&&!planning.valid)status='blocked';if(a&&p.policies.at(-1).humanGates.includes('content_review')&&!p.decisions.some(d=>d.kind==='adopt-complete-content'&&d.artifactId===a.id&&d.draftHash===a.contentHash&&d.policyVersion===p.policies.at(-1).version))status='awaiting_selected_human';const adoption=a&&p.decisions.findLast(d=>d.kind==='adopt-complete-content'&&d.human&&d.artifactId===a.id&&d.draftHash===a.contentHash&&d.sourceHash===r.task.source.sourceHash&&d.policyVersion===p.policies.at(-1).version);return {status,...(['content-packet-v3',NUMERIC_CONTENT_CONTRACT.packet,PLANNING_CONTENT_CONTRACT.packet,MODEL_VIEW_CONTENT_CONTRACT.packet].includes(r.task.packetVersion)?{creativeStatus:adoption?'user_designated':a?'independently_reviewed':'pending',factualVerification:'source_evidence_unchanged'}:{}),...(planning&&!planning.valid?{reason:'CONTENT_PLAN_ASSIGNMENT_INVALID',retainedOriginalPlanId:r.contentReport.id}:{}),packetVersion:r.task.packetVersion??'content-packet-v1',budget:{maxCalls:contentAllowance(p).maxCalls,consumedCalls:contentCalls(p),remainingCalls:contentAllowance(p).maxCalls-contentCalls(p)},rootJobId:r.id,sourceHash:r.task.source.sourceHash,...(a?{artifactId:a.id,draftHash:a.contentHash}:{}),jobs:jobs.map(j=>({id:j.id,nodeKey:j.nodeKey,status:j.status,reportId:j.contentReport?.id,diagnostics:j.contentReport?.diagnostics})),queuedJobIds:jobs.filter(j=>j.status==='queued').map(j=>j.id)};}
 async function execute(id,jobId) {
  let p=store.read(id),j=p.jobs.find(j=>j.id===jobId);if(j.status!=='queued')return j;const attemptId=randomUUID(),context={...ctx(),runId:attemptId};let claimed=false,outputReservation;
  try{const r=p.jobs.find(x=>x.id===j.contentRootJobId),cap=available(r,j);await checkSpace();await checked(id,r);if(cap.status==='experiment_verified')for(const e of cap.evidence){need(createHash('sha256').update(await readFile(e.path)).digest('hex')===e.sha256,'CONTENT_CAPABILITY_EVIDENCE_CHANGED','Actual capability evidence changed');}const images=[];for(const i of r.task.source.images)images.push((await imageStore.read({projectId:id,imageId:i.imageId,expectedHash:i.sha256})).descriptor);const prepared=r.task.packetVersion===MODEL_VIEW_CONTENT_CONTRACT.packet?prepareContentInvocation(p,r,j.node,{attemptId,binding:j.binding,images,mode:'actual'}):null;const request=prepared?.request??contentRequest(p,r,j.node).request;if(prepared){outputReservation=prepared.admission.outputReservation;const operatorConfig=providers[j.binding.providerId]?.operatorConfig;need(operatorConfig&&operatorConfig.maxOutputBytes<=CONTENT_RESOURCE_PROFILE.outputBytes&&operatorConfig.maxResponseBytes<=CONTENT_RESOURCE_PROFILE.bodyBytes,'CONTENT_RESOURCE_LIMIT','HTTP owner limits exceed the pinned content operation profile');await admitContentOriginalRetention(p,r,{executionRoot:root,reserveAttempt:true});}if(r.task.packetVersion===PLANNING_CONTENT_CONTRACT.packet){admitContentDispatch(p,r);outputReservation=contentOutputAdmission(contentRequest(p,r,j.node).input,r.task.source,contentPlanningManifest(p,r));requireContentBytes('manifestBytes',r.task.planningManifestRef.byteLength);scanContentJSON(JSON.stringify(contentRequest(p,r,j.node).input),{maxBytes:CONTENT_RESOURCE_PROFILE.logicalBytes});const logical=ordinaryLogicalBytes({attemptId,binding:j.binding,request,images});requireContentBytes('logicalBytes',logical.length);requireContentBytes('runtimeBytes',Buffer.byteLength(JSON.stringify({runId:attemptId,model:j.binding.model,...request})));const wire={protocol:'workbench-stateless-model-json-v1',model:j.binding.model,invocationId:'00000000-0000-0000-0000-000000000000',contextMode:'stateless-v1',prompt:request.prompt,...(request.outputSchema===undefined?{}:{outputSchema:request.outputSchema}),images:images.map((i,occurrence)=>({occurrence,imageId:i.imageId,sha256:i.sha256,mediaType:i.mediaType,byteLength:i.byteLength,width:i.width,height:i.height,base64:'A'.repeat(4*Math.ceil(i.byteLength/3))})),...(request.imageEnvelope?{imageEnvelope:request.imageEnvelope}:{})};requireContentBytes('wireBytes',wire);if(providers[j.binding.providerId]?.operatorConfig)need(providers[j.binding.providerId].operatorConfig.maxOutputBytes<=CONTENT_RESOURCE_PROFILE.outputBytes&&providers[j.binding.providerId].operatorConfig.maxResponseBytes<=CONTENT_RESOURCE_PROFILE.bodyBytes,'CONTENT_RESOURCE_LIMIT','HTTP owner limits exceed the exact pinned v5 operation profile');await admitContentOriginalRetention(p,r,{executionRoot:root,reserveAttempt:true});}const folder=join(root,attemptId);await mkdir(folder,{recursive:true});await writeFile(join(folder,'packet.json'),JSON.stringify({runId:attemptId,model:j.binding.model,...request}),{flag:'wx'});await checked(id,r);available(r,j);await checkSpace();send(id,{kind:'claim-complete-content',jobId,attemptId,...(outputReservation?{outputReservation}:{})},context);claimed=true;await checkSpace();const receipt=await invokeOrdinary({executionRoot:root,provider:providers[j.binding.providerId],binding:j.binding,attemptId,request,images,runtimePacketBytes:Buffer.from(JSON.stringify({runId:attemptId,model:j.binding.model,...request})),persistLocator:locator=>send(id,{kind:'anchor-model-http-attempt',jobId,attemptId,locator},context)});if(planningContentPacket(r.task.packetVersion)){requireContentBytes('outputBytes',receipt.responseText);requireContentBytes('encodedOutputBytes',JSON.stringify(receipt.responseText));need(Buffer.byteLength(JSON.stringify(receipt.responseText))<=outputReservation.mandatoryEncodedOutputBytes+outputReservation.freeEncodedBytes,'CONTENT_RESOURCE_LIMIT','Actual encoded testimony exceeds the exact phase reservation');requireContentBytes('receiptBytes',receipt);scanContentJSON(receipt.responseText);}await writeFile(join(folder,'receipt.json'),JSON.stringify(receipt),{flag:'wx'});await writeFile(join(folder,'response.txt'),receipt.responseText,{flag:'wx'});send(id,{kind:'anchor-complete-content',jobId,attemptId,receipt},context);await checked(id,r);{const p=store.read(id),j=p.jobs.find(j=>j.id===jobId);await reopenOrdinaryCompletion(p,j,j.attempts.at(-1),{executionRoot:root,receipt,wrappers:[[join(folder,'receipt.json'),JSON.stringify(receipt)],[join(folder,'response.txt'),receipt.responseText]]});}send(id,{kind:'complete-complete-content',jobId,attemptId},context);}catch(e){j=store.read(id).jobs.find(j=>j.id===jobId);if(claimed&&j.status==='running')send(id,{kind:'fail-complete-content',jobId,attemptId,error:{code:e.code??'CONTENT_UNKNOWN',message:e.message}},context);else if(!claimed&&j.status==='queued')send(id,{kind:'block-queued-job',jobId,error:{code:e.code??'CONTENT_UNAVAILABLE',message:e.message}});}return store.read(id).jobs.find(j=>j.id===jobId);
 }
 async function contentDraft(id) {const p=store.read(id),r=currentRoot(id),a=p.artifacts.find(a=>a.completeContent?.rootJobId===r?.id);need(!v3()||r?.task.packetVersion===packetVersion(),'CONTENT_REVISION_INTENT_REQUIRED','Current v3 authority requires an actual new reviewed manuscript');need(r&&a,'CONTENT_DRAFT_UNAVAILABLE','Reviewed readable manuscript unavailable');await checked(id,r);requireCompleteContent(p,a,contentSourceBuilder,{phase:'registration'});const base=await realpath(root),path=await realpath(a.payloadRef),info=await stat(path);need(path.startsWith(base+sep)&&info.isFile()&&info.size<=8*1024*1024,'CONTENT_DRAFT_UNAVAILABLE','Bounded explicit managed manuscript export required');const bytes=await readFile(path,'utf8');need(hash(bytes)===a.contentHash&&equal(JSON.parse(bytes),contentJob(p,r,'author').contentReport.raw.manuscript),'CONTENT_MANUSCRIPT_CHANGED','Exact actual readable reviewed manuscript required');return {artifactId:a.id,contentHash:a.contentHash,content:JSON.parse(bytes),contentText:bytes,status:contentStatus(id)};}
 async function contentLayoutInput(id,prepared) {
  try{
  const p=store.read(id),r=currentRoot(id),artifact=p.artifacts.find(a=>a.id===p.activeByStage.content_review);
  need(r&&artifact?.completeContent?.rootJobId===r.id,'CONTENT_LAYOUT_SOURCE_UNAVAILABLE','Current released reviewed manuscript and exact source root required');
  if(prepared)requireLayoutPreparationBinding(p,prepared);
  await checked(id,r);
  const {contract,fact}=prepared?checkedLayoutContract(p,artifact,contentSourceBuilder):{contract:completeContentLayoutContract(p,artifact,contentSourceBuilder)};
  need(p.releases.some(release=>release.artifactId===artifact.id&&release.policyVersion===p.policies.at(-1).version&&release.sourceHash===r.task.source.sourceHash),'CONTENT_LAYOUT_RELEASE_REQUIRED','Current exact content release required');
  const bytes=await readManagedLayoutBytes(root,artifact.payloadRef),manuscriptText=bytes.toString('utf8');
  need(hash(manuscriptText)===artifact.contentHash&&equal(JSON.parse(manuscriptText),contract.manuscript),'CONTENT_MANUSCRIPT_CHANGED','Exact actual managed manuscript bytes required');
  const producer=contentJob(p,r,'layout:producer'),consumer=contentJob(p,r,'layout:consumer');
  need(producer?.contentReport?.valid&&producer.contentReport.raw.decision==='accept'&&consumer?.contentReport?.valid&&consumer.contentReport.raw.decision==='accept','CONTENT_LAYOUT_HANDOFF_REQUIRED','Both actual original content and layout owner reports required');
  need(store.read(id).revision===p.revision,'CONTENT_LAYOUT_SOURCE_CHANGED','Project changed while reading exact content bytes');
  if(prepared)requireLayoutPreparationCurrent(p,prepared,contentSourceBuilder,fact);
  return structuredClone({contract,source:r.task.source,contentHash:artifact.contentHash,manuscriptText,ownerReports:{producer:producer.contentReport,consumer:consumer.contentReport}});
  }catch(error){error.issues??=[{code:error.code??'CONTENT_LAYOUT_SOURCE_UNAVAILABLE',responsibleOwner:error.details?.owner??'content-author',artifactId:store.read(id).activeByStage.content_review??null,pointer:error.details?.pointer??'/completeContent',observation:error.message}];throw error;}
 }
 async function verifyLayoutPreparation(id,prepared){
  await contentLayoutInput(id,prepared);
 }
 function configurationUsable() {
  try {if(planningContentPacket(packetVersion()))requireConfiguredV5Profile();
   need(configuration?.capabilities&&['content-packet-v2','content-packet-v3',NUMERIC_CONTENT_CONTRACT.packet,PLANNING_CONTENT_CONTRACT.packet,MODEL_VIEW_CONTENT_CONTRACT.packet].includes(configuration.packetVersion),'CONTENT_CONFIGURATION_REQUIRED','Explicit configuration required');
   const allowance=configuration.allowance;
   need(allowance&&Number.isSafeInteger(allowance.maxCalls)&&allowance.maxCalls>=contentNodes().length&&allowance.maxCalls<=128&&typeof allowance.origin==='string'&&allowance.origin.trim().length>0&&typeof allowance.version==='string'&&allowance.version.trim().length>0&&typeof allowance.reason==='string'&&allowance.reason.trim().length>0&&Number.isSafeInteger(allowance.previousMaxCalls)&&allowance.previousMaxCalls>=0,'CONTENT_ALLOWANCE_REQUIRED','Usable explicit cumulative allowance required');
   const assigned=configuredAssignments();
   for(const node of contentNodes()){const cap=configuration.capabilities[node.key];need(cap?.operation===CONTENT_PROTOCOL&&(!v3()||cap.packetVersion===packetVersion())&&(!planningContentPacket(packetVersion())||cap.resourceProfile===CONTENT_RESOURCE_PROFILE.httpResourceProfile),'CONTENT_CAPABILITY_REQUIRED','Exact content operation capability required');need(['configured_unverified','experiment_verified','synthetic_fixture'].includes(cap.status)&&typeof cap.origin==='string'&&cap.origin.trim().length>0&&typeof cap.version==='string'&&cap.version.trim().length>0&&Array.isArray(cap.limitations)&&cap.limitations.length>0&&equal(cap.assignment,{providerId:assigned[node.key].providerId,model:assigned[node.key].model})&&['maxImages','maxBytes','maxPixels'].every(key=>Number.isSafeInteger(cap[key])&&cap[key]>0),'CONTENT_CAPABILITY_REQUIRED','Exact bounded operation-specific capability required');if(cap.status==='experiment_verified')need(cap.evidence?.length>0&&cap.evidence.every(e=>typeof e.path==='string'&&e.path.trim().length>0&&/^[a-f0-9]{64}$/.test(e.sha256)),'CONTENT_CAPABILITY_REQUIRED','Pinned capability evidence required');}
   return true;
  }catch{return false;}
 }
 return {verifyLayoutPreparation,contentLayoutInput,reviseContent,preflightContentRevision,continueContent,advanceContent,contentStatus,contentDraft,execute,capability:()=>({protocol:CONTENT_PROTOCOL,executionIntegrated:true,configured:configurationUsable(),packetVersion:configuration?.packetVersion??null,manuscriptVersion:v3()?manuscriptVersion():null,realQualityVerified:false,editablePptIntegrated:false})};
}
const clone=structuredClone;

export function validateContentConfiguration(c) {
 configFields(c,['packetVersion','capabilities','allowance']);configNeed(['content-packet-v2','content-packet-v3',NUMERIC_CONTENT_CONTRACT.packet,PLANNING_CONTENT_CONTRACT.packet,MODEL_VIEW_CONTENT_CONTRACT.packet].includes(c.packetVersion),'/packetVersion');
 configAllowance(c.allowance,'/allowance',['maxCalls','origin','version','previousMaxCalls','reason']);configNeed(configPositive(c.allowance.maxCalls),'/allowance/maxCalls');
 configNeed(configText(c.allowance.reason)&&configPositive(c.allowance.previousMaxCalls),'/allowance');
 configFields(c.capabilities,contentNodes().map(n=>n.key),'/capabilities');
 for(const n of contentNodes()){const cap=c.capabilities[n.key];configEvidence(cap,`/capabilities/${n.key}`,planningContentPacket(c.packetVersion)?['resourceProfile']:[]);if(planningContentPacket(c.packetVersion))configNeed(cap.resourceProfile===CONTENT_RESOURCE_PROFILE.httpResourceProfile,`/capabilities/${n.key}/resourceProfile`);configNeed(cap.operation===CONTENT_PROTOCOL&&cap.packetVersion===c.packetVersion,`/capabilities/${n.key}`);validateFinalCapability({...cap,operation:'final-visual-v1'},cap.assignment);}
 return contentNodes().map(n=>({key:n.key==='producer:strategy'?'strategy':n.key==='producer:copy'?'copy':`content_${n.key.replaceAll(':','_')}`,role:n.key==='producer:strategy'?'strategy-lead':n.key==='producer:copy'?'copy-lead':n.role}));
}
