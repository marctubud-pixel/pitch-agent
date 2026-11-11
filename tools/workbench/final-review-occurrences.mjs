import {mapValidatedReviewSemantics} from './review-semantic-mapping.mjs';
import {isDeepStrictEqual as equal} from 'node:util';
import {sketchHash} from './sketch-authority.mjs';
import {visibilityPointer} from './content-visibility.mjs';

const fields={findings:'finding',dispositions:'disposition',conditions:'condition',comparisons:'comparison',limitations:'limitation',challenges:'challenge',readings:'reading',packages:'package',ties:'tie',refinementRequirements:'refinement_requirement'};
export function collectCheckedReviewOccurrences({planning,checked,selected}){
 const occurrences=[],blockers=[],keys=new Map();
 for(const fact of checked.facts){
  const original=fact.checked;
  if(!['sketch-review-original','final-visual-text-original','generic-review-original'].includes(original.kind))continue;
  for(const anchor of fact.checkedRawAnchors??[]){
   if(!selected.reportAnchors.some(a=>equal(a,anchor)))continue;
   const record=visibilityPointer(planning,anchor.originalRecordPointer);
   const raw=original.kind==='sketch-review-original'?original.reports.find(r=>r.reportId===anchor.identity)?.raw:original.kind==='generic-review-original'?original.source.rawReport:original.raw;
   if(!equal(raw,anchor.raw)||sketchHash(JSON.stringify(record))!==anchor.recordHash){blockers.push({code:'FINAL_SEMANTIC_ORIGINAL_CHANGED',reportId:anchor.identity});continue;}
   const add=(semantic,pointer,value,normalizedPointer=pointer,normalizedValue=value)=>{
    const key=JSON.stringify([anchor.identity,anchor.version,pointer,normalizedPointer,semantic]);if(keys.has(key))return keys.get(key);
    const occurrence={semantic,domain:original.kind,runId:original.runId??original.reviewRunId,nodeKey:record.nodeKey,reportIdentity:anchor.identity,reportVersion:anchor.version,rawPointer:pointer,rawValue:structuredClone(value),normalizedPointer,normalizedValue:structuredClone(normalizedValue),...(semantic==='finding'?{domainFindingId:`${record.nodeKey}#${value.targetId??value.candidateId}#${value.id}`}:{})};
    occurrences.push(occurrence);keys.set(key,occurrence);return occurrence;
   };
   if(original.kind==='generic-review-original'){
    if(!original.semanticMapping){blockers.push({code:'FINAL_GENERIC_SEMANTIC_MAPPING_REQUIRED',reportId:anchor.identity});continue;}
    const mapping=mapValidatedReviewSemantics(original.source,checked.facts.filter(f=>f.checked.kind==='generic-review-original').map(f=>f.checked.source).filter((s,i,all)=>all.findIndex(x=>x.key===s.key)===i));
    blockers.push(...mapping.blockers.map(b=>({...b,reportId:anchor.identity})));
    for(const occurrence of mapping.occurrences){
     if(!equal(visibilityPointer(raw,occurrence.rawPointer),occurrence.rawValue)||!equal(visibilityPointer(original.source.validatedReport,occurrence.normalizedPointer),occurrence.normalizedValue)){blockers.push({code:'FINAL_SEMANTIC_ORIGINAL_CHANGED',reportId:anchor.identity});continue;}
     const mapped=add(occurrence.semantic,occurrence.rawPointer,occurrence.rawValue,occurrence.normalizedPointer,occurrence.normalizedValue);
     Object.assign(mapped,{domainFindingId:occurrence.domainFindingId,authority:occurrence.authority});
    }
    continue;
   }
   if(record.valid===false)blockers.push({code:'FINAL_SEMANTIC_REPORT_INVALID',reportId:anchor.identity,diagnostics:structuredClone(record.diagnostics??[])});
   for(const [field,semantic]of Object.entries(fields))for(const [index,value]of (Array.isArray(raw?.[field])?raw[field]:[]).entries())add(semantic,`/${field}/${index}`,value);
   for(const [entryIndex,entry]of (Array.isArray(raw?.entries)?raw.entries:[]).entries()){
    const slots=(record.slots??[]).map((slot,index)=>({slot,index})).filter(({slot})=>equal(slot.entry,entry));
    if(slots.length!==1){blockers.push({code:'FINAL_SEMANTIC_NORMALIZED_SLOT_REQUIRED',reportId:anchor.identity,rawPointer:`/entries/${entryIndex}`});continue;}
    const normalized=`/slots/${slots[0].index}/entry`;
    add('score_entry',`/entries/${entryIndex}`,entry,normalized,slots[0].slot.entry);
    for(const field of ['findings','conditions'])for(const [index,value]of (entry[field]??[]).entries())add(fields[field],`/entries/${entryIndex}/${field}/${index}`,value,`${normalized}/${field}/${index}`,slots[0].slot.entry[field][index]);
   }
  }
 }
 return {occurrences,blockers};
}
