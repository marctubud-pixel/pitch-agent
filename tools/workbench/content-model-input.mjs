import {isDeepStrictEqual as equal} from 'node:util';
import {sketchHash as hash,sketchRequire as need} from './sketch-authority.mjs';

export const CONTENT_MODEL_INPUT_VERSION='content-domain-tables-v1';
export const CONTENT_EXPANSION_LIMITS=Object.freeze({bytes:40*1024*1024,depth:128,records:200000,references:200000,work:4000000});
const json=JSON.stringify;
const sharedFields=['version','rootJobId','sourceHash','projectionHash','kind','owner','artifactId','chartId','dataHash','admissionHash'];
const locationKinds=['effective_source_clause','original_occurrence','prose_requirement','content_source_value','chart_requirement','admission_value','contract_value','source_span'];
const locationColumns=['originId','pointer','valueHash','clauseId','occurrenceId','containerId','containerHash','sourceId','chartSourceId','sourceRecordHash','indexing','start','end'];
const archiveLists=['verifications','readinessReports','handoffReports','feedbackReviews','correctionReviews','creativeReports','reviews'];
const check=(condition)=>need(condition,'CONTENT_MODEL_VIEW_INVALID','Closed lossless content model view required');
const exactKeys=(v,keys)=>check(v&&typeof v==='object'&&!Array.isArray(v)&&equal(Object.keys(v),keys));
function bounded(value){
 let bytes=0,work=0;const active=new Set();
 function visit(v,depth){
  check(++work<=CONTENT_EXPANSION_LIMITS.work&&depth<=CONTENT_EXPANSION_LIMITS.depth);
  if(v&&typeof v==='object'){
   check(!active.has(v));active.add(v);const array=Array.isArray(v),keys=Object.keys(v);check(array?keys.length===v.length&&keys.every((key,index)=>key===String(index)):Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);bytes+=2+Math.max(0,keys.length-1);
   for(const k of keys){if(!array)bytes+=Buffer.byteLength(json(k))+1;visit(v[k],depth+1);}active.delete(v);
  }else {check(v===null||typeof v==='string'||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v));bytes+=Buffer.byteLength(json(v));}
  need(bytes<=CONTENT_EXPANSION_LIMITS.bytes,'CONTENT_MODEL_EXPANSION_LIMIT','Expanded semantic input exceeds 40 MiB');
 }
 visit(value,0);return bytes;
}
function unique(rows,key){check(Array.isArray(rows));const ids=rows.map(r=>r[key]);check(ids.every(id=>typeof id==='string')&&new Set(ids).size===ids.length);}
function authority(value,encode){
 unique(value.neutral.obligations,'originId');unique(value.sourceLocations,'originId');
 const obs=new Map(value.neutral.obligations.map(o=>[o.originId,o])),locs=new Map(value.sourceLocations.map(l=>[l.originId,l]));
 const target=id=>{const o=obs.get(id),l=locs.get(id);check(o);return {artifactId:o.artifactId,pointer:o.pointer,owner:o.owner,...(l?{ancestryAnchor:l.ancestryAnchor,location:l.derived}:{})};};
 for(const key of ['planningManifest','workOrder']){
  const a=value[key];if(!a)continue;
  for(const m of a.moduleOwners){const targets=m.obligationOriginIds.map(target);if(encode){check(equal(m.returnTargets,targets));delete m.returnTargets;}else m.returnTargets=targets;}
  const limits=value.neutral.obligations.filter(o=>['restriction','limitation','qualification'].includes(o.kind)),returns=value.neutral.obligations.map(o=>({originId:o.originId,...target(o.originId)}));
  if(encode){check(equal(a.limits,limits)&&equal(a.returns,returns));delete a.limits;delete a.returns;}else {a.limits=limits;a.returns=returns;}
 }
 return value;
}
function archiveWalk(value,record){
 const result={...value};
 for(const module of ['strategy','copy']){
  if(!value[module])continue;const m=result[module]={...value[module]};
  for(const key of archiveLists)if(m[key]){check(Array.isArray(m[key]));m[key]=m[key].map(record);}
  if(m.creativePanels)m.creativePanels=m.creativePanels.map(panel=>{
   const packet={...panel.packet};
   if(packet.independentEvidenceReviews)packet.independentEvidenceReviews=packet.independentEvidenceReviews.map(record);
   if(packet.upstreamConstraints)packet.upstreamConstraints=Object.fromEntries(Object.entries(packet.upstreamConstraints).map(([id,v])=>{const out={...v};for(const key of ['readiness','handoffs'])if(out[key])out[key]=out[key].map(record);return [id,out];}));
   return {...panel,packet};
  });
 }
 return result;
}
function encodeModelView(input){
 bounded(input);const value=authority(structuredClone(input),true);
 const tables={locationSchemas:[],locationRecords:[],ancestryAnchors:[],readingEvidence:[],reports:[],archiveOriginals:[]},indices=new Map();
 const intern=(name,v)=>{const table=tables[name];let index=indices.get(name);if(!index)indices.set(name,index=new Map());const key=hash(v),bucket=index.get(key)??[];let id=bucket.find(id=>json(table[id])===json(v));if(id===undefined){id=table.length;table.push(v);bucket.push(id);index.set(key,bucket);}check(table.length<=CONTENT_EXPANSION_LIMITS.records);return id;};
 const location=v=>{const scope=Object.fromEntries(Object.entries(v).filter(([k])=>sharedFields.includes(k))),columns=Object.keys(v).filter(k=>!sharedFields.includes(k));const id=intern('locationSchemas',{scope,columns,order:Object.keys(v)});tables.locationRecords.push([id,...columns.map(k=>v[k])]);return tables.locationRecords.length-1;};
 value.sourceLocations=value.sourceLocations.map(row=>{exactKeys(row,['originId','ancestryAnchor','derived','originals']);return {originId:row.originId,ancestryAnchorId:intern('ancestryAnchors',row.ancestryAnchor),derivedRecordId:location(row.derived),originalRecordIds:row.originals.map(location)};});
 const report=v=>{
  const data={...v},slots=[];
  for(const [k,x]of Object.entries(v)){
   if(k==='evidence'&&Array.isArray(x)){data[k]=intern('readingEvidence',x);slots.push(k);}
   else if(k==='preservedBlind'){data[k]=intern('reports',report(x));slots.push(k);}
   else if(k==='acceptedOriginIds'&&equal(x,value.neutral.obligations.map(o=>o.originId))){data[k]='all-source-obligations-in-order';slots.push(k);}
   else if(k==='manuscript'&&value.manuscript&&equal(x,value.manuscript)){data[k]='currentManuscript';slots.push(k);}
   else if(['criteria','dispositions','challenges','findings'].includes(k)&&Array.isArray(x)){data[k]=x.map(report);slots.push(k);}
  }
  return {data,slots};
 };
 const receipt=v=>{
  const data={...v},slots=[];let id;
  if(v.parsedOutput&&typeof v.parsedOutput==='object'){id=intern('archiveOriginals',v.parsedOutput);data.parsedOutput=id;slots.push('parsedOutput');}
  if(id!==undefined&&v.responseText===json(tables.archiveOriginals[id])){data.responseText=id;slots.push('responseText');}
  if(v.providerExecution){data.providerExecution=receipt(v.providerExecution);slots.push('providerExecution');}
  return {data,slots};
 };
 const record=v=>{
  const data={...v},projections=[];let reportId=null;
  if(v.rawReport&&typeof v.rawReport==='object'){reportId=intern('archiveOriginals',v.rawReport);data.rawReport=null;for(const [k,x]of Object.entries(v))if(k!=='rawReport'&&k!=='executionReceipt'&&x&&typeof x==='object'&&Object.hasOwn(v.rawReport,k)&&equal(x,v.rawReport[k])){data[k]=null;projections.push(k);}}
  if(v.executionReceipt)data.executionReceipt=receipt(v.executionReceipt);
  return {data,reportId,projections,hasReceipt:Boolean(v.executionReceipt)};
 };
 value.predecessors=value.predecessors.map(p=>({...p,raw:report(p.raw)}));
 if(value.approvedReview)value.approvedReview=report(value.approvedReview);
 if(value.findings)value.findings=value.findings.map(report);
 if(value.productionCorrection)value.productionCorrection={...value.productionCorrection,priorFindings:value.productionCorrection.priorFindings.map(report)};
 if(value.originalProcessArchive)value.originalProcessArchive=archiveWalk(value.originalProcessArchive,record);
 return {modelInputVersion:CONTENT_MODEL_INPUT_VERSION,taskData:value,tables};
}
const plan=Symbol('content-domain-expansion');
const objectPlan=(source,replace=(_key,value)=>value,added={})=>({[plan]:'object',source,entries:function*(){for(const key of Object.keys(source))yield [key,replace(key,source[key])];for(const key of Object.keys(added))if(!Object.hasOwn(source,key))yield [key,added[key]];}});
const arrayPlan=(source,replace=value=>value)=>({[plan]:'array',entries:function*(){for(const value of source)yield replace(value);}});
const deferredPlan=(source,resolve,references=0)=>({[plan]:'deferred',source,resolve,references});
const textPlan=value=>({[plan]:'text',value});
function expansionLedger(){
 const counts={bytes:0,inputBytes:0,records:0,references:0,work:0},active=new Set();
 const limit=(condition)=>need(condition,'CONTENT_MODEL_EXPANSION_LIMIT','Content model expansion exceeds its fixed resource budget');
 const charge=(name,amount=1)=>{counts[name]+=amount;limit(counts[name]<=CONTENT_EXPANSION_LIMITS[name==='inputBytes'?'bytes':name]);};
 function stringBytes(value,escape){
  const slash=2**escape;let bytes=2*slash;
  for(let i=0;i<value.length;i++){
   const c=value.charCodeAt(i);
   if(c===34||c===92)bytes+=2*slash;
   else if(c===8||c===9||c===10||c===12||c===13)bytes+=slash+1;
   else if(c<32)bytes+=slash+5;
   else if(c>=0xd800&&c<=0xdbff){const next=value.charCodeAt(i+1);if(next>=0xdc00&&next<=0xdfff){bytes+=4;i++;}else bytes+=slash+5;}
   else if(c>=0xdc00&&c<=0xdfff)bytes+=slash+5;
   else bytes+=c<128?1:c<2048?2:3;
  }
  return bytes;
 }
 function walk(value,materialize=false,depth=0,escape=0,bytes='bytes'){
  const kind=value?.[plan];
  if(!materialize){charge('work');limit(depth<=CONTENT_EXPANSION_LIMITS.depth);}
  if(kind==='deferred'){
   const identity=value.source;check(!identity||!active.has(identity));if(identity)active.add(identity);
   if(!materialize)charge('references',value.references);
   const result=walk(value.resolve(),materialize,depth,escape,bytes);if(identity)active.delete(identity);return result;
  }
  if(kind==='text'){
   if(!materialize){if(bytes)charge(bytes,2*2**escape);walk(value.value,false,depth,escape+1,bytes);return;}
   return json(walk(value.value,true,depth,0,false));
  }
  if(value&&typeof value==='object'){
   check(!active.has(value));active.add(value);
   const array=kind==='array'||!kind&&Array.isArray(value);
   if(!materialize){charge('records');if(bytes)charge(bytes,2);}
   let entries;
   if(kind==='object')entries=value.entries();
   else if(kind==='array')entries=value.entries();
   else {
    const keys=Object.keys(value);check(array?keys.length===value.length&&keys.every((key,index)=>key===String(index)):Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
    entries=array?value:keys.map(key=>[key,value[key]]);
   }
   const out=materialize?(array?[]:{}):undefined;let index=0;
   for(const entry of entries){
    if(!materialize&&bytes&&index)charge(bytes);
    const key=array?index:entry[0],child=array?entry:entry[1];
    if(!array&&!materialize&&bytes)charge(bytes,stringBytes(key,escape)+1);
    const result=walk(child,materialize,depth+1,escape,bytes);
    if(materialize){if(array)out.push(result);else Object.defineProperty(out,key,{value:result,enumerable:true,writable:true,configurable:true});}
    index++;
   }
   active.delete(value);return out;
  }
  check(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value));
  if(!materialize&&bytes)charge(bytes,typeof value==='string'?stringBytes(value,escape):Buffer.byteLength(json(value)));
  return materialize?value:undefined;
 }
 return {measure(value){walk(value);},measureInput(value){walk(value,false,0,0,'inputBytes');},validate(value){walk(value,false,0,0,false);},materialize(value){return walk(value,true);},counts};
}
function expandModelView(view,ledger=expansionLedger(),inputMeasured=false){
 if(!inputMeasured)ledger.measureInput(view);
 exactKeys(view,['modelInputVersion','taskData','tables']);check(view.modelInputVersion===CONTENT_MODEL_INPUT_VERSION);
 const t=view.tables;exactKeys(t,['locationSchemas','locationRecords','ancestryAnchors','readingEvidence','reports','archiveOriginals']);for(const rows of Object.values(t))check(Array.isArray(rows)&&rows.length<=CONTENT_EXPANSION_LIMITS.records);
 const lookup=(table,id)=>{check(Number.isSafeInteger(id)&&id>=0&&id<t[table].length);return t[table][id];};
 const ref=(table,id)=>deferredPlan(null,()=>lookup(table,id),1);
 for(const schema of t.locationSchemas){exactKeys(schema,['scope','columns','order']);const keys=[...Object.keys(schema.scope),...schema.columns];check(schema.scope.version==='content-source-location-v2'&&locationKinds.includes(schema.scope.kind)&&typeof schema.scope.rootJobId==='string'&&/^[a-f0-9]{64}$/.test(schema.scope.sourceHash)&&/^[a-f0-9]{64}$/.test(schema.scope.projectionHash)&&schema.columns.every(k=>locationColumns.includes(k)));check(Object.keys(schema.scope).every(k=>sharedFields.includes(k))&&schema.columns.every(k=>typeof k==='string'&&!sharedFields.includes(k))&&new Set(keys).size===keys.length&&new Set(schema.order).size===schema.order.length&&keys.length===schema.order.length&&schema.order.every(k=>keys.includes(k)));}
 const value=view.taskData;check(Array.isArray(value.predecessors));
 unique(value.neutral.obligations,'originId');unique(value.sourceLocations,'originId');
 const obs=new Map(value.neutral.obligations.map(o=>[o.originId,o])),locs=new Map(value.sourceLocations.map(l=>[l.originId,l]));
 const location=id=>deferredPlan(null,()=>{const row=lookup('locationRecords',id);check(Array.isArray(row));const schema=lookup('locationSchemas',row[0]);check(row.length===schema.columns.length+1);return {[plan]:'object',entries:function*(){for(const key of schema.order)yield [key,Object.hasOwn(schema.scope,key)?schema.scope[key]:row[schema.columns.indexOf(key)+1]];}};},2);
 const target=id=>{const o=obs.get(id),l=locs.get(id);check(o);return {artifactId:o.artifactId,pointer:o.pointer,owner:o.owner,...(l?{ancestryAnchor:ref('ancestryAnchors',l.ancestryAnchorId),location:location(l.derivedRecordId)}:{})};};
 const obligations=value.neutral.obligations;
 const authorityPlan=a=>{
  const replacements={moduleOwners:arrayPlan(a.moduleOwners,m=>objectPlan(m,(key,v)=>key==='returnTargets'?arrayPlan(m.obligationOriginIds,target):v,{returnTargets:arrayPlan(m.obligationOriginIds,target)})),limits:{[plan]:'array',entries:function*(){for(const o of obligations)if(['restriction','limitation','qualification'].includes(o.kind))yield o;}},returns:arrayPlan(obligations,o=>({originId:o.originId,...target(o.originId)}))};
  return objectPlan(a,(key,v)=>Object.hasOwn(replacements,key)?replacements[key]:v,{limits:replacements.limits,returns:replacements.returns});
 };
 const report=v=>deferredPlan(v,()=>{
  exactKeys(v,['data','slots']);check(Array.isArray(v.slots));const slots=new Set(v.slots);check(slots.size===v.slots.length);for(const k of slots)check(Object.hasOwn(v.data,k));
  return objectPlan(v.data,(k,x)=>{
   if(!slots.has(k))return x;
   if(k==='evidence')return ref('readingEvidence',x);
   if(k==='preservedBlind')return deferredPlan(null,()=>report(lookup('reports',x)),1);
   if(k==='acceptedOriginIds'){check(x==='all-source-obligations-in-order');return arrayPlan(obligations,o=>o.originId);}
   if(k==='manuscript'){check(x==='currentManuscript'&&value.manuscript);return value.manuscript;}
   check(['criteria','dispositions','challenges','findings'].includes(k)&&Array.isArray(x));return arrayPlan(x,report);
  });
 });
 const receipt=v=>deferredPlan(v,()=>{
  exactKeys(v,['data','slots']);check(Array.isArray(v.slots));const slots=new Set(v.slots);check(slots.size===v.slots.length);for(const k of slots)check(Object.hasOwn(v.data,k));
  return objectPlan(v.data,(k,x)=>{
   if(!slots.has(k))return x;
   if(k==='parsedOutput')return ref('archiveOriginals',x);
   if(k==='responseText'){check(slots.has('parsedOutput')&&v.data.parsedOutput===x);return textPlan(ref('archiveOriginals',x));}
   check(k==='providerExecution');return receipt(x);
  });
 });
 const record=v=>deferredPlan(v,()=>{
  exactKeys(v,['data','reportId','projections','hasReceipt']);check(Array.isArray(v.projections));const projections=new Set(v.projections);check(projections.size===v.projections.length&&typeof v.hasReceipt==='boolean');
  const hasOriginal=v.reportId!==null,original=hasOriginal?lookup('archiveOriginals',v.reportId):null;
  if(hasOriginal){check(v.data.rawReport===null);for(const k of v.projections)check(k!=='rawReport'&&k!=='executionReceipt'&&v.data[k]===null&&Object.hasOwn(original,k));}else check(v.reportId===null&&!v.projections.length);
  return objectPlan(v.data,(k,x)=>{
   if(k==='rawReport'&&hasOriginal)return ref('archiveOriginals',v.reportId);
   if(hasOriginal&&projections.has(k))return deferredPlan(null,()=>original[k],1);
   if(k==='executionReceipt'&&v.hasReceipt)return receipt(x);
   return x;
  },v.hasReceipt&&!Object.hasOwn(v.data,'executionReceipt')?{executionReceipt:receipt(v.data.executionReceipt)}:{});
 });
 const archive=value=>objectPlan(value,(key,v)=>!['strategy','copy'].includes(key)||!v?v:objectPlan(v,(k,x)=>{
  if(archiveLists.includes(k)&&x){check(Array.isArray(x));return arrayPlan(x,record);}
  if(k!=='creativePanels'||!x)return x;
  return arrayPlan(x,panel=>objectPlan(panel,(k,x)=>k!=='packet'?x:objectPlan(x,(k,x)=>{
   if(k==='independentEvidenceReviews'&&x)return arrayPlan(x,record);
   if(k==='upstreamConstraints'&&x)return objectPlan(x,(_key,v)=>objectPlan(v,(k,x)=>['readiness','handoffs'].includes(k)&&x?arrayPlan(x,record):x));
   return x;
  })));
 }));
 for(const row of t.reports)ledger.validate(report(row));
 for(let id=0;id<t.locationRecords.length;id++)ledger.validate(location(id));
 const semantic=objectPlan(value,(key,v)=>{
  if(key==='sourceLocations')return arrayPlan(v,row=>{exactKeys(row,['originId','ancestryAnchorId','derivedRecordId','originalRecordIds']);return {originId:row.originId,ancestryAnchor:ref('ancestryAnchors',row.ancestryAnchorId),derived:location(row.derivedRecordId),originals:arrayPlan(row.originalRecordIds,location)};});
  if(key==='predecessors')return arrayPlan(v,p=>objectPlan(p,(k,x)=>k==='raw'?report(x):x,{raw:report(p.raw)}));
  if(key==='approvedReview'&&v)return report(v);
  if(key==='findings'&&v)return arrayPlan(v,report);
  if(key==='productionCorrection'&&v){check(Array.isArray(v.priorFindings));return objectPlan(v,(k,x)=>k==='priorFindings'?arrayPlan(x,report):x);}
  if(key==='originalProcessArchive'&&v)return archive(v);
  if(['planningManifest','workOrder'].includes(key)&&v)return authorityPlan(v);
  return v;
 });
 ledger.measure(semantic);return ledger.materialize(semantic);
}
export function prepareContentModelInput(canonicalInput){
 const {envelopeHash:ignored,...semantic}=canonicalInput;
 const view=encodeModelView(semantic),expanded=expandModelView(view);check(json(expanded)===json(semantic));
 const envelope={modelInputVersion:CONTENT_MODEL_INPUT_VERSION,semanticInputHash:hash(semantic),modelView:view};
 return {...envelope,envelopeHash:hash(envelope)};
}
export function expandContentModelInput(envelope){
 exactKeys(envelope,['modelInputVersion','semanticInputHash','modelView','envelopeHash']);const {envelopeHash,...body}=envelope;const ledger=expansionLedger();ledger.measureInput(body.modelView);check(typeof body.semanticInputHash==='string'&&/^[a-f0-9]{64}$/.test(body.semanticInputHash));check(body.modelInputVersion===CONTENT_MODEL_INPUT_VERSION&&hash(body)===envelopeHash);
 const expanded=expandModelView(body.modelView,ledger,true);check(hash(expanded)===body.semanticInputHash);return {...expanded,envelopeHash};
}
