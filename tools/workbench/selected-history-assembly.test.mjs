import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {openStore} from './store.mjs';
import {createExecutor} from './executor.mjs';
import {diskReceipt} from './selected-stage-fixture.mjs';
import {verifySelectedOriginals} from './final-selected-originals.mjs';
import {indexFinalHistoryRecords} from './final-history-index.mjs';
import {finalReviewCallAccounting} from './final-review-authority.mjs';
import {createFinalReviewReader} from './final-review-reader.mjs';
const limits={readAttempts:128,snapshotBytes:256*1024**2,decodedBytes:16*1024**3,storedBytes:16*1024**3};
test('genuine reducer research history closes supported card duties and preserves refusal and occurrences',async()=>{
 const root=join(process.env.STAGE_OWNED_ROOT??tmpdir(),randomUUID());await mkdir(root,{recursive:true});const store=openStore(join(root,'db'));
 const human={actorId:'human',actorType:'human',runId:'human',contextId:'human'};
 try{
  store.create({id:'p',name:'Local original closure',brief:'Explore a supplied background excerpt.',mode:'auto'},human);
  const send=c=>store.command('p',{...c,commandId:randomUUID(),expectedRevision:store.read('p').revision},human);send({kind:'confirm-task-card',taskCardId:'p:scope:1'});
  const output={outputKind:'research_findings',status:'draft',title:'Local research fixture',summary:'Background only',sections:[{heading:'Background',body:'Synthetic excerpt',evidenceIds:['s1']}],claims:[{text:'Synthetic excerpt',kind:'fact',evidenceRefs:['s1'],limitations:['Supplied excerpt only']}],gaps:['No consumer validation'],evidenceClassifications:[{sourceId:'s1',scopeRelation:'background',reason:'Supplied excerpt'}]};
  let calls=0,fail=false;
  const providers={local:{model:'synthetic',execute:request=>{calls++;if(fail)throw Error('Owned unknown provider outcome');return diskReceipt(root,request,{runId:request.runId,model:'synthetic',threadId:randomUUID(),responseText:JSON.stringify(output),parsedOutput:output});}}},bindings={research:{providerId:'local',model:'synthetic',role:'research-lead'}};
  const executor=createExecutor({store,rootDir:root,providers,bindings});const job=await executor.execute('p',executor.enqueue('p','research',{sourceRecords:[{id:'s1',url:'https://example.test/local',text:'Synthetic excerpt',scopeRelation:'background',verification:'captured'}]}));assert.equal(job.status,'succeeded');assert.equal(calls,1);
  const original=store.read('p'),artifact=original.artifacts.at(-1);send({kind:'request-stage',stage:'research',jobId:'later'});const planning=store.read('p');
  const input=(p=planning)=>{const index=indexFinalHistoryRecords(p),node=index.nodes.find(n=>n.domain==='artifact'&&n.recordId===artifact.id);index.nodes.push({...node});return {store,planning:p,index,selected:{nodeIdentities:[node.identity]},executionRoot:root,imageStore:{},current:()=>{}};};
  const run=async x=>(await store.withReadAdmission('p',limits,()=>verifySelectedOriginals(x))).value;
  const value=await run(input());assert.equal(value.blockers.length,0,JSON.stringify(value.blockers));assert.equal(value.facts.length,2);assert.equal(value.terminals.filter(t=>t.kind==='task_card').length,4);assert.equal(value.accounting.historicalSnapshotReads,1);assert.equal(value.accounting.peakRetainedHistoricalSnapshots,1);assert.equal(value.accounting.retainedHistoricalSnapshots,0);assert.equal(value.duties.status,'checked');assert.equal(value.accounting.originalChecks,1);assert.equal(value.accounting.originalCheckReuses,1);assert.equal(value.edges.length,4);assert.notEqual(value.facts[0].occurrence,value.facts[1].occurrence);assert.equal(value.facts[0].revision,original.revision);
  const wrongHost=input();wrongHost.index.nodes.filter(n=>n.domain==='artifact').forEach(n=>n.originalPointer='/taskCards/0');const wrongOutcome=await store.withReadAdmission('p',limits,()=>verifySelectedOriginals(wrongHost));assert.equal(wrongOutcome.code,'FINAL_HISTORY_HOST_CHANGED');
  const wrong=structuredClone(planning);wrong.artifacts.at(-1).contentHash='0'.repeat(64);const refused=await run(input(wrong));assert.ok(refused.blockers.some(b=>b.code==='FINAL_HISTORY_WITNESS_CONFLICT'));assert.equal(refused.facts.length,0);
  const bytes=await readFile(artifact.payloadRef);try{await writeFile(artifact.payloadRef,'{}');const bad=await run(input());assert.equal(bad.facts.length,0);assert.equal(bad.duties.status,'unsettled');assert.ok(bad.duties.unsettled.some(d=>d.code==='STAGE_ORIGINAL_INVALID'&&d.status==='unsettled'));}finally{await writeFile(artifact.payloadRef,bytes);}
  const denied=await verifySelectedOriginals(input());assert.equal(denied.blockers[0].code,'SNAPSHOT_READ_ADMISSION_REQUIRED');
  const exhausted=await store.withReadAdmission('p',{...limits,readAttempts:0},()=>verifySelectedOriginals(input()));assert.notEqual(exhausted.kind,'complete');
  const reader=createFinalReviewReader({store,root,content:{contentLayoutInput(){throw Error('Unexpected content read');},verifyLayoutPreparation(){}},imageStore:{readWithInspection(){}},pythonBinary:'/no-decoder'});
  const snapshot=await reader.readSnapshot('p');assert.equal(snapshot.kind,'blocked');assert.ok(snapshot.blockers.some(b=>b.code==='FINAL_LAYOUT_REQUIRED'));for(const key of ['executionAvailable','finalAuthorityAvailable','deliveryAvailable'])assert.equal(snapshot[key],false);
  assert.equal(store.read('p').revision,planning.revision);assert.equal(calls,1);
  fail=true;const unknown=await executor.execute('p',executor.enqueue('p','research'));assert.notEqual(unknown.status,'succeeded');const accounting=finalReviewCallAccounting(store.read('p'));assert.ok(accounting.unknown.some(a=>a.jobId===unknown.id));assert.equal(accounting.originals.find(a=>a.jobId===unknown.id).chargedCalls,1);assert.equal(calls,2);
 }finally{store.close();}
});
