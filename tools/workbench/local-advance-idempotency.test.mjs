import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readdir,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {hostname} from 'node:os';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {openStore} from './store.mjs';
import {createExecutor} from './executor.mjs';
import {openLocalAcceptanceCoordinator} from './local-acceptance-coordinator.mjs';
import {acceptanceAdvanceRequest} from '../local-acceptance/server.mjs';
async function fixture(t,{effect,inspection}={}){
 const root=await mkdtemp(join(tmpdir(),'local-advance-command-')),projectStore=openStore(join(root,'projects.sqlite'));let calls=0,coordinator;
 const executor=createExecutor({store:projectStore,rootDir:root,providers:{local:{model:'synthetic',execute:()=>{throw Error('Model calls forbidden');}}},bindings:{research:{providerId:'local',model:'synthetic',role:'research-lead'}}});
 const configuration={databasePath:join(root,'commands.sqlite'),projectStore,executor,drivers:{research:{inspect:async ctx=>inspection?inspection(ctx):({status:'pending',reason:'Engineering pending driver only'}),advance:async ctx=>{calls++;return effect?effect({...ctx,projectStore,executor,root,calls}):undefined;}}}};
 coordinator=openLocalAcceptanceCoordinator(configuration);
 t.after(async()=>{coordinator.close();projectStore.close();let size=0;const walk=async dir=>{for(const entry of await readdir(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isDirectory())await walk(path);else size+=(await stat(path)).size;}};await walk(root);assert(size<=10*1024*1024,'fixture writes exceed 10MiB');await rm(root,{recursive:true,force:true});});
 const created=await coordinator.create({caseId:'dexian',brief:'得闲，25岁轻松社交包装，度数未定。',commandId:'create'});
 return {root,projectStore,configuration,created,get coordinator(){return coordinator;},get calls(){return calls;},reopen(){coordinator.close();coordinator=openLocalAcceptanceCoordinator(configuration);},async confirm(){return coordinator.decide(created.id,{module:'brief',decision:'approve',commandId:'confirm',expectedBasisHash:created.nextAction.evidenceHash});}};
}
function journal(root,fn){const db=new DatabaseSync(join(root,'commands.sqlite'));try{return fn(db);}finally{db.close();}}
test('same HTTP command returns current state without dispatching the next pending action, including after restart',async t=>{
 const f=await fixture(t,{effect:({project,executor})=>{if(!project.jobs.length)executor.enqueue(project.id,'research');}});await f.confirm();
 const request={commandId:'once',note:{b:2,a:1}};await f.coordinator.advance(f.created.id,request);assert.equal(f.calls,1);assert.equal(f.projectStore.read(f.created.projectId).jobs.length,1);
 await f.coordinator.advance(f.created.id,{note:{a:1,b:2},commandId:'once'});assert.equal(f.calls,1);f.reopen();const replay=await f.coordinator.advance(f.created.id,request);assert.equal(f.calls,1);assert.equal(replay.advanceCommand.state,'completed');assert.equal(replay.advanceCommand.businessSuccess,'not_asserted');
 await assert.rejects(f.coordinator.advance(f.created.id,{commandId:'once',note:{a:3,b:2}}),e=>e.code==='ACCEPTANCE_COMMAND_REUSED'&&e.status===409);
 await f.coordinator.advance(f.created.id,{commandId:'next'});assert.equal(f.calls,2);
});
test('intent is durable before action; committed queued job plus lost response is observed_changed, never redispatched',async t=>{
 const f=await fixture(t,{effect:({project,executor,root})=>{const rows=journal(root,db=>db.prepare('SELECT body FROM acceptance_advances').all());assert.equal(rows.length,1);assert.equal(JSON.parse(rows[0].body).state,'running');executor.enqueue(project.id,'research');throw Object.assign(Error('lost after commit'),{code:'TEST_LOST_RESPONSE'});}});await f.confirm();
 await assert.rejects(f.coordinator.advance(f.created.id,{commandId:'lost'}),{code:'TEST_LOST_RESPONSE'});assert.equal(f.calls,1);const before=f.projectStore.read(f.created.projectId);assert.equal(before.jobs.length,1);assert.equal(before.jobs[0].status,'queued');
 f.reopen();const state=await f.coordinator.advance(f.created.id,{commandId:'lost'});assert.equal(state.advanceCommand.state,'observed_changed');assert.equal(state.advanceCommand.actionOutcome,'unknown');assert.equal(f.calls,1);assert.equal(f.projectStore.read(f.created.projectId).revision,before.revision);
});
test('unchanged interrupted action requires reconciliation and a different command cannot silently retry it',async t=>{
 const f=await fixture(t,{effect:()=>{throw Object.assign(Error('unknown effect'),{code:'TEST_UNKNOWN_EFFECT'});}});await f.confirm();
 await assert.rejects(f.coordinator.advance(f.created.id,{commandId:'unknown'}),{code:'TEST_UNKNOWN_EFFECT'});f.reopen();
 const replay=await f.coordinator.advance(f.created.id,{commandId:'unknown'});assert.equal(replay.advanceCommand.state,'needs_reconciliation');assert.equal(replay.nextAction.status,'awaiting_reconciliation');assert.equal(f.calls,1);
 const other=await f.coordinator.advance(f.created.id,{commandId:'different'});assert.equal(other.advanceCommand.notDispatched,true);assert.equal(other.nextAction.reason,'ACCEPTANCE_ADVANCE_OUTCOME_UNKNOWN');assert.equal(f.calls,1);
});
test('a still-live writer cannot be taken over after revision changes; duplicate and different requests do not dispatch',async t=>{
 let entered,release;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
 const f=await fixture(t,{effect:async({project,executor})=>{executor.enqueue(project.id,'research');entered();await gate;}});await f.confirm();
 const first=f.coordinator.advance(f.created.id,{commandId:'live'});await started;
 const repeated=await f.coordinator.advance(f.created.id,{commandId:'live'});assert.equal(repeated.advanceCommand.state,'running');assert.equal(repeated.nextAction.status,'awaiting_reconciliation');
 const alternate=openLocalAcceptanceCoordinator(f.configuration);try{const result=await alternate.advance(f.created.id,{commandId:'other-owner'});assert.equal(result.advanceCommand.notDispatched,true);assert.equal(f.calls,1);}finally{alternate.close();release();}
 await first;assert.equal((await f.coordinator.advance(f.created.id,{commandId:'live'})).advanceCommand.state,'completed');assert.equal(f.calls,1);
});
test('owner on an unverifiable host cannot be taken over despite changed revision',async t=>{
 const f=await fixture(t);await f.confirm();const p=f.projectStore.read(f.created.projectId);
 const insert=(commandId,basisRevision)=>journal(f.root,db=>{const body={commandId,basisRevision,state:'running',owner:{host:'proven-not-this-host',pid:99999999,runId:'dead-fixture'}};db.prepare('INSERT INTO acceptance_advances VALUES(?,?,?,?)').run(f.created.id,commandId,'unused-hash',JSON.stringify(body));});
 insert('other-host',p.revision-1);const result=await f.coordinator.advance(f.created.id,{commandId:'no-takeover'});assert.equal(result.nextAction.reason,'ACCEPTANCE_ADVANCE_WRITER_UNRESOLVED');assert.equal(f.calls,0);
});
test('human and native reconciliation nodes dispatch zero actions and do not weaken approval basis requirements',async t=>{
 const f=await fixture(t,{inspection:()=>({status:'awaiting_reconciliation',reason:'Native original unknown'})});
 const brief=await f.coordinator.advance(f.created.id,{commandId:'human'});assert.equal(brief.nextAction.status,'awaiting_user');assert.equal(f.calls,0);
 await assert.rejects(f.coordinator.decide(f.created.id,{module:'brief',decision:'approve',commandId:'bad-human',expectedBasisHash:'a'.repeat(64)}),e=>e.code==='ACCEPTANCE_DECISION_STALE'&&e.status===409);
 await f.confirm();const unknown=await f.coordinator.advance(f.created.id,{commandId:'native-unknown'});assert.equal(unknown.nextAction.status,'awaiting_reconciliation');assert.equal(f.calls,0);
});
test('public advance/continue command validation cannot reach trusted no-id shortcut',()=>{
 for(const body of [undefined,null,{},[],{commandId:''},{commandId:'not valid'}])assert.throws(()=>acceptanceAdvanceRequest(body),{code:'ACCEPTANCE_ADVANCE_COMMAND_REQUIRED',status:422});
 const request={commandId:'valid',expectedBasisHash:'unchanged'};assert.equal(acceptanceAdvanceRequest(request),request);
});

test('a proven exited owner is never redispatched: changed revision is observed, unchanged requires reconciliation',async t=>{
 for(const changed of [true,false]){
  const f=await fixture(t);await f.confirm();const p=f.projectStore.read(f.created.projectId),dead=spawnSync(process.execPath,['-e','']);assert.equal(dead.status,0);assert.throws(()=>process.kill(dead.pid,0),e=>e.code==='ESRCH');
  const commandId=changed?'dead-changed':'dead-unchanged',request={commandId},requestHash=createHash('sha256').update(JSON.stringify(JSON.stringify(request))).digest('hex'),body={commandId,basisRevision:p.revision-(changed?1:0),state:'running',owner:{host:hostname(),pid:dead.pid,runId:'exited-fixture'}};
  journal(f.root,db=>db.prepare('INSERT INTO acceptance_advances VALUES(?,?,?,?)').run(f.created.id,commandId,requestHash,JSON.stringify(body)));f.reopen();
  const replay=await f.coordinator.advance(f.created.id,request);assert.equal(replay.advanceCommand.state,changed?'observed_changed':'needs_reconciliation');assert.equal(replay.advanceCommand.actionOutcome,'unknown');assert.equal(f.calls,0);
 }
});
