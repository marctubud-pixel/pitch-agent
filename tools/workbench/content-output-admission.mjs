import {obligationText,ingestContent} from './complete-content.mjs';
import {materialFragments,occurrenceScopes,affectedContentRelations} from './content-visibility.mjs';
import {requireContentBytes,contentByteLength} from './content-resource-policy.mjs';
import {sketchRequire as need} from './sketch-authority.mjs';
const clone=structuredClone;
function mandatoryManuscript(source){
 const clauses=new Map(source.visibility.clauses.map(c=>[c.clauseId,c])),narrativeBlocks=[],visibleObligations=[],clausePlacements=[];
 for(const [index,o]of source.obligations.entries()){
  if(o.kind==='image'){visibleObligations.push({originId:o.originId,value:clone(o.value),blockIds:[],imageIds:[o.value.imageId],pageIntentIds:['reservation-intent']});continue;}
  const clause=clauses.get(o.originId),text=clause?materialFragments(clause.content).join('\n'):obligationText(o),id=`reservation-block-${index}`;
  narrativeBlocks.push({id,kind:'source',text,originIds:[o.originId]});
  if(!clause)visibleObligations.push({originId:o.originId,value:clone(o.value),blockIds:[id],imageIds:[],pageIntentIds:['reservation-intent']});
 }
 const pageIntents=[{id:'reservation-intent',central:{kind:'text',exactText:narrativeBlocks[0].text.slice(0,1)},heroImageId:null,blockIds:narrativeBlocks.map(b=>b.id),imageIds:source.images.map(i=>i.imageId),allowedSplitAfterBlockIds:[]}];
 const manuscript={schemaVersion:'complete-manuscript-v3',title:'Resource reservation skeleton',narrativeBlocks,directions:source.visual.payload.directions.map(d=>({directionId:d.directionId,rendererDirectionId:source.directionMap.find(x=>x.sourceDirectionId===d.directionId).rendererDirectionId,approvedCopy:clone(d.approvedCopy),explanation:d.explanation,presentationIntent:d.presentationIntent,claims:clone(d.claims),limitations:clone(d.limitations),targets:clone(d.targets)})),claims:clone(source.claims),sources:clone(source.sources),visibleObligations,pageIntents,edits:[],clausePlacements,chartPlacements:source.chartContent.charts.map((c,index)=>({occurrenceId:`reservation-chart-${index}`,artifactId:c.artifactId,chartId:c.chartId,dataHash:c.dataHash,admissionHash:c.admissionHash,pageIntentId:'reservation-intent',visibleBlockRefs:c.requirements.map(r=>{const block=narrativeBlocks.find(b=>b.originIds.includes(r.originId));return {originId:r.originId,blockId:block.id,start:0,end:r.text.length};})}))};
 for(const clause of clauses.values()){
  const block=narrativeBlocks.find(b=>b.originIds.includes(clause.clauseId)),fragments=materialFragments(clause.content),ranges=[];let offset=0;
  for(const fragment of fragments){ranges.push({start:offset,end:offset+fragment.length});offset+=fragment.length+1;}
  const scopes=source.visibility.occurrences.filter(o=>o.clauseId===clause.clauseId).flatMap(o=>occurrenceScopes(o).map(scope=>({o,scope}))),relations=scopes.flatMap(({o,scope})=>affectedContentRelations(manuscript,source,o,scope));
  clausePlacements.push({clauseId:clause.clauseId,occurrenceScopeKeys:scopes.map(({scope})=>scope.key),exactFragmentRanges:ranges,blockId:block.id,affectedBlockIds:[...new Set(relations.flatMap(r=>r.blockIds))],affectedImageIds:[...new Set(relations.flatMap(r=>r.imageIds))],pageIntentIds:['reservation-intent']});
 }
 return manuscript;
}
export function contentOutputAdmission(input,source,manifest){
 const evidence=input.neutral.obligations.map(o=>({originId:o.originId,observation:'x'})),one=evidence.slice(0,1),base={protocol:input.protocol,envelopeHash:input.envelopeHash,nodeKey:input.nodeKey,findings:[]};let raw;
 if(input.phase==='plan')raw={...base,packetVersion:input.packetVersion,planningManifestRef:clone(input.planningManifestRef),objective:'x'};
 else if(input.phase==='producer'||input.phase.startsWith('layout_'))raw={...base,decision:'accept',understanding:'x',acceptedOriginIds:source.obligations.map(o=>o.originId),restrictions:clone(source.obligations.filter(o=>['restriction','qualification','limitation'].includes(o.kind))),...(input.phase.startsWith('layout_')?{manuscriptHash:input.manuscriptHash,pageIntentIds:input.manuscript.pageIntents.map(i=>i.id),directionMap:clone(source.directionMap)}:{})};
 else if(input.phase==='author')raw={...base,decision:'accept',acceptedLegs:['strategy','copy','visual'].map(stage=>({stage,artifactId:source[stage].artifactId,contentHash:source[stage].contentHash,accepted:true})),manuscript:mandatoryManuscript(source)};
 else if(input.phase==='director')raw={...base,decision:'accept',dispositions:input.findings.map(f=>({findingOriginId:f.originId,outcome:'unresolved',reason:'x',evidence:one})),criteria:['completeness','factual_boundaries','sources','visual_copy','page_intents','limitations'].map(name=>({name,status:'unknown',evidence:one}))};
 else raw={...base,verdict:'unknown',reading:'x',evidence,imageEvidence:input.images.map(i=>({imageId:i.imageId,sha256:i.sha256,observation:'x'})),...(input.phase==='challenge'?{preservedBlind:clone(input.predecessors.find(p=>p.nodeKey.startsWith('blind:')).raw),challenges:input.predecessors.flatMap(p=>p.findings).map(f=>({sourceFindingIds:[f.originId],position:'x',evidence:one}))}:{})};
 const text=JSON.stringify(raw),parsed=ingestContent(input,{responseText:text},manifest,source);
 need(parsed.valid,'CONTENT_RESOURCE_SKELETON_UNAVAILABLE','Exact mandatory response skeleton cannot be admitted for this source');
 const outputBytes=requireContentBytes('outputBytes',text),encodedOutputBytes=requireContentBytes('encodedOutputBytes',JSON.stringify(text));
 if(raw.manuscript)requireContentBytes('manuscriptBytes',raw.manuscript);
 const freeEncodedBytes=(input.phase==='plan'?8:input.phase==='director'?1280:input.phase==='author'?128:input.phase==='producer'||input.phase.startsWith('layout_')?32:96)*1024;requireContentBytes('receiptBytes',2*(encodedOutputBytes+freeEncodedBytes)+64*1024);
 return {kind:'content-output-reservation-v1',mandatoryOutputBytes:outputBytes,mandatoryEncodedOutputBytes:encodedOutputBytes,freeEncodedBytes};
}
