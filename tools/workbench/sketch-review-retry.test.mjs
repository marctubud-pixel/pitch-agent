import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore} from './store.mjs';
import {createSketchReviewRuntime} from './sketch-review-runtime.mjs';

const actor={actorType:'agent',actorId:'retry-test',runId:'retry-run',contextId:'retry-context'};
function fixture(t) {
  const store=openStore(':memory:');
  t.after(()=>store.close());
  store.create({id:'p',name:'Retry regression',brief:'Only continuation identity, no generation or provider work.'},actor);
  const runtime=createSketchReviewRuntime({store,root:'/unused-owned-retry-root',sketches:{sketchReviewInput(){assert.fail('No completed generation exists');}},providers:{},bindings:{},imageStore:{}});
  return {store,runtime};
}
const blocked={status:'blocked',reason:'SKETCH_GENERATION_REQUIRED',message:'Completed generation required',queuedJobIds:[]};

test('exact sketch review intent retries keep the original revision after the committed head advances',async t=>{
  const {store,runtime}=fixture(t),request={commandId:'first',expectedRevision:0};
  assert.deepEqual(await runtime.continueSketchReview('p',request),blocked);
  const committed=store.read('p');
  assert.equal(committed.revision,1);
  assert.deepEqual(await runtime.continueSketchReview('p',request),blocked);
  assert.deepEqual(store.read('p'),committed);
  assert.deepEqual(await runtime.continueSketchReview('p',{commandId:'second',expectedRevision:1}),blocked);
  const advanced=store.read('p');
  assert.equal(advanced.revision,2);
  assert.deepEqual(await runtime.continueSketchReview('p',request),blocked);
  assert.deepEqual(store.read('p'),advanced);
  assert.equal(advanced.sketchReviewIntents.length,2);
  assert.equal(advanced.jobs.length,0);
});

test('changed persisted intent and changed command payload reject without effects',async t=>{
  const {store,runtime}=fixture(t);
  const command={kind:'request-sketch-review',commandId:'first',expectedRevision:0};
  store.command('p',command,actor);
  const committed=store.read('p');
  assert.throws(()=>store.command('p',{...command,kind:'request-complete-content'},actor),{code:'COMMAND_ID_REUSED'});
  assert.throws(()=>store.command('p',{...command,changedIntent:true},actor),{code:'COMMAND_ID_REUSED'});
  await assert.rejects(runtime.continueSketchReview('p',{commandId:'first',expectedRevision:0,changedIntent:true}),{code:'INVALID_SKETCH_INTENT'});
  assert.deepEqual(store.read('p'),committed);
  store.command('p',{kind:'request-complete-content',commandId:'other-kind',expectedRevision:1},actor);
  const other=store.read('p');
  await assert.rejects(runtime.continueSketchReview('p',{commandId:'other-kind',expectedRevision:1}),{code:'COMMAND_ID_REUSED'});
  assert.deepEqual(store.read('p'),other);
});

test('new stale intent and untrusted or missing context cannot mutate the store',async t=>{
  const {store,runtime}=fixture(t);
  await runtime.continueSketchReview('p',{commandId:'first',expectedRevision:0});
  const committed=store.read('p'),command={kind:'request-sketch-review',commandId:'new',expectedRevision:1};
  await assert.rejects(runtime.continueSketchReview('p',{commandId:'stale',expectedRevision:0}),{code:'REVISION_CONFLICT'});
  assert.throws(()=>store.command('p',command,{...actor,actorType:'human'}),{code:'REVIEW_TRUSTED_RUNTIME_REQUIRED'});
  assert.throws(()=>store.command('p',command,{}),{code:'CONTEXT_REQUIRED'});
  assert.deepEqual(store.read('p'),committed);
});
