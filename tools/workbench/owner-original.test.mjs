import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rename,symlink,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openStore} from './store.mjs';
import {prepareStrategy} from './owner-edge-fixtures.mjs';
import {ownerEdgeState,validateStoredOwner} from './project.mjs';
import {verifyOwnerOriginal} from './owner-original.mjs';

test('executed local owners over explicitly imported research retain authentic historical originals',async t=>{
 const root=await mkdtemp(join(tmpdir(),'owner-original-fixture-')); 
 const store=openStore(join(root,'db'));t.after(()=>store.close());
 const f=await prepareStrategy({store,root});await f.executor.continueStrategy('p',f.request());
 for(let i=0;i<5;i++)for(const id of await f.executor.advanceOwnerEdges('p'))if(store.read('p').jobs.find(j=>j.id===id).purpose==='owner_acceptance')assert.equal((await f.executor.execute('p',id)).status,'succeeded');
 const current=store.read('p'),revision=current.revision;
 assert.equal(current.ownerReports.length,2);assert.equal(current.artifacts.find(a=>a.id==='research').provenance,'imported_metadata');
 for(const report of current.ownerReports){assert.equal(validateStoredOwner(current,report).decision,'accept');assert.equal((await verifyOwnerOriginal(current,report,{executionRoot:root})).projection.decision,'accept');}
 assert.equal(ownerEdgeState(current,current.ownerEdges[0]).status,'committed');
 f.send({kind:'revise-task-card',taskCardId:'changed-scope',brief:'A new synthetic requirement makes the former owner edge stale.'});
 const later=store.read('p');assert.equal(ownerEdgeState(later,later.ownerEdges[0]).status,'stale');
 const historical=store.read('p',revision),report=historical.ownerReports[0];
 assert.equal((await verifyOwnerOriginal(historical,report,{executionRoot:root})).reportId,report.id);
 assert.equal((await verifyOwnerOriginal(later,later.ownerReports[0],{executionRoot:root})).reportId,report.id);
 for(const [label,mutate] of [
  ['unregistered report',p=>p.ownerReports=[]],
  ['duplicate member',p=>p.ownerReports.push(structuredClone(p.ownerReports[0]))],
  ['missing edge',p=>p.ownerEdges=[]],
  ['duplicate job',p=>p.jobs.push(structuredClone(p.jobs.find(j=>j.id===report.jobId)))],
  ['failed attempt',p=>p.jobs.find(j=>j.id===report.jobId).attempts[0].status='failed'],
  ['wrong task ancestor',p=>p.taskCards[0].brief='changed'],
  ['wrong job',p=>p.ownerReports[0].jobId='missing'],
  ['wrong context',p=>p.ownerReports[0].context.contextId='changed'],
  ['wrong request hash',p=>{p.ownerReports[0].executionReceipt.inputPacketHash='changed';}],
  ['wrong source registration',p=>p.artifacts.find(a=>a.id===report.artifactId).contentHash='changed']
 ])await t.test(label,async()=>{const p=structuredClone(historical);mutate(p);await assert.rejects(verifyOwnerOriginal(p,p.ownerReports[0]??report,{executionRoot:root}));});
 await t.test('bounded packet and symlink refusal',async()=>{const path=join(root,report.attemptId,'packet.json'),before=await readFile(path);try{await writeFile(path,Buffer.alloc(8*1024*1024+1));await assert.rejects(verifyOwnerOriginal(historical,report,{executionRoot:root}),{code:'LAYOUT_MANAGED_BYTES_REQUIRED'});}finally{await writeFile(path,before);}const saved=path+'.saved';await rename(path,saved);try{await symlink(saved,path);await assert.rejects(verifyOwnerOriginal(historical,report,{executionRoot:root}),{code:'LAYOUT_SYMLINK_REFUSED'});}finally{await unlink(path);await rename(saved,path);}});
 for(const file of [join(root,report.attemptId,'packet.json'),report.payloadRef,historical.artifacts.find(a=>a.id==='research').payloadRef])await t.test('reject changed bytes '+file.split('/').at(-1),async()=>{const before=await readFile(file);try{await writeFile(file,'{}');await assert.rejects(verifyOwnerOriginal(historical,report,{executionRoot:root}));}finally{await writeFile(file,before);}});
});
