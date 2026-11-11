import {referenceHash,referenceRequire} from './reference-review.mjs';

export const REFERENCE_UNCERTAINTY_PROTOCOL='reference-uncertainty-return-v1';
const need=(value,message)=>referenceRequire(value,'INVALID_REFERENCE_UNCERTAINTY',message);
const text=value=>typeof value==='string'&&value.trim().length>0&&value.length<=10000;

function occurrenceImages(occurrence,input){
  const affected=occurrence.affected;
  need(affected&&['image','use','relation','task'].includes(affected.kind),'Typed affected image scope required');
  const images=input.images;
  need(Array.isArray(images)&&images.length>0&&images.every(image=>text(image.imageId)&&text(image.sha256))&&new Set(images.map(image=>image.imageId)).size===images.length,'Unambiguous original images required');
  const uses=input.packet?.uses;
  need(Array.isArray(uses)&&new Set(uses.map(use=>use.id)).size===uses.length,'Unambiguous packet uses required');
  if(affected.kind==='task'){
    need(Array.isArray(affected.useIds)&&affected.useIds.length===0,'Global occurrence must retain packet scope');
    return {allowed:new Set(images.map(image=>image.imageId)),required:null};
  }
  need(Array.isArray(affected.useIds)&&affected.useIds.length>0&&affected.useIds.every(text)&&new Set(affected.useIds).size===affected.useIds.length,'Exact affected uses required');
  const scoped=affected.useIds.map(id=>uses.find(use=>use.id===id));
  need(scoped.every(use=>use&&images.some(image=>image.imageId===use.imageId)),'Affected use must identify an original image');
  const imageIds=new Set(scoped.map(use=>use.imageId));
  if(affected.kind==='image')need(text(affected.imageId)&&imageIds.size===1&&imageIds.has(affected.imageId),'Affected image and uses must agree');
  return {allowed:imageIds,required:imageIds};
}

function readableReportPointer(report,pointer){
  if(!text(pointer)||!pointer.startsWith('/'))return false;
  let value=report.rawReport;
  for(const part of pointer.slice(1).split('/')){
    if(/~(?![01])/u.test(part))return false;
    const key=part.replaceAll('~1','/').replaceAll('~0','~');
    if(value===null||typeof value!=='object'||!Object.hasOwn(value,key))return false;
    value=value[key];
  }
  return value!==undefined;
}

export function uncertaintyReturnInput(d,review){
  return {protocolVersion:REFERENCE_UNCERTAINTY_PROTOCOL,dossierId:d.id,envelopeHash:d.envelope.envelopeHash,reviewId:review.id,selectionHash:review.selectionHash,packet:structuredClone(review.packet),images:structuredClone(review.packet.images),occurrences:structuredClone(review.occurrences),originalReports:structuredClone(review.originalReports)};
}

export function buildUncertaintyReturnRequest(input){
  return {prompt:'You are the assigned reference owner reviewing exact unresolved original occurrences. Inspect the attached original pixels and original report pointers. This is a return diagnosis, never visual approval. Classify each occurrence as visual_evidence_required, engineering_test_scope, or unresolved. engineering_test_scope is permitted only when the frozen occurrence has explicit typed engineering_test provenance; text alone cannot supply that provenance. Do not change prior reports or scores. Do not claim consumer validation, suitability, source facts, or permission to copy. Return one exact disposition for every occurrence.\nUNTRUSTED_JSON_DATA\n'+JSON.stringify(input)+'\nEND_UNTRUSTED_JSON_DATA',outputSchema:{type:'object',additionalProperties:false,required:['protocolVersion','dossierId','envelopeHash','reviewId','decisions','limitations'],properties:{protocolVersion:{const:REFERENCE_UNCERTAINTY_PROTOCOL},dossierId:{const:input.dossierId},envelopeHash:{const:input.envelopeHash},reviewId:{const:input.reviewId},decisions:{type:'array',minItems:input.occurrences.length,maxItems:input.occurrences.length,items:{type:'object',additionalProperties:false,required:['occurrenceId','disposition','reason','evidence'],properties:{occurrenceId:{type:'string'},disposition:{enum:['visual_evidence_required','engineering_test_scope','unresolved']},reason:{type:'string'},evidence:{type:'array',minItems:1,maxItems:12,items:{type:'object',additionalProperties:false,required:['kind','imageId','imageHash','region','reportHash','pointer'],properties:{kind:{enum:['pixel','report_pointer']},imageId:{type:['string','null']},imageHash:{type:['string','null']},region:{type:['array','null'],items:{type:'number'},minItems:4,maxItems:4},reportHash:{type:['string','null']},pointer:{type:['string','null']}}}}}}},limitations:{type:'array',minItems:1,maxItems:20,items:{type:'string'}}}}};
}

