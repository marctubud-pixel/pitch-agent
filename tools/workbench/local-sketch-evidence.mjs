import {isDeepStrictEqual as equal} from 'node:util';
import {verifyOrdinaryReferenceProject} from './ordinary-model-project.mjs';
import {verifySketchOriginal} from './sketch-original.mjs';
import {verifyReviewedSketchOriginal} from './sketch-review-original.mjs';
import {requireReviewedSketch} from './sketch-authority.mjs';
import {copyDeliveryEnvelope} from './project.mjs';
const need=(ok,code)=>{if(!ok)throw Object.assign(Error(code),{code});};
export async function verifyLocalSketchEvidence(project,result,{executionRoot,imageStore}={}){
 need(typeof executionRoot==='string'&&typeof imageStore?.read==='function','ACCEPTANCE_SKETCH_RESOURCES_REQUIRED');
 const matches=(project.artifacts??[]).filter(a=>a.id===project.activeByStage.sketch&&a.stage==='sketch');
 need(matches.length===1,'ACCEPTANCE_CURRENT_SKETCH_REQUIRED');const artifact=matches[0];
 need(artifact.provenance==='reviewed_sketch_generation'&&artifact.sketchGeneration?.protocol==='sketch-review-v2','ACCEPTANCE_REVIEWED_SKETCH_REQUIRED');
 need(equal(result.resultIds,[artifact.id])&&result.artifactId===artifact.id,'ACCEPTANCE_SKETCH_RESULT_CHANGED');
 const run=project.sketchReviewRuns?.find(r=>r.id===artifact.sketchGeneration.reviewRunId),generation=project.sketchGenerations?.find(g=>g.id===run?.generationId);
 need(run&&generation&&result.generationId===generation.id&&result.reviewRunId===run.id,'ACCEPTANCE_SKETCH_RUN_CHANGED');
 const dossier=project.referenceDossiers?.find(d=>d.id===generation.source.dossierId);
 need(dossier,'ACCEPTANCE_SKETCH_REFERENCE_REQUIRED');
 await verifyOrdinaryReferenceProject(project,dossier,{executionRoot,imageStore});
 for(const job of project.jobs.filter(j=>j.generationId===generation.id&&['sketch_owner','sketch_plan','image_candidate'].includes(j.purpose)))await verifySketchOriginal(project,generation,job,{executionRoot,imageStore});
 await verifyReviewedSketchOriginal(project,artifact,{executionRoot,imageStore});
 requireReviewedSketch(project,artifact,copyDeliveryEnvelope);
 for(const side of ['producer','consumer'])need(run.reports.some(r=>r.phase===side&&r.valid&&r.raw.decision==='accept'),'ACCEPTANCE_SKETCH_OWNER_REQUIRED');
 const jobs=project.jobs.filter(j=>j.generationId===generation.id);
 need(jobs.length>0&&jobs.every(j=>j.status==='succeeded'),'ACCEPTANCE_SKETCH_JOBS_INCOMPLETE');
 need(Array.isArray(result.jobIds)&&result.jobIds.length===jobs.length&&new Set(result.jobIds).size===jobs.length&&jobs.every(j=>result.jobIds.includes(j.id)),'ACCEPTANCE_SKETCH_JOBS_CHANGED');
 const selected=artifact.sketchGeneration.selected;
 need(equal(result.selected,selected)&&selected.length===3&&new Set(selected.map(s=>s.sha256)).size===3,'ACCEPTANCE_SKETCH_SELECTION_CHANGED');
 for(const directionId of generation.source.directionIds){
  const candidates=generation.plan.candidates.filter(c=>c.directionId===directionId);
  need(candidates.length>=3&&new Set(candidates.map(c=>c.id)).size===candidates.length,'ACCEPTANCE_SKETCH_CANDIDATE_COVERAGE');
 }
 return {...result,deliveryReady:true,selected:structuredClone(selected),syntheticOnly:true,realQualityVerified:false};
}
