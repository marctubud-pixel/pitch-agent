import {createHash} from 'node:crypto';
import {contentContractForPacket} from './content-contract-versions.mjs';
import {LAYOUT_PURPOSE,LAYOUT_STYLES,validateLayoutConfiguration,layoutHash} from './layout-boundary.mjs';
import {layoutRoot,layoutTuple} from './layout-native-domain.mjs';
const need=(v,code)=>{if(!v)throw Object.assign(Error(code),{code});};
const clone=structuredClone;
const marked={syntheticOnly:true,realQualityVerified:false,finalAuthorityAvailable:false};
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export function localLayoutBrand({caseId,fontFiles}={}){
 need(['m6','dexian'].includes(caseId)&&Array.isArray(fontFiles)&&fontFiles.length>0&&fontFiles.every(f=>typeof f==='string'&&f.startsWith('/')),'LOCAL_LAYOUT_BRAND_RESOURCES_REQUIRED');
 return {name:caseId==='m6'?'梦之蓝 M6+':'得闲',colors:caseId==='m6'?{primary:'#173C78',accent:'#C9A864',paper:'#F6F3EC',ink:'#152B48',muted:'#59687A'}:{primary:'#243F35',accent:'#B99869',paper:'#F0ECE1',ink:'#24352E',muted:'#67746B'},font:{family:'PingFang SC',files:fontFiles.slice()},minBodySize:22};
}
export function localLayoutAssets({source,manuscript,imageRecords,mockups=[],requiredApplications}={}){
 need(source?.visual&&Array.isArray(source.images)&&Array.isArray(manuscript?.pageIntents)&&Array.isArray(imageRecords),'LOCAL_LAYOUT_SOURCE_REQUIRED');
 need(Array.isArray(requiredApplications),'LOCAL_LAYOUT_APPLICATION_REQUIREMENTS_REQUIRED');
 if(source.task?.requiredApplications!==undefined)need(JSON.stringify(source.task.requiredApplications)===JSON.stringify(requiredApplications),'LOCAL_LAYOUT_TASK_APPLICATIONS_CHANGED');
 const required=[...new Set([...source.obligations.filter(o=>o.kind==='image').map(o=>o.value.imageId),...manuscript.pageIntents.flatMap(p=>p.imageIds)])],assets={};
 const targets=(source.visual.payload?.directions??source.visual.directions).flatMap(d=>d.targets);
 for(const imageId of required){
  const expected=source.images.find(i=>i.imageId===imageId),matches=imageRecords.filter(i=>(i.imageId??i.id)===imageId),record=matches[0];
  need(expected&&matches.length===1&&record.sha256===expected.sha256&&typeof record.path==='string'&&record.path.startsWith('/'),'LOCAL_LAYOUT_IMAGE_IDENTITY_REQUIRED');
  const target=targets.find(t=>t.imageId===imageId);assets[imageId]={role:target?target.kind==='packaging'?'packaging':'art':'reference',file:record.path,source:{type:'managed-local-engineering-original',description:'Actual managed image identity; synthetic artwork where recorded. No commercial permission or real-world placement implied.'}};
 }
 for(const mockup of mockups){
  const target=targets.find(t=>t.imageId===mockup.targetImageId),asset=mockup.asset;
  need(target&&assets[mockup.targetImageId],'LOCAL_LAYOUT_MOCKUP_TARGET_REQUIRED');
  const purposes=target.kind==='packaging'?['packaging-flat-front','packaging-concept-board']:target.kind==='kv'?['phone','outdoor','elevator']:[];
  need(purposes.includes(mockup.purpose),'LOCAL_LAYOUT_MOCKUP_PURPOSE_UNSUPPORTED');
  need(asset&&typeof asset.id==='string'&&!assets[asset.id]&&typeof asset.path==='string'&&asset.path.startsWith('/')&&/^[a-f0-9]{64}$/.test(asset.sha256),'LOCAL_LAYOUT_MOCKUP_REQUIRED');
  need(mockup.aperture&&['x','y','w','h'].every(k=>Number.isFinite(mockup.aperture[k])&&mockup.aperture[k]>=0&&mockup.aperture[k]<=1)&&mockup.aperture.w>0&&mockup.aperture.h>0&&mockup.aperture.x+mockup.aperture.w<=1&&mockup.aperture.y+mockup.aperture.h<=1,'LOCAL_LAYOUT_MOCKUP_APERTURE_REQUIRED');
  need(!assets[mockup.targetImageId].application,'LOCAL_LAYOUT_DUPLICATE_APPLICATION');
  assets[asset.id]={role:'mockup',file:asset.path,purpose:mockup.purpose,aperture:clone(mockup.aperture),source:{type:'controlled-mockup',description:target.kind==='packaging'?'Controlled flat-front/concept-board engineering placement only; not bottle wrapping, curved projection, 3D render, physical prototype or manufacturing proof.':'Illustrative placement only; not a real purchased media placement.'}};
  assets[mockup.targetImageId].application={mockupId:asset.id,purpose:mockup.purpose,kind:'rectangular-aperture'};
 }
 for(const requirement of requiredApplications){
  need(requirement&&Object.keys(requirement).every(k=>['targetImageId','purpose'].includes(k))&&typeof requirement.targetImageId==='string'&&typeof requirement.purpose==='string','LOCAL_LAYOUT_APPLICATION_REQUIREMENT_INVALID');
  need(mockups.some(m=>m.targetImageId===requirement.targetImageId&&m.purpose===requirement.purpose),'LOCAL_LAYOUT_REQUIRED_APPLICATION_MISSING');
 }
 need(new Set(requiredApplications.map(r=>r.targetImageId)).size===requiredApplications.length,'LOCAL_LAYOUT_DUPLICATE_APPLICATION_REQUIREMENT');
 return {assets};
}
export function localLayoutConfiguration({packetVersion='content-packet-v3',source,renderer,resources,execution}={}){
 const contract=contentContractForPacket(packetVersion,source);need(contract,'LOCAL_LAYOUT_CONTENT_CONTRACT_REQUIRED');
 need(renderer?.identity==='semantic-layout-v3-frozen-source'&&/^[a-f0-9]{64}$/.test(renderer.closureHash)&&Array.isArray(resources)&&resources.filter(r=>r.kind==='brand').length===1&&resources.filter(r=>r.kind==='assets').length===1,'LOCAL_LAYOUT_RESOURCES_REQUIRED');
 const layoutConfiguration={version:'project-layout-boundary-v1',semanticVersion:contract.semantic,renderer:clone(renderer),resources:clone(resources),...(execution?{execution:clone(execution)}:{})};
 validateLayoutConfiguration(layoutConfiguration);return {layoutConfiguration};
}
export function createLocalLayoutDriver({projectStore,executor,configuration,nativeExecutionAllowed=false}={}){
 const idOf=ctx=>ctx.case?.projectId??ctx.project.id;
 async function inspect(ctx){try{
  need(configuration?.layoutConfiguration,'LOCAL_LAYOUT_CONFIGURATION_REQUIRED');
  const p=projectStore.read(idOf(ctx)),content=p.artifacts.find(a=>a.id===p.activeByStage.content_review);need(content?.completeContent,'LOCAL_LAYOUT_CONTENT_REQUIRED');
  const draft=await executor.contentDraft(p.id);need(draft.artifactId===content.id,'LOCAL_LAYOUT_CURRENT_CONTENT_REQUIRED');
  need(p.releases.some(r=>r.artifactId===content.id&&r.policyVersion===p.policies.at(-1).version),'LOCAL_LAYOUT_CONTENT_RELEASE_REQUIRED');
  const status=await executor.layoutStatus(p.id);
  if(status.status==='technical_complete'){
   const root=layoutRoot(p,p.jobs.find(j=>j.id===status.rootJobId)),tuple=layoutTuple(p,root),artifact=p.artifacts.find(a=>a.stage==='layout'&&a.layoutTechnical?.rootJobId===root.id);
   if(!artifact)return {status:'pending',nextOperation:'advance',...marked};
   need(root.task.binding.contentArtifactId===content.id&&artifact.provenance==='native-layout-technical-only'&&artifact.layoutTechnical.bindingHash===root.task.bindingHash&&artifact.layoutTechnical.finalAuthorityAvailable===false,'LOCAL_LAYOUT_NATIVE_AUTHORITY_REQUIRED');
   need(status.editions.length===3&&tuple.every((j,i)=>j?.status==='succeeded'&&j.task.style===LAYOUT_STYLES[i]&&j.receipt?.bindingHash===root.task.bindingHash&&status.editions.some(e=>e.jobId===j.id&&e.verified)),'LOCAL_LAYOUT_NATIVE_EDITIONS_REQUIRED');
   need(artifact.contentHash===layoutHash(tuple.map(j=>j.receipt)),'LOCAL_LAYOUT_NATIVE_RECEIPTS_CHANGED');
   return {status:'complete',deliveryReady:true,technicalOnly:true,artifactId:artifact.id,resultIds:[artifact.id],rootJobId:root.id,bindingHash:root.task.bindingHash,jobIds:tuple.map(j=>j.id),editions:clone(status.editions),...marked};
  }
  if(['awaiting_reconciliation','running'].includes(status.status))return {status:status.status==='running'?'running':'awaiting_reconciliation',reason:status.reason,...marked};
  if(['blocked','stale','prepared_unavailable'].includes(status.status))return {status:'blocked',reason:status.reason??status.status,...marked};
  need(configuration.layoutConfiguration.execution,'LOCAL_LAYOUT_NATIVE_CONFIGURATION_REQUIRED');
  need(nativeExecutionAllowed===true,'LOCAL_LAYOUT_NATIVE_EXECUTION_NOT_AUTHORIZED');
  return {status:'pending',nextOperation:status.status==='not_requested'?'request':'advance',...marked};
 }catch(e){return {status:'blocked',reason:e.code??'LOCAL_LAYOUT_INSPECTION_FAILED',...marked};}}
 async function advance(ctx){const state=await inspect(ctx);if(state.status!=='pending')return state;const id=idOf(ctx),p=projectStore.read(id),result=state.nextOperation==='request'?await executor.continueLayout(id,{commandId:'local-layout-'+hash([id,p.activeByStage.content_review]),expectedRevision:p.revision}):await executor.advanceLayout(id);if(result.queuedJobIds?.length){need(nativeExecutionAllowed===true,'LOCAL_LAYOUT_NATIVE_EXECUTION_NOT_AUTHORIZED');await executor.execute(id,result.queuedJobIds[0]);}return inspect(ctx);}
 return {inspect,advance};
}
