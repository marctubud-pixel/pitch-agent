import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from './store.mjs';
import {prepareLocalAcceptanceRuntime} from './local-acceptance-runtime.mjs';

test('creative configuration refuses incomplete flags and nonlocal image destinations before touching a store',async()=>{
 await assert.rejects(()=>prepareLocalAcceptanceRuntime({includeCreative:'yes'}),{code:'LOCAL_CREATIVE_FLAG_INVALID'});
 await assert.rejects(()=>prepareLocalAcceptanceRuntime({includeCreative:true}),{code:'LOCAL_CREATIVE_REFERENCES_REQUIRED'});
 await assert.rejects(()=>prepareLocalAcceptanceRuntime({includeCreative:true,includeReferences:true}),{code:'LOCAL_CREATIVE_IMAGE_SERVICE_REQUIRED'});
 for(const baseUrl of ['https://example.com/v1','http://localhost:4399/v1','http://127.0.0.1:4399/other']){
  await assert.rejects(()=>prepareLocalAcceptanceRuntime({includeCreative:true,includeReferences:true,localImageService:{baseUrl,token:'local-engineering-token-123456'}}),{code:'LOCAL_LOOPBACK_IMAGE_URL_REQUIRED'});
 }
});

test('opt-in creative runtime composes native stages without dispatching or skipping upstream authority',async t=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'local-creative-config-'))),store=openStore(join(root,'projects.sqlite')),calls=[];
 t.after(async()=>{store.close();await rm(root,{recursive:true,force:true});});
 const options={projectStore:store,executionRoot:root,calls,includeReferences:true,includeCreative:true,localImageService:{baseUrl:'http://127.0.0.1:4399/v1',token:'local-engineering-token-123456'}};
 const runtime=await prepareLocalAcceptanceRuntime(options);
 assert.deepEqual(runtime.configuredModules,['research','strategy','copy','references','sketch','visual','content']);
 assert.equal(runtime.syntheticOnly,true);
 assert.equal(runtime.executor.contentCapability().configured,true);
 const p=store.create({id:'local-creative-config',name:'得闲',brief:'25岁年轻人轻松社交包装，度数未定。',mode:'auto',humanGates:[]},{actorType:'human',actorId:'local-test-user',runId:'config-create',contextId:'config-create'});
 for(const module of ['references','sketch','visual','content']){
  const value=await runtime.drivers[module].inspect({project:p,case:{projectId:p.id,caseId:'dexian'}});
  assert.equal(value.status,'blocked',module);
 }
 assert.equal(calls.length,0);assert.equal(store.read(p.id).jobs.length,0);assert.equal(store.read(p.id).artifacts.length,0);
 assert.equal(runtime.drivers.layout,undefined);assert.equal(runtime.drivers.final_review,undefined);
 const oldEpoch=store.semanticConfiguration().epoch;
 const restarted=await prepareLocalAcceptanceRuntime(options);
 assert.equal(store.semanticConfiguration().epoch,oldEpoch);
 assert.deepEqual(restarted.referenceLibraries,runtime.referenceLibraries);
 assert.equal(calls.length,0);
});
