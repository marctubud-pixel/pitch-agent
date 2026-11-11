import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {syntheticResearch,acceptedOperatorResearch,releaseRequest,continuationRequest,human} from './research-operator-fixture.mjs';
import {createExecutor} from './executor.mjs';
import {createLocalSyntheticProviders} from './local-research-drivers.mjs';
import {localContributionResponse,localContributionBindings} from './local-contribution-response.mjs';
import {bindings as baseBindings} from './research-operator-fixture.mjs';
import {releaseReadiness} from './project.mjs';
import {writeFile} from 'node:fs/promises';
import {openStore} from './store.mjs';
import {openLocalAcceptanceCoordinator} from './local-acceptance-coordinator.mjs';
async function fixture(t,{interruptFeedback=false,interruptQueue=false,queueBarrier,revisionVariant,reviewVariant,loseRevisionResponse=false,loseReviewResponse=false}={}){
 const real=await syntheticResearch();t.after(real.close);
 const modelCalls=[],providers=createLocalSyntheticProviders({projectStore:real.store,executionRoot:real.root,calls:modelCalls,handlers:[ctx=>{let raw=localContributionResponse(ctx);if(raw&&ctx.job.task?.revisionInput&&revisionVariant)raw=revisionVariant(raw,ctx);if(raw&&ctx.job.purpose==='feedback_review'&&reviewVariant)raw=reviewVariant(raw,ctx);return raw;}]}),native=createExecutor({store:real.store,rootDir:real.root,semanticLease:real.semanticLease,bindings:{...baseBindings,strategy:{providerId:'local-synthetic',model:'synthetic',role:'strategy-lead'},...localContributionBindings},providers:{...real.providers,...providers}});
 real.executor=native;await acceptedOperatorResearch(real);await real.executor.releaseResearch('p',releaseRequest(real),human);const strategyJob=real.executor.continueResearch('p',continuationRequest(real));assert.equal((await real.executor.execute('p',strategyJob)).status,'succeeded');const initialModelCalls=modelCalls.length;
 const root=await mkdtemp(join(tmpdir(),'admitted-contribution-')),metadataStore=openStore(join(root,'metadata.sqlite'));let c,initialFeedbackFault=interruptFeedback,queueFault=interruptQueue,feedbackCalls=0,queueCalls=0;
 t.after(async()=>{c?.close();metadataStore.close();await rm(root,{recursive:true,force:true});});
 c=openLocalAcceptanceCoordinator({databasePath:join(root,'case.sqlite'),projectStore:metadataStore,executor:{}});const created=await c.create({caseId:'dexian',brief:'Explicit local strategy contribution component only.',mode:'assisted',checkpoints:['strategy'],commandId:'create'});c.close();
 const project=real.store.read('p'),research=project.artifacts.find(a=>a.id===project.activeByStage.research),producer=project.jobs.find(j=>j.outputVersionIds?.includes(research.id)),before=real.store.read('p');
 const store={read:(_id,revision)=>real.store.read('p',revision),command:(id,command,actor)=>{const p=real.store.command(id,command,actor);if(command.kind==='submit-feedback'){feedbackCalls++;if(initialFeedbackFault){initialFeedbackFault=false;throw Object.assign(Error('lost after committed feedback'),{code:'TEST_FEEDBACK_COMMITTED'});}}return p;}};
 let lostRevision=false,lostReview=false;
 const executor={...native,execute:async(id,jobId)=>{const before=real.store.read(id).jobs.find(j=>j.id===jobId),result=await native.execute(id,jobId);if(!before.purpose&&loseRevisionResponse&&!lostRevision){lostRevision=true;throw Object.assign(Error('lost generated revision response'),{code:'TEST_REVISION_COMMITTED'});}if(before.purpose==='feedback_review'&&loseReviewResponse&&!lostReview){lostReview=true;throw Object.assign(Error('lost review response'),{code:'TEST_REVIEW_COMMITTED'});}return result;},enqueueRevision:async(...args)=>{queueCalls++;if(queueBarrier)await queueBarrier();const id=await native.enqueueRevision(...args);if(queueFault){queueFault=false;throw Object.assign(Error('lost queued revision response'),{code:'TEST_QUEUE_COMMITTED'});}return id;}};
 const config={databasePath:join(root,'case.sqlite'),projectStore:store,executor,contributionExecution:true,executionRoot:real.root,drivers:{research:{inspect:async()=>({status:'complete',jobIds:[producer.id],resultIds:[research.id]})},strategy:{inspect:async()=>({status:'blocked',reason:'UNREVIEWED_ACTUAL_STRATEGY'})}}};
 c=openLocalAcceptanceCoordinator(config);const viewed=await c.read(created.id);assert.equal(viewed.nextAction.module,'strategy');
 const request={module:'strategy',decision:'revise',commandId:'human-strategy-opinion',expectedBasisHash:viewed.nextAction.evidenceHash,contribution:{kind:'strategy_opinion',instructions:'突出轻松社交，不把轻负担解释为低度或健康功效。'}};
 return {real,root,before,created,request,modelCalls,initialModelCalls,config,get c(){return c;},get feedbackCalls(){return feedbackCalls;},get queueCalls(){return queueCalls;},reopen(){c.close();c=openLocalAcceptanceCoordinator(config);}};
}

