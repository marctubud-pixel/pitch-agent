import {reduceFinalContinuation} from './final-review-continuation.mjs';
import {finalReviewMetadataBasis} from './final-review-authority.mjs';
import {compactFinalReviewPlan} from './final-review-authority.mjs';
import {isFinalCommandWitness} from './final-review-command-witness.mjs';
import {afterPhaseSettlement,reduceFinalLifecycle} from './final-review-lifecycle.mjs';
import {open,mkdir,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {isDeepStrictEqual as equal} from 'node:util';
import {operationHash} from './final-operation-manifest.mjs';
import {codexDescriptor,decodeCodexJSON} from './final-review-codex-original.mjs';
import {readManagedLayoutBytes} from './managed-layout-bytes.mjs';
import {assertValidatedLaunchSettings} from './launch-config.mjs';
import {assertDurableFinalOperationStore} from './store.mjs';
const fixedBinary='/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex';
async function executableIdentity(){const s=await stat(fixedBinary);need(s.isFile(),'FINAL_OPERATION_EXECUTABLE_REQUIRED');return {path:fixedBinary,size:s.size,mtimeMs:s.mtimeMs,ino:s.ino,version:null};}
const bases=new WeakSet();
const need=(v,code)=>{if(!v)throw Object.assign(Error(code),{code});};
const freeze=x=>{if(x&&typeof x==='object'&&!Object.isFrozen(x)){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
const operations=new Set(['retain-final-operation-capture','bind-final-operation-authorization','mark-final-operation-dispatched','settle-final-operation-observation','reconcile-final-operation-observation','reserve-final-review-plan','mark-final-review-dispatched','settle-final-review-call']);
export const FINAL_OPERATION_LIFECYCLE_TRANSITIONS=Object.freeze({'adopt-final-review':'replay_adoption','return-final-review':'invalidate','reconcile-final-review-call':'invalidate','close-final-review-reservation':'invalidate','accept-final-review-delivery':'replay_delivery','resolve-final-review-return':'invalidate'});
export function operationBusinessCurrent(original,current,capture=null){
 const expected=structuredClone(original);
 const tail=current.audit.slice(original.audit.length);
 need(current.revision===original.revision+tail.length&&tail.every((a,i)=>a.revision===original.revision+i+1),'FINAL_OPERATION_CAPTURE_LINEAGE_INVALID');
 for(const audit of tail){let command;try{command=JSON.parse(current.processedCommands[audit.commandId]);}catch{need(false,'FINAL_OPERATION_CAPTURE_LINEAGE_INVALID');}
  need(command.kind===audit.kind&&command.commandId===audit.commandId&&!Object.hasOwn(command,'expectedRevision'),'FINAL_OPERATION_CAPTURE_LINEAGE_INVALID');
  if(command.kind==='request-final-review-continuation'){
   const intention=current.finalReviewContinuations?.find(i=>i.requests?.some(r=>r.commandId===command.commandId&&r.acceptedRevision===audit.revision));
   need(intention&&equal(intention.basis,finalReviewMetadataBasis(expected,command.layoutRootJobId))&&current.processedCommands[audit.commandId]===JSON.stringify(command),'FINAL_OPERATION_CAPTURE_LINEAGE_INVALID');
   const admission=intention.requests.find(r=>r.commandId===command.commandId);
   const context={actorType:admission.origin??'human',actorId:audit.actorId,now:audit.at};
   expected.revision=audit.revision-1;
   reduceFinalContinuation(expected,{...command,expectedRevision:expected.revision},context,finalReviewMetadataBasis);
  }
  if(command.kind==='adopt-final-review'){
   const r=expected.finalReviewReservations?.find(r=>r.id===command.reservationId&&r.setupId===command.setupId),saved=current.finalReviewReservations?.find(r=>r.id===command.reservationId),context=saved?.humanDecision?.by,setup=expected.finalReviewSetups?.find(s=>s.id===command.setupId);
   need(capture&&r&&setup&&r.operationCaptureIdentity===capture.identity&&r.planId===compactFinalReviewPlan(capture.planning.plan).planId&&r.inputId===capture.planning.plan.inputId&&context?.actorType==='human'&&['actorId','runId','contextId'].every(k=>typeof context[k]==='string'&&context[k].trim())&&(r.humanDecision?equal(r.humanDecision,saved.humanDecision):audit.actorId===context.actorId&&audit.at===(context.now??null))&&current.processedCommands[audit.commandId]===JSON.stringify(command),'FINAL_OPERATION_CAPTURE_LINEAGE_INVALID');
   const before=r.humanDecision?structuredClone(expected):null;
   reduceFinalLifecycle(expected,command,context,setup,r);
   need(before?equal(expected,before):r.status==='reviewed'&&r.humanPause?.status==='adopted'&&r.approval?.human===true,'FINAL_OPERATION_CAPTURE_STALE');
  }
  if(command.kind==='accept-final-review-delivery'){
   const r=expected.finalReviewReservations?.find(r=>r.id===command.reservationId&&r.setupId===command.setupId),setup=expected.finalReviewSetups?.find(s=>s.id===command.setupId);
   need(capture&&r&&setup&&r.operationCaptureIdentity===capture.identity&&r.planId===capture.planning.plan.id&&r.calls.every(c=>c.status==='succeeded')&&current.processedCommands[audit.commandId]===JSON.stringify(command),'FINAL_OPERATION_CAPTURE_LINEAGE_INVALID');
   reduceFinalLifecycle(expected,command,{actorType:'agent',actorId:audit.actorId},setup,r);
  }
  if(command.kind==='retain-final-operation-capture')need(current.finalOperationCaptures?.some(r=>equal(r,command.capture)),'FINAL_OPERATION_CAPTURE_LINEAGE_INVALID');
  if(command.kind==='bind-final-operation-authorization'){const a=current.finalOperationAuthorizations?.find(a=>a.id===command.authorizationIdentity);need(a&&a.protocol==='final-operation-authorization-v1'&&a.projectId===current.id&&a.taskCardId===current.activeTaskCardId&&a.id===`final-operation-authority-${operationHash(Object.fromEntries(Object.entries(a).filter(([k])=>!['id','createdBy'].includes(k))))}`&&a.captureIdentity===current.finalOperationCaptures?.at(-1)?.identity&&a.policyHash===operationHash(current.policies.at(-1))&&(!original.finalReviewSetups?.length||equal(a.allowance,original.finalReviewSetups.at(-1).allowance))&&a.observationManifestIdentity===operationHash({protocol:'final-operation-manifest-v2',captureIdentity:a.captureIdentity,dutyRoot:a.dutyRoot,totalDuties:a.totalDuties,sequence:a.batchSequence,total:a.batchTotal,requirements:a.requirements})&&Array.isArray(a.requirements)&&a.requirements.length>0&&a.requirements.length<=128&&a.requirements.every(r=>r.identity===operationHash({operationEnvelopeIdentity:r.operationEnvelopeIdentity,providerId:r.providerId,model:r.model})),'FINAL_OPERATION_CAPTURE_LINEAGE_INVALID');}
  if(command.kind==='mark-final-operation-dispatched')need(current.jobs.some(j=>j.id===command.jobId&&j.task.authorizationId===command.authorizationId&&j.task.requirementIdentity===command.requirementIdentity&&equal(j.task.requestBasis,command.requestBasis)&&j.attempts[0].id===command.attemptId),'FINAL_OPERATION_CAPTURE_LINEAGE_INVALID');
  if(command.kind==='reserve-final-review-plan'){
   need(capture&&equal(command.plan,compactFinalReviewPlan(capture.planning.plan)),'FINAL_OPERATION_CAPTURE_LINEAGE_INVALID');
   const id=`final-reservation-${operationHash({setupId:command.setupId,planId:command.plan.planId,commandId:command.commandId})}`,saved=current.finalReviewReservations.find(r=>r.id===id);
   need(saved&&saved.operationCaptureIdentity===capture.identity&&saved.basedOnRevision===capture.originalRevision&&saved.setupId===original.finalReviewSetups.at(-1)?.id,'FINAL_OPERATION_CAPTURE_LINEAGE_INVALID');
   expected.finalReviewReservations??=[];expected.finalReviewReservations.push({id,setupId:command.setupId,...structuredClone(command.plan),calls:command.plan.calls.map(c=>({...structuredClone(c),status:'held'})),status:'held',basedOnRevision:capture.originalRevision,operationCaptureIdentity:capture.identity,createdBy:structuredClone(saved.createdBy),executionAvailable:false,finalAuthorityAvailable:false,deliveryAvailable:false});
  }
  if(['mark-final-review-dispatched','settle-final-review-call'].includes(command.kind)){
   need(capture&&isFinalCommandWitness(command),'FINAL_OPERATION_CAPTURE_LINEAGE_INVALID');const rel=command.relationship,r=expected.finalReviewReservations.find(r=>r.id===rel.reservationId),saved=current.jobs.find(j=>j.purpose==='final_review_call'&&j.task.reservationId===rel.reservationId&&j.task.id===rel.callId),call=r?.calls.find(c=>c.id===rel.callId),pin=saved?.task.originalRequest;
   need(r&&saved&&call&&r.operationCaptureIdentity===capture.identity&&rel.projectId===current.id&&rel.setupId===r.setupId&&rel.planId===r.planId&&rel.inputId===r.inputId&&pin.binding.attemptId===rel.attemptId&&pin.binding.callId===call.id&&pin.binding.contextIdentity===call.contextIdentity&&equal(pin.binding.assignment,call.assignment),'FINAL_OPERATION_CAPTURE_LINEAGE_INVALID');
   for(const d of command.managedOriginals.filter(d=>Object.hasOwn(pin.originals,d.name)))need(equal(pin.originals[d.name],{sha256:d.sha256,bytes:d.bytes}),'FINAL_OPERATION_CAPTURE_LINEAGE_INVALID');
   if(command.kind==='mark-final-review-dispatched'){
    need(call.status==='held'&&saved.attempts.length===1,'FINAL_OPERATION_CAPTURE_LINEAGE_INVALID');call.status='charged';call.attemptId=rel.attemptId;r.status='partially_charged';const job={id:`final-call-${operationHash({reservationId:r.id,callId:call.id})}`,stage:'final_review',purpose:'final_review_call',status:'awaiting_reconciliation',binding:{providerId:call.assignment.providerIdentity,model:call.assignment.modelIdentity,role:call.role??call.phase},task:{originalRequest:structuredClone(pin),id:call.id,setupId:r.setupId,reservationId:r.id,planId:r.planId,inputId:r.inputId,contextIdentity:call.contextIdentity},inputVersionIds:[original.finalReviewSetups.at(-1).basis.contentArtifactId],outputVersionIds:[],attempts:[{id:rel.attemptId,status:'awaiting_reconciliation',dispatchStarted:true,executor:structuredClone(pin.binding.executor)}]};need(!expected.jobs.some(j=>j.id===job.id),'FINAL_OPERATION_CAPTURE_LINEAGE_INVALID');expected.jobs.push(job);
   }else{
    const job=expected.jobs.find(j=>j.id===saved.id),result=saved.finalCallResult;need(job&&call.status==='charged'&&result&&result.protocol==='final-call-settlement-v2','FINAL_OPERATION_CAPTURE_LINEAGE_INVALID');const {id,receipt,...body}=result;need(operationHash(body)===id&&equal(result.binding,pin.binding)&&result.report.packetHash===pin.originals.packet.sha256,'FINAL_OPERATION_CAPTURE_LINEAGE_INVALID');for(const d of command.managedOriginals.filter(d=>Object.hasOwn(result.originals,d.name)))need(equal(result.originals[d.name],{sha256:d.sha256,bytes:d.bytes}),'FINAL_OPERATION_CAPTURE_LINEAGE_INVALID');Object.assign(job,{status:'succeeded',finalCallResult:structuredClone(result),receipt:structuredClone(receipt)});Object.assign(job.attempts[0],{status:'succeeded',receipt:structuredClone(receipt)});Object.assign(call,{status:'succeeded',semanticOutcome:result.semanticOutcome,resultId:id});afterPhaseSettlement(expected,r,result);
   }
  }
  if(['settle-final-operation-observation','reconcile-final-operation-observation'].includes(command.kind))need(current.jobs.some(j=>j.id===command.jobId&&j.task.authorizationId===command.authorizationId&&j.attempts[0].id===command.attemptId&&j.observationResult?.authorizationId===command.authorizationId),'FINAL_OPERATION_CAPTURE_LINEAGE_INVALID');
 }
 need(equal(current.audit.slice(0,original.audit.length),original.audit)&&tail.every(a=>(operations.has(a.kind)||a.kind==='request-final-review-continuation'||['replay_adoption','replay_delivery'].includes(FINAL_OPERATION_LIFECYCLE_TRANSITIONS[a.kind]))&&Object.hasOwn(current.processedCommands,a.commandId)),'FINAL_OPERATION_CAPTURE_STALE');
 for(const [id,value]of Object.entries(original.processedCommands))need(equal(current.processedCommands[id],value),'FINAL_OPERATION_CAPTURE_STALE');
 need(Object.keys(current.processedCommands).filter(id=>!Object.hasOwn(original.processedCommands,id)).every(id=>tail.some(a=>a.commandId===id)),'FINAL_OPERATION_CAPTURE_STALE');
 const strip=p=>{const x=structuredClone(p);delete x.revision;delete x.audit;delete x.processedCommands;x.jobs=x.jobs.filter(j=>j.purpose!=='final_operation_observation');delete x.finalOperationAuthorizations;delete x.finalOperationCaptures;return x;};
 need(equal(strip(expected),strip(current)),'FINAL_OPERATION_CAPTURE_STALE');
 const oldJobs=original.jobs.filter(j=>j.purpose==='final_operation_observation'),jobs=current.jobs.filter(j=>j.purpose==='final_operation_observation');
 for(const old of oldJobs){const now=jobs.find(j=>j.id===old.id);need(now&&equal({...old,status:null,receipt:null,observationResult:null,attempts:old.attempts.map(a=>({...a,status:null,receipt:null}))},{...now,status:null,receipt:null,observationResult:null,attempts:now.attempts.map(a=>({...a,status:null,receipt:null}))}),'FINAL_OPERATION_CAPTURE_STALE');if(old.status!=='awaiting_reconciliation')need(equal(old,now),'FINAL_OPERATION_CAPTURE_STALE');}
 need(equal((current.finalOperationAuthorizations??[]).slice(0,(original.finalOperationAuthorizations??[]).length),original.finalOperationAuthorizations??[]),'FINAL_OPERATION_CAPTURE_STALE');
 need(equal((current.finalOperationCaptures??[]).slice(0,(original.finalOperationCaptures??[]).length),original.finalOperationCaptures??[]),'FINAL_OPERATION_CAPTURE_STALE');
 for(const job of jobs){const authority=current.finalOperationAuthorizations?.find(a=>a.id===job.task.authorizationId),requirement=authority?.requirements.find(r=>r.identity===job.task.requirementIdentity);need(authority&&requirement&&job.attempts.length===1&&job.attempts[0].dispatchStarted===true&&job.binding.providerId===requirement.providerId&&job.binding.model===requirement.model,'FINAL_OPERATION_CAPTURE_LINEAGE_INVALID');}
 return true;
}
export function assertOperationBasis(basis){need(bases.has(basis),'FINAL_OPERATION_BASIS_REQUIRED');return basis;}
export function createOperationCaptureStore({store,launchConfiguration}){
 assertValidatedLaunchSettings(launchConfiguration);assertDurableFinalOperationStore(store,undefined,launchConfiguration.server.dbPath);
 const root=join(launchConfiguration.server.executionRoot,'final-operation-captures');
 const configurationIdentity=operationHash(launchConfiguration);
 async function read(project,sourceIdentity){
  const record=project.finalOperationCaptures?.at(-1);if(!record)return null;
  const original=store.read(project.id,record.originalRevision);
  try{need(record.configurationIdentity===configurationIdentity&&record.sourceIdentity===sourceIdentity,'FINAL_OPERATION_CAPTURE_STALE');}catch(error){if(error.code==='FINAL_OPERATION_CAPTURE_STALE')return null;throw error;}
  need(record.relativePath===`${record.identity}.json`&&record.originals.bytes>0&&record.originals.bytes<=32*1024**2,'FINAL_OPERATION_CAPTURE_INVALID');
  const bytes=await readManagedLayoutBytes(root,join(root,record.relativePath),record.originals.bytes);need(equal(codexDescriptor(bytes),record.originals),'FINAL_OPERATION_CAPTURE_INVALID');
  const body=decodeCodexJSON(bytes,32*1024**2);need(operationHash(body)===record.identity&&body.originalRevision===record.originalRevision&&body.projectId===project.id&&body.sourceIdentity===sourceIdentity&&body.configurationIdentity===configurationIdentity,'FINAL_OPERATION_CAPTURE_INVALID');
  try{operationBusinessCurrent(original,project,{...body,identity:record.identity});}catch(error){if(error.code==='FINAL_OPERATION_CAPTURE_STALE')return null;throw error;}
  if(!equal(body.executable,await executableIdentity()))return null;
  const basis=freeze({...body,identity:record.identity,record});bases.add(basis);return basis;
 }
 async function retain(project,snapshot,planning,sourceIdentity){
  need(planning?.kind==='planned'&&planning.plan?.calls.length>0&&snapshot.project.observedRevision===project.revision,'FINAL_OPERATION_ACTUAL_PLAN_REQUIRED');
  const body={protocol:'final-operation-capture-v1',projectId:project.id,originalRevision:project.revision,configurationIdentity,sourceIdentity,executable:await executableIdentity(),snapshot:structuredClone(snapshot),planning:structuredClone(planning)};
  const identity=operationHash(body),bytes=Buffer.from(JSON.stringify(body));need(bytes.length<=32*1024**2,'FINAL_OPERATION_CAPTURE_LIMIT');
  await mkdir(root,{recursive:true,mode:0o700});const path=join(root,`${identity}.json`);let h;
  try{h=await open(path,'wx',0o400);await h.writeFile(bytes);await h.sync();}catch(error){if(error.code!=='EEXIST')throw error;need((await readManagedLayoutBytes(root,path,bytes.length)).equals(bytes),'FINAL_OPERATION_CAPTURE_INVALID');}finally{if(h)await h.close();}
  for(const directory of [root,join(root,'..')]){const handle=await open(directory,'r');try{await handle.sync();}finally{await handle.close();}}
  const record={identity,inputId:planning.plan.inputId,originalRevision:project.revision,configurationIdentity,sourceIdentity,relativePath:`${identity}.json`,originals:codexDescriptor(bytes)};
  const basis=freeze({...body,identity,record});bases.add(basis);return basis;
 }
 return Object.freeze({read,retain});
}
