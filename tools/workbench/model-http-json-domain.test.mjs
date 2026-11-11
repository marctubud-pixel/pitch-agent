import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,realpath,readFile,writeFile,chmod,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {openStore} from './store.mjs';
import {createExecutor} from './executor.mjs';
import {output,bindings,human,source} from './research-operator-fixture.mjs';
import {verifyResearchDataOriginal} from './stage-original.mjs';
import {verifyReviewOriginal} from './review-original.mjs';
import {createIntakeRuntime} from './intake-runtime.mjs';
import {createImageEvidenceStore} from './image-evidence.mjs';
import {TASK_FIELDS,cardHash} from './intake-contract.mjs';
import {referenceFixturePng} from './reference-dossier-fixtures.mjs';
import {loadSavedReadinessProof} from './readiness-evidence.mjs';
async function fixture(t,handler=output){
 const root=await realpath(await mkdtemp('/private/tmp/http-json-domain-'));let calls=0;
 const server=http.createServer(async(req,res)=>{calls++;try{const chunks=[];for await(const chunk of req)chunks.push(chunk);const wire=JSON.parse(Buffer.concat(chunks)),raw=await handler({...wire,runId:wire.invocationId});res.end(JSON.stringify({protocol:wire.protocol,invocationId:wire.invocationId,contextMode:wire.contextMode,terminal:'completed',outputText:JSON.stringify(raw),reportedModel:'owned-synthetic',requestId:null,usage:{inputTokens:null,outputTokens:null}}));}catch{res.destroy();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const store=openStore(join(root,'owned.sqlite'));t.after(async()=>{store.close();server.closeAllConnections();await new Promise(r=>server.close(r));console.log(JSON.stringify({retainedBoundedDomain:root,calls}));});
 const operatorConfig={adapter:'workbench-model-http-v1',endpoint:`http://127.0.0.1:${server.address().port}/model`,model:'synthetic',serviceIdentity:'bounded-domain-fixture',authentication:{kind:'none'},allowLoopbackHttp:true,timeoutMs:30000,maxRequestBytes:8*1024*1024,maxResponseBytes:4*1024*1024,maxOutputBytes:1024*1024,vision:true,envelopes:['sketch-review-v2','final-visual-v1','complete-content-v1'],resourceProfile:'bounded-json-v1'};
 store.create({id:'p',name:'Owned bounded domain',brief:'Explore the supplied blue packaging example, without audience claims.',mode:'auto',humanGates:[]},human);
 return {root,store,provider:{adapter:operatorConfig.adapter,model:operatorConfig.model,operatorConfig},calls:()=>calls};
}
test('bounded HTTP numeric research and independent verification recover committed readiness without configuration',async t=>{
 const f=await fixture(t);f.store.command('p',{kind:'confirm-task-card',taskCardId:'p:scope:1',commandId:'confirm',expectedRevision:0},human);let lose=false;f.provider.failpoint=name=>{if(lose&&name==='manifest-synced')throw Error('owned terminal return loss');};
 const providers=Object.fromEntries(['author','reviewer','strategist'].map(id=>[id,f.provider]));let executor=createExecutor({store:f.store,rootDir:f.root,providers,bindings,imageProvider:null});
 const research=await executor.execute('p',executor.enqueue('p','research',{sourceRecords:[source]}));assert.equal(research.status,'succeeded',JSON.stringify(research.error));const artifact=f.store.read('p').artifacts[0];
 const verification=await executor.execute('p',await executor.enqueueVerification('p',artifact.id));assert.equal(verification.status,'succeeded',JSON.stringify(verification.error));
 lose=true;const id=await executor.enqueueReadiness('p',artifact.id,{protocolVersion:'research-readiness-v2'}),readiness=await executor.execute('p',id);assert.equal(readiness.status,'awaiting_reconciliation',JSON.stringify(readiness.error));assert.equal(readiness.attempts[0].httpAttemptLocator.kind,'http-attempt-locator-v2');assert.equal(readiness.attempts[0].receipt,undefined);
 const before=f.calls();executor=createExecutor({store:f.store,rootDir:f.root,providers:{},bindings:{},imageProvider:null});const request={action:'recover-saved',jobId:readiness.id,attemptId:readiness.attemptId,commandId:'recover',expectedRevision:f.store.read('p').revision};const recovered=await executor.resolveReadiness('p',request);assert.equal(recovered.kind,'recovered');assert.deepEqual(await executor.resolveReadiness('p',request),recovered);assert.equal(f.calls(),before);
 const p=f.store.read('p');assert.equal(p.verifications[0].rawReport.protocolVersion,'excerpt-support-v4');assert.equal(p.readinessResolutions[0].proof.executionReceipt.protocol,'workbench-model-http-original-v2');await verifyResearchDataOriginal(p,p.artifacts[0],{executionRoot:f.root});await verifyReviewOriginal(p,'verification',p.verifications[0],{executionRoot:f.root});
 const reviewJob=p.jobs.find(j=>j.id===id),reviewAttempt=reviewJob.attempts[0];assert.deepEqual(await loadSavedReadinessProof(f.root,p.id,reviewJob,reviewAttempt),p.readinessResolutions[0].proof);assert.equal(reviewAttempt.receipt,undefined);
 for(const change of [q=>{q.readinessResolutions=[];},q=>{q.readinessResolutions[0].proof.rawResponseHash='0'.repeat(64);},q=>{delete q.readinessResolutions[0].proof.executionReceipt.original.manifestHash;}]){const q=structuredClone(p);change(q);await assert.rejects(verifyResearchDataOriginal(q,q.artifacts[0],{executionRoot:f.root}));}
 const receipt=p.readinessReports[0].executionReceipt,path=join(f.root,'ordinary-model-http',receipt.original.rootRelativePath,'response.bin'),bytes=await readFile(path);await chmod(path,0o600);await writeFile(path,Buffer.concat([bytes,Buffer.from(' ')]));await assert.rejects(verifyResearchDataOriginal(p,p.artifacts[0],{executionRoot:f.root}));await writeFile(path,bytes);await rename(path,path+'.retained');await assert.rejects(verifyResearchDataOriginal(p,p.artifacts[0],{executionRoot:f.root}));await rename(path+'.retained',path);await verifyResearchDataOriginal(p,p.artifacts[0],{executionRoot:f.root});assert.equal(f.calls(),before);
});
test('bounded HTTP image intake recovers its saved result with no current provider and rereads originals',async t=>{
 const f=await fixture(t,()=>({protocol:'task-card-extraction-v1',brief:'Owned synthetic intake',fields:Object.fromEntries(TASK_FIELDS.map(k=>[k,{value:null,knowledge:'not_stated',sources:[],suggestions:[],limitations:[]}])),productParameters:[],openQuestions:[],limitations:['Synthetic mechanism only.']})),imageStore=createImageEvidenceStore({rootDir:join(f.root,'images')}),binding={providerId:'owned',model:'synthetic',role:'intake-lead'};f.provider.failpoint=name=>{if(name==='manifest-synced')throw Error('owned terminal return loss');};
 let runtime=createIntakeRuntime({store:f.store,root:f.root,providers:{owned:f.provider},bindings:{intake:binding},imageStore});
 const uploaded=await runtime.upload('p',{originalFilename:'owned.png',commandId:'upload',expectedRevision:f.store.read('p').revision},referenceFixturePng(1)),base=f.store.read('p').taskCards[0],requested=await runtime.requestExtraction('p',{documentIds:[uploaded.documentId],baseTaskCardId:base.id,baseTaskCardHash:cardHash(base),commandId:'extract',expectedRevision:f.store.read('p').revision}),job=await runtime.execute('p',requested.jobId);
 assert.equal(job.status,'awaiting_reconciliation',JSON.stringify(job.error));assert.equal(job.attempts[0].httpAttemptLocator.kind,'http-attempt-locator-v2');const before=f.calls();runtime=createIntakeRuntime({store:f.store,root:f.root,providers:{},bindings:{},imageStore});
 const request={jobId:job.id,attemptId:job.attemptId,commandId:'recover',expectedRevision:f.store.read('p').revision};await runtime.reconcile('p',request,human);assert.equal(f.store.read('p').jobs.at(-1).status,'succeeded');await runtime.reconcile('p',request,human);assert.equal(f.calls(),before);
 const path=join(f.root,'ordinary-model-http',job.attempts[0].httpAttemptLocator.rootRelativePath,'response.bin'),bytes=await readFile(path);await chmod(path,0o600);await writeFile(path,Buffer.concat([bytes,Buffer.from(' ')]));await assert.rejects(runtime.reconcile('p',request,human));await writeFile(path,bytes);assert.equal(f.calls(),before);
});
