import {createHash} from 'node:crypto';
import {buildResearchReadinessRequest,validateResearchReadinessOutput} from './research-readiness.mjs';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const fail=m=>{throw Object.assign(Error(m),{code:'INVALID_SPLIT_REVIEW'});};
const groups={assessment:null,obligations:['obligationAssessments'],scan:['useScan']};
const headers=['selectionProtocol','selectionHash','protocolVersion','contentHash','inputHash','packetHash'];
function subset(schema,keys){
 const properties=Object.fromEntries(keys.map(k=>[k,structuredClone(schema.properties[k])]));
 const defs={},visit=x=>{if(!x||typeof x!=='object')return;if(x.$ref){const id=x.$ref.replace('#/$defs/','');if(!schema.$defs?.[id])fail('Missing local definition');if(!defs[id]){defs[id]=structuredClone(schema.$defs[id]);visit(defs[id]);}}Object.values(x).forEach(visit);};visit(properties);
 return {type:'object',properties,required:keys,additionalProperties:false,...(Object.keys(defs).length?{$defs:defs}:{})};
}
function check(s,v,defs){
 if(s.$ref)return check(defs[s.$ref.slice(8)],v,defs);
 if(s.anyOf){if(!s.anyOf.some(b=>{try{check(b,v,defs);return true;}catch{return false;}}))fail('Invalid branch');return;}
 if(s.enum&&!s.enum.includes(v))fail('Invalid enum');
 if(s.type==='object'){if(!v||Array.isArray(v)||typeof v!=='object'||Object.keys(v).some(k=>!Object.hasOwn(s.properties,k)))fail('Unexpected fields');for(const k of s.required)check(s.properties[k],v[k],defs);}
 else if(s.type==='array'){if(!Array.isArray(v)||v.length<(s.minItems??0)||v.length>(s.maxItems??Infinity))fail('Invalid array');v.forEach(x=>check(s.items,x,defs));}
 else if(s.type==='string'&&(typeof v!=='string'||!v.trim()||v.length>(s.maxLength??Infinity)))fail('Invalid string');
}
export function buildSplitPlan(input){
 if(input.evidenceSelectionProtocol!=='evidence-selection-v5')fail('Explicit v5 input required');
 const request=buildResearchReadinessRequest(input),keys=Object.keys(request.outputSchema.properties),common=keys.filter(k=>headers.includes(k));
 if(!keys.includes('obligationAssessments')||!keys.includes('useScan'))fail('Unsupported contract');
 const fields={assessment:keys.filter(k=>!['obligationAssessments','useScan'].includes(k)),obligations:[...common,'obligationAssessments'],scan:[...common,'useScan']};
 return {version:'split-readiness-local-v1',input:structuredClone(input),request,fields,planHash:hash({input,request,fields})};
}
function assertPlan(p){if(hash({input:p.input,request:p.request,fields:p.fields})!==p.planHash)fail('Changed plan');}
export function buildSplitRequest(plan,part,obligations){
 assertPlan(plan);if(!Object.hasOwn(groups,part))fail('Unknown part');
 let dependency=null;
 if(part==='scan'){accept(plan,obligations,'obligations');dependency=obligations;}
 const dependencyHash=dependency?hash(dependency):'none';
 const outputSchema=subset(plan.request.outputSchema,plan.fields[part]);
 return {part,planHash:plan.planHash,dependencyHash,prompt:plan.request.prompt+'\nSPLIT REVIEW: Return only '+part+' fields. This partial output cannot approve readiness.'+(dependency?'\nPRIOR_OBLIGATIONS_JSON\n'+JSON.stringify(dependency.output)+'\nEND_PRIOR_OBLIGATIONS_JSON':''),outputSchema};
}
function accept(plan,envelope,part){
 if(!envelope||Object.keys(envelope).sort().join(',')!=='dependencyHash,output,part,planHash'||envelope.part!==part||envelope.planHash!==plan.planHash)fail('Missing or mixed part');
 const s=subset(plan.request.outputSchema,plan.fields[part]);check(s,envelope.output,s.$defs??{});
 if(part!=='scan'&&envelope.dependencyHash!=='none')fail('Unexpected dependency');
 return envelope.output;
}
export function assembleSplitReview(plan,envelopes){
 assertPlan(plan);if(!Array.isArray(envelopes)||envelopes.length!==3)fail('Exactly three parts required');
 const map=new Map(envelopes.map(e=>[e.part,e]));if(map.size!==3)fail('Duplicate part');
 const obligations=map.get('obligations');const result={};
 for(const part of Object.keys(groups)){const e=map.get(part),output=accept(plan,e,part);if(part==='scan'&&e.dependencyHash!==hash(obligations))fail('Stale scan dependency');for(const[k,v]of Object.entries(output)){if(Object.hasOwn(result,k)&&hash(result[k])!==hash(v))fail('Inconsistent shared headers');result[k]=v;}}
 return {raw:result,report:validateResearchReadinessOutput(result,plan.input)};
}
export function validateSplitPart(plan,envelope){assertPlan(plan);return accept(plan,envelope,envelope?.part);}
