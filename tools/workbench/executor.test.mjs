import {diskReceipt} from './selected-stage-fixture.mjs';
import {syntheticStrategyV2} from './strategy-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from './store.mjs';
import {createExecutor} from './executor.mjs';
const context={actorId:'synthetic-human',actorType:'human',runId:'human',contextId:'human'};
async function fixture(fn) {
 const root=await mkdtemp(join(tmpdir(),'executor-test-')),store=openStore(join(root,'db'));
 try {store.create({id:'p',name:'Synthetic',brief:'Synthetic test only',mode:'auto'},context);store.command('p',{commandId:'confirm',expectedRevision:0,kind:'confirm-task-card',taskCardId:'p:scope:1'},context);await fn({root,store});}
 finally {store.close();await rm(root,{recursive:true,force:true});}
}
const binding={research:{providerId:'synthetic-provider',model:'synthetic',role:'research-lead'}};
const base={researchContractVersion:'research-data-v2',chartData:null,quantitativeClaims:[],title:'合成稿',summary:'仅测试',sections:[{heading:'计划',body:'搜集资料',evidenceIds:[]}],claims:[],gaps:[]};
const ownedResponse=(root,request,output)=>diskReceipt(root,request,{runId:request.runId,model:'synthetic',threadId:'synthetic-thread-'+request.runId,responseText:JSON.stringify(output),parsedOutput:output});
const response=output=>({threadId:'synthetic-thread',inputPacketHash:'synthetic-hash',requestedModel:'synthetic',usage:{input_tokens:1},cost:null,exitCode:0,parsedOutput:output});
test('missing provider persists blocked attempt without invented artifact',()=>fixture(async({root,store})=>{
 const e=createExecutor({store,rootDir:root});const id=e.enqueue('p','research');const job=await e.execute('p',id);
 assert.equal(job.status,'blocked');assert.equal(job.error.code,'PROVIDER_MISSING');assert.equal(store.read('p').artifacts.length,0);
}));
test('actual lifecycle persists blocked research plan and immutable source-free packet',()=>fixture(async({root,store})=>{
 const providers={'synthetic-provider':{model:'synthetic',execute:async request=>ownedResponse(root,request,{...base,outputKind:'research_plan',status:'blocked',gaps:['没有来源'],evidenceClassifications:[]})}};
 const e=createExecutor({store,rootDir:root,providers,bindings:binding}),id=e.enqueue('p','research');const job=await e.execute('p',id);
 assert.equal(job.status,'blocked');assert.equal(job.error.code,'STAGE_INPUT_GAP');assert.equal(store.read('p').artifacts.length,0);
 assert.match(await readFile(job.attempts[0].receipt.validatedOutputPath,'utf8'),/research_plan/);
}));
test('finding completion retains pending facts and never releases research itself',()=>fixture(async({root,store})=>{
 const records=[{id:'s1',url:'https://example.org',text:'Synthetic excerpt',verification:'captured',scopeRelation:'background'}];
 const output={...base,outputKind:'research_findings',status:'draft',claims:[{text:'合成事实',kind:'fact',evidenceRefs:['s1'],limitations:['未独立核验']}],evidenceClassifications:[{sourceId:'s1',scopeRelation:'background',reason:'背景材料'}]};
 const providers={'synthetic-provider':{model:'synthetic',execute:async request=>ownedResponse(root,request,output)}};
 const e=createExecutor({store,rootDir:root,providers,bindings:binding}),id=e.enqueue('p','research',{sourceRecords:records});
 records[0].text='Changed outside frozen job';
 const job=await e.execute('p',id);assert.equal(job.status,'succeeded',JSON.stringify(job.error));
 const p=store.read('p');assert.equal(p.artifacts[0].claims[0].verification,'pending');assert.equal(p.releases.length,0);
 assert.equal(job.task.sourceRecords[0].text,'Synthetic excerpt');
 assert.deepEqual(p.artifacts[0].technicalReceipts.sourceCatalogue,{version:1,records:job.task.sourceRecords});
}));
test('uncertain call persists reconciliation and cannot be silently retried',()=>fixture(async({root,store})=>{
 let calls=0;const providers={'synthetic-provider':{model:'synthetic',execute:async()=>{calls++;throw Object.assign(new Error('timeout'),{status:'awaiting_reconciliation'});}}};
 const e=createExecutor({store,rootDir:root,providers,bindings:binding}),id=e.enqueue('p','research');
 assert.equal((await e.execute('p',id)).status,'awaiting_reconciliation');
 await assert.rejects(()=>e.execute('p',id,{retry:true}));assert.equal(calls,1);
}));

