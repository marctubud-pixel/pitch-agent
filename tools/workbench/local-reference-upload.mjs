import {createHash,randomUUID} from 'node:crypto';
import {isDeepStrictEqual as equal} from 'node:util';
import {IMAGE_LIMITS} from './image-evidence.mjs';
const need=(v,code,status=422)=>{if(!v)throw Object.assign(Error(code),{code,status});};
const validId=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(v)&&v!=='__proto__';
export function localReferenceUploadRequest(request){
 need(request&&typeof request==='object'&&!Array.isArray(request)&&Object.keys(request).every(k=>['commandId','expectedRevision','base64','metadata'].includes(k)),'LOCAL_UPLOAD_FIELDS_INVALID');
 need(validId(request.commandId)&&Number.isSafeInteger(request.expectedRevision)&&request.expectedRevision>=0,'LOCAL_UPLOAD_COMMAND_REQUIRED');
 need(typeof request.base64==='string'&&request.base64.length>0&&request.base64.length<=4*Math.ceil(IMAGE_LIMITS.bytes/3)&&/^[A-Za-z0-9+/]*={0,2}$/.test(request.base64),'LOCAL_UPLOAD_BASE64_INVALID');
 const bytes=Buffer.from(request.base64,'base64');need(bytes.length>0&&bytes.length<=IMAGE_LIMITS.bytes&&bytes.toString('base64')===request.base64,'LOCAL_UPLOAD_BASE64_INVALID');
 return {bytes,uploadRequest:{sha256:createHash('sha256').update(bytes).digest('hex'),metadata:structuredClone(request.metadata),expectedRevision:request.expectedRevision}};
}
export function createLocalReferenceUpload({projectStore,imageStore,readCase}){
 need(typeof projectStore?.read==='function'&&typeof projectStore?.command==='function'&&typeof imageStore?.ingest==='function'&&typeof imageStore?.read==='function'&&typeof readCase==='function','LOCAL_UPLOAD_DEPENDENCIES_REQUIRED');
 const inFlight=new Map();
 async function perform(caseId,request,prepared){
  const record=await readCase(caseId);need(record?.id===caseId&&typeof record.projectId==='string','LOCAL_UPLOAD_CASE_REQUIRED',404);
  const projectId=record.projectId,prior=projectStore.read(projectId);
  async function original(asset){
   need(asset?.projectId===projectId&&asset.sha256===prepared.uploadRequest.sha256&&asset.byteLength===prepared.bytes.length,'LOCAL_UPLOAD_ORIGINAL_CHANGED',409);
   const loaded=await imageStore.read({projectId,imageId:asset.id,expectedHash:asset.sha256});
   need(equal(loaded.asset,asset)&&Buffer.from(loaded.bytes).equals(prepared.bytes),'LOCAL_UPLOAD_ORIGINAL_CHANGED',409);
  }
  async function committed(project){
   if(!Object.hasOwn(project.processedCommands,request.commandId))return null;
   const command=JSON.parse(project.processedCommands[request.commandId]);need(command.kind==='register-image'&&equal(command.uploadRequest,prepared.uploadRequest),'LOCAL_UPLOAD_COMMAND_REUSED',409);
   const asset=project.imageAssets.find(a=>a.id===command.asset.id);need(asset&&equal(asset,command.asset),'LOCAL_UPLOAD_ORIGINAL_CHANGED',409);await original(asset);
   return {asset,projectRevision:project.revision,reused:true,factualAuthority:false,semanticReviewVerified:false,referenceReviewRequired:true};
  }
  const saved=await committed(prior);if(saved)return saved;
  need(record.initializationState==='ready'||record.initializationState==='legacy_ready','LOCAL_UPLOAD_CASE_NOT_READY',409);
  need(['pending','running','awaiting_user','blocked'].includes(record.nextAction?.status)&&!record.pendingContinuation,'LOCAL_UPLOAD_CASE_BUSY',409);
  need(prior.revision===request.expectedRevision,'LOCAL_UPLOAD_REVISION_CONFLICT',409);
  const asset=await imageStore.ingest({projectId,bytes:prepared.bytes,metadata:prepared.uploadRequest.metadata});
  await original(asset);
  try{projectStore.command(projectId,{kind:'register-image',asset,uploadRequest:prepared.uploadRequest,commandId:request.commandId,expectedRevision:request.expectedRevision},{actorType:'agent',actorId:'image-ingestion',runId:randomUUID(),contextId:randomUUID()});}
  catch(error){const recovered=await committed(projectStore.read(projectId));if(recovered)return recovered;throw error;}
  return {...await committed(projectStore.read(projectId)),reused:false};
 }
 return async function upload(caseId,request){
  need(validId(caseId),'LOCAL_UPLOAD_CASE_REQUIRED');const prepared=localReferenceUploadRequest(request),key=caseId+':'+request.commandId,active=inFlight.get(key);
  if(active){need(equal(active.request,prepared.uploadRequest),'LOCAL_UPLOAD_COMMAND_REUSED',409);return active.promise;}
  const promise=perform(caseId,request,prepared);inFlight.set(key,{request:prepared.uploadRequest,promise});try{return await promise;}finally{inFlight.delete(key);}
 };
}
