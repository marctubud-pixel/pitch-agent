import assert from 'node:assert/strict';
import test from 'node:test';
import {tmpdir} from 'node:os';
import {mkdir,writeFile,mkdtemp,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {contentNodes,contentRequest,contentPlanningManifest,ingestContent,reduceCompleteContent,validateContentReceipt} from './complete-content.mjs';
import {verifyContentOriginal} from './content-original.mjs';
import {sketchHash} from './sketch-authority.mjs';
import {checkedOriginalResultFacts} from './final-selected-originals.mjs';
import {indexFinalHistoryRecords} from './final-history-index.mjs';
import {isCheckedOriginalReportAnchor} from './final-review-reader.mjs';
async function fixture({invalidPlan=false}={}) {
const executionRoot=await mkdtemp(join(tmpdir(),'content-raw-binding-contract-'));
const binding=role=>({role,model:'local-contract',providerId:'contract'}),assignments=Object.fromEntries(contentNodes().map(n=>[n.key,binding(n.key==='producer:strategy'?'strategy-lead':n.key==='producer:copy'?'copy-lead':n.role)]));
const source={sourceHash:'source-contract-only',task:{},strategy:{artifactId:'s'},copy:{artifactId:'c'},visual:{artifactId:'v',payload:{directions:[]}},visualLeg:{jobId:'visual-contract'},images:[],directionMap:[],sources:[],claims:[],obligations:['strategy','copy','visual'].map((m,i)=>({originId:'o'+i,artifactId:m,pointer:'/limit',owner:m+'-lead',kind:'restriction',value:'contract'}))};
const p={id:'content-binding-contract',revision:1,contentAllowance:{maxCalls:13},jobs:[{id:'visual-contract',binding:binding('visual-lead'),status:'queued',attempts:[],inputVersionIds:[],outputVersionIds:[]}],artifacts:['s','c','v'].map(id=>({id,contentHash:'contract-only',provenance:'imported_metadata',inputVersionIds:[]})),taskCards:[]},context={actorType:'agent',actorId:'contract',runId:'contract',contextId:'contract'};
const send=c=>reduceCompleteContent(p,c,context,()=>source);
send({kind:'open-complete-content',source,sourceContents:[],assignments});const root=p.jobs.at(-1);
send({kind:'claim-complete-content',jobId:root.id,attemptId:'content-attempt'});
const {input,request}=contentRequest(p,root,root.node),manifest=contentPlanningManifest(p,root),raw={protocol:'complete-content-v1',envelopeHash:input.envelopeHash,nodeKey:'plan',findings:[],workOrder:{objective:'Isolated source-backed binding contract',productionDirector:manifest.productionDirector,moduleOwners:manifest.moduleOwners,limits:manifest.limits,returns:manifest.returns,specialistRequirements:manifest.requiredSpecialists}};
if(invalidPlan)raw.workOrder.productionDirector.model='wrong';
const packet={runId:'content-attempt',model:root.binding.model,...request},receipt={runId:'content-attempt',requestedModel:root.binding.model,model:root.binding.model,exitCode:0,threadId:'contract-thread',inputPacketHash:sketchHash(packet),images:[],responseText:JSON.stringify(raw)};
send({kind:'anchor-complete-content',jobId:root.id,attemptId:'content-attempt',receipt});send({kind:'complete-complete-content',jobId:root.id,attemptId:'content-attempt'});assert.equal(root.contentReport.valid,!invalidPlan);
const folder=join(executionRoot,'content-attempt');await mkdir(folder);await writeFile(join(folder,'packet.json'),JSON.stringify(packet));await writeFile(join(folder,'receipt.json'),JSON.stringify(receipt));await writeFile(join(folder,'response.txt'),receipt.responseText);
const restored=JSON.parse(JSON.stringify(p)),original=restored.jobs.find(j=>j.id===root.id);assert.notEqual(original.contentReport.raw,original.contentReport.projection.raw);
return {executionRoot,project:p,liveRoot:root,restored,original,raw,receipt,folder,source};
}
const check=(f,options={})=>verifyContentOriginal(f.restored,f.original,f.original,{executionRoot:f.executionRoot,...options});
test('validated receipt returns the same-invocation input and rejects changed same-head content',async()=>{
 const f=await fixture(),attempt=f.original.attempts.at(-1),saved=JSON.stringify(f.restored);
 const checked=validateContentReceipt(f.restored,f.original,f.original,attempt,attempt.receipt);
 assert.deepEqual(checked,contentRequest(f.restored,f.original,f.original.node).input);
 assert.equal(JSON.stringify(f.restored),saved);
 f.original.task.source.obligations[0].value='same revision, different content';
 await assert.rejects(async()=>validateContentReceipt(f.restored,f.original,f.original,attempt,attempt.receipt),{code:'CONTENT_RECEIPT_INVALID'});
 f.original.task.source.obligations[0].value=f.source.obligations[0].value;
 assert.deepEqual(validateContentReceipt(f.restored,f.original,f.original,attempt,attempt.receipt),checked);
 const wrongReceipt={...attempt.receipt,model:'wrong'};
 await assert.rejects(async()=>validateContentReceipt(f.restored,f.original,f.original,attempt,wrongReceipt),{code:'CONTENT_RECEIPT_INVALID'});
});
function admit(f,checked) {
 const index=indexFinalHistoryRecords(f.restored),fact=checkedOriginalResultFacts({kind:'job',checked,snapshot:f.restored,planning:structuredClone(f.restored),index}),anchor=index.reportAnchors.find(a=>a.identity===checked.reportId);
 return isCheckedOriginalReportAnchor(anchor,{facts:[fact]});
}
test('isolated reducer original succeeds live and after saved JSON reopen through actual reader anchor',async()=>{
 const f=await fixture();
 const live=await verifyContentOriginal(f.project,f.liveRoot,f.liveRoot,{executionRoot:f.executionRoot});assert.deepEqual(live.raw,f.raw);
 const checked=await check(f);assert.deepEqual(checked.raw,f.raw);assert.equal(admit(f,checked),true);
 console.log(JSON.stringify({canonicalContent:false,fullReaderReady:false,providerCalls:0,actualReducerCompletion:true,liveAndSavedOriginalAccepted:true}));
});
test('separate top-level raw finding refuses before facts and reader admission',async()=>{
 const f=await fixture();const projection=structuredClone(f.original.contentReport.projection),response=await readFile(join(f.folder,'response.txt'),'utf8');
 f.original.contentReport.raw={...f.original.contentReport.raw,findings:[{id:'unexecuted-finding',description:'This never appeared in response.txt'}]};
 assert.deepEqual(f.original.contentReport.projection,projection);assert.equal(await readFile(join(f.folder,'response.txt'),'utf8'),response);
 let admitted=false;
 await assert.rejects(async()=>{const checked=await check(f);admitted=admit(f,checked);console.log(JSON.stringify({tamperedRawAdmitted:admitted,responseRaw:JSON.parse(response),returnedRaw:checked.raw,projectionUnchanged:true}));},{code:'CONTENT_ORIGINAL_CHANGED'});
 assert.equal(admitted,false);
});
for(const mutation of ['missing','null','array','normalized','both-stored-copies'])test(`stored raw ${mutation} refuses exact response authority`,async()=>{
 const f=await fixture();
 if(mutation==='missing')delete f.original.contentReport.raw;
 if(mutation==='null')f.original.contentReport.raw=null;
 if(mutation==='array')f.original.contentReport.raw=[];
 if(mutation==='normalized')f.original.contentReport.raw=structuredClone(f.original.contentReport.projection);
 if(mutation==='both-stored-copies'){f.original.contentReport.raw.findings.push({id:'unexecuted'});f.original.contentReport.projection.raw=structuredClone(f.original.contentReport.raw);}
 await assert.rejects(check(f),{code:'CONTENT_ORIGINAL_CHANGED'});
});
test('altered normalized projection refuses independently',async()=>{
 const f=await fixture();f.original.contentReport.projection.diagnostics.push('invented');await assert.rejects(check(f),{code:'CONTENT_ORIGINAL_CHANGED'});
});
test('changed managed response bytes refuse independently',async()=>{
 const f=await fixture();await writeFile(join(f.folder,'response.txt'),f.receipt.responseText.replace('Isolated','Replaced'));await assert.rejects(check(f),{code:'CONTENT_ORIGINAL_BYTES_CHANGED'});
});
test('raw object key order is semantic while response byte whitespace remains exact',async()=>{
 const f=await fixture();f.original.contentReport.raw=Object.fromEntries(Object.entries(f.original.contentReport.raw).reverse());assert.deepEqual((await check(f)).raw,f.raw);
 await writeFile(join(f.folder,'response.txt'),f.receipt.responseText+' ');await assert.rejects(check(f),{code:'CONTENT_ORIGINAL_BYTES_CHANGED'});
});
test('invalid assignment plan retains exact raw and diagnostics only with explicit retention',async()=>{
 const f=await fixture({invalidPlan:true});assert.deepEqual(f.original.contentReport.diagnostics,['CONTENT_PLAN_ASSIGNMENT_INVALID']);
 await assert.rejects(check(f),{code:'CONTENT_PLAN_ASSIGNMENT_INVALID'});
 const checked=await check(f,{retainInvalidPlan:true});assert.deepEqual(checked.raw,f.raw);assert.equal(checked.valid,false);assert.deepEqual(checked.projection.diagnostics,['CONTENT_PLAN_ASSIGNMENT_INVALID']);
 f.original.contentReport.raw.findings.push({id:'unexecuted'});await assert.rejects(check(f,{retainInvalidPlan:true}),{code:'CONTENT_PLAN_ASSIGNMENT_INVALID'});
});

async function producerFixture({valid=false}={}) {
 const f=await fixture(),context={actorType:'agent',actorId:'producer-contract',runId:'producer-contract-run',contextId:'producer-contract-context'};
 const send=c=>reduceCompleteContent(f.project,c,context,()=>structuredClone(f.source));
 send({kind:'queue-complete-content',rootJobId:f.liveRoot.id,nodeKey:'producer:strategy'});
 const job=f.project.jobs.at(-1),attemptId='producer-attempt';send({kind:'claim-complete-content',jobId:job.id,attemptId});
 const {input,request}=contentRequest(f.project,f.liveRoot,job.node),raw={protocol:input.protocol,envelopeHash:input.envelopeHash,nodeKey:input.nodeKey,findings:[],decision:'accept',understanding:valid?'Actual isolated obligations understood':'',acceptedOriginIds:f.source.obligations.map(o=>o.originId),restrictions:f.source.obligations};
 const packet={runId:attemptId,model:job.binding.model,...request},receipt={runId:attemptId,requestedModel:job.binding.model,model:job.binding.model,exitCode:0,threadId:'producer-contract-thread',inputPacketHash:sketchHash(packet),images:[],responseText:JSON.stringify(raw)};
 send({kind:'anchor-complete-content',jobId:job.id,attemptId,receipt});send({kind:'complete-complete-content',jobId:job.id,attemptId});assert.equal(job.contentReport.valid,valid);
 const folder=join(f.executionRoot,attemptId);await mkdir(folder);for(const [name,data] of Object.entries({'packet.json':JSON.stringify(packet),'receipt.json':JSON.stringify(receipt),'response.txt':receipt.responseText}))await writeFile(join(folder,name),data);
 const restored=JSON.parse(JSON.stringify(f.project)),root=restored.jobs.find(j=>j.id===f.liveRoot.id),original=restored.jobs.find(j=>j.id===job.id);
 assert.notEqual(original.contentReport.raw,original.contentReport.projection.raw);
 return {...f,restored,root,original,raw,receipt,folder};
}
test('checked invalid producer validity survives a forged top-level valid field through actual raw facts',async()=>{
 const f=await producerFixture(),verify=()=>verifyContentOriginal(f.restored,f.root,f.original,{executionRoot:f.executionRoot});
 const matching=await verify();assert.equal(matching.valid,false);assert.equal(matching.projection.valid,false);
 f.original.contentReport.valid=true;
 const saved=JSON.stringify(f.restored),response=await readFile(join(f.folder,'response.txt'));
 const checked=await verify(),rawAnchor=admit(f,checked);
 console.log(JSON.stringify({invalidProducerMetadata:true,checkedValid:checked.valid,projectionValid:checked.projection.valid,rawAnchor,providerEntries:0,canonicalContent:false}));
 assert.equal(checked.valid,false);assert.equal(checked.projection.valid,false);assert.deepEqual(checked.projection,matching.projection);assert.deepEqual(checked.raw,JSON.parse(response));
 assert.equal(rawAnchor,true);assert.equal(checked.valid===false,true);
 assert.equal(JSON.stringify(f.restored),saved);assert.deepEqual(await readFile(join(f.folder,'response.txt')),response);
});
test('retained invalid plan returns fresh normalized authority despite forged stored metadata',async()=>{
 const f=await fixture({invalidPlan:true}),{input}=contentRequest(f.restored,f.original,f.original.node);
 const expected=ingestContent(input,f.original.attempts.at(-1).receipt,contentPlanningManifest(f.restored,f.original));
 f.original.contentReport.valid=true;f.original.contentReport.projection={raw:{invented:true},valid:true,diagnostics:['invented-diagnostic'],slots:{invented:true}};
 const saved=JSON.stringify(f.restored),response=await readFile(join(f.folder,'response.txt'));
 await assert.rejects(check(f),{code:'CONTENT_PLAN_ASSIGNMENT_INVALID'});
 const checked=await check(f,{retainInvalidPlan:true});
 console.log(JSON.stringify({retainedPlanMetadata:true,checkedValid:checked.valid,projection:checked.projection,providerEntries:0,canonicalContent:false}));
 assert.deepEqual(checked.projection,expected);assert.equal(checked.valid,false);assert.deepEqual(checked.projection.diagnostics,['CONTENT_PLAN_ASSIGNMENT_INVALID']);assert.deepEqual(checked.raw,JSON.parse(response));
 assert.notEqual(checked.projection,f.original.contentReport.projection);assert.equal(admit(f,checked),true);assert.equal(checked.valid===false,true);
 assert.equal(JSON.stringify(f.restored),saved);assert.deepEqual(await readFile(join(f.folder,'response.txt')),response);
});
test('valid producer retains freshly checked normalized metadata',async()=>{
 const f=await producerFixture({valid:true}),saved=JSON.stringify(f.restored),checked=await verifyContentOriginal(f.restored,f.root,f.original,{executionRoot:f.executionRoot});
 assert.equal(checked.valid,true);assert.deepEqual(checked.projection,f.original.contentReport.projection);assert.deepEqual(checked.raw,f.raw);assert.equal(admit(f,checked),true);assert.equal(JSON.stringify(f.restored),saved);
});