test('model mismatch blocks before dispatch',()=>fixture(async({root,store})=>{
 let calls=0;
 const providers={'synthetic-provider':{model:'other',execute:async()=>{calls++;}}};
 const e=createExecutor({store,rootDir:root,providers,bindings:binding}),id=e.enqueue('p','research');
 const job=await e.execute('p',id);
 assert.equal(job.status,'blocked');assert.equal(job.error.code,'MODEL_BINDING_MISMATCH');assert.equal(calls,0);
}));
test('plain post-dispatch error cannot issue a second request',()=>fixture(async({root,store})=>{
 let calls=0;
 const providers={'synthetic-provider':{model:'synthetic',execute:async()=>{calls++;throw new Error('receipt write failed');}}};
 const e=createExecutor({store,rootDir:root,providers,bindings:binding}),id=e.enqueue('p','research');
 assert.equal((await e.execute('p',id)).status,'awaiting_reconciliation');
 await assert.rejects(()=>e.execute('p',id,{retry:true}));assert.equal(calls,1);
}));
test('unexpected provider identity stays intact in the raw receipt',()=>fixture(async({root,store})=>{
 const raw={...response({}),model:'unexpected',requestedModel:'unexpected'};
 const providers={'synthetic-provider':{model:'synthetic',execute:async()=>raw}};
 const e=createExecutor({store,rootDir:root,providers,bindings:binding}),id=e.enqueue('p','research');
 const job=await e.execute('p',id);
 assert.equal(job.status,'awaiting_reconciliation');
 assert.deepEqual(job.attempts[0].receipt.providerExecution,raw);
 assert.equal(raw.model,'unexpected');
}));

const capturedSource={id:'s1',url:'https://example.org',text:'Frozen synthetic excerpt',verification:'captured',scopeRelation:'background'};
function lineageFixture() {
 const project={revision:0,activeByStage:{research:'research-new',strategy:'strategy'},artifacts:[
  {id:'research-old',inputVersionIds:[]},
  {id:'research-new',inputVersionIds:[]},
  {id:'strategy',inputVersionIds:['research-old']},
 ],jobs:[
  {outputVersionIds:['research-old'],task:{sourceRecords:[capturedSource]}},
  {outputVersionIds:['research-new'],task:{sourceRecords:[{...capturedSource,text:'Unrelated replacement'}]}},
  {outputVersionIds:['strategy']},
 ]};
 let command;
 const store={read:()=>project,command:(_id,value)=>{command=structuredClone(value);}};
 return {project,executor:createExecutor({store,rootDir:tmpdir()}),get command(){return command;}};
}
test('copy catalogue follows the exact recursive artifact ancestry, excluding newer unrelated research',()=>{
 const f=lineageFixture();f.executor.enqueue('p','copy');
 assert.deepEqual(f.command.task.sourceRecords,[capturedSource]);
 assert.equal(f.project.jobs.length,3);
});
test('inherited source identities reject modified text, URLs and verification without writing a job',()=>{
 for(const change of [{text:'Changed'},{url:'https://other.example.org'},{verification:'verified'}]) {
  const f=lineageFixture();
  assert.throws(()=>f.executor.enqueue('p','copy',{sourceRecords:[{...capturedSource,...change}]}),{code:'SOURCE_ID_CONFLICT'});
  assert.equal(f.command,undefined);
 }
});
test('identical source resupply deduplicates and new sources retain their captured records',()=>{
 const f=lineageFixture(),extra={...capturedSource,id:'s2'};
 f.executor.enqueue('p','copy',{sourceRecords:[{...capturedSource},extra]});
 extra.text='Caller mutation';
 assert.deepEqual(f.command.task.sourceRecords,[capturedSource,{...capturedSource,id:'s2'}]);
});
test('artifact catalogue supports imports without a producing task and detects inconsistent ancestry',()=>{
 const f=lineageFixture();
 f.project.artifacts[0].technicalReceipts={sourceCatalogue:{version:1,records:[capturedSource]}};
 delete f.project.jobs[0].task;
 f.executor.enqueue('p','copy');
 assert.deepEqual(f.command.task.sourceRecords,[capturedSource]);
 f.project.artifacts[2].technicalReceipts={sourceCatalogue:{version:1,records:[{...capturedSource,text:'Changed upstream'}]}};
 assert.throws(()=>f.executor.enqueue('p','copy'),{code:'SOURCE_ID_CONFLICT'});
});
test('default strategy enqueue carries released research catalogue into prompt, schema, packet and artifact',()=>fixture(async({root,store})=>{
 const {writeFile}=await import('node:fs/promises');
 const {createHash}=await import('node:crypto');
 const raw=JSON.stringify({title:'Synthetic imported research',evidenceRefs:['s1'],claims:[]},null,2),file=join(root,'import.json');
 await writeFile(file,raw);
 const send=(command,actor=context)=>store.command('p',{...command,commandId:`setup-${store.read('p').revision}`,expectedRevision:store.read('p').revision},actor);
 send({kind:'request-stage',stage:'research',jobId:'import'});
 send({kind:'complete-stage',jobId:'import',artifactId:'research',payloadRef:file,contentHash:createHash('sha256').update(raw).digest('hex'),technicalReceipts:{sourceCatalogue:{version:1,records:[capturedSource]}}});
 for(const side of ['producer','consumer'])send({kind:'acknowledge-handoff',artifactId:'research',side,nextStage:'strategy'},side==='producer'?context:{...context,actorId:'synthetic-consumer'});
 const providers={'synthetic-provider':{model:'synthetic',execute:async request=>{
  assert.deepEqual(request.outputSchema.properties.claims.items.properties.evidenceRefs.items.enum,['s1']);
  assert.match(request.prompt,/Frozen synthetic excerpt/);
  const input=JSON.parse(request.prompt.slice(request.prompt.indexOf('UNTRUSTED_JSON_DATA\n')+20,request.prompt.lastIndexOf('\nEND_UNTRUSTED_JSON_DATA')));
  const out=syntheticStrategyV2(input);return {...response(out),responseText:JSON.stringify(out),runId:request.runId,requestedModel:'synthetic',threadId:'strategy-thread',inputPacketHash:createHash('sha256').update(JSON.stringify({runId:request.runId,model:'synthetic',prompt:request.prompt,outputSchema:request.outputSchema})).digest('hex')};
 }}};
 const e=createExecutor({store,rootDir:root,providers,bindings:{strategy:binding.research}});
 assert.throws(()=>e.enqueue('p','strategy'),{code:'DEPENDENCY_BLOCKED'});
 send({kind:'release-stage',artifactId:'research'});
 const id=e.enqueue('p','strategy'),job=await e.execute('p',id);
 assert.equal(job.status,'succeeded',JSON.stringify(job.error));
 const packet=JSON.parse(await readFile(join(root,job.attemptId,'packet.json'),'utf8'));
 assert.deepEqual(packet.sourceRecords,[capturedSource]);
 assert.deepEqual(store.read('p').artifacts.at(-1).technicalReceipts.sourceCatalogue,{version:1,records:[capturedSource]});
}));

