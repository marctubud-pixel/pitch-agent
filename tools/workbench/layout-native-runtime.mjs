import {unresolvedLayoutResult,verifyLayoutCurrent,layoutCurrentFailure} from './layout-status-contract.mjs';
import {readManagedLayoutBytes} from './managed-layout-bytes.mjs';
import {verifyLayoutRenderer} from './layout-renderer.mjs';
import {randomUUID} from 'node:crypto';
import {hostname} from 'node:os';
import {mkdir,writeFile,open} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {fork} from 'node:child_process';
import {LAYOUT_PURPOSE,layoutJobInput,layoutHash,unresolvedLayoutJobs,unresolvedLayoutStatus} from './layout-boundary.mjs';
import {layoutRoot,layoutTuple} from './layout-native-domain.mjs';
import {verifyExecutionPins,verifyNativeResources,verifyNativeAnchor} from './layout-native-proof.mjs';
import {sketchRequire as need} from './sketch-authority.mjs';
export function createNativeLayoutRuntime({store,root,content,configuration}){
 let configurationVerified=false;
 const context=()=>({actorType:'agent',actorId:'local-native-layout',runId:randomUUID(),contextId:randomUUID(),executorHost:hostname(),executorPid:process.pid});
 const send=(id,c,actor=context())=>store.command(id,{...c,commandId:randomUUID(),expectedRevision:store.read(id).revision},actor);
 async function current(id,j){
  await verifyLayoutCurrent(store,content,id,layoutJobInput(store.read(id),j),async()=>{
   await verifyNativeResources(root,j.task.binding);
  });
 }
 async function executable(id,j){
  need(configuration?.execution&&layoutHash(configuration.execution)===layoutHash(j.task.binding.execution),'LAYOUT_NATIVE_CONFIGURATION_CHANGED','Current exact execution configuration required for new effects');
  await verifyLayoutRenderer(j.task.binding.renderer);
  await verifyConfiguration(j.task.binding.execution);
  await current(id,j);
  need(configuration?.execution&&layoutHash(configuration.execution)===layoutHash(j.task.binding.execution),'LAYOUT_NATIVE_CONFIGURATION_CHANGED','Live configuration changed during executable verification');
 }
 async function receipt(id,j){
  const p=store.read(id),r=layoutRoot(p,j),attempt=j.attempts.at(-1);
  need(attempt?.worker,'LAYOUT_NATIVE_OWNER_UNKNOWN','Original worker identity is unknown');
  const value=await verifyNativeAnchor(root,attempt.directory,{bindingHash:r.task.bindingHash,attemptId:attempt.id,style:j.task.style,executionHash:layoutHash(r.task.binding.execution),worker:attempt.worker,ledgerHash:r.task.binding.ledgerHash,resources:r.task.binding.resources});
  const now=store.read(id).jobs.find(x=>x.id===j.id);
  if(now?.status==='succeeded')need(layoutHash(now.receipt)===layoutHash(value),'LAYOUT_RECEIPT_CHANGED','Registered receipt changed');
  return value;
 }
 async function owners(j){
  const attempt=j.attempts.at(-1),state=owner=>{if(owner?.host!==hostname()||!Number.isSafeInteger(owner.pid))return 'unknown';try{process.kill(owner.pid,0);return 'alive';}catch(error){return error.code==='ESRCH'?'dead':'unknown';}};
  let nativeChild=null;try{nativeChild=JSON.parse(await readManagedLayoutBytes(root,join(attempt.directory,'native-child.json')));if(nativeChild.token!==attempt.id)nativeChild=null;}catch{}
  return {worker:{identity:attempt.worker,state:state(attempt.worker)},nativeChild:{identity:nativeChild,state:state(nativeChild)}};
 }
 async function settle(id,j){
  const r=layoutRoot(store.read(id),j);await current(id,r);const value=await receipt(id,j);await current(id,r);
  const now=store.read(id).jobs.find(x=>x.id===j.id);if(now.status==='succeeded'){need(layoutHash(now.receipt)===layoutHash(value),'LAYOUT_RECEIPT_CHANGED','Registered receipt changed');return value;}
  send(id,{kind:'anchor-layout-export',jobId:j.id,attemptId:j.attempts.at(-1).id,receipt:value});return value;
 }
 async function advance(id){
  let p=store.read(id),r=p.jobs.findLast(j=>j.purpose===LAYOUT_PURPOSE&&j.task.binding);
  if(!r?.task.binding.execution)return [];
  try{await current(id,r);}catch{return [];}
  for(const j of unresolvedLayoutJobs(p)){
   if(!unresolvedLayoutStatus(j.status)||!unresolvedLayoutStatus(j.attempts?.at(-1)?.status))return [];
   try{await settle(id,j);}catch(error){if(j.status==='running')send(id,{kind:'interrupt-layout-export',jobId:j.id,attemptId:j.attempts.at(-1).id,error:{code:'LAYOUT_NATIVE_OUTCOME_UNKNOWN',message:'Original native ownership or proof unresolved. No re-export is allowed.',validationReason:error.code??error.message,owners:await owners(j)}});return [];}
  }
  p=store.read(id);r=p.jobs.find(j=>j.id===r.id);
  if(unresolvedLayoutJobs(p).length)return [];
  if(r.status==='blocked'&&r.error?.code!=='LAYOUT_EXPORT_UNAVAILABLE')return [];
  if(r.status==='blocked'&&r.error?.code==='LAYOUT_EXPORT_UNAVAILABLE'&&r.attempts.length===0){await executable(id,r);send(id,{kind:'queue-layout-export',jobId:r.id});}
  p=store.read(id);const tuple=layoutTuple(p,r);
  if(tuple.every(j=>j?.status==='succeeded')){for(const j of tuple)await settle(id,j);send(id,{kind:'register-layout-technical',jobId:r.id});return [];}
  const pending=layoutTuple(store.read(id),r).filter(j=>j?.status==='queued'&&j.attempts.length===0).map(j=>j.id);
  if(pending.length&&(!configuration?.execution||layoutHash(configuration.execution)!==layoutHash(r.task.binding.execution)))return [];
  return pending;
 }
 async function status(id,r){
  const p=store.read(id),unknown=unresolvedLayoutResult(p);
  if(unknown)return unknown;
  const revision=p.revision;
  try{await current(id,r);}catch(error){return layoutCurrentFailure(error);}
  const tuple=layoutTuple(p,r),editions=[];
  for(const j of tuple.filter(Boolean)){
   let verified=false;
   try{if(j.status==='succeeded'){await receipt(id,j);verified=true;}}
   catch(error){return {status:'blocked',reason:error.code??'LAYOUT_PROOF_CHANGED',queuedJobIds:[],exportAvailable:false,finalAuthorityAvailable:false};}
   editions.push({jobId:j.id,style:j.task.style,status:j.status,verified,reason:j.error?.code});
  }
  if(store.read(id).revision!==revision)return layoutCurrentFailure({code:'LAYOUT_STATUS_CHANGED'});
  const blocked=tuple.find(j=>j?.status==='blocked'&&j.error?.code!=='LAYOUT_EXPORT_UNAVAILABLE');
  if(blocked)return {status:'blocked',reason:blocked.error?.code??'LAYOUT_JOB_BLOCKED',originalStatus:blocked.status,editions,queuedJobIds:[],exportAvailable:false,finalAuthorityAvailable:false};
  const complete=tuple.every(j=>j?.status==='succeeded')&&editions.every(e=>e.verified);
  return {status:complete?'technical_complete':'queued',reason:complete?'LAYOUT_FINAL_AUTHORITY_UNAVAILABLE':undefined,editions,queuedJobIds:[],exportAvailable:configurationVerified,finalAuthorityAvailable:false,visualInspection:'pending'};
 }
 async function execute(id,jobId){
  let p=store.read(id),j=p.jobs.find(j=>j.id===jobId),r=layoutRoot(p,j);
  need(j?.purpose===LAYOUT_PURPOSE&&r?.task.binding.execution,'LAYOUT_NATIVE_CONFIGURATION_REQUIRED','Configured original native job required');
  if(j.status==='succeeded'){await settle(id,j);return j;}
  if(j.status!=='queued'||j.attempts.length){await advance(id);return store.read(id).jobs.find(j=>j.id===jobId);}
  await current(id,r);await executable(id,r);
  const actor=context(),attemptId=randomUUID(),directory=join(root,'native-layout',r.id,j.task.style,attemptId);
  send(id,{kind:'claim-layout-export',jobId,attemptId,directory},actor);
  try{
   await mkdir(directory,{recursive:true});await writeFile(join(directory,'ledger.json'),layoutJobInput(p,r).ledgerText,{flag:'wx'});
   const request=join(directory,'request.json');await writeFile(request,JSON.stringify({root,directory,binding:r.task.binding,bindingHash:r.task.bindingHash,execution:r.task.binding.execution,attemptId,style:j.task.style}),{flag:'wx'});
   const log=await open(join(directory,'worker.log'),'wx');
   try{await new Promise((resolve,reject)=>{
    const child=fork(fileURLToPath(new URL('./layout-native-worker.mjs',import.meta.url)),[request],{execPath:r.task.binding.execution.node,stdio:['ignore',log.fd,log.fd,'ipc'],env:{PATH:'/usr/bin:/bin:/usr/sbin:/sbin',HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,LANG:'en_US.UTF-8',PYTHONDONTWRITEBYTECODE:'1',RUNTIME_PYTHON:r.task.binding.execution.python,RUNTIME_NODE_MODULES:join(r.task.binding.execution.nativeRuntime,'node/node_modules'),PRESENTATIONS_SKILL_DIR:r.task.binding.execution.presentationsSkill}});
    let permitted=false;
    child.on('message',message=>{if(!message.ready||permitted)return;try{send(id,{kind:'record-layout-worker',jobId,attemptId,worker:message.ready},actor);permitted=true;child.send({token:attemptId});}catch(error){child.disconnect();reject(error);}});
    child.on('error',reject);child.on('exit',(code,signal)=>code===0&&!signal&&permitted?resolve():reject(new Error('Original native worker did not complete')));
   });}finally{await log.close();}
   j=store.read(id).jobs.find(j=>j.id===jobId);await settle(id,j);await advance(id);return store.read(id).jobs.find(j=>j.id===jobId);
  }catch(error){j=store.read(id).jobs.find(j=>j.id===jobId);if(j.status==='running')send(id,{kind:'interrupt-layout-export',jobId,attemptId,error:{code:'LAYOUT_NATIVE_OUTCOME_UNKNOWN',message:error.message}});throw error;}
 }
 async function verifyConfiguration(execution){const proof=await verifyExecutionPins(execution);configurationVerified=true;return proof;}
 return {advance,status,execute,verifyConfiguration,configurationVerified:()=>configurationVerified};
}
