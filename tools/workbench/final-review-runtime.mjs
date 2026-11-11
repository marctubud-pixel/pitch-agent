import {mkdir,open,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual as equal} from 'node:util';
import {assertOperationReader} from './final-review-reader.mjs';
import {assertValidatedLaunchSettings} from './launch-config.mjs';
import {finalReviewMetadataBasis,finalReviewCallAccounting,compactFinalReviewPlan} from './final-review-authority.mjs';
import {finalReviewEligibility} from './final-review-lifecycle.mjs';
import {phasePacket,editionProofs} from './final-review-phase.mjs';
import {finalCallHash as hash} from './final-review-call.mjs';
import {createFinalCallSettlement,verifyFinalCallOriginal} from './final-review-call-original.mjs';
import {buildFinalCodexInvocation,FINAL_CODEX_FILES,codexDescriptor,decodeCodexJSON} from './final-review-codex-original.mjs';
import {readManagedLayoutBytes} from './managed-layout-bytes.mjs';

const need=(value,code)=>{if(!value)throw Object.assign(Error(code),{code,status:422});};
const fixedBinary='/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex';
const agent=()=>({actorType:'agent',actorId:'final-business-runtime',runId:randomUUID(),contextId:randomUUID(),now:new Date().toISOString()});
export function selectFinalBusinessAction(p){
 const operation=p.jobs.find(j=>j.purpose==='final_operation_observation'&&j.status==='awaiting_reconciliation');
 if(operation)return {kind:'reconcile_operation',jobId:operation.id};
 const unknown=p.jobs.find(j=>j.purpose==='final_review_call'&&j.status==='awaiting_reconciliation');
 if(unknown)return {kind:'reconcile',jobId:unknown.id};
 if(finalReviewCallAccounting(p).unknown.length)return {kind:'blocked',blockers:[{code:'FINAL_UNKNOWN_BLOCKS'}]};
 const setup=p.finalReviewSetups?.at(-1);
 if(!setup)return {kind:'blocked',blockers:[{code:'FINAL_SETUP_REQUIRED'}]};
 try{need(equal(setup.basis,finalReviewMetadataBasis(p,setup.basis.layoutRootJobId)),'FINAL_STALE_BASIS');}catch(e){return {kind:'blocked',blockers:[{code:e.code}]};}
 const r=p.finalReviewReservations?.filter(r=>r.setupId===setup.id&&r.status!=='released').at(-1);
 if(!r)return {kind:'reserve',setupId:setup.id};
 const ref={setupId:setup.id,reservationId:r.id};
 if(r.delivery)return {kind:'complete',...ref,deliveryId:r.delivery.id};
 if(['returned','failed','closed','waiting_for_human'].includes(r.status))return {kind:r.status,...ref};
 for(const call of r.calls.filter(c=>c.status==='held')){try{finalReviewEligibility(p,r,call);return {kind:'call',...ref,callId:call.id};}catch(error){if(!['FINAL_HUMAN_GATE','FINAL_DEPENDENCY_BLOCKED','FINAL_APPROVAL_REQUIRED'].includes(error.code))throw error;}}
 if(r.approval&&r.calls.every(c=>c.status==='succeeded'))return {kind:'accept_delivery',...ref};
 return {kind:'blocked',blockers:[{code:'FINAL_DEPENDENCY_BLOCKED'}],...ref};
}
async function seal(path,bytes){
 const file=await open(path,'wx',0o400);try{await file.writeFile(bytes);await file.sync();}finally{await file.close();}
 const directory=await open(join(path,'..'),'r');try{await directory.sync();}finally{await directory.close();}
}
export async function readFinalDeliveryBytes(root,descriptor){
 need(descriptor&&Number.isSafeInteger(descriptor.bytes)&&descriptor.bytes>0&&descriptor.bytes<=256*1024**2&&/^[a-f0-9]{64}$/.test(descriptor.sha256),'FINAL_DELIVERY_DESCRIPTOR_REQUIRED');
 const bytes=await readManagedLayoutBytes(root,descriptor.originalPath,descriptor.bytes);
 need(equal(codexDescriptor(bytes),{sha256:descriptor.sha256,bytes:descriptor.bytes}),'FINAL_DELIVERY_BYTES_CHANGED');return bytes;
}
export function createFinalReviewRuntime({store,reader,operations,launchConfiguration}){
 assertOperationReader(reader,{store,launchConfiguration});assertValidatedLaunchSettings(launchConfiguration);
 const root=resolve(launchConfiguration.server.executionRoot),executionRoot=join(root,'final-review-calls'),providerRoot=join(root,'provider');
 const settlement=createFinalCallSettlement({store,executionRoot,providerRoot});
 const current=p=>need(store.read(p.id).revision===p.revision,'REVISION_CONFLICT');
 const send=(p,kind,fields,context=agent())=>store.command(p.id,{kind,...fields,commandId:`final-business-${kind}-${hash(fields)}`,expectedRevision:p.revision},context);
 async function verified(id){
  const checked=await reader.readSnapshot(id),p=store.read(id);
  need(checked.kind==='ready'&&checked.retained.operationEvidence?.kind==='verified'&&checked.observedRevision===p.revision,'FINAL_READER_CLOSURE_REQUIRED');
  need(checked.retained.operationBasis?.identity===p.finalOperationCaptures?.at(-1)?.identity,'FINAL_OPERATION_CAPTURE_CHANGED');
  for(const job of p.jobs.filter(j=>j.purpose==='final_review_call'&&j.status==='succeeded')){await verifyFinalCallOriginal(p,job,{executionRoot,providerRoot});current(p);}
  return {checked,p};
 }
 async function retainReceipt(job,receipt){
  const dir=join(executionRoot,job.attempts[0].id),run=receipt.paths?.runDir?.split('/').at(-1);
  need(/^run-[A-Za-z0-9_-]+$/.test(run),'FINAL_PROVIDER_PATH_INVALID');
  const packetBytes=await readManagedLayoutBytes(executionRoot,join(dir,'packet.json'),32*1024**2),packet=decodeCodexJSON(packetBytes,32*1024**2),files={};
  for(const [name,spec]of Object.entries(FINAL_CODEX_FILES)){try{const bytes=await readManagedLayoutBytes(providerRoot,join(providerRoot,run,spec.suffix),spec.limit);files[name]={relativePath:`${run}/${spec.suffix}`,...codexDescriptor(bytes)};}catch(error){if(name==='output'&&error.code==='ENOENT')files[name]=null;else throw error;}}
  const sidecar=JSON.stringify({protocol:'final-codex-originals-v1',binding:packet.binding,packetSha256:codexDescriptor(packetBytes).sha256,files});
  try{await seal(join(dir,'provider-originals.json'),sidecar);}catch(error){if(error.code!=='EEXIST')throw error;need((await readManagedLayoutBytes(executionRoot,join(dir,'provider-originals.json'),1024**2)).equals(Buffer.from(sidecar)),'FINAL_RESULT_CONFLICT');}
  if(files.output){const output=await readManagedLayoutBytes(providerRoot,join(providerRoot,files.output.relativePath),files.output.bytes);try{await seal(join(dir,'response.json'),output);}catch(error){if(error.code!=='EEXIST')throw error;need((await readManagedLayoutBytes(executionRoot,join(dir,'response.json'),2*1024**2)).equals(output),'FINAL_RESULT_CONFLICT');}}
 }
 async function reconcile(id,jobId){
  let p=store.read(id),job=p.jobs.find(j=>j.id===jobId&&j.purpose==='final_review_call');need(job,'FINAL_CALL_REQUIRED');
  if(job.status!=='awaiting_reconciliation')return {kind:'settled',jobId,status:job.status};
  try{
   const dirs=await readdir(providerRoot,{withFileTypes:true});need(dirs.length<=512,'FINAL_RESTART_SCAN_BOUND');const receipts=[];
   for(const dir of dirs.filter(d=>d.isDirectory()&&/^run-[A-Za-z0-9_-]+$/.test(d.name))){try{const receipt=decodeCodexJSON(await readManagedLayoutBytes(providerRoot,join(providerRoot,dir.name,'receipt.json'),1024**2),1024**2);if(receipt.runId===job.attempts[0].id)receipts.push(receipt);}catch{}}
   need(receipts.length===1,'FINAL_RECEIPT_AMBIGUOUS_OR_MISSING');await retainReceipt(job,receipts[0]);current(p);
   const intent={setupId:job.task.setupId,reservationId:job.task.reservationId,callId:job.task.id,attemptId:job.attempts[0].id,expectedRevision:p.revision};
   try{await settlement.settleCall(id,{...intent,commandId:`final-settle-${intent.attemptId}`},job.attempts[0].executor);}
   catch(error){if(store.read(id).revision!==p.revision)throw error;await settlement.reconcileCall(id,{...intent,commandId:`final-failure-${intent.attemptId}`},job.attempts[0].executor);}
   return {kind:'settled',jobId,status:store.read(id).jobs.find(j=>j.id===jobId).status};
  }catch(error){return {kind:'unknown',jobId,blockers:[{code:error.code??'FINAL_ORIGINAL_INVALID'}]};}
 }
 async function advance(id){
  let action=selectFinalBusinessAction(store.read(id));
  if(action.kind==='reconcile_operation')return operations.reconcile(id,action.jobId);
  if(action.kind==='reconcile')return reconcile(id,action.jobId);
  if(['blocked','waiting_for_human','returned','failed','closed','complete'].includes(action.kind))return action;
  const work=await operations.pendingWork(id);if(work.length){if(work[0].kind==='final-operation-blocked')return {kind:'blocked',blockers:work[0].blockers};return operations.advance(work[0]);}
  const {checked,p}=await verified(id);action=selectFinalBusinessAction(p);
  if(action.kind==='reserve'){send(p,'reserve-final-review-plan',{setupId:action.setupId,plan:compactFinalReviewPlan(checked.plan)});return {kind:'progress'};}
  const r=p.finalReviewReservations.find(r=>r.id===action.reservationId);
  need(r&&r.planId===checked.plan.id&&r.operationCaptureIdentity===checked.retained.operationBasis.identity,'FINAL_PLAN_CHANGED');
  if(action.kind==='accept_delivery'){
   const job=p.jobs.find(j=>j.task?.reservationId===r.id&&j.task?.id==='owner:deliveryConsumer');
   send(p,'accept-final-review-delivery',{setupId:r.setupId,reservationId:r.id,approvalId:r.approval.id,resultId:job.finalCallResult.id});return {kind:'progress'};
  }
  if(action.kind!=='call')return action;
  const call=checked.plan.calls.find(c=>c.id===action.callId),setup=p.finalReviewSetups.find(s=>s.id===r.setupId),attemptId=`final-${randomUUID()}`,executor={...agent(),actorId:call.assignment.actorIdentity,runId:attemptId};
  const predecessorOriginals=[];
  for(const slot of call.originalReportInputs){const job=p.jobs.find(j=>j.task?.reservationId===r.id&&j.task?.id===slot.producerCallId),result=job.finalCallResult,bytes=await readManagedLayoutBytes(executionRoot,join(executionRoot,job.attempts[0].id,'response.json'),slot.maxBytes);need(equal(codexDescriptor(bytes),result.originals.response),'FINAL_PREDECESSOR_REQUIRED');predecessorOriginals.push({slot,resultId:result.id,reportSha256:result.originals.response.sha256,reportBytes:bytes.toString('utf8'),originalReceiptSha256:result.originals.receipt.sha256});}
  const attachments=call.personalPixelInspection?checked.plan.packetsByRole[call.role].find(packet=>packet.id===call.packetId).originals.map(({occurrenceId,sha256,bytes,mediaType,dimensions,originalPath})=>({occurrenceId,sha256,bytes,mediaType,dimensions,originalPath})):[];
  for(const attachment of attachments){const bytes=await readManagedLayoutBytes(root,attachment.originalPath,attachment.bytes);need(equal(codexDescriptor(bytes),{sha256:attachment.sha256,bytes:attachment.bytes}),'FINAL_ATTACHMENT_REQUIRED');}
  const packet=phasePacket(p,setup,r,call,attemptId,executor,checked.snapshot,predecessorOriginals,attachments),packetText=JSON.stringify(packet),built=buildFinalCodexInvocation({packetText});
  const originals={input:JSON.stringify(checked.snapshot),plan:JSON.stringify(checked.plan),packet:packetText,providerRequest:built.inputText,providerSchema:built.schemaText},dir=join(executionRoot,attemptId);
  await mkdir(dir,{recursive:true,mode:0o700});for(const [name,bytes]of Object.entries(originals))await seal(join(dir,({providerRequest:'provider-request',providerSchema:'provider-schema'}[name]??name)+'.json'),bytes);
  current(p);const configured=launchConfiguration.textProviders[call.assignment.providerIdentity];need(configured?.adapter==='codex-cli'&&configured.model===call.assignment.modelIdentity&&(configured.binary===undefined||configured.binary===fixedBinary),'FINAL_PROVIDER_CONFIGURATION_REQUIRED');
  const command={kind:'mark-final-review-dispatched',commandId:`final-mark-${attemptId}`,expectedRevision:p.revision,setupId:setup.id,reservationId:r.id,callId:call.id,attemptId,originals};
  const marked=await operations.markFinalCall(id,command,executor);current(marked);
  const job=marked.jobs.find(j=>j.task?.reservationId===r.id&&j.task?.id===call.id);
  let receipt;try{receipt=await operations.executeFinalCall(id,job.id);}catch(error){receipt=error.receipt;if(!receipt)return {kind:'unknown',blockers:[{code:error.code??'FINAL_DISPATCH_UNKNOWN'}]};}
  await retainReceipt(job,receipt);return reconcile(id,job.id);
 }
 async function delivery(id){
  const {checked,p}=await verified(id),action=selectFinalBusinessAction(p);need(action.kind==='complete','FINAL_DELIVERY_REQUIRED');
  const r=p.finalReviewReservations.find(r=>r.id===action.reservationId);need(r.status==='protocol_complete'&&r.approval&&r.calls.every(c=>c.status==='succeeded')&&equal(r.delivery.editionProofs,editionProofs(checked.snapshot.editions.value)),'FINAL_DELIVERY_REQUIRED');
  const files=checked.snapshot.editions.value.map(e=>({style:e.style,descriptor:e.deliveryDeck}));
  for(const file of files){await readFinalDeliveryBytes(root,file.descriptor);current(p);}
  return {p,r,files};
 }
 return Object.freeze({advance,reconcile,
  async decide(id,request,context){need(context.actorType==='human','FINAL_HUMAN_REQUIRED');need(['adopt-final-review','return-final-review'].includes(request.kind),'FINAL_INVALID_COMMAND');await verified(id);store.command(id,request,context);return selectFinalBusinessAction(store.read(id));},
  async release(id,request){
   need(Object.keys(request).sort().join(',')==='commandId,expectedRevision','INVALID_FINAL_INTENT');
   const {p}=await verified(id),action=selectFinalBusinessAction(p);need(['accept_delivery','complete'].includes(action.kind),'FINAL_DELIVERY_REQUIRED');
   const r=p.finalReviewReservations.find(r=>r.id===action.reservationId),job=p.jobs.find(j=>j.task?.reservationId===r.id&&j.task?.id==='owner:deliveryConsumer');
   store.command(id,{...request,kind:'accept-final-review-delivery',setupId:r.setupId,reservationId:r.id,approvalId:r.approval.id,resultId:job.finalCallResult.id},agent());return this.delivery(id);
  },
  async delivery(id){const {p,r,files}=await delivery(id);return {protocol:'final-delivery-api-v1',projectId:id,revision:p.revision,deliveryId:r.delivery.id,approvalId:r.approval.id,authorityOutcome:r.approval.authorityOutcome,files:files.map(({style,descriptor})=>({style,sha256:descriptor.sha256,bytes:descriptor.bytes,downloadUrl:`/api/v1/projects/${id}/final-deliveries/${r.delivery.id}/${style}.pptx`}))};},
  async download(id,deliveryId,style){const {p,r,files}=await delivery(id);need(r.delivery.id===deliveryId,'FINAL_DELIVERY_CHANGED');const file=files.find(f=>f.style===style);need(file,'FINAL_DELIVERY_FILE_REQUIRED');const bytes=await readFinalDeliveryBytes(root,file.descriptor);current(p);return bytes;},
 });
}
