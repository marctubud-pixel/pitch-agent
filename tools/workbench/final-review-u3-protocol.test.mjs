import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {finalCodexResultSchema} from './final-review-codex-schema.mjs';
import {buildFinalCodexInvocation,codexDescriptor,validateFinalCodexOriginal,FINAL_CODEX_PROTOCOL,FINAL_CODEX_PHASE_PROTOCOL,FINAL_CODEX_FILES,finalCodexAttachmentReads} from './final-review-codex-original.mjs';
import {owned,configure,reserve} from './final-review-phase-fixture.mjs';
import {phasePacket,phaseObligations,editionProofs,validatePhaseResult,phasePredecessors} from './final-review-phase.mjs';
import {finalCallHash as hash} from './final-review-call.mjs';
import {verifyFinalOperationEvidence} from './final-review-operation-evidence.mjs';
const evidence=[{targetId:'target',observation:'checked original'}];
const checks=ids=>ids.map(obligationId=>({obligationId,status:'checked',evidence}));
const basis={frozen:'basis'},pin={binding:{reportSlot:{slotIdentity:'slot'}},basis,returnTargets:[{id:'target'}]};
const plan={calls:[{payload:{editions:[]}}],packetsByRole:{content:[{id:'packet',kind:'complete_source'}]}};
const predecessor={id:'prior',binding:{callId:'owner:finalProducer'},report:{result:{kind:'observation',findings:[]}}};
const r={localGates:[{}],approval:{id:'approval',decision:{rulings:[]}}};
function matches(v,s){
 if(s.anyOf)return s.anyOf.some(x=>matches(v,x));
 if('const'in s&&JSON.stringify(v)!==JSON.stringify(s.const))return false;
 if(s.enum&&!s.enum.includes(v))return false;
 if(s.type==='null')return v===null;
 if(s.type==='string'&&(typeof v!=='string'||v.length<(s.minLength??0)))return false;
 if(s.type==='array')return Array.isArray(v)&&v.length>=(s.minItems??0)&&(!s.uniqueItems||new Set(v.map(x=>JSON.stringify(x))).size===v.length)&&v.every(x=>matches(x,s.items));
 if(s.type==='object')return v!==null&&typeof v==='object'&&!Array.isArray(v)&&(s.required??[]).every(k=>Object.hasOwn(v,k))&&Object.keys(v).every(k=>s.properties[k]&&matches(v[k],s.properties[k]));
 return true;
}
const cases=[
 [{id:'owner:layoutProducer',phase:'owner_before'},{kind:'layout_handoff',basisHash:hash(basis),statement:'ready'},[]],
 [{id:'owner:finalConsumer',phase:'owner_before'},{kind:'intake_accept',producerResultId:'prior',basisHash:hash(basis),checks:checks(['producer_original','source','manuscript','editions','restrictions','routing'])},[predecessor]],
 ...['primary','blind'].map(phase=>[{id:`content:${phase}:0`,phase,role:'content',packetId:'packet'},{kind:'observation',packetId:'packet',coverage:checks(['task','policy','manuscript','source','qualifications','duty']),findings:[],limitations:[]},[]]),
 ...['primary','blind'].map(lane=>[{id:`content:${lane}:synthesis`,role:'content',phase:lane+'_synthesis',originalReportInputs:[{producerCallId:'source'}]},{kind:'lane_synthesis',lane,originalResultIds:['prior'],coverage:checks(['source']),findingRefs:[],conflicts:[],conclusion:'clear'},[predecessor]]),
 [{id:'content:challenge',phase:'paired_challenge',role:'content'},{kind:'paired_challenge',role:'content',reviewedResultIds:['prior'],comparisons:[{resultId:'prior',pointer:'/result',observation:'compared original'}],objections:[],conclusion:'no_objection'},[predecessor]],
 [{id:'director',phase:'director',originalReportInputs:[{producerCallId:'source'}]},{kind:'director_disposition',reviewedResultIds:['prior'],dispositions:[],coverage:checks(['source']),outcome:{kind:'approve',itemRefs:[]}},[predecessor]],
 [{id:'owner:finalProducer',phase:'owner_after'},{kind:'final_handoff',approvalId:'approval',basisHash:hash(basis),editionProofs:[],statement:'ready'},[predecessor]],
 [{id:'owner:deliveryConsumer',phase:'owner_after'},{kind:'delivery_accept',producerResultId:'prior',approvalId:'approval',editionProofs:[],checks:checks(['producer_original','delivery_bytes','inventory','native','editable','import','render'])},[predecessor]],
];
for(const [call,result,predecessors] of cases)test(`${call.id} schema projects a result accepted by real phase semantics`,()=>{
 assert.ok(matches(result,finalCodexResultSchema(call)));
 validatePhaseResult(result,pin,call,plan,predecessors,r);
 const changed={...result,unexpected:true};assert.equal(matches(changed,finalCodexResultSchema(call)),false);
 assert.throws(()=>validatePhaseResult(changed,pin,call,plan,predecessors,r));
 const finding={id:'slot:1',category:'factual',duty:'content',targetIds:['target'],evidence,reason:'wrong',requestedChange:'repair',effect:'must_fix'};
 const returned={kind:'return',findings:[finding]};assert.ok(matches(returned,finalCodexResultSchema(call)));validatePhaseResult(returned,pin,call,plan,predecessors,r);
});
function packet(attachments=[]){return {protocol:'final-call-packet-v2',operation:'final-review-v1',binding:{callId:'owner:layoutProducer',attemptId:'attempt',assignment:{modelIdentity:'model'}},call:{id:'owner:layoutProducer',phase:'owner_before',originalReportInputs:[],personalPixelInspection:attachments.length>0,profile:{context:{maxInputBytes:32*1024**2},transport:{maxImages:4,maxBytes:100,maxPixels:100,maxImageBytes:50,maxImagePixels:50}}},predecessorOriginals:[],attachments};}
const attachment=(n,bytes)=>({occurrenceId:`occ-${n}`,sha256:codexDescriptor(bytes).sha256,bytes:Buffer.byteLength(bytes),mediaType:'image/png',dimensions:{width:1,height:1},originalPath:`/original/${n}.png`});
function originals(protocol=FINAL_CODEX_PHASE_PROTOCOL,attachments=[]){
 const packetText=JSON.stringify(packet(attachments));const built=buildFinalCodexInvocation({packetText,adapterProtocol:protocol}),binding=JSON.parse(packetText).binding;
 const response=JSON.stringify({protocol:'final-phase-result-v2',binding,packetHash:codexDescriptor(packetText).sha256,result:{kind:'layout_handoff',basisHash:hash(basis),statement:'ready'}});
 const root='/synthetic-provider',runDir=join(root,'run-test'),cwd=join(runDir,'context');
 const paths=Object.fromEntries(Object.entries(FINAL_CODEX_FILES).map(([k,v])=>[k,join(runDir,v.suffix)]));
 const argv=['exec','--ignore-user-config','--ephemeral','--skip-git-repo-check','-s','read-only','-C',cwd,'--model','model','--json','-o',paths.output,'--output-schema',paths.schema];
 const images=built.request.images??[],projected=images.map((a,i)=>({imageId:a.imageId,sha256:a.sha256,mediaType:a.mediaType,byteLength:a.byteLength,path:join(cwd,`image-${i+1}.png`)}));
 for(const a of projected)argv.push('--image',a.path);argv.push('-');
 const invocation=JSON.stringify({binary:'/synthetic/codex',argv,cwd,timeoutMs:100,stdin:built.descriptors.prompt});
 const usage={input_tokens:1,cached_input_tokens:0,output_tokens:1};
 const receipt={runId:'attempt',operation:'final-review-v1',invocation:codexDescriptor(invocation),provider:'codex-cli',providerRequestId:'thread',threadId:'thread',model:'model',requestedModel:'model',reportedModel:null,usage,cost:null,paths:{runDir,...Object.fromEntries(['input','schema','stdout','stderr','output','receipt','invocation'].map(k=>[k,paths[k]]))},inputPacketHash:built.descriptors.input.sha256,contextHash:built.descriptors.input.sha256,startedAt:'synthetic',finishedAt:'synthetic',exitCode:0,signal:null,reason:null,error:null,...(images.length?{images:projected}:{})};
 const codex={invocation,input:built.inputText,schema:built.schemaText,receipt:JSON.stringify(receipt),stdout:[{type:'thread.started',thread_id:'thread'},{type:'turn.started'},{type:'item.completed',item:{type:'agent_message',text:response}},{type:'turn.completed',usage}].map(x=>JSON.stringify(x)).join('\n'),stderr:'',output:response,images:attachments.map((_,i)=>Buffer.from(i?'b':'a'))};
 const files=Object.fromEntries(Object.entries(FINAL_CODEX_FILES).map(([k,v])=>[k,{relativePath:`run-test/${v.suffix}`,...codexDescriptor(codex[k])}]));
 return {pin:{adapterProtocol:protocol,operation:'final-review-v1',binding,providerDescriptors:built.descriptors,originals:{packet:codexDescriptor(packetText)},responseLimit:2*1024**2},originals:{packet:packetText,providerRequest:built.inputText,providerSchema:built.schemaText,providerOriginals:JSON.stringify({protocol:'final-codex-originals-v1',binding,packetSha256:codexDescriptor(packetText).sha256,files}),providerRoot:root,codex,response}};
}
for(const protocol of [FINAL_CODEX_PROTOCOL,FINAL_CODEX_PHASE_PROTOCOL])test(`${protocol} original bytes and model equality`,()=>{
 const fixture=originals(protocol);assert.equal(validateFinalCodexOriginal(fixture).outcome,'completed');
 const rec=JSON.parse(fixture.originals.codex.receipt);rec.reportedModel='other';fixture.originals.codex.receipt=JSON.stringify(rec);
 const sidecar=JSON.parse(fixture.originals.providerOriginals);Object.assign(sidecar.files.receipt,codexDescriptor(fixture.originals.codex.receipt));fixture.originals.providerOriginals=JSON.stringify(sidecar);
 assert.throws(()=>validateFinalCodexOriginal(fixture),{code:'FINAL_RECEIPT_INVALID'});
});
test('v2 occurrence attachment projection preserves duplicate image bytes and order',()=>{
 const fixture=originals(FINAL_CODEX_PHASE_PROTOCOL,[attachment(1,'a'),attachment(2,'b')]);assert.equal(validateFinalCodexOriginal(fixture).outcome,'completed');fixture.originals.codex.images.reverse();assert.throws(()=>validateFinalCodexOriginal(fixture),{code:'FINAL_ATTACHMENT_REQUIRED'});
 const repeated=packet([attachment(1,'a'),attachment(2,'a')]);assert.equal(buildFinalCodexInvocation({packetText:JSON.stringify(repeated)}).request.images.length,2);
 repeated.attachments[1].occurrenceId='occ-1';assert.throws(()=>buildFinalCodexInvocation({packetText:JSON.stringify(repeated)}),{code:'FINAL_ATTACHMENT_REQUIRED'});
});
test('complete predecessor bytes are included and substituted bytes rejected',()=>{
 const p=packet(),reportBytes=JSON.stringify({protocol:'final-phase-result-v2',result:{kind:'observation',findings:[]}}),slot={producerCallId:'source',maxBytes:1000};p.call.originalReportInputs=[slot];p.predecessorOriginals=[{slot,resultId:'prior',reportBytes,reportSha256:codexDescriptor(reportBytes).sha256,originalReceiptSha256:'receipt'}];
 assert.ok(buildFinalCodexInvocation({packetText:JSON.stringify(p)}).request.prompt.includes(reportBytes.replaceAll('"','\\"')));p.predecessorOriginals[0].reportBytes+=' ';assert.throws(()=>buildFinalCodexInvocation({packetText:JSON.stringify(p)}),{code:'FINAL_PREDECESSOR_REQUIRED'});
});
test('operation roots are explicit and qualification remains missing',async()=>{
 const input={project:{jobs:[]},planning:{calls:[]},configuration:{assignmentPolicy:{profiles:[]}},executionRoot:'/execution',providerRoot:'/provider',current:()=>{}};
 assert.equal((await verifyFinalOperationEvidence(input)).blockers[0].code,'FINAL_TRUSTED_OPERATION_PRODUCER_REQUIRED');
 assert.equal((await verifyFinalOperationEvidence({...input,providerRoot:undefined})).blockers[0].code,'FINAL_OPERATION_ORIGINAL_ROOT_REQUIRED');
 await assert.rejects(verifyFinalOperationEvidence({...input,current:()=>{throw Object.assign(Error('changed'),{code:'FINAL_READ_CHANGED'});}}),{code:'FINAL_READ_CHANGED'});
});
test('real predecessor validator requires exact registered response bytes and slot',()=>{
 const binding={attemptId:'source-attempt'},report={binding,packetHash:'packet-hash',result:{kind:'observation',findings:[]}},reportBytes=JSON.stringify(report),slot={producerCallId:'source',maxBytes:1000};
 const body={binding,report,originals:{response:codexDescriptor(reportBytes),receipt:{sha256:'receipt-hash'}}};
 const result={...body,id:hash(body)},receipt={originalReceiptHash:'receipt-hash'};
 const project={jobs:[{purpose:'final_review_call',status:'succeeded',task:{reservationId:'reservation',id:'source',originalRequest:{binding,originals:{packet:{sha256:'packet-hash'}}}},finalCallResult:result,attempts:[{id:'source-attempt',receipt}],receipt}]};
 const reservation={id:'reservation',calls:[{id:'source',status:'succeeded',resultId:result.id}]},call={originalReportInputs:[slot]};
 const original={slot,resultId:result.id,reportSha256:codexDescriptor(reportBytes).sha256,reportBytes,originalReceiptSha256:'receipt-hash'};
 assert.deepEqual(phasePredecessors(project,reservation,call,[original]),[original]);
 assert.throws(()=>phasePredecessors(project,reservation,call,[{...original,reportBytes:reportBytes+' '}]),{code:'FINAL_PREDECESSOR_REQUIRED'});
 assert.throws(()=>phasePredecessors(project,reservation,call,[{...original,slot:{...slot,producerCallId:'other'}}]),{code:'FINAL_PREDECESSOR_REQUIRED'});
});
for(const phase of ['owner_before','owner_after'])test(`${phase} proof-bearing return is checked by real semantics`,()=>{
 const call={id:phase==='owner_before'?'owner:layoutProducer':'owner:finalProducer',phase};
 const f={id:'slot:subjective',category:'creative',duty:'content',targetIds:['target'],evidence:[],reason:'creative concern',requestedChange:'repair',effect:'must_fix'};
 let returned,reservation;
 if(phase==='owner_before'){returned={kind:'return',findings:[f],basisHash:hash(basis),checks:checks(['frozen_basis'])};reservation=r;}
 else {const itemRef='prior#/result/findings/0';returned={kind:'return',findings:[{...f,rulingRef:itemRef}],approvalId:'approval',editionProofs:[],checks:checks(['producer_original','delivery_bytes','inventory','native','editable','import','render'])};reservation={...r,approval:{id:'approval',decision:{rulings:[{itemRef,decision:'accept_subjective_risk'}]}}};}
 const predecessors=[{...predecessor,report:{result:{kind:'observation',findings:[f]}}}];
 assert.ok(matches(returned,finalCodexResultSchema(call)));validatePhaseResult(returned,pin,call,plan,predecessors,reservation);
 assert.throws(()=>validatePhaseResult({...returned,checks:[]},pin,call,plan,predecessors,reservation));
});
function updateSidecar(fixture){const sidecar=JSON.parse(fixture.originals.providerOriginals);for(const name of ['receipt','stdout'])Object.assign(sidecar.files[name],codexDescriptor(fixture.originals.codex[name]));fixture.originals.providerOriginals=JSON.stringify(sidecar);}
test('v2 completed event must contain exactly the saved output text',()=>{
 const fixture=originals(),events=fixture.originals.codex.stdout.split('\n').map(x=>JSON.parse(x));events[2].item.text+=' ';fixture.originals.codex.stdout=events.map(x=>JSON.stringify(x)).join('\n');updateSidecar(fixture);
 assert.throws(()=>validateFinalCodexOriginal(fixture),{code:'FINAL_TERMINAL_INVALID'});
});
test('v2 known failure retains protocol original consistency and rejects success exit code',()=>{
 const fixture=originals(),receipt=JSON.parse(fixture.originals.codex.receipt);receipt.exitCode=1;receipt.usage=null;fixture.originals.codex.receipt=JSON.stringify(receipt);
 fixture.originals.codex.stdout=[{type:'thread.started',thread_id:'thread'},{type:'turn.failed',error:{message:'synthetic known failure'}}].map(x=>JSON.stringify(x)).join('\n');updateSidecar(fixture);
 assert.equal(validateFinalCodexOriginal(fixture).outcome,'known_failure');
 receipt.exitCode=0;fixture.originals.codex.receipt=JSON.stringify(receipt);updateSidecar(fixture);assert.throws(()=>validateFinalCodexOriginal(fixture),{code:'FINAL_TERMINAL_INVALID'});
});

