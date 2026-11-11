import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {openStore} from './store.mjs';
import {createExecutor} from './executor.mjs';
import {releaseReadiness,ownerEdgeState,revisionPlan,revisionSources,applyCommand} from './project.mjs';
import {ownerHash,buildOwnerRequest,validateOwnerOutput} from './owner-edge.mjs';
import {prepareStrategy,syntheticOwnerOutput} from './owner-edge-fixtures.mjs';
async function fixture(t,options={}){const root=await mkdtemp('/private/tmp/owner-edge-test-'),store=openStore(join(root,'db'));t.after(async()=>{store.close();await rm(root,{recursive:true,force:true});});return prepareStrategy({store,root,...options});}
async function finishOwners(f){for(let i=0;i<5;i++){const jobs=await f.executor.advanceOwnerEdges('p');for(const id of jobs){const job=f.store.read('p').jobs.find(j=>j.id===id);if(job.purpose==='owner_acceptance'){const done=await f.executor.execute('p',id);assert.equal(done.status,'succeeded',JSON.stringify(done.error));}}}}
test('synthetic auto path has authentic fresh bilateral receipts, exact original bytes, inherited limits and one atomic copy job',async t=>{
 const f=await fixture(t);const request=f.request();await f.executor.continueStrategy('p',request);await finishOwners(f);
 let p=f.store.read('p'),edge=p.ownerEdges[0];assert.equal(p.ownerReports.length,2);assert.equal(ownerEdgeState(p,edge).status,'committed');assert.equal(p.jobs.filter(j=>j.stage==='copy').length,1);assert.equal(p.releases.filter(r=>r.artifactId===f.artifactId).length,1);
 assert.equal(edge.envelope.source.contentText,await readFile(p.artifacts.find(a=>a.id===f.artifactId).payloadRef,'utf8'));assert.equal(new Set(p.ownerReports.map(r=>r.executionReceipt.threadId)).size,2);
 const copy=p.jobs.find(j=>j.stage==='copy');assert.equal(copy.task.upstreamReviewConstraints[f.artifactId].reports.length,2);assert.ok(copy.task.upstreamReviewConstraints[f.artifactId].restrictions.some(r=>r.id==='no-preference'));
 await f.executor.continueStrategy('p',request);await f.executor.continueStrategy('p',f.request());f.executor=f.makeExecutor();await finishOwners(f);p=f.store.read('p');assert.equal(p.ownerEdges.length,1);assert.equal(p.ownerReports.length,2);assert.equal(p.jobs.filter(j=>j.stage==='copy').length,1);
 assert.throws(()=>f.executor.enqueue('p','copy'),{code:'OWNER_REQUIRED'});assert.equal(releaseReadiness(p,f.artifactId).eligible,true);
});
test('synthetic selected strategy human gate persists intent and pauses BEFORE both owners, then simulated adoption resumes',async t=>{
 const f=await fixture(t,{mode:'assisted',gates:['strategy']});const count=f.calls.length;
 const result=await f.executor.continueStrategy('p',f.request());assert.equal(result.blockedReason,'HUMAN_GATE');assert.equal(f.store.read('p').ownerEdges.length,0);assert.equal(f.store.read('p').ownerIntents.length,1);
 f.executor=f.makeExecutor();await finishOwners(f);assert.equal(f.calls.length,count);assert.equal(f.store.read('p').jobs.some(j=>j.purpose==='owner_acceptance'||j.stage==='copy'),false);
 f.send({kind:'adopt-creative',artifactId:f.artifactId,reason:'SYNTHETIC adoption for a local test, not a real user reply.'});await finishOwners(f);assert.equal(f.store.read('p').ownerReports.length,2);assert.equal(f.store.read('p').jobs.filter(j=>j.stage==='copy').length,1);
});
test('owner blocker remains immutable and enters typed-v3 actionable source-content correction',async t=>{
 const f=await fixture(t,{handler:(input,request,out)=>{if(input.envelope&&input.side==='producer')return {...out,decision:'blocked',unresolvedIssues:[{id:'strategy-body-risk',blocking:true,category:'creative',reason:'Clarify creative hypothesis in this actual body.',refs:[{location:'/envelope/source/content/strategy/answer/text',quote:input.envelope.source.content.strategy.answer.text}],returnTo:{artifactId:input.envelope.source.artifactId,responsibleRole:'strategy-lead',location:'/strategy/answer/text',quote:input.envelope.source.content.strategy.answer.text}}]};return out;}});
 await f.executor.continueStrategy('p',f.request());await finishOwners(f);const p=f.store.read('p');assert.equal(ownerEdgeState(p,p.ownerEdges[0]).status,'blocked');assert.equal(p.jobs.some(j=>j.stage==='copy'),false);
 const sources=revisionSources(p,f.artifactId),owner=sources.find(s=>s.kind==='owner_edge');assert.equal(owner.findings.length,1);assert.equal(owner.findings[0].originalValue.returnTo.location,'/strategy/answer/text');assert.ok(owner.constraints.length);assert.equal(revisionPlan(p,f.artifactId).sources.some(s=>s.kind==='owner_edge'),true);
 const changed=structuredClone(p),history=structuredClone(p.ownerReports);changed.policies.at(-1).mode='assisted';changed.policies.at(-1).humanGates=['strategy'];
 assert.equal(ownerEdgeState(changed,changed.ownerEdges[0]).status,'stale');
 assert.deepEqual(revisionSources(changed,f.artifactId).find(s=>s.kind==='owner_edge'),owner);assert.deepEqual(changed.ownerReports,history);
 const jobId=await f.executor.enqueueRevision('p',f.request());const job=f.store.read('p').jobs.find(j=>j.id===jobId);assert.equal(job.task.correctionInput.protocolVersion,'typed-revision-v3');assert.equal(job.task.correctionInput.sources.find(s=>s.kind==='owner_edge').ownerSource.envelopeHash,p.ownerEdges[0].envelope.envelopeHash);
});
test('binding change and modified source bytes prevent queued owner dispatch without another provider call',async t=>{
 const f=await fixture(t);await f.executor.continueStrategy('p',f.request());const p=f.store.read('p'),owner=p.jobs.find(j=>j.purpose==='owner_acceptance'),count=f.calls.length;
 const changed=createExecutor({store:f.store,rootDir:f.root,bindings:{...f.bindings,copy:{...f.bindings.copy,model:'different'}},providers:f.providers});const blocked=await changed.execute('p',owner.id);assert.equal(blocked.error.code,'OWNER_BINDING_CHANGED');assert.equal(f.calls.length,count);
 const g=await fixture(t);await g.executor.continueStrategy('p',g.request());const a=g.store.read('p').artifacts.find(a=>a.id===g.artifactId);await writeFile(a.payloadRef,'{}');const id=g.store.read('p').jobs.find(j=>j.purpose==='owner_acceptance').id;const before=g.calls.length;assert.equal((await g.executor.execute('p',id)).error.code,'ARTIFACT_INTEGRITY');assert.equal(g.calls.length,before);
});
test('report schema rejects title-only understanding, missing restrictions and invalid original return location',async t=>{
 const f=await fixture(t);await f.executor.continueStrategy('p',f.request());const job=f.store.read('p').jobs.find(j=>j.purpose==='owner_acceptance'),input=job.task.ownerInput,raw=syntheticOwnerOutput(buildOwnerRequest(input).packet);
 for(const mutate of [r=>r.understoodFindings[0].refs=[{location:'/envelope/source/content/title',quote:input.envelope.source.content.title}],r=>r.prohibitedInferences=[],r=>{r.decision='blocked';r.unresolvedIssues=[{id:'bad',blocking:true,category:'factual',reason:'bad target',refs:r.understoodFindings[0].refs,returnTo:{artifactId:f.artifactId,responsibleRole:'strategy-lead',location:'/content/strategy/answer/text',quote:'invented'}}];}]){const r=structuredClone(raw);mutate(r);assert.throws(()=>validateOwnerOutput(r,input));}
 const producer=raw,consumerInput={...input,side:'consumer',producerReport:producer},consumer=syntheticOwnerOutput(buildOwnerRequest(consumerInput).packet);consumer.restrictionDispositions.pop();assert.throws(()=>validateOwnerOutput(consumer,consumerInput));
});
test('synthetic blocker repair executes a real typed-v3 revision, independent handling/evidence/panel, fresh owners and complete copy',async t=>{
 let blockedOnce=false;
 const f=await fixture(t,{handler:(input,request,out)=>{
  if(input.envelope&&input.side==='producer'&&!blockedOnce){blockedOnce=true;return {...out,decision:'blocked',unresolvedIssues:[{id:'clarify-direction',blocking:true,category:'creative',reason:'Clarify this actual strategy expression.',refs:[{location:'/envelope/source/content/strategy/answer/text',quote:input.envelope.source.content.strategy.answer.text}],returnTo:{artifactId:input.envelope.source.artifactId,responsibleRole:'strategy-lead',location:'/strategy/answer/text',quote:input.envelope.source.content.strategy.answer.text}}]};}
  if(input.correctionInput&&!input.content){const revised=structuredClone(input.correctionInput.baseContent);revised.strategy.answer.text='Use an open place at a shared table as an invitation metaphor. This remains an untested creative hypothesis. Consumer preference is unknown.';revised.summary='A shared-table invitation metaphor, with explicit untested creative status.';return {...revised,strategyContractVersion:request.outputSchema.properties.strategyContractVersion.enum[0],strategyBasisHash:request.outputSchema.properties.strategyBasisHash.enum[0],claims:revised.claims.map(({verification,...c})=>c),revisionResponses:input.correctionInput.sources.flatMap(s=>s.findings).map(f=>({findingKey:f.key,action:'applied',explanation:'Clarified the proposed metaphor and retained unknown consumer preference.',outputLocations:[{location:'/strategy/answer/text',quote:revised.strategy.answer.text}]}))};}
  if(input.correctionInput&&input.content)return {protocolVersion:input.reviewProtocolVersion,artifactId:input.artifactId,contentHash:input.contentHash,sourceSetHash:input.correctionInput.sourceSetHash,contextHash:input.context.contextHash,preservationCheck:{status:'complete',constraintManifestHash:input.correctionInput.constraintManifestHash,violations:[]},findings:input.responses.map(r=>({findingKey:r.findingKey,status:'addressed',category:'correction',reason:'Clarified actual revised content and preserved every source limit.',refs:[{location:'/strategy/answer/text',quote:input.content.strategy.answer.text}]})),limitations:['Synthetic independent handling judgment, not real approval.']};
  return out;
 }});
 await f.executor.continueStrategy('p',f.request());await finishOwners(f);const original=structuredClone(f.store.read('p').ownerReports[0]);
 f.send({kind:'submit-feedback',artifactId:f.artifactId,feedbackId:'synthetic-human-revision',instructions:'Clarify the invitation metaphor while retaining uncertainty.',themes:[],materials:[]});
 const originalFeedback=structuredClone(f.store.read('p').humanFeedback[0]);
 const revision=await f.executor.enqueueRevision('p',f.request());assert.equal((await f.executor.execute('p',revision)).status,'succeeded');let p=f.store.read('p'),id=p.activeByStage.strategy;assert.notEqual(id,f.artifactId);assert.equal(releaseReadiness(p,id).blockedReasons[0],'CORRECTION_REVIEW_REQUIRED');
 const check=await f.executor.enqueueCorrectionReview('p',{artifactId:id,commandId:randomUUID(),expectedRevision:p.revision});const checked=await f.executor.execute('p',check);assert.equal(checked.status,'succeeded',JSON.stringify(checked.error));
 assert.equal((await f.executor.execute('p',await f.executor.enqueueVerification('p',id))).status,'succeeded');
 await f.executor.enqueueCreativePanel('p',{artifactId:id,commandId:randomUUID(),expectedRevision:f.store.read('p').revision});for(let i=0;i<8;i++){const jobs=f.executor.advanceCreativePanels('p');if(!jobs.length)break;for(const j of jobs)assert.equal((await f.executor.execute('p',j)).status,'succeeded');}
 await f.executor.continueStrategy('p',{artifactId:id,commandId:randomUUID(),expectedRevision:f.store.read('p').revision});await finishOwners(f);p=f.store.read('p');assert.deepEqual(p.ownerReports[0],original);const edge=p.ownerEdges.find(e=>e.envelope.source.artifactId===id);assert.equal(ownerEdgeState(p,edge).status,'committed');assert.equal(p.ownerReports.length,3);
 const copyId=edge.commit.jobId,copy=await f.executor.execute('p',copyId);assert.equal(copy.status,'succeeded',JSON.stringify(copy.error));const copyArtifact=f.store.read('p').artifacts.at(-1);assert.equal(copyArtifact.copyContract.status,'complete');
 const verification=await f.executor.enqueueVerification('p',copyArtifact.id),verificationJob=f.store.read('p').jobs.find(j=>j.id===verification);assert.ok(verificationJob.task.verificationInput.ownerConstraints[id].restrictions.some(r=>r.id==='no-preference'));const reviewed=await f.executor.execute('p',verification);assert.equal(reviewed.status,'succeeded',JSON.stringify(reviewed.error));
 assert.equal(f.store.read('p').humanFeedback.length,1);assert.deepEqual(f.store.read('p').humanFeedback[0],originalFeedback);assert.equal(f.store.read('p').decisions.some(d=>d.human),false);
});
test('synthetic HTTP persists the human pause, rejects injected owner outcomes, resumes after simulated user adoption and restarts without duplicate jobs',async t=>{
 const {createServer}=await import('./server.mjs'),{Readable}=await import('node:stream');
 const f=await fixture(t,{mode:'assisted',gates:['strategy']});let server=createServer({dbPath:join(f.root,'db'),rootDir:f.root,providers:f.providers,bindings:f.bindings,creativeCalibrations:f.creativeCalibrations});t.after(()=>server.emit('close'));
 const request=async(path,body)=>{const req=Readable.from([Buffer.from(body===undefined?'':JSON.stringify(body))]);Object.assign(req,{url:path,method:body===undefined?'GET':'POST',headers:{host:'127.0.0.1:4181','content-type':'application/json'}});return new Promise(resolve=>server.emit('request',req,{setHeader(){},writeHead(status){this.status=status;},end(payload){resolve({status:this.status,body:JSON.parse(String(payload))});}}));};
 const payload=f.request(),path='/api/projects/p/strategy-continuations';for(const extra of [{rawReport:{}},{accepted:true},{consumerBinding:{}},{skipHumanGate:true},{envelope:{}}])assert.equal((await request(path,{...payload,...extra})).status,400);
 assert.equal((await request(path,payload)).status,202);await server.drain();assert.equal(f.store.read('p').ownerEdges.length,0);assert.equal(f.store.read('p').ownerIntents.length,1);
 server.emit('close');await server.drain();server=createServer({dbPath:join(f.root,'db'),rootDir:f.root,providers:f.providers,bindings:f.bindings,creativeCalibrations:f.creativeCalibrations});await server.drain();assert.equal(f.store.read('p').ownerReports?.length??0,0);
 const humanResult=await request('/api/projects/p/commands',{kind:'adopt-creative',artifactId:f.artifactId,reason:'SYNTHETIC HTTP user adoption, not a real customer reply.',commandId:randomUUID(),expectedRevision:f.store.read('p').revision});assert.equal(humanResult.status,200,JSON.stringify(humanResult.body));await server.drain();
 const p=f.store.read('p');assert.equal(p.ownerReports.length,2);assert.equal(p.jobs.filter(j=>j.stage==='copy').length,1);assert.equal(p.artifacts.filter(a=>a.stage==='copy').length,1);const count=f.calls.length;
 assert.equal((await request(path,payload)).status,202);await server.drain();assert.equal(f.calls.length,count);assert.equal((await request('/api/projects/p')).body.view.ownerEdges[0].status,'committed');
});

