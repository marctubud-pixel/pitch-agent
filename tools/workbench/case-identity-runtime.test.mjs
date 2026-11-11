import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,rm,chmod,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {openStore} from './store.mjs';
import {createExecutor} from './executor.mjs';
import {createImageEvidenceStore} from './image-evidence.mjs';
import {buildCaseIdentityRequest} from './case-identity.mjs';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAE0lEQVR4nGP8//8/AwMDEwMYAAAkBgMBXaJOiAAAAABJRU5ErkJggg==','base64');
const human={actorType:'human',actorId:'test-human',runId:'human',contextId:'human'};
const digest=value=>createHash('sha256').update(value).digest('hex');
async function fixture(t){
  const root=await realpath(await mkdtemp(join(tmpdir(),'case-runtime-'))),store=openStore(join(root,'test.sqlite'));
  t.after(async()=>{store.close();await rm(root,{recursive:true,force:true})});
  store.create({id:'p',name:'Synthetic',brief:'Design dinner packaging',mode:'auto'},human);
  store.command('p',{kind:'confirm-task-card',taskCardId:'p:scope:1',commandId:'confirm',expectedRevision:0},human);
  const imageStore=createImageEvidenceStore({rootDir:join(root,'images')});
  const asset=await imageStore.ingest({projectId:'p',bytes:png,metadata:{representation:'supplied_image'}});
  store.command('p',{kind:'register-image',asset,commandId:'image',expectedRevision:1},{...human,actorType:'agent'});
  let calls=0,modelCalls=0;
  const acquisitionDependencies={lookup:async()=>[{address:'93.184.216.34',family:4}],transport:async({url})=>{
    calls++;assert.ok(store.read('p').jobs.some(job=>job.purpose==='source_capture'&&job.status==='running'&&job.task.url===url.href));
    return {status:200,headers:{'content-type':url.pathname.endsWith('.png')?'image/png':'text/html'},body:url.pathname.endsWith('.png')?png:Buffer.from('<p>Brand A Product B dinner packaging.</p><img src="/source.png">')};
  }};
  const provider={model:'synthetic',execute:async request=>{
    modelCalls++;assert.equal(request.images.length,2);
    const input=store.read('p').jobs.find(job=>job.purpose==='case_identity').task.caseIdentityInput;
    const {packet}=buildCaseIdentityRequest(input),ref={location:'/pageCapture/record/extraction/text',quote:'Brand A Product B dinner packaging.'};
    const unknown={status:'unknown',value:'unknown',reason:'Not available',refs:[],pixels:[]};
    const supported=value=>({status:'supported',value,reason:'Page claim',refs:[ref],pixels:[]});
    const output={protocolVersion:packet.protocolVersion,packetHash:packet.packetHash,actualImageManifestHash:packet.actualImageManifestHash,identityMeaning:'captured_page_image_correspondence_not_source_authentication',fields:{brand:supported('Brand A'),product:supported('Product B'),edition:unknown,time:unknown,use:supported('dinner packaging')},imageMatch:{status:'supported',reason:'Matching pixels',refs:[ref],pixels:packet.orderedImages.map(image=>({imageId:image.imageId,imageSha256:image.sha256,region:'center',observation:'same silhouette'}))},taskFit:{status:'same_use',reason:'Same use',refs:[ref,{location:'/taskCard/brief',quote:'Design dinner packaging'}]},verdict:'usable',limitations:['Attributed case only']};
    return {runId:request.runId,requestedModel:'synthetic',threadId:randomUUID(),inputPacketHash:digest(JSON.stringify({runId:request.runId,model:'synthetic',prompt:request.prompt,outputSchema:request.outputSchema,images:request.manifest})),images:request.manifest,exitCode:0,responseText:JSON.stringify(output)};
  }};
  const executor=createExecutor({store,rootDir:root,imageStore,acquisitionDependencies,providers:{synthetic:provider},bindings:{case_identity:{providerId:'synthetic',model:'synthetic',role:'identity-reviewer'}}});
  const captureJob=executor.enqueueSourceCapture('p',{url:'https://example.com/case',commandId:'capture',expectedRevision:2});
  await executor.execute('p',captureJob);
  const capture=store.read('p').sourceCaptures[0];
  return {root,store,executor,capture,asset,counts:()=>({calls,modelCalls})};
}
test('capture persists tool task before actual transport and identity freezes both actual images without release',async t=>{
  const f=await fixture(t),request={captureId:f.capture.id,sourceImageUrl:'https://example.com/source.png',referenceImageId:f.asset.id,commandId:'identity',expectedRevision:f.store.read('p').revision};
  const jobId=await f.executor.enqueueCaseIdentity('p',request);assert.equal(await f.executor.enqueueCaseIdentity('p',request),jobId);
  const job=await f.executor.execute('p',jobId);assert.equal(job.status,'succeeded',JSON.stringify(job.error));
  const p=f.store.read('p');assert.equal(p.caseIdentityReviews.length,1);assert.equal(p.caseIdentityReviews[0].caseEvidence.verification,'captured');assert.equal(p.caseIdentityReviews[0].report.fields.time.status,'unknown');assert.equal(p.releases.length,0);assert.equal(p.artifacts.length,0);assert.deepEqual(f.counts(),{calls:2,modelCalls:1});
  const researchId=f.executor.enqueue('p','research');
  const source=f.store.read('p').jobs.find(job=>job.id===researchId).task.sourceRecords[0];
  assert.equal(source.text,'Brand A Product B dinner packaging.');assert.equal(source.identityStatus,'identity_checked');assert.equal(source.verification,'captured');
  assert.throws(()=>f.executor.enqueue('p','research',{sourceRecords:[{...source,text:'Invented model summary'}]}),/changed|exact successful/);
});
test('identity rejects an image URL absent from captured page before network or model',async t=>{
  const f=await fixture(t);await assert.rejects(f.executor.enqueueCaseIdentity('p',{captureId:f.capture.id,sourceImageUrl:'https://example.com/arbitrary.png',referenceImageId:f.asset.id,commandId:'identity',expectedRevision:f.store.read('p').revision}),/exact embedded/);assert.deepEqual(f.counts(),{calls:1,modelCalls:0});
});
test('changed managed capture bytes reject identity before acquisition',async t=>{
  const f=await fixture(t);await chmod(f.capture.recordPath,0o600);await writeFile(f.capture.recordPath,'{}');
  await assert.rejects(f.executor.enqueueCaseIdentity('p',{captureId:f.capture.id,sourceImageUrl:'https://example.com/source.png',referenceImageId:f.asset.id,commandId:'identity',expectedRevision:f.store.read('p').revision}),/hash mismatch/);assert.deepEqual(f.counts(),{calls:1,modelCalls:0});
});

