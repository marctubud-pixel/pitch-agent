import http from 'node:http';
import {mkdtemp,realpath,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {invokeOrdinary} from './ordinary-model.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createProject,applyCommand} from './project.mjs';
import {ordinaryHttpLocator,ordinarySuccess} from './ordinary-model-claims.mjs';
import {savedReadinessReceipt} from './readiness-claims.mjs';
import {restoreOrdinaryJob,reopenOrdinaryJob,ordinaryJobInput,ordinaryDomainReceipt} from './ordinary-model-project.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
function claim(bounded){
 const attemptId='attempt',locator=ordinaryHttpLocator(attemptId,bounded?{resourceProfile:'bounded-json-v1'}:{}),wireRequestHash='a'.repeat(64),origin={serviceIdentity:'synthetic',configurationHash:'b'.repeat(64),invocationId:'synthetic-invocation'};
 const s={provider:locator.provider,protocol:locator.protocol,attemptId,runId:attemptId,requestedModel:'synthetic',reportedModel:null,inputPacketHash:'c'.repeat(64),runtimePacketHash:'d'.repeat(64),wireRequestHash,responseText:'{}',origin,original:{rootRelativePath:locator.rootRelativePath,manifestHash:'e'.repeat(64)},context:{kind:'isolated-http-call',namespace:origin.serviceIdentity,invocationId:origin.invocationId,requestHash:wireRequestHash,isolation:'stateless-v1'},usage:{inputTokens:null,outputTokens:null},cost:null};
 return {locator,receipt:{...s,providerExecution:structuredClone(s),model:'synthetic'}};
}
test('pure restoration and readiness recovery admit matching origins and refuse cross-pairs',()=>{
 const human={actorType:'human',actorId:'synthetic-human',runId:'human-run',contextId:'human-context'},agent={actorType:'agent',actorId:'synthetic-agent',runId:'agent-run',contextId:'agent-context'};
 for(const bounded of [false,true]){
  const {locator,receipt}=claim(bounded),other=claim(!bounded),project=structuredClone(createProject({id:'p',name:'Owned pure claim',brief:'Owned synthetic',mode:'auto',humanGates:[]},human));assert.equal(ordinarySuccess(receipt),true);
  const attempt={id:'attempt',httpAttemptLocator:locator},job={id:'job',status:'awaiting_reconciliation',binding:{model:'synthetic'},attempts:[attempt]};project.jobs.push(job);
  const command={kind:'restore-ordinary-http-attempt',jobId:'job',attemptId:'attempt',receipt,commandId:'restore',expectedRevision:project.revision};assert.deepEqual(applyCommand(project,command,agent).jobs[0].attempts[0].receipt,receipt);
  assert.throws(()=>applyCommand(project,{...command,receipt:other.receipt},agent),{code:'INVALID_HTTP_RESTORE'});
  const proof={kind:'saved-readiness-http-v1',executionReceipt:receipt,originalReceiptHash:hash(JSON.stringify(null)),attemptLocator:locator};assert.deepEqual(savedReadinessReceipt(attempt,proof),receipt);assert.throws(()=>savedReadinessReceipt(attempt,{...proof,executionReceipt:other.receipt}),{code:'INVALID_READINESS_EVIDENCE'});
 }
});
test('actual ordinary restoration proves originals before rejecting crossed origins and fallback',async t=>{
 const human={actorType:'human',actorId:'human',runId:'human-run',contextId:'human-context'},agent={actorType:'agent',actorId:'agent',runId:'agent-run',contextId:'agent-context'};
 const fixtures=[];let calls=0;
 const server=http.createServer(async(req,res)=>{calls++;const chunks=[];for await(const chunk of req)chunks.push(chunk);const wire=JSON.parse(Buffer.concat(chunks));res.end(JSON.stringify({protocol:wire.protocol,invocationId:wire.invocationId,contextMode:wire.contextMode,terminal:'completed',outputText:'{}',reportedModel:null,requestId:null,usage:{inputTokens:null,outputTokens:null}}));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));});
 for(const bounded of [false,true]){
  const root=await realpath(await mkdtemp('/private/tmp/http-json-restoration-')),p=structuredClone(createProject({id:'p',name:'Original restoration',brief:'Synthetic restoration only',mode:'auto',humanGates:[]},human)),binding={providerId:'synthetic',model:'synthetic',role:'researcher'},attempt={id:'attempt',status:'awaiting_reconciliation'},job={id:'job',purpose:'stage',stage:'research',status:'awaiting_reconciliation',binding,inputVersionIds:[],task:{id:'task',brief:'Synthetic restoration only'},attempts:[attempt]};p.jobs.push(job);
  const input=await ordinaryJobInput(p,job,attempt,{executionRoot:root});await mkdir(join(root,attempt.id));await writeFile(join(root,attempt.id,'packet.json'),input.runtimePacketBytes);
  const operatorConfig={adapter:'workbench-model-http-v1',endpoint:`http://127.0.0.1:${server.address().port}/model`,model:'synthetic',serviceIdentity:'synthetic-original',authentication:{kind:'none'},allowLoopbackHttp:true,timeoutMs:30000,maxRequestBytes:1048576,maxResponseBytes:1048576,maxOutputBytes:65536,vision:false,envelopes:[],...(bounded?{resourceProfile:'bounded-json-v1'}:{})},provider={adapter:operatorConfig.adapter,model:operatorConfig.model,operatorConfig};
  const result=await invokeOrdinary({executionRoot:root,provider,binding,attemptId:attempt.id,...input,persistLocator:locator=>{attempt.httpAttemptLocator=locator;}});attempt.receipt=ordinaryDomainReceipt(job,result);
  assert.equal((await reopenOrdinaryJob(p,job,attempt,{executionRoot:root})).responseText,'{}');
  let project=structuredClone(p),mutations=0;const store={read:()=>project,command:(_id,command,context)=>{mutations++;project=applyCommand(project,command,context);}};
  assert.deepEqual(await restoreOrdinaryJob(store,root,'p','job'),attempt.receipt);assert.equal(mutations,0);
  delete project.jobs[0].attempts[0].receipt;assert.deepEqual(await restoreOrdinaryJob(store,root,'p','job'),attempt.receipt);assert.equal(mutations,1);
  fixtures.push({root,p,job,attempt});console.log(JSON.stringify({retainedRestorationFixture:root,bounded}));
 }
 assert.equal(calls,2);
 for(let i=0;i<fixtures.length;i++){
  const f=fixtures[i],other=fixtures[1-i];
  for(const change of [a=>{a.receipt=structuredClone(other.attempt.receipt);},a=>{a.httpAttemptLocator=structuredClone(other.attempt.httpAttemptLocator);},a=>{a.receipt.provider='unknown';},a=>{delete a.receipt.original.manifestHash;}]){
   const p=structuredClone(f.p);change(p.jobs[0].attempts[0]);await assert.rejects(restoreOrdinaryJob({read:()=>p,command:()=>assert.fail('unexpected mutation')},f.root,'p','job'),{code:'ORDINARY_DOMAIN_CHANGED'});
  }
  const p=structuredClone(f.p),job=p.jobs[0],attempt=job.attempts[0];delete attempt.receipt;
  await assert.rejects(reopenOrdinaryJob(p,job,attempt,{executionRoot:f.root,attemptLocator:other.attempt.httpAttemptLocator}),{code:'ORDINARY_DOMAIN_CHANGED'});
  assert.equal((await reopenOrdinaryJob(p,job,attempt,{executionRoot:f.root,attemptLocator:attempt.httpAttemptLocator})).responseText,'{}');
 }
 assert.equal(calls,2);
});
