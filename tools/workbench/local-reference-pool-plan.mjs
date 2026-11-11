import {createHash} from 'node:crypto';
import {REFERENCE_APPLICABILITY} from './reference-review.mjs';
const need=(v,code)=>{if(!v)throw Object.assign(Error(code),{code});};
const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export function planReferencePool({projectId,caseId,artifact,directionIds,materials,librarySlots,catalogueDigest}){
 need(typeof projectId==='string'&&projectId.length>0&&['m6','dexian'].includes(caseId),'LOCAL_POOL_CASE_REQUIRED');
 need(artifact?.stage==='copy'&&sha(artifact.contentHash)&&Array.isArray(directionIds)&&directionIds.length===3&&new Set(directionIds).size===3&&directionIds.every(id=>typeof id==='string'&&id.length),'LOCAL_POOL_COPY_REQUIRED');
 need(Array.isArray(materials)&&Array.isArray(librarySlots)&&sha(catalogueDigest),'LOCAL_POOL_INPUT_REQUIRED');
 const current=materials.filter(m=>!m.removed&&m.artifactId===artifact.id);
 need(new Set(current.map(m=>m.id)).size===current.length,'LOCAL_POOL_DUPLICATE_MATERIAL');
 for(const slot of librarySlots)need(directionIds.includes(slot.directionId)&&typeof slot.entryId==='string'&&sha(slot.asset?.sha256)&&slot.asset.role===(caseId==='m6'?'same-use-master-kv':'observed-competitor-packaging'),'LOCAL_POOL_LIBRARY_SLOT_INVALID');
 for(const m of current){
  need(m.copyContentHash===artifact.contentHash&&directionIds.includes(m.directionId)&&sha(m.image?.sha256)&&['direction','component'].includes(m.kind)&&Object.hasOwn(REFERENCE_APPLICABILITY,m.applicabilityProfile)&&(m.kind==='direction'?m.applicabilityProfile==='direction':m.applicabilityProfile!=='direction'),'LOCAL_POOL_MATERIAL_CHANGED');
  need(['manual_supplied','local_curated_library'].includes(m.provenance?.kind),'LOCAL_POOL_PROVENANCE_REQUIRED');
  if(m.provenance.kind==='local_curated_library')need(m.provenance.catalogueDigest===catalogueDigest&&librarySlots.some(s=>s.directionId===m.directionId&&s.entryId===m.provenance.entryId&&s.asset.sha256===m.image.sha256),'LOCAL_POOL_LIBRARY_CHANGED');
 }
 const candidates=directionIds.map(directionId=>{
  const retained=current.filter(m=>m.directionId===directionId),originals=new Set(retained.map(m=>m.image.sha256)),withdrawn=materials.filter(m=>m.removed&&m.artifactId===artifact.id&&m.directionId===directionId&&m.provenance?.kind==='local_curated_library').map(m=>m.provenance.entryId);
  const slots=librarySlots.filter(s=>s.directionId===directionId&&!withdrawn.includes(s.entryId)&&!retained.some(m=>m.provenance.kind==='local_curated_library'&&m.provenance.entryId===s.entryId));
  need(slots.length<=12&&new Set(slots.map(s=>s.entryId)).size===slots.length,'LOCAL_POOL_LIBRARY_SLOT_INVALID');
  const choices=[[],...slots.map(s=>[s]),...slots.flatMap((s,i)=>slots.slice(i+1).map(t=>[s,t]))];
  const evaluate=selected=>({images:new Set([...originals,...selected.map(s=>s.asset.sha256)]),uses:retained.length+selected.length,directionImages:new Set([...retained.filter(m=>m.kind==='direction').map(m=>m.image.sha256),...selected.map(s=>s.asset.sha256)])});
  const viable=choices.map(choice=>({choice,...evaluate(choice)})).filter(e=>e.images.size>=2&&e.images.size<=3&&e.uses<=12&&e.directionImages.size>0);
  const baseline=evaluate([]),blockedReason=viable.length?null:originals.size>3||retained.length>12?'NATIVE_REFERENCE_CAPACITY_EXCEEDED':baseline.directionImages.size===0?'REFERENCE_DIRECTION_PURPOSE_REQUIRED':'REFERENCE_DISTINCT_ORIGINALS_REQUIRED';
  return {directionId,retained,withdrawn,baseline,viable,blockedReason};
 });
 const match=sets=>{
  for(const a of sets[0])for(const b of sets[1])if(b!==a)for(const c of sets[2])if(c!==a&&c!==b)return [a,b,c];
  return null;
 };
 let selected=null,matching=null;
 if(candidates.every(c=>c.viable.length))for(const a of candidates[0].viable)for(const b of candidates[1].viable)for(const c of candidates[2].viable){
  const combination=[a,b,c],count=combination.reduce((n,e)=>n+e.choice.length,0);if(selected&&count>=selected.reduce((n,e)=>n+e.choice.length,0))continue;
  const assignment=match(combination.map(e=>e.directionImages));if(assignment){selected=combination;matching=assignment;}
 }
 const directions=candidates.map((c,index)=>{
  const e=selected?.[index]??c.viable[0]??c.baseline,imports=(selected?.[index]?.choice??[]).map(slot=>({directionId:c.directionId,entryId:slot.entryId,sha256:slot.asset.sha256,kind:'direction',applicabilityProfile:'direction',reason:'Minimum same-use library completion with capacity and three-direction distinct-main feasibility; no user purpose changed.'}));
  return {directionId:c.directionId,retainedMaterialIds:c.retained.map(m=>m.id),withdrawnLibraryEntryIds:c.withdrawn,imports,distinctOriginals:selected?e.images.size:c.baseline.images.size,declaredUses:selected?e.uses:c.baseline.uses,hasDirectionPurpose:selected?e.directionImages.size>0:c.baseline.directionImages.size>0,blockedReason:c.blockedReason??(!selected?'REFERENCE_DISTINCT_MAIN_COVERAGE_REQUIRED':null)};
 });
 const sourceHash=createHash('sha256').update(JSON.stringify({projectId,caseId,artifactId:artifact.id,copyContentHash:artifact.contentHash,directionIds,currentMaterials:current,withdrawnMaterials:materials.filter(m=>m.removed&&m.artifactId===artifact.id),catalogueDigest,librarySlots:librarySlots.map(s=>({directionId:s.directionId,entryId:s.entryId,sha256:s.asset.sha256,role:s.asset.role}))})).digest('hex');
 const body={projectId,caseId,sourceHash,protocol:'local-reference-pool-plan-v2',artifactId:artifact.id,copyContentHash:artifact.contentHash,catalogueDigest,directions,distinctMainFeasibility:matching?{status:'feasible',exampleHashes:matching,notASelectionOrApproval:true}:{status:'not_proven',notASelectionOrApproval:true},historicalMaterialIds:materials.filter(m=>m.removed||m.artifactId!==artifact.id).map(m=>m.id),nativeMaximumOriginals:3,nativeMaximumUses:12,syntheticOnly:true,qualityVerified:false,factualAuthority:false};
 return {...body,planHash:createHash('sha256').update(JSON.stringify(body)).digest('hex'),status:directions.some(d=>d.blockedReason)?'blocked':'ready',dispatchAuthorized:false};
}
