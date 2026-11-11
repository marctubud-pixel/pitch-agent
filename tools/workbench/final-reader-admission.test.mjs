import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {openStore} from './store.mjs';
import {sketchHash} from './sketch-authority.mjs';
import {owned as metadataFixture} from './final-review-phase-fixture.mjs';
import {createFinalReviewReader} from './final-review-reader.mjs';
import {createFinalEditionReader} from './final-edition-reader.mjs';
import {createCompleteContentRuntime} from './complete-content-runtime.mjs';
import {createFinalVisualRuntime} from './final-visual-runtime.mjs';
import {createSketchReviewRuntime} from './sketch-review-runtime.mjs';
import {createSketchRuntime} from './sketch-runtime.mjs';
const limits={readAttempts:128,snapshotBytes:256*1024**2,decodedBytes:16*1024**3,storedBytes:16*1024**3};
const domain=()=>Object.assign(Error('Constructed missing trusted originals'),{code:'CONTENT_LAYOUT_SOURCE_UNAVAILABLE'});
function owned(t) {
 const root=mkdtempSync(join(tmpdir(),'final-reader-admission-')),file=join(root,'owned.db'),store=openStore(file),sql=new DatabaseSync(file),p=metadataFixture().p;
 for(const job of p.jobs.filter(j=>j.purpose==='layout_export'))job.attempts[0].worker={kind:'constructed-no-native-run'};
 const replace=value=>sql.prepare('UPDATE revisions SET snapshot=? WHERE project_id=?').run(typeof value==='string'?value:JSON.stringify(value),p.id);
 sql.prepare('INSERT INTO revisions VALUES(?,?,?)').run(p.id,p.revision,JSON.stringify(p));sql.prepare('INSERT INTO heads VALUES(?,?)').run(p.id,p.revision);
 t.after(()=>{sql.close();store.close();rmSync(root,{recursive:true,force:true});});
 const imageStore={async readWithInspection(){throw Object.assign(Error('No images in constructed fixture'),{code:'ENOENT'});},async read(){throw Error('Unexpected image read');}};
 const admissionStore=(changePolicy=policy=>policy,observe=()=>{})=>Object.freeze({read:store.read,list:store.list,withReadAdmission(id,policy,work){observe(policy);return store.withReadAdmission(id,changePolicy(policy),work);}});
 const reader=(content,selectedStore=store)=>createFinalReviewReader({store:selectedStore,root,content,imageStore,pythonBinary:'/constructed/no-decoder-execution'});
 return {root,file,store,sql,p,replace,imageStore,reader,admissionStore};
}
test('actual reader entrypoints use fixed shared policy and preserve metadata and retained domain evidence on constructed fixture',async t=>{
 const f=owned(t);let seenPolicy;const content={async contentLayoutInput(id){f.store.read(id);throw domain();},async verifyLayoutPreparation(id){f.store.read(id);throw domain();}},policyReader=f.reader(content,f.admissionStore(undefined,policy=>{seenPolicy=policy;}));
 const basis=policyReader.inspectBasis(f.p.id);assert.deepEqual(seenPolicy,limits);assert.equal(basis.accounting.snapshotReads.readAttempts,1);assert.ok(basis.basis);assert.equal(basis.executionAvailable,false);
 seenPolicy=undefined;await policyReader.readSnapshot(f.p.id);assert.deepEqual(seenPolicy,limits);
 // Historical admission checks require the store's WeakMap identity; the policy observer is only a facade.
 const result=await f.reader(content).readSnapshot(f.p.id);assert.ok(result.retained.registeredProject);assert.ok(result.retained.checkedOriginals);assert.equal(result.accounting.snapshotReads.fetchedSnapshots,4);assert.equal(result.accounting.snapshotReads.readAttempts,4);assert.ok(result.blockers.some(b=>b.code==='CONTENT_LAYOUT_SOURCE_UNAVAILABLE'));assert.equal(result.retained.selectedDutyClosure.status,'unsettled');assert.equal(result.retained.history.duties.status,'unsettled');for(const code of ['FINAL_HISTORY_NATIVE_TUPLE_REQUIRED','FINAL_HISTORY_CONTENT_ORIGINAL_REQUIRED','FINAL_HISTORY_SELECTED_DOMAIN_REQUIRED']){assert.ok(result.retained.history.duties.unsettled.some(d=>d.code===code&&d.status==='unsettled'));assert.ok(result.blockers.some(b=>b.code===code));}assert.equal(result.retained.history.completeness.state,'missing');assert.equal(result.retained.history.completeness.code,'FINAL_HISTORY_DOMAIN_VALIDATION_REQUIRED');assert.deepEqual([result.executionAvailable,result.finalAuthorityAvailable,result.deliveryAvailable],[false,false,false]);assert.equal(result.blockers.some(b=>b.code==='FINAL_HISTORY_SNAPSHOT_ALLOCATION_ADMISSION_REQUIRED'),false);assert.equal(result.deliveryAvailable,false);
});
test('actual final semantic guard permits equivalent reordered TEXT and detects same-head semantic mutation on constructed fixture',async t=>{
 const f=owned(t);let mutation='equivalent';const content={async contentLayoutInput(id){f.store.read(id);const next=Object.fromEntries(Object.entries(f.p).reverse());if(mutation==='semantic')next.name='Changed under same SQL key';f.replace(JSON.stringify(next,null,1));throw domain();},async verifyLayoutPreparation(id){f.store.read(id);throw domain();}};
 const reader=f.reader(content);let result=await reader.readSnapshot(f.p.id);assert.equal(result.blockers.some(b=>b.code==='FINAL_READ_CHANGED'),false);assert.equal(result.accounting.snapshotReads.fetchedSnapshots,4);
 f.replace(f.p);mutation='semantic';result=await reader.readSnapshot(f.p.id);assert.ok(result.blockers.some(b=>b.code==='FINAL_READ_CHANGED'));assert.ok(result.retained.registeredProject);
});
test('actual final guard budget exhaustion retains earlier reader facts and is blocked on constructed fixture',async t=>{
 const f=owned(t);
 const content={async contentLayoutInput(id){f.store.read(id);throw domain();},async verifyLayoutPreparation(id){f.store.read(id);throw domain();}};
 const result=await f.reader(content,f.admissionStore(policy=>({...policy,readAttempts:2}))).readSnapshot(f.p.id);assert.equal(result.accounting.snapshotReads.fetchedSnapshots,2);assert.equal(result.accounting.snapshotReads.readAttempts,4);assert.ok(result.blockers.some(b=>b.code==='SNAPSHOT_READ_COUNT_LIMIT'));assert.ok(result.retained.registeredProject);assert.ok(result.retained.checkedOriginals);assert.ok(result.blockers.some(b=>b.code==='CONTENT_LAYOUT_SOURCE_UNAVAILABLE'));assert.equal(result.kind,'blocked');
});
test('actual reader catches head advance and edition reader maps admission refusal on constructed fixture',async t=>{
 const f=owned(t),content={async contentLayoutInput(id){const next={...f.p,revision:1};f.sql.prepare('INSERT INTO revisions VALUES(?,?,?)').run(id,1,JSON.stringify(next));f.sql.prepare('UPDATE heads SET revision=1 WHERE project_id=?').run(id);throw domain();},async verifyLayoutPreparation(id){f.store.read(id);throw domain();}};
 const result=await f.reader(content).readSnapshot(f.p.id);assert.ok(result.blockers.some(b=>b.code==='FINAL_READ_CHANGED'));
 const editions=createFinalEditionReader({store:f.store,root:f.root,content,pythonBinary:'/constructed/no-decoder-execution'});
 const out=await f.store.withReadAdmission(f.p.id,{...limits,snapshotBytes:1},()=>editions.read(f.p.id));assert.equal(out.kind,'refused');assert.equal(out.value.kind,'blocked');assert.ok(out.value.blockers.some(b=>b.code==='SNAPSHOT_READ_SIZE_LIMIT'));
 const count=await f.store.withReadAdmission(f.p.id,{...limits,readAttempts:1},()=>{f.store.read(f.p.id);return editions.read(f.p.id);});assert.equal(count.kind,'refused');assert.equal(count.value.kind,'blocked');assert.ok(count.value.blockers.some(b=>b.code==='SNAPSHOT_READ_COUNT_LIMIT'));
});
test('genuine content visual review and sketch factories share actual store admission on constructed incomplete metadata',async t=>{
 const f=owned(t),base={store:f.store,root:f.root,providers:{},bindings:{},imageStore:f.imageStore};
 const sketches=createSketchRuntime({...base,references:{}}),sketchReviews=createSketchReviewRuntime({...base,sketches}),finalVisuals=createFinalVisualRuntime({...base,sketchReviews}),content=createCompleteContentRuntime({...base,finalVisuals});
 const result=await f.reader(content).readSnapshot(f.p.id);
 assert.ok(result.retained.registeredProject);assert.ok(result.accounting.snapshotReads.readAttempts>=6);assert.ok(result.blockers.some(b=>b.code==='CONTENT_LAYOUT_SOURCE_UNAVAILABLE'));assert.equal(result.executionAvailable,false);
 const noEnrichment=await f.store.withReadAdmission(f.p.id,{...limits,readAttempts:2},async()=>{try{await content.contentLayoutInput(f.p.id);}catch{}return {retained:'caught content result'};});assert.equal(noEnrichment.code,'SNAPSHOT_READ_COUNT_LIMIT');assert.equal(noEnrichment.usage.fetchedSnapshots,2);assert.equal(noEnrichment.value.retained,'caught content result');
 const visual=await f.store.withReadAdmission(f.p.id,limits,()=>finalVisuals.verifyFinalVisual(f.p.id,{finalVisual:{runId:'missing'}}));assert.equal(visual.usage.fetchedSnapshots,1);assert.equal(visual.code,'FINAL_RUN_REQUIRED');
 const sketch=await f.store.withReadAdmission(f.p.id,limits,()=>sketchReviews.verifyReviewedSketch(f.p.id,{sketchGeneration:{reviewRunId:'missing'}}));assert.equal(sketch.usage.fetchedSnapshots,1);assert.equal(sketch.code,'REVIEW_V2_REQUIRED');
});

