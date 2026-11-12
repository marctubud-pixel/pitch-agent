import {gunzipSync} from 'node:zlib';
import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {imageTask,sketchHash} from './sketch-authority.mjs';
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
import {readSketchUnresolvedGraph} from './sketch-read-graph.mjs';import {buildReviewRequest} from './sketch-review-v2.mjs';
const source=new URL('../../apps/workbench-preview/test-fixtures/sketch-readback/metadata.json.gz',import.meta.url);
const f=JSON.parse(gunzipSync(await readFile(source)));
function fixture(review){const p=structuredClone(f.project),g=p.sketchGenerations[0],run=p.sketchReviewRuns[0];if(review){run.reports=[];const j=structuredClone(f.expected[0].job),node=run.nodes.find(n=>n.key===j.nodeKey);j.task={id:j.id,request:buildReviewRequest(run,node,[]).request};p.jobs.push(j);}else p.sketchReviewRuns=[];const j=p.jobs.at(-1);j.status='awaiting_reconciliation';j.attemptId='metadata-unknown';j.attempts=[{id:j.attemptId,status:j.status,dispatchStarted:true,executor:{actorType:'agent',actorId:'metadata',runId:'metadata',contextId:'metadata'},...(j.purpose==='image_candidate'?{requestHash:sketchHash(stable(imageTask(p,g,j,j.attemptId))),allowanceFamilyId:j.allowanceFamilyId}:{})}];delete j.outputVersionIds;return {p,g,run:review?run:null,j};}
test('unresolved metadata reader retains exact production/review status and attempts without claiming IO/current authority',()=>{for(const review of [false,true]){const{p,g,run}=fixture(review),before=JSON.stringify(p),read=readSketchUnresolvedGraph(p,g,run);assert.equal(read.kind,'unresolved');assert.equal(read.writeEligible,false);assert.equal(read.physicalIOVerified,false);assert.equal(JSON.stringify(p),before);}});
test('unresolved graph refuses foreign task/node/parent/binding/attempt shape rather than normalizing unknown to queued',()=>{for(const mutate of [({j})=>j.task.parentId='foreign',({j})=>j.binding.role='foreign',({j})=>j.nodeKey='foreign',({j})=>j.attempts[0].executor.contextId='',({j})=>j.attemptId='different',({j})=>j.role='extra']){const x=fixture(false);mutate(x);assert.throws(()=>readSketchUnresolvedGraph(x.p,x.g,x.run),{code:'SKETCH_READ_GRAPH_CHANGED'});}});

import {createSketchNativeReader} from './sketch-native-reader.mjs';
test('even empty-generation envelope cannot be manufactured by a forged read-admission return',async()=>{const p={id:'no-brand',revision:0,sketchGenerations:[]};const reader=createSketchNativeReader({store:{read:()=>p,withReadAdmission:async()=>({kind:'complete',value:{revision:0}})},rootDir:'/not-used'});await assert.rejects(reader.envelope(p),{code:'SKETCH_READ_ADMISSION_FAILED'});});

test('unknown image request must match stable native imageTask for this exact attempt, never only a digest shape',()=>{
 for(const change of [x=>x.j.attempts[0].requestHash='0'.repeat(64),x=>x.j.attempts[0].requestHash='f'.repeat(64),x=>x.j.attempts[0].requestHash=sketchHash(stable(imageTask(x.p,x.g,x.p.jobs.find(j=>j.purpose==='image_candidate'&&j.id!==x.j.id),x.j.attemptId))),x=>{x.j.attemptId='another-attempt';x.j.attempts[0].id=x.j.attemptId;}]){
  const x=fixture(false),a=x.j.attempts[0];
  assert.equal(a.requestHash,sketchHash(stable(imageTask(x.p,x.g,x.j,a.id))));
  assert.equal(readSketchUnresolvedGraph(x.p,x.g,null).kind,'unresolved');
  change(x);assert.throws(()=>readSketchUnresolvedGraph(x.p,x.g,null),{code:'SKETCH_READ_GRAPH_CHANGED'});
 }
});
test('unknown review retains exact buildReviewRequest and binds any retained receipt input packet to its attempt and model',()=>{
 const x=fixture(true),a=x.j.attempts[0];a.receipt={inputPacketHash:sketchHash({runId:a.id,model:x.j.binding.model,...x.j.task.request})};
 assert.equal(readSketchUnresolvedGraph(x.p,x.g,x.run).kind,'unresolved');
 x.j.task.request=Object.fromEntries(Object.entries(x.j.task.request).reverse());
 const reordered=sketchHash({runId:a.id,model:x.j.binding.model,...x.j.task.request});assert.notEqual(a.receipt.inputPacketHash,reordered);
 assert.equal(readSketchUnresolvedGraph(x.p,x.g,x.run).kind,'unresolved');
 for(const wrong of ['0'.repeat(64),reordered]){a.receipt.inputPacketHash=wrong;assert.throws(()=>readSketchUnresolvedGraph(x.p,x.g,x.run),{code:'SKETCH_READ_GRAPH_CHANGED'});}
 const y=fixture(true);y.j.task.request.extra='foreign';assert.throws(()=>readSketchUnresolvedGraph(y.p,y.g,y.run));
});
