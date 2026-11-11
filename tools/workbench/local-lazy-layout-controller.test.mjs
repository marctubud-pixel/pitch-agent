import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,symlink,writeFile,mkdir,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createLazyLocalLayoutController,localLayoutSourceIdentity} from './local-lazy-layout-controller.mjs';
import {layoutHash} from './layout-boundary.mjs';
async function fixture(t){
 const root=await realpath(await mkdtemp(join(tmpdir(),'lazy-layout-small-')));t.after(()=>rm(root,{recursive:true,force:true}));
 const manuscript={pageIntents:[]},body={images:[],obligations:[],visual:{directions:[{targets:[{imageId:'target',kind:'kv'}]}]}};
 const source={...body,sourceHash:layoutHash(body)},consumer={raw:{decision:'accept'}},trusted={source,contentHash:layoutHash(JSON.stringify(manuscript)),manuscriptText:JSON.stringify(manuscript),ownerReports:{producer:{raw:{decision:'accept'}},consumer},contract:{artifactId:'content',sourceHash:source.sourceHash,manuscriptHash:layoutHash(manuscript),manuscript,layoutAcceptance:consumer}};
 const project={id:'p',revision:1,activeByStage:{content_review:'content'},artifacts:[{id:'content',completeContent:{}}],policies:[{version:1}],releases:[{artifactId:'content',sourceHash:source.sourceHash,policyVersion:1}],jobs:[]};let contentReads=0,dispatches=0;
 const executor={contentLayoutInput:async()=>{contentReads++;return trusted;},verifyLayoutPreparation:async()=>{},execute:async()=>{dispatches++;}};
 return {root,trusted,project,executor,options:{projectStore:{read:()=>project},executor,imageStore:{read:async()=>{throw Error('unexpected image read');}},executionRoot:root,caseIdForProject:()=> 'm6'},counts:()=>({contentReads,dispatches}),ctx:{case:{projectId:'p',caseId:'m6'},project}};
}
test('layout controller does not admit fake prepared configuration or execution labels',async t=>{
 const f=await fixture(t);
 for(const option of [{configuration:{status:'configured'}},{nativeExecutionAllowed:true},{layoutConfiguration:{version:'project-layout-boundary-v1'}}])await assert.rejects(createLazyLocalLayoutController({...f.options,...option}),{code:'LOCAL_LAYOUT_CONTROLLER_OPTION_INVALID'});
 assert.deepEqual(f.counts(),{contentReads:0,dispatches:0});
});
test('missing actual content blocks before tools, images or dispatch',async t=>{
 const f=await fixture(t);f.executor.contentLayoutInput=async()=>{throw Object.assign(Error('missing actual content'),{code:'CONTENT_NOT_READY'});};
 const c=await createLazyLocalLayoutController(f.options);assert.equal((await c.driver.inspect(f.ctx)).reason,'CONTENT_NOT_READY');await assert.rejects(c.driver.advance(f.ctx),{code:'CONTENT_NOT_READY'});assert.equal(f.counts().dispatches,0);
});
test('missing tools is explicit and never pretends configured native execution',async t=>{
 const f=await fixture(t),c=await createLazyLocalLayoutController(f.options);
 const state=await c.driver.inspect(f.ctx);assert.equal(state.status,'blocked');assert.equal(state.reason,'LOCAL_LAYOUT_NATIVE_TOOL_PATHS_REQUIRED');assert.deepEqual(await c.driver.advance(f.ctx),state);assert.equal(f.counts().dispatches,0);
});
test('canonical root and registered case routing are required',async t=>{
 const f=await fixture(t),alias=f.root+'-alias';await symlink(f.root,alias);t.after(()=>rm(alias,{force:true}));
 await assert.rejects(createLazyLocalLayoutController({...f.options,executionRoot:alias}),{code:'LOCAL_LAYOUT_CONTROLLER_CANONICAL_ROOT_REQUIRED'});
 const c=await createLazyLocalLayoutController(f.options);assert.equal((await c.driver.inspect({...f.ctx,case:{...f.ctx.case,caseId:'dexian'}})).reason,'LOCAL_LAYOUT_CASE_REQUIRED');assert.equal(f.counts().contentReads,0);
});
test('source identity checks literal manuscript, exact release and both owner reports',async t=>{
 const f=await fixture(t);assert.equal(localLayoutSourceIdentity(f.project,f.trusted).contentArtifactId,'content');
 const changed=structuredClone(f.trusted);changed.contract.manuscript.extra='different';assert.throws(()=>localLayoutSourceIdentity(f.project,changed),{code:'LOCAL_LAYOUT_SOURCE_CHANGED'});
 const noRelease=structuredClone(f.project);noRelease.releases[0].sourceHash='wrong';assert.throws(()=>localLayoutSourceIdentity(noRelease,f.trusted),{code:'LOCAL_LAYOUT_CONTENT_RELEASE_REQUIRED'});
 const noOwner=structuredClone(f.trusted);noOwner.ownerReports.consumer.raw.decision='return';assert.throws(()=>localLayoutSourceIdentity(f.project,noOwner),{code:'LOCAL_LAYOUT_OWNER_REPORTS_REQUIRED'});
});
test('configured tool paths only yield preparation pending before any native proof exists',async t=>{
 const f=await fixture(t),tools={};
 for(const name of ['node','engine','nativeCheck','python','soffice','bash']){tools[name]=join(f.root,name);await writeFile(tools[name],'local small test only',{mode:0o700});}
 for(const name of ['nativeRuntime','presentationsSkill']){tools[name]=join(f.root,name);await mkdir(tools[name]);}
 const c=await createLazyLocalLayoutController({...f.options,tools,fontRecords:[{path:join(f.root,'font'),sha256:'a'.repeat(64)}]});
 assert.deepEqual(await c.driver.inspect(f.ctx),{status:'pending',nextOperation:'prepare_resources',syntheticOnly:true,realQualityVerified:false,finalAuthorityAvailable:false});
 assert.deepEqual(await c.executor.layoutStatus('p'),{status:'not_requested',syntheticOnly:true,realQualityVerified:false,finalAuthorityAvailable:false});assert.equal(f.project.jobs.length,0);assert.equal(f.counts().dispatches,0);
});
test('original unknown native attempts block even resource preparation',async t=>{
 const f=await fixture(t);f.project.jobs.push({id:'unknown',purpose:'layout_export',status:'awaiting_reconciliation',task:{},attempts:[]});
 const c=await createLazyLocalLayoutController(f.options),s=await c.driver.inspect(f.ctx);assert.equal(s.status,'awaiting_reconciliation');assert.equal(s.reason,'LAYOUT_UNKNOWN_BLOCKS');assert.deepEqual(f.counts(),{contentReads:0,dispatches:0});
});