test('actual inspectBasis captures frozen pre-reservation planning revision inside the same admission',async t=>{
 const {configure,reserve}=await import('./final-review-phase-fixture.mjs');
 const f=owned(t),o=metadataFixture(),planning=configure(o),current=reserve(planning,o.plan);
 f.sql.exec('DELETE FROM heads;DELETE FROM revisions');
 for(const p of [planning,current])f.sql.prepare('INSERT INTO revisions VALUES(?,?,?)').run(p.id,p.revision,JSON.stringify(p));f.sql.prepare('INSERT INTO heads VALUES(?,?)').run(current.id,current.revision);
 const content={async contentLayoutInput(){throw domain();},async verifyLayoutPreparation(){throw domain();}};
 const result=f.reader(content).inspectBasis(current.id);assert.equal(result.observedRevision,current.revision);assert.equal(result.planningRevision,planning.revision);assert.equal(result.accounting.snapshotReads.fetchedSnapshots,2);assert.equal(result.accounting.snapshotReads.readAttempts,2);assert.equal(result.finalAuthorityAvailable,false);
});

test('actual selected coordinator admits two exact command-addressed revisions sequentially on constructed invalid owner originals',async t=>{
 const {verifySelectedOriginals}=await import('./final-selected-originals.mjs');const f=owned(t),reports=[{id:'owned-first',jobId:'owner-job-1',attemptId:'owner-attempt-1'},{id:'owned-second',jobId:'owner-job-2',attemptId:'owner-attempt-2'}];
 const planning={...f.p,revision:2,ownerReports:reports,audit:reports.map((r,i)=>({commandId:'owned-completion-'+i,kind:'complete-owner',revision:i+1})),processedCommands:Object.fromEntries(reports.map((r,i)=>['owned-completion-'+i,JSON.stringify({commandId:'owned-completion-'+i,kind:'complete-owner',reportId:r.id,jobId:r.jobId,attemptId:r.attemptId})]))};
 f.sql.exec('DELETE FROM heads;DELETE FROM revisions');for(const revision of [1,2])f.sql.prepare('INSERT INTO revisions VALUES(?,?,?)').run(planning.id,revision,JSON.stringify({...planning,revision}));f.sql.prepare('INSERT INTO heads VALUES(?,?)').run(planning.id,2);
 const nodes=reports.map((r,i)=>({identity:'owner-'+i,domain:'report:owner',recordId:r.id,originalPointer:'/ownerReports/'+i,recordHash:sketchHash(JSON.stringify(r))})),addressed=[],prepare=DatabaseSync.prototype.prepare;
 DatabaseSync.prototype.prepare=function(sql){const stmt=prepare.call(this,sql);if(!sql.includes('CASE WHEN typeof(snapshot)=?'))return stmt;const get=stmt.get.bind(stmt);stmt.get=(...args)=>{addressed.push(args.at(-1));return get(...args);};return stmt;};t.after(()=>{DatabaseSync.prototype.prepare=prepare;});
 const out=await f.store.withReadAdmission(planning.id,limits,()=>verifySelectedOriginals({store:f.store,planning,index:{nodes},selected:{nodeIdentities:nodes.map(n=>n.identity)},executionRoot:f.root,imageStore:f.imageStore,current:()=>{}}));
 assert.equal(out.kind,'complete');assert.deepEqual(addressed,[1,2]);assert.equal(out.usage.fetchedSnapshots,2);assert.equal(out.value.facts.length,0);assert.equal(out.value.blockers.length,2);assert.ok(out.value.blockers.every(b=>b.code!=='FINAL_HISTORY_SNAPSHOT_ALLOCATION_ADMISSION_REQUIRED'));
});
