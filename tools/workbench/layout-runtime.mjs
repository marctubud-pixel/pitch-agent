import {layoutWitnessBinding,isLayoutCommandWitness,isFullLayoutRawCommand,layoutWitnessMatches} from './layout-command-witness.mjs';
import {isDeepStrictEqual as equal} from 'node:util';
import {createSemanticLayoutRuntime} from './layout-semantic-runtime.mjs';
import {unresolvedLayoutResult,verifyLayoutCurrent,layoutCurrentFailure} from './layout-status-contract.mjs';
import {createNativeLayoutRuntime} from './layout-native-runtime.mjs';
import {verifyLayoutRenderer} from './layout-renderer.mjs';
import {randomUUID} from 'node:crypto';
import {freezeLayoutInput,layoutJobInput,layoutHash,layoutIntent,LAYOUT_PURPOSE,LAYOUT_STYLES,LATER_FINAL_RESPONSIBILITIES} from './layout-boundary.mjs';
import {readManagedLayoutBytes} from './managed-layout-bytes.mjs';
import {sketchRequire as need} from './sketch-authority.mjs';
export function createLayoutRuntime({store,root,content,configuration}){
 const semanticPlans=createSemanticLayoutRuntime({store,root,content});
 const native=createNativeLayoutRuntime({store,root,content,configuration});
 const capability=()=>({protocol:'project-layout-v1',boundaryIntegrated:true,semanticPlanVersions:['semantic-layout-v3'],numericNativeChartExportAvailable:configuration?.semanticVersion==='semantic-layout-v3'&&native.configurationVerified(),configured:configuration?.version==='project-layout-boundary-v1',nativeExecutionIntegrated:true,exportAvailable:native.configurationVerified(),finalAuthorityAvailable:false,styles:[...LAYOUT_STYLES],laterFinalResponsibilities:[...LATER_FINAL_RESPONSIBILITIES],laterFinalEvidence:'mirrored independent blind/opposition and separate director required; unimplemented'});
 async function layoutStatus(id,bindingHash){
  const p=store.read(id),last=p.audit?.findLast(a=>a.kind==='prepare-project-layout'),intent=last&&JSON.parse(p.processedCommands[last.commandId]);
  const selected=bindingHash??(layoutWitnessBinding(intent)),j=selected?p.jobs.find(j=>j.purpose===LAYOUT_PURPOSE&&j.task.bindingHash===selected):p.jobs.filter(j=>j.purpose===LAYOUT_PURPOSE).at(-1);
  const base={...(j?{rootJobId:j.id,bindingHash:j.task.bindingHash,styles:p.jobs.find(x=>x.id===(j.task.rootJobId??j.id))?.task.binding.styles,predecessorRootJobId:j.task.predecessorRootJobId}:{}),queuedJobIds:[],exportAvailable:false,finalAuthorityAvailable:false};
  const unknown=unresolvedLayoutResult(p);
  if(unknown)return {...base,...unknown};
  if(!j)return {...base,status:'not_requested'};
  const nativeRoot=p.jobs.find(x=>x.id===(j.task.rootJobId??j.id));
  if(nativeRoot?.task.binding.execution)return {...base,...await native.status(id,nativeRoot)};
  try{await verifyLayoutCurrent(store,content,id,layoutJobInput(p,j));}
  catch(error){return {...base,...layoutCurrentFailure(error)};}
  if(j.status!=='blocked'||j.error?.code!=='LAYOUT_EXPORT_UNAVAILABLE')return {...base,status:'blocked',reason:j.error?.code??'LAYOUT_JOB_BLOCKED',originalStatus:j.status};
  return {...base,status:'prepared_unavailable',reason:'LAYOUT_EXPORT_UNAVAILABLE'};
 }
 async function prepare(id,request,revisionIntent){
  layoutIntent(request);let p=store.read(id);const prior=p.processedCommands[request.commandId];
  if(prior){const c=JSON.parse(prior),witness=isLayoutCommandWitness(c),rawCompatibility=c.protocol==='layout-command-digest-v1'&&!witness;
   need(c.kind==='prepare-project-layout'&&(!rawCompatibility||(isFullLayoutRawCommand(c)&&c.commandId===request.commandId))&&!!c.revisionIntent===revisionIntent,'COMMAND_ID_REUSED','Layout intent identity cannot change');
   if(witness||rawCompatibility){
    const bindingHash=layoutWitnessBinding(c),jobs=p.jobs.filter(j=>j.purpose===LAYOUT_PURPOSE&&j.task?.bindingHash===bindingHash&&j.task?.binding);
    need(jobs.length===1,'LAYOUT_COMMAND_WITNESS_INVALID','Unique original layout job required');const task=jobs[0].task,b=task.binding;
    const retainedInput=rawCompatibility?layoutJobInput(p,jobs[0]):undefined;
    const payload=c.prepared?{prepared:rawCompatibility?retainedInput:task.input}:{numericPreparation:{bindingHash,renderer:b.renderer,resources:b.resources,...(b.execution?{schemaVersion:'numeric-layout-preparation-v1',execution:b.execution}:{})}};
    if(rawCompatibility)need(equal(c.prepared??c.numericPreparation,payload.prepared??payload.numericPreparation),'LAYOUT_COMMAND_WITNESS_INVALID','Full original command must match retained layout input');
    else{
    const candidate={kind:'prepare-project-layout',...request,revisionIntent,...payload};const raw=JSON.stringify(Object.fromEntries(Object.entries(candidate).filter(([k])=>k!=='expectedRevision')));
    need(layoutWitnessMatches(c,candidate,raw),'COMMAND_ID_REUSED','Exact original layout command cannot be proven');
    }
   }
   return layoutStatus(id,layoutWitnessBinding(c));}
  need(p.revision===request.expectedRevision,'REVISION_CONFLICT','Exact current project revision required');
  need(configuration?.version==='project-layout-boundary-v1','LAYOUT_CONFIGURATION_REQUIRED','Explicit versioned trusted layout configuration required');
  const trusted=await content.contentLayoutInput(id),resources=[];
  await verifyLayoutRenderer(configuration.renderer);
  need(Array.isArray(configuration.resources)&&configuration.resources.length>0,'LAYOUT_RESOURCES_REQUIRED','Actual trusted brand resource bytes required');
  need(new Set(configuration.resources.map(r=>r.id)).size===configuration.resources.length,'LAYOUT_RESOURCE_ID_CONFLICT','Trusted resource identities must be unique');
  for(const resource of configuration.resources){need(resource.kind&&resource.id&&/^[a-f0-9]{64}$/.test(resource.sha256),'LAYOUT_RESOURCES_REQUIRED','Explicit resource kind, identity and exact hash required');const bytes=await readManagedLayoutBytes(root,resource.path,64*1024*1024);need(layoutHash(bytes)===resource.sha256,'LAYOUT_RESOURCE_BYTES_CHANGED','Actual trusted resource bytes changed');resources.push({id:resource.id,kind:resource.kind,sha256:resource.sha256,byteLength:bytes.length,path:resource.path});}
  p=store.read(id);need(p.revision===request.expectedRevision,'REVISION_CONFLICT','Project changed during verified preparation');
  if(configuration.execution)await native.verifyConfiguration(configuration.execution);
  const prepared=freezeLayoutInput(p,{...trusted,resources},configuration);
  store.command(id,{kind:'prepare-project-layout',...request,revisionIntent,...(configuration.semanticVersion==='semantic-layout-v3'?{numericPreparation:{bindingHash:prepared.bindingHash,renderer:prepared.binding.renderer,resources:prepared.binding.resources,...(prepared.binding.execution?{schemaVersion:'numeric-layout-preparation-v1',execution:prepared.binding.execution}:{})}}:{prepared})},{actorType:'agent',actorId:randomUUID(),runId:randomUUID(),contextId:randomUUID()});const queuedJobIds=await native.advance(id);return {...await layoutStatus(id,prepared.bindingHash),queuedJobIds};
 }
 async function advanceLayout(id){return {...await layoutStatus(id),queuedJobIds:await native.advance(id)};}
 async function execute(id,jobId){const j=store.read(id).jobs.find(j=>j.id===jobId);need(j?.purpose===LAYOUT_PURPOSE,'LAYOUT_JOB_REQUIRED','Dedicated layout job required');if(j.task.binding?.execution||j.task.rootJobId)return native.execute(id,jobId);return {...j,executionUnavailable:true};}
 return {capability,semanticPlans,layoutStatus,continueLayout:(id,r)=>prepare(id,r,false),reviseLayout:(id,r)=>prepare(id,r,true),advanceLayout,execute};
}
