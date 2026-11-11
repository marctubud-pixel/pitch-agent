import {requestIdentityWire} from './request-identity.mjs';
const need=(value,code)=>{if(!value)throw Object.assign(Error(code),{code});};
const profiles=new Set(['direction','material_color_component','style_component','composition_component','viewpoint_scene_component','carrier_component']);
export function referenceInputIdentity(flow){
 const input=flow?.referenceInput,next=flow?.nextAction;
 const correction=input?.kind==='reference_correction'&&input.correctionOnly===true&&input.editAccess?.protocol==='local-reference-edit-access-v1'&&input.editAccess.projectId===flow?.projectId&&input.editAccess.artifactId===input.artifactId&&input.editAccess.copyContentHash===input.copyContentHash&&input.editAccess.projectRevision===input.projectRevision&&input.editAccess.approvalAuthorized===false&&(next?.status==='blocked'&&next.reason==='LOCAL_POOL_INPUT_CORRECTION_REQUIRED'||next?.status==='pending'&&['import_pool_material','continue_copy_v2'].includes(next.nextOperation));
 if(flow?.referenceRuntimeProfile!=='local-reference-pool-v2'||flow.mode!=='assisted'||!flow.checkpoints?.includes('references')||next?.module!=='references'||!correction&&(next.status!=='awaiting_user'||next.reason!=='SELECTED_REFERENCE_INPUT_CHECKPOINT')||!input||input.expectedBasisHash!==next.evidenceHash)return null;
 return JSON.stringify([flow.id,flow.projectId,input.artifactId,input.copyContentHash,input.expectedBasisHash,input.projectRevision]);
}
export function createReferenceInputController({api,getFlow,refresh,hasPending=()=>false,randomId=()=>globalThis.crypto.randomUUID(),readFile=file=>file.arrayBuffer(),hashBytes=async bytes=>[...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('')}={}){
 need(typeof api==='function'&&typeof getFlow==='function'&&typeof refresh==='function','REFERENCE_FORM_DEPENDENCIES_REQUIRED');let busy=false;const refreshRequired=new Map();
 const context=flow=>JSON.stringify([flow?.id,flow?.projectId,flow?.referenceInput?.artifactId,flow?.referenceInput?.copyContentHash]);
 function observe(flow){const key=context(flow),saved=refreshRequired.get(key),input=flow?.referenceInput;if(!saved)return false;const image=input?.registeredOriginals?.find(x=>x.imageId===saved.imageId&&x.sha256===saved.imageSha256),material=saved.materialId?input?.materials?.find(x=>x.id===saved.materialId&&x.imageId===saved.imageId&&x.imageSha256===saved.imageSha256&&x.copyContentHash===input.copyContentHash):null;if(flow.id===saved.caseId&&flow.projectId===saved.projectId&&input.projectRevision>=saved.observedRevision&&image&&(!saved.materialId||material&&(!saved.removed||material.removed===true)))refreshRequired.delete(key);return refreshRequired.has(key);}
 function committed(flow,receipt){refreshRequired.set(context(flow),{caseId:flow.id,projectId:flow.projectId,observedRevision:receipt.observedRevision,imageId:receipt.identity.imageId,imageSha256:receipt.identity.imageSha256,materialId:receipt.identity.materialId??null,removed:receipt.operation==='reference_withdrawal'});}
 const current=()=>{const flow=getFlow();need(!observe(flow),'REFERENCE_FORM_REFRESH_REQUIRED');need(referenceInputIdentity(flow),'REFERENCE_FORM_NOT_AVAILABLE');need(!hasPending(),'REFERENCE_FORM_PENDING_RECONCILIATION');return flow;};
 async function operate(work){need(!busy,'REFERENCE_FORM_BUSY');busy=true;try{const flow=current(),identity=referenceInputIdentity(flow);return await work(flow,()=>{need(referenceInputIdentity(getFlow())===identity,'REFERENCE_FORM_SOURCE_CHANGED');need(!hasPending(),'REFERENCE_FORM_PENDING_RECONCILIATION');});}finally{busy=false;}}
 async function finish(flow){const fresh=await refresh(flow.id);need(fresh?.id===flow.id&&fresh.projectId===flow.projectId,'REFERENCE_FORM_REFRESH_CHANGED');need(!observe(fresh),'REFERENCE_FORM_REFRESH_REQUIRED');return fresh;}
 function settled(result,flow,requestDigest,operation,imageId,imageSha256){const receipt=result?.commandReceipt;need(!hasPending()&&receipt?.protocol==='local-reference-command-receipt-v1'&&receipt.state==='committed'&&Number.isSafeInteger(receipt.observedRevision)&&receipt.observedRevision>=1&&receipt.caseId===flow.id&&receipt.projectId===flow.projectId&&typeof receipt.commandId==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(receipt.commandId)&&receipt.requestDigest===requestDigest&&receipt.operation===operation&&receipt.identity?.imageId===imageId&&receipt.identity.imageSha256===imageSha256,'REFERENCE_FORM_RECEIPT_REQUIRED');return receipt;}
 return {
  upload:file=>operate(async(flow,check)=>{
   need(file&&Number.isSafeInteger(file.size)&&file.size>0&&file.size<=8*1024*1024&&typeof file.name==='string'&&file.name.length>0&&file.name.length<=2000,'REFERENCE_FORM_FILE_INVALID');
   need(!file.type||['image/png','image/jpeg'].includes(file.type),'REFERENCE_FORM_FILE_INVALID');
   const bytes=new Uint8Array(await readFile(file));need(bytes.byteLength===file.size,'REFERENCE_FORM_FILE_CHANGED');const sha256=await hashBytes(bytes);need(/^[a-f0-9]{64}$/.test(sha256),'REFERENCE_FORM_HASH_REQUIRED');
   let raw='';for(let i=0;i<bytes.length;i++)raw+=String.fromCharCode(bytes[i]);const base64=btoa(raw);check();
   const request={commandId:randomId(),expectedRevision:flow.referenceInput.projectRevision,base64,metadata:{representation:'supplied_image',originalFilename:file.name}},requestDigest=await hashBytes(new TextEncoder().encode(requestIdentityWire(request)));check();const result=await api('/api/cases/'+encodeURIComponent(flow.id)+'/reference-uploads',request);
   need(result?.asset?.projectId===flow.projectId&&typeof result.asset.id==='string'&&result.asset.sha256===sha256&&result.asset.byteLength===bytes.byteLength&&result.factualAuthority===false,'REFERENCE_FORM_UPLOAD_RESPONSE_INVALID');
   const receipt=settled(result,flow,requestDigest,'reference_upload',result.asset.id,sha256);committed(flow,receipt);const fresh=await finish(flow);need(fresh.referenceInput?.registeredOriginals?.some(x=>x.imageId===result.asset.id&&x.sha256===sha256),'REFERENCE_FORM_UPLOAD_NOT_LISTED');return {imageId:result.asset.id,flow:fresh};
  }),
  register:selection=>operate(async(flow,check)=>{
   const input=flow.referenceInput,original=input.registeredOriginals?.find(x=>x.imageId===selection?.imageId);
   need(original&&input.directions?.some(x=>x.id===selection?.directionId)&&profiles.has(selection?.profile)&&typeof selection?.borrowingNote==='string'&&selection.borrowingNote.trim().length>0&&selection.borrowingNote.length<=10000,'REFERENCE_FORM_PURPOSE_REQUIRED');
   check();const request={commandId:randomId(),expectedRevision:input.projectRevision,artifactId:input.artifactId,copyContentHash:input.copyContentHash,imageId:original.imageId,imageSha256:original.sha256,directionId:selection.directionId,kind:selection.profile==='direction'?'direction':'component',applicabilityProfile:selection.profile,borrowingNote:selection.borrowingNote},requestDigest=await hashBytes(new TextEncoder().encode(requestIdentityWire(request)));check();const result=await api('/api/cases/'+encodeURIComponent(flow.id)+'/reference-materials',request);const receipt=settled(result,flow,requestDigest,'reference_material',original.imageId,original.sha256);
   need(result?.material?.id===receipt.commandId&&result.material.artifactId===input.artifactId&&result.material.copyContentHash===input.copyContentHash&&result.material.image?.imageId===original.imageId&&result.material.image?.sha256===original.sha256&&result.material.directionId===selection.directionId&&result.material.borrowingNote===selection.borrowingNote&&result.material.applicabilityProfile===selection.profile&&result.factualAuthority===false,'REFERENCE_FORM_MATERIAL_RESPONSE_INVALID');
   need(receipt.identity.materialId===receipt.commandId&&receipt.identity.artifactId===input.artifactId&&receipt.identity.copyContentHash===input.copyContentHash,'REFERENCE_FORM_RECEIPT_REQUIRED');committed(flow,receipt);return {materialId:result.material.id,flow:await finish(flow)};
  }),
  withdraw:selection=>operate(async(flow,check)=>{
   const input=flow.referenceInput,material=input.materials?.find(m=>m.id===selection?.materialId&&m.provenance?.kind==='manual_supplied'&&!m.removed);
   need(material&&typeof selection.reason==='string'&&selection.reason.trim().length>0&&selection.reason.length<=10000,'REFERENCE_FORM_WITHDRAWAL_REQUIRED');
   const request={commandId:randomId(),expectedRevision:input.projectRevision,artifactId:input.artifactId,copyContentHash:input.copyContentHash,materialId:material.id,reason:selection.reason},requestDigest=await hashBytes(new TextEncoder().encode(requestIdentityWire(request)));check();
   const result=await api('/api/cases/'+encodeURIComponent(flow.id)+'/reference-withdrawals',request),receipt=settled(result,flow,requestDigest,'reference_withdrawal',material.imageId,material.imageSha256);
   need(result.removed===true&&result.materialId===material.id&&receipt.identity.materialId===material.id&&receipt.identity.artifactId===input.artifactId&&receipt.identity.copyContentHash===input.copyContentHash&&receipt.identity.removed===true&&receipt.pixelsVerified===false&&receipt.proofScope==='native_material_withdrawal_history_only','REFERENCE_FORM_WITHDRAWAL_RESPONSE_INVALID');
   committed(flow,receipt);return {materialId:material.id,flow:await finish(flow)};
  }),
  observe,
  get busy(){return busy;}
 };
}
