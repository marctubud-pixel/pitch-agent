import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {referenceFixture} from './reference-dossier-fixtures.mjs';
import {referenceState,referenceJobCurrent} from './reference-dossier.mjs';
import {copyDeliveryEnvelope,applyCommand} from './project.mjs';

test('development copy continuation persists once and selected copy gate stops every reference owner before dispatch',async t=>{
 const f=await referenceFixture(t,{gates:['copy']});const request=f.request();const state=await f.executor.continueCopy('p',request);assert.equal(state.reason,'HUMAN_GATE');assert.equal(f.calls.length,0);assert.equal(f.store.read('p').referenceDossiers.length,0);
 await f.executor.continueCopy('p',request);assert.equal(f.store.read('p').referenceIntents.length,1);assert.equal(f.calls.length,0);
 const {readArtifactContent}=await import('./artifact-content.mjs'),directionId=(await readArtifactContent(f.store.read('p'),f.copyId,f.root)).content.directions[0].id;await submitDevelopmentMaterial(f,{directionId,index:30});const manual=await f.executor.continueCopy('p',{...f.request(),discoveryMode:'manual_supplied'});assert.equal(manual.reason,'HUMAN_GATE');assert.equal(f.calls.length,0);assert.equal(f.transportCalls.length,0);
});

test('development actual assignment and substantive bilateral owners precede reference lead plan; restart never repeats completed slots',async t=>{
 const f=await referenceFixture(t);const state=await f.executor.continueCopy('p',f.request());assert.equal(state.status,'working',JSON.stringify(state));
 for(let i=0;i<4;i++){const jobs=await f.executor.advanceReferences('p');assert.equal(jobs.length,1,JSON.stringify({i,state:await f.executor.referenceStatus('p'),jobs:f.store.read('p').jobs.filter(j=>j.purpose==='reference')}));const result=await f.executor.execute('p',jobs[0]);assert.equal(result.status,'succeeded',JSON.stringify(result.error));f.executor=f.makeExecutor();}
 assert.deepEqual(f.calls.map(c=>c.input.kind),['assignment','copy-owner','reference-owner','plan']);
 const p=f.store.read('p'),d=p.referenceDossiers[0];assert.equal(d.reports.length,4);assert.equal(d.envelope.source.source.content.directions.length,3);assert.ok(d.envelope.source.upstreamOwnerReports.length===2);
 const collectors=await f.executor.advanceReferences('p');assert.equal(collectors.length,3);for(const id of collectors){const j=f.store.read('p').jobs.find(j=>j.id===id);assert.equal(j.task.parentId,d.id+':plan');assert.equal(j.task.envelopeHash,d.envelope.envelopeHash);assert.equal(Object.hasOwn(j.task,'envelope'),false);}
 const changed=structuredClone(p),job=changed.jobs.find(j=>j.nodeKey==='assignment');changed.referenceDossiers[0].envelope.source.source.content.directions[0].slogan='attack';assert.throws(()=>referenceJobCurrent(changed,job,copyDeliveryEnvelope));
});

