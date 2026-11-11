import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {readFile} from 'node:fs/promises';
import {createServer} from './server.mjs';
import {numericFixture,hash} from './research-numeric-fixture.mjs';
import {requireResearchChartAdmission,ownerEdgeState} from './project.mjs';
import {researchChartRestrictions} from './research-chart-data.mjs';

test('HTTP numerical research through v4, readiness, dual owners, release, strategy panel, dual owners and copy survives restart without calls',async t=>{
 const f=await numericFixture({compact:true});let app;
 const open=async()=>{app=createServer({dbPath:join(f.root,'db'),rootDir:f.root,port:0,bindings:f.bindings,providers:f.providers,creativeCalibrations:f.creativeCalibrations,imageProvider:null});await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));};
 const close=()=>new Promise(resolve=>app.close(resolve));
 await open();t.after(async()=>{await close();await f.close();});
 const request=async(path,body)=>{const response=await fetch(`http://127.0.0.1:${app.address().port}/api/projects/p${path}`,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const value=await response.json();assert.ok(response.ok,JSON.stringify(value));return value;};
 const p=()=>f.store.read('p');
 const command=extra=>({commandId:crypto.randomUUID(),expectedRevision:p().revision,...extra});
 const queued=await request('/jobs',command({stage:'research',sourceRecords:[Object.fromEntries(Object.entries(f.source).filter(([key])=>key!=='verification'))]}));await app.drain();
 const job=p().jobs.find(j=>j.id===queued.jobId);assert.equal(job.status,'succeeded',JSON.stringify(job.error));const a=p().artifacts[0];
 await request('/verifications',command({artifactId:a.id}));await app.drain();assert.equal(p().verifications[0].rawReport.protocolVersion,'excerpt-support-v4');
 await request('/readiness',command({artifactId:a.id,protocolVersion:'research-readiness-v2'}));await app.drain();
 for(const side of ['research_owner','strategy_owner']){const view=(await request('')).view.researchWorkflow;await request('/research-handoffs',command({artifactId:a.id,contentHash:a.contentHash,basisHash:view.basisHash,input:{side,decision:side==='research_owner'?'delivered':'accepted',permittedUses:['Explore blue.'],prohibitedInferences:['No preference claim.','No manufactured approval.'],unresolvedIssues:[],note:'Synthetic local owner declaration only.'}}));await app.drain();}
 const view=(await request('')).view.researchWorkflow;await request('/research-release',command({artifactId:a.id,contentHash:a.contentHash,basisHash:view.basisHash,policyVersion:p().policies.at(-1).version}));
 const admission=requireResearchChartAdmission(p(),a.id),continuation=command({artifactId:a.id,policyVersion:p().policies.at(-1).version});
 await request('/continuations',continuation);await app.drain();
 const strategy=p().artifacts.find(a=>a.stage==='strategy');assert.ok(strategy,JSON.stringify(p().jobs.at(-1).error));
 const strategyJob=p().jobs.find(j=>j.outputVersionIds?.includes(strategy.id));assert.deepEqual(strategyJob.task.strategyBasis.researchChartAdmission,admission);
 await request('/verifications',command({artifactId:strategy.id}));await app.drain();
 await request('/creative-panels',command({artifactId:strategy.id}));await app.drain();
 const strategyContinue=command({artifactId:strategy.id});await request('/strategy-continuations',strategyContinue);await app.drain();
 const final=p(),edge=final.ownerEdges[0];assert.ok(edge,JSON.stringify(final.jobs.at(-1).error));assert.equal(ownerEdgeState(final,edge).status,'committed',JSON.stringify(final.jobs.filter(j=>j.status!=='succeeded').map(j=>j.error)));
 const copy=final.artifacts.find(a=>a.stage==='copy');assert.ok(copy,JSON.stringify(final.jobs.at(-1).error));assert.equal(copy.copyContract.status,'complete');
 assert.deepEqual(edge.envelope.researchChartAdmissions,[admission]);
 for(const report of final.ownerReports)for(const restriction of researchChartRestrictions(admission))assert.ok(report.rawReport[restriction.kind].some(r=>r.id===restriction.id&&r.text===restriction.text));
 const copyCall=f.calls.find(c=>c.request.outputSchema.properties.outputKind?.enum[0]==='copy');assert.deepEqual(copyCall.input.inputArtifacts[0].reviewConstraints.envelope.researchChartAdmissions,[admission]);assert.equal(hash(await readFile(a.payloadRef)),a.contentHash);
 const before=f.calls.length,copyCount=final.jobs.filter(j=>j.stage==='copy').length;await close();await open();await request('/continuations',continuation);await request('/strategy-continuations',strategyContinue);await app.drain();assert.equal(f.calls.length,before);assert.equal(p().jobs.filter(j=>j.stage==='copy').length,copyCount);assert.deepEqual(requireResearchChartAdmission(p(),a.id),admission);
});
