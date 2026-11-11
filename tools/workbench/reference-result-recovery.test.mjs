import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {applyCommand} from './project.mjs';
import {referenceFixture} from './reference-dossier-fixtures.mjs';
import {openStore} from './store.mjs';
import {createExecutor} from './executor.mjs';
import {recoverInterruptedJobs} from './recovery.mjs';

test('saved reference terminal response survives completion fault and store restart without provider redispatch',async t=>{
 const f=await referenceFixture(t);
 await f.executor.continueCopy('p',f.request());
 const [jobId]=await f.executor.advanceReferences('p');
 const original=f.store.command;
 f.store.command=(id,c,ctx)=>{if(['complete-reference-node','finish-job-error'].includes(c.kind))throw new Error('Controlled completion commit fault');return original(id,c,ctx);};
 await assert.rejects(f.executor.execute('p',jobId),/Controlled completion commit fault/);
 f.store.command=original;
 assert.equal(f.calls.length,1);
 assert.ok(f.store.read('p').jobs.find(j=>j.id===jobId).attempts.at(-1).referenceResult,'terminal receipt must already be durable');
 f.store.close();f.store.close=()=>{};
 const reopened=openStore(join(f.root,'db'));t.after(()=>reopened.close());
 recoverInterruptedJobs(reopened,{inspectProcess:()=> 'dead'});
 const executor=createExecutor({store:reopened,rootDir:f.root,bindings:f.bindings,providers:f.providers,creativeCalibrations:f.creativeCalibrations,referenceConfiguration:f.configuration,acquisitionDependencies:f.acquisitionDependencies});
 const options={commandId:randomUUID(),expectedRevision:reopened.read('p').revision,reason:'Controlled fault recovery of original saved assignment response'};
 const attempt=reopened.read('p').jobs.find(j=>j.id===jobId).attempts.at(-1);
 for(const [name,path] of [['packet',join(f.root,attempt.id,'packet.json')],['receipt',attempt.referenceResult.path],['normalized output',attempt.referenceNormalized.path]]){
   await t.test(`${name} missing or changed refuses recovery without provider invocation`,async()=>{
     const bytes=await readFile(path);
     await rename(path,path+'.retained');
     try{await assert.rejects(executor.reconcile('p',jobId,options));}finally{await rename(path+'.retained',path);}
     await writeFile(path,Buffer.concat([bytes,Buffer.from(' ')]));
     try{await assert.rejects(executor.reconcile('p',jobId,options));}finally{await writeFile(path,bytes);}
     assert.equal(reopened.read('p').jobs.find(j=>j.id===jobId).status,'awaiting_reconciliation');assert.equal(f.calls.length,1);
   });
 }
 await t.test('changed raw response within retained envelope refuses recovery',async()=>{
   const path=attempt.referenceResult.path,bytes=await readFile(path),result=JSON.parse(bytes);result.executionReceipt.responseText='{}';
   await writeFile(path,JSON.stringify(result,null,2));try{await assert.rejects(executor.reconcile('p',jobId,options));}finally{await writeFile(path,bytes);}
 });
 await t.test('changed source original bytes refuse recovery',async()=>{
   const path=reopened.read('p').artifacts.find(a=>a.id===f.copyId).payloadRef,bytes=await readFile(path);
   await writeFile(path,Buffer.concat([bytes,Buffer.from(' ')]));try{await assert.rejects(executor.reconcile('p',jobId,options));}finally{await writeFile(path,bytes);}
 });
 const before=reopened.read('p'),command=reopened.command;let applied;
 reopened.command=(id,c,ctx)=>{if(c.kind==='recover-reference-result')applied={c,ctx};return command(id,c,ctx);};
 const recovered=await executor.reconcile('p',jobId,options);
 await t.test('typed reducer refuses wrong attempt, creator impersonation, changed receipt and wrong descriptor',()=>{
   assert.throws(()=>applyCommand(before,{...applied.c,attemptId:randomUUID()},applied.ctx));
   assert.throws(()=>applyCommand(before,applied.c,attempt.executor));
   assert.throws(()=>applyCommand(before,{...applied.c,executionReceipt:{...applied.c.executionReceipt,threadId:randomUUID()}},applied.ctx));
   assert.throws(()=>applyCommand(before,{...applied.c,resultHash:'a'.repeat(64)},applied.ctx));
   const changed=structuredClone(before);changed.referenceDossiers[0].envelope.source.source.content.directions[0].slogan+=' changed';
   assert.throws(()=>applyCommand(changed,applied.c,applied.ctx));
 });
 assert.equal(recovered.status,'succeeded');assert.equal(f.calls.length,1);assert.equal((await executor.referenceStatus('p')).status,'working');
 const p=reopened.read('p'),report=p.referenceDossiers[0].reports[0];
 assert.notEqual(report.recoveryContext.actorId,report.context.actorId);
 assert.equal(p.humanFeedback.length,0);assert.equal(p.referenceDossiers[0].adoptions.length,0);
 assert.equal((await executor.reconcile('p',jobId,options)).status,'succeeded');
 await assert.rejects(executor.reconcile('p',jobId,{...options,reason:'Different reason'}),{code:'COMMAND_ID_REUSED'});
 assert.equal(f.calls.length,1);
});

