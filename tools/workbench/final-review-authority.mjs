import {finalRegisteredContentBasis} from './final-content-contract.mjs';
import {assertValidatedLaunchSettings} from './launch-config.mjs';
import {compileOperationDuties,partitionOperationDuties} from './final-operation-manifest.mjs';
import {assertOperationBasis} from './final-operation-basis.mjs';
import {assertFinalOperationMarkCapability,assertFinalCallAdmission} from './final-operation-host.mjs';
import {assertOperationProof} from './final-operation-original.mjs';
import {validateFinalReviewConfiguration} from './final-review-configuration.mjs';
import {FINAL_LIFECYCLE_COMMANDS,reduceFinalLifecycle,finalReviewEligibility,afterPhaseSettlement} from './final-review-lifecycle.mjs';
import {finalCallRequest,validateFinalCallOriginal} from './final-review-call.mjs';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual as equal} from 'node:util';
import {LAYOUT_PURPOSE,LAYOUT_STYLES,layoutHash} from './layout-boundary.mjs';
import {validateFinalAssignments} from './final-review-assignments.mjs';

const ROLES=['content','visual','brand','user','communication'];
const OWNERS=['layoutProducer','finalConsumer','finalProducer','deliveryConsumer'];
export const FINAL_AUTHORITY_COMMANDS=Object.freeze(['retain-final-operation-capture','bind-final-operation-authorization','mark-final-operation-dispatched','settle-final-operation-observation','reconcile-final-operation-observation','set-final-review-authority','reserve-final-review-plan','release-final-review-reservation','mark-final-review-dispatched','settle-final-review-call',...FINAL_LIFECYCLE_COMMANDS]);
const text=v=>typeof v==='string'&&v.trim().length>0;
const digest=v=>createHash('sha256').update(JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x)).digest('hex');
const sha=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
const need=(v,code,message)=>{if(!v)throw Object.assign(Error(message),{code});};
const keys=(value,names)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...names].sort().join(',');
const bounded=value=>{let bytes;try{bytes=Buffer.byteLength(JSON.stringify(value));}catch{need(false,'FINAL_INVALID_DATA','Serializable final metadata required');}need(bytes<=4*1024**2,'FINAL_METADATA_LIMIT','Final metadata exceeds its bounded record size');};
const flags={executionAvailable:false,finalAuthorityAvailable:false,deliveryAvailable:false};

export function finalReviewOriginalMetadataBasis(p,layoutRootJobId) {
  const root=p.jobs.find(j=>j.id===layoutRootJobId&&j.purpose===LAYOUT_PURPOSE&&j.task.binding);
  need(root&&p.jobs.filter(j=>j.id===layoutRootJobId).length===1,'FINAL_LAYOUT_REQUIRED','Registered original layout root required');
  const b=root.task.binding,content=p.artifacts.find(a=>a.id===b.contentArtifactId),source=p.jobs.find(j=>j.id===b.contentRootJobId);
  need(layoutHash(b)===root.task.bindingHash&&b.projectId===p.id&&p.taskCards.some(t=>t.id===b.taskCardId)&&p.policies.some(policy=>equal(policy,b.policy)),'FINAL_STALE_BASIS','Task, policy and exact layout binding must remain current');
  need(content&&p.artifacts.filter(a=>a.id===content.id).length===1&&p.jobs.filter(j=>j.id===source?.id).length===1&&content.contentHash===b.contentHash&&content.completeContent?.rootJobId===source?.id&&source?.purpose==='complete_content_plan','FINAL_CONTENT_REQUIRED','Current registered exact content required');
  const numericContent=finalRegisteredContentBasis(p,root,content,source);
  need(source.task.source.sourceHash===b.sourceHash&&source.task.source.visibility.projectionHash===b.projectionHash&&content.completeContent.manuscriptHash===b.manuscriptHash,'FINAL_STALE_BASIS','Exact content and source identities required');
  need(p.releases.some(r=>r.artifactId===content.id&&r.sourceHash===b.sourceHash&&r.policyVersion===b.policy.version),'FINAL_CONTENT_RELEASE_REQUIRED','Current released content required');
  const editions=LAYOUT_STYLES.map(style=>{
    const jobs=p.jobs.filter(j=>j.purpose===LAYOUT_PURPOSE&&j.task.bindingHash===root.task.bindingHash&&j.task.style===style);
    need(jobs.length===1,'FINAL_LAYOUT_REQUIRED','One original edition for each style required');
    const j=jobs[0],a=j.attempts?.[0];
    need(j.status==='succeeded'&&j.attempts.length===1&&a.status==='succeeded'&&equal(j.receipt,a.receipt)&&j.receipt.attemptId===a.id&&j.receipt.bindingHash===root.task.bindingHash&&j.receipt.style===style&&sha(j.receipt.anchorHash),'FINAL_LAYOUT_REQUIRED','Exact completed edition receipt required');
    return {style,jobId:j.id,attemptId:a.id,receiptHash:layoutHash(j.receipt)};
  });
  return {protocol:'final-review-metadata-basis-v1',projectId:p.id,taskCardId:b.taskCardId,policyHash:digest(b.policy),contentArtifactId:content.id,contentRootJobId:source.id,contentHash:b.contentHash,manuscriptHash:b.manuscriptHash,sourceHash:b.sourceHash,projectionHash:b.projectionHash,layoutRootJobId:root.id,bindingHash:root.task.bindingHash,editions,...(numericContent?{numericContent}: {})};
}