test('v2 requires turn start before successful messages and terminal',()=>{
 for(const protocol of [FINAL_CODEX_PROTOCOL,FINAL_CODEX_PHASE_PROTOCOL]){
  const fixture=originals(protocol);fixture.originals.codex.stdout=fixture.originals.codex.stdout.split('\n').filter(line=>JSON.parse(line).type!=='turn.started').join('\n');updateSidecar(fixture);
  if(protocol===FINAL_CODEX_PROTOCOL)assert.equal(validateFinalCodexOriginal(fixture).outcome,'completed');
  else assert.throws(()=>validateFinalCodexOriginal(fixture),{code:'FINAL_TERMINAL_INVALID'});
 }
});
test('reader rejects unexpected receipt attachment before trying its path',async()=>{
 const {mkdtemp,mkdir,writeFile,rm}=await import('node:fs/promises');
 const {createFinalCallSettlement}=await import('./final-review-call-original.mjs');
 const {finalCodexExecutionSpec}=await import('./final-review-codex-original.mjs');
 const root=await mkdtemp('/private/tmp/u3-bounded-probe-');
 try{
  const executionRoot=join(root,'execution'),providerRoot=join(root,'provider');await mkdir(join(executionRoot,'attempt'),{recursive:true});await mkdir(join(providerRoot,'run-test'),{recursive:true});
  const fixture=originals();const receipt=JSON.parse(fixture.originals.codex.receipt);receipt.images=[{path:join(providerRoot,'never-created.png')}];fixture.originals.codex.receipt=JSON.stringify(receipt);
  const sidecar=JSON.parse(fixture.originals.providerOriginals);
  for(const [name,spec] of Object.entries(FINAL_CODEX_FILES))await writeFile(join(providerRoot,'run-test',spec.suffix),fixture.originals.codex[name]);
  for(const [name,spec] of Object.entries(finalCodexExecutionSpec('reconcile')))await writeFile(join(executionRoot,'attempt',spec.suffix),name==='providerOriginals'?JSON.stringify(sidecar):fixture.originals[name]??'{}');
  const store={read:()=>({revision:1,jobs:[{task:{reservationId:'reservation',id:'call',originalRequest:fixture.pin}}]}),command:()=>{throw Error('unexpected command');}};
  await assert.rejects(createFinalCallSettlement({store,executionRoot,providerRoot}).reconcileCall('project',{expectedRevision:1,reservationId:'reservation',callId:'call',attemptId:'attempt'},{}),{code:'FINAL_ATTACHMENT_REQUIRED'});
 }finally{await rm(root,{recursive:true,force:true});}
});

