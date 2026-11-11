import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {createResearchService} from './research-service.mjs';
import {createExecutor} from './executor.mjs';
import {openStore} from './store.mjs';
import {bindings as originalBindings,providerSet,human,source} from './research-operator-fixture.mjs';
import {diskReceipt} from './selected-stage-fixture.mjs';
import {revisionPlan,validateStoredReview} from './project.mjs';
import {verifyReviewOriginal} from './review-original.mjs';
import {correctionFindingCreative,correctionSources} from './correction.mjs';
import {verifyResearchReaderOriginal} from './research-reader-original.mjs';
import {researchReaderCoverage} from './research-reader-state.mjs';
import {verifyCurrentResearchReaders} from './research-reader-workflow.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const dimensions=['market','audience','competition','product','carrier','synthesis'];
function readerAnswer(p){
 const locations=[{location:'/summary',quote:source.text}];
 return {protocolVersion:'research-reader-loop-v1',packetHash:p.packetHash,phase:p.phase,retellings:dimensions.map(dimension=>({dimension,understanding:'仅有合成蓝色产品资料，没有真实人群、需求或竞争证据。',classification:'mixed',locations})),answers:p.questionRegistration.questions.map(q=>({questionId:q.id,status:'unresolved',answer:'合成原文仅说明蓝色，不能证明购买偏好。',locations})),connections:[{dimensions:['product','audience'],explanation:'产品颜色事实不能证明人群喜欢。',strategyConstraint:'不能预选受欢迎的风格。',limitations:'合成工程测试，真实偏好未知。',locations}],issues:[{id:'clarity',type:'understanding',severity:'major',questionIds:['q1'],detail:'产品事实与人群推断的连接需要明确。',locations}],rechecks:[],limitations:['Synthetic engineering reader; no consumer or human approval.']};
}
async function fixture(t){
 const readerCount=1;
 const root=await realpath(await mkdtemp(join(tmpdir(),'reader-service-')));let store=openStore(join(root,'db'));const calls=[];
 t.after(async()=>{store.close();await rm(root,{recursive:true,force:true});});
 store.create({id:'new',name:'Synthetic reader wiring only',brief:'只核对合成蓝色产品，不推断真实购买偏好。',mode:'auto',humanGates:[],workflowVersion:'proposal-seven-v1'},human);
 store.command('new',{kind:'confirm-task-card',taskCardId:'new:scope:1',commandId:'confirm',expectedRevision:0},human);
 store.command('new',{kind:'register-research-source',source:{title:'Synthetic source',publisher:'Engineering test',url:source.url,excerpt:source.text,intendedUse:'category',attachToClaimId:null},commandId:'source',expectedRevision:1},human);
 const sourceId=store.read('new').sourceEntries[0].id;
 const providers=providerSet(calls,(result,request)=>{const output=structuredClone(result.parsedOutput);
  if(request.outputSchema.properties.revisionResponses){const marker='\nUNTRUSTED_JSON_DATA\n',start=request.prompt.lastIndexOf(marker),end=request.prompt.lastIndexOf('\nEND_UNTRUSTED_JSON_DATA'),input=JSON.parse(request.prompt.slice(start+marker.length,end));
   output.title='合成研究修订';output.summary=source.text+' 这不能证明人群购买偏好。';output.sections[0].body=output.summary;
   output.revisionResponses=input.correctionInput.sources.flatMap(s=>s.findings.map(f=>({findingKey:f.key,action:'applied',explanation:'将事实与偏好的边界写入实际正文。',outputLocations:[{location:'/summary',quote:'这不能证明人群购买偏好。'}]})));
  }
  const responseText=JSON.stringify(output).replaceAll('s1',sourceId);return {...result,responseText,parsedOutput:JSON.parse(responseText)};},root);
 providers.reader={model:'synthetic',async execute(request){calls.push({id:'reader',request});const parsedOutput=readerAnswer(request.packet);if(request.packet.phase==='recheck'){parsedOutput.answers.forEach(a=>{a.status='answered';a.answer='修订正文明确：这不能证明人群购买偏好。';});parsedOutput.issues=[];parsedOutput.rechecks=request.packet.previous.issues.map(i=>({issueId:i.id,status:'resolved',explanation:'独立读取新版明确边界后，原理解歧义已修正；不代表事实或偏好被证明。',locations:[{location:'/summary',quote:'这不能证明人群购买偏好。'}]}));}return diskReceipt(root,request,{runId:request.runId,model:'synthetic',requestedModel:'synthetic',threadId:`reader-${request.runId}`,inputPacketHash:sha(JSON.stringify({runId:request.runId,model:'synthetic',prompt:request.prompt,outputSchema:request.outputSchema})),exitCode:0,responseText:JSON.stringify(parsedOutput),parsedOutput});}};
 const bindings={...originalBindings,reader:{providerId:'reader',model:'synthetic',role:'independent-research-reader'}};
 const make=()=>createResearchService({store,rootDir:root,bindings,providers,executionAllowed:true});let service=make();
 const {registrationId}=service.registerQuestions('new',{questions:[{id:'q1',question:'本品颜色事实能证明人群喜欢吗？',critical:true}],readerCount,commandId:'questions',expectedRevision:2},human);
 const receipt=await service.generate('new',{commandId:'generate',expectedRevision:store.read('new').revision,sourceEntryIds:[sourceId]});
 assert.equal(store.read('new').jobs.find(j=>j.id===receipt.jobId).status,'succeeded',JSON.stringify(store.read('new').jobs));
 const artifactId=store.read('new').activeByStage.research;
 return {root,store,bindings,providers,registrationId,artifactId,service,request:()=>({artifactId,registrationId,seat:0,commandId:'read',expectedRevision:store.read('new').revision})};
}
test('actual saved reader findings enter typed correction and the existing revision enqueue path',async t=>{
 const f=await fixture(t);await f.service.readReport('new',f.request());const p=f.store.read('new'),report=p.researchReaderReports[0];
 const checked=validateStoredReview(p,'research_reader',report);assert.equal(checked.source.protocolVersion,'research-reader-loop-v1');
 const original=await verifyReviewOriginal(p,'research_reader',report,{executionRoot:f.root});assert.equal(original.identity.reportId,report.id);
 const plan=revisionPlan(p,f.artifactId),reader=plan.sources.find(s=>s.kind==='research_reader');
 assert.equal(reader.findings.length,2);assert.deepEqual(reader.findings.map(f=>f.location),['/issues/0','/answers/0']);
 assert.ok(reader.constraints.some(c=>c.location==='/retellings/0'));assert.ok(reader.constraints.some(c=>c.location==='/connections/0'));assert.ok(reader.constraints.some(c=>c.location==='/limitations/0'));
 for(const finding of reader.findings)assert.equal(correctionFindingCreative(plan.sources,finding.key),false);
 const executor=createExecutor({store:f.store,rootDir:f.root,bindings:f.bindings,providers:f.providers});
 const id=await executor.enqueueRevision('new',{artifactId:f.artifactId,commandId:'revise',expectedRevision:p.revision});
 const job=f.store.read('new').jobs.find(j=>j.id===id);assert.equal(job.status,'queued');assert.ok(job.task.correctionInput.sources.some(s=>s.reportId===report.id));assert.equal(job.task.researchQuestionRegistrationId,f.registrationId);
 const disk=await readFile(report.payloadRef);await writeFile(report.payloadRef,'{}');await assert.rejects(verifyReviewOriginal(f.store.read('new'),'research_reader',report,{executionRoot:f.root}),{code:'RESEARCH_READER_ORIGINAL_CHANGED'});await writeFile(report.payloadRef,disk);
});
test('reader correction rejects mutated source, target and normalized projection',async t=>{
 const f=await fixture(t);await f.service.readReport('new',f.request());const p=f.store.read('new');
 for(const mutate of [r=>{r.issues[0].detail='forged';},r=>{r.artifactId='another-artifact';},r=>{r.rawReport.answers[0].status='answered';}]){const copy=structuredClone(p);mutate(copy.researchReaderReports[0]);assert.throws(()=>revisionPlan(copy,f.artifactId));}
 const checked=validateStoredReview(p,'research_reader',p.researchReaderReports[0]),source=checked.source;
 const positive=structuredClone(source);positive.validatedReport.answers[0].status='answered';positive.validatedReport.rechecks=[{issueId:'old',status:'unresolved',explanation:'not resolved',locations:positive.validatedReport.issues[0].locations}];
 const normalized=correctionSources([positive])[0];assert.ok(normalized.constraints.some(c=>c.location==='/answers/0'));assert.ok(normalized.findings.some(c=>c.location==='/rechecks/0'));
});