export function finalReviewMetadataBasis(p,layoutRootJobId) {
  const basis=finalReviewOriginalMetadataBasis(p,layoutRootJobId);
  const latest=p.jobs.filter(j=>j.purpose===LAYOUT_PURPOSE&&j.task.binding).at(-1);
  need(latest?.id===layoutRootJobId&&basis.taskCardId===p.activeTaskCardId&&basis.policyHash===digest(p.policies.at(-1))&&basis.contentArtifactId===p.activeByStage.content_review,'FINAL_STALE_BASIS','Latest selected task, policy, content and layout required');
  return basis;
}

export function finalReviewCallAccounting(p,{ownReservationId=null}={}) {
  const originals=[],seen=new Map(),unknown=[];
  for(const job of p.jobs)for(const a of job.attempts??[]) {
    if(job.purpose===LAYOUT_PURPOSE)continue;
    if(!job.binding?.providerId||!job.binding?.model){unknown.push({jobId:job.id,attemptId:a.id,reason:'provider_identity_missing'});originals.push({family:job.purpose??'stage',jobId:job.id,attemptId:a.id,chargedCalls:1,status:a.status});continue;}
    const dispatched=a.dispatchStarted===true,receipt=a.receipt;
    const operationSettled=job.purpose==='final_operation_observation'&&dispatched&&job.observationResult?.protocol==='verified-operation-original-v1'&&job.observationResult.attemptId===a.id&&job.observationResult.authorizationId===job.task.authorizationId&&receipt?.originalReceiptHash===job.observationResult.originalReceiptHash&&receipt?.providerId===job.binding.providerId&&receipt?.model===job.binding.model&&['succeeded','failed'].includes(a.status)&&a.status===job.observationResult.outcome;
    const provedSuccess=job.purpose!=='final_operation_observation'&&a.status==='succeeded'&&receipt&&receipt.providerId===job.binding.providerId&&receipt.model===job.binding.model;
    const provedUndispatched=a.dispatchStarted===false&&!receipt;
    const chargedCalls=provedUndispatched?0:1;
    const provedFailure=job.purpose==='final_review_call'&&dispatched&&a.status==='failed'&&receipt?.terminalFailure===true&&job.finalCallFailure&&receipt.originalReceiptHash===job.finalCallFailure.receiptHash&&receipt.providerId===job.binding.providerId&&receipt.model===job.binding.model;
    const settled=operationSettled||provedFailure||provedSuccess&&(a.dispatchStarted===undefined||dispatched)||provedUndispatched;
    const row={family:job.purpose??'stage',jobId:job.id,attemptId:a.id,providerId:job.binding.providerId,model:job.binding.model,chargedCalls,status:a.status,dispatchStarted:a.dispatchStarted??null,receiptHash:receipt?digest(receipt):null,attemptHash:digest(a)};
    if(seen.has(a.id)) {
      const prior=seen.get(a.id),imagePair=[prior.family,row.family].every(x=>['image_candidate','final_visual_image'].includes(x));
      need(imagePair&&equal({...prior,jobId:null,family:null},{...row,jobId:null,family:null}),'FINAL_ATTEMPT_COLLISION','Only the same shared original image attempt may be deduplicated');
      continue;
    }
    need(text(a.id),'FINAL_ATTEMPT_ID_REQUIRED','Every original attempt needs an identity');
    seen.set(a.id,row);originals.push(row);
    if(!settled)unknown.push({jobId:job.id,attemptId:a.id,reason:'dispatch_or_outcome_unresolved'});
  }
  let reservedOtherCalls=0,ownHeldCalls=0;
  for(const r of p.finalReviewReservations??[])if(r.status!=='released') {
    const held=r.calls.filter(c=>c.status==='held').length;
    if(r.id===ownReservationId)ownHeldCalls+=held;else reservedOtherCalls+=held;
  }
  return {consumedCalls:originals.reduce((n,a)=>n+a.chargedCalls,0),reservedOtherCalls,ownHeldCalls,originals,unknown};
}

function currentSetup(p,id) {
  const setup=(p.finalReviewSetups??[]).find(s=>s.id===id);
  need(setup&&(p.finalReviewSetups??[]).at(-1)===setup,'FINAL_SETUP_REQUIRED','Latest immutable final setup required');
  need(equal(setup.basis,finalReviewMetadataBasis(p,setup.basis.layoutRootJobId)),'FINAL_STALE_BASIS','Final setup has stale task, source or layout metadata');
  return setup;
}

