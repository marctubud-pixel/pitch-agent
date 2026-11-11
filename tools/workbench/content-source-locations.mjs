import {isDeepStrictEqual as equal} from 'node:util';
import {sketchHash as hash} from './sketch-authority.mjs';
import {NUMERIC_CONTENT_CONTRACT,numericContract,numericContentPacket,contentContractForPacket,requireContentContract} from './content-contract-versions.mjs';
import {chartContentNeed as need,validateChartContentSource,chartEvidenceRows} from './chart-content.mjs';
import {visibilityPointer,resolveContentReferenceContext} from './content-visibility.mjs';
const clone=structuredClone;
export function numericContentSourceLocations(root) {
 const source=root.task.source;contentContractForPacket(root.task.packetVersion,source);
 need(numericContentPacket(root.task.packetVersion)&&source.schemaVersion===NUMERIC_CONTENT_CONTRACT.source&&numericContract(requireContentContract(source.contentContract)),'CONTENT_CONTRACT_INVALID');
 validateChartContentSource(source);
 const binding={version:NUMERIC_CONTENT_CONTRACT.location,rootJobId:root.id,sourceHash:source.sourceHash,projectionHash:source.visibility.projectionHash};
 const anchor={artifactId:source.visual.artifactId,contentHash:source.visual.contentHash,role:'ancestry_anchor'};
 const rows=source.visibility.clauses.map((clause,index)=>({originId:clause.clauseId,ancestryAnchor:clone(anchor),derived:{...binding,kind:'effective_source_clause',clauseId:clause.clauseId,pointer:`/visibility/clauses/${index}`,valueHash:hash(clause)},originals:source.visibility.occurrences.filter(o=>o.clauseId===clause.clauseId).map(o=>({...binding,kind:'original_occurrence',clauseId:clause.clauseId,occurrenceId:o.occurrenceId,containerId:o.originalContainerId,containerHash:o.originalContainerHash,pointer:o.originalPointer,valueHash:o.valueHash,owner:o.sourceOwner}))}));
 for(const [index,entry]of source.proseProjection.entries.entries()){
  const originalPointer=`/immutableBasis/obligations/${entry.originalObligationIndex}`,ancestryAnchor={artifactId:entry.artifactId,contentHash:[source.strategy,source.copy,source.visual].find(a=>a.artifactId===entry.artifactId)?.contentHash??source.basisSourceHash,role:'ancestry_anchor'};
  const derived={...binding,kind:'prose_requirement',originId:entry.originId,pointer:`/proseProjection/entries/${index}`,valueHash:hash(entry),owner:entry.owner};
  const originals=[{...binding,kind:'content_source_value',originId:entry.originId,pointer:originalPointer,valueHash:entry.originalObligationHash,owner:entry.owner},{...binding,kind:'content_source_value',originId:entry.originId,pointer:`${originalPointer}/value`,valueHash:entry.originalValueHash,owner:entry.owner},...entry.fields.map(f=>({...binding,kind:'content_source_value',originId:entry.originId,pointer:`${originalPointer}/value${f.pointer}`,valueHash:f.valueHash,owner:entry.owner}))];
  rows.push({originId:entry.originId,ancestryAnchor,derived,originals});
 }
 for(const [ci,chart] of source.chartContent.charts.entries()){
  const admission=source.researchChartAdmissions.find(a=>a.artifactId===chart.artifactId);
  const identity={...binding,artifactId:chart.artifactId,chartId:chart.chartId,dataHash:chart.dataHash,admissionHash:chart.admissionHash};
  const ancestryAnchor={artifactId:admission.artifactId,contentHash:admission.contentHash,role:'ancestry_anchor'};
  for(const [ri,r] of chart.requirements.entries()){
   const derived={...identity,kind:'chart_requirement',originId:r.originId,pointer:`/chartContent/charts/${ci}/requirements/${ri}`,valueHash:hash(r),owner:r.owner};
   const original={...identity,kind:r.source.kind==='admission'?'admission_value':r.source.kind==='content_source'?'content_source_value':'contract_value',originId:r.originId,pointer:r.source.pointer,valueHash:r.source.originalValueHash??hash(r.text),owner:r.owner};
   rows.push({originId:r.originId,ancestryAnchor:clone(ancestryAnchor),derived,originals:[original]});
  }
 }
 for(const admission of source.researchChartAdmissions)for(const row of chartEvidenceRows(admission)){
  const chartIndex=Number(row.pointer.split('/')[3]),chart=admission.charts[chartIndex],e=row.evidence,sourceRow=admission.sourceBinding.mapping.find(r=>r.chartSourceId===e.sourceId);
  const originId=`chart-evidence-${hash([admission.artifactId,admission.admissionHash,row.pointer])}`;
  const identity={...binding,artifactId:admission.artifactId,chartId:chart.chartId,dataHash:chart.dataHash,admissionHash:admission.admissionHash,originId};
  rows.push({originId,ancestryAnchor:{artifactId:admission.artifactId,contentHash:admission.contentHash,role:'ancestry_anchor'},derived:{...identity,kind:'admission_value',pointer:row.pointer,valueHash:hash(e),owner:'research-lead'},originals:[{...identity,kind:'source_span',sourceId:sourceRow.sourceId,chartSourceId:sourceRow.chartSourceId,sourceRecordHash:sourceRow.sourceRecordHash,sourceHash:e.sourceHash,indexing:'utf16',start:e.start,end:e.end,valueHash:hash(e.text),owner:'research-lead'}]});
 }
 return rows;
}
export function resolveNumericContentSourceLocation(project,location,requireCurrent) {
 need(location?.version===NUMERIC_CONTENT_CONTRACT.location,'CONTENT_SOURCE_LOCATION_INVALID');
 const root=project.jobs.find(j=>j.id===location.rootJobId);
 need(numericContentPacket(root?.task?.packetVersion),'CONTENT_SOURCE_LOCATION_INVALID');requireCurrent(root);
 const rows=numericContentSourceLocations(root),row=rows.find(r=>equal(r.derived,location)||r.originals.some(o=>equal(o,location)));
 need(row,'CONTENT_SOURCE_LOCATION_CHANGED',{originId:location.originId??location.clauseId,artifactId:location.artifactId});
 const source=root.task.source,admission=source.researchChartAdmissions.find(a=>a.artifactId===location.artifactId);let value;
 switch(location.kind){
  case 'prose_requirement':case 'chart_requirement':case 'effective_source_clause':case 'content_source_value':value=visibilityPointer(source,location.pointer);break;
  case 'admission_value':value=visibilityPointer(admission,location.pointer);break;
  case 'source_span':{
   const record=admission.sourceBinding.mapping.find(r=>r.sourceId===location.sourceId);
   value=record.original.text.slice(location.start,location.end);break;
  }
  case 'contract_value':value=source.chartContent.charts.flatMap(c=>c.requirements).find(r=>r.originId===location.originId)?.text;break;
  case 'original_occurrence':{
   const context=resolveContentReferenceContext(project,source.immutableBasis),record=context.records.find(r=>r.reportId===location.containerId),container=record?.raw??(location.containerId===`${source.visual.artifactId}/referenceBoundaries`?context.boundaries:undefined);
   need(container&&hash(container)===location.containerHash,'CONTENT_SOURCE_LOCATION_CHANGED',{originId:location.clauseId});value=visibilityPointer(container,location.pointer);break;
  }
  default:need(false,'CONTENT_SOURCE_LOCATION_INVALID');
 }
 need(value!==undefined&&hash(value)===location.valueHash,'CONTENT_SOURCE_LOCATION_CHANGED',{originId:row.originId,owner:location.owner});
 return {value:clone(value),location:clone(location),ancestryAnchor:clone(row.ancestryAnchor)};
}
