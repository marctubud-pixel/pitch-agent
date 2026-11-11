import {referenceEditAccess} from './reference-edit-access.mjs';
import {createHash} from 'node:crypto';
import {copyDirectionOptions} from './copy-direction-target.mjs';
import {isReferenceInputCheckpoint,referenceInputCheckpoint} from './local-reference-input.mjs';
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const text=value=>typeof value==='string'?value:null;
function sourceFor(project,artifactId){return project.artifacts.find(a=>a.id===artifactId&&a.stage==='copy');}
function materialView(m){return {id:m.id,artifactId:m.artifactId,copyContentHash:m.copyContentHash,directionId:m.directionId,imageId:m.image?.imageId,imageSha256:m.image?.sha256,kind:m.kind,applicabilityProfile:m.applicabilityProfile,borrowingNote:text(m.borrowingNote),provenance:structuredClone(m.provenance),removed:Boolean(m.removed),removedReason:text(m.removed?.reason),removedBy:text(m.removed?.context?.actorId),registrationStatus:m.removed?'removed':'registered_unassessed',factualAuthority:false,referenceAdoptionVerified:false};}
function inputProjection(project,artifact,copyContentText,expectedBasisHash){
 const options=copyDirectionOptions({artifact,contentText:copyContentText}),materials=(project.referenceMaterials??[]).filter(m=>m.artifactId===artifact.id&&m.provenance?.kind==='manual_supplied').map(materialView);
 const capacity=options.directions.map(d=>{
  const rows=(project.referenceMaterials??[]).filter(m=>!m.removed&&m.artifactId===artifact.id&&m.directionId===d.id);
  const distinctImages=new Set(rows.map(m=>m.image.sha256)).size;
  return {directionId:d.id,registeredDistinctImages:distinctImages,nativeMaximumDistinctImages:3,auditedLegacyFixedLibrarySlots:2,fixedLibrarySlotPlanVerified:false,remainingImportsRange:{minimum:0,maximum:2},prospectiveDistinctRange:{minimum:distinctImages,maximum:distinctImages+2},potentialFixedLibraryCapacityConflict:distinctImages+2>3,diagnosticOnly:true};
 });
 return {kind:'reference_input',projectRevision:project.revision,expectedBasisHash:expectedBasisHash,artifactId:artifact.id,copyContentHash:artifact.contentHash,directions:options.directions,materials,registeredOriginals:(project.imageAssets??[]).filter(a=>['supplied_image','screenshot'].includes(a.provenance?.representation)).map(a=>({imageId:a.id,sha256:a.sha256,mediaType:a.mediaType,byteLength:a.byteLength,width:a.width,height:a.height,originalFilename:text(a.provenance.originalFilename),origin:'registered_original_not_evidence'})),capacity,readOnly:true,factualAuthority:false,referenceAdoptionVerified:false};
}
export function referenceInputView(project,nextAction,copyContentText){
 if(!isReferenceInputCheckpoint(nextAction))return null;
 const checkpoint=nextAction.inputCheckpoint,artifact=sourceFor(project,checkpoint.copyArtifactId);
 if(!artifact||project.id!==checkpoint.projectId||project.activeByStage.copy!==artifact.id||artifact.contentHash!==checkpoint.copyContentHash)throw Object.assign(Error('LOCAL_REFERENCE_VIEW_SOURCE_CHANGED'),{code:'LOCAL_REFERENCE_VIEW_SOURCE_CHANGED'});
 const fresh=referenceInputCheckpoint(project,{mode:'assisted',checkpoints:['references'],decisions:[]},{status:'pending'});if(!fresh||fresh.basisHash!==nextAction.evidenceHash)throw Object.assign(Error('LOCAL_REFERENCE_VIEW_SOURCE_CHANGED'),{code:'LOCAL_REFERENCE_VIEW_SOURCE_CHANGED'});
 return inputProjection(project,artifact,copyContentText,nextAction.evidenceHash);
}
export function referenceCorrectionView(project,record,nextAction,states,copyContentText,recomputedPlan){
 const access=referenceEditAccess(project,record,nextAction,states,recomputedPlan);if(!access)return null;
 const artifact=sourceFor(project,access.artifactId);return {...inputProjection(project,artifact,copyContentText,nextAction.evidenceHash),kind:'reference_correction',correctionOnly:true,editAccess:access};
}
export function referenceReviewView(project,moduleResult){
 const artifactId=project.activeByStage.copy,materials=(project.referenceMaterials??[]).filter(m=>m.artifactId===artifactId).map(materialView),dossier=(project.referenceDossiers??[]).filter(d=>d.envelope?.source?.source?.artifactId===artifactId).at(-1);
 const base={protocol:'local-reference-review-view-v1',projectRevision:project.revision,artifactId:artifactId??null,materials,historicalMaterialCount:(project.referenceMaterials??[]).filter(m=>m.artifactId!==artifactId).length,dossierId:dossier?.id??null,originalsVerified:false,realQualityVerified:false,factualAuthority:false,referenceAdoptionVerified:false,collectorActions:[],leadActions:[],reports:[]};
 if(!dossier)return base;
 const verified=moduleResult?.status==='complete'&&moduleResult.dossierId===dossier.id&&moduleResult.deliveryReady===true&&moduleResult.syntheticOnly===true&&moduleResult.realQualityVerified===false;
 const reports=dossier.reports??[],uniqueIds=new Set(reports.map(r=>r.id)).size===reports.length;
 for(const report of reports){
  const jobs=project.jobs.filter(j=>j.dossierId===dossier.id&&j.outputVersionIds?.includes(report.id)),job=jobs.length===1?jobs[0]:null,attempt=job?.attempts?.at(-1),raw=report.rawReport??{};
  const linked=uniqueIds&&job?.purpose==='reference'&&job.nodeKey===report.nodeKey&&job.task?.id===job.id&&job.task?.dossierId===dossier.id&&job.task?.nodeKey===report.nodeKey&&job.task?.returnContract?.nodeKey===report.nodeKey&&typeof raw.protocolVersion==='string'&&job.task.returnContract.protocolVersion===raw.protocolVersion&&(!Object.hasOwn(raw,'nodeKey')||raw.nodeKey===report.nodeKey)&&job.status==='succeeded'&&attempt?.status==='succeeded'&&report.executionReceipt?.attemptId===attempt.id&&report.executionReceipt?.taskId===job.id&&typeof report.reportHash==='string'&&/^[a-f0-9]{64}$/.test(report.reportHash)&&attempt.receipt&&JSON.stringify(attempt.receipt)===JSON.stringify(report.executionReceipt);
  const origin={reportId:report.id,reportHash:report.reportHash??null,nodeKey:report.nodeKey,jobId:job?.id??null,attemptId:attempt?.id??null,providerId:job?.binding?.providerId??null,model:job?.binding?.model??null,originalsVerified:Boolean(verified&&linked&&!report.staleReason),staleReason:report.staleReason??null,recordOrigin:job?.binding?.providerId==='local-synthetic'&&job?.binding?.model==='synthetic'?'declared_local_synthetic_saved_report':'saved_report_not_real_quality_verification'};
  base.reports.push({...origin,rawRecordHash:digest(raw),kind:text(raw.kind),decision:text(raw.decision)});
  if(!linked)continue;
  for(const decision of raw.kind==='collector'&&Array.isArray(raw.materialDecisions)?raw.materialDecisions:[]){const material=materials.find(m=>m.id===decision.materialId);if(!material||!['adopt','return'].includes(decision.disposition))continue;base.collectorActions.push({materialId:material.id,directionId:material.directionId,disposition:decision.disposition==='adopt'?'purpose_in_candidate':'purpose_returned',nativeDisposition:decision.disposition,useIds:Array.isArray(decision.useIds)?decision.useIds.filter(id=>typeof id==='string'):[],reason:text(decision.reason),removed:material.removed,...origin});}
  for(const [field,disposition]of (raw.kind==='merge'?[['acceptedUseIds','use_in_candidate'],['returnedUseIds','use_returned']]:[]))for(const useId of Array.isArray(raw[field])?raw[field]:[]){if(typeof useId!=='string')continue;base.leadActions.push({useId,disposition,comparison:text(raw.mechanismComparison),individualReason:null,...origin});}
 }
 base.originalsVerified=Boolean(verified&&uniqueIds&&base.reports.length>0&&base.reports.every(r=>r.originalsVerified));return base;
}