function validateProposal(p,a) {
  need(keys(a,['protocol','basedOnRevision','basis','materials','roleMaterialScopes','owners','configuration','allowance']),'FINAL_INVALID_SETUP','Exact final authority fields required');
  bounded(a);
  need(a.protocol==='final-review-authority-v1'&&a.basedOnRevision===p.revision,'FINAL_STALE_BASIS','Setup provenance must identify the observed revision');
  need(equal(a.basis,finalReviewMetadataBasis(p,a.basis?.layoutRootJobId)),'FINAL_STALE_BASIS','Exact current metadata basis required');
  need(Array.isArray(a.materials)&&a.materials.length>0&&a.materials.every(m=>keys(m,['identity','correspondenceHash'])&&text(m.identity)&&sha(m.correspondenceHash))&&new Set(a.materials.map(m=>m.identity)).size===a.materials.length,'FINAL_INVALID_MATERIALS','Unique bounded material correspondence identities required');
  need(keys(a.owners,OWNERS)&&OWNERS.every(k=>keys(a.owners[k],['actorIdentity','assignmentIdentity','providerIdentity','modelIdentity'])&&Object.values(a.owners[k]).every(text)),'FINAL_INVALID_OWNERS','Four explicit model-independent owner assignments required');
  for(const [producer,consumer] of [['layoutProducer','finalConsumer'],['finalProducer','deliveryConsumer']])need(a.owners[producer].actorIdentity!==a.owners[consumer].actorIdentity,'FINAL_OWNER_SELF_ACCEPTANCE','A producer cannot accept its own handoff');
  const validation=validateFinalAssignments(a.configuration,a.owners);
  need(validation.kind==='valid','FINAL_INVALID_ASSIGNMENTS',JSON.stringify(validation.issues));
  const creators=new Set([p.artifacts.find(x=>x.id===a.basis.contentArtifactId)?.author?.actorId,p.artifacts.find(x=>x.id===p.activeByStage.visual)?.author?.actorId].filter(Boolean));
  for(const seat of validation.seatMap.values())need(!creators.has(seat.actorIdentity),'FINAL_CREATOR_SELF_REVIEW','Known source creators cannot occupy independent seats');
  need(Array.isArray(a.roleMaterialScopes)&&a.roleMaterialScopes.length===ROLES.length&&new Set(a.roleMaterialScopes.map(s=>s.role)).size===ROLES.length,'FINAL_INVALID_SCOPES','Five distinct material duty maps required');
  const materialIds=a.materials.map(m=>m.identity).sort();
  for(const s of a.roleMaterialScopes) {
    const cells=s.applicability?.value;
    need(ROLES.includes(s.role)&&s.applicability?.state==='present'&&Array.isArray(cells)&&equal(cells.map(c=>c.materialIdentity).sort(),materialIds),'FINAL_INVALID_SCOPES','Each role must address every declared material exactly once');
    for(const cell of cells)need(cell.decision?.state==='present'&&typeof cell.decision.value?.required==='boolean'&&Array.isArray(cell.decision.value.evidence)&&cell.decision.value.evidence.length>0&&cell.decision.value.evidence.every(e=>e&&typeof e==='object'&&text(e.domain))&&text(cell.reason),'FINAL_SCOPE_EVIDENCE_REQUIRED','Every material decision requires evidence and a reason');
  }
  need(keys(a.allowance,['authorityIdentity','totalCalls','provenance'])&&text(a.allowance.authorityIdentity)&&text(a.allowance.provenance)&&Number.isSafeInteger(a.allowance.totalCalls)&&a.allowance.totalCalls>=0,'FINAL_ALLOWANCE_REQUIRED','Explicit cumulative local allowance required');
  return validation;
}

export function compactFinalReviewPlan(plan) {
  need(plan?.protocol==='final-review-plan-v2'&&sha(plan.id)&&sha(plan.inputId)&&Array.isArray(plan.calls),'FINAL_PLAN_REQUIRED','Accepted planner output required');
  const {id,...body}=plan;
  need(id===digest(body),'FINAL_PLAN_CHANGED','Original planner body identity changed');
  return {planId:id,inputId:plan.inputId,Krole:structuredClone(plan.Krole),localGates:structuredClone(plan.localGates),calls:plan.calls.map(c=>({id:c.id,phase:c.phase,role:c.role,dependencies:structuredClone(c.dependencies),contextIdentity:c.contextIdentity,assignment:structuredClone(c.assignment)}))};
}

function expectedSeat(setup,call,validated) {
  let seat;
  if(call.id.startsWith('owner:')) {
    const key=call.id.slice(6);need(OWNERS.includes(key),'FINAL_INVALID_CALL','Unknown final owner call');
    const profile=validated.profileMap.get(setup.configuration.assignmentPolicy.ownerProfiles[key]);
    return {...setup.owners[key],profileIdentity:profile.identity};
  }
  if(call.id==='director')seat=validated.seatMap.get('director');
  else {
    const phases={primary:'primary',blind:'blind',primary_synthesis:'primarySynthesis',blind_synthesis:'blindSynthesis',paired_challenge:'challenge'};
    need(ROLES.includes(call.role)&&phases[call.phase],'FINAL_INVALID_CALL','Explicit specialist role and phase required');
    seat=validated.seatMap.get(`${call.role}:${phases[call.phase]}`);
  }
  const profile=validated.profileMap.get(seat.profileIdentity);
  return {...seat,providerIdentity:profile.providerIdentity,modelIdentity:profile.modelIdentity};
}

export function finalReviewAllowance(p) {
  const setup=(p.finalReviewSetups??[]).at(-1),authorization=(p.finalOperationAuthorizations??[]).at(-1);
  if(setup&&authorization)need(equal(setup.allowance,authorization.allowance),'FINAL_ALLOWANCE_LINEAGE','Setup and operation authority must retain one allowance lineage');
  return setup?.allowance??authorization?.allowance??null;
}

