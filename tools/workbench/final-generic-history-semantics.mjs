import {researchRestrictionScope} from './final-research-restriction-scope.mjs';
import {isDeepStrictEqual as equal} from 'node:util';
import {sketchHash as hash,sketchRequire as need} from './sketch-authority.mjs';
import {visibilityPointer} from './content-visibility.mjs';
import {creativeSubjects} from './creative-panel.mjs';
import {evidenceClaimManifest} from './evidence-review.mjs';
import {deriveFinalMaterialDuties} from './final-preparation-materials.mjs';

const one=(rows,predicate,code='FINAL_GENERIC_SCOPE_REQUIRED')=>{const found=(rows??[]).filter(predicate);need(found.length===1,code,'One exact owning-domain member required');return found[0];};
const key=o=>JSON.stringify([o.reportIdentity,o.reportVersion,o.rawPointer]);
const contains=(parent,child)=>parent===''||child===parent||child.startsWith(parent+'/');
const originalSource=source=>{const {findings,constraints,...body}=source;return body;};
const family=new Set(['verification','creative_panel','feedback_review','correction_review','readiness','handoff']);

function ownerPointers(original,occurrence,planning){
 const {source,frozenInput:input}=original,value=occurrence.normalizedValue,path=occurrence.normalizedPointer;
 const reviewed=one(original.reviewedArtifacts,a=>a.artifactId===source.targetArtifactId&&a.contentHash===source.targetContentHash);
 const refs=items=>{need(Array.isArray(items)&&items.length,'FINAL_GENERIC_SCOPE_REQUIRED','Exact nonempty reviewed content references required');return items.map(ref=>{const located=visibilityPointer(reviewed.content,ref.location);need(typeof located==='string'&&typeof ref.quote==='string'&&ref.quote.length&&located.includes(ref.quote),'FINAL_GENERIC_SOURCE_CHANGED','Frozen content quote required');return ref.location;});};
 if(source.kind==='creative_panel'){
  const panel=one(planning.creativePanels,p=>p.id===source.panelState.panelId);
  need(panel.packet.artifactId===reviewed.artifactId&&panel.packet.contentHash===reviewed.contentHash&&equal(panel.packet.content,reviewed.content),'FINAL_GENERIC_SOURCE_CHANGED','Exact original creative packet required');
  const subjects=creativeSubjects(panel.packet.stage,reviewed.content,panel.packet.copyContractVersion,panel.packet.protocolVersion);
  need(equal(subjects,input.subjects)&&equal(subjects,panel.packet.subjects),'FINAL_GENERIC_SOURCE_CHANGED','Owning creative subject projection required');
  let ids=value.subjectIds??value.issue?.subjectIds??value.pair;
  if(!ids&&path.startsWith('/items/')){const item=visibilityPointer(source.validatedReport,path.split('/').slice(0,3).join('/'));ids=[item.subjectId];}
  need(Array.isArray(ids)&&ids.length&&new Set(ids).size===ids.length,'FINAL_GENERIC_SCOPE_REQUIRED','Exact creative subjects required');
  return ids.map(id=>{const subject=one(subjects,s=>s.id===id);return panel.packet.stage==='strategy'?'':`/directions/${subjects.indexOf(subject)}`;});
 }
 if(source.kind==='verification'){
  if(path.startsWith('/wholeTextScan/omissions/'))return refs([value]);
  if(path.startsWith('/results/')||path.startsWith('/wholeTextScan/mismatchedCreative/')){
   const claim=one(evidenceClaimManifest(reviewed.content),c=>c.claimKey===value.claimKey);
   return [`/claims/${claim.index}`];
  }
 }
 if(['feedback_review','correction_review'].includes(source.kind))return refs(value.refs);
 if(['readiness','handoff'].includes(source.kind)){need(value.refs?.length&&value.refs.every(r=>r.location.startsWith('/content/')),'FINAL_GENERIC_OWNER_SCOPE_UNSUPPORTED','Research packet references need an exact current content namespace');return refs(value.refs.map(r=>({...r,location:r.location.slice('/content'.length)})));}
 need(false,'FINAL_GENERIC_OWNER_SCOPE_UNSUPPORTED','Owner has no supported exact content selector for this occurrence');
}

