import {normalizeLocalFixtureIdentity,requireMatchingLocalFixtureIdentity} from './local-fixture-identity.mjs';
import {existsSync} from 'node:fs';
import {AsyncLocalStorage} from 'node:async_hooks';
import {openReferenceAdmission} from './local-reference-admission.mjs';
import {createLocalReferenceRemoval,assertReferenceWithdrawalAdmission} from './local-reference-removal.mjs';
import {referenceCorrectionEligible} from './reference-edit-access.mjs';
import {referenceRuntimeProfileOf,requireMatchingCaseProfile} from './local-reference-runtime-profile.mjs';
import {referenceInputClosure} from './reference-input-seal.mjs';
import {referenceInputView,referenceReviewView,referenceCorrectionView} from './local-reference-view.mjs';
import {createLocalReferenceCommandReader} from './local-reference-command-reader.mjs';
import {advanceContributionProtocol,contributionFeedbackOriginal,contributionSpace} from './local-contribution-review.mjs';
import {contributionRevisionQueueProof} from './local-contribution-queue.mjs';
import {buildLocalContributionPlan} from './local-contribution-plan.mjs';
import {copyDirectionOptions} from './copy-direction-target.mjs';
import {openDecisionRejections,decisionRequestDigest,decisionWireIdentity,validateDecisionWireIdentity,committedDecisionReceipt,assertDecisionWireReplay,DECISION_ADMISSION_PROTOCOL} from './local-decision-rejection.mjs';
import {normalizeDecisionWire} from '../local-acceptance/request-identity.mjs';
import {createLocalReferenceUpload} from './local-reference-upload.mjs';
import {createLocalReferenceMaterial} from './local-reference-material.mjs';
import {referenceInputCheckpoint,isReferenceInputCheckpoint} from './local-reference-input.mjs';
import {admittedDecisionPlan,proveDecisionPlan,validateLocalDecisionRequest} from './local-decision-plan.mjs';
import {isDeepStrictEqual as equal} from 'node:util';
import {readArtifactContent} from './artifact-content.mjs';
import {readStageInvocationOriginal} from './stage-original.mjs';
import {verifySplitProjectOriginals} from './readiness-split-runtime.mjs';
import {releaseReadiness,strategyDeliveryEnvelope,copyDeliveryEnvelope} from './project.mjs';
import {verifyLocalReferenceEvidence} from './local-reference-evidence.mjs';
import {verifyLocalSketchEvidence} from './local-sketch-evidence.mjs';
import {verifyLocalVisualEvidence,verifyLocalContentEvidence,verifyLocalLayoutEvidence} from './local-native-module-evidence.mjs';
import {verifyEngineeringReviewCompletion,readVerifiedEngineeringFinal} from './local-engineering-panel.mjs';
import {buildEngineeringEditorBinding} from './local-engineering-editor-bridge.mjs';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID,createHash} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {hostname} from 'node:os';

