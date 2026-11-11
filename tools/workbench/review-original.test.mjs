import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rename,symlink,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {openStore} from './store.mjs';
import {prepareStrategy} from './owner-edge-fixtures.mjs';
import {revisionSources,validateStoredReview} from './project.mjs';
import {tmpdir} from 'node:os';
import {correctionSources} from './correction.mjs';
import {verifyReviewOriginal} from './review-original.mjs';

test('real local executor verification and creative reports over imported research',async t=>{
 const root=await mkdtemp(join(tmpdir(),'review-original-fixture-')),store=openStore(join(root,'db'));t.after(()=>store.close());
 const f=await prepareStrategy({store,root}),p=store.read('p'),revision=p.revision;
 assert.equal(p.artifacts.find(a=>a.id==='research').provenance,'imported_metadata');
 const publicSources=[...p.verifications.map(report=>validateStoredReview(p,'verification',report).source),...p.creativeReports.map(report=>validateStoredReview(p,'creative_panel',report).source)];
 assert.ok(p.verifications.length>0);assert.ok(p.creativeReports.length>0);
 const aggregate=revisionSources(p,f.artifactId);
 assert.equal(aggregate.length,publicSources.length);
 assert.deepEqual(aggregate,correctionSources(publicSources));
 assert.deepEqual(aggregate.map(source=>source.reportId).sort(),[...p.verifications,...p.creativeReports].map(report=>report.id).sort());
 for(const [kind,reports] of [['verification',p.verifications],['creative_panel',p.creativeReports]])for(const report of reports){
  const result=await verifyReviewOriginal(p,kind,report,{executionRoot:root});assert.equal(result.identity.reportId,report.id);assert.deepEqual(result.source,validateStoredReview(p,kind,report).source);
 }
 const report=p.verifications[0];
 f.send({kind:'revise-task-card',taskCardId:'new-scope',brief:'Different bounded creative brief.'});
 const historical=store.read('p',revision);assert.equal((await verifyReviewOriginal(historical,'verification',report,{executionRoot:root})).identity.reportId,report.id);
 for(const [label,mutate] of [
 ['missing registration',x=>x.verifications=[]],['duplicate registration',x=>x.verifications.push(structuredClone(report))],
 ['duplicate job',x=>x.jobs.push(structuredClone(x.jobs.find(j=>j.id===report.jobId)))],
 ['failed attempt',x=>x.jobs.find(j=>j.id===report.jobId).attempts[0].status='failed'],
 ['raw response changed',x=>x.verifications[0].executionReceipt.responseText='{}'],
 ['wrong hash',x=>x.verifications[0].reportHash='0'.repeat(64)],
 ['wrong output path',x=>x.verifications[0].payloadRef=join(root,'another.json')]
 ])await t.test(label,async()=>{const x=structuredClone(p);mutate(x);await assert.rejects(verifyReviewOriginal(x,'verification',x.verifications[0]??report,{executionRoot:root}));});
 await t.test('unrelated later report does not invalidate selected original',async()=>{const x=structuredClone(p);x.verifications.push({...report,id:'later',jobId:'missing'});await verifyReviewOriginal(x,'verification',report,{executionRoot:root});assert.throws(()=>revisionSources(x,f.artifactId));});
 await t.test('unsupported imported review remains refused',()=>{const x=structuredClone(p);x.reviews.push({id:'manual',artifactId:f.artifactId});assert.throws(()=>revisionSources(x,f.artifactId),{code:'UNSUPPORTED_CORRECTION_SOURCE'});assert.throws(()=>validateStoredReview(x,'manual',report),{code:'UNSUPPORTED_CORRECTION_SOURCE'});});
 for(const path of [join(root,report.attemptId,'packet.json'),report.payloadRef,p.artifacts.find(a=>a.id===f.artifactId).payloadRef])await t.test('changed '+path.split('/').at(-1),async()=>{const old=await readFile(path);try{await writeFile(path,'{}');await assert.rejects(verifyReviewOriginal(p,'verification',report,{executionRoot:root}));}finally{await writeFile(path,old);}});
 await t.test('bounded read and symlink refusal',async()=>{const path=join(root,report.attemptId,'packet.json'),old=await readFile(path);try{await writeFile(path,Buffer.alloc(8*1024*1024+1));await assert.rejects(verifyReviewOriginal(p,'verification',report,{executionRoot:root}),{code:'LAYOUT_MANAGED_BYTES_REQUIRED'});}finally{await writeFile(path,old);}await rename(path,path+'.saved');try{await symlink(path+'.saved',path);await assert.rejects(verifyReviewOriginal(p,'verification',report,{executionRoot:root}),{code:'LAYOUT_SYMLINK_REFUSED'});}finally{await unlink(path);await rename(path+'.saved',path);}});
});
