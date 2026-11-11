import {numericFixture} from './research-numeric-fixture.mjs';
import {recoverReadinessTerminal} from './recovered-readiness-test-support.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {fixture} from './final-recovered-readiness-fixture.mjs';
import {verifySelectedOriginals} from './final-selected-originals.mjs';
import {verifyReviewOriginal} from './review-original.mjs';
import {indexFinalHistoryRecords} from './final-history-index.mjs';
import {collectCheckedReviewOccurrences} from './final-review-occurrences.mjs';

export async function checkSelected(f,p=f.store.read('p')){
 const report=p.readinessReports.find(r=>r.resolutionId),index=indexFinalHistoryRecords(p),selected={nodeIdentities:index.nodes.filter(n=>n.recordId===report.id).map(n=>n.identity),reportAnchors:index.reportAnchors.filter(a=>a.identity===report.id)};
 const admission=await f.store.withReadAdmission(p.id,{readAttempts:128,snapshotBytes:64*1024**2,decodedBytes:256*1024**2,storedBytes:256*1024**2},()=>verifySelectedOriginals({store:f.store,planning:p,index,selected,executionRoot:f.root,current:()=>assert.equal(f.store.read('p').revision,p.revision)}));
 const checked=admission.kind==='complete'?admission.value:{facts:[],blockers:[{code:admission.code,message:admission.message}]};
 return {report,index,selected,checked};
}
test('saved terminal readiness enters selected history with exact originals, unknown status and zero resend',async t=>{
 const f=await fixture(t,{saved:true}),before=f.origin();
 const result=await f.executor.resolveReadiness('p',await f.request());assert.equal(result.kind,'recovered');assert.deepEqual(f.origin(),before);assert.equal(f.calls,1);
 f.reopen();let p=f.store.read('p'),{report,index,selected,checked}=await checkSelected(f,p);
 assert.deepEqual(checked.blockers,[]);const fact=checked.facts.find(f=>f.id===report.id);assert(fact);assert.deepEqual(fact.checked.source.rawReport,report.rawReport);assert.deepEqual(fact.checked.reviewedArtifacts[0].content,JSON.parse(await readFile(f.artifact.payloadRef,'utf8')));
 const occurrences=collectCheckedReviewOccurrences({planning:p,checked,selected});assert(occurrences.occurrences.some(o=>o.reportIdentity===report.id));
 assert.equal(f.calls,1);assert.deepEqual(f.origin(),before);
 let negatives=0;
 const refuse=async edit=>{const q=structuredClone(p);edit(q);const result=await checkSelected(f,q);assert(result.checked.blockers.length,JSON.stringify(result.checked));assert(!result.checked.facts.some(f=>f.id===report.id));negatives++;};
 const command=p.readinessResolutions[0].request.commandId;
 const editCommand=(q,edit)=>{const c=JSON.parse(q.processedCommands[command]);edit(c);q.processedCommands[command]=JSON.stringify(c);};
 await refuse(q=>delete q.processedCommands[command]);
 await refuse(q=>editCommand(q,c=>c.kind='complete-readiness'));
 await refuse(q=>editCommand(q,c=>c.resolutionId='crossed'));
 await refuse(q=>editCommand(q,c=>c.proof.responseText+=' '));
 await refuse(q=>editCommand(q,c=>c.payloadRef+='-crossed'));
 await refuse(q=>editCommand(q,c=>c.request.expectedRevision--));
 await refuse(q=>q.readinessResolutions[0].proof.inputText+=' ');
 await refuse(q=>q.readinessResolutions[0].attemptId='crossed');
 await refuse(q=>q.readinessResolutions=[]);
 await refuse(q=>q.readinessResolutions.push({...q.readinessResolutions[0],id:'duplicate-resolution'}));
 await refuse(q=>{const c=JSON.parse(q.processedCommands[command]);c.commandId='duplicate-command';q.processedCommands[c.commandId]=JSON.stringify(c);q.audit.push({...q.audit.find(a=>a.commandId===command),commandId:c.commandId});});
 for(const path of [report.payloadRef,p.readinessResolutions[0].proof.paths.output,p.readinessResolutions[0].proof.paths.input,f.artifact.payloadRef]){
  const bytes=await readFile(path);await writeFile(path,Buffer.concat([bytes,Buffer.from(' ')]));await assert.rejects(()=>verifyReviewOriginal(p,'readiness',report,{executionRoot:f.root}));await writeFile(path,bytes);negatives++;
  await rename(path,path+'.missing');await assert.rejects(()=>verifyReviewOriginal(p,'readiness',report,{executionRoot:f.root}));await rename(path+'.missing',path);negatives++;
 }
 assert.deepEqual((await checkSelected(f)).checked.blockers,[]);assert.equal(f.calls,1);assert.deepEqual(f.origin(),before);
 console.log(JSON.stringify({recoveredReport:report.id,selectedFacts:checked.facts.length,occurrences:occurrences.occurrences.length,negativeCases:negatives,calls:f.calls,additionalCalls:0,originalUnknownPreserved:true}));
});

test('nonempty numerical original retains recovered readiness in selected history',async()=>{
 const f=await numericFixture({compact:true,retainRoot:true});
 try{
  const produced=await f.executor.execute('p',f.executor.enqueue('p','research',{sourceRecords:[f.source]}));assert.equal(produced.status,'succeeded');
  const artifact=f.store.read('p').artifacts[0];assert(JSON.parse(await readFile(artifact.payloadRef,'utf8')).chartData.charts.length>0);
  const id=await f.executor.enqueueReadiness('p',artifact.id,{protocolVersion:'research-readiness-v2'});await recoverReadinessTerminal(f,id);
  const calls=f.calls.length,unknown=f.store.read('p').jobs.find(j=>j.id===id),result=await checkSelected(f);
  assert.deepEqual(result.checked.blockers,[]);assert(result.checked.facts.some(f=>f.id===result.report.id));assert.equal(f.calls.length,calls);assert.deepEqual(f.store.read('p').jobs.find(j=>j.id===id),unknown);
  console.log(JSON.stringify({numericSelected:true,selectedFacts:result.checked.facts.length,additionalCalls:0,originalUnknownPreserved:true}));
 }finally{f.store.close();}
});
