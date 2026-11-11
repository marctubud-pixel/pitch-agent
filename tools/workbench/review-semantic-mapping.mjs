import {isDeepStrictEqual as equal} from 'node:util';
import {correctionSources} from './correction.mjs';
import {visibilityPointer} from './content-visibility.mjs';

const projects=(raw,normalized)=>{
 if(equal(raw,normalized))return true;
 if(Array.isArray(raw))return Array.isArray(normalized)&&raw.length===normalized.length&&raw.every(value=>normalized.filter(candidate=>projects(value,candidate)).length===1)&&normalized.every(value=>raw.filter(candidate=>projects(candidate,value)).length===1);
 return raw!==null&&typeof raw==='object'&&!Array.isArray(raw)&&normalized!==null&&typeof normalized==='object'&&!Array.isArray(normalized)&&Object.keys(raw).every(key=>Object.hasOwn(normalized,key)&&projects(raw[key],normalized[key]));
};

export function mapValidatedReviewSemantics(source, sources=[source]) {
 const occurrences=[],blockers=[];let extracted;
 try{extracted=correctionSources(sources).find(s=>s.key===source.key);}catch(error){return {occurrences,blockers:[{code:'FINAL_GENERIC_SEMANTIC_MAPPING_REQUIRED',sourceKey:source.key,message:error.message}]};}
 const raw=source.rawReport,normalized=source.validatedReport;let ambiguous=false;
 const locate=(pointer,value)=>{
  ambiguous=false;const parts=pointer.split('/').slice(1),walk=(a,b,i,path)=>{
   if(i===parts.length)return [{pointer:path,value:a}];
   const key=parts[i];
   if(Array.isArray(b)){
    if(!Array.isArray(a))return [];
    const member=b[Number(key)];
    const matches=a.map((v,j)=>({v,j})).filter(({v})=>projects(v,member));
    if(matches.length!==1){ambiguous=matches.length>1;return [];}
    return walk(matches[0].v,member,i+1,`${path}/${matches[0].j}`);
   }
   if(!a||!Object.hasOwn(a,key)||!b||!Object.hasOwn(b,key))return [];
   return walk(a[key],b[key],i+1,`${path}/${key}`);
  };
  const hits=walk(raw,normalized,0,'');
  if(hits.length!==1||!equal(visibilityPointer(normalized,pointer),value))return null;
  return hits[0];
 };
 for(const [semantic,rows] of [['finding',extracted.findings],['preservation',extracted.constraints]])for(const item of rows){
  const match=locate(item.location,item.originalValue);
  if(!match&&semantic==='preservation'&&!ambiguous){occurrences.push({semantic:'normalized_preservation',rawPointer:'',rawValue:structuredClone(raw),normalizedPointer:item.location,normalizedValue:structuredClone(item.originalValue),authority:'owning_validator_derivation'});continue;}
  if(!match){blockers.push({code:'FINAL_SEMANTIC_RAW_MAPPING_REQUIRED',normalizedPointer:item.location,sourceKey:source.key});continue;}
  occurrences.push({semantic,rawPointer:match.pointer,rawValue:structuredClone(match.value),normalizedPointer:item.location,normalizedValue:structuredClone(item.originalValue),domainFindingId:item.key,authority:item.authority});
 }
 return {occurrences,blockers};
}
