import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {openStore} from './store.mjs';
import {createImageEvidenceStore,imageManifest} from './image-evidence.mjs';
import {referenceFixturePng} from './reference-dossier-fixtures.mjs';
import {createLocalReferenceUpload} from './local-reference-upload.mjs';
import {requestIdentityWire} from '../local-acceptance/request-identity.mjs';
import {createLocalReferenceCommandReader} from './local-reference-command-reader.mjs';
const hash=v=>createHash('sha256').update(v).digest('hex');
async function fixture(t){
 const root=await realpath(await mkdtemp(join(tmpdir(),'reference-command-reader-'))),databasePath=join(root,'projects.sqlite');let store=openStore(databasePath);
 t.after(async()=>{store.close();await rm(root,{recursive:true,force:true});});
 store.create({id:'p',name:'Receipt component fixture',brief:'Uploaded image is not an adopted reference',mode:'assisted'},{actorType:'human',actorId:'test',runId:'create',contextId:'create'});
 const images=createImageEvidenceStore({rootDir:join(root,'images')}),readCase=async caseId=>{assert.ok(['case-one','case-other'].includes(caseId));return {id:caseId,projectId:caseId==='case-one'?'p':'other',initializationState:'ready',nextAction:{status:'awaiting_user'}};};
 const request={commandId:'upload-one',expectedRevision:0,base64:referenceFixturePng(1).toString('base64'),metadata:{representation:'supplied_image',originalFilename:'synthetic.png',description:'Synthetic component image, not approved'}};
 const upload=createLocalReferenceUpload({projectStore:store,imageStore:images,readCase});await upload('case-one',request);
 const reader=(projectStore=store,imageStore=images)=>createLocalReferenceCommandReader({projectStore,imageStore,readCase,executionRoot:root});
 return {root,request,images,reader,get store(){return store;},reopen(){store.close();store=openStore(databasePath);}};
}
test('native upload command produces a wire-exact read-only receipt after reopen',async t=>{
 const f=await fixture(t),before=JSON.stringify(f.store.read('p')),a=await f.reader().read('case-one','upload-one');
 assert.equal(a.protocol,'local-reference-command-receipt-v1');assert.equal(a.operation,'reference_upload');assert.equal(a.state,'committed');assert.equal(a.requestDigest,hash(requestIdentityWire(f.request)));assert.equal(a.factualAuthority,false);assert.equal(a.referenceAdoptionVerified,false);assert.equal(a.committedRevision,1);assert.ok(a.identity.imageId);assert.equal(JSON.stringify(a).includes(f.request.base64),false);
 assert.equal(JSON.stringify(f.store.read('p')),before);f.reopen();assert.deepEqual(await f.reader().read('case-one','upload-one'),a);
});
test('missing command, wrong case, unsupported command and missing creation history cannot prove committed',async t=>{
 const f=await fixture(t);await assert.rejects(()=>f.reader().read('case-one','missing'),{code:'LOCAL_REFERENCE_COMMAND_NOT_FOUND'});
 await assert.rejects(()=>f.reader().read('case-other','upload-one'));
 const p=f.store.read('p');p.processedCommands['other-command']=JSON.stringify({kind:'not-a-reference-command'});
 const facade={read:(id,rev)=>rev===undefined?p:f.store.read(id,rev)};
 await assert.rejects(()=>f.reader(facade).read('case-one','other-command'),{code:'LOCAL_REFERENCE_COMMAND_UNSUPPORTED'});
 p.audit=[];await assert.rejects(()=>f.reader(facade).read('case-one','upload-one'),{code:'LOCAL_REFERENCE_COMMAND_HISTORY_INVALID'});
});
test('matching image metadata with wrong original bytes and changed historical command both reject',async t=>{
 const f=await fixture(t),images={read:async input=>{const loaded=await f.images.read(input);return {...loaded,bytes:new Uint8Array(loaded.bytes.byteLength)};}};
 await assert.rejects(()=>f.reader(f.store,images).read('case-one','upload-one'),{code:'LOCAL_REFERENCE_COMMAND_IMAGE_CHANGED'});
 const p=f.store.read('p');p.processedCommands['upload-one']=p.processedCommands['upload-one'].replace('synthetic.png','different.png');
 await assert.rejects(()=>f.reader({read:(id,rev)=>rev===undefined?p:f.store.read(id,rev)}).read('case-one','upload-one'),{code:'LOCAL_REFERENCE_COMMAND_HISTORY_INVALID'});
});
async function materialHistory(f){
 const base=f.store.read('p'),asset=base.imageAssets[0],contentText=JSON.stringify({directions:[{id:'steady',title:'Synthetic direction'}]}),artifact={id:'copy-fixture',stage:'copy',contentHash:hash(contentText),payloadRef:join(f.root,'copy-fixture.json')};await writeFile(artifact.payloadRef,contentText);
 base.artifacts.push(artifact);base.activeByStage.copy=artifact.id;
 const request={commandId:'material-one',expectedRevision:1,artifactId:artifact.id,copyContentHash:artifact.contentHash,imageId:asset.id,imageSha256:asset.sha256,directionId:'steady',kind:'direction',applicabilityProfile:'direction',borrowingNote:'Borrow only spatial hierarchy. This is a constructed history fixture.'};
 const {copyContentHash,imageSha256,...native}=request,command={kind:'record-reference-material',request:native,copyContents:contentText,commandId:request.commandId};
 const creation={id:request.commandId,artifactId:artifact.id,copyContentHash,directionId:request.directionId,image:{...imageManifest([{...asset,imageId:asset.id}])[0],width:asset.width,height:asset.height},kind:request.kind,applicabilityProfile:request.applicabilityProfile,borrowingNote:request.borrowingNote,provenance:{kind:'manual_supplied',submittedBy:'local-acceptance-user'},request:native};
 const created=structuredClone(base);created.revision=2;created.processedCommands[request.commandId]=JSON.stringify(command);created.audit.push({commandId:request.commandId,kind:command.kind,actorId:'local-acceptance-user',revision:2,at:null});created.referenceMaterials=[creation];
 let current=structuredClone(created);const snapshots=new Map([[1,base],[2,created]]),store={read:(id,revision)=>{assert.equal(id,'p');const value=revision===undefined?current:snapshots.get(revision);assert.ok(value);return structuredClone(value);}};
 return {request,store,snapshots,get current(){return current;},set current(v){current=v;}};
}
test('constructed material history binds raw copy and image and preserves historical/removed lifecycle',async t=>{
 const f=await fixture(t),m=await materialHistory(f),reader=f.reader(m.store),first=await reader.read('case-one','material-one');assert.equal(first.operation,'reference_material');assert.equal(first.requestDigest,hash(requestIdentityWire(m.request)));assert.equal(first.identity.disposition,'registered_unassessed');
 m.current.activeByStage.copy='new-copy';const historical=await reader.read('case-one','material-one');assert.equal(historical.identity.disposition,'historical_source');assert.equal(historical.identity.sourceCurrent,false);
 m.current.revision=3;m.current.referenceMaterials[0].removed={reason:'User withdrew this purpose',by:'user'};m.current.processedCommands['remove-one']=JSON.stringify({kind:'remove-reference-material',materialId:'material-one',commandId:'remove-one'});m.current.audit.push({kind:'remove-reference-material',commandId:'remove-one',revision:3});m.snapshots.set(3,structuredClone(m.current));
 assert.equal((await reader.read('case-one','material-one')).identity.disposition,'removed');delete m.current.referenceMaterials[0].removed;
 await assert.rejects(()=>reader.read('case-one','material-one'),{code:'LOCAL_REFERENCE_COMMAND_REMOVAL_CHANGED'});
});
test('constructed material history cannot hide missing original content or modified creation',async t=>{
 const f=await fixture(t),m=await materialHistory(f);m.current.referenceMaterials[0].borrowingNote='different';await assert.rejects(()=>f.reader(m.store).read('case-one','material-one'),{code:'LOCAL_REFERENCE_COMMAND_MATERIAL_CHANGED'});
 m.current=structuredClone(m.snapshots.get(2));await writeFile(m.current.artifacts[0].payloadRef,'{}');await assert.rejects(()=>f.reader(m.store).read('case-one','material-one'),{code:'ARTIFACT_INTEGRITY'});
});
