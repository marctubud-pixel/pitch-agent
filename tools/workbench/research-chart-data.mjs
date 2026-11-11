import {parseChartEvidence,digest,textDigest} from '../auto-layout/native-charts/chart-data.mjs';
export const RESEARCH_DATA_VERSION='research-data-v2';
export const RESEARCH_CHART_LIMITS=Object.freeze({charts:8,cells:200,assertions:1000});
const fail=message=>{throw Object.assign(new Error(message),{code:'INVALID_RESEARCH_CHART_DATA'});};
export function researchChartSourceBinding(sourceRecords){
 const seen=new Set();
 const mapping=sourceRecords.map(source=>{
  if(typeof source.id!=='string'||typeof source.text!=='string'||seen.has(source.id))fail('Unique original source IDs and text required');seen.add(source.id);
  return {sourceId:source.id,sourceRecordHash:digest(source),chartSourceId:'qsrc-'+textDigest(source.id),textHash:textDigest(source.text),original:structuredClone(source)};
 });
 const sources=mapping.map(row=>({sourceId:row.chartSourceId,text:row.original.text,sha256:row.textHash,kind:'captured-source'}));
 return {mapping,sources,bindingHash:digest({mapping,sources})};
}
export function researchDataBasis({taskCard,confirmations,sourceRecords,acquisition}){
 if(!taskCard?.id||!confirmations?.some(c=>c.taskCardId===taskCard.id&&(taskCard.protocol!=='task-card-v1'||c.taskCardHash===textDigest(JSON.stringify(taskCard))&&c.decisionSetHash===textDigest(JSON.stringify(taskCard.decisions)))))fail('Full confirmed task card and exact decision hashes required');
 const data={version:RESEARCH_DATA_VERSION,taskCard:structuredClone(taskCard),confirmations:structuredClone(confirmations),sourceBinding:researchChartSourceBinding(sourceRecords),...(acquisition?{acquisition:structuredClone(acquisition)}:{})};
 return {...data,basisHash:digest(data)};
}
export function requireResearchDataBasis(basis,sourceRecords){
 if(!basis||basis.version!==RESEARCH_DATA_VERSION)fail('Frozen research-data-v2 basis required');
 const expected=researchDataBasis({taskCard:basis.taskCard,confirmations:basis.confirmations,sourceRecords,...(basis.acquisition?{acquisition:basis.acquisition}:{})});
 if(digest(expected)!==digest(basis))fail('Research basis or exact source binding changed');
 return expected;
}
export function validateResearchChartCandidate(content,basis){
 requireResearchDataBasis(basis,basis?.sourceBinding?.mapping?.map(r=>r.original)??[]);
 const {chartData,quantitativeClaims,claims}=content;
 if(!Array.isArray(quantitativeClaims))fail('quantitativeClaims required');
 if(chartData===null){if(quantitativeClaims.length)fail('Null charts cannot carry quantitative claims');return null;}
 if(content.outputKind==='research_plan')fail('A research plan cannot carry a dataset');
 const validated=parseChartEvidence(chartData,basis.sourceBinding.sources);
 if(validated.charts.length>RESEARCH_CHART_LIMITS.charts)fail('Research chart budget exceeded');
 if(quantitativeClaims.length!==validated.charts.length)fail('Every chart requires exactly one fact claim');
 const seen=new Set();
 for(const item of quantitativeClaims){
  if(!item||Object.keys(item).sort().join(',')!=='chartId,claimIndex'||!Number.isSafeInteger(item.claimIndex)||item.claimIndex<0||seen.has(item.chartId))fail('Exact unique chart/claim bindings required');
  const chart=chartData.charts.find(c=>c.chartId===item.chartId),claim=claims[item.claimIndex];
  if(!chart||claim?.kind!=='fact')fail('Dataset claims must be attributed source facts, never creative, inference or requirements');
  seen.add(item.chartId);
  const sourceIds=new Set();
  const walk=v=>{if(!v||typeof v!=='object')return;if(v.indexing==='utf16')sourceIds.add(v.sourceId);Object.values(v).forEach(walk);};walk(chart);
  for(const id of sourceIds){const original=basis.sourceBinding.mapping.find(r=>r.chartSourceId===id);if(!original||!claim.evidenceRefs.includes(original.sourceId))fail('Dataset claim must cite every actual original source');}
 }
 const manifest=quantitativeAssertionManifest(content,basis,validated);
 if(manifest.filter(a=>a.kind==='cell').length>RESEARCH_CHART_LIMITS.cells||manifest.length>RESEARCH_CHART_LIMITS.assertions)fail('Research numerical review budget exceeded');
 return {validated,manifest,manifestHash:digest(manifest)};
}
export function quantitativeAssertionManifest(content,basis,validated=parseChartEvidence(content.chartData,basis.sourceBinding.sources)){
 const assertions=[];
 for(const chart of content.chartData.charts){
  const dataHash=validated.charts.find(c=>c.chartId===chart.chartId).dataHash,claimIndex=content.quantitativeClaims.find(c=>c.chartId===chart.chartId).claimIndex;
  const push=(kind,pointer,value,evidence,association)=>{
   const original=basis.sourceBinding.mapping.find(row=>row.chartSourceId===evidence.sourceId);
   const data={chartId:chart.chartId,dataHash,claimIndex,kind,pointer,value,evidence:structuredClone(evidence),sourceId:original.sourceId,textHash:original.textHash,association};
   assertions.push({...data,assertionKey:digest(data)});
  };
  const bound=(pointer,v)=>push('declaration',pointer,v.text,v.evidence,{title:chart.title.text,unit:chart.unit.label.text,period:chart.period.text,population:chart.population.text});
  for(const key of ['title','period','population'])bound('/'+key,chart[key]);bound('/unit/label',chart.unit.label);
  chart.limitations.forEach((v,i)=>bound(`/limitations/${i}`,v));
  chart.categories.forEach((v,i)=>bound(`/categories/${i}/label`,v.label));
  chart.series.forEach((series,si)=>{bound(`/series/${si}/name`,series.name);series.values.forEach((cell,ci)=>push('cell',`/series/${si}/values/${ci}`,{decimal:cell.decimal,lexeme:cell.lexeme,conversion:cell.conversion},cell.evidence,{category:chart.categories[ci].label.text,series:series.name.text,unit:chart.unit.label.text,unitKind:chart.unit.kind,period:chart.period.text,population:chart.population.text,title:chart.title.text}));});
 }
 return assertions;
}
export function researchChartMetadata(job,output,contentHash){
 if(job.task?.researchContractVersion!==RESEARCH_DATA_VERSION)return {};
 const candidate=validateResearchChartCandidate(output.content,job.task.researchDataBasis);
 return {researchData:{version:RESEARCH_DATA_VERSION,basisHash:job.task.researchDataBasis.basisHash,contentHash,sourceBinding:structuredClone(job.task.researchDataBasis.sourceBinding),catalogDigest:candidate?.validated.catalogDigest??null,sourcesDigest:candidate?.validated.sourcesDigest??null,quantitativeManifestHash:candidate?.manifestHash??null}};
}
export function researchChartRestrictions(admission){
 const acquisition=admission.basis?.acquisition;
 if(!admission.raw&&!acquisition)return [];
 const out=[];
 if(acquisition){acquisition.limitations.forEach((text,i)=>out.push({id:`acquisition:${acquisition.generationId}:limit:${i}`,kind:'limitations',text}));acquisition.coverage.forEach((row,i)=>out.push({id:`acquisition:${acquisition.generationId}:coverage:${i}`,kind:'limitations',text:`Acquisition ${row.branchKind??row.kind??'tool'} coverage ${row.status}. ${row.reason??row.gaps?.join(' ')??'Original bounded coverage retained in acquisition basis.'}`}));}
 const add=(origin,text,kind='limitations')=>out.push({id:`chart:${admission.artifactId}:${origin}`,kind,text});
 for(const chart of admission.charts??[]){
  for(const key of ['title','unit','period','population'])add(`${chart.chartId}:${key}`,chart[key]);
  chart.limitations.forEach((text,i)=>add(`${chart.chartId}:source-limit:${i}`,text));
 }
 const walk=(value,path)=>{if(Array.isArray(value)){value.forEach((v,i)=>walk(v,`${path}/${i}`));return;}if(!value||typeof value!=='object')return;for(const [key,v] of Object.entries(value)){if(['limitations','prohibitedInferences','prohibited'].includes(key)&&Array.isArray(v))v.forEach((text,i)=>{if(typeof text==='string')add(`${path}/${key}/${i}`,text,key==='limitations'?'limitations':'prohibitedInferences');});else walk(v,`${path}/${key}`);}};
 walk(admission.authority,'authority');
 add('source-relative-only','Dataset values remain attributed captured-source assertions. Numerical support does not authenticate sources or establish market truth.','prohibitedInferences');
 return out;
}
export function researchChartPermittedUses(admission){
 if(!admission.raw&&!admission.basis?.acquisition)return null;
 const lists=[...admission.authority.readiness.map(r=>r.downstreamUse.allowed),...admission.authority.handoffs.map(r=>r.permittedUses),...admission.authority.declarations.map(d=>d.permittedUses)];
 return lists.length?lists[0].filter(text=>lists.every(list=>list.includes(text))):[];
}
