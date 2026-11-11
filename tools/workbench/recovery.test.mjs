import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir,hostname} from 'node:os';
import {join} from 'node:path';
import {openStore} from './store.mjs';
import {recoverInterruptedJobs} from './recovery.mjs';
import {RESEARCH_DATA_VERSION,researchDataBasis} from './research-chart-data.mjs';

const context={actorId:'synthetic',actorType:'agent',runId:'r',contextId:'c'};
function setup(store,owner) {
  store.create({id:'p',name:'Recovery synthetic',brief:'test'},context);
  const send=(command)=>store.command('p',{...command,commandId:command.kind,expectedRevision:store.read('p').revision},{...context,actorType:'human',...owner});
  send({kind:'confirm-task-card',taskCardId:'p:scope:1'});
  const confirmed=store.read('p'),taskCard=confirmed.taskCards.find(card=>card.id===confirmed.activeTaskCardId),sourceRecords=[];
  const request={kind:'request-stage',stage:'research',jobId:'j',binding:{model:'test',providerId:'test',role:'research'},task:{id:'t',owner:'research',parentId:null}};
  assert.throws(()=>send(request),{code:'RESEARCH_V2_REQUIRED'});
  assert.deepEqual(store.read('p'),confirmed);
  send({...request,task:{...request.task,researchContractVersion:RESEARCH_DATA_VERSION,researchDataBasis:researchDataBasis({taskCard,confirmations:confirmed.confirmations.filter(c=>c.taskCardId===taskCard.id),sourceRecords}),sourceRecords,visualCatalogue:[],taskCardId:taskCard.id,brief:taskCard.brief}});
  send({kind:'start-job',jobId:'j',attemptId:'a'});
}
test('actual terminated owner becomes uncertain after reopening SQLite, never resubmitted',async()=>{
  const root=mkdtempSync(join(tmpdir(),'recovery-')),file=join(root,'db');
  const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)']);
  await once(child,'spawn');
  const exited=once(child,'exit');
  let store=openStore(file);
  try {
    setup(store,{executorHost:hostname(),executorPid:child.pid});
    assert.equal(recoverInterruptedJobs(store)[0].ownerState,'alive');
    child.kill();await exited;
    store.close();store=openStore(file);
    assert.equal(recoverInterruptedJobs(store)[0].action,'awaiting_reconciliation');
    const job=store.read('p').jobs[0];
    assert.equal(job.status,'awaiting_reconciliation');assert.equal(job.attempts.length,1);
    assert.deepEqual(recoverInterruptedJobs(store),[]);
    assert.equal(store.read('p',3).jobs[0].status,'running');
  } finally {child.kill();await exited;store.close();rmSync(root,{recursive:true,force:true});}
});
test('legacy, foreign and uncertain owners are not declared stopped',()=>{
  for(const owner of [{},{executorHost:'foreign',executorPid:123},{executorHost:hostname(),executorPid:123}]) {
    const store=openStore(':memory:');
    try {
      setup(store,owner);
      const result=recoverInterruptedJobs(store,{inspectProcess:()=> 'unknown'});
      assert.equal(result[0].ownerState,'unknown');assert.equal(store.read('p').jobs[0].status,'running');
    } finally {store.close();}
  }
});
