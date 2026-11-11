import {createHash} from 'node:crypto';
import {isDeepStrictEqual as equal} from 'node:util';
import {referenceInputClosure} from './reference-input-seal.mjs';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export function referenceCorrectionEligible(project,record,nextAction,states){
 if(record.referenceRuntimeProfile!=='local-reference-pool-v2'||record.mode!=='assisted'||!record.checkpoints?.includes('references')||nextAction?.module!=='references')return false;
 if(!Array.isArray(states)||!['brief','research','strategy','copy'].every((module,index)=>states[index]?.module===module&&states[index].status==='complete'))return false;
 const artifact=project.artifacts.find(a=>a.id===project.activeByStage.copy);if(artifact?.stage!=='copy'||referenceInputClosure(project,artifact.id).closed)return false;
 return nextAction.status==='pending'&&['import_pool_material','continue_copy_v2'].includes(nextAction.nextOperation)||nextAction.status==='blocked'&&nextAction.reason==='LOCAL_POOL_INPUT_CORRECTION_REQUIRED';
}
export function referenceEditAccess(project,record,nextAction,states,recomputedPlan){
 if(!referenceCorrectionEligible(project,record,nextAction,states))return null;
 const artifact=project.artifacts.find(a=>a.id===project.activeByStage.copy),plan=recomputedPlan;
 if(plan?.protocol!=='local-reference-pool-plan-v2'||plan.projectId!==project.id||plan.caseId!==record.caseId||plan.artifactId!==artifact.id||plan.copyContentHash!==artifact.contentHash||plan.dispatchAuthorized!==false)return null;
 const {planHash,status,dispatchAuthorized,...body}=plan;if(!/^[a-f0-9]{64}$/.test(plan.sourceHash)||hash(body)!==planHash)return null;
 if(nextAction.status==='blocked'){if(plan.status!=='blocked'||!equal(plan,nextAction.pool))return null;}
 else if(plan.status!=='ready'||plan.sourceHash!==nextAction.poolSourceHash||plan.planHash!==nextAction.poolPlanHash)return null;
 const access={protocol:'local-reference-edit-access-v1',projectId:project.id,artifactId:artifact.id,copyContentHash:artifact.contentHash,projectRevision:project.revision,underlyingStatus:nextAction.status,underlyingReason:nextAction.reason??null,poolSourceHash:plan.sourceHash,poolPlanHash:plan.planHash,materialStateHash:hash((project.referenceMaterials??[]).filter(m=>m.artifactId===artifact.id)),factualAuthority:false,approvalAuthorized:false};
 return {...access,accessHash:hash(access)};
}
