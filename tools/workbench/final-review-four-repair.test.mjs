import test from 'node:test';
import assert from 'node:assert/strict';
import {local,human} from './repair-helper.mjs';
import {fixture} from './repair-upstream-fixture.mjs';
import {finalReviewMetadataBasis} from './final-review-authority.mjs';
import {layoutHash} from './layout-boundary.mjs';
import {finalCallHash as hash} from './final-review-call.mjs';

function returnedTask(f){const x=f.packetFor(f.o.full.calls[0]),target=x.packet.returnTargets.find(t=>t.address.domain==='task');f.charge(x);f.settle(x,f.completion(x,{kind:'return',findings:[{id:`${x.call.reportSlot.slotIdentity}:task`,category:'mandatory_task',duty:'task',targetIds:[target.id],evidence:[{targetId:target.id,observation:'Task requires correction'}],reason:'Missing required scope',requestedChange:'Revise task scope',effect:'must_fix'}]}));return f.state().finalReviewReturns[0];}

test('exact task return correction new approved review resolves historical return after reopen',t=>{
 const f=local(t,{selected:false}),record=returnedTask(f),old=f.reservation();
 f.command('close-final-review-reservation',{setupId:old.setupId,reservationId:old.id,reason:'Correct exact task'});
 f.command('revise-task-card',{taskCardId:'task-corrected',brief:'Corrected exact scope',finalReturnId:record.id},human);
 const correction=f.state().audit.at(-1).commandId,task=f.state().taskCards.at(-1),p=structuredClone(f.state());
 const s=fixture({policy:p.policies.at(-1),taskIdentity:task.id,exactTask:task}).snapshot;
 const b=s.layout.exactBinding;Object.assign(b,{protocol:'project-layout-v1',taskCardId:task.id});s.layout.bindingIdentity=layoutHash(b);s.project.observedRevision=p.revision;s.history.retained.originalAttempts=[];s.allowance.value={authorityIdentity:'owned-local-policy',totalCalls:1000,reservedOtherCalls:0};s.humanFinalGate.value.selected=false;for(const scope of s.roleMaterialScopes)for(const cell of scope.applicability.value)cell.reason='Constructed regenerated upstream fixture';
 const c=s.content.trusted.contract;p.activeByStage.content_review=c.artifactId;p.artifacts.push({id:c.artifactId,stage:'content_review',author:{actorId:'constructed-upstream-creator'},contentHash:s.content.trusted.contentHash,completeContent:{rootJobId:c.rootJobId,manuscriptHash:c.manuscriptHash}});p.jobs.push({id:c.rootJobId,purpose:'complete_content_plan',status:'succeeded',attempts:[],task:{packetVersion:'content-packet-v3',source:s.content.trusted.source}});p.releases.push({artifactId:c.artifactId,policyVersion:p.policies.at(-1).version,sourceHash:b.sourceHash});
 for(const [i,e] of s.editions.value.entries()){const id=i===0?s.layout.rootJobId:e.originalExportJobId;e.originalExportJobId=id;const receipt={operation:'local-native-export',model:null,cost:null,costStatus:'unknown',attemptId:e.originalAttemptId,bindingHash:s.layout.bindingIdentity,style:e.style,anchorPath:e.anchor.originalPath,anchorHash:e.anchor.sha256};p.jobs.push({id,purpose:'layout_export',stage:'layout',status:'succeeded',attempts:[{id:e.originalAttemptId,status:'succeeded',receipt:structuredClone(receipt)}],receipt,task:{bindingHash:s.layout.bindingIdentity,style:e.style,...(i===0?{binding:structuredClone(b)}:{rootJobId:s.layout.rootJobId})}});}
 f.seedRegenerated(p,s);
 const proposal={...f.o.proposal,basedOnRevision:f.state().revision,basis:finalReviewMetadataBasis(f.state(),s.layout.rootJobId),roleMaterialScopes:structuredClone(s.roleMaterialScopes),materials:s.materials.map(m=>({identity:m.identity,correspondenceHash:hash(m)}))};
 f.command('set-final-review-authority',{authority:proposal});f.command('reserve-final-review-plan',{setupId:f.state().finalReviewSetups.at(-1).id,plan:f.o.plan});
 assert.throws(()=>f.command('mark-final-review-dispatched',{setupId:old.setupId,reservationId:old.id,callId:old.calls[1].id,attemptId:'stale',originals:{} }),e=>e.code==='FINAL_SETUP_REQUIRED');
 assert.throws(()=>f.command('resolve-final-review-return',{setupId:old.setupId,reservationId:old.id,returnId:record.id,correctionCommandId:correction,newInputId:f.reservation().inputId}),e=>e.code==='FINAL_CORRECTION_REQUIRED');
 f.review();assert.equal(f.reservation().approval.authorityOutcome,'reviewed_pass');f.reopen();
 const fields={setupId:old.setupId,reservationId:old.id,returnId:record.id,correctionCommandId:correction,newInputId:f.reservation().inputId};
 assert.throws(()=>f.command('resolve-final-review-return',{...fields,correctionCommandId:'unrelated'}),e=>e.code==='FINAL_CORRECTION_REQUIRED');
 f.command('resolve-final-review-return',fields);f.reopen();assert.equal(f.state().finalReviewReturns[0].status,'resolved');assert.equal(f.state().finalReviewReturns[0].resolution.resultingTaskCardId,task.id);assert.equal(f.state().finalReviewReservations[0].setupId,old.setupId);f.command('resolve-final-review-return',fields);
});

test('advisory cannot waive hard finding while harmless aesthetic advice stays eligible',t=>{
 const f=local(t,{selected:false});
 for(const call of f.o.full.calls){if(call.phase==='owner_after')break;const x=f.packetFor(call),v=f.outcome(x,{negative:call.id==='content:primary:0'});if(v.findings?.length)v.findings[0].effect='advisory';if(call.id==='director')v.outcome.kind='approve';f.charge(x);f.settle(x,f.completion(x,v));}
 assert.equal(f.reservation().approval.authorityOutcome,'reviewed_pass');
});

test('upheld mandatory source advisory is refused before authority',t=>{
 const f=local(t);
 for(const call of f.o.full.calls){if(call.phase==='owner_after')break;const x=f.packetFor(call),v=f.outcome(x,{negative:call.id==='content:primary:0'?'hard':false});if(v.findings?.length)v.findings[0].effect='advisory';if(call.id==='director'){v.outcome.kind='approve';f.charge(x);assert.throws(()=>f.settle(x,f.completion(x,v)),e=>e.code==='FINAL_HARD_PROOF_REQUIRED');assert.equal(f.reservation().approval,undefined);return;}f.charge(x);f.settle(x,f.completion(x,v));}
});
