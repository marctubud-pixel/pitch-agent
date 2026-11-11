import {planCopyDirectionTarget} from './copy-direction-target.mjs';
import {createHash} from 'node:crypto';
import {applyCommand} from './project.mjs';
const sha=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const need=(v,code,status=422)=>{if(!v)throw Object.assign(Error(code),{code,status});};
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k));
const text=(v,max=20000)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const stages={strategy_opinion:'strategy',copy_theme:'copy',reference_image:'references'};
const validationActor={actorType:'human',actorId:'local-contribution-plan-validation-only',runId:'plan-validation',contextId:'plan-validation'};
// This returns a native command proposal only. Only the admitted human decision executor may execute it.
export function buildLocalContributionPlan({project,request,currentModule,currentBasisHash,artifactContentText}={}){
 need(exact(request,['commandId','module','decision','expectedBasisHash','comment','contribution']),'LOCAL_CONTRIBUTION_REQUEST_INVALID');
 need(text(request.commandId,100)&&request.decision==='revise'&&typeof(request.comment??'')==='string'&&(request.comment??'').length<=10000,'LOCAL_CONTRIBUTION_REVISION_REQUIRED');
 need(digest(currentBasisHash)&&digest(request.expectedBasisHash),'LOCAL_CONTRIBUTION_BASIS_REQUIRED');
 need(currentBasisHash===request.expectedBasisHash,'LOCAL_CONTRIBUTION_STALE',409);
 const c=request.contribution;
 need(c&&Object.hasOwn(stages,c.kind)&&request.module===stages[c.kind]&&currentModule===request.module,'LOCAL_CONTRIBUTION_MODULE_INVALID');
 need(project&&typeof project.id==='string'&&Number.isSafeInteger(project.revision)&&project.policies?.length&&project.activeTaskCardId,'LOCAL_CONTRIBUTION_PROJECT_REQUIRED');
 const stage=c.kind==='reference_image'?'copy':request.module,artifact=project.artifacts?.find(a=>a.id===project.activeByStage[stage]);
 need(artifact?.stage===stage&&digest(artifact.contentHash),'LOCAL_CONTRIBUTION_TARGET_REQUIRED');
 const cards=project.taskCards?.filter(t=>t.id===project.activeTaskCardId);need(cards?.length===1,'LOCAL_CONTRIBUTION_TASK_REQUIRED');
 const sourcePins={projectId:project.id,projectRevision:project.revision,artifactId:artifact.id,artifactHash:artifact.contentHash,taskCardId:project.activeTaskCardId,taskCardHash:sha(cards[0]),policy:structuredClone(project.policies.at(-1)),basisHash:currentBasisHash};
 let proposal,input,image=null,copyTarget=null;
 const id='local-contribution-'+sha([project.id,request.commandId,request.module,c]);
 if(c.kind==='strategy_opinion'){
  need(exact(c,['kind','instructions'])&&text(c.instructions),'LOCAL_CONTRIBUTION_INPUT_INVALID');
  input={instructions:c.instructions,themes:[],materials:[]};
 }else if(c.kind==='copy_theme'){
  need(exact(c,['kind','text','intendedUse','directionId'])&&text(c.text)&&text(c.intendedUse),'LOCAL_CONTRIBUTION_INPUT_INVALID');
  input={instructions:'',themes:[{text:c.text,intendedUse:c.intendedUse}],materials:[]};
  if(Object.hasOwn(c,'directionId')){copyTarget=planCopyDirectionTarget({artifact,contentText:artifactContentText,contribution:c});const {themeText,intendedUse,origin,requiresIndependentReview,factualAuthority,semanticReviewVerified,...pointer}=copyTarget;input.instructions=JSON.stringify({protocol:'local-copy-feedback-target-v1',target:pointer});}
 }else{
  need(exact(c,['kind','imageId','directionId','borrowingNote','referenceKind','applicabilityProfile'])&&text(c.imageId,100)&&text(c.directionId,100)&&text(c.borrowingNote,10000),'LOCAL_CONTRIBUTION_INPUT_INVALID');
  const images=project.imageAssets.filter(a=>a.id===c.imageId);image=images[0];
  need(images.length===1&&image.projectId===project.id&&digest(image.sha256),'LOCAL_CONTRIBUTION_IMAGE_REQUIRED');
  need(typeof artifactContentText==='string'&&Buffer.byteLength(artifactContentText)<=1024*1024&&sha(artifactContentText)===artifact.contentHash,'LOCAL_CONTRIBUTION_COPY_BYTES_REQUIRED');
  const nativeRequest={artifactId:artifact.id,directionId:c.directionId,imageId:image.id,kind:c.referenceKind,applicabilityProfile:c.applicabilityProfile,borrowingNote:c.borrowingNote,commandId:id,expectedRevision:project.revision};
  proposal={kind:'record-reference-material',request:nativeRequest,copyContents:artifactContentText,commandId:id,expectedRevision:project.revision};
 }
 if(input)proposal={kind:'submit-feedback',artifactId:artifact.id,feedbackId:id,...input,commandId:id,expectedRevision:project.revision};
 // Native pure reducer is the single field/currentness/limits authority; returned validation state is discarded.
 applyCommand(structuredClone(project),structuredClone(proposal),validationActor);
 return {protocol:'local-human-contribution-plan-v1',planOnly:true,sourcePins,...(copyTarget?{copyTarget,sourceCopyText:artifactContentText}:{}),...(image?{imagePin:{imageId:image.id,projectId:image.projectId,sha256:image.sha256,byteLength:image.byteLength,mediaType:image.mediaType,width:image.width,height:image.height}}:{}),proposal,contribution:structuredClone(c),origin:'human-preference-not-evidence',claimsUnverified:true,factualAuthority:false,semanticReviewVerified:false,disposition:'pending_review',requires:['durable-admitted-human-decision','native-revision-or-reference-cycle','independent-feedback-or-reference-review','current-source-recheck']};
}
