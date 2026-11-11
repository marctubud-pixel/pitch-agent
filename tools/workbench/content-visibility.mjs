import {applyContentProseProjection} from './content-prose-projection.mjs';
import {numericContentContract,NUMERIC_CONTENT_CONTRACT} from './content-contract-versions.mjs';
import {validateChartContentSource} from './chart-content.mjs';
import {createHash} from 'node:crypto';
import {evidenceStateHash} from './evidence-review.mjs';
import {isDeepStrictEqual as equal} from 'node:util';
import {referenceNodePlan, referenceNodeInput, referenceOriginalReportTargets} from './reference-dossier.mjs';

export const VISIBILITY_VERSION='content-visibility-v1';
export const SOURCE_VERSION='content-source-v2';
export const MANUSCRIPT_VERSION='complete-manuscript-v2';
const hash=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const clone=structuredClone;
const contexts=new WeakSet();
const nonempty=x=>typeof x==='string'&&x.trim().length>0;
const unique=xs=>new Set(xs).size===xs.length;
const sameIds=(a,b)=>Array.isArray(a)&&a.length===b.length&&unique(a)&&b.every(x=>a.includes(x));
const escape=x=>String(x).replace(/~/g,'~0').replace(/\//g,'~1');
const exactKeys=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&sameIds(Object.keys(x),keys);
function requireValue(ok,code,details={}) {if(!ok)throw Object.assign(new Error(code),{code,details});}
export function visibilityPointer(value,pointer) {
 requireValue(typeof pointer==='string'&&(pointer===''||pointer.startsWith('/'))&&!/~(?![01])/u.test(pointer),'VISIBILITY_POINTER_INVALID',{pointer});
 return pointer===''?value:pointer.slice(1).split('/').reduce((v,k)=>v&&typeof v==='object'&&Object.hasOwn(v,k.replace(/~1/g,'/').replace(/~0/g,'~'))?v[k.replace(/~1/g,'/').replace(/~0/g,'~')]:undefined,value);
}
function freezeDeep(x) {if(x&&typeof x==='object'){Object.values(x).forEach(freezeDeep);Object.freeze(x);}return x;}
function checkBasis(source) {const {sourceHash,...basis}=source;requireValue(sourceHash===hash(basis),'VISIBILITY_BASIS_CHANGED');}
const stringSchema={type:'string'};
const nullableString={type:['string','null']};
const arraySchema=items=>({type:'array',items});
const objectSchema=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const imageSchema=objectSchema({imageId:stringSchema,sha256:stringSchema,mediaType:stringSchema,byteLength:{type:'integer'}});
const evidenceSchema=objectSchema({kind:stringSchema,imageId:nullableString,imageHash:nullableString,region:{anyOf:[arraySchema({type:'number'}),{type:'null'}]},pointer:nullableString,quote:nullableString,observation:stringSchema});
const qualificationSchema=objectSchema({
 sourceReportId:stringSchema,sourceNodeKey:stringSchema,sourceReportHash:stringSchema,dossierId:stringSchema,packetId:nullableString,packetHash:nullableString,
 unknownDimensions:arraySchema(objectSchema({useId:stringSchema,dimension:stringSchema,status:stringSchema,reason:stringSchema,evidence:arraySchema(evidenceSchema)})),
 unknownComparisons:arraySchema(objectSchema({pair:arraySchema(stringSchema),judgment:stringSchema,reason:stringSchema,evidence:arraySchema(evidenceSchema)})),
 images:arraySchema(imageSchema),limitations:arraySchema(stringSchema),
 issues:arraySchema(objectSchema({id:stringSchema,sourceFindingId:stringSchema,pointer:stringSchema,category:stringSchema,owner:stringSchema,evidence:arraySchema(evidenceSchema),impact:stringSchema,acceptance:stringSchema}))
});
const qualificationsSchema=objectSchema({referenceBoundaries:arraySchema(objectSchema({directionId:stringSchema,uses:arraySchema(objectSchema({useId:stringSchema,imageId:stringSchema,allowedBorrowing:nullableString,prohibitedCopying:nullableString,limitation:nullableString,uncertainties:arraySchema(stringSchema)}))})),referenceQualifications:arraySchema(qualificationSchema)});
function schemaType(value,type){return type==='null'?value===null:type==='array'?Array.isArray(value):type==='object'?value!==null&&typeof value==='object'&&!Array.isArray(value):type==='integer'?Number.isSafeInteger(value):typeof value===type;}
function typedFields(value,schema,pointer='',out=[],schemaPointer='#') {
 requireValue(schema&&typeof schema==='object','VISIBILITY_UNSUPPORTED_FIELD',{pointer});
 if(schema.anyOf){const index=schema.anyOf.findIndex(s=>[].concat(s.type??[]).some(t=>schemaType(value,t)));requireValue(index>=0,'VISIBILITY_FIELD_TYPE',{pointer});return typedFields(value,schema.anyOf[index],pointer,out,`${schemaPointer}/anyOf/${index}`);}
 requireValue([].concat(schema.type??[]).some(t=>schemaType(value,t)),'VISIBILITY_FIELD_TYPE',{pointer});
 out.push({pointer,schemaPointer,value});
 if(Array.isArray(value)){
  requireValue(schema.items,'VISIBILITY_UNSUPPORTED_FIELD',{pointer});
  value.forEach((v,i)=>typedFields(v,schema.items,`${pointer}/${i}`,out,`${schemaPointer}/items`));
 }else if(value!==null&&typeof value==='object'){
  requireValue(schema.properties,'VISIBILITY_UNSUPPORTED_FIELD',{pointer});
  for(const [k,v] of Object.entries(value)){requireValue(Object.hasOwn(schema.properties,k),'VISIBILITY_UNSUPPORTED_FIELD',{pointer:`${pointer}/${escape(k)}`});typedFields(v,schema.properties[k],`${pointer}/${escape(k)}`,out,`${schemaPointer}/properties/${escape(k)}`);}
  for(const k of schema.required??[])requireValue(Object.hasOwn(value,k),'VISIBILITY_FIELD_REQUIRED',{pointer:`${pointer}/${escape(k)}`});
 }
 return out;
}
function fieldDispositions(value,schema,containerId,containerHash,version,materialPointers=[]){
 return typedFields(value,schema).map(({pointer,schemaPointer,value:v})=>({containerId,containerHash,pointer,schemaPointer,disposition:v===null||v&&typeof v==='object'&&!Object.keys(v).length?'empty':materialPointers.some(p=>pointer===p||pointer.startsWith(`${p}/`))?'material':'technical_audit',rule:`${version}:${schemaPointer}`,valueHash:hash(v)}));
}
export function resolveContentReferenceContext(project,basisSource) {
 checkBasis(basisSource);
 typedFields(basisSource.qualifications,qualificationsSchema,'/qualifications');
 const qualifications=basisSource.qualifications.referenceQualifications,records=[],originals=new Map();
 requireValue(Array.isArray(qualifications)&&unique(qualifications.map(q=>`${q.dossierId}/${q.sourceReportId}`)),'VISIBILITY_QUALIFICATION_ID');
 for(const q of qualifications){
  requireValue(Object.keys(q).every(k=>['sourceReportId','sourceNodeKey','sourceReportHash','dossierId','packetId','packetHash','unknownDimensions','unknownComparisons','images','limitations','issues'].includes(k)),'VISIBILITY_UNSUPPORTED_FIELD',{sourceReportId:q.sourceReportId});
  const dossier=project.referenceDossiers?.find(d=>d.id===q.dossierId),stored=dossier?.reports.find(r=>r.id===q.sourceReportId);
  requireValue(stored&&stored.nodeKey===q.sourceNodeKey&&hash(stored.rawReport)===q.sourceReportHash,'VISIBILITY_ORIGINAL_REQUIRED',{sourceReportId:q.sourceReportId,owner:'reference-lead'});
  const raw=stored.rawReport,declaredNode=referenceNodePlan(dossier,project).find(n=>n.key===stored.nodeKey);
  requireValue(declaredNode&&['review','assignment','copy-owner','reference-owner','plan','collector','merge'].includes(declaredNode.kind),'VISIBILITY_UNSUPPORTED_PROTOCOL',{sourceReportId:q.sourceReportId});
  let facts=originals.get(dossier.id);
  if(!facts){
   try{facts=referenceOriginalReportTargets(project,dossier,qualifications.filter(q=>q.dossierId===dossier.id).map(q=>q.sourceReportId));}catch(error){
    const receiptErrors=['Exact successful canonical reference receipt required','Receipt must confirm every exact attached original','Independent provider thread required','Original response bytes required','Original raw response changed','Original provider receipt changed'];
    const code=error.message==='Stored normalized reference report changed'?'VISIBILITY_REPORT_HASH':error.message==='Stored reference outcome requires original completed attempt'?'VISIBILITY_RECEIPT_REQUIRED':receiptErrors.includes(error.message)||error.code==='REFERENCE_CONTEXT_REUSED'?'VISIBILITY_RECEIPT_CHANGED':null;
    if(!code)throw error;
    requireValue(false,code,{sourceReportId:error.referenceReportId??stored.id,cause:error.code,reason:error.message});
   }
   originals.set(dossier.id,facts);
  }
  const fact=facts.find(entry=>entry.stored.id===stored.id),{node,input,request}=fact,schema=request.outputSchema;
  typedFields(raw,schema);
  requireValue(q.packetId===(raw.packetId??null)&&q.packetHash===(raw.packetHash??null)&&equal(q.images,raw.images??[])&&equal(q.limitations,raw.limitations),'VISIBILITY_PACKET_CHANGED',{sourceReportId:stored.id});
  const uses=node.kind==='review'?input.uses??referenceNodeInput(dossier,{...node,phase:'score',role:'visual',key:`${node.packetId}:visual:score`,dependencies:[]},project).uses:node.kind==='collector'?raw.uses.filter(u=>dossier.reports.find(r=>r.nodeKey===`merge-${node.index}`)?.rawReport.acceptedUseIds.includes(u.id)):node.kind==='merge'?dossier.reports.find(r=>r.nodeKey===`collector-${node.index}`).rawReport.uses.filter(u=>raw.acceptedUseIds.includes(u.id)):[];
  requireValue(Array.isArray(uses),'VISIBILITY_SCOPE_UNPROVED',{sourceReportId:stored.id});
  const directions=node.directionId?[node.directionId]:node.kind==='review'?[...new Set(uses.map(u=>u.directionId))]:clone(dossier.envelope.directionIds);
  const assignment=dossier.reports.find(r=>r.nodeKey==='assignment');
  requireValue(directions.length&&directions.every(id=>dossier.envelope.directionIds.includes(id))&&equal(assignment.rawReport.assignment.directions,dossier.envelope.directionIds),'VISIBILITY_SCOPE_UNPROVED',{sourceReportId:stored.id});
  const expectedDimensions=(raw.evaluations??[]).flatMap(e=>e.dimensions.filter(d=>d.status==='unknown').map(d=>({useId:e.useId,dimension:d.dimension,status:d.status,reason:d.reason,evidence:clone(d.evidence??[])})));
  const expectedComparisons=(raw.comparisons??[]).filter(c=>c.judgment==='unknown').map(c=>({pair:clone(c.pair),judgment:c.judgment,reason:c.reason,evidence:clone(c.evidence??[])}));
  const expectedIssues=['issues','challenges'].flatMap(key=>(raw[key]??[]).filter(f=>f.category!=='creative_preference').map(f=>({id:f.id,sourceFindingId:`${stored.id}#${f.id}`,pointer:`/${key}/${raw[key].indexOf(f)}`,category:f.category,owner:f.owner,evidence:clone(f.evidence??[]),impact:f.impact,acceptance:f.acceptance})));
  requireValue(equal(q.unknownDimensions,expectedDimensions)&&equal(q.unknownComparisons,expectedComparisons)&&equal(q.issues,expectedIssues),'VISIBILITY_REDUCED_ORIGINAL_MISMATCH',{sourceReportId:stored.id});
  const images=dossier.candidates.map(c=>c.image);
  requireValue(uses.every(u=>images.some(i=>i.imageId===u.imageId)&&directions.includes(u.directionId)),'VISIBILITY_IMAGE_SCOPE_MISSING',{sourceReportId:stored.id});
  records.push({qualification:clone(q),dossierId:dossier.id,envelopeHash:dossier.envelope.envelopeHash,reportId:stored.id,nodeKey:stored.nodeKey,node:clone(node),raw:clone(raw),rawHash:fact.rawHash,storedHash:fact.reportHash,receiptHash:fact.receiptHash,input:clone(input),inputHash:hash(input),schema:clone(schema),uses:clone(uses),directions,images:clone(images),assignment:{reportId:assignment.id,reportHash:hash(assignment.rawReport),directions:clone(dossier.envelope.directionIds)}});
 }
 const boundaries=clone(basisSource.qualifications.referenceBoundaries);
 for(const boundary of boundaries)for(const use of boundary.uses){
  const matches=records.flatMap(r=>r.uses).filter(u=>u.id===use.useId&&u.imageId===use.imageId&&u.directionId===boundary.directionId);
  requireValue(matches.length&&matches.every(u=>equal(u,matches[0])),'VISIBILITY_BOUNDARY_USE_MISSING',{useId:use.useId,owner:'reference-lead'});
 }
 const data={basisSourceHash:basisSource.sourceHash,records,boundaries};
 const context=freezeDeep({...data,digest:hash(data)});contexts.add(context);return context;
}
function reportScope(record) {
 return {kind:'report',dossierId:record.dossierId,sourceReportId:record.reportId,sourceReportHash:record.rawHash,protocol:record.raw.protocolVersion,nodeKind:record.node.kind,directionIds:record.directions,useIds:record.uses.map(u=>u.id),dependency:{nodeKey:record.nodeKey,dependencies:record.node.dependencies,inputHash:record.inputHash,assignment:record.assignment}};
}
function useScope(record,ids,kind='reference_use') {
 requireValue(ids.length&&unique(ids)&&ids.every(id=>record.uses.some(u=>u.id===id)),'VISIBILITY_LOCAL_SCOPE_MISSING',{sourceReportId:record.reportId,owner:'reference-lead'});
 return {kind,dossierId:record.dossierId,...(record.raw.packetId?{packetId:record.raw.packetId,packetHash:record.raw.packetHash}:{}),uses:ids.map(id=>{const u=record.uses.find(u=>u.id===id);const image=record.images.find(i=>i.imageId===u.imageId);requireValue(image,'VISIBILITY_IMAGE_SCOPE_MISSING',{useId:id});return {useId:id,directionId:u.directionId,imageId:u.imageId,imageHash:image.sha256};})};
}
function findingScope(record,finding,useId) {
 if(useId)return useScope(record,[useId]);
 const ids=new Set();
 for(const e of finding.evidence??[]){
  if(e.kind==='pixel')for(const u of record.uses.filter(u=>u.imageId===e.imageId))ids.add(u.id);
  const pointer=typeof e==='string'?e:e.kind==='pointer'?e.pointer:null;
  const m=pointer?.match(/^\/uses\/(\d+)(?:\/|$)/u);if(m&&record.input.uses?.[Number(m[1])])ids.add(record.input.uses[Number(m[1])].id);
 }
 const m=finding.pointer?.match(/^\/uses\/(\d+)(?:\/|$)/u);if(m&&record.input.uses?.[Number(m[1])])ids.add(record.input.uses[Number(m[1])].id);
 if(ids.size)return useScope(record,[...ids]);
 requireValue(record.node.kind!=='review','VISIBILITY_FINDING_SCOPE_UNPROVED',{sourceReportId:record.reportId,findingId:finding.id,owner:finding.owner});
 return reportScope(record);
}
function dispositionFor(context,record,finding){
 if(record.node.kind!=='review')return {status:'unresolved',proof:[]};
 const key=`${record.nodeKey}#${finding.id}`,matches=context.records.filter(r=>r.dossierId===record.dossierId&&r.raw.packetId===record.raw.packetId&&r.raw.packetHash===record.raw.packetHash).flatMap(r=>(r.raw.adjudications??[]).filter(a=>a.findingKey===key).map(a=>({record:r,adjudication:a})));
 requireValue(matches.length<=1,'VISIBILITY_DISPOSITION_AMBIGUOUS',{key});
 if(!matches.length)return {status:'unresolved',proof:[]};
 const {record:director,adjudication:a}=matches[0];
 requireValue(a.owner===finding.owner&&a.acceptance===finding.acceptance,'VISIBILITY_DISPOSITION_CHANGED',{key});
 return {status:a.disposition,proof:[{sourceReportId:director.reportId,sourceReportHash:director.rawHash,packetHash:director.raw.packetHash,findingKey:key,legacyFindingKey:`${record.reportId}#${finding.id}`,equalityProof:{reportId:record.reportId,nodeKey:record.nodeKey,findingId:finding.id,originalValueHash:hash(finding)},value:clone(a)}]};
}
export function projectContentVisibility(basisSource,context,version=VISIBILITY_VERSION) {
 checkBasis(basisSource);requireValue(version===VISIBILITY_VERSION&&contexts.has(context)&&context.basisSourceHash===basisSource.sourceHash,'VISIBILITY_TRUSTED_CONTEXT_REQUIRED');
 const clauses=[],occurrences=[],fieldCoverage=[],archivedOccurrences=[];
 const add=(record,pointer,content,kind,effect,scope,owner='reference-lead',disposition={status:'active',proof:[]})=>{
  const value=visibilityPointer(record.raw,pointer);requireValue(value!==undefined,'VISIBILITY_POINTER_MISSING',{sourceReportId:record.reportId,pointer,owner});
  const identity={content,kind,effect},clauseId=`clause-${hash(identity)}`;
  const occurrence={occurrenceId:`occurrence-${hash([record.dossierId,record.reportId,pointer])}`,clauseId,legacyOriginId:`${record.reportId}#${pointer}`,sourceArtifactId:basisSource.visual.artifactId,originalContainerId:record.reportId,originalContainerHash:record.rawHash,originalPointer:pointer,valueHash:hash(value),sourceOwner:owner,applicability:clone(scope),scopeProof:[{inputHash:record.inputHash,packetHash:record.raw.packetHash??null,reportHash:record.rawHash,assignment:record.assignment}],disposition:disposition.status,dispositionProof:disposition.proof};
  if(disposition.status==='rejected'){archivedOccurrences.push(occurrence);return;}
  if(!clauses.some(c=>c.clauseId===clauseId))clauses.push({clauseId,...identity});occurrences.push(occurrence);
 };
 for(const record of context.records){
  const r=record.raw,materials=[];
  const material=(pointer,content,kind,effect,scope,owner,disposition)=>{materials.push(...(content.variant==='finding'?[`${pointer}/impact`,`${pointer}/acceptance`]:['dimension_unknown','comparison_unknown'].includes(content.variant)?[`${pointer}/reason`]:[pointer]));add(record,pointer,content,kind,effect,scope,owner,disposition);};
  r.limitations.forEach((s,i)=>material(`/limitations/${i}`,{variant:'exact_string',text:s},'report_processing','processing_boundary',reportScope(record)));
  (r.readings??[]).forEach((reading,i)=>reading.uncertainties.forEach((s,j)=>material(`/readings/${i}/uncertainties/${j}`,{variant:'reading_uncertainty',text:s},'uncertainty','unknown',useScope(record,record.uses.filter(u=>u.imageId===reading.imageId).map(u=>u.id),'image'))));
  (r.evaluations??[]).forEach((evaluation,i)=>{
   evaluation.dimensions.forEach((d,j)=>{if(d.status==='unknown')material(`/evaluations/${i}/dimensions/${j}`,{variant:'dimension_unknown',useId:evaluation.useId,dimension:d.dimension,status:'unknown',reason:d.reason},'uncertainty','unknown',useScope(record,[evaluation.useId]));});
   evaluation.hardRejects.forEach((f,j)=>{const d=dispositionFor(context,record,f);material(`/evaluations/${i}/hardRejects/${j}`,{variant:'finding',category:f.category,impact:f.impact,acceptance:f.acceptance,rule:f.rule},'hard_rejection',d.status,findingScope(record,f,evaluation.useId),f.owner,d);});
  });
  (r.comparisons??[]).forEach((c,i)=>{if(c.judgment==='unknown')material(`/comparisons/${i}`,{variant:'comparison_unknown',pair:clone(c.pair),judgment:'unknown',reason:c.reason},'uncertainty','unknown',useScope(record,c.pair,'comparison'));});
  for(const key of ['issues','challenges','findings'])(r[key]??[]).forEach((f,i)=>{const d=dispositionFor(context,record,f);material(`/${key}/${i}`,{variant:'finding',category:f.category,impact:f.impact,acceptance:f.acceptance},key==='challenges'?'challenge':key==='findings'?'production_finding':'issue',f.category==='creative_preference'?'visible_dissent':d.status,findingScope(record,f),f.owner,d);});
  fieldCoverage.push(...fieldDispositions(r,record.schema,record.reportId,record.rawHash,r.protocolVersion,materials));
 }
 context.boundaries.forEach((boundary,i)=>boundary.uses.forEach((use,j)=>{
  const original=context.records.find(r=>r.uses.some(u=>u.id===use.useId&&u.imageId===use.imageId&&u.directionId===boundary.directionId));
  const scope=useScope(original,[use.useId]),raw=context.boundaries;
  const record={...original,raw,reportId:`${basisSource.visual.artifactId}/referenceBoundaries`,rawHash:hash(raw)};
  for(const key of ['allowedBorrowing','prohibitedCopying','limitation','uncertainties']){
   const value=use[key],pointer=`/${i}/uses/${j}/${key}`;
   if(Array.isArray(value))value.forEach((s,k)=>add(record,`${pointer}/${k}`,{variant:'exact_string',text:s},'reference_boundary',key,scope));
   else if(value!==null)add(record,pointer,{variant:'exact_string',text:value},'reference_boundary',key,scope);
  }
 }));
 const boundaryMaterials=context.boundaries.flatMap((b,i)=>b.uses.flatMap((u,j)=>['allowedBorrowing','prohibitedCopying','limitation','uncertainties'].map(k=>`/referenceBoundaries/${i}/uses/${j}/${k}`)));
 fieldCoverage.push(...fieldDispositions(basisSource.qualifications,qualificationsSchema,'basis-qualifications',hash(basisSource.qualifications),'content-source-v1:exact-original-index',boundaryMaterials));
 fieldCoverage.push(...fieldDispositions(context.boundaries,qualificationsSchema.properties.referenceBoundaries,`${basisSource.visual.artifactId}/referenceBoundaries`,hash(context.boundaries),'boundary-v1',boundaryMaterials.map(p=>p.slice('/referenceBoundaries'.length))));
 const sourceReturns=occurrences.filter(o=>{const c=clauses.find(c=>c.clauseId===o.clauseId);return c.content.variant==='finding'&&c.content.category!=='creative_preference'&&['unresolved','sustained'].includes(o.disposition);}).map(o=>({occurrenceId:o.occurrenceId,sourceReportId:o.originalContainerId,pointer:o.originalPointer,owner:o.sourceOwner,disposition:o.disposition,acceptance:clauses.find(c=>c.clauseId===o.clauseId).content.acceptance}));
 const referenceUses=context.boundaries.flatMap(b=>b.uses.map(u=>({directionId:b.directionId,useId:u.useId,imageId:u.imageId})));
 const data={version,basisSourceHash:basisSource.sourceHash,contextDigest:context.digest,referenceUses,sourceReturns,clauses,occurrences,archivedOccurrences,fieldCoverage};
 return {...data,projectionHash:hash(data)};
}
export function requireLegacyChartFreeContent(...sources) {
 for(const source of sources){
  requireValue(source.schemaVersion!=='content-source-v3'&&!numericContentContract(source)&&!source.chartContent?.charts?.length,'NUMERIC_CONTENT_CONTRACT_REQUIRED');
  if(Object.hasOwn(source,'researchChartAdmissions')){
   const admissions=source.researchChartAdmissions;
   requireValue(Array.isArray(admissions),'NUMERIC_CONTENT_CONTRACT_REQUIRED');
   for(const admission of admissions){
    requireValue(admission&&typeof admission==='object'&&!Array.isArray(admission),'NUMERIC_CONTENT_CONTRACT_REQUIRED');
    const {admissionHash,...data}=admission;
    requireValue(admission.protocolVersion==='research-chart-admission-v1'&&admission.raw===null&&Array.isArray(admission.charts)&&admission.charts.length===0&&Array.isArray(admission.quantitativeClaims)&&admission.quantitativeClaims.length===0&&admission.catalogDigest===null&&admission.sourcesDigest===null&&admission.quantitativeManifestHash===null&&admissionHash===evidenceStateHash(data),'NUMERIC_CONTENT_CONTRACT_REQUIRED');
   }
  }
  if(source.immutableBasis)requireLegacyChartFreeContent(source.immutableBasis);
 }
}
export function makeProjectedContentSource(project,basisSource) {
 const numeric=numericContentContract(basisSource);
 if(numeric)validateChartContentSource(basisSource);else requireLegacyChartFreeContent(basisSource);
 const context=resolveContentReferenceContext(project,basisSource),visibility=projectContentVisibility(basisSource,context);
 const qualification=basisSource.obligations.filter(o=>o.kind==='qualification');
 requireValue(qualification.length===1&&equal(qualification[0].value,basisSource.qualifications),'VISIBILITY_QUALIFICATION_ENVELOPE');
 const source={...clone(basisSource),schemaVersion:numeric?NUMERIC_CONTENT_CONTRACT.source:SOURCE_VERSION,basisSourceHash:basisSource.sourceHash,immutableBasis:clone(basisSource),verifiedReferenceContextDigest:context.digest,visibility,qualificationArchive:{originId:qualification[0].originId,valueHash:hash(qualification[0].value),contextDigest:context.digest,records:context.records.map(r=>({dossierId:r.dossierId,reportId:r.reportId,rawHash:r.rawHash,storedHash:r.storedHash,receiptHash:r.receiptHash,inputHash:r.inputHash}))},obligations:[...basisSource.obligations.filter(o=>o.kind!=='qualification').map(o=>clone(o)),...visibility.clauses.map(c=>({originId:c.clauseId,artifactId:basisSource.visual.artifactId,pointer:`/visibility/clauses/${visibility.clauses.indexOf(c)}`,owner:'content-author',kind:'qualification',value:clone(c)}))]};
 if(numeric)applyContentProseProjection(source,basisSource);
 delete source.sourceHash;return {...source,sourceHash:hash(source)};
}
export function materialFragments(content) {
 switch(content.variant){
  case 'exact_string':case 'reading_uncertainty':return [content.text];
  case 'finding':return [content.impact,content.acceptance];
  case 'dimension_unknown':return [content.reason];
  case 'comparison_unknown':return [content.reason];
  default:requireValue(false,'VISIBILITY_MATERIAL_VARIANT',{variant:content.variant});
 }
}
export function occurrenceScopes(occurrence) {
 const s=occurrence.applicability;
 return s.kind==='report'?s.directionIds.map(directionId=>({directionId,useIds:s.useIds,key:hash([occurrence.occurrenceId,directionId])})):s.uses.map(u=>({...u,useIds:[u.useId],key:hash([occurrence.occurrenceId,u.directionId,u.useId])}));
}
export function affectedContentRelations(manuscript,source,occurrence,scope){
 const direction=source.visual.payload.directions.find(d=>d.directionId===scope.directionId);
 requireValue(direction,'VISIBILITY_DIRECTION_MISSING',{occurrenceId:occurrence.occurrenceId,owner:occurrence.sourceOwner});
 const useIds=occurrence.applicability.kind==='report'?scope.useIds:[scope.useId];
 const images=new Set([...direction.targets.map(t=>t.imageId),...source.visibility.referenceUses.filter(u=>u.directionId===scope.directionId&&useIds.includes(u.useId)).map(u=>u.imageId)]);
 const origins=new Set(source.obligations.filter(o=>o.kind==='direction'&&o.value.id===scope.directionId||o.artifactId===source.visual.artifactId&&o.pointer.startsWith(`/directions/${scope.directionId}/`)).map(o=>o.originId));
 const blocks=new Set(manuscript.narrativeBlocks.filter(b=>b.originIds.some(id=>origins.has(id))).map(b=>b.id));
 return manuscript.pageIntents.map(i=>({intentId:i.id,blockIds:i.blockIds.filter(id=>blocks.has(id)),imageIds:i.imageIds.filter(id=>images.has(id))})).filter(r=>r.blockIds.length||r.imageIds.length);
}
export function validateVisibilityManuscript(m,source,validateLegacy) {
 requireValue(source.schemaVersion===SOURCE_VERSION&&m?.schemaVersion===MANUSCRIPT_VERSION,'VISIBILITY_MANUSCRIPT_VERSION');
 if(source.immutableBasis){const {sourceHash,...sourceData}=source;requireValue(sourceHash===hash(sourceData),'VISIBILITY_SOURCE_CHANGED');}
 const p=source.visibility;requireValue(!p.sourceReturns.length,'VISIBILITY_SOURCE_RETURN_REQUIRED',p.sourceReturns[0]);
 const {projectionHash,...projectionData}=p;requireValue(projectionHash===hash(projectionData),'VISIBILITY_PROJECTION_CHANGED');
 requireValue(Array.isArray(m.clausePlacements)&&Array.isArray(m.pageIntents)&&Array.isArray(m.narrativeBlocks),'VISIBILITY_MANUSCRIPT_SHAPE');
 const legacySource={...source,obligations:source.obligations.filter(o=>!p.clauses.some(c=>c.clauseId===o.originId))};
 requireValue(sameIds(m.visibleObligations?.map(o=>o.originId),legacySource.obligations.map(o=>o.originId))&&m.narrativeBlocks.every(b=>Array.isArray(b.originIds)&&b.originIds.every(id=>source.obligations.some(o=>o.originId===id))),'VISIBILITY_OBLIGATION_UNKNOWN',{owner:'content-author'});
 const legacy=clone(m);delete legacy.schemaVersion;delete legacy.clausePlacements;
 legacy.visibleObligations=legacy.visibleObligations.filter(o=>legacySource.obligations.some(s=>s.originId===o.originId));
 const clauseBlockIds=new Set(m.narrativeBlocks.filter(b=>b.originIds.length&&b.originIds.every(id=>p.clauses.some(c=>c.clauseId===id))).map(b=>b.id));
 legacy.narrativeBlocks=legacy.narrativeBlocks.map(b=>({...b,originIds:b.originIds.filter(id=>legacySource.obligations.some(o=>o.originId===id))}));
 legacy.pageIntents=legacy.pageIntents.map(i=>{
  requireValue(i.central&&['text','image'].includes(i.central.kind),'VISIBILITY_CENTRAL_VARIANT',{intentId:i.id,owner:'content-author'});
  requireValue(exactKeys(i.central,i.central.kind==='text'?['kind','exactText']:['kind','imageId']),'VISIBILITY_CENTRAL_VARIANT',{intentId:i.id,owner:'content-author'});
  if(i.central.kind==='text')requireValue(nonempty(i.central.exactText)&&i.central.exactText.length<=1000&&i.blockIds.some(id=>m.narrativeBlocks.find(b=>b.id===id)?.text.includes(i.central.exactText)),'VISIBILITY_CENTRAL_TEXT',{intentId:i.id,owner:'content-author'});
  else requireValue(i.central.imageId===i.heroImageId&&i.imageIds.includes(i.central.imageId),'VISIBILITY_CENTRAL_IMAGE',{intentId:i.id,owner:'content-author'});
  const {central,...rest}=i;return {...rest,centralMessage:central.kind==='text'?central.exactText:'Image-led content intent'};
 });
 validateLegacy(legacy,legacySource);
 requireValue(unique(m.clausePlacements.map(x=>hash(x))),'VISIBILITY_PLACEMENT_DUPLICATE');
 for(const b of m.narrativeBlocks)if(!clauseBlockIds.has(b.id))requireValue(m.pageIntents.filter(i=>i.blockIds.includes(b.id)).length===1,'VISIBILITY_NARRATIVE_REPEATED',{blockId:b.id,owner:'content-author'});
 const positions=new Map(m.narrativeBlocks.map((b,i)=>[b.id,i]));let prior=-1;
 for(const intent of m.pageIntents){
  const indexes=intent.blockIds.map(id=>positions.get(id));
  requireValue(indexes.every((n,i)=>i===0||n>indexes[i-1]),'VISIBILITY_BLOCK_ORDER',{intentId:intent.id,owner:'content-author'});
  for(const [i,n] of indexes.entries()){const repeated=clauseBlockIds.has(intent.blockIds[i]);requireValue(repeated||n>=prior,'VISIBILITY_NARRATIVE_ORDER',{intentId:intent.id,owner:'content-author'});if(!repeated)prior=n;}
  requireValue(sameIds(intent.allowedSplitAfterBlockIds,intent.allowedSplitAfterBlockIds)&&intent.allowedSplitAfterBlockIds.every(id=>intent.blockIds.includes(id)),'VISIBILITY_SPLIT_INVALID',{intentId:intent.id,owner:'content-author'});
 }
 for(const placement of m.clausePlacements){
  requireValue(exactKeys(placement,['clauseId','occurrenceScopeKeys','exactFragmentRanges','blockId','affectedBlockIds','affectedImageIds','pageIntentIds'])&&nonempty(placement.clauseId)&&nonempty(placement.blockId)&&['occurrenceScopeKeys','exactFragmentRanges','affectedBlockIds','affectedImageIds','pageIntentIds'].every(k=>Array.isArray(placement[k])),'VISIBILITY_PLACEMENT_SHAPE',{owner:'content-author'});
  const clause=p.clauses.find(c=>c.clauseId===placement.clauseId),block=m.narrativeBlocks.find(b=>b.id===placement.blockId);
  requireValue(clause&&block&&block.kind==='source'&&block.originIds.includes(clause.clauseId),'VISIBILITY_BODY_REQUIRED',{clauseId:placement.clauseId,owner:'content-author'});
  const fragments=materialFragments(clause.content);
  requireValue(Array.isArray(placement.exactFragmentRanges)&&placement.exactFragmentRanges.length===fragments.length&&placement.exactFragmentRanges.every((r,i)=>exactKeys(r,['start','end'])&&Number.isSafeInteger(r.start)&&Number.isSafeInteger(r.end)&&r.start>=0&&r.end>r.start&&block.text.slice(r.start,r.end)===fragments[i]),'VISIBILITY_EXACT_FRAGMENT',{clauseId:clause.clauseId,owner:'content-author'});
  requireValue(placement.pageIntentIds.length&&placement.pageIntentIds.every(id=>m.pageIntents.some(i=>i.id===id&&i.blockIds.includes(block.id))),'VISIBILITY_INTENT_REQUIRED',{clauseId:clause.clauseId,owner:'content-author'});
  const validKeys=p.occurrences.filter(o=>o.clauseId===clause.clauseId).flatMap(occurrenceScopes).map(s=>s.key);
  requireValue(placement.occurrenceScopeKeys.length&&unique(placement.occurrenceScopeKeys)&&placement.occurrenceScopeKeys.every(k=>validKeys.includes(k)),'VISIBILITY_SCOPE_KEY_INVALID',{clauseId:clause.clauseId,owner:'content-author'});
 }
 const relations=new Map();
 for(const occurrence of p.occurrences)for(const scope of occurrenceScopes(occurrence)){
  const affected=affectedContentRelations(m,source,occurrence,scope);
  requireValue(affected.length,'VISIBILITY_AFFECTED_INTENT_MISSING',{occurrenceId:occurrence.occurrenceId,scopeKey:scope.key,owner:'content-author'});
  relations.set(scope.key,affected);
  for(const relation of affected){
   const placement=m.clausePlacements.find(x=>x.clauseId===occurrence.clauseId&&x.occurrenceScopeKeys.includes(scope.key)&&x.pageIntentIds.includes(relation.intentId));
   requireValue(placement,'VISIBILITY_PLACEMENT_MISSING',{occurrenceId:occurrence.occurrenceId,scopeKey:scope.key,intentId:relation.intentId,owner:'content-author',sourceOwner:occurrence.sourceOwner});
  }
 }
 for(const placement of m.clausePlacements){
  requireValue(unique(placement.pageIntentIds)&&unique(placement.affectedBlockIds)&&unique(placement.affectedImageIds),'VISIBILITY_AFFECTED_CONTENT_MISMATCH',{clauseId:placement.clauseId,owner:'content-author'});
  for(const intentId of placement.pageIntentIds){
   const expected=placement.occurrenceScopeKeys.map(key=>relations.get(key)?.find(r=>r.intentId===intentId));
   requireValue(expected.every(Boolean)&&sameIds(placement.affectedBlockIds,[...new Set(expected.flatMap(r=>r.blockIds))])&&sameIds(placement.affectedImageIds,[...new Set(expected.flatMap(r=>r.imageIds))]),'VISIBILITY_AFFECTED_CONTENT_MISMATCH',{clauseId:placement.clauseId,intentId,owner:'content-author'});
  }
 }
 return clone(m);
}
