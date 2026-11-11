import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from './store.mjs';
import {openLocalAcceptanceCoordinator} from './local-acceptance-coordinator.mjs';
test('actual coordinator and native SQLite preserve invalid reference rejection across reopen',async t=>{
 const root=await mkdtemp(join(tmpdir(),'reference-rejection-native-')),store=openStore(join(root,'native.sqlite'));let calls=0;
 const config={databasePath:join(root,'workflow.sqlite'),projectStore:store,executor:{},executionRoot:root,imageStore:{read:async()=>{calls++;throw Error('unexpected image read');},ingest:async()=>{calls++;throw Error('unexpected ingest');}}};
 let coor=openLocalAcceptanceCoordinator(config);t.after(async()=>{coor.close();store.close();await rm(root,{recursive:true,force:true});});
 const created=await coor.create({commandId:'create',caseId:'dexian',brief:'得闲，25岁社交使用，度数未定',mode:'assisted',checkpoints:['references']}),before=store.read(created.projectId);
 const bad={commandId:'invalid-purpose',expectedRevision:before.revision};
 await assert.rejects(()=>coor.submitReferenceMaterial(created.id,bad),{code:'LOCAL_REFERENCE_MATERIAL_FIELDS_INVALID'});
 const receipt=await coor.readReferenceCommand(created.id,bad.commandId);assert.equal(receipt.state,'rejected_before_native_dispatch');assert.equal(receipt.operation,'reference_material');
 coor.close();coor=openLocalAcceptanceCoordinator(config);assert.deepEqual(await coor.readReferenceCommand(created.id,bad.commandId),receipt);
 await assert.rejects(()=>coor.submitReferenceMaterial(created.id,{...bad,expectedRevision:before.revision+1}),{code:'REFERENCE_ADMISSION_COMMAND_REUSED'});
 const next={commandId:'next-purpose',expectedRevision:before.revision,artifactId:'not-a-released-copy',copyContentHash:'0'.repeat(64),imageId:'missing',imageSha256:'1'.repeat(64),directionId:'a',kind:'direction',applicabilityProfile:'direction',borrowingNote:'仅参考构图'};
 await assert.rejects(()=>coor.submitReferenceMaterial(created.id,next),{code:'LOCAL_REFERENCE_MATERIAL_COPY_CHANGED'});
 assert.equal((await coor.readReferenceCommand(created.id,next.commandId)).reason,'LOCAL_REFERENCE_MATERIAL_COPY_CHANGED');
 assert.equal(calls,0);assert.deepEqual(store.read(created.projectId),before);
});

test('native commit followed by workflow rollback recovers committed upload, never negative receipt',async t=>{
 const {createImageEvidenceStore}=await import('./image-evidence.mjs');
 const {referenceFixturePng}=await import('./reference-dossier-fixtures.mjs');
 const root=await realpath(await mkdtemp(join(tmpdir(),'reference-two-db-'))),nativePath=join(root,'native.sqlite');let store=openStore(nativePath),fail=true,coor;
 const wrapped={read:(...args)=>store.read(...args),create:(...args)=>store.create(...args),command:(...args)=>{const result=store.command(...args);if(args[1].kind==='register-image'&&fail){fail=false;throw Object.assign(Error('failure after native commit'),{code:'INJECTED_AFTER_NATIVE_COMMIT',status:409});}return result;}};
 const config={databasePath:join(root,'workflow.sqlite'),projectStore:wrapped,executor:{},executionRoot:root,imageStore:createImageEvidenceStore({rootDir:join(root,'images')})};
 coor=openLocalAcceptanceCoordinator(config);t.after(async()=>{coor.close();store.close();await rm(root,{recursive:true,force:true});});
 const created=await coor.create({commandId:'create',caseId:'dexian',brief:'Synthetic two database interruption test',mode:'assisted',checkpoints:['references']}),before=store.read(created.projectId);
 const request={commandId:'upload',expectedRevision:before.revision,base64:referenceFixturePng(1).toString('base64'),metadata:{representation:'supplied_image',originalFilename:'test.png',description:'Synthetic engineering fixture only'}};
 const result=await coor.uploadReference(created.id,request);assert.equal(result.reused,true);
 const after=store.read(created.projectId);assert.equal(after.imageAssets.length,1);assert.equal(after.revision,before.revision+1);
 const receipt=await coor.readReferenceCommand(created.id,'upload');assert.equal(receipt.state,'committed');
 coor.close();store.close();store=openStore(nativePath);coor=openLocalAcceptanceCoordinator(config);
 const replay=await coor.uploadReference(created.id,request);assert.equal(replay.asset.id,result.asset.id);assert.equal(store.read(created.projectId).revision,after.revision);assert.equal((await coor.readReferenceCommand(created.id,'upload')).state,'committed');
});
test('ingested bytes survive source conflict; synchronous guard yields rejection and corrected request succeeds',async t=>{
 const {createImageEvidenceStore}=await import('./image-evidence.mjs'),{referenceFixturePng}=await import('./reference-dossier-fixtures.mjs');
 const root=await realpath(await mkdtemp(join(tmpdir(),'reference-ingest-conflict-'))),store=openStore(join(root,'native.sqlite')),images=createImageEvidenceStore({rootDir:join(root,'images')});let conflict=true,firstAsset;
 const imageStore={...images,ingest:async input=>{const asset=await images.ingest(input);if(conflict){conflict=false;firstAsset=asset;store.command(input.projectId,{kind:'register-image',asset,commandId:'concurrent-upload',expectedRevision:store.read(input.projectId).revision},{actorType:'agent',actorId:'image-ingestion',runId:'test',contextId:'test'});}return asset;}};
 const coor=openLocalAcceptanceCoordinator({databasePath:join(root,'workflow.sqlite'),projectStore:store,executor:{},executionRoot:root,imageStore});t.after(async()=>{coor.close();store.close();await rm(root,{recursive:true,force:true});});
 const c=await coor.create({commandId:'create',caseId:'dexian',brief:'Synthetic ingestion source conflict',mode:'assisted'}),request={commandId:'first',expectedRevision:c.projectRevision,base64:referenceFixturePng(3).toString('base64'),metadata:{representation:'supplied_image',description:'Synthetic engineering fixture'}};
 await assert.rejects(()=>coor.uploadReference(c.id,request),{code:'LOCAL_REFERENCE_REGISTRATION_STALE'});
 const negative=await coor.readReferenceCommand(c.id,'first');assert.equal(negative.state,'rejected_before_native_dispatch');assert.equal(negative.managedFiles,'may_exist');assert.ok((await images.read({projectId:c.projectId,imageId:firstAsset.id,expectedHash:firstAsset.sha256})).bytes.length>0);
 const corrected=await coor.uploadReference(c.id,{...request,commandId:'corrected',expectedRevision:store.read(c.projectId).revision});assert.equal(corrected.reused,false);assert.equal((await coor.readReferenceCommand(c.id,'corrected')).state,'committed');
});
