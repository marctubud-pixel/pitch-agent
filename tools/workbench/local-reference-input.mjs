import {referenceInputClosure} from './reference-input-seal.mjs';
import {createHash} from 'node:crypto';
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const protocol='local-reference-input-checkpoint-v1';
export function referenceInputCheckpoint(project,record,result){
 if(record.mode!=='assisted'||!record.checkpoints?.includes('references')||result.status!=='pending')return null;
 const copy=project.artifacts.find(a=>a.id===project.activeByStage.copy);
 if(copy?.stage!=='copy'||referenceInputClosure(project,copy.id).closed)return null;
 const task=project.taskCards.find(t=>t.id===project.activeTaskCardId);if(!task||!project.policies?.length)return null;
 const materials=(project.referenceMaterials??[]).filter(m=>!m.removed&&m.artifactId===copy.id&&m.provenance?.kind==='manual_supplied').map(m=>({id:m.id,artifactId:m.artifactId,copyContentHash:m.copyContentHash,directionId:m.directionId,image:m.image,kind:m.kind,applicabilityProfile:m.applicabilityProfile,borrowingNote:m.borrowingNote,provenance:m.provenance})).sort((a,b)=>a.id.localeCompare(b.id));
 const basis={protocol,projectId:project.id,taskCardId:task.id,taskCardHash:digest(task),policy:structuredClone(project.policies.at(-1)),copyArtifactId:copy.id,copyContentHash:copy.contentHash,materials};
 const basisHash=digest(basis),approved=record.decisions.some(d=>d.module==='references'&&d.decision==='approve'&&d.basisHash===basisHash);
 return {basisHash,approved,checkpoint:{...basis,basisHash}};
}
export function isReferenceInputCheckpoint(next){
 if(next?.module!=='references'||next.status!=='awaiting_user'||next.underlyingStatus!=='pending'||next.reason!=='SELECTED_REFERENCE_INPUT_CHECKPOINT'||next.inputCheckpoint?.protocol!==protocol)return false;
 const {basisHash,...basis}=next.inputCheckpoint;return /^[a-f0-9]{64}$/.test(basisHash)&&next.evidenceHash===basisHash&&digest(basis)===basisHash;
}
