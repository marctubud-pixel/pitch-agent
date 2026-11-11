import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {verifyFinalCallOriginal,createFinalCallSettlement} from './final-review-call-original.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createProject,applyCommand} from './project.mjs';
import {planFinalReview} from './final-review-input.mjs';
import {fixture} from './final-review-input-fixture.mjs';
import {layoutHash} from './layout-boundary.mjs';
import {finalReviewMetadataBasis,finalReviewCallAccounting,compactFinalReviewPlan} from './final-review-authority.mjs';
import {finalCallTargetCatalog,finalCallHash,decodeFinalCallJSON} from './final-review-call.mjs';
const ctx={actorType:'agent',actorId:'local-final-runtime',runId:'setup-run',contextId:'setup-context',now:'2026-10-28T00:00:00Z'};
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const clone=structuredClone;
const command=(p,kind,fields={},context=ctx)=>applyCommand(p,{commandId:`command-${p.revision}-${kind}`,expectedRevision:p.revision,kind,...fields},context);
function owned({selected=false,totalCalls=1000}={}) {
  const p=clone(createProject({id:'project',name:'Owned metadata fixture',brief:'Owned proposal fixture',mode:selected?'assisted':'auto',humanGates:selected?['final_review']:[]},ctx));
  const f=fixture({policy:p.policies[0],taskIdentity:p.activeTaskCardId}),s=f.snapshot,c=s.content.trusted.contract;
  const ownerProfile=f.configuration.assignmentPolicy.profiles.find(x=>x.identity==='owners');ownerProfile.reportBoundBytes=16384;ownerProfile.context.maxOutputBytes=16384;
  const b=s.layout.exactBinding;
  Object.assign(b,{protocol:'project-layout-v1',taskCardId:p.activeTaskCardId});s.layout.bindingIdentity=layoutHash(b);
  s.project.observedRevision=p.revision;s.history.retained.originalAttempts=[];
  s.allowance.value={authorityIdentity:'owned-local-policy',totalCalls,reservedOtherCalls:0};s.humanFinalGate.value.selected=selected;
  p.activeByStage.content_review=c.artifactId;
  p.artifacts.push({id:c.artifactId,stage:'content_review',author:{actorId:'owned-content-creator'},contentHash:s.content.trusted.contentHash,completeContent:{rootJobId:c.rootJobId,manuscriptHash:c.manuscriptHash}});
  p.jobs.push({id:c.rootJobId,purpose:'complete_content_plan',status:'succeeded',attempts:[],task:{packetVersion:'content-packet-v3',source:s.content.trusted.source}});
  p.releases.push({artifactId:c.artifactId,policyVersion:p.policies[0].version,sourceHash:b.sourceHash});
  for(const [index,e] of s.editions.value.entries()) {
    const id=index===0?s.layout.rootJobId:e.originalExportJobId;e.originalExportJobId=id;
    const receipt={operation:'local-native-export',model:null,cost:null,costStatus:'unknown',attemptId:e.originalAttemptId,bindingHash:s.layout.bindingIdentity,style:e.style,anchorPath:e.anchor.originalPath,anchorHash:e.anchor.sha256};
    p.jobs.push({id,purpose:'layout_export',stage:'layout',status:'succeeded',attempts:[{id:e.originalAttemptId,status:'succeeded',receipt:clone(receipt)}],receipt,task:{bindingHash:s.layout.bindingIdentity,style:e.style,...(index===0?{binding:clone(b)}:{rootJobId:s.layout.rootJobId})}});
  }
  const proposal={protocol:'final-review-authority-v1',basedOnRevision:p.revision,basis:finalReviewMetadataBasis(p,s.layout.rootJobId),materials:s.materials.map(m=>({identity:m.identity,correspondenceHash:finalCallHash(m)})),roleMaterialScopes:clone(s.roleMaterialScopes),owners:Object.fromEntries(Object.entries(s.owners).map(([k,v])=>[k,clone(v.value)])),configuration:clone(f.configuration),allowance:{authorityIdentity:'owned-local-policy',totalCalls,provenance:'Owned local test allowance; no provider call'}};
  for(const scope of proposal.roleMaterialScopes)for(const cell of scope.applicability.value)cell.reason='Owned fixture evidence, not verified external facts';
  s.roleMaterialScopes=clone(proposal.roleMaterialScopes);
  const planned=planFinalReview(s,f.configuration);
  assert.equal(planned.kind,'planned',JSON.stringify(planned.blockers));
  return {p,proposal,plan:compactFinalReviewPlan(planned.plan),full:planned.plan,f};
}
const configure=o=>command(o.p,'set-final-review-authority',{authority:o.proposal});
const reserve=(p,plan)=>command(p,'reserve-final-review-plan',{setupId:p.finalReviewSetups.at(-1).id,plan});


