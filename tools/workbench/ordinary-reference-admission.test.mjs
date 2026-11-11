import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile,writeFile,mkdir,chmod,rename,symlink,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createImageEvidenceStore} from './image-evidence.mjs';
import {ordinaryJobInput,verifyOrdinaryReferenceProject,ordinaryDomainReceipt} from './ordinary-model-project.mjs';
import {invokeOrdinary,ordinaryHttpLocator} from './ordinary-model.mjs';
import {ordinaryExecutionIdentity,ordinaryIdentitySameContext,ordinarySuccess} from './ordinary-model-claims.mjs';

const retainedRoot=process.env.ORDINARY_REFERENCE_RETAINED_ROOT;
test('reference admission reopens exact report set and every unrelated compared context',{timeout:180000},async t=>{
 assert.ok(retainedRoot,'Explicit owned retained source root required');
 const root=retainedRoot,p=(JSON.parse(await readFile(join(root,'http-checkpoint.json')))).project,d=p.referenceDossiers[0],imageStore=createImageEvidenceStore({rootDir:join(root,'images')});
 const check=(q=p)=>verifyOrdinaryReferenceProject(q,q.referenceDossiers[0],{executionRoot:root,imageStore});
 await check();
 const ownedJob=p.jobs.find(j=>j.purpose==='reference'&&j.attempts.some(a=>a.receipt?.provider==='workbench-model-http-v1'));
 const ownedAttempt=ownedJob.attempts.at(-1),saved=ownedAttempt.receipt;
 const cliIdentity={actorId:'legacy',runId:'legacy-run',contextId:'legacy-context'};
 assert.equal(JSON.stringify(ordinaryExecutionIdentity(cliIdentity,{threadId:'legacy-thread'})),JSON.stringify({...cliIdentity,threadId:'legacy-thread'}));
 const identity=ordinaryExecutionIdentity(cliIdentity,saved);assert.equal(identity.version,'ordinary-http-source-identity-v1');assert.equal(ordinaryIdentitySameContext(identity,saved),true);delete identity.version;assert.equal(ordinaryIdentitySameContext(identity,saved),false);
 for(const [label,change] of [
  ['job model',q=>q.jobs.find(j=>j.id===ownedJob.id).binding.model='wrong-model'],
  ['job task',q=>q.jobs.find(j=>j.id===ownedJob.id).task.returnContract.protocolVersion='wrong-contract'],
  ['domain source',q=>q.referenceDossiers[0].envelope.source.taskCard.brief='wrong-frozen-brief'],
  ['manifest hash missing',q=>{const r=q.jobs.find(j=>j.id===ownedJob.id).attempts.at(-1).receipt;delete r.original.manifestHash;}],
  ['manifest hash null',q=>{const r=q.jobs.find(j=>j.id===ownedJob.id).attempts.at(-1).receipt;r.original.manifestHash=null;}],
  ['origin drift with locator',q=>{const r=q.jobs.find(j=>j.id===ownedJob.id).attempts.at(-1).receipt;r.provider='codex-cli';}],
 ])await t.test(label,async()=>{const q=structuredClone(p);change(q);await assert.rejects(()=>check(q));});
 const imageJob=p.jobs.find(j=>j.purpose==='reference'&&j.attempts.at(-1)?.receipt?.images?.length>1);
 assert.ok(imageJob,'Retained actual collector must include ordered image occurrences');
 await t.test('image order substitution',async()=>{const q=structuredClone(p);q.jobs.find(j=>j.id===imageJob.id).attempts.at(-1).receipt.images.reverse();await assert.rejects(()=>check(q));});
 const path=join(root,ownedAttempt.id,'reference-report.json'),bytes=await readFile(path);
 await t.test('already read report byte substitution',async()=>{await chmod(path,0o600);try{await writeFile(path,Buffer.concat([bytes,Buffer.from(' ')]));await assert.rejects(check);}finally{await writeFile(path,bytes);}});
 await t.test('same bytes through report symlink',async()=>{const target=path+'.owned-backup';await rename(path,target);try{await symlink(target,path);await assert.rejects(check);}finally{await unlink(path);await rename(target,path);}});
 let calls=0;const server=http.createServer(async(req,res)=>{calls++;const chunks=[];for await(const chunk of req)chunks.push(chunk);const wire=JSON.parse(Buffer.concat(chunks));res.end(JSON.stringify({protocol:'workbench-stateless-model-json-v1',invocationId:wire.invocationId,contextMode:'stateless-v1',terminal:'completed',outputText:'{}',reportedModel:null,requestId:null,usage:{inputTokens:null,outputTokens:null}}));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
 const q=structuredClone(p),unrelated=structuredClone(d);unrelated.id='owned-unrelated-context-dossier';unrelated.reports=[];unrelated.priorChoiceHistory=[];q.referenceDossiers.push(unrelated);
 const job=structuredClone(ownedJob);job.id='owned-unrelated-context-job';job.dossierId=unrelated.id;job.task.id=job.id;job.task.dossierId=unrelated.id;job.status='awaiting_reconciliation';job.outputVersionIds=[];
 const attempt={id:randomUUID(),status:'awaiting_reconciliation',executor:{actorType:'agent',actorId:randomUUID(),runId:randomUUID(),contextId:randomUUID()}};job.attempts=[attempt];q.jobs.push(job);
 const input=await ordinaryJobInput(q,job,attempt,{executionRoot:root});await mkdir(join(root,attempt.id));await writeFile(join(root,attempt.id,'packet.json'),input.runtimePacketBytes);
 const provider={adapter:'workbench-model-http-v1',model:job.binding.model,operatorConfig:{adapter:'workbench-model-http-v1',endpoint:`http://127.0.0.1:${server.address().port}/model`,model:job.binding.model,serviceIdentity:'owned-unrelated-context',authentication:{kind:'none'},allowLoopbackHttp:true,timeoutMs:10000,maxRequestBytes:8*1024*1024,maxResponseBytes:4*1024*1024,maxOutputBytes:1024*1024,vision:true,envelopes:[]}};
 const result=await invokeOrdinary({executionRoot:root,provider,binding:job.binding,attemptId:attempt.id,...input,persistLocator:value=>{attempt.httpAttemptLocator=value;}});attempt.receipt=ordinaryDomainReceipt(job,result);assert.equal(ordinarySuccess(attempt.receipt),true);assert.deepEqual(attempt.httpAttemptLocator,ordinaryHttpLocator(attempt.id));
 await check(q);assert.equal(calls,1);
 const wirePath=join(root,'ordinary-model-http',result.original.rootRelativePath,'wire.json'),wireBytes=await readFile(wirePath);await chmod(wirePath,0o600);
 try{await writeFile(wirePath,Buffer.concat([wireBytes,Buffer.from(' ')]));await assert.rejects(()=>check(q));}finally{await writeFile(wirePath,wireBytes);}
 await check(q);assert.equal(calls,1);console.log(JSON.stringify({retainedRoot:root,unrelatedAttemptId:attempt.id,actualHttpCalls:calls,comparedClass:'unrelated dossier awaiting reconciliation',completedReports:d.reports.length}));
});
