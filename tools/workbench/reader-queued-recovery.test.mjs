import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {createResearchService} from './research-service.mjs';
import {createExecutor} from './executor.mjs';
import {openStore} from './store.mjs';
import {bindings as originalBindings,providerSet,human,source} from './research-operator-fixture.mjs';
import {diskReceipt} from './selected-stage-fixture.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const dimensions=['market','audience','competition','product','carrier','synthesis'];
function readerAnswer(p){
 const locations=[{location:'/summary',quote:source.text}];
 return {protocolVersion:'research-reader-loop-v1',packetHash:p.packetHash,phase:p.phase,retellings:dimensions.map(dimension=>({dimension,understanding:'仅有合成蓝色产品资料，没有真实人群、需求或竞争证据。',classification:'mixed',locations})),answers:p.questionRegistration.questions.map(q=>({questionId:q.id,status:'unresolved',answer:'合成原文仅说明蓝色，不能证明购买偏好。',locations})),connections:[{dimensions:['product','audience'],explanation:'产品颜色事实不能证明人群喜欢。',strategyConstraint:'不能预选受欢迎的风格。',limitations:'合成工程测试，真实偏好未知。',locations}],issues:[{id:'clarity',type:'understanding',severity:'major',questionIds:['q1'],detail:'产品事实与人群推断的连接需要明确。',locations}],rechecks:[],limitations:['Synthetic engineering reader; no consumer or human approval.']};
}
async function fixture(t){
 const readerCount=1;
 const root=await realpath(await mkdtemp(join(tmpdir(),'reader-service-')));let store=openStore(join(root,'db'));const calls=[];
 t.after(async()=>{store.close();await rm(root,{recursive:true,force:true});});
 store.create({id:'new',name:'Synthetic reader wiring only',brief:'只核对合成蓝色产品，不推断真实购买偏好。',mode:'auto',humanGates:[],workflowVersion:'proposal-seven-v1'},human);
 store.command('new',{kind:'confirm-task-card',taskCardId:'new:scope:1',commandId:'confirm',expectedRevision:0},human);
 store.command('new',{kind:'register-research-source',source:{title:'Synthetic source',publisher:'Engineering test',url:source.url,excerpt:source.text,intendedUse:'category',attachToClaimId:null},commandId:'source',expectedRevision:1},human);
 const sourceId=store.read('new').sourceEntries[0].id;
 const providers=providerSet(calls,(result,request)=>{const output=structuredClone(result.parsedOutput);
  if(request.outputSchema.properties.revisionResponses){const marker='\nUNTRUSTED_JSON_DATA\n',start=request.prompt.lastIndexOf(marker),end=request.prompt.lastIndexOf('\nEND_UNTRUSTED_JSON_DATA'),input=JSON.parse(request.prompt.slice(start+marker.length,end));
   output.title='合成研究修订';output.summary=source.text+' 这不能证明人群购买偏好。';output.sections[0].body=output.summary;
   output.revisionResponses=input.correctionInput.sources.flatMap(s=>s.findings.map(f=>({findingKey:f.key,action:'applied',explanation:'将事实与偏好的边界写入实际正文。',outputLocations:[{location:'/summary',quote:'这不能证明人群购买偏好。'}]})));
  }
  const responseText=JSON.stringify(output).replaceAll('s1',sourceId);return {...result,responseText,parsedOutput:JSON.parse(responseText)};},root);
 providers.reader={model:'synthetic',async execute(request){calls.push({id:'reader',request});const parsedOutput=readerAnswer(request.packet);if(request.packet.phase==='recheck'){parsedOutput.answers.forEach(a=>{a.status='answered';a.answer='修订正文明确：这不能证明人群购买偏好。';});parsedOutput.issues=[];parsedOutput.rechecks=request.packet.previous.issues.map(i=>({issueId:i.id,status:'resolved',explanation:'独立读取新版明确边界后，原理解歧义已修正；不代表事实或偏好被证明。',locations:[{location:'/summary',quote:'这不能证明人群购买偏好。'}]}));}return diskReceipt(root,request,{runId:request.runId,model:'synthetic',requestedModel:'synthetic',threadId:`reader-${request.runId}`,inputPacketHash:sha(JSON.stringify({runId:request.runId,model:'synthetic',prompt:request.prompt,outputSchema:request.outputSchema})),exitCode:0,responseText:JSON.stringify(parsedOutput),parsedOutput});}};
 const bindings={...originalBindings,reader:{providerId:'reader',model:'synthetic',role:'independent-research-reader'}};
 const make=()=>createResearchService({store,rootDir:root,bindings,providers,executionAllowed:true});let service=make();
 const {registrationId}=service.registerQuestions('new',{questions:[{id:'q1',question:'本品颜色事实能证明人群喜欢吗？',critical:true}],readerCount,commandId:'questions',expectedRevision:2},human);
 const receipt=await service.generate('new',{commandId:'generate',expectedRevision:store.read('new').revision,sourceEntryIds:[sourceId]});
 assert.equal(store.read('new').jobs.find(j=>j.id===receipt.jobId).status,'succeeded',JSON.stringify(store.read('new').jobs));
 const artifactId=store.read('new').activeByStage.research;
 return {root,get store(){return store;},bindings,providers,calls,registrationId,artifactId,service,reopen(options={}){store.close();store=openStore(join(root,'db'));return createResearchService({store,rootDir:root,bindings,providers,executionAllowed:true,...options});},request:()=>({artifactId,registrationId,seat:0,commandId:'read',expectedRevision:store.read('new').revision})};
}

