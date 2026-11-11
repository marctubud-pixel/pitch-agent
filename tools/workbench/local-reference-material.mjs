import {randomUUID,createHash} from 'node:crypto';
import {isDeepStrictEqual as equal} from 'node:util';
import {readArtifactContent} from './artifact-content.mjs';
import {imageManifest} from './image-evidence.mjs';
import {REFERENCE_APPLICABILITY} from './reference-review.mjs';
const need=(value,code,status=422)=>{if(!value)throw Object.assign(Error(code),{code,status});};
const id=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(value);
const text=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const fields=['commandId','expectedRevision','artifactId','copyContentHash','imageId','imageSha256','directionId','kind','applicabilityProfile','borrowingNote'];
export function referenceMaterialRequest(value){
 need(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===fields.length&&Object.keys(value).every(k=>fields.includes(k)),'LOCAL_REFERENCE_MATERIAL_FIELDS_INVALID');
 need(id(value.commandId)&&Number.isSafeInteger(value.expectedRevision)&&value.expectedRevision>=0&&text(value.artifactId,1000)&&id(value.imageId)&&text(value.directionId,1000)&&hash(value.copyContentHash)&&hash(value.imageSha256),'LOCAL_REFERENCE_MATERIAL_IDENTITY_REQUIRED');
 need(['direction','component'].includes(value.kind)&&Object.hasOwn(REFERENCE_APPLICABILITY,value.applicabilityProfile)&&(value.kind==='direction'?value.applicabilityProfile==='direction':value.applicabilityProfile!=='direction')&&text(value.borrowingNote,10000),'LOCAL_REFERENCE_MATERIAL_PURPOSE_REQUIRED');return structuredClone(value);
}
export function createLocalReferenceMaterial({projectStore,imageStore,readCase,executionRoot,register}){
 need(typeof projectStore?.read==='function'&&typeof register==='function'&&typeof imageStore?.read==='function'&&typeof readCase==='function'&&typeof executionRoot==='string','LOCAL_REFERENCE_MATERIAL_DEPENDENCIES_REQUIRED');
 return async function submit(caseId,input){
  need(id(caseId),'LOCAL_REFERENCE_MATERIAL_CASE_REQUIRED');const request=referenceMaterialRequest(input),record=await readCase(caseId);
  need(record?.id===caseId&&typeof record.projectId==='string','LOCAL_REFERENCE_MATERIAL_CASE_REQUIRED',404);
  const p=projectStore.read(record.projectId),artifact=p.artifacts.find(a=>a.id===request.artifactId),asset=p.imageAssets.find(a=>a.id===request.imageId);
  need(artifact?.stage==='copy'&&artifact.contentHash===request.copyContentHash,'LOCAL_REFERENCE_MATERIAL_COPY_CHANGED',409);
  need(asset?.projectId===p.id&&asset.sha256===request.imageSha256,'LOCAL_REFERENCE_MATERIAL_IMAGE_CHANGED',409);
  const content=await readArtifactContent(p,artifact.id,executionRoot),original=await imageStore.read({projectId:p.id,imageId:asset.id,expectedHash:request.imageSha256});
  need(equal(original.asset,asset)&&original.bytes instanceof Uint8Array&&original.bytes.byteLength===asset.byteLength&&createHash('sha256').update(original.bytes).digest('hex')===request.imageSha256,'LOCAL_REFERENCE_MATERIAL_IMAGE_CHANGED',409);
  const {copyContentHash,imageSha256,...nativeRequest}=request,command={kind:'record-reference-material',request:nativeRequest,copyContents:content.contentText,commandId:request.commandId,expectedRevision:request.expectedRevision};
  const fingerprint=Object.fromEntries(Object.entries(command).filter(([key])=>key!=='expectedRevision'));
  const creation={id:request.commandId,artifactId:artifact.id,copyContentHash,directionId:request.directionId,image:{...imageManifest([{...asset,imageId:asset.id}])[0],width:asset.width,height:asset.height},kind:request.kind,applicabilityProfile:request.applicabilityProfile,borrowingNote:request.borrowingNote,provenance:{kind:'manual_supplied',submittedBy:'local-acceptance-user'},request:nativeRequest};
  function committed(current){
   if(!Object.hasOwn(current.processedCommands,request.commandId))return null;
   need(equal(JSON.parse(current.processedCommands[request.commandId]),fingerprint),'LOCAL_REFERENCE_MATERIAL_COMMAND_REUSED',409);
   const material=current.referenceMaterials.find(m=>m.id===request.commandId);need(material,'LOCAL_REFERENCE_MATERIAL_ORIGINAL_CHANGED',409);
   const {removed,...immutable}=material;need(equal(immutable,creation),'LOCAL_REFERENCE_MATERIAL_ORIGINAL_CHANGED',409);
   const audit=current.audit.find(a=>a.commandId===request.commandId);need(audit?.kind==='record-reference-material'&&equal(projectStore.read(current.id,audit.revision).referenceMaterials.find(m=>m.id===request.commandId),creation),'LOCAL_REFERENCE_MATERIAL_ORIGINAL_CHANGED',409);
   const removal=current.audit.findLast(a=>a.kind==='remove-reference-material'&&JSON.parse(current.processedCommands[a.commandId]).materialId===material.id);
   const historicalRemoval=removal?projectStore.read(current.id,removal.revision).referenceMaterials.find(m=>m.id===material.id)?.removed:undefined;
   need((!removal||historicalRemoval)&&equal(historicalRemoval,removed),'LOCAL_REFERENCE_MATERIAL_REMOVAL_CHANGED',409);
   const sourceCurrent=current.activeByStage.copy===artifact.id;
   return {material:structuredClone(material),projectRevision:current.revision,sourceCurrent,removed:!!removed,disposition:removed?'removed':sourceCurrent?'registered_unassessed':'historical_source',factualAuthority:false,semanticReviewVerified:false,referenceAdoptionVerified:false};
  }
  const prior=committed(projectStore.read(p.id));if(prior)return {...prior,reused:true};
  need(['ready','legacy_ready'].includes(record.initializationState)&&!record.pendingContinuation&&['pending','running','awaiting_user','blocked'].includes(record.nextAction?.status),'LOCAL_REFERENCE_MATERIAL_CASE_BUSY',409);
  need(p.activeByStage.copy===artifact.id&&p.revision===request.expectedRevision,'LOCAL_REFERENCE_MATERIAL_STALE',409);
  try{register({projectId:p.id,command,actor:{actorType:'human',actorId:'local-acceptance-user',runId:randomUUID(),contextId:randomUUID()},sourcePins:{copyContentHash:request.copyContentHash,imageSha256:request.imageSha256}});}
  catch(error){const recovered=committed(projectStore.read(p.id));if(recovered)return {...recovered,reused:true};throw error;}
  const saved=committed(projectStore.read(p.id));need(saved,'LOCAL_REFERENCE_MATERIAL_COMMIT_UNPROVEN',409);return {...saved,reused:false};
 };
}
