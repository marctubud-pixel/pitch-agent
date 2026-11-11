import {targetedCopyResponse} from './copy-target-response.mjs';
import {syntheticStrategyV2} from './strategy-fixtures.mjs';
import {contributionInput,soleTypedHumanFinding,authoredContributionContent} from './local-contribution-protocol.mjs';
import {isDeepStrictEqual as equal} from 'node:util';
export const localContributionBindings={feedback_review:{providerId:'local-synthetic',model:'synthetic',role:'local-contribution-feedback-reviewer'}};
const textFor=feedback=>feedback.instructions.trim()||feedback.themes.map(t=>t.text).join(' / ');
function typedStrategy(job,outputSchema){
 const review=job.purpose==='correction_review',data=review?job.task.correctionReviewInput:null,protocol=contributionInput(review?{correctionInput:data.correctionInput}:job.task),finding=soleTypedHumanFinding(protocol),instruction=textFor(protocol.feedback[0]);
 const limitation='Local synthetic literal strategy feedback and preservation comparison only; not independent semantic, factual, creative or customer approval.';
 if(review){
  const {summary,...rest}=data.content,{summary:oldSummary,...before}=protocol.input.baseContent,preserved=equal(rest,before),addressed=preserved&&typeof summary==='string'&&summary.includes(instruction);
  return {protocolVersion:data.reviewProtocolVersion,artifactId:data.artifactId,contentHash:data.contentHash,sourceSetHash:protocol.input.sourceSetHash,contextHash:data.context.contextHash,preservationCheck:{status:'complete',constraintManifestHash:protocol.input.constraintManifestHash,violations:[]},findings:[{findingKey:finding.key,status:addressed?'addressed':'unresolved',category:preserved?'creative_preference':'factual_risk',reason:limitation,refs:typeof summary==='string'&&summary.length?[{location:'/summary',quote:summary}]:[]}],limitations:[limitation]};
 }
 const output=structuredClone(protocol.input.baseContent);output.summary='Local synthetic strategy revision. '+instruction;
 output.revisionResponses=[{findingKey:finding.key,action:'applied',explanation:limitation,outputLocations:[{location:'/summary',quote:instruction}]}];return authoredContributionContent(output,outputSchema);
}
export function localContributionResponse({job,packet,request}){
 const copyRevision=job.stage==='copy'&&(job.task?.revisionInput||job.task?.correctionInput),copyReview=job.purpose==='correction_review'&&job.task.correctionReviewInput?.correctionInput?.baseContent?.outputKind==='copy';
 const strategyTyped=job.stage==='strategy'&&job.task?.correctionInput||job.purpose==='correction_review'&&job.task.correctionReviewInput?.correctionInput?.baseContent?.outputKind==='strategy';
 if(!job.task?.revisionInput&&job.purpose!=='feedback_review'&&!copyRevision&&!copyReview&&!strategyTyped)return undefined;
 if(job.binding?.providerId!=='local-synthetic'||job.binding.model!=='synthetic')throw Object.assign(Error('LOCAL_CONTRIBUTION_SYNTHETIC_BINDING_REQUIRED'),{code:'LOCAL_CONTRIBUTION_SYNTHETIC_BINDING_REQUIRED'});
 if(copyRevision||copyReview||job.purpose==='feedback_review'&&job.task.feedbackReviewInput?.revisionInput?.baseContent?.outputKind==='copy')return targetedCopyResponse({job,outputSchema:request?.outputSchema});
 if(strategyTyped)return typedStrategy(job,request?.outputSchema);
 if(job.purpose==='feedback_review'){
  const input=job.task.feedbackReviewInput,base=input.revisionInput.baseContent,summary=input.content.summary??'',risk=(input.content.claims??[]).some(c=>c.kind!=='creative'&&!(base.claims??[]).some(b=>JSON.stringify(b)===JSON.stringify(c)));
  return {protocolVersion:'human-feedback-v1',artifactId:input.artifactId,contentHash:input.contentHash,feedbackHash:input.revisionInput.feedbackHash,findings:input.revisionInput.feedback.map(f=>({feedbackId:f.id,status:!risk&&summary.includes(textFor(f))?'addressed':'unresolved',category:risk?'factual_risk':'creative_preference',reason:'Synthetic mechanical comparison of exact requested text and newly asserted noncreative claims only. Not real semantic or aesthetic validation.',refs:summary?[{location:'/summary',quote:summary}]:[]})),limitations:['Local engineering response only; actual independent semantic quality, consumer effect, aesthetic approval and release remain unverified.']};
 }
 if(job.stage!=='strategy')throw Object.assign(Error('LOCAL_CONTRIBUTION_STAGE_UNSUPPORTED'),{code:'LOCAL_CONTRIBUTION_STAGE_UNSUPPORTED'});
 const output=syntheticStrategyV2(packet),summary='Local synthetic revision. '+job.task.revisionInput.feedback.map(textFor).join(' / ');output.summary=summary;
 output.feedbackResponses=job.task.revisionInput.feedback.map(f=>({feedbackId:f.id,action:'applied',explanation:'Synthetic literal-text handling only, not strategic merit or factual validation.',outputLocations:[{location:'/summary',quote:textFor(f)}]}));return output;
}
