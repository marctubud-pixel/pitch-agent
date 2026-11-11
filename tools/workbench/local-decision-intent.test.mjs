import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir,hostname} from 'node:os';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {openStore} from './store.mjs';
import {openLocalAcceptanceCoordinator} from './local-acceptance-coordinator.mjs';
import {admittedDecisionPlan,proveDecisionPlan,validateLocalDecisionRequest} from './local-decision-plan.mjs';
const actor=()=>({actorType:'human',actorId:'test-human',runId:'test-run',contextId:'test-context'});
async function fixture(t,mode='after'){
 const root=await mkdtemp(join(tmpdir(),'decision-intent-small-')),store=openStore(join(root,'native.sqlite'));let fail=true,calls=0,c;
 const wrapped={read:(...a)=>store.read(...a),create:(...a)=>store.create(...a),command:(...a)=>{calls++;const journal=new DatabaseSync(join(root,'cases.sqlite'),{readOnly:true});try{const record=JSON.parse(journal.prepare('SELECT body FROM acceptance_decision_intents WHERE command_id=?').get(a[1].commandId).body);assert.equal(record.state,'dispatching');assert.deepEqual(record.steps[0].command,a[1]);}finally{journal.close();}if(mode==='before'&&fail){fail=false;throw Object.assign(Error('before effect'),{code:'TEST_BEFORE_EFFECT'});}const p=store.command(...a);if(mode==='after'&&fail){fail=false;throw Object.assign(Error('after effect'),{code:'TEST_AFTER_EFFECT'});}return p;}};
 const config={databasePath:join(root,'cases.sqlite'),projectStore:wrapped,executor:{}};c=openLocalAcceptanceCoordinator(config);t.after(async()=>{c.close();store.close();await rm(root,{recursive:true,force:true});});
 const initial=await c.create({commandId:'create',caseId:'dexian',brief:'得闲25岁轻松社交包装度数未定。'}),request={module:'brief',decision:'approve',commandId:'confirm',expectedBasisHash:initial.nextAction.evidenceHash};
 return {root,store,initial,request,get c(){return c;},get calls(){return calls;},reopen(){c.close();c=openLocalAcceptanceCoordinator(config);}};
}
test('native committed effect reconciles exact original history after restart without resubmission',async t=>{
 const f=await fixture(t);await assert.rejects(f.c.decide(f.initial.id,f.request),{code:'TEST_AFTER_EFFECT'});assert.equal(f.store.read(f.initial.id).confirmations.length,1);await assert.rejects(f.c.advance(f.initial.id,{commandId:'too-early'}),{code:'ACCEPTANCE_DECISION_RECONCILIATION_REQUIRED'});assert.equal((await f.c.read(f.initial.id)).complete,false);f.reopen();const result=await f.c.decide(f.initial.id,f.request);assert.equal(result.nextAction.module,'research');assert.equal(result.decisions.length,1);assert.equal(f.calls,1);await f.c.decide(f.initial.id,f.request);assert.equal(f.calls,1);
});
test('proven terminal interruption before synchronous native effect retries the exact original command',async t=>{
 const f=await fixture(t,'before');await assert.rejects(f.c.decide(f.initial.id,f.request),{code:'TEST_BEFORE_EFFECT'});assert.equal(f.store.read(f.initial.id).confirmations.length,0);f.reopen();const result=await f.c.decide(f.initial.id,f.request);assert.equal(result.nextAction.module,'research');assert.equal(result.decisions.length,1);assert.equal(f.calls,2);assert.equal(f.store.read(f.initial.id).confirmations.length,1);await f.c.decide(f.initial.id,f.request);assert.equal(f.calls,2);
});
test('altered body cannot reuse an admitted command even when its native effect committed',async t=>{
 const f=await fixture(t);await assert.rejects(f.c.decide(f.initial.id,f.request));await assert.rejects(f.c.decide(f.initial.id,{...f.request,comment:'different'}),{code:'ACCEPTANCE_COMMAND_REUSED'});assert.equal(f.calls,1);
});
test('unrelated policy, task or other head changes stop recovery instead of waiving fresh evidence',async t=>{
 for(const kind of ['set-policy','revise-task-card']){
  const f=await fixture(t);await assert.rejects(f.c.decide(f.initial.id,f.request));const p=f.store.read(f.initial.id),command=kind==='set-policy'?{kind,mode:'auto',humanGates:[]}:{kind,taskCardId:'new-task',brief:'new independent brief'};f.store.command(p.id,{...command,commandId:'independent-change',expectedRevision:p.revision},actor());f.reopen();await assert.rejects(f.c.decide(f.initial.id,f.request),{code:'ACCEPTANCE_DECISION_RECONCILIATION_REQUIRED'});assert.equal((await f.c.read(p.id)).decisions.length,0);assert.equal(f.calls,1);
 }
});
test('concurrent same decision shares one effect while another request is rejected',async t=>{
 const f=await fixture(t,'none'),a=f.c.decide(f.initial.id,f.request),b=f.c.decide(f.initial.id,{...f.request});await assert.rejects(f.c.decide(f.initial.id,{...f.request,commandId:'other'}),{code:'ACCEPTANCE_DECISION_IN_PROGRESS'});await Promise.all([a,b]);assert.equal(f.calls,1);assert.equal((await f.c.read(f.initial.id)).decisions.length,1);
});
test('admitted no-effect checkpoint proof is exact and unadapted phases cannot recover generically',async t=>{
 const f=await fixture(t,'none'),p=f.store.read(f.initial.id),request={...f.request,module:'strategy'},state={nextAction:{underlyingStatus:'complete',evidenceHash:'a'.repeat(64)}};
 const noEffect=admittedDecisionPlan({project:p,state,request,actor:actor(),hasExternalEffect:false});assert.equal(proveDecisionPlan(noEffect,f.store).status,'no_effect');
 const external=admittedDecisionPlan({project:p,state,request,actor:actor(),hasExternalEffect:true});assert.throws(()=>proveDecisionPlan(external,f.store),{code:'ACCEPTANCE_DECISION_PLAN_UNSUPPORTED'});
 f.store.command(p.id,{kind:'set-policy',mode:'auto',humanGates:[],commandId:'change',expectedRevision:p.revision},actor());assert.throws(()=>proveDecisionPlan(noEffect,f.store),{code:'ACCEPTANCE_DECISION_SOURCE_CHANGED'});
});
test('intent including exact planned command is durable before the native command is invoked',async t=>{
 const f=await fixture(t);await assert.rejects(f.c.decide(f.initial.id,f.request));const db=new DatabaseSync(join(f.root,'cases.sqlite'),{readOnly:true});try{const body=JSON.parse(db.prepare('SELECT body FROM acceptance_decision_intents').get().body);assert.equal(body.protocol,'local-decision-intent-v1');assert.equal(body.steps[0].command.taskCardId,f.store.read(f.initial.id).taskCards[0].id);assert.equal(body.actor.actorType,'human');assert.equal(body.requestHash.length,64);assert.equal(body.before.snapshotHash.length,64);assert.equal(body.state,'interrupted');}finally{db.close();}
});

