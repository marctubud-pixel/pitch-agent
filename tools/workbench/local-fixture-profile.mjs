import {isDeepStrictEqual as equal} from 'node:util';
import {createLocalCaseStrategyHandler,isAcceptedLocalCaseTask} from './local-case-strategy-fixture-v1.mjs';
import {localContentResponse} from './local-grouped-content-fixture.mjs';
import {localFinalVisualResponse} from './local-scoped-visual-fixture.mjs';
import {CONTENT_PURPOSES} from './complete-content.mjs';

export const CASE_FIXTURE_PROFILE='case-aware-grouped-v1';
const need=(ok,code)=>{if(!ok)throw Object.assign(Error(code),{code});};
const strategyReviewPurposes=new Set(['verification','creative_review','feedback_review','owner_acceptance','handoff','readiness','coverage_challenge']);
const visualPhases={final_visual_plan:['planner'],final_visual_review:['score','blind','challenge','director'],final_visual_aggregate:['aggregate'],final_visual_revision:['revision']};
const strategyHandlers={m6:createLocalCaseStrategyHandler('m6'),dexian:createLocalCaseStrategyHandler('dexian')};

export function resolveLocalFixtureProfile({fixtureProfile,caseIdForProject,legacyHandlers=[]}={}){
 need(Array.isArray(legacyHandlers)&&legacyHandlers.every(handler=>typeof handler==='function'),'LOCAL_CASE_PROFILE_HANDLERS_INVALID');
 if(fixtureProfile===undefined)return {protocol:'local-fixture-profile-v1',fixtureProfile:null,handlers:legacyHandlers};
 need(fixtureProfile===CASE_FIXTURE_PROFILE,'LOCAL_CASE_PROFILE_UNKNOWN');
 need(typeof caseIdForProject==='function','LOCAL_CASE_PROFILE_BINDING_REQUIRED');
 function confirmedCase(ctx,task){
  need(typeof ctx.project?.id==='string'&&ctx.project.id.length>0,'LOCAL_CASE_PROFILE_PROJECT_REQUIRED');
  const caseId=caseIdForProject(ctx.project.id);
  need(typeof caseId==='string'&&Object.hasOwn(strategyHandlers,caseId),'LOCAL_CASE_PROFILE_CASE_REQUIRED');
  const card=ctx.project.taskCards?.find(card=>card.id===ctx.project.activeTaskCardId);
  need(card&&ctx.project.confirmations?.some(c=>c.taskCardId===card.id),'LOCAL_CASE_PROFILE_CONFIRMATION_REQUIRED');
  need(isAcceptedLocalCaseTask(caseId,card),'LOCAL_CASE_PROFILE_UNCOVERED');
  need(equal(task,card),'LOCAL_CASE_PROFILE_TASK_CHANGED');
  return caseId;
 }
 function response(ctx){
  const {job,packet}=ctx;
  if(job.stage==='strategy'&&(job.task?.revisionInput||job.task?.correctionInput||job.purpose==='correction_review')||job.purpose==='correction_review'&&job.task?.correctionReviewInput?.correctionInput?.baseContent?.outputKind==='strategy')need(false,'LOCAL_CASE_PROFILE_STRATEGY_REVISION_UNSUPPORTED');
  if(job.stage==='strategy'&&(!job.purpose||job.purpose==='stage')){
   const caseId=confirmedCase(ctx,packet?.strategyBasis?.taskCard);
   const raw=strategyHandlers[caseId](ctx);need(raw!==undefined,'LOCAL_CASE_PROFILE_UNCOVERED');return raw;
  }
  if(job.purpose?.startsWith('final_visual_')){
   const source=packet?.production?.source;
   const caseId=confirmedCase(ctx,source?.task??packet?.neutral?.task);
   need(job.purpose!=='final_visual_image','LOCAL_CASE_PROFILE_IMAGE_PROVIDER_REQUIRED');
   need(Object.hasOwn(visualPhases,job.purpose)&&visualPhases[job.purpose].includes(packet?.phase),'LOCAL_CASE_PROFILE_UNCOVERED');
   if(source){need(source.projectId===ctx.project.id,'LOCAL_CASE_PROFILE_SOURCE_PROJECT_CHANGED');need(source.confirmations?.some(c=>c.taskCardId===source.task.id),'LOCAL_CASE_PROFILE_CONFIRMATION_REQUIRED');}
   const raw=localFinalVisualResponse({...ctx,case:{caseId,projectId:ctx.project.id}});
   need(raw!==undefined,'LOCAL_CASE_PROFILE_UNCOVERED');return raw;
  }
  if(CONTENT_PURPOSES.includes(job.purpose)){
   confirmedCase(ctx,packet?.neutral?.task);
   const raw=localContentResponse(ctx);need(raw!==undefined,'LOCAL_CASE_PROFILE_UNCOVERED');return raw;
  }
  need(job.stage!=='strategy'||strategyReviewPurposes.has(job.purpose),'LOCAL_CASE_PROFILE_UNCOVERED');
  need(!job.purpose?.startsWith('complete_content_'),'LOCAL_CASE_PROFILE_UNCOVERED');
  return undefined;
 }
 return {protocol:'local-fixture-profile-v1',fixtureProfile:CASE_FIXTURE_PROFILE,handlers:[response,...legacyHandlers]};
}