test('synthetic stored-report boundary rejects missing outcomes, forged receipts, changed raw responses and reused provider thread',async t=>{
 const f=await fixture(t);await f.executor.continueStrategy('p',f.request());await finishOwners(f);const p=f.store.read('p');
 for(const mutate of [q=>q.ownerReports.shift(),q=>q.ownerReports[0].rawReport.permittedUses[0].text='Broadened',q=>q.ownerReports[0].executionReceipt.responseText='{}',q=>q.jobs.find(j=>j.id===q.ownerReports[0].jobId).attempts[0].receipt.inputPacketHash='0'.repeat(64),q=>{const r=q.ownerReports[0],a=q.jobs.find(j=>j.id===r.jobId).attempts[0];r.executionReceipt.threadId=q.artifacts.find(a=>a.id===f.artifactId).executionReceipt.threadId;a.receipt=structuredClone(r.executionReceipt);}]){
  const q=structuredClone(p);mutate(q);assert.equal(releaseReadiness(q,f.artifactId).eligible,false);assert.throws(()=>revisionSources(q,f.artifactId));
 }
});

test('synthetic new task, feedback, policy and source review generation block old queued owners before dispatch',async t=>{
 for(const change of ['task','feedback','policy','review']){
  const f=await fixture(t);await f.executor.continueStrategy('p',f.request());const job=f.store.read('p').jobs.find(j=>j.purpose==='owner_acceptance'),count=f.calls.length;
  if(change==='task')f.send({kind:'revise-task-card',taskCardId:'new-scope',brief:'A changed synthetic requirement.'});
  if(change==='feedback')f.send({kind:'submit-feedback',artifactId:f.artifactId,feedbackId:'new-feedback',instructions:'Revise this synthetic direction.',themes:[],materials:[]});
  if(change==='policy')f.send({kind:'set-policy',mode:'assisted',humanGates:['strategy']});
  if(change==='review')assert.equal((await f.executor.execute('p',await f.executor.enqueueVerification('p',f.artifactId))).status,'succeeded');
  const before=f.calls.length,result=await f.executor.execute('p',job.id);assert.equal(result.status,'blocked');assert.equal(f.calls.length,before);assert.equal(job.attempts.length,0);assert.ok(before>=count);
 }
});

