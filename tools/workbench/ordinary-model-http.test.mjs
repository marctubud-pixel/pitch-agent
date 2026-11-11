import {createServer} from './server.mjs';
import {referenceFixture,referenceProductionFixture} from './reference-dossier-fixtures.mjs';
import {referenceReviewFixtureOutput} from './reference-review-fixtures.mjs';
import {verifyReferenceOriginal} from './reference-original.mjs';
import {createIntakeRuntime} from './intake-runtime.mjs';
import {createImageEvidenceStore} from './image-evidence.mjs';
import {TASK_FIELDS,cardHash} from './intake-contract.mjs';
import {referenceFixturePng} from './reference-dossier-fixtures.mjs';
import {acquisitionFixture} from './research-acquisition-fixture.mjs';
import {ACQUISITION_BRANCHES} from './research-acquisition.mjs';
import {verifyAcquisitionGeneration} from './research-acquisition-original.mjs';
import {acceptedOperatorResearch,releaseRequest,continuationRequest} from './research-operator-fixture.mjs';
import {syntheticOwnerOutput,panelFixtureOutput,syntheticCopy} from './owner-edge-fixtures.mjs';
import {syntheticStrategyV2} from './strategy-fixtures.mjs';
import {STRATEGY_CREATIVE_PROTOCOL} from './creative-panel.mjs';
import {verifyOwnerOriginal} from './owner-original.mjs';
import {ownerEdgeState} from './project.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,realpath,rm,readFile,writeFile,chmod,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {openStore} from './store.mjs';
import {createExecutor} from './executor.mjs';
import {output,bindings,human,source} from './research-operator-fixture.mjs';
import {verifyResearchDataOriginal} from './stage-original.mjs';
import {verifyReviewOriginal} from './review-original.mjs';
import {invokeOrdinary,reopenOrdinary,ordinarySuccess,ordinarySameContext,ordinaryHttpLocator} from './ordinary-model.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
async function gateway(t,handler=output){
 const root=await realpath(await mkdtemp(join(tmpdir(),'ordinary-http-u2-')));console.log(JSON.stringify({ownedGatewayRoot:root,pid:process.pid,at:new Date().toISOString()}));let calls=0;
 const server=http.createServer(async(req,res)=>{calls++;try{const chunks=[];for await(const c of req)chunks.push(c);const wireBytes=Buffer.concat(chunks);await writeFile(join(root,`gateway-${calls}-request.json`),wireBytes);const wire=JSON.parse(wireBytes);const result=await handler({...wire,runId:wire.invocationId});res.end(JSON.stringify({protocol:'workbench-stateless-model-json-v1',invocationId:wire.invocationId,contextMode:'stateless-v1',terminal:'completed',outputText:JSON.stringify(result),reportedModel:'reported-synthetic',requestId:null,usage:{inputTokens:null,outputTokens:null}}));}catch{res.destroy();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));console.log(JSON.stringify({retainedOwnedRoot:root,calls,at:new Date().toISOString()}));});
 const operatorConfig={adapter:'workbench-model-http-v1',endpoint:`http://127.0.0.1:${server.address().port}/model`,model:'synthetic',serviceIdentity:'owned-synthetic-gateway',authentication:{kind:'none'},allowLoopbackHttp:true,timeoutMs:10000,maxRequestBytes:8*1024*1024,maxResponseBytes:4*1024*1024,maxOutputBytes:1024*1024,vision:true,envelopes:['sketch-review-v2','final-visual-v1','complete-content-v1']};
 return {root,operatorConfig,provider:{adapter:'workbench-model-http-v1',model:'synthetic',operatorConfig},calls:()=>calls};
}
test('ordinary boundary persists locator before send, preserves exact saved execution, and reopens without configuration',async t=>{
 const f=await gateway(t,()=>({ok:true})),binding={providerId:'中文服务',model:'synthetic',role:'ordinary-author'},attemptId='owned-attempt',request={prompt:'Owned synthetic JSON',outputSchema:{type:'object'}},runtimePacketBytes=Buffer.from(JSON.stringify({kind:'owned-domain',attemptId,request},null,2));let locator;
 const call={executionRoot:f.root,provider:f.provider,binding,attemptId,request,runtimePacketBytes,persistLocator:async value=>{assert.equal(f.calls(),0);locator=value;}};
 const receipt=await invokeOrdinary(call);assert.deepEqual(locator,ordinaryHttpLocator(attemptId));assert.equal(ordinarySuccess(receipt),true);assert.equal(receipt.cost,null);assert.equal(receipt.reportedModel,'reported-synthetic');assert.equal(receipt.requestedModel,'synthetic');
 for(const key of ['threadId','exitCode','paths','verified'])assert.equal(Object.hasOwn(receipt,key),false);
 assert.notEqual(receipt.inputPacketHash,receipt.runtimePacketHash);assert.notEqual(receipt.runtimePacketHash,receipt.wireRequestHash);
 assert.deepEqual(await reopenOrdinary({...call,provider:undefined,receipt}),receipt);assert.equal(f.calls(),1);
 const recovered=await reopenOrdinary({...call,provider:undefined,attemptLocator:locator});assert.deepEqual(recovered,receipt);assert.equal(f.calls(),1);
 assert.equal(ordinarySameContext(receipt,recovered),true);assert.equal(ordinarySameContext(receipt,{threadId:'old-cli'}),false);
 await assert.rejects(()=>reopenOrdinary({...call,receipt:{...receipt,original:{...receipt.original,manifestHash:'0'.repeat(64)}}}));
 const dir=join(f.root,'ordinary-model-http',receipt.original.rootRelativePath);
 for(const name of await readdir(dir)){const path=join(dir,name),bytes=await readFile(path);await chmod(path,0o600);await writeFile(path,Buffer.concat([bytes,Buffer.from('x')]));await assert.rejects(()=>reopenOrdinary({...call,receipt}),name);await writeFile(path,bytes);}
 assert.equal(f.calls(),1);
});
test('actual HTTP numerical research, v4 independent verification and readiness retain ordinary physical originals',async t=>{
 const f=await gateway(t),store=openStore(join(f.root,'owned.sqlite'));t.after(()=>store.close());
 store.create({id:'p',name:'Owned synthetic only',brief:'Explore the supplied blue packaging example, without audience claims.',mode:'auto',humanGates:[]},human);
 store.command('p',{kind:'confirm-task-card',taskCardId:'p:scope:1',commandId:'confirm',expectedRevision:0},human);
 const providers=Object.fromEntries(['author','reviewer','strategist'].map(id=>[id,f.provider]));const executor=createExecutor({store,rootDir:f.root,providers,bindings,imageProvider:null});
 const job=await executor.execute('p',executor.enqueue('p','research',{sourceRecords:[source]}));assert.equal(job.status,'succeeded',JSON.stringify(job.error));
 const artifact=store.read('p').artifacts[0];
 for(const method of ['enqueueVerification','enqueueReadiness']){const id=await executor[method]('p',artifact.id,{commandId:method,expectedRevision:store.read('p').revision,protocolVersion:method==='enqueueReadiness'?'research-readiness-v2':undefined});const result=await executor.execute('p',id);assert.equal(result.status,'succeeded',JSON.stringify(result.error));}
 let p=store.read('p');assert.equal(p.verifications[0].rawReport.protocolVersion,'excerpt-support-v4');
 await verifyResearchDataOriginal(p,p.artifacts[0],{executionRoot:f.root});
 for(const [kind,report] of [['verification',p.verifications[0]],['readiness',p.readinessReports[0]]])await verifyReviewOriginal(p,kind,report,{executionRoot:f.root});
 for(const [label,change] of [
  ['frozen research brief',q=>q.jobs.find(j=>j.stage==='research'&&(!j.purpose||j.purpose==='stage')).task.brief='Changed frozen request'],
  ['frozen research model',q=>q.jobs.find(j=>j.stage==='research'&&(!j.purpose||j.purpose==='stage')).binding.model='changed-model'],
  ['frozen verification task',q=>q.jobs.find(j=>j.purpose==='verification').task.verificationInput.artifactId='changed-artifact'],
  ['frozen readiness task',q=>q.jobs.find(j=>j.purpose==='readiness').task.readinessInput.artifactId='changed-artifact'],
 ])await t.test(label,async()=>{const q=structuredClone(p);change(q);await assert.rejects(()=>verifyResearchDataOriginal(q,q.artifacts[0],{executionRoot:f.root}));});
 const before=f.calls();for(const value of Object.values(providers)){value.operatorConfig={};value.environment={};}
 await verifyResearchDataOriginal(p,p.artifacts[0],{executionRoot:f.root});assert.equal(f.calls(),before);
 for(const receipt of [artifact.executionReceipt,p.verifications[0].executionReceipt,p.readinessReports[0].executionReceipt]){
  const path=join(f.root,'ordinary-model-http',receipt.original.rootRelativePath,'response.bin'),bytes=await readFile(path);await chmod(path,0o600);await writeFile(path,Buffer.concat([bytes,Buffer.from(' ')]));await assert.rejects(()=>verifyResearchDataOriginal(p,p.artifacts[0],{executionRoot:f.root}));await writeFile(path,bytes);
 }
 assert.equal(f.calls(),before);
 const reopened=openStore(join(f.root,'owned.sqlite'));try{p=reopened.read('p');await verifyResearchDataOriginal(p,p.artifacts[0],{executionRoot:f.root});assert.equal(f.calls(),before);}finally{reopened.close();}
});
test('committed research and readiness with lost owner return recover from pre-dispatch locators with zero new HTTP',async t=>{
 for(const purpose of ['research','readiness'])await t.test(purpose,async t=>{
  const f=await gateway(t),store=openStore(join(f.root,'lost.sqlite'));t.after(()=>store.close());let lose=false;
  const provider={...f.provider,failpoint:async name=>{if(lose&&name==='manifest-synced')throw Error('Owned terminal return loss');}};
  const providers=Object.fromEntries(['author','reviewer','strategist'].map(id=>[id,provider]));
  store.create({id:'p',name:'Owned terminal-loss test',brief:'Explore the supplied blue packaging example, without audience claims.',mode:'auto',humanGates:[]},human);store.command('p',{kind:'confirm-task-card',taskCardId:'p:scope:1',commandId:'confirm',expectedRevision:0},human);
  let executor=createExecutor({store,rootDir:f.root,providers,bindings,imageProvider:null}),job;
  if(purpose==='research'){lose=true;job=await executor.execute('p',executor.enqueue('p','research',{sourceRecords:[source]}));}
  else{const produced=await executor.execute('p',executor.enqueue('p','research',{sourceRecords:[source]}));assert.equal(produced.status,'succeeded');lose=true;const id=await executor.enqueueReadiness('p',store.read('p').artifacts[0].id,{protocolVersion:'research-readiness-v2'});job=await executor.execute('p',id);}
  assert.equal(job.status,'awaiting_reconciliation',JSON.stringify(job.error));assert.ok(job.attempts[0].httpAttemptLocator);assert.equal(job.attempts[0].receipt,undefined);
  const before=f.calls();executor=createExecutor({store,rootDir:f.root,providers:{},bindings:{},imageProvider:null});
  if(purpose==='research'){const recovered=await executor.reconcile('p',job.id,{commandId:'recover-research',expectedRevision:store.read('p').revision,reason:'Owned saved terminal only'});assert.equal(recovered.status,'succeeded');}
  else{const request={action:'recover-saved',jobId:job.id,attemptId:job.attemptId,commandId:'recover-readiness',expectedRevision:store.read('p').revision};const recovered=await executor.resolveReadiness('p',request);assert.equal(recovered.kind,'recovered');assert.equal(store.read('p').readinessResolutions[0].proof.kind,'saved-readiness-http-v1');assert.deepEqual(await executor.resolveReadiness('p',request),recovered);}
  assert.equal(f.calls(),before);
 });
});