test('attachment admission is exact and bounded before managed byte allocation',async()=>{
 const fixture=originals(FINAL_CODEX_PHASE_PROTOCOL,[attachment(1,'a'),attachment(2,'a')]);
 const receipt=JSON.parse(fixture.originals.codex.receipt);
 const admit=(packetText=fixture.originals.packet,images=receipt.images)=>finalCodexAttachmentReads({packetText,adapterProtocol:FINAL_CODEX_PHASE_PROTOCOL,providerRoot:'/synthetic-provider',run:'run-test',receiptBytes:JSON.stringify({images})});
 assert.equal(admit().length,2);
 for(const images of [receipt.images.slice(0,1),[...receipt.images,receipt.images[0]],[...receipt.images].reverse(),receipt.images.map((a,i)=>i?{...a,path:'/unexpected'}:a),receipt.images.map((a,i)=>i?{...a,sha256:'0'.repeat(64)}:a),receipt.images.map((a,i)=>i?{...a,imageId:'occurrence-1'}:a)])assert.throws(()=>admit(undefined,images),{code:'FINAL_ATTACHMENT_REQUIRED'});
 for(const value of [null,1e300]){const changed=JSON.parse(fixture.originals.packet);changed.call.profile.transport.maxBytes=value;assert.throws(()=>admit(JSON.stringify(changed)),{code:'FINAL_CONTEXT_CAPACITY_EXCEEDED'});}
 const oversized=JSON.parse(fixture.originals.packet);oversized.attachments[0].bytes=8*1024**2+1;Object.assign(oversized.call.profile.transport,{maxBytes:32*1024**2,maxImageBytes:32*1024**2});assert.throws(()=>admit(JSON.stringify(oversized)),{code:'FINAL_CONTEXT_CAPACITY_EXCEEDED'});
 const {mkdtemp,mkdir,writeFile,rm}=await import('node:fs/promises');const {readManagedLayoutBytes}=await import('./managed-layout-bytes.mjs');
 const root=await mkdtemp('/private/tmp/u3-bounded-positive-');
 try{await mkdir(join(root,'run-test','context'),{recursive:true});const images=receipt.images.map((a,i)=>({...a,path:join(root,'run-test','context',`image-${i+1}.png`)}));
 for(const a of images)await writeFile(a.path,'a');
 const allowed=finalCodexAttachmentReads({packetText:fixture.originals.packet,adapterProtocol:FINAL_CODEX_PHASE_PROTOCOL,providerRoot:root,run:'run-test',receiptBytes:JSON.stringify({images})});
 for(const a of allowed)assert.deepEqual(codexDescriptor(await readManagedLayoutBytes(root,a.path,a.byteLength)),{sha256:a.sha256,bytes:a.byteLength});
 }finally{await rm(root,{recursive:true,force:true});}
});

