import {assertOperationReader} from './final-review-reader.mjs';
import {open,mkdir,stat,readdir} from 'node:fs/promises';
import {join,isAbsolute} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createProductionFinalCodexProvider} from './codex-provider.mjs';
import {assertDurableFinalOperationStore} from './store.mjs';
import {assertValidatedLaunchSettings} from './launch-config.mjs';
import {finalReviewCallAccounting,finalReviewAllowance,finalOperationAuthorizationIdentity} from './final-review-authority.mjs';
import {compileOperationDuties,partitionOperationDuties,operationHash,controlPacket} from './final-operation-manifest.mjs';
import {createOperationOriginalReader,operationAdapterIdentity} from './final-operation-original.mjs';
import {FINAL_CODEX_FILES,codexDescriptor,decodeCodexJSON,buildFinalCodexInvocation} from './final-review-codex-original.mjs';
import {readManagedLayoutBytes} from './managed-layout-bytes.mjs';
const markCapabilities=new WeakMap();
export function assertFinalOperationMarkCapability(capability,expected){
 const bound=markCapabilities.get(capability);markCapabilities.delete(capability);
 if(!bound||operationHash(bound)!==operationHash(expected))throw Object.assign(Error('FINAL_OPERATION_HOST_MARK_REQUIRED'),{code:'FINAL_OPERATION_HOST_MARK_REQUIRED'});
}
const dispatchCapabilities=new WeakMap();
export function assertFinalOperationDispatch(capability,request,provider){
 const bound=dispatchCapabilities.get(capability);dispatchCapabilities.delete(capability);
 need(bound&&bound.request===request&&bound.requestHash===operationHash(request)&&operationHash(bound.provider)===operationHash(provider),'FINAL_OPERATION_DISPATCH_REQUIRED');
 assertDurableFinalOperationStore(bound.store);
 need(bound.store.read(bound.projectId).revision===bound.revision,'FINAL_OPERATION_READ_CHANGED');
}
const finalCallAdmissions=new WeakMap();
export function assertFinalCallAdmission(capability,project,command){const expected=finalCallAdmissions.get(capability);finalCallAdmissions.delete(capability);need(expected&&expected.projectId===project.id&&expected.revision===project.revision&&expected.commandHash===operationHash(command),'FINAL_OPERATION_FRESH_ADMISSION_REQUIRED');}
const FIXED_CODEX_BINARY='/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex';
const need=(v,code)=>{if(!v)throw Object.assign(Error(code),{code});};
async function seal(path,bytes){const h=await open(path,'wx',0o400);try{await h.writeFile(bytes);await h.sync();}finally{await h.close();}const dir=await open(join(path,'..'),'r');try{await dir.sync();}finally{await dir.close();}}
export function createFinalOperationRuntime(options){
 need(options&&Object.keys(options).every(key=>['store','launchConfiguration','finalReader'].includes(key)),'FINAL_OPERATION_INJECTION_REFUSED');
 const {store,launchConfiguration,finalReader}=options;
 assertOperationReader(finalReader,{store,launchConfiguration});assertValidatedLaunchSettings(launchConfiguration);assertDurableFinalOperationStore(store,undefined,launchConfiguration.server.dbPath);
 need(launchConfiguration.moduleConfigs?.finalReview,'FINAL_OPERATION_CONFIGURATION_REQUIRED');
 for(const profile of launchConfiguration.moduleConfigs.finalReview.configuration.assignmentPolicy.profiles){const provider=launchConfiguration.textProviders[profile.providerIdentity];need(provider?.adapter==='codex-cli'&&(provider.binary===undefined||provider.binary===FIXED_CODEX_BINARY),'FINAL_OPERATION_CUSTOM_BINARY_REFUSED');}
 const readOriginal=createOperationOriginalReader({store,launchConfiguration});
 const settings=structuredClone(launchConfiguration),executionRoot=settings.server.executionRoot,providerRoot=join(executionRoot,'provider'),hostRoot=join(executionRoot,'final-operation-host');
 need(isAbsolute(executionRoot),'FINAL_OPERATION_ROOT_REQUIRED');
 const context=(runId,contextId,manifest,basis)=>({actorType:'agent',actorId:'fixed-final-operation-host',runId,contextId,now:new Date().toISOString(),finalOperation:{launchConfiguration:settings,manifest,basis}});
 async function controls(projectId){const acquired=await finalReader.readOperationBasis(projectId);if(acquired.kind!=='captured')return acquired;const basis=acquired.basis,rows=compileOperationDuties(basis,settings),batches=partitionOperationDuties(rows,{captureIdentity:basis.identity});for(const row of rows){try{controlPacket(row,{attemptId:'operation-preflight-context',originalRoot:join(hostRoot,'operation-preflight-context')});}catch(error){return {kind:'blocked',blockers:[{code:error.code??'FINAL_OPERATION_SHAPE_UNSUPPORTED',dutyId:row.requirement.identity}]};}}return {kind:'compiled',basis,rows,batches};}
 async function select(projectId){
  const project=store.read(projectId),unknown=project.jobs.filter(j=>j.purpose==='final_operation_observation'&&j.status==='awaiting_reconciliation');if(unknown.length)return {kind:'reconcile',work:unknown.map(j=>({kind:'final-operation-reconcile',projectId,jobId:j.id}))};
  const compiled=await controls(projectId);if(compiled.kind!=='compiled')return compiled;
  const accounting=finalReviewCallAccounting(project),allowance=finalReviewAllowance(project)??settings.moduleConfigs.finalReview.allowance;
  const charged=project.jobs.filter(j=>j.purpose==='final_operation_observation'&&project.finalOperationAuthorizations.some(a=>a.id===j.task.authorizationId&&a.captureIdentity===compiled.basis.identity)).length;
  need(accounting.unknown.length===0,'FINAL_UNKNOWN_BLOCKS');need(accounting.consumedCalls+accounting.reservedOtherCalls+compiled.rows.length-charged+Math.max(0,compiled.basis.planning.plan.calls.length-project.jobs.filter(j=>j.purpose==='final_review_call'&&(project.finalReviewReservations??[]).some(r=>r.id===j.task.reservationId&&r.operationCaptureIdentity===compiled.basis.identity)).length-(project.finalReviewReservations??[]).filter(r=>r.operationCaptureIdentity===compiled.basis.identity&&r.status!=='released').reduce((n,r)=>n+r.calls.filter(c=>c.status==='held').length,0))<=allowance.totalCalls,'FINAL_CUMULATIVE_ALLOWANCE');
  for(const batch of compiled.batches){const authorizationId=finalOperationAuthorizationIdentity(project,context('pending','pending',batch.manifest,compiled.basis));const jobs=project.jobs.filter(j=>j.purpose==='final_operation_observation'&&j.task.authorizationId===authorizationId);if(jobs.some(j=>j.status==='failed'))return {kind:'blocked',blockers:[{code:'FINAL_OPERATION_DUTY_FAILED'}]};for(const job of jobs.filter(j=>j.status==='succeeded')){try{await readOriginal(project.id,job.id,()=>need(store.read(project.id).revision===project.revision,'FINAL_OPERATION_READ_CHANGED'));}catch(error){return {kind:'blocked',blockers:[{code:error.code??'FINAL_OPERATION_ORIGINAL_INVALID',jobId:job.id}]};}}const missing=batch.rows.filter(r=>!jobs.some(j=>j.task.requirementIdentity===r.requirement.identity&&j.status==='succeeded'));if(missing.length)return {...compiled,batch,authorizationId,work:missing.map(r=>({kind:'final-operation-observe',projectId,authorizationId,captureIdentity:compiled.basis.identity,requirementIdentity:r.requirement.identity}))};}
  return {...compiled,work:[]};
 }
 async function pendingWork(projectId){const selected=await select(projectId);return selected.work??[{kind:'final-operation-blocked',projectId,blockers:selected.blockers??[{code:'FINAL_OPERATION_ACTUAL_PLAN_REQUIRED'}]}];}
 async function retainProviderOriginals(projectId,job,receipt){
  const dir=join(hostRoot,job.attempts[0].id),run=receipt.paths.runDir.split('/').at(-1);need(/^run-[A-Za-z0-9_-]+$/.test(run),'FINAL_OPERATION_PROVIDER_PATH_INVALID');
  const files={};for(const [name,spec]of Object.entries(FINAL_CODEX_FILES)){try{const bytes=await readManagedLayoutBytes(providerRoot,join(providerRoot,run,spec.suffix),spec.limit);files[name]={relativePath:`${run}/${spec.suffix}`,...codexDescriptor(bytes)};}catch(error){if(name==='output'&&error.code==='ENOENT')files[name]=null;else throw error;}}
  const packet=decodeCodexJSON(await readManagedLayoutBytes(hostRoot,join(dir,'packet.json'),32*1024**2),32*1024**2);
  try{await seal(join(dir,'provider-originals.json'),JSON.stringify({protocol:'final-codex-originals-v1',binding:packet.binding,packetSha256:codexDescriptor(JSON.stringify(packet)).sha256,files}));}catch(error){if(error.code!=='EEXIST')throw error;}
 }
 async function reconcile(projectId,jobId){
  let project=store.read(projectId);const job=project.jobs.find(j=>j.id===jobId&&j.purpose==='final_operation_observation');need(job,'FINAL_OPERATION_ATTEMPT_REQUIRED');if(job.status!=='awaiting_reconciliation')return {kind:'settled',jobId,status:job.status};
  const current=()=>need(store.read(projectId).revision===project.revision,'FINAL_OPERATION_READ_CHANGED');
  try{await readManagedLayoutBytes(hostRoot,join(hostRoot,job.attempts[0].id,'provider-originals.json'),1024**2);}catch(error){if(error.code!=='ENOENT')return {kind:'unknown',jobId,code:error.code};let dirs;try{dirs=await readdir(providerRoot,{withFileTypes:true});}catch{return {kind:'unknown',jobId,code:'FINAL_OPERATION_ORIGINALS_MISSING'};}if(dirs.length>512)return {kind:'unknown',jobId,code:'FINAL_OPERATION_RESTART_SCAN_BOUND'};const matches=[];for(const d of dirs){if(!d.isDirectory()||!/^run-[A-Za-z0-9_-]+$/.test(d.name))continue;try{const receipt=decodeCodexJSON(await readManagedLayoutBytes(providerRoot,join(providerRoot,d.name,'receipt.json'),1024**2),1024**2);if(receipt.runId===job.attempts[0].id)matches.push(receipt);}catch{}}if(matches.length!==1)return {kind:'unknown',jobId,code:'FINAL_OPERATION_RECEIPT_AMBIGUOUS_OR_MISSING'};await retainProviderOriginals(projectId,job,matches[0]);}
  try{const proof=await readOriginal(projectId,jobId,current);current();const ctx={actorType:'agent',actorId:'fixed-final-operation-host',runId:job.attempts[0].id,contextId:job.attempts[0].executor.contextId,now:new Date().toISOString(),finalOperationProof:proof};project=store.command(projectId,{kind:'reconcile-final-operation-observation',commandId:`operation-settle-${job.attempts[0].id}`,expectedRevision:project.revision,authorizationId:job.task.authorizationId,jobId,attemptId:job.attempts[0].id},ctx);return {kind:'settled',jobId,status:proof.outcome,revision:project.revision};}catch(error){return {kind:'unknown',jobId,code:error.code??'FINAL_OPERATION_ORIGINAL_INVALID'};}
 }
 async function advance(work){
  if(work.kind==='final-operation-reconcile')return reconcile(work.projectId,work.jobId);
  need(work.kind==='final-operation-observe','FINAL_OPERATION_WORK_INVALID');
  const selected=await select(work.projectId);need(selected.kind==='compiled'&&selected.work.some(w=>operationHash(w)===operationHash(work)),'FINAL_OPERATION_WORK_CHANGED');
  let project=store.read(work.projectId);const control=selected.batch.rows.find(r=>r.requirement.identity===work.requirementIdentity);need(control,'FINAL_OPERATION_REQUIREMENT_CHANGED');
  if(!project.finalOperationCaptures?.some(r=>r.identity===selected.basis.identity))project=store.command(project.id,{kind:'retain-final-operation-capture',commandId:`operation-capture-${selected.basis.identity}`,expectedRevision:project.revision,capture:selected.basis.record},{actorType:'agent',actorId:'fixed-final-operation-host',runId:'capture',contextId:'capture',finalOperationCapture:selected.basis});
  const manifest=selected.batch.manifest,attemptId=`operation-${randomUUID()}`,contextId=`operation-context-${randomUUID()}`,jobId=`observation-${randomUUID()}`,ctx=context(attemptId,contextId,manifest,selected.basis),authorizationId=finalOperationAuthorizationIdentity(project,ctx);
  need(work.authorizationId===authorizationId,'FINAL_OPERATION_AUTHORITY_CHANGED');
  if(project.finalOperationAuthorizations?.at(-1)?.id!==authorizationId)project=store.command(project.id,{kind:'bind-final-operation-authorization',commandId:`operation-bind-${authorizationId}`,expectedRevision:project.revision,authorizationIdentity:authorizationId},ctx);
  const revision=project.revision,dir=join(hostRoot,attemptId);await mkdir(dir,{recursive:true,mode:0o700});
  const provider={...settings.textProviders[control.requirement.providerId],binary:FIXED_CODEX_BINARY};need(settings.textProviders[control.requirement.providerId].binary===undefined||settings.textProviders[control.requirement.providerId].binary===FIXED_CODEX_BINARY,'FINAL_OPERATION_CUSTOM_BINARY_REFUSED');const info=await stat(provider.binary);need(info.isFile(),'FINAL_OPERATION_EXECUTABLE_REQUIRED');
  const providerOptions={binary:provider.binary,model:provider.model,rootDir:providerRoot,timeoutMs:provider.timeoutMs??180000},adapter=createProductionFinalCodexProvider(providerOptions);
  const authority=project.finalOperationAuthorizations.at(-1),registration={protocol:'fixed-final-operation-host-v1',projectId:project.id,attemptId,authorizationId,requirementIdentity:control.requirement.identity,independentContextIdentity:contextId,executionRoot,providerRoot,launchConfigurationIdentity:authority.launchConfigurationIdentity,executable:{path:provider.binary,size:info.size,mtimeMs:info.mtimeMs,ino:info.ino,version:null}};
  const registrationBytes=JSON.stringify(registration);await seal(join(dir,'registration.json'),registrationBytes);const prepared=controlPacket(control,{attemptId,originalRoot:dir});
  for(const [i,bytes]of prepared.images.entries())await seal(JSON.parse(prepared.packetText).attachments[i].originalPath,bytes);
  const originals={'registration.json':registrationBytes,'packet.json':prepared.packetText,'provider-request.json':prepared.built.inputText,'provider-schema.json':prepared.built.schemaText,'preparation.json':JSON.stringify({registrationHash:codexDescriptor(registrationBytes).sha256,control,outputWitness:prepared.outputWitness,providerDescriptors:prepared.built.descriptors})};
  for(const [name,bytes]of Object.entries(originals))if(name!=='registration.json')await seal(join(dir,name),bytes);
  need(store.read(project.id).revision===revision,'FINAL_OPERATION_READ_CHANGED');need(await operationAdapterIdentity()===selected.basis.sourceIdentity,'FINAL_OPERATION_SOURCE_CHANGED');need(operationHash({path:provider.binary,size:info.size,mtimeMs:info.mtimeMs,ino:info.ino,version:null})===operationHash(selected.basis.executable),'FINAL_OPERATION_EXECUTABLE_CHANGED');
  const requestBasis={protocol:'final-operation-request-basis-v1',authorizationId,requirementIdentity:control.requirement.identity,independentContextIdentity:contextId,originals:Object.entries(originals).map(([name,bytes])=>({name,...codexDescriptor(bytes)}))};
  const capability=Object.freeze({}),markBinding={projectId:project.id,authorizationId,requirementIdentity:control.requirement.identity,jobId,attemptId,requestBasis};markCapabilities.set(capability,structuredClone(markBinding));
  const marked=store.command(project.id,{kind:'mark-final-operation-dispatched',commandId:`operation-mark-${attemptId}`,expectedRevision:revision,authorizationId,requirementIdentity:control.requirement.identity,jobId,attemptId,requestBasis},{...ctx,finalOperationMark:capability});
  need(marked.revision>revision,'FINAL_OPERATION_REPLAY_HAS_NO_CAPABILITY');assertDurableFinalOperationStore(store,marked);
  const dispatchCapability=Object.freeze({});dispatchCapabilities.set(dispatchCapability,{store,projectId:project.id,revision:marked.revision,request:prepared.built.request,requestHash:operationHash(prepared.built.request),provider:providerOptions});
  let submissionAvailable=true;const submit=async()=>{need(submissionAvailable,'FINAL_OPERATION_SUBMISSION_CONSUMED');submissionAvailable=false;need(store.read(project.id).revision===marked.revision,'FINAL_OPERATION_READ_CHANGED');const fresh=await stat(provider.binary);need(fresh.ino===info.ino&&fresh.size===info.size&&fresh.mtimeMs===info.mtimeMs,'FINAL_OPERATION_EXECUTABLE_CHANGED');await seal(join(dir,'launch.json'),JSON.stringify({protocol:'fixed-host-launch-v1',registrationHash:codexDescriptor(registrationBytes).sha256,preparationHash:codexDescriptor(originals['preparation.json']).sha256}));return adapter.executeFinalOperation(prepared.built.request,dispatchCapability);};
  let receipt;try{receipt=await submit();}catch(error){receipt=error.receipt;if(!receipt)return {kind:'unknown',jobId,code:error.code??'FINAL_OPERATION_DISPATCH_UNKNOWN'};}
  await retainProviderOriginals(project.id,marked.jobs.find(j=>j.id===jobId),receipt);return reconcile(project.id,jobId);
 }
 async function markFinalCall(projectId,command,executor){
  need(command.kind==='mark-final-review-dispatched','FINAL_OPERATION_FINAL_MARK_REQUIRED');
  const checked=await finalReader.readSnapshot(projectId),project=store.read(projectId),reservation=project.finalReviewReservations.find(r=>r.id===command.reservationId);
  need(checked.kind==='ready'&&checked.retained.operationEvidence?.kind==='verified'&&checked.observedRevision===project.revision&&command.expectedRevision===project.revision,'FINAL_OPERATION_FRESH_ADMISSION_REQUIRED');
  need(reservation?.operationCaptureIdentity===checked.retained.operationBasis?.identity&&reservation.planId===checked.plan.id&&reservation.inputId===checked.plan.inputId,'FINAL_OPERATION_CAPTURE_CHANGED');
  const capability=Object.freeze({});finalCallAdmissions.set(capability,{projectId,revision:project.revision,commandHash:operationHash(command)});const context=structuredClone(executor);Object.defineProperty(context,'finalOperationAdmission',{value:capability});
  try{return store.command(projectId,command,context);}finally{finalCallAdmissions.delete(capability);}
 }
 async function executeFinalCall(projectId,jobId){
  const project=store.read(projectId),job=project.jobs.find(j=>j.id===jobId&&j.purpose==='final_review_call'),attempt=job?.attempts[0];
  need(job?.status==='awaiting_reconciliation'&&attempt?.dispatchStarted===true&&job.attempts.length===1,'FINAL_CALL_REQUIRED');
  const marked=project.audit.at(-1),witness=marked&&JSON.parse(project.processedCommands[marked.commandId]);
  need(marked?.revision===project.revision&&marked.kind==='mark-final-review-dispatched'&&witness.relationship?.attemptId===attempt.id,'FINAL_OPERATION_FRESH_ADMISSION_REQUIRED');
  const pin=job.task.originalRequest,packet=await readManagedLayoutBytes(join(executionRoot,'final-review-calls'),join(executionRoot,'final-review-calls',attempt.id,'packet.json'),32*1024**2);
  need(operationHash(codexDescriptor(packet))===operationHash(pin.originals.packet),'FINAL_REQUEST_CHANGED');
  const built=buildFinalCodexInvocation({packetText:packet});
  need(operationHash(codexDescriptor(built.inputText))===operationHash(pin.originals.providerRequest)&&operationHash(codexDescriptor(built.schemaText))===operationHash(pin.originals.providerSchema),'FINAL_REQUEST_CHANGED');
  const provider=settings.textProviders[job.binding.providerId];need(provider?.adapter==='codex-cli'&&provider.model===job.binding.model&&(provider.binary===undefined||provider.binary===FIXED_CODEX_BINARY),'FINAL_PROVIDER_CONFIGURATION_REQUIRED');
  const providerOptions={binary:FIXED_CODEX_BINARY,model:provider.model,rootDir:providerRoot,timeoutMs:provider.timeoutMs??180000};
  const capability=Object.freeze({});dispatchCapabilities.set(capability,{store,projectId,revision:project.revision,request:built.request,requestHash:operationHash(built.request),provider:providerOptions});
  const launchPath=join(executionRoot,'final-review-calls',attempt.id,'launch.json');
  await seal(launchPath,JSON.stringify({protocol:'final-business-launch-v1',projectId,jobId,attemptId:attempt.id,packetSha256:pin.originals.packet.sha256}));
  need(store.read(projectId).revision===project.revision,'FINAL_OPERATION_READ_CHANGED');
  return createProductionFinalCodexProvider(providerOptions).executeFinalOperation(built.request,capability);
 }
 return Object.freeze({pendingWork,advance,reconcile,markFinalCall,executeFinalCall});
}