async function queued(f){await f.c.decide(f.created.id,f.request);return f.c.queueContributionRevision(f.created.id,f.request.commandId);}
async function finishReview(f){for(let i=0;i<3;i++)await f.c.advanceContribution(f.created.id,f.request.commandId);return f.c.read(f.created.id);}
test('actual queued strategy revision and independent feedback review finish without claiming release or adoption',async t=>{
 const f=await fixture(t);await queued(f);const old=f.before.artifacts.find(a=>a.id===f.before.activeByStage.strategy);const view=await finishReview(f),p=f.real.store.read('p'),decision=view.decisions.find(d=>d.commandId===f.request.commandId),next=p.artifacts.find(a=>a.id===p.activeByStage.strategy),proof=decision.contributionContinuation.feedbackReview;
 assert.notEqual(next.id,old.id);assert.equal(next.revision.revisionOf.artifactId,old.id);assert.deepEqual(p.artifacts.find(a=>a.id===old.id),old);assert.equal(proof.hasBlockingFindings,false);assert.equal(proof.producerResponses[0].action,'applied');assert.equal(proof.findings[0].status,'addressed');assert.equal(proof.released,false);assert.equal(proof.approved,false);assert.equal(decision.contributionDisposition,'feedback_addressed_pending_stage_validation');assert.equal(view.pendingContinuation,undefined);assert.equal(view.complete,false);assert.equal(releaseReadiness(p,next.id).eligible,false);assert.equal(p.decisions.length,f.before.decisions.length);assert.equal(f.modelCalls.length-f.initialModelCalls,2);
 f.reopen();await f.c.advanceContribution(f.created.id,f.request.commandId);assert.equal(f.modelCalls.length-f.initialModelCalls,2);
});
test('partly applied or not applied producer replies do not substitute for actual independent negative findings',async t=>{
 const f=await fixture(t,{revisionVariant:raw=>({...raw,summary:'Synthetic revision did not implement the requested text.',feedbackResponses:raw.feedbackResponses.map(r=>({...r,action:'not_applied',outputLocations:[]}))})});await queued(f);const view=await finishReview(f),decision=view.decisions.find(d=>d.commandId===f.request.commandId);assert.equal(decision.contributionContinuation.feedbackReview.producerResponses[0].action,'not_applied');assert.equal(decision.contributionContinuation.feedbackReview.hasBlockingFindings,true);assert.equal(decision.contributionContinuation.feedbackReview.findings[0].status,'unresolved');assert.equal(view.pendingContinuation.status,'feedback_review_unresolved');assert.equal(view.complete,false);assert.equal(f.modelCalls.length-f.initialModelCalls,2);
});
test('a factual-risk review remains unresolved even if producer says applied',async t=>{
 const f=await fixture(t,{reviewVariant:raw=>({...raw,findings:raw.findings.map(r=>({...r,status:'unresolved',category:'factual_risk',reason:'Synthetic negative control: potential unsupported promise requires evidence.'}))})});await queued(f);const view=await finishReview(f),review=view.decisions.find(d=>d.commandId===f.request.commandId).contributionContinuation.feedbackReview;assert.equal(review.producerResponses[0].action,'applied');assert.equal(review.findings[0].category,'factual_risk');assert.equal(review.hasBlockingFindings,true);assert.equal(view.pendingContinuation.status,'feedback_review_unresolved');
});
test('saved successful revision and feedback review survive lost responses without another invocation',async t=>{
 const f=await fixture(t,{loseRevisionResponse:true,loseReviewResponse:true});await queued(f);await assert.rejects(f.c.advanceContribution(f.created.id,f.request.commandId),{code:'TEST_REVISION_COMMITTED'});f.reopen();await f.c.advanceContribution(f.created.id,f.request.commandId);assert.equal(f.modelCalls.length-f.initialModelCalls,1);await f.c.advanceContribution(f.created.id,f.request.commandId);await assert.rejects(f.c.advanceContribution(f.created.id,f.request.commandId),{code:'TEST_REVIEW_COMMITTED'});f.reopen();const result=await f.c.advanceContribution(f.created.id,f.request.commandId);assert.equal(result.decisions.find(d=>d.commandId===f.request.commandId).contributionContinuation.status,'feedback_review_addressed');assert.equal(f.modelCalls.length-f.initialModelCalls,2);
});

