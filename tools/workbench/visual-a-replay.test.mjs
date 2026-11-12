import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createProject,applyCommand,DomainError} from './project.mjs';
import {openStore} from './store.mjs';
import {reduceVisualStep} from './visual-a-http.mjs';
import {createVisualAService,visualMethod} from './visual-a-service.mjs';
import {host} from './simple-strategy-http-fixture.mjs';
const context={actorType:'agent',actorId:'independent-metadata',runId:'independent-metadata',contextId:'independent-metadata'};
const input={id:'independent-a-boundary',name:'Metadata only, no artwork approval',brief:JSON.stringify({format:'proposal-workbench-brief-v1',fields:{proposalType:'packaging'}}),mode:'auto',humanGates:[],authorizedThrough:'final_review',workflowVersion:'proposal-seven-v1'};
function state(){const p=structuredClone(createProject(input,context));p.activeByStage.copy='copy';p.artifacts=[{id:'copy',stage:'copy',contentHash:'copy-hash'}];p.referenceDossiers=[{id:'d',envelope:{envelopeHash:'d-hash',source:{source:{artifactId:'copy'}}}}];p.jobs=[{id:'ref',purpose:'reference',dossierId:'d',binding:{model:'none'},status:'queued',attempts:[]}];return p;}
const request={commandId:'fixed-step',expectedRevision:0,phase:'references',targetId:'d',sourceHash:'d-hash',jobIds:['ref']};

test('portable native actual claim blocks late unknown before native reducer with DomainError',async()=>{
  const p=state();reduceVisualStep(p,{request,method:await visualMethod(p)},context);
  p.jobs.push({...structuredClone(p.jobs[0]),id:'late-unknown',status:'awaiting_reconciliation'});
  assert.throws(()=>applyCommand(p,{kind:'start-job',jobId:'ref',attemptId:'never-created',visualHttpRequestId:request.commandId,commandId:'native-claim',expectedRevision:0},context),e=>e instanceof DomainError&&e.code==='VISUAL_OUTCOME_UNKNOWN');
  assert.equal(p.revision,0);assert.deepEqual(p.jobs[0].attempts,[]);
});

test('portable actual HTTP unknown admission keeps new fixture DB head and ledger unchanged',async t=>{
  const root=await realpath(await mkdtemp(join(tmpdir(),'a-preintegration-only-'))),file=join(root,'db');
  const store=openStore(file);store.create(input,context);store.close();
  const p=state();p.jobs.push({...structuredClone(p.jobs[0]),id:'existing-unknown',status:'awaiting_reconciliation'});
  const db=new DatabaseSync(file);db.prepare('update revisions set snapshot=? where project_id=? and revision=0').run(JSON.stringify(p),p.id);db.close();
  const h=await host({dbPath:file,researchOptions:{rootDir:root,executionAllowed:true}});t.after(()=>h.close());t.diagnostic('Retained isolated metadata fixture '+root);
  const r=await h.request(`/api/v1/projects/${p.id}/visual-workflow/step`,request);
  assert.equal(r.status,422,JSON.stringify(r.body));assert.equal(r.body.error.code,'VISUAL_OUTCOME_UNKNOWN');
  const check=openStore(file);try{assert.equal(check.read(p.id).revision,0);assert.equal(check.read(p.id).visualHttpRequests,undefined);}finally{check.close();}
});