export function enforceFinalCallCeiling(p) {
  const allowance=finalReviewAllowance(p);
  if(!allowance)return;
  const accounting=finalReviewCallAccounting(p);
  need(accounting.consumedCalls+accounting.reservedOtherCalls<=allowance.totalCalls,'FINAL_CUMULATIVE_ALLOWANCE','All original dispatched calls and held final slots share the configured ceiling');
}

function operationAuthority(p,context) {
  const runtime=context.finalOperation,launch=runtime?.launchConfiguration,manifest=runtime?.manifest;
  need(launch?.mode==='configured'&&launch.identity?.schemaVersion==='workbench-launch-v1'&&sha(launch.identity.sha256),'FINAL_OPERATION_CONFIGURATION_REQUIRED','Current validated launch configuration required');
  const configuration=launch.moduleConfigs?.finalReview;
  need(configuration,'FINAL_OPERATION_CONFIGURATION_REQUIRED','Final review module configuration required');
  validateFinalReviewConfiguration(configuration);
  const basis=assertOperationBasis(runtime.basis);
  need(keys(manifest,['protocol','captureIdentity','dutyRoot','totalDuties','sequence','total','requirements'])&&manifest.protocol==='final-operation-manifest-v2'&&manifest.captureIdentity===basis.identity&&sha(manifest.dutyRoot)&&Number.isSafeInteger(manifest.totalDuties)&&manifest.totalDuties>0&&Number.isSafeInteger(manifest.sequence)&&Number.isSafeInteger(manifest.total)&&manifest.sequence>=1&&manifest.sequence<=manifest.total&&Array.isArray(manifest.requirements)&&manifest.requirements.length>0&&manifest.requirements.length<=128,'FINAL_OPERATION_MANIFEST_REQUIRED','Finite controlled operation manifest required');
  bounded(manifest);
  const batches=partitionOperationDuties(compileOperationDuties(basis,launch),{captureIdentity:basis.identity});
  need(equal(batches[manifest.sequence-1]?.manifest,manifest),'FINAL_OPERATION_BATCH_CHANGED','Exact complete actual-plan duty partition required');
  const ids=new Set();
  for(const r of manifest.requirements) {
    need(keys(r,['identity','providerId','model','adapterProtocol','adapterSourceIdentity','operationEnvelopeIdentity'])&&Object.values(r).every(text)&&sha(r.identity)&&sha(r.adapterSourceIdentity)&&sha(r.operationEnvelopeIdentity)&&!ids.has(r.identity),'FINAL_OPERATION_MANIFEST_REQUIRED','Exact unique requirement identities required');
    ids.add(r.identity);
    const provider=launch.textProviders?.[r.providerId];
    need(provider?.adapter==='codex-cli'&&provider.model===r.model&&configuration.configuration.assignmentPolicy.profiles.some(x=>x.providerIdentity===r.providerId&&x.modelIdentity===r.model),'FINAL_OPERATION_PROVIDER_CHANGED','Manifest must use selected provider and requested model');
  }
  const policy=p.policies.at(-1);
  need(policy?.authorizedThrough==='final_review'&&p.taskCards.some(t=>t.id===p.activeTaskCardId)&&p.confirmations.some(c=>c.taskCardId===p.activeTaskCardId),'FINAL_OPERATION_NOT_AUTHORIZED','Confirmed current task and final review policy required');
  return {protocol:'final-operation-authorization-v1',projectId:p.id,taskCardId:p.activeTaskCardId,policyHash:digest(policy),launchConfigurationIdentity:digest({identity:launch.identity,configuration,providers:launch.textProviders}),providerConfigurationIdentity:digest(launch.textProviders),observationManifestIdentity:digest(manifest),captureIdentity:basis.identity,dutyRoot:manifest.dutyRoot,totalDuties:manifest.totalDuties,batchSequence:manifest.sequence,batchTotal:manifest.total,totalGraphCalls:basis.planning.plan.calls.length,requirements:structuredClone(manifest.requirements),allowance:structuredClone(configuration.allowance)};
}