test('actual ordinary HTTP research to strategy, creative panel, two independent owners and copy',async t=>{
 const parse=req=>JSON.parse(req.prompt.slice(req.prompt.indexOf('UNTRUSTED_JSON_DATA\n')+20,req.prompt.lastIndexOf('\nEND_UNTRUSTED_JSON_DATA')));
 const f=await gateway(t,request=>{const input=parse(request);return input.strategyBasis?syntheticStrategyV2(input):input.envelope?syntheticOwnerOutput(input):input.phase?panelFixtureOutput(input):request.outputSchema?.properties.outputKind?.enum[0]==='copy'?syntheticCopy:output(request);});
 const store=openStore(join(f.root,'chain.sqlite'));t.after(()=>store.close());const configured={...bindings,copy:{providerId:'strategist',model:'synthetic',role:'copy-lead'},...Object.fromEntries(['creative_score_strategy','creative_opposition_strategy','creative_director'].map(role=>[role,{providerId:'strategist',model:'synthetic',role:role+'-lead'}]))};
 const providers=Object.fromEntries(['author','reviewer','strategist'].map(id=>[id,f.provider]));const evidenceRef=join(f.root,'owned-calibration');await writeFile(evidenceRef,'owned synthetic only');const creativeCalibrations=[{protocolVersion:STRATEGY_CREATIVE_PROTOCOL,stage:'strategy',role:'strategy',providerId:'strategist',model:'synthetic',evidenceRef,evidenceHash:hash('owned synthetic only')}];
 store.create({id:'p',name:'Owned full ordinary chain',brief:'Explore the supplied blue packaging example, without audience claims.',mode:'auto',humanGates:[]},human);store.command('p',{kind:'confirm-task-card',taskCardId:'p:scope:1',commandId:'confirm',expectedRevision:0},human);
 const executor=createExecutor({store,rootDir:f.root,providers,bindings:configured,creativeCalibrations,imageProvider:null}),run=async id=>{const result=await executor.execute('p',await id);assert.equal(result.status,'succeeded',JSON.stringify(result.error));return result;};
 await run(executor.enqueue('p','research',{sourceRecords:[source]}));const artifact=store.read('p').artifacts[0];await run(executor.enqueueVerification('p',artifact.id));await run(executor.enqueueReadiness('p',artifact.id,{protocolVersion:'research-readiness-v2'}));
 const fixture={root:f.root,store,executor,artifact};await acceptedOperatorResearch(fixture);await executor.releaseResearch('p',releaseRequest(fixture),human);await run(executor.continueResearch('p',continuationRequest(fixture)));
 const strategy=store.read('p').artifacts.at(-1);await run(executor.enqueueVerification('p',strategy.id));await executor.enqueueCreativePanel('p',{artifactId:strategy.id,commandId:'strategy-panel',expectedRevision:store.read('p').revision});
 for(let i=0;i<6;i++)for(const id of executor.advanceCreativePanels('p'))await run(id);
 await executor.continueStrategy('p',{artifactId:strategy.id,commandId:'strategy-continue',expectedRevision:store.read('p').revision});
 for(let i=0;i<5;i++)for(const id of await executor.advanceOwnerEdges('p'))await run(id);
 const p=store.read('p'),edge=p.ownerEdges.at(-1);assert.equal(ownerEdgeState(p,edge).status,'committed');assert.equal(p.ownerReports.length,2);
 const copy=p.jobs.find(j=>j.id===edge.commit.jobId);if(copy.status==='queued')await run(copy.id);assert.equal(store.read('p').artifacts.at(-1).copyContract.status,'complete');
 for(const report of p.ownerReports)await verifyOwnerOriginal(p,report,{executionRoot:f.root});
 const calls=f.calls(),receipt=p.ownerReports[0].executionReceipt,path=join(f.root,'ordinary-model-http',receipt.original.rootRelativePath,'wire.json'),bytes=await readFile(path);await chmod(path,0o600);await writeFile(path,Buffer.concat([bytes,Buffer.from(' ')]));await assert.rejects(()=>executor.advanceOwnerEdges('p'));await writeFile(path,bytes);assert.equal(f.calls(),calls);
});

