import {createHash} from 'node:crypto';
import {isDeepStrictEqual as equal} from 'node:util';
import {registeredSources} from './research-sources.mjs';
import {researchDataBasis} from './research-chart-data.mjs';
export const ACQUISITION_PROTOCOL='research-acquisition-v1';
export const ACQUISITION_BRANCHES=Object.freeze(['professional_reports','brand_product','same_purpose_competitors','users_scenes']);
export const ACQUISITION_PURPOSES=Object.freeze(['research_acquisition_plan','research_acquisition_branch']);
export const ACQUISITION_COMMANDS=Object.freeze(['research-acquisition-cancel','research-acquisition-request','research-acquisition-start','research-acquisition-plan-dispatch','research-acquisition-plan-result','research-acquisition-plan-complete','research-acquisition-tool-claim','research-acquisition-tool-result','research-acquisition-branch-complete','research-acquisition-fail','research-acquisition-seal']);
export const ACQUISITION_LIMITS=Object.freeze({queries:8,resultsPerQuery:5,pageAttempts:12,pdfAttempts:4,imageAttempts:4,admittedRecords:12,admittedTextBytes:131072,searchBytes:1048576,captureBytes:2097152,extractionBytes:32768,totalSearchBytes:8388608,totalCaptureBytes:25165824,totalExtractionBytes:393216,timeoutMs:10000,elapsedMs:300000,maxParallelBranches:4,planOutputBytes:65536});
export const acquisitionHash=value=>createHash('sha256').update(typeof value==='string'||value instanceof Uint8Array?value:JSON.stringify(value)).digest('hex');
export const acquisitionNeed=(value,code,message)=>{if(!value)throw Object.assign(new Error(message),{code,status:['REVISION_CONFLICT','COMMAND_ID_REUSED'].includes(code)?409:422});};
const need=acquisitionNeed;
const copy=value=>structuredClone(value);
const boundedText=(s,max=1024)=>typeof s==='string'&&s.trim()&&s.length<=max&&!/[\u0000-\u001f\u007f]/.test(s);
export function validateAcquisitionConfiguration(c){
 need(c&&typeof c==='object'&&!Array.isArray(c)&&Object.keys(c).every(k=>['searchProviderId','limits'].includes(k))&&boundedText(c.searchProviderId,80),'ACQUISITION_CONFIGURATION_INVALID','Explicit searchProviderId and bounded limits required');
 for(const [k,v]of Object.entries(c.limits??{}))need(Object.hasOwn(ACQUISITION_LIMITS,k)&&Number.isSafeInteger(v)&&v>0&&v<=ACQUISITION_LIMITS[k],'ACQUISITION_CONFIGURATION_INVALID','Limits must be positive and no greater than server policy');
 return [{key:'research_planner'},{key:'research'}];
}
export function acquisitionInput(p,request){
 need(request&&Object.keys(request).every(k=>['protocolVersion','commandId','expectedRevision','sourceEntryIds','materialIds'].includes(k))&&request.protocolVersion===ACQUISITION_PROTOCOL&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(request.commandId??'')&&Number.isSafeInteger(request.expectedRevision),'INVALID_REQUEST','Exact versioned acquisition request required');
 for(const k of ['sourceEntryIds','materialIds'])need(Array.isArray(request[k])&&request[k].length<=20&&new Set(request[k]).size===request[k].length&&request[k].every(s=>boundedText(s,200)),'INVALID_REQUEST','Unique registered selections required');
 const taskCard=p.taskCards.find(c=>c.id===p.activeTaskCardId),confirmations=p.confirmations.filter(c=>c.taskCardId===taskCard?.id);
 researchDataBasis({taskCard,confirmations,sourceRecords:[]});
 const manualSources=request.sourceEntryIds.length?registeredSources(p,request.sourceEntryIds,'http://localhost'):[];
 const materials=request.materialIds.map(id=>{const d=(p.intakeDocuments??[]).find(d=>d.id===id);need(d&&d.raw&&['ready','no_text'].includes(d.status),'MATERIAL_UNAVAILABLE','Registered completed intake original required');return {document:copy(d),adoption:(p.intakeOperations??[]).filter(o=>o.kind==='intake-adopt'&&(p.intakeDrafts??[]).find(x=>x.id===o.request.draftId)?.input.materials.some(m=>m.id===id)).map(copy)};});
 return {taskCard:copy(taskCard),confirmations:copy(confirmations),manualSources,materials,policy:copy(p.policies.at(-1))};
}
export function researchScope(card){
 const fields=[];
 const walk=(value,pointer)=>{if(!value||typeof value!=='object')return;if(Object.hasOwn(value,'knowledge')&&Object.hasOwn(value,'value')){fields.push({pointer,value:copy(value)});return;}for(const [k,v]of Object.entries(value))if(k!=='decisions')walk(v,`${pointer}/${k}`);};walk(card,'');
 const fact=(names)=>{const selected=fields.filter(f=>names.some(n=>f.pointer.toLowerCase().includes(n)));return selected.length?{state:selected.some(f=>!['stated','human_stated'].includes(f.value.knowledge))?'unknown':'known',fields:selected}:{state:'unknown',reason:'Not explicitly structured in the confirmed task card'};};
 return {purpose:{state:'known',taskCardId:card.id,brief:card.brief,fields:fact(['purpose','deliverable']).fields??[]},object:fact(['brand','product','object']),scenario:fact(['scenario','occasion','channel']),time:fact(['time','date','period']),materialTypes:fact(['material','format']),users:fact(['audience','user','buyer']),competitorBoundary:fact(['competitor']),unknowns:fields.filter(f=>!['stated','human_stated'].includes(f.value.knowledge))};
}
export function freezeAcquisition(p,request,{configuration,searchIdentity,plannerBinding,producerBinding,extractorIdentity,caseSources,materialSources,now}){
 validateAcquisitionConfiguration(configuration);const input=acquisitionInput(p,request),limits={...ACQUISITION_LIMITS,...configuration.limits};
 need(plannerBinding&&producerBinding,'ACQUISITION_PROVIDER_MISSING','Planner and producer bindings required');
 const id=`acquisition-${acquisitionHash([p.id,request.commandId])}`,createdAt=now;
 const data={protocolVersion:ACQUISITION_PROTOCOL,id,parentGenerationId:(p.researchAcquisitions??[]).at(-1)?.envelope.id??null,request:copy(request),...input,caseSources:copy(caseSources),materialSources:copy(materialSources??[]),scope:researchScope(input.taskCard),configuration:copy(configuration),searchIdentity:copy(searchIdentity),plannerBinding:copy(plannerBinding),producerBinding:copy(producerBinding),extractorIdentity:copy(extractorIdentity),limits,createdAt,deadline:new Date(Date.parse(createdAt)+limits.elapsedMs).toISOString()};
 need([...data.manualSources,...data.caseSources,...data.materialSources].length<=limits.admittedRecords&&[...data.manualSources,...data.caseSources,...data.materialSources].reduce((n,s)=>n+Buffer.byteLength(s.text),0)<=limits.admittedTextBytes,'ACQUISITION_INPUT_LIMIT','Complete selected source and material text exceeds admission budget');
 need(Buffer.byteLength(JSON.stringify(data))<=2097152,'ACQUISITION_INPUT_LIMIT','Frozen acquisition input exceeds finite packet bound');
 return {...data,envelopeHash:acquisitionHash(data)};
}
export function acquisitionCurrent(p,g,{historical=false}={}){
 const {envelopeHash,...data}=g.envelope;need(acquisitionHash(data)===envelopeHash,'ACQUISITION_ORIGINAL_INVALID','Frozen envelope identity changed');
 if(historical)return;
 const current=acquisitionInput(p,g.envelope.request);
 need(equal(current,{taskCard:g.envelope.taskCard,confirmations:g.envelope.confirmations,manualSources:g.envelope.manualSources,materials:g.envelope.materials,policy:g.envelope.policy}),'STALE_ACQUISITION','Confirmed task, decisions, source selection, materials or policy changed');
}
export function acquisitionBranchSlice(e,kind){
 const index=ACQUISITION_BRANCHES.indexOf(kind),share=n=>Math.floor(n/4)+(index<n%4?1:0);
 return {queries:share(e.limits.queries),pageAttempts:share(e.limits.pageAttempts),pdfAttempts:share(e.limits.pdfAttempts),imageAttempts:share(e.limits.imageAttempts),searchBytes:share(e.limits.totalSearchBytes),captureBytes:share(e.limits.totalCaptureBytes),extractionBytes:share(e.limits.totalExtractionBytes)};
}
export function acquisitionToolReservation(e,kind){
 return kind==='search'?{queries:1,pageAttempts:0,pdfAttempts:0,imageAttempts:0,searchBytes:e.limits.searchBytes,captureBytes:0,extractionBytes:0}:{queries:0,pageAttempts:1,pdfAttempts:1,imageAttempts:0,searchBytes:0,captureBytes:e.limits.captureBytes,extractionBytes:e.limits.extractionBytes};
}
export function validateAcquisitionPlan(value,e){
 need(value&&Object.keys(value).sort().join(',')==='branches,envelopeHash,generationId,protocolVersion'&&value.protocolVersion==='research-acquisition-plan-v1'&&value.generationId===e.id&&value.envelopeHash===e.envelopeHash&&Array.isArray(value.branches)&&value.branches.length===4,'ACQUISITION_PLAN_INVALID','Exact four-branch generation-bound plan required');
 need(Buffer.byteLength(JSON.stringify(value))<=e.limits.planOutputBytes,'ACQUISITION_PLAN_LIMIT','Plan exceeds saved output budget');
 for(const [i,b]of value.branches.entries()){
  need(b&&Object.keys(b).sort().join(',')==='applicability,kind,queries,reason,scope'&&b.kind===ACQUISITION_BRANCHES[i]&&['active','out_of_scope','unknown'].includes(b.applicability)&&boundedText(b.reason,4096)&&equal(b.scope,e.scope)&&Array.isArray(b.queries)&&b.queries.length<=acquisitionBranchSlice(e,b.kind).queries&&new Set(b.queries).size===b.queries.length&&b.queries.every(q=>boundedText(q,256)&&Buffer.byteLength(q)<=1024)&&((b.applicability==='active')===!!b.queries.length),'ACQUISITION_PLAN_INVALID','Branch scope and complete query plan must fit its fixed allocation');
 }
 return copy(value);
}
export function acquisitionPlanRequest(e){
 const text={type:'string'},branch={type:'object',additionalProperties:false,required:['kind','applicability','reason','scope','queries'],properties:{kind:{type:'string',enum:ACQUISITION_BRANCHES},applicability:{type:'string',enum:['active','out_of_scope','unknown']},reason:text,scope:{type:'object',additionalProperties:true},queries:{type:'array',maxItems:2,items:text}}};
 return {prompt:`Plan bounded research only. No tool use. Return all four branches in their supplied order. Copy exact scope, including unknowns. Never invent age, dates, product facts, professional authority or comparison eligibility. Active branches have at least one query and at most their fixed query allocation. Other branches have no queries and explain the gap. Do not classify search results or authenticate sources.\nUNTRUSTED_JSON_DATA\n${JSON.stringify({envelope:e,branchAllocations:ACQUISITION_BRANCHES.map(kind=>({kind,...acquisitionBranchSlice(e,kind)}))}).replaceAll('<','\\u003c')}\nEND_UNTRUSTED_JSON_DATA`,outputSchema:{type:'object',additionalProperties:false,required:['protocolVersion','generationId','envelopeHash','branches'],properties:{protocolVersion:{type:'string',enum:['research-acquisition-plan-v1']},generationId:{type:'string',enum:[e.id]},envelopeHash:{type:'string',enum:[e.envelopeHash]},branches:{type:'array',minItems:4,maxItems:4,items:branch}}}};
}
export const toolIdentity=(g,branch,kind,argument)=>acquisitionHash([g.envelope.id,branch,g.plan.planHash,kind,acquisitionHash(argument)]);
export function acquisitionAdmission(g){
 need(g.plan&&g.branches.length===4&&g.branches.every(b=>b.result)&&g.branches.every(b=>b.tools.every(t=>t.state==='completed')),'ACQUISITION_OUTCOME_UNKNOWN','All branch and attempted tool outcomes must be known');
 const sources=[...copy(g.envelope.manualSources),...copy(g.envelope.caseSources),...copy(g.envelope.materialSources??[])],coverage=[],edges=[],seenRawText=new Map(),seenText=new Map();let textBytes=sources.reduce((n,s)=>n+Buffer.byteLength(s.text),0);
 for(const s of sources){const textHash=acquisitionHash(s.text);if(seenText.has(textHash))coverage.push({sourceId:s.id,status:'duplicate_text_attributed_input',canonicalSourceId:seenText.get(textHash),reason:'Separately attributed selected input retained; equal text is not independent corroboration'});else seenText.set(textHash,s.id);}
 need(sources.length<=g.envelope.limits.admittedRecords&&textBytes<=g.envelope.limits.admittedTextBytes,'ACQUISITION_ADMISSION_LIMIT','Selected complete sources exceed admission budget');
 for(const m of g.envelope.materials){coverage.push({kind:'registered_material',materialId:m.document.id,reason:'Registered original and exact retained extraction preserved. Image and scanned-PDF text remain unavailable.',status:m.document.kind==='image'?'unsupported_image_text':(g.envelope.materialSources??[]).some(s=>s.provenance.documentId===m.document.id)?'admitted':'no_text'});}
 for(const b of g.branches){
  coverage.push(copy(b.result.coverage));
  for(const t of b.tools)if(t.outcome?.edges)for(const edge of t.outcome.edges)edges.push({...copy(edge),branchKind:b.kind,toolKey:t.key});
  for(const t of b.tools.filter(t=>t.kind==='capture')){
   const x=t.outcome,s=x?.source;
   if(!s){coverage.push({branchKind:b.kind,toolKey:t.key,status:x?.status??'unavailable',reason:x?.reason??'No text original'});continue;}
   const rawText=acquisitionHash([s.provenance.rawSha256,s.provenance.extractionIdentity,s.provenance.textHash,s.provenance.locator]),text=s.provenance.textHash;
   if(seenRawText.has(rawText)||seenText.has(text)){coverage.push({branchKind:b.kind,toolKey:t.key,status:'duplicate',canonicalSourceId:seenRawText.get(rawText)??seenText.get(text),reason:'Identical raw/extraction or complete text is not independent corroboration'});continue;}
   if(sources.length>=g.envelope.limits.admittedRecords||textBytes+Buffer.byteLength(s.text)>g.envelope.limits.admittedTextBytes){coverage.push({branchKind:b.kind,toolKey:t.key,status:'admission_limit',reason:'Complete source excluded; no text truncation'});continue;}
   sources.push(copy(s));textBytes+=Buffer.byteLength(s.text);seenRawText.set(rawText,s.id);seenText.set(text,s.id);
  }
 }
 const limitations=['Public capture and literal text only. Publisher authenticity, professional qualifications, facts and consumer preferences are unverified.','Branch labels never establish same-purpose competitor identity. Only separately registered identity_checked case authority permits direct comparison.','Budgeted coverage is incomplete. Unknown task facts and publication dates remain unknown. Search windows and every exclusion are recorded in coverage.'];
 const data={protocolVersion:'research-acquisition-admission-v1',generationId:g.envelope.id,envelopeHash:g.envelope.envelopeHash,planHash:g.plan.planHash,journals:g.branches.map(b=>({kind:b.kind,journalHash:acquisitionHash({tools:b.tools,result:b.result})})),sourceRecords:sources,edges,coverage,limitations,textBytes};
 return {...data,catalogueHash:acquisitionHash(sources),admissionHash:acquisitionHash(data)};
}
export function acquisitionReference(g){need(g.admission,'ACQUISITION_NOT_ADMITTED','Registered admission required');return {protocolVersion:ACQUISITION_PROTOCOL,generationId:g.envelope.id,envelopeHash:g.envelope.envelopeHash,planHash:g.plan.planHash,admissionHash:g.admission.admissionHash,manifest:copy(g.manifest),coverage:copy(g.admission.coverage),limitations:copy(g.admission.limitations)};}
export function resolveAcquisition(p,ref,{historical=false}={}){
 const g=(p.researchAcquisitions??[]).find(g=>g.envelope.id===ref?.generationId);need(g&&equal(acquisitionReference(g),ref)&&equal(acquisitionAdmission(g),g.admission),'ACQUISITION_ORIGINAL_INVALID','Exact registered ancestral acquisition admission required');acquisitionCurrent(p,g,{historical});return g;
}
const jobFor=(e,purpose,kind)=>({id:`${e.id}:${kind??'plan'}`,purpose,stage:'research',status:'queued',binding:copy(purpose==='research_acquisition_plan'?e.plannerBinding:{providerId:'local-research-tools',model:'bounded-public-capture-v1',role:kind}),task:{id:`${e.id}:${kind??'plan'}`,owner:kind??e.plannerBinding.role,parentId:e.id,generationId:e.id,...(kind?{branchKind:kind}:{})},inputVersionIds:[e.taskCard.id],attempts:[]});
export function reduceAcquisition(p,c,context){
 if(c.kind==='research-acquisition-cancel'){
  need(context.actorType==='human','HUMAN_REQUIRED','Human acquisition cancellation required');const g=(p.researchAcquisitions??[]).find(g=>g.envelope.id===c.request?.generationId);need(g&&!g.admission,'ACQUISITION_NOT_CANCELLABLE','Unsealed generation required');g.cancellation={request:copy(c.request),actorId:context.actorId,createdAt:context.now};for(const job of p.jobs.filter(j=>j.task?.generationId===g.envelope.id&&j.status==='queued'))job.status='cancelled';g.state=p.jobs.some(j=>j.task?.generationId===g.envelope.id&&['running','awaiting_reconciliation'].includes(j.status))?'cancelling':'cancelled';return;
 }
 need(context.actorType==='agent'&&context.actorId==='research-acquisition-runtime','EXECUTOR_REQUIRED','Trusted acquisition runtime required');
 p.researchAcquisitions??=[];
 if(c.kind==='research-acquisition-request'){
  need(!p.researchAcquisitions.some(g=>p.jobs.some(j=>(j.task?.generationId===g.envelope.id||j.task?.researchDataBasis?.acquisition?.generationId===g.envelope.id)&&['queued','running','awaiting_reconciliation'].includes(j.status))||g.branches.some(b=>b.tools.some(t=>t.state==='dispatched'))),'ACQUISITION_PENDING','Finish or reconcile the existing generation before another request');
  const envelope=c.envelope,{envelopeHash,...data}=envelope;need(envelopeHash===acquisitionHash(data)&&!p.researchAcquisitions.some(g=>g.envelope.id===envelope.id)&&envelope.parentGenerationId===(p.researchAcquisitions.at(-1)?.envelope.id??null),'ACQUISITION_ORIGINAL_INVALID','Unique exact envelope with registered parent required');
  const g={envelope:copy(envelope),envelopeOriginal:copy(c.envelopeOriginal),state:'planning',plan:null,branches:[],admission:null,manifest:null};acquisitionCurrent(p,g);p.researchAcquisitions.push(g);p.jobs.push(jobFor(envelope,'research_acquisition_plan'));return;
 }
 const g=p.researchAcquisitions.find(g=>g.envelope.id===c.generationId);need(g,'ACQUISITION_NOT_FOUND','Registered acquisition required');
 if(c.kind==='research-acquisition-seal'){
  acquisitionCurrent(p,g);need(!g.cancellation&&!g.admission&&equal(c.admission,acquisitionAdmission(g))&&c.manifest?.sha256&&c.identity===acquisitionHash({envelope:g.envelope,plan:g.plan,branches:g.branches}),'ACQUISITION_ORIGINAL_INVALID','Revalidated immutable admission and exact logical identity required');g.admission=copy(c.admission);g.manifest=copy(c.manifest);g.state='sealed';return;
 }
 const job=p.jobs.find(j=>j.id===c.jobId),attempt=job?.attempts.at(-1);
 need(ACQUISITION_PURPOSES.includes(job?.purpose)&&job.task.generationId===g.envelope.id,'INVALID_JOB','Exact acquisition job required');
 if(c.kind==='research-acquisition-start'){
  acquisitionCurrent(p,g);need(job.status==='queued'&&job.attempts.length===0&&Date.parse(context.now)<Date.parse(g.envelope.deadline),'ACQUISITION_DEADLINE','Only fresh queued work within persisted deadline can start');
  need(job.purpose!=='research_acquisition_branch'||p.jobs.filter(j=>j.purpose==='research_acquisition_branch'&&j.task.generationId===g.envelope.id&&j.status==='running').length<g.envelope.limits.maxParallelBranches,'ACQUISITION_CONCURRENCY','Branch concurrency allowance exhausted');
  job.status='running';job.attemptId=c.attemptId;job.attempts.push({id:c.attemptId,status:'running',dispatchStarted:false,executor:copy(context),startedAt:context.now});return;
 }
 need(attempt?.id===c.attemptId&&['running','awaiting_reconciliation'].includes(job.status),'INVALID_JOB','Current running or unresolved attempt required');
 need(c.recover===true||['actorId','runId','contextId'].every(k=>attempt.executor[k]===context[k]),'WRONG_EXECUTOR','Exact claiming execution identity required');
 if(c.kind==='research-acquisition-fail'){const unknown=job.purpose==='research_acquisition_plan'?attempt.dispatchStarted&&!attempt.resultOriginal:g.branches.find(b=>b.kind===job.task.branchKind)?.tools.some(t=>t.state==='dispatched');job.status=unknown?'awaiting_reconciliation':'blocked';attempt.status=job.status;if(c.failureOriginal)attempt.failureOriginal=copy(c.failureOriginal);job.error=copy(c.error);g.state=unknown?'awaiting_reconciliation':'blocked';return;}
 if(!['research-acquisition-plan-result','research-acquisition-tool-result'].includes(c.kind))acquisitionCurrent(p,g);
 if(c.kind==='research-acquisition-plan-dispatch'){need(job.purpose==='research_acquisition_plan'&&!attempt.dispatchStarted,'UNSAFE_RETRY','One planner dispatch only');attempt.dispatchStarted=true;attempt.requestOriginal=copy(c.original);return;}
 if(c.kind==='research-acquisition-plan-result'){need(attempt.dispatchStarted&&!attempt.resultOriginal,'INVALID_JOB','One saved planner result only');attempt.resultOriginal=copy(c.original);return;}
 if(c.kind==='research-acquisition-plan-complete'){
  need(attempt.dispatchStarted&&attempt.resultOriginal&&!g.plan,'ACQUISITION_PLAN_INVALID','Saved planner originals required');const plan=validateAcquisitionPlan(c.plan,g.envelope);g.plan={value:plan,planHash:acquisitionHash(plan),requestOriginal:copy(attempt.requestOriginal),resultOriginal:copy(attempt.resultOriginal)};g.state='collecting';
  if(g.cancellation){g.state='cancelled';job.status=attempt.status='succeeded';job.outputVersionIds=[g.envelope.id];return;}
  for(const b of plan.branches){g.branches.push({kind:b.kind,allocation:acquisitionBranchSlice(g.envelope,b.kind),tools:[],result:null});p.jobs.push(jobFor(g.envelope,'research_acquisition_branch',b.kind));}
  job.status=attempt.status='succeeded';job.outputVersionIds=[g.envelope.id];return;
 }
 const branch=g.branches.find(b=>b.kind===job.task.branchKind);need(branch,'INVALID_JOB','Registered branch required');
 if(c.kind==='research-acquisition-tool-claim'){
  need(!g.cancellation&&Date.parse(context.now)<Date.parse(g.envelope.deadline)&&!branch.result&&['search','capture'].includes(c.tool.kind)&&c.tool.key===toolIdentity(g,branch.kind,c.tool.kind,c.tool.argument)&&!branch.tools.some(t=>t.key===c.tool.key),'ACQUISITION_TOOL_CLAIM','Unique deterministic tool claim within deadline required');
  const used=key=>branch.tools.reduce((n,t)=>n+t.reservation[key],0),r=c.tool.reservation;
  const expected=acquisitionToolReservation(g.envelope,c.tool.kind);
  need(equal(r,expected)&&Object.entries(r).every(([k,v])=>used(k)+v<=branch.allocation[k]),'ACQUISITION_BUDGET','Complete maximum tool reservation exceeds fixed branch slice');
  branch.tools.push({...copy(c.tool),state:'dispatched',claimedBy:copy(context),startedAt:context.now});attempt.dispatchStarted=true;return;
 }
 if(c.kind==='research-acquisition-tool-result'){
  const t=branch.tools.find(t=>t.key===c.toolKey);need(t?.state==='dispatched'&&c.original&&c.outcome&&['available','unavailable','rejected','unsupported','limit_exceeded'].includes(c.outcome.status),'ACQUISITION_TOOL_RESULT','Known outcome and exact saved original required');t.state='completed';t.original=copy(c.original);t.outcome=copy(c.outcome);t.finishedAt=context.now;
  if(t.kind==='capture'&&typeof c.outcome.mimeType==='string'&&c.outcome.mimeType!=='application/pdf')t.reservation.pdfAttempts=0;
  return;
 }
 if(c.kind==='research-acquisition-branch-complete'){
  need(!branch.result&&branch.tools.every(t=>t.state==='completed')&&c.result?.coverage?.branchKind===branch.kind,'ACQUISITION_OUTCOME_UNKNOWN','No unresolved dispatch can close a branch');branch.result=copy(c.result);job.status=attempt.status='succeeded';job.outputVersionIds=[`${g.envelope.id}:${branch.kind}`];g.state=g.cancellation?'cancelled':'collecting';return;
 }
 need(false,'UNKNOWN_COMMAND','Unknown acquisition command');
}