function charged(){
 const o=owned(),p=reserve(configure(o),o.plan),setup=p.finalReviewSetups[0],r=p.finalReviewReservations[0],call=o.full.calls[0],executor={...ctx,actorId:call.assignment.actorIdentity,runId:'owned-attempt'},attemptId=executor.runId;
 const binding={projectId:p.id,setupId:setup.id,reservationId:r.id,planId:o.full.id,inputId:o.full.inputId,callId:call.id,attemptId,executor,contextIdentity:call.contextIdentity,assignment:call.assignment,profile:call.profile,reportSlot:call.reportSlot};
 const packet={protocol:'final-call-packet-v1',operation:'final-review-v1',binding,call,basis:setup.basis,returnTargets:finalCallTargetCatalog(setup.basis,call.payload)};
 const originals={input:JSON.stringify(o.f.snapshot),plan:JSON.stringify(o.full),packet:JSON.stringify(packet)};
 const fields={setupId:setup.id,reservationId:r.id,callId:call.id,attemptId,originals};
 const q=command(p,'mark-final-review-dispatched',fields,executor);
 return {p:q,fields,executor,packet};
}
function complete(x,kind='handoff'){
 const outcome=kind==='handoff'?{kind,basisHash:finalCallHash(x.packet.basis),statement:'Frozen basis acknowledged, no visual approval'}:{kind,findings:[{targetId:x.packet.returnTargets[0].id,reason:'Task is unclear',requestedChange:'Clarify the task'}]};
 const sha=s=>createHash('sha256').update(s).digest('hex');
 const response=JSON.stringify({protocol:'final-layout-producer-result-v1',binding:x.packet.binding,packetHash:sha(x.fields.originals.packet),outcome});
 const receipt={protocol:'local-final-call-test-v1',binding:x.packet.binding,packetHash:sha(x.fields.originals.packet),responseHash:sha(response),responseBytes:Buffer.byteLength(response),threadId:'local-thread',terminal:'completed',exitCode:0};
 const events=[{kind:'started',threadId:receipt.threadId,contextIdentity:x.packet.binding.contextIdentity,attemptId:x.fields.attemptId},{kind:'completed',threadId:receipt.threadId,attemptId:x.fields.attemptId,responseHash:receipt.responseHash,exitCode:0}];
 return {...x.fields,originals:{...x.fields.originals,response,receipt:JSON.stringify(receipt),events:JSON.stringify(events)}};
}
test('constructed metadata command unit settles handoff once and preserves allowance and false flags',()=>{
 const x=charged(),fields=complete(x),p=command(x.p,'settle-final-review-call',fields,x.executor),a=finalReviewCallAccounting(p),j=p.jobs.at(-1);
 assert.equal(a.consumedCalls,1);assert.equal(a.unknown.length,0);assert.equal(j.finalCallResult.semanticOutcome,'handoff');assert.deepEqual(j.receipt,j.attempts[0].receipt);
 assert.equal(p.finalReviewReservations[0].calls.filter(c=>c.status==='held').length,x.p.finalReviewReservations[0].calls.length-1);
 for(const k of ['executionAvailable','finalAuthorityAvailable','deliveryAvailable'])assert.equal(p.finalReviewSetups[0][k],false);
 const replay=command(p,'settle-final-review-call',fields,x.executor);assert.deepEqual(replay.jobs,p.jobs);assert.equal(finalReviewCallAccounting(replay).consumedCalls,1);
 const changed=complete(x,'return');assert.throws(()=>command(p,'settle-final-review-call',changed,x.executor),e=>e.code==='FINAL_RESULT_CONFLICT');
});
test('constructed metadata return is paid but blocks successor',()=>{
 const x=charged(),p=command(x.p,'settle-final-review-call',complete(x,'return'),x.executor),r=p.finalReviewReservations[0],next=r.calls[1];
 assert.equal(finalReviewCallAccounting(p).consumedCalls,1);assert.equal(r.calls[0].semanticOutcome,'return');
 assert.throws(()=>command(p,'mark-final-review-dispatched',{setupId:r.setupId,reservationId:r.id,callId:next.id,attemptId:'next'},{...ctx,actorId:next.assignment.actorIdentity,runId:'next'}),e=>e.code==='FINAL_DEPENDENCY_BLOCKED');
});
test('unknown, substitution, target, receipt and stale mutations cannot settle paid attempt',()=>{
 for(const change of [f=>{delete f.originals.receipt;},f=>{f.originals.packet+=' ';},f=>{const r=JSON.parse(f.originals.response);r.outcome.findings[0].targetId='invented';f.originals.response=JSON.stringify(r);},f=>{const r=JSON.parse(f.originals.receipt);r.exitCode=1;f.originals.receipt=JSON.stringify(r);},f=>{f.originals.events='[]';}]){
 const x=charged(),f=complete(x,'return');change(f);assert.throws(()=>command(x.p,'settle-final-review-call',f,x.executor));assert.equal(finalReviewCallAccounting(x.p).consumedCalls,1);assert.equal(finalReviewCallAccounting(x.p).unknown.length,1);
 }
 const x=charged();x.p=clone(x.p);x.p.activeTaskCardId='stale';assert.throws(()=>command(x.p,'settle-final-review-call',complete(x),x.executor),e=>e.code==='FINAL_STALE_BASIS');
});
test('strict decoder refuses duplicate escaped keys, invalid UTF8, nesting and bounds',()=>{
 for(const v of ['{"a":1,"a":2}','{"a":1,"\\u0061":2}',Buffer.from([0xff]),'['.repeat(130)+'0'+']'.repeat(130)])assert.throws(()=>decodeFinalCallJSON(v,4096));
 assert.throws(()=>decodeFinalCallJSON('{}',1));assert.deepEqual(decodeFinalCallJSON('{"a":[true,null,1]}',100),{a:[true,null,1]});
});