test('synthetic uncertain owner dispatch remains awaiting reconciliation across restart and cannot be retried',async t=>{
 const f=await fixture(t,{handler:(input,request,out)=>{if(input.envelope)throw new Error('Synthetic unknown remote outcome.');return out;}});await f.executor.continueStrategy('p',f.request());const id=f.store.read('p').jobs.find(j=>j.purpose==='owner_acceptance').id;
 assert.equal((await f.executor.execute('p',id)).status,'awaiting_reconciliation');const count=f.calls.length;f.executor=f.makeExecutor();assert.equal((await f.executor.advanceOwnerEdges('p')).includes(id),false);await assert.rejects(()=>f.executor.execute('p',id,{retry:true}));assert.equal(f.calls.length,count);
});
test('synthetic independent copy evidence review receives all limits and blocks deliberately broadened preference',async t=>{
 const f=await fixture(t,{handler:(input,request,out)=>{
  if(request.outputSchema.properties.outputKind?.enum[0]==='copy')return {...out,summary:'Consumers prefer this packaging.',claims:[{text:'Consumers prefer this packaging.',kind:'fact',evidenceRefs:[],limitations:['No consumer study exists.']}]};
  if(input.ownerConstraints){assert.match(request.prompt,/enforce ALL frozen ownerConstraints/);const e=Object.values(input.ownerConstraints)[0];assert.ok(e.envelope.manifest.creativeReports.length);assert.ok(e.restrictions.some(r=>r.id==='no-preference'));return {...out,results:input.claimManifest.map(c=>({claimKey:c.claimKey,outcome:'unsupported',rationale:'Owner limits prohibit an untested consumer preference assertion.',citations:[],requirementRefs:[],limitations:['No external evidence supports preference.']}))};}
  return out;
 }});
 await f.executor.continueStrategy('p',f.request());await finishOwners(f);const edge=f.store.read('p').ownerEdges[0];assert.equal((await f.executor.execute('p',edge.commit.jobId)).status,'succeeded');const a=f.store.read('p').artifacts.at(-1),id=await f.executor.enqueueVerification('p',a.id);assert.equal((await f.executor.execute('p',id)).status,'succeeded');const report=f.store.read('p').verifications.at(-1);assert.equal(report.hasBlockingFindings,true);assert.equal(report.results[0].outcome,'unsupported');assert.equal(releaseReadiness(f.store.read('p'),a.id).eligible,false);
});

