import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {numericFixture} from './research-numeric-fixture.mjs';
import {acceptedOperatorResearch,releaseRequest,human} from './research-operator-fixture.mjs';
import {requireResearchChartAdmission,releaseReadiness,applyCommand} from './project.mjs';
import {researchChartRestrictions} from './research-chart-data.mjs';
for(const swap of [false,true])test(`actual numerical research production, v4 semantic review and authority swap=${swap}`,async t=>{
 const f=await numericFixture({swap});t.after(f.close);
 const job=await f.executor.execute('p',f.executor.enqueue('p','research',{sourceRecords:[f.source]}));assert.equal(job.status,'succeeded',JSON.stringify(job.error));
 const a=f.store.read('p').artifacts[0];f.artifact=a;
 assert.equal(a.researchData.version,'research-data-v2');assert.deepEqual(JSON.parse(await readFile(a.payloadRef,'utf8')).chartData,f.raw);assert.ok(a.claims.every(c=>c.verification==='pending'));
 const verification=await f.executor.execute('p',await f.executor.enqueueVerification('p',a.id));assert.equal(verification.status,'succeeded',JSON.stringify(verification.error));
 const p=f.store.read('p'),report=p.verifications[0];assert.equal(report.rawReport.protocolVersion,'excerpt-support-v4');assert.equal(report.rawReport.quantitativeResults.length,48);assert.equal(report.rawReport.hasBlockingFindings,undefined);assert.deepEqual(verification.task.verificationInput.taskCard,p.taskCards[0]);
 if(swap){const adopted=applyCommand(p,{kind:'adopt-creative',artifactId:a.id,reason:'Synthetic human preference cannot verify numbers.',commandId:'adopt-unsupported',expectedRevision:p.revision},{...human,actorId:'different-human',runId:'adoption-run',contextId:'adoption-context'});assert.equal(releaseReadiness(adopted,a.id).eligible,false);assert.ok(adopted.artifacts[0].claims.every(c=>c.verification==='pending'));assert.equal(releaseReadiness(p,a.id).eligible,false);assert.throws(()=>requireResearchChartAdmission(p,a.id));assert.ok(report.rawReport.quantitativeResults.some(r=>r.outcome==='unsupported'));return;}
 const ready=await f.executor.execute('p',await f.executor.enqueueReadiness('p',a.id,{protocolVersion:'research-readiness-v2'}));assert.equal(ready.status,'succeeded',JSON.stringify(ready.error));
 await acceptedOperatorResearch(f);await f.executor.releaseResearch('p',releaseRequest(f),human);
 const current=f.store.read('p'),admission=requireResearchChartAdmission(current,a.id,[{artifactId:a.id,contentText:await readFile(a.payloadRef,'utf8')}]);
 assert.equal(admission.charts.length,3);assert.deepEqual(admission.raw,f.raw);assert.equal(admission.authority.handoffs.length,2);assert.equal(admission.authority.releases.length,1);assert.ok(researchChartRestrictions(admission).some(r=>r.text.includes('No business conclusion')));
 for(const mutate of [q=>q.taskCards[0].createdBy='changed',q=>q.jobs[0].task.sourceRecords[0].text+='tampered',q=>q.artifacts[0].researchData.catalogDigest='0'.repeat(64),q=>q.verifications[0].rawReport.quantitativeResults[0].outcome='unsupported',q=>q.handoffReports[0].rawReport.limitations.push('new restriction'),q=>q.releases=[]]){const q=structuredClone(current);mutate(q);assert.throws(()=>requireResearchChartAdmission(q,a.id));}
 const q=structuredClone(current);assert.throws(()=>applyCommand(q,{kind:'request-stage',stage:'research',jobId:'downgrade',binding:job.binding,task:{id:'downgrade',owner:'research-lead',parentId:'p',sourceRecords:[f.source],visualCatalogue:[]},commandId:'downgrade',expectedRevision:q.revision},human),{code:'RESEARCH_V2_REQUIRED'});
});