test('durable execution request replay preserves original binding, scope and catalogue after configuration changes',()=>fixture(async({root,store})=>{
 const config=structuredClone(binding);
 const e=createExecutor({store,rootDir:root,bindings:config});
 const request={commandId:'http-request',expectedRevision:1,sourceRecords:[capturedSource]};
 const id=e.enqueue('p','research',request);
 const original=store.read('p').jobs[0];
 config.research.model='replacement-model';
 store.command('p',{commandId:'new-scope',expectedRevision:2,kind:'revise-task-card',taskCardId:'scope-new',brief:'Changed brief'},context);
 assert.equal(e.enqueue('p','research',request),id);
 assert.deepEqual(store.read('p').jobs[0],original);
 assert.equal(original.task.brief,'Synthetic test only');
 assert.equal(original.task.taskCardId,'p:scope:1');
 assert.throws(()=>e.enqueue('p','research',{...request,sourceRecords:[{...capturedSource,text:'Changed'}]}),{code:'COMMAND_ID_REUSED'});
 assert.throws(()=>e.enqueue('p','research',{...request,expectedRevision:3}),{code:'COMMAND_ID_REUSED'});
 assert.equal(store.read('p').jobs.length,1);
}));

test('changed scope prevents dispatch while request replay retains its frozen brief',()=>fixture(async({root,store})=>{
 let prompt;
 const e=createExecutor({store,rootDir:root,bindings:binding,providers:{'synthetic-provider':{model:'synthetic',async execute(input){prompt=input.prompt;return response({...base,outputKind:'research_plan',status:'blocked',gaps:['No evidence'],evidenceClassifications:[]});}}}});
 const id=e.enqueue('p','research',{commandId:'run',expectedRevision:1});
 store.command('p',{commandId:'revise',expectedRevision:2,kind:'revise-task-card',taskCardId:'scope-new',brief:'Replacement brief'},context);
 store.command('p',{commandId:'confirm-new',expectedRevision:3,kind:'confirm-task-card',taskCardId:'scope-new'},context);
 const blocked=await e.execute('p',id);assert.equal(blocked.status,'blocked');assert.equal(blocked.error.code,'STALE_JOB');
 assert.equal(prompt,undefined);
 assert.equal(e.enqueue('p','research',{commandId:'run',expectedRevision:1}),id);
 assert.equal(store.read('p').jobs[0].task.brief,'Synthetic test only');
}));

