import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {openStore} from './store.mjs';
import {createExecutor} from './executor.mjs';
import {prepareStrategy,bootstrapOwnerCopy,syntheticCopy,diskReceipt} from './selected-stage-fixture.mjs';
import {verifySelectedOriginals} from './final-selected-originals.mjs';
import {indexFinalHistoryRecords} from './final-history-index.mjs';
import {verifyStageOriginal} from './stage-original.mjs';
const readLimits={readAttempts:128,snapshotBytes:256*1024**2,decodedBytes:16*1024**3,storedBytes:16*1024**3};
async function admittedSelectedOriginals(input) {
 const outcome=await input.store.withReadAdmission(input.planning.id,readLimits,()=>verifySelectedOriginals(input));
 assert.equal(outcome.kind,'complete',outcome.message);return outcome.value;
}
const owned=process.env.STAGE_OWNED_ROOT??tmpdir();
async function copyFixture(fn){
 const root=join(owned,randomUUID());await mkdir(root,{recursive:true});const store=openStore(join(root,'db'));
 try{
  await prepareStrategy({store,root});
  const binding={providerId:'copy-local',model:'synthetic',role:'copy-lead'},bindings={copy:binding},providers={'copy-local':{model:'synthetic',execute:request=>diskReceipt(root,request,{runId:request.runId,model:'synthetic',threadId:randomUUID(),responseText:JSON.stringify(syntheticCopy),parsedOutput:syntheticCopy})}};
  const bootstrap=await bootstrapOwnerCopy({store,root,bindings,providers});
  const executor=createExecutor({store,rootDir:root,bindings,providers}),job=await executor.execute('p',bootstrap.jobId);assert.equal(job.status,'succeeded',JSON.stringify(job.error));
  const project=store.read('p'),artifact=project.artifacts.at(-1);
  assert.equal(artifact.provenance,'provider_execution');
  await fn({root,store,project,artifact,job});
 }finally{store.close();}
}

