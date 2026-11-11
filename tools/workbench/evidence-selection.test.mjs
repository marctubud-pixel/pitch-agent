import test from 'node:test';
import assert from 'node:assert/strict';
import {syntheticResearch} from './research-operator-fixture.mjs';
import {buildResearchReadinessRequest,validateResearchReadinessOutput} from './research-readiness.mjs';
import {buildSemanticInput,buildSemanticRequest,validateSemanticOutput} from './research-semantic-review.mjs';
import {EVIDENCE_SELECTION_PROTOCOL,decodeEvidenceSelection} from './evidence-selection.mjs';
const schemaOf=request=>request.expandedOutputSchema??request.outputSchema;
function select(raw,request,kind){
 const pick=(old,schema)=>{if(schema.anyOf){return pick(old,schema.anyOf.find(s=>Object.entries(s.properties).every(([k,v])=>!v.enum||v.enum.includes(old[k]))));}if(schema.type==='array'){if(schema.items.type==='string'&&schema.items.enum&&schema.items.enum.every(id=>Object.hasOwn(request.catalogue,id))&&old.every(x=>x&&typeof x==='object'&&x.location)){const locations=new Set(old.map(x=>x.location));return schema.items.enum.filter(id=>request.catalogue[id].refs.every(r=>locations.has(r.location)));}return old.map(x=>pick(x,schema.items));}if(schema.type==='object')return Object.fromEntries(Object.entries(schema.properties).map(([k,s])=>[k,k==='selectionProtocol'?schemaOf(request).properties.selectionProtocol.enum[0]:k==='selectionHash'?request.selectionHash:pick(old[k],s)]));return old;};
 const r=structuredClone(raw),key=kind==='readiness'?'coverage':'relations';r[key]=Object.fromEntries(r[key].map(({questionId,...v})=>[questionId,v]));
 if(schemaOf(request).properties.obligationAssessments?.type==='object'&&Array.isArray(r.obligationAssessments))r.obligationAssessments=Object.fromEntries(r.obligationAssessments.map(({originKey,...v})=>[originKey,v]));
 for(const[name,field]of [['sourceAssessments','sourceId'],['visualAssessments','visualId']])if(r[name])r[name]=Object.fromEntries(r[name].map(({[field]:id,...v})=>[id,v]));
 if(schemaOf(request).properties.useScan?.anyOf?.some(s=>s.properties.scanMode)){r.useScan=r.useScan.assessedOriginKeys.length?{scanMode:'conditional',...r.useScan}:{scanMode:'none',contentHash:r.useScan.contentHash};}
 return pick(r,schemaOf(request));
}
test('readiness and semantic select frozen pairs and preserve legacy judgments',async t=>{
 const f=await syntheticResearch();t.after(f.close);const p=f.store.read('p'),record=p.readinessReports.at(-1),job=p.jobs.find(j=>j.id===record.jobId);const input={...job.task.readinessInput,evidenceSelectionProtocol:EVIDENCE_SELECTION_PROTOCOL};
 const request=buildResearchReadinessRequest(input),raw=select(record.rawReport,request,'readiness');
 const normalized=validateResearchReadinessOutput(raw,input);assert.equal(normalized.verdict,'ready');
 assert.throws(()=>validateResearchReadinessOutput(record.rawReport,input));
 const v1input={...input,evidenceSelectionProtocol:'evidence-selection-v1'},v1req=buildResearchReadinessRequest(v1input),v1raw=select(record.rawReport,v1req,'readiness');assert.equal(validateResearchReadinessOutput(v1raw,v1input).verdict,'ready');assert.throws(()=>validateResearchReadinessOutput(v1raw,input));
 const changed=structuredClone(raw);changed.selectionHash='wrong';assert.throws(()=>validateResearchReadinessOutput(changed,input));
 const legacyInput={...input};delete legacyInput.evidenceSelectionProtocol;assert.equal(validateResearchReadinessOutput(record.rawReport,legacyInput).verdict,'ready');
 const si=buildSemanticInput({...record,input,rawReport:raw},f.semanticConfiguration),sr=buildSemanticRequest(si);
 const legacy=p.coverageChallenges[0].rawReport;const semanticRaw=select({...legacy,packetHash:si.packetHash},sr,'semantic');
 assert.equal(validateSemanticOutput(semanticRaw,si).hasBlockingFindings,false);
 const bad=structuredClone(semanticRaw);bad.relations.core_question.refs=['not-an-id'];assert.throws(()=>validateSemanticOutput(bad,si));
 const cross=structuredClone(semanticRaw);cross.relations.core_question.refs=semanticRaw.relations.source_applicability.refs;assert.throws(()=>validateSemanticOutput(cross,si));
 const none=structuredClone(raw);const first=Object.values(none.coverage)[0];first.refs=[];assert.throws(()=>validateResearchReadinessOutput(none,input));
 const decoded=decodeEvidenceSelection(raw,request,'readiness');assert(decoded.obligationAssessments.every(x=>x.replacement.refs.length===0));
 console.log(JSON.stringify({requestKeys:Object.keys(schemaOf(request).properties.coverage.properties),catalogueEntries:Object.keys(request.catalogue).length}));
});
test('executor stores raw selections, revalidates normalized reports, and hands off without losing evidence',async t=>{
 const {createExecutor}=await import('./executor.mjs');const {output,bindings,acceptedOperatorResearch,releaseRequest,human}=await import('./research-operator-fixture.mjs');const {diskReceipt}=await import('./selected-stage-fixture.mjs');const {semanticHash}=await import('./semantic-authority.mjs');const {createHash,randomUUID}=await import('node:crypto');const {requireResearchChartAdmission,releaseReadiness}=await import('./project.mjs');
 const f=await syntheticResearch({semanticReview:false});t.after(f.close);
 const rb={providerId:'selector',model:'synthetic',role:'readiness-reviewer'},sb={...rb,role:'semantic-challenger'};
 const lease=f.store.registerSemanticConfiguration({readinessBinding:rb,challengeBinding:sb,rubricVersion:f.semanticConfiguration.rubricVersion},{expectedEpoch:1});let calls=0;
 const provider={model:'synthetic',evidenceSelectionProtocol:EVIDENCE_SELECTION_PROTOCOL,execute:async q=>{
  calls++;const job=f.store.read('p').jobs.find(j=>j.attempts.some(a=>a.id===q.runId));const isSemantic=job.purpose==='coverage_challenge';const i=structuredClone(isSemantic?job.task.semanticInput:job.task.readinessInput);delete i.evidenceSelectionProtocol;if(isSemantic){delete i.packetHash;i.packetHash=semanticHash(i);}
  const legacy=isSemantic?buildSemanticRequest(i):buildResearchReadinessRequest(i);const raw=output(legacy);if(isSemantic)raw.packetHash=job.task.semanticInput.packetHash;
  const selectedRequest=isSemantic?buildSemanticRequest(job.task.semanticInput):buildResearchReadinessRequest(job.task.readinessInput);assert.deepEqual(q.outputSchema,selectedRequest.outputSchema);assert(selectedRequest.schemaPacking.enumValues<=1000);const selected=select(raw,selectedRequest,isSemantic?'semantic':'readiness');
  const hash=x=>createHash('sha256').update(x).digest('hex');return diskReceipt(f.root,q,{runId:q.runId,model:'synthetic',requestedModel:'synthetic',threadId:randomUUID(),inputPacketHash:hash(JSON.stringify({runId:q.runId,model:'synthetic',prompt:q.prompt,outputSchema:q.outputSchema})),exitCode:0,responseText:JSON.stringify(selected),parsedOutput:selected,cost:null});
 }};
 f.executor=createExecutor({store:f.store,rootDir:f.root,bindings:{...bindings,readiness:rb,semantic:sb},providers:{...f.providers,selector:provider},semanticLease:lease,imageProvider:null});
 const primaryId=await f.executor.enqueueReadiness('p',f.artifact.id,{protocolVersion:'research-readiness-v2'});assert.equal(f.store.read('p').jobs.find(j=>j.id===primaryId).task.readinessInput.evidenceSelectionProtocol,EVIDENCE_SELECTION_PROTOCOL);
 const pj=await f.executor.execute('p',primaryId);assert.equal(pj.status,'succeeded',JSON.stringify(pj.error));
 const sj=await f.executor.execute('p',await f.executor.enqueueSemanticChallenge('p',f.artifact.id));assert.equal(sj.status,'succeeded',JSON.stringify(sj.error));
 const p=f.store.read('p'),record=p.readinessReports.at(-1);assert(!Array.isArray(record.rawReport.coverage));assert(Array.isArray(record.coverage));assert.equal(p.coverageChallenges[0].rawReport.selectionProtocol,EVIDENCE_SELECTION_PROTOCOL);
 assert.equal(JSON.parse(record.executionReceipt.responseText).selectionHash,record.rawReport.selectionHash);
 await acceptedOperatorResearch(f);await f.executor.releaseResearch('p',releaseRequest(f),human);assert.equal(releaseReadiness(f.store.read('p'),f.artifact.id).eligible,true);assert.equal(calls,2);
});
test('applicability decision references and explicit none replacement remain representable',async t=>{
 const {applicabilityContext}=await import('./research-applicability.mjs');const f=await syntheticResearch();t.after(f.close);const p=f.store.read('p'),rec=p.readinessReports[0],job=p.jobs.find(j=>j.id===rec.jobId),input=structuredClone(job.task.readinessInput);
 input.applicability=applicabilityContext({...input.applicability,sources:[{key:'source-negative',kind:'coverage_challenge',targetArtifactId:input.artifactId,targetContentHash:input.contentHash,reportId:'negative',protocolVersion:'test',reportHash:'frozen',findings:[{key:'negative',location:'/relations/0',originalValueHash:'frozen-finding',originalValue:{explanation:'Retain source limitations.'},authority:'machine_finding'}]}]});
 const baseRequest=buildResearchReadinessRequest(input),raw=structuredClone(rec.rawReport);raw.packetHash=baseRequest.packet.packetHash;raw.generationHash=input.applicability.generationHash;
 const body=input.content.sections[0].body,ref={location:'/content/sections/0/body',quote:body};raw.obligationAssessments=[{originKey:'negative',preservation:{state:'retained',reason:'Limit retained.',refs:[ref]},procurement:{kind:'required_now',state:'available',material:'Supplied body',reason:'Supplied in frozen content.',refs:[ref],decisionDependency:'Bounded exploratory task.'},requirementRefs:[{location:'/applicability/decision/requirement',quote:input.applicability.decision.requirement}],replacement:{originKeys:[],reason:'none',refs:[]},reason:'Retain limitation.'}];raw.useScan={contentHash:input.contentHash,assessedOriginKeys:[],findings:[]};
 assert.equal(validateResearchReadinessOutput(raw,input).verdict,'ready');input.evidenceSelectionProtocol=EVIDENCE_SELECTION_PROTOCOL;const request=buildResearchReadinessRequest(input),selected=select(raw,request,'readiness');const normalized=validateResearchReadinessOutput(selected,input);assert.equal(normalized.obligationAssessments[0].replacement.refs.length,0);assert.equal(normalized.obligationAssessments[0].requirementRefs[0].location,'/applicability/decision/requirement');const wrong=structuredClone(selected);wrong.useScan.assessedOriginKeys=['misspelled-origin'];assert.throws(()=>validateResearchReadinessOutput(wrong,input));assert(Object.keys(request.catalogue).every(id=>id.length<8));assert(!Object.values(request.catalogue).some(e=>e.refs.some(r=>r.location.startsWith('/applicability/sources/'))));
});
test('transport upgrade creates a new job rather than reusing a queued legacy generation',async t=>{
 const {createExecutor}=await import('./executor.mjs');const {bindings}=await import('./research-operator-fixture.mjs');const f=await syntheticResearch({semanticReview:false});t.after(f.close);const rb={providerId:'upgrade',model:'synthetic',role:'readiness-reviewer'};
 const options={store:f.store,rootDir:f.root,bindings:{...bindings,readiness:rb},semanticLease:f.semanticLease,imageProvider:null};
 const beforeExecutor=createExecutor({...options,providers:{...f.providers,upgrade:f.providers.reviewer}});const oldId=await beforeExecutor.enqueueReadiness('p',f.artifact.id,{protocolVersion:'research-readiness-v2',commandId:'legacy-queue',expectedRevision:f.store.read('p').revision});const before=f.store.read('p').jobs.find(j=>j.id===oldId);assert.equal(before.status,'queued');
 const provider={...f.providers.reviewer,evidenceSelectionProtocol:EVIDENCE_SELECTION_PROTOCOL};const ex=createExecutor({...options,providers:{...f.providers,upgrade:provider}});const id=await ex.enqueueReadiness('p',f.artifact.id,{protocolVersion:'research-readiness-v2',commandId:'selection-queue',expectedRevision:f.store.read('p').revision});const after=f.store.read('p').jobs.find(j=>j.id===id);assert.equal(after.task.readinessInput.applicability.generationHash,before.task.readinessInput.applicability.generationHash);assert.deepEqual(after.binding,before.binding);assert.notEqual(id,before.id);assert.equal(after.task.readinessInput.evidenceSelectionProtocol,EVIDENCE_SELECTION_PROTOCOL);
});