test('synthetic crash boundaries reuse completed owners and one atomic queued copy after restart',async t=>{
 const f=await fixture(t);const request=f.request();await f.executor.continueStrategy('p',request);f.executor=f.makeExecutor();let p=f.store.read('p'),producer=p.jobs.find(j=>j.purpose==='owner_acceptance');
 assert.equal((await f.executor.execute('p',producer.id)).status,'succeeded');f.executor=f.makeExecutor();let queued=await f.executor.advanceOwnerEdges('p');assert.equal(queued.length,1);const consumer=queued[0];assert.equal((await f.executor.execute('p',consumer)).status,'succeeded');
 f.executor=f.makeExecutor();const before=f.calls.length;queued=await f.executor.advanceOwnerEdges('p');assert.equal(queued.length,1);p=f.store.read('p');assert.equal(p.releases.filter(r=>r.artifactId===f.artifactId).length,1);assert.equal(p.jobs.find(j=>j.id===queued[0]).stage,'copy');
 f.executor=f.makeExecutor();assert.deepEqual(await f.executor.advanceOwnerEdges('p'),queued);assert.equal(f.calls.length,before);assert.equal((await f.executor.execute('p',queued[0])).status,'succeeded');assert.equal(f.store.read('p').artifacts.filter(a=>a.stage==='copy').length,1);assert.equal(f.store.read('p').ownerReports.length,2);
});