test('HTTP accepts only URL capture requests and rejects client receipts, paths and identity reports',async t=>{
  const {createServer}=await import('./server.mjs'),{Readable}=await import('node:stream');
  const root=await mkdtemp(join(tmpdir(),'case-http-'));
  let calls=0;
  const server=createServer({dbPath:join(root,'test.sqlite'),acquisitionDependencies:{lookup:async()=>[{address:'93.184.216.34',family:4}],transport:async()=>{calls++;return {status:200,headers:{'content-type':'text/html'},body:Buffer.from('<p>Actual captured page</p>')}}}});
  t.after(async()=>{await server.drain();server.emit('close');await rm(root,{recursive:true,force:true})});
  const request=(url,body)=>new Promise(resolve=>{
    const req=Readable.from([Buffer.from(JSON.stringify(body))]);Object.assign(req,{url,method:'POST',headers:{host:'127.0.0.1:4181','content-type':'application/json'}});
    server.emit('request',req,{setHeader(){},writeHead(status){this.status=status},end(body){resolve({status:this.status,body:JSON.parse(String(body))})}});
  });
  const created=await request('/api/projects',{name:'Synthetic',brief:'Synthetic test',commandId:'create'}),p=created.body.project,route=`/api/projects/${p.id}`;
  for(const extra of [{record:{httpStatus:200}},{executionReceipt:{exitCode:0}},{path:'/etc/passwd'}])assert.equal((await request(route+'/source-captures',{url:'https://example.com/',commandId:'capture',expectedRevision:0,...extra})).status,400);
  assert.equal((await request(route+'/case-identities',{captureId:'fake',sourceImageUrl:'https://example.com/image.png',referenceImageId:'fake',commandId:'identity',expectedRevision:0,rawReport:{verdict:'usable'}})).status,400);
  const response=await request(route+'/source-captures',{url:'https://example.com/',commandId:'capture',expectedRevision:0});assert.equal(response.status,202);await server.drain();assert.equal(calls,1);
});
