import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {closeSelectedHistoryDuties} from './final-review-reader.mjs';
import {openStore} from './store.mjs';
import {createExecutor} from './executor.mjs';
import {prepareStrategy,bootstrapOwnerCopy,syntheticCopy,diskReceipt} from './selected-stage-fixture.mjs';
import {verifySelectedOriginals} from './final-selected-originals.mjs';
import {indexFinalHistoryRecords} from './final-history-index.mjs';
import {finalReviewCallAccounting} from './final-review-authority.mjs';
const limits={readAttempts:128,snapshotBytes:256*1024**2,decodedBytes:16*1024**3,storedBytes:16*1024**3};
test('genuine copy owner constraints and generic review dispatch retain imported evidence blockers',async()=>{
 const root=join(process.env.STAGE_OWNED_ROOT??tmpdir(),randomUUID());await mkdir(root,{recursive:true});const store=openStore(join(root,'db'));
 try{
  await prepareStrategy({store,root});const binding={providerId:'copy-local',model:'synthetic',role:'copy-lead'},bindings={copy:binding},providers={'copy-local':{model:'synthetic',execute:request=>diskReceipt(root,request,{runId:request.runId,model:'synthetic',threadId:randomUUID(),responseText:JSON.stringify(syntheticCopy),parsedOutput:syntheticCopy})}};
  const bootstrap=await bootstrapOwnerCopy({store,root,bindings,providers});const executor=createExecutor({store,rootDir:root,bindings,providers}),job=await executor.execute('p',bootstrap.jobId);assert.equal(job.status,'succeeded');
  const planning=store.read('p'),index=indexFinalHistoryRecords(planning),ids=[planning.artifacts.at(-1).id,...planning.verifications.map(r=>r.id),...planning.creativeReports.map(r=>r.id)];
  const checkedJobs=planning.jobs.filter(j=>planning.ownerReports.some(r=>r.jobId===j.id)||planning.verifications.some(r=>r.jobId===j.id)||planning.creativeReports.some(r=>r.jobId===j.id));
  const selected={nodeIdentities:index.nodes.filter(n=>ids.includes(n.recordId)||checkedJobs.some(j=>n.originalPointer===`/jobs/${planning.jobs.indexOf(j)}`||n.originalPointer===`/jobs/${planning.jobs.indexOf(j)}/attempts/0`)).map(n=>n.identity)};
  const outcome=await store.withReadAdmission('p',limits,()=>verifySelectedOriginals({store,planning,index,selected,executionRoot:root,imageStore:{},current:()=>{}}));assert.equal(outcome.kind,'complete');const result=outcome.value;
  assert.ok(result.terminals.some(t=>t.kind==='upstream_review_constraints'));assert.ok(result.facts.some(f=>f.kind==='owner'));assert.ok(result.facts.some(f=>f.checked.kind==='generic-review-original'));
  assert.equal(result.blockers.some(b=>b.code==='FINAL_HISTORY_EXACT_DOMAIN_CLOSURE_REQUIRED'),false);assert.equal(result.blockers.some(b=>b.dependency?.kind==='upstream_review_constraints'),false);assert.ok(result.blockers.some(b=>b.code==='FINAL_HISTORY_IMPORTED_ARTIFACT_ORIGINAL_REQUIRED'));
  assert.equal(result.blockers.some(b=>b.code==='FINAL_HISTORY_COMMAND_WITNESS_REQUIRED'),false,JSON.stringify(result.blockers));
  const closure=closeSelectedHistoryDuties({planning,index,selected,checked:result});assert.equal(closure.uncovered.filter(n=>n.domain==='job'||n.domain.startsWith('attempt:')).length,0,JSON.stringify(closure.uncovered));assert.equal(result.accounting.peakRetainedHistoricalSnapshots,1);assert.equal(result.accounting.retainedHistoricalSnapshots,0);assert.ok(result.accounting.historicalSnapshotReads<128);assert.ok(result.accounting.originalCheckReuses>0);
  const accounting=finalReviewCallAccounting(planning);assert.equal(accounting.consumedCalls,17);assert.equal(accounting.unknown.length,0);console.log(JSON.stringify({localTextCalls:accounting.consumedCalls,snapshotAccounting:result.accounting,closedJobAttemptNodes:closure.closedNodeIdentities.length,facts:result.facts.length,terminals:result.terminals.length,blockerCodes:[...new Set(result.blockers.map(b=>b.code))]}));
 }finally{store.close();}
});
