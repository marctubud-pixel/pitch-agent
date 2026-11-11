import {isDeepStrictEqual as equal} from 'node:util';
import {sketchHash as hash} from './sketch-authority.mjs';
const clone=structuredClone;
const text=x=>typeof x==='string'&&x.trim().length>0;
const projectedKinds=new Set(['source','claim','direction','restriction']);
export const CONTENT_PROSE_PROJECTION='content-prose-projection-v1';
const escape=x=>String(x).replace(/~/g,'~0').replace(/\//g,'~1');
function need(ok,code,o,extra={}){if(!ok)throw Object.assign(new Error(code),{code,details:{owner:o.owner,originId:o.originId,artifactId:o.artifactId,pointer:o.pointer,...extra}});}
function exactKnown(value,allowed,o,pointer){need(value&&typeof value==='object'&&!Array.isArray(value),'CONTENT_PROSE_VALUE_INVALID',o,{pointer});for(const key of Object.keys(value))need(allowed.includes(key),'CONTENT_PROSE_UNSUPPORTED_FIELD',o,{pointer:`${pointer}/${escape(key)}`});}
export function readableSourceRestrictions(r,o){
 const out=[],add=(pointer,value,rendered)=>out.push({pointer,valueHash:hash(value),text:rendered});
 if(r.reason!==undefined){need(text(r.reason),'CONTENT_PROSE_VALUE_INVALID',o);add('/reason',r.reason,`Source note: ${r.reason}`);}
 if(r.notes!==undefined){const notes=Array.isArray(r.notes)?r.notes:[r.notes];need(notes.every(text),'CONTENT_PROSE_VALUE_INVALID',o);notes.forEach((note,i)=>add(Array.isArray(r.notes)?`/notes/${i}`:'/notes',note,`Source note: ${note}`));}
 if(r.scopeAssessment){
  const v=r.scopeAssessment;exactKnown(v,['purpose','object','scenario','time','users','materialType','reason'],o,`${o.pointer}/scopeAssessment`);
  const labels={purpose:'Source purpose',object:'Source subject',scenario:'Use scenario',time:'Time applicability',users:'User applicability'};
  for(const [key,label]of Object.entries(labels)){need(v[key]==='unknown'||v[key]===false,'CONTENT_PROSE_VALUE_INVALID',o,{field:`scopeAssessment/${key}`});add(`/scopeAssessment/${key}`,v[key],v[key]===false?`${label} is not supported.`:`${label} is unknown.`);}
  exactKnown(v.materialType,['state','mimeType','captureRecordHash'],o,`${o.pointer}/scopeAssessment/materialType`);need(v.materialType.state==='known'&&text(v.materialType.mimeType),'CONTENT_PROSE_VALUE_INVALID',o);add('/scopeAssessment/materialType',v.materialType,`Captured material type: ${v.materialType.mimeType}. This does not establish semantic suitability.`);
  need(text(v.reason),'CONTENT_PROSE_VALUE_INVALID',o);add('/scopeAssessment/reason',v.reason,`Scope limit: ${v.reason}`);
 }
 if(r.caseIdentity){
  const c=r.caseIdentity;exactKnown(c,['packetHash','actualImageManifestHash','reportHash','pageCaptureHash','sourceImageCaptureHash','sourceImageUrl','fields','taskFit','imageMatch','limitations'],o,`${o.pointer}/caseIdentity`);
  exactKnown(c.fields,['brand','product','edition','time','use'],o,`${o.pointer}/caseIdentity/fields`);
  for(const [key,v]of Object.entries(c.fields)){exactKnown(v,['status','value','reason','refs','pixels'],o,`${o.pointer}/caseIdentity/fields/${key}`);need(['supported','unknown','contradicted'].includes(v.status)&&text(v.value)&&text(v.reason),'CONTENT_PROSE_VALUE_INVALID',o);add(`/caseIdentity/fields/${key}`,v,v.status==='unknown'?`Case ${key} is unknown. ${v.reason}`:v.status==='contradicted'?`Case ${key} is contradicted by the retained evidence: ${v.value}. ${v.reason}`:`Source-attributed case ${key}: ${v.value}. ${v.reason}`);}
  exactKnown(c.taskFit,['status','reason','refs'],o,`${o.pointer}/caseIdentity/taskFit`);exactKnown(c.imageMatch,['status','reason','refs','pixels'],o,`${o.pointer}/caseIdentity/imageMatch`);
  for(const key of ['taskFit','imageMatch']){need(text(c[key].reason),'CONTENT_PROSE_VALUE_INVALID',o);add(`/caseIdentity/${key}`,c[key],`Case applicability limit: ${c[key].reason}`);}
  need(Array.isArray(c.limitations)&&c.limitations.every(text),'CONTENT_PROSE_VALUE_INVALID',o);c.limitations.forEach((limit,i)=>add(`/caseIdentity/limitations/${i}`,limit,`Limit: ${limit}`));
 }
 return out;
}
function sourceFields(r,o){
 const allowed=['id','title','label','url','text','publisher','author','attribution','organization','limitations','reason','notes','scopeRelation','verification','intendedUse','provenance','scopeAssessment','identityStatus','identityMeaning','caseIdentity'];
 exactKnown(r,allowed,o,o.pointer);
 if(r.provenance){
  const variants={user_provided:['kind','projectId','taskCardId','sourceEntryId','sourceEntryHash','originalUrl'],registered_intake_material:['kind','documentId','documentHash','rawHash','extractionHash','textHash'],research_acquisition_capture:['kind','generationId','captureRecordHash','rawSha256','textHash','extractionIdentity','locator','discoveryEdgeIds']};
  const keys=variants[r.provenance.kind];need(keys,'CONTENT_PROSE_UNSUPPORTED_FIELD',o,{pointer:`${o.pointer}/provenance/kind`});exactKnown(r.provenance,keys,o,`${o.pointer}/provenance`);
  if(r.provenance.kind==='research_acquisition_capture'){
   exactKnown(r.provenance.locator,['kind','start','end'],o,`${o.pointer}/provenance/locator`);
   exactKnown(r.provenance.extractionIdentity,['adapter','charset','binary','configuredBinary','binarySha256','scriptSha256','python','pythonVersion','pypdf','pdfplumber','memoryLimit','hardAddressSpaceLimit','memoryEnforcement'],o,`${o.pointer}/provenance/extractionIdentity`);
  }
 }
 readableSourceRestrictions(r,o);
 const key=['title','label','url'].find(key=>text(r[key]));need(key,'CONTENT_CITATION_LABEL_REQUIRED',o);return {key,label:r[key]};
}
export function deriveContentProseProjection(basis){
 const entries=[];
 for(const [obligationIndex,o]of basis.obligations.entries()){
  if(!projectedKinds.has(o.kind))continue;
  const value=o.value,fields=[],lines=[],links=[];
  const keys=(allowed)=>{need(value&&typeof value==='object'&&!Array.isArray(value),'CONTENT_PROSE_VALUE_INVALID',o);for(const key of Object.keys(value))need(allowed.includes(key),'CONTENT_PROSE_UNSUPPORTED_FIELD',o,{pointer:`${o.pointer}/${escape(key)}`});};
  const archive=(key,disposition='process_archive')=>{if(Object.hasOwn(value,key))fields.push({pointer:`/${escape(key)}`,valueHash:hash(value[key]),disposition});};
  const emit=(key,prefix='',required=false)=>{
   if(!Object.hasOwn(value,key)){need(!required,'CONTENT_PROSE_FIELD_REQUIRED',o,{field:key});return;}
   need(text(value[key]),'CONTENT_PROSE_VALUE_INVALID',o,{field:key});const line=prefix+value[key],start=lines.join('\n').length+(lines.length?1:0)+prefix.length;
   fields.push({pointer:`/${escape(key)}`,valueHash:hash(value[key]),disposition:'visible',ranges:[{start,end:start+value[key].length}]});lines.push(line);
  };
  const list=(key,prefix='')=>{
   if(!Object.hasOwn(value,key))return;need(Array.isArray(value[key])&&value[key].every(text),'CONTENT_PROSE_VALUE_INVALID',o,{field:key});
   fields.push({pointer:`/${escape(key)}`,valueHash:hash(value[key]),disposition:value[key].length?'visible':'empty',ranges:[]});
   for(const item of value[key]){const start=lines.join('\n').length+(lines.length?1:0)+prefix.length;fields.at(-1).ranges.push({start,end:start+item.length});lines.push(prefix+item);}
  };
  if(o.kind==='source'){
   sourceFields(value,o);const key=['title','label','url'].find(key=>text(value[key]));emit(key,'Source: ',true);
   if(key!=='url'&&text(value.url))emit('url','URL: ');
   for(const key of ['publisher','author','attribution','organization'])if(text(value[key]))emit(key,'Attribution: ');
   list('limitations','Limit: ');
   for(const part of readableSourceRestrictions(value,o)){const start=lines.join('\n').length+(lines.length?1:0);fields.push({pointer:part.pointer,valueHash:part.valueHash,disposition:'visible',ranges:[{start,end:start+part.text.length}],renderedText:part.text});lines.push(part.text);}
   lines.push('A citation preserves the supplied source record. It does not authenticate the source.');
   for(const key of Object.keys(value))if(!fields.some(f=>f.pointer===`/${escape(key)}`))archive(key,fields.some(f=>f.pointer.startsWith(`/${escape(key)}/`))?'container':key==='text'?'source_text_archive':'process_archive');
  }else if(o.kind==='claim'){
   keys(['id','text','kind','basisKind','evidenceRefs','limitations','verification']);
   need(['fact','inference','creative'].includes(value.kind),'CONTENT_PROSE_VALUE_INVALID',o,{field:'kind'});
   const labels={fact:value.basisKind==='project_requirement'?'Confirmed project requirement: ':'Source-attributed finding: ',inference:'Inference: ',creative:'Creative proposal: '};
   emit('text',labels[value.kind],true);archive('kind','classification');archive('basisKind','classification');archive('id');archive('verification');
   need(Array.isArray(value.evidenceRefs)&&value.evidenceRefs.every(text),'CONTENT_PROSE_VALUE_INVALID',o,{field:'evidenceRefs'});
   for(const sourceId of value.evidenceRefs){const record=basis.sources.find(r=>r.id===sourceId);need(record,'CONTENT_PROSE_REFERENCE_REQUIRED',o,{sourceId});const citation=sourceFields(record,o);lines.push(`Source: ${citation.label}`);links.push({sourceId,recordHash:hash(record),labelPointer:`/${citation.key}`,labelHash:hash(citation.label)});}
   archive('evidenceRefs','citation_links');list('limitations','Limit: ');
  }else if(o.kind==='direction'){
   keys(['id','title','slogan','supportingCopy','creativeExplanation','rationale','differentiation','evidenceIds']);
   for(const key of ['title','slogan','supportingCopy','creativeExplanation','rationale','differentiation'])emit(key,'',key==='title'||key==='slogan');
   archive('id');archive('evidenceIds','claim_links');
  }else if(Object.hasOwn(value??{},'prohibitedUse')){
   keys(['originKey','sourceKey','material','permittedUse','prohibitedUse','activationCondition','returnStage']);
   emit('material','Evidence condition: ',true);emit('permittedUse','Permitted use: ',true);emit('prohibitedUse','Restriction: ',true);emit('activationCondition','Activation condition: ',true);
   for(const key of ['originKey','sourceKey','returnStage'])archive(key);
  }else{
   keys(['id','targetId','targetIds','condition','blocking','description','owner','returnLocation','acceptance','evidence']);
   emit('description','Limit: ',true);emit('acceptance','Required correction: ',true);
   for(const key of ['id','targetId','targetIds','condition','blocking','owner','returnLocation','evidence'])archive(key);
  }
  need(lines.length>0,'CONTENT_PROSE_EMPTY',o);
  const exactText=lines.join('\n'),entry={originId:o.originId,kind:o.kind,originalObligationIndex:obligationIndex,originalObligationHash:hash(o),originalValueHash:hash(value),owner:o.owner,artifactId:o.artifactId,pointer:o.pointer,fields,links,exactText,textHash:hash(exactText)};
  entries.push(entry);
 }
 const data={version:CONTENT_PROSE_PROJECTION,basisSourceHash:basis.sourceHash,entries};return {...data,projectionHash:hash(data)};
}
export function applyContentProseProjection(source,basis){
 const projection=deriveContentProseProjection(basis),byId=new Map(projection.entries.map(e=>[e.originId,e]));
 source.proseProjection=projection;
 source.obligations=source.obligations.map(o=>{const entry=byId.get(o.originId);return entry?{...o,proseProjection:{version:CONTENT_PROSE_PROJECTION,projectionHash:projection.projectionHash,entryHash:hash(entry),exactText:entry.exactText,textHash:entry.textHash,originalValueHash:entry.originalValueHash}}:o;});
 return source;
}
export function requireContentProseProjection(source){
 const basis=source.immutableBasis,expected=deriveContentProseProjection(basis),copy=applyContentProseProjection({obligations:clone(source.obligations).map(o=>{const copy={...o};delete copy.proseProjection;return copy;})},basis);
 const o=basis.obligations[0]??{owner:'content-author'};
 need(equal(source.proseProjection,expected)&&equal(source.obligations,copy.obligations),'CONTENT_PROSE_PROJECTION_CHANGED',o);
 for(const entry of expected.entries){const actual=source.obligations.find(o=>o.originId===entry.originId),original=basis.obligations[entry.originalObligationIndex];need(actual,'CONTENT_PROSE_PROJECTION_CHANGED',entry);const {proseProjection,...body}=actual;need(equal(body,original)&&hash(actual.value)===entry.originalValueHash&&proseProjection.originalValueHash===entry.originalValueHash,'CONTENT_PROSE_PROJECTION_CHANGED',entry);}
 return source;
}

export function requireProjectedManuscriptText(manuscript,source){
 for(const entry of source.proseProjection.entries){
  const o=source.obligations.find(o=>o.originId===entry.originId),blocks=manuscript.narrativeBlocks.filter(b=>b.originIds.includes(entry.originId));
  need(blocks.length&&blocks.every(b=>b.kind==='source'&&b.text===entry.exactText),'CONTENT_PROSE_BODY_CHANGED',o);
  need(!manuscript.edits.some(e=>e.originId===entry.originId),'CONTENT_PROSE_BODY_CHANGED',o);
 }
}
