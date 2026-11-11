import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {acquisitionFixture} from './research-acquisition-fixture.mjs';
import {createExecutor} from './executor.mjs';
import {createResearchService} from './research-service.mjs';
import {source,human} from './research-operator-fixture.mjs';
import {verifyResearchReaderOriginal} from './research-reader-original.mjs';

function readerAnswer(packet){
 const locations=[{location:'/summary',quote:source.text}];
 return {protocolVersion:'research-reader-loop-v1',packetHash:packet.packetHash,phase:packet.phase,
  retellings:['market','audience','competition','product','carrier','synthesis'].map(dimension=>({dimension,understanding:'Synthetic blue product only; audience preference remains unknown.',classification:'mixed',locations})),
  answers:packet.questionRegistration.questions.map(q=>({questionId:q.id,status:'answered',answer:'Blue is a source-relative fact, without evidence of purchase preference.',locations})),
  connections:[{dimensions:['product','audience'],explanation:'Color does not prove audience preference.',strategyConstraint:'Do not infer a preferred style.',limitations:'Synthetic engineering only; actual preference unknown.',locations}],
  issues:[],rechecks:[],limitations:['Synthetic engineering reader; no consumer or human approval.']};
}

test('saved reader of acquired research recovers as history without live acquisition configuration',async t=>{
 const f=await acquisitionFixture();t.after(()=>f.close());
 const id='reader-history';
 f.store.create({id,name:'Synthetic acquired reader history only',brief:'Inspect synthetic blue product without audience claims.',mode:'auto',humanGates:[],workflowVersion:'proposal-seven-v1'},human);
 f.store.command(id,{kind:'confirm-task-card',taskCardId:`${id}:scope:1`,commandId:'confirm',expectedRevision:0},human);
 const service=createResearchService({store:f.store,rootDir:f.root});
 const {registrationId}=service.registerQuestions(id,{questions:[{id:'q1',question:'Does blue prove audience preference?',critical:true}],readerCount:1,commandId:'questions',expectedRevision:f.store.read(id).revision},human);
 const acquisitionRequest={protocolVersion:'research-acquisition-v1',commandId:'acquire',expectedRevision:f.store.read(id).revision,sourceEntryIds:[],materialIds:[]};
 await f.executor.continueResearch(id,acquisitionRequest);
 for(let i=0;i<8;i++){
  for(const jobId of f.executor.researchStatus(id).queuedJobIds)await f.executor.execute(id,jobId);
  await f.executor.advanceResearch(id);
  if(!f.executor.researchStatus(id).queuedJobIds.length)break;
 }
 const produced=f.store.read(id),artifactId=produced.activeByStage.research;
 assert.ok(artifactId);assert.equal(produced.researchAcquisitions[0].state,'sealed');
 assert.ok(produced.jobs.find(j=>j.outputVersionIds?.includes(artifactId)).task.researchDataBasis.acquisition);
 let readerCalls=0;
 const server=http.createServer(async(req,res)=>{
  try{
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   const wire=JSON.parse(Buffer.concat(chunks));
   const packet=JSON.parse(wire.prompt.split('UNTRUSTED_READER_PACKET\n')[1].split('\nEND_UNTRUSTED_READER_PACKET')[0]);
   readerCalls++;
   res.end(JSON.stringify({protocol:wire.protocol,invocationId:wire.invocationId,contextMode:wire.contextMode,terminal:'completed',outputText:JSON.stringify(readerAnswer(packet)),reportedModel:'synthetic',requestId:null,usage:{inputTokens:null,outputTokens:null}}));
  }catch(error){res.destroy(error);}
 });
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const operatorConfig={adapter:'workbench-model-http-v1',endpoint:`http://127.0.0.1:${server.address().port}/model`,model:'synthetic',serviceIdentity:'reader-engineering-acquired',authentication:{kind:'none'},allowLoopbackHttp:true,timeoutMs:1000,maxRequestBytes:8*1024*1024,maxResponseBytes:4*1024*1024,maxOutputBytes:1024*1024,vision:false,envelopes:[],resourceProfile:'bounded-json-v1'};
 f.bindings.reader={providerId:'reader',model:'synthetic',role:'independent-research-reader'};
 f.providers.reader={adapter:operatorConfig.adapter,model:'synthetic',operatorConfig,failpoint:name=>{if(name==='manifest-synced')throw Error('Synthetic reader return lost after original commit');}};
 const executor=createExecutor(f.options),jobId=await executor.enqueueResearchReader(id,artifactId,{registrationId,seat:0,commandId:'reader',expectedRevision:f.store.read(id).revision});
 await executor.execute(id,jobId);
 assert.equal(f.store.read(id).jobs.find(j=>j.id===jobId).status,'awaiting_reconciliation');
 const calls=f.calls.length,tools=f.tools.length;
 f.store.command(id,{kind:'revise-task-card',taskCardId:`${id}:scope:next`,brief:'Changed scope; original acquisition and reader remain historical.',commandId:'next',expectedRevision:f.store.read(id).revision},human);
 const noModels=createExecutor({store:f.store,rootDir:f.root});
 const request={commandId:'recover',expectedRevision:f.store.read(id).revision};
 const sourceFile=produced.artifacts.find(a=>a.id===artifactId).payloadRef,bytes=await readFile(sourceFile);
 await writeFile(sourceFile,'{}');
 try{await assert.rejects(noModels.reconcileResearchReader(id,jobId,request));}
 finally{await writeFile(sourceFile,bytes);}
 const unknown=f.store.read(id);
 assert.equal(unknown.jobs.find(j=>j.id===jobId).status,'awaiting_reconciliation');assert.equal(unknown.researchReaderReports?.length??0,0);
 await noModels.reconcileResearchReader(id,jobId,request);
 const after=f.store.read(id),job=after.jobs.find(j=>j.id===jobId),report=after.researchReaderReports[0];
 assert.equal(job.status,'succeeded');assert.equal(job.attempts.length,1);assert.equal(after.researchReaderReports.length,1);
 assert.equal(report.artifactId,artifactId);assert.equal(report.registrationId,registrationId);
 assert.equal((await verifyResearchReaderOriginal(after,report,{executionRoot:f.root})).current,false);
 await assert.rejects(verifyResearchReaderOriginal(after,report,{executionRoot:f.root,current:true}));
 await noModels.reconcileResearchReader(id,jobId,request);
 assert.equal(f.calls.length,calls);assert.equal(f.tools.length,tools);assert.equal(readerCalls,1);
 assert.equal((await createResearchService({store:f.store,rootDir:f.root}).workflowSnapshot(f.store.read(id))).canRelease.allowed,false);
});
