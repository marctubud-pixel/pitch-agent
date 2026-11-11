import {createHash} from 'node:crypto';
import {isDeepStrictEqual as equal} from 'node:util';
import {localReferenceUploadRequest} from './local-reference-upload.mjs';
import {referenceMaterialRequest} from './local-reference-material.mjs';
import {readArtifactContent} from './artifact-content.mjs';
import {imageManifest} from './image-evidence.mjs';
import {requestIdentityWire} from '../local-acceptance/request-identity.mjs';

const need=(v,code,status=409)=>{if(!v)throw Object.assign(Error(code),{code,status});};
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(v)&&v!=='__proto__';
const hash=v=>createHash('sha256').update(v).digest('hex');
const digest=v=>hash(JSON.stringify(v));
const keys=(v,allowed)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>allowed.includes(k));
const parse=value=>{try{return JSON.parse(value);}catch{throw Object.assign(Error('LOCAL_REFERENCE_COMMAND_HISTORY_INVALID'),{code:'LOCAL_REFERENCE_COMMAND_HISTORY_INVALID',status:409});}};

export function createLocalReferenceCommandReader({projectStore,imageStore,readCase,executionRoot}){
 need(typeof projectStore?.read==='function'&&typeof imageStore?.read==='function'&&typeof readCase==='function'&&typeof executionRoot==='string','LOCAL_REFERENCE_COMMAND_DEPENDENCIES_REQUIRED',422);
 async function read(caseId,commandId){
  need(id(caseId)&&id(commandId),'LOCAL_REFERENCE_COMMAND_ID_INVALID',422);
  const record=await readCase(caseId);need(record?.id===caseId&&id(record.projectId),'LOCAL_REFERENCE_COMMAND_CASE_REQUIRED',404);
  const p=projectStore.read(record.projectId);need(p.id===record.projectId,'LOCAL_REFERENCE_COMMAND_CASE_CHANGED');
  need(Object.hasOwn(p.processedCommands,commandId),'LOCAL_REFERENCE_COMMAND_NOT_FOUND',404);
  const raw=p.processedCommands[commandId],command=parse(raw);
  need(['register-image','record-reference-material'].includes(command.kind),'LOCAL_REFERENCE_COMMAND_UNSUPPORTED',422);
  const audits=p.audit.filter(a=>a.commandId===commandId);
  need(audits.length===1&&audits[0].kind===command.kind&&Number.isSafeInteger(audits[0].revision)&&audits[0].revision>=1,'LOCAL_REFERENCE_COMMAND_HISTORY_INVALID');
  const audit=audits[0],created=projectStore.read(p.id,audit.revision),before=projectStore.read(p.id,audit.revision-1);
  need(created.id===p.id&&before.id===p.id&&created.revision===audit.revision&&before.revision===audit.revision-1&&created.processedCommands[commandId]===raw&&!Object.hasOwn(before.processedCommands,commandId)&&equal(created.audit.find(a=>a.commandId===commandId),audit),'LOCAL_REFERENCE_COMMAND_HISTORY_INVALID');
  async function original(asset){
   need(asset?.projectId===p.id&&equal(p.imageAssets.find(a=>a.id===asset.id),asset)&&equal(created.imageAssets.find(a=>a.id===asset.id),asset),'LOCAL_REFERENCE_COMMAND_IMAGE_CHANGED');
   const loaded=await imageStore.read({projectId:p.id,imageId:asset.id,expectedHash:asset.sha256});
   need(equal(loaded.asset,asset)&&loaded.bytes instanceof Uint8Array&&loaded.bytes.byteLength===asset.byteLength&&hash(loaded.bytes)===asset.sha256,'LOCAL_REFERENCE_COMMAND_IMAGE_CHANGED');
   return Buffer.from(loaded.bytes);
  }
  let request,identity,operation;
  if(command.kind==='register-image'){
   need(keys(command,['kind','asset','uploadRequest','commandId'])&&command.commandId===commandId&&keys(command.uploadRequest,['sha256','metadata','expectedRevision']),'LOCAL_REFERENCE_COMMAND_UPLOAD_REQUIRED');
   const bytes=await original(command.asset);need(!before.imageAssets.some(a=>a.id===command.asset.id),'LOCAL_REFERENCE_COMMAND_HISTORY_INVALID');
   request={commandId,expectedRevision:command.uploadRequest.expectedRevision,base64:bytes.toString('base64')};
   if(Object.hasOwn(command.uploadRequest,'metadata'))request.metadata=structuredClone(command.uploadRequest.metadata);
   const reconstructed=localReferenceUploadRequest(request);
   need(equal(reconstructed.uploadRequest,command.uploadRequest)&&request.expectedRevision===before.revision,'LOCAL_REFERENCE_COMMAND_UPLOAD_CHANGED');
   identity={imageId:command.asset.id,imageSha256:command.asset.sha256,byteLength:command.asset.byteLength,mediaType:command.asset.mediaType};operation='reference_upload';
  }else{
   need(keys(command,['kind','request','copyContents','commandId'])&&command.commandId===commandId&&command.request?.commandId===commandId,'LOCAL_REFERENCE_COMMAND_MATERIAL_REQUIRED');
   const native=command.request;need(Object.keys(native).length===8&&keys(native,['commandId','expectedRevision','artifactId','imageId','directionId','kind','applicabilityProfile','borrowingNote']),'LOCAL_REFERENCE_COMMAND_MATERIAL_REQUIRED');
   const artifact=created.artifacts.find(a=>a.id===native.artifactId),asset=created.imageAssets.find(a=>a.id===native.imageId);
   need(artifact?.stage==='copy'&&created.activeByStage.copy===artifact.id&&before.activeByStage.copy===artifact.id&&equal(p.artifacts.find(a=>a.id===artifact.id),artifact),'LOCAL_REFERENCE_COMMAND_COPY_CHANGED');
   const content=await readArtifactContent(created,artifact.id,executionRoot);await original(asset);
   need(command.copyContents===content.contentText&&hash(content.contentText)===artifact.contentHash,'LOCAL_REFERENCE_COMMAND_COPY_CHANGED');
   request=referenceMaterialRequest({...native,copyContentHash:artifact.contentHash,imageSha256:asset.sha256});
   need(request.expectedRevision===before.revision,'LOCAL_REFERENCE_COMMAND_HISTORY_INVALID');
   const creation={id:commandId,artifactId:artifact.id,copyContentHash:artifact.contentHash,directionId:request.directionId,image:{...imageManifest([{...asset,imageId:asset.id}])[0],width:asset.width,height:asset.height},kind:request.kind,applicabilityProfile:request.applicabilityProfile,borrowingNote:request.borrowingNote,provenance:{kind:'manual_supplied',submittedBy:'local-acceptance-user'},request:native};
   need(!(before.referenceMaterials??[]).some(m=>m.id===commandId)&&equal(created.referenceMaterials.find(m=>m.id===commandId),creation),'LOCAL_REFERENCE_COMMAND_MATERIAL_CHANGED');
   const material=p.referenceMaterials.find(m=>m.id===commandId);need(material,'LOCAL_REFERENCE_COMMAND_MATERIAL_CHANGED');
   const {removed,...immutable}=material;need(equal(immutable,creation),'LOCAL_REFERENCE_COMMAND_MATERIAL_CHANGED');
   const removal=p.audit.findLast(a=>a.kind==='remove-reference-material'&&parse(p.processedCommands[a.commandId]).materialId===commandId);
   const historicalRemoval=removal?projectStore.read(p.id,removal.revision).referenceMaterials.find(m=>m.id===commandId)?.removed:undefined;
   need((!removal||historicalRemoval)&&equal(historicalRemoval,removed),'LOCAL_REFERENCE_COMMAND_REMOVAL_CHANGED');
   const sourceCurrent=p.activeByStage.copy===artifact.id;
   identity={materialId:commandId,artifactId:artifact.id,copyContentHash:artifact.contentHash,imageId:asset.id,imageSha256:asset.sha256,directionId:request.directionId,kind:request.kind,applicabilityProfile:request.applicabilityProfile,sourceCurrent,removed:!!removed,disposition:removed?'removed':sourceCurrent?'registered_unassessed':'historical_source'};operation='reference_material';
  }
  return {protocol:'local-reference-command-receipt-v1',caseId,projectId:p.id,commandId,operation,state:'committed',requestDigest:hash(requestIdentityWire(request)),committedRevision:audit.revision,observedRevision:p.revision,nativeCommandHash:hash(raw),auditHash:digest(audit),identity,factualAuthority:false,referenceAdoptionVerified:false};
 }
 return {read};
}