test('synthetic owner provider blocked error after dispatch is uncertain and never becomes safely retryable',async t=>{
 const f=await fixture(t,{handler:(input,request,out)=>{if(input.envelope)throw Object.assign(new Error('Synthetic remote blocked response after dispatch.'),{code:'PROVIDER_MISSING',status:'blocked'});return out;}});await f.executor.continueStrategy('p',f.request());const id=f.store.read('p').jobs.find(j=>j.purpose==='owner_acceptance').id;
 const result=await f.executor.execute('p',id);assert.equal(result.status,'awaiting_reconciliation');assert.equal(result.attempts[0].dispatchStarted,true);const count=f.calls.length;await f.executor.advanceOwnerEdges('p');await assert.rejects(()=>f.executor.execute('p',id,{retry:true}));assert.equal(f.calls.length,count);
});
test('synthetic source file mutation during an owner call preserves the raw receipt and prevents acceptance',async t=>{
 let storeRef;
 const f=await fixture(t,{handler:async(input,request,out)=>{if(input.envelope){const a=storeRef.read('p').artifacts.find(a=>a.id===input.envelope.source.artifactId);await writeFile(a.payloadRef,'{}');}return out;}});storeRef=f.store;
 await f.executor.continueStrategy('p',f.request());const id=f.store.read('p').jobs.find(j=>j.purpose==='owner_acceptance').id,result=await f.executor.execute('p',id);assert.equal(result.status,'awaiting_reconciliation');assert.equal(result.error.code,'ARTIFACT_INTEGRITY');assert.ok(result.attempts[0].receipt.responseText);assert.equal(f.store.read('p').ownerReports.length,0);assert.equal(f.store.read('p').jobs.some(j=>j.stage==='copy'),false);
});