const select=(f,ids,planning=f.project)=>{
 const index=indexFinalHistoryRecords(planning),selected={nodeIdentities:index.nodes.filter(n=>ids.includes(n.recordId)&&['artifact','job'].includes(n.domain)).map(n=>n.identity)};
 return {store:f.store,planning,index,selected,executionRoot:f.root,current:()=>{},imageStore:{}};
};
test('actual owner-chain copy shared original and coordinator retain exact upstream duties',()=>copyFixture(async f=>{
 assert.equal((await verifyStageOriginal(f.project,f.artifact,{executionRoot:f.root})).stage,'copy');
 const before=JSON.stringify(f.project),head=f.project.revision;
 const input=select(f,[f.artifact.id]);let guards=0;input.current=()=>guards++;
 const result=await admittedSelectedOriginals(input);
 assert.deepEqual([...new Set(result.facts.filter(x=>x.checked.kind==='ordinary_stage_original').map(x=>x.checked.stage))].sort(),['copy','strategy']);
 assert.ok(result.blockers.some(x=>x.code==='FINAL_HISTORY_IMPORTED_ARTIFACT_ORIGINAL_REQUIRED'&&x.provenance==='imported_metadata'));
 assert.equal(result.blockers.some(x=>x.dependency?.kind==='upstream_review_constraints'),false);
 assert.ok(result.terminals.some(x=>x.kind==='upstream_review_constraints'));
 assert.equal(result.blockers.some(x=>x.code==='FINAL_HISTORY_EXACT_DOMAIN_CLOSURE_REQUIRED'),false);
 assert.equal(result.blockers.some(x=>x.code==='FINAL_HISTORY_SNAPSHOT_ALLOCATION_ADMISSION_REQUIRED'),false);
 assert.equal(result.accounting.allocationAdmission,'outer_store_read_admission');assert.equal(result.accounting.physicalIo,'unmeasured');
 assert.ok(guards>=4);assert.equal(JSON.stringify(f.project),before);assert.equal(f.store.read('p').revision,head);
 const byJob=await admittedSelectedOriginals(select(f,[f.job.id]));assert.equal(byJob.facts[0].checked.artifactId,f.artifact.id);
}));
test('same source occurrence in distinct consumer hosts is never deduplicated',()=>copyFixture(async f=>{
 const strategy=f.project.artifacts.find(a=>a.stage==='strategy'&&a.id!==f.job.inputVersionIds[0]);
 const result=await admittedSelectedOriginals(select(f,[f.artifact.id,strategy.id]));
 const imported=result.blockers.filter(x=>x.code==='FINAL_HISTORY_IMPORTED_ARTIFACT_ORIGINAL_REQUIRED');
 assert.ok(imported.length>=2);assert.equal(imported[0].occurrence,0);assert.equal(imported[1].occurrence,0);
 assert.notDeepEqual(imported[0].host,imported[1].host);
 assert.ok(imported.every(x=>x.id==='research'&&x.provenance==='imported_metadata'));
}));
test('duplicate selected occurrences retain separate facts and imported blockers',()=>copyFixture(async f=>{
 const input=select(f,[f.artifact.id]),node=input.index.nodes.find(x=>x.recordId===f.artifact.id&&x.domain==='artifact');
 input.index.nodes.push({...node});
 const result=await admittedSelectedOriginals(input),copies=result.facts.filter(x=>x.checked.artifactId===f.artifact.id);
 assert.equal(copies.length,2);assert.notEqual(copies[0].occurrence,copies[1].occurrence);
}));
for(const [name,mutate] of [
 ['completion artifact',c=>{c.artifactId='wrong';}],['completion attempt',c=>{c.attemptId='wrong';}],['completion job',c=>{c.jobId='wrong';}],
])test('coordinator refuses substituted '+name,()=>copyFixture(async f=>{
 const planning=structuredClone(f.project);
 for(const [id,raw] of Object.entries(planning.processedCommands)){const c=JSON.parse(raw);if(c.kind==='complete-stage'&&c.artifactId===f.artifact.id){mutate(c);planning.processedCommands[id]=JSON.stringify(c);}}
 const result=await admittedSelectedOriginals(select(f,[f.artifact.id],planning));
 assert.equal(result.facts.length,0);assert.ok(result.blockers.some(x=>['FINAL_HISTORY_WITNESS_CONFLICT','FINAL_HISTORY_COMMAND_WITNESS_REQUIRED','STAGE_ORIGINAL_INVALID'].includes(x.code)));
}));
for(const name of ['task','binding','edge'])test('copy original refuses substituted committed '+name,()=>copyFixture(async f=>{
 const p=structuredClone(f.project),edge=p.ownerEdges.find(e=>e.commit?.jobId===f.job.id);
 const c=JSON.parse(p.processedCommands[edge.commit.commandId]);
 if(name==='task')c.task.brief='forged';if(name==='binding')c.binding.model='forged';if(name==='edge')edge.commit.jobId='forged';
 p.processedCommands[c.commandId]=JSON.stringify(c);
 await assert.rejects(verifyStageOriginal(p,p.artifacts.at(-1),{executionRoot:f.root}),{code:'STAGE_ORIGINAL_INVALID'});
}));
for(const name of ['packet','normalized','input','receipt','output','stdout'])test('coordinator refuses substituted original '+name,()=>copyFixture(async f=>{
 const path=name==='packet'?join(f.root,f.job.attemptId,'packet.json'):name==='normalized'?f.artifact.payloadRef:f.artifact.executionReceipt.paths[name];
 const raw=await readFile(path);try{await writeFile(path,'{}');const result=await admittedSelectedOriginals(select(f,[f.artifact.id]));assert.equal(result.facts.length,0);assert.ok(result.blockers.some(x=>x.code==='STAGE_ORIGINAL_INVALID'));}finally{await writeFile(path,raw);}
}));
test('planning duplicate producer or artifact identity cannot satisfy original ownership',()=>copyFixture(async f=>{
 for(const collection of ['jobs','artifacts']){
  const planning=structuredClone(f.project);planning[collection].push(structuredClone(collection==='jobs'?f.job:f.artifact));
  const result=await admittedSelectedOriginals(select(f,[f.artifact.id],planning));assert.equal(result.facts.length,0);assert.ok(result.blockers.some(x=>x.code==='FINAL_HISTORY_WITNESS_CONFLICT'));
 }
}));
test('actual research original dispatch works from job and artifact after a later real command',async()=>{
 const root=join(owned,randomUUID());await mkdir(root,{recursive:true});const store=openStore(join(root,'db'));
 const human={actorId:'human',actorType:'human',runId:'human',contextId:'human'};
 try{
  store.create({id:'p',name:'Owned research transport only',brief:'Explore a supplied background excerpt.',mode:'auto'},human);
  const send=c=>store.command('p',{...c,commandId:randomUUID(),expectedRevision:store.read('p').revision},human);send({kind:'confirm-task-card',taskCardId:'p:scope:1'});
  const output={researchContractVersion:'research-data-v2',chartData:null,quantitativeClaims:[],outputKind:'research_findings',status:'draft',title:'Local research fixture',summary:'Background only',sections:[{heading:'Background',body:'Synthetic excerpt',evidenceIds:['s1']}],claims:[{text:'Synthetic excerpt',kind:'fact',evidenceRefs:['s1'],limitations:['Supplied excerpt only']}],gaps:['No consumer validation'],evidenceClassifications:[{sourceId:'s1',scopeRelation:'background',reason:'Supplied excerpt'}]};
  const providers={local:{model:'synthetic',execute:request=>diskReceipt(root,request,{runId:request.runId,model:'synthetic',threadId:randomUUID(),responseText:JSON.stringify(output),parsedOutput:output})}},bindings={research:{providerId:'local',model:'synthetic',role:'research-lead'}};
  const executor=createExecutor({store,rootDir:root,providers,bindings});
  const job=await executor.execute('p',executor.enqueue('p','research',{sourceRecords:[{id:'s1',url:'https://example.test/local',text:'Synthetic excerpt',scopeRelation:'background',verification:'captured'}]}));assert.equal(job.status,'succeeded',JSON.stringify(job.error));
  const completion=store.read('p'),artifact=completion.artifacts.at(-1);send({kind:'request-stage',stage:'research',jobId:'later-queued'});
  const planning=store.read('p'),f={store,root,project:planning};
  for(const id of [artifact.id,job.id]){const result=await admittedSelectedOriginals(select(f,[id]));assert.equal(result.facts[0].checked.stage,'research');assert.equal(result.facts[0].revision,completion.revision);}
  assert.equal(store.read('p').revision,planning.revision);assert.equal(store.read('p',completion.revision).revision,completion.revision);
 }finally{store.close();}
});

