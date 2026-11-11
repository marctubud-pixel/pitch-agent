import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {researchMethodIdentity,applyResearchMethod} from './research-method.mjs';
import {openStore} from './store.mjs';
import {createExecutor} from './executor.mjs';
import {WORKFLOW_VERSION} from './seven-stage-workflow.mjs';
const ctx={actorId:'test-owner',actorType:'human',runId:'test-owner-run',contextId:'test-owner-context'};
test('fixed method uses actual retained r7 bytes and refuses changed identities',()=>{
 const identity=researchMethodIdentity(), original={prompt:'NATIVE CONTRACT',outputSchema:{}};
 const request=applyResearchMethod(original,identity);
 assert.match(request.prompt,/PROJECT_RESEARCH_METHOD r7-20261109 [a-f0-9]{64}/);
 assert.ok(request.prompt.includes('关键问题已有适用回答'));
 assert.ok(request.prompt.endsWith('NATIVE CONTRACT'));
 assert.throws(()=>applyResearchMethod(original,{...identity,sha256:'0'.repeat(64)}),{code:'RESEARCH_METHOD_CHANGED'});
});
test('new seven-stage jobs persist r7 identity and bind it into the real provider request',async()=>{
 const root=await mkdtemp(join(tmpdir(),'pitch-method-')),store=openStore(join(root,'db'));
 let seen;
 try{
  store.create({id:'new',name:'Synthetic binding test',brief:'Synthetic brief only',mode:'auto',authorizedThrough:'research',workflowVersion:WORKFLOW_VERSION},ctx);
  store.command('new',{kind:'confirm-task-card',taskCardId:'new:scope:1',commandId:'confirm',expectedRevision:0},ctx);
  const executor=createExecutor({store,rootDir:root,bindings:{research:{providerId:'test',model:'synthetic',role:'research-lead'}},providers:{test:{model:'synthetic',testOnly:true,async execute(request){seen=request;throw Error('Stop before producing a report');}}}});
  const jobId=executor.enqueue('new','research',{commandId:'generate',expectedRevision:1});
  assert.deepEqual(store.read('new').jobs[0].task.researchMethod,researchMethodIdentity());
  await executor.execute('new',jobId);
  assert.ok(seen,JSON.stringify(store.read('new').jobs[0].error));
  assert.match(seen.prompt,/PROJECT_RESEARCH_METHOD r7-20261109/);
  assert.equal(store.read('new').artifacts.length,0,'No synthetic success report was fabricated');
  assert.throws(()=>executor.enqueue('new','strategy',{commandId:'old-strategy',expectedRevision:store.read('new').revision}),{code:'SEVEN_STAGE_ROUTE_REQUIRED'});
 }finally{store.close();await rm(root,{recursive:true,force:true});}
});
test('the current protocol cannot use old acknowledgments or generic release to bypass the r7 reader gate',async()=>{
 const root=await mkdtemp(join(tmpdir(),'pitch-r7-gate-')),store=openStore(join(root,'db'));
 try{
  store.create({id:'p',name:'Synthetic gate test',brief:'Synthetic only',mode:'auto',workflowVersion:WORKFLOW_VERSION},ctx);
  for(const [kind,code] of [['acknowledge-handoff','SEVEN_STAGE_ROUTE_REQUIRED'],['release-stage','RESEARCH_R7_READER_REQUIRED'],['release-research','RESEARCH_R7_READER_REQUIRED'],['record-research-handoff','RESEARCH_R7_READER_REQUIRED']]){
   assert.throws(()=>store.command('p',{kind,artifactId:'invented',request:{input:{decision:'accepted'}},commandId:kind,expectedRevision:0},ctx),{code});
  }
  assert.equal(store.read('p').revision,0);assert.equal(store.read('p').releases.length,0);
 }finally{store.close();await rm(root,{recursive:true,force:true});}
});
