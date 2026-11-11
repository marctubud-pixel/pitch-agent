import {buildEvidenceSelectionRequest as buildV1,decodeEvidenceSelection as decodeV1} from './evidence-selection-v1.mjs';
import {createHash} from 'node:crypto';
export const EVIDENCE_SELECTION_PROTOCOL='evidence-selection-v2';
export const isEvidenceSelectionProtocol=value=>['evidence-selection-v1',EVIDENCE_SELECTION_PROTOCOL].includes(value);
const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const hash=v=>createHash('sha256').update(canonical(v)).digest('hex');
const object=p=>({type:'object',properties:p,required:Object.keys(p),additionalProperties:false});
const invalid=m=>{throw Object.assign(Error(m),{code:'INVALID_EVIDENCE_SELECTION'});};
const esc=s=>s.replaceAll('~','~0').replaceAll('/','~1');
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function at(p,s){return s.slice(1).split('/').map(k=>k.replaceAll('~1','/').replaceAll('~0','~')).reduce((v,k)=>v?.[k],p);}
function leaves(v,path='',out=[]){if(typeof v==='string'&&v.trim()&&v.length<=100000)out.push({location:path,quote:v});else if(v&&typeof v==='object')for(const[k,x]of Object.entries(v))leaves(x,path+'/'+esc(k),out);return out;}
function check(s,v){
 if(s.anyOf){if(!s.anyOf.some(branch=>{try{check(branch,v);return true;}catch{return false;}}))invalid('Selection does not match an allowed outcome');return;}
 if(s.type==='object'){if(!plain(v)||Object.keys(v).some(k=>!Object.hasOwn(s.properties,k)))invalid('Unknown selection field');for(const k of s.required)check(s.properties[k],v[k]);}
 else if(s.type==='array'){if(!Array.isArray(v)||v.length>(s.maxItems??1000)||v.length<(s.minItems??0))invalid('Invalid selection array');v.forEach(x=>check(s.items,x));}
 else if(typeof v!=='string'||!v.trim()||v.length>(s.maxLength??100000)||s.enum&&!s.enum.includes(v))invalid('Unknown evidence selection');
}
export function buildEvidenceSelectionRequest(legacy,kind,protocol=EVIDENCE_SELECTION_PROTOCOL){
 if(protocol==='evidence-selection-v1')return buildV1(legacy,kind);if(protocol!==EVIDENCE_SELECTION_PROTOCOL)invalid('Unknown selection protocol');
 const packet=legacy.packet,catalogue={},global=[],known=new Map();
 const add=(refs,role)=>{for(const r of refs)if(typeof at(packet,r.location)!=='string'||!at(packet,r.location).includes(r.quote))invalid('Catalogue references absent frozen text');const key=canonical({refs,role});if(known.has(key))return known.get(key);const id='e'+Object.keys(catalogue).length.toString(36);known.set(key,id);catalogue[id]={role,refs};return id;};
 const refs=leaves(packet).filter(r=>/^\/(taskCard|content|sourceRecords|visualCatalogue|sourceLimitations|visualLimitations)\//.test(r.location));
 for(const r of refs)global.push(add([r],'diagnostic'));
 const applicability=[...leaves(packet.applicability?.decision??{},'/applicability/decision'),...leaves(packet.applicability?.origins??[],'/applicability/origins')].map(r=>add([r],'applicability_context'));
 const requirement=[...refs.filter(r=>r.location.startsWith('/taskCard/')).map(r=>add([r],'task')),...leaves(packet.applicability?.decision??{},'/applicability/decision').map(r=>add([r],'decision'))];
 const task=refs.filter(r=>r.location.startsWith('/taskCard/')).map(r=>add([r],'task'));
 const metadata=refs.filter(r=>/^\/content\/claims\/\d+\/limitations\/\d+$|^\/content\/evidenceClassifications\/\d+\/(scopeRelation|reason|suppliedScopeRelation|sourceVerification)$|^\/sourceRecords\/\d+\/(scopeRelation|verification|provenance|limitations(?:\/\d+)?)$|^\/visualCatalogue\/\d+\/limits\/\d+$/.test(r.location)).map(r=>add([r],'applicability'));
 const paired=(allowed)=>{const choices=[];for(const r of allowed){const m=/^\/content\/(sections|claims)\/(\d+)\/(body|text)$/.exec(r.location);if(!m)continue;const c=packet.content[m[1]][Number(m[2])];for(const s of allowed){const sm=/^\/(sourceRecords|visualCatalogue)\/(\d+)\/text$/.exec(s.location);if(sm&&(c.evidenceIds??c.evidenceRefs??[]).includes(packet[sm[1]][Number(sm[2])].id))choices.push(add([r,s],'adopted_pair'));}}return [...new Set(choices)];};
 const enumArray=ids=>ids.length?{type:'array',items:{type:'string',enum:[...new Set(ids)]},maxItems:1000}:null;
 const transform=(schema,ids=global)=>{if(schema.anyOf)return {anyOf:schema.anyOf.map(s=>transform(s,ids))};if(schema.type==='object')return object(Object.fromEntries(Object.entries(schema.properties).map(([k,s])=>[k,k==='refs'?enumArray(ids):k==='requirementRefs'?enumArray(requirement):transform(s,['obligationAssessments','useScan'].includes(k)?[...global,...applicability]:ids)])));if(schema.type==='array')return {...schema,items:transform(schema.items,ids)};return structuredClone(schema);};
 const output=transform(legacy.outputSchema);
 const originKeys=packet.applicability?.origins?.map(o=>o.key)??[];
 const bindOrigins=s=>{if(s?.type==='object')for(const[k,v]of Object.entries(s.properties)){if(['originKeys','assessedOriginKeys'].includes(k)){v.items=originKeys.length?{type:'string',enum:originKeys}:{type:'string'};if(!originKeys.length)v.maxItems=0;}else if(k==='originKey'&&originKeys.length)s.properties[k]={type:'string',enum:originKeys};else bindOrigins(v);}else if(s?.type==='array')bindOrigins(s.items);else if(s?.anyOf)s.anyOf.forEach(bindOrigins);};bindOrigins(output);const questions=kind==='readiness'?packet.expectedCoverage:packet.questions;
 const key=kind==='readiness'?'coverage':'relations',original=legacy.outputSchema.properties[key].items;
 if(kind==='readiness')output.properties.findings.items.properties.questionId={type:'string',enum:questions.map(q=>q.id)};
 if(output.properties.useScan&&!originKeys.length)output.properties.useScan.properties.findings.maxItems=0;
 const qSchemas={};
 for(const q of questions){const id=q.id;const support=paired(kind==='readiness'?refs:q.refs);const metadataSupport=kind==='readiness'?metadata:q.refs.filter(r=>!/^\/content\/(sections\/\d+\/body|claims\/\d+\/text)$/.test(r.location)).map(r=>add([r],'applicability'));
 const requiredTask=kind==='semantic'?q.requirementRefs.map(p=>refs.find(r=>r.location==='/taskCard'+p)).filter(Boolean).map(r=>add([r],'task_requirement')):task;
 const branches=[];for(const state of kind==='readiness'?['ready','gap','not_applicable']:['supported','insufficient','contradicted','uncertain','not_applicable']){
  if(state==='not_applicable'&&kind==='semantic'&&q.primaryApplicability!=='not_applicable')continue;
  const positive=['ready','supported'].includes(state);let ids=positive?[...support,...(id==='source_applicability'?metadataSupport:[])]:state==='not_applicable'?requiredTask:global;
  if(!ids.length)continue;const s=transform(original,ids);s.properties.refs.minItems=1;delete s.properties.questionId;s.required=s.required.filter(k=>k!=='questionId');s.properties[kind==='readiness'?'status':'outcome']={type:'string',enum:[state]};branches.push(s);
 }
 qSchemas[id]={anyOf:branches};}
 output.properties[key]=object(qSchemas);
 const ownAssess=(name,entries,field,root)=>{if(!legacy.outputSchema.properties[name])return;const item=legacy.outputSchema.properties[name].items;output.properties[name]=object(Object.fromEntries(entries.map(e=>{const index=packet[root].findIndex(v=>v.id===e.id);const own=refs.filter(r=>r.location.startsWith('/'+root+'/'+index+'/')).map(r=>add([r],'own_'+root));const s=transform(item,own);if(s.properties.textHash&&e.textHash)s.properties.textHash={type:'string',enum:[e.textHash]};delete s.properties[field];s.required=s.required.filter(k=>k!==field);return[e.id,s];})));};
 if(kind==='readiness'){ownAssess('sourceAssessments',packet.sourceRecords,'sourceId','sourceRecords');ownAssess('visualAssessments',(packet.visualCatalogue??[]).filter(e=>!packet.expectedVisualAssessmentIds||packet.expectedVisualAssessmentIds.includes(e.id)),'visualId','visualCatalogue');}
 const selectionHash=hash({protocol:EVIDENCE_SELECTION_PROTOCOL,kind,packet,catalogue,output});output.properties.selectionProtocol={type:'string',enum:[EVIDENCE_SELECTION_PROTOCOL]};output.properties.selectionHash={type:'string',enum:[selectionHash]};output.required=Object.keys(output.properties);
 const instruction=legacy.prompt.slice(0,legacy.prompt.indexOf('UNTRUSTED_JSON_DATA'));
 return {packet,outputSchema:output,selectionHash,catalogue,prompt:instruction+'\nCITATION SELECTION TRANSPORT: Do not write JSON pointers or quotations. Every refs value is an array of catalogue IDs selected under the exact per-question outcome schema. A selected adopted_pair explicitly selects BOTH its displayed content and source quote. Read both before selecting. Diagnostic choices cannot establish positive support. Task-only choices cannot establish readiness. Empty support choices mean report gap/insufficient, not invented evidence. coverage/relations and source/visual assessments are objects keyed by exact identities. Judge independently; valid selections do not prove relevance.\nUNTRUSTED_JSON_DATA\n'+JSON.stringify({packet,evidenceSelection:{protocol:EVIDENCE_SELECTION_PROTOCOL,selectionHash,catalogue}})+'\nEND_UNTRUSTED_JSON_DATA'};
}
export function decodeEvidenceSelection(raw,request,kind){
 if(request.outputSchema.properties.selectionProtocol.enum[0]==='evidence-selection-v1')return decodeV1(raw,request,kind);
 const v=typeof raw==='string'?JSON.parse(raw):structuredClone(raw);check(request.outputSchema,v);
 if(v.selectionProtocol!==EVIDENCE_SELECTION_PROTOCOL||v.selectionHash!==request.selectionHash)invalid('Changed selection mapping');
 const decode=x=>{if(Array.isArray(x))return x.map(decode);if(!plain(x))return x;return Object.fromEntries(Object.entries(x).map(([k,y])=>[k,['refs','requirementRefs'].includes(k)?[...new Map(y.flatMap(id=>request.catalogue[id]?.refs??invalid('Unknown ID')).map(r=>[canonical(r),r])).values()]:decode(y)]));};
 const report=decode(v);delete report.selectionProtocol;delete report.selectionHash;
 const key=kind==='readiness'?'coverage':'relations';report[key]=Object.entries(report[key]).map(([questionId,x])=>({questionId,...x}));
 for(const[name,field]of [['sourceAssessments','sourceId'],['visualAssessments','visualId']])if(plain(report[name]))report[name]=Object.entries(report[name]).map(([id,x])=>({[field]:id,...x}));
 return report;
}
