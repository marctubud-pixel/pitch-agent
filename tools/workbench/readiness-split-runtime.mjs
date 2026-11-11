import {readManagedLayoutBytes} from './managed-layout-bytes.mjs';
import {randomUUID,createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {isDeepStrictEqual as equal} from 'node:util';
import {buildSplitPlan,buildSplitRequest,assembleSplitReview,validateSplitPart} from './research-readiness-split.mjs';
import {invokeOrdinary,ordinarySuccessfulStatus,ordinaryHasContext,ordinarySameContext} from './ordinary-model.mjs';
const hash=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const need=(v,m)=>{if(!v)throw Object.assign(Error(m),{code:'INVALID_SPLIT_EXECUTION'});};
export function splitAllowance(value){need(value&&Object.keys(value).sort().join(',')==='currency,maxCalls,maxCostMicros,perCallCeilingMicros','Explicit split allowance required');need(typeof value.currency==='string'&&value.currency.length===3&&[value.maxCalls,value.maxCostMicros,value.perCallCeilingMicros].every(x=>Number.isSafeInteger(x)&&x>=0)&&value.maxCalls<=3&&value.perCallCeilingMicros>0,'Invalid finite split allowance');return structuredClone(value);}
function exactReceipt(receipt,request,id,model){need(receipt&&receipt.runId===id&&receipt.requestedModel===model&&ordinaryHasContext(receipt)&&ordinarySuccessfulStatus(receipt)&&receipt.model===model&&['signal','reason','error'].every(k=>receipt[k]==null)&&receipt.inputPacketHash===hash(JSON.stringify({runId:id,model,prompt:request.prompt,outputSchema:request.outputSchema})),'Exact successful split invocation required');need(equal(JSON.parse(receipt.responseText),receipt.parsedOutput??JSON.parse(receipt.responseText)),'Receipt output mismatch');}
function independentPart(project,attempt,receipt){
 const originals=[...project.artifacts.map(a=>a.executionReceipt),...project.jobs.flatMap(j=>j.attempts.filter(a=>a.id!==attempt.id).flatMap(a=>a.splitReview?.parts.map(x=>x.receipt)??[a.receipt])),...['verifications','readinessReports','handoffReports','correctionReviews','feedbackReviews','creativeReports'].flatMap(k=>(project[k]??[]).filter(x=>x.attemptId!==attempt.id).flatMap(x=>x.executionReceipt?.parts?.map(t=>t.receipt)??[x.executionReceipt]))];
 need(!originals.some(old=>old&&ordinarySameContext(old,receipt)),'Split context reused from prior work');
}
export function splitExecutionCommand(project,command,job,attempt){
 const plan=buildSplitPlan(job.task.readinessInput),allowance=splitAllowance(job.task.splitReadiness.allowance);
 attempt.splitReview??={planHash:plan.planHash,allowance,parts:[]};const s=attempt.splitReview;
 need(s.planHash===plan.planHash&&equal(s.allowance,allowance),'Split plan changed');
 need(allowance.maxCalls===3&&allowance.maxCostMicros>=3*allowance.perCallCeilingMicros,'Complete split graph allowance required');
 if(command.kind==='claim-readiness-part'){
  need(['assessment','obligations','scan'].includes(command.part)&&!s.parts.some(r=>r.part===command.part),'Part already claimed');
  need(!s.parts.some(r=>r.status!=='succeeded'||r.costMicros===null),'Unsettled part blocks dispatch');
  need(s.parts.length<allowance.maxCalls&&s.parts.reduce((n,r)=>n+r.costMicros,0)+allowance.perCallCeilingMicros<=allowance.maxCostMicros,'Split allowance exhausted');
  const prior=s.parts.find(r=>r.part==='obligations')?.envelope,request=buildSplitRequest(plan,command.part,prior);
  need(equal(command.request,request)&&typeof command.partAttemptId==='string'&&command.partAttemptId.length>0,'Exact part request required');
  need(!project.jobs.some(j=>j.attempts?.some(a=>a.id===command.partAttemptId||a.splitReview?.parts.some(r=>r.attemptId===command.partAttemptId))),'Unique part attempt required');
  s.parts.push({part:command.part,attemptId:command.partAttemptId,request:structuredClone(request),status:'dispatched',reservedMicros:allowance.perCallCeilingMicros,costMicros:null,receipt:null});
 }else if(command.kind==='fail-readiness-part'){const r=s.parts.find(r=>r.part===command.part&&r.attemptId===command.partAttemptId);need(r?.status==='dispatched','Exact dispatched part required');r.status='unknown';r.failureReceipt=structuredClone(command.receipt??null);r.error=structuredClone(command.error);r.usage=structuredClone(command.receipt?.usage??null);const cost=command.receipt?.cost;r.costMicros=cost?.currency===allowance.currency&&Number.isSafeInteger(cost.amountMicros)&&cost.amountMicros>=0&&cost.amountMicros<=r.reservedMicros?cost.amountMicros:null;
 }else{
  const r=s.parts.find(r=>r.part===command.part&&r.attemptId===command.partAttemptId);need(r?.status==='dispatched','Exact unsettled part required');
  exactReceipt(command.receipt,r.request,r.attemptId,job.binding.model);independentPart(project,attempt,command.receipt);
  const envelope={part:r.part,planHash:plan.planHash,dependencyHash:r.request.dependencyHash,output:JSON.parse(command.receipt.responseText)};validateSplitPart(plan,envelope);
  need(!s.parts.some(x=>x.receipt?.threadId===command.receipt.threadId),'Part context reused');
  const cost=command.receipt.cost;
  need(cost===null||cost===undefined||cost.currency===allowance.currency&&Number.isSafeInteger(cost.amountMicros)&&cost.amountMicros>=0&&cost.amountMicros<=r.reservedMicros,'Unusable cost retains reservation');
  need(command.originals&&Object.keys(command.originals).sort().join(',')==='input,output,receipt,stdout'&&Object.values(command.originals).every(x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x)),'Original file identities required');
  r.originals=structuredClone(command.originals);r.receipt=structuredClone(command.receipt);r.costMicros=cost?.amountMicros??null;r.usage=structuredClone(command.receipt.usage??null);r.status='succeeded';
  r.envelope=envelope;
 }
}
export function splitAccounting(state){const rows=state?.parts??[];return {currency:state?.allowance.currency??null,knownCostMicros:rows.reduce((n,r)=>n+(r.costMicros??0),0),heldMicros:rows.reduce((n,r)=>n+(r.status!=='succeeded'||r.costMicros===null?r.reservedMicros:0),0),unknownCostParts:rows.filter(r=>r.costMicros===null).map(r=>r.part)};}
export function validateSplitExecution(project,job,attempt,receipt,raw){
 need(job.task.splitReadiness?.version==='split-readiness-execution-v1'&&receipt?.provider==='split-readiness-composite-v1'&&receipt.attemptId===attempt.id,'Explicit split completion required');
 const plan=buildSplitPlan(job.task.readinessInput),parts=attempt.splitReview?.parts;
 need(parts?.length===3&&parts.every(r=>r.status==='succeeded')&&equal(receipt.parts,parts)&&receipt.planHash===plan.planHash&&equal(receipt.accounting,splitAccounting(attempt.splitReview)),'Complete exact persisted parts required');
 for(const r of parts){
 independentPart(project,attempt,r.receipt);
 const expected=buildSplitRequest(plan,r.part,parts.find(x=>x.part==='obligations')?.envelope);need(equal(r.request,expected),'Part dependency changed');exactReceipt(r.receipt,expected,r.attemptId,job.binding.model);}
 const assembled=assembleSplitReview(plan,parts.map(r=>r.envelope));need(equal(raw,assembled.raw),'Composite output changed');return assembled;
}
export async function executeSplitReadiness({store,projectId,jobId,root,providers,send,checkCurrent}){
 let job=store.read(projectId).jobs.find(j=>j.id===jobId);splitAllowance(job.task.splitReadiness?.allowance);buildSplitPlan(job.task.readinessInput);need(job.task.splitReadiness?.version==='split-readiness-execution-v1','Frozen split mode required');
 if(job.status==='queued'){const id=randomUUID();send(projectId,{kind:'start-job',jobId,attemptId:id},{actorType:'agent',actorId:'split-readiness-worker',runId:id,contextId:randomUUID()});}
 job=store.read(projectId).jobs.find(j=>j.id===jobId);need(job.status==='running','Only running split can continue');
 const attempt=job.attempts.at(-1),context=attempt.executor,plan=buildSplitPlan(job.task.readinessInput),provider=providers[job.binding.providerId];need(provider?.model===job.binding.model,'Frozen provider required');
 need(provider.adapter!=='workbench-model-http-v1','Split HTTP transport unavailable before dispatch');
 const folder=join(root,attempt.id);await mkdir(folder,{recursive:true});let observedReceipt=null,claimedPartId=null;
 try{
  await checkCurrent(job);
  for(const part of ['obligations','assessment','scan']){
   job=store.read(projectId).jobs.find(j=>j.id===jobId);const state=job.attempts.at(-1).splitReview,existing=state?.parts.find(r=>r.part===part);
   if(existing){need(existing.status==='succeeded','Dispatched unknown part cannot retry');const bytes=await readFile(join(folder,existing.attemptId+'.receipt.json'),'utf8');need(equal(JSON.parse(bytes),existing.receipt),'Saved part original changed');need(equal(await verifyPartOriginals(root,existing.receipt,existing.request),existing.originals),'Provider original bytes changed');continue;}
   const request=buildSplitRequest(plan,part,state?.parts.find(r=>r.part==='obligations')?.envelope),id=randomUUID();await checkCurrent(job);
   await writeFile(join(folder,id+'.request.json'),JSON.stringify(request),{flag:'wx'});
   send(projectId,{kind:'claim-readiness-part',jobId,attemptId:attempt.id,part,partAttemptId:id,request},context);claimedPartId=id;
   observedReceipt=null;const result=await invokeOrdinary({executionRoot:root,provider,binding:job.binding,attemptId:id,request,runtimePacketBytes:Buffer.from(JSON.stringify(request)),persistLocator:async()=>{throw Error('Split HTTP transport not yet supported');}});
   observedReceipt=result;await writeFile(join(folder,id+'.receipt.json'),JSON.stringify(result),{flag:'wx'});
   send(projectId,{kind:'settle-readiness-part',jobId,attemptId:attempt.id,part,partAttemptId:id,receipt:result,originals:await verifyPartOriginals(root,result,request)},context);
  }
  job=store.read(projectId).jobs.find(j=>j.id===jobId);await verifySplitProjectOriginals(store.read(projectId),{executionRoot:root});const parts=job.attempts.at(-1).splitReview.parts,assembled=assembleSplitReview(plan,parts.map(r=>r.envelope));
  const receipt={provider:'split-readiness-composite-v1',attemptId:attempt.id,planHash:plan.planHash,parts:structuredClone(parts),accounting:splitAccounting(job.attempts.at(-1).splitReview)},text=JSON.stringify(assembled.report,null,2),file=join(folder,'readiness.json');await writeFile(file,text,{flag:'wx'});await checkCurrent(job);
  send(projectId,{kind:'complete-readiness',jobId,attemptId:attempt.id,reportId:randomUUID(),rawReport:assembled.raw,payloadRef:file,contentHash:hash(text),executionReceipt:receipt},context);
 }catch(error){if(error.receipt)await writeFile(join(folder,'failure-'+randomUUID()+'.receipt.json'),JSON.stringify(error.receipt),{flag:'wx'});job=store.read(projectId).jobs.find(j=>j.id===jobId);const pending=job.attempts.at(-1).splitReview?.parts.find(r=>r.status==='dispatched');if(pending&&pending.attemptId!==claimedPartId)return job;if(pending)send(projectId,{kind:'fail-readiness-part',jobId,attemptId:attempt.id,part:pending.part,partAttemptId:pending.attemptId,receipt:error.receipt??observedReceipt??null,error:{code:error.code??'SPLIT_UNKNOWN',message:error.message}},context);if(job.status==='running')send(projectId,{kind:'finish-job-error',jobId,attemptId:attempt.id,status:'awaiting_reconciliation',error:{code:error.code??'SPLIT_UNKNOWN',message:error.message}},context);}
 return store.read(projectId).jobs.find(j=>j.id===jobId);
}