test('real executor lifecycle persists independent excerpt report without rewriting author facts',()=>fixture(async({root,store})=>{
 const {evidenceClaimManifest}=await import('./evidence-review.mjs');
 const sources=[{id:'s1',url:'https://example.org',text:'蓝色包装',verification:'captured',scopeRelation:'background'}];
 const production={...base,outputKind:'research_findings',status:'draft',claims:[{text:'所供资料写蓝色包装',kind:'fact',evidenceRefs:['s1'],limitations:['仅为摘录']}],evidenceClassifications:[{sourceId:'s1',scopeRelation:'background',reason:'背景资料'}]};
 const providers={'synthetic-provider':{model:'synthetic',execute:async request=>ownedResponse(root,request,production)},reviewer:{model:'synthetic',execute:async(request)=>{
   const {outputSchema}=request;
   const report=Object.fromEntries(Object.entries(outputSchema.properties).filter(([,v])=>v.enum).map(([k,v])=>[k,v.enum[0]]));
   const job=store.read('p').jobs.find(j=>j.purpose==='verification'),input=job.task.verificationInput;
   report.results=[{claimKey:evidenceClaimManifest(input.content)[0].claimKey,outcome:'supported_excerpt',rationale:'原文支持限定的摘录转述',citations:[{sourceId:'s1',textHash:(await import('node:crypto')).createHash('sha256').update('蓝色包装').digest('hex'),quote:'蓝色包装'}],requirementRefs:[],limitations:['不认证网页真实性']}];
   report.quantitativeResults=[];
   report.wholeTextScan={status:'complete',creativeClaimKeys:[],omissions:[],mismatchedCreative:[],operationalAssertions:[]};report.limitations=[];
   return diskReceipt(root,request,{runId:request.runId,model:'synthetic',responseText:JSON.stringify(report),parsedOutput:report,threadId:'distinct-review-thread'});
 }}};
 const e=createExecutor({store,rootDir:root,providers,bindings:{...binding,verification:{providerId:'reviewer',model:'synthetic',role:'evidence-reviewer'}}});
 assert.equal((await e.execute('p',e.enqueue('p','research',{sourceRecords:sources}))).status,'succeeded');
 const a=store.read('p').artifacts[0],expectedRevision=store.read('p').revision;
 const id=await e.enqueueVerification('p',a.id,{commandId:'verify',expectedRevision});
 assert.equal(await e.enqueueVerification('p',a.id,{commandId:'verify',expectedRevision}),id);
 assert.equal((await e.execute('p',id)).status,'succeeded');
 const p=store.read('p');assert.equal(p.verifications.length,1);assert.equal(p.verifications[0].hasBlockingFindings,false);
 assert.equal(p.artifacts[0].claims[0].verification,'pending');assert.equal(p.artifacts[0].technicalReceipts.sourceCatalogue.records[0].verification,'captured');
 assert.equal(p.releases.length,0);assert.equal(p.activeByStage.research,a.id);
 assert.equal(await e.enqueueVerification('p',a.id,{commandId:'verify',expectedRevision}),id);
 await assert.rejects(()=>e.execute('p',id));
}));

test('conservative draft classification retains captured direct catalogue without release',()=>fixture(async({root,store})=>{
 const records=[{id:'s1',url:'https://example.org',text:'Synthetic excerpt',verification:'captured',scopeRelation:'direct'}];
 const output={...base,outputKind:'research_findings',status:'draft',claims:[{text:'合成摘录',kind:'fact',evidenceRefs:['s1'],limitations:['尚未核验']}],evidenceClassifications:[{sourceId:'s1',scopeRelation:'background',reason:'仅限背景'}]};
 const providers={'synthetic-provider':{model:'synthetic',execute:async request=>ownedResponse(root,request,output)}};
 const e=createExecutor({store,rootDir:root,providers,bindings:binding});
 const job=await e.execute('p',e.enqueue('p','research',{sourceRecords:records}));
 assert.equal(job.status,'succeeded',JSON.stringify(job.error));
 const p=store.read('p'),a=p.artifacts[0];
 assert.deepEqual(a.technicalReceipts.sourceCatalogue.records,records);
 const saved=JSON.parse(await readFile(a.payloadRef,'utf8'));
 assert.deepEqual(saved.evidenceClassifications,[{sourceId:'s1',scopeRelation:'background',reason:'仅限背景',suppliedScopeRelation:'direct',sourceVerification:'captured'}]);
 assert.equal(a.claims[0].verification,'pending');
 assert.equal(p.verifications.length,0);
 assert.equal(p.releases.length,0);
 assert.deepEqual(job.attempts[0].receipt.providerExecution.parsedOutput,output);
}));