test('a live or unverifiable decision writer is never taken over even when the command is committed',async t=>{
 for(const host of [hostname(),'unverifiable-host']){
  const f=await fixture(t);await assert.rejects(f.c.decide(f.initial.id,f.request));const db=new DatabaseSync(join(f.root,'cases.sqlite'));try{const row=db.prepare('SELECT body FROM acceptance_decision_intents').get(),intent=JSON.parse(row.body);intent.state='dispatching';intent.owner={host,pid:process.pid};db.prepare('UPDATE acceptance_decision_intents SET body=?').run(JSON.stringify(intent));}finally{db.close();}
  f.reopen();await assert.rejects(f.c.decide(f.initial.id,f.request),{code:'ACCEPTANCE_DECISION_WRITER_UNRESOLVED'});assert.equal(f.calls,1);assert.equal((await f.c.read(f.initial.id)).decisions.length,0);
 }
});
test('proven exited synchronous writer plus exact unchanged head permits the same frozen command only',async t=>{
 const f=await fixture(t,'before');await assert.rejects(f.c.decide(f.initial.id,f.request));const child=spawnSync(process.execPath,['-e','']);assert.equal(child.status,0);assert.throws(()=>process.kill(child.pid,0),e=>e.code==='ESRCH');
 const db=new DatabaseSync(join(f.root,'cases.sqlite'));try{const intent=JSON.parse(db.prepare('SELECT body FROM acceptance_decision_intents').get().body);intent.state='dispatching';intent.nativeSyncTerminal=false;intent.owner={host:hostname(),pid:child.pid};db.prepare('UPDATE acceptance_decision_intents SET body=?').run(JSON.stringify(intent));}finally{db.close();}
 f.reopen();assert.equal((await f.c.decide(f.initial.id,f.request)).nextAction.module,'research');assert.equal(f.calls,2);assert.equal(f.store.read(f.initial.id).confirmations.length,1);
});

test('unsupported actions and contributions reject before admission and a valid approve stays usable',async t=>{
 const f=await fixture(t,'none');
 for(const bad of [{decision:'revise'},{decision:'reject'},{contribution:'change this brief'},{unexpected:'unknown shape'}]){
  await assert.rejects(f.c.decide(f.initial.id,{...f.request,...bad}),e=>e.status===422);const db=new DatabaseSync(join(f.root,'cases.sqlite'),{readOnly:true});try{assert.equal(db.prepare('SELECT count(*) n FROM acceptance_decision_intents').get().n,0);}finally{db.close();}
 }
 assert.equal((await f.c.decide(f.initial.id,f.request)).nextAction.module,'research');assert.equal(f.calls,1);
});
test('known native adoption contracts preflight inputs while selected complete checkpoints use no-effect route',()=>{
 for(const module of ['references','sketch','visual','content','final_review']){
  const state={nextAction:{module,status:'awaiting_user',reason:module==='final_review'?'LOCAL_ENGINEERING_HUMAN_GATE':module==='visual'?'HUMAN_GATE':'native human gate'}},request={module,decision:'approve',commandId:'human',expectedBasisHash:'a'.repeat(64)},options={hasDriver:true,hasEngineeringPanel:true};
  assert.equal(validateLocalDecisionRequest(request,state,options).kind,'unadapted_external_effect');
  for(const bad of [{decision:'revise'},{decision:'reject'},{contribution:'new theme'}])assert.throws(()=>validateLocalDecisionRequest({...request,...bad},state,options),e=>e.status===422);
  assert.equal(validateLocalDecisionRequest(request,{nextAction:{...state.nextAction,underlyingStatus:'complete'}},options).kind,'selected_checkpoint_no_effect');
 }
});