test('v2 rejects item started before turn started',()=>{
 const fixture=originals(),events=fixture.originals.codex.stdout.split('\n').map(line=>JSON.parse(line));
 events.splice(1,0,{type:'item.started',item:{type:'agent_message',text:fixture.originals.response}});
 fixture.originals.codex.stdout=events.map(event=>JSON.stringify(event)).join('\n');updateSidecar(fixture);
 assert.throws(()=>validateFinalCodexOriginal(fixture),{code:'FINAL_TERMINAL_INVALID'});
});

test('actual planner and reserved full graph build schemas accepted by phase semantics',()=>{
 const o=owned({reportBoundBytes:16384}),p=structuredClone(reserve(configure(o),o.plan)),reservation=p.finalReviewReservations.at(-1),setup=p.finalReviewSetups.at(-1),results=new Map();
 assert.equal(o.full.calls.length,2*Object.values(o.full.Krole).reduce((n,k)=>n+k,0)+20);
 assert.deepEqual(reservation.calls.map(({id,phase,role})=>({id,phase,role})),o.full.calls.map(({id,phase,role})=>({id,phase,role})));
 reservation.approval={id:'synthetic-approval',decision:{rulings:[]}};
 for(const call of o.full.calls){
  const predecessors=call.originalReportInputs.map(slot=>results.get(slot.producerCallId));
  assert.ok(predecessors.every(Boolean));
  const rows=call.originalReportInputs.map((slot,i)=>{const reportBytes=JSON.stringify(predecessors[i].report);return {slot,resultId:predecessors[i].id,reportBytes,reportSha256:codexDescriptor(reportBytes).sha256,originalReceiptSha256:'synthetic'};});
  const attachments=call.personalPixelInspection?o.full.packetsByRole[call.role].find(p=>p.id===call.packetId).originals.map(({occurrenceId,sha256,bytes,mediaType,dimensions,originalPath})=>({occurrenceId,sha256,bytes,mediaType,dimensions,originalPath})):[];
  const packet=phasePacket(p,setup,reservation,call,`attempt-${call.id}`,{},o.f.snapshot,rows,attachments),target=packet.returnTargets[0].id;
  const checked=ids=>ids.map(obligationId=>({obligationId,status:'checked',evidence:[{targetId:target,observation:'s'}]}));
  const ids=predecessors.map(x=>x.id);let result;
  if(call.id==='owner:layoutProducer')result={kind:'layout_handoff',basisHash:hash(packet.basis),statement:'synthetic'};
  else if(call.id==='owner:finalConsumer')result={kind:'intake_accept',producerResultId:ids[0],basisHash:hash(packet.basis),checks:checked(['producer_original','source','manuscript','editions','restrictions','routing'])};
  else if(['primary','blind'].includes(call.phase))result={kind:'observation',packetId:call.packetId,coverage:checked(phaseObligations(call,o.full)),findings:[],limitations:[]};
  else if(call.phase.endsWith('_synthesis'))result={kind:'lane_synthesis',lane:call.phase.split('_')[0],originalResultIds:ids,coverage:checked(phaseObligations(call,o.full)),findingRefs:[],conflicts:[],conclusion:'clear'};
  else if(call.phase==='paired_challenge')result={kind:'paired_challenge',role:call.role,reviewedResultIds:ids,comparisons:ids.map(resultId=>({resultId,pointer:'/result',observation:'s'})),objections:[],conclusion:'no_objection'};
  else if(call.id==='director')result={kind:'director_disposition',reviewedResultIds:ids,dispositions:[],coverage:checked(phaseObligations(call,o.full)),outcome:{kind:'approve',itemRefs:[]}};
  else if(call.id==='owner:finalProducer')result={kind:'final_handoff',approvalId:reservation.approval.id,basisHash:hash(packet.basis),editionProofs:editionProofs(o.f.snapshot.editions.value),statement:'synthetic'};
  else result={kind:'delivery_accept',producerResultId:predecessors.find(x=>x.binding.callId==='owner:finalProducer').id,approvalId:reservation.approval.id,editionProofs:editionProofs(o.f.snapshot.editions.value),checks:checked(['producer_original','delivery_bytes','inventory','native','editable','import','render'])};
  for(const row of rows)assert.ok(Buffer.byteLength(row.reportBytes)<=row.slot.maxBytes,`${call.id} predecessor ${row.slot.producerCallId} ${Buffer.byteLength(row.reportBytes)} > ${row.slot.maxBytes}`);
  const built=buildFinalCodexInvocation({packetText:JSON.stringify(packet),adapterProtocol:FINAL_CODEX_PHASE_PROTOCOL});
  assert.ok(matches(result,built.request.outputSchema.properties.result),call.id);
  if(attachments.length){
   assert.equal(built.request.images[0].dimensions.evidenceIdentity,attachments[0].dimensions.evidenceIdentity);
   for(const change of [{boundSha256:'0'.repeat(64)},{boundBytes:attachments[0].bytes+1},{evidenceIdentity:''},{extra:'unbound'}]){
    const bad=structuredClone(packet);Object.assign(bad.attachments[0].dimensions,change);
    assert.throws(()=>buildFinalCodexInvocation({packetText:JSON.stringify(bad),adapterProtocol:FINAL_CODEX_PHASE_PROTOCOL}),e=>e.code==='FINAL_ATTACHMENT_REQUIRED');
   }
  }
  validatePhaseResult(result,{binding:packet.binding,basis:packet.basis,returnTargets:packet.returnTargets},call,o.full,predecessors,reservation);
  results.set(call.id,{id:`r${results.size}`,binding:packet.binding,report:{result}});
 }
 console.log(JSON.stringify({actualGraphCount:results.size,Krole:o.full.Krole,roles:[...new Set(o.full.calls.map(c=>c.role).filter(Boolean))],owners:o.full.calls.filter(c=>c.id.startsWith('owner:')).map(c=>c.id),phases:Object.fromEntries([...new Set(o.full.calls.map(c=>c.phase))].map(phase=>[phase,o.full.calls.filter(c=>c.phase===phase).length]))}));
});

test('synthetic challenge alias is unsupported',()=>{assert.throws(()=>finalCodexResultSchema({id:'challenge',phase:'challenge',role:'content'}),e=>e.code==='FINAL_PHASE_UNSUPPORTED');});
