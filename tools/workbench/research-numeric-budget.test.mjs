import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {stat,readFile} from 'node:fs/promises';
import {numericFixture} from './research-numeric-fixture.mjs';
import {openStore} from './store.mjs';
import {validateResearchChartCandidate} from './research-chart-data.mjs';
import {validateStageOutput} from './stage-content.mjs';

test('actual maximum eight charts, 200 cells and 568 assertions fit provider and durable verification',async t=>{
 const f=await numericFixture({budget:true});t.after(f.close);
 const job=await f.executor.execute('p',f.executor.enqueue('p','research',{sourceRecords:[f.source]}));assert.equal(job.status,'succeeded',JSON.stringify(job.error));
 const a=f.store.read('p').artifacts[0],loaded=JSON.parse(await readFile(a.payloadRef,'utf8')),candidate=validateResearchChartCandidate(loaded,job.task.researchDataBasis);
 assert.equal(candidate.validated.charts.length,8);assert.equal(candidate.manifest.filter(a=>a.kind==='cell').length,200);assert.equal(candidate.manifest.length,568);
 const verification=await f.executor.execute('p',await f.executor.enqueueVerification('p',a.id));assert.equal(verification.status,'succeeded',JSON.stringify(verification.error));assert.equal(f.store.read('p').verifications[0].rawReport.quantitativeResults.length,568);
 const call=f.calls.at(-1);assert.ok(Buffer.byteLength(call.request.prompt)<8*1024*1024);assert.ok(Buffer.byteLength(verification.attempts[0].receipt.responseText)<2*1024*1024);t.diagnostic(JSON.stringify({charts:8,cells:200,assertions:568,sourceBytes:Buffer.byteLength(f.source.text),requestBytes:Buffer.byteLength(call.request.prompt),responseBytes:Buffer.byteLength(verification.attempts[0].receipt.responseText),artifactBytes:(await stat(a.payloadRef)).size,databaseBytes:(await stat(join(f.root,'db'))).size}));
 const reopened=openStore(join(f.root,'db'));try{assert.equal(reopened.read('p').verifications[0].rawReport.quantitativeResults.length,568);assert.equal(reopened.read('p').artifacts[0].contentHash,a.contentHash);}finally{reopened.close();}
 const raw=JSON.parse(job.attempts[0].receipt.responseText),options={researchContractVersion:job.task.researchContractVersion,researchDataBasis:job.task.researchDataBasis,sourceRecords:[f.source]};
 const ninth=structuredClone(raw);ninth.chartData.charts.push({...ninth.chartData.charts[0],chartId:'ninth'});ninth.quantitativeClaims.push({chartId:'ninth',claimIndex:1});assert.throws(()=>validateStageOutput('research',ninth,options));
 const tooManyCells=structuredClone(raw);const c=tooManyCells.chartData.charts[0];c.series.push({...c.series[0],seriesId:'second'});c.seriesCount=2;assert.throws(()=>validateStageOutput('research',tooManyCells,options),/budget/);
});
