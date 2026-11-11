import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from './store.mjs';
import {createImageEvidenceStore} from './image-evidence.mjs';
import {referenceFixturePng} from './reference-dossier-fixtures.mjs';
import {createLocalReferenceUpload,localReferenceUploadRequest} from './local-reference-upload.mjs';
async function fixture(t){
 const root=await realpath(await mkdtemp(join(tmpdir(),'local-reference-upload-'))),databasePath=join(root,'projects.sqlite');let store=openStore(databasePath),ingests=0;
 t.after(async()=>{store.close();await rm(root,{recursive:true,force:true});});
 store.create({id:'p',name:'Synthetic upload component only',brief:'A supplied image is not factual evidence',mode:'assisted'},{actorType:'human',actorId:'upload-test',runId:'create',contextId:'create'});
 const actualImages=createImageEvidenceStore({rootDir:join(root,'images')}),images={...actualImages,ingest:async input=>{ingests++;return actualImages.ingest(input);}};
 const readCase=async id=>{assert.equal(id,'case-one');return {id,projectId:'p',initializationState:'ready',nextAction:{module:'brief',status:'awaiting_user'}};};
 const request={commandId:'user-image-one',expectedRevision:0,base64:referenceFixturePng(1).toString('base64'),metadata:{representation:'supplied_image',originalFilename:'synthetic-test.png',description:'Synthetic user submission; not reviewed or verified.'}};
 return {request,images,readCase,get store(){return store;},get ingests(){return ingests;},upload:()=>createLocalReferenceUpload({projectStore:store,imageStore:images,readCase}),reopen(){store.close();store=openStore(databasePath);}};
}

test('recovered original must bind the bytes actually requested, not merely command metadata',async t=>{
 const f=await fixture(t),prepared=localReferenceUploadRequest(f.request),different=await f.images.ingest({projectId:'p',bytes:referenceFixturePng(2),metadata:f.request.metadata});
 assert.notEqual(different.sha256,prepared.uploadRequest.sha256);
 f.store.command('p',{kind:'register-image',asset:different,uploadRequest:prepared.uploadRequest,commandId:f.request.commandId,expectedRevision:0},{actorType:'agent',actorId:'image-ingestion',runId:'explicit-negative-fixture',contextId:'explicit-negative-fixture'});
 await assert.rejects(()=>f.upload()('case-one',f.request),{code:'LOCAL_UPLOAD_ORIGINAL_CHANGED'});assert.equal(f.store.read('p').imageAssets.length,1);assert.equal(f.ingests,1);
});
test('pending contribution and reconciliation block new ingestion before bytes or native registration',async t=>{
 const f=await fixture(t);for(const change of [{pendingContinuation:{status:'pending_revision'}},{nextAction:{status:'awaiting_reconciliation'}}]){const upload=createLocalReferenceUpload({projectStore:f.store,imageStore:f.images,readCase:async id=>({id,projectId:'p',initializationState:'ready',nextAction:{status:'pending'},...change})});await assert.rejects(()=>upload('case-one',f.request),{code:'LOCAL_UPLOAD_CASE_BUSY'});}
 assert.equal(f.ingests,0);assert.equal(f.store.read('p').imageAssets.length,0);
});
test('case mismatch and cross-project replay cannot transfer the original asset or its authority',async t=>{
 const f=await fixture(t),first=await f.upload()('case-one',f.request);f.store.create({id:'other',name:'Other explicit test',brief:'No transferred image',mode:'assisted'},{actorType:'human',actorId:'upload-test',runId:'other',contextId:'other'});
 const upload=createLocalReferenceUpload({projectStore:f.store,imageStore:f.images,readCase:async id=>({id,projectId:'other',initializationState:'ready',nextAction:{status:'pending'}})}),second=await upload('case-two',f.request);
 assert.equal(second.asset.projectId,'other');assert.notEqual(second.asset.id,first.asset.id);assert.equal(second.factualAuthority,false);assert.equal(second.referenceReviewRequired,true);
 const wrong=createLocalReferenceUpload({projectStore:f.store,imageStore:f.images,readCase:async()=>({id:'case-one',projectId:'p'})});await assert.rejects(()=>wrong('case-two',f.request),{code:'LOCAL_UPLOAD_CASE_REQUIRED'});
});

test('first ingestion returning different actual bytes is rejected before native registration',async t=>{
 const f=await fixture(t),images={...f.images,ingest:async()=>f.images.ingest({projectId:'p',bytes:referenceFixturePng(2),metadata:f.request.metadata})};
 const upload=createLocalReferenceUpload({projectStore:f.store,imageStore:images,readCase:f.readCase});
 await assert.rejects(()=>upload('case-one',f.request),{code:'LOCAL_UPLOAD_ORIGINAL_CHANGED'});
 assert.equal(f.store.read('p').imageAssets.length,0);assert.equal(Object.hasOwn(f.store.read('p').processedCommands,f.request.commandId),false);
});
