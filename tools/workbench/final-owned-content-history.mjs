import {isDeepStrictEqual as equal} from 'node:util';

import {contentSourceLocations,validateManuscript} from './complete-content.mjs';
import {sketchHash as hash} from './sketch-authority.mjs';

function projectedPlacement(entry,origin,payload,trusted,catalog){
 try {
  const source=trusted.source,manuscript=trusted.contract.manuscript,binding=entry.semantics.projectedSource;
  if(binding?.kind!=='content-source-location-v1'||binding.rootJobId!==trusted.contract.rootJobId||!equal(binding.visibility,source.visibility))return null;
  const rows=contentSourceLocations({id:binding.rootJobId,task:{packetVersion:'content-packet-v3',source}});
  if(!equal(rows,binding.sourceLocations)||!equal(rows,catalog?.rows))return null;
  const row=rows.find(r=>r.originId===origin.originId);
  if(!row||origin.artifactId!==row.ancestryAnchor.artifactId||origin.pointer!==row.derived.pointer||origin.owner!=='content-author')return null;
  if(Object.hasOwn(payload,'ancestryAnchor')&&!equal(payload.ancestryAnchor,row.ancestryAnchor))return null;
  if(Object.hasOwn(payload,'location')&&![row.derived,...row.originals].some(l=>equal(l,payload.location)))return null;
  const locations=[row.derived,...row.originals],located=[];
  for(const location of locations){
   const matches=catalog.entries.filter(e=>equal(e.location,location)&&equal(e.ancestryAnchor,row.ancestryAnchor)&&hash(e.value)===location.valueHash);
   if(matches.length!==1)return null;
   located.push(structuredClone(matches[0]));
  }
  if(!equal(located[0].value,origin.value))return null;
  validateManuscript(manuscript,source);
  const placements=manuscript.clausePlacements.filter(p=>p.clauseId===origin.originId);
  if(!placements.length)return null;
  const pageIds=[...new Set(placements.flatMap(p=>p.pageIntentIds))],pages=pageIds.map(id=>manuscript.pageIntents.find(p=>p.id===id));
  const imageIds=[...new Set([...placements.flatMap(p=>p.affectedImageIds),...pages.flatMap(p=>p.imageIds)])];
  const blocks=manuscript.narrativeBlocks.filter(b=>placements.some(p=>p.blockId===b.id||p.affectedBlockIds.includes(b.id)));
  return {kind:'projected_clause',findingLocation:structuredClone(payload.location??row.derived),ancestryAnchor:structuredClone(row.ancestryAnchor),sourceOrigin:structuredClone(origin),sourceLocations:located,placements:structuredClone(placements),blocks:structuredClone(blocks),occurrences:structuredClone(source.visibility.occurrences.filter(o=>o.clauseId===origin.originId)),pages:structuredClone(pages),imageIds};
 }catch{return null;}
}

