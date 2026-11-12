import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {state,input,context,request,executor} from './visual-a-metadata-fixture.mjs';
import {openStore} from './store.mjs';
import {reduceVisualStep,requireVisualClaim} from './visual-a-http.mjs';
import {applyCommand} from './project.mjs';
import {createVisualAService,visualMethod} from './visual-a-service.mjs';
test('a competing stored marker cannot grant the losing caller an advance claim',async t=>{
  const root=await realpath(await mkdtemp(join(tmpdir(),'a-replay-race-only-'))),file=join(root,'db');
  let original=openStore(file);original.create(input,context);original.close();
  const p=state();p.activeByStage.research='metadata-research';p.activeByStage.strategy='metadata-strategy';p.researchQuestionRegistrations=[{taskCardId:p.activeTaskCardId,id:'metadata-q'}];p.releases=[{artifactId:'metadata-research',id:'metadata-release'}];
  reduceVisualStep(p,{request,method:await visualMethod(p)},context);p.jobs[0].status='succeeded';
  const db=new DatabaseSync(file);db.prepare('update revisions set snapshot=? where project_id=? and revision=0').run(JSON.stringify(p),p.id);db.close();
  original=openStore(file);const concurrent=openStore(file);t.after(()=>{original.close();concurrent.close();});t.diagnostic('Retained isolated race DB '+root);
  let inserted=0,loserAdvances=0,winnerRevision,loserRevision;
  const wrapper={read:original.read,command:(id,c,ctx)=>{
    if(c.kind==='visual-http-advance-started'){
      inserted++;
      // Interleave another process after the service's last revision check,
      // before this caller enters the real serialized SQLite transaction.
      const winner=concurrent.command(id,c,{...ctx,actorId:'other-process',runId:'other-process',contextId:'other-process'});
      winnerRevision=winner.revision;
      const loser=original.command(id,c,ctx);loserRevision=loser.revision;return loser;
    }
    return original.command(id,c,ctx);
  }};
  const svc=createVisualAService({store:wrapper,rootDir:root,executionAllowed:true,executor:executor(async()=>{loserAdvances++;return {owner:'caller-who-did-not-win-CAS'};})});
  await assert.rejects(svc.step(p.id,request),{code:'VISUAL_ADVANCE_CLAIM_REQUIRED'});
  assert.equal(inserted,1);assert.equal(winnerRevision,1);assert.equal(loserRevision,1);
  assert.equal(loserAdvances,0);
  const off=createVisualAService({store:original,rootDir:root,executionAllowed:false});const replay=await off.step(p.id,request);assert.equal(replay.receipt.progress.status,'advance_pending');assert.equal(original.read(p.id).revision,1);
});
test('legacy queued request without protocol is rejected at the actual visual claim hook',async()=>{
  const p=state();reduceVisualStep(p,{request,method:await visualMethod(p)},context);
  delete p.visualHttpRequests[0].advanceProtocol;
  assert.throws(()=>requireVisualClaim(p,request.commandId,p.jobs[0]),{code:'VISUAL_LEGACY_ADVANCE_RECONCILIATION_CLOSED'});
  // The legacy protocol is rejected before the unrelated execution-binding guard.
  assert.throws(()=>applyCommand(p,{kind:'start-job',jobId:'ref',attemptId:'not-dispatched',visualHttpRequestId:request.commandId,commandId:'legacy-native-claim',expectedRevision:0},context),{code:'VISUAL_LEGACY_ADVANCE_RECONCILIATION_CLOSED'});
  assert.deepEqual(p.jobs[0].attempts,[]);
});

test('distinct claim marker loses actual SQLite CAS without advance',async t=>{
  const root=await realpath(await mkdtemp(join(tmpdir(),'a-replay-race-only-'))),file=join(root,'db');
  let original=openStore(file);original.create(input,context);original.close();
  const p=state();p.activeByStage.research='metadata-research';p.activeByStage.strategy='metadata-strategy';p.researchQuestionRegistrations=[{taskCardId:p.activeTaskCardId,id:'metadata-q'}];p.releases=[{artifactId:'metadata-research',id:'metadata-release'}];
  reduceVisualStep(p,{request,method:await visualMethod(p)},context);p.jobs[0].status='succeeded';
  const db=new DatabaseSync(file);db.prepare('update revisions set snapshot=? where project_id=? and revision=0').run(JSON.stringify(p),p.id);db.close();
  original=openStore(file);const concurrent=openStore(file);t.after(()=>{original.close();concurrent.close();});t.diagnostic('Retained isolated race DB '+root);
  let inserted=0,loserAdvances=0,winnerRevision,loserRevision;
  const wrapper={read:original.read,command:(id,c,ctx)=>{
    if(c.kind==='visual-http-advance-started'){
      inserted++;
      // Interleave another process after the service's last revision check,
      // before this caller enters the real serialized SQLite transaction.
      const winner=concurrent.command(id,{...c,commandId:c.commandId+'-other'},{...ctx,actorId:'other-process',runId:'other-process',contextId:'other-process'});
      winnerRevision=winner.revision;
      return original.command(id,c,ctx);
    }
    return original.command(id,c,ctx);
  }};
  const svc=createVisualAService({store:wrapper,rootDir:root,executionAllowed:true,executor:executor(async()=>{loserAdvances++;return {owner:'caller-who-did-not-win-CAS'};})});
  await assert.rejects(svc.step(p.id,request),{code:'REVISION_CONFLICT'});
  assert.equal(inserted,1);assert.equal(winnerRevision,1);assert.equal(loserRevision,undefined);
  assert.equal(loserAdvances,0);
  const off=createVisualAService({store:original,rootDir:root,executionAllowed:false});const replay=await off.step(p.id,request);assert.equal(replay.receipt.progress.status,'advance_pending');assert.equal(original.read(p.id).revision,1);
});
test('A native completion refuses another owner or marker and retains pending',async()=>{
 const p=state();reduceVisualStep(p,{request,method:await visualMethod(p)},context);p.jobs[0].status='succeeded';
 const q=applyCommand(p,{kind:'visual-http-advance-started',requestId:request.commandId,method:await visualMethod(p),commandId:'owner-marker',expectedRevision:0},context);
 for(const bad of ['owner','marker'])assert.throws(()=>applyCommand(q,{kind:'visual-http-advance-completed',requestId:request.commandId,markerCommandId:bad==='marker'?'wrong':'owner-marker',progress:{fake:true},commandId:'not-owner-'+bad,expectedRevision:q.revision},bad==='owner'?{...context,actorId:'other'}:context),{code:'VISUAL_ADVANCE_PENDING'});
 assert.equal(q.visualHttpRequests[0].advance.status,'pending');
});
