import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {openStore} from './store.mjs';
import {createExecutor} from './executor.mjs';
import {prepareStrategy} from './selected-stage-fixture.mjs';
import {output} from './research-operator-fixture.mjs';
import {readArtifactContent} from './artifact-content.mjs';
import {verifyResearchDataOriginal,verifyStageOriginal} from './stage-original.mjs';
import {acquisitionFixture,planAcquisition,finishAcquisition} from './research-acquisition-fixture.mjs';

test('unbound legacy research remains readable through strategy, original, verification and readiness',async t=>{
 const root=await mkdtemp(join(tmpdir(),'legacy-ancestry-')),store=openStore(join(root,'db'));
 t.after(async()=>{store.close();await rm(root,{recursive:true,force:true});});
 const human={actorType:'human',actorId:'legacy-human',runId:'legacy-human',contextId:'legacy-human'};
 store.create({id:'p',name:'Legacy ancestry engineering only',brief:'Explore a creative hypothesis without factual audience claims.',mode:'auto',humanGates:[]},human);
 const send=(command,context=human)=>store.command('p',{...command,commandId:randomUUID(),expectedRevision:store.read('p').revision},context);
 send({kind:'confirm-task-card',taskCardId:'p:scope:1'});
 const content={outputKind:'research_findings',status:'draft',title:'Synthetic research',summary:'A legacy creative hypothesis.',sections:[{heading:'Hypothesis',body:'Explore blue without preference claims.',evidenceIds:[]}],claims:[],gaps:['No consumer evidence.'],evidenceClassifications:[]},raw=JSON.stringify(content,null,2),payloadRef=join(root,'legacy.json');await writeFile(payloadRef,raw);
 send({kind:'request-stage',stage:'research',jobId:'research'});
 send({kind:'complete-stage',jobId:'research',artifactId:'research',payloadRef,contentHash:createHash('sha256').update(raw).digest('hex')},{actorType:'agent',actorId:'legacy-author',runId:'legacy-author',contextId:'legacy-author'});
 for(const side of ['producer','consumer'])send({kind:'acknowledge-handoff',artifactId:'research',side,nextStage:'strategy'},{actorType:'agent',actorId:side==='producer'?'legacy-author':'strategy-owner',runId:randomUUID(),contextId:randomUUID()});
 send({kind:'release-stage',artifactId:'research'});
 const f=await prepareStrategy({store,root,existing:true,initialBindings:{readiness:{providerId:'synthetic',model:'synthetic',role:'readiness-reviewer'}},handler:(input,request,value)=>{
  if(input.protocolVersion!=='research-readiness-v1')return value;
  const report=output(request);report.coverage.forEach(item=>{item.refs=[{location:'/content/sections/0/body',quote:content.sections[0].body}];});report.sourceAssessments=[];return report;
 }});
 const p=store.read('p'),legacy=p.artifacts.find(a=>a.id==='research'),producer=p.jobs.find(j=>j.id==='research');
 assert.equal(producer.task,undefined);
 assert.equal((await readArtifactContent(p,legacy.id,root)).content.title,'Synthetic research');
 assert.equal((await verifyStageOriginal(p,p.artifacts.find(a=>a.id===f.artifactId),{executionRoot:root})).stage,'strategy');
 for(const enqueue of [()=>f.executor.enqueueVerification('p',legacy.id,{commandId:'legacy-verification',expectedRevision:store.read('p').revision}),()=>f.executor.enqueueReadiness('p',legacy.id,{commandId:'legacy-readiness',expectedRevision:store.read('p').revision})]){
  const result=await f.executor.execute('p',await enqueue());
  assert.equal(result.status,'succeeded',JSON.stringify(result.error));
 }
 assert.equal(store.read('p').jobs.filter(j=>['running','queued'].includes(j.status)).length,0);
});

test('executed acquired research cannot downgrade after producer task, basis, version or acquisition stripping',async t=>{
 const f=await acquisitionFixture();t.after(()=>f.close());await planAcquisition(f);await finishAcquisition(f);
 const actual=f.store.read('p'),artifact=actual.artifacts[0],producer=actual.jobs.find(j=>j.outputVersionIds?.includes(artifact.id));
 assert.equal(producer.status,'succeeded');assert.ok(producer.task.researchDataBasis.acquisition);
 await verifyResearchDataOriginal(actual,artifact,{executionRoot:f.root});
 const mutations=[
  p=>{delete p.jobs.find(j=>j.id===producer.id).task;},
  p=>{delete p.jobs.find(j=>j.id===producer.id).task.researchDataBasis;},
  p=>{delete p.jobs.find(j=>j.id===producer.id).task.researchDataBasis.acquisition;},
  p=>{delete p.jobs.find(j=>j.id===producer.id).task.researchContractVersion;},
  p=>{delete p.jobs.find(j=>j.id===producer.id).task;delete p.artifacts[0].researchData;},
  p=>{p.jobs.find(j=>j.id===producer.id).task.researchContractVersion='research-data-future';},
 ];
 for(const mutate of mutations){
  const p=structuredClone(actual);mutate(p);let effects=0;
  const snapshot=JSON.stringify(p),count=f.calls.length,tools=f.tools.length;
  const executor=createExecutor({...f.options,store:{read:()=>structuredClone(p),command:()=>{effects++;throw new Error('Unexpected mutation');}}});
  const a=p.artifacts.find(a=>a.id===artifact.id);
  await assert.rejects(()=>verifyResearchDataOriginal(p,a,{executionRoot:f.root}),e=>['STAGE_ORIGINAL_INVALID','INVALID_RESEARCH_CHART_DATA'].includes(e.code));
  for(const enqueue of [()=>executor.enqueueVerification('p',a.id,{commandId:randomUUID(),expectedRevision:p.revision}),()=>executor.enqueueReadiness('p',a.id,{commandId:randomUUID(),expectedRevision:p.revision}),()=>executor.enqueueHandoff('p',a.id,'producer',{commandId:randomUUID(),expectedRevision:p.revision})])await assert.rejects(enqueue,e=>['STAGE_ORIGINAL_INVALID','INVALID_RESEARCH_CHART_DATA'].includes(e.code));
  assert.throws(()=>executor.enqueue('p','strategy'),e=>['INVALID_RESEARCH_ORIGINAL','STALE_RESEARCH_BASIS','INVALID_RESEARCH_BASIS'].includes(e.code));
  assert.equal(effects,0);assert.equal(f.calls.length,count);assert.equal(f.tools.length,tools);assert.equal(JSON.stringify(p),snapshot);assert.deepEqual(f.store.read('p'),actual);
 }
 assert.ok(actual.jobs.every(j=>!['running','queued'].includes(j.status)));
});
