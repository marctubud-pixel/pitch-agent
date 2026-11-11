import {buildLocalContributionPlan} from './local-contribution-plan.mjs';
import {isReferenceInputCheckpoint} from './local-reference-input.mjs';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual as equal} from 'node:util';
import {applyCommand} from './project.mjs';
export const decisionHash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const need=(v,code)=>{if(!v)throw Object.assign(Error(code),{code,status:409});};
export function admittedDecisionPlan({project,state,request,actor,hasExternalEffect,contributionPlan}){
 const before={revision:project.revision,snapshotHash:decisionHash(project),taskCardId:project.activeTaskCardId,policy:structuredClone(project.policies.at(-1)),activeByStage:structuredClone(project.activeByStage)};
 const step=contributionPlan?{kind:'native_command',command:structuredClone(contributionPlan.proposal)}:request.module==='brief'&&request.decision==='approve'?{kind:'native_command',command:{kind:'confirm-task-card',taskCardId:project.activeTaskCardId,commandId:request.commandId,expectedRevision:project.revision}}:!hasExternalEffect&&request.decision==='approve'&&(state.nextAction.underlyingStatus==='complete'||isReferenceInputCheckpoint(state.nextAction))&&request.contribution===undefined?{kind:'selected_checkpoint_no_effect'}:{kind:'unadapted_external_effect'};
 return {protocol:'local-decision-intent-v1',projectId:project.id,request:structuredClone(request),requestHash:decisionHash(request),basisHash:state.nextAction.evidenceHash,before,actor:structuredClone(actor),steps:[step],...(contributionPlan?{contributionPlan:structuredClone(contributionPlan),continuation:{protocol:'local-contribution-continuation-v1',status:'pending_revision',factualAuthority:false,semanticReviewVerified:false,steps:[{kind:'enqueue_revision',request:{artifactId:contributionPlan.sourcePins.artifactId,commandId:contributionPlan.proposal.commandId+'-revision',expectedRevision:project.revision+1}},{kind:'execute_native_revision',status:'not_started'},{kind:'independent_feedback_review',status:'not_started'}]}}:{})};
}
export function proveDecisionPlan(intent,store){
 need(intent?.protocol==='local-decision-intent-v1'&&intent.steps?.length===1,'ACCEPTANCE_DECISION_PLAN_UNSUPPORTED');
 const before=store.read(intent.projectId,intent.before.revision),current=store.read(intent.projectId),step=intent.steps[0];
 need(decisionHash(before)===intent.before.snapshotHash&&before.activeTaskCardId===intent.before.taskCardId&&equal(before.policies.at(-1),intent.before.policy)&&equal(before.activeByStage,intent.before.activeByStage),'ACCEPTANCE_DECISION_HISTORY_CHANGED');
 if(step.kind==='selected_checkpoint_no_effect'){need(decisionHash(current)===intent.before.snapshotHash,'ACCEPTANCE_DECISION_SOURCE_CHANGED');return {status:'no_effect',revision:current.revision};}
 need(step.kind==='native_command'&&step.command.expectedRevision===intent.before.revision,'ACCEPTANCE_DECISION_PLAN_UNSUPPORTED');
 if(intent.contributionPlan){
  const exact=buildLocalContributionPlan({project:before,request:intent.request,currentModule:intent.request.module,currentBasisHash:intent.basisHash,artifactContentText:intent.contributionPlan.sourceCopyText});
  need(['strategy_opinion','copy_theme'].includes(exact.contribution.kind)&&equal(exact,intent.contributionPlan)&&equal(step.command,exact.proposal),'ACCEPTANCE_CONTRIBUTION_PLAN_CHANGED');
 }else need(step.command.kind==='confirm-task-card'&&step.command.commandId===intent.request.commandId&&step.command.taskCardId===intent.before.taskCardId,'ACCEPTANCE_DECISION_PLAN_UNSUPPORTED');
 if(!Object.hasOwn(current.processedCommands,step.command.commandId)){need(decisionHash(current)===intent.before.snapshotHash,'ACCEPTANCE_DECISION_SOURCE_CHANGED');return {status:'not_started',revision:current.revision};}
 const expected=applyCommand(before,step.command,intent.actor),after=store.read(intent.projectId,before.revision+1);
 need(equal(after,expected)&&equal(current,after)&&after.audit.at(-1)?.commandId===step.command.commandId&&after.audit.at(-1)?.actorId===intent.actor.actorId&&after.processedCommands[step.command.commandId]===JSON.stringify(Object.fromEntries(Object.entries(step.command).filter(([k])=>k!=='expectedRevision'))),'ACCEPTANCE_DECISION_EFFECT_NOT_PROVEN');
 return {status:'committed',revision:after.revision};
}
export function validateLocalDecisionRequest(request,state,{hasDriver=false,hasEngineeringPanel=false}={}){
 const reject=(ok,code)=>{if(!ok)throw Object.assign(Error(code),{code,status:422});};
 reject(Object.keys(request).every(k=>['commandId','module','decision','expectedBasisHash','comment','contribution'].includes(k)),'ACCEPTANCE_DECISION_FIELDS_UNSUPPORTED');
 const next=state.nextAction;
 if(isReferenceInputCheckpoint(next)&&request.module==='references'){
  reject(request.decision==='approve'&&request.contribution===undefined,'ACCEPTANCE_REFERENCE_INPUT_DECISION_UNSUPPORTED');return {kind:'selected_checkpoint_no_effect'};
 }
 if(request.decision==='revise'&&request.contribution!==undefined){
  reject(['strategy','copy'].includes(request.module)&&request.module===next.module&&['awaiting_user','blocked'].includes(next.status),'ACCEPTANCE_CONTRIBUTION_PHASE_UNSUPPORTED');
  reject(request.contribution?.kind===(request.module==='strategy'?'strategy_opinion':'copy_theme'),'ACCEPTANCE_CONTRIBUTION_KIND_UNSUPPORTED');
  return {kind:'native_command',contribution:true};
 }
 reject(next.underlyingStatus==='complete'||request.module==='brief'&&next.status==='awaiting_user'||request.module==='final_review'&&hasEngineeringPanel&&next.status==='awaiting_user'&&next.reason==='LOCAL_ENGINEERING_HUMAN_GATE'||hasDriver&&['references','sketch','visual','content'].includes(request.module)&&next.status==='awaiting_user'&&(request.module!=='visual'||next.reason==='HUMAN_GATE'),'ACCEPTANCE_DECISION_HANDLER_REQUIRED');
 reject(request.decision==='approve','ACCEPTANCE_DECISION_ACTION_UNSUPPORTED');
 reject(request.contribution===undefined,'ACCEPTANCE_DECISION_CONTRIBUTION_ADAPTER_REQUIRED');
 if(next.underlyingStatus==='complete')return {kind:'selected_checkpoint_no_effect'};
 if(request.module==='brief'&&next.status==='awaiting_user')return {kind:'native_command'};
 if(request.module==='final_review'&&hasEngineeringPanel&&next.status==='awaiting_user'&&next.reason==='LOCAL_ENGINEERING_HUMAN_GATE')return {kind:'unadapted_external_effect'};
 return {kind:'unadapted_external_effect'};
}