test('structured applicability choices reject contradictory empty states without rewriting raw output',async()=>{
 const {buildEvidenceSelectionRequest}=await import('./evidence-selection.mjs');
 const {applicabilitySchema}=await import('./research-applicability.mjs');
 const text={type:'string',minLength:1},array=items=>({type:'array',items,maxItems:1000}),object=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
 const ref=object({location:text,quote:text});
 const legacy={packet:{taskCard:{brief:'Explore the supplied reference.'},content:{sections:[],claims:[]},sourceRecords:[],expectedCoverage:[{id:'core_question'}],applicability:{origins:[{key:'original'}],decision:{targetStage:'strategy'}}},outputSchema:object({findings:array(object({questionId:text,refs:array(ref)})),coverage:array(object({questionId:text,status:{type:'string',enum:['ready','gap','not_applicable']},refs:array(ref)})),obligationAssessments:applicabilitySchema({origins:[{key:'original'}]}),useScan:object({contentHash:text,assessedOriginKeys:array(text),findings:array(object({originKey:text,reason:text,refs:array(ref)}))})}),prompt:'UNTRUSTED_JSON_DATA\n{}\nEND_UNTRUSTED_JSON_DATA'};
 const request=buildEvidenceSelectionRequest(legacy,'readiness');
 function seed(s){if(s.anyOf)return seed(s.anyOf[0]);if(s.type==='object')return Object.fromEntries(Object.entries(s.properties).map(([k,v])=>[k,seed(v)]));if(s.type==='array')return Array.from({length:s.maxItems===0?0:s.minItems??1},()=>seed(s.items));return s.enum?.[0]??'Explicit test evidence.';}
 const valid=seed(schemaOf(request)),original=structuredClone(valid);decodeEvidenceSelection(valid,request,'readiness');assert.deepEqual(valid,original);
 const reference=Object.keys(request.catalogue)[0];
 for(const replacement of [{originKeys:[],reason:'Nothing was replaced.',refs:[]},{originKeys:[],reason:'none',refs:[reference]},{originKeys:[],reason:'Evidence was applied.',refs:[reference]}]){
  const bad=structuredClone(valid);Object.values(bad.obligationAssessments)[0].replacement=replacement;assert.throws(()=>decodeEvidenceSelection(bad,request,'readiness'),{code:'INVALID_EVIDENCE_SELECTION'});
 }
 const actual=structuredClone(valid);Object.values(actual.obligationAssessments)[0].replacement={originKeys:['original'],reason:'Explicitly replaced with cited evidence.',refs:[reference]};decodeEvidenceSelection(actual,request,'readiness');
 const missingEvidence=structuredClone(actual);Object.values(missingEvidence.obligationAssessments)[0].replacement.refs=[];assert.throws(()=>decodeEvidenceSelection(missingEvidence,request,'readiness'),{code:'INVALID_EVIDENCE_SELECTION'});
 const contradictory=structuredClone(valid);contradictory.useScan.findings=[{originKey:'original',reason:'A conditional use was activated.',refs:[reference]}];assert.throws(()=>decodeEvidenceSelection(contradictory,request,'readiness'),{code:'INVALID_EVIDENCE_SELECTION'});
 contradictory.useScan.assessedOriginKeys=['original'];contradictory.useScan.scanMode='conditional';decodeEvidenceSelection(contradictory,request,'readiness');
 const noOrigins=structuredClone(legacy);noOrigins.packet.applicability.origins=[];const emptyRequest=buildEvidenceSelectionRequest(noOrigins,'readiness');const empty=seed(schemaOf(emptyRequest));empty.obligationAssessments={};decodeEvidenceSelection(empty,emptyRequest,'readiness');
});