test('synthetic recomputed substitute owner invocation cannot authorize release or correction sources',async t=>{
 const f=await fixture(t);await f.executor.continueStrategy('p',f.request());await finishOwners(f);const pristine=f.store.read('p');
 const hash=x=>createHash('sha256').update(x).digest('hex');
 const p=structuredClone(pristine);const envelope=structuredClone(p.ownerEdges[0].envelope);envelope.source.content.strategy.answer.text='ATTACKER substituted strategy body, never delivered.';delete envelope.envelopeHash;envelope.envelopeHash=ownerHash(envelope);
 let producer;
 for(const report of p.ownerReports){
  const job=p.jobs.find(j=>j.id===report.jobId),attempt=job.attempts.find(a=>a.id===report.attemptId);
  job.task.ownerInput.envelope=structuredClone(envelope);
  if(job.side==='consumer')job.task.ownerInput.producerReport=structuredClone(producer);
  const raw=structuredClone(report.rawReport);raw.envelopeHash=envelope.envelopeHash;raw.understoodFindings[0].refs[0].quote=envelope.source.content.strategy.answer.text;
  raw.prohibitedInferences[0].text='Attacker removed original factual restriction.';
  if(job.side==='consumer')raw.restrictionDispositions.find(d=>d.restrictionId==='no-preference').text=raw.prohibitedInferences[0].text;
  if(job.side==='producer')producer=structuredClone(raw);
  const request=buildOwnerRequest(job.task.ownerInput),receipt=structuredClone(report.executionReceipt);
  receipt.responseText=JSON.stringify(raw);receipt.parsedOutput=structuredClone(raw);receipt.inputPacketHash=hash(JSON.stringify({runId:attempt.id,model:job.binding.model,prompt:request.prompt,outputSchema:request.outputSchema}));receipt.validatedOutputHash=hash(JSON.stringify(raw,null,2));
  for(const k of Object.keys(receipt.providerExecution??{}))receipt.providerExecution[k]=structuredClone(receipt[k]);
  Object.assign(report,structuredClone(raw),{rawReport:raw,reportHash:hash(JSON.stringify(raw,null,2)),executionReceipt:receipt});attempt.receipt=structuredClone(receipt);
 }
 assert.equal(releaseReadiness(p,f.artifactId).eligible,false);
 assert.throws(()=>applyCommand(p,{kind:'release-stage',artifactId:f.artifactId,commandId:randomUUID(),expectedRevision:p.revision},f.human),{code:'INVALID_OWNER_EDGE'});
 assert.throws(()=>revisionSources(p,f.artifactId),{code:'INVALID_OWNER_EDGE'});
 assert.deepEqual(p.ownerEdges,pristine.ownerEdges);assert.deepEqual(p.artifacts,pristine.artifacts);
});
test('synthetic stored owner reports require their exact registered edge, side, source and producer report',async t=>{
 const f=await fixture(t);await f.executor.continueStrategy('p',f.request());await finishOwners(f);const pristine=f.store.read('p');
 for(const mutate of [q=>q.ownerReports[0].edgeId='another-edge',q=>q.ownerReports[0].artifactId='another-source',q=>q.jobs.find(j=>j.id===q.ownerReports[0].jobId).targetArtifactId='another-source',q=>q.jobs.find(j=>j.id===q.ownerReports[1].jobId).task.ownerInput.producerReport.permittedUses[0].text='Substituted producer permission']){
  const q=structuredClone(pristine);mutate(q);assert.equal(releaseReadiness(q,f.artifactId).eligible,false);assert.throws(()=>revisionSources(q,f.artifactId));
 }
});

