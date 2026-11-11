import {createHash} from 'node:crypto';
import {buildEvidenceSelectionRequest as buildV4,decodeEvidenceSelection as decodeV4,isEvidenceSelectionProtocol as isLegacy} from './evidence-selection-v4.mjs';
import {partitionEvidenceSchema,verifyPartitionedSchema} from './schema-enum-partition.mjs';
export const EVIDENCE_SELECTION_PROTOCOL='evidence-selection-v5';
export const isEvidenceSelectionProtocol=value=>isLegacy(value)||value===EVIDENCE_SELECTION_PROTOCOL;
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const hash=value=>createHash('sha256').update(canonical(value)).digest('hex');
const fail=message=>{throw Object.assign(Error(message),{code:'INVALID_EVIDENCE_SELECTION'});};
function check(s,v){
 if(s.anyOf){if(!s.anyOf.some(branch=>{try{check(branch,v);return true;}catch{return false;}}))fail('Selection does not match an allowed outcome');return;}
 if(s.type==='object'){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!Object.hasOwn(s.properties,k)))fail('Unknown selection field');for(const k of s.required)check(s.properties[k],v[k]);}
 else if(s.type==='array'){if(!Array.isArray(v)||v.length>(s.maxItems??1000)||v.length<(s.minItems??0))fail('Invalid selection array');v.forEach(x=>check(s.items,x));}
 else if(typeof v!=='string'||!v.trim()||v.length>(s.maxLength??100000)||s.enum&&!s.enum.includes(v))fail('Unknown evidence selection');
}
function taggedScan(schema){
 const scan=schema.properties.useScan;if(!scan)return;
 const branches=scan.anyOf??[scan],empty=branches.find(s=>s.properties.assessedOriginKeys.maxItems===0),conditional=branches.find(s=>s.properties.assessedOriginKeys.minItems===1);
 if(!empty)fail('Expected explicit empty scan contract');
 const none={type:'object',properties:{scanMode:{type:'string',enum:['none']},contentHash:structuredClone(empty.properties.contentHash)},required:['scanMode','contentHash'],additionalProperties:false};
 schema.properties.useScan={anyOf:[none,...(conditional?[{...structuredClone(conditional),properties:{scanMode:{type:'string',enum:['conditional']},...structuredClone(conditional.properties)},required:['scanMode',...conditional.required]}]:[])]};
}
export function buildEvidenceSelectionRequest(legacy,kind,protocol=EVIDENCE_SELECTION_PROTOCOL){
 if(protocol!==EVIDENCE_SELECTION_PROTOCOL)return buildV4(legacy,kind,protocol);
 const base=buildV4(legacy,kind,'evidence-selection-v4'),expanded=structuredClone(base.outputSchema);
 delete expanded.properties.selectionProtocol;delete expanded.properties.selectionHash;expanded.required=expanded.required.filter(k=>!['selectionProtocol','selectionHash'].includes(k));
 taggedScan(expanded);
 const packed=partitionEvidenceSchema(expanded),selectionHash=hash({protocol,kind,packet:base.packet,catalogue:base.catalogue,expandedContract:expanded,wireContract:packed.outputSchema});
 const meta={selectionProtocol:{type:'string',enum:[protocol]},selectionHash:{type:'string',enum:[selectionHash]}};
 const withMeta=s=>({...s,properties:{...s.properties,...meta},required:[...s.required,...Object.keys(meta)]});
 const expandedOutputSchema=withMeta(expanded),outputSchema=withMeta(packed.outputSchema);const finalBudget=verifyPartitionedSchema(outputSchema,expandedOutputSchema);
 const prefix=base.prompt.slice(0,base.prompt.indexOf('UNTRUSTED_JSON_DATA'));
 const prompt=prefix+'\nEXPLICIT SCAN DECLARATION: useScan.scanMode=none explicitly declares that no conditional restrictions need scanning and is decoded to empty assessedOriginKeys/findings. If you chose any conditional_later procurement, select conditional, inspect actual content, and supply the exact assessed origin keys and actual findings. None cannot waive factual, creative or human gates. All original business checks remain.\nUNTRUSTED_JSON_DATA\n'+JSON.stringify({packet:base.packet,evidenceSelection:{protocol,selectionHash,catalogue:base.catalogue}})+'\nEND_UNTRUSTED_JSON_DATA';
 return {packet:base.packet,outputSchema,expandedOutputSchema,selectionHash,catalogue:base.catalogue,schemaPacking:{version:packed.proof.version,seedExpandedSchemaHash:packed.proof.expandedSchemaHash,seedWireSchemaHash:packed.proof.wireSchemaHash,expandedSchemaHash:hash(expandedOutputSchema),wireSchemaHash:hash(outputSchema),definitions:packed.proof.definitions,...finalBudget},prompt};
}
export function decodeEvidenceSelection(raw,request,kind){
 if(request.outputSchema.properties.selectionProtocol.enum?.[0]!==EVIDENCE_SELECTION_PROTOCOL)return decodeV4(raw,request,kind);
 const v=typeof raw==='string'?JSON.parse(raw):structuredClone(raw);check(request.expandedOutputSchema,v);
 if(v.selectionProtocol!==EVIDENCE_SELECTION_PROTOCOL||v.selectionHash!==request.selectionHash)fail('Changed selection mapping');
 const decode=x=>{if(Array.isArray(x))return x.map(decode);if(!x||typeof x!=='object')return x;return Object.fromEntries(Object.entries(x).map(([k,y])=>[k,['refs','requirementRefs'].includes(k)?[...new Map(y.flatMap(id=>request.catalogue[id]?.refs??fail('Unknown ID')).map(r=>[canonical(r),r])).values()]:decode(y)]));};
 const report=decode(v);delete report.selectionProtocol;delete report.selectionHash;
 if(report.useScan){const {scanMode,...scan}=report.useScan;report.useScan=scanMode==='none'?{contentHash:scan.contentHash,assessedOriginKeys:[],findings:[]}:scan;}
 const key=kind==='readiness'?'coverage':'relations';report[key]=Object.entries(report[key]).map(([questionId,x])=>({questionId,...x}));
 for(const[name,field]of [['sourceAssessments','sourceId'],['visualAssessments','visualId'],['obligationAssessments','originKey']])if(report[name]&&!Array.isArray(report[name]))report[name]=Object.keys(request.expandedOutputSchema.properties[name].properties).map(id=>({[field]:id,...report[name][id]}));
 return report;
}