test('actual intake vision and lost terminal receipt recover without configuration, then reject changed transport',async t=>{
 const f=await gateway(t,()=>({protocol:'task-card-extraction-v1',brief:'Owned synthetic intake',fields:Object.fromEntries(TASK_FIELDS.map(k=>[k,{value:null,knowledge:'not_stated',sources:[],suggestions:[],limitations:[]}])),productParameters:[],openQuestions:[],limitations:['Synthetic mechanism only.']})),store=openStore(join(f.root,'intake.sqlite'));t.after(()=>store.close());
 store.create({id:'p',name:'Owned intake HTTP',brief:'Owned requested scope'},human);const imageStore=createImageEvidenceStore({rootDir:join(f.root,'images')}),provider={...f.provider,failpoint:async name=>{if(name==='manifest-synced')throw Error('Owned lost return');}},binding={providerId:'中文摄取服务',model:'synthetic',role:'intake-lead'};
 let runtime=createIntakeRuntime({store,root:f.root,providers:{[binding.providerId]:provider},bindings:{intake:binding},imageStore});
 const uploaded=await runtime.upload('p',{originalFilename:'owned.png',commandId:'upload',expectedRevision:store.read('p').revision},referenceFixturePng(1));const base=store.read('p').taskCards[0],requested=await runtime.requestExtraction('p',{documentIds:[uploaded.documentId],baseTaskCardId:base.id,baseTaskCardHash:cardHash(base),commandId:'extract',expectedRevision:store.read('p').revision});const job=await runtime.execute('p',requested.jobId);assert.equal(job.status,'awaiting_reconciliation',JSON.stringify(job.error));assert.ok(job.attempts[0].httpAttemptLocator);assert.equal(job.attempts[0].resultEvidence,undefined);
 const before=f.calls();runtime=createIntakeRuntime({store,root:f.root,providers:{},bindings:{},imageStore});const request={jobId:job.id,attemptId:job.attemptId,commandId:'recover',expectedRevision:store.read('p').revision};await runtime.reconcile('p',request,human);assert.equal(store.read('p').jobs.at(-1).status,'succeeded');assert.equal(f.calls(),before);await runtime.reconcile('p',request,human);assert.equal(f.calls(),before);
 const locator=job.attempts[0].httpAttemptLocator,path=join(f.root,'ordinary-model-http',locator.rootRelativePath,'response.bin'),bytes=await readFile(path);await chmod(path,0o600);await writeFile(path,Buffer.concat([bytes,Buffer.from('x')]));await assert.rejects(()=>runtime.reconcile('p',request,human));await writeFile(path,bytes);
});
test('actual acquisition planner uses exact domain wrapper and committed locator recovery with zero HTTP',async t=>{
 const f=await acquisitionFixture();t.after(()=>f.close({retain:true}));console.log(JSON.stringify({ownedAcquisitionRoot:f.root}));const gatewayFixture=await gateway(t,request=>{const input=JSON.parse(request.prompt.slice(request.prompt.indexOf('UNTRUSTED_JSON_DATA\n')+20,request.prompt.lastIndexOf('\nEND_UNTRUSTED_JSON_DATA'))),e=input.envelope;return {protocolVersion:'research-acquisition-plan-v1',generationId:e.id,envelopeHash:e.envelopeHash,branches:ACQUISITION_BRANCHES.map(kind=>({kind,scope:e.scope,applicability:'active',reason:'Owned bounded planner fixture.',queries:[kind+' synthetic']}))};});
 const provider={...gatewayFixture.provider,operatorConfig:{...gatewayFixture.operatorConfig,maxOutputBytes:65536,maxResponseBytes:131072},failpoint:async name=>{if(name==='manifest-synced')throw Error('Owned lost return');}};f.providers.planner=provider;f.executor=createExecutor({...f.options,providers:f.providers});await f.executor.continueResearch('p',f.request());const id=f.executor.researchStatus('p').queuedJobIds[0],job=await f.executor.execute('p',id);assert.equal(job.status,'awaiting_reconciliation',JSON.stringify(job.error));assert.ok(job.attempts[0].httpAttemptLocator);
 const before=gatewayFixture.calls(),executor=createExecutor({...f.options,providers:{...f.providers,planner:{model:'replacement'}}});await executor.reconcile('p',id,{commandId:'recover-planner',expectedRevision:f.store.read('p').revision,reason:'Owned saved terminal'});assert.equal(f.store.read('p').jobs.find(j=>j.id===id).status,'succeeded');assert.equal(gatewayFixture.calls(),before);
 const p=f.store.read('p'),g=p.researchAcquisitions[0];await verifyAcquisitionGeneration(p,g,{executionRoot:f.root,requireManifest:false});const path=join(f.root,'ordinary-model-http',job.attempts[0].httpAttemptLocator.rootRelativePath,'runtime.json'),bytes=await readFile(path);await chmod(path,0o600);await writeFile(path,Buffer.concat([bytes,Buffer.from('x')]));await assert.rejects(()=>verifyAcquisitionGeneration(p,g,{executionRoot:f.root,requireManifest:false}));await writeFile(path,bytes);assert.equal(gatewayFixture.calls(),before);
});