async function queued(t,kind){
 const f=await fixture(t);
 if(kind==='revision')await f.service.readReport('new',f.request());
 const request=kind==='reader'?f.request():{artifactId:f.artifactId,commandId:'revision',expectedRevision:f.store.read('new').revision};
 const runtime=createExecutor({store:f.store,rootDir:f.root,bindings:f.bindings,providers:f.providers});
 const jobId=kind==='reader'?await runtime.enqueueResearchReader('new',f.artifactId,request):await runtime.enqueueRevision('new',request);
 assert.equal(f.store.read('new').jobs.find(j=>j.id===jobId).status,'queued');
 return {...f,get store(){return f.store;},request,jobId,replay:(service,body=request)=>kind==='reader'?service.readReport('new',body):service.revise('new',body)};
}
for(const kind of ['reader','revision']){
 test(`${kind}: same-body replay after SQLite reopen executes only the original queued task`,async t=>{
  const f=await queued(t,kind),calls=f.calls.length,service=f.reopen();
  const result=await f.replay(service),job=f.store.read('new').jobs.find(j=>j.id===f.jobId);
  assert.equal(result.jobId,f.jobId);assert.equal(job.status,'succeeded',JSON.stringify(job.error));assert.equal(job.attempts.length,1);assert.equal(f.calls.length,calls+1);
  await f.replay(service);assert.equal(f.calls.length,calls+1);assert.equal(f.store.read('new').jobs.find(j=>j.id===f.jobId).attempts.length,1);
 });
}
for(const kind of ['reader','revision']){
 for(const unavailable of ['disabled','missing-providers','missing-role','changed-binding']){
  test(`${kind}: queued replay does not dispatch with ${unavailable}`,async t=>{
   const f=await queued(t,kind),calls=f.calls.length,role=kind==='reader'?'reader':'research';
   const options=unavailable==='disabled'?{executionAllowed:false}:unavailable==='missing-providers'?{providers:{}}:unavailable==='missing-role'?{bindings:Object.fromEntries(Object.entries(f.bindings).filter(([key])=>key!==role))}:{bindings:{...f.bindings,[role]:{...f.bindings[role],role:'changed-owner'}}};
   const service=f.reopen(options);
   await assert.rejects(f.replay(service),error=>['RESEARCH_EXECUTION_UNAVAILABLE','RESEARCH_READER_UNCONFIGURED','RESEARCH_MODEL_BINDING_CHANGED'].includes(error.code));
   const job=f.store.read('new').jobs.find(j=>j.id===f.jobId);assert.equal(job.status,'queued');assert.equal(job.attempts.length,0);assert.equal(f.calls.length,calls);
  });
 }
 test(`${kind}: changed replay body cannot dispatch the queued original`,async t=>{
  const f=await queued(t,kind),calls=f.calls.length,service=f.reopen();
  await assert.rejects(f.replay(service,{...f.request,expectedRevision:f.request.expectedRevision+1}),{code:'COMMAND_ID_REUSED'});
  assert.equal(f.calls.length,calls);assert.equal(f.store.read('new').jobs.find(j=>j.id===f.jobId).attempts.length,0);
 });
 test(`${kind}: historical queued task cannot dispatch after card replacement`,async t=>{
  const f=await queued(t,kind),calls=f.calls.length;
  f.store.command('new',{kind:'revise-task-card',taskCardId:'new:scope:next',brief:'New task; the prior queued job is history.',commandId:'replace-card',expectedRevision:f.store.read('new').revision},human);
  f.store.command('new',{kind:'confirm-task-card',taskCardId:'new:scope:next',commandId:'confirm-next',expectedRevision:f.store.read('new').revision},human);
  const service=f.reopen();await assert.rejects(f.replay(service));
  assert.equal(f.calls.length,calls);assert.equal(f.store.read('new').jobs.find(j=>j.id===f.jobId).attempts.length,0);
 });
 test(`${kind}: an unknown dispatched outcome is never executed by replay`,async t=>{
  const f=await queued(t,kind),role=kind==='reader'?'reader':'research',providerId=f.bindings[role].providerId;
  let dispatched=0;f.providers[providerId].execute=async()=>{dispatched++;throw Error('Synthetic lost return after dispatch');};
  const service=f.reopen();await f.replay(service);
  const job=f.store.read('new').jobs.find(j=>j.id===f.jobId);assert.equal(job.status,'awaiting_reconciliation');assert.equal(job.attempts.length,1);assert.equal(dispatched,1);
  await f.replay(service);assert.equal(dispatched,1);assert.equal(f.store.read('new').jobs.find(j=>j.id===f.jobId).attempts.length,1);
 });
 test(`${kind}: successful historical replay needs no execution configuration`,async t=>{
  const f=await queued(t,kind),service=f.reopen();await f.replay(service);const calls=f.calls.length;
  f.store.command('new',{kind:'revise-task-card',taskCardId:'new:scope:next',brief:'History must remain readable without execution.',commandId:'replace-card',expectedRevision:f.store.read('new').revision},human);
  const disabled=f.reopen({executionAllowed:false,providers:{},bindings:{}});
  assert.equal((await f.replay(disabled)).jobId,f.jobId);assert.equal(f.calls.length,calls);
 });
}
for(const kind of ['reader','revision'])test(`${kind}: replaced question registration cannot resume an older queued plan`,async t=>{
 const f=await queued(t,kind),calls=f.calls.length;
 f.service.registerQuestions('new',{questions:[{id:'next-q',question:'A new preregistered research question?',critical:true}],readerCount:1,commandId:'replace-plan',expectedRevision:f.store.read('new').revision},human);
 const service=f.reopen();await assert.rejects(f.replay(service));
 assert.equal(f.calls.length,calls);assert.equal(f.store.read('new').jobs.find(j=>j.id===f.jobId).attempts.length,0);
});
