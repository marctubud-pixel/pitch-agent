import {createHash} from 'node:crypto';
import {isDeepStrictEqual as equal} from 'node:util';
import {deriveDeckProjection} from '../../apps/workbench-preview/src/proposal/generic-deck/mapper.mjs';
export const PRELAYOUT_PROTOCOL='proposal-prelayout-v1',PRELAYOUT_PURPOSE='proposal_prelayout_check';
export const prelayoutHash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const need=(ok,code)=>{if(!ok)throw Object.assign(Error(code),{code});};
const text=(v,max=2000)=>typeof v==='string'&&v.trim()&&v.length<=max;
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const fields=(v,keys,code='PRELAYOUT_SHAPE_INVALID')=>need(v&&typeof v==='object'&&!Array.isArray(v)&&equal(Object.keys(v).sort(),keys.slice().sort()),code);
const stages=['brief','research','strategy','copy','visual'];
const envelope=Object.freeze({operation:PRELAYOUT_PROTOCOL,limits:Object.freeze({maxImages:32,maxBytes:32*1024*1024,maxPixels:80_000_000})});
function original(body){fields(body,['identity','sha256','bytes','originalText']);need(text(body.identity,2048)&&typeof body.originalText==='string'&&body.bytes===Buffer.byteLength(body.originalText)&&prelayoutHash(body.originalText)===body.sha256,'PRELAYOUT_ORIGINAL_CHANGED');JSON.parse(body.originalText);}
function quote(input,ref,maximum=4000,cache=new Map()){fields(ref,['stage','pointer','quote','sourceSha256']);const body=ref.stage==='task'?input.taskContainer:input.originals[ref.stage];need(body&&ref.sourceSha256===body.sha256&&text(ref.pointer,2000)&&ref.pointer.startsWith('/')&&!/~(?![01])/.test(ref.pointer)&&text(ref.quote,maximum),'PRELAYOUT_ISSUE_REFERENCE_INVALID');if(!cache.has(ref.stage))cache.set(ref.stage,JSON.parse(body.originalText));let value=cache.get(ref.stage);for(const part of ref.pointer.slice(1).split('/')){const key=part.replaceAll('~1','/').replaceAll('~0','~');need(value&&typeof value==='object'&&Object.hasOwn(value,key),'PRELAYOUT_ISSUE_REFERENCE_INVALID');value=value[key];}need(typeof value==='string'&&value.includes(ref.quote),'PRELAYOUT_ISSUE_REFERENCE_INVALID');return ref;}
function knownFor(derived){
 const {projection,coverage}=derived,knownKeys=new Set();
 for(const block of projection.limitations)for(const p of block.paragraphs)for(const r of p.origins)knownKeys.add(r.stage+'\0'+r.pointer);
 for(const block of [...projection.brief,...projection.research,...projection.strategy,...projection.copy,...projection.directions.flatMap(d=>d.blocks)])for(const p of block.paragraphs)if(p.qualifiers.length)for(const r of p.origins)knownKeys.add(r.stage+'\0'+r.pointer);
 return coverage.filter(r=>r.placement==='qualifier'||knownKeys.has(r.stage+'\0'+r.pointer)).map(r=>({stage:r.stage,pointer:r.pointer,quote:r.value,sourceSha256:r.sourceSha256}));
}
/** Pure description only. The program factory must establish actual native source qualification first. */
export function derivePrelayoutBasis({mapped,policy,databaseBindingHash,directorMethod}){
 need(mapped?.kind==='mapped'&&mapped.authority==='none'&&mapped.input?.prelayoutCheck===null,'PRELAYOUT_BASE_REQUIRED');
 const input=mapped.input,id=mapped.sourceIdentity,originals=Object.fromEntries(stages.map(s=>[s,structuredClone(input.sources[s].original)]));
 const {projection,coverage}=deriveDeckProjection(input),knownLimitations=knownFor({projection,coverage});
 const task=JSON.parse(mapped.taskContainer.originalText),visual=JSON.parse(originals.visual.originalText);
 need(policy?.version===input.policyVersion&&task.id===input.taskCardId&&hex(databaseBindingHash),'PRELAYOUT_SOURCE_CHANGED');
 const baseInputSha256=prelayoutHash(input),baseProjectionSha256=prelayoutHash(projection);
 const sourceTuple={protocol:'proposal-prelayout-source-v1',projectId:input.projectId,databaseBindingHash,task:{taskCardId:input.taskCardId,taskOriginalSha256:mapped.taskContainer.sha256,briefSha256:originals.brief.sha256},policy:{version:policy.version,sha256:prelayoutHash(policy)},sources:Object.fromEntries(stages.filter(s=>s!=='brief').map(s=>[s,{artifactId:input.sources[s].artifactId,sha256:originals[s].sha256}])),methods:{research:input.researchMethod,director:{path:directorMethod.path,version:directorMethod.version,sha256:directorMethod.sha256}},semantic:structuredClone(id.semantic),copyEnvelopeHash:id.sourceHash,bSourceHash:visual.sourceHash,bPlanHash:visual.planHash,directionIds:input.directionIds,typedViews:input.visualRequirements,targetImages:input.images.map(({originalLocator,visualArtifactId,visualContentHash,...image})=>image),baseInputSha256,baseProjectionSha256};
 const result={protocol:PRELAYOUT_PROTOCOL,sourceTuple,sourceTupleHash:prelayoutHash(sourceTuple),baseInputSha256,baseProjectionSha256,directorMethod:structuredClone(directorMethod),originals,taskContainer:structuredClone(mapped.taskContainer),baseImages:structuredClone(input.images),images:input.images.map(i=>({imageId:i.imageId,sha256:i.sha256,mediaType:i.mediaType,byteLength:i.bytes,width:i.width,height:i.height})),knownLimitations,carriedLimitationsHash:prelayoutHash(knownLimitations),imageEnvelope:structuredClone(envelope)};
 validatePrelayoutInput(result);return result;
}
export function validatePrelayoutInput(input){
 fields(input,['protocol','sourceTuple','sourceTupleHash','baseInputSha256','baseProjectionSha256','directorMethod','originals','taskContainer','baseImages','images','knownLimitations','carriedLimitationsHash','imageEnvelope']);
 need(input.protocol===PRELAYOUT_PROTOCOL&&prelayoutHash(input.sourceTuple)===input.sourceTupleHash&&input.sourceTuple.baseInputSha256===input.baseInputSha256&&input.sourceTuple.baseProjectionSha256===input.baseProjectionSha256,'PRELAYOUT_SOURCE_CHANGED');
 fields(input.originals,stages);for(const stage of stages)original(input.originals[stage]);original(input.taskContainer);
 const t=input.sourceTuple;fields(t,['protocol','projectId','databaseBindingHash','task','policy','sources','methods','semantic','copyEnvelopeHash','bSourceHash','bPlanHash','directionIds','typedViews','targetImages','baseInputSha256','baseProjectionSha256']);need(t.protocol==='proposal-prelayout-source-v1'&&hex(t.databaseBindingHash)&&input.taskContainer.sha256===t.task.taskOriginalSha256&&input.originals.brief.sha256===t.task.briefSha256,'PRELAYOUT_SOURCE_CHANGED');
 for(const stage of stages.filter(s=>s!=='brief'))need(input.originals[stage].sha256===t.sources[stage]?.sha256,'PRELAYOUT_SOURCE_CHANGED');
 const task=JSON.parse(input.taskContainer.originalText);need(task.id===t.task.taskCardId&&task.brief===input.originals.brief.originalText,'PRELAYOUT_TASK_CHANGED');
 need(Array.isArray(input.baseImages)&&equal(input.baseImages.map(({originalLocator,visualArtifactId,visualContentHash,...i})=>i),t.targetImages),'PRELAYOUT_IMAGE_SET_CHANGED');
 const brief=JSON.parse(input.originals.brief.originalText),base={protocol:'proposal-deck-input-v2',projectId:t.projectId,taskCardId:t.task.taskCardId,policyVersion:t.policy.version,proposalType:brief.fields?.proposalType??brief.metadata?.type,researchMethod:t.methods.research,sources:Object.fromEntries(stages.map(stage=>[stage,{artifactId:stage==='brief'?t.task.taskCardId:t.sources[stage].artifactId,projectId:t.projectId,taskCardId:t.task.taskCardId,original:input.originals[stage]}])),directionIds:t.directionIds,images:input.baseImages,visualRequirements:t.typedViews,prelayoutCheck:null,relation:{kind:'not_supplied'}};
 const derived=deriveDeckProjection(base);need(prelayoutHash(base)===input.baseInputSha256&&prelayoutHash(derived.projection)===input.baseProjectionSha256,'PRELAYOUT_BASE_INPUT_CHANGED');need(equal(input.knownLimitations,knownFor(derived)),'PRELAYOUT_LIMITATIONS_CHANGED');

 fields(input.directorMethod,['path','version','sha256','originalText']);need(input.directorMethod.path==='docs/agents/proposal-director.md'&&text(input.directorMethod.version,80)&&prelayoutHash(input.directorMethod.originalText)===input.directorMethod.sha256&&equal(input.sourceTuple.methods.director,{path:input.directorMethod.path,version:input.directorMethod.version,sha256:input.directorMethod.sha256}),'PRELAYOUT_METHOD_CHANGED');
 need(Array.isArray(input.images)&&input.images.length>0&&input.images.length<=32&&equal(input.imageEnvelope,envelope),'PRELAYOUT_VISION_LIMIT');
 let bytes=0,pixels=0;const seen=new Set();for(const i of input.images){fields(i,['imageId','sha256','mediaType','byteLength','width','height']);need(text(i.imageId,512)&&!seen.has(i.imageId)&&hex(i.sha256)&&['image/png','image/jpeg'].includes(i.mediaType)&&Number.isSafeInteger(i.byteLength)&&i.byteLength>0&&i.byteLength<=8*1024*1024&&[i.width,i.height].every(n=>Number.isSafeInteger(n)&&n>0)&&i.width*i.height<=20_000_000,'PRELAYOUT_IMAGE_INVALID');seen.add(i.imageId);bytes+=i.byteLength;pixels+=i.width*i.height;}
 need(bytes<=envelope.limits.maxBytes&&pixels<=envelope.limits.maxPixels&&equal(input.images,input.sourceTuple.targetImages.map(i=>({imageId:i.imageId,sha256:i.sha256,mediaType:i.mediaType,byteLength:i.bytes,width:i.width,height:i.height}))),'PRELAYOUT_IMAGE_SET_CHANGED');
 need(Array.isArray(input.knownLimitations)&&prelayoutHash(input.knownLimitations)===input.carriedLimitationsHash,'PRELAYOUT_LIMITATIONS_CHANGED');const cache=new Map();input.knownLimitations.forEach(r=>quote(input,r,8*1024*1024,cache));
 need(Buffer.byteLength(JSON.stringify(input))<=32*1024*1024,'PRELAYOUT_INPUT_LIMIT');return input;
}
const string=(maxLength=2000)=>({type:'string',minLength:1,maxLength});
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const obj=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const refSchema=obj({stage:{enum:[...stages,'task']},pointer:string(),quote:string(4000),sourceSha256:string(64)});
export const PRELAYOUT_OUTPUT_SCHEMA=freeze(obj({protocol:{enum:[PRELAYOUT_PROTOCOL]},sourceTupleHash:string(64),baseInputSha256:string(64),decision:{enum:['clear','return','unknown']},summary:string(),newIssues:{type:'array',maxItems:12,items:obj({id:string(80),category:{enum:['new_fact_conflict','version_mismatch','missing_required_item']},owner:{enum:['brief_owner','research_owner','strategy_owner','copy_owner','visual_owner','layout_owner']},observation:string(),references:{type:'array',minItems:1,maxItems:6,items:refSchema}})},carriedLimitationsHash:string(64)}));
export function validatePrelayoutReport(raw,input){
 validatePrelayoutInput(input);fields(raw,Object.keys(PRELAYOUT_OUTPUT_SCHEMA.properties),'PRELAYOUT_REPORT_INVALID');
 need(raw.protocol===PRELAYOUT_PROTOCOL&&raw.sourceTupleHash===input.sourceTupleHash&&raw.baseInputSha256===input.baseInputSha256&&raw.carriedLimitationsHash===input.carriedLimitationsHash&&['clear','return','unknown'].includes(raw.decision)&&text(raw.summary)&&Array.isArray(raw.newIssues)&&raw.newIssues.length<=12,'PRELAYOUT_REPORT_INVALID');
 const ids=new Set(),cache=new Map();for(const issue of raw.newIssues){fields(issue,['id','category','owner','observation','references'],'PRELAYOUT_REPORT_INVALID');need(text(issue.id,80)&&!ids.has(issue.id)&&PRELAYOUT_OUTPUT_SCHEMA.properties.newIssues.items.properties.category.enum.includes(issue.category)&&PRELAYOUT_OUTPUT_SCHEMA.properties.newIssues.items.properties.owner.enum.includes(issue.owner)&&text(issue.observation)&&Array.isArray(issue.references)&&issue.references.length>0&&issue.references.length<=6,'PRELAYOUT_REPORT_INVALID');ids.add(issue.id);issue.references.forEach(r=>quote(input,r,4000,cache));need(!issue.references.every(r=>input.knownLimitations.some(k=>k.stage===r.stage&&k.pointer===r.pointer&&k.quote.includes(r.quote))),'PRELAYOUT_KNOWN_LIMITATION_DUPLICATED');}
 need(raw.decision!=='clear'||raw.newIssues.length===0,'PRELAYOUT_REPORT_INVALID');need(raw.decision!=='return'||raw.newIssues.length>0,'PRELAYOUT_REPORT_INVALID');return structuredClone(raw);
}
export function buildPrelayoutDirectorRequest(input){
 validatePrelayoutInput(input);
 return {prompt:'你是比稿Agent，执行排版前简短后台检查，不创作、不评分、不作客户或人类批准。只检查新增事实矛盾、错版、必要缺件；新增问题必须绑定下面完整原件的具体pointer与原quote，并归属原负责人。已知pending、演练设定和未验证效果按knownLimitations随稿，不能重复生成相同待办。完整阅读五源原文与全部附件；无新阻断用clear，新增问题用return，无法判断用unknown。只返回符合schema的原JSON。\nUNTRUSTED_JSON_DATA\n'+JSON.stringify(input)+'\nEND_UNTRUSTED_JSON_DATA',outputSchema:PRELAYOUT_OUTPUT_SCHEMA,images:structuredClone(input.images),imageEnvelope:structuredClone(input.imageEnvelope)};
}
export function prelayoutRuntimePacket(job,attempt){const request=buildPrelayoutDirectorRequest(job.task.prelayoutInput);return Buffer.from(JSON.stringify({protocol:'proposal-prelayout-runtime-v1',purpose:PRELAYOUT_PURPOSE,projectId:job.task.prelayoutInput.sourceTuple.projectId,jobId:job.id,attemptId:attempt.id,binding:job.binding,input:job.task.prelayoutInput,request}));}
/** Conservative finite wire preflight before any claim; the real HTTP reader still enforces every actual limit. */
export function assertPrelayoutProviderEnvelope(input,images,provider){
 const request=buildPrelayoutDirectorRequest(input),cfg=provider?.operatorConfig;need(provider?.adapter==='workbench-model-http-v1'&&cfg?.vision===true&&cfg.envelopes?.includes(PRELAYOUT_PROTOCOL)&&Number.isSafeInteger(cfg.maxRequestBytes)&&cfg.maxRequestBytes>0&&Number.isSafeInteger(cfg.maxOutputBytes)&&cfg.maxOutputBytes>0&&Number.isSafeInteger(cfg.maxResponseBytes)&&cfg.maxResponseBytes>0&&cfg.maxOutputBytes<=1024*1024&&cfg.maxResponseBytes<=6*1024*1024+8192,'PRELAYOUT_PROVIDER_INPUT_LIMIT');
 need(images.length===input.images.length&&images.every((image,n)=>image.bytes instanceof Uint8Array&&image.bytes.length===input.images[n].byteLength),'PRELAYOUT_IMAGE_SET_CHANGED');
 const wire={protocol:'workbench-stateless-model-json-v1',model:provider.model,invocationId:'x'.repeat(128),contextMode:'stateless-v1',prompt:request.prompt,outputSchema:request.outputSchema,images:input.images.map((image,occurrence)=>({...image,occurrence,base64:''})),imageEnvelope:request.imageEnvelope};
 const bytes=Buffer.byteLength(JSON.stringify(wire))+images.reduce((n,image)=>n+4*Math.ceil(image.bytes.length/3),0)+1024;need(bytes<=cfg.maxRequestBytes&&Buffer.byteLength(request.prompt)<=cfg.maxRequestBytes,'PRELAYOUT_PROVIDER_INPUT_LIMIT');return {authority:'none',wireUpperBoundBytes:bytes};
}
/** Transport label is finite and only valid with the complete domain-owned request packet. No source qualification is granted here. */
export function assertPrelayoutTransport(call){
 const requested=call.request?.imageEnvelope?.operation===PRELAYOUT_PROTOCOL;let p;try{p=JSON.parse(Buffer.from(call.runtimePacketBytes).toString('utf8'));}catch{if(requested)need(false,'PRELAYOUT_TRANSPORT_PURPOSE_REQUIRED');return;}
 const named=p?.protocol==='proposal-prelayout-runtime-v1'||p?.purpose===PRELAYOUT_PURPOSE;if(!requested&&!named)return;need(requested,'PRELAYOUT_TRANSPORT_REQUEST_CHANGED');
 fields(p,['protocol','purpose','projectId','jobId','attemptId','binding','input','request'],'PRELAYOUT_TRANSPORT_PURPOSE_REQUIRED');need(p.protocol==='proposal-prelayout-runtime-v1'&&p.purpose===PRELAYOUT_PURPOSE&&p.projectId===p.input.sourceTuple.projectId&&p.jobId==='prelayout-'+prelayoutHash([p.projectId,p.input.sourceTupleHash])&&p.attemptId===call.attemptId&&equal(p.binding,call.binding)&&p.binding.role==='proposal-director','PRELAYOUT_TRANSPORT_PURPOSE_REQUIRED');
 const expected=buildPrelayoutDirectorRequest(p.input);need(equal(p.request,expected)&&call.request.runId===call.attemptId&&call.request.prompt===expected.prompt&&equal(call.request.outputSchema,expected.outputSchema)&&equal(call.request.imageEnvelope,expected.imageEnvelope),'PRELAYOUT_TRANSPORT_REQUEST_CHANGED');
 const manifest=(call.images??[]).map(i=>({imageId:i.imageId??i.id,sha256:i.sha256,mediaType:i.mediaType,byteLength:i.byteLength,width:i.width,height:i.height}));need(equal(manifest,p.input.images),'PRELAYOUT_TRANSPORT_IMAGES_CHANGED');
}
