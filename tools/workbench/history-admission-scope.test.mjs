import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {openStore} from './store.mjs';
import {sketchHash} from './sketch-authority.mjs';
import {verifySelectedOriginals} from './final-selected-originals.mjs';
const limits={readAttempts:128,snapshotBytes:256*1024**2,decodedBytes:16*1024**3,storedBytes:16*1024**3};
function owned(t) {
 const root=mkdtempSync(join(tmpdir(),'history-scope-')),file=join(root,'owned.db'),store=openStore(file),other=openStore(':memory:'),sql=new DatabaseSync(file);
 const reports=[{id:'first',jobId:'owner-job-1',attemptId:'attempt-1'},{id:'second',jobId:'owner-job-2',attemptId:'attempt-2'}];
 const planning={id:'owned',revision:2,ownerReports:reports,audit:reports.map((r,i)=>({commandId:'completion-'+i,kind:'complete-owner',revision:i+1})),processedCommands:Object.fromEntries(reports.map((r,i)=>['completion-'+i,JSON.stringify({commandId:'completion-'+i,kind:'complete-owner',reportId:r.id,jobId:r.jobId,attemptId:r.attemptId})]))};
 for(const revision of [1,2])sql.prepare('INSERT INTO revisions VALUES(?,?,?)').run(planning.id,revision,JSON.stringify({...planning,revision}));sql.prepare('INSERT INTO heads VALUES(?,?)').run(planning.id,2);
 const nodes=reports.map((r,i)=>({identity:'owner-'+i,domain:'report:owner',recordId:r.id,originalPointer:'/ownerReports/'+i,recordHash:sketchHash(JSON.stringify(r))}));
 const input={store,planning,index:{nodes},selected:{nodeIdentities:nodes.map(n=>n.identity)},executionRoot:root,imageStore:{},current:()=>{}};
 t.after(()=>{sql.close();store.close();other.close();rmSync(root,{recursive:true,force:true});});
 return {store,other,input,planning};
}
test('direct production export refuses missing admission before recorded historical reads',async t=>{
 const f=owned(t),reads=[];const read=f.store.read;f.store.read=(...args)=>{reads.push(args);return read(...args);};
 const result=await verifySelectedOriginals(f.input);
 assert.equal(result.accounting.allocationAdmission,'store_read_admission_required');
 assert.deepEqual(reads,[]);assert.deepEqual(result.facts,[]);assert.ok(result.blockers.some(b=>b.code==='SNAPSHOT_READ_ADMISSION_REQUIRED'));
});
test('active production coordinator shares the real cumulative store budget',async t=>{
 const f=owned(t),out=await f.store.withReadAdmission('owned',limits,()=>verifySelectedOriginals(f.input));
 const changed=await f.store.withReadAdmission('owned',limits,()=>verifySelectedOriginals({...f.input,index:{nodes:f.input.index.nodes.map((n,i)=>i===0?{...n,recordHash:'changed-host'}:n)}}));assert.equal(changed.kind,'failed');assert.equal(changed.code,'FINAL_HISTORY_HOST_CHANGED');assert.equal(changed.usage.fetchedSnapshots,0);assert.equal(changed.usage.readAttempts,0);
 assert.equal(out.kind,'complete');assert.equal(out.usage.fetchedSnapshots,2);assert.equal(out.value.accounting.allocationAdmission,'outer_store_read_admission');assert.equal(out.value.blockers.length,2);
 const exhausted=await f.store.withReadAdmission('owned',{...limits,readAttempts:1},()=>verifySelectedOriginals(f.input));
 assert.equal(exhausted.code,'SNAPSHOT_READ_COUNT_LIMIT');assert.equal(exhausted.usage.fetchedSnapshots,1);assert.equal(exhausted.usage.readAttempts,2);assert.ok(exhausted.value.blockers.some(b=>b.code==='SNAPSHOT_READ_COUNT_LIMIT'));
});
test('cross-project and cross-store coordinator scopes refuse and latch',async t=>{
 const f=owned(t);
 for(const [scopeStore,id] of [[f.store,'other-project'],[f.other,'owned']]){
  const out=await scopeStore.withReadAdmission(id,limits,()=>verifySelectedOriginals(f.input));
  assert.equal(out.code,'SNAPSHOT_READ_SCOPE_MISMATCH');assert.equal(out.usage.fetchedSnapshots,0);assert.equal(out.value.accounting.allocationAdmission,'store_read_admission_required');
 }
});
test('escaped coordinator refuses a closed scope without fetching history',async t=>{
 const f=owned(t);let release,escaped;const gate=new Promise(resolve=>release=resolve);
 const out=f.store.withReadAdmission('owned',limits,()=>{escaped=(async()=>{await gate;return verifySelectedOriginals(f.input);})();return 'closed';});
 assert.equal(out.kind,'complete');release();const result=await escaped;
 assert.equal(result.blockers[0].code,'SNAPSHOT_READ_SCOPE_CLOSED');assert.equal(result.accounting.allocationAdmission,'store_read_admission_required');assert.deepEqual(result.facts,[]);
});
test('fabricated scope and forged store assertion cannot attest an active operation',async t=>{
 const f=owned(t),forged={...f.store,assertReadAdmission:()=>true};
 const outside=await verifySelectedOriginals({...f.input,store:forged,admission:{active:true,projectId:'owned'}});
 assert.equal(outside.blockers[0].code,'SNAPSHOT_READ_ADMISSION_REQUIRED');
 const inside=await f.store.withReadAdmission('owned',limits,()=>verifySelectedOriginals({...f.input,store:forged}));
 assert.equal(inside.code,'SNAPSHOT_READ_SCOPE_MISMATCH');assert.equal(inside.usage.fetchedSnapshots,0);
});
