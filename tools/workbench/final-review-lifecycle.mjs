import {isFinalCodexProtocol} from './final-review-codex-original.mjs';
import {validateFinalCodexOriginal,FINAL_CODEX_PROTOCOL} from './final-review-codex-original.mjs';
import {isDeepStrictEqual as equal} from 'node:util';
import {createHash} from 'node:crypto';
import {finalCallHash as hash,decodeFinalCallJSON as decode,FINAL_CALL_LIMITS} from './final-review-call.mjs';
import {finalReviewMetadataBasis,finalReviewOriginalMetadataBasis} from './final-review-authority.mjs';
import {phaseResult,phaseItems,SUBJECTIVE_CATEGORIES,HARD_CATEGORIES,assertFreshThread,phaseRequest} from './final-review-phase.mjs';
const need=(v,code)=>{if(!v)throw Object.assign(Error(code),{code});};
const text=v=>typeof v==='string'&&v.trim().length>0;
const sha=v=>createHash('sha256').update(v).digest('hex');
const keys=(v,n)=>v&&typeof v==='object'&&!Array.isArray(v)&&equal(Object.keys(v).sort(),n.split(' ').sort());
const originals=(p,r)=>p.jobs.filter(j=>j.purpose==='final_review_call'&&j.task.reservationId===r.id&&j.finalCallResult).map(j=>j.finalCallResult);
const bound=(p,r)=>({reservationId:r.id,setupId:r.setupId,planId:r.planId,inputId:r.inputId,policyVersion:p.policies.at(-1).version,directorResultId:r.humanPause?.directorResultId});
export function finalReviewEligibility(p,r,call){
 need(!['closed','returned','failed'].includes(r.status),'FINAL_RESERVATION_CLOSED');
 for(const dependency of call.dependencies){
  if(dependency==='human:final_review'){need(r.approval?.human===true,'FINAL_HUMAN_GATE');continue;}
  const prior=r.calls.find(c=>c.id===dependency),job=p.jobs.find(j=>j.task?.reservationId===r.id&&j.task?.id===dependency),result=job?.finalCallResult;
  need(prior?.status==='succeeded'&&result?.id===prior.resultId,'FINAL_DEPENDENCY_BLOCKED');
  const k=phaseResult(result)?.kind,subjectiveOwnerReturn=k==='return'&&r.localGates.length===1&&phaseResult(result).findings.every(f=>SUBJECTIVE_CATEGORIES.includes(f.category));
  if(dependency==='owner:layoutProducer')need((['handoff','layout_handoff'].includes(k)||subjectiveOwnerReturn),'FINAL_DEPENDENCY_BLOCKED');
  else if(dependency==='owner:finalConsumer')need(k==='intake_accept'||subjectiveOwnerReturn,'FINAL_DEPENDENCY_BLOCKED');
  else if(dependency==='owner:finalProducer')need(k==='final_handoff'||r.ownerSubjectiveAcknowledgements?.[dependency]===result.id,'FINAL_DEPENDENCY_BLOCKED');
  else if(dependency==='director')need(r.approval,'FINAL_APPROVAL_REQUIRED');
  else need(['observation','lane_synthesis','paired_challenge'].includes(k),'FINAL_DEPENDENCY_BLOCKED');
 }
 if(['owner:finalProducer','owner:deliveryConsumer'].includes(call.id))need(r.approval,'FINAL_APPROVAL_REQUIRED');
}
export function createPhaseReturns(p,r,result,findings,reason='semantic_return'){
 p.finalReviewReturns??=[];
 for(const [i,f] of findings.entries())for(const targetId of f.targetIds){const target=p.jobs.find(j=>j.finalCallResult?.id===result.id)?.task.originalRequest.returnTargets.find(t=>t.id===targetId);need(target,'FINAL_TARGET_UNBOUND');const body={reservationId:r.id,planId:r.planId,inputId:r.inputId,resultId:result.id,findingPointer:`/result/findings/${i}`,findingId:f.id,target:structuredClone(target),reason};const id=hash(body);if(!p.finalReviewReturns.some(x=>x.id===id))p.finalReviewReturns.push({...body,id,status:'open'});}
}
function hardBasis(p,r){const rows=originals(p,r),director=rows.find(x=>x.binding.callId==='director'),d=phaseResult(director);need(d?.kind==='director_disposition'&&d.coverage.every(x=>x.status==='checked'),'FINAL_HARD_PROOF_REQUIRED');const items=phaseItems(rows);
 for(const original of rows){const v=phaseResult(original);if(v.coverage)need(v.coverage.every(x=>x.status==='checked'),'FINAL_HARD_PROOF_REQUIRED');}
 for(const {ref,item} of items)if(HARD_CATEGORIES.includes(item.category)){const disposition=d.dispositions.find(x=>x.itemRef===ref);need(disposition&&['dismiss','duplicate'].includes(disposition.decision),'FINAL_HARD_PROOF_REQUIRED');}
 return {rows,director,d,items};}
