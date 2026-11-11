import {readFile,writeFile,mkdir,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {referenceHash as hash,REFERENCE_REVIEW_PROTOCOL} from './reference-review.mjs';
import {REFERENCE_DOSSIER_PROTOCOL,referenceState} from './reference-dossier.mjs';
import {referenceProductionFixture} from './reference-dossier-fixtures.mjs';
import {referenceReviewFixtureOutput} from './reference-review-fixtures.mjs';
import {freezeReferenceLibrary,validateReferenceLibrary,REFERENCE_LIBRARY_DESCRIPTION,referenceLibraryEntry} from './reference-library.mjs';
import {readArtifactContent} from './artifact-content.mjs';
import {readManagedLayoutBytes} from './managed-layout-bytes.mjs';
import {verifyOrdinaryReferenceProject} from './ordinary-model-project.mjs';
import {copyDeliveryEnvelope} from './project.mjs';
const need=(v,code)=>{if(!v)throw Object.assign(Error(code),{code});};
const context=()=>({actorType:'agent',actorId:'local-reference-library-importer',runId:randomUUID(),contextId:randomUUID()});
export async function persistLocalReferenceLibrary({executionRoot,library}){
 const frozen=structuredClone(library);validateReferenceLibrary(frozen);
 const bytes=Buffer.from(JSON.stringify(frozen));need(bytes.length<=8*1024*1024,'LOCAL_REFERENCE_LIBRARY_SNAPSHOT_LIMIT');
 const root=await realpath(executionRoot),directory=join(root,'reference-libraries');await mkdir(directory,{recursive:true,mode:0o700});
 need(await realpath(directory)===directory,'LOCAL_REFERENCE_LIBRARY_CANONICAL_REQUIRED');
 const path=join(directory,frozen.catalogueDigest+'.json'),sha256=createHash('sha256').update(bytes).digest('hex');
 try{await writeFile(path,bytes,{flag:'wx',mode:0o400});}catch(e){if(e.code!=='EEXIST')throw e;}
 const retained=await readManagedLayoutBytes(root,path,8*1024*1024);need(retained.equals(bytes),'LOCAL_REFERENCE_LIBRARY_SNAPSHOT_CHANGED');
 return {protocol:'local-reference-library-snapshot-v1',catalogueDigest:frozen.catalogueDigest,path,sha256,byteLength:bytes.length,origin:'local-curated-configuration-not-network-capture'};
}
export function localReferenceCandidatePlan(catalogue,caseId,directionIds){
 need(['m6','dexian'].includes(caseId)&&directionIds.length===3&&new Set(directionIds).size===3,'LOCAL_REFERENCE_DIRECTIONS_REQUIRED');
 const raw=caseId==='m6'?catalogue.m6.posters.filter(a=>a.role==='same-use-master-kv'):catalogue.dexian.packaging.filter(a=>a.role==='observed-competitor-packaging'),pool=[...new Map(raw.map(a=>[a.sha256,a])).values()];
 need(pool.length>=3,'LOCAL_REFERENCE_LIBRARY_COVERAGE');
 const pairs=caseId==='m6'&&pool.length>=5?[[0,1],[2,3],[4,0]]:[[0,1],[1,2],[2,pool.length>=4?3:0]];
 return directionIds.flatMap((directionId,index)=>pairs[index].map((slot,rank)=>({directionId,rank,entryId:caseId+':'+pool[slot].id,asset:pool[slot]})));
}
export async function localReferenceConfiguration({executionRoot,assetCatalogue,providerId='local-synthetic',model='synthetic'}){
 const names=['reference_director','reference_lead','reference_collector','reference_review_director',...['visual','brand','user','communication'].flatMap(role=>[`reference_score_${role}`,`reference_opposition_${role}`])],bindings=Object.fromEntries(names.map(name=>[name,{providerId,model,role:name==='reference_lead'?'references-lead':name}]));
 const evidenceRef=join(executionRoot,'local-reference-mechanical-calibration.json'),bytes=JSON.stringify({syntheticOnly:true,realAestheticCalibration:false,purpose:'Explicit local score schema/routing fixture only. Native calibrated status is not model aesthetic validation.'});await writeFile(evidenceRef,bytes);
 const referenceConfiguration={discoveryMode:'manual_supplied',budget:{maxModelCalls:129,maxSearchCalls:0},calibrations:['visual','brand','user','communication'].map(role=>({protocolVersion:REFERENCE_REVIEW_PROTOCOL,applicabilityProfile:'direction',role,providerId,model,status:'verified',evidenceRef,evidenceHash:hash(bytes)}))};
 const referenceLibrary=freezeReferenceLibrary(assetCatalogue),referenceLibraryFile=await persistLocalReferenceLibrary({executionRoot,library:referenceLibrary});
 return {bindings,referenceConfiguration,referenceLibrary,referenceLibraryFile};
}
export function localReferenceCaseIdentity(record,project){
 if(record?.caseId!==undefined){need(['m6','dexian'].includes(record.caseId),'LOCAL_REFERENCE_CASE_INVALID');return record.caseId;}
 const name=project?.name??'',m6=/梦之蓝|M6\+/.test(name),dexian=/得闲/.test(name);need(!(m6&&dexian),'LOCAL_REFERENCE_CASE_AMBIGUOUS');return m6?'m6':dexian?'dexian':null;
}
export function localReferenceResponse({job,request,packet,project,case:record}){
 if(job.purpose!=='reference')return undefined;
 const input=packet??JSON.parse(request.prompt.slice(request.prompt.indexOf('UNTRUSTED_JSON_DATA\n')+20,request.prompt.lastIndexOf('\nEND_UNTRUSTED_JSON_DATA')));
 if(input.protocolVersion===REFERENCE_REVIEW_PROTOCOL)return referenceReviewFixtureOutput(input);
 if(input.protocolVersion!==REFERENCE_DOSSIER_PROTOCOL)return undefined;
 const caseId=localReferenceCaseIdentity(record,project);need(caseId,'LOCAL_REFERENCE_CASE_REQUIRED');
 const raw=referenceProductionFixture(input);
 const kv=caseId==='m6';
 if(input.kind==='plan')raw.cards.forEach((card,index)=>{card.protagonist=kv?['新春灯彩构成的祝愿圆环','产品轮廓构成的启新之门','蓝金礼封与祝愿光带'][index]:['轻松社交的包装阅读秩序','包装轮廓与携带概念','朋友相处的留白时间'][index];card.visualProblem=kv?'把梦与春节的主题转译为主KV整体画面，不退化成桌前单瓶或人群子海报。':'把轻松社交表达转译为可讨论的包装概念，度数和结构仍未定。';});
 if(input.kind==='collector')raw.uses.forEach(use=>{use.targetCarrier=kv?'春节品牌主KV概念':'得闲包装概念';use.uncertainties.push('这是本地预置方法说明，未证明参考审美适配或真实用户共鸣。');});
 raw.limitations=[...(raw.limitations??[]),'Local curated library originals; retained attribution is not a new official capture or verified commercial permission. All scoring is synthetic mechanical evidence only.'];
 return raw;
}
export function createLocalReferenceDriver({projectStore,executor,imageStore,executionRoot,assetCatalogue,configuration}){
 need(projectStore&&executor&&imageStore&&configuration?.referenceLibrary&&executionRoot,'LOCAL_REFERENCE_CONFIGURATION_REQUIRED');
 const library=configuration.referenceLibrary,idOf=ctx=>ctx.case?.projectId??ctx.project.id;
 async function plan(p,record){const a=p.artifacts.find(a=>a.id===p.activeByStage.copy);need(a,'LOCAL_REFERENCE_COPY_REQUIRED');const loaded=await readArtifactContent(p,a.id,executionRoot);return {artifact:a,slots:localReferenceCandidatePlan(assetCatalogue,record.caseId,loaded.content.directions.map(d=>d.id))};}
 async function inspect(ctx){const id=idOf(ctx),p=projectStore.read(id);if(!p.activeByStage.copy)return {status:'blocked',reason:'LOCAL_REFERENCE_COPY_REQUIRED',syntheticOnly:true};
  const {artifact,slots}=await plan(p,ctx.case),materials=p.referenceMaterials??[],missing=slots.find(slot=>!materials.some(m=>!m.removed&&m.artifactId===artifact.id&&m.directionId===slot.directionId&&m.provenance.kind==='local_curated_library'&&m.provenance.catalogueDigest===library.catalogueDigest&&m.provenance.entryId===slot.entryId));
  if(missing)return {status:'pending',nextOperation:'import_library_material',directionId:missing.directionId,libraryEntryId:missing.entryId,syntheticOnly:true};
  const state=await executor.referenceStatus(id,artifact.id);
  if(['ready_for_sketch','endpoint_reached'].includes(state.status)){
   const current=projectStore.read(id),d=current.referenceDossiers.find(d=>d.id===state.dossierId);need(d,'LOCAL_REFERENCE_DOSSIER_REQUIRED');await verifyOrdinaryReferenceProject(current,d,{executionRoot,imageStore});
   const native=referenceState(current,d,{sourceEnvelope:copyDeliveryEnvelope});need(['ready_for_sketch','endpoint_reached'].includes(native.status)&&native.selectionHash===state.selectionHash,'LOCAL_REFERENCE_SELECTION_CHANGED');
   need(native.selection.length===3&&native.selection.every(s=>new Set(d.candidates.filter(c=>c.directionId===s.directionId).map(c=>c.image.sha256)).size>=2),'LOCAL_REFERENCE_CANDIDATE_COVERAGE');
   const chosen=native.selection.map(s=>s.images.find(i=>i.imageId===s.main.imageId)?.sha256);need(chosen.every(Boolean)&&new Set(chosen).size===3,'LOCAL_REFERENCE_SELECTED_IMAGES_NOT_DISTINCT');
   const jobs=current.jobs.filter(j=>j.dossierId===d.id);need(jobs.length>0&&jobs.every(j=>j.status==='succeeded'),'LOCAL_REFERENCE_JOBS_INCOMPLETE');
   return {status:'complete',deliveryReady:true,dossierId:d.id,selectionHash:native.selectionHash,selection:native.selection,jobIds:jobs.map(j=>j.id),resultIds:[d.id],syntheticOnly:true,realQualityVerified:false,nativeCalibrationStatus:native.calibration,provenanceKind:'local_curated_library',captureState:'legacy-not-verified',automaticSearchCredit:false};
  }
  if(['waiting_human','diagnostic','choice_awaiting_adoption'].includes(state.status))return {status:'awaiting_user',reason:state.reason??'REFERENCE_HUMAN_ADOPTION',nativeStatus:state.status,dossierId:state.dossierId,selectionHash:state.selectionHash,editionHash:state.humanChoice?.activeEdition?.editionHash??null,syntheticOnly:true};
  if(['blocked','failed','awaiting_reconciliation','returned','budget_limit','stale','paused','choice_blocked','coverage_gap'].includes(state.status))return {status:state.status==='awaiting_reconciliation'?'awaiting_reconciliation':'blocked',reason:state.reason??state.status,syntheticOnly:true};
  return {status:'pending',nextOperation:p.referenceIntents?.some(i=>i.artifactId===artifact.id)?'advance_reference_graph':'continue_copy',nativeStatus:state.status,syntheticOnly:true};
 }
 async function advance(ctx){const id=idOf(ctx),state=await inspect(ctx);if(state.status!=='pending')return state;let p=projectStore.read(id);
  if(state.nextOperation==='import_library_material'){
   const {artifact,slots}=await plan(p,ctx.case),slot=slots.find(s=>s.directionId===state.directionId&&s.entryId===state.libraryEntryId),entry=referenceLibraryEntry(library,slot.entryId),bytes=await readFile(slot.asset.file);need(createHash('sha256').update(bytes).digest('hex')===entry.sha256,'LOCAL_REFERENCE_LIBRARY_BYTES_CHANGED');
   let asset=p.imageAssets.find(a=>a.sha256===entry.sha256&&a.provenance.sourcePageUrl===entry.sourceUrl&&a.provenance.description===REFERENCE_LIBRARY_DESCRIPTION);
   if(!asset){asset=await imageStore.ingest({projectId:id,bytes,metadata:{representation:entry.representation,sourcePageUrl:entry.sourceUrl,description:REFERENCE_LIBRARY_DESCRIPTION}});projectStore.command(id,{kind:'register-image',asset,commandId:'library-image-'+hash([id,entry.id,entry.sha256]),expectedRevision:p.revision},context());}
   p=projectStore.read(id);await executor.submitReferenceLibraryMaterial(id,{artifactId:artifact.id,directionId:slot.directionId,imageId:asset.id,libraryEntryId:entry.id,catalogueDigest:library.catalogueDigest,kind:'direction',applicabilityProfile:'direction',borrowingNote:'仅借鉴当前主题相关的构图、视觉载体和材料表达；原图是本地资料库参考，不是新捕获的官方证据、用户偏好或商业使用授权。',commandId:'library-use-'+hash([artifact.id,slot.directionId,entry.id]),expectedRevision:p.revision});return inspect(ctx);
  }
  if(state.nextOperation==='continue_copy'){await executor.continueCopy(id,{artifactId:p.activeByStage.copy,discoveryMode:'manual_supplied',commandId:'local-reference-'+hash([id,p.activeByStage.copy,library.catalogueDigest]),expectedRevision:p.revision});return inspect(ctx);}
  const ids=await executor.advanceReferences(id);if(ids.length)await executor.execute(id,ids[0]);return inspect(ctx);
 }
 async function decide(ctx){const state=await inspect(ctx);need(ctx.request?.decision==='approve'&&ctx.request.contribution===undefined,'LOCAL_REFERENCE_CONTRIBUTION_HANDLER_REQUIRED');need(state.status==='awaiting_user','LOCAL_REFERENCE_NO_HUMAN_GATE');const p=projectStore.read(idOf(ctx)),user={actorType:'human',actorId:'local-acceptance-user',runId:randomUUID(),contextId:randomUUID()},base={dossierId:state.dossierId,reason:ctx.request.comment||'用户确认当前本地测试参考选择；不构成事实或商业授权。',commandId:ctx.request.commandId,expectedRevision:p.revision};
  if(state.nativeStatus==='choice_awaiting_adoption')await executor.chooseReferences(p.id,{...base,action:'adopt',editionHash:state.editionHash},user);
  else await executor.adoptReferences(p.id,{...base,selectionHash:state.selectionHash},user);
  return {disposition:'adopted',reason:'Explicit local-user reference adoption; no factual upgrade.',selectionHash:state.selectionHash,editionHash:state.editionHash};}
 return {inspect,advance,decide};
}
