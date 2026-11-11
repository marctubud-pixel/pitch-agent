import {realpath} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {hostname} from 'node:os';
import {readManagedLayoutBytes} from './managed-layout-bytes.mjs';
import {FINAL_VISUAL_PURPOSES,finalPanelNodes} from './final-visual.mjs';
import {CONTENT_PURPOSES,contentNodes} from './complete-content.mjs';
import {SYNTHETIC_IMAGE_MODEL} from '../local-acceptance/synthetic-image-server.mjs';
const need=(value,code)=>{if(!value)throw Object.assign(Error(code),{code});};
export const recoveryHash=value=>createHash('sha256').update(JSON.stringify(value??null)).digest('hex');
const bytesHash=bytes=>createHash('sha256').update(bytes).digest('hex');
const frozenFields=['referenceDossiers','referenceMaterials','sketchGenerations','sketchReviewRuns','sketchReviews','imageAssets','imageAllowance','finalVisualAllowance','sketchReviewAllowance','policies','taskCards','humanFeedback','verifications','creativePanels','creativeReports','ownerReports','ownerEdges'];
const sorted=items=>[...items].sort((a,b)=>a.id.localeCompare(b.id));
export function finalRecoveryInventory(project){
 const finals=project.jobs.filter(job=>FINAL_VISUAL_PURPOSES.includes(job.purpose));
 need(finals.length===finalPanelNodes().length+5&&finals.filter(j=>j.purpose==='final_visual_image').length===3&&finals.filter(j=>j.purpose==='final_visual_plan').length===1&&finals.filter(j=>j.purpose==='final_visual_aggregate').length===1,'FINAL_RECOVERY_FINAL_SET_REQUIRED');
 need(new Set(finals.map(j=>j.finalVisualRunId)).size===1&&finals.every(j=>j.status==='succeeded'&&j.attempts?.length===1&&j.attempts[0].status==='succeeded'&&j.attempts[0].dispatchStarted===true&&j.attempts[0].receipt&&j.outputVersionIds?.length===1&&(j.purpose==='final_visual_image'?j.binding?.providerId==='local-synthetic-image'&&j.binding.model===SYNTHETIC_IMAGE_MODEL:j.binding?.providerId==='local-synthetic'&&j.binding.model==='synthetic')),'FINAL_RECOVERY_INCOMPLETE_OR_UNKNOWN_FINAL');
 need(finals.every(j=>j.purpose==='final_visual_image'?j.attempts[0].receipt.outcome==='output_received'&&j.attempts[0].receipt.responseEvidence:typeof j.attempts[0].receipt.responseText==='string'),'FINAL_RECOVERY_ORIGINAL_RECEIPT_REQUIRED');
 need(new Set(finals.flatMap(j=>j.attempts.map(a=>a.id))).size===finals.length,'FINAL_RECOVERY_ATTEMPT_REUSED');
 return {runId:finals[0].finalVisualRunId,jobsHash:recoveryHash(sorted(finals)),jobIds:finals.map(j=>j.id).sort(),modelCalls:finals.filter(j=>j.purpose!=='final_visual_image').length,imageCalls:3};
}
export function finalRecoveryBaseline(project){
 const inventory=finalRecoveryInventory(project);need(!project.jobs.some(j=>CONTENT_PURPOSES.includes(j.purpose)),'FINAL_RECOVERY_CONTENT_ALREADY_STARTED');
 const images=project.jobs.filter(j=>j.purpose==='image_candidate'||j.purpose==='final_visual_image');
 need(project.imageAllowance?.maxCalls===12&&images.length===12&&images.every(j=>j.status==='succeeded'&&j.allowanceFamilyId===project.imageAllowance.id&&j.attempts.length===1&&j.attempts[0].dispatchStarted&&j.attempts[0].allowanceFamilyId===project.imageAllowance.id),'FINAL_RECOVERY_IMAGE_FAMILY_CHANGED');
 return {projectId:project.id,headRevision:project.revision,headHash:recoveryHash(project),copyId:project.activeByStage.copy,sketchId:project.activeByStage.sketch,taskCardId:project.activeTaskCardId,decisionCount:project.decisions.length,decisionsHash:recoveryHash(project.decisions),jobIds:project.jobs.map(j=>j.id).sort(),jobsHash:recoveryHash(sorted(project.jobs)),artifactIds:project.artifacts.map(a=>a.id).sort(),artifactsHash:recoveryHash(sorted(project.artifacts)),finalRunsHash:recoveryHash(project.finalVisualRuns),fields:Object.fromEntries(frozenFields.map(key=>[key,recoveryHash(project[key])])),inventory};
}
export function assertFinalRecoveryPreserved(project,baseline){
 need(project.id===baseline.projectId&&project.activeByStage.copy===baseline.copyId&&project.activeByStage.sketch===baseline.sketchId&&project.activeTaskCardId===baseline.taskCardId&&project.decisions.length===baseline.decisionCount&&recoveryHash(project.decisions)===baseline.decisionsHash,'FINAL_RECOVERY_SOURCE_CHANGED');
 const jobs=project.jobs.filter(j=>baseline.jobIds.includes(j.id)),artifacts=project.artifacts.filter(a=>baseline.artifactIds.includes(a.id));
 need(jobs.length===baseline.jobIds.length&&recoveryHash(sorted(jobs))===baseline.jobsHash&&artifacts.length===baseline.artifactIds.length&&recoveryHash(sorted(artifacts))===baseline.artifactsHash&&recoveryHash(project.finalVisualRuns)===baseline.finalRunsHash,'FINAL_RECOVERY_PRIOR_ORIGINAL_CHANGED');
 need(Object.entries(baseline.fields).every(([key,hash])=>recoveryHash(project[key])===hash),'FINAL_RECOVERY_FROZEN_FIELD_CHANGED');
 const added=project.jobs.filter(j=>!baseline.jobIds.includes(j.id));need(added.length<=contentNodes().length&&added.every(j=>CONTENT_PURPOSES.includes(j.purpose)&&j.attempts.length<=1)&&added.flatMap(j=>j.attempts).filter(a=>a.dispatchStarted).length<=contentNodes().length,'FINAL_RECOVERY_NEW_DISPATCH_FORBIDDEN');
 need(!project.contentAllowance||project.contentAllowance.maxCalls===13,'FINAL_RECOVERY_CONTENT_BUDGET_CHANGED');
 return {newContentJobs:added.length,newContentDispatches:added.flatMap(j=>j.attempts).filter(a=>a.dispatchStarted).length};
}
export function guardFinalRecoveryExecutor(executor,store,baseline){
 const check=()=>assertFinalRecoveryPreserved(store.read(baseline.projectId),baseline);
 return {...executor,execute:async(id,jobId)=>{check();const project=store.read(id),job=project.jobs.find(j=>j.id===jobId);need(id===baseline.projectId&&job&&CONTENT_PURPOSES.includes(job.purpose)&&!baseline.jobIds.includes(jobId)&&job.status==='queued'&&job.attempts.length===0,'FINAL_RECOVERY_NEW_DISPATCH_FORBIDDEN');return executor.execute(id,jobId);},continueFinalVisual:async()=>{need(false,'FINAL_RECOVERY_NEW_DISPATCH_FORBIDDEN');},advanceFinalVisual:async id=>{need(id===baseline.projectId,'FINAL_RECOVERY_SOURCE_CHANGED');check();const result=await executor.advanceFinalVisual(id);check();return result;}};
}
async function checkedPin(pin){
 need(pin&&typeof pin.path==='string'&&/^[a-f0-9]{64}$/.test(pin.sha256)&&Number.isSafeInteger(pin.byteLength)&&pin.byteLength>0&&pin.byteLength<=64*1024*1024,'FINAL_RECOVERY_PIN_REQUIRED');
 need(await realpath(pin.path)===pin.path,'FINAL_RECOVERY_PIN_PATH_CHANGED');const bytes=await readManagedLayoutBytes(dirname(pin.path),pin.path,pin.byteLength);need(bytes.length===pin.byteLength&&bytesHash(bytes)===pin.sha256,'FINAL_RECOVERY_PIN_CHANGED');return bytes;
}
function absent(pid){need(Number.isSafeInteger(pid)&&pid>0&&pid!==process.pid,'FINAL_RECOVERY_OWNER_INVALID');try{process.kill(pid,0);}catch(error){if(error.code==='ESRCH')return;throw error;}need(false,'FINAL_RECOVERY_OWNER_ALIVE');}
export async function readFinalRecoveryTransition({path,sha256,workRoot,moduleRoot,runnerPath}){
 need(typeof path==='string'&&/^[a-f0-9]{64}$/.test(sha256)&&await realpath(path)===path,'FINAL_RECOVERY_TRANSITION_REQUIRED');
 const bytes=await readManagedLayoutBytes(dirname(path),path,256*1024);need(bytesHash(bytes)===sha256,'FINAL_RECOVERY_TRANSITION_CHANGED');const transition=JSON.parse(bytes);
 need(transition.protocol==='local-final-reader-transition-v1'&&transition.workRoot===workRoot&&transition.moduleRoot===moduleRoot&&transition.host===hostname(),'FINAL_RECOVERY_TRANSITION_IDENTITY_CHANGED');
 need(transition.oldMeta.path===join(workRoot,'FINAL_CONTENT_RUNNER.json')&&transition.oldIntent.path===join(workRoot,'final-content-intent.json'),'FINAL_RECOVERY_OLD_PATH_CHANGED');
 const old=JSON.parse(await checkedPin(transition.oldMeta)),intent=JSON.parse(await checkedPin(transition.oldIntent));
 need(old.protocol==='local-final-content-plain-run-v1'&&old.status==='blocked'&&old.currentStage==='visual'&&old.state?.status==='blocked'&&old.state.reason==='LAYOUT_MANAGED_BYTES_REQUIRED'&&old.writerPid===transition.previousPid&&old.host===transition.host&&old.sourceIdentity.projectId===transition.projectId&&old.sourceIdentity.caseId===transition.caseId&&old.actionsTotal===transition.priorActions&&old.lastRevision===transition.baseline.headRevision&&old.baselineDecisionCount===transition.baseline.decisionCount&&old.baselineDecisionCount===intent.baselineDecisionCount&&recoveryHash(old.codePins)===recoveryHash(intent.codePins)&&recoveryHash(old.configuration)===transition.configurationHash&&recoveryHash(old.sourceIdentity)===recoveryHash(intent.sourceIdentity)&&recoveryHash(old.configuration)===recoveryHash(intent.configuration),'FINAL_RECOVERY_OLD_STATE_CHANGED');
 absent(old.writerPid);need(transition.priorActions>0&&transition.priorActions<100&&transition.baseline.projectId===transition.projectId,'FINAL_RECOVERY_BASELINE_REQUIRED');
 const allowed=[join(moduleRoot,'final-visual-original.mjs'),runnerPath].sort();need(transition.changes?.length===2&&JSON.stringify(transition.changes.map(c=>c.path).sort())===JSON.stringify(allowed),'FINAL_RECOVERY_CODE_ALLOWLIST_CHANGED');
 for(const pin of old.codePins){
  const change=transition.changes.find(c=>c.path===pin.path);
  if(change){need(change.old.sha256===pin.sha256&&change.old.byteLength===pin.byteLength&&change.current.path===pin.path&&change.current.sha256!==pin.sha256,'FINAL_RECOVERY_CODE_IDENTITY_CHANGED');await checkedPin(change.old);await checkedPin(change.current);}
  else await checkedPin(pin);
 }
 need(transition.changes.every(c=>old.codePins.some(p=>p.path===c.path)),'FINAL_RECOVERY_CODE_ALLOWLIST_CHANGED');
 need(transition.addition.path===join(moduleRoot,'local-final-content-recovery.mjs'),'FINAL_RECOVERY_ADDITION_CHANGED');await checkedPin(transition.addition);
 return {path,sha256,transition,old};
}
export async function validateFinalRecoveryStart(profile,store,{identity,configuration,initial}){
 const {transition,old}=profile;need(recoveryHash(identity)===recoveryHash(old.sourceIdentity)&&recoveryHash(configuration)===transition.configurationHash,'FINAL_RECOVERY_CONFIG_CHANGED');
 const original=store.read(transition.projectId,transition.baseline.headRevision);need(recoveryHash(original)===transition.baseline.headHash&&recoveryHash(finalRecoveryBaseline(original))===recoveryHash(transition.baseline),'FINAL_RECOVERY_HEAD_CHANGED');
 const current=store.read(transition.projectId);if(initial)need(current.revision===transition.baseline.headRevision&&recoveryHash(current)===transition.baseline.headHash,'FINAL_RECOVERY_HEAD_CHANGED');assertFinalRecoveryPreserved(current,transition.baseline);return current;
}

export function assertFinalRecoveryResume(meta,profile){
 const {transition,old}=profile;
 need(meta.protocol==='local-final-content-plain-run-v2'&&meta.sourceTransition?.sha256===profile.sha256&&meta.sourceTransition.path===profile.path&&meta.sourceTransition.priorActions===transition.priorActions,'FINAL_RECOVERY_TRANSITION_CHANGED');
 need(Number.isSafeInteger(meta.actionsTotal)&&meta.actionsTotal>=transition.priorActions&&meta.actionsTotal<=100&&meta.baselineDecisionCount===old.baselineDecisionCount&&meta.baselineDecisionCount===transition.baseline.decisionCount,'FINAL_RECOVERY_COUNTER_CHANGED');
 need(meta.status!=='complete','FINAL_RECOVERY_ALREADY_COMPLETE_USE_RESULT');
}
