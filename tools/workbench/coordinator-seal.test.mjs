import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,realpath,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';
import {openStore} from './store.mjs';
import {openLocalAcceptanceCoordinator} from './local-acceptance-coordinator.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
test('actual coordinator admission rejects new reference material after continuation intent without writing project or dossier',async t=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'reference-input-seal-'))),store=openStore(join(root,'native.sqlite')),workflow=join(root,'workflow.sqlite');let pipeline=openLocalAcceptanceCoordinator({databasePath:workflow,projectStore:store,executor:{}});
 t.after(async()=>{pipeline.close();store.close();await rm(root,{recursive:true,force:true});});
 const created=await pipeline.create({commandId:'create',caseId:'m6',brief:'Synthetic seal admission only',mode:'assisted',checkpoints:['references']}),before=store.read(created.projectId),copyText=JSON.stringify({directions:[{id:'steady'},{id:'product'},{id:'user'}]}),payloadRef=join(root,'copy.json'),bytes=Buffer.from('registered read double, not image validation'),asset={id:'image',projectId:created.projectId,sha256:hash(bytes),byteLength:bytes.length,width:2,height:2,mediaType:'image/png',provenance:{representation:'supplied_image'}};
 await writeFile(payloadRef,copyText);pipeline.close();let writes=0;
 const projection={...before,activeByStage:{...before.activeByStage,copy:'copy'},artifacts:[...before.artifacts,{id:'copy',stage:'copy',contentHash:hash(copyText),payloadRef}],imageAssets:[asset],referenceDossiers:[],referenceIntents:[{id:'continue',artifactId:'copy'}]};
 const projectedStore={...store,read:()=>structuredClone(projection),command(){writes++;throw Error('should never reach native write');}},imageStore={read:async()=>({asset:structuredClone(asset),bytes})};
 pipeline=openLocalAcceptanceCoordinator({databasePath:workflow,projectStore:projectedStore,executor:{},imageStore,executionRoot:root});
 await assert.rejects(()=>pipeline.submitReferenceMaterial(created.id,{commandId:'late-material',expectedRevision:before.revision,artifactId:'copy',copyContentHash:hash(copyText),imageId:asset.id,imageSha256:asset.sha256,directionId:'steady',kind:'direction',applicabilityProfile:'direction',borrowingNote:'Borrow structure only'}),e=>e.code==='LOCAL_REFERENCE_INPUT_SEALED'&&e.status===409);
 assert.equal(writes,0);assert.equal(projection.referenceDossiers.length,0);assert.deepEqual(store.read(created.projectId),before);
});
