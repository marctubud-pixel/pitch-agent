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
test('admitted strategy opinion is actual native feedback and queues original revision without pretending adopted or reviewed',async t=>{
 const f=await fixture(t),result=await f.c.decide(f.created.id,f.request),p=f.real.store.read('p'),decision=result.decisions.find(d=>d.commandId===f.request.commandId);
 assert.equal(result.pendingContinuation.status,'pending_revision');assert.equal(result.pendingContinuation.nextStep,'enqueue_revision');assert.equal(result.nextAction.reason,'LOCAL_CONTRIBUTION_CONTINUATION_PENDING');await assert.rejects(f.c.advance(f.created.id,{commandId:'no-old-stage-loop'}),{code:'LOCAL_CONTRIBUTION_CONTINUATION_PENDING'});assert.equal(p.humanFeedback.length,1);assert.equal(decision.contributionDisposition,'feedback_recorded_pending_revision');assert.equal(decision.factualAuthority,false);assert.equal(decision.semanticReviewVerified,false);assert.equal(p.activeByStage.strategy,f.before.activeByStage.strategy);assert.deepEqual(p.artifacts,f.before.artifacts);assert.deepEqual(p.verifications,f.before.verifications);assert.deepEqual(p.releases,f.before.releases);assert.equal(p.feedbackReviews.length,0);
 const queued=await f.c.queueContributionRevision(f.created.id,f.request.commandId);assert.equal(queued.status,'revision_queued');assert.equal(queued.disposition,'pending_review');const job=f.real.store.read('p').jobs.find(j=>j.id===queued.jobId);assert.equal(job.status,'queued');assert.equal(job.attempts.length,0);assert.equal(job.task.revisionInput.feedback[0].id,decision.feedbackId);assert.equal(job.task.revisionInput.revisionOf.artifactId,f.before.activeByStage.strategy);assert.equal(f.real.store.read('p').feedbackReviews.length,0);
 f.reopen();assert.deepEqual(await f.c.queueContributionRevision(f.created.id,f.request.commandId),queued);assert.equal(f.feedbackCalls,1);assert.equal(f.queueCalls,1);const view=await f.c.read(f.created.id);assert.equal(view.decisions.find(d=>d.commandId===f.request.commandId).contributionContinuation.status,'revision_queued');assert.equal(view.pendingContinuation.nextStep,'execute_native_revision');assert.equal(view.pendingContinuation.revisionJobId,queued.jobId);await assert.rejects(f.c.advance(f.created.id,{commandId:'no-old-approval'}),{code:'LOCAL_CONTRIBUTION_CONTINUATION_PENDING'});
});
test('committed feedback interruption recovers exact original human command after reopen',async t=>{
 const f=await fixture(t,{interruptFeedback:true});await assert.rejects(f.c.decide(f.created.id,f.request),{code:'TEST_FEEDBACK_COMMITTED'});f.reopen();const recovered=await f.c.decide(f.created.id,f.request);assert.equal(recovered.decisions.find(d=>d.commandId===f.request.commandId).contributionDisposition,'feedback_recorded_pending_revision');assert.equal(f.feedbackCalls,1);assert.equal(f.real.store.read('p').humanFeedback.length,1);
});
test('lost queue response resumes from exact native queued job, with no duplicate scheduling',async t=>{
 const f=await fixture(t,{interruptQueue:true});await f.c.decide(f.created.id,f.request);await assert.rejects(f.c.queueContributionRevision(f.created.id,f.request.commandId),{code:'TEST_QUEUE_COMMITTED'});assert.equal((await f.c.read(f.created.id)).pendingContinuation.nextStep,'reconcile_revision_queue');f.reopen();const result=await f.c.queueContributionRevision(f.created.id,f.request.commandId);assert.equal(result.status,'revision_queued');assert.equal(f.queueCalls,1);
});
test('stale, unsupported and post-feedback unrelated head changes cannot be converted to adoption or queued revision',async t=>{
 const f=await fixture(t);await assert.rejects(f.c.decide(f.created.id,{...f.request,expectedBasisHash:'a'.repeat(64)}),{code:'ACCEPTANCE_DECISION_STALE'});await assert.rejects(f.c.decide(f.created.id,{...f.request,contribution:{kind:'strategy_opinion',instructions:'x',verified:true}}),{code:'LOCAL_CONTRIBUTION_INPUT_INVALID'});assert.equal(f.feedbackCalls,0);
 const db=new DatabaseSync(join(f.root,'case.sqlite'),{readOnly:true});try{assert.equal(db.prepare('SELECT count(*) n FROM acceptance_decision_intents').get().n,0);}finally{db.close();}
 await f.c.decide(f.created.id,f.request);const p=f.real.store.read('p');f.real.store.command('p',{kind:'set-policy',mode:'auto',humanGates:[],commandId:'unrelated-policy',expectedRevision:p.revision},human);await assert.rejects(f.c.queueContributionRevision(f.created.id,f.request.commandId),{code:'LOCAL_CONTRIBUTION_REVISION_SOURCE_CHANGED'});assert.equal(f.queueCalls,0);assert.equal(f.real.store.read('p').feedbackReviews.length,0);
});

 test('native queue continuation blocks another decision or advance while its local scheduling operation is live',async t=>{
 let entered,release;const started=new Promise(r=>entered=r),wait=new Promise(r=>release=r),f=await fixture(t,{queueBarrier:async()=>{entered();await wait;}});await f.c.decide(f.created.id,f.request);const running=f.c.queueContributionRevision(f.created.id,f.request.commandId);await started;
 try{
  await assert.rejects(f.c.advance(f.created.id,{commandId:'advance-during-queue'}),{code:'ACCEPTANCE_DECISION_RECONCILIATION_REQUIRED'});await assert.rejects(f.c.decide(f.created.id,{...f.request,commandId:'new-opinion'}),{code:'ACCEPTANCE_DECISION_RECONCILIATION_REQUIRED'});await assert.rejects(f.c.queueContributionRevision(f.created.id,f.request.commandId),{code:'LOCAL_CONTRIBUTION_QUEUE_IN_PROGRESS'});assert.equal((await f.c.read(f.created.id)).decisionCommand.state,'queueing_revision');
 }finally{release();}assert.equal((await running).status,'revision_queued');assert.equal(f.queueCalls,1);
 });