test('v4 binds each obligation to its authority without defaulting evidence availability',async()=>{
 const {buildEvidenceSelectionRequest}=await import('./evidence-selection.mjs');
 const {buildEvidenceSelectionRequest:buildV3}=await import('./evidence-selection-v3.mjs');const {buildEvidenceSelectionRequest:buildV4}=await import('./evidence-selection-v4.mjs');
 const {applicabilitySchema}=await import('./research-applicability.mjs');
 const text={type:'string',minLength:1},arr=items=>({type:'array',items,maxItems:1000}),obj=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false}),ref=obj({location:text,quote:text});
 const origins=[...['verification','human','creative_panel','feedback_review','owner_edge'].map(kind=>({key:kind,kind})),{key:'ordinary',kind:'readiness'},{key:'wrapper',kind:'correction_review',derivedFrom:'verification'},{key:'risk',kind:'readiness',originalValue:{category:'factual_risk'}}];
 const legacy={packet:{taskCard:{brief:'Exploratory packaging, no engineering approval.'},content:{sections:[],claims:[]},sourceRecords:[],expectedCoverage:[{id:'core_question'}],applicability:{origins,decision:{targetStage:'strategy'}}},outputSchema:obj({findings:arr(obj({questionId:text,refs:arr(ref)})),coverage:arr(obj({questionId:text,status:{type:'string',enum:['ready','gap','not_applicable']},refs:arr(ref)})),obligationAssessments:applicabilitySchema({origins})}),prompt:'UNTRUSTED_JSON_DATA\n{}\nEND_UNTRUSTED_JSON_DATA'};
 const request=buildEvidenceSelectionRequest(legacy,'readiness');
 const fields=schemaOf(request).properties.obligationAssessments;
 assert.equal(fields.type,'object');assert.deepEqual(Object.keys(fields.properties),origins.map(o=>o.key));
 function seed(s){if(s.anyOf)return seed(s.anyOf[0]);if(s.type==='object')return Object.fromEntries(Object.entries(s.properties).map(([k,v])=>[k,seed(v)]));if(s.type==='array')return Array.from({length:s.maxItems===0?0:s.minItems??1},()=>seed(s.items));return s.enum?.[0]??'Evidence judged by reviewer.';}
 const raw=seed(schemaOf(request));const decoded=decodeEvidenceSelection(raw,request,'readiness');assert.deepEqual(decoded.obligationAssessments.map(x=>x.originKey),origins.map(o=>o.key));const reversed=structuredClone(raw);reversed.obligationAssessments=Object.fromEntries(Object.entries(reversed.obligationAssessments).reverse());assert.deepEqual(decodeEvidenceSelection(reversed,request,'readiness'),decoded);
 for(const o of origins.filter(x=>x.key!=='ordinary')){
  const branches=fields.properties[o.key].properties.procurement.anyOf;assert.equal(branches.length,1);assert.deepEqual(branches[0].properties.kind.enum,['required_now']);assert.deepEqual(branches[0].properties.state.enum,['available','missing']);
  const bad=structuredClone(raw);bad.obligationAssessments[o.key].procurement={kind:'background_unknown',state:'missing',material:'Unknown',reason:'Must not waive',refs:[Object.keys(request.catalogue)[0]]};assert.throws(()=>decodeEvidenceSelection(bad,request,'readiness'),{code:'INVALID_EVIDENCE_SELECTION'});
 }
 assert.equal(fields.properties.ordinary.properties.procurement.anyOf.length,3);
 const missing=structuredClone(raw);delete missing.obligationAssessments.wrapper;assert.throws(()=>decodeEvidenceSelection(missing,request,'readiness'));
 const extra=structuredClone(raw);extra.obligationAssessments.invented=extra.obligationAssessments.ordinary;assert.throws(()=>decodeEvidenceSelection(extra,request,'readiness'));
 for(const mutate of [o=>o.push({...o[0]}),o=>o.push({key:'orphan',kind:'correction_review',derivedFrom:'absent'}),o=>{o.push({key:'cycle-a',kind:'correction_review',derivedFrom:'cycle-b'},{key:'cycle-b',kind:'correction_review',derivedFrom:'cycle-a'});}]){const bad=structuredClone(legacy);mutate(bad.packet.applicability.origins);assert.throws(()=>buildEvidenceSelectionRequest(bad,'readiness'),{code:'INVALID_EVIDENCE_SELECTION'});}
 assert.deepEqual(buildEvidenceSelectionRequest(legacy,'readiness','evidence-selection-v3'),buildV3(legacy,'readiness'));assert.deepEqual(buildEvidenceSelectionRequest(legacy,'readiness','evidence-selection-v4'),buildV4(legacy,'readiness'));
 assert.throws(()=>decodeEvidenceSelection(raw,buildV3(legacy,'readiness'),'readiness'));
});

