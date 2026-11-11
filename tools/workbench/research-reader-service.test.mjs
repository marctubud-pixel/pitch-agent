import test from 'node:test';
import http from 'node:http';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {createResearchService} from './research-service.mjs';
import {createExecutor} from './executor.mjs';
import {openStore} from './store.mjs';
import {bindings as originalBindings,providerSet,human,source,output} from './research-operator-fixture.mjs';
import {diskReceipt} from './selected-stage-fixture.mjs';
import {verifyResearchReaderOriginal} from './research-reader-original.mjs';
import {ordinaryJobInput} from './ordinary-model-project.mjs';
import {researchMethodIdentity} from './research-method.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const dimensions=['market','audience','competition','product','carrier','synthesis'];
function readerAnswer(p){
 const locations=[{location:'/summary',quote:source.text}];
 return {protocolVersion:'research-reader-loop-v1',packetHash:p.packetHash,phase:p.phase,retellings:dimensions.map(dimension=>({dimension,understanding:'仅有合成蓝色产品资料，没有真实人群、需求或竞争证据。',classification:'mixed',locations})),answers:p.questionRegistration.questions.map(q=>({questionId:q.id,status:'answered',answer:'合成原文仅说明蓝色，不能证明购买偏好。',locations})),connections:[{dimensions:['product','audience'],explanation:'产品颜色事实不能证明人群喜欢。',strategyConstraint:'不能预选受欢迎的风格。',limitations:'合成工程测试，真实偏好未知。',locations}],issues:[],rechecks:[],limitations:['Synthetic engineering reader; no consumer or human approval.']};
}
async function fixture(t,{readerCount=1,register=true,httpModel=false,loseReaderReturn=false}={}){
 const root=await realpath(await mkdtemp(join(tmpdir(),'reader-service-')));let store=openStore(join(root,'db'));const calls=[];
 t.after(async()=>{store.close();await rm(root,{recursive:true,force:true});});
 store.create({id:'new',name:'Synthetic reader wiring only',brief:'只核对合成蓝色产品，不推断真实购买偏好。',mode:'auto',humanGates:[],workflowVersion:'proposal-seven-v1'},human);
 store.command('new',{kind:'confirm-task-card',taskCardId:'new:scope:1',commandId:'confirm',expectedRevision:0},human);
 store.command('new',{kind:'register-research-source',source:{title:'Synthetic source',publisher:'Engineering test',url:source.url,excerpt:source.text,intendedUse:'category',attachToClaimId:null},commandId:'source',expectedRevision:1},human);
 const sourceId=store.read('new').sourceEntries[0].id;
 const providers=providerSet(calls,result=>{const responseText=JSON.stringify(result.parsedOutput).replaceAll('s1',sourceId);return {...result,responseText,parsedOutput:JSON.parse(responseText)};},root);
 providers.reader={model:'synthetic',async execute(request){calls.push({id:'reader',request});const parsedOutput=readerAnswer(request.packet);return diskReceipt(root,request,{runId:request.runId,model:'synthetic',requestedModel:'synthetic',threadId:`reader-${request.runId}`,inputPacketHash:sha(JSON.stringify({runId:request.runId,model:'synthetic',prompt:request.prompt,outputSchema:request.outputSchema})),exitCode:0,responseText:JSON.stringify(parsedOutput),parsedOutput});}};
 if(httpModel){
  const model=http.createServer(async(req,res)=>{try{const chunks=[];for await(const chunk of req)chunks.push(chunk);const wire=JSON.parse(Buffer.concat(chunks));const isReader=wire.outputSchema.properties.protocolVersion?.enum[0]==='research-reader-loop-v1';const packet=isReader?JSON.parse(wire.prompt.split('UNTRUSTED_READER_PACKET\n')[1].split('\nEND_UNTRUSTED_READER_PACKET')[0]):null;
   const raw=isReader?readerAnswer(packet):output({...wire,runId:wire.invocationId});const outputText=JSON.stringify(raw).replaceAll('s1',sourceId);calls.push({id:isReader?'reader':'author',request:wire});res.end(JSON.stringify({protocol:wire.protocol,invocationId:wire.invocationId,contextMode:wire.contextMode,terminal:'completed',outputText,reportedModel:'synthetic',requestId:null,usage:{inputTokens:null,outputTokens:null}}));}catch(error){res.destroy(error);}});
  await new Promise(resolve=>model.listen(0,'127.0.0.1',resolve));t.after(async()=>{model.closeAllConnections();await new Promise(resolve=>model.close(resolve));});
  for(const id of ['author','reviewer','strategist','reader']){const operatorConfig={adapter:'workbench-model-http-v1',endpoint:`http://127.0.0.1:${model.address().port}/model`,model:'synthetic',serviceIdentity:`reader-engineering-${id}`,authentication:{kind:'none'},allowLoopbackHttp:true,timeoutMs:1000,maxRequestBytes:8*1024*1024,maxResponseBytes:4*1024*1024,maxOutputBytes:1024*1024,vision:false,envelopes:[],resourceProfile:'bounded-json-v1'};providers[id]={adapter:operatorConfig.adapter,model:operatorConfig.model,operatorConfig,...(id==='reader'&&loseReaderReturn?{failpoint:name=>{if(name==='manifest-synced')throw Error('Synthetic return lost after original was committed');}}:{})};}
 }
 const bindings={...originalBindings,reader:{providerId:'reader',model:'synthetic',role:'independent-research-reader'}};
 const make=()=>createResearchService({store,rootDir:root,bindings,providers,executionAllowed:true});let service=make();
 let registrationId;
 if(register)({registrationId}=service.registerQuestions('new',{questions:[{id:'q1',question:'本品颜色事实能证明人群喜欢吗？',critical:true}],readerCount,commandId:'questions',expectedRevision:2},human));
 const receipt=await service.generate('new',{commandId:'generate',expectedRevision:store.read('new').revision,sourceEntryIds:[sourceId]});
 assert.equal(store.read('new').jobs.find(j=>j.id===receipt.jobId).status,'succeeded',JSON.stringify(store.read('new').jobs));
 const artifactId=store.read('new').activeByStage.research;
 return {root,store,calls,service,bindings,providers,registrationId,artifactId,make,request:(commandId='read',seat=0)=>({artifactId,registrationId,seat,commandId,expectedRevision:store.read('new').revision}),reopen(){store.close();store=openStore(join(root,'db'));service=make();return {store,service};}};
}
test('preregistered questions enter actual production; a saved independent reader report survives replay and reopen',async t=>{
 const f=await fixture(t),producer=f.store.read('new').jobs.find(j=>!j.purpose||j.purpose==='stage');
 assert.equal(producer.task.researchQuestionRegistrationId,f.registrationId);
 assert.deepEqual(producer.task.researchMethod,researchMethodIdentity());
 assert.ok(f.calls.find(c=>c.id==='author').request.prompt.includes('本品颜色事实能证明人群喜欢吗？'));
 const producerInput=await ordinaryJobInput(f.store.read('new'),producer,producer.attempts[0],{executionRoot:f.root});
 assert.deepEqual(JSON.parse(producerInput.runtimePacketBytes),JSON.parse(await readFile(join(f.root,producer.attempts[0].id,'packet.json'),'utf8')));
 const request=f.request(),receipt=await f.service.readReport('new',request),p=f.store.read('new'),job=p.jobs.find(j=>j.id===receipt.jobId);
 assert.equal(job.status,'succeeded',JSON.stringify(job.error));assert.equal(p.researchReaderReports.length,1);
 const report=p.researchReaderReports[0];assert.equal(report.eligibility.understandingComplete,true);assert.equal(report.eligibility.factualSufficiencyVerified,false);assert.equal(report.eligibility.humanApproval,false);
 const proof=await verifyResearchReaderOriginal(p,report,{executionRoot:f.root,current:true});assert.equal(proof.current,true);assert.equal(proof.scope,'saved-report-prose');
 const changed=structuredClone(p);changed.researchReaderReports[0].eligibility.understandingComplete=false;await assert.rejects(verifyResearchReaderOriginal(changed,changed.researchReaderReports[0],{executionRoot:f.root}),{code:'RESEARCH_READER_ORIGINAL_CHANGED'});
 assert.equal(report.contentHash,p.artifacts[0].contentHash);assert.equal(job.task.readerInput.visibleReport.renderings.length,0);
 const input=await ordinaryJobInput(p,job,job.attempts[0],{executionRoot:f.root});
 assert.deepEqual(JSON.parse(input.runtimePacketBytes),JSON.parse(await readFile(join(f.root,job.attempts[0].id,'packet.json'),'utf8')));
 const count=f.calls.length;await f.service.readReport('new',request);assert.equal(f.calls.length,count);
 await assert.rejects(f.service.readReport('new',{...request,seat:1}),{code:'COMMAND_ID_REUSED'});
 const next=f.reopen();assert.equal(next.store.read('new').researchReaderReports[0].reportHash,report.reportHash);
 await next.service.readReport('new',request);assert.equal(f.calls.length,count);
 assert.equal(next.service.workflow('new').checks.find(c=>c.id==='reader_loop').passed,true,'A complete current first read needs no forced revision round');assert.equal(next.service.workflow('new').canRelease.allowed,false,'Reader understanding cannot waive facts or owner release');
 const beforeRevise=next.store.read('new');next.store.command('new',{kind:'revise-task-card',taskCardId:'new:scope:next',brief:'新范围，旧读者不能用于本版',commandId:'next',expectedRevision:beforeRevise.revision},human);
 const noModels=createResearchService({store:next.store,rootDir:f.root});assert.equal((await noModels.readReport('new',request)).jobId,job.id);assert.equal(f.calls.length,count);const historical=await noModels.readerReport('new',report.id);assert.equal(historical.original.current,false);
});
test('a question plan added after generation cannot retroactively qualify the old report',async t=>{
 const f=await fixture(t,{register:false});const {registrationId}=f.service.registerQuestions('new',{questions:[{id:'late',question:'Can this prove preference?',critical:true}],readerCount:1,commandId:'late',expectedRevision:f.store.read('new').revision},human);
 const count=f.calls.length;
 await assert.rejects(f.service.readReport('new',{...f.request(),registrationId}),{code:'RESEARCH_QUESTIONS_NOT_PREREGISTERED'});
 assert.equal(f.calls.length,count);assert.equal(f.store.read('new').jobs.filter(j=>j.purpose==='research_reader').length,0);
});
test('preregistered reader seats are independent, unique and cannot retry an unknown call',async t=>{
 const f=await fixture(t,{readerCount:2});await f.service.readReport('new',f.request('seat0',0));
 await assert.rejects(f.service.readReport('new',f.request('seat0-again',0)),{code:'READER_OUTCOME_UNSETTLED'});
 await f.service.readReport('new',f.request('seat1',1));assert.equal(f.store.read('new').researchReaderReports.length,2);
 const jobs=f.store.read('new').jobs.filter(j=>j.purpose==='research_reader');assert.notEqual(jobs[0].attempts[0].receipt.threadId,jobs[1].attempts[0].receipt.threadId);
 const executor=createExecutor({store:f.store,rootDir:f.root,bindings:f.bindings,providers:f.providers});await assert.rejects(executor.execute('new',jobs[0].id,{retry:true}),{code:'RESEARCH_READER_RETRY_CLOSED'});
});

