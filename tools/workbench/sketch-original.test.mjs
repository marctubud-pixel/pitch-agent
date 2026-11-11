import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openStore} from './store.mjs';
import {prepareStrategy} from './owner-edge-fixtures.mjs';
import {verifySelectedOriginals,selectedOriginalCommandIndex} from './final-selected-originals.mjs';
import {verifySketchOriginal} from './sketch-original.mjs';
import {createSketchRuntime} from './sketch-runtime.mjs';
import {createFinalReviewReader} from './final-review-reader.mjs';

const readLimits={readAttempts:128,snapshotBytes:256*1024**2,decodedBytes:16*1024**3,storedBytes:16*1024**3};
async function admittedSelectedOriginals(input) {
 const outcome=await input.store.withReadAdmission(input.planning.id,readLimits,()=>verifySelectedOriginals(input));
 assert.equal(outcome.kind,'complete',outcome.message);return outcome.value;
}

test('real owner command history enters fixed selected coordinator and remains explicitly partial',async t=>{
const root=await mkdtemp(join(tmpdir(),'sketch-original-owned-')),file=join(root,'history.db');let store=openStore(file);t.after(()=>store.close());
 const f=await prepareStrategy({store,root});await f.executor.continueStrategy('p',f.request());
 for(let i=0;i<5;i++)for(const id of await f.executor.advanceOwnerEdges('p'))if(store.read('p').jobs.find(job=>job.id===id).purpose==='owner_acceptance')assert.equal((await f.executor.execute('p',id)).status,'succeeded');
 const before=store.read('p'),revision=before.revision;
 assert.equal(before.artifacts.find(a=>a.id==='research').provenance,'imported_metadata');
 assert.equal(before.ownerReports.length,2);
 store.close();store=openStore(file);assert.deepEqual(store.read('p'),before);
 const entries=selectedOriginalCommandIndex(before).entries;assert.equal(entries.length,before.audit.length);
 const index={nodes:before.ownerReports.map((report,i)=>({identity:'owner-'+i,domain:'report:owner',recordId:report.id,originalPointer:'/ownerReports/'+i}))};
 const input={store,planning:before,index,selected:{nodeIdentities:index.nodes.map(n=>n.identity)},executionRoot:root,imageStore:{},current:()=>assert.equal(store.read('p').revision,revision)};
 const result=await admittedSelectedOriginals(input);
 assert.equal(result.facts.length,2);assert.ok(result.facts.every(fact=>fact.checked.reportId&&fact.commandId&&fact.revision<revision));
 assert.equal(result.blockers.some(b=>b.code==='FINAL_HISTORY_SNAPSHOT_ALLOCATION_ADMISSION_REQUIRED'),false);
 assert.ok(result.blockers.some(b=>b.code==='FINAL_HISTORY_EXACT_DOMAIN_CLOSURE_REQUIRED'));
 assert.deepEqual(store.read('p'),before);
 await t.test('malformed exact fingerprint refused',()=>{const changed=structuredClone(before);changed.processedCommands[changed.audit[0].commandId]='{';assert.throws(()=>selectedOriginalCommandIndex(changed),{code:'FINAL_HISTORY_WITNESS_CONFLICT'});});
 await t.test('missing fingerprint cannot witness an owner completion',async()=>{const changed=structuredClone(before);for(const entry of entries)if(entry.command.kind==='complete-owner')delete changed.processedCommands[entry.command.commandId];const result=await admittedSelectedOriginals({...input,planning:changed});assert.equal(result.facts.length,0);assert.ok(result.blockers.some(b=>b.code==='FINAL_HISTORY_COMMAND_WITNESS_REQUIRED'));});
 await t.test('wrong exact completion job refused',async()=>{const changed=structuredClone(before);for(const entry of entries)if(entry.command.kind==='complete-owner')changed.processedCommands[entry.command.commandId]=JSON.stringify({...entry.command,jobId:'wrong'});const result=await admittedSelectedOriginals({...input,planning:changed});assert.equal(result.facts.length,0);});
 await t.test('unregistered sketch is refused',async()=>{await assert.rejects(verifySketchOriginal({...before,sketchGenerations:[]},{id:'unregistered'},{id:'unregistered'},{executionRoot:root}),{code:'SKETCH_ORIGINAL_MEMBERSHIP_REQUIRED'});});
 assert.equal(typeof createSketchRuntime,'function');assert.equal(typeof createFinalReviewReader,'function');
});
