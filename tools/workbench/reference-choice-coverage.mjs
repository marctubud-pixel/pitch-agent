import {imageManifest} from './image-evidence.mjs';
import {referenceHash as hash,referenceRequire as requireValue} from './reference-review.mjs';

export function freezeReferenceChoiceCoverage(candidates,selection,packets,editionId){
 const active=selection.flatMap(s=>[s.mainUseId,...s.complementUseIds].map(useId=>({useId,directionId:s.directionId,role:useId===s.mainUseId?'main':'complement'}))),slots=[];
 const card=id=>candidates.flatMap(p=>p.uses).find(u=>u.id===id);
 const origin=id=>{const packet=candidates.find(p=>p.uses.some(u=>u.id===id)),index=packet.uses.findIndex(u=>u.id===id),use=packet.uses[index];return {packetId:packet.id,packetHash:hash(packet),cardHash:hash(use),pointer:`/uses/${index}`,useId:id,card:structuredClone(use)};};
 for(const [index,a]of active.entries())for(const b of active.slice(index+1)){
  if(a.directionId===b.directionId||a.role==='main'&&b.role==='main')continue;
  const pair=[a.useId,b.useId].sort(),mainIds=[a,b].map(x=>selection.find(s=>s.directionId===x.directionId).mainUseId),uses=[...new Set([...mainIds,...pair])].map(card);
  const images=imageManifest([...new Map(uses.map(u=>[u.imageId,candidates.flatMap(p=>p.images).find(i=>i.imageId===u.imageId)])).values()]);
  const roles=selection.filter(s=>[a.directionId,b.directionId].includes(s.directionId)),purpose='Determine whether the declared simultaneous uses depend on a cross-direction comparison beyond the attached main-only overview.',origins=pair.map(origin),id=hash({pair,mainIds,origins,images,roles});
  slots.push({id,status:'potential_question',useIds:pair,mainUseIds:mainIds,roles,origins,purpose,images,reservedCalls:19,packet:{id:`${editionId}-detail-${id.slice(0,12)}`,scope:'detail',minimalFacts:packets[0].minimalFacts,taskFacts:{...packets[0].taskFacts,coverageQuestion:{useIds:pair,purpose,roles}},uses,images}});
 }
 requireValue(slots.length<=12,'REFERENCE_COVERAGE_GAP','coverage_gap: more than twelve potential cross-direction questions require a bounded replan');
 return slots;
}

export function referenceChoiceCoverageContext(edition,packet){
 return {retainedCauseDecisions:edition.retainedCauseDecisions??[],boundary:'Only attached originals can support visual conclusions. Metadata about another original can request a bounded comparison, never claim that it was seen.',selection:edition.selection,uses:edition.plan.packets.filter(p=>p.scope==='combination').flatMap(p=>p.uses),questions:edition.plan.detailSlots.filter(s=>s.images.some(i=>packet.images.some(attached=>attached.imageId===i.imageId))).map(({packet,...slot})=>slot)};
}
