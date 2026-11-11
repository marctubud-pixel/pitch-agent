import {isDeepStrictEqual as equal} from 'node:util';
import {requireFinalVisual,finalOutcome} from './final-visual.mjs';
import {requireCompleteContent,contentNodes} from './complete-content.mjs';
import {copyDeliveryEnvelope,contentSourceEnvelope} from './project.mjs';
import {LAYOUT_PURPOSE,LAYOUT_STYLES,layoutHash} from './layout-boundary.mjs';
import {layoutTuple} from './layout-native-domain.mjs';
const need=(v,code)=>{if(!v)throw Object.assign(Error(code),{code});};
const flags={syntheticOnly:true,realQualityVerified:false,finalAuthority:false,productionFinalAuthority:false,finalAuthorityAvailable:false};
function exactResult(result,artifact){need(result.artifactId===artifact.id&&equal(result.resultIds,[artifact.id]),'ACCEPTANCE_NATIVE_RESULT_CHANGED');}
function exactJobs(result,jobs){need(jobs.length>0&&jobs.every(j=>j.status==='succeeded')&&Array.isArray(result.jobIds)&&result.jobIds.length===jobs.length&&new Set(result.jobIds).size===jobs.length&&jobs.every(j=>result.jobIds.includes(j.id)),'ACCEPTANCE_NATIVE_JOBS_CHANGED');}
function currentArtifact(p,stage){const matches=p.artifacts.filter(a=>a.id===p.activeByStage[stage]&&a.stage===stage);need(matches.length===1,'ACCEPTANCE_NATIVE_CURRENT_ARTIFACT_REQUIRED');return matches[0];}
export async function verifyLocalVisualEvidence(project,result,{executor}={}){
 need(typeof executor?.verifyFinalVisual==='function','ACCEPTANCE_VISUAL_NATIVE_READER_REQUIRED');
 const artifact=currentArtifact(project,'visual');need(artifact.provenance==='reviewed_final_visual'&&artifact.finalVisual?.protocol==='final-visual-v1','ACCEPTANCE_VISUAL_AUTHORITY_REQUIRED');exactResult(result,artifact);
 const verified=await executor.verifyFinalVisual(project.id,artifact);need(verified?.payload?.protocol==='final-visual-v1'&&verified.reviewed?.status==='reviewed','ACCEPTANCE_VISUAL_ORIGINAL_REQUIRED');
 const run=requireFinalVisual(project,artifact,copyDeliveryEnvelope);need(result.runId===run.id&&finalOutcome(run).status==='reviewed','ACCEPTANCE_VISUAL_RUN_CHANGED');
 const jobs=project.jobs.filter(j=>j.finalVisualRunId===run.id);exactJobs(result,jobs);
 need(project.releases.some(r=>r.artifactId===artifact.id&&r.policyVersion===project.policies.at(-1).version),'ACCEPTANCE_VISUAL_RELEASE_REQUIRED');
 return {...result,deliveryReady:true,...flags};
}
export async function verifyLocalContentEvidence(project,result,{executor}={}){
 need(typeof executor?.contentDraft==='function'&&typeof executor?.contentLayoutInput==='function','ACCEPTANCE_CONTENT_NATIVE_READER_REQUIRED');
 const artifact=currentArtifact(project,'content_review');need(artifact.provenance==='reviewed_complete_content','ACCEPTANCE_CONTENT_AUTHORITY_REQUIRED');exactResult(result,artifact);
 const draft=await executor.contentDraft(project.id),trusted=await executor.contentLayoutInput(project.id);
 need(typeof draft?.contentText==='string'&&trusted?.contract&&trusted.source&&draft.artifactId===artifact.id&&draft.contentHash===artifact.contentHash&&layoutHash(draft.contentText)===artifact.contentHash&&trusted.contract.artifactId===artifact.id&&trusted.contentHash===artifact.contentHash&&trusted.manuscriptText===draft.contentText&&equal(trusted.contract.manuscript,draft.content),'ACCEPTANCE_CONTENT_ORIGINAL_CHANGED');
 const root=requireCompleteContent(project,artifact,contentSourceEnvelope),jobs=project.jobs.filter(j=>j.contentRootJobId===root.id);
 need(result.rootJobId===root.id&&jobs.length===contentNodes().length&&contentNodes().every(n=>jobs.filter(j=>j.nodeKey===n.key).length===1),'ACCEPTANCE_CONTENT_GRAPH_REQUIRED');exactJobs(result,jobs);
 need(['producer','consumer'].every(side=>trusted.ownerReports[side]?.valid&&trusted.ownerReports[side].raw.decision==='accept')&&trusted.contract.rootJobId===root.id,'ACCEPTANCE_CONTENT_OWNER_REQUIRED');
 need(project.releases.some(r=>r.artifactId===artifact.id&&r.sourceHash===trusted.source.sourceHash&&r.policyVersion===project.policies.at(-1).version),'ACCEPTANCE_CONTENT_RELEASE_REQUIRED');
 return {...result,deliveryReady:true,...flags};
}
export async function verifyLocalLayoutEvidence(project,result,{executor}={}){
 need(typeof executor?.layoutStatus==='function','ACCEPTANCE_LAYOUT_NATIVE_READER_REQUIRED');
 const status=await executor.layoutStatus(project.id);need(status.status==='technical_complete'&&status.finalAuthorityAvailable===false,'ACCEPTANCE_LAYOUT_NATIVE_INCOMPLETE');
 const root=project.jobs.filter(j=>j.purpose===LAYOUT_PURPOSE&&j.task?.binding).at(-1);need(root&&result.rootJobId===root.id&&result.bindingHash===root.task.bindingHash&&status.rootJobId===root.id&&status.bindingHash===root.task.bindingHash&&layoutHash(root.task.binding)===root.task.bindingHash&&root.task.binding.contentArtifactId===project.activeByStage.content_review,'ACCEPTANCE_LAYOUT_ROOT_CHANGED');
 const artifacts=project.artifacts.filter(a=>a.stage==='layout'&&a.layoutTechnical?.rootJobId===root.id);need(artifacts.length===1,'ACCEPTANCE_LAYOUT_TECHNICAL_ARTIFACT_REQUIRED');const artifact=artifacts[0];exactResult(result,artifact);
 need(artifact.provenance==='native-layout-technical-only'&&artifact.layoutTechnical.protocol==='project-native-layout-v1'&&artifact.layoutTechnical.bindingHash===root.task.bindingHash&&artifact.layoutTechnical.finalAuthorityAvailable===false&&equal(artifact.inputVersionIds,[project.activeByStage.content_review]),'ACCEPTANCE_LAYOUT_AUTHORITY_CHANGED');
 const tuple=layoutTuple(project,root),jobs=project.jobs.filter(j=>j.purpose===LAYOUT_PURPOSE&&j.task?.bindingHash===root.task.bindingHash);
 need(jobs.length===3&&tuple.every((j,i)=>j&&j.task.style===LAYOUT_STYLES[i]&&j.receipt?.bindingHash===root.task.bindingHash&&j.attempts?.length===1&&equal(j.attempts[0].receipt,j.receipt)),'ACCEPTANCE_LAYOUT_TUPLE_REQUIRED');exactJobs(result,jobs);
 need(Array.isArray(status.editions)&&status.editions.length===3&&tuple.every(j=>status.editions.filter(e=>e.jobId===j.id&&e.style===j.task.style&&e.verified===true).length===1),'ACCEPTANCE_LAYOUT_ORIGINAL_REQUIRED');
 need(artifact.contentHash===layoutHash(tuple.map(j=>j.receipt))&&equal(artifact.layoutTechnical.editions,tuple.map(j=>({jobId:j.id,style:j.task.style,receipt:j.receipt})))&&artifact.payloadRef===tuple[0].receipt.anchorPath&&tuple.every(j=>equal(j.outputVersionIds,[artifact.id])),'ACCEPTANCE_LAYOUT_RECEIPTS_CHANGED');
 return {...result,rootJobId:root.id,bindingHash:root.task.bindingHash,editions:structuredClone(status.editions),deliveryReady:true,technicalOnly:true,finalAuthority:false,...flags};
}