test('actual reference HTTP owners, collection and 119 ordered-image review nodes survive terminal-return loss',{timeout:3570000},async t=>{
 const f=await referenceFixture(t,{gates:['references'],reviewOutput:referenceReviewFixtureOutput,retainRoot:true}),g=await gateway(t,request=>{const input=JSON.parse(request.prompt.slice(request.prompt.indexOf('UNTRUSTED_JSON_DATA\n')+20,request.prompt.lastIndexOf('\nEND_UNTRUSTED_JSON_DATA')));f.calls.push({input,request});return input.protocolVersion==='reference-pixel-review-v1'?referenceReviewFixtureOutput(input):referenceProductionFixture(input);});let lose=true;
 const provider={...g.provider,operatorConfig:{...g.operatorConfig,timeoutMs:300000},failpoint:async name=>{if(lose&&name==='manifest-synced')throw Error('Owned lost reference return');}};f.providers.synthetic=provider;f.providers['reference-synthetic']=provider;f.executor=f.makeExecutor();await f.executor.continueCopy('p',f.request());let ids=await f.executor.advanceReferences('p');assert.equal(ids.length,1);const lost=await f.executor.execute('p',ids[0]);assert.equal(lost.status,'awaiting_reconciliation',JSON.stringify(lost.error));const calls=g.calls();provider.operatorConfig={};
 const recovered=await f.executor.reconcile('p',lost.id,{commandId:'recover-reference',expectedRevision:f.store.read('p').revision,reason:'Owned committed terminal original only'});assert.equal(recovered.status,'succeeded',JSON.stringify(recovered.error));assert.equal(g.calls(),calls);lose=false;provider.operatorConfig={...g.operatorConfig,timeoutMs:300000};console.log(JSON.stringify({ownedReferenceRoot:f.root,pid:process.pid,at:new Date().toISOString()}));
 for(let turn=0;turn<30;turn++){ids=await f.executor.advanceReferences('p');if(!ids.length)break;for(const id of ids){const result=await f.executor.execute('p',id);assert.equal(result.status,'succeeded',JSON.stringify({node:result.nodeKey,error:result.error}));}await writeFile(join(f.root,'http-checkpoint.json'),JSON.stringify({at:new Date().toISOString(),project:f.store.read('p'),httpCalls:g.calls()}));console.log(JSON.stringify({at:new Date().toISOString(),ordinaryReferenceTurn:turn,reports:f.store.read('p').referenceDossiers[0].reports.length,httpCalls:g.calls()}));}
 const p=f.store.read('p'),d=p.referenceDossiers[0];assert.equal(d.reports.length,129);assert.equal(f.calls.filter(c=>c.input.protocolVersion==='reference-pixel-review-v1').length,119);const imageStore=createImageEvidenceStore({rootDir:join(f.root,'images')});await verifyReferenceOriginal(p,d,{executionRoot:f.root,imageStore});
});