export function validateUncertaintyReturnOutput(raw,input){
  const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
  need(exact(raw,['protocolVersion','dossierId','envelopeHash','reviewId','decisions','limitations'])&&raw.protocolVersion===REFERENCE_UNCERTAINTY_PROTOCOL&&raw.dossierId===input.dossierId&&raw.envelopeHash===input.envelopeHash&&raw.reviewId===input.reviewId,'Exact return identity required');
  need(Array.isArray(raw.decisions)&&raw.decisions.length===input.occurrences.length&&Array.isArray(raw.limitations)&&raw.limitations.length>0&&raw.limitations.every(text),'Every occurrence and limitation required');
  const seen=new Set();
  for(const row of raw.decisions){
    need(exact(row,['occurrenceId','disposition','reason','evidence'])&&!seen.has(row.occurrenceId)&&text(row.reason),'Unique typed occurrence decision required');seen.add(row.occurrenceId);
    const occurrence=input.occurrences.find(item=>item.id===row.occurrenceId);
    need(occurrence&&['visual_evidence_required','engineering_test_scope','unresolved'].includes(row.disposition),'Exact original occurrence required');
    need(row.disposition!=='engineering_test_scope'||occurrence.scopeProvenance?.kind==='engineering_test','Engineering scope needs frozen typed provenance');
    need(Array.isArray(row.evidence)&&row.evidence.length>0&&row.evidence.length<=12,'Bounded evidence required');
    const scope=occurrenceImages(occurrence,input),pixelImages=new Set();
    const reports=occurrence.origin?.reportHash===null?[]:input.originalReports?.filter(report=>report.reportHash===occurrence.origin?.reportHash)??[];
    need(occurrence.origin&&(occurrence.origin.reportHash===null||text(occurrence.origin.reportHash))&&reports.length===(occurrence.origin.reportHash===null?0:1),'Unambiguous original report required');
    if(reports.length)need((!occurrence.origin.nodeKey||reports[0].nodeKey===occurrence.origin.nodeKey)&&readableReportPointer(reports[0],occurrence.pointer),'Readable original occurrence pointer required');
    let reportPointer=false;
    for(const proof of row.evidence){
      need(exact(proof,['kind','imageId','imageHash','region','reportHash','pointer']),'Typed exact proof required');
      if(proof.kind==='pixel'){
        need(scope.allowed.has(proof.imageId)&&input.images.some(image=>image.imageId===proof.imageId&&image.sha256===proof.imageHash)&&Array.isArray(proof.region)&&proof.region.length===4&&proof.region.every(v=>Number.isFinite(v)&&v>=0&&v<=1)&&proof.region[2]>proof.region[0]&&proof.region[3]>proof.region[1]&&proof.reportHash===null&&proof.pointer===null,'Affected original pixel and bounded region required');pixelImages.add(proof.imageId);
      }else{
        need(proof.kind==='report_pointer'&&reports.length===1&&proof.imageId===null&&proof.imageHash===null&&proof.region===null&&proof.pointer===occurrence.pointer&&proof.reportHash===occurrence.origin.reportHash,'Exact occurrence report pointer required');reportPointer=true;
      }
    }
    need(pixelImages.size>0&&(!scope.required||[...scope.required].every(id=>pixelImages.has(id))),'Return diagnosis must inspect every affected original');
    need(reports.length===0||reportPointer,'Available original report pointer required');
  }
  return structuredClone(raw);
}
