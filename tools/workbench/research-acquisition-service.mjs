import {createExecutor} from './executor.mjs';
import {reconcileStage} from './reconcile-stage.mjs';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual as equal} from 'node:util';
import {createResearchAcquisitionRuntime} from './research-acquisition-runtime.mjs';
import {validateModelHttpConfiguration} from './model-http-authority.mjs';
import {validateResearchSearchProvider} from './research-search.mjs';
import {verifyAcquisitionGeneration} from './research-acquisition-original.mjs';
import {ACQUISITION_PROTOCOL,ACQUISITION_PURPOSES,ACQUISITION_LIMITS,acquisitionHash,acquisitionCurrent} from './research-acquisition.mjs';
import {cardHash} from './intake-contract.mjs';
import {createBriefIntakeService} from './brief-intake-service.mjs';
import {researchQuestionRegistration} from './research-reader-state.mjs';
import {requireResearchWorkflow} from './seven-stage-workflow.mjs';
const need=(v,code,message)=>{if(!v)throw Object.assign(Error(message),{code,status:['REVISION_CONFLICT','COMMAND_ID_REUSED'].includes(code)?409:422});};
const actor=()=>({actorType:'agent',actorId:'research-acquisition-runtime',runId:randomUUID(),contextId:randomUUID(),now:new Date().toISOString()});
export function createAcquisitionService({store,rootDir,originalsRoot,executionAllowed,executor,...options}){
 const native=executor?.researchAcquisition??createResearchAcquisitionRuntime({store,root:resolve(rootDir),providers:options.providers??{},bindings:options.bindings??{},searchProviders:options.searchProviders,configuration:options.researchAcquisitionConfiguration});
 const runnable=role=>{const binding=options.bindings?.[role],provider=options.providers?.[binding?.providerId];if(!binding||provider?.model!==binding.model)return false;if(provider.adapter!=='workbench-model-http-v1')return typeof provider.execute==='function';try{const c=validateModelHttpConfiguration(provider.operatorConfig),env=provider.environment??process.env;if(c.authentication.kind==='bearer-env'&&!env[c.authentication.name])return false;if(role==='research_planner'){const cap=options.researchAcquisitionConfiguration?.limits?.planOutputBytes??ACQUISITION_LIMITS.planOutputBytes;if(c.maxOutputBytes>cap||c.maxResponseBytes>cap*6+8192)return false;}return true;}catch{return false;}};
 const capability=()=>{let validSearch=false;try{validateResearchSearchProvider(options.searchProviders?.[options.researchAcquisitionConfiguration?.searchProviderId]);validSearch=true;}catch{}return {...native.capability(),available:Boolean(executionAllowed&&executor&&native.capability().available&&validSearch&&runnable('research_planner')&&runnable('research')),executionAllowed:Boolean(executionAllowed),materialsRootShared:Boolean(originalsRoot&&resolve(originalsRoot)===resolve(rootDir)),sourceAuthenticity:'not_verified',humanAdoption:'not_verified'};};
 const read=id=>{const p=store.read(id);requireResearchWorkflow(p);return p;};
 function current(p,request){const card=p.taskCards.find(x=>x.id===p.activeTaskCardId);need(card?.id===request.taskCardId&&cardHash(card)===request.taskCardHash&&p.confirmations.some(x=>x.taskCardId===card.id)&&researchQuestionRegistration(p),'STALE_ACQUISITION','Current confirmed full task and preregistered questions required');}
 const status=async (id,generationId)=>{const p=read(id),acquisition=native.status(id,generationId),g=generationId?(p.researchAcquisitions??[]).find(g=>g.envelope.id===generationId):(p.researchAcquisitions??[]).at(-1);let originals=null;
  if(g){try{await verifyAcquisitionGeneration(p,g,{executionRoot:resolve(rootDir),historical:true,requireManifest:Boolean(g.admission)});originals={verified:true};}catch(error){originals={verified:false,error:error.code??'ACQUISITION_ORIGINAL_INVALID'};}}
  need(store.read(id).revision===p.revision,'REVISION_CONFLICT','Project changed during acquisition read');
  let applicable=false;if(g&&p.researchAcquisitions.at(-1)===g){try{acquisitionCurrent(p,g);applicable=true;}catch{}}
  return {acquisition:{...acquisition,originals,current:applicable},capability:capability(),revision:p.revision};};
 async function materials(id,ids){
  if(!ids.length)return;
  need(originalsRoot&&resolve(originalsRoot)===resolve(rootDir),'ACQUISITION_ORIGINAL_ROOT_MISMATCH','Selected PDF originals require an explicitly shared original/execution root');
  const originals=createBriefIntakeService({store,rootDir:resolve(originalsRoot)});
  for(const documentId of ids){const loaded=await originals.extraction(id,documentId);need(loaded.document.isCurrent,'STALE_ACQUISITION','Historical PDF cannot become current research input');}
 }
 async function run(id,operation,request,requester){
  let p=read(id);const common=['commandId','expectedRevision','taskCardId','taskCardHash'],extra={start:['sourceEntryIds','materialIds'],step:['generationId','jobIds'],reconcile:['generationId','jobId']}[operation];
  need(request&&typeof request==='object'&&!Array.isArray(request)&&Object.keys(request).length===common.length+extra.length&&[...common,...extra].every(k=>Object.hasOwn(request,k))&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(request.commandId)&&Number.isSafeInteger(request.expectedRevision)&&request.expectedRevision>=0,'INVALID_REQUEST','Exact acquisition request fields required');
  const prior=(p.researchAcquisitionHttpRequests??[]).find(x=>x.request.commandId===request.commandId);
  if(prior)need(prior.operation===operation&&equal(prior.request,request),'COMMAND_ID_REUSED','Original acquisition body changed');
  else need(!Object.hasOwn(p.processedCommands,request.commandId),'COMMAND_ID_REUSED','Command already belongs to another operation');
  let row=prior;
  if(!row){
   if(operation!=='reconcile')current(p,request);need(p.revision===request.expectedRevision,'REVISION_CONFLICT','Project changed');if(operation!=='reconcile')need(capability().available,'ACQUISITION_UNAVAILABLE','Acquisition search/planner/producer execution not configured');
   const nativeId=`acquisition-start-${acquisitionHash([id,request.commandId])}`,generationId=operation==='start'?`acquisition-${acquisitionHash([id,nativeId])}`:request.generationId;
   const jobIds=operation==='step'?request.jobIds:operation==='reconcile'?[request.jobId]:[];
   need(Array.isArray(jobIds)&&jobIds.length<=(operation==='step'?4:1)&&(operation!=='step'||jobIds.length>0)&&new Set(jobIds).size===jobIds.length,'INVALID_REQUEST','One to four exact selected jobs required');
   if(operation==='start'){for(const ids of [request.sourceEntryIds,request.materialIds])need(Array.isArray(ids)&&ids.length<=20&&new Set(ids).size===ids.length&&ids.every(x=>typeof x==='string'&&x.length<=200),'INVALID_REQUEST','Bounded registered source/material IDs required');await materials(id,request.materialIds);}
   else if(operation==='step'){const eligible=native.status(id).queuedJobIds;need(jobIds.every(x=>eligible.includes(x)),'INVALID_JOB','Selected jobs are not eligible');}
   store.command(id,{kind:'research-acquisition-http-request',operation,request:structuredClone(request),requester:requester?structuredClone(requester):null,generationId,jobIds,commandId:request.commandId,expectedRevision:request.expectedRevision},actor());
   p=read(id);row=p.researchAcquisitionHttpRequests.at(-1);
  }
  if(operation==='start'){
   if(!p.researchAcquisitions?.some(g=>g.envelope.id===row.generationId)){
    current(p,request);need(capability().available,'ACQUISITION_UNAVAILABLE','Acquisition disabled');await materials(id,request.materialIds);
    await native.continue(id,{protocolVersion:ACQUISITION_PROTOCOL,commandId:`acquisition-start-${acquisitionHash([id,request.commandId])}`,expectedRevision:request.expectedRevision+1,sourceEntryIds:request.sourceEntryIds,materialIds:request.materialIds});
   }
  }else{
   const pending=row.jobIds.filter(jobId=>{const j=p.jobs.find(j=>j.id===jobId);return operation==='step'?j?.status==='queued'&&j.attempts.length===0:j?.status==='awaiting_reconciliation';});
   if(pending.length){
    const g=p.researchAcquisitions.find(g=>g.envelope.id===row.generationId);if(operation==='step'){current(p,request);need(capability().available,'ACQUISITION_UNAVAILABLE','Acquisition disabled');acquisitionCurrent(p,g);need(equal(row.questionRegistration,researchQuestionRegistration(p)),'RESEARCH_QUESTIONS_CHANGED','Question plan changed');}
    for(const jobId of pending){if(operation==='step')current(read(id),request);if(operation==='step'){const admission={requestId:request.commandId,expectedRevision:store.read(id).revision};await materials(id,g.envelope.request.materialIds);await executor.execute(id,jobId,{acquisitionAdmission:admission});}else {const recovery={commandId:`acquisition-reconcile-${acquisitionHash([id,request.commandId])}`,expectedRevision:store.read(id).revision};if(ACQUISITION_PURPOSES.includes(store.read(id).jobs.find(j=>j.id===jobId).purpose))await (executor??createExecutor({store,rootDir,...options})).researchAcquisition.reconcile(id,jobId,{...request,...recovery});else await reconcileStage({store,root:resolve(rootDir),projectId:id,jobId,...recovery,reason:'Read only the exact saved current acquisition producer response; no new invocation'});}}

   }
  }
  if(operation==='step'&&row.jobIds.every(jobId=>store.read(id).jobs.find(j=>j.id===jobId)?.status==='succeeded')&&capability().available){let applicable=true;try{const currentProject=read(id);need(currentProject.researchAcquisitions.at(-1)?.envelope.id===row.generationId,'STALE_ACQUISITION','Historical generation');current(currentProject,request);acquisitionCurrent(currentProject,currentProject.researchAcquisitions.find(g=>g.envelope.id===row.generationId));}catch{applicable=false;}if(applicable)await native.advance(id);}
  return {...await status(id,row.generationId),receipt:{commandId:request.commandId,replayed:Boolean(prior),operation,generationId:row.generationId,jobIds:row.jobIds}};
 }
 return {capability,status,start:(id,r,c)=>run(id,'start',r,c),step:(id,r,c)=>run(id,'step',r,c),reconcile:(id,r,c)=>run(id,'reconcile',r,c)};
}