function authority(p,r,decision){const {rows,director,d}=hardBasis(p,r);const body={protocol:'final-review-approval-v2',...bound(p,r),directorResultId:director.id,basis:p.finalReviewSetups.find(s=>s.id===r.setupId).basis,originals:rows.map(x=>({id:x.id,report:x.originals.response,receipt:x.originals.receipt})),dispositions:d.dispositions,decision,authorityOutcome:decision.human&&decision.rulings.some(x=>x.decision==='accept_subjective_risk')?'human_designated_adoption':'reviewed_pass',human:decision.human,validationLevel:'constructed_local_protocol_only'};return {...body,id:hash(body)};}
export function afterPhaseSettlement(p,r,result){
 const v=phaseResult(result);
 if(v.kind==='return'){
  const subjective=v.findings.every(f=>SUBJECTIVE_CATEGORIES.includes(f.category));
  if(subjective&&!r.approval&&r.localGates.length===1&&['owner:layoutProducer','owner:finalConsumer'].includes(result.binding.callId)){r.pendingOwnerDissent??=[];r.pendingOwnerDissent.push(result.id);return;}
  if(!subjective||!r.approval||!r.approval.human){createPhaseReturns(p,r,result,v.findings);r.status='returned';}
  else {need(v.findings.every(f=>r.approval.decision.rulings.some(x=>x.itemRef===f.rulingRef&&x.decision==='accept_subjective_risk')),'FINAL_SUBJECTIVE_RULING_REQUIRED');r.ownerSubjectiveAcknowledgements??={};r.ownerSubjectiveAcknowledgements[result.binding.callId]=result.id;r.retainedOwnerDissent??=[];r.retainedOwnerDissent.push(result.id);}
  return;
 }
 if(v.kind==='director_disposition'){
  const items=phaseItems(originals(p,r)),active=items.filter(x=>{const d=v.dispositions.find(d=>d.itemRef===x.ref);return d&&['uphold','unresolved'].includes(d.decision)&&(x.item.effect!=='advisory'||HARD_CATEGORIES.includes(x.item.category));});
  const returned=active.filter(x=>!r.localGates.length||HARD_CATEGORIES.includes(x.item.category));
  if(['return','needs_evidence'].includes(v.outcome.kind)&&returned.length){p.finalReviewReturns??=[];for(const item of returned){const original=originals(p,r).find(x=>x.id===item.resultId),job=p.jobs.find(j=>j.finalCallResult?.id===original.id);for(const targetId of item.item.targetIds){const target=job.task.originalRequest.returnTargets.find(t=>t.id===targetId);need(target,'FINAL_TARGET_UNBOUND');const body={reservationId:r.id,inputId:r.inputId,planId:r.planId,resultId:item.resultId,findingPointer:item.pointer,findingId:item.item.id,target:structuredClone(target),directorResultId:result.id,reason:'director_return'};const id=hash(body);if(!p.finalReviewReturns.some(x=>x.id===id))p.finalReviewReturns.push({...body,id,status:'open'});}}r.status='returned';return;}
  r.humanPause={...bound(p,r),directorResultId:result.id,status:r.localGates.length?'waiting_for_human':'not_selected'};
  if(r.localGates.length){r.status='waiting_for_human';return;}
  if(v.outcome.kind==='approve'){r.approval=authority(p,r,{human:false,policyAuthorized:true,rulings:[],reason:'Policy permits reviewed passage'});r.status='reviewed';}
  else r.status='returned';
 }
}
export const FINAL_LIFECYCLE_COMMANDS=Object.freeze(['reconcile-final-review-call','close-final-review-reservation','adopt-final-review','return-final-review','accept-final-review-delivery','resolve-final-review-return']);
export function reduceFinalLifecycle(p,c,context,setup,r){
 if(c.kind==='reconcile-final-review-call'){
  need(context.actorType==='agent','FINAL_TRUSTED_RUNTIME_REQUIRED');const call=r.calls.find(x=>x.id===c.callId),job=p.jobs.find(j=>j.task?.reservationId===r.id&&j.task?.id===c.callId),a=job?.attempts[0];need(call&&a?.id===c.attemptId&&['charged','failed'].includes(call.status)&&equal(a.executor,context),'FINAL_CALL_REQUIRED');
  const pin=job.task.originalRequest,codex=isFinalCodexProtocol(pin.adapterProtocol);
  let receipt,events,transport;
  if(codex){need(equal(phaseRequest(p,setup,r,a.id,a.executor,c.originals),pin),'FINAL_REQUEST_CHANGED');need(a.dispatchStarted===true&&job.binding.providerId===pin.binding.assignment.providerIdentity&&job.binding.model===pin.binding.assignment.modelIdentity,'FINAL_CALL_BINDING_CHANGED');transport=validateFinalCodexOriginal({pin,originals:c.originals});need(transport.outcome==='known_failure','FINAL_TERMINAL_INVALID');receipt={threadId:transport.threadId,reason:'codex_cli_terminal_failure',protocol:pin.adapterProtocol};}
  else{receipt=decode(c.originals?.receipt,FINAL_CALL_LIMITS.receipt);events=decode(c.originals?.events,FINAL_CALL_LIMITS.events);
  need(keys(receipt,'protocol binding packetHash threadId terminal exitCode reason')&&receipt.protocol==='local-final-call-failure-v2'&&equal(receipt.binding,pin.binding)&&receipt.packetHash===pin.originals.packet.sha256&&text(receipt.threadId)&&receipt.terminal==='failed'&&Number.isInteger(receipt.exitCode)&&receipt.exitCode!==0&&text(receipt.reason),'FINAL_RECEIPT_INVALID');
  need(equal(events,[{kind:'started',threadId:receipt.threadId,contextIdentity:pin.binding.contextIdentity,attemptId:a.id},{kind:'failed',threadId:receipt.threadId,attemptId:a.id,exitCode:receipt.exitCode,reason:receipt.reason}]),'FINAL_TERMINAL_INVALID');}
  assertFreshThread(p,job,a,receipt.threadId);
  const result=codex?{protocol:pin.adapterProtocol,originals:transport.descriptors,receiptHash:transport.descriptors.receipt.sha256,threadId:receipt.threadId,reason:receipt.reason,requestedModel:transport.requestedModel,reportedModel:transport.reportedModel}:{receiptHash:sha(c.originals.receipt),eventsHash:sha(c.originals.events),threadId:receipt.threadId,reason:receipt.reason};if(job.finalCallFailure){need(equal(job.finalCallFailure,result),'FINAL_RESULT_CONFLICT');return;}
  job.finalCallFailure=result;job.status='failed';a.status='failed';const accountingReceipt={providerId:job.binding.providerId,model:job.binding.model,attemptId:a.id,protocol:receipt.protocol,originalReceiptHash:result.receiptHash,threadId:receipt.threadId,terminalFailure:true};job.receipt=accountingReceipt;a.receipt=structuredClone(accountingReceipt);call.status='failed';r.status='failed';return;
 }
 if(c.kind==='close-final-review-reservation'){
  need(context.actorType==='agent'&&text(c.reason),'FINAL_TRUSTED_RUNTIME_REQUIRED');if(r.status==='closed')return;need(['returned','failed'].includes(r.status),'FINAL_CLOSE_BLOCKED');need(!r.calls.some(x=>x.status==='charged'),'FINAL_UNKNOWN_BLOCKS');for(const call of r.calls)if(call.status==='held')call.status='retired';r.close={reason:c.reason,by:structuredClone(context),previousStatus:r.status};r.status='closed';return;
 }
 if(c.kind==='adopt-final-review'||c.kind==='return-final-review'){
  need(context.actorType==='human','FINAL_HUMAN_REQUIRED');need(r.localGates.length===1&&r.humanPause&&equal(c.binding,bound(p,r)),'FINAL_STALE_HUMAN_RULING');need(text(c.reason)&&text(c.displayedDecision),'FINAL_HUMAN_DECISION_REQUIRED');
  const decision={kind:c.kind,human:true,binding:structuredClone(c.binding),reason:c.reason,displayedDecision:c.displayedDecision,rulings:structuredClone(c.rulings??[]),targetIds:structuredClone(c.targetIds??[]),by:structuredClone(context)};
  if(r.humanDecision){const {by:originalHuman,...originalDecision}=r.humanDecision,{by:replyHuman,...reply}=decision;need(originalHuman.actorType==='human'&&replyHuman.actorType==='human'&&equal(originalDecision,reply),'FINAL_HUMAN_DECISION_CONFLICT');return;}
  need(r.status==='waiting_for_human','FINAL_HUMAN_GATE');
  const all=originals(p,r),director=all.find(x=>x.binding.callId==='director'),targets=p.jobs.find(j=>j.finalCallResult?.id===director.id).task.originalRequest.returnTargets;
  if(c.kind==='return-final-review'){need(Array.isArray(c.targetIds)&&c.targetIds.length>0&&new Set(c.targetIds).size===c.targetIds.length&&c.targetIds.every(id=>targets.some(t=>t.id===id)),'FINAL_TARGET_UNBOUND');p.finalReviewReturns??=[];for(const targetId of c.targetIds){const body={reservationId:r.id,inputId:r.inputId,planId:r.planId,resultId:director.id,findingPointer:'/humanDecision',target:targets.find(t=>t.id===targetId),reason:c.reason};p.finalReviewReturns.push({...body,id:hash(body),status:'open'});}r.humanDecision=decision;r.status='returned';r.humanPause.status='returned';return;}
  const {items,d}=hardBasis(p,r);
  const dissent=items.filter(x=>SUBJECTIVE_CATEGORIES.includes(x.item.category)&&!['dismiss','duplicate'].includes(d.dispositions.find(y=>y.itemRef===x.ref)?.decision));
  need(Array.isArray(c.rulings)&&new Set(c.rulings.map(x=>x.itemRef)).size===c.rulings.length&&c.rulings.length===dissent.length,'FINAL_SUBJECTIVE_RULING_REQUIRED');
  for(const ruling of c.rulings){const item=dissent.find(x=>x.ref===ruling.itemRef)?.item;need(keys(ruling,'itemRef category decision reason targetIds')&&item&&ruling.category===item.category&&equal(ruling.targetIds,item.targetIds)&&['accept_subjective_risk','require_change'].includes(ruling.decision)&&text(ruling.reason),'FINAL_SUBJECTIVE_RULING_REQUIRED');}
  need(d.outcome.kind==='approve'||dissent.length>0,'FINAL_APPROVAL_BLOCKED');
  r.humanDecision=decision;
  if(c.rulings.some(x=>x.decision==='require_change')){r.status='returned';r.humanPause.status='returned';for(const ruling of c.rulings.filter(x=>x.decision==='require_change')){p.finalReviewReturns??=[];for(const targetId of ruling.targetIds){const body={reservationId:r.id,inputId:r.inputId,planId:r.planId,resultId:director.id,findingPointer:ruling.itemRef,target:targets.find(t=>t.id===targetId),reason:ruling.reason};need(body.target,'FINAL_TARGET_UNBOUND');p.finalReviewReturns.push({...body,id:hash(body),status:'open'});}}return;}
  r.approval=authority(p,r,decision);r.humanPause.status='adopted';r.status='reviewed';p.decisions.push({...decision,reservationId:r.id,planId:r.planId,inputId:r.inputId,policyVersion:p.policies.at(-1).version,approvalId:r.approval.id});return;
 }
 if(c.kind==='resolve-final-review-return'){
  need(context.actorType==='agent','FINAL_TRUSTED_RUNTIME_REQUIRED');const record=p.finalReviewReturns?.find(x=>x.id===c.returnId&&x.reservationId===r.id);need(record&&text(c.correctionCommandId)&&text(c.newInputId)&&c.newInputId!==r.inputId,'FINAL_CORRECTION_REQUIRED');const corrected=p.finalReviewReservations.find(x=>x.inputId===c.newInputId&&x.approval),correction=p.taskCards.find(t=>t.finalReturnCorrection?.returnId===record.id&&t.finalReturnCorrection.commandId===c.correctionCommandId);
  need(record.target.address.domain==='task'&&record.target.owner==='proposal-director'&&corrected&&correction,'FINAL_CORRECTION_REQUIRED');
  const nextSetup=p.finalReviewSetups.find(s=>s.id===corrected.setupId);
  need(nextSetup===p.finalReviewSetups.at(-1)&&equal(nextSetup.basis,finalReviewMetadataBasis(p,nextSetup.basis.layoutRootJobId))&&correction.id===p.activeTaskCardId&&nextSetup.basis.taskCardId===correction.id,'FINAL_CORRECTION_REQUIRED');
  const raw=p.processedCommands[c.correctionCommandId];let command;try{command=JSON.parse(raw);}catch{need(false,'FINAL_CORRECTION_REQUIRED');}
  need(command.kind==='revise-task-card'&&command.finalReturnId===record.id&&command.taskCardId===correction.id&&command.brief===correction.brief&&p.audit.some(e=>e.commandId===c.correctionCommandId&&e.kind==='revise-task-card')&&correction.finalReturnCorrection.previousTaskCardId===record.target.address.identity,'FINAL_CORRECTION_REQUIRED');
  const original=p.jobs.find(j=>j.finalCallResult?.id===record.resultId),current=p.jobs.find(j=>j.task?.reservationId===corrected.id&&j.task?.id==='owner:layoutProducer');
  need(original&&current?.finalCallResult&&original.task.originalRequest.returnTargets.some(t=>equal(t,record.target)),'FINAL_CORRECTION_REQUIRED');
  const target=current.task.originalRequest.returnTargets.find(t=>t.address.domain==='task'&&t.address.identity===correction.id);
  need(target&&target.valueHash===hash({identity:correction.id,exactTask:correction})&&target.valueHash!==record.target.valueHash,'FINAL_CORRECTION_REQUIRED');
  const {rows}=hardBasis(p,corrected),expected=authority(p,corrected,corrected.approval.decision);
  need(equal(expected,corrected.approval)&&rows.every(x=>corrected.calls.some(call=>call.resultId===x.id&&call.status==='succeeded'))&&rows.some(x=>x.binding.callId==='director')&&rows.some(x=>x.binding.callId==='owner:finalConsumer'),'FINAL_CORRECTION_REQUIRED');
  const resolution={protocol:'final-return-task-correction-v1',correctionCommandId:c.correctionCommandId,newInputId:c.newInputId,approvalId:corrected.approval.id,targetId:target.id,previousTargetId:record.target.id,resultingTaskCardId:correction.id};if(record.resolution)need(equal(record.resolution,resolution),'FINAL_RESULT_CONFLICT');else {record.resolution=resolution;record.status='resolved';}return;
 }
 need(c.kind==='accept-final-review-delivery'&&context.actorType==='agent','FINAL_INVALID_COMMAND');
 const job=p.jobs.find(j=>j.task?.reservationId===r.id&&j.task?.id==='owner:deliveryConsumer'),v=phaseResult(job?.finalCallResult);need(r.approval&&(v?.kind==='delivery_accept'||r.ownerSubjectiveAcknowledgements?.['owner:deliveryConsumer']===job?.finalCallResult?.id)&&v.approvalId===r.approval.id&&c.resultId===job.finalCallResult.id&&c.approvalId===r.approval.id,'FINAL_DELIVERY_REQUIRED');
 const body={protocol:'final-review-delivery-v2',reservationId:r.id,inputId:r.inputId,approvalId:r.approval.id,consumerResultId:job.finalCallResult.id,editionProofs:v.editionProofs,validationLevel:'constructed_local_protocol_only',executionAvailable:false,finalAuthorityAvailable:false,deliveryAvailable:false};const delivery={...body,id:hash(body)};if(r.delivery)need(equal(r.delivery,delivery),'FINAL_RESULT_CONFLICT');else r.delivery=delivery;r.status='protocol_complete';
}