function reduceOperation(p,c,context) {
  if(c.kind==='retain-final-operation-capture'){
    const basis=assertOperationBasis(context.finalOperationCapture);
    need(basis.projectId===p.id&&basis.originalRevision===p.revision&&equal(c.capture,basis.record),'FINAL_OPERATION_CAPTURE_CHANGED','Exact current reader-owned managed capture required');
    bounded(c.capture);p.finalOperationCaptures??=[];need(!p.finalOperationCaptures.some(r=>r.identity===basis.identity),'FINAL_OPERATION_CAPTURE_ALREADY_RETAINED','Capture cannot be reactivated');p.finalOperationCaptures.push(structuredClone(c.capture));return;
  }
  if(['settle-final-operation-observation','reconcile-final-operation-observation'].includes(c.kind)){
    const job=p.jobs.find(j=>j.id===c.jobId&&j.purpose==='final_operation_observation'),proof=context.finalOperationProof;
    need(job&&job.task.authorizationId===c.authorizationId&&job.attempts.length===1&&job.attempts[0].id===c.attemptId,'FINAL_OPERATION_ATTEMPT_REQUIRED','Exact registered original attempt required');
    assertOperationProof(proof,{projectId:p.id,jobId:job.id,attemptId:c.attemptId,authorizationId:c.authorizationId});
    need(job.status==='awaiting_reconciliation','FINAL_OPERATION_ALREADY_SETTLED','Observation terminal cannot be replaced');
    const receipt={providerId:job.binding.providerId,model:job.binding.model,reportedModel:proof.reportedModel,originalReceiptHash:proof.originalReceiptHash};
    job.status=proof.outcome;job.observationResult=structuredClone(proof);job.receipt=receipt;Object.assign(job.attempts[0],{status:proof.outcome,receipt:structuredClone(receipt)});return;
  }
  const body=operationAuthority(p,context),id=`final-operation-authority-${digest(body)}`;
  const authorizations=p.finalOperationAuthorizations??[];
  if(c.kind==='bind-final-operation-authorization') {
    need(c.authorizationIdentity===id,'FINAL_OPERATION_AUTHORITY_CHANGED','Command must bind exact trusted current authority');
    const prior=authorizations.at(-1),setup=(p.finalReviewSetups??[]).at(-1);
    if(prior?.id===id)return;
    need(p.finalOperationCaptures?.at(-1)?.identity===body.captureIdentity,'FINAL_OPERATION_CAPTURE_REQUIRED','Current retained capture required');
    if(body.batchSequence>1){
      need(prior?.captureIdentity===body.captureIdentity&&prior.dutyRoot===body.dutyRoot&&prior.batchSequence===body.batchSequence-1&&prior.batchTotal===body.batchTotal,'FINAL_OPERATION_BATCH_ORDER','Only next immutable batch may bind');
      need(prior.requirements.every(r=>p.jobs.some(j=>j.purpose==='final_operation_observation'&&j.task.authorizationId===prior.id&&j.task.requirementIdentity===r.identity&&['succeeded','failed'].includes(j.status))),'FINAL_OPERATION_PRIOR_BATCH_UNSETTLED','Every previous batch requirement must be terminal');
    }else need(!authorizations.some(a=>a.captureIdentity===body.captureIdentity),'FINAL_OPERATION_BATCH_ORDER','A capture starts only once');
    need(!authorizations.some(a=>a.id===id),'FINAL_OPERATION_AUTHORITY_CHANGED','Historical authority cannot silently become current again');
    if(setup)need(equal(setup.allowance,body.allowance),'FINAL_ALLOWANCE_LINEAGE','Existing setup requires exact allowance migration');
    if(prior)need(prior.allowance.authorityIdentity===body.allowance.authorityIdentity&&prior.allowance.provenance===body.allowance.provenance,'FINAL_ALLOWANCE_LINEAGE','Changed configuration must retain cumulative allowance provenance');
    const accounting=finalReviewCallAccounting(p);
    need(accounting.unknown.length===0,'FINAL_UNKNOWN_BLOCKS','An unknown original cannot be bypassed by binding another authority');
    const alreadyCharged=p.jobs.filter(j=>j.purpose==='final_operation_observation'&&authorizations.some(a=>a.id===j.task.authorizationId&&a.captureIdentity===body.captureIdentity)).length;
    const futureControls=body.totalDuties-alreadyCharged;
    need(accounting.consumedCalls+accounting.reservedOtherCalls+futureControls+Math.max(0,body.totalGraphCalls-p.jobs.filter(j=>j.purpose==='final_review_call'&&(p.finalReviewReservations??[]).some(r=>r.id===j.task.reservationId&&r.operationCaptureIdentity===body.captureIdentity)).length-(p.finalReviewReservations??[]).filter(r=>r.operationCaptureIdentity===body.captureIdentity&&r.status!=='released').reduce((n,r)=>n+r.calls.filter(c=>c.status==='held').length,0))<=body.allowance.totalCalls,'FINAL_CUMULATIVE_ALLOWANCE','New authority cannot lower allowance below consumed and held calls');
    p.finalOperationAuthorizations??=[];
    p.finalOperationAuthorizations.push({...body,id,createdBy:{actorType:context.actorType,actorId:context.actorId,runId:context.runId,contextId:context.contextId,now:context.now}});
    return;
  }
  const authority=authorizations.at(-1);
  need(authority?.id===id&&c.authorizationId===id&&equal(Object.fromEntries(Object.entries(authority).filter(([k])=>!['id','createdBy'].includes(k))),body),'FINAL_OPERATION_AUTHORITY_CHANGED','Exact current immutable operation authority required');
  if(c.kind!=='mark-final-operation-dispatched') {
    const job=p.jobs.find(j=>j.id===c.jobId&&j.purpose==='final_operation_observation');
    need(job&&job.task.authorizationId===id&&job.attempts.length===1&&job.attempts[0].id===c.attemptId,'FINAL_OPERATION_ATTEMPT_REQUIRED','Original charged observation required');
    need(false,'FINAL_OPERATION_COMMAND_INVALID','Fixed production host registration, original terminal validator and manifest semantic oracle are required; observation remains charged and unknown');
  }
  const requirement=authority.requirements.find(r=>r.identity===c.requirementIdentity);
  need(requirement,'FINAL_OPERATION_REQUIREMENT_REQUIRED','Admitted finite requirement required');
  need(text(c.jobId)&&text(c.attemptId)&&context.runId===c.attemptId,'FINAL_OPERATION_ATTEMPT_REQUIRED','Exact executor run and original identities required');
  need(!p.jobs.some(j=>j.id===c.jobId||(j.attempts??[]).some(a=>a.id===c.attemptId)),'FINAL_ATTEMPT_COLLISION','Original job and attempt identities cannot collide');
  need(!p.jobs.some(j=>j.purpose==='final_operation_observation'&&j.task.authorizationId===id&&j.task.requirementIdentity===requirement.identity),'FINAL_OPERATION_ALREADY_DISPATCHED','Requirement already has its one original execution intention');
  need(!p.jobs.some(j=>(j.attempts??[]).some(a=>a.executor?.contextId===context.contextId)),'FINAL_CONTEXT_REUSED','Observation requires a fresh executor context');
  const request=c.requestBasis;
  need(keys(request,['protocol','authorizationId','requirementIdentity','independentContextIdentity','originals'])&&request.protocol==='final-operation-request-basis-v1'&&request.authorizationId===id&&request.requirementIdentity===requirement.identity&&request.independentContextIdentity===context.contextId,'FINAL_OPERATION_BASIS_CHANGED','Exact authorization, requirement and independent context required');
  need(Array.isArray(request.originals)&&request.originals.length>0&&request.originals.length<=128&&request.originals.every(o=>keys(o,['name','sha256','bytes'])&&text(o.name)&&sha(o.sha256)&&Number.isSafeInteger(o.bytes)&&o.bytes>=0&&o.bytes<=32*1024**2)&&new Set(request.originals.map(o=>o.name)).size===request.originals.length,'FINAL_OPERATION_ORIGINALS_REQUIRED','Bounded original descriptors required before charge');
  bounded(request);
  const accounting=finalReviewCallAccounting(p),allowance=finalReviewAllowance(p);
  need(accounting.unknown.length===0,'FINAL_UNKNOWN_BLOCKS','Reconcile every unknown before another observation');
  need(allowance&&accounting.consumedCalls+accounting.reservedOtherCalls+1<=allowance.totalCalls,'FINAL_CUMULATIVE_ALLOWANCE','Observation and graph holds share the original cumulative allowance');
  assertFinalOperationMarkCapability(context.finalOperationMark,{projectId:p.id,authorizationId:id,requirementIdentity:requirement.identity,jobId:c.jobId,attemptId:c.attemptId,requestBasis:request});
  p.jobs.push({id:c.jobId,stage:'final_review',purpose:'final_operation_observation',status:'awaiting_reconciliation',binding:{providerId:requirement.providerId,model:requirement.model,role:'operation_observation'},task:{authorizationId:id,requirementIdentity:requirement.identity,requestBasis:structuredClone(request)},inputVersionIds:[],outputVersionIds:[],attempts:[{id:c.attemptId,status:'awaiting_reconciliation',dispatchStarted:true,executor:{actorType:context.actorType,actorId:context.actorId,runId:context.runId,contextId:context.contextId,now:context.now}}],observationResult:null});
}

