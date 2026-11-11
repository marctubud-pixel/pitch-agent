import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,readFile,writeFile,chmod} from 'node:fs/promises';
import {join} from 'node:path';
import {openStore} from './store.mjs';
import {createIntakeRuntime} from './intake-runtime.mjs';
import {cardHash} from './intake-contract.mjs';
import {createImageEvidenceStore} from './image-evidence.mjs';
const pythonBinary='/Users/marc/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';
const human={actorType:'human',actorId:'synthetic-reviewer',runId:'review',contextId:'review'};
for(const variant of ['html','empty-html','pdf','image','corrupt-html'])test(`retained ${variant} URL original survives interrupted completion without recapture`,async t=>{
 const root=await realpath(await mkdtemp('/private/tmp/intake-local-recovery-'));t.diagnostic(root);
 const bytes=variant==='pdf'?await readFile(new URL('./fixtures/intake/mixed.pdf',import.meta.url)):variant==='image'?await readFile(new URL('./fixtures/intake/blue.png',import.meta.url)):Buffer.from(variant==='empty-html'?'<html><body></body></html>':'<html><body>Age 25. Packaging project with blue graphics.</body></html>');
 const mime=variant==='pdf'?'application/pdf':variant==='image'?'image/png':'text/html';
 let calls=0,fail=true,store=openStore(join(root,'db'));t.after(()=>store.close());store.create({id:'synthetic',name:'Synthetic recovery',brief:'Packaging'},human);
 const options={root,configuration:{pythonBinary},providers:{synthetic:{model:'synthetic',execute(){throw Error('model must not run');}}},bindings:{intake:{providerId:'synthetic',model:'synthetic',role:'intake'}},imageStore:createImageEvidenceStore({rootDir:join(root,'images'),pythonBinary})};
 const first=createIntakeRuntime({...options,store:{...store,command(id,c,ctx){if(c.kind==='intake-complete'&&fail){fail=false;throw Error('Injected completion commit failure');}return store.command(id,c,ctx);}},acquisitionDependencies:{lookup:async()=>[{address:'93.184.216.34',family:4}],transport:async()=>{calls++;return {status:200,headers:{'content-type':mime},body:bytes};}}});
 const registered=await first.capture('synthetic',{url:'https://example.test/source',commandId:'capture',expectedRevision:0});await first.execute('synthetic',registered.jobId);
 let p=store.read('synthetic');assert.equal(p.jobs[0].status,'failed');assert.equal(p.intakeDocuments[0].extraction,undefined);const original=structuredClone(p.intakeDocuments[0]),capture=structuredClone(p.sourceCaptures[0]),image=structuredClone(p.imageAssets[0]);
 store.close();store=openStore(join(root,'db'));
 const second=createIntakeRuntime({...options,store,acquisitionDependencies:{lookup:async()=>{throw Error('must not recapture');},transport:async()=>{throw Error('must not recapture');}}});
 if(variant==='corrupt-html'){const rawPath=join(root,'source-captures',capture.record.raw.file);await chmod(rawPath,0o600);await writeFile(rawPath,Buffer.alloc(bytes.length,65));}
 await second.humanAction('synthetic','intake-retry-local',{jobId:registered.jobId,commandId:'retry',expectedRevision:store.read('synthetic').revision},human);await second.execute('synthetic',registered.jobId);p=store.read('synthetic');assert.equal(calls,1);assert.deepEqual(p.sourceCaptures[0],capture);assert.deepEqual(p.intakeDocuments[0].origin,original.origin);assert.deepEqual(p.intakeDocuments[0].raw,original.raw);assert.equal(p.intakeDocuments[0].captureId,original.captureId);
 if(variant==='corrupt-html'){assert.equal(p.jobs[0].status,'failed');assert.equal(p.intakeDocuments[0].status,'failed');assert.equal(p.jobs[0].error.code,'DOCUMENT_CORRUPT');await assert.rejects(()=>second.requestExtraction('synthetic',{documentIds:[registered.documentId],baseTaskCardId:p.activeTaskCardId,baseTaskCardHash:cardHash(p.taskCards[0]),commandId:'extract',expectedRevision:p.revision}),{code:'DOCUMENT_CORRUPT'});return;}
 assert.equal(p.jobs[0].status,'succeeded');assert.equal(p.jobs[0].attempts.length,2);assert.equal(p.intakeDocuments[0].status,'ready');assert.deepEqual((await second.checkedDocument('synthetic',registered.documentId)).bytes,bytes);
 await second.requestExtraction('synthetic',{documentIds:[registered.documentId],baseTaskCardId:p.activeTaskCardId,baseTaskCardHash:cardHash(p.taskCards[0]),commandId:'extract',expectedRevision:p.revision});p=store.read('synthetic');const m=p.jobs.at(-1).task.input.materials[0];
 if(variant==='image'){assert.deepEqual(m.image,image);assert.equal(m.image.id,original.imageId);assert.equal(m.extraction,null);assert.equal(m.text,'');}
 else{assert.ok(m.extraction);assert.equal(m.extraction.rawHash,original.raw.sha256);assert.ok(m.extractionHash);if(variant==='empty-html'){assert.equal(m.text,'');assert.equal(m.extraction.status,'no_text');}else assert.match(m.text,/Packaging/);if(variant==='html')assert.equal(m.text,capture.record.extraction.text);if(variant==='pdf')assert.equal(m.extraction.pages.length,2);}
 const completed=structuredClone(p);await second.execute('synthetic',registered.jobId);assert.deepEqual(store.read('synthetic'),completed);await assert.rejects(()=>second.humanAction('synthetic','intake-retry-local',{jobId:registered.jobId,commandId:'retry-complete',expectedRevision:p.revision},human),{code:'UNSAFE_RETRY'});
});
test('a historical ready web document without extraction cannot freeze empty model evidence',async t=>{
 const root=await realpath(await mkdtemp('/private/tmp/intake-legacy-ready-')),store=openStore(join(root,'db'));t.after(()=>store.close());store.create({id:'synthetic',name:'Synthetic historical recovery',brief:'Packaging'},human);
 const runtime=createIntakeRuntime({root,store:{...store,command(id,c,ctx){if(c.kind==='intake-complete')delete c.document.extraction;return store.command(id,c,ctx);}},providers:{synthetic:{model:'synthetic'}},bindings:{intake:{providerId:'synthetic',model:'synthetic',role:'intake'}},imageStore:{},acquisitionDependencies:{lookup:async()=>[{address:'93.184.216.34',family:4}],transport:async()=>({status:200,headers:{'content-type':'text/html'},body:Buffer.from('<html><body>Packaging</body></html>')})}});
 const registered=await runtime.capture('synthetic',{url:'https://example.test/source',commandId:'capture',expectedRevision:0});await runtime.execute('synthetic',registered.jobId);const p=store.read('synthetic');assert.equal(p.jobs[0].status,'succeeded');assert.equal(p.intakeDocuments[0].status,'ready');assert.equal(p.intakeDocuments[0].extraction,undefined);
 await assert.rejects(()=>runtime.requestExtraction('synthetic',{documentIds:[registered.documentId],baseTaskCardId:p.activeTaskCardId,baseTaskCardHash:cardHash(p.taskCards[0]),commandId:'extract',expectedRevision:p.revision}),{code:'DOCUMENT_TEXT_UNAVAILABLE'});assert.deepEqual(store.read('synthetic'),p);
});
