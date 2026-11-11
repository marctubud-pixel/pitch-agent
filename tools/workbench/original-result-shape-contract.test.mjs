import assert from 'node:assert/strict';
import {test} from 'node:test';
import {checkedOriginalResultFacts} from './final-selected-originals.mjs';
import {isCheckedOriginalReportAnchor,closeSelectedHistoryDuties} from './final-review-reader.mjs';
import {indexFinalHistoryRecords} from './final-history-index.mjs';

const raw={limitations:['raw only']},normalized={limitations:['raw only','a','b','c'],hasBlockingFindings:false};
function fixture(family){
 const attempt={id:'a',status:'succeeded'},job={id:'j',status:'succeeded',attempts:[attempt],inputVersionIds:[],outputVersionIds:[]},stored={id:'r',rawReport:raw};
 const project={id:'p',revision:1,jobs:[job],artifacts:[],taskCards:[],ownerReports:[stored],verifications:[{...stored,id:'g'}],referenceDossiers:[{id:'d',reports:[{...stored,id:'ref'}]}],sketchReviewRuns:[{id:'s',reports:[{id:'sr',raw}]}],finalVisualRuns:[{id:'v',reports:[{id:'vr',raw}]}]};
 job.contentReport={id:'cr',raw,projection:normalized};
 const top={jobId:'j',attemptId:'a'},facts={
 ordinary:{kind:'ordinary_stage_original',...top,projection:normalized},owner:{...top,reportId:'r',projection:raw},generic:{kind:'generic-review-original',identity:{domain:'verification',reportId:'g',...top},source:{rawReport:raw,validatedReport:normalized}},reference:{dossier:project.referenceDossiers[0],reports:[{stored:project.referenceDossiers[0].reports[0],job,attempt,normalized}]},
 sketch_text:{kind:'sketch-text-original',...top},sketch_image:{kind:'sketch-image-original',...top},sketch_review:{kind:'sketch-review-original',reviewRunId:'s',reports:[{jobId:'j',attemptId:'a',reportId:'sr',raw,slots:normalized}]},reviewed_artifact:{kind:'sketch-review-original',reviewRunId:'s',reports:[{jobId:'j',attemptId:'a',reportId:'sr',raw,slots:normalized}]},final_text:{kind:'final-visual-text-original',...top,runId:'v',reportId:'vr',raw},final_image:{kind:'final-visual-image-original',...top},content:{kind:'content-original',...top,reportId:'cr',raw,projection:normalized}};
 const checked=facts[family],kind=family==='owner'?'owner':family==='reference'?'reference':'job',index=indexFinalHistoryRecords(project);
 return {snapshot:project,planning:structuredClone(project),index,checked,kind};
}
for(const family of ['ordinary','owner','generic','reference','sketch_text','sketch_image','sketch_review','reviewed_artifact','final_text','final_image','content'])test(`source-backed ${family} result contract without native/image execution`,()=>{
 const f=fixture(family),r=checkedOriginalResultFacts(f);assert.deepEqual(r.checkedExecutionPairs,[{jobId:'j',attemptId:'a'}]);assert.equal(r.closedNodeIdentities.length,2);
 assert.equal(r.checkedRawAnchors.length,['ordinary','sketch_text','sketch_image','final_image'].includes(family)?0:1);
 for(const anchor of r.checkedRawAnchors){const result={facts:[r]};assert.ok(isCheckedOriginalReportAnchor(anchor,result));for(const change of [a=>a.host.id='wrong',a=>a.version='wrong',a=>a.originalRecordPointer+='/other',a=>a.raw=normalized]){const wrong=structuredClone(anchor);change(wrong);assert.equal(isCheckedOriginalReportAnchor(wrong,result),false);}}
 const selected={nodeIdentities:f.index.nodes.filter(n=>n.domain==='job'||n.domain.startsWith('attempt:')).map(n=>n.identity)};
 assert.equal(closeSelectedHistoryDuties({planning:f.planning,index:f.index,selected,checked:{facts:[r],duties:{status:'checked'},deferred:[]}}).uncovered.length,0);
});
for(const family of ['ordinary','owner','generic','reference','sketch_text','sketch_image','sketch_review','reviewed_artifact','final_text','final_image','content'])test(`wrong exact execution rejected for ${family}`,()=>{
 for(const mutate of [f=>f.planning.jobs[0].id='other',f=>f.planning.jobs[0].attempts[0].id='other',f=>f.snapshot.jobs[0].attempts.push({id:'a',status:'succeeded'})]){const f=fixture(family);mutate(f);assert.throws(()=>checkedOriginalResultFacts(f),{code:'FINAL_HISTORY_WITNESS_CONFLICT'});}
});
test('generic raw differs by normalized boolean and three added limitations, no fallback',()=>{
 const f=fixture('generic');assert.equal(f.checked.source.validatedReport.limitations.length-f.checked.source.rawReport.limitations.length,3);assert.equal(f.checked.source.validatedReport.hasBlockingFindings,false);assert.equal(Object.hasOwn(f.checked.source.rawReport,'hasBlockingFindings'),false);
 f.checked.source.rawReport=normalized;assert.throws(()=>checkedOriginalResultFacts(f),{code:'FINAL_HISTORY_REPORT_ORIGINAL_REQUIRED'});delete f.checked.source.rawReport;assert.throws(()=>checkedOriginalResultFacts(f),{code:'FINAL_HISTORY_RESULT_SHAPE_REQUIRED'});
});
test('equal report at another registered occurrence cannot substitute',()=>{
 const f=fixture('generic'),r=checkedOriginalResultFacts(f),other=structuredClone(r.checkedRawAnchors[0]);other.originalRecordPointer='/verifications/1';assert.equal(isCheckedOriginalReportAnchor(other,{facts:[r]}),false);
});
test('unknown result domain blocks specifically',()=>{const f=fixture('ordinary');f.checked.kind='unknown-original';assert.throws(()=>checkedOriginalResultFacts(f),{code:'FINAL_HISTORY_UNSUPPORTED_RESULT_SHAPE'});});