export function finalOperationAuthorizationIdentity(p,context) {
  return `final-operation-authority-${digest(operationAuthority(p,context))}`;
}

export function reduceFinalAuthority(p,c,context) {
  need(context.actorType==='agent'||['adopt-final-review','return-final-review'].includes(c.kind)&&context.actorType==='human','FINAL_TRUSTED_RUNTIME_REQUIRED','Trusted final runtime context required');
  if(['retain-final-operation-capture','bind-final-operation-authorization','mark-final-operation-dispatched','settle-final-operation-observation','reconcile-final-operation-observation'].includes(c.kind))return reduceOperation(p,c,context);
  if(c.kind==='set-final-review-authority') {
    const operation=(p.finalOperationAuthorizations??[]).at(-1);
    if(operation)need(p.finalOperationAuthorizations.every(a=>equal(a.allowance,c.authority?.allowance)),'FINAL_ALLOWANCE_LINEAGE','Setup must retain exact original operation allowance across all epochs');
    const prior=p.finalReviewSetups?.at(-1);
    if(prior)need(equal(prior.allowance,c.authority?.allowance),'FINAL_ALLOWANCE_LINEAGE','Unpaid setup cannot reset or increase the original allowance');
    const accounting=finalReviewCallAccounting(p);
    need(!accounting.unknown.length,'FINAL_UNKNOWN_BLOCKS','Unknown original charges block preparation');
    need(accounting.consumedCalls+accounting.reservedOtherCalls+accounting.ownHeldCalls<=c.authority?.allowance?.totalCalls,'FINAL_CUMULATIVE_ALLOWANCE','Setup retains all consumed and held calls');
    if(context.finalPreparationLaunch){
      assertValidatedLaunchSettings(context.finalPreparationLaunch);
      const runtime=context.finalPreparationLaunch.moduleConfigs?.finalReview;
      validateFinalReviewConfiguration(runtime);
      need(equal(runtime.configuration,c.authority?.configuration)&&equal(runtime.owners,c.authority?.owners)&&equal(runtime.allowance,c.authority?.allowance),'FINAL_PREPARATION_CONFIGURATION_CHANGED','Exact validated current launch inputs required');
    }
    validateProposal(p,c.authority);
    const body=structuredClone(c.authority),id=`final-setup-${digest(body)}`;
    p.finalReviewSetups??=[];
    if(!p.finalReviewSetups.some(s=>s.id===id))p.finalReviewSetups.push({...body,id,createdBy:Object.fromEntries(['actorType','actorId','runId','contextId','now'].filter(k=>context[k]!==undefined).map(k=>[k,structuredClone(context[k])])),validationLevel:'project_metadata_only',...flags});
    return;
  }
  p.finalReviewReservations??=[];
  if(c.kind==='release-final-review-reservation') {
    const reservation=p.finalReviewReservations.find(r=>r.id===c.reservationId&&r.setupId===c.setupId);
    need(reservation&&reservation.status!=='released','FINAL_RESERVATION_REQUIRED','Original held reservation required');
    need(reservation.calls.every(call=>call.status==='held'),'FINAL_UNKNOWN_BLOCKS','Dispatched or unknown slots cannot be released');
    reservation.status='released';reservation.release={by:structuredClone(context),reason:c.reason??null};return;
  }
  const setup=c.kind==='resolve-final-review-return'?(p.finalReviewSetups??[]).find(s=>s.id===c.setupId):currentSetup(p,c.setupId);
  need(setup,'FINAL_SETUP_REQUIRED','Immutable final setup required');
  if(c.kind==='resolve-final-review-return')need(equal(setup.basis,finalReviewOriginalMetadataBasis(p,setup.basis.layoutRootJobId)),'FINAL_STALE_BASIS','Historical setup must retain its original metadata');
  if(c.kind==='reserve-final-review-plan') {
    const plan=c.plan;bounded(plan);
    need(keys(plan,['planId','inputId','Krole','calls','localGates'])&&sha(plan.planId)&&sha(plan.inputId)&&keys(plan.Krole,ROLES)&&ROLES.every(r=>Number.isSafeInteger(plan.Krole[r])&&plan.Krole[r]>0&&plan.Krole[r]<=512),'FINAL_PLAN_REQUIRED','Compact original plan identity and per-role packet counts required');
    const topology=[{id:'owner:layoutProducer',phase:'owner_before',role:null,dependencies:[]},{id:'owner:finalConsumer',phase:'owner_before',role:null,dependencies:['owner:layoutProducer']}];
    const before=topology.map(x=>x.id);
    for(const role of ROLES) {
      const reads=[],syntheses=[];
      for(const phase of ['primary','blind']) {
        const ids=Array.from({length:plan.Krole[role]},(_,i)=>`${role}:${phase}:${i}`);
        for(const id of ids)topology.push({id,phase,role,dependencies:before});
        reads.push(...ids);const id=`${role}:${phase}:synthesis`;syntheses.push(id);topology.push({id,phase:`${phase}_synthesis`,role,dependencies:ids});
      }
      topology.push({id:`${role}:challenge`,phase:'paired_challenge',role,dependencies:[...reads,...syntheses]});
    }
    const specialistIds=topology.filter(x=>x.role!==null).map(x=>x.id);
    topology.push({id:'director',phase:'director',role:null,dependencies:specialistIds});
    const selected=p.policies.at(-1).humanGates.includes('final_review');
    need(Array.isArray(plan.localGates)&&plan.localGates.length===(selected?1:0),'FINAL_HUMAN_GATE_CHANGED','Selected final gate must remain in the original graph');
    if(selected){const gate=plan.localGates[0];need(gate.id==='human:final_review'&&gate.phase==='human_wait'&&equal(gate.dependencies,['director'])&&gate.inputId===plan.inputId&&gate.providerCalls===0&&text(gate.policyIdentity),'FINAL_HUMAN_GATE_CHANGED','Original selected zero-call gate required');}
    const after=['director',...specialistIds,...(selected?['human:final_review']:[])];
    topology.push({id:'owner:finalProducer',phase:'owner_after',role:null,dependencies:after},{id:'owner:deliveryConsumer',phase:'owner_after',role:null,dependencies:[...after,'owner:finalProducer']});
    need(Array.isArray(plan.calls)&&equal(plan.calls.map(({id,phase,role,dependencies})=>({id,phase,role,dependencies})),topology)&&plan.calls.length===2*Object.values(plan.Krole).reduce((n,k)=>n+k,0)+20,'FINAL_PLAN_COUNT','Full original final graph required, including ten syntheses and four owner calls');
    const validated=validateFinalAssignments(setup.configuration,setup.owners);
    for(const call of plan.calls) {
      const assignment=expectedSeat(setup,call,validated),profile=validated.profileMap.get(assignment.profileIdentity);
      need(equal(call.assignment,assignment)&&call.contextIdentity===digest({inputId:plan.inputId,assignment,profile,id:call.id}),'FINAL_CALL_ASSIGNMENT_CHANGED','Every exact call must retain its own profile and context identity');
    }
    need(!(p.finalReviewReservations??[]).some(r=>r.planId===plan.planId&&r.status!=='released'),'FINAL_PLAN_ALREADY_RESERVED','An existing original plan hold cannot be duplicated');
    const accounting=finalReviewCallAccounting(p);
    need(accounting.unknown.length===0,'FINAL_UNKNOWN_BLOCKS','Unknown original dispatches cannot be bypassed by reserving a new graph');
    need(accounting.consumedCalls+accounting.reservedOtherCalls+plan.calls.length<=setup.allowance.totalCalls,'FINAL_CUMULATIVE_ALLOWANCE','Prospective graph exceeds cumulative allowance');
    const capture=p.finalOperationCaptures?.at(-1);
    const id=`final-reservation-${digest({setupId:setup.id,planId:plan.planId,commandId:c.commandId})}`;
    p.finalReviewReservations.push({id,setupId:setup.id,planId:plan.planId,inputId:plan.inputId,Krole:structuredClone(plan.Krole),localGates:structuredClone(plan.localGates),calls:plan.calls.map(call=>({...structuredClone(call),status:'held'})),status:'held',basedOnRevision:capture?.inputId===plan.inputId?capture.originalRevision:p.revision,operationCaptureIdentity:capture?.inputId===plan.inputId?capture.identity:null,createdBy:structuredClone(context),...flags});
    return;
  }
  const reservation=p.finalReviewReservations.find(r=>r.id===c.reservationId&&r.setupId===setup.id);
  need(reservation&&reservation.status!=='released','FINAL_RESERVATION_REQUIRED','Original held reservation required');
  if(FINAL_LIFECYCLE_COMMANDS.includes(c.kind))return reduceFinalLifecycle(p,c,context,setup,reservation);
  if(c.kind==='settle-final-review-call') {
    const call=reservation.calls.find(x=>x.id===c.callId),job=p.jobs.find(j=>j.purpose==='final_review_call'&&j.task.reservationId===reservation.id&&j.task.id===c.callId),attempt=job?.attempts[0];
    need(call&&job&&attempt?.id===c.attemptId&&call.attemptId===c.attemptId&&['charged','succeeded'].includes(call.status),'FINAL_CALL_REQUIRED','Original charged call required');
    need(context.actorId===call.assignment.actorIdentity&&context.runId===attempt.id&&['actorType','actorId','runId','contextId'].every(k=>context[k]===attempt.executor[k]),'FINAL_WRONG_EXECUTOR','Original assigned executor required');
    const result=validateFinalCallOriginal(p,job,c.originals);
    if(job.finalCallResult){need(equal(job.finalCallResult,result),'FINAL_RESULT_CONFLICT','Immutable result conflicts with completion');return;}
    need(call.status==='charged'&&job.status==='awaiting_reconciliation'&&attempt.status==='awaiting_reconciliation','FINAL_CALL_REQUIRED','Unresolved original attempt required');
    job.finalCallResult=result;job.status='succeeded';attempt.status='succeeded';job.receipt=structuredClone(result.receipt);attempt.receipt=structuredClone(result.receipt);
    call.status='succeeded';call.semanticOutcome=result.semanticOutcome;call.resultId=result.id;if(result.protocol==='final-call-settlement-v2')afterPhaseSettlement(p,reservation,result);return;
  }
  need(c.kind==='mark-final-review-dispatched','FINAL_INVALID_COMMAND','Unknown final metadata command');
  const call=reservation.calls.find(x=>x.id===c.callId);
  need(call?.status==='held'&&text(c.attemptId)&&!p.jobs.some(j=>j.attempts?.some(a=>a.id===c.attemptId)),'FINAL_CALL_ALREADY_DISPATCHED','One original durable dispatch per held slot required');
  need(context.actorId===call.assignment.actorIdentity&&context.runId===c.attemptId,'FINAL_WRONG_EXECUTOR','Exact assigned actor and original run required');
  finalReviewEligibility(p,reservation,call);
  need(finalReviewCallAccounting(p).unknown.length===0,'FINAL_UNKNOWN_BLOCKS','Reconcile previous unknown calls before another dispatch');
  need(call.id==='owner:layoutProducer'||!p.jobs.some(j=>(j.attempts??[]).some(a=>a.executor?.contextId===context.contextId)),'FINAL_CONTEXT_REUSED','Fresh executor context required');
  const creators=new Set(p.artifacts.map(a=>a.author?.actorId).filter(Boolean));
  need(!creators.has(call.assignment.actorIdentity),'FINAL_CREATOR_SELF_REVIEW','Known creators cannot review their own proposal');
  if(reservation.operationCaptureIdentity)assertFinalCallAdmission(context.finalOperationAdmission,p,c);
  const originalRequest=finalCallRequest(p,setup,reservation,c.attemptId,structuredClone(context),c.originals);
  need(originalRequest.binding.callId===call.id&&originalRequest.binding.contextIdentity===call.contextIdentity&&equal(originalRequest.binding.assignment,call.assignment)&&equal(originalRequest.binding.executor,context)&&originalRequest.binding.assignment.actorIdentity===context.actorId,'FINAL_CALL_BINDING_CHANGED','Packet must bind the exact charged call and executor');
  call.status='charged';call.attemptId=c.attemptId;reservation.status='partially_charged';
  p.jobs.push({id:`final-call-${digest({reservationId:reservation.id,callId:call.id})}`,stage:'final_review',purpose:'final_review_call',status:'awaiting_reconciliation',binding:{providerId:call.assignment.providerIdentity,model:call.assignment.modelIdentity,role:call.role??call.phase},task:{originalRequest,id:call.id,setupId:setup.id,reservationId:reservation.id,planId:reservation.planId,inputId:reservation.inputId,contextIdentity:call.contextIdentity},inputVersionIds:[setup.basis.contentArtifactId],outputVersionIds:[],attempts:[{id:c.attemptId,status:'awaiting_reconciliation',dispatchStarted:true,executor:structuredClone(context)}]});
}
