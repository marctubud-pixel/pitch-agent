import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';

export const APPLICABILITY_PROTOCOL='research-readiness-v2';
export const APPLICABILITY_GATE='research-applicability-gate-v1';
export const APPLICABILITY_HANDLING='correction-handling-v4';
const fail=message=>{throw Object.assign(new Error(message),{code:'INVALID_RESEARCH_APPLICABILITY'});};
export const applicabilityHash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const text={type:'string',minLength:1,maxLength:100000};
const en=values=>({type:'string',enum:values});
const array=items=>({type:'array',items,maxItems:10000});
const object=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const ref=object({location:text,quote:text});
function exactKeys(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)))fail('Invalid applicability shape');}
function nonempty(value){if(typeof value!=='string'||!value.trim())fail('Nonempty applicability text required');}
export function applicabilityRefs(refs,packet,{required=true}={}){
 if(!Array.isArray(refs)||(required&&!refs.length))fail('Exact applicability references required');
 for(const ref of refs){exactKeys(ref,['location','quote']);nonempty(ref.quote);if(!/^\/(content|taskCard|sourceRecords|visualCatalogue|applicability)\//u.test(ref.location)||/~(?![01])/u.test(ref.location))fail('Invalid applicability pointer');let value=packet;for(const key of ref.location.slice(1).split('/').map(k=>k.replaceAll('~1','/').replaceAll('~0','~'))){if(!value||typeof value!=='object'||!Object.hasOwn(value,key))fail('Unknown applicability reference');value=value[key];}if(typeof value!=='string'||!value.includes(ref.quote))fail('Wrong applicability quote');}
}
export function obligationOrigins(sources){
 const inventory=new Map(),origins=new Map();
 function visit(source){
  const old=inventory.get(source.key);if(old){if(!isDeepStrictEqual(old,source))fail('Conflicting immutable source ancestry');return;}
  inventory.set(source.key,source);
  for(const nested of source.reviewedSources??[])visit(nested);
  for(const finding of source.findings??[]){const entry={key:finding.key,sourceKey:source.key,kind:source.kind,targetArtifactId:source.targetArtifactId??null,targetContentHash:source.targetContentHash??null,reportId:source.reportId??source.feedback?.id,protocolVersion:source.protocolVersion??'human-feedback',reportHash:source.reportHash??source.feedbackHash,location:finding.location,originalValueHash:finding.originalValueHash,originalValue:structuredClone(finding.originalValue),authority:finding.authority,derivedFrom:source.kind==='correction_review'?finding.originalValue.findingKey??null:null};if(origins.has(entry.key)&&!isDeepStrictEqual(origins.get(entry.key),entry))fail('Conflicting obligation origin');origins.set(entry.key,entry);}
 }
 for(const source of sources)visit(source);
 for(const origin of origins.values())if(origin.derivedFrom&&!origins.has(origin.derivedFrom))fail('Missing negative wrapper ancestry');
 return [...origins.values()].sort((a,b)=>a.key.localeCompare(b.key));
}
export function applicabilityContext({sources,taskCard,policy,assignment,history,upstreams=[],decision}){
 if(!Array.isArray(sources)||!Array.isArray(history)||!Array.isArray(upstreams))fail('Complete applicability inventory required');
 if(!taskCard?.id||!policy||!assignment||!decision||decision.targetStage!=='strategy')fail('Bound confirmed decision and reviewer assignment required');
 const data={version:APPLICABILITY_GATE,decision:structuredClone(decision),taskCard:structuredClone(taskCard),policy:structuredClone(policy),assignment:structuredClone(assignment),history:structuredClone(history),upstreams:structuredClone(upstreams),sources:structuredClone(sources),origins:obligationOrigins(sources)};
 const durable=JSON.parse(JSON.stringify(data));
 return {...durable,generationHash:applicabilityHash(durable)};
}
export function validateApplicabilityContext(input){
 const {generationHash,origins,version,...rest}=input??{};
 const expected=applicabilityContext(rest);if(!isDeepStrictEqual(input,expected))fail('Applicability context or generation changed');return expected;
}
export function applicabilitySchema(context){
 const shared={material:text,reason:text,refs:array(ref)};
 const procurement={anyOf:[object({kind:en(['required_now']),state:en(['available','missing']),...shared,decisionDependency:text}),object({kind:en(['conditional_later']),state:en(['missing']),...shared,permittedUse:text,prohibitedUse:text,activationCondition:text,returnStage:en(['research'])}),object({kind:en(['background_unknown']),state:en(['missing']),...shared})]};
 return array(object({originKey:context.origins.length?en(context.origins.map(o=>o.key)):text,preservation:object({state:en(['retained','violated']),reason:text,refs:array(ref)}),procurement,requirementRefs:array(ref),replacement:object({originKeys:array(text),reason:text,refs:array(ref)}),reason:text}));
}
export function evaluateResearchApplicability(packet,assessments,{useScan,expectedGeneration=packet.applicability.generationHash}={}){
 const context=validateApplicabilityContext(packet.applicability);
 if(expectedGeneration!==context.generationHash)fail('Stale applicability generation');
 if(!Array.isArray(assessments)||assessments.length!==context.origins.length||new Set(assessments.map(a=>a.originKey)).size!==assessments.length)fail('Complete unique origin and negative wrapper coverage required');
 const blockers=[],restrictions=[];
 for(const entry of assessments){
  exactKeys(entry,['originKey','preservation','procurement','requirementRefs','replacement','reason']);
  const origin=context.origins.find(o=>o.key===entry.originKey);if(!origin)fail('Unknown obligation origin');
  nonempty(entry.reason);exactKeys(entry.preservation,['state','reason','refs']);if(!['retained','violated'].includes(entry.preservation.state))fail('Invalid preservation state');nonempty(entry.preservation.reason);applicabilityRefs(entry.preservation.refs,packet);
  applicabilityRefs(entry.requirementRefs,packet);if(!entry.requirementRefs.some(r=>r.location.startsWith('/taskCard/')||r.location.startsWith('/applicability/decision/')))fail('Obligation requires exact task or decision support');
  const duty=entry.procurement;const shared=['kind','state','material','reason','refs'];
  if(duty.kind==='required_now'){exactKeys(duty,[...shared,'decisionDependency']);if(!['available','missing'].includes(duty.state))fail('Invalid material state');nonempty(duty.decisionDependency);}
  else if(duty.kind==='conditional_later'){exactKeys(duty,[...shared,'permittedUse','prohibitedUse','activationCondition','returnStage']);if(duty.state!=='missing'||duty.returnStage!=='research')fail('Conditional material remains missing');for(const k of ['permittedUse','prohibitedUse','activationCondition'])nonempty(duty[k]);}
  else if(duty.kind==='background_unknown'){exactKeys(duty,shared);if(duty.state!=='missing')fail('Background uncertainty remains missing');}
  else fail('Unknown procurement disposition');
  for(const k of ['material','reason'])nonempty(duty[k]);applicabilityRefs(duty.refs,packet);
  if(duty.kind==='required_now'&&duty.state==='available'&&!duty.refs.some(r=>/^\/sourceRecords\/[0-9]+\/text$/u.test(r.location)||/^\/visualCatalogue\/[0-9]+\/text$/u.test(r.location)||/^\/content\/(sections\/[0-9]+\/body|claims\/[0-9]+\/text)$/u.test(r.location)))fail('Available material requires actual supplied evidence, never catalogue notes');
  exactKeys(entry.replacement,['originKeys','reason','refs']);if(!Array.isArray(entry.replacement.originKeys)||new Set(entry.replacement.originKeys).size!==entry.replacement.originKeys.length)fail('Invalid replacement lineage');
  if(entry.replacement.originKeys.length){nonempty(entry.replacement.reason);applicabilityRefs(entry.replacement.refs,packet);if(!entry.replacement.originKeys.includes(origin.key))fail('Replacement must identify its original finding');for(const key of entry.replacement.originKeys)if(!context.origins.some(o=>o.key===key))fail('Replacement targets absent ancestry');}
  else if(entry.replacement.reason!=='none'||entry.replacement.refs.length)fail('Empty replacement must be explicit none');
  let authorityOrigin=origin;const ancestry=new Set();
  while(authorityOrigin.derivedFrom){if(ancestry.has(authorityOrigin.key))fail('Cyclic obligation ancestry');ancestry.add(authorityOrigin.key);authorityOrigin=context.origins.find(o=>o.key===authorityOrigin.derivedFrom);if(!authorityOrigin)fail('Missing obligation authority');}
  if((['verification','human','creative_panel','feedback_review','owner_edge'].includes(authorityOrigin.kind)||origin.originalValue?.category==='factual_risk')&&duty.kind!=='required_now')fail('Readiness cannot waive unrelated factual, creative or human gates');
  const original=origin.originalValue;
  const negative=original?.severity==='blocker'||original?.status==='gap'||original?.status==='unresolved';
  if(negative&&(duty.kind!=='required_now'||origin.targetArtifactId===packet.artifactId&&duty.state==='available')){
   const descendants=context.origins.filter(o=>{let current=o;const seen=new Set();while(current?.derivedFrom&&!seen.has(current.key)){seen.add(current.key);if(current.derivedFrom===origin.key)return true;current=context.origins.find(x=>x.key===current.derivedFrom);}return false;}).map(o=>o.key);
   if(![origin.key,...descendants].every(key=>entry.replacement.originKeys.includes(key)))fail('Negative replacement must cover every derived wrapper independently');
  }
  if(entry.preservation.state==='violated'||duty.kind==='required_now'&&duty.state==='missing')blockers.push(origin.key);
  if(duty.kind==='conditional_later')restrictions.push({originKey:origin.key,sourceKey:origin.sourceKey,material:duty.material,permittedUse:duty.permittedUse,prohibitedUse:duty.prohibitedUse,activationCondition:duty.activationCondition,returnStage:duty.returnStage});
 }
 if(useScan){
  exactKeys(useScan,['contentHash','assessedOriginKeys','findings']);if(useScan.contentHash!==packet.contentHash||!isDeepStrictEqual(useScan.assessedOriginKeys,restrictions.map(r=>r.originKey)))fail('Use scan binds actual full content and every restriction');
  if(!Array.isArray(useScan.findings))fail('Full downstream use scan required');
  for(const finding of useScan.findings){exactKeys(finding,['originKey','refs','reason']);if(!restrictions.some(r=>r.originKey===finding.originKey))fail('Unknown activated restriction');applicabilityRefs(finding.refs,packet);nonempty(finding.reason);blockers.push(finding.originKey);}
 }
 return {gateVersion:APPLICABILITY_GATE,generationHash:context.generationHash,blockers:[...new Set(blockers)],restrictions,restrictionManifestHash:applicabilityHash(restrictions),hasBlockingFindings:blockers.length>0};
}
