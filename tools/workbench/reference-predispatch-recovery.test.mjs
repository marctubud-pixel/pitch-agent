import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtempSync,mkdirSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {openStore} from './store.mjs';
import {applyCommand} from './project.mjs';
import {createExecutor} from './executor.mjs';
import {recoverInterruptedJobs} from './recovery.mjs';
import {referenceProductionFixture} from './reference-dossier-fixtures.mjs';
import {referenceFixture,configureLedger,entries,entry,textReceipt,save} from './reference-predispatch-fixture.mjs';

if(process.argv[2]==='reference-owner'){
 const root=process.argv[3];configureLedger(join(root,'entries.jsonl'));
 const f=await referenceFixture({after:()=>{}},{fixtureRoot:join(root,'business')});
 save(join(root,'configuration.json'),{bindings:f.bindings,configuration:f.configuration,creativeCalibrations:f.creativeCalibrations});
 await f.executor.continueCopy('p',f.request());const [id]=await f.executor.advanceReferences('p');assert.ok(id);
 const command=f.store.command;
 f.store.command=(pid,c,ctx)=>{const result=command(pid,c,ctx);if(c.kind==='start-job'&&c.jobId===id){const job=f.store.read('p').jobs.find(j=>j.id===id);save(join(root,'interruption.json'),{id,attempt:job.attempts.at(-1),referenceCalls:f.calls.length});f.store.close();process.exit(0);}return result;};
 try{await f.executor.execute('p',id);throw Error('Did not stop after durable reference start');}finally{f.store.close();}
}else test('genuine reference owner death requires explicit fresh pre-dispatch retry', {timeout:110000},async t=>{
 const root=mkdtempSync(join(process.env.WORKBENCH_RECOVERY_ARTIFACTS??tmpdir(),'reference-predispatch-'));
 if(!process.env.WORKBENCH_RECOVERY_ARTIFACTS)t.after(()=>rmSync(root,{recursive:true,force:true}));
 save(join(root,'case-plan.json'),{upstream:28,referenceRetry:1,total:29,external:0,imageAdapters:0,research:'imported_metadata',boundaryCases:'pure clones, not canonical exhaustion'});
 configureLedger(join(root,'entries.jsonl'));
 const child=spawn(process.execPath,['--max-old-space-size=768',fileURLToPath(import.meta.url),'reference-owner',root],{stdio:['ignore','pipe','pipe']});
 let output='',errors='';child.stdout.on('data',b=>{output+=b;if(output.length>1048576)child.kill('SIGKILL');});child.stderr.on('data',b=>{errors+=b;if(errors.length>1048576)child.kill('SIGKILL');});
 const timer=setTimeout(()=>child.kill('SIGKILL'),100000);let closed=false;
 try{const [code,signal]=await once(child,'close');closed=true;save(join(root,'owner-exit.json'),{pid:child.pid,code,signal,output,errors});assert.equal(code,0,errors);}finally{clearTimeout(timer);if(!closed){child.kill('SIGKILL');await once(child,'close');}}
 assert.throws(()=>process.kill(child.pid,0),{code:'ESRCH'});
 const interrupted=JSON.parse(readFileSync(join(root,'interruption.json'))),config=JSON.parse(readFileSync(join(root,'configuration.json'))),store=openStore(join(root,'business','db'));
 try{
  const running=store.read('p'),job=running.jobs.find(j=>j.id===interrupted.id),attempt=job.attempts.at(-1);
  assert.equal(job.purpose,'reference');assert.equal(attempt.executor.executorPid,child.pid);assert.equal(attempt.dispatchStarted,false);assert.equal(attempt.receipt,undefined);assert.equal(attempt.referenceResult,undefined);assert.equal(interrupted.referenceCalls,0);assert.equal(entries().length,28);
  for(const state of ['alive','unknown']){assert.equal(recoverInterruptedJobs(store,{inspectProcess:()=>state})[0].action,'unchanged');assert.equal(store.read('p').jobs.find(j=>j.id===job.id).status,'running');}
  assert.equal(recoverInterruptedJobs(store,{host:'foreign-test-owner'})[0].action,'unchanged');
  const recoveredBy={host:attempt.executor.executorHost,pid:process.pid,ownerState:'dead',ownerHost:attempt.executor.executorHost,ownerPid:attempt.executor.executorPid,attemptId:attempt.id};
  const recover=(project)=>applyCommand(project,{kind:'mark-interrupted',jobId:job.id,attemptId:attempt.id,commandId:randomUUID(),expectedRevision:project.revision},{...attempt.executor,recoveredBy});
  for(const [name,modify] of [['missing dispatch flag',p=>delete p.jobs.find(j=>j.id===job.id).attempts[0].dispatchStarted],['dispatched',p=>p.jobs.find(j=>j.id===job.id).attempts[0].dispatchStarted=true],['outstanding acquisition',p=>p.referenceDossiers.find(d=>d.id===job.dossierId).tools.push({nodeKey:job.nodeKey,state:'dispatched'})]]){
   const clone=structuredClone(running);modify(clone);assert.equal(recover(clone).jobs.find(j=>j.id===job.id).status,'awaiting_reconciliation',name);
  }
  const outcome=recoverInterruptedJobs(store);save(join(root,'recovery.json'),{outcome,job:store.read('p').jobs.find(j=>j.id===job.id)});
  assert.equal(outcome.find(r=>r.jobId===job.id)?.action,'blocked_predispatch','Stopped genuine reference owner must become blocked_predispatch');
  const providers=Object.fromEntries([...new Set(Object.values(config.bindings).map(b=>b.providerId))].map(id=>[id,{model:'synthetic',execute:async request=>{entry(request);const input=JSON.parse(request.prompt.slice(request.prompt.indexOf('UNTRUSTED_JSON_DATA\n')+20,request.prompt.lastIndexOf('\nEND_UNTRUSTED_JSON_DATA')));assert.equal(input.kind,'assignment');return textReceipt(join(root,'business'),request,referenceProductionFixture(input));}}]));
  const executor=createExecutor({store,rootDir:join(root,'business'),...config,referenceConfiguration:config.configuration,providers});
  assert.equal((await executor.execute('p',job.id)).status,'blocked');assert.equal(entries().length,28);
  const blocked=store.read('p'),old=blocked.jobs.find(j=>j.id===job.id).attempts[0];
  const retry={kind:'retry-job',jobId:job.id,attemptId:randomUUID(),commandId:randomUUID(),expectedRevision:blocked.revision},fresh={actorType:'agent',actorId:randomUUID(),runId:randomUUID(),contextId:randomUUID(),executorHost:attempt.executor.executorHost,executorPid:process.pid};
  for(const key of ['actorId','runId','contextId'])assert.throws(()=>applyCommand(blocked,retry,{...fresh,[key]:old.executor[key]}),{code:'UNSAFE_RETRY'});
  const restarted=applyCommand(blocked,retry,fresh),charged=structuredClone(restarted),active=charged.jobs.find(j=>j.id===job.id),current=active.attempts.at(-1);
  active.attempts.unshift(...Array.from({length:129},(_,i)=>({id:`clone-${i}`,dispatchStarted:true,status:'awaiting_reconciliation',executor:{actorId:`clone-${i}`,runId:`clone-run-${i}`,contextId:`clone-context-${i}`}})));
  assert.throws(()=>applyCommand(charged,{kind:'mark-reference-dispatched',jobId:job.id,attemptId:current.id,commandId:randomUUID(),expectedRevision:charged.revision},fresh),/Frozen model-call ceiling reached/);
  const dispatched=structuredClone(running);dispatched.jobs.find(j=>j.id===job.id).attempts[0].dispatchStarted=true;const uncertain=recover(dispatched),readOnly={read:()=>uncertain,command:()=>{throw Error('Uncertain outcome must not mutate');}};
  const conservative=createExecutor({store:readOnly,rootDir:join(root,'business'),...config,referenceConfiguration:config.configuration,providers});assert.equal((await conservative.execute('p',job.id,{retry:true})).status,'awaiting_reconciliation');assert.equal(entries().length,28);
  const result=await executor.execute('p',job.id,{retry:true});assert.equal(result.status,'succeeded');assert.equal(entries().length,29);assert.equal(result.attempts.length,2);assert.deepEqual(result.attempts[0],old);assert.notEqual(result.attempts[1].id,old.id);
  for(const key of ['actorId','runId','contextId'])assert.notEqual(result.attempts[1].executor[key],old.executor[key]);
  assert.equal(result.attempts[1].dispatchStarted,true);assert.equal(store.read('p').referenceDossiers[0].reports.length,1);assert.deepEqual(recoverInterruptedJobs(store),[]);
  const count=entries().length;assert.equal((await executor.execute('p',job.id,{retry:true})).status,'succeeded');assert.equal(entries().length,count);
  save(join(root,'success.json'),{entries:entries(),job:result,pureBoundaryCases:['missing dispatch flag','true dispatch flag','dispatched acquisition','reused identities','129 charged clone'],research:'imported_metadata'});
  console.log(JSON.stringify({artifactRoot:root,providerEntries:entries().length,research:'imported_metadata'}));
 }finally{store.close();}
});