test('actual research revision and located dispositions produce an independent same-version recheck',async t=>{
 const f=await fixture(t);await f.service.readReport('new',f.request());const before=f.store.read('new'),old=before.researchReaderReports[0];
 assert.equal(old.eligibility.understandingComplete,false);
 const executor=createExecutor({store:f.store,rootDir:f.root,bindings:f.bindings,providers:f.providers});
 const revisionId=await executor.enqueueRevision('new',{artifactId:f.artifactId,commandId:'actual-revision',expectedRevision:before.revision});
 const revised=await executor.execute('new',revisionId);assert.equal(revised.status,'succeeded',JSON.stringify(revised.error));
 const p=f.store.read('new'),artifactId=p.activeByStage.research;assert.notEqual(artifactId,f.artifactId);assert.equal(p.artifacts.find(a=>a.id===artifactId).revision.revisionOf.artifactId,f.artifactId);
 await assert.rejects(f.service.readReport('new',{artifactId,registrationId:f.registrationId,seat:0,commandId:'skip-recheck',expectedRevision:p.revision}),{code:'READER_RECHECK_REQUIRED'});
 const dispositions=[{issueId:'clarity',action:'clarified',response:'新版已写明颜色事实不能证明人群偏好。',locations:[{location:'/summary',quote:'这不能证明人群购买偏好。'}]}];
 const {dispositionId}=await f.service.disposeReader('new',{artifactId,previousReportId:old.id,dispositions,commandId:'dispositions',expectedRevision:f.store.read('new').revision},human);
 const receipt=await f.service.readReport('new',{artifactId,registrationId:f.registrationId,seat:0,previousReportId:old.id,dispositionId,commandId:'recheck',expectedRevision:f.store.read('new').revision});
 const after=f.store.read('new'),job=after.jobs.find(j=>j.id===receipt.jobId);assert.equal(job.status,'succeeded',JSON.stringify(job.error));assert.equal(after.researchReaderReports.length,2);
 const report=after.researchReaderReports.at(-1);assert.equal(report.phase,'recheck');assert.equal(report.eligibility.understandingComplete,true);assert.equal(report.eligibility.factualSufficiencyVerified,false);assert.equal(report.eligibility.humanApproval,false);
 assert.notEqual(old.executionReceipt.threadId,report.executionReceipt.threadId);assert.equal(researchReaderCoverage(after).understandingComplete,true);
 const proof=await verifyResearchReaderOriginal(after,report,{executionRoot:f.root,current:true});assert.equal(proof.current,true);assert.equal((await verifyResearchReaderOriginal(after,old,{executionRoot:f.root})).current,false);
 const originals=await verifyCurrentResearchReaders(after,{executionRoot:f.root});assert.equal(originals.originals.length,1);
 const beforeDamage=await f.service.workflowSnapshot(after);assert.equal(beforeDamage.checks.find(c=>c.id==='reader_loop').passed,true,'Actual current recheck plus original files qualifies only the reader check');
 const oldBytes=await readFile(old.payloadRef);await writeFile(old.payloadRef,'{}');await assert.rejects(verifyCurrentResearchReaders(after,{executionRoot:f.root}),{code:'RESEARCH_R7_READER_ORIGINAL_REQUIRED'});const damaged=await f.service.workflowSnapshot(after);assert.equal(damaged.checks.find(c=>c.id==='reader_loop').passed,false);assert.equal(damaged.canRelease.allowed,false);await writeFile(old.payloadRef,oldBytes);
 assert.equal(f.service.workflow('new').canRelease.allowed,false,'Understanding alone never waives facts, owner acceptance or human release');
});
