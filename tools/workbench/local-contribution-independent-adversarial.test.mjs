import {proveDecisionPlan} from './local-decision-plan.mjs';
import {contributionRevisionQueueProof} from './local-contribution-queue.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {syntheticResearch,acceptedOperatorResearch,releaseRequest,continuationRequest,human} from './research-operator-fixture.mjs';
import {openStore} from './store.mjs';
import {openLocalAcceptanceCoordinator} from './local-acceptance-coordinator.mjs';
async function fixture(t,{interruptFeedback=false,interruptQueue=false,queueBarrier}={}){
 const real=await acceptedOperatorResearch(await syntheticResearch());t.after(real.close);await real.executor.releaseResearch('p',releaseRequest(real),human);const strategyJob=real.executor.continueResearch('p',continuationRequest(real));assert.equal((await real.executor.execute('p',strategyJob)).status,'succeeded');
 const root=await mkdtemp(join(tmpdir(),'admitted-contribution-')),metadataStore=openStore(join(root,'metadata.sqlite'));let c,initialFeedbackFault=interruptFeedback,queueFault=interruptQueue,feedbackCalls=0,queueCalls=0;
 t.after(async()=>{c?.close();metadataStore.close();await rm(root,{recursive:true,force:true});});
 c=openLocalAcceptanceCoordinator({databasePath:join(root,'case.sqlite'),projectStore:metadataStore,executor:{}});const created=await c.create({caseId:'dexian',brief:'Explicit local strategy contribution component only.',mode:'assisted',checkpoints:['strategy'],commandId:'create'});c.close();
 const project=real.store.read('p'),research=project.artifacts.find(a=>a.id===project.activeByStage.research),producer=project.jobs.find(j=>j.outputVersionIds?.includes(research.id)),before=real.store.read('p');
 const store={read:(_id,revision)=>real.store.read('p',revision),command:(id,command,actor)=>{const p=real.store.command(id,command,actor);if(command.kind==='submit-feedback'){feedbackCalls++;if(initialFeedbackFault){initialFeedbackFault=false;throw Object.assign(Error('lost after committed feedback'),{code:'TEST_FEEDBACK_COMMITTED'});}}return p;}};
 const executor={...real.executor,enqueueRevision:async(...args)=>{queueCalls++;if(queueBarrier)await queueBarrier();const id=await real.executor.enqueueRevision(...args);if(queueFault){queueFault=false;throw Object.assign(Error('lost queued revision response'),{code:'TEST_QUEUE_COMMITTED'});}return id;}};
 const config={databasePath:join(root,'case.sqlite'),projectStore:store,executor,executionRoot:real.root,drivers:{research:{inspect:async()=>({status:'complete',jobIds:[producer.id],resultIds:[research.id]})},strategy:{inspect:async()=>({status:'blocked',reason:'UNREVIEWED_ACTUAL_STRATEGY'})}}};
 c=openLocalAcceptanceCoordinator(config);const viewed=await c.read(created.id);assert.equal(viewed.nextAction.module,'strategy');
 const request={module:'strategy',decision:'revise',commandId:'human-strategy-opinion',expectedBasisHash:viewed.nextAction.evidenceHash,contribution:{kind:'strategy_opinion',instructions:'突出轻松社交，不把轻负担解释为低度或健康功效。'}};
 return {real,root,before,created,request,get c(){return c;},get feedbackCalls(){return feedbackCalls;},get queueCalls(){return queueCalls;},reopen(){c.close();c=openLocalAcceptanceCoordinator(config);}};
}

function intentFor(f){const db=new DatabaseSync(join(f.root,'case.sqlite'),{readOnly:true});try{return JSON.parse(db.prepare('SELECT body FROM acceptance_decision_intents WHERE id=? AND command_id=?').get(f.created.id,f.request.commandId).body);}finally{db.close();}}
test('independent adversary cannot replace admitted feedback with a native policy command or redirected revision',async t=>{
 const f=await fixture(t);await f.c.decide(f.created.id,f.request);const original=intentFor(f),before=f.real.store.read('p');
 const forged=structuredClone(original);forged.steps[0].command={kind:'set-policy',mode:'auto',humanGates:[],commandId:forged.steps[0].command.commandId,expectedRevision:forged.before.revision};
 assert.throws(()=>proveDecisionPlan(forged,f.real.store),{code:'ACCEPTANCE_CONTRIBUTION_PLAN_CHANGED'});
 for(const change of [{artifactId:'unrelated'},{commandId:'arbitrary-native-command'},{expectedRevision:0}]){const tampered=structuredClone(original);Object.assign(tampered.continuation.steps[0].request,change);assert.throws(()=>contributionRevisionQueueProof(tampered,f.real.store),{code:'LOCAL_CONTRIBUTION_REVISION_REQUEST_CHANGED'});}
 assert.deepEqual(f.real.store.read('p'),before);assert.equal(f.queueCalls,0);assert.equal(before.humanFeedback.length,1);
});
test('independent adversary cannot present a changed native queued body as a proven original revision',async t=>{
 const f=await fixture(t);await f.c.decide(f.created.id,f.request);const queued=await f.c.queueContributionRevision(f.created.id,f.request.commandId),intent=intentFor(f),current=f.real.store.read('p');
 const changed=structuredClone(current);changed.jobs.find(j=>j.id===queued.jobId).task.revisionInput.baseContent.summary='forged revised source';
 const facade={read:(id,revision)=>revision===undefined?changed:f.real.store.read(id,revision)};
 assert.throws(()=>contributionRevisionQueueProof(intent,facade),{code:'LOCAL_CONTRIBUTION_REVISION_QUEUE_CHANGED'});
 assert.equal(f.real.store.read('p').feedbackReviews.length,0);assert.equal(f.real.store.read('p').jobs.find(j=>j.id===queued.jobId).attempts.length,0);assert.deepEqual(f.real.store.read('p'),current);
});