test('development full dossier captures actual decoded originals, overlapping collector model branches, all 119 image reviews, diagnostic human gate and idempotent restart',async t=>{
 const {referenceReviewFixtureOutput}=await import('./reference-review-fixtures.mjs');
 let arrived=0,release;const barrier=new Promise(resolve=>release=resolve);
 const f=await referenceFixture(t,{gates:['references'],reviewOutput:referenceReviewFixtureOutput,providerHandler:async(input,request,output)=>{if(input.kind==='collector'){arrived++;if(arrived===3)release();await barrier;}return output;}});
 await f.executor.continueCopy('p',f.request());
 for(let turn=0;turn<30;turn++){
   const jobs=await f.executor.advanceReferences('p');if(!jobs.length)break;
   const results=await Promise.all(jobs.map(id=>f.executor.execute('p',id)));
   for(const result of results)assert.equal(result.status,'succeeded',JSON.stringify({node:result.nodeKey,error:result.error,state:await f.executor.referenceStatus('p')}));
 }
 const p=f.store.read('p'),d=p.referenceDossiers[0],state=await f.executor.referenceStatus('p');assert.equal(state.status,'choice_blocked',JSON.stringify(state));assert.equal(state.historyCoverage.blocks.length,135);assert.equal(state.originalAutomaticOutcome.status,'diagnostic');assert.equal(d.reports.length,129);assert.equal(d.candidates.length,6);
 assert.equal(d.tools.filter(t=>t.kind==='search').length,6);assert.equal(d.tools.filter(t=>t.kind==='image').length,6);assert.equal(new Set(d.candidates.map(c=>c.image.sha256)).size,6);
 assert.equal(state.originalAutomaticOutcome.selection.length,3);assert.equal(state.originalAutomaticOutcome.coverage.length,7);assert.ok(state.originalAutomaticOutcome.coverage.every(c=>c.status==='diagnostic'));
 const collectors=f.calls.filter(c=>c.input.kind==='collector');assert.equal(collectors.length,3);assert.ok(Math.max(...collectors.map(c=>c.started))<Math.min(...collectors.map(c=>c.ended)),'Three synthetic provider branches actually overlapped before completion');
 assert.equal(f.calls.filter(c=>c.input.protocolVersion==='reference-pixel-review-v1').length,119);assert.ok(f.calls.filter(c=>c.request.images).every(c=>c.request.images.length<=4));
 assert.ok(f.calls.filter(c=>c.input.phase?.endsWith('first_read')).every(c=>!c.input.uses&&!c.input.reports&&!c.input.taskFacts));
 const count=f.calls.length,searches=f.transportCalls.length;f.executor=f.makeExecutor();assert.deepEqual(await f.executor.advanceReferences('p'),[]);assert.equal(f.calls.length,count);assert.equal(f.transportCalls.length,searches);
 const invalid=structuredClone(p),target=invalid.referenceDossiers[0];target.reports[0].rawReport.assignment.objective='forged';target.reports[0].reportHash='a'.repeat(64);assert.equal(referenceState(invalid,target,{sourceEnvelope:copyDeliveryEnvelope}).status,'stale');
 assert.throws(()=>f.send({kind:'adopt-reference-selection',dossierId:d.id,selectionHash:state.originalAutomaticOutcome.selectionHash,reason:'Synthetic human action tests the trusted local UI boundary; not actual user approval.'}));
 assert.equal((await f.executor.referenceStatus('p')).status,'choice_blocked');assert.equal(f.store.read('p').jobs.some(j=>j.stage==='sketch'),false);assert.equal(f.store.read('p').referenceDossiers[0].reports.length,129);
 assert.throws(()=>f.send({kind:'adopt-reference-selection',dossierId:d.id,selectionHash:'forged',reason:'bad'}));
 const {unlink}=await import('node:fs/promises'),{join}=await import('node:path');await unlink(join(f.root,'images','objects',d.candidates[0].image.sha256));assert.equal((await f.executor.referenceStatus('p')).status,'blocked');assert.deepEqual(await f.executor.advanceReferences('p'),[]);assert.equal(f.calls.length,count);
});

test('development real server queue runs collector children without a held parent slot and never repeats an unknown provider outcome',async t=>{
 const {createServer}=await import('./server.mjs'),{join}=await import('node:path');
 let arrived=0,release;const barrier=new Promise(resolve=>release=resolve);
 const f=await referenceFixture(t,{providerHandler:async(input,request,output)=>{if(input.kind==='collector'){const p=f.store.read('p');assert.equal(p.jobs.find(j=>j.nodeKey==='plan').status,'succeeded');assert.equal(p.jobs.filter(j=>j.purpose==='reference'&&j.status==='running').every(j=>j.nodeKey.startsWith('collector-')),true);arrived++;if(arrived===2)release();await barrier;}if(input.kind==='merge')throw new Error('Synthetic unknown provider outcome after dispatch');return output;}});
 await f.executor.continueCopy('p',f.request());for(let i=0;i<4;i++)for(const id of await f.executor.advanceReferences('p'))assert.equal((await f.executor.execute('p',id)).status,'succeeded');
 await f.executor.advanceReferences('p');
 const options={dbPath:join(f.root,'db'),rootDir:f.root,providers:f.providers,bindings:f.bindings,creativeCalibrations:f.creativeCalibrations,referenceConfiguration:f.configuration,acquisitionDependencies:f.acquisitionDependencies,maxConcurrentJobs:2};
 const server=createServer(options);try{await server.drain();}finally{server.emit('close');}
 const collectors=f.calls.filter(c=>c.input.kind==='collector');assert.equal(collectors.length,3);assert.ok(collectors[0].started<collectors[1].ended&&collectors[1].started<collectors[0].ended,'Two actual queue-owned child calls overlap');
 const p=f.store.read('p'),unknown=p.jobs.filter(j=>j.purpose==='reference'&&j.status==='awaiting_reconciliation');assert.ok(unknown.length>0);assert.ok(unknown.every(j=>j.attempts.length===1&&j.attempts[0].dispatchStarted));assert.equal((await f.executor.referenceStatus('p')).status,'awaiting_reconciliation');
 const count=f.calls.length,searches=f.transportCalls.length,restarted=createServer(options);try{await restarted.drain();}finally{restarted.emit('close');}assert.equal(f.calls.length,count);assert.equal(f.transportCalls.length,searches);
});

