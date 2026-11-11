import {validOrdinaryHttpLocator} from './ordinary-model-claims.mjs';
import {isDeepStrictEqual as equal} from 'node:util';
import {digest,requireIntake} from './intake-document-store.mjs';
import {cardHash,cardFields,validateTaskCardDraft,validateCardConfirmation,refreshTaskQuestions,exact} from './intake-contract.mjs';

export const INTAKE_PURPOSES=['intake_document','intake_taskcard'];
export const INTAKE_COMMANDS=['intake-register','intake-request','intake-start','intake-dispatch','intake-save-result','intake-document-original','intake-complete','intake-fail','intake-retry-local','intake-adopt','intake-decide','intake-confirm'];
const need=requireIntake;
const human=c=>need(c.actorType==='human','HUMAN_REQUIRED','Human task decision required');
const agent=c=>need(c.actorType==='agent','EXECUTOR_REQUIRED','Trusted intake runtime required');
export function intakeCurrent(p,job){
 if(job.purpose!=='intake_taskcard')return;
 need(job.task.input.baseTaskCardId===p.activeTaskCardId&&job.task.input.baseTaskCardHash===cardHash(p.taskCards.find(c=>c.id===p.activeTaskCardId)),'STALE_TASK_CARD','Extraction was requested for an earlier task card');
 for(const material of job.task.input.materials.filter(m=>m.kind!=='human')){
  const d=(p.intakeDocuments??[]).find(d=>d.id===material.id);need(d&&digest(d)===material.documentHash,'STALE_INPUT_DOCUMENT','Input document identity changed');
 }
}
function attemptFor(p,c,context,{recover=false}={}){
 const job=p.jobs.find(j=>j.id===c.jobId),attempt=job?.attempts.at(-1);
 need(INTAKE_PURPOSES.includes(job?.purpose)&&attempt?.id===c.attemptId&&job.status===(recover?'awaiting_reconciliation':'running'),'INVALID_JOB','Exact current intake attempt required');
 need(recover||['actorId','runId','contextId'].every(k=>attempt.executor[k]===context[k]),'WRONG_EXECUTOR','Only claiming executor can complete the attempt');return {job,attempt};
}
function operation(p,c,response){p.intakeOperations.push({commandId:c.commandId,kind:c.kind,request:structuredClone(c.request),response});}
export function reduceIntake(p,c,context){
 p.intakeDocuments??=[];p.intakeDrafts??=[];p.intakeOperations??=[];p.taskCardDecisions??=[];
 switch(c.kind){
 case 'intake-register':{
  agent(context);need(c.document?.projectId===p.id&&!p.intakeDocuments.some(d=>d.id===c.document.id),'INVALID_DOCUMENT','Unique project-owned document required');
  p.intakeDocuments.push(structuredClone(c.document));
  if(c.imageAsset){need(c.document.imageId===c.imageAsset.id&&c.imageAsset.projectId===p.id,'INVALID_DOCUMENT','Project image required');if(!p.imageAssets.some(i=>i.id===c.imageAsset.id))p.imageAssets.push(structuredClone(c.imageAsset));}
  if(c.job){need(c.job.purpose==='intake_document'&&c.job.documentId===c.document.id&&c.job.status==='queued'&&!c.job.attempts.length,'INVALID_JOB','Fresh local document job required');p.jobs.push(structuredClone(c.job));}
  operation(p,c,{documentId:c.document.id,jobId:c.job?.id??null});break;
 }
 case 'intake-request':{
  agent(context);need(c.job.purpose==='intake_taskcard'&&c.job.status==='queued'&&!c.job.attempts.length,'INVALID_JOB','Fresh extraction job required');intakeCurrent(p,c.job);
  need(!p.jobs.some(j=>j.purpose==='intake_taskcard'&&j.task.input.baseTaskCardId===c.job.task.input.baseTaskCardId&&['queued','running','awaiting_reconciliation'].includes(j.status)),'INTAKE_PENDING','Resolve the pending or unknown extraction before another model call');
  p.jobs.push(structuredClone(c.job));operation(p,c,{jobId:c.job.id});break;
 }
 case 'intake-start':{
  agent(context);const job=p.jobs.find(j=>j.id===c.jobId);need(INTAKE_PURPOSES.includes(job?.purpose)&&job.status==='queued','INVALID_JOB','Queued intake job required');intakeCurrent(p,job);
  job.attempts.push({id:c.attemptId,executor:structuredClone(context),status:'running',dispatchStarted:false,startedAt:context.now??null});job.status='running';job.attemptId=c.attemptId;break;
 }
 case 'intake-dispatch':{agent(context);const {job,attempt}=attemptFor(p,c,context);need(job.purpose==='intake_taskcard'&&!attempt.dispatchStarted,'INVALID_JOB','One dispatch per attempt');intakeCurrent(p,job);attempt.dispatchStarted=true;attempt.requestEvidence=structuredClone(c.requestEvidence);break;}
 case 'intake-save-result':{agent(context);const {attempt}=attemptFor(p,c,context,{recover:c.recover===true});need((!c.recover||validOrdinaryHttpLocator(attempt.httpAttemptLocator,attempt.id))&&attempt.dispatchStarted&&!attempt.resultEvidence,'INVALID_JOB','Save a single result for dispatched attempt');attempt.resultEvidence=structuredClone(c.resultEvidence);break;}
 case 'intake-document-original':{
  agent(context);const {job,attempt}=attemptFor(p,c,context);need(job.purpose==='intake_document','INVALID_JOB','Local document job required');const d=p.intakeDocuments.find(d=>d.id===job.documentId);
  need(!d.raw&&d.origin.kind==='url_request'&&c.document?.id===d.id&&c.document.projectId===p.id&&c.document.origin.kind==='url_capture'&&c.document.origin.requestedUrl===d.origin.requestedUrl&&c.capture?.id===c.document.captureId,'INVALID_DOCUMENT','Exact requested capture required');
  Object.assign(d,structuredClone(c.document));if(!p.sourceCaptures.some(x=>x.id===c.capture.id))p.sourceCaptures.push(structuredClone(c.capture));if(c.imageAsset&&!p.imageAssets.some(i=>i.id===c.imageAsset.id))p.imageAssets.push(structuredClone(c.imageAsset));attempt.originalDocument=structuredClone(d);break;
 }
 case 'intake-complete':{
  agent(context);const {job,attempt}=attemptFor(p,c,context,{recover:c.recover===true});
  if(job.purpose==='intake_document'){
   const d=p.intakeDocuments.find(d=>d.id===job.documentId);need(c.document?.id===d.id&&c.document.projectId===p.id&&(equal(c.document.origin,d.origin)||d.origin.kind==='url_request'&&c.document.origin.kind==='url_capture'&&c.document.origin.requestedUrl===d.origin.requestedUrl),'INVALID_DOCUMENT','Document identity changed');
   Object.assign(d,structuredClone(c.document));attempt.documentSnapshot=structuredClone(d);if(c.capture&&!p.sourceCaptures.some(s=>s.id===c.capture.id))p.sourceCaptures.push(structuredClone(c.capture));
   if(c.imageAsset&&!p.imageAssets.some(i=>i.id===c.imageAsset.id))p.imageAssets.push(structuredClone(c.imageAsset));job.outputVersionIds=[d.id];
  }else{
   intakeCurrent(p,job);need(attempt.dispatchStarted&&attempt.resultEvidence&&equal(c.resultEvidence,attempt.resultEvidence),'INVALID_EXECUTION_RECEIPT','Saved original invocation evidence required');
   const output=validateTaskCardDraft(c.output,job.task.input),draft={id:`draft-${job.id}`,jobId:job.id,attemptId:attempt.id,input:structuredClone(job.task.input),output,resultEvidence:structuredClone(attempt.resultEvidence),createdAt:context.now??null};
   need(!p.intakeDrafts.some(d=>d.id===draft.id),'INVALID_JOB','Draft already exists');p.intakeDrafts.push(draft);job.outputVersionIds=[draft.id];
  }
  attempt.status='succeeded';attempt.finishedAt=context.now??null;job.status='succeeded';delete job.error;if(c.recover)operation(p,{...c,kind:'intake-reconcile'},{jobId:job.id});break;
 }
 case 'intake-fail':{
  agent(context);const {job,attempt}=attemptFor(p,c,context);const status=job.purpose==='intake_taskcard'&&attempt.dispatchStarted?'awaiting_reconciliation':c.blocked?'blocked':'failed';
  attempt.status=status;attempt.error=structuredClone(c.error);attempt.finishedAt=context.now??null;job.status=status;job.error=structuredClone(c.error);if(job.purpose==='intake_document')p.intakeDocuments.find(d=>d.id===job.documentId).status='failed';break;
 }
 case 'intake-retry-local':{
  human(context);const job=p.jobs.find(j=>j.id===c.request.jobId);need(job?.purpose==='intake_document'&&['failed','blocked','awaiting_reconciliation'].includes(job.status),'UNSAFE_RETRY','Only local document work can be explicitly retried');job.status='queued';p.intakeDocuments.find(d=>d.id===job.documentId).status='queued';delete job.error;operation(p,c,{jobId:job.id});break;
 }
 case 'intake-adopt':{
  human(context);const r=c.request,d=p.intakeDrafts.find(d=>d.id===r.draftId);need(d&&digest(d)===r.draftHash,'STALE_TASK_CARD','Exact draft hash required');need(p.activeTaskCardId===r.baseTaskCardId,'STALE_TASK_CARD','Active card changed');intakeCurrent(p,p.jobs.find(j=>j.id===d.jobId));
  const card={id:`task-${digest([p.id,c.commandId])}`,protocol:'task-card-v1',brief:d.output.brief,createdBy:context.actorId,previousTaskCardId:p.activeTaskCardId,fields:structuredClone(d.output.fields),productParameters:structuredClone(d.output.productParameters),openQuestions:structuredClone(d.output.openQuestions),limitations:[...d.output.limitations,'Human adoption is project scope authority, not source or market verification.'],inputDocumentRefs:d.input.materials.filter(m=>m.kind!=='human').map(m=>({id:m.id,documentHash:m.documentHash,rawHash:m.raw.sha256,extractionHash:m.extractionHash??null})),extractionAttemptId:d.attemptId,extractionJobId:d.jobId,draftId:d.id,humanStatements:[],decisions:[]};
  p.taskCards.push(card);p.activeTaskCardId=card.id;operation(p,c,{taskCardId:card.id,taskCardHash:cardHash(card)});break;
 }
 case 'intake-decide':{
  human(context);const r=c.request,base=p.taskCards.find(c=>c.id===r.taskCardId);need(base?.protocol==='task-card-v1'&&base.id===p.activeTaskCardId&&cardHash(base)===r.taskCardHash,'STALE_TASK_CARD','Exact active structured card required');
  need(Array.isArray(r.decisions)&&r.decisions.length>0&&r.decisions.length<=100,'INVALID_FIELD_DECISION','Bounded decisions required');
  const card=structuredClone(base);card.id=`task-${digest([p.id,c.commandId])}`;card.previousTaskCardId=base.id;card.createdBy=context.actorId;const used=new Set();
  for(const [i,d]of r.decisions.entries()){
   exact(d,['fieldPointer','action','value','reason']);need(typeof d.reason==='string'&&d.reason.trim()&&d.reason.length<=20000&&!used.has(d.fieldPointer),'INVALID_FIELD_DECISION','Unique decision with reason required');used.add(d.fieldPointer);
   const entry=cardFields(card).find(e=>e.pointer===d.fieldPointer);need(entry,'INVALID_FIELD_DECISION','Unknown field pointer');const f=entry.field;
   if(d.action==='retain_stated')need(['stated','human_stated'].includes(f.knowledge)&&d.value===f.value,'INVALID_FIELD_DECISION','Retain the exact stated value');
   else if(d.action==='retain_unknown'){need(d.value===null&&f.knowledge==='not_stated','INVALID_FIELD_DECISION','Retain only an unknown field');f.limitations=[...f.limitations,d.reason];}
   else if(d.action==='reject_suggestion'){need(d.value===null&&f.knowledge==='suggested','INVALID_FIELD_DECISION','Only a suggestion can be rejected');f.value=null;f.knowledge='not_stated';f.sources=[];f.limitations=[...f.limitations,d.reason];}
   else if(d.action==='adopt_assumption'){need(typeof d.value==='string'&&(f.knowledge==='suggested'&&d.value===f.value||f.suggestions.some(s=>s.value===d.value)),'INVALID_FIELD_DECISION','Adopt a retained suggestion explicitly');f.value=d.value;f.knowledge='suggested';f.limitations=[...f.limitations,'Human adopted assumption. Not a verified source statement.',d.reason];}
   else if(d.action==='edit'){
    need(typeof d.value==='string'&&d.value.trim()&&d.value.length<=20000,'INVALID_FIELD_DECISION','Human statement must be bounded text');
    const statement={id:`human-${digest([p.id,c.commandId,i])}`,text:d.value,textHash:digest(d.value),actorId:context.actorId,commandId:c.commandId};card.humanStatements.push(statement);f.value=d.value;f.knowledge='human_stated';f.sources=[{kind:'human_text',documentId:statement.id,textHash:statement.textHash,startUtf16:0,endUtf16:d.value.length,quote:d.value}];f.limitations=[...f.limitations,'Human supplied project requirement. Not market verification.'];
   }else need(false,'INVALID_FIELD_DECISION','Unsupported field action');
   card.decisions=card.decisions.filter(x=>x.fieldPointer!==d.fieldPointer);card.decisions.push({...structuredClone(d),id:`decision-${digest([p.id,c.commandId,i])}`,sourceTaskCardId:base.id,sourceTaskCardHash:cardHash(base),actorId:context.actorId,commandId:c.commandId});
  }
  refreshTaskQuestions(card);p.taskCards.push(card);p.activeTaskCardId=card.id;p.taskCardDecisions.push(...card.decisions.filter(d=>d.commandId===c.commandId));operation(p,c,{taskCardId:card.id,taskCardHash:cardHash(card),decisionSetHash:digest(card.decisions)});break;
 }
 case 'intake-confirm':{
  human(context);const r=c.request,card=p.taskCards.find(c=>c.id===r.taskCardId);need(card&&card.id===p.activeTaskCardId&&cardHash(card)===r.taskCardHash&&digest(card.decisions)===r.decisionSetHash,'STALE_TASK_CARD','Exact active task card and decision hashes required');validateCardConfirmation(card,card.decisions);
  const confirmation={id:`confirmation-${digest([p.id,c.commandId])}`,protocol:'task-confirmation-v1',taskCardId:card.id,taskCardHash:cardHash(card),decisionSetHash:r.decisionSetHash,actorId:context.actorId,commandId:c.commandId,createdAt:context.now??null};p.confirmations.push(confirmation);operation(p,c,{confirmationId:confirmation.id,taskCardId:card.id});break;
 }
 }
}