for(const name of ['missing request','request task','claim actor','missing claim','missing completion','copy registration'])test('planning and historical ordinary witnesses must agree for '+name,()=>copyFixture(async f=>{
 const planning=structuredClone(f.project),strategy=planning.jobs.find(j=>j.outputVersionIds.includes(f.job.inputVersionIds[0]));
 for(const [id,raw] of Object.entries(planning.processedCommands)){
  const c=JSON.parse(raw);
  if(c.jobId===strategy.id&&c.kind==='request-stage'){
   if(name==='missing request')delete planning.processedCommands[id];
   if(name==='request task'){c.task.brief='forged';planning.processedCommands[id]=JSON.stringify(c);}
  }
  if(c.jobId===f.job.id&&['start-job','retry-job'].includes(c.kind)){
   if(name==='missing claim')delete planning.processedCommands[id];
   if(name==='claim actor')planning.audit.find(a=>a.commandId===id).actorId='forged';
  }
  if(c.kind==='complete-stage'&&c.artifactId===f.artifact.id&&name==='missing completion')delete planning.processedCommands[id];
  if(c.kind==='commit-owner-edge'&&c.task?.id===f.job.id&&name==='copy registration'){c.task.brief='forged';planning.processedCommands[id]=JSON.stringify(c);}
 }
 const result=await admittedSelectedOriginals(select(f,[f.artifact.id],planning));
 const forbidden=name==='missing request'||name==='request task'?strategy.outputVersionIds[0]:f.artifact.id;
 assert.ok(!result.facts.some(x=>x.checked.artifactId===forbidden));assert.ok(result.blockers.some(x=>['FINAL_HISTORY_WITNESS_CONFLICT','FINAL_HISTORY_COMMAND_WITNESS_REQUIRED'].includes(x.code)));
}));
