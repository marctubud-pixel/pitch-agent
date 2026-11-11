import {createImageEvidenceStore} from './image-evidence.mjs';
import {createHash} from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,mkdir,writeFile,readFile,rename,symlink,unlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {verifyFinalVisualOriginal} from './final-visual-original.mjs';
import {createFinalVisualRuntime} from './final-visual-runtime.mjs';
import {finalRequest,ingestFinalResponse,FINAL_VISUAL_PROTOCOL} from './final-visual.mjs';
import {sketchHash as hash} from './sketch-authority.mjs';

async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'final-original-owned-')),binding={providerId:'local',model:'local',role:'visual-lead'};
 const attachment=Buffer.from('owned attachment bytes'),attachmentPath=join(root,'attachment.png');await writeFile(attachmentPath,attachment);
 const image={imageId:'original-image',sha256:createHash('sha256').update(attachment).digest('hex'),mediaType:'image/png',byteLength:attachment.length,width:2,height:2};
 const source={sourceHash:hash('constructed upstream only'),copyArtifactId:'copy',copyHash:hash('copy'),sketchArtifact:{id:'sketch',contentHash:hash('sketch'),authority:{generationId:'generation',reviewRunId:'review'}},images:[image],copy:{directions:[],claims:[]},task:{id:'task'},neutralReferences:{referenceBoundaries:[],referenceQualifications:[]},handoffs:[{id:'handoff:producer'},{id:'handoff:consumer'}],referenceSource:{dossierId:'dossier'},referenceRecords:{reports:[]}};
 const run={id:'final-run',source,assignments:{planner:binding},capabilities:{owner:{maxImages:1,maxBytes:1024,maxPixels:4}},reports:[]};
 const job={id:'planner-job',finalVisualRunId:run.id,nodeKey:'planner',node:{key:'planner',phase:'planner',role:'visual-lead',dependencies:[]},purpose:'final_visual_plan',binding,inputVersionIds:['copy','sketch'],status:'succeeded',attempts:[]};
 const p={id:'owned',finalVisualRuns:[run],jobs:[job],artifacts:[{id:'copy',contentHash:source.copyHash},{id:'sketch',contentHash:source.sketchArtifact.contentHash,sketchGeneration:source.sketchArtifact.authority}],imageAssets:[]};
 const request=finalRequest(p,run,job.node),packet={runId:'attempt',model:'local',...request.request},raw={protocol:FINAL_VISUAL_PROTOCOL,envelopeHash:request.input.envelopeHash,nodeKey:'planner',kind:'return',sourceHash:source.sourceHash,owner:'visual-lead',returnLocation:'copy',requirement:'Constructed local return',acceptance:'Exact copy correction'};
 const receipt={runId:'attempt',model:'local',requestedModel:'local',exitCode:0,threadId:'owned-thread',inputPacketHash:hash(packet),images:[{...image,path:attachmentPath}],responseText:JSON.stringify(raw)};
 const attempt={id:'attempt',status:'succeeded',dispatchStarted:true,executor:{actorId:'owned',runId:'attempt',contextId:'context'},receipt};job.attempts.push(attempt);
 const report={id:'attempt:report',nodeKey:'planner',phase:'planner',role:'visual-lead',receipt,...ingestFinalResponse(request.input,receipt)};run.reports.push(report);job.outputVersionIds=[report.id];
 const folder=join(root,'attempt');await mkdir(folder);for(const [file,bytes] of Object.entries({'packet.json':JSON.stringify(packet),'receipt.json':JSON.stringify(receipt),'response.txt':receipt.responseText}))await writeFile(join(folder,file),bytes);
 return {root,p,run,job,verify:()=>verifyFinalVisualOriginal(p,run,job,{executionRoot:root,imageStore:{}})};
}

async function managedFixture(){
 const f=await fixture();
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAE0lEQVR4nGP8//8/AwMDEwMYAAAkBgMBXaJOiAAAAABJRU5ErkJggg==','base64');
 const managedRoot=await realpath(await mkdtemp(join(tmpdir(),'managed-images-')));
 const imageStore=createImageEvidenceStore({rootDir:managedRoot});
 const asset=await imageStore.ingest({projectId:f.p.id,bytes:png,metadata:{representation:'supplied_image',description:'real managed original'}});
 const loaded=await imageStore.read({projectId:f.p.id,imageId:asset.id,expectedHash:asset.sha256});
 f.p.imageAssets=[asset];f.run.source.images=[{imageId:asset.id,sha256:asset.sha256,mediaType:asset.mediaType,byteLength:asset.byteLength,width:asset.width,height:asset.height}];
 const request=finalRequest(f.p,f.run,f.job.node),packet={runId:'attempt',model:'local',...request.request},receipt=f.job.attempts[0].receipt;
 const raw=JSON.parse(receipt.responseText);raw.envelopeHash=request.input.envelopeHash;receipt.responseText=JSON.stringify(raw);receipt.inputPacketHash=hash(packet);receipt.images=[loaded.descriptor];
 Object.assign(f.run.reports[0],ingestFinalResponse(request.input,receipt));
 const folder=join(f.root,'attempt');for(const [name,bytes] of Object.entries({'packet.json':JSON.stringify(packet),'receipt.json':JSON.stringify(receipt),'response.txt':receipt.responseText}))await writeFile(join(folder,name),bytes);
 return {...f,managedRoot,imageStore,loaded,receipt,verify:(store=imageStore)=>verifyFinalVisualOriginal(f.p,f.run,f.job,{executionRoot:f.root,imageStore:store}),saveReceipt:()=>writeFile(join(folder,'receipt.json'),JSON.stringify(receipt))};
}

