import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from './store.mjs';
import {createCompleteContentRuntime} from './complete-content-runtime.mjs';
import {contentNodes,CONTENT_PROTOCOL} from './complete-content.mjs';

const actor={actorType:'agent',actorId:'owned-coordinator',runId:'owned-run',contextId:'owned-context'};
const human={actorType:'human',actorId:'owned-human',runId:'owned-human-run',contextId:'owned-human-context'};
function configuration() {
 const bindings={},capabilities={};
 for(const node of contentNodes()){
  const role=node.key==='producer:strategy'?'strategy-lead':node.key==='producer:copy'?'copy-lead':node.role;
  const binding={providerId:'synthetic-local',model:'synthetic-local',role};
  bindings[node.key==='producer:strategy'?'strategy':node.key==='producer:copy'?'copy':`content_${node.key.replaceAll(':','_')}`]=binding;
  capabilities[node.key]={operation:CONTENT_PROTOCOL,packetVersion:'content-packet-v3',assignment:{providerId:binding.providerId,model:binding.model},status:'synthetic_fixture',origin:'Owned mechanism test only',version:'owned-v1',limitations:['No real quality or provider verification.'],maxImages:4,maxBytes:1024*1024,maxPixels:1024*1024};
 }
 return {bindings,configuration:{packetVersion:'content-packet-v3',capabilities,allowance:{maxCalls:13,previousMaxCalls:13,origin:'Owned test',version:'owned-v1',reason:'Explicit bounded owned mechanism test.'}}};
}
async function owned(t){
 const root=await mkdtemp(join(tmpdir(),'content-initial-owned-')),path=join(root,'owned.sqlite');
 let store=openStore(path);
 store.create({id:'p',name:'Owned fresh project',brief:'Owned mechanism test only',mode:'assisted',humanGates:['content_review'],authorizedThrough:'final_review'},human);
 t.after(async()=>{store.close();await rm(root,{recursive:true,force:true});});
 return {root,get store(){return store;},reopen(){store.close();store=openStore(path);},runtime(options=configuration()){return createCompleteContentRuntime({store,root,providers:{},imageStore:{},finalVisuals:{},...options});}};
}

test('fresh real store persists a versioned initial request without manufacturing source or approvals',async t=>{
 const f=await owned(t),runtime=f.runtime(),before=f.store.read('p');
 const result=await runtime.continueContent('p',{commandId:'initial',expectedRevision:before.revision});
 assert.equal(result.status,'blocked');
 assert.equal(f.store.read('p').jobs.length,0);
 assert.deepEqual(f.store.read('p').contentIntents,[{id:'initial',packetVersion:'content-packet-v3'}]);
 assert.equal(f.store.read('p').contentVisibilityRevisionIntents?.length??0,0);
 assert.equal(f.store.read('p').contentAllowance.maxCalls,13);
 assert.equal(f.store.read('p').decisions.length,before.decisions.length);
 assert.equal(runtime.contentStatus('p').status,'waiting_source');
 assert.equal(runtime.contentStatus('p').initialIntentId,'initial');
 assert.equal(runtime.contentStatus('p').packetVersion,'content-packet-v3');
});

test('same initial intent replays across real store reopen and changed version cannot reinterpret it',async t=>{
 const f=await owned(t);await f.runtime().continueContent('p',{commandId:'initial',expectedRevision:0});
 const saved=f.store.read('p').processedCommands.initial,revision=f.store.read('p').revision;
 f.reopen();await f.runtime().continueContent('p',{commandId:'initial',expectedRevision:0});
 assert.equal(f.store.read('p').revision,revision);
 assert.equal(f.store.read('p').processedCommands.initial,saved);
 assert.equal(f.store.read('p').contentIntents.length,1);
 const options=configuration();options.configuration.packetVersion='content-packet-v2';
 await assert.rejects(f.runtime(options).continueContent('p',{commandId:'initial',expectedRevision:revision}),{code:'COMMAND_ID_REUSED'});
 assert.throws(()=>f.store.command('p',{kind:'request-complete-content',commandId:'initial',expectedRevision:revision},actor),{code:'COMMAND_ID_REUSED'});
});

test('unversioned legacy intent cannot authorize initial v3 and keeps its original fingerprint',async t=>{
 const f=await owned(t);f.store.command('p',{kind:'request-complete-content',commandId:'legacy',expectedRevision:0},actor);
 const original=f.store.read('p').processedCommands.legacy;
 await assert.rejects(f.runtime().continueContent('p',{commandId:'legacy',expectedRevision:1}),{code:'COMMAND_ID_REUSED'});
 const result=await f.runtime().advanceContent('p');
 assert.equal(result.reason,'CONTENT_INITIAL_INTENT_REQUIRED');
 assert.equal(f.store.read('p').processedCommands.legacy,original);
 assert.equal(f.store.read('p').jobs.length,0);
});

test('new initial command rejects missing intent and forged correction before source construction',async t=>{
 const f=await owned(t);
 assert.throws(()=>f.store.command('p',{kind:'open-initial-content-v3',commandId:'open-missing',expectedRevision:0,intentId:'missing'},actor),{code:'CONTENT_INITIAL_INTENT_REQUIRED'});
 f.store.command('p',{kind:'request-complete-content',commandId:'initial',expectedRevision:0,packetVersion:'content-packet-v3'},actor);
 for(const key of ['predecessorRootJobId','correction','finding','rootJobId']){
  assert.throws(()=>f.store.command('p',{kind:'open-initial-content-v3',commandId:`forged-${key}`,expectedRevision:1,intentId:'initial',[key]:null},actor),{code:'CONTENT_INITIAL_INPUT_INVALID'});
 }
 assert.equal(f.store.read('p').jobs.length,0);
});

test('stale initial request fails atomic revision validation without an intent or allowance',async t=>{
 const f=await owned(t);
 await assert.rejects(f.runtime().continueContent('p',{commandId:'stale',expectedRevision:2}),{code:'REVISION_CONFLICT'});
 assert.equal(f.store.read('p').contentIntents?.length??0,0);
 assert.equal(f.store.read('p').contentAllowance,undefined);
});

test('configuration usability requires all thirteen exact roles, explicit allowance and complete capability bounds',()=>{
 const create=options=>createCompleteContentRuntime({store:{},root:'/private/tmp',providers:{},...options});
 assert.equal(create(configuration()).capability().configured,true);
 for(const mutate of [
  x=>delete x.configuration.allowance,
  x=>x.configuration.allowance.maxCalls=12,
  x=>delete x.configuration.capabilities.author,
  x=>x.configuration.capabilities.author.packetVersion='content-packet-v2',
  x=>x.configuration.capabilities.author.assignment.model='different',
  x=>x.configuration.capabilities.author.maxImages=0,
  x=>x.bindings.content_author.role='review-director',
 ]){const x=configuration();mutate(x);assert.equal(create(x).capability().configured,false);}
});
