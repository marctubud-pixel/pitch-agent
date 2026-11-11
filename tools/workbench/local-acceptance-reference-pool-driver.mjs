import {referenceInputClosure} from './reference-input-seal.mjs';
import {dirname} from 'node:path';
import {realpath} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {isDeepStrictEqual as equal} from 'node:util';
import {planReferencePool} from './local-reference-pool-plan.mjs';
import {poolContinuationRequest,verifyPoolContinuation} from './local-reference-pool-intent.mjs';
import {localReferenceCandidatePlan} from './local-acceptance-reference-driver.mjs';
import {readArtifactContent} from './artifact-content.mjs';
import {readManagedLayoutBytes} from './managed-layout-bytes.mjs';
import {validateReferenceLibrary,referenceLibraryEntry,REFERENCE_LIBRARY_DESCRIPTION} from './reference-library.mjs';
import {verifyOrdinaryReferenceProject} from './ordinary-model-project.mjs';
import {referenceState} from './reference-dossier.mjs';
import {copyDeliveryEnvelope} from './project.mjs';
const need=(v,code)=>{if(!v)throw Object.assign(Error(code),{code});};
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const context=()=>({actorType:'agent',actorId:'local-reference-pool-v2',runId:randomUUID(),contextId:randomUUID()});
export function createLocalReferencePoolDriver({projectStore,executor,imageStore,executionRoot,assetCatalogue,configuration}){
 need(projectStore&&executor&&imageStore&&executionRoot&&configuration?.referenceLibrary,'LOCAL_POOL_CONFIGURATION_REQUIRED');
 const library=validateReferenceLibrary(configuration.referenceLibrary),idOf=ctx=>ctx.case?.projectId??ctx.project.id;
 async function verifyOriginals(project,artifactId,checked=new Map()){
  const seen=new Set();
  for(const material of (project.referenceMaterials??[]).filter(m=>!m.removed&&m.artifactId===artifactId)){
   const asset=project.imageAssets.find(a=>a.id===material.image.imageId);
   need(asset?.projectId===project.id&&asset.sha256===material.image.sha256&&['byteLength','mediaType','width','height'].every(k=>asset[k]===material.image[k]),'LOCAL_POOL_ORIGINAL_IDENTITY_CHANGED');
   if(seen.has(asset.id))continue;seen.add(asset.id);
   if(checked.has(asset.id)){need(equal(checked.get(asset.id),asset),'LOCAL_POOL_ORIGINAL_IDENTITY_CHANGED');continue;}
   const original=await imageStore.read({projectId:project.id,imageId:asset.id,expectedHash:asset.sha256});
   need(equal(original.asset,asset)&&original.bytes instanceof Uint8Array&&original.bytes.byteLength===asset.byteLength&&createHash('sha256').update(original.bytes).digest('hex')===asset.sha256,'LOCAL_POOL_ORIGINAL_BYTES_CHANGED');checked.set(asset.id,structuredClone(asset));
  }
 }
 async function prepare(project,record){
  need(['m6','dexian'].includes(record?.caseId),'LOCAL_POOL_CASE_REQUIRED');
  const artifact=project.artifacts.find(a=>a.id===project.activeByStage.copy);need(artifact?.stage==='copy','LOCAL_POOL_COPY_REQUIRED');
  const loaded=await readArtifactContent(project,artifact.id,executionRoot),directionIds=loaded.content.directions.map(d=>d.id),slots=localReferenceCandidatePlan(assetCatalogue,record.caseId,directionIds);
  for(const slot of slots){const entry=referenceLibraryEntry(library,slot.entryId);need(entry.caseId===record.caseId&&entry.sha256===slot.asset.sha256&&entry.role===slot.asset.role,'LOCAL_POOL_LIBRARY_CHANGED');}
  return {artifact,slots,plan:planReferencePool({projectId:project.id,caseId:record.caseId,artifact,directionIds,materials:project.referenceMaterials??[],librarySlots:slots,catalogueDigest:library.catalogueDigest})};
 }
 async function sealed(project,record,plan,originals){
  const revisions=new Map(),proof=verifyPoolContinuation(project,plan,revision=>{if(!revisions.has(revision))revisions.set(revision,projectStore.read(project.id,revision));return revisions.get(revision);});
  if(!proof)return null;
  const beforeProject=revisions.get(proof.creationRevision-1),committedProject=revisions.get(proof.creationRevision);await verifyOriginals(beforeProject,plan.artifactId,originals);await verifyOriginals(committedProject,plan.artifactId,originals);
  const before=await prepare(beforeProject,record),committed=await prepare(committedProject,record);
  need(equal(before.plan,plan)&&equal(committed.plan,plan),'LOCAL_POOL_SEALED_HISTORY_SOURCE_CHANGED');return proof;
 }
 async function inspect(ctx){
  const p=projectStore.read(idOf(ctx));if(!p.activeByStage.copy)return {status:'blocked',reason:'LOCAL_POOL_COPY_REQUIRED',syntheticOnly:true};const prepared=await prepare(p,ctx.case),plan=prepared.plan;
  const intents=(p.referenceIntents??[]).filter(i=>i.artifactId===prepared.artifact.id);
  if(intents.length){
   const originals=new Map();await sealed(p,ctx.case,plan,originals);await verifyOriginals(p,prepared.artifact.id,originals);
   const status=await executor.referenceStatus(p.id,prepared.artifact.id);
   if(['ready_for_sketch','endpoint_reached'].includes(status.status)){
    const current=projectStore.read(p.id),d=current.referenceDossiers.find(d=>d.id===status.dossierId);need(d,'LOCAL_POOL_DOSSIER_REQUIRED');
    await verifyOrdinaryReferenceProject(current,d,{executionRoot,imageStore});const native=referenceState(current,d,{sourceEnvelope:copyDeliveryEnvelope});
    need(['ready_for_sketch','endpoint_reached'].includes(native.status)&&native.selectionHash===status.selectionHash,'LOCAL_POOL_SELECTION_CHANGED');
    need(native.selection.length===3&&native.selection.every(s=>new Set(d.candidates.filter(c=>c.directionId===s.directionId).map(c=>c.image.sha256)).size>=2),'LOCAL_POOL_CANDIDATE_COVERAGE');
    const mains=native.selection.map(s=>s.images.find(i=>i.imageId===s.main.imageId)?.sha256);need(mains.every(Boolean)&&new Set(mains).size===3,'LOCAL_POOL_SELECTED_IMAGES_NOT_DISTINCT');
    const jobs=current.jobs.filter(j=>j.dossierId===d.id);need(jobs.length>0&&jobs.every(j=>j.status==='succeeded'),'LOCAL_POOL_JOBS_INCOMPLETE');
    return {status:'complete',deliveryReady:true,dossierId:d.id,selectionHash:native.selectionHash,selection:native.selection,jobIds:jobs.map(j=>j.id),resultIds:[d.id],syntheticOnly:true,realQualityVerified:false,poolProtocol:plan.protocol,nativeCalibrationStatus:native.calibration,provenanceKind:'manual_and_curated_library',captureState:'legacy-or-user-supplied-not-verified',automaticSearchCredit:false};
   }
   if(['waiting_human','diagnostic','choice_awaiting_adoption'].includes(status.status))return {status:'awaiting_user',reason:status.reason??'REFERENCE_HUMAN_ADOPTION',nativeStatus:status.status,dossierId:status.dossierId,selectionHash:status.selectionHash,editionHash:status.humanChoice?.activeEdition?.editionHash??null,syntheticOnly:true};
   if(['blocked','failed','awaiting_reconciliation','returned','budget_limit','stale','paused','choice_blocked','coverage_gap'].includes(status.status))return {status:status.status==='awaiting_reconciliation'?'awaiting_reconciliation':'blocked',reason:status.reason??status.status,syntheticOnly:true};
   return {status:'pending',nextOperation:'advance_reference_graph',poolSourceHash:plan.sourceHash,syntheticOnly:true};
  }
  need(!(p.referenceDossiers??[]).some(d=>d.envelope?.source?.source?.artifactId===prepared.artifact.id)&&!p.jobs.some(j=>j.purpose==='reference'&&j.targetArtifactId===prepared.artifact.id),'LOCAL_POOL_LEGACY_WORK_REQUIRES_OLD_DRIVER');
  if(plan.status==='blocked')return {status:'blocked',reason:'LOCAL_POOL_INPUT_CORRECTION_REQUIRED',pool:plan,syntheticOnly:true};
  const slot=plan.directions.flatMap(d=>d.imports)[0];
  return {status:'pending',nextOperation:slot?'import_pool_material':'continue_copy_v2',...(slot?{directionId:slot.directionId,libraryEntryId:slot.entryId}:{}),poolSourceHash:plan.sourceHash,poolPlanHash:plan.planHash,syntheticOnly:true};
 }
 async function advance(ctx){
  const id=idOf(ctx),state=await inspect(ctx);if(state.status!=='pending')return state;
  let p=projectStore.read(id),prepared=await prepare(p,ctx.case);need(prepared.plan.sourceHash===state.poolSourceHash,'LOCAL_POOL_SOURCE_CHANGED');
  if(state.nextOperation==='import_pool_material'){
   const proposed=prepared.plan.directions.flatMap(d=>d.imports).find(s=>s.directionId===state.directionId&&s.entryId===state.libraryEntryId),slot=prepared.slots.find(s=>s.directionId===proposed?.directionId&&s.entryId===proposed.entryId);need(slot,'LOCAL_POOL_SLOT_CHANGED');
   const entry=referenceLibraryEntry(library,slot.entryId);need(await realpath(dirname(slot.asset.file))===dirname(slot.asset.file),'LOCAL_POOL_LIBRARY_PATH_CHANGED');const bytes=await readManagedLayoutBytes(dirname(slot.asset.file),slot.asset.file,8*1024*1024);need(createHash('sha256').update(bytes).digest('hex')===entry.sha256,'LOCAL_POOL_LIBRARY_BYTES_CHANGED');
   let asset=p.imageAssets.find(a=>a.sha256===entry.sha256&&a.provenance.sourcePageUrl===entry.sourceUrl&&a.provenance.description===REFERENCE_LIBRARY_DESCRIPTION);
   if(!asset){asset=await imageStore.ingest({projectId:id,bytes,metadata:{representation:entry.representation,sourcePageUrl:entry.sourceUrl,description:REFERENCE_LIBRARY_DESCRIPTION}});projectStore.command(id,{kind:'register-image',asset,commandId:'pool-image-v2-'+hash([id,entry.id,library.catalogueDigest,entry.sha256]),expectedRevision:p.revision},context());}
   p=projectStore.read(id);const current=await prepare(p,ctx.case);need(current.plan.sourceHash===state.poolSourceHash,'LOCAL_POOL_SOURCE_CHANGED');
   const commandId='pool-use-v2-'+hash([id,prepared.artifact.id,prepared.artifact.contentHash,slot.directionId,library.catalogueDigest,entry.id,entry.sha256,'direction','direction']);
   need(!Object.hasOwn(p.processedCommands,commandId),'LOCAL_POOL_IMPORT_RECEIPT_MISSING');
   await executor.submitReferenceLibraryMaterial(id,{artifactId:prepared.artifact.id,directionId:slot.directionId,imageId:asset.id,libraryEntryId:entry.id,catalogueDigest:library.catalogueDigest,kind:'direction',applicabilityProfile:'direction',borrowingNote:'同用途本地图库补足，仅作构图与表达机制参考；不证明审美、用户偏好、事实或商业授权。',commandId,expectedRevision:p.revision});return inspect(ctx);
  }
  if(state.nextOperation==='continue_copy_v2'){await verifyOriginals(p,prepared.artifact.id);await executor.continueCopy(id,poolContinuationRequest(p,prepared.plan));return inspect(ctx);}
  need(state.nextOperation==='advance_reference_graph','LOCAL_POOL_OPERATION_UNKNOWN');const ids=await executor.advanceReferences(id);if(ids.length)await executor.execute(id,ids[0]);return inspect(ctx);
 }
 async function decide(ctx){
  const state=await inspect(ctx);need(ctx.request?.decision==='approve'&&ctx.request.contribution===undefined,'LOCAL_POOL_CONTRIBUTION_HANDLER_REQUIRED');need(state.status==='awaiting_user','LOCAL_POOL_NO_HUMAN_GATE');
  const p=projectStore.read(idOf(ctx)),user={actorType:'human',actorId:'local-acceptance-user',runId:randomUUID(),contextId:randomUUID()},base={dossierId:state.dossierId,reason:ctx.request.comment||'本地工程参考选择，不构成事实、真实审美或商业授权。',commandId:ctx.request.commandId,expectedRevision:p.revision};
  if(state.nativeStatus==='choice_awaiting_adoption')await executor.chooseReferences(p.id,{...base,action:'adopt',editionHash:state.editionHash},user);else await executor.adoptReferences(p.id,{...base,selectionHash:state.selectionHash},user);
  return {disposition:'adopted',reason:'Explicit local-user native reference adoption; no factual upgrade.',selectionHash:state.selectionHash,editionHash:state.editionHash};
 }
 return {inspect,advance,decide,readInputPlan:async ctx=>{const p=projectStore.read(idOf(ctx));need(p.revision===ctx.project.revision,'LOCAL_POOL_SOURCE_CHANGED');const copy=p.activeByStage.copy;need(copy&&!referenceInputClosure(p,copy).closed,'LOCAL_REFERENCE_INPUT_SEALED');return (await prepare(p,ctx.case)).plan;}};
}