const ROLES=['content','visual','brand','user','communication'];
export function closeOwnedContentHistory({selected,checked,trusted,materials,roleMaterialScopes,dispositions,catalog}) {
 const findings=[],closedFindingIdentities=[],closedDispositionPointers=[],closedDispositions=[],predecessorInputs=[];
 const originals=checked.facts.filter(f=>f.checked.kind==='content-original'&&f.checked.historySemantics?.authority==='content-original-v2');
 const entries=originals.flatMap(f=>(f.checkedRawAnchors??[]).filter(a=>a.identity===f.checked.reportId&&a.host?.domain==='job'&&a.host.id===f.checked.jobId&&equal(a.raw,f.checked.raw)&&selected.reportAnchors.some(s=>equal(s,a))).map(anchor=>({anchor,original:f.checked,semantics:f.checked.historySemantics})));
 const match=(id,version)=>entries.filter(e=>e.anchor.identity===id&&e.anchor.version===version);
 for(const finding of selected.findingOccurrences){
  const matches=match(finding.originalReportIdentity,finding.originalReportVersion);
  if(matches.length!==1)continue;
  const entry=matches[0],semantics=entry.semantics.findings.find(f=>f.pointer===finding.originalFindingPointer&&equal(f.value,finding.exactOriginalPayload));
  if(!semantics||!trusted||entry.semantics.sourceHash!==trusted.source.sourceHash||!equal(entry.semantics.sourceObligations,trusted.source.obligations)||!equal(entry.semantics.manuscript,trusted.contract.manuscript))continue;
  const targets=selected.targetOccurrences.filter(t=>t.findingIdentity===finding.identity).sort((a,b)=>a.targetIndex-b.targetIndex),expectedTargets=[];
  for(const field of ['returnTargets','returnTarget','returnLocation'])if(Object.hasOwn(semantics.value,field)){
   const values=field==='returnTargets'?semantics.value[field]:[semantics.value[field]];
   if(!Array.isArray(values))continue;
   for(const [index,value] of values.entries())expectedTargets.push({field,index,value,pointer:`${finding.originalFindingPointer}/${field}${field==='returnTargets'?`/${index}`:''}`});
  }
  if(targets.length!==expectedTargets.length||targets.some((t,i)=>{const e=expectedTargets[i];return t.reportIdentity!==entry.anchor.identity||t.reportVersion!==entry.anchor.version||t.targetIndex!==i||t.targetField!==e.field||t.fieldIndex!==e.index||t.originalReportPointer!==e.pointer||t.originalProjectPointer!==`${entry.anchor.originalRecordPointer}/raw${e.pointer}`||!equal(t.rawTarget,e.value);}))continue;
  const payload=semantics.value,origins=entry.semantics.sourceObligations.filter(o=>o.artifactId===payload.artifactId&&o.pointer===payload.pointer&&o.owner===payload.owner);
  if(origins.length!==1)continue;
  const origin=origins[0],manuscript=trusted.contract.manuscript;
  let proof;
  if(trusted.source.visibility?.clauses.some(c=>c.clauseId===origin.originId))proof=projectedPlacement(entry,origin,payload,trusted,catalog);
  else {
   const placements=manuscript.visibleObligations?.filter(o=>o.originId===origin.originId)??[];
   if(placements.length!==1)continue;
   const placement=placements[0],pages=placement.pageIntentIds.map(id=>manuscript.pageIntents.filter(p=>p.id===id));
   if(pages.some(p=>p.length!==1))continue;
   proof={kind:'legacy_obligation',sourceOrigin:structuredClone(origin),placement:structuredClone(placement),pages:structuredClone(pages.flat()),imageIds:[...new Set([...placement.imageIds,...pages.flatMap(p=>p[0].imageIds)])]};
  }
  if(!proof)continue;
  const imageIds=proof.imageIds,obligations=[];
  let complete=true;
  for(const imageId of imageIds){
   const matches=materials.filter(m=>m.identity===imageId),file=matches.length===1&&matches[0].file?.state==='present'?matches[0].file.value:null;
   if(!file){complete=false;continue;}
   for(const role of ROLES){
    const scopes=roleMaterialScopes.filter(s=>s.role===role),cells=scopes.length===1&&scopes[0].applicability?.state==='present'?scopes[0].applicability.value.filter(c=>c.materialIdentity===imageId):[];
    const decision=cells.length===1?cells[0].decision:null;
    if(decision?.state!=='present'||typeof decision.value?.required!=='boolean'){complete=false;continue;}
    if(decision.value.required)obligations.push({role,materialIdentity:imageId,addresses:[{domain:'visual_asset',imageId,sha256:file.sha256,originalPath:file.originalPath}]});
   }
  }
  if(!complete)continue;
  findings.push({originId:finding.identity,originalReportIdentity:finding.originalReportIdentity,originalReportVersion:finding.originalReportVersion,originalFindingPointer:finding.originalFindingPointer,exactOriginalPayload:structuredClone(payload),returnTargets:selected.targetOccurrences.filter(t=>t.findingIdentity===finding.identity).sort((a,b)=>a.targetIndex-b.targetIndex).map(t=>structuredClone(t.rawTarget)),applicableObligations:obligations,applicabilityProof:proof});
  closedFindingIdentities.push(finding.identity);
 }
 for(const disposition of dispositions){
  const matches=match(disposition.originalReportIdentity,disposition.originalReportVersion);
  if(matches.length!==1)continue;
  const entry=matches[0],semantic=entry.semantics.dispositions.find(d=>d.pointer===disposition.originalReportPointer&&equal(d.value,disposition.value));
  if(!semantic||disposition.originalProjectPointer!==`${entry.anchor.originalRecordPointer}/raw${semantic.pointer}`)continue;
  const origins=entries.flatMap(e=>e.semantics.findings.filter(f=>f.domainFindingId===semantic.domainFindingId).map(f=>({entry:e,finding:f})));
  if(origins.length!==1)continue;
  const origin=origins[0],finding=selected.findingOccurrences.find(f=>f.originalReportIdentity===origin.entry.anchor.identity&&f.originalReportVersion===origin.entry.anchor.version&&f.originalFindingPointer===origin.finding.pointer&&equal(f.exactOriginalPayload,origin.finding.value));
  if(!finding||!closedFindingIdentities.includes(finding.identity))continue;
  closedDispositions.push({findingIdentity:finding.identity,status:semantic.value.outcome,originalProof:{reportIdentity:entry.anchor.identity,reportVersion:entry.anchor.version,originalReportPointer:semantic.pointer,originalProjectPointer:disposition.originalProjectPointer,exactOriginalPayload:structuredClone(semantic.value)}});
  closedDispositionPointers.push(disposition.originalProjectPointer);
 }
 for(const entry of entries)for(const [index,predecessor] of entry.semantics.predecessors.entries()){
  const originals=entries.filter(e=>e.original.jobId===predecessor.jobId&&equal(e.anchor.raw,predecessor.raw));
  if(originals.length!==1)continue;
  const original=originals[0];
  predecessorInputs.push({consumerReportIdentity:entry.anchor.identity,consumerReportVersion:entry.anchor.version,inputPointer:`/predecessors/${index}`,predecessorReportIdentity:original.anchor.identity,predecessorReportVersion:original.anchor.version,predecessorRecordPointer:original.anchor.originalRecordPointer,exactOriginalInput:structuredClone(predecessor)});
 }
 return {findings,dispositions:closedDispositions,closedFindingIdentities,closedDispositionPointers,predecessorInputs,predecessorInputIds:[...new Set(predecessorInputs.map(p=>p.predecessorReportIdentity))],applicabilityPolicy:'Exact source obligation and current validated manuscript placement determine related images. Projected clauses retain exact source-location namespaces, original occurrences and every affected scope. Unsupported placement domains remain unresolved.'};
}
