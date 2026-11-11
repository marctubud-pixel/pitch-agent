import {isDeepStrictEqual as equal} from 'node:util';
import {sketchHash as hash,sketchRequire as need} from './sketch-authority.mjs';
import {finalPayload,finalTargets} from './final-visual.mjs';
import {deriveFinalMaterialDuties} from './final-preparation-materials.mjs';
import {visibilityPointer} from './content-visibility.mjs';

const one=(rows,test,code)=>{const hits=(rows??[]).filter(test);need(hits.length===1,code,'One exact original semantic member required');return hits[0];};
const visualDomains=new Set(['sketch-review-original','final-visual-text-original']);
export function closeVisualReviewHistory({planning,checked,selected,occurrences,trusted,catalog,native,materials,roleMaterialScopes}) {
 const findings=[],dispositions=[],closedFindingKeys=[],closedDispositionPointers=[],blockers=[],proofs=[],returnResolutions=[];
 const candidates=occurrences.filter(o=>visualDomains.has(o.domain)&&o.semantic==='finding');
 const anchors=selected.reportAnchors;
 const key=o=>JSON.stringify([o.reportIdentity,o.reportVersion,o.rawPointer]);
 const originalFor=o=>{
  const anchor=one(anchors,a=>a.identity===o.reportIdentity&&a.version===o.reportVersion,'FINAL_FINDING_ORIGINAL_CHANGED');
  need(visibilityPointer(planning,anchor.originalRecordPointer)?.valid===true,'FINAL_FINDING_ORIGINAL_CHANGED','Valid original report required');
  const facts=checked.facts.filter(f=>f.checkedRawAnchors?.some(a=>equal(a,anchor))&&f.checked.kind===o.domain);
  need(facts.length&&facts.every(f=>equal(f.checked,facts[0].checked)),'FINAL_FINDING_ORIGINAL_CHANGED','Checked exact original required');
  const original=o.domain==='sketch-review-original'?one(facts[0].checked.reports,r=>r.reportId===o.reportIdentity,'FINAL_FINDING_ORIGINAL_CHANGED'):facts[0].checked;
  need(equal(visibilityPointer(original.raw,o.rawPointer),o.rawValue)&&original.frozenInput?.nodeKey===o.nodeKey,'FINAL_FINDING_ORIGINAL_CHANGED','Exact raw occurrence and original input required');
  return {anchor,original,input:original.frozenInput};
 };
 for(const occurrence of candidates)try{
  const {anchor,input}=originalFor(occurrence),payload=occurrence.rawValue;
  need(candidates.filter(o=>o.runId===occurrence.runId&&o.domainFindingId===occurrence.domainFindingId).length===1,'FINAL_FINDING_KEY_AMBIGUOUS','Qualified original finding must be unique within its run');
  need(trusted&&catalog&&native,'FINAL_FINDING_DUTY_AUTHORITY_REQUIRED','Current original content and native placements required');
  const source=trusted.source,manuscript=trusted.contract.manuscript;
  need(hash(manuscript)===trusted.contract.manuscriptHash&&equal(catalog.rows,trusted.contract.sourceLocations),'FINAL_FINDING_MANUSCRIPT_CHANGED','Exact checked manuscript and source catalogue required');
  for(const row of catalog.rows)for(const location of [row.derived,...row.originals])one(catalog.entries,e=>equal(e.location,location)&&equal(e.ancestryAnchor,row.ancestryAnchor)&&hash(e.value)===location.valueHash,'FINAL_FINDING_CATALOG_CHANGED');
  need(equal(roleMaterialScopes,deriveFinalMaterialDuties({trusted,catalog,native,materials})),'FINAL_FINDING_SCOPE_CHANGED','Actual conservative material duty inventory required');
  const visual=one(planning.artifacts,a=>a.id===source.visual.artifactId&&a.contentHash===source.visual.contentHash,'FINAL_FINDING_LINEAGE_CHANGED');
  const currentRun=one(planning.finalVisualRuns,r=>r.id===visual.finalVisual?.runId,'FINAL_FINDING_LINEAGE_CHANGED');
  need(equal(finalPayload(planning,currentRun),source.visual.payload),'FINAL_FINDING_LINEAGE_CHANGED','Current manuscript source must contain the exact selected final payload');
  const currentTargets=finalTargets(planning,currentRun),subjects=[],imageIds=[];
  if(occurrence.domain==='final-visual-text-original'){
   const originRun=one(planning.finalVisualRuns,r=>r.id===occurrence.runId,'FINAL_FINDING_LINEAGE_CHANGED');
   need(originRun.source.sourceHash===currentRun.source.sourceHash&&input.sourceHash===originRun.source.sourceHash,'FINAL_FINDING_LINEAGE_CHANGED','Unchanged original source lineage required');
   const ids=payload.targetIds??[payload.targetId];
   need(Array.isArray(ids)&&ids.length&&new Set(ids).size===ids.length&&ids.includes(payload.targetId),'FINAL_FINDING_TARGET_CHANGED','Exact distinct affected target inventory required');
   for(const id of ids){
    const original=one(input.targets,t=>t.targetId===id,'FINAL_FINDING_TARGET_CHANGED'),now=one(currentTargets,t=>t.targetId===id&&t.directionId===original.directionId,'FINAL_FINDING_TARGET_CHANGED');
    const chain=[];let cursor=currentRun,seen=new Set();
    while(cursor.id!==originRun.id){need(!seen.has(cursor.id)&&cursor.parentRunId,'FINAL_FINDING_LINEAGE_CHANGED','Original run must be an exact ancestor');seen.add(cursor.id);chain.push({runId:cursor.id,directionVersions:structuredClone(cursor.directionVersions)});cursor=one(planning.finalVisualRuns,r=>r.id===cursor.parentRunId,'FINAL_FINDING_LINEAGE_CHANGED');}
    need(equal(one(finalTargets(planning,originRun),t=>t.targetId===id,'FINAL_FINDING_TARGET_CHANGED'),original),'FINAL_FINDING_TARGET_CHANGED','Frozen original pixels and exact target required');
    const versions=[];
    if(currentRun.id!==originRun.id){
     const originalVersion=originRun.directionVersions?one(originRun.directionVersions,v=>v.directionId===original.directionId,'FINAL_FINDING_LINEAGE_CHANGED').versionId:`${originRun.id}:${original.directionId}`;
     let versionId=one(currentRun.directionVersions,v=>v.directionId===original.directionId,'FINAL_FINDING_LINEAGE_CHANGED').versionId;
     const visited=new Set();
     while(true){
      need(!visited.has(versionId),'FINAL_FINDING_LINEAGE_CHANGED','Direction version ancestry cannot cycle');visited.add(versionId);
      const version=one(planning.finalVisualLineage?.versions,v=>v.versionId===versionId,'FINAL_FINDING_LINEAGE_CHANGED');
      const producer=one(planning.finalVisualRuns,r=>r.id===version.productionRunId,'FINAL_FINDING_LINEAGE_CHANGED');
      need(version.sourceHash===input.sourceHash&&version.directionId===original.directionId&&equal(version.plan,one(producer.plan.directions,d=>d.directionId===original.directionId,'FINAL_FINDING_LINEAGE_CHANGED')),'FINAL_FINDING_LINEAGE_CHANGED','Exact immutable original direction producer version required');
      versions.push(structuredClone(version));if(versionId===originalVersion)break;
      need(typeof version.parentVersionId==='string','FINAL_FINDING_LINEAGE_CHANGED','Current selected version must descend from the reviewed original');versionId=version.parentVersionId;
     }
    }
    subjects.push({original,current:now,lineage:chain,versions});imageIds.push(now.imageId);
   }
  }else{
   const reviewed=one(planning.sketchReviewRuns,r=>r.id===occurrence.runId,'FINAL_FINDING_LINEAGE_CHANGED');
   need(currentRun.source.sketchArtifact.authority.reviewRunId===reviewed.id&&input.runId===reviewed.id,'FINAL_FINDING_LINEAGE_CHANGED','Current selected sketch must come from this exact original review');
   const original=one(input.cohort.candidates,c=>c.candidateId===payload.candidateId,'FINAL_FINDING_TARGET_CHANGED');
   const selectedCandidate=currentRun.source.selected.filter(s=>s.candidateId===original.candidateId);
   if(selectedCandidate.length){need(selectedCandidate.length===1&&['candidateId','directionId','imageId','sha256'].every(k=>selectedCandidate[0][k]===original[k]),'FINAL_FINDING_TARGET_CHANGED','Exact frozen selected candidate pixels required');imageIds.push(original.imageId,...currentTargets.filter(t=>t.directionId===original.directionId).map(t=>t.imageId));}
   subjects.push({original,selected:selectedCandidate.length===1,selection:structuredClone(currentRun.source.selected)});
  }
  for(const imageId of imageIds){const row=one(source.images,i=>i.imageId===imageId,'FINAL_FINDING_MATERIAL_CHANGED'),material=one(materials,m=>m.identity===imageId,'FINAL_FINDING_MATERIAL_CHANGED');need(equal(row,material.sourceRow)&&row.sha256===material.file?.value?.sha256,'FINAL_FINDING_MATERIAL_CHANGED','Current source row and original material bytes required');}
  const pages=manuscript.pageIntents.map((page,index)=>({page,index})).filter(({page})=>page.imageIds.some(id=>imageIds.includes(id)));
  const pagePointers=new Set(pages.map(({index})=>`/pageIntents/${index}`));
  const obligations=[];
  for(const scope of roleMaterialScopes)for(const cell of scope.applicability.value){
   const decision=cell.decision.value;
   if(!imageIds.includes(cell.materialIdentity)&&!decision.evidence.some(a=>a.domain==='manuscript'&&pagePointers.has(a.pointer)))continue;
   need(decision.required===true,'FINAL_FINDING_SCOPE_CHANGED','Relevant material duty cannot be waived');
   obligations.push({role:scope.role,materialIdentity:cell.materialIdentity,addresses:structuredClone(decision.evidence)});
  }
  const indexed=selected.findingOccurrences.filter(f=>f.originalReportIdentity===occurrence.reportIdentity&&f.originalReportVersion===occurrence.reportVersion&&f.originalFindingPointer===occurrence.rawPointer);
  need(indexed.length<=1,'FINAL_FINDING_KEY_AMBIGUOUS','Exact occurrence index required');
  const originId=indexed[0]?.identity??`visual-finding-${hash([occurrence.reportIdentity,occurrence.reportVersion,occurrence.rawPointer])}`;
  const proof={qualifiedFindingId:occurrence.domainFindingId,runId:occurrence.runId,subjects,sourceHash:source.sourceHash,manuscriptHash:trusted.contract.manuscriptHash,pages:structuredClone(pages),catalogHash:hash(catalog)};
  const targets=(selected.targetOccurrences??[]).filter(t=>t.findingIdentity===originId).sort((a,b)=>a.targetIndex-b.targetIndex);
  const expectedTargets=[];
  for(const field of ['returnTargets','returnTarget','returnLocation'])if(Object.hasOwn(payload,field))for(const [i,value]of(field==='returnTargets'?payload[field]:[payload[field]]).entries())expectedTargets.push({field,pointer:`${occurrence.rawPointer}/${field}${field==='returnTargets'?`/${i}`:''}`,value});
  need(targets.length===expectedTargets.length&&targets.every((target,i)=>target.originalReportPointer===expectedTargets[i].pointer&&target.targetField===expectedTargets[i].field&&equal(target.rawTarget,expectedTargets[i].value)),'FINAL_FINDING_TARGET_CHANGED','All exact original return occurrences must be retained');
  const targetAddresses=[...new Set(imageIds)].map(imageId=>{const file=one(materials,m=>m.identity===imageId,'FINAL_FINDING_MATERIAL_CHANGED').file.value;return {domain:'visual_asset',imageId,sha256:file.sha256,originalPath:file.originalPath};});
  for(const target of targets)if(target.targetField==='returnLocation'&&typeof target.rawTarget==='string'&&target.rawTarget.trim()&&targetAddresses.length&&(occurrence.domain==='final-visual-text-original'?payload.owner===currentRun.assignments?.planner?.role:['producer','consumer'].includes(input.phase)&&payload.owner===input.role))returnResolutions.push({identity:target.identity,addresses:targetAddresses,proof:{kind:'original_visual_target_scope',qualifiedFindingId:occurrence.domainFindingId,originalOwner:payload.owner,originalReturnLocation:target.rawTarget,subjects}});
  findings.push({originId,originalReportIdentity:anchor.identity,originalReportVersion:anchor.version,originalFindingPointer:occurrence.rawPointer,exactOriginalPayload:structuredClone(payload),returnTargets:targets.map(t=>structuredClone(t.rawTarget)),applicableObligations:obligations,applicabilityProof:proof});proofs.push(proof);closedFindingKeys.push(key(occurrence));
 }catch(error){blockers.push({code:error.code??'FINAL_FINDING_DUTY_AUTHORITY_REQUIRED',reportIdentity:occurrence.reportIdentity,originalFindingPointer:occurrence.rawPointer,message:error.message});}
 for(const occurrence of occurrences.filter(o=>visualDomains.has(o.domain)&&o.semantic==='disposition'))try{
  const {anchor,input}=originalFor(occurrence),payload=occurrence.rawValue;
  need(input.phase==='director'&&['rejected','sustained','unresolved'].includes(payload.outcome),'FINAL_FINDING_DISPOSITION_AUTHORITY_REQUIRED','Original director outcome required');
  need(occurrences.filter(o=>o.domain===occurrence.domain&&o.runId===occurrence.runId&&o.reportIdentity===occurrence.reportIdentity&&o.semantic==='disposition'&&o.rawValue.findingId===payload.findingId).length===1,'FINAL_FINDING_KEY_AMBIGUOUS','One exact director disposition per qualified finding required');
  need(Array.isArray(payload.evidence)&&payload.evidence.every(e=>input.images.some(i=>i.imageId===e.imageId&&i.sha256===e.sha256)&&typeof e.region==='string'&&e.region.trim()&&typeof e.observation==='string'&&e.observation.trim()),'FINAL_FINDING_DISPOSITION_EVIDENCE_CHANGED','Every disposition evidence entry must address the frozen original');
  const origin=one(candidates,o=>o.runId===occurrence.runId&&o.domainFindingId===payload.findingId,'FINAL_FINDING_KEY_AMBIGUOUS');
  const original=originalFor(origin);
  need(origin.nodeKey===occurrence.nodeKey||input.predecessors.some(p=>p.id===origin.reportIdentity&&p.nodeKey===origin.nodeKey&&equal(p.raw,original.anchor.raw)),'FINAL_FINDING_PREDECESSOR_CHANGED','Exact checked director predecessor required');
  need(closedFindingKeys.includes(key(origin)),'FINAL_FINDING_DISPOSITION_AUTHORITY_REQUIRED','Disposition requires closed original applicability');
  const affected=origin.rawValue.targetIds??[origin.rawValue.targetId??origin.rawValue.candidateId],subjects=input.targets??input.cohort.candidates;
  need(affected.every(id=>{const target=one(subjects,t=>(t.targetId??t.candidateId)===id,'FINAL_FINDING_TARGET_CHANGED');return payload.evidence?.some(e=>e.imageId===target.imageId&&e.sha256===target.sha256&&typeof e.region==='string'&&e.region.length&&typeof e.observation==='string'&&e.observation.length);}), 'FINAL_FINDING_DISPOSITION_EVIDENCE_CHANGED','Original outcome evidence must cover every affected original');
  const finding=findings.find(f=>f.originalReportIdentity===origin.reportIdentity&&f.originalFindingPointer===origin.rawPointer);
  const pointer=`${anchor.originalRecordPointer}/raw${occurrence.rawPointer}`;
  dispositions.push({findingIdentity:finding.originId,status:payload.outcome,originalProof:{reportIdentity:anchor.identity,reportVersion:anchor.version,originalReportPointer:occurrence.rawPointer,originalProjectPointer:pointer,exactOriginalPayload:structuredClone(payload)}});closedDispositionPointers.push(pointer);
 }catch(error){blockers.push({code:error.code??'FINAL_FINDING_DISPOSITION_AUTHORITY_REQUIRED',reportIdentity:occurrence.reportIdentity,originalReportPointer:occurrence.rawPointer,message:error.message});}
 return {findings,dispositions,closedFindingKeys,closedDispositionPointers,proofs,returnResolutions,blockers};
}