async function submitDevelopmentMaterial(f,{directionId,index,kind='direction',profile='direction',imageId,borrowingNote='Synthetic human borrowing note; not actual user approval.'}){
 const {createImageEvidenceStore}=await import('./image-evidence.mjs'),{referenceFixturePng}=await import('./reference-dossier-fixtures.mjs'),{join}=await import('node:path');
 if(!imageId){const asset=await createImageEvidenceStore({rootDir:join(f.root,'images')}).ingest({projectId:'p',bytes:referenceFixturePng(index),metadata:{representation:'supplied_image',description:'Synthetic development upload'}});f.send({kind:'register-image',asset},{actorType:'agent',actorId:'synthetic-ingestor',runId:randomUUID(),contextId:randomUUID()});imageId=asset.id;}
 const request={artifactId:f.copyId,directionId,imageId,kind,applicabilityProfile:profile,borrowingNote,commandId:randomUUID(),expectedRevision:f.store.read('p').revision};
 return {material:await f.executor.submitReferenceMaterial('p',request,f.human),request};
}

test('development manual supplied originals and declared borrowing enter the same lead and pixel review without search credit',async t=>{
 const {referenceReviewFixtureOutput}=await import('./reference-review-fixtures.mjs'),{readArtifactContent}=await import('./artifact-content.mjs');
 const f=await referenceFixture(t,{budget:{maxModelCalls:516,maxSearchCalls:0},reviewOutput:referenceReviewFixtureOutput});f.configuration.capability.status='unavailable';f.executor=f.makeExecutor();
 const directions=(await readArtifactContent(f.store.read('p'),f.copyId,f.root)).content.directions.map(d=>d.id);
 const first=await submitDevelopmentMaterial(f,{directionId:directions[0],index:20});await submitDevelopmentMaterial(f,{directionId:directions[0],index:21,kind:'component',profile:'composition_component'});await submitDevelopmentMaterial(f,{directionId:directions[0],imageId:first.material.image.imageId,kind:'component',profile:'style_component'});
 assert.deepEqual(await f.executor.submitReferenceMaterial('p',first.request,f.human),first.material);assert.equal(f.store.read('p').referenceMaterials.length,3);assert.equal(f.calls.length,0);assert.equal(f.transportCalls.length,0);
 await assert.rejects(()=>f.executor.submitReferenceMaterial('p',{...first.request,commandId:randomUUID(),expectedRevision:f.store.read('p').revision},{actorType:'agent'}),{code:'HUMAN_REQUIRED'});
 const initial=await f.executor.continueCopy('p',{...f.request(),discoveryMode:'manual_supplied'});assert.equal(initial.status,'working',JSON.stringify(initial));
 for(let i=0;i<4;i++)for(const id of await f.executor.advanceReferences('p'))assert.equal((await f.executor.execute('p',id)).status,'succeeded');
 let p=f.store.read('p'),d=p.referenceDossiers[0];assert.equal(d.envelope.expandedPlan.searchCalls,0);assert.ok(d.reports.find(r=>r.nodeKey==='plan').rawReport.cards.every(c=>c.queries.length===0));
 for(const nodeKey of ['collector-0','merge-0','candidate-0:visual:first_read']){await f.executor.advanceReferences('p');const job=f.store.read('p').jobs.find(j=>j.dossierId===d.id&&j.nodeKey===nodeKey);assert.ok(job,nodeKey);const done=await f.executor.execute('p',job.id);assert.equal(done.status,'succeeded',JSON.stringify(done.error));}
 p=f.store.read('p');d=p.referenceDossiers[0];assert.equal(d.candidates.length,2);assert.equal(d.tools.length,0);assert.equal(f.transportCalls.length,0);assert.ok(d.candidates.every(c=>c.provenance.every(v=>v.kind==='manual_supplied'&&!v.searchId)));assert.equal(d.reports.find(r=>r.nodeKey==='collector-0').rawReport.materialDecisions.length,3);assert.equal(d.reports.find(r=>r.nodeKey==='collector-0').rawReport.uses.length,3);
 const firstRead=f.calls.find(c=>c.input.phase==='first_read');assert.equal(firstRead.request.images.length,2);assert.equal(Object.hasOwn(firstRead.input,'uses'),false);
 const saved=d.reports[0],bytes=await readFile(saved.payloadRef);await writeFile(saved.payloadRef,'{}');assert.equal((await f.executor.referenceStatus('p')).reason,'REFERENCE_CAPTURE_CHANGED');await writeFile(saved.payloadRef,bytes);
 f.send({kind:'set-reference-pause',dossierId:d.id,paused:true});await submitDevelopmentMaterial(f,{directionId:directions[1],index:22});assert.deepEqual(await f.executor.advanceReferences('p'),[]);assert.equal(f.store.read('p').referenceDossiers.length,1);
 f.send({kind:'set-reference-pause',dossierId:d.id,paused:false});await f.executor.advanceReferences('p');p=f.store.read('p');assert.equal(p.referenceDossiers.length,2);assert.equal(p.referenceDossiers[0].reports.length,7);assert.equal(p.referenceDossiers[1].priorUsage.modelCalls,7);assert.equal(p.referenceDossiers[1].priorUsage.searchCalls,0);assert.notEqual(p.referenceDossiers[0].envelope.envelopeHash,p.referenceDossiers[1].envelope.envelopeHash);
});