test('ordinary numerical original bytes, direct completion and reconciliation are bound to exact provider output',async t=>{
 const {verifyStageOriginal}=await import('./stage-original.mjs');
 const f=await numericFixture();t.after(f.close);
 const originalCommand=f.store.command.bind(f.store);let intercepted=0;
 f.store.command=(id,command,context)=>{
  if(command.kind==='complete-stage'){
   const before=f.store.read(id);
   for(const mutation of [{...command,contentHash:'0'.repeat(64)},{...command,technicalReceipts:{...command.technicalReceipts,sourceCatalogue:{version:1,records:[]}}},{...command,executionReceipt:{...command.executionReceipt,inputPacketHash:'0'.repeat(64)}}]){assert.throws(()=>originalCommand(id,mutation,context));assert.deepEqual(f.store.read(id),before);}
   intercepted++;
  }
  return originalCommand(id,command,context);
 };
 const job=await f.executor.execute('p',f.executor.enqueue('p','research',{sourceRecords:[f.source]}));assert.equal(job.status,'succeeded',JSON.stringify(job.error));assert.equal(intercepted,1);
 const a=f.store.read('p').artifacts[0];const proof=await verifyStageOriginal(f.store.read('p'),a,{executionRoot:f.root});assert.deepEqual(proof.projection.chartData,f.raw);
 const {writeFile}=await import('node:fs/promises');await writeFile(a.executionReceipt.paths.output,'{}');await assert.rejects(()=>verifyStageOriginal(f.store.read('p'),a,{executionRoot:f.root}));
});

test('saved numerical response reconciles without provider calls and still requires exact normalized bytes',async t=>{
 const f=await numericFixture();t.after(f.close);const originalCommand=f.store.command.bind(f.store);
 f.store.command=(id,command,context)=>{if(command.kind==='complete-stage')throw Object.assign(new Error('Synthetic interrupted validator completion'),{code:'INVALID_STAGE_OUTPUT'});return originalCommand(id,command,context);};
 const job=await f.executor.execute('p',f.executor.enqueue('p','research',{sourceRecords:[f.source]}));assert.equal(job.status,'awaiting_reconciliation');f.store.command=originalCommand;
 const before=f.calls.length,recovered=await f.executor.reconcile('p',job.id,{commandId:'recover-numeric',expectedRevision:f.store.read('p').revision,reason:'Recover the saved exact numerical response.'});assert.equal(recovered.status,'succeeded');assert.equal(f.calls.length,before);
 const a=f.store.read('p').artifacts[0];assert.equal(a.researchData.version,'research-data-v2');assert.deepEqual(JSON.parse(await readFile(a.payloadRef,'utf8')).chartData,f.raw);
});

test('actual numeric correction preserves original unsupported findings, regenerates source bindings and receives fresh v4 review',async t=>{
 const f=await numericFixture({swap:true});t.after(f.close);
 const initial=await f.executor.execute('p',f.executor.enqueue('p','research',{sourceRecords:[f.source]}));assert.equal(initial.status,'succeeded');
 const old=f.store.read('p').artifacts[0];assert.equal((await f.executor.execute('p',await f.executor.enqueueVerification('p',old.id))).status,'succeeded');
 const oldReport=f.store.read('p').verifications[0],revisionId=await f.executor.enqueueRevision('p',{artifactId:old.id,commandId:'numerical-correction',expectedRevision:f.store.read('p').revision}),revised=await f.executor.execute('p',revisionId);assert.equal(revised.status,'succeeded',JSON.stringify(revised.error));
 const now=f.store.read('p'),a=now.artifacts.at(-1);assert.notEqual(a.contentHash,old.contentHash);assert.equal(revised.task.researchContractVersion,'research-data-v2');assert.deepEqual(now.verifications[0],oldReport);assert.ok(revised.task.correctionInput.sources.flatMap(s=>s.findings).some(f=>f.location.startsWith('/quantitativeResults/')));
 const verified=await f.executor.execute('p',await f.executor.enqueueVerification('p',a.id));assert.equal(verified.status,'succeeded',JSON.stringify(verified.error));assert.ok(f.store.read('p').verifications.at(-1).rawReport.quantitativeResults.every(r=>r.outcome==='supported_association'));
 const {verifyResearchDataOriginal}=await import('./stage-original.mjs');await verifyResearchDataOriginal(f.store.read('p'),a,{executionRoot:f.root});assert.equal(releaseReadiness(f.store.read('p'),a.id).eligible,false,'Fresh ordinary support does not replace missing independent correction/readiness/owner authority.');
});