test('public advance follows only admitted contribution continuation and never loops the old strategy stage',async t=>{
 const f=await fixture(t);await f.c.decide(f.created.id,f.request);let view=await f.c.read(f.created.id);assert.equal(view.nextAction.status,'pending');
 for(let step=0;step<4;step++)view=await f.c.advance(f.created.id,{commandId:'contribution-step-'+step});
 assert.equal(view.pendingContinuation,undefined);assert.equal(view.decisions.find(d=>d.commandId===f.request.commandId).contributionContinuation.status,'feedback_review_addressed');assert.equal(view.complete,false);assert.equal(f.modelCalls.length-f.initialModelCalls,2);
});

test('unknown revision with no saved successful completion is not retried or advanced',async t=>{
 let invocations=0;const f=await fixture(t,{revisionVariant:()=>{invocations++;throw Object.assign(Error('Synthetic unresolved invocation'),{status:'awaiting_reconciliation'});}});const queue=await queued(f);await assert.rejects(f.c.advanceContribution(f.created.id,f.request.commandId),{code:'LOCAL_CONTRIBUTION_ORIGINAL_OUTCOME_UNKNOWN'});const before=f.real.store.read('p').jobs.find(j=>j.id===queue.jobId);assert.equal(before.attempts.length,1);f.reopen();await assert.rejects(f.c.advanceContribution(f.created.id,f.request.commandId),{code:'LOCAL_CONTRIBUTION_ORIGINAL_OUTCOME_UNKNOWN'});assert.equal(invocations,1);assert.equal(f.real.store.read('p').jobs.find(j=>j.id===queue.jobId).attempts.length,1);assert.equal((await f.c.read(f.created.id)).nextAction.status,'awaiting_reconciliation');
});
test('saved review or revised artifact tampering blocks read and later public advance',async t=>{
 const f=await fixture(t);await queued(f);await finishReview(f);const p=f.real.store.read('p'),a=p.artifacts.find(a=>a.id===p.activeByStage.strategy),jobs=p.jobs.length;await writeFile(a.payloadRef,'{}');const view=await f.c.read(f.created.id);assert.equal(view.nextAction.reason,'LOCAL_CONTRIBUTION_REVIEW_ORIGINAL_CHANGED');assert.equal(view.complete,false);assert.equal(view.editorDocumentId,null);await f.c.advance(f.created.id,{commandId:'after-tamper'});assert.equal(f.real.store.read('p').jobs.length,jobs);assert.equal(f.modelCalls.length-f.initialModelCalls,2);
});
test('partly-applied producer reply remains visible and can be unresolved under independent review',async t=>{
 const f=await fixture(t,{revisionVariant:raw=>({...raw,summary:'Partial local synthetic response.',feedbackResponses:raw.feedbackResponses.map(r=>({...r,action:'partly_applied',outputLocations:[{location:'/summary',quote:'Partial local synthetic response.'}]}))})});await queued(f);const view=await finishReview(f),review=view.decisions.find(d=>d.commandId===f.request.commandId).contributionContinuation.feedbackReview;assert.equal(review.producerResponses[0].action,'partly_applied');assert.equal(review.findings[0].status,'unresolved');assert.equal(view.pendingContinuation.status,'feedback_review_unresolved');
});

test('a live original revision writer cannot be taken over by another coordinator',async t=>{
 let arrived,release,invocations=0;const started=new Promise(r=>arrived=r),wait=new Promise(r=>release=r),f=await fixture(t,{revisionVariant:async raw=>{invocations++;arrived();await wait;return raw;}});const queue=await queued(f),running=f.c.advanceContribution(f.created.id,f.request.commandId);await started;const other=openLocalAcceptanceCoordinator(f.config);
 try{assert.equal((await other.read(f.created.id)).nextAction.status,'awaiting_reconciliation');await assert.rejects(other.advanceContribution(f.created.id,f.request.commandId),{code:'LOCAL_CONTRIBUTION_PHASE_WRITER_UNRESOLVED'});assert.equal(invocations,1);assert.equal(f.real.store.read('p').jobs.find(j=>j.id===queue.jobId).attempts.length,1);}finally{other.close();release();}await running;assert.equal(invocations,1);
});
test('engineering revision and feedback response handler refuses nonlocal model bindings',()=>{
 for(const binding of [{providerId:'remote',model:'synthetic'},{providerId:'local-synthetic',model:'paid-model'}])assert.throws(()=>localContributionResponse({job:{purpose:'feedback_review',task:{feedbackReviewInput:{}},binding},packet:{}}),{code:'LOCAL_CONTRIBUTION_SYNTHETIC_BINDING_REQUIRED'});
});