test('constructed metadata managed originals validate after adapter settlement and reject changed historical bytes',async()=>{
 const x=charged(),fields=complete(x),root=await mkdtemp(join(tmpdir(),'final-call-')),dir=join(root,x.fields.attemptId);await mkdir(dir);
 for(const [k,v] of Object.entries(fields.originals))await writeFile(join(dir,`${k}.json`),v,{flag:'wx'});
 let state=x.p;const store={read:()=>state,command:(id,c,context)=>(state=applyCommand(state,c,context))};
 const gateway=createFinalCallSettlement({store,executionRoot:root});
 const intent={commandId:'managed-settle',expectedRevision:state.revision,setupId:fields.setupId,reservationId:fields.reservationId,attemptId:fields.attemptId};
 const result=await gateway.settleLayoutProducer(state.id,intent,x.executor),job=result.jobs.at(-1);
 assert.equal((await verifyFinalCallOriginal(result,job,{executionRoot:root})).id,job.finalCallResult.id);
 await writeFile(join(dir,'response.json'),fields.originals.response+' ');
 await assert.rejects(()=>verifyFinalCallOriginal(result,job,{executionRoot:root}),e=>e.code==='FINAL_RECEIPT_INVALID');
 const substituted=fields.originals.response+' ',receipt=JSON.parse(fields.originals.receipt),events=JSON.parse(fields.originals.events);
 receipt.responseHash=createHash('sha256').update(substituted).digest('hex');receipt.responseBytes=Buffer.byteLength(substituted);events[1].responseHash=receipt.responseHash;
 await writeFile(join(dir,'receipt.json'),JSON.stringify(receipt));await writeFile(join(dir,'events.json'),JSON.stringify(events));
 await assert.rejects(()=>verifyFinalCallOriginal(result,job,{executionRoot:root}),e=>e.code==='FINAL_RESULT_CONFLICT');
 assert.equal(finalReviewCallAccounting(state).consumedCalls,1);
});

