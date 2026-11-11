import {obligationText,CONTENT_PROTOCOL,contentNodes} from './complete-content.mjs';
import {sketchHash as hash} from './sketch-authority.mjs';
const clone=structuredClone;
export function numericRuntimeConfiguration(){
 const bindings={},capabilities={};
 for(const n of contentNodes()){
  const role=n.key==='producer:strategy'?'strategy-lead':n.key==='producer:copy'?'copy-lead':n.role,binding={providerId:'numeric-content-synthetic',model:'synthetic-content',role};
  bindings[n.key==='producer:strategy'?'strategy':n.key==='producer:copy'?'copy':`content_${n.key.replaceAll(':','_')}`]=binding;
  capabilities[n.key]={operation:CONTENT_PROTOCOL,packetVersion:'content-packet-v4',assignment:{providerId:binding.providerId,model:binding.model},status:'synthetic_fixture',origin:'Bounded local numeric content mechanism test',version:'unit2b-v1',limitations:['Synthetic provider only. No real visual quality or approval.'],maxImages:16,maxBytes:1048576,maxPixels:1048576};
 }
 return {bindings,configuration:{packetVersion:'content-packet-v4',capabilities,allowance:{maxCalls:39,previousMaxCalls:13,origin:'Owned unit2b fixture',version:'unit2b-v1',reason:'One initial graph plus bounded revision.'}}};
}
export function numericManuscript(source){
 const narrativeBlocks=[],pageIntents=[],visibleObligations=[],chartPlacements=[];
 const add=(id,text,origins)=>{const b={id,kind:'source',text,originIds:origins};narrativeBlocks.push(b);return b;};
 let lastArtifact=null,lastIntent=null;
 const ordinary=source.obligations.filter(o=>!['qualification','chart_metadata','image'].includes(o.kind));
 // Each ordinary source obligation retains its own authored split boundary.
 for(const [n,o]of ordinary.entries()){
  const b=add(`body-${n}`,obligationText(o),[o.originId]),id=`intent-${n}`;
  if(lastArtifact===o.artifactId){lastIntent.blockIds.push(b.id);lastIntent.allowedSplitAfterBlockIds.push(b.id);}else{lastIntent={id,central:{kind:'text',exactText:b.text.match(/\S{1,6}/u)[0]},heroImageId:null,blockIds:[b.id],imageIds:[],allowedSplitAfterBlockIds:[b.id]};pageIntents.push(lastIntent);lastArtifact=o.artifactId;}
  visibleObligations.push({originId:o.originId,value:clone(o.value),blockIds:[b.id],imageIds:[],pageIntentIds:[lastIntent.id]});
 }
 for(const [n,i]of source.images.entries()){
  const direction=source.visual.directions??source.visual.payload.directions;
  const d=direction.find(d=>d.targets.some(t=>t.imageId===i.imageId));
  const limit=ordinary.find(o=>o.kind==='limitation'&&o.artifactId===source.visual.artifactId&&o.pointer.includes(`/directions/${d?.directionId}/limitations/`));
  let intent=limit?pageIntents.find(i=>i.id===visibleObligations.find(v=>v.originId===limit.originId).pageIntentIds[0]):null;
  if(!intent){intent={id:`image-intent-${n}`,central:{kind:'image',imageId:i.imageId},heroImageId:i.imageId,blockIds:[],imageIds:[],allowedSplitAfterBlockIds:[]};pageIntents.push(intent);}
  intent.imageIds.push(i.imageId);
  if(limit)visibleObligations.find(v=>v.originId===limit.originId).imageIds.push(i.imageId);
  for(const o of source.obligations.filter(o=>o.kind==='image'&&o.value.imageId===i.imageId))visibleObligations.push({originId:o.originId,value:clone(o.value),blockIds:[],imageIds:[i.imageId],pageIntentIds:[intent.id]});
 }
 for(const [n,c]of source.chartContent.charts.entries()){
  const id=`chart-intent-${n}`,groups=new Map();
  for(const r of c.requirements){const ids=groups.get(r.text)??[];ids.push(r.originId);groups.set(r.text,ids);}
  const blocks=[...groups].map(([text,ids],i)=>add(`chart-block-${n}-${i}`,text,ids));
  pageIntents.push({id,central:{kind:'text',exactText:c.requirements.find(r=>r.kind==='title').text},heroImageId:null,blockIds:blocks.map(b=>b.id),imageIds:[],allowedSplitAfterBlockIds:[]});
  const refs=c.requirements.map(r=>({originId:r.originId,blockId:blocks.find(b=>b.originIds.includes(r.originId)).id,start:0,end:r.text.length}));
  chartPlacements.push({occurrenceId:`chart-occurrence-${n}`,artifactId:c.artifactId,chartId:c.chartId,dataHash:c.dataHash,admissionHash:c.admissionHash,pageIntentId:id,visibleBlockRefs:refs});
  for(const r of c.requirements)visibleObligations.push({originId:r.originId,value:r.text,blockIds:[refs.find(v=>v.originId===r.originId).blockId],imageIds:[],pageIntentIds:[id]});
 }
 // Preserve manuscript block order independently of the layout style.
 pageIntents.sort((a,b)=>Math.min(...a.blockIds.map(id=>narrativeBlocks.findIndex(x=>x.id===id)))-Math.min(...b.blockIds.map(id=>narrativeBlocks.findIndex(x=>x.id===id))));
 return {schemaVersion:'complete-manuscript-v3',title:'Synthetic numeric content mechanism fixture',narrativeBlocks,directions:(source.visual.directions??source.visual.payload.directions).map(d=>({directionId:d.directionId,rendererDirectionId:source.directionMap.find(x=>x.sourceDirectionId===d.directionId).rendererDirectionId,approvedCopy:d.approvedCopy,explanation:d.explanation,presentationIntent:d.presentationIntent,claims:d.claims,limitations:d.limitations,targets:d.targets})),claims:clone(source.claims),sources:clone(source.sources),visibleObligations,pageIntents,edits:[],clausePlacements:[],chartPlacements};
}
export function syntheticNumericContentResponse(input){
 const source=input.neutral,base={protocol:CONTENT_PROTOCOL,envelopeHash:input.envelopeHash,nodeKey:input.nodeKey,findings:[]},evidence=source.obligations.map(o=>({originId:o.originId,observation:'Synthetic bounded mechanism reading only.'}));
 const restrictions=source.obligations.filter(o=>['restriction','limitation','qualification'].includes(o.kind));
 if(input.phase==='plan')return {...base,workOrder:{objective:'Synthetic numeric content runtime coverage.',productionDirector:input.planningManifest.productionDirector,moduleOwners:input.planningManifest.moduleOwners,specialistRequirements:input.planningManifest.requiredSpecialists,limits:input.planningManifest.limits,returns:input.planningManifest.returns}};
 if(input.phase==='producer'||input.phase.startsWith('layout_'))return {...base,decision:'accept',understanding:'Synthetic owner mechanism reading only.',acceptedOriginIds:source.obligations.map(o=>o.originId),restrictions,...(input.phase.startsWith('layout_')?{manuscriptHash:input.manuscriptHash,pageIntentIds:input.manuscript.pageIntents.map(i=>i.id),directionMap:source.directionMap}:{})};
 if(input.phase==='author')return {...base,decision:'accept',acceptedLegs:['strategy','copy','visual'].map(stage=>({stage,artifactId:source[stage].artifactId,contentHash:source[stage].contentHash,accepted:true})),manuscript:numericManuscript(source)};
 if(input.phase==='director')return {...base,decision:'accept',dispositions:input.findings.map(f=>({findingOriginId:f.originId,outcome:'rejected',reason:'Synthetic fixture disposition.',evidence})),criteria:['completeness','factual_boundaries','sources','visual_copy','page_intents','limitations'].map(name=>({name,status:'pass',evidence}))};
 return {...base,verdict:'accept',reading:'Synthetic independent mechanism reading only.',evidence,imageEvidence:input.images.map(i=>({...i,observation:'Synthetic image descriptor. No actual visual review proven.'})),...(input.phase==='challenge'?{preservedBlind:input.predecessors.find(p=>p.nodeKey.startsWith('blind:')).raw,challenges:input.predecessors.flatMap(p=>p.findings).map(f=>({sourceFindingIds:[f.originId],position:'Synthetic opposition mechanism only.',evidence}))}:{})};
}
