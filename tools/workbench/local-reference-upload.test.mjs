import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from './store.mjs';
import {createImageEvidenceStore} from './image-evidence.mjs';
import {referenceFixturePng} from './reference-dossier-fixtures.mjs';
import {createLocalReferenceUpload} from './local-reference-upload.mjs';
async function fixture(t){
 const root=await realpath(await mkdtemp(join(tmpdir(),'local-reference-upload-'))),databasePath=join(root,'projects.sqlite');let store=openStore(databasePath),ingests=0;
 t.after(async()=>{store.close();await rm(root,{recursive:true,force:true});});
 store.create({id:'p',name:'Synthetic upload component only',brief:'A supplied image is not factual evidence',mode:'assisted'},{actorType:'human',actorId:'upload-test',runId:'create',contextId:'create'});
 const actualImages=createImageEvidenceStore({rootDir:join(root,'images')}),images={...actualImages,ingest:async input=>{ingests++;return actualImages.ingest(input);}};
 const readCase=async id=>{assert.equal(id,'case-one');return {id,projectId:'p',initializationState:'ready',nextAction:{module:'brief',status:'awaiting_user'}};};
 const request={commandId:'user-image-one',expectedRevision:0,base64:referenceFixturePng(1).toString('base64'),metadata:{representation:'supplied_image',originalFilename:'synthetic-test.png',description:'Synthetic user submission; not reviewed or verified.'}};
 return {request,images,readCase,get store(){return store;},get ingests(){return ingests;},upload:()=>createLocalReferenceUpload({projectStore:store,imageStore:images,readCase}),reopen(){store.close();store=openStore(databasePath);}};
}
test('actual uploaded bytes survive native registration and reopening without becoming facts or approved references',async t=>{
 const f=await fixture(t),before=f.store.read('p'),first=await f.upload()('case-one',f.request);assert.equal(first.reused,false);assert.equal(first.factualAuthority,false);assert.equal(first.semanticReviewVerified,false);assert.equal(first.referenceReviewRequired,true);
 const p=f.store.read('p');assert.equal(p.imageAssets.length,1);assert.deepEqual(p.verifications,before.verifications);assert.deepEqual(p.releases,before.releases);assert.deepEqual(p.referenceMaterials,before.referenceMaterials);assert.deepEqual(p.taskCards,before.taskCards);assert.equal(f.ingests,1);
 f.reopen();const replay=await f.upload()('case-one',f.request);assert.equal(replay.reused,true);assert.deepEqual(replay.asset,first.asset);assert.equal(f.ingests,1);assert.equal(f.store.read('p').imageAssets.length,1);
 assert.deepEqual((await f.images.read({projectId:'p',imageId:first.asset.id,expectedHash:first.asset.sha256})).bytes,Buffer.from(f.request.base64,'base64'));
});
test('paths, noncanonical bytes, unsupported truth claims and stale uploads cannot create native records',async t=>{
 const f=await fixture(t),upload=f.upload();
 for(const patch of [{path:'/private/secret.png'},{base64:'!invalid'},{expectedRevision:99},{metadata:{representation:'supplied_image',verified:true}}])await assert.rejects(()=>upload('case-one',{...f.request,...patch}));
 assert.equal(f.store.read('p').imageAssets.length,0);assert.equal(Object.hasOwn(f.store.read('p').processedCommands,f.request.commandId),false);
});
test('a lost native registration response recovers the actual original instead of registering another image',async t=>{
 const f=await fixture(t);let commands=0;
 const projectStore={read:(...a)=>f.store.read(...a),command:(...a)=>{const result=f.store.command(...a);commands++;throw Object.assign(Error('lost committed registration'),{code:'TEST_COMMITTED_UPLOAD'});}};
 const result=await createLocalReferenceUpload({projectStore,imageStore:f.images,readCase:f.readCase})('case-one',f.request);assert.equal(result.reused,true);assert.equal(commands,1);assert.equal(f.ingests,1);
 await f.upload()('case-one',f.request);assert.equal(f.ingests,1);assert.equal(f.store.read('p').imageAssets.length,1);
});
test('concurrent exact uploads share one ingestion and another body cannot reuse its command',async t=>{
 const f=await fixture(t),upload=f.upload(),first=upload('case-one',f.request),second=upload('case-one',f.request);
 await assert.rejects(()=>upload('case-one',{...f.request,metadata:{representation:'supplied_image',description:'different input'}}),{code:'LOCAL_UPLOAD_COMMAND_REUSED'});
 const [a,b]=await Promise.all([first,second]);assert.deepEqual(a,b);assert.equal(f.ingests,1);assert.equal(f.store.read('p').imageAssets.length,1);
});