export function closeGenericReviewHistory({planning,checked,selected,occurrences,trusted,catalog,native,materials,roleMaterialScopes}){
 const findings=[],dispositions=[],closedFindingKeys=[],closedDispositionPointers=[],blockers=[],proofs=[];
 const originals=[];
 for(const fact of checked.facts.filter(f=>f.checked.kind==='generic-review-original'))for(const anchor of fact.checkedRawAnchors??[]){
  if(!selected.reportAnchors.some(a=>equal(a,anchor)))continue;
  if(originals.some(e=>equal(e.anchor,anchor)&&equal(e.original,fact.checked)))continue;
  originals.push({anchor,original:fact.checked});
 }
 const entryFor=o=>{
  const entry=one(originals,e=>e.anchor.identity===o.reportIdentity&&e.anchor.version===o.reportVersion,'FINAL_GENERIC_ORIGINAL_REQUIRED');
  need(hash(JSON.stringify(visibilityPointer(planning,entry.anchor.originalRecordPointer)))===entry.anchor.recordHash&&equal(entry.anchor.raw,entry.original.source.rawReport)&&equal(visibilityPointer(entry.anchor.raw,o.rawPointer),o.rawValue)&&equal(visibilityPointer(entry.original.source.validatedReport,o.normalizedPointer),o.normalizedValue),'FINAL_GENERIC_ORIGINAL_CHANGED','Exact checked original occurrence required');
  return entry;
 };
 const relevant=occurrences.filter(o=>o.domain==='generic-review-original'&&(o.semantic==='finding'||/^\/(issues|challenges|findings)\/\d+$/.test(o.normalizedPointer)&&['preservation','finding'].includes(o.semantic)));
 for(const occurrence of relevant)try{
  const entry=entryFor(occurrence),{source}=entry.original;
  need(family.has(source.kind),'FINAL_GENERIC_OWNER_UNSUPPORTED','Supported original domain required');
  need(trusted&&catalog&&native,'FINAL_FINDING_DUTY_AUTHORITY_REQUIRED','Current original content/native material required');
  const manuscript=trusted.contract.manuscript;
  need(hash(manuscript)===trusted.contract.manuscriptHash&&equal(catalog.rows,trusted.contract.sourceLocations),'FINAL_GENERIC_MANUSCRIPT_CHANGED','Exact manuscript catalogue required');
  for(const row of catalog.rows)for(const location of [row.derived,...row.originals])one(catalog.entries,e=>equal(e.location,location)&&equal(e.ancestryAnchor,row.ancestryAnchor)&&hash(e.value)===location.valueHash,'FINAL_GENERIC_CATALOG_CHANGED');
  need(equal(roleMaterialScopes,deriveFinalMaterialDuties({trusted,catalog,native,materials})),'FINAL_GENERIC_MATERIAL_DUTY_CHANGED','Actual original material duties required');
  const research=researchRestrictionScope({planning,originals,entry,occurrence,trusted});
  let scoped=entry.original,scopedOccurrence=occurrence,correctionProof=null;
  const direct=()=>[trusted.source.strategy,trusted.source.copy].filter(a=>a?.artifactId===scoped.source.targetArtifactId&&a.contentHash===scoped.source.targetContentHash);
  if(!research&&!direct().length){
   const witnesses=originals.flatMap(e=>{
    if(e.original.source.kind!=='correction_review'||hash(JSON.stringify(visibilityPointer(planning,e.anchor.originalRecordPointer)))!==e.anchor.recordHash||!equal(e.anchor.raw,e.original.source.rawReport)||!equal(e.original.source.reviewedSources,e.original.frozenInput.correctionInput.sources))return [];
    const prior=e.original.source.reviewedSources?.filter(s=>equal(originalSource(s),source))??[];
    if(prior.length!==1)return [];
    const target=prior[0].findings?.filter(f=>f.key===occurrence.domainFindingId&&f.location===occurrence.normalizedPointer&&equal(f.originalValue,occurrence.normalizedValue))??[];
    if(target.length!==1||!e.original.correctionTargets.some(t=>t.sourceKey===source.key&&t.reportId===source.reportId&&t.targetArtifactId===source.targetArtifactId&&t.targetContentHash===source.targetContentHash&&equal(t.finding,target[0])))return [];
    return (e.original.source.validatedReport.findings??[]).filter(f=>f.findingKey===target[0].key).map(f=>({entry:e,finding:f,prior:prior[0],target:target[0]}));
   }).filter(w=>[trusted.source.strategy,trusted.source.copy].some(a=>a?.artifactId===w.entry.original.source.targetArtifactId&&a.contentHash===w.entry.original.source.targetContentHash));
   const witness=one(witnesses,()=>true,'FINAL_GENERIC_LINEAGE_REQUIRED');
   scoped=witness.entry.original;scopedOccurrence={...occurrence,normalizedValue:witness.finding,normalizedPointer:`/findings/${scoped.source.validatedReport.findings.indexOf(witness.finding)}`};
   correctionProof={reportIdentity:witness.entry.anchor.identity,reportVersion:witness.entry.anchor.version,exactOriginalReport:structuredClone(witness.entry.anchor.raw),reviewedSource:structuredClone(witness.prior),target:structuredClone(witness.target),judgment:structuredClone(witness.finding)};
  }
  const current=research?.current??one(direct(),()=>true,'FINAL_GENERIC_LINEAGE_REQUIRED'),reviewed=research?.reviewed??one(scoped.reviewedArtifacts,a=>a.artifactId===current.artifactId&&a.contentHash===current.contentHash,'FINAL_GENERIC_SOURCE_CHANGED');
  if(!research)need(equal(current.content,reviewed.content),'FINAL_GENERIC_SOURCE_CHANGED','Immutable reviewed bytes must equal the current selected source');
  need(hash(JSON.stringify(current.content,null,2))===current.contentHash,'FINAL_GENERIC_SOURCE_CHANGED','Exact current selected source bytes required');
  const pointers=research?.selectors??ownerPointers(scoped,scopedOccurrence,planning);
  const origins=research?.origins??trusted.source.obligations.filter(o=>o.artifactId===current.artifactId&&pointers.some(p=>contains(p,o.pointer)||contains(o.pointer,p))&&equal(visibilityPointer(current.content,o.pointer),o.value));
  need(origins.length&&(research||pointers.every(p=>origins.some(o=>contains(p,o.pointer)||contains(o.pointer,p)))),'FINAL_GENERIC_OBLIGATION_REQUIRED','Every owner selector must have an exact source obligation');
  const placements=origins.map(origin=>{const placement=one(manuscript.visibleObligations,p=>p.originId===origin.originId,'FINAL_GENERIC_PLACEMENT_REQUIRED'),edit=manuscript.edits?.find(e=>e.originId===origin.originId);need(equal(placement.value,edit?.after??origin.value)&&(!edit||edit.before===origin.value),'FINAL_GENERIC_PLACEMENT_CHANGED','Original obligation coverage required');return {origin:structuredClone(origin),placement:structuredClone(placement)};});
  const pages=[...new Set(placements.flatMap(p=>p.placement.pageIntentIds))].map(id=>one(manuscript.pageIntents,p=>p.id===id,'FINAL_GENERIC_PLACEMENT_REQUIRED'));
  need(pages.length&&placements.every(({placement})=>placement.pageIntentIds.every(id=>{const page=one(pages,p=>p.id===id);return placement.blockIds.every(b=>page.blockIds.includes(b)&&manuscript.narrativeBlocks.some(n=>n.id===b))&&placement.imageIds.every(i=>page.imageIds.includes(i));})),'FINAL_GENERIC_PLACEMENT_CHANGED','Exact current block/image/page relation required');
  const pagePointers=pages.map(p=>`/pageIntents/${manuscript.pageIntents.indexOf(p)}`),imageIds=[...new Set([...pages.flatMap(p=>p.imageIds),...placements.flatMap(p=>p.placement.imageIds)])];
  for(const id of imageIds)one(materials,m=>m.identity===id,'FINAL_GENERIC_MATERIAL_REQUIRED');
  const obligations=roleMaterialScopes.flatMap(scope=>scope.applicability.value.filter(cell=>imageIds.includes(cell.materialIdentity)||cell.decision.value.evidence.some(a=>a.domain==='manuscript'&&pagePointers.includes(a.pointer))).map(cell=>({role:scope.role,materialIdentity:cell.materialIdentity,addresses:structuredClone(cell.decision.value.evidence)})));
  const indexed=(selected.findingOccurrences??[]).filter(f=>f.originalReportIdentity===occurrence.reportIdentity&&f.originalReportVersion===occurrence.reportVersion&&f.originalFindingPointer===occurrence.rawPointer);
  need(indexed.length<=1,'FINAL_GENERIC_ORIGINAL_CHANGED','Unique original finding index required');
  const originId=indexed[0]?.identity??`generic-finding-${hash([occurrence.reportIdentity,occurrence.reportVersion,occurrence.rawPointer])}`;
  const artifact=one(planning.artifacts,a=>a.id===current.artifactId&&a.contentHash===current.contentHash,'FINAL_GENERIC_SOURCE_CHANGED');
  const sourceOriginalAddresses=research?.sourceOriginalAddresses??origins.map(o=>({domain:'legacy_artifact',artifactId:artifact.id,contentHash:artifact.contentHash,version:`derived-record-${hash(JSON.stringify(artifact))}`,originalLocator:o.pointer,selector:{kind:'json_pointer',pointer:o.pointer}}));
  const proof={sourceOriginalAddresses,kind:'owning_generic_content_scope',owner:source.kind,reviewedArtifact:structuredClone(reviewed),selectors:pointers,sourceHash:trusted.source.sourceHash,manuscriptHash:trusted.contract.manuscriptHash,catalogHash:hash(catalog),placements,pages:structuredClone(pages),correction:correctionProof,...(research?{researchRestriction:research.researchRestriction}:{})};
  findings.push({originId,originalReportIdentity:occurrence.reportIdentity,originalReportVersion:occurrence.reportVersion,originalFindingPointer:occurrence.rawPointer,exactOriginalPayload:structuredClone(occurrence.rawValue),returnTargets:(selected.targetOccurrences??[]).filter(t=>t.findingIdentity===originId).map(t=>structuredClone(t.rawTarget)),applicableObligations:obligations,applicabilityProof:proof});
  proofs.push(proof);closedFindingKeys.push(key(occurrence));
  const judgment=correctionProof?.judgment??(['feedback_review','correction_review'].includes(source.kind)?occurrence.normalizedValue:null);
  if(judgment?.status)dispositions.push({findingIdentity:originId,status:judgment.status,originalProof:correctionProof??{reportIdentity:entry.anchor.identity,reportVersion:entry.anchor.version,originalReportPointer:occurrence.rawPointer,exactOriginalPayload:structuredClone(occurrence.rawValue)}});
 }catch(error){blockers.push({code:error.code??'FINAL_FINDING_DUTY_AUTHORITY_REQUIRED',reportIdentity:occurrence.reportIdentity,originalFindingPointer:occurrence.rawPointer,message:error.message});}
 for(const occurrence of occurrences.filter(o=>o.domain==='generic-review-original'&&/^\/adjudications\/\d+$/.test(o.normalizedPointer)))try{
  const director=entryFor(occurrence),source=director.original.source,value=occurrence.normalizedValue;
  need(source.kind==='creative_panel'&&source.panelState.phase==='director'&&['accepted_now','accepted_later','rejected','pending'].includes(value.disposition),'FINAL_GENERIC_DISPOSITION_REQUIRED','Owning original director disposition required');
  const predecessors=originals.filter(e=>e.original.source.kind==='creative_panel'&&e.original.source.panelState.panelId===source.panelState.panelId&&director.original.dependencies.some(d=>d.domain==='creative_panel'&&d.reportId===e.anchor.identity&&d.reportHash===e.original.source.reportHash)&&director.original.frozenInput.reports.some(r=>r.nodeKey===e.original.source.panelState.nodeKey&&equal(r.report,e.anchor.raw)));
  const origin=one(relevant,o=>predecessors.some(e=>e.anchor.identity===o.reportIdentity&&`${e.original.source.panelState.nodeKey}#${o.normalizedValue.id}`===value.challengeId),'FINAL_GENERIC_DISPOSITION_ORIGIN_REQUIRED');
  const finding=one(findings,f=>f.originalReportIdentity===origin.reportIdentity&&f.originalFindingPointer===origin.rawPointer,'FINAL_GENERIC_DISPOSITION_SCOPE_REQUIRED');
  dispositions.push({findingIdentity:finding.originId,status:value.disposition,originalProof:{reportIdentity:director.anchor.identity,reportVersion:director.anchor.version,originalReportPointer:occurrence.rawPointer,exactOriginalPayload:structuredClone(occurrence.rawValue),predecessorReportIdentity:origin.reportIdentity,predecessorOriginalPointer:origin.rawPointer,predecessorOriginalPayload:structuredClone(origin.rawValue)}});
 }catch(error){blockers.push({code:error.code??'FINAL_FINDING_DISPOSITION_AUTHORITY_REQUIRED',reportIdentity:occurrence.reportIdentity,originalReportPointer:occurrence.rawPointer,message:error.message});}
 return {findings,dispositions,closedFindingKeys,closedDispositionPointers,proofs,blockers};
}
