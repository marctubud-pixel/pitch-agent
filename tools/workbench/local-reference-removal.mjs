import {createHash,randomUUID} from 'node:crypto';
import {isDeepStrictEqual as equal} from 'node:util';
import {applyCommand} from './project.mjs';
import {referenceInputClosure} from './reference-input-seal.mjs';
import {requestIdentityWire} from '../local-acceptance/request-identity.mjs';
const need=(v,code,status=409)=>{if(!v)throw Object.assign(Error(code),{code,status});};
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(v)&&v!=='__proto__';
const hash=v=>createHash('sha256').update(v).digest('hex');
const fields=['commandId','expectedRevision','artifactId','copyContentHash','materialId','reason'];
const parse=v=>{try{return JSON.parse(v);}catch{throw Object.assign(Error('LOCAL_REFERENCE_WITHDRAWAL_HISTORY_INVALID'),{code:'LOCAL_REFERENCE_WITHDRAWAL_HISTORY_INVALID',status:409});}};
export function referenceWithdrawalRequest(v){
 need(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===fields.length&&Object.keys(v).every(k=>fields.includes(k)),'LOCAL_REFERENCE_WITHDRAWAL_FIELDS_INVALID',422);
 need(id(v.commandId)&&id(v.materialId)&&typeof v.artifactId==='string'&&v.artifactId.length>0&&v.artifactId.length<=1000&&/^[a-f0-9]{64}$/.test(v.copyContentHash)&&Number.isSafeInteger(v.expectedRevision)&&v.expectedRevision>=0,'LOCAL_REFERENCE_WITHDRAWAL_SOURCE_REQUIRED',422);
 need(typeof v.reason==='string'&&v.reason.trim().length>0&&v.reason.length<=10000,'LOCAL_REFERENCE_WITHDRAWAL_REASON_REQUIRED',422);return structuredClone(v);
}
export function assertReferenceWithdrawalAdmission(current,record,command,sourcePins){
 need(record?.projectId===current.id&&record.referenceRuntimeProfile==='local-reference-pool-v2'&&record.mode==='assisted'&&record.checkpoints?.includes('references'),'LOCAL_REFERENCE_WITHDRAWAL_MODE_REQUIRED');
 const material=current.referenceMaterials.find(m=>m.id===command.materialId),copy=current.artifacts.find(a=>a.id===sourcePins.artifactId),image=current.imageAssets.find(a=>a.id===material?.image?.imageId);
 need(!referenceInputClosure(current,sourcePins.artifactId).closed,'LOCAL_REFERENCE_INPUT_SEALED');
 need(command.kind==='remove-reference-material'&&current.revision===command.expectedRevision&&current.activeByStage.copy===sourcePins.artifactId&&copy?.stage==='copy'&&copy.contentHash===sourcePins.copyContentHash&&material?.artifactId===copy.id&&material.copyContentHash===copy.contentHash&&material.provenance?.kind==='manual_supplied'&&!material.removed&&material.id===sourcePins.materialId&&image?.projectId===current.id&&image.sha256===sourcePins.imageSha256&&material.image.sha256===image.sha256,'LOCAL_REFERENCE_WITHDRAWAL_SOURCE_CHANGED');
}
export function createLocalReferenceRemoval({projectStore,readCase,readCaseRecord=readCase,register}={}){
 need(typeof projectStore?.read==='function'&&typeof readCase==='function'&&typeof readCaseRecord==='function','LOCAL_REFERENCE_WITHDRAWAL_DEPENDENCIES_REQUIRED',422);
 function materialOrigin(project,materialId){
  const raw=project.processedCommands?.[materialId],audits=project.audit.filter(a=>a.commandId===materialId);need(typeof raw==='string'&&audits.length===1,'LOCAL_REFERENCE_WITHDRAWAL_MATERIAL_HISTORY_INVALID');
  const command=parse(raw),audit=audits[0];need(command.kind==='record-reference-material'&&command.commandId===materialId&&audit.kind===command.kind&&Number.isSafeInteger(audit.revision)&&audit.revision>=1&&audit.revision<=project.revision,'LOCAL_REFERENCE_WITHDRAWAL_MATERIAL_HISTORY_INVALID');
  const before=projectStore.read(project.id,audit.revision-1),created=projectStore.read(project.id,audit.revision),material=created.referenceMaterials?.find(m=>m.id===materialId),artifact=created.artifacts.find(a=>a.id===material?.artifactId),asset=created.imageAssets.find(a=>a.id===material?.image?.imageId);
  need(before.id===project.id&&created.id===project.id&&before.revision===audit.revision-1&&created.revision===audit.revision&&!Object.hasOwn(before.processedCommands,materialId)&&created.processedCommands[materialId]===raw&&equal(created.audit.find(a=>a.commandId===materialId),audit)&&!before.referenceMaterials?.some(m=>m.id===materialId)&&material&&!material.removed&&material.provenance?.kind==='manual_supplied'&&material.provenance.submittedBy===audit.actorId,'LOCAL_REFERENCE_WITHDRAWAL_MATERIAL_HISTORY_INVALID');
  need(typeof command.copyContents==='string'&&Buffer.byteLength(command.copyContents)<=1024*1024&&artifact?.stage==='copy'&&hash(command.copyContents)===artifact.contentHash&&material.copyContentHash===artifact.contentHash&&command.request?.expectedRevision===before.revision&&asset?.projectId===project.id&&asset.sha256===material.image.sha256,'LOCAL_REFERENCE_WITHDRAWAL_MATERIAL_HISTORY_INVALID');
  const actor={actorType:'human',actorId:audit.actorId,runId:'withdrawal-origin-replay',contextId:'withdrawal-origin-replay',...(audit.at===null?{}:{now:audit.at})};need(equal(applyCommand(before,{...command,expectedRevision:before.revision},actor),created),'LOCAL_REFERENCE_WITHDRAWAL_MATERIAL_HISTORY_INVALID');return material;
 }
 async function readReceipt(caseId,commandId){
  need(id(caseId)&&id(commandId),'LOCAL_REFERENCE_WITHDRAWAL_ID_REQUIRED',422);const record=await readCaseRecord(caseId);need(record?.id===caseId&&id(record.projectId),'LOCAL_REFERENCE_WITHDRAWAL_CASE_REQUIRED',404);
  const p=projectStore.read(record.projectId);need(p.id===record.projectId,'LOCAL_REFERENCE_WITHDRAWAL_CASE_CHANGED');const raw=p.processedCommands?.[commandId];need(typeof raw==='string','LOCAL_REFERENCE_COMMAND_NOT_FOUND',404);const c=parse(raw);
  need(c.kind==='remove-reference-material'&&c.commandId===commandId&&Object.keys(c).length===4&&Object.keys(c).every(k=>['kind','materialId','reason','commandId'].includes(k)),'LOCAL_REFERENCE_WITHDRAWAL_COMMAND_INVALID');
  const audits=p.audit.filter(a=>a.commandId===commandId);need(audits.length===1&&audits[0].kind===c.kind&&Number.isSafeInteger(audits[0].revision)&&audits[0].revision>=1&&audits[0].revision<=p.revision,'LOCAL_REFERENCE_WITHDRAWAL_HISTORY_INVALID');
  const audit=audits[0],before=projectStore.read(p.id,audit.revision-1),created=projectStore.read(p.id,audit.revision),old=before.referenceMaterials?.find(m=>m.id===c.materialId),made=created.referenceMaterials?.find(m=>m.id===c.materialId),current=p.referenceMaterials?.find(m=>m.id===c.materialId);
  need(before.id===p.id&&created.id===p.id&&before.revision===audit.revision-1&&created.revision===audit.revision&&!Object.hasOwn(before.processedCommands,commandId)&&created.processedCommands[commandId]===raw&&equal(created.audit.find(a=>a.commandId===commandId),audit),'LOCAL_REFERENCE_WITHDRAWAL_HISTORY_INVALID');
  need(equal(materialOrigin(p,c.materialId),old),'LOCAL_REFERENCE_WITHDRAWAL_MATERIAL_HISTORY_INVALID');
  need(old&&!referenceInputClosure(before,old.artifactId).closed&&!old.removed&&old.provenance?.kind==='manual_supplied'&&made?.removed?.reason===c.reason&&made.removed.context?.actorType==='human'&&made.removed.context.actorId==='local-acceptance-user','LOCAL_REFERENCE_WITHDRAWAL_ORIGINAL_CHANGED');
  need(equal(applyCommand(before,{...c,expectedRevision:before.revision},made.removed.context),created),'LOCAL_REFERENCE_WITHDRAWAL_HISTORY_INVALID');
  const {removed:madeRemoval,...original}=made,{removed:currentRemoval,...currentOriginal}=current??{};need(equal(original,currentOriginal)&&currentRemoval,'LOCAL_REFERENCE_WITHDRAWAL_ORIGINAL_CHANGED');
  const artifact=created.artifacts.find(a=>a.id===made.artifactId),asset=created.imageAssets.find(a=>a.id===made.image?.imageId);
  need(artifact?.stage==='copy'&&before.activeByStage.copy===artifact.id&&created.activeByStage.copy===artifact.id&&artifact.contentHash===made.copyContentHash&&equal(p.artifacts.find(a=>a.id===artifact.id),artifact)&&equal(p.imageAssets.find(a=>a.id===asset?.id),asset)&&asset?.projectId===p.id&&asset.sha256===made.image.sha256,'LOCAL_REFERENCE_WITHDRAWAL_SOURCE_CHANGED');

  const latest=p.audit.findLast(a=>a.kind==='remove-reference-material'&&parse(p.processedCommands[a.commandId]).materialId===made.id),latestProject=latest&&projectStore.read(p.id,latest.revision);need(latestProject&&equal(latestProject.referenceMaterials.find(m=>m.id===made.id)?.removed,currentRemoval),'LOCAL_REFERENCE_WITHDRAWAL_ORIGINAL_CHANGED');
  const request=referenceWithdrawalRequest({commandId,expectedRevision:before.revision,artifactId:artifact.id,copyContentHash:artifact.contentHash,materialId:made.id,reason:c.reason});
  return {protocol:'local-reference-command-receipt-v1',caseId,projectId:p.id,commandId,operation:'reference_withdrawal',state:'committed',requestDigest:hash(requestIdentityWire(request)),committedRevision:audit.revision,observedRevision:p.revision,nativeCommandHash:hash(raw),auditHash:hash(JSON.stringify(audit)),identity:{materialId:made.id,artifactId:artifact.id,copyContentHash:artifact.contentHash,imageId:asset.id,imageSha256:asset.sha256,removed:true,sourceCurrent:p.activeByStage.copy===artifact.id},factualAuthority:false,referenceAdoptionVerified:false,pixelsVerified:false,proofScope:'native_material_withdrawal_history_only'};
 }
 async function withdraw(caseId,input){
  need(typeof register==='function','LOCAL_REFERENCE_WITHDRAWAL_NOT_CONNECTED',501);need(id(caseId),'LOCAL_REFERENCE_WITHDRAWAL_CASE_REQUIRED',422);const request=referenceWithdrawalRequest(input),record=await readCase(caseId);need(record?.id===caseId&&id(record.projectId),'LOCAL_REFERENCE_WITHDRAWAL_CASE_REQUIRED',404);
  const p=projectStore.read(record.projectId);need(p.id===record.projectId,'LOCAL_REFERENCE_WITHDRAWAL_CASE_CHANGED');
  async function committed(){const latest=projectStore.read(p.id);if(!Object.hasOwn(latest.processedCommands,request.commandId))return null;const receipt=await readReceipt(caseId,request.commandId);need(receipt.requestDigest===hash(requestIdentityWire(request)),'LOCAL_REFERENCE_WITHDRAWAL_COMMAND_REUSED');return {materialId:request.materialId,removed:true,projectRevision:latest.revision,commandReceipt:receipt,factualAuthority:false,referenceAdoptionVerified:false,pixelsVerified:false,proofScope:'native_material_withdrawal_history_only'};}
  const saved=await committed();if(saved)return {...saved,reused:true};
  need(record.referenceRuntimeProfile==='local-reference-pool-v2'&&record.mode==='assisted'&&record.checkpoints?.includes('references'),'LOCAL_REFERENCE_WITHDRAWAL_MODE_REQUIRED');
  const normalInput=record.nextAction?.module==='references'&&record.nextAction.status==='awaiting_user'&&record.nextAction.reason==='SELECTED_REFERENCE_INPUT_CHECKPOINT',correctionInput=record.referenceInput?.kind==='reference_correction'&&record.referenceInput.editAccess?.protocol==='local-reference-edit-access-v1'&&record.referenceInput.editAccess.projectId===p.id&&record.referenceInput.editAccess.projectRevision===p.revision&&record.referenceInput.artifactId===request.artifactId&&record.referenceInput.copyContentHash===request.copyContentHash;need(['ready','legacy_ready'].includes(record.initializationState)&&!record.pendingContinuation&&(normalInput||correctionInput),'LOCAL_REFERENCE_WITHDRAWAL_CASE_BUSY');
  const m=p.referenceMaterials.find(m=>m.id===request.materialId),artifact=p.artifacts.find(a=>a.id===request.artifactId);
  need(p.revision===request.expectedRevision&&p.activeByStage.copy===request.artifactId&&artifact?.stage==='copy'&&artifact.contentHash===request.copyContentHash&&m?.artifactId===artifact.id&&m.copyContentHash===artifact.contentHash,'LOCAL_REFERENCE_WITHDRAWAL_SOURCE_CHANGED');
  need(equal(materialOrigin(p,m.id),m),'LOCAL_REFERENCE_WITHDRAWAL_MATERIAL_HISTORY_INVALID');need(m.provenance?.kind==='manual_supplied'&&!m.removed,'LOCAL_REFERENCE_WITHDRAWAL_NOT_ACTIVE_MANUAL');need(!referenceInputClosure(p,artifact.id).closed,'LOCAL_REFERENCE_INPUT_SEALED');
  const asset=p.imageAssets.find(a=>a.id===m.image?.imageId);need(asset?.projectId===p.id&&asset.sha256===m.image.sha256,'LOCAL_REFERENCE_WITHDRAWAL_IMAGE_IDENTITY_CHANGED');
  const command={kind:'remove-reference-material',materialId:m.id,reason:request.reason,commandId:request.commandId,expectedRevision:request.expectedRevision},actor={actorType:'human',actorId:'local-acceptance-user',runId:randomUUID(),contextId:randomUUID()};
  try{register({projectId:p.id,command,actor,sourcePins:{artifactId:artifact.id,copyContentHash:artifact.contentHash,materialId:m.id,imageSha256:m.image.sha256}});}catch(error){const recovered=await committed();if(recovered)return {...recovered,reused:true};throw error;}
  const result=await committed();need(result,'LOCAL_REFERENCE_WITHDRAWAL_COMMIT_UNPROVEN');return {...result,reused:false};
 }
 return {withdraw,readReceipt};
}