test('inherited conditional research prohibition remains an operative owner restriction and cannot be widened',async t=>{
 const f=await fixture(t);await f.executor.continueStrategy('p',f.request());
 const original=f.store.read('p').ownerEdges[0].envelope,{envelopeHash,...body}=structuredClone(original);
 const restriction={originKey:'trien-origin',sourceKey:'readiness:original',material:'Visual and chronology material remains missing.',permittedUse:'Attributed combination exploration.',prohibitedUse:'Do not rank appearance or chronology.',activationCondition:'Actual appearance or chronology comparison.',returnStage:'research'};
 const data={...body,researchRestrictionManifest:[restriction],researchRestrictionManifestHash:'synthetic-manifest'},envelope={...data,envelopeHash:ownerHash(data)},input={envelope,side:'producer',producerReport:null},request=buildOwnerRequest(input),output=syntheticOwnerOutput(request.packet);
 const missing=structuredClone(output);missing.restrictionDispositions=missing.restrictionDispositions.filter(d=>d.restrictionId!=='research:trien-origin');assert.throws(()=>validateOwnerOutput(missing,input),/Every producer restriction/);
 assert.equal(validateOwnerOutput(output,input).decision,'accept');
 output.restrictionDispositions.find(d=>d.restrictionId==='research:trien-origin').text='Appearance ranking is allowed.';
 assert.throws(()=>validateOwnerOutput(output,input),/omit or widen/);
});