test('public human entry rejects injected HTTP authority and freshly checks already read normalized originals',{timeout:180000},async t=>{
 const f=await gateway(t),file=join(f.root,'public.sqlite'),store=openStore(file);t.after(()=>store.close());store.create({id:'p',name:'Owned public trust boundary',brief:'Explore the supplied blue packaging example, without audience claims.',mode:'auto',humanGates:[]},human);store.command('p',{kind:'confirm-task-card',taskCardId:'p:scope:1',commandId:'confirm',expectedRevision:0},human);
 const providers=Object.fromEntries(['author','reviewer','strategist'].map(id=>[id,f.provider])),executor=createExecutor({store,rootDir:f.root,providers,bindings,imageProvider:null});const research=await executor.execute('p',executor.enqueue('p','research',{sourceRecords:[source]}));assert.equal(research.status,'succeeded');const artifact=store.read('p').artifacts[0];const review=await executor.execute('p',await executor.enqueueVerification('p',artifact.id));assert.equal(review.status,'succeeded');await executor.verifyOrdinaryOriginals('p');
 const app=createServer({dbPath:file,rootDir:f.root,port:0,providers:{},bindings:{},imageProvider:null});await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));t.after(async()=>{app.closeAllConnections();await new Promise(resolve=>app.close(resolve));});
 const post=async body=>{const response=await fetch(`http://127.0.0.1:${app.address().port}/api/projects/p/commands`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};};
 const receipt=research.attempts.at(-1).receipt,before=store.read('p').revision,calls=f.calls();
 for(const kind of ['complete-stage','complete-verification','complete-readiness','complete-owner','complete-reference-node','complete-sketch-text','complete-sketch-review','complete-final-visual','complete-complete-content','restore-ordinary-http-attempt','anchor-model-http-attempt']){const response=await post({kind,commandId:kind,expectedRevision:before,executionReceipt:receipt,httpAttemptLocator:research.attempts.at(-1).httpAttemptLocator});assert.equal(response.status,403,kind);}
 for(const field of ['executionReceipt','receipt','providerExecution','origin','original','attemptLocator','httpAttemptLocator','context','rawReport']){const response=await post({kind:'set-policy',mode:'assisted',humanGates:[],authorizedThrough:'final_review',commandId:'inject-'+field,expectedRevision:before,[field]:receipt});assert.equal(response.status,400,field);}
 assert.equal(store.read('p').revision,before);assert.equal(f.calls(),calls);
 const report=store.read('p').verifications[0],path=report.payloadRef,bytes=await readFile(path);await writeFile(path,Buffer.concat([bytes,Buffer.from(' ')]));try{await assert.rejects(()=>executor.verifyOrdinaryOriginals('p'));const response=await post({kind:'set-policy',mode:'assisted',humanGates:[],authorizedThrough:'final_review',commandId:'corrupt-output',expectedRevision:before});assert.notEqual(response.status,200);assert.equal(store.read('p').revision,before);}finally{await writeFile(path,bytes);}
 await executor.verifyOrdinaryOriginals('p');assert.equal(f.calls(),calls);
});
