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

test('independent default-off guard refuses direct contribution execution as well as public advance',async t=>{
 const f=await fixture(t),q=await queued(f),off=openLocalAcceptanceCoordinator({...f.config,contributionExecution:false});t.after(off.close);const before=f.modelCalls.length;
 let error;try{await off.advanceContribution(f.created.id,f.request.commandId);}catch(e){error=e.code;}const job=f.real.store.read('p').jobs.find(j=>j.id===q.jobId);
 console.log('DEFAULT_OFF_EXECUTION '+JSON.stringify({error:error??null,newModelCalls:f.modelCalls.length-before,jobStatus:job.status,attempts:job.attempts.length}));
 assert.equal(error,'LOCAL_CONTRIBUTION_EXECUTION_DISABLED');await assert.rejects(off.advance(f.created.id,{commandId:'disabled-public'}),{code:'LOCAL_CONTRIBUTION_CONTINUATION_PENDING'});assert.equal(f.modelCalls.length,before,'Default-off coordinator must not dispatch contribution model work through its returned direct method');assert.equal(job.attempts.length,0);
});
test('independent journal-status tamper cannot turn an actual unresolved report into addressed continuation',async t=>{
 const f=await fixture(t,{reviewVariant:raw=>({...raw,findings:raw.findings.map(r=>({...r,status:'unresolved',category:'factual_risk',reason:'Explicit negative engineering control.'}))})});await queued(f);await finishReview(f);const before=f.modelCalls.length,db=new DatabaseSync(join(f.root,'case.sqlite'));
 try{const row=db.prepare('SELECT body FROM acceptance_decision_intents WHERE id=? AND command_id=?').get(f.created.id,f.request.commandId),intent=JSON.parse(row.body);assert.equal(intent.continuation.feedbackReview.hasBlockingFindings,true);intent.continuation.status='feedback_review_addressed';db.prepare('UPDATE acceptance_decision_intents SET body=? WHERE id=? AND command_id=?').run(JSON.stringify(intent),f.created.id,f.request.commandId);}finally{db.close();}
 const view=await f.c.read(f.created.id);console.log('NEGATIVE_STATUS_PROMOTION '+JSON.stringify({reason:view.nextAction.reason,pending:view.pendingContinuation??null,complete:view.complete}));
 assert.equal(view.nextAction.reason,'LOCAL_CONTRIBUTION_REVIEW_ORIGINAL_CHANGED');assert.equal(view.complete,false);await assert.rejects(f.c.advanceContribution(f.created.id,f.request.commandId),{code:'LOCAL_CONTRIBUTION_REVIEW_STATUS_CHANGED'});assert.equal((await f.c.read(f.created.id)).decisions.find(d=>d.commandId===f.request.commandId).contributionDisposition,'feedback_unresolved');assert.equal(f.modelCalls.length,before);
});
