import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from './store.mjs';
import {prepareLocalAcceptanceRuntime} from './local-acceptance-runtime.mjs';
test('opt-in native reference configuration loads actual catalogue but cannot skip missing copy or dispatch',async t=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'local-ref-config-'))),store=openStore(join(root,'projects.sqlite')),calls=[];
 t.after(async()=>{store.close();await rm(root,{recursive:true,force:true});});
 const runtime=await prepareLocalAcceptanceRuntime({projectStore:store,executionRoot:root,calls,includeReferences:true});
 const p=store.create({id:'local-reference-config',name:'得闲',brief:'工程配置测试，25岁轻松社交包装，度数未定。',mode:'auto',humanGates:[]},{actorType:'human',actorId:'local-test-user',runId:'config-create',contextId:'config-create'});
 assert.deepEqual(runtime.configuredModules,['research','strategy','copy','references']);assert.equal(runtime.syntheticOnly,true);assert.equal(runtime.deliveryBindings.copy.role,'references-lead');
 assert.equal(typeof runtime.imageStore.read,'function');assert.equal(Object.keys(runtime.referenceLibraries).length,1);const catalogue=Object.values(runtime.referenceLibraries)[0];assert.equal(catalogue.origin,'local-curated-configuration-not-network-capture');assert.equal(catalogue.catalogueDigest,Object.keys(runtime.referenceLibraries)[0]);
 const status=await runtime.drivers.references.inspect({project:p,case:{caseId:'dexian',projectId:p.id}});
 assert.equal(status.status,'blocked');assert.equal(status.reason,'LOCAL_REFERENCE_COPY_REQUIRED');assert.equal(calls.length,0);assert.equal(store.read(p.id).jobs.length,0);assert.equal(store.read(p.id).artifacts.length,0);
});