test('saved HTTP reader calls reopen without providers after a committed result loses its return',async t=>{
 const f=await fixture(t,{httpModel:true,loseReaderReturn:true});const receipt=await f.service.readReport('new',f.request()),p=f.store.read('new'),job=p.jobs.find(j=>j.id===receipt.jobId);
 assert.equal(job.status,'awaiting_reconciliation',JSON.stringify(job.error));assert.equal(job.attempts.length,1);assert.ok(job.attempts[0].httpAttemptLocator);assert.equal(p.researchReaderReports?.length??0,0);
 const calls=f.calls.length,reopened=f.reopen();const readOnly=createResearchService({store:reopened.store,rootDir:f.root});
 const request={jobId:job.id,commandId:'recover',expectedRevision:reopened.store.read('new').revision};const recovered=await readOnly.reconcileReader('new',request);
 assert.equal(recovered.jobId,job.id);assert.equal(f.calls.length,calls);const after=reopened.store.read('new');assert.equal(after.jobs.find(j=>j.id===job.id).attempts.length,1);assert.equal(after.researchReaderReports.length,1);assert.equal(after.researchReaderReports[0].executionReceipt.provider,'workbench-model-http-v1');
 assert.deepEqual(await readOnly.reconcileReader('new',request),recovered);assert.equal(f.calls.length,calls);
 await assert.rejects(readOnly.reconcileReader('new',{...request,expectedRevision:request.expectedRevision+1}),{code:'COMMAND_ID_REUSED'});
 const verify=createExecutor({store:reopened.store,rootDir:f.root});await verify.verifyOrdinaryOriginals('new');
 const report=after.researchReaderReports[0];await verifyResearchReaderOriginal(after,report,{executionRoot:f.root,current:true});const saved=await readFile(report.payloadRef);await writeFile(report.payloadRef,'{}');await assert.rejects(verifyResearchReaderOriginal(after,report,{executionRoot:f.root}),{code:'RESEARCH_READER_ORIGINAL_CHANGED'});await writeFile(report.payloadRef,saved);
});

test('reader capability never advertises execution when required research roles are missing',async t=>{
 const f=await fixture(t),partial=createResearchService({store:f.store,rootDir:f.root,executionAllowed:true,providers:f.providers,bindings:{research:f.bindings.research,reader:f.bindings.reader}});
 assert.equal(partial.capability().configured,false);assert.equal(partial.capability().reader.configured,false);assert.equal(partial.capability().reader.recheckAvailable,false);assert.equal(partial.capability().handoffAvailable,false);
 const calls=f.calls.length;await assert.rejects(partial.readReport('new',f.request()),{code:'RESEARCH_EXECUTION_UNAVAILABLE'});assert.equal(f.calls.length,calls);assert.equal(f.store.read('new').jobs.filter(j=>j.purpose==='research_reader').length,0);
});
