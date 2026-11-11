import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,mkdir,writeFile,chmod,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from './store.mjs';
import {openEditableProposalStore} from '../auto-layout/editable-proposal.mjs';
import {openCompleteLocalAcceptance} from './local-complete-acceptance.mjs';
async function fixture(t,optionOverrides={}){
 const root=await realpath(await mkdtemp(join(tmpdir(),'complete-local-config-'))),executionRoot=join(root,'executions'),editableResourceRoot=join(root,'resources');
 await mkdir(executionRoot);await mkdir(editableResourceRoot);
 const projectStore=openStore(join(root,'projects.sqlite')),editableStore=await openEditableProposalStore({databasePath:join(root,'drafts.sqlite'),resourceRoot:editableResourceRoot});
 const tools={extraFiles:[],extraRoots:[]};
 for(const name of ['node','engine','nativeCheck','python','soffice','bash','nativeRuntime','presentationsSkill']){
  tools[name]=join(root,name);
  if(['nativeRuntime','presentationsSkill'].includes(name))await mkdir(tools[name]);
  else{await writeFile(tools[name],'Synthetic tool path fixture; this file is never executed.');await chmod(tools[name],0o700);}
 }
 let app;
 t.after(async()=>{app?.pipeline.close();projectStore.close();editableStore.close();await rm(root,{recursive:true,force:true});});
 const calls=[],options={databasePath:join(root,'workflow.sqlite'),projectStore,editableStore,executionRoot,editableResourceRoot,tools,fontRecords:[{path:join(root,'unexecuted-font.ttf'),sha256:'a'.repeat(64)}],localImageService:{baseUrl:'http://127.0.0.1:4399/v1',token:'local-engineering-token-123456'},calls,...optionOverrides};
 return {root,options,projectStore,calls,open:async()=>app=await openCompleteLocalAcceptance(options)};
}
test('complete composition initializes an actual new case without dispatching or declaring later stages passed',async t=>{
 const f=await fixture(t),app=await f.open();
 assert.deepEqual(app.declaredModules,['brief','research','strategy','copy','references','sketch','visual','content','layout','final_review']);
 assert.equal(app.wholeChainVerified,false);assert.equal(app.realQualityVerified,false);assert.equal(app.productionFinalAuthority,false);
 const first=await app.pipeline.create({caseId:'dexian',brief:'得闲，25岁社交包装；度数未定。',commandId:'new-complete-case',mode:'assisted',checkpoints:['copy','references']});
 assert.equal(first.initializationState,'ready');assert.equal(first.nextAction.module,'brief');assert.equal(first.nextAction.status,'awaiting_user');assert.equal(first.editorDocumentId,null);
 const same=await app.pipeline.create({caseId:'dexian',brief:'得闲，25岁社交包装；度数未定。',commandId:'new-complete-case',mode:'assisted',checkpoints:['copy','references']});assert.equal(same.id,first.id);
 const approved=await app.pipeline.decide(first.id,{module:'brief',decision:'approve',expectedBasisHash:first.nextAction.evidenceHash,commandId:'confirm-complete-brief'});
 assert.equal(approved.nextAction.module,'research');assert.equal(approved.complete,false);assert.equal(f.calls.length,0);assert.equal(f.projectStore.read(first.projectId).jobs.length,0);
 app.pipeline.close();const reopened=await f.open();const restored=await reopened.pipeline.read(first.id);
 assert.equal(restored.projectId,first.projectId);assert.equal(restored.nextAction.module,'research');assert.equal(restored.decisions.length,1);assert.equal(restored.editorDocumentId,null);assert.equal(f.calls.length,0);
});
test('complete composition rejects missing tools, arbitrary providers and remote image service before case creation',async t=>{
 const f=await fixture(t);
 await assert.rejects(openCompleteLocalAcceptance({...f.options,tools:undefined}),{code:'LOCAL_COMPLETE_NATIVE_TOOLS_REQUIRED'});
 await assert.rejects(openCompleteLocalAcceptance({...f.options,imageProvider:{}}),{code:'LOCAL_COMPLETE_OPTION_INVALID'});
 await assert.rejects(openCompleteLocalAcceptance({...f.options,localImageService:{...f.options.localImageService,baseUrl:'https://example.com/v1'}}),{code:'LOCAL_LOOPBACK_IMAGE_URL_REQUIRED'});
 assert.equal(f.projectStore.list().length,0);assert.equal(f.calls.length,0);
});
test('explicit V2 composition initializes through the genuine MAIN opaque grant and reopens the same profile',async t=>{
 const f=await fixture(t,{referenceRuntimeProfile:'local-reference-pool-v2'}),app=await f.open();
 assert.equal(app.referenceRuntimeProfile,'local-reference-pool-v2');assert.equal(app.wholeChainVerified,false);
 const request={caseId:'dexian',brief:'得闲，25岁轻松社交包装；本地工程联调，度数未定。',commandId:'v2-create-case',mode:'assisted',checkpoints:['references']},created=await app.pipeline.create(request);
 assert.equal(created.initializationState,'ready');assert.equal(created.referenceRuntimeProfile,'local-reference-pool-v2');assert.equal(created.nextAction.module,'brief');assert.equal(created.editorDocumentId,null);assert.equal(f.calls.length,0);assert.equal(f.projectStore.read(created.projectId).jobs.length,0);
 assert.equal((await app.pipeline.create(request)).id,created.id);const before=f.projectStore.read(created.projectId);app.pipeline.close();
 const reopened=await f.open();const read=await reopened.pipeline.read(created.id);assert.equal(read.referenceRuntimeProfile,'local-reference-pool-v2');assert.equal(read.nextAction.module,'brief');assert.deepEqual(f.projectStore.read(created.projectId),before);assert.equal(f.calls.length,0);
});
