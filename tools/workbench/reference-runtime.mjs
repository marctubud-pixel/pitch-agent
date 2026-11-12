import {validateReferenceLibrary,referenceLibraryEntry,REFERENCE_LIBRARY_DESCRIPTION} from './reference-library.mjs';
import {reopenOrdinaryCompletion} from './ordinary-model-project.mjs';
import {verifyOrdinaryProject,verifyOrdinaryReferenceProject,restoreOrdinaryJob,ordinaryJobInput} from './ordinary-model-project.mjs';
import {invokeOrdinary,reopenOrdinary,isOrdinaryHttp,ordinarySuccessfulStatus,ordinaryHasContext} from './ordinary-model.mjs';
import {randomUUID} from 'node:crypto';
import {hostname} from 'node:os';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {searchPublicReferences} from './reference-http-search.mjs';
import {capturePublicSource} from './source-acquisition.mjs';
import {verifyReferenceOriginal,referenceTaskCardTerminal} from './reference-original.mjs';
import {readManagedCapture} from './source-capture-store.mjs';
import {saveReferenceResult,readReferenceResult,verifyReferenceProviderOriginal} from './reference-result.mjs';
import {imageManifest} from './image-evidence.mjs';
import {readArtifactContent} from './artifact-content.mjs';
import {referenceHash as hash,referenceRequire as need} from './reference-review.mjs';
import {freezeReferenceEnvelope,referenceState,referenceReadyNodes,referenceJobCurrent,referenceNodeInput,referenceRequest,referenceNodePlan,referencePriorHistoryGaps,validateReferenceProductionOutput,validateReferenceReceipt} from './reference-dossier.mjs';
import {validateReferenceReviewOutput,validateReferenceChoiceOutput} from './reference-review.mjs';
import {validateUncertaintyReturnOutput} from './reference-uncertainty.mjs';

