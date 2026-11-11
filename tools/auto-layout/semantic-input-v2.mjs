import {NUMERIC_CONTENT_CONTRACT,contentContractForPacket} from '../workbench/content-contract-versions.mjs';
import {normalizeSourceLocations} from './semantic-source-locations.mjs';
import {isDeepStrictEqual as equal} from 'node:util';
import {validateManuscript} from '../workbench/complete-content.mjs';
import {materialFragments} from '../workbench/content-visibility.mjs';
import {hash,layoutIssue,obligationText} from './semantic-input.mjs';

export const SEMANTIC_V2_SCHEMA='semantic-layout-v2';
const need=(ok,code,at,observation,constraint)=>{if(!ok)layoutIssue(code,at,observation,constraint);};
export function normalizeManuscriptV2(ledger,assets){
  const {source,manuscript:m,contentBinding:binding}=ledger;
  const at={artifactId:binding?.artifactId??'standalone-ledger',pointer:'/manuscript',owner:'content-author',contentHash:binding?.manuscriptHash??null};
  need(source&&m&&binding,'SEMANTIC_ENVELOPE_REQUIRED',at,'Exact source, manuscript and binding required');
  const numeric=ledger.schemaVersion===NUMERIC_CONTENT_CONTRACT.semantic;
  const contract=contentContractForPacket(numeric?source?.contentContract?.packet:'content-packet-v3',source);
  need(ledger.schemaVersion===contract.semantic&&source.schemaVersion===contract.source&&m.schemaVersion===contract.manuscript,'SEMANTIC_VERSION_PAIR_REQUIRED',at,'Versioned source and manuscript must use the same accepted contract');
  need(binding.manuscriptHash===hash(m)&&binding.sourceHash===source.sourceHash,'SEMANTIC_BINDING_CHANGED',at,'Exact source and manuscript binding required');
  const {sourceHash,...sourceBody}=source;
  need(sourceHash===hash(sourceBody),'SEMANTIC_SOURCE_CHANGED',{...at,pointer:'/source'},'Effective source differs from its hash');
  try{validateManuscript(m,source);}catch(error){
    const d=error.details??{},placement=m.clausePlacements?.find(p=>p.clauseId===d.clauseId),blockIndex=m.narrativeBlocks?.findIndex(b=>b.id===d.blockId),intentIndex=m.pageIntents?.findIndex(i=>i.id===d.intentId);
    layoutIssue(error.code??'SEMANTIC_MANUSCRIPT_INVALID',{...at,pointer:placement?`/manuscript/clausePlacements/${m.clausePlacements.indexOf(placement)}`:blockIndex>=0?`/manuscript/narrativeBlocks/${blockIndex}`:intentIndex>=0?`/manuscript/pageIntents/${intentIndex}`:'/manuscript',originIds:d.originId?[d.originId]:d.clauseId?[d.clauseId]:[],blockIds:d.blockId?[d.blockId]:[],intentId:d.intentId,owner:d.sourceOwner??d.owner??'content-author'},error.message,{sharedValidatorDetails:d});
  }
  const sourceLocations=normalizeSourceLocations(ledger);
  const index=(xs,k)=>Object.fromEntries(xs.map(x=>[x[k],x]));
  for(const [values,key,pointer]of [[source.images,'imageId','/source/images'],[source.sources,'id','/source/sources'],[source.obligations,'originId','/source/obligations']])need(new Set(values.map(v=>v[key])).size===values.length,'SEMANTIC_DUPLICATE_REFERENCE',{...at,pointer},'Source identity must be unique');
  const graph={title:m.title,manuscriptVersion:m.schemaVersion,source:structuredClone(source),manuscript:structuredClone(m),blocksById:{},sourcesById:index(source.sources,'id'),imagesById:index(source.images,'imageId'),obligationsByOrigin:{},claimsByOrigin:{},directionsBySourceId:index(m.directions,'directionId'),contentBinding:structuredClone(binding),intents:[],authority:'standalone-technical-input-only',sourceLocations,clausesById:{},clausePlacements:structuredClone(m.clausePlacements)};
  const origins=index(source.obligations,'originId'),visible=index(m.visibleObligations,'originId');
  const clauseIds=new Set(source.visibility.clauses.map(c=>c.clauseId));
  for(const [n,b]of m.narrativeBlocks.entries())graph.blocksById[b.id]={...structuredClone(b),location:{...at,pointer:`/manuscript/narrativeBlocks/${n}`,blockIds:[b.id],originIds:b.originIds},claimOrigins:[],sourceIds:[]};
  for(const [n,i]of m.pageIntents.entries()){
    need(new Set(i.blockIds).size===i.blockIds.length&&new Set(i.imageIds).size===i.imageIds.length,'SEMANTIC_DUPLICATE_REFERENCE',{...at,pointer:`/manuscript/pageIntents/${n}`},'Intent block and image references must be unique');
    graph.intents.push({...structuredClone(i),centralMessage:i.central.kind==='text'?i.central.exactText:null,location:{...at,pointer:`/manuscript/pageIntents/${n}`,intentId:i.id},kind:'narrative',atomicGroups:[],localObligations:[],materialPlacements:m.clausePlacements.map((p,index)=>({...p,index})).filter(p=>p.pageIntentIds.includes(i.id))});
  }
  for(const o of source.obligations){
    if(clauseIds.has(o.originId))continue;
    need(['text','limitation','claim','direction','restriction','qualification','source','image',...(numeric?['chart_metadata']:[])].includes(o.kind),'SEMANTIC_UNSUPPORTED_OBLIGATION',o,'Unknown obligation composition requires its source owner');
    const v=visible[o.originId],value=m.edits.find(e=>e.originId===o.originId)?.after??o.value;
    const loc={...o,originIds:[o.originId],blockIds:v.blockIds,imageIds:v.imageIds};
    const leg=[source.strategy,source.copy,source.visual].find(l=>l?.artifactId===o.artifactId);
    graph.obligationsByOrigin[o.originId]={...o,...v,contentHash:leg?.contentHash??null,sourceHash,valueHash:hash(o.value),exactText:obligationText({...o,value})};
    for(const i of graph.intents.filter(i=>v.pageIntentIds.includes(i.id))){i.atomicGroups.push(v.blockIds);if(['limitation','restriction','qualification','source'].includes(o.kind))i.localObligations.push(o.originId);}
    if(o.kind==='claim'){
      need(o.value.evidenceRefs.every(id=>graph.sourcesById[id]),'SEMANTIC_CITATION_MISSING',loc,'Claim source does not resolve');
      graph.claimsByOrigin[o.originId]={...o.value,location:loc,blockIds:v.blockIds};
      for(const id of v.blockIds){graph.blocksById[id].claimOrigins.push(o.originId);graph.blocksById[id].sourceIds.push(...o.value.evidenceRefs);}
    }
  }
  for(const [n,clause]of source.visibility.clauses.entries()){
    const sourceLocation=sourceLocations[n],derived=sourceLocation.derived;
    graph.clausesById[clause.clauseId]={...structuredClone(clause),fragments:materialFragments(clause.content),location:{artifactId:derived?`content-source-envelope:${derived.rootJobId}`:sourceLocation.envelopeId,pointer:derived?.pointer??sourceLocation.pointer,namespace:derived?'effective-source':'ledger-source',sourceHash,owner:'content-author',sourceLocation,ancestryArtifactId:source.visual.artifactId}};
  }
  if(numeric){
   graph.chartPlacements=structuredClone(m.chartPlacements);
   graph.chartsByIdentity=Object.fromEntries(source.chartContent.charts.map(c=>[JSON.stringify([c.artifactId,c.chartId,c.dataHash,c.admissionHash]),structuredClone(c)]));
   for(const i of graph.intents){i.chartPlacements=graph.chartPlacements.filter(p=>p.pageIntentId===i.id);for(const p of i.chartPlacements)i.atomicGroups.push([...new Set(p.visibleBlockRefs.map(r=>r.blockId))]);}
  }
  const requiredImageIds=new Set([...graph.intents.flatMap(i=>i.imageIds),...source.obligations.filter(o=>o.kind==='image').map(o=>o.value.imageId)]);
  graph.requiredImageIds=[...requiredImageIds];
  for(const image of source.images){
    if(!requiredImageIds.has(image.imageId)&&!assets[image.imageId])continue;
    const a=assets[image.imageId],o=source.obligations.find(o=>o.kind==='image'&&o.value.imageId===image.imageId),atImage=o??{artifactId:binding.sourceEnvelopeId??binding.artifactId,pointer:`/source/images/${source.images.indexOf(image)}`,owner:'visual-lead',imageIds:[image.imageId]};
    need(a&&a.sha256===image.sha256&&a.byteLength===image.byteLength&&a.width===image.width&&a.height===image.height,'SEMANTIC_IMAGE_BYTES_CHANGED',atImage,'Actual original decoded image bytes and dimensions must match');
    if(requiredImageIds.has(image.imageId))need(graph.intents.some(i=>i.imageIds.includes(image.imageId)),'SEMANTIC_IMAGE_ORPHAN',atImage,'Every required final or authored image needs an actual intent');
    if(a.application){const mock=assets[a.application.mockupId];need(mock?.role==='mockup'&&mock.purpose===a.application.purpose&&a.application.kind==='rectangular-aperture','SEMANTIC_MOCKUP_PURPOSE',atImage,'Only an explicitly matched rectangular aperture is supported');}
  }
  for(const d of m.directions){
    const loc={artifactId:source.visual.artifactId,pointer:`/directions/${d.directionId}`,owner:'visual-lead'};
    for(const t of d.targets)need(graph.requiredImageIds.includes(t.imageId)&&graph.imagesById[t.imageId]&&source.obligations.some(o=>o.kind==='image'&&equal(o.value,t)),'SEMANTIC_IMAGE_VIEW_MISSING',{...loc,imageIds:[t.imageId]},'Every final approved target view needs its exact image obligation and actual authored placement');
    need(Object.values(graph.obligationsByOrigin).some(o=>o.kind==='direction'&&equal(o.value,d.approvedCopy)),'SEMANTIC_DIRECTION_COPY_RELATION',{...loc,owner:'copy-lead'},'Approved direction copy needs its exact readable obligation');
    for(const key of ['explanation','presentationIntent'])need(Object.values(graph.obligationsByOrigin).some(o=>o.artifactId===source.visual.artifactId&&o.pointer===`/directions/${d.directionId}/${key}`&&o.value===d[key]&&o.blockIds.length),'SEMANTIC_DIRECTION_TEXT_RELATION',{...loc,pointer:`${loc.pointer}/${key}`},'Required direction wording needs its exact readable source relation');
    for(const c of d.claims)need(Object.values(graph.claimsByOrigin).some(o=>equal({text:o.text,kind:o.kind,evidenceRefs:o.evidenceRefs,limitations:o.limitations},c)),'SEMANTIC_CLAIM_ORIGIN_MISSING',loc,'Direction claim needs its original exact obligation');
    for(const [n,limit]of d.limitations.entries()){
      const original=Object.values(graph.obligationsByOrigin).find(o=>o.artifactId===source.visual.artifactId&&o.pointer===`/directions/${d.directionId}/limitations/${n}`);
      need(original&&original.value===limit&&original.imageIds.some(id=>d.targets.some(t=>t.imageId===id)),'SEMANTIC_IMAGE_LIMIT_RELATION',{...loc,...original,pointer:`/directions/${d.directionId}/limitations/${n}`,originIds:original?[original.originId]:[],blockIds:original?.blockIds??[],imageIds:d.targets.map(t=>t.imageId)},'Visual limitation requires its approved affected target image relation');
    }
  }
  for(const [id,a]of Object.entries(assets))need(graph.imagesById[id]||(a.role==='mockup'&&Object.values(assets).some(x=>x.application?.mockupId===id)),'SEMANTIC_UNDECLARED_IMAGE',{...at,pointer:`/assets/${id}`,owner:'visual-lead',imageIds:[id]},'Asset is not a declared source image or used mockup');
  for(const claim of source.claims)need(Object.values(graph.claimsByOrigin).some(o=>equal({text:o.text,kind:o.kind,evidenceRefs:o.evidenceRefs,limitations:o.limitations},claim)),'SEMANTIC_CLAIM_ORIGIN_MISSING',{...at,pointer:`/source/claims/${source.claims.indexOf(claim)}`},'Exact claim needs its original visible obligation');
  return graph;
}
