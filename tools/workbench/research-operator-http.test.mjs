import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {createServer} from './server.mjs';
import {syntheticResearch,bindings,declarationRequest,releaseRequest,continuationRequest,human,acceptedOperatorResearch} from './research-operator-fixture.mjs';

async function httpFixture(t,{accepted=false}={}){
  const f=await syntheticResearch();if(accepted)await acceptedOperatorResearch(f);
  let app;
  const open=async()=>{app=createServer({dbPath:join(f.root,'db'),rootDir:f.root,port:0,bindings,providers:f.providers,imageProvider:null});await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));};
  await open();
  const request=async(path,body)=>{const res=await fetch(`http://127.0.0.1:${app.address().port}/api/projects/p${path}`,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:res.status,body:await res.json()};};
  t.after(async()=>{await new Promise(resolve=>app.close(resolve));await f.close();});
  return {f,request,drain:()=>app.drain(),reopen:async()=>{await new Promise(resolve=>app.close(resolve));await open();}};
}

test('HTTP saves complete human declaration, executes a separate actual model job, then replays exact command after restart',async t=>{
  const {f,request,drain,reopen}=await httpFixture(t),body=declarationRequest(f,'research_owner',{note:'Exact note\n  two lines  ',unresolvedIssues:['A synthetic nonblocking caveat.']});
  const saved=await request('/research-handoffs',body);assert.equal(saved.status,200,JSON.stringify(saved.body));assert.ok(saved.body.receipt.handoffId);assert.ok(saved.body.receipt.jobId);
  const declaration=saved.body.project.researchHandoffDeclarations[0];for(const key of Object.keys(body.input))assert.deepEqual(declaration[key],body.input[key]);
  assert.deepEqual(declaration.recordedBy,{actorType:'human',actorId:'local-operator'});assert.equal(saved.body.project.releases.length,0);
  await drain();await reopen();const before=(await request('')).body.project.revision,calls=f.calls.length,replay=await request('/research-handoffs',body);
  assert.equal(replay.status,200);assert.equal(replay.body.receipt.replayed,true);assert.equal(replay.body.receipt.handoffId,saved.body.receipt.handoffId);assert.equal(replay.body.project.revision,before);assert.equal(f.calls.length,calls);
  const changed=await request('/research-handoffs',{...body,input:{...body.input,note:'changed'}});assert.equal(changed.body.error.code,'COMMAND_ID_REUSED');
});

test('HTTP rejects fabricated actor, report, binding, target and stale revision without creating ledger entries',async t=>{
  const {f,request}=await httpFixture(t),body=declarationRequest(f);
  for(const key of ['context','actorId','ownerBinding','rawReport','executionReceipt','assessment','approved'])assert.equal((await request('/research-handoffs',{...body,[key]:true})).status,400);
  for(const key of ['recordedBy','createdAt','modelAccepted'])assert.equal((await request('/research-handoffs',{...body,input:{...body.input,[key]:true}})).status,400);
  assert.equal((await request('/research-handoffs',{...body,expectedRevision:0})).status,409);
  assert.equal((await request('/research-handoffs',{...body,basisHash:'0'.repeat(64)})).body.error.code,'STALE_RESEARCH_DECLARATION');
  assert.equal((await request('/research-handoffs',{...body,input:{...body.input,decision:'accepted'}})).body.error.code,'INVALID_RESEARCH_DECLARATION');
  assert.equal(((await request('')).body.project.researchHandoffDeclarations??[]).length,0);
});

test('HTTP release is independent and continuation queues once across restart with truthful human identity',async t=>{
  const {f,request,drain,reopen}=await httpFixture(t,{accepted:true}),body=releaseRequest(f),calls=f.calls.length;
  const released=await request('/research-release',body);assert.equal(released.status,200,JSON.stringify(released.body));assert.equal(f.calls.length,calls);assert.equal(released.body.project.jobs.filter(j=>j.stage==='strategy').length,0);
  assert.equal(released.body.project.releases[0].actorId,'local-operator');assert.equal(released.body.view.researchWorkflow.checks.find(c=>c.id==='release').passed,true);
  const input=continuationRequest(f),queued=await request('/continuations',input);assert.equal(queued.status,202,JSON.stringify(queued.body));assert.equal(queued.body.view.researchWorkflow.alreadyContinued,true);
  await drain();await reopen();const replay=await request('/continuations',input);assert.equal(replay.body.jobId,queued.body.jobId);await drain();
  const result=(await request('')).body;assert.equal(result.project.jobs.filter(j=>j.stage==='strategy').length,1);assert.equal(result.project.releases.length,1);
  assert.equal(f.calls.filter(c=>c.request.outputSchema.properties.outputKind?.enum[0]==='strategy').length,1);
});