test('actual managed PNG sibling root attachment succeeds with exact store authority',async t=>{
 const f=await managedFixture();
 const fact=await f.verify();assert.equal(fact.kind,'final-visual-text-original');assert.deepEqual(fact.dependencies.filter(x=>x.kind==='image').map(x=>[x.imageId,x.sha256]),[[f.loaded.asset.id,f.loaded.asset.sha256]]);
 console.log(JSON.stringify({evidence:'actual_managed_sibling_png_accepted',executionRoot:f.root,managedRoot:f.managedRoot,descriptor:f.loaded.descriptor,authority:'constructed_upstream_and_registered_final_metadata_only'}));
 await t.test('same bytes at arbitrary receipt path are refused',async()=>{
  const original=f.receipt.images[0].path,foreign=join(f.root,'same-bytes.png');await writeFile(foreign,f.loaded.bytes);f.receipt.images[0].path=foreign;await f.saveReceipt();
  try{await assert.rejects(()=>f.verify(),{code:'FINAL_ATTACHMENT_CHANGED'});}finally{f.receipt.images[0].path=original;await f.saveReceipt();}
 });
 for(const [label,change] of [
  ['descriptor identity',value=>value.descriptor.imageId='another-image'],
  ['descriptor media type',value=>value.descriptor.mediaType='image/jpeg'],
  ['descriptor byte length',value=>value.descriptor.byteLength++],
  ['asset identity',value=>value.asset.id='another-image'],
  ['asset project',value=>value.asset.projectId='another-project'],
  ['asset hash',value=>value.asset.sha256='0'.repeat(64)],
  ['asset byte length',value=>value.asset.byteLength++],
  ['returned bytes',value=>value.bytes[0]^=1],
 ])await t.test(`${label} mismatch is refused`,async()=>{
  const store={read:async identity=>{assert.deepEqual(identity,{projectId:f.p.id,imageId:f.loaded.asset.id,expectedHash:f.loaded.asset.sha256});const value=await f.imageStore.read(identity);change(value);return value;}};
  await assert.rejects(()=>f.verify(store),{code:'FINAL_ATTACHMENT_CHANGED'});
 });
 await t.test('actual wrong image identity is refused',async()=>{
  const original=f.receipt.images[0].imageId;f.receipt.images[0].imageId='missing-image';await f.saveReceipt();
  try{await assert.rejects(()=>f.verify(),{code:'FINAL_RECEIPT_INVALID'});}finally{f.receipt.images[0].imageId=original;await f.saveReceipt();}
 });
 await t.test('actual store record identity mismatch is refused',async()=>{
  const record=join(f.managedRoot,'records',`${f.loaded.asset.id}.json`),saved=record+'.saved';await rename(record,saved);await writeFile(record,JSON.stringify({...f.loaded.asset,projectId:'other-project'}));
  try{await assert.rejects(()=>f.verify(),/Image identity or hash mismatch/);}finally{await unlink(record);await rename(saved,record);}
 });
 await t.test('actual store object symlink is refused',async()=>{
  const object=f.loaded.descriptor.path,saved=object+'.saved';await rename(object,saved);await symlink(saved,object);
  try{await assert.rejects(()=>f.verify(),error=>error.code==='ELOOP');}finally{await unlink(object);await rename(saved,object);}
 });
 await t.test('actual store ancestor symlink is refused',async()=>{
  const objects=join(f.managedRoot,'objects'),saved=objects+'-saved';await rename(objects,saved);await symlink(saved,objects);
  try{await assert.rejects(()=>f.verify(),/Invalid image store directory/);}finally{await unlink(objects);await rename(saved,objects);}
 });
 await t.test('actual store object bytes substitution is refused',async()=>{
  const object=f.loaded.descriptor.path,saved=object+'.saved';await rename(object,saved);await writeFile(object,Buffer.from('changed'));
  try{await assert.rejects(()=>f.verify(),/Image hash or length mismatch/);}finally{await unlink(object);await rename(saved,object);}
 });
 assert.equal((await f.verify()).kind,'final-visual-text-original');
});