for(const kind of ['unknown','nonterminal','invalid-payload','before-normalization','before-normalized-anchor','stale-policy'])test(`reference recovery ${kind} keeps original charging and never invokes provider again`,async t=>{
 const f=await referenceFixture(t,{providerHandler:async(input,request,output)=>{if(kind==='unknown')throw new Error('Controlled unavailable terminal provider response');return kind==='invalid-payload'?{}:output;}});
 if(kind==='nonterminal'){
   const provider=f.providers['reference-synthetic'],execute=provider.execute;
   provider.execute=async request=>({...await execute(request),exitCode:1});
 }
 await f.executor.continueCopy('p',f.request());const [jobId]=await f.executor.advanceReferences('p');
 const command=f.store.command;
 if(kind==='before-normalization')f.store.command=(id,c,ctx)=>{if(c.kind==='finish-job-error')throw new Error('Controlled persistence fault');const value=command(id,c,ctx);if(c.kind==='anchor-reference-result')throw new Error('Controlled persistence fault');return value;};
 if(['before-normalized-anchor','stale-policy'].includes(kind))f.store.command=(id,c,ctx)=>{if(c.kind===(kind==='before-normalized-anchor'?'anchor-reference-normalized':'complete-reference-node')||c.kind==='finish-job-error')throw new Error('Controlled persistence fault');return command(id,c,ctx);};
 if(['before-normalization','before-normalized-anchor','stale-policy'].includes(kind))await assert.rejects(f.executor.execute('p',jobId),/Controlled persistence fault/);
 else assert.equal((await f.executor.execute('p',jobId)).status,'awaiting_reconciliation');
 f.store.command=command;
 if(kind==='stale-policy')f.send({kind:'set-policy',mode:'assisted',humanGates:['copy']});
 f.store.close();f.store.close=()=>{};
 const reopened=openStore(join(f.root,'db'));t.after(()=>reopened.close());recoverInterruptedJobs(reopened,{inspectProcess:()=> 'dead'});
 const executor=createExecutor({store:reopened,rootDir:f.root,bindings:f.bindings,providers:f.providers,creativeCalibrations:f.creativeCalibrations,referenceConfiguration:f.configuration,acquisitionDependencies:f.acquisitionDependencies});
 const options={commandId:randomUUID(),expectedRevision:reopened.read('p').revision,reason:`Controlled ${kind} boundary recovery`};
 if(['before-normalization','before-normalized-anchor','stale-policy'].includes(kind)){
   assert.equal((await executor.reconcile('p',jobId,options)).status,'succeeded');
   if(kind==='stale-policy'){
     assert.ok(reopened.read('p').referenceDossiers[0].reports[0].staleReason);
     assert.notEqual((await executor.referenceStatus('p')).status,'ready_for_sketch');
   }else assert.equal((await executor.referenceStatus('p')).status,'working');
 }else{
   await assert.rejects(executor.reconcile('p',jobId,options));
   assert.equal(reopened.read('p').jobs.find(j=>j.id===jobId).status,'awaiting_reconciliation');
 }
 const p=reopened.read('p'),attempt=p.jobs.find(j=>j.id===jobId).attempts.at(-1);
 assert.equal(attempt.dispatchStarted,true);assert.equal(f.calls.length,1);assert.equal(p.jobs.find(j=>j.id===jobId).attempts.length,1);
 assert.equal(p.humanFeedback.length,0);assert.equal(p.referenceDossiers[0].adoptions.length,0);
 if(kind!=='unknown')assert.ok(attempt.receipt&&attempt.referenceResult,'Returned provider evidence must survive even rejected payloads');
});
