import {isDeepStrictEqual as equal} from 'node:util';
import {planCopyDirectionTarget,verifyCopyDirectionRewrite} from './copy-direction-target.mjs';
import {contributionInput,soleTypedHumanFinding,authoredContributionContent} from './local-contribution-protocol.mjs';
const limitation='Local synthetic exact-theme and source-scope checks only; not independent model, semantic, aesthetic, consumer or brand approval.';
const need=(v,code)=>{if(!v)throw Object.assign(Error(code),{code});};
function context(input){
 need(input.feedback?.length===1,'LOCAL_COPY_MULTIPLE_FEEDBACK_UNSUPPORTED');
 const feedback=input.feedback[0];need(feedback.themes?.length===1&&!feedback.materials?.length,'LOCAL_COPY_TARGETED_THEME_REQUIRED');
 let frame;try{frame=JSON.parse(feedback.instructions);}catch{need(false,'LOCAL_COPY_TARGET_SELECTION_REQUIRED');}
 need(frame?.protocol==='local-copy-feedback-target-v1'&&Object.keys(frame).sort().join(',')==='protocol,target','LOCAL_COPY_TARGET_SELECTION_REQUIRED');
 const artifact={id:input.revisionOf.artifactId,stage:'copy',contentHash:input.revisionOf.contentHash},contentText=JSON.stringify(input.baseContent,null,2),contribution={kind:'copy_theme',directionId:frame.target?.directionId,text:feedback.themes[0].text,intendedUse:feedback.themes[0].intendedUse},target=planCopyDirectionTarget({artifact,contentText,contribution});
 const {themeText,intendedUse,origin,requiresIndependentReview,factualAuthority,semanticReviewVerified,...pointer}=target;
 need(equal(pointer,frame.target),'LOCAL_COPY_TARGET_CHANGED');return {artifact,contentText,contribution,target,feedback,index:input.baseContent.directions.findIndex(d=>d.id===target.directionId)};
}
export function targetedCopyResponse({job,outputSchema}){
 if(job.binding?.providerId!=='local-synthetic'||job.binding.model!=='synthetic')throw Object.assign(Error('LOCAL_COPY_SYNTHETIC_BINDING_REQUIRED'),{code:'LOCAL_COPY_SYNTHETIC_BINDING_REQUIRED'});
 if(['feedback_review','correction_review'].includes(job.purpose)){
  const typed=job.purpose==='correction_review',input=typed?job.task.correctionReviewInput:job.task.feedbackReviewInput;
  const protocol=contributionInput(typed?{correctionInput:input.correctionInput}:{revisionInput:input.revisionInput}),finding=typed?soleTypedHumanFinding(protocol):null,source=context({...protocol.input,feedback:protocol.feedback});let addressed=true,category='creative_preference',reason=limitation;
  try{verifyCopyDirectionRewrite({...source,revisedContent:input.content});}
  catch(error){addressed=false;reason=error.code+'; '+limitation;if(!equal(input.content.claims,protocol.input.baseContent.claims)||!equal(input.content.gaps,protocol.input.baseContent.gaps))category='factual_risk';}
  const actual=input.content.directions?.[source.index]?.slogan,refs=typeof actual==='string'&&actual.length?[{location:'/directions/'+source.index+'/slogan',quote:actual}]:[];
  if(typed)return {protocolVersion:input.reviewProtocolVersion,artifactId:input.artifactId,contentHash:input.contentHash,sourceSetHash:protocol.input.sourceSetHash,contextHash:input.context.contextHash,preservationCheck:{status:'complete',constraintManifestHash:protocol.input.constraintManifestHash,violations:[]},findings:[{findingKey:finding.key,status:addressed?'addressed':'unresolved',category,reason,refs}],limitations:[limitation]};
  return {protocolVersion:'human-feedback-v1',artifactId:input.artifactId,contentHash:input.contentHash,feedbackHash:input.revisionInput.feedbackHash,findings:[{feedbackId:source.feedback.id,status:addressed?'addressed':'unresolved',category,reason,refs}],limitations:[limitation]};
 }
 need(job.stage==='copy'&&(job.task?.revisionInput||job.task?.correctionInput),'LOCAL_COPY_REVISION_REQUIRED');
 const protocol=contributionInput(job.task),finding=protocol.kind==='typed'?soleTypedHumanFinding(protocol):null,source=context({...protocol.input,feedback:protocol.feedback}),output=structuredClone(protocol.input.baseContent),direction=output.directions[source.index];
 direction.title=source.target.themeText;direction.slogan=source.target.themeText;
 direction.creativeExplanation='以用户指定主题“'+source.target.themeText+'”引导当前方向的画面表达。使用意图：'+source.target.intendedUse+'。这是本地工程修订，不表示主题已获品牌或用户认可。';
 verifyCopyDirectionRewrite({...source,revisedContent:output});
 output[protocol.responseField]=[{...(finding?{findingKey:finding.key}:{feedbackId:source.feedback.id}),action:'applied',explanation:limitation,outputLocations:[{location:'/directions/'+source.index+'/slogan',quote:source.target.themeText}]}];return authoredContributionContent(output,outputSchema);
}
