import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,applyCommand,DomainError} from './project.mjs';
import {reduceVisualBStep,requireVisualBClaim} from './visual-b-http.mjs';
import {createVisualBService} from './visual-b-service.mjs';
import {createFinalVisualRuntime} from './final-visual-runtime.mjs';
const sha='a'.repeat(64),context={actorType:'agent',actorId:'fixture-agent',runId:'fixture-run',contextId:'fixture-context',now:'2026-11-12T00:00:00.000Z'};
function state() {
  const p=structuredClone(createProject({id:'b-boundary-fixture',name:'Boundary metadata only; no artwork approval',brief:'No business chain',mode:'auto',humanGates:[],authorizedThrough:'visual',workflowVersion:'proposal-seven-v1'},context));
  p.finalVisualRuns=[{id:'fixture-final',source:{sourceHash:sha}}];p.finalVisualHeadRunId='fixture-final';
  p.jobs=[{id:'j1',finalVisualRunId:'fixture-final',purpose:'final_visual_plan',node:{key:'planner',phase:'planner'},binding:{providerId:'disabled-fixture',model:'none'},status:'queued',attempts:[]},{id:'j2',finalVisualRunId:'fixture-final',purpose:'final_visual_review',node:{key:'score:visual',phase:'score'},binding:{providerId:'disabled-fixture',model:'none'},status:'queued',attempts:[]}];
  return p;
}
const method={path:'skills/visual-development-lead/SKILL.md',version:'1.0.0',sha256:sha,carrier:'packaging',appendices:['stage-review','records','packaging'].map(x=>({path:`skills/visual-development-lead/references/${x}.md`,sha256:sha}))};
const request={commandId:'fixed-step',expectedRevision:0,phase:'final_visual',targetId:'fixture-final',sourceHash:sha,jobIds:['j1','j2']};
test('native applyCommand persists fixed ledger and preserves exact replay/CAS',()=>{
  const p=state(),command={kind:'visual-b-http-step',commandId:request.commandId,expectedRevision:0,request,method};
  const q=applyCommand(p,command,context);
  assert.equal(q.visualBHttpRequests.length,1);assert.equal(q.revision,1);
  const again=applyCommand(q,command,context);assert.equal(again.revision,1);assert.equal(again.visualBHttpRequests.length,1);
  assert.throws(()=>applyCommand(q,{...command,request:{...request,jobIds:['j2']}},context),{code:'COMMAND_ID_REUSED'});
  assert.throws(()=>applyCommand(q,{...command,commandId:'new'},context),{code:'REVISION_CONFLICT'});
});
test('same-target unknown is caught by actual native claim hook before native upstream authority',()=>{
  const p=state();reduceVisualBStep(p,{request,method},context);p.jobs[1].status='awaiting_reconciliation';
  assert.throws(()=>applyCommand(p,{kind:'claim-final-visual',jobId:'j1',attemptId:'attempt1',visualBHttpRequestId:request.commandId,commandId:'claim',expectedRevision:0},context),{code:'VISUAL_B_OUTCOME_UNKNOWN'});
  assert.equal(p.jobs[0].attempts.length,0);
});
test('current workflow generic final claim cannot bypass B admission',()=>{
  const p=state();assert.throws(()=>applyCommand(p,{kind:'claim-final-visual',jobId:'j1',attemptId:'attempt1',commandId:'claim',expectedRevision:0},context),{code:'VISUAL_B_LEDGER_REQUIRED'});
});
test('upstream Q and binding mutations reject native claim admission',()=>{
  for(const change of ['Q','binding']) {
    const p=state();reduceVisualBStep(p,{request,method},context);
    if(change==='Q')p.researchQuestionRegistrations=[{taskCardId:p.activeTaskCardId,id:'changed'}];else p.jobs[0].binding.model='changed';
    assert.throws(()=>requireVisualBClaim(p,request.commandId,p.jobs[0]),e=>e instanceof DomainError&&['VISUAL_B_STALE','VISUAL_B_JOB_CHANGED'].includes(e.code));
  }
});
test('native runtime refuses unscoped current-workflow continuation before any store.command',async()=>{
  const p=state();let commands=0;
  const runtime=createFinalVisualRuntime({store:{read:()=>p,command:()=>commands++},root:'/unused',sketchReviews:{},providers:{},bindings:{}});
  await assert.rejects(runtime.continueFinalVisual(p.id,{commandId:'no-scope',expectedRevision:0}),{code:'VISUAL_B_SCOPE_REQUIRED'});
  await assert.rejects(runtime.advanceFinalVisual(p.id),{code:'VISUAL_B_SCOPE_REQUIRED'});
  assert.equal(commands,0);
});
test('B defaults disabled even if a native executor is configured',async()=>{
  const p=state();let calls=0;const service=createVisualBService({store:{read:()=>p},executor:{finalVisualCapability:()=>({configured:true}),execute:()=>calls++}});
  assert.equal(service.capability().executionAllowed,false);
  await assert.rejects(service.step(p.id,request),{code:'VISUAL_B_EXECUTION_UNAVAILABLE'});
  assert.equal(calls,0);
});
test('service stops a later fixed queued job after first produces unknown',async()=>{
  const p=state();reduceVisualBStep(p,{request,method},context);
  // Replay avoids manufacturing an upstream authority. The method is the actual local method.
  const {visualMethod}=await import('./visual-a-service.mjs');
  p.taskCards[0].brief=JSON.stringify({format:'proposal-workbench-brief-v1',fields:{proposalType:'packaging'}});
  p.visualBHttpRequests=[];reduceVisualBStep(p,{request,method:await visualMethod(p)},context);
  let calls=0;const service=createVisualBService({store:{read:()=>p},executionAllowed:true,executor:{execute:async()=>{calls++;p.jobs[0].status='awaiting_reconciliation';}}});
  await assert.rejects(service.step(p.id,request),{code:'VISUAL_B_OUTCOME_UNKNOWN'});
  assert.equal(calls,1);assert.equal(p.jobs[1].attempts.length,0);
});
test('own result anchor is exact-attempt only at native reducer entry',()=>{
  const p=state();reduceVisualBStep(p,{request,method},context);
  Object.assign(p.jobs[0],{status:'running',visualBHttpRequestId:request.commandId,attempts:[{id:'attempt-own',executor:context}]});
  assert.throws(()=>applyCommand(p,{kind:'anchor-final-visual',jobId:'j1',attemptId:'other-attempt',commandId:'anchor',expectedRevision:0},context),{code:'VISUAL_B_OUTCOME_UNKNOWN'});
  p.jobs[1].status='running';
  assert.throws(()=>applyCommand(p,{kind:'anchor-final-visual',jobId:'j1',attemptId:'attempt-own',commandId:'anchor',expectedRevision:0},context),{code:'VISUAL_B_OUTCOME_UNKNOWN'});
});
test('one-shot advance ledger records pending and never permits a second advance',()=>{
  const p=state();reduceVisualBStep(p,{request,method},context);p.jobs.forEach(j=>j.status='succeeded');
  const command={kind:'visual-b-http-advance',requestId:request.commandId,commandId:'advance',expectedRevision:0};
  const next=applyCommand(p,command,context);assert.equal(next.visualBHttpRequests[0].advanceStarted,true);
  assert.throws(()=>applyCommand(next,{...command,commandId:'different-advance',expectedRevision:1},context),{code:'VISUAL_B_ADVANCE_ALREADY_STARTED'});
});
test('pending advance is read-only on exact replay and blocks new step/continuation/adoption/release',async()=>{
  const p=state();reduceVisualBStep(p,{request,method},context);p.jobs.forEach(j=>j.status='succeeded');p.visualBHttpRequests[0].advanceStarted=true;
  let calls=0;const service=createVisualBService({store:{read:()=>p,command:()=>calls++},executionAllowed:true,executor:{execute:()=>calls++,continueFinalVisual:()=>calls++,releaseFinalVisual:()=>calls++}});
  const replay=await service.step(p.id,request);assert.equal(replay.receipt.progress.status,'advance_pending');assert.equal(replay.visualB.writesBlocked,true);assert.deepEqual(replay.visualB.queuedJobIds,[]);
  for(const task of [()=>service.step(p.id,{...request,commandId:'new'}),()=>service.continuation(p.id,{commandId:'new'}),()=>service.adopt(p.id,{commandId:'new'},{actorType:'human'}),()=>service.release(p.id,{commandId:'new'})])await assert.rejects(task(),{code:'VISUAL_B_ADVANCE_PENDING'});
  assert.equal(calls,0);
});