function chargeChangedInput(change){
 const o=owned();change(o.f.snapshot);const built=planFinalReview(o.f.snapshot,o.f.configuration);assert.equal(built.kind,'planned',JSON.stringify(built.blockers));o.full=built.plan;o.plan=compactFinalReviewPlan(o.full);
 const p=reserve(configure(o),o.plan),setup=p.finalReviewSetups[0],r=p.finalReviewReservations[0],call=o.full.calls[0],executor={...ctx,actorId:call.assignment.actorIdentity,runId:'owned-attempt'},attemptId=executor.runId;
 const binding={projectId:p.id,setupId:setup.id,reservationId:r.id,planId:o.full.id,inputId:o.full.inputId,callId:call.id,attemptId,executor,contextIdentity:call.contextIdentity,assignment:call.assignment,profile:call.profile,reportSlot:call.reportSlot};
 const packet={protocol:'final-call-packet-v1',operation:'final-review-v1',binding,call,basis:setup.basis,returnTargets:finalCallTargetCatalog(setup.basis,call.payload)};
 const originals={input:JSON.stringify(o.f.snapshot),plan:JSON.stringify(o.full),packet:JSON.stringify(packet)};
 const fields={setupId:setup.id,reservationId:r.id,callId:call.id,attemptId,originals};
 const q=command(p,'mark-final-review-dispatched',fields,executor);return {p:q,fields,executor,packet};
}

test('constructed metadata replanning cannot substitute edition anchor, material correspondence or duty map',()=>{
 for(const change of [s=>{s.editions.value[0].anchor.sha256='f'.repeat(64);},s=>{s.editions.value[0].anchor.originalPath='owned/substitute';},s=>{s.materials[0].dimensions.value.evidenceIdentity='substituted';},s=>{s.roleMaterialScopes[0].applicability.value[0].reason='Substituted duty';}])assert.throws(()=>chargeChangedInput(change),e=>['FINAL_STALE_BASIS','FINAL_SETUP_MATERIALS_CHANGED'].includes(e.code));
});
test('constructed ordinary and uncertain provider receipt threads cannot be reused',()=>{
 for(const receipt of [{threadId:'local-thread'},{providerExecution:{threadId:'local-thread'}}]){
  const x=charged();x.p=clone(x.p);x.p.jobs[0].binding={providerId:'owned',model:'owned',role:'author'};x.p.jobs[0].attempts=[{id:'prior-author-attempt',status:'succeeded',dispatchStarted:true,receipt:{providerId:'owned',model:'owned',...receipt}}];
  assert.throws(()=>command(x.p,'settle-final-review-call',complete(x),x.executor),e=>e.code==='FINAL_THREAD_REUSED');
 }
});
test('constructed historical originals require registered job, reservation, attempt and result and retain original policy',async()=>{
 const x=charged(),fields=complete(x),p=command(x.p,'settle-final-review-call',fields,x.executor),job=p.jobs.at(-1),root=await mkdtemp(join(tmpdir(),'membership-')),dir=join(root,x.fields.attemptId);await mkdir(dir);
 for(const [k,v] of Object.entries(fields.originals))await writeFile(join(dir,`${k}.json`),v,{flag:'wx'});
 for(const change of [p=>{p.jobs.pop();},p=>{p.finalReviewReservations=[];},p=>{p.finalReviewReservations[0].calls[0].attemptId='other';},p=>{p.finalReviewReservations[0].calls[0].resultId='other';},p=>{p.jobs.at(-1).attempts[0].receipt.threadId='other';},p=>{p.jobs.push(clone(p.jobs.at(-1)));},p=>{p.jobs.at(-1).finalCallResult.report.outcome.statement='Changed result';}]){
  const changed=clone(p);change(changed);await assert.rejects(()=>verifyFinalCallOriginal(changed,job,{executionRoot:root}));
 }
 const later=clone(p);later.policies.push({...later.policies.at(-1),version:'later-policy'});
 assert.equal((await verifyFinalCallOriginal(later,job,{executionRoot:root})).id,job.finalCallResult.id);
 assert.throws(()=>command(later,'settle-final-review-call',fields,x.executor),e=>e.code==='FINAL_STALE_BASIS');
 const unregistered=clone(p);unregistered.policies=[];await assert.rejects(()=>verifyFinalCallOriginal(unregistered,job,{executionRoot:root}));
});