export async function verifyPartOriginals(root,receipt,request){
 need(receipt.provider==='codex-cli'&&receipt.paths,'Managed native split originals required');
 const texts={},proof={};for(const key of ['input','output','receipt','stdout']){texts[key]=(await readManagedLayoutBytes(root,receipt.paths[key],8*1024*1024)).toString('utf8');proof[key]=hash(texts[key]);}
 const original=JSON.parse(texts.receipt);need(Object.entries(original).every(([k,v])=>equal(receipt[k],v)),'Native receipt fields changed');
 if(receipt.cost!=null)need(equal(original.cost,receipt.cost),'Reported cost not in native receipt');
 need(hash(texts.input)===receipt.inputPacketHash&&equal(JSON.parse(texts.input),{runId:receipt.runId,model:receipt.requestedModel,prompt:request.prompt,outputSchema:request.outputSchema})&&texts.output===receipt.responseText,'Native request/output changed');
 const events=texts.stdout.trim().split('\n').map(x=>JSON.parse(x));need(events.some(e=>e.type==='thread.started'&&e.thread_id===receipt.threadId)&&events.some(e=>e.type==='turn.completed')&&!events.some(e=>e.type==='turn.failed'||e.type==='error'),'Native successful context required');
 return proof;
}
export async function verifySplitProjectOriginals(project,{executionRoot}){
 for(const job of project.jobs)for(const attempt of job.attempts??[])for(const part of attempt.splitReview?.parts??[])if(part.status==='succeeded'){
 need(equal(await verifyPartOriginals(executionRoot,part.receipt,part.request),part.originals),'Split originals changed');
 const mirror=JSON.parse((await readManagedLayoutBytes(executionRoot,join(executionRoot,attempt.id,part.attemptId+'.receipt.json'))).toString('utf8'));need(equal(mirror,part.receipt),'Persisted split receipt changed');
 }
}
