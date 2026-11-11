import {layoutWitnessBinding,isLayoutCommandWitness} from './layout-command-witness.mjs';
import {realpath} from 'node:fs/promises';
import {join,isAbsolute} from 'node:path';
import {isDeepStrictEqual as equal} from 'node:util';
import {createLayoutRuntime} from './layout-runtime.mjs';
import {createLocalLayoutDriver,localLayoutConfiguration} from './local-acceptance-layout-driver.mjs';
import {prepareLocalLayoutRuntime,localLayoutApplicationRequirements,localLayoutToolStatus} from './local-layout-resource-bridge.mjs';
import {createLocalEngineeringMockup} from '../auto-layout/local-engineering-mockup.mjs';
import {readManagedLayoutBytes} from './managed-layout-bytes.mjs';
import {layoutHash,LAYOUT_PURPOSE} from './layout-boundary.mjs';
import {unresolvedLayoutResult} from './layout-status-contract.mjs';
const need=(value,code)=>{if(!value)throw Object.assign(Error(code),{code});};
const marked={syntheticOnly:true,realQualityVerified:false,finalAuthorityAvailable:false};
const toolNames=['node','engine','nativeCheck','python','soffice','bash','nativeRuntime','presentationsSkill'];
function currentRoot(p){
 const last=p.audit?.findLast(a=>a.kind==='prepare-project-layout');
 const command=last&&JSON.parse(p.processedCommands[last.commandId]);
 const bindingHash=layoutWitnessBinding(command);
 return bindingHash?p.jobs.find(j=>j.purpose===LAYOUT_PURPOSE&&j.task?.bindingHash===bindingHash&&j.task.binding):p.jobs.filter(j=>j.purpose===LAYOUT_PURPOSE&&j.task?.binding).at(-1);
}
export function localLayoutSourceIdentity(project,trusted){
 const c=trusted?.contract,s=trusted?.source;
 need(c&&s&&typeof trusted.manuscriptText==='string'&&c.artifactId===project.activeByStage.content_review,'LOCAL_LAYOUT_CURRENT_CONTENT_REQUIRED');
 const artifact=project.artifacts.find(a=>a.id===c.artifactId);
 need(artifact?.completeContent&&project.releases.some(r=>r.artifactId===c.artifactId&&r.policyVersion===project.policies.at(-1).version&&r.sourceHash===c.sourceHash),'LOCAL_LAYOUT_CONTENT_RELEASE_REQUIRED');
 const {sourceHash,...body}=s;
 need(layoutHash(body)===sourceHash&&sourceHash===c.sourceHash&&layoutHash(c.manuscript)===c.manuscriptHash&&layoutHash(trusted.manuscriptText)===trusted.contentHash&&equal(JSON.parse(trusted.manuscriptText),c.manuscript),'LOCAL_LAYOUT_SOURCE_CHANGED');
 need(['producer','consumer'].every(k=>trusted.ownerReports?.[k]?.raw?.decision==='accept')&&equal(trusted.ownerReports.consumer,c.layoutAcceptance),'LOCAL_LAYOUT_OWNER_REPORTS_REQUIRED');
 return {contentArtifactId:c.artifactId,contentHash:trusted.contentHash,sourceHash,manuscriptHash:c.manuscriptHash};
}
export async function createLazyLocalLayoutController(options={}){
 const {projectStore,executor:base,imageStore,executionRoot,caseIdForProject}=options;
 const {tools,fontRecords,requiredApplications}=structuredClone({tools:options.tools,fontRecords:options.fontRecords,requiredApplications:options.requiredApplications});
 need(Object.keys(options).every(k=>['projectStore','executor','imageStore','executionRoot','tools','fontRecords','requiredApplications','caseIdForProject'].includes(k)),'LOCAL_LAYOUT_CONTROLLER_OPTION_INVALID');
 need(projectStore&&typeof base?.contentLayoutInput==='function'&&typeof base?.verifyLayoutPreparation==='function'&&typeof base?.execute==='function'&&typeof imageStore?.read==='function'&&typeof caseIdForProject==='function','LOCAL_LAYOUT_CONTROLLER_DEPENDENCY_REQUIRED');
 need(isAbsolute(executionRoot)&&await realpath(executionRoot)===executionRoot,'LOCAL_LAYOUT_CONTROLLER_CANONICAL_ROOT_REQUIRED');
 const content={contentLayoutInput:(...a)=>base.contentLayoutInput(...a),verifyLayoutPreparation:(...a)=>base.verifyLayoutPreparation(...a)};
 const cache=new Map(),busy=new Set();
 async function context(id,caseId,prepare=false){
  need(['m6','dexian'].includes(caseId)&&caseIdForProject(id)===caseId,'LOCAL_LAYOUT_CASE_REQUIRED');
  const before=projectStore.read(id),unknown=unresolvedLayoutResult(before);
  if(unknown)return {state:{...unknown,...marked}};
  const trusted=await content.contentLayoutInput(id),p=projectStore.read(id);
  need(p.revision===before.revision,'LOCAL_LAYOUT_SOURCE_CHANGED');
  const identity=localLayoutSourceIdentity(p,trusted),key=layoutHash([id,caseId,identity,p.activeTaskCardId,p.policies.at(-1)]);
  const toolStatus=await localLayoutToolStatus(tools);
  if(toolStatus.status!=='configured')return {state:{status:'blocked',reason:toolStatus.reason,tool:toolStatus.tool,...marked}};
  need(Array.isArray(fontRecords)&&fontRecords.length>0,'LOCAL_LAYOUT_FONT_ORIGINALS_REQUIRED');
  const requirements=localLayoutApplicationRequirements({source:trusted.source,caseId,requiredApplications});
  const prior=currentRoot(p),same=prior&&Object.entries(identity).every(([k,v])=>prior.task.binding[k]===v)&&prior.task.binding.taskCardId===p.activeTaskCardId&&equal(prior.task.binding.policy,p.policies.at(-1));
  let configuration=cache.get(key);
  if(!configuration&&same){
   const b=prior.task.binding;
   need(layoutHash(b)===prior.task.bindingHash&&toolNames.every(k=>b.execution?.[k]===toolStatus.paths[k]),'LOCAL_LAYOUT_PREPARATION_CHANGED');
   need(equal(b.execution.files.filter(f=>!toolNames.slice(0,6).some(k=>b.execution[k]===f.path)).map(f=>f.path).sort(),[...new Set(toolStatus.paths.extraFiles)].filter(f=>!toolNames.slice(0,6).some(k=>b.execution[k]===f)).sort())&&equal(b.execution.dependencyRoots.map(r=>r.path).sort(),[...new Set([toolStatus.paths.nativeRuntime,toolStatus.paths.presentationsSkill,...toolStatus.paths.extraRoots])].sort()),'LOCAL_LAYOUT_PREPARATION_CHANGED');
   need(equal([...new Set(fontRecords.map(f=>f.sha256))].sort(),b.resources.filter(r=>r.kind==='font').map(r=>r.sha256).sort()),'LOCAL_LAYOUT_PREPARATION_CHANGED');
   const assetResource=b.resources.find(r=>r.kind==='assets');need(assetResource,'LOCAL_LAYOUT_PREPARATION_CHANGED');
   const assetBytes=await readManagedLayoutBytes(executionRoot,assetResource.path);need(layoutHash(assetBytes)===assetResource.sha256,'LOCAL_LAYOUT_PREPARATION_CHANGED');
   const assets=JSON.parse(assetBytes.toString()).assets;
   need(requirements.every(r=>assets[r.targetImageId]?.application?.purpose===r.purpose),'LOCAL_LAYOUT_PREPARATION_CHANGED');
   configuration={...localLayoutConfiguration({packetVersion:trusted.contract.packetVersion,source:trusted.source,renderer:b.renderer,resources:b.resources.map(({byteLength,...r})=>r),execution:b.execution}),nativeExecutionAllowed:true};
  }
  if(!configuration&&!prepare)return {state:{status:'pending',nextOperation:'prepare_resources',...marked}};
  if(!configuration){
   const ids=[...new Set([...trusted.source.obligations.filter(o=>o.kind==='image').map(o=>o.value.imageId),...trusted.contract.manuscript.pageIntents.flatMap(p=>p.imageIds)])],imageRecords=[];
   for(const imageId of ids){
    const expected=trusted.source.images.find(i=>i.imageId===imageId);need(expected,'LOCAL_LAYOUT_IMAGE_IDENTITY_REQUIRED');
    const loaded=await imageStore.read({projectId:id,imageId,expectedHash:expected.sha256});
    need(loaded.asset.id===imageId&&loaded.asset.projectId===id&&loaded.asset.sha256===expected.sha256&&loaded.asset.width===expected.width&&loaded.asset.height===expected.height&&loaded.descriptor.sha256===expected.sha256&&loaded.descriptor.byteLength===loaded.bytes.length&&layoutHash(loaded.bytes)===expected.sha256,'LOCAL_LAYOUT_IMAGE_IDENTITY_REQUIRED');
    imageRecords.push({imageId,path:loaded.descriptor.path,sha256:expected.sha256,byteLength:loaded.bytes.length,width:loaded.asset.width,height:loaded.asset.height});
   }
   const mockups=[];
   for(const requirement of requirements){
    const image=imageRecords.find(i=>i.imageId===requirement.targetImageId);need(image,'LOCAL_LAYOUT_MOCKUP_TARGET_REQUIRED');
    const frame=await createLocalEngineeringMockup({directory:join(executionRoot,'local-layout-mockups'),purpose:requirement.purpose,artWidth:image.width,artHeight:image.height});
    mockups.push({...frame,targetImageId:image.imageId,asset:{...frame.asset,id:'mockup-'+layoutHash([image.imageId,frame.asset.sha256,requirement.purpose])}});
   }
   configuration=await prepareLocalLayoutRuntime({executionRoot,caseId,packetVersion:trusted.contract.packetVersion,source:trusted.source,manuscript:trusted.contract.manuscript,imageRecords,fontRecords,mockups,requiredApplications:requirements,tools});
   need(configuration.status==='configured'&&configuration.nativeExecutionAllowed===true,'LOCAL_LAYOUT_PREPARATION_REQUIRED');
   need(projectStore.read(id).revision===p.revision,'LOCAL_LAYOUT_SOURCE_CHANGED');
  }
  cache.set(key,configuration);
  const runtime=createLayoutRuntime({store:projectStore,root:executionRoot,content,configuration:configuration.layoutConfiguration});
  return {runtime,configuration,identity,key,prior,revise:!!prior&&!same};
 }
 async function inspect(ctx){
  try{
   const id=ctx.case?.projectId??ctx.project.id,c=await context(id,ctx.case?.caseId??ctx.case?.id);
   if(c.state)return c.state;
   if(c.revise)return {status:'pending',nextOperation:'revise',...marked};
   const nativeExecutor={...base,layoutStatus:c.runtime.layoutStatus,continueLayout:c.runtime.continueLayout,advanceLayout:c.runtime.advanceLayout,execute:(projectId,jobId)=>c.runtime.execute(projectId,jobId)};
   return createLocalLayoutDriver({projectStore,executor:nativeExecutor,configuration:c.configuration,nativeExecutionAllowed:true}).inspect(ctx);
  }catch(e){return {status:'blocked',reason:e.code??'LOCAL_LAYOUT_PREPARATION_FAILED',...marked};}
 }
 async function advance(ctx){
  const id=ctx.case?.projectId??ctx.project.id;
  need(!busy.has(id),'LOCAL_LAYOUT_ADVANCE_IN_PROGRESS');busy.add(id);
  try{
   const c=await context(id,ctx.case?.caseId??ctx.case?.id,true);if(c.state)return c.state;
   const p=projectStore.read(id),status=await c.runtime.layoutStatus(id);
   if(c.revise||status.status==='not_requested'){
    const request={commandId:'local-layout-'+layoutHash([id,c.key,c.prior?.id??null]),expectedRevision:p.revision};
    const result=await (c.revise?c.runtime.reviseLayout(id,request):c.runtime.continueLayout(id,request));
    if(result.queuedJobIds?.length)await c.runtime.execute(id,result.queuedJobIds[0]);
   }else if(!['technical_complete','awaiting_reconciliation','running','blocked','stale','prepared_unavailable'].includes(status.status)){
    const result=await c.runtime.advanceLayout(id);if(result.queuedJobIds?.length)await c.runtime.execute(id,result.queuedJobIds[0]);
   }
   return inspect(ctx);
  }finally{busy.delete(id);}
 }
 async function native(id,prepare=false){
  const c=await context(id,caseIdForProject(id),prepare);
  need(c.runtime&&(prepare||!c.revise),'LOCAL_LAYOUT_CURRENT_RUNTIME_REQUIRED');return c.runtime;
 }
 const executor={...base,...content,layoutStatus:async(id)=>{const root=currentRoot(projectStore.read(id));if(!root)return {status:'not_requested',...marked};return (await native(id)).layoutStatus(id);},continueLayout:async(id,r)=>(await native(id,true)).continueLayout(id,r),reviseLayout:async(id,r)=>(await native(id,true)).reviseLayout(id,r),advanceLayout:async(id)=>(await native(id)).advanceLayout(id),execute:async(id,jobId)=>projectStore.read(id).jobs.find(j=>j.id===jobId)?.purpose===LAYOUT_PURPOSE?(await native(id)).execute(id,jobId):base.execute(id,jobId)};
 return {executor,driver:{inspect,advance},syntheticOnly:true};
}