test('development original reference machine return opens the actual typed copy correction path without fabricated human feedback',async t=>{
 const {revisionSources}=await import('./project.mjs');
 const f=await referenceFixture(t,{providerHandler:async(input,request,output)=>input.kind==='assignment'?{...output,decision:'return',findings:[{id:'copy-message-ambiguity',category:'message',owner:'copy-lead',pointer:'/envelope/source/source/content/directions/0/slogan',evidence:['/envelope/source/source/content/directions/0/slogan'],impact:'Synthetic development message ambiguity.',acceptance:'The actual copy owner must resolve the named wording while retaining all original evidence limits.'}]}:output});
 await f.executor.continueCopy('p',f.request());const [jobId]=await f.executor.advanceReferences('p');assert.equal((await f.executor.execute('p',jobId)).status,'succeeded');assert.equal((await f.executor.referenceStatus('p')).status,'returned');assert.deepEqual(await f.executor.advanceReferences('p'),[]);
 const p=f.store.read('p'),source=revisionSources(p,p.activeByStage.copy).find(s=>s.kind==='reference');assert.ok(source);assert.equal(source.rawReport.findings[0].owner,'copy-lead');assert.equal(source.referenceSource.targetOwner,'copy-lead');assert.equal(p.humanFeedback.length,0);
 await assert.rejects(()=>f.executor.reviseReferences('p',{dossierId:p.referenceDossiers[0].id,commandId:randomUUID(),expectedRevision:p.revision}),/Upstream findings/u);
 const correctionId=await f.executor.enqueueRevision('p',{artifactId:f.copyId,commandId:randomUUID(),expectedRevision:f.store.read('p').revision}),correction=f.store.read('p').jobs.find(j=>j.id===correctionId);assert.equal(correction.stage,'copy');assert.ok(correction.task.ownerEdgeId);assert.ok(correction.task.correctionInput.sources.some(s=>s.kind==='reference'&&s.reportHash===source.reportHash));assert.equal(f.store.read('p').humanFeedback.length,0);
});