export function createReferenceRuntime({store,root,providers,bindings,imageStore,acquisitionDependencies,configuration,sourceEnvelope,library=null}) {
  const coordinator=()=>({actorType:'agent',actorId:'reference-coordinator',runId:randomUUID(),contextId:randomUUID(),now:new Date().toISOString()});
  const send=(id,command,context=coordinator())=>store.command(id,{...command,commandId:randomUUID(),expectedRevision:store.read(id).revision},{...context,now:new Date().toISOString()});
  async function sourceContents(p,id){
    const result=[],seen=new Set();
    async function visit(key,parent,revision=false){
      const matches=p.artifacts.filter(a=>a.id===key),a=matches[0];
      need(matches.length<=1&&!(a&&(p.taskCards??[]).some(card=>card.id===key)),'REFERENCE_HISTORY_MISSING','Source ancestry identity is ambiguous');
      if(!a){
        need(parent&&!revision,'REFERENCE_HISTORY_MISSING','Original reached source artifact missing');
        referenceTaskCardTerminal(p,key,parent);
        return;
      }
      if(seen.has(key))return;seen.add(key);
      const content=await readArtifactContent(p,key,root);result.push({artifactId:key,contentText:content.contentText});
      for(const upstream of a.inputVersionIds)await visit(upstream,a);
      if(a.revision)await visit(a.revision.revisionOf.artifactId,a,true);
    }
    await visit(id);return result;
  }
  function requireExecutionBinding(p,d,job) {
    const node=referenceNodePlan(d,p).find(node=>node.key===job.nodeKey);
    const assigned=bindings[node.binding];
    need(isDeepStrictEqual(assigned,job.binding),'REFERENCE_BINDING_CHANGED','Queued reference assignment cannot use a replacement provider');
    need(providers[job.binding.providerId]?.model===job.binding.model,'PROVIDER_MISSING','Assigned reference provider unavailable');
    if(node.kind==='collector'&&d.envelope.configuration.discoveryMode!=='manual_supplied')need(configuration?.capability?.transport==='experimental_public_http'&&configuration.capability.status==='available','REFERENCE_RUNTIME_NOT_CONFIGURED','Assigned public discovery capability unavailable');
  }
  const verifyDossier=(p,d)=>verifyOrdinaryReferenceProject(p,d,{executionRoot:root,imageStore});
  const verifyHistory=verifyDossier;
  async function checkedState(p,d){
    try{await verifyHistory(p,d);need(store.read(p.id).revision===p.revision,'REFERENCE_INPUT_CHANGED','Project changed while reference evidence was checked');return referenceState(p,d,{sourceEnvelope});}
    catch(error){return {status:'blocked',reason:error.code??'REFERENCE_CAPTURE_CHANGED'};}
  }
  async function referenceStates(p){
    const states=[];
    for(const d of p.referenceDossiers??[])states.push({dossierId:d.id,artifactId:d.envelope.source.source?.artifactId,...await checkedState(p,d)});
    if(states.length&&store.read(p.id).revision!==p.revision)return states.map(({dossierId,artifactId})=>({dossierId,artifactId,status:'blocked',reason:'REFERENCE_INPUT_CHANGED'}));
    return states;
  }
  async function adoptReferences(projectId,request,humanContext){
    const p=store.read(projectId),d=p.referenceDossiers?.find(d=>d.id===request.dossierId);
    need(d,'INVALID_REFERENCE_DOSSIER','Registered dossier required');
    const state=await checkedState(p,d);
    need(!['blocked','stale'].includes(state.status),'REFERENCE_EVIDENCE_UNAVAILABLE',state.reason??'Current managed reference evidence required');
    need(store.read(projectId).revision===p.revision,'REFERENCE_INPUT_CHANGED','Project changed while reference evidence was checked');
    
    return store.command(projectId,{...request,kind:'adopt-reference-selection'},humanContext);
  }
  async function chooseReferences(projectId,request,humanContext){
    const p=store.read(projectId),d=p.referenceDossiers?.find(d=>d.id===request.dossierId);
    need(d,'INVALID_REFERENCE_DOSSIER','Registered dossier required');
    const state=await checkedState(p,d);
    need(!['blocked','stale','paused'].includes(state.status),'REFERENCE_EVIDENCE_UNAVAILABLE',state.reason??'Current unpaused managed evidence required');
    need(store.read(projectId).revision===p.revision,'REFERENCE_INPUT_CHANGED','Project changed during managed evidence reads');
    
    store.command(projectId,{...request,kind:'choose-references'},humanContext);
    return status(projectId,d.envelope.source.source?.artifactId);
  }
  async function continueCopy(projectId,request,scope={}){const p=store.read(projectId),prior=p.referenceIntents?.find(i=>i.id===request.commandId);if(prior)need(isDeepStrictEqual(prior.request,request),'COMMAND_ID_REUSED','Copy continuation ID reused');else store.command(projectId,{kind:'request-copy-continuation',artifactId:request.artifactId,request:structuredClone(request),commandId:request.commandId,expectedRevision:request.expectedRevision},coordinator());await advanceReferences(projectId,{explicitContinuation:true,...scope});return status(projectId,request.artifactId);}
  async function status(projectId,artifactId){const p=store.read(projectId),d=p.referenceDossiers?.filter(d=>d.envelope.source.source?.artifactId===(artifactId??p.activeByStage.copy)).at(-1);if(d)return {dossierId:d.id,...await checkedState(p,d)};try{need(configuration,'REFERENCE_RUNTIME_NOT_CONFIGURED','Reference runtime needs explicit verified capability and budget');const contents=await sourceContents(p,artifactId??p.activeByStage.copy);freezeReferenceEnvelope(sourceEnvelope(p,artifactId??p.activeByStage.copy,contents,bindings.reference_lead),{...configuration,discoveryMode:p.referenceIntents?.filter(i=>i.artifactId===(artifactId??p.activeByStage.copy)).at(-1)?.request.discoveryMode??'automatic'},bindings);return {status:'waiting_source'};}catch(e){return {status:'waiting_source',reason:e.code??'SOURCE_NOT_READY'};}}
  async function advanceReferences(projectId,{explicitContinuation=false,artifactId,dossierId,noRecovery=false}={}){let p=store.read(projectId);const id=artifactId??p.activeByStage.copy;if(id!==p.activeByStage.copy)return [];if(!configuration||!id||!(p.referenceIntents?.some(i=>i.artifactId===id)||p.policies.at(-1).mode==='auto'))return [];
    let d=p.referenceDossiers?.filter(d=>d.envelope.source.source?.artifactId===id).at(-1);
    if(dossierId&&d?.id!==dossierId)return [];if(noRecovery&&d&&p.jobs.some(j=>j.dossierId===d.id&&['running','awaiting_reconciliation'].includes(j.status)))return [];if(d?.paused)return [];
    if(d&&!d.revisionRequest&&!explicitContinuation&&referenceState(p,d,{sourceEnvelope}).status==='ready_for_sketch')return [];
    try{const contents=await sourceContents(p,id),frozenSource=d&&!explicitContinuation?sourceEnvelope(p,id,contents,d.envelope.source.consumerBinding):null,unchangedSource=d&&!explicitContinuation&&isDeepStrictEqual(frozenSource,d.envelope.source),effectiveBindings=unchangedSource?d.envelope.bindings:bindings,source=unchangedSource?frozenSource:sourceEnvelope(p,id,contents,bindings.reference_lead),effectiveConfiguration=unchangedSource?d.envelope.configuration:{...configuration,discoveryMode:p.referenceIntents?.filter(i=>i.artifactId===id).at(-1)?.request.discoveryMode??'automatic'},envelope=freezeReferenceEnvelope(source,effectiveConfiguration,effectiveBindings),changed=d&&d.envelope.envelopeHash!==envelope.envelopeHash;
      if(dossierId&&(d?.revisionRequest||changed))return [];if(!d||d.revisionRequest||changed){const cycle=d&&!changed?d.cycle+1:Math.max(-1,...(p.referenceDossiers??[]).filter(prior=>prior.envelope.envelopeHash===envelope.envelopeHash).map(prior=>prior.cycle))+1,dossierId=`reference-${envelope.envelopeHash.slice(0,32)}-${cycle}`;if(!p.referenceDossiers?.some(d=>d.id===dossierId)){send(projectId,{kind:'open-reference-dossier',artifactId:id,dossierId,sourceContents:contents,bindings:effectiveBindings,configuration:effectiveConfiguration,cycle,...(d?{previousDossierId:d.id}: {})});}p=store.read(projectId);d=p.referenceDossiers.find(d=>d.id===dossierId);}
    }catch{return [];}
    try{await verifyHistory(p,d);const state=referenceState(p,d,{sourceEnvelope});if(!['working'].includes(state.status))return [];for(const node of referenceReadyNodes(d,p))if(!p.jobs.some(j=>j.dossierId===d.id&&j.nodeKey===node.key)){send(projectId,{kind:'queue-reference-node',dossierId:d.id,nodeKey:node.key});}}catch{return [];}
    return store.read(projectId).jobs.filter(j=>j.dossierId===d.id&&j.status==='queued').map(j=>j.id);
  }
  async function acquire(projectId,job,attemptId,context){const getDossier=()=>store.read(projectId).referenceDossiers.find(d=>d.id===job.dossierId);
    const current=()=>{const p=store.read(projectId);return referenceJobCurrent(p,p.jobs.find(j=>j.id===job.id),sourceEnvelope);};
    const {node}=current(),card=getDossier().reports.find(r=>r.nodeKey==='plan').rawReport.cards.find(c=>c.directionId===node.directionId);
    async function tool(kind,argument,execute){current();const toolId=`tool-${hash([job.id,kind,argument]).slice(0,48)}`,existing=getDossier().tools.find(t=>t.id===toolId);if(existing){need(existing.state!=='dispatched','REFERENCE_TOOL_OUTCOME_UNKNOWN','Previously dispatched tool result is unknown; do not repeat');return existing;}
      send(projectId,{kind:'claim-reference-tool',jobId:job.id,attemptId,toolId,toolKind:kind,argument},context);
      try{const result=await execute();send(projectId,{kind:'complete-reference-tool',jobId:job.id,attemptId,toolId,result},context);}catch(error){if(error.code==='STALE_REFERENCE_DOSSIER'||error.code==='REFERENCE_PAUSED')throw error;send(projectId,{kind:'complete-reference-tool',jobId:job.id,attemptId,toolId,error:{code:error.code??'ACQUISITION_FAILED',message:error.message}},context);}
      return getDossier().tools.find(t=>t.id===toolId);
    }
    if(getDossier().envelope.configuration.discoveryMode==='manual_supplied'){
      for(const material of getDossier().envelope.source.manualReferences.filter(m=>m.directionId===node.directionId)){await imageStore.read({projectId,imageId:material.image.imageId,expectedHash:material.image.sha256});send(projectId,{kind:'register-reference-manual-candidate',jobId:job.id,attemptId,materialId:material.id},context);}
      if(getDossier().candidates.filter(c=>c.directionId===node.directionId).length<2)send(projectId,{kind:'record-reference-coverage-gap',jobId:job.id,attemptId},context);
      need(getDossier().candidates.filter(c=>c.directionId===node.directionId).length>=2,'REFERENCE_COVERAGE_GAP','Manual route requires two distinct decoded originals per direction');return;
    }
    const searches=[];
    for(const query of card.queries)searches.push(await tool('search',query,()=>searchPublicReferences({query,storeRoot:join(root,'reference-search'),limits:{maxResults:5}},acquisitionDependencies)));
    let imageAttempts=getDossier().tools.filter(t=>t.nodeKey===node.key&&t.kind==='image').length;
    for(const search of searches){for(const hit of search.result?.receipt.results??[]){if(getDossier().candidates.filter(c=>c.directionId===node.directionId).length>=3||imageAttempts>=6)break;
      const page=await tool('page',hit.url,async()=>{const c=await capturePublicSource({url:hit.url,storeRoot:join(root,'source-captures')},acquisitionDependencies);await readManagedCapture(join(root,'source-captures'),c);return c;});
      for(const declared of page.result?.record.extraction.images??[]){if(getDossier().candidates.filter(c=>c.directionId===node.directionId).length>=3||imageAttempts>=6)break;const previous=getDossier().tools.some(t=>t.nodeKey===node.key&&t.kind==='image'&&t.argument===declared.url);if(!previous)imageAttempts++;
        const captured=await tool('image',declared.url,async()=>{const c=await capturePublicSource({url:declared.url,storeRoot:join(root,'source-captures')},acquisitionDependencies);await readManagedCapture(join(root,'source-captures'),c);return c;});if(!captured.result||captured.result.record.httpStatus!==200||!['image/png','image/jpeg'].includes(captured.result.record.mimeType))continue;
        const old=getDossier().candidates.find(c=>c.directionId===node.directionId&&c.provenance.some(p=>p.searchId===search.id&&p.pageId===page.id&&p.imageCaptureId===captured.id));if(old)continue;
        const loaded=await readManagedCapture(join(root,'source-captures'),captured.result);let asset;try{asset=await imageStore.ingest({projectId,bytes:loaded.raw,metadata:{representation:'supplied_image',sourcePageUrl:page.result.record.finalUrl,sourceImageUrl:captured.result.record.finalUrl,capturedAt:captured.result.record.retrievedAt,description:'Original public image captured as reference inspiration; attribution unknown.'}});}catch(error){send(projectId,{kind:'record-reference-acquisition-failure',jobId:job.id,attemptId,toolId:captured.id,error:error.message},context);continue;}
        const image={imageId:asset.id,sha256:asset.sha256,mediaType:asset.mediaType,byteLength:asset.byteLength,width:asset.width,height:asset.height};
        send(projectId,{kind:'register-reference-candidate',jobId:job.id,attemptId,asset,candidate:{id:`candidate-${hash([job.id,image.sha256]).slice(0,40)}`,directionId:node.directionId,image,searchId:search.id,pageId:page.id,imageCaptureId:captured.id,attribution:{brand:null,date:null,license:null},claimBoundary:'visual inspiration only; no source identity, preference, trend, effect or commercial reuse approval'}},context);
      }
    }}
    if(getDossier().candidates.filter(c=>c.directionId===node.directionId).length<2)send(projectId,{kind:'record-reference-coverage-gap',jobId:job.id,attemptId},context);
    need(getDossier().candidates.filter(c=>c.directionId===node.directionId).length>=2,'REFERENCE_COVERAGE_GAP','Fewer than two distinct decoded originals for this copy direction');
  }
  async function execute(projectId,jobId,{retry=false,admission}={}){let p=store.read(projectId),job=p.jobs.find(j=>j.id===jobId);if(retry?!['failed','blocked'].includes(job.status):job.status!=='queued')return job;
    const claim=(c,context,expectedRevision)=>admission?store.command(projectId,{...c,visualHttpRequestId:admission.requestId,commandId:`visual-${c.kind}-${hash([projectId,admission.requestId,jobId])}`,expectedRevision},context):send(projectId,c,context);
    const attemptId=randomUUID(),context={actorType:'agent',actorId:`reference-worker-${attemptId}`,runId:attemptId,contextId:randomUUID(),executorHost:hostname(),executorPid:process.pid};let receipt,dispatched=false;
    try{const {d}=referenceJobCurrent(p,job,sourceEnvelope);await verifyHistory(p,d);requireExecutionBinding(p,d,job);claim({kind:retry?'retry-job':'start-job',jobId,attemptId},context,admission?.expectedRevision);}catch(e){if(retry)throw e;send(projectId,{kind:'block-queued-job',jobId,error:{code:e.code??'REFERENCE_INPUT_CHANGED',message:e.message}},context);return store.read(projectId).jobs.find(j=>j.id===jobId);}
    try{let {d,node}=referenceJobCurrent(store.read(projectId),job,sourceEnvelope);if(node.kind==='collector')await acquire(projectId,job,attemptId,context);
      p=store.read(projectId);({d,node}=referenceJobCurrent(p,p.jobs.find(j=>j.id===jobId),sourceEnvelope));await verifyHistory(p,d);
      const input=referenceNodeInput(d,node,p),request=referenceRequest(d,node,p),images=[];for(const image of input.images)images.push((await imageStore.read({projectId,imageId:image.imageId,expectedHash:image.sha256})).descriptor);
      const folder=join(root,attemptId);await mkdir(folder,{recursive:true});await writeFile(join(folder,'packet.json'),JSON.stringify({projectId,jobId,attemptId,...request,...(images.length?{images:imageManifest(images)}: {})},null,2),{flag:'wx'});
      requireExecutionBinding(p,d,job);
      claim({kind:'mark-reference-dispatched',jobId,attemptId},context,p.revision);dispatched=true;
      const result=await invokeOrdinary({executionRoot:root,provider:providers[job.binding.providerId],binding:job.binding,attemptId,request,images,runtimePacketBytes:Buffer.from(JSON.stringify({projectId,jobId,attemptId,...request,...(images.length?{images:imageManifest(images)}:{})},null,2)),persistLocator:locator=>send(projectId,{kind:'anchor-model-http-attempt',jobId,attemptId,locator},context)});
      receipt={...result,providerExecution:structuredClone(result.providerExecution??result),providerId:job.binding.providerId,model:job.binding.model,role:job.binding.role,taskId:job.id,attemptId};
      const packetBytes=JSON.stringify({projectId,jobId,attemptId,...request,...(images.length?{images:imageManifest(images)}: {})},null,2);
      const saved=await saveReferenceResult(join(folder,'reference-result.json'),{protocolVersion:'reference-result-v1',projectId,dossierId:d.id,envelopeHash:d.envelope.envelopeHash,jobId,nodeKey:node.key,attemptId,binding:job.binding,executor:store.read(projectId).jobs.find(j=>j.id===jobId).attempts.at(-1).executor,packetBytes,executionReceipt:receipt});
      send(projectId,{kind:'anchor-reference-result',jobId,attemptId,result:saved,executionReceipt:receipt},context);
      need(ordinarySuccessfulStatus(result)&&ordinaryHasContext(result)&&result.requestedModel===job.binding.model&&['signal','reason','error'].every(k=>result[k]==null),'INVALID_EXECUTION_RECEIPT','Successful original provider receipt required');
      const rawReport=result.parsedOutput??JSON.parse(result.responseText),normalized=node.kind==='uncertainty-owner'?validateUncertaintyReturnOutput(rawReport,input):node.kind==='choice-classification'?validateReferenceChoiceOutput(rawReport,input):node.kind==='review'?validateReferenceReviewOutput(rawReport,input):validateReferenceProductionOutput(rawReport,input),bytes=JSON.stringify(normalized,null,2),payloadRef=join(folder,'reference-report.json'),normalizedDescriptor=await saveReferenceResult(payloadRef,normalized);
      send(projectId,{kind:'anchor-reference-normalized',jobId,attemptId,normalized:normalizedDescriptor},context);
      {const p=store.read(projectId),j=p.jobs.find(j=>j.id===jobId);await reopenOrdinaryCompletion(p,j,j.attempts.at(-1),{executionRoot:root,receipt,imageStore,wrappers:[[payloadRef,bytes]]});}
      send(projectId,{kind:'complete-reference-node',jobId,attemptId,reportId:randomUUID(),rawReport,payloadRef,contentHash:hash(bytes),executionReceipt:receipt},context);
    }catch(error){send(projectId,{kind:'finish-job-error',jobId,attemptId,status:dispatched||error.code==='REFERENCE_TOOL_OUTCOME_UNKNOWN'?'awaiting_reconciliation':'blocked',dispatchStarted:dispatched,error:{code:error.code??'REFERENCE_EXECUTION_FAILED',message:error.message},...(receipt?{receipt}: {})},context);}
    return store.read(projectId).jobs.find(j=>j.id===jobId);
  }
  async function recoverReferenceResult(projectId,jobId,options){
    let {commandId,expectedRevision,reason}=options??{};
    need(typeof commandId==='string'&&commandId.trim()&&typeof reason==='string'&&reason.trim(),'INVALID_REFERENCE_RECOVERY','Recovery command ID and reason required');
    const request={jobId,commandId,reason};let p=store.read(projectId);const id=`reference-recovery-${hash([projectId,commandId])}`;
    const prior=p.reconciliations?.find(r=>r.id===id);
    if(prior){need(isDeepStrictEqual(prior.request,request),'COMMAND_ID_REUSED','Recovery ID reused');const job=p.jobs.find(j=>j.id===jobId),d=p.referenceDossiers.find(d=>d.id===job.dossierId);await verifyDossier(p,d);return job;}
    need(p.revision===expectedRevision,'REVISION_CONFLICT','Project changed before reference recovery');
    let job=p.jobs.find(j=>j.id===jobId),attempt=job?.attempts.at(-1),d=p.referenceDossiers.find(d=>d.id===job?.dossierId);
    if(job?.status==='awaiting_reconciliation'&&attempt.httpAttemptLocator&&!attempt.referenceResult){
      await restoreOrdinaryJob(store,root,projectId,jobId,{imageStore});p=store.read(projectId);job=p.jobs.find(j=>j.id===jobId);attempt=job.attempts.at(-1);d=p.referenceDossiers.find(d=>d.id===job.dossierId);
      const input=await ordinaryJobInput(p,job,attempt,{executionRoot:root}),value={protocolVersion:'reference-result-v1',projectId,dossierId:d.id,envelopeHash:d.envelope.envelopeHash,jobId,nodeKey:job.nodeKey,attemptId:attempt.id,binding:job.binding,executor:attempt.executor,packetBytes:input.runtimePacketBytes.toString('utf8'),executionReceipt:attempt.receipt},path=join(root,attempt.id,'reference-result.json'),bytes=JSON.stringify(value,null,2);
      let result;try{result=await saveReferenceResult(path,value);}catch(error){if(error.code!=='EEXIST')throw error;result={path,byteLength:Buffer.byteLength(bytes),sha256:hash(bytes)};need(await readReferenceResult(root,result)===bytes,'REFERENCE_CAPTURE_CHANGED','Retained reference result changed');}
      send(projectId,{kind:'anchor-reference-result',jobId,attemptId:attempt.id,result,executionReceipt:attempt.receipt},coordinator());p=store.read(projectId);expectedRevision=p.revision;job=p.jobs.find(j=>j.id===jobId);attempt=job.attempts.at(-1);d=p.referenceDossiers.find(d=>d.id===job.dossierId);
    }
    need(job?.purpose==='reference'&&job.status==='awaiting_reconciliation'&&attempt?.status==='awaiting_reconciliation'&&attempt.dispatchStarted===true&&attempt.referenceResult,'INVALID_REFERENCE_RECOVERY','Exact saved dispatched reference result required');
    const folder=join(root,attempt.id),descriptor=attempt.referenceResult;
    need(descriptor.path===join(folder,'reference-result.json'),'INVALID_REFERENCE_RECOVERY','Exact attempt result path required');
    const saved=JSON.parse(await readReferenceResult(root,descriptor));
    need(saved.protocolVersion==='reference-result-v1'&&saved.projectId===projectId&&saved.jobId===job.id&&saved.dossierId===d.id&&saved.envelopeHash===d.envelope.envelopeHash&&saved.nodeKey===job.nodeKey&&saved.attemptId===attempt.id&&isDeepStrictEqual(saved.binding,job.binding)&&isDeepStrictEqual(saved.executor,attempt.executor)&&isDeepStrictEqual(saved.executionReceipt,attempt.receipt),'INVALID_REFERENCE_RECOVERY','Saved result ownership or receipt changed');
    const packetBytes=await readReferenceResult(root,{path:join(folder,'packet.json'),byteLength:Buffer.byteLength(saved.packetBytes),sha256:hash(saved.packetBytes)});
    const node=referenceNodePlan(d,p).find(n=>n.key===job.nodeKey),rawReport=JSON.parse(saved.executionReceipt.responseText),validated=validateReferenceReceipt(p,d,node,job,attempt,saved.executionReceipt,rawReport);
    const packet={projectId,jobId,attemptId:attempt.id,...validated.request,...(validated.input.images.length?{images:validated.input.images}: {})};
    need(packetBytes===saved.packetBytes&&isDeepStrictEqual(JSON.parse(packetBytes),packet),'INVALID_REFERENCE_RECOVERY','Exact canonical original request packet required');
    await verifyReferenceProviderOriginal(root,saved.executionReceipt,{binding:job.binding,attemptId:attempt.id,request:validated.request,images:saved.executionReceipt.images??[],runtimePacketBytes:Buffer.from(JSON.stringify(packet,null,2))});
    await verifyHistory(p,d);
    const normalizedBytes=JSON.stringify(validated.normalized,null,2),payloadRef=join(folder,'reference-report.json');
    let normalizedDescriptor=attempt.referenceNormalized;
    if(normalizedDescriptor){need(normalizedDescriptor.path===payloadRef&&(await readReferenceResult(root,normalizedDescriptor))===normalizedBytes,'REFERENCE_CAPTURE_CHANGED','Saved normalized original changed');}
    else {
      try{normalizedDescriptor=await saveReferenceResult(payloadRef,validated.normalized);}
      catch(error){if(error.code!=='EEXIST')throw error;normalizedDescriptor={path:payloadRef,byteLength:Buffer.byteLength(normalizedBytes),sha256:hash(normalizedBytes)};need((await readReferenceResult(root,normalizedDescriptor))===normalizedBytes,'REFERENCE_CAPTURE_CHANGED','Existing normalized original changed');}
    }
    need(store.read(projectId).revision===p.revision,'REVISION_CONFLICT','Project changed during original recovery reads');
    const context={actorType:'agent',actorId:`reference-recovery-${randomUUID()}`,runId:randomUUID(),contextId:randomUUID(),now:new Date().toISOString()};
    await reopenOrdinaryCompletion(p,job,attempt,{executionRoot:root,receipt:saved.executionReceipt,imageStore,wrappers:[[payloadRef,normalizedBytes]]});
    store.command(projectId,{kind:'recover-reference-result',jobId,attemptId:attempt.id,resultHash:descriptor.sha256,normalizedDescriptor,executionReceipt:saved.executionReceipt,rawReport,payloadRef,contentHash:hash(normalizedBytes),reportId:randomUUID(),reconciliationId:id,request,reason,commandId,expectedRevision},context);
    return store.read(projectId).jobs.find(j=>j.id===jobId);
  }
  const {submitReferenceMaterial}=createReferenceMaterialStorage({store,root,imageStore});
  async function submitReferenceLibraryMaterial(projectId,request){
    validateReferenceLibrary(library);const entry=referenceLibraryEntry(library,request.libraryEntryId);
    need(request.catalogueDigest===library.catalogueDigest,'REFERENCE_LIBRARY_CHANGED','Exact configured local catalogue required');
    const p=store.read(projectId),prior=p.referenceMaterials?.find(m=>m.id===request.commandId);if(prior){need(isDeepStrictEqual(prior.request,request),'COMMAND_ID_REUSED','Library material command reused');return prior;}
    const content=await readArtifactContent(p,request.artifactId,root),asset=p.imageAssets.find(a=>a.id===request.imageId);
    need(asset?.projectId===projectId&&asset.sha256===entry.sha256&&asset.provenance.sourcePageUrl===entry.sourceUrl&&asset.provenance.description===REFERENCE_LIBRARY_DESCRIPTION,'REFERENCE_LIBRARY_IMAGE_MISMATCH','Exact registered local-library image required');
    need(entry.role!=='auxiliary-reference'||request.kind==='component','REFERENCE_LIBRARY_USE_MISMATCH','Auxiliary references cannot become same-use main candidates');
    await imageStore.read({projectId,imageId:asset.id,expectedHash:entry.sha256});
    store.command(projectId,{kind:'record-reference-library-material',request:structuredClone(request),copyContents:content.contentText,libraryEntry:entry,commandId:request.commandId,expectedRevision:request.expectedRevision},{actorType:'agent',actorId:'reference-library-curator',runId:randomUUID(),contextId:randomUUID()});
    return store.read(projectId).referenceMaterials.find(m=>m.id===request.commandId);
  }
  async function reviseReferences(projectId,request){store.command(projectId,{kind:'request-reference-revision',dossierId:request.dossierId,commandId:request.commandId,expectedRevision:request.expectedRevision},coordinator());return advanceReferences(projectId);}
  async function returnReferenceUncertainty(projectId,request,humanContext){
    const p=store.read(projectId),d=p.referenceDossiers?.find(entry=>entry.id===request.dossierId);
    need(d,'INVALID_REFERENCE_DOSSIER','Registered dossier required');
    const state=await checkedState(p,d);
    need(state.status==='choice_blocked','REFERENCE_UNCERTAINTY_REQUIRED','Completed blocked dossier required');
    need(store.read(projectId).revision===p.revision,'REFERENCE_INPUT_CHANGED','Project changed during original evidence reads');
    store.command(projectId,{...request,kind:'request-reference-uncertainty-review'},humanContext);
    return store.read(projectId).jobs.find(job=>job.dossierId===d.id&&job.nodeKey===`uncertainty-owner-${request.commandId}`);
  }
  async function checkedSelection(projectId,dossierId) {
    const p=store.read(projectId),d=dossierId?p.referenceDossiers?.find(d=>d.id===dossierId):p.referenceDossiers?.filter(d=>d.envelope.source.source?.artifactId===p.activeByStage.copy).at(-1);
    if(!d)return {state:{status:'blocked',reason:'REFERENCE_DOSSIER_REQUIRED'}};
    try {await verifyHistory(p,d);need(store.read(projectId).revision===p.revision,'REFERENCE_INPUT_CHANGED','Project changed while original evidence was checked');return {dossier:d,state:referenceState(p,d,{sourceEnvelope})};}
    catch(error){return {dossier:d,state:{status:'blocked',reason:error.code??'REFERENCE_CAPTURE_CHANGED'}};}
  }
  return {capability:()=>({configured:!!configuration,available:false,executionIntegrated:true,discoveryMode:configuration?.discoveryMode??null,manualSupplied:true,semanticApproval:false,verification:"not_verified",downstream:"sketch production uses separate configuration, image service and reference review gates"}),recoverReferenceResult,checkedSelection,continueCopy,submitReferenceMaterial,submitReferenceLibraryMaterial,advanceReferences,referenceStatus:status,referenceStates,adoptReferences,chooseReferences,reviseReferences,returnReferenceUncertainty,execute};
}

export function createReferenceMaterialStorage({store,root,imageStore}){
  async function submitReferenceMaterial(projectId,request,humanContext){
    const p=store.read(projectId),prior=p.referenceMaterials?.find(m=>m.id===request.commandId);if(prior){need(isDeepStrictEqual(prior.request,request),'COMMAND_ID_REUSED','Manual material command reused');return prior;}
    need(humanContext?.actorType==='human','HUMAN_REQUIRED','Actual local human material submission required');
    const content=await readArtifactContent(p,request.artifactId,root),asset=p.imageAssets.find(a=>a.id===request.imageId);need(asset?.projectId===projectId,'INVALID_REFERENCE_MATERIAL','Registered project image required');await imageStore.read({projectId,imageId:asset.id,expectedHash:asset.sha256});
    store.command(projectId,{kind:'record-reference-material',request:structuredClone(request),copyContents:content.contentText,commandId:request.commandId,expectedRevision:request.expectedRevision},humanContext);return store.read(projectId).referenceMaterials.find(m=>m.id===request.commandId);
  }
  return Object.freeze({submitReferenceMaterial});
}
