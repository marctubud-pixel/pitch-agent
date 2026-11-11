import {isDeepStrictEqual as equal} from 'node:util';
import {verifyOrdinaryReferenceProject} from './ordinary-model-project.mjs';
import {referenceState} from './reference-dossier.mjs';
import {copyDeliveryEnvelope} from './project.mjs';
const need=(value,code)=>{if(!value)throw Object.assign(Error(code),{code});};
export async function verifyLocalReferenceEvidence(project,result,{executionRoot,imageStore}={}){
 need(typeof executionRoot==='string'&&typeof imageStore?.read==='function','ACCEPTANCE_REFERENCE_RESOURCES_REQUIRED');
 const matches=(project.referenceDossiers??[]).filter(d=>d.id===result.dossierId);
 need(matches.length===1,'ACCEPTANCE_REFERENCE_DOSSIER_REQUIRED');
 const dossier=matches[0];
 need(dossier.envelope?.source?.source?.artifactId===project.activeByStage.copy,'ACCEPTANCE_REFERENCE_COPY_CHANGED');
 const latest=project.referenceDossiers.filter(d=>d.envelope?.source?.source?.artifactId===project.activeByStage.copy).at(-1);
 need(latest?.id===dossier.id,'ACCEPTANCE_REFERENCE_NOT_LATEST');
 need(equal(result.resultIds,[dossier.id]),'ACCEPTANCE_REFERENCE_RESULT_REQUIRED');
 await verifyOrdinaryReferenceProject(project,dossier,{executionRoot,imageStore});
 const state=referenceState(project,dossier,{sourceEnvelope:copyDeliveryEnvelope});
 need(state.status==='ready_for_sketch','ACCEPTANCE_REFERENCE_NOT_READY');
 need(result.selectionHash===state.selectionHash&&equal(result.selection,state.selection),'ACCEPTANCE_REFERENCE_SELECTION_CHANGED');
 const jobs=project.jobs.filter(j=>j.dossierId===dossier.id);
 need(jobs.length>0&&jobs.every(j=>j.purpose==='reference'&&j.status==='succeeded'),'ACCEPTANCE_REFERENCE_JOBS_INCOMPLETE');
 need(Array.isArray(result.jobIds)&&new Set(result.jobIds).size===jobs.length&&result.jobIds.length===jobs.length&&jobs.every(j=>result.jobIds.includes(j.id)),'ACCEPTANCE_REFERENCE_JOBS_CHANGED');
 const directions=dossier.envelope.directionIds;
 need(directions.length===3&&state.selection.length===3&&new Set(state.selection.map(s=>s.directionId)).size===3&&directions.every(id=>state.selection.some(s=>s.directionId===id)),'ACCEPTANCE_REFERENCE_DIRECTIONS_REQUIRED');
 for(const id of directions)need(new Set(dossier.candidates.filter(c=>c.directionId===id).map(c=>c.image.sha256)).size>=2,'ACCEPTANCE_REFERENCE_CANDIDATE_COVERAGE');
 const winningHashes=state.selection.map(s=>s.images.find(i=>i.imageId===s.main.imageId)?.sha256);
 need(winningHashes.every(Boolean)&&new Set(winningHashes).size===3,'ACCEPTANCE_REFERENCE_SELECTED_IMAGES_NOT_DISTINCT');
 return {...result,deliveryReady:true,selectionHash:state.selectionHash,selection:structuredClone(state.selection),realQualityVerified:false,syntheticOnly:true};
}
