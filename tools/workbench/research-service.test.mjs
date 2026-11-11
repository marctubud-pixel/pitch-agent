import {createExecutor} from './executor.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openStore} from './store.mjs';
import {createResearchService} from './research-service.mjs';
import {bindings,providerSet,human,source} from './research-operator-fixture.mjs';
async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'seven-research-')),store=openStore(join(root,'db'));
 t.after(async()=>{store.close();await rm(root,{recursive:true,force:true});});
 store.create({id:'new',name:'Synthetic protocol test only',brief:'Explore the supplied synthetic blue example only, without audience preference claims.',mode:'auto',humanGates:[],authorizedThrough:'research',workflowVersion:'proposal-seven-v1'},human);
 store.command('new',{kind:'confirm-task-card',taskCardId:'new:scope:1',commandId:'confirm',expectedRevision:0},human);
 store.command('new',{kind:'register-research-source',source:{title:'Synthetic source',publisher:'Synthetic test',url:source.url,excerpt:source.text,intendedUse:'category',attachToClaimId:null},commandId:'source',expectedRevision:1},human);
 return {root,store,sourceId:store.read('new').sourceEntries[0].id};
}
test('without explicit execution authorization the restricted service never creates a model job',async t=>{
 const f=await fixture(t),service=createResearchService({store:f.store,rootDir:f.root,bindings,providers:providerSet([],x=>x,f.root)});
 assert.equal(service.capability().configured,false);
 await assert.rejects(service.generate('new',{commandId:'generate',expectedRevision:2,sourceEntryIds:[f.sourceId]}),{code:'RESEARCH_EXECUTION_UNAVAILABLE'});
 assert.equal(f.store.read('new').jobs.length,0);
});
test('explicit test providers exercise real immutable generation, original content, replay and revision refusal',async t=>{
 const f=await fixture(t),calls=[];
 const providers=providerSet(calls,result=>{const responseText=JSON.stringify(result.parsedOutput).replaceAll('s1',f.sourceId);return {...result,responseText,parsedOutput:JSON.parse(responseText)};},f.root);
 const service=createResearchService({store:f.store,rootDir:f.root,bindings,providers,executionAllowed:true});
 const request={commandId:'generate',expectedRevision:2,sourceEntryIds:[f.sourceId]};
 const receipt=await service.generate('new',request),p=f.store.read('new'),job=p.jobs.find(j=>j.id===receipt.jobId);
 assert.equal(job.status,'succeeded',JSON.stringify(job.error));assert.equal(p.artifacts.length,1);
 assert.equal(p.artifacts[0].provenance,'provider_execution');
 const loaded=await service.content('new',p.artifacts[0].id);assert.equal(loaded.content.summary,source.text);
 assert.match(calls[0].request.prompt,/PROJECT_RESEARCH_METHOD r7-20261109/);
 const verification=await service.verify('new',{artifactId:p.artifacts[0].id,commandId:'verify',expectedRevision:p.revision});
 assert.equal(f.store.read('new').jobs.find(j=>j.id===verification.jobId).status,'succeeded');
 const current=f.store.read('new');
 const assessment=await service.assess('new',{artifactId:p.artifacts[0].id,commandId:'assess',expectedRevision:current.revision});
 assert.equal(f.store.read('new').jobs.find(j=>j.id===assessment.jobId).status,'succeeded');
 const count=calls.length;await service.generate('new',request);assert.equal(calls.length,count);
 await assert.rejects(service.generate('new',{...request,commandId:'stale'}),{code:'REVISION_CONFLICT'});
 assert.equal(f.store.read('new').jobs.some(j=>j.stage==='strategy'),false);
});

test('a colliding derived semantic command never resumes a different queued generation',async t=>{
 const f=await fixture(t),calls=[];
 const providers=providerSet(calls,result=>{const responseText=JSON.stringify(result.parsedOutput).replaceAll('s1',f.sourceId);return {...result,responseText,parsedOutput:JSON.parse(responseText)};},f.root);
 const service=createResearchService({store:f.store,rootDir:f.root,bindings,providers,executionAllowed:true});
 await service.generate('new',{commandId:'generate',expectedRevision:2,sourceEntryIds:[f.sourceId]});
 const before=f.store.read('new'), artifactId=before.activeByStage.research;
 const separate=createExecutor({store:f.store,rootDir:f.root,bindings,providers});
 const unrelated=separate.enqueue('new','research',{commandId:'assess:semantic',expectedRevision:before.revision});
 const count=calls.length;
 await assert.rejects(service.assess('new',{artifactId,commandId:'assess',expectedRevision:f.store.read('new').revision}),{code:'COMMAND_ID_REUSED'});
 assert.equal(f.store.read('new').jobs.find(j=>j.id===unrelated).status,'queued');
 assert.equal(f.store.read('new').activeByStage.research,artifactId);assert.equal(calls.length,count);
});