const caseRegistrations=new WeakMap();
export function readAcceptanceCaseRegistration(registration){const value=caseRegistrations.get(registration);need(value,'ACCEPTANCE_CASE_REGISTRATION_REQUIRED');return Object.freeze(structuredClone(value));}
export const ACCEPTANCE_MODULES=['brief','research','strategy','copy','references','sketch','visual','content','layout','final_review'];
export const ACCEPTANCE_CASES={m6:{name:'梦之蓝 M6+ 春节品牌 KV',productType:'kv',audience:'30—50岁送礼者及家庭聚餐购买者',constraints:['通用春节，不绑定年份或生肖','已有品牌素材仅作有来源资产使用']},dexian:{name:'得闲 社交型白酒包装',productType:'packaging',audience:'25岁年轻人的社交使用',constraints:['轻型指轻松社交、轻负担品牌表达','度数、容量、价格未定，不作低度或健康宣称']}};
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const need=(v,code,status=422)=>{if(!v)throw Object.assign(Error(code),{code,status});};
const actor=()=>({actorType:'human',actorId:'local-acceptance-user',runId:randomUUID(),contextId:randomUUID()});
export function acceptanceDeliveryApprovalBasis(envelope){
 const {envelopeHash,manualReferences,...approval}=envelope;
 return digest({protocol:'local-delivery-approval-v1',envelope:approval});
}
async function checkedEngineeringFinal(project,record,{engineeringPanel,driverResult=null}={}){
 need(typeof engineeringPanel?.status==='function','ACCEPTANCE_ENGINEERING_PANEL_REQUIRED');
 const actual=await engineeringPanel.status(project.id);
 need(actual&&['pending','running','blocked','awaiting_user','awaiting_reconciliation','complete','returned'].includes(actual.status),'ACCEPTANCE_ENGINEERING_STATUS_INVALID');
 let verifiedFinal=null,result;
 if(actual.status==='complete'){
  verifiedFinal=await verifyEngineeringReviewCompletion(engineeringPanel,{projectId:project.id,caseId:record?.caseId});
  const {value}=readVerifiedEngineeringFinal(verifiedFinal,{project});
  result={status:'complete',kind:'local_engineering_acceptance',reviewId:value.reviewId,sourceBindingHash:value.sourceBindingHash,sourceEvidenceHash:value.sourceEvidenceHash,localReviewEvidenceHash:value.localReviewEvidenceHash,content:structuredClone(value.content),layout:structuredClone(value.layout),syntheticOnly:true,productionFinalAuthority:false,finalAuthorityAvailable:false,realQualityVerified:false,browserVerified:false};
 }else{
  const evidenceHash=actual.evidenceHash,publicActual=Object.fromEntries(['kind','reviewId','sourceBindingHash','completedCalls','expectedCalls','reviewEvidenceHash','gatesHash','localReviewEvidenceHash','reason','findings','validationLevel','editorStatus','limitations'].filter(k=>Object.hasOwn(actual,k)).map(k=>[k,structuredClone(actual[k])]));
  result={...publicActual,status:actual.status==='returned'?'blocked':actual.status,sourceEvidenceHash:evidenceHash,syntheticOnly:true,productionFinalAuthority:false,finalAuthorityAvailable:false,realQualityVerified:false,browserVerified:false};
 }
 if(driverResult){
  need(!Object.hasOwn(driverResult,'module')&&!Object.hasOwn(driverResult,'evidenceHash'),'ACCEPTANCE_DRIVER_RESERVED_FIELD');
  need(driverResult.status===result.status,'ACCEPTANCE_ENGINEERING_DRIVER_CHANGED');
  for(const key of ['reviewId','localReviewEvidenceHash','sourceBindingHash','sourceEvidenceHash'])if(Object.hasOwn(driverResult,key))need(driverResult[key]===result[key],'ACCEPTANCE_ENGINEERING_DRIVER_CHANGED');
 }
 return {result,verifiedFinal};
}
export async function verifyAcceptanceModuleEvidence(project,module,result,{executionRoot,imageStore,executor,engineeringPanel,caseRecord,deliveryBindings={}}={}){
 need(result&&!Object.hasOwn(result,'module')&&!Object.hasOwn(result,'evidenceHash'),'ACCEPTANCE_DRIVER_RESERVED_FIELD');
 need(result&&['pending','running','complete','blocked','awaiting_user','awaiting_reconciliation'].includes(result.status),'ACCEPTANCE_DRIVER_STATUS_INVALID');
 const {released:untrustedRelease,...clean}=result;
 if(result.status!=='complete')return clean;
 if(module==='references')return verifyLocalReferenceEvidence(project,clean,{executionRoot,imageStore});
 if(module==='sketch')return verifyLocalSketchEvidence(project,clean,{executionRoot,imageStore});
 if(module==='visual')return verifyLocalVisualEvidence(project,clean,{executor});
 if(module==='content')return verifyLocalContentEvidence(project,clean,{executor});
 if(module==='layout')return verifyLocalLayoutEvidence(project,clean,{executor});
 if(module==='final_review')return (await checkedEngineeringFinal(project,caseRecord,{engineeringPanel,driverResult:clean})).result;
 need(['research','strategy','copy'].includes(module),'ACCEPTANCE_MODULE_ORIGINAL_VERIFIER_REQUIRED');
 const artifact=project.artifacts.find(a=>a.id===project.activeByStage[module]&&a.stage===module);
 need(artifact&&Array.isArray(result.resultIds)&&result.resultIds.length===1&&result.resultIds[0]===artifact.id,'ACCEPTANCE_CURRENT_ARTIFACT_REQUIRED');
 need(Array.isArray(result.jobIds)&&result.jobIds.length>0&&new Set(result.jobIds).size===result.jobIds.length,'ACCEPTANCE_COMPLETION_EVIDENCE_REQUIRED');
 const jobs=result.jobIds.map(id=>project.jobs.find(j=>j.id===id));
 need(jobs.every(j=>j?.stage===module&&j.status==='succeeded'&&j.attempts?.some(a=>a.status==='succeeded'&&a.receipt)&&(j.outputVersionIds?.includes(artifact.id)||j.targetArtifactId===artifact.id)),'ACCEPTANCE_JOB_NOT_CURRENT');
 need(jobs.some(j=>j.outputVersionIds?.includes(artifact.id)),'ACCEPTANCE_PRODUCER_REQUIRED');
 need(typeof executionRoot==='string'&&executionRoot.length>0,'ACCEPTANCE_EXECUTION_ROOT_REQUIRED');
 await readArtifactContent(project,artifact.id,executionRoot);
 await verifySplitProjectOriginals(project,{executionRoot});
 for(const job of project.jobs.filter(j=>j.stage===module&&j.status==='succeeded'&&(j.outputVersionIds?.includes(artifact.id)||j.targetArtifactId===artifact.id))){const attempt=job.attempts.findLast(a=>a.status==='succeeded');if(attempt.receipt?.provider!=='split-readiness-composite-v1')await readStageInvocationOriginal(project,job,attempt,{executionRoot});}
 if(module==='research'){
  const readiness=releaseReadiness(project,artifact.id);need(readiness.eligible,'ACCEPTANCE_RELEASE_BLOCKED');return {...clean,deliveryReady:true,releaseEligible:true};
 }
 const binding=deliveryBindings[module],expectedRole=module==='strategy'?'copy-lead':'references-lead';
 need(binding&&binding.role===expectedRole&&['providerId','model'].every(k=>typeof binding[k]==='string'&&binding[k].trim()),'ACCEPTANCE_DELIVERY_BINDING_REQUIRED');
 const contents=[],seen=new Set(),visiting=new Set();
 async function visit(id){
  if(seen.has(id))return;need(!visiting.has(id),'ACCEPTANCE_LINEAGE_CYCLE');
  const a=project.artifacts.find(a=>a.id===id);
  if(!a){need(project.taskCards.some(c=>c.id===id),'ACCEPTANCE_LINEAGE_MISSING');return;}
  visiting.add(id);const loaded=await readArtifactContent(project,id,executionRoot);contents.push({artifactId:id,contentText:loaded.contentText});
  for(const next of [...a.inputVersionIds,...(a.revision?[a.revision.revisionOf.artifactId]:[])])await visit(next);
  visiting.delete(id);seen.add(id);
 }
 await visit(artifact.id);
 const envelope=(module==='strategy'?strategyDeliveryEnvelope:copyDeliveryEnvelope)(project,artifact.id,contents,binding);
 if(Object.hasOwn(result,'deliveryEnvelopeHash'))need(result.deliveryEnvelopeHash===envelope.envelopeHash,'ACCEPTANCE_DELIVERY_ENVELOPE_CHANGED');
 if(Object.hasOwn(result,'consumerBinding'))need(equal(result.consumerBinding,binding),'ACCEPTANCE_DELIVERY_BINDING_CHANGED');
 const {released,deliveryReady,deliveryEnvelopeHash,consumerBinding,releaseEligible,...summary}=result;
 return {...summary,deliveryReady:true,deliveryEnvelopeHash:envelope.envelopeHash,approvalBasisHash:acceptanceDeliveryApprovalBasis(envelope),consumerBinding:structuredClone(binding),releaseEligible:releaseReadiness(project,artifact.id).eligible};
}
export function acceptanceEditorBinding(project,record,verifiedFinal){return buildEngineeringEditorBinding(project,record,verifiedFinal);}
export function assertLocalFixtureWorkflowProfile({databasePath,projectStore,fixtureIdentity}){
 const identity=normalizeLocalFixtureIdentity(fixtureIdentity);
 if(identity)need(typeof projectStore?.list==='function','LOCAL_FIXTURE_PROJECT_LIST_REQUIRED');
 const projects=identity?projectStore.list().map(p=>p.id):[];
 need(new Set(projects).size===projects.length,'LOCAL_FIXTURE_OWNERSHIP_INVALID');
 if(!existsSync(databasePath)){if(identity)need(projects.length===0,'LOCAL_FIXTURE_OWNERSHIP_INVALID');return true;}
 const db=new DatabaseSync(databasePath,{readOnly:true});
 try{
  const tables=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name));
  const cases=tables.has('acceptance_cases')?db.prepare('SELECT id,body FROM acceptance_cases').all().map(r=>({rowId:r.id,record:JSON.parse(r.body)})):[];
  const creations=tables.has('acceptance_creations')?db.prepare('SELECT id,payload,state FROM acceptance_creations').all().map(r=>({rowId:r.id,state:r.state,payload:JSON.parse(r.payload)})):[];
  for(const c of cases)requireMatchingLocalFixtureIdentity(c.record,identity);
  for(const c of creations)requireMatchingLocalFixtureIdentity(c.payload,identity);
  if(identity){
   const byId=new Map();for(const c of creations){need(['pending','ready'].includes(c.state)&&c.rowId===c.payload.id&&c.payload.id===c.payload.projectId&&!byId.has(c.rowId),'LOCAL_FIXTURE_OWNERSHIP_INVALID');byId.set(c.rowId,c);}
   const caseIds=new Set();for(const c of cases){const record=c.record,creation=byId.get(c.rowId);need(!caseIds.has(c.rowId)&&record.id===c.rowId&&creation&&record.projectId===c.rowId&&record.caseId===creation.payload.caseId&&projects.includes(record.projectId),'LOCAL_FIXTURE_OWNERSHIP_INVALID');caseIds.add(c.rowId);}
   for(const c of creations)if(c.state==='ready')need(caseIds.has(c.rowId)&&projects.includes(c.rowId),'LOCAL_FIXTURE_OWNERSHIP_INVALID');
   for(const id of projects)need(byId.has(id),'LOCAL_FIXTURE_OWNERSHIP_INVALID');
  }
  return true;
 }finally{db.close();}
}
export function openLocalAcceptanceCoordinator({databasePath,projectStore,executor,drivers={},engineeringPanel=null,editorBridge,editableStore,executionRoot,imageStore,deliveryBindings={},caseInitializer=null,contributionExecution=false,referenceRuntimeProfile,fixtureIdentity}){
 fixtureIdentity=normalizeLocalFixtureIdentity(fixtureIdentity);
 assertLocalFixtureWorkflowProfile({databasePath,projectStore,fixtureIdentity});
 referenceRuntimeProfile=referenceRuntimeProfileOf(referenceRuntimeProfile);
 need(typeof contributionExecution==='boolean','LOCAL_CONTRIBUTION_EXECUTION_FLAG_INVALID');
 need(caseInitializer===null||typeof caseInitializer==='function','ACCEPTANCE_CASE_INITIALIZER_INVALID');
 const configuredDeliveryBindings=structuredClone(deliveryBindings);
 mkdirSync(dirname(databasePath),{recursive:true});const db=new DatabaseSync(databasePath);db.exec('PRAGMA busy_timeout=5000;CREATE TABLE IF NOT EXISTS acceptance_cases(id TEXT PRIMARY KEY,body TEXT NOT NULL);CREATE TABLE IF NOT EXISTS acceptance_creations(command_id TEXT PRIMARY KEY,request_hash TEXT NOT NULL,id TEXT NOT NULL,payload TEXT NOT NULL,state TEXT NOT NULL);CREATE TABLE IF NOT EXISTS acceptance_decisions(id TEXT NOT NULL,command_id TEXT NOT NULL,request_hash TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(id,command_id));');
 db.exec('CREATE TABLE IF NOT EXISTS acceptance_advances(id TEXT NOT NULL,command_id TEXT NOT NULL,request_hash TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(id,command_id));');
 try{for(const row of db.prepare('SELECT body FROM acceptance_cases').all()){const record=JSON.parse(row.body);requireMatchingCaseProfile(record,referenceRuntimeProfile);requireMatchingLocalFixtureIdentity(record,fixtureIdentity);}for(const row of db.prepare('SELECT payload FROM acceptance_creations').all()){const record=JSON.parse(row.payload);requireMatchingCaseProfile(record,referenceRuntimeProfile);requireMatchingLocalFixtureIdentity(record,fixtureIdentity);}}catch(error){db.close();throw error;}
 const locks=new Map(),creationLocks=new Map(),decisionLocks=new Map(),contributionLocks=new Map(),advanceInspectionOwners=new WeakMap();
 db.exec('CREATE TABLE IF NOT EXISTS acceptance_decision_intents(id TEXT NOT NULL,command_id TEXT NOT NULL,request_hash TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(id,command_id));');
 const decisionRejections=openDecisionRejections(db);
 const referenceContext=new AsyncLocalStorage();
 const referenceAdmission=openReferenceAdmission(db,{nativeCommandExists:(projectId,commandId)=>Object.hasOwn(projectStore.read(projectId).processedCommands,commandId)});
 async function referenceRequest(id,request,operation,work){
  const record=load(id);if(record.referenceAdmissionProtocol!=='durable-reference-admission-v1')return work(request);
  request=structuredClone(request);
  const reservation=referenceAdmission.reserve({caseId:id,projectId:record.projectId,operation,request});
  if(reservation.kind==='rejected'){const receipt=referenceAdmission.receipt(id,request.commandId);throw Object.assign(Error(receipt.reason),{code:receipt.reason,status:409,rejectionReceipt:receipt});}
  if(reservation.kind==='reconcile_only'){
   need(Object.hasOwn(projectStore.read(record.projectId).processedCommands,request.commandId),'LOCAL_REFERENCE_REQUEST_UNRESOLVED',409);
   return work(request);
  }
  return referenceContext.run(reservation.lease,async()=>{try{return await work(request);}catch(error){
   if(Number.isInteger(error.status)&&error.status>=400&&error.status<500&&/^[A-Z0-9_]{1,160}$/.test(error.code??'')){
    if(referenceAdmission.reject(reservation.lease,error.code))error.rejectionReceipt=referenceAdmission.receipt(id,request.commandId);
   }
   throw error;
  }});
 }
 const load=id=>{const row=db.prepare('SELECT body FROM acceptance_cases WHERE id=?').get(id);need(row,'ACCEPTANCE_NOT_FOUND');const record=JSON.parse(row.body);requireMatchingCaseProfile(record,referenceRuntimeProfile);requireMatchingLocalFixtureIdentity(record,fixtureIdentity);return record;};
 const initializationState=id=>{const state=db.prepare('SELECT state FROM acceptance_creations WHERE id=?').get(id)?.state;need(!fixtureIdentity||state==='pending'||state==='ready','LOCAL_FIXTURE_OWNERSHIP_INVALID');return state??'legacy_ready';};
 const requireInitialized=id=>{load(id);need(['ready','legacy_ready'].includes(initializationState(id)),'ACCEPTANCE_CASE_INITIALIZATION_PENDING',409);};
 const requireNoPendingDecision=id=>need(!db.prepare('SELECT body FROM acceptance_decision_intents WHERE id=?').all(id).some(r=>{const i=JSON.parse(r.body);return i.state!=='completed'||i.continuation?.status==='queueing';}),'ACCEPTANCE_DECISION_RECONCILIATION_REQUIRED',409);
 const requireNoPendingContribution=id=>need(!db.prepare('SELECT body FROM acceptance_decision_intents WHERE id=?').all(id).some(r=>{const i=JSON.parse(r.body);return i.contributionPlan&&!['reviewed','feedback_review_addressed'].includes(i.continuation?.status);}),'LOCAL_CONTRIBUTION_CONTINUATION_PENDING',409);
 const save=m=>db.prepare('UPDATE acceptance_cases SET body=? WHERE id=?').run(JSON.stringify(m),m.id);
 function pendingReferenceAdvance(id,inspectionOwner){
  const owned=inspectionOwner&&advanceInspectionOwners.get(inspectionOwner);
  return advanceRows(id).find(row=>{
   const value=JSON.parse(row.body);if(!['running','interrupted','needs_reconciliation'].includes(value.state))return false;
   return !(owned&&owned.id===id&&owned.commandId===row.command_id&&value.commandId===owned.commandId&&owned.requestHash===row.request_hash&&value.state==='running'&&value.owner?.host===hostname()&&value.owner.pid===process.pid&&value.owner.runId===owned.runId&&value.basisRevision===owned.basisRevision);
  });
 }
 async function inspectCase(id,inspectionOwner){
  const m=load(id),initialization=initializationState(id),p=projectStore.read(m.projectId),states=[];let stopped=false,verifiedFinal=null,verifiedReferences=null;
  if(!['ready','legacy_ready'].includes(initialization)){
   for(const [index,module]of ACCEPTANCE_MODULES.entries()){const state={module,status:index===0?'blocked':'pending',reason:index===0?'ACCEPTANCE_CASE_INITIALIZATION_PENDING':'UPSTREAM_INCOMPLETE'};states.push({...state,evidenceHash:digest(state)});}
   return {publicState:{id:m.id,projectId:m.projectId,projectRevision:p.revision,caseId:m.caseId,name:m.name,referenceRuntimeProfile,mode:m.mode,checkpoints:m.checkpoints,syntheticOnly:true,realModelVerified:false,initializationState:initialization,retryRequired:true,states,jobs:p.jobs.map(j=>({id:j.id,purpose:j.purpose,stage:j.stage,status:j.status})),nextAction:states[0],editorDocumentId:null,decisions:m.decisions,complete:false},verifiedFinal:null};
  }
  for(const module of ACCEPTANCE_MODULES){
   let result;
   if(stopped)result={status:'pending',reason:'UPSTREAM_INCOMPLETE'};
   else if(module==='brief')result={status:p.confirmations.some(c=>c.taskCardId===p.activeTaskCardId)?'complete':'awaiting_user',taskCard:p.taskCards.find(c=>c.id===p.activeTaskCardId)};
   else if(module==='final_review'){try{const driverResult=drivers[module]?.inspect?await drivers[module].inspect({project:p,executor,case:m}):null;const checked=await checkedEngineeringFinal(p,m,{engineeringPanel,driverResult});result=checked.result;verifiedFinal=checked.verifiedFinal;}catch(e){result={status:'blocked',reason:e.code??'LOCAL_ENGINEERING_READ_FAILED'};}}
   else if(!drivers[module])result={status:'blocked',reason:'LOCAL_DRIVER_NOT_CONFIGURED'};
   else{try{result=await verifyAcceptanceModuleEvidence(p,module,await drivers[module].inspect({project:p,executor,case:m}),{executionRoot,imageStore,executor,deliveryBindings:configuredDeliveryBindings});}catch(e){result={status:'blocked',reason:e.code??'LOCAL_INSPECTION_FAILED'};}}
   if(module==='references'&&result.status==='complete')verifiedReferences=result;
   const input=!stopped&&module==='references'?referenceInputCheckpoint(p,m,result):null;
   if(input&&!input.approved)result={...result,status:'awaiting_user',underlyingStatus:'pending',reason:'SELECTED_REFERENCE_INPUT_CHECKPOINT',inputCheckpoint:input.checkpoint};
   if(input&&pendingReferenceAdvance(id,inspectionOwner))result={...result,status:'awaiting_reconciliation',reason:'ACCEPTANCE_ADVANCE_OUTCOME_UNKNOWN'};
   const evidenceHash=input&&!input.approved?input.basisHash:result.status==='complete'&&['strategy','copy'].includes(module)?result.approvalBasisHash:digest(result),decision=m.decisions.findLast(d=>d.module===module),selected=m.mode==='assisted'&&m.checkpoints.includes(module);
   if(result.status==='complete'&&selected&&(decision?.decision!=='approve'||decision.basisHash!==evidenceHash))result={...result,status:'awaiting_user',underlyingStatus:'complete',reason:'SELECTED_HUMAN_CHECKPOINT'};
   states.push({...result,module,evidenceHash});if(result.status!=='complete')stopped=true;
  }
  let invalidContribution=null;
  for(const row of db.prepare('SELECT body FROM acceptance_decision_intents WHERE id=?').all(id)){const intent=JSON.parse(row.body);if(intent.continuation?.status==='feedback_review_addressed'&&p.activeByStage[intent.request.module]===intent.continuation.revision?.artifactId){try{const proof=await contributionFeedbackOriginal(intent,projectStore,executionRoot);need(proof.hasBlockingFindings===false,'LOCAL_CONTRIBUTION_REVIEW_STATUS_CHANGED');need(JSON.stringify(proof)===JSON.stringify(intent.continuation.feedbackReview),'LOCAL_CONTRIBUTION_REVIEW_PROOF_CHANGED');}catch(e){invalidContribution={module:intent.request.module,reason:'LOCAL_CONTRIBUTION_REVIEW_ORIGINAL_CHANGED',cause:e.code??'UNKNOWN'};break;}}}
  const complete=states.every(s=>s.status==='complete');let editorDocumentId=m.editorDocumentId??null;
  if(!complete)editorDocumentId=null;else if(editorDocumentId){try{need(editableStore?.read,'ACCEPTANCE_EDITOR_STORE_REQUIRED');need(JSON.stringify(editableStore.read(editorDocumentId).sourceBinding)===JSON.stringify(acceptanceEditorBinding(p,m,verifiedFinal)),'ACCEPTANCE_EDITOR_SOURCE_CHANGED');}catch{editorDocumentId=null;}}
  const publicState={initializationState:initialization,retryRequired:false,id:m.id,projectId:m.projectId,projectRevision:p.revision,caseId:m.caseId,name:m.name,referenceRuntimeProfile,mode:m.mode,checkpoints:m.checkpoints,syntheticOnly:true,realModelVerified:false,states,jobs:p.jobs.map(j=>({id:j.id,purpose:j.purpose,stage:j.stage,status:j.status,attemptIds:(j.attempts??[]).map(a=>a.id)})),nextAction:states.find(s=>s.status!=='complete')??{module:'editor',status:editorDocumentId?'complete':'pending'},editorDocumentId,decisions:m.decisions,complete:complete&&!!editorDocumentId};
  const pendingDecision=db.prepare('SELECT body FROM acceptance_decision_intents WHERE id=?').all(id).map(r=>JSON.parse(r.body)).find(r=>r.state!=='completed'||r.continuation?.status==='queueing');
  if(pendingDecision)return {publicState:{...publicState,complete:false,editorDocumentId:null,decisionCommand:{commandId:pendingDecision.request.commandId,state:pendingDecision.continuation?.status==='queueing'?'queueing_revision':pendingDecision.state,recoverySupported:pendingDecision.steps[0].kind!=='unadapted_external_effect'},nextAction:{...publicState.nextAction,status:'awaiting_reconciliation',reason:'ACCEPTANCE_DECISION_RECONCILIATION_REQUIRED'}},verifiedFinal:null};
  const contribution=db.prepare('SELECT body FROM acceptance_decision_intents WHERE id=?').all(id).map(r=>JSON.parse(r.body)).find(i=>i.state==='completed'&&i.contributionPlan&&!['reviewed','feedback_review_addressed'].includes(i.continuation?.status));
  if(contribution){const pendingContinuation={commandId:contribution.request.commandId,module:contribution.request.module,feedbackId:contribution.contributionPlan.proposal.feedbackId,sourceArtifactId:contribution.contributionPlan.sourcePins.artifactId,status:contribution.continuation.status,revisionJobId:contribution.continuation.jobId??null,nextStep:({revision_queued:'execute_native_revision',interrupted:'reconcile_revision_queue',revision_generated_pending_feedback_review:'enqueue_independent_feedback_review',feedback_review_queued:'execute_independent_feedback_review',feedback_review_unresolved:'resolve_independent_feedback_findings',executing_revision:'reconcile_original_revision',queueing_feedback_review:'reconcile_original_review_queue',executing_feedback_review:'reconcile_original_feedback_review'})[contribution.continuation.status]??'enqueue_revision',disposition:'pending_review',factualAuthority:false,semanticReviewVerified:false};let status='blocked';
   if(contributionExecution&&(contribution.request.module==='strategy'||contribution.request.module==='copy'&&contribution.contributionPlan.copyTarget)){const c=contribution.continuation,revision=p.jobs.find(j=>j.id===c.jobId),review=p.jobs.find(j=>j.id===c.reviewQueue?.jobId||c.feedbackReviewRequest&&JSON.stringify(j.task?.enqueueRequest)===JSON.stringify(c.feedbackReviewRequest));
    if(['pending_revision','interrupted','revision_generated_pending_feedback_review'].includes(c.status))status='pending';
    else if(c.status==='revision_queued')status=['queued','succeeded'].includes(revision?.status)?'pending':'awaiting_reconciliation';
    else if(c.status==='executing_revision')status=revision?.status==='succeeded'?'pending':'awaiting_reconciliation';
    else if(c.status==='queueing_feedback_review')status=review?'pending':'awaiting_reconciliation';
    else if(c.status==='feedback_review_queued')status=['queued','succeeded'].includes(review?.status)?'pending':'awaiting_reconciliation';
    else if(c.status==='executing_feedback_review')status=review?.status==='succeeded'?'pending':'awaiting_reconciliation';
    if(['executing_revision','queueing_feedback_review','executing_feedback_review'].includes(c.status)&&!c.phaseTerminal){let dead=false;if(c.phaseOwner?.host===hostname())try{process.kill(c.phaseOwner.pid,0);}catch(e){dead=e.code==='ESRCH';}if(!dead)status='awaiting_reconciliation';}
   }
   return {publicState:{...publicState,complete:false,editorDocumentId:null,pendingContinuation,nextAction:{module:contribution.request.module,status,reason:'LOCAL_CONTRIBUTION_CONTINUATION_PENDING',evidenceHash:digest(pendingContinuation)}},verifiedFinal:null};}
  if(invalidContribution)return {publicState:{...publicState,complete:false,editorDocumentId:null,states:publicState.states.map(s=>s.module===invalidContribution.module?{...invalidContribution,status:'blocked',evidenceHash:digest(invalidContribution)}:s),nextAction:{...invalidContribution,status:'blocked',evidenceHash:digest(invalidContribution)}},verifiedFinal:null};
  if(contributionExecution&&m.mode==='assisted'&&publicState.nextAction.module==='copy'&&publicState.nextAction.status==='awaiting_user'&&publicState.nextAction.underlyingStatus==='complete'&&publicState.nextAction.reason==='SELECTED_HUMAN_CHECKPOINT'){
   const artifact=p.artifacts.find(a=>a.id===p.activeByStage.copy),loaded=await readArtifactContent(p,artifact.id,executionRoot);
   need(projectStore.read(p.id).revision===p.revision,'ACCEPTANCE_COPY_VIEW_STALE',409);
   publicState.copyThemeInput={kind:'copy_theme',expectedBasisHash:publicState.nextAction.evidenceHash,...copyDirectionOptions({artifact,contentText:loaded.contentText}),origin:'human-preference-not-evidence',factualAuthority:false,requiresIndependentReview:true};
  }
  publicState.referenceReview=referenceReviewView(p,verifiedReferences);
  if(isReferenceInputCheckpoint(publicState.nextAction)){
   const loaded=await readArtifactContent(p,publicState.nextAction.inputCheckpoint.copyArtifactId,executionRoot);
   need(projectStore.read(p.id).revision===p.revision,'LOCAL_REFERENCE_VIEW_STALE',409);
   publicState.referenceInput=referenceInputView(p,publicState.nextAction,loaded.contentText);
  }
  if(!publicState.referenceInput&&referenceCorrectionEligible(p,m,publicState.nextAction,states)&&typeof drivers.references?.readInputPlan==='function'){
   const recomputedPlan=await drivers.references.readInputPlan({project:p,case:m});
   const artifact=p.artifacts.find(a=>a.id===p.activeByStage.copy),loaded=await readArtifactContent(p,artifact.id,executionRoot);
   need(projectStore.read(p.id).revision===p.revision,'LOCAL_REFERENCE_VIEW_STALE',409);
   publicState.referenceInput=referenceCorrectionView(p,m,publicState.nextAction,states,loaded.contentText,recomputedPlan);
  }
  return {publicState,verifiedFinal};
 }
 async function read(id){return (await inspectCase(id)).publicState;}
 async function createInternal({caseId,brief,mode='auto',checkpoints=[],commandId}){
  need(typeof commandId==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(commandId),'ACCEPTANCE_CREATE_COMMAND_REQUIRED');
  need(Object.hasOwn(ACCEPTANCE_CASES,caseId),'ACCEPTANCE_CASE_INVALID');need(typeof brief==='string'&&brief.trim().length>0&&brief.length<=20000,'ACCEPTANCE_BRIEF_INVALID');need(['auto','assisted'].includes(mode)&&Array.isArray(checkpoints)&&new Set(checkpoints).size===checkpoints.length&&checkpoints.every(k=>ACCEPTANCE_MODULES.includes(k)&&k!=='brief'),'ACCEPTANCE_MODE_INVALID');
  const requestHash=digest({caseId,brief,mode,checkpoints,...(fixtureIdentity?{fixtureIdentity}:{})});let creation;
  db.exec('BEGIN IMMEDIATE');try{
   creation=db.prepare('SELECT * FROM acceptance_creations WHERE command_id=?').get(commandId);
   if(creation)need(creation.request_hash===requestHash,'ACCEPTANCE_COMMAND_REUSED',409);
   else{const id='acceptance-'+randomUUID(),sample=ACCEPTANCE_CASES[caseId],m={id,projectId:id,caseId,name:sample.name,mode,checkpoints,syntheticOnly:true,referenceRuntimeProfile,referenceAdmissionProtocol:'durable-reference-admission-v1',decisionAdmissionProtocol:DECISION_ADMISSION_PROTOCOL,initializationRequired:!!caseInitializer,...(fixtureIdentity?{fixtureIdentity}:{}),productType:sample.productType,audience:sample.audience,constraints:sample.constraints,decisions:[]};creation={command_id:commandId,request_hash:requestHash,id,payload:JSON.stringify(m),state:'pending'};db.prepare('INSERT INTO acceptance_creations VALUES(?,?,?,?,?)').run(commandId,requestHash,id,creation.payload,creation.state);}
   db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
  const m=JSON.parse(creation.payload);requireMatchingCaseProfile(m,referenceRuntimeProfile);requireMatchingLocalFixtureIdentity(m,fixtureIdentity);let project;
  try{project=projectStore.read(m.projectId);}catch(e){if(e.code!=='NOT_FOUND')throw e;try{project=projectStore.create({id:m.projectId,name:m.name,brief:brief.trim(),mode:'auto',humanGates:[]},actor());}catch(createError){if(createError.code!=='PROJECT_EXISTS')throw createError;project=projectStore.read(m.projectId);}}
  need(project.id===m.projectId&&project.taskCards[0]?.brief===brief.trim(),'ACCEPTANCE_CREATE_PROJECT_CHANGED',409);
  db.exec('BEGIN IMMEDIATE');try{db.prepare('INSERT OR IGNORE INTO acceptance_cases VALUES(?,?)').run(m.id,creation.payload);const registered=load(m.id);need(registered.projectId===m.projectId&&registered.caseId===m.caseId,'ACCEPTANCE_CREATE_BINDING_CHANGED',409);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
  if(creation.state!=='ready'){
   need(!m.initializationRequired||typeof caseInitializer==='function','ACCEPTANCE_CASE_INITIALIZER_REQUIRED',409);
   if(caseInitializer){const registration=Object.freeze({});caseRegistrations.set(registration,{protocol:'local-acceptance-case-registration-v1',id:m.id,projectId:m.projectId,caseId:m.caseId,creationCommandId:commandId,creationRequestHash:requestHash,initialTaskCardId:project.taskCards[0].id,initialBriefHash:digest(brief.trim())});await caseInitializer({registration,project:projectStore.read(m.projectId)});}
   db.prepare("UPDATE acceptance_creations SET state='ready' WHERE command_id=?").run(commandId);
  }
  return read(m.id);
 }
 async function create(request){
  const key=request?.commandId,hash=digest(request),existing=creationLocks.get(key);if(existing){need(existing.hash===hash,'ACCEPTANCE_COMMAND_REUSED',409);return existing.promise;}
  const promise=createInternal(request);creationLocks.set(key,{hash,promise});try{return await promise;}finally{creationLocks.delete(key);}
 }
 function caseRegistrationForProject(projectId){
  const rows=db.prepare('SELECT c.body,j.state FROM acceptance_cases c LEFT JOIN acceptance_creations j ON c.id=j.id').all().filter(r=>JSON.parse(r.body).projectId===projectId);need(rows.length===1,'ACCEPTANCE_CASE_REGISTRATION_REQUIRED');const m=load(JSON.parse(rows[0].body).id);return Object.freeze({id:m.id,projectId:m.projectId,caseId:m.caseId,initializationState:initializationState(m.id)});
 }
 async function trustedAdvance(id,inspectionOwner){
  requireInitialized(id);requireNoPendingDecision(id);if(!contributionExecution)requireNoPendingContribution(id);
  if(locks.has(id))return locks.get(id);
  const operation=(async()=>{const {publicState:state,verifiedFinal}=await inspectCase(id,inspectionOwner),m=load(id),p=projectStore.read(m.projectId),next=state.nextAction;
   if(state.pendingContinuation&&contributionExecution){if(next.status!=='pending')return state;const c=state.pendingContinuation;if(['pending_revision','interrupted'].includes(c.status))await queueContributionRevision(id,c.commandId);else await advanceContribution(id,c.commandId);return read(id);}
   if(next.module==='editor'){need(state.states.length===ACCEPTANCE_MODULES.length&&state.states.every((s,i)=>s.module===ACCEPTANCE_MODULES[i]&&s.status==='complete'),'ACCEPTANCE_EDITOR_UPSTREAM_INCOMPLETE');need(verifiedFinal,'ACCEPTANCE_EDITOR_VERIFIED_FINAL_REQUIRED');if(!state.editorDocumentId&&editorBridge){need(typeof editableStore?.read==='function','ACCEPTANCE_EDITOR_STORE_REQUIRED');const sourceBinding=acceptanceEditorBinding(p,m,verifiedFinal),result=await editorBridge({project:p,executor,case:m,sourceBinding,verifiedFinal});need(typeof result?.documentId==='string'&&result.documentId.length>0,'ACCEPTANCE_EDITOR_BINDING_INVALID');const document=editableStore.read(result.documentId);need(JSON.stringify(document.sourceBinding)===JSON.stringify(sourceBinding)&&document.id===result.documentId,'ACCEPTANCE_EDITOR_SOURCE_CHANGED');need(JSON.stringify(acceptanceEditorBinding(projectStore.read(m.projectId),m,verifiedFinal))===JSON.stringify(sourceBinding),'ACCEPTANCE_PIPELINE_CHANGED');m.editorDocumentId=result.documentId;save(m);}return read(id);}
   if(next.reason==='LOCAL_CONTRIBUTION_REVIEW_ORIGINAL_CHANGED')return state;
   if(['awaiting_user','awaiting_reconciliation'].includes(next.status)||next.module==='brief')return state;
   if(next.module==='final_review'&&engineeringPanel){if(next.status!=='pending')return state;await engineeringPanel.advance(p.id);return read(id);}
   const driver=drivers[next.module];if(driver?.advance)await driver.advance({project:p,executor,case:m,commandId:`${m.id}-${next.module}-${p.revision}`});return read(id);
  })();locks.set(id,operation);try{return await operation;}finally{locks.delete(id);}
 }
 const commandBody=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
 const advanceRows=id=>db.prepare('SELECT * FROM acceptance_advances WHERE id=? ORDER BY rowid').all(id);
 const updateAdvance=(id,record)=>db.prepare('UPDATE acceptance_advances SET body=? WHERE id=? AND command_id=?').run(JSON.stringify(record),id,record.commandId);
 function writerState(record){
  if(record.state!=='running')return 'ended';
  if(record.owner.host!==hostname())return 'unknown';
  try{process.kill(record.owner.pid,0);return 'alive';}catch(e){return e.code==='ESRCH'?'dead':'unknown';}
 }
 function observeAdvance(id,record){
  if(record.state==='running'&&writerState(record)!=='dead')return record;
  if(['running','interrupted','needs_reconciliation'].includes(record.state)){
   const revision=projectStore.read(load(id).projectId).revision;
   record={...record,state:revision!==record.basisRevision?'observed_changed':'needs_reconciliation',observedRevision:revision,actionOutcome:'unknown'};updateAdvance(id,record);
  }
  return record;
 }
 async function advanceView(id,record){
  const value=await read(id),unresolved=record.state==='needs_reconciliation'||record.state==='running';
  return {...value,advanceCommand:{commandId:record.commandId,state:record.state,basisRevision:record.basisRevision,observedRevision:record.observedRevision??value.projectRevision,actionOutcome:record.actionOutcome??'unknown',businessSuccess:'not_asserted'},...(unresolved?{nextAction:{...value.nextAction,status:'awaiting_reconciliation',reason:record.state==='running'?'ACCEPTANCE_ADVANCE_WRITER_UNRESOLVED':'ACCEPTANCE_ADVANCE_OUTCOME_UNKNOWN'}}:{})};
 }
 async function advance(id,request){
  requireInitialized(id);requireNoPendingDecision(id);if(!contributionExecution)requireNoPendingContribution(id);
  // Explicit internal compatibility. HTTP validates a command before reaching this method.
  if(request===undefined)return trustedAdvance(id);
  need(request&&typeof request==='object'&&!Array.isArray(request)&&typeof request.commandId==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(request.commandId),'ACCEPTANCE_ADVANCE_COMMAND_REQUIRED');
  const serialized=commandBody(request);need(Buffer.byteLength(serialized)<=65536,'ACCEPTANCE_ADVANCE_REQUEST_LIMIT');const requestHash=digest(serialized);
  let record,dispatch=false;
  db.exec('BEGIN IMMEDIATE');try{
   const prior=db.prepare('SELECT * FROM acceptance_advances WHERE id=? AND command_id=?').get(id,request.commandId);
   if(prior){need(prior.request_hash===requestHash,'ACCEPTANCE_COMMAND_REUSED',409);record=observeAdvance(id,JSON.parse(prior.body));}
   else{
    const m=load(id),p=projectStore.read(m.projectId),pending=advanceRows(id).map(r=>observeAdvance(id,JSON.parse(r.body))).find(r=>['running','needs_reconciliation','interrupted'].includes(r.state));
    record={commandId:request.commandId,basisRevision:p.revision,state:pending?'blocked_by_prior':'running',owner:{host:hostname(),pid:process.pid,runId:randomUUID()},actionOutcome:pending?'not_dispatched':'unknown',...(pending?{blockedBy:pending.commandId}:{})};
    db.prepare('INSERT INTO acceptance_advances VALUES(?,?,?,?)').run(id,request.commandId,requestHash,JSON.stringify(record));dispatch=!pending;
   }
   db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
  if(!dispatch){
   if(record.state==='blocked_by_prior'){const prior=advanceRows(id).find(r=>r.command_id===record.blockedBy),blocked=prior&&observeAdvance(id,JSON.parse(prior.body));if(blocked&&['running','needs_reconciliation'].includes(blocked.state)){const view=await advanceView(id,blocked);return {...view,advanceCommand:{...view.advanceCommand,requestedCommandId:record.commandId,notDispatched:true}};}}
   return advanceView(id,record);
  }
  const inspectionOwner=Object.freeze({});advanceInspectionOwners.set(inspectionOwner,{id,commandId:record.commandId,requestHash,runId:record.owner.runId,basisRevision:record.basisRevision});
  try{await trustedAdvance(id,inspectionOwner);record={...record,state:'completed',observedRevision:projectStore.read(load(id).projectId).revision,actionOutcome:'returned'};updateAdvance(id,record);return advanceView(id,record);}
  catch(e){record={...record,state:'interrupted',observedRevision:projectStore.read(load(id).projectId).revision,actionOutcome:'unknown',errorCode:e.code??'ACCEPTANCE_ADVANCE_INTERRUPTED'};updateAdvance(id,record);observeAdvance(id,record);throw e;}
  finally{advanceInspectionOwners.delete(inspectionOwner);}
 }
 async function decideInternal(id,request,wireRequest){
  requireInitialized(id);
  need(request&&typeof request.commandId==='string'&&request.commandId.length>0&&request.commandId.length<=100&&['approve','revise','reject'].includes(request.decision),'ACCEPTANCE_DECISION_INVALID');
  need(typeof(request.comment??'')==='string'&&(request.comment??'').length<=10000,'ACCEPTANCE_COMMENT_INVALID');
  decisionRejections.rejectKnown(id,request,wireRequest);
  const requestHash=digest(request),old=db.prepare('SELECT request_hash,body FROM acceptance_decisions WHERE id=? AND command_id=?').get(id,request.commandId);
  if(old){
   need(old.request_hash===requestHash,'ACCEPTANCE_COMMAND_REUSED',409);
   const retained=db.prepare('SELECT body FROM acceptance_decision_intents WHERE id=? AND command_id=?').get(id,request.commandId),intent=retained?JSON.parse(retained.body):null,decision=JSON.parse(old.body);
   if(intent?.wireIdentity!==undefined){need(intent.state==='completed'&&equal(decision.commandReceipt,committedDecisionReceipt(id,intent)),'ACCEPTANCE_DECISION_RECEIPT_CHANGED',409);assertDecisionWireReplay(intent,request,wireRequest);}
   else need(!Object.hasOwn(decision,'commandReceipt'),'ACCEPTANCE_DECISION_RECEIPT_CHANGED',409);
   return read(id);
  }
  const saved=db.prepare('SELECT request_hash,body FROM acceptance_decision_intents WHERE id=? AND command_id=?').get(id,request.commandId);
  if(saved){need(saved.request_hash===requestHash,'ACCEPTANCE_COMMAND_REUSED',409);const intent=JSON.parse(saved.body);assertDecisionWireReplay(intent,request,wireRequest);return recoverDecision(id,intent);}
  need(!db.prepare('SELECT body FROM acceptance_decision_intents WHERE id=?').all(id).some(r=>{const i=JSON.parse(r.body);return i.state!=='completed'||i.continuation?.status==='queueing';}),'ACCEPTANCE_DECISION_RECONCILIATION_REQUIRED',409);
  requireNoPendingContribution(id);
  need(typeof request.expectedBasisHash==='string'&&/^[a-f0-9]{64}$/.test(request.expectedBasisHash),'ACCEPTANCE_DECISION_BASIS_REQUIRED');
  const state=await read(id),m=load(id);
  need(request.expectedBasisHash===state.nextAction.evidenceHash,'ACCEPTANCE_DECISION_STALE',409);
  need(state.nextAction.module===request.module,'ACCEPTANCE_WRONG_CHECKPOINT');
  const p=projectStore.read(m.projectId),driver=drivers[request.module];
  need(p.revision===state.projectRevision,'ACCEPTANCE_DECISION_STALE',409);
  const route=validateLocalDecisionRequest(request,state,{hasDriver:!!driver?.decide,hasEngineeringPanel:!!engineeringPanel});
  let engineeringAdoption;
  if(request.module==='final_review'&&route.kind==='unadapted_external_effect'){
   engineeringAdoption=await engineeringPanel.status(p.id);need(engineeringAdoption.status==='awaiting_user'&&engineeringAdoption.reason==='LOCAL_ENGINEERING_HUMAN_GATE'&&engineeringAdoption.reviewId===state.nextAction.reviewId&&engineeringAdoption.evidenceHash===state.nextAction.sourceEvidenceHash,'ACCEPTANCE_DECISION_STALE',409);
   need(projectStore.read(p.id).revision===p.revision,'ACCEPTANCE_DECISION_STALE',409);
  }
  if(route.contribution){await contributionSpace(executionRoot);need(projectStore.read(p.id).revision===p.revision,'ACCEPTANCE_DECISION_STALE',409);}
  const sourceCopy=route.contribution&&request.contribution?.kind==='copy_theme'&&Object.hasOwn(request.contribution,'directionId')?await readArtifactContent(p,p.activeByStage.copy,executionRoot):null;
  const contributionPlan=route.contribution?buildLocalContributionPlan({project:p,request,currentModule:state.nextAction.module,currentBasisHash:state.nextAction.evidenceHash,artifactContentText:sourceCopy?.contentText}):undefined;
  const planned=admittedDecisionPlan({project:p,state,request,actor:actor(),hasExternalEffect:route.kind==='unadapted_external_effect',contributionPlan}),intent={...planned,wireIdentity:decisionWireIdentity(request,wireRequest),state:'admitted',createdAt:new Date().toISOString(),owner:{host:hostname(),pid:process.pid}};
  if(intent.steps[0].kind==='native_command')proveDecisionPlan(intent,projectStore);
  db.exec('BEGIN IMMEDIATE');try{decisionRejections.admissionOpen(id,request,wireRequest);need(!db.prepare('SELECT body FROM acceptance_decision_intents WHERE id=?').all(id).some(r=>{const i=JSON.parse(r.body);return i.state!=='completed'||i.continuation?.status==='queueing';}),'ACCEPTANCE_DECISION_RECONCILIATION_REQUIRED',409);
   if(isReferenceInputCheckpoint(state.nextAction)){
    requireNoPendingContribution(id);
    need(!advanceRows(id).some(row=>['running','interrupted','needs_reconciliation'].includes(JSON.parse(row.body).state)),'ACCEPTANCE_ADVANCE_OUTCOME_UNKNOWN',409);
    const current=projectStore.read(p.id),input=referenceInputCheckpoint(current,load(id),{status:'pending'});
    need(current.revision===p.revision&&input&&!input.approved&&input.basisHash===request.expectedBasisHash,'ACCEPTANCE_DECISION_STALE',409);
   }
   db.prepare('INSERT INTO acceptance_decision_intents VALUES(?,?,?,?)').run(id,request.commandId,requestHash,JSON.stringify(intent));db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
  intent.state='dispatching';writeDecisionIntent(id,intent);
  try{
  if(intent.steps[0].kind==='native_command')executeNativeDecision(id,intent);
  else if(route.kind==='selected_checkpoint_no_effect'){}
  else if(request.module==='final_review'&&engineeringAdoption){
   const actual=engineeringAdoption;
   await engineeringPanel.adopt(p.id,{commandId:request.commandId,reason:request.comment||'Explicit local engineering draft adoption; not production final authority.',reviewId:actual.reviewId,sourceBindingHash:actual.sourceBindingHash,evidenceHash:actual.evidenceHash,reviewEvidenceHash:actual.reviewEvidenceHash,gatesHash:actual.gatesHash},actor());
  }
  else if(driver?.decide)await driver.decide({project:p,executor,case:m,request});
  else need(request.decision==='approve'&&state.nextAction.underlyingStatus==='complete'&&request.contribution===undefined,'ACCEPTANCE_DECISION_HANDLER_REQUIRED');
  if(intent.steps[0].kind!=='unadapted_external_effect'){const proof=proveDecisionPlan(intent,projectStore);need(['committed','no_effect'].includes(proof.status),'ACCEPTANCE_DECISION_EFFECT_NOT_PROVEN',409);}
  return finishDecision(id,intent);
  }catch(e){intent.state=db.prepare('SELECT 1 FROM acceptance_decisions WHERE id=? AND command_id=?').get(id,request.commandId)?'completed':'interrupted';intent.errorCode=e.code??'ACCEPTANCE_DECISION_INTERRUPTED';writeDecisionIntent(id,intent);throw e;}
 }
 function executeNativeDecision(id,intent){
  validateDecisionWireIdentity(intent);
  intent.state='dispatching';intent.nativeSyncTerminal=false;intent.owner={host:hostname(),pid:process.pid};writeDecisionIntent(id,intent);
  let result;try{result=projectStore.command(intent.projectId,intent.steps[0].command,intent.actor);}catch(e){intent.nativeSyncTerminal=true;throw e;}
  if(result&&typeof result.then==='function'){intent.nativeAsyncUnsupported=true;need(false,'ACCEPTANCE_DECISION_ASYNC_STORE_UNSUPPORTED',409);}intent.nativeSyncTerminal=true;
 }
 function writeDecisionIntent(id,intent){db.prepare('UPDATE acceptance_decision_intents SET body=? WHERE id=? AND command_id=?').run(JSON.stringify(intent),id,intent.request.commandId);}
 async function finishDecision(id,intent){
  const m=load(id),request=intent.request,commandReceipt=committedDecisionReceipt(id,intent),decision={...request,...(commandReceipt?{commandReceipt}:{}),createdAt:intent.createdAt,basisRevision:intent.before.revision,basisHash:intent.basisHash,origin:'local-user-input-not-evidence',...(intent.contributionPlan?{contributionDisposition:'feedback_recorded_pending_revision',feedbackId:intent.contributionPlan.proposal.feedbackId,contributionSourcePins:structuredClone(intent.contributionPlan.sourcePins),contributionContinuation:structuredClone(intent.continuation),factualAuthority:false,semanticReviewVerified:false}:{})};
  need(!m.decisions.some(d=>d.commandId===request.commandId),'ACCEPTANCE_DECISION_JOURNAL_CHANGED',409);m.decisions.push(decision);
  db.exec('BEGIN IMMEDIATE');try{save(m);db.prepare('INSERT INTO acceptance_decisions VALUES(?,?,?,?)').run(id,request.commandId,intent.requestHash,JSON.stringify(decision));intent.state='completed';writeDecisionIntent(id,intent);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return read(id);
 }
 async function recoverDecision(id,intent){
  try{
   validateDecisionWireIdentity(intent);
   let deadOwner=false;
   if(intent.state==='dispatching'||intent.state==='admitted'){
    if(intent.owner.host===hostname())try{process.kill(intent.owner.pid,0);}catch(e){if(e.code==='ESRCH')deadOwner=true;}
    need(deadOwner,'ACCEPTANCE_DECISION_WRITER_UNRESOLVED',409);
   }
   need(intent.nativeAsyncUnsupported!==true,'ACCEPTANCE_DECISION_ASYNC_STORE_UNSUPPORTED',409);
   let proof=proveDecisionPlan(intent,projectStore);
   if(proof.status==='not_started'){
    need(intent.nativeSyncTerminal===true||deadOwner,'ACCEPTANCE_DECISION_RECONCILIATION_REQUIRED',409);
    executeNativeDecision(id,intent);proof=proveDecisionPlan(intent,projectStore);
   }
   need(['committed','no_effect'].includes(proof.status),'ACCEPTANCE_DECISION_RECONCILIATION_REQUIRED',409);
   if(proof.status==='no_effect'){const current=await read(id);need(current.projectRevision===intent.before.revision&&current.nextAction.module===intent.request.module&&current.nextAction.evidenceHash===intent.basisHash&&(current.nextAction.underlyingStatus==='complete'||isReferenceInputCheckpoint(current.nextAction)),'ACCEPTANCE_DECISION_SOURCE_CHANGED',409);}
   return finishDecision(id,intent);
  }catch(e){if(e.code==='ACCEPTANCE_DECISION_WRITER_UNRESOLVED')throw e;intent.state='needs_reconciliation';intent.errorCode=e.code??'ACCEPTANCE_DECISION_RECOVERY_UNPROVEN';writeDecisionIntent(id,intent);throw Object.assign(Error('ACCEPTANCE_DECISION_RECONCILIATION_REQUIRED'),{code:'ACCEPTANCE_DECISION_RECONCILIATION_REQUIRED',status:409,cause:e});}
 }
 async function decide(id,request,{wireRequest=request}={}){
  need(request&&typeof request==='object'&&!Array.isArray(request),'ACCEPTANCE_DECISION_INVALID');
  need(equal(normalizeDecisionWire(wireRequest),request),'ACCEPTANCE_DECISION_TRANSPORT_CHANGED');
  const hash=digest(request),wireDigest=decisionRequestDigest(wireRequest),active=decisionLocks.get(id);if(active){need(active.commandId===request?.commandId&&active.hash===hash&&active.wireDigest===wireDigest,'ACCEPTANCE_DECISION_IN_PROGRESS',409);return active.promise;}
  const promise=(async()=>{try{return await decideInternal(id,request,wireRequest);}catch(error){if(error.code==='ACCEPTANCE_DECISION_STALE'&&load(id).decisionAdmissionProtocol===DECISION_ADMISSION_PROTOCOL){const receipt=decisionRejections.recordStale(id,request,wireRequest);if(receipt)error.rejectionReceipt=receipt;}throw error;}})();decisionLocks.set(id,{commandId:request?.commandId,hash,wireDigest,promise});try{return await promise;}finally{decisionLocks.delete(id);}
 }
 async function queueContributionRevision(id,commandId){
  await contributionSpace(executionRoot);requireInitialized(id);need(!db.prepare('SELECT body FROM acceptance_decision_intents WHERE id=?').all(id).some(r=>{const i=JSON.parse(r.body);return i.state!=='completed'||i.request.commandId!==commandId&&i.continuation?.status==='queueing';}),'ACCEPTANCE_DECISION_RECONCILIATION_REQUIRED',409);need(!contributionLocks.has(id),'LOCAL_CONTRIBUTION_QUEUE_IN_PROGRESS',409);contributionLocks.set(id,true);
  try{
   const row=db.prepare('SELECT body FROM acceptance_decision_intents WHERE id=? AND command_id=?').get(id,commandId);need(row,'LOCAL_CONTRIBUTION_INTENT_REQUIRED',409);const intent=JSON.parse(row.body);need(intent.state==='completed'&&intent.contributionPlan,'LOCAL_CONTRIBUTION_FEEDBACK_NOT_RECORDED',409);
   if(intent.continuation.status==='queueing'){let dead=false;if(intent.continuation.owner.host===hostname())try{process.kill(intent.continuation.owner.pid,0);}catch(e){dead=e.code==='ESRCH';}need(dead,'LOCAL_CONTRIBUTION_QUEUE_WRITER_UNRESOLVED',409);}
   let proof=contributionRevisionQueueProof(intent,projectStore);
   if(proof.status==='not_queued'){
    need(typeof executor.enqueueRevision==='function','LOCAL_CONTRIBUTION_REVISION_EXECUTOR_REQUIRED',409);intent.continuation.status='queueing';intent.continuation.owner={host:hostname(),pid:process.pid};writeDecisionIntent(id,intent);
    try{await executor.enqueueRevision(intent.projectId,proof.request);}catch(e){intent.continuation.status='interrupted';intent.continuation.errorCode=e.code??'LOCAL_CONTRIBUTION_QUEUE_INTERRUPTED';writeDecisionIntent(id,intent);throw e;}
    proof=contributionRevisionQueueProof(intent,projectStore);
   }
   need(proof.status==='revision_queued','LOCAL_CONTRIBUTION_REVISION_NOT_QUEUED',409);intent.continuation.status='revision_queued';intent.continuation.jobId=proof.jobId;intent.continuation.queueProof=proof;
   const m=load(id),decision=m.decisions.find(d=>d.commandId===commandId);need(decision,'LOCAL_CONTRIBUTION_DECISION_REQUIRED',409);decision.contributionContinuation=structuredClone(intent.continuation);decision.contributionDisposition='revision_queued_pending_review';
   db.exec('BEGIN IMMEDIATE');try{save(m);writeDecisionIntent(id,intent);db.prepare('UPDATE acceptance_decisions SET body=? WHERE id=? AND command_id=?').run(JSON.stringify(decision),id,commandId);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return structuredClone(proof);
  }finally{contributionLocks.delete(id);}
 }

 async function advanceContribution(id,commandId){
  need(contributionExecution===true,'LOCAL_CONTRIBUTION_EXECUTION_DISABLED',409);requireInitialized(id);need(!contributionLocks.has(id),'LOCAL_CONTRIBUTION_PHASE_IN_PROGRESS',409);
  const row=db.prepare('SELECT body FROM acceptance_decision_intents WHERE id=? AND command_id=?').get(id,commandId);need(row,'LOCAL_CONTRIBUTION_INTENT_REQUIRED',409);const intent=JSON.parse(row.body);need(intent.state==='completed'&&intent.contributionPlan&&intent.continuation,'LOCAL_CONTRIBUTION_FEEDBACK_NOT_RECORDED',409);contributionLocks.set(id,true);
  const persist=async value=>{const m=load(id),decision=m.decisions.find(d=>d.commandId===commandId);need(decision,'LOCAL_CONTRIBUTION_DECISION_REQUIRED',409);decision.contributionContinuation=structuredClone(value.continuation);decision.contributionDisposition=value.continuation.status==='feedback_review_addressed'?'feedback_addressed_pending_stage_validation':value.continuation.status==='feedback_review_unresolved'?'feedback_unresolved':value.continuation.status;db.exec('BEGIN IMMEDIATE');try{save(m);writeDecisionIntent(id,value);db.prepare('UPDATE acceptance_decisions SET body=? WHERE id=? AND command_id=?').run(JSON.stringify(decision),id,commandId);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}};
  try{need(intent.state==='completed'&&intent.contributionPlan,'LOCAL_CONTRIBUTION_FEEDBACK_NOT_RECORDED',409);await advanceContributionProtocol({intent,store:projectStore,executor,executionRoot,persist});return read(id);}
  catch(e){if(!['LOCAL_CONTRIBUTION_PHASE_WRITER_UNRESOLVED','LOCAL_CONTRIBUTION_REVIEW_STATUS_CHANGED'].includes(e.code)){intent.continuation.phaseTerminal=true;intent.continuation.errorCode=e.code??'LOCAL_CONTRIBUTION_PHASE_INTERRUPTED';await persist(intent);}throw e;}
  finally{contributionLocks.delete(id);}
 }

 function registerReferenceInput(projectId,command,context,sourcePins){
  const record=caseRegistrationForProject(projectId);
  if(load(record.id).referenceAdmissionProtocol!=='durable-reference-admission-v1')return performReferenceInput(projectId,command,context,sourcePins,fn=>fn());
  const lease=referenceContext.getStore(),operation={'register-image':'reference_upload','record-reference-material':'reference_material','remove-reference-material':'reference_withdrawal'}[command.kind];
  need(lease&&lease.caseId===record.id&&lease.projectId===projectId&&lease.commandId===command.commandId&&lease.operation===operation,'LOCAL_REFERENCE_ADMISSION_REQUIRED',409);
  return referenceAdmission.execute(lease,invoke=>performReferenceInput(projectId,command,context,sourcePins,invoke));
 }
 function performReferenceInput(projectId,command,context,sourcePins,invoke){
  need(command.kind==='register-image'&&command.uploadRequest||['record-reference-material','remove-reference-material'].includes(command.kind)&&sourcePins,'LOCAL_UPLOAD_REGISTRATION_REQUIRED',409);
  const record=caseRegistrationForProject(projectId);
  db.exec('BEGIN IMMEDIATE');
  try{
   requireInitialized(record.id);requireNoPendingDecision(record.id);requireNoPendingContribution(record.id);
   need(!advanceRows(record.id).some(row=>['running','interrupted','needs_reconciliation'].includes(JSON.parse(row.body).state)),'LOCAL_UPLOAD_ADVANCE_UNRESOLVED',409);
   if(command.kind==='record-reference-material'){
    const current=projectStore.read(projectId),copy=current.artifacts.find(a=>a.id===command.request.artifactId),image=current.imageAssets.find(a=>a.id===command.request.imageId);
    need(!referenceInputClosure(current,command.request.artifactId).closed,'LOCAL_REFERENCE_INPUT_SEALED',409);
    need(current.revision===command.expectedRevision&&copy?.stage==='copy'&&current.activeByStage.copy===copy.id&&copy.contentHash===sourcePins.copyContentHash&&createHash('sha256').update(command.copyContents).digest('hex')===sourcePins.copyContentHash&&image?.projectId===projectId&&image.sha256===sourcePins.imageSha256,'LOCAL_REFERENCE_MATERIAL_STALE',409);
   }
   if(command.kind==='remove-reference-material')assertReferenceWithdrawalAdmission(projectStore.read(projectId),load(record.id),command,sourcePins);
   need(projectStore.read(projectId).revision===command.expectedRevision,'LOCAL_REFERENCE_REGISTRATION_STALE',409);
   const result=invoke(()=>projectStore.command(projectId,command,context));db.exec('COMMIT');return result;
  }catch(error){if(db.isTransaction)db.exec('ROLLBACK');throw error;}
 }
 let referenceUpload,referenceMaterial,referenceCommands,referenceRemoval;
 function removalService(){referenceRemoval??=createLocalReferenceRemoval({projectStore,readCase:read,readCaseRecord:async id=>load(id),register:({projectId,command,actor,sourcePins})=>registerReferenceInput(projectId,command,actor,sourcePins)});return referenceRemoval;}
 async function withdrawReferenceMaterial(id,request){return referenceRequest(id,request,'reference_withdrawal',snapshot=>removalService().withdraw(id,snapshot));}
 async function readReferenceCommand(id,commandId){
  load(id);const rejected=referenceAdmission.receipt(id,commandId);if(rejected)return rejected;
  need(imageStore&&typeof imageStore.read==='function'&&typeof executionRoot==='string','LOCAL_REFERENCE_RECEIPT_NOT_CONNECTED',501);
  referenceCommands??=createLocalReferenceCommandReader({projectStore,imageStore,readCase:async id=>load(id),executionRoot});
  const project=projectStore.read(load(id).projectId),raw=project.processedCommands[commandId];if(raw&&JSON.parse(raw).kind==='remove-reference-material')return removalService().readReceipt(id,commandId);
  return referenceCommands.read(id,commandId);
 }
 async function uploadReference(id,request){
  need(imageStore&&typeof imageStore.ingest==='function'&&typeof imageStore.read==='function','LOCAL_REFERENCE_UPLOAD_NOT_CONNECTED',501);
  referenceUpload??=createLocalReferenceUpload({imageStore,readCase:read,projectStore:{read:(...args)=>projectStore.read(...args),command:registerReferenceInput}});
  return referenceRequest(id,request,'reference_upload',snapshot=>referenceUpload(id,snapshot));
 }
 async function submitReferenceMaterial(id,request){
  need(imageStore&&typeof imageStore.read==='function'&&typeof executionRoot==='string','LOCAL_REFERENCE_MATERIAL_NOT_CONNECTED',501);
  referenceMaterial??=createLocalReferenceMaterial({projectStore,imageStore,readCase:read,executionRoot,register:({projectId,command,actor,sourcePins})=>registerReferenceInput(projectId,command,actor,sourcePins)});
  return referenceRequest(id,request,'reference_material',snapshot=>referenceMaterial(id,snapshot));
 }
 return {create,read,caseRegistrationForProject,queueContributionRevision,advanceContribution,uploadReference,submitReferenceMaterial,withdrawReferenceMaterial,...(imageStore&&typeof imageStore.read==='function'&&typeof executionRoot==='string'?{readReferenceCommand}:{}),decisionReceipt:(id,commandId)=>{load(id);return decisionRejections.read(id,commandId);},list:async()=>Promise.all(db.prepare('SELECT id FROM acceptance_cases ORDER BY rowid DESC').all().map(r=>read(r.id))),advance,decide,close:()=>db.close()};
}