function executor(advance){return {advanceReferences:advance,referenceStatus:async()=>({status:'working'}),referenceCapability:()=>({}),sketchCapability:()=>({}),sketchReviewCapability:()=>({})};}
function memory(p){return {read:()=>structuredClone(p),command:(_id,c,ctx)=>{p=structuredClone(applyCommand(p,c,ctx));return p;},state:()=>p};}
async function setup(){const p=state();reduceVisualStep(p,{request,method:await visualMethod(p)},context);p.jobs[0].status='succeeded';return memory(p);}
test('regression: successful step without saved advance cannot advance with execution disabled',async()=>{const s=await setup();let advances=0;const svc=createVisualAService({store:s,rootDir:'/unused',executor:executor(async()=>{advances++;return ['later'];}),executionAllowed:false});await assert.rejects(svc.step(input.id,request),e=>e.code==='VISUAL_EXECUTION_UNAVAILABLE');assert.equal(advances,0);});
test('regression: saved exact replay returns original progress and never advances later eligible',async()=>{const s=await setup();let advances=0;const svc=createVisualAService({store:s,rootDir:'/unused',executor:executor(async()=>{advances++;return {queuedJobIds:['later-original']};}),executionAllowed:true});const first=await svc.step(input.id,request);const off=createVisualAService({store:s,rootDir:'/unused',executionAllowed:false});const replay=await off.step(input.id,request);assert.equal(advances,1);assert.deepEqual(replay.receipt.progress,first.receipt.progress);await assert.rejects(off.step(input.id,{...request,jobIds:['later']}),e=>e.code==='COMMAND_ID_REUSED');});
test('advance marker survives crash; exact replay is pending/read only and blocks new writes and claims',async()=>{
 const s=await setup();let advances=0;const svc=createVisualAService({store:s,rootDir:'/unused',executor:executor(async()=>{advances++;throw Error('simulated crash after marker');}),executionAllowed:true});
 await assert.rejects(svc.step(input.id,request),/simulated crash/);assert.equal(s.state().visualHttpRequests[0].advance.status,'pending');
 const off=createVisualAService({store:s,rootDir:'/unused',executionAllowed:false});const replay=await off.step(input.id,request);assert.equal(replay.receipt.progress.status,'advance_pending');assert.equal(replay.visual.writesBlocked,true);assert.equal(replay.visual.pendingAdvances.length,1);assert.equal(advances,1);
 await assert.rejects(svc.step(input.id,{...request,commandId:'new'}),e=>e.code==='VISUAL_ADVANCE_PENDING');
 await assert.rejects(svc.command(input.id,'copy-continuations',{commandId:'new',expectedRevision:s.state().revision},context),e=>e.code==='VISUAL_ADVANCE_PENDING');
 const p=s.state();p.jobs.push({...structuredClone(p.jobs[0]),id:'later',status:'queued'});
 for(const admission of [{},{visualHttpRequestId:request.commandId}])assert.throws(()=>applyCommand(p,{kind:'start-job',jobId:'later',attemptId:'must-not-start',commandId:'blocked-claim',expectedRevision:p.revision,...admission},context),e=>e.code==='VISUAL_ADVANCE_PENDING');
 const before=JSON.stringify(s.state());await off.status(input.id);assert.equal(JSON.stringify(s.state()),before);
});
test('concurrent exact replay observes pending; advance called once and completion freezes result',async()=>{
 const s=await setup();let resolveAdvance,entered;const enteredPromise=new Promise(r=>entered=r),gate=new Promise(r=>resolveAdvance=r);let advances=0;
 const svc=createVisualAService({store:s,rootDir:'/unused',executor:executor(async()=>{advances++;entered();await gate;return {queuedJobIds:['original-successor']};}),executionAllowed:true});const first=svc.step(input.id,request);await enteredPromise;const concurrent=await svc.step(input.id,request);assert.equal(concurrent.receipt.progress.status,'advance_pending');resolveAdvance();const done=await first;
 s.state().jobs.push({...structuredClone(s.state().jobs[0]),id:'later-eligible',status:'queued'});const again=await svc.step(input.id,request);assert.deepEqual(again.receipt.progress,done.receipt.progress);assert.equal(advances,1);assert.deepEqual(s.state().visualHttpRequests[0].request.jobIds,['ref']);
});
test('completion commit failure remains durable pending after executor has advanced once',async()=>{
 const s=await setup(),original=s.command;let advances=0;s.command=(id,c,ctx)=>{if(c.kind==='visual-http-advance-completed')throw Error('save failure');return original(id,c,ctx);};const svc=createVisualAService({store:s,rootDir:'/unused',executor:executor(async()=>{advances++;return {done:true};}),executionAllowed:true});await assert.rejects(svc.step(input.id,request),/save failure/);assert.equal((await svc.step(input.id,request)).receipt.progress.status,'advance_pending');assert.equal(advances,1);
});
test('unfinished original step rechecks method/current source and target idle before advance',async()=>{
 for(const mutate of [p=>p.visualHttpRequests[0].method.sha256='f'.repeat(64),p=>p.activeByStage.copy='changed',p=>p.jobs.push({...structuredClone(p.jobs[0]),id:'sibling',status:'running'})]){const s=await setup();mutate(s.state());let advances=0;const svc=createVisualAService({store:s,rootDir:'/unused',executor:executor(async()=>{advances++;}),executionAllowed:true});await assert.rejects(svc.step(input.id,request));assert.equal(advances,0);assert.equal(s.state().visualHttpRequests[0].advance,undefined);}
});
test('legacy no-protocol exact requests stay unrecorded for queued/succeeded and on/off; zero commands/advance',async()=>{for(const status of ['queued','succeeded'])for(const executionAllowed of [false,true]){const p=state();reduceVisualStep(p,{request,method:await visualMethod(p)},context);delete p.visualHttpRequests[0].advanceProtocol;p.jobs[0].status=status;let advances=0,commands=0;const svc=createVisualAService({store:{read:()=>p,command:()=>commands++},rootDir:'/unused',executionAllowed,executor:executor(async()=>advances++)});const r=await svc.step(p.id,request);assert.equal(r.receipt.progress.status,'advance_state_unrecorded');assert.equal(advances,0);assert.equal(commands,0);assert.equal(p.visualHttpRequests[0].advance,undefined);}});
test('portable actual HTTP pending-marker admission rejects new step without touching new DB head',async t=>{const root=await realpath(await mkdtemp(join(tmpdir(),'a-replay-pending-http-'))),file=join(root,'db'),store=openStore(file);store.create(input,context);store.close();let p=state();reduceVisualStep(p,{request,method:await visualMethod(p)},context);p.jobs[0].status='succeeded';p=applyCommand(p,{kind:'visual-http-advance-started',requestId:request.commandId,method:await visualMethod(p),commandId:'marker',expectedRevision:0},context);const db=new DatabaseSync(file);db.prepare('update revisions set snapshot=? where project_id=? and revision=0').run(JSON.stringify({...p,revision:0}),p.id);db.close();const h=await host({dbPath:file,researchOptions:{rootDir:root,executionAllowed:true}});t.after(()=>h.close());t.diagnostic('Retained isolated pending fixture '+root);const r=await h.request(`/api/v1/projects/${p.id}/visual-workflow/step`,{...request,commandId:'blocked-new'});assert.equal(r.status,422);assert.equal(r.body.error.code,'VISUAL_ADVANCE_PENDING');const check=openStore(file);try{assert.equal(check.read(p.id).revision,0);assert.equal(check.read(p.id).visualHttpRequests.length,1);}finally{check.close();}});
test('real new SQLite persists advance result; reopened disabled service replays without revision or executor',async t=>{const root=await realpath(await mkdtemp(join(tmpdir(),'a-replay-durable-'))),file=join(root,'db');let store=openStore(file);store.create(input,context);store.close();const p=state();p.activeByStage.research='metadata-research';p.activeByStage.strategy='metadata-strategy';p.researchQuestionRegistrations=[{taskCardId:p.activeTaskCardId,id:'metadata-q'}];p.releases=[{artifactId:'metadata-research',id:'metadata-release'}];reduceVisualStep(p,{request,method:await visualMethod(p)},context);p.jobs[0].status='succeeded';const db=new DatabaseSync(file);db.prepare('update revisions set snapshot=? where project_id=? and revision=0').run(JSON.stringify(p),p.id);db.close();store=openStore(file);let advances=0;const svc=createVisualAService({store,rootDir:root,executionAllowed:true,executor:executor(async()=>{advances++;return {originalSuccessor:'unexecuted-next'};})});const first=await svc.step(p.id,request),revision=store.read(p.id).revision;store.close();store=openStore(file);try{const off=createVisualAService({store,rootDir:root,executionAllowed:false});assert.deepEqual((await off.step(p.id,request)).receipt.progress,first.receipt.progress);assert.equal(store.read(p.id).revision,revision);assert.equal(advances,1);}finally{store.close();}t.diagnostic('Retained durable new metadata fixture '+root);});
test('new command cannot re-admit original queued IDs to upgrade an unsupported legacy step',async()=>{const p=state();const method=await visualMethod(p);reduceVisualStep(p,{request,method},context);delete p.visualHttpRequests[0].advanceProtocol;assert.throws(()=>reduceVisualStep(p,{request:{...request,commandId:'renamed'},method},context),e=>e.code==='VISUAL_JOB_ALREADY_ADMITTED');});
