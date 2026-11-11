import {isDeepStrictEqual as equal} from 'node:util';
import {sketchHash as hash,sketchRequire as need} from './sketch-authority.mjs';
import {MODEL_VIEW_CONTENT_CONTRACT,planningContentPacket,contentContractForPacket,PLANNING_CONTENT_CONTRACT} from './content-contract-versions.mjs';

export const CONTENT_PLANNING_SERIALIZATION='content-planning-authority-v1';
const clone=structuredClone;
const exact=(xs,predicate)=>{const matches=xs.filter(predicate);need(matches.length===1,'CONTENT_PLANNING_SELECTION_AMBIGUOUS','One exact immutable planning authority record required');return matches[0];};
const selected=records=>records.map(record=>({id:record.id,sha256:hash(record)}));
export function freezePlanningSelection(project,source) {
 const jobs=['strategy','copy'].map(module=>exact(project.jobs,j=>j.outputVersionIds?.includes(source[module].artifactId)));
 const aggregate=exact(project.jobs,j=>j.id===source.visualLeg.jobId);
 jobs.push(aggregate);
 const runs=aggregate.finalVisualRunId?[exact(project.finalVisualRuns??[],r=>r.id===aggregate.finalVisualRunId)]:[];
 for(const run of runs)for(const direction of run.plan.directions)for(const target of direction.targets)jobs.push(exact(project.jobs,j=>j.finalVisualRunId===run.id&&j.nodeKey===`image:${target.id}`));
 const unique=[...new Map(jobs.map(j=>[j.id,j])).values()];
 need(unique.every(j=>j.status==='succeeded'),'CONTENT_SPECIALIST_MISSING','Planning source owners and workers must be successful originals');
 const assets=unique.filter(j=>j.purpose==='final_visual_image').map(j=>exact(project.imageAssets??[],a=>a.id===j.outputVersionIds?.[0]));
 return {version:'content-planning-selection-v1',jobs:selected(unique),runs:selected(runs),assets:selected(assets)};
}
export function planningSelectedProject(project,root) {
 const selection=root.task.planningSelection;
 need(selection?.version==='content-planning-selection-v1'&&Object.keys(selection).length===4,'CONTENT_PLANNING_SELECTION_CHANGED','Exact frozen planning selection required');
 const resolve=(records,refs)=>refs.map(ref=>{need(Object.keys(ref).length===2,'CONTENT_PLANNING_SELECTION_CHANGED','Closed immutable authority selector required');const record=exact(records??[],r=>r.id===ref.id);need(hash(record)===ref.sha256,'CONTENT_PLANNING_SELECTION_CHANGED','Selected original authority changed');return record;});
 return {...project,jobs:resolve(project.jobs,selection.jobs),finalVisualRuns:resolve(project.finalVisualRuns,selection.runs),imageAssets:resolve(project.imageAssets,selection.assets)};
}
export function canonicalPlanningAuthority(root,manifest) {
 const source=root.task.source;
 need(planningContentPacket(root.task.packetVersion)&&equal(source.contentContract,contentContractForPacket(root.task.packetVersion,source)),'CONTENT_CONTRACT_INVALID','Exact v5 source and root required');
 const body={serialization:CONTENT_PLANNING_SERIALIZATION,projectId:source.projectId,rootJobId:root.id,sourceHash:source.sourceHash,projectionHash:source.visibility.projectionHash,contentContract:clone(source.contentContract),selection:clone(root.task.planningSelection),planningManifest:clone(manifest)};
 const text=JSON.stringify(body),ref={serialization:CONTENT_PLANNING_SERIALIZATION,projectId:body.projectId,rootJobId:root.id,sourceHash:body.sourceHash,projectionHash:body.projectionHash,byteLength:Buffer.byteLength(text),sha256:hash(text)};
 return {body,text,ref};
}
export function requirePlanningAuthority(root,manifest) {
 const authority=canonicalPlanningAuthority(root,manifest);
 need(equal(root.task.planningManifestRef,authority.ref),'CONTENT_PLANNING_AUTHORITY_CHANGED','Canonical planning manifest must match the exact frozen root descriptor');
 return authority;
}
export function effectiveContentWorkOrder(root,manifest,raw) {
 requirePlanningAuthority(root,manifest);
 need(raw?.packetVersion===root.task.packetVersion&&raw.nodeKey==='plan'&&equal(raw.planningManifestRef,root.task.planningManifestRef)&&typeof raw.objective==='string'&&raw.objective.trim().length>0&&!Object.hasOwn(raw,'workOrder'),'CONTENT_PLAN_ASSIGNMENT_INVALID','Exact compact model planning testimony required');
 return {objective:raw.objective,productionDirector:clone(manifest.productionDirector),moduleOwners:clone(manifest.moduleOwners),specialistRequirements:clone(manifest.requiredSpecialists),limits:clone(manifest.limits),returns:clone(manifest.returns)};
}