test('v5 explicit scan declarations preserve cross-field business validation and historical v4',async t=>{
 const {applicabilityContext}=await import('./research-applicability.mjs');
 const f=await syntheticResearch();t.after(f.close);const p=f.store.read('p'),rec=p.readinessReports[0],job=p.jobs.find(j=>j.id===rec.jobId),input=structuredClone(job.task.readinessInput);
 input.applicability=applicabilityContext({...input.applicability,sources:[{key:'ordinary-source',kind:'readiness',targetArtifactId:input.artifactId,targetContentHash:input.contentHash,reportId:'ordinary-review',protocolVersion:'test',reportHash:'frozen',findings:[{key:'ordinary-limit',location:'/limits/0',originalValueHash:'frozen-finding',originalValue:{explanation:'Retain the exploration limit.'},authority:'machine_finding'}]}]});
 const legacyRequest=buildResearchReadinessRequest(input),raw=structuredClone(rec.rawReport);raw.packetHash=legacyRequest.packet.packetHash;raw.generationHash=input.applicability.generationHash;
 const ref={location:'/content/sections/0/body',quote:input.content.sections[0].body};raw.obligationAssessments=[{originKey:'ordinary-limit',preservation:{state:'retained',reason:'Preserve the original limitation.',refs:[ref]},procurement:{kind:'conditional_later',state:'missing',material:'Future consumer validation',reason:'Not needed for bounded exploration.',refs:[ref],permittedUse:'Explore a hypothesis only.',prohibitedUse:'Do not assert consumer effectiveness.',activationCondition:'Before claiming consumer effectiveness.',returnStage:'research'},requirementRefs:[{location:'/applicability/decision/requirement',quote:input.applicability.decision.requirement}],replacement:{originKeys:[],reason:'none',refs:[]},reason:'Keep the future obligation explicit.'}];raw.useScan={contentHash:input.contentHash,assessedOriginKeys:['ordinary-limit'],findings:[]};
 assert.equal(validateResearchReadinessOutput(raw,input).verdict,'ready');input.evidenceSelectionProtocol=EVIDENCE_SELECTION_PROTOCOL;const request=buildResearchReadinessRequest(input),chosen=select(raw,request,'readiness');assert.equal(chosen.useScan.scanMode,'conditional');const normalized=validateResearchReadinessOutput(chosen,input);assert.deepEqual(normalized.useScan,raw.useScan);assert.deepEqual(chosen.useScan,{scanMode:'conditional',...raw.useScan});
 const falseNone=structuredClone(chosen);falseNone.useScan={scanMode:'none',contentHash:input.contentHash};assert.throws(()=>validateResearchReadinessOutput(falseNone,input),{code:'INVALID_RESEARCH_APPLICABILITY'});
 const wrong=structuredClone(chosen);wrong.useScan.assessedOriginKeys=[];assert.throws(()=>validateResearchReadinessOutput(wrong,input),{code:'INVALID_EVIDENCE_SELECTION'});
 const altered=structuredClone(chosen);altered.useScan.contentHash='wrong';assert.throws(()=>validateResearchReadinessOutput(altered,input));
 const positive=structuredClone(raw);positive.obligationAssessments[0].procurement={kind:'required_now',state:'available',material:'Supplied source-relative content',reason:'Present in the current packet.',refs:[ref],decisionDependency:'Bounded exploration only.'};positive.useScan={contentHash:input.contentHash,assessedOriginKeys:[],findings:[]};const none=select(positive,request,'readiness');assert.equal(none.useScan.scanMode,'none');assert.deepEqual(validateResearchReadinessOutput(none,input).useScan,positive.useScan);
 const extra=structuredClone(none);extra.useScan.findings=[];assert.throws(()=>validateResearchReadinessOutput(extra,input),{code:'INVALID_EVIDENCE_SELECTION'});
 const v4input={...input,evidenceSelectionProtocol:'evidence-selection-v4'};const current4=buildResearchReadinessRequest(v4input);assert.equal(current4.outputSchema.properties.selectionProtocol.enum[0],'evidence-selection-v4');assert.throws(()=>validateResearchReadinessOutput(chosen,v4input));
});
