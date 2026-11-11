import {requireContentProseProjection,requireProjectedManuscriptText,readableSourceRestrictions} from './content-prose-projection.mjs';
import {isDeepStrictEqual as equal} from 'node:util';
import {sketchHash as hash} from './sketch-authority.mjs';
import {strategyTextLeaves} from './strategy-contract.mjs';
import {ownerHash} from './owner-edge.mjs';
import {evidenceStateHash} from './evidence-review.mjs';
import {parseChartEvidence,digest} from '../auto-layout/native-charts/chart-data.mjs';
import {requireResearchDataBasis,quantitativeAssertionManifest} from './research-chart-data.mjs';
import {NUMERIC_CONTENT_CONTRACT,numericContract,numericContentPacket,requireContentContract} from './content-contract-versions.mjs';
const clone=structuredClone;
const unique=xs=>new Set(xs).size===xs.length;
const exact=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const nonempty=x=>typeof x==='string'&&x.trim().length>0;
const escape=x=>String(x).replace(/~/g,'~0').replace(/\//g,'~1');
export function chartContentNeed(ok,code,details={}) {if(!ok)throw Object.assign(new Error(code),{code,details:{owner:'content-author',...details}});}
const need=chartContentNeed;
export function validateContentAdmissions(admissions) {
 need(Array.isArray(admissions)&&unique(admissions.map(a=>a?.artifactId)),'CONTENT_CHART_ADMISSION_INVALID',{owner:'research-lead'});
 for(const a of admissions){
  const details={artifactId:a?.artifactId,owner:'research-lead',originId:a?.artifactId};
  try {
  need(exact(a,['protocolVersion','artifactId','contentHash','producer','basis','sourceBinding','raw','quantitativeClaims','catalogDigest','sourcesDigest','charts','quantitativeManifestHash','authority','admissionHash'])&&a.protocolVersion==='research-chart-admission-v1','CONTENT_CHART_ADMISSION_INVALID',details);
  const {admissionHash,...data}=a;
  need(admissionHash===evidenceStateHash(data),'CONTENT_CHART_ADMISSION_CHANGED',details);
  requireResearchDataBasis(a.basis,a.sourceBinding?.mapping?.map(r=>r.original)??[]);
  need(equal(a.sourceBinding,a.basis.sourceBinding),'CONTENT_CHART_SOURCE_CHANGED',details);
  need(a.authority&&['verifications','readiness','handoffs','declarations','releases'].every(k=>Array.isArray(a.authority[k])),'CONTENT_CHART_AUTHORITY_INVALID',details);
  if(a.raw===null){need(equal(a.charts,[])&&equal(a.quantitativeClaims,[])&&[a.catalogDigest,a.sourcesDigest,a.quantitativeManifestHash].every(v=>v===null),'CONTENT_CHART_DATA_CHANGED',details);continue;}
  const validated=parseChartEvidence(a.raw,a.sourceBinding.sources);
  need(equal(a.charts,validated.charts)&&a.catalogDigest===validated.catalogDigest&&a.sourcesDigest===validated.sourcesDigest,'CONTENT_CHART_DATA_CHANGED',details);
  need(Array.isArray(a.quantitativeClaims)&&a.quantitativeClaims.length===a.charts.length&&unique(a.quantitativeClaims.map(q=>q.chartId))&&a.quantitativeClaims.every(q=>exact(q,['chartId','claimIndex'])&&Number.isSafeInteger(q.claimIndex)&&q.claimIndex>=0&&a.charts.some(c=>c.chartId===q.chartId)),'CONTENT_CHART_CLAIMS_CHANGED',details);
  const manifest=quantitativeAssertionManifest({chartData:a.raw,quantitativeClaims:a.quantitativeClaims},a.basis,validated);
  need(digest(manifest)===a.quantitativeManifestHash,'CONTENT_CHART_MANIFEST_CHANGED',details);
  }catch(error){error.details={...details,...error.details};throw error;}
 }
 return admissions;
}
export function collectContentAdmissions(strategyEnvelope,copyEnvelope) {
 const lists=[strategyEnvelope.researchChartAdmissions,copyEnvelope.researchChartAdmissions];
 lists.forEach(validateContentAdmissions);
 need(equal(lists[0],lists[1]),'CONTENT_CHART_ENVELOPE_CHANGED',{owner:'strategy-lead'});
 return clone(lists[0]);
}
export function chartCreativeRestrictions(delivery) {
 const out=[];
 for(const side of ['strategy','copy']){
  const envelope=delivery?.[side];
  need(envelope&&typeof envelope==='object','CONTENT_CHART_ENVELOPE_CHANGED',{owner:`${side}-lead`});
  const {envelopeHash,...data}=envelope;
  need(ownerHash(data)===envelopeHash,'CONTENT_CHART_ENVELOPE_CHANGED',{owner:`${side}-lead`});
  const fallback={owner:`${side}-lead`,artifactId:envelope.source.artifactId};
  const add=(text,pointer,origin=fallback)=>{need(nonempty(text),'CONTENT_CHART_RESTRICTION_INVALID',{owner:origin.owner,pointer});out.push({text,owner:origin.owner,source:{kind:'content_source',artifactId:origin.artifactId,...(origin.containerId?{containerId:origin.containerId}:{}),pointer:`/chartDelivery/${side}${pointer}`}});};
  const walk=(value,pointer,inherited=fallback)=>{
   if(!value||typeof value!=='object')return;
   const artifactId=value.artifactId??inherited.artifactId,stage=envelope.sourceArtifacts?.find(a=>a.id===artifactId)?.stage;
   const origin={artifactId,owner:value.ownerBinding?.role??(typeof value.owner==='string'?value.owner:value.artifactId&&stage?`${stage}-lead`:inherited.owner),containerId:value.rawReport&&value.id?value.id:inherited.containerId};
   for(const [key,v] of Object.entries(value)){
    const path=`${pointer}/${escape(key)}`;
    if(['limitations','prohibitedInferences','prohibited','scopeLimits'].includes(key)&&Array.isArray(v))v.forEach((item,i)=>{if(typeof item==='string')add(item,`${path}/${i}`,origin);else if(nonempty(item?.text))add(item.text,`${path}/${i}/text`,origin);else need(false,'CONTENT_CHART_RESTRICTION_INVALID',{pointer:path,owner:`${side}-lead`});});
    else if(key==='prohibitedUse'&&typeof v==='string')add(v,path,origin);
    else walk(v,path,origin);
   }
  };
  for(const key of ['source','manifest','researchRestrictionManifest','researchOperatorConstraints','upstreamOwnerReports'])walk(envelope[key],`/${key}`);
  const leaves=[...strategyTextLeaves(envelope.source.content).filter(leaf=>leaf.kind==='limitation'),...(envelope.source.content.gaps??[]).map((value,i)=>({pointer:`/gaps/${i}`,value}))];
  for(const leaf of leaves){const pointer=`/source/content${leaf.pointer}`;if(!out.some(r=>r.source.pointer===`/chartDelivery/${side}${pointer}`))add(leaf.value,pointer);}
 }
 return out;
}
export function chartEvidenceRows(admission) {
 const rows=[];
 const walk=(v,pointer)=>{
  if(!v||typeof v!=='object')return;
  if(v.indexing==='utf16'){rows.push({pointer,evidence:clone(v)});return;}
  Object.entries(v).forEach(([k,x])=>walk(x,`${pointer}/${escape(k)}`));
 };
 walk(admission.raw,'/raw');return rows;
}
export function deriveChartContent(admissions,creativeRestrictions=[]) {
 validateContentAdmissions(admissions);
 const charts=[];
 for(const a of admissions)for(const [chartIndex,raw] of (a.raw?.charts??[]).entries()){
  const c=a.charts.find(c=>c.chartId===raw.chartId),identity={artifactId:a.artifactId,chartId:c.chartId,dataHash:c.dataHash,admissionHash:a.admissionHash},requirements=[];
  const add=(kind,text,pointer,owner='research-lead',source={kind:'admission',artifactId:a.artifactId,pointer})=>{
   need(nonempty(text),'CONTENT_CHART_TEXT_REQUIRED',{...identity,owner,pointer});
   const originId=`chart-text-${hash({identity,kind,source})}`;
   requirements.push({originId,kind,text,owner,source:clone(source)});
  };
  for(const key of ['title','period','population'])add(key,raw[key].text,`/raw/charts/${chartIndex}/${key}/text`);
  add('unit',raw.unit.label.text,`/raw/charts/${chartIndex}/unit/label/text`);
  raw.limitations.forEach((v,i)=>add('limitation',v.text,`/raw/charts/${chartIndex}/limitations/${i}/text`));
  const used=new Set(chartEvidenceRows({...a,raw}).map(r=>r.evidence.sourceId));
  a.sourceBinding.mapping.forEach((r,i)=>{
   if(!used.has(r.chartSourceId))return;
   const key=['title','label','url'].find(k=>nonempty(r.original[k]));
   need(key,'CONTENT_CHART_SOURCE_LABEL_REQUIRED',{...identity,sourceId:r.sourceId,owner:'research-lead'});
   add('source',r.original[key],`/sourceBinding/mapping/${i}/original/${key}`);
   (r.original.limitations??[]).forEach((text,j)=>add('limitation',text,`/sourceBinding/mapping/${i}/original/limitations/${j}`));
   for(const part of readableSourceRestrictions(r.original,{owner:'research-lead',originId:`source:${r.sourceId}`,artifactId:a.artifactId,pointer:`/sourceBinding/mapping/${i}/original`}))add('limitation',part.text,`/sourceBinding/mapping/${i}/original${part.pointer}`,'research-lead',{kind:'admission',artifactId:a.artifactId,pointer:`/sourceBinding/mapping/${i}/original${part.pointer}`,originalValueHash:part.valueHash,projection:'content-prose-projection-v1'});
  });
  const limits=(value,pointer,inheritedOwner='research-lead')=>{
   if(!value||typeof value!=='object')return;
   const owner=['consumer','strategy_owner'].includes(value.side)?'strategy-lead':inheritedOwner;
   for(const [key,v] of Object.entries(value)){
    const path=`${pointer}/${escape(key)}`;
    if(['limitations','prohibitedInferences','prohibited','unresolvedIssues'].includes(key)&&Array.isArray(v))v.forEach((text,i)=>{
     need(typeof text==='string','CONTENT_CHART_RESTRICTION_INVALID',{...identity,pointer:`${path}/${i}`,owner:'research-lead'});add('limitation',text,`${path}/${i}`,owner);
    });else limits(v,path);
   }
  };
  limits(a.authority,'/authority');
  for(const restriction of creativeRestrictions)add('limitation',restriction.text,restriction.source.pointer,restriction.owner,restriction.source);
  add('limitation','Dataset values remain attributed captured-source assertions. Numerical support does not authenticate sources or establish market truth.','/source-relative-only','research-lead',{kind:'contract',version:NUMERIC_CONTENT_CONTRACT.source,pointer:'/source-relative-only'});
  charts.push({...identity,requirements});
 }
 return {charts};
}
export function contentChartObligations(chartContent) {
 return chartContent.charts.flatMap(chart=>chart.requirements.map(r=>({originId:r.originId,artifactId:chart.artifactId,pointer:r.source.pointer,owner:r.owner,kind:'chart_metadata',value:r.text})));
}
let validatedSourceHash=null;
export function validateChartContentSource(source) {
 const {sourceHash:claimedHash,...body}=source??{};
 const fingerprint=typeof claimedHash==='string'?hash(body):null;
 if(fingerprint===claimedHash&&fingerprint===validatedSourceHash)return source;
 need(numericContract(requireContentContract(source.contentContract))&&(source.schemaVersion===undefined||source.schemaVersion===NUMERIC_CONTENT_CONTRACT.source),'CONTENT_CONTRACT_INVALID');
 const restrictions=chartCreativeRestrictions(source.chartDelivery);
 need(equal(source.chartCreativeRestrictions,restrictions)&&equal(collectContentAdmissions(source.chartDelivery.strategy,source.chartDelivery.copy),source.researchChartAdmissions),'CONTENT_CHART_ENVELOPE_CHANGED');
 const expected=deriveChartContent(source.researchChartAdmissions,restrictions);
 need(equal(source.chartContent,expected),'CONTENT_CHART_REQUIREMENTS_CHANGED');
 need(equal(source.obligations.filter(o=>o.kind==='chart_metadata'),contentChartObligations(expected)),'CONTENT_CHART_OBLIGATIONS_CHANGED');
 if(source.visibility){
  const {projectionHash,...projection}=source.visibility;
  need(projectionHash===hash(projection)&&source.visibility.basisSourceHash===source.basisSourceHash,'CONTENT_CHART_VISIBILITY_CHANGED');
 }
 if(source.immutableBasis){
  requireContentProseProjection(source);
  const {sourceHash,...data}=source;
  need(sourceHash===hash(data),'CONTENT_CHART_SOURCE_CHANGED');
  const {sourceHash:basisHash,...basis}=source.immutableBasis;
  need(basisHash===hash(basis)&&source.basisSourceHash===basisHash&&equal(source.researchChartAdmissions,basis.researchChartAdmissions)&&equal(source.chartContent,basis.chartContent)&&equal(source.chartCreativeRestrictions,basis.chartCreativeRestrictions),'CONTENT_CHART_BASIS_CHANGED');
 }
 if(fingerprint&&fingerprint===claimedHash)validatedSourceHash=fingerprint;
 return source;
}
export function validateChartManuscript(m,source,validateVisibility) {
 validateChartContentSource(source);
 need(source.schemaVersion===NUMERIC_CONTENT_CONTRACT.source&&m?.schemaVersion===NUMERIC_CONTENT_CONTRACT.manuscript,'CONTENT_CHART_MANUSCRIPT_VERSION');
 if(Array.isArray(m.narrativeBlocks)&&Array.isArray(m.edits))requireProjectedManuscriptText(m,source);
 need(Array.isArray(m.chartPlacements)&&unique(m.chartPlacements.map(p=>p?.occurrenceId)),'CONTENT_CHART_PLACEMENT_INVALID',{artifactId:source.chartContent.charts[0]?.artifactId,originId:source.chartContent.charts[0]?.requirements[0]?.originId,sourceOwner:source.chartContent.charts[0]?.requirements[0]?.owner});
 const converted=clone(m);delete converted.chartPlacements;converted.schemaVersion='complete-manuscript-v2';
 const visibilitySource={...source,schemaVersion:'content-source-v2'};delete visibilitySource.sourceHash;visibilitySource.sourceHash=hash(visibilitySource);
 try{validateVisibility(converted,visibilitySource);}catch(error){error.details={owner:'content-author',...error.details};throw error;}
 for(const placement of m.chartPlacements){
  const expected=source.chartContent.charts.find(c=>c.artifactId===placement?.artifactId&&c.chartId===placement?.chartId)??source.chartContent.charts[0];
  const details={occurrenceId:placement?.occurrenceId,artifactId:placement?.artifactId??expected?.artifactId,chartId:placement?.chartId??expected?.chartId,pageIntentId:placement?.pageIntentId,originId:expected?.requirements[0]?.originId,sourceOwner:expected?.requirements[0]?.owner};
  need(exact(placement,['occurrenceId','artifactId','chartId','dataHash','admissionHash','pageIntentId','visibleBlockRefs'])&&nonempty(placement.occurrenceId)&&Array.isArray(placement.visibleBlockRefs),'CONTENT_CHART_PLACEMENT_INVALID',details);
  const chart=source.chartContent.charts.find(c=>['artifactId','chartId','dataHash','admissionHash'].every(k=>c[k]===placement[k])),intent=m.pageIntents.find(p=>p.id===placement.pageIntentId);
  need(chart&&intent,'CONTENT_CHART_PLACEMENT_CHANGED',details);
  need(placement.visibleBlockRefs.length===chart.requirements.length&&unique(placement.visibleBlockRefs.map(r=>r?.originId)),'CONTENT_CHART_METADATA_MISSING',details);
  for(const requirement of chart.requirements){
   const ref=placement.visibleBlockRefs.find(r=>r?.originId===requirement.originId),block=m.narrativeBlocks.find(b=>b.id===ref?.blockId),d={...details,originId:requirement.originId,sourceOwner:requirement.owner,source:requirement.source};
   need(!block||!source.chartContent.charts.filter(c=>c!==chart).some(c=>c.requirements.some(r=>block.originIds.includes(r.originId))),'CONTENT_CHART_METADATA_SCOPE',d);
   need(exact(ref,['originId','blockId','start','end'])&&block?.kind==='source'&&block.originIds.includes(requirement.originId)&&intent.blockIds.includes(block.id),'CONTENT_CHART_METADATA_PAGE',d);
   need(Number.isSafeInteger(ref.start)&&Number.isSafeInteger(ref.end)&&ref.start>=0&&ref.end>ref.start&&block.text.slice(ref.start,ref.end)===requirement.text,'CONTENT_CHART_METADATA_TEXT',d);
  }
  const positions=placement.visibleBlockRefs.map(ref=>intent.blockIds.indexOf(ref.blockId)),first=Math.min(...positions),last=Math.max(...positions);
  need(intent.allowedSplitAfterBlockIds.every(id=>{const position=intent.blockIds.indexOf(id);return position<first||position>=last;}),'CONTENT_CHART_METADATA_SPLIT',details);
 }
 for(const chart of source.chartContent.charts)need(m.chartPlacements.some(p=>['artifactId','chartId','dataHash','admissionHash'].every(k=>p[k]===chart[k])),'CONTENT_CHART_MISSING',{artifactId:chart.artifactId,chartId:chart.chartId,originId:chart.requirements[0]?.originId,sourceOwner:'research-lead'});
 return clone(m);
}
