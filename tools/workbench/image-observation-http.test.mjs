import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import {createHash} from 'node:crypto';
import {createServer} from './server.mjs';
import {openStore} from './store.mjs';
import {createExecutor} from './executor.mjs';
import {readImageDescriptor, imageManifest} from './image-evidence.mjs';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAE0lEQVR4nGP8//8/AwMDEwMYAAAkBgMBXaJOiAAAAABJRU5ErkJggg==','base64');
const metadata={originalFilename:'image.png',representation:'screenshot',sourcePageUrl:'https://example.org',description:'Operator description, not model evidence'};
const binding={providerId:'observer',model:'synthetic',role:'image-observer'};
const digest=value=>createHash('sha256').update(value).digest('hex');
async function fixture(t,providers={}){
 const directory=await realpath(await mkdtemp(join(tmpdir(),'observation-http-'))),options={dbPath:join(directory,'db'),rootDir:directory,providers,bindings:{observation:binding}};
 let server=createServer(options);
 t.after(async()=>{await server.drain();server.emit('close');await rm(directory,{recursive:true,force:true});});
 return {directory,options,drain:()=>server.drain(),reopen(){server.emit('close');server=createServer(options);},async request(path,body){
  const req=Readable.from([Buffer.from(body===undefined?'':JSON.stringify(body))]);Object.assign(req,{url:path,method:body===undefined?'GET':'POST',headers:{host:'127.0.0.1:4181','content-type':'application/json'}});
  return new Promise(resolve=>{const headers={};server.emit('request',req,{setHeader(k,v){headers[k]=v},writeHead(status,h){this.status=status;Object.assign(headers,h)},end(bytes){resolve({status:this.status,headers,body:headers['Content-Type'].includes('application/json')?JSON.parse(String(bytes)):Buffer.from(bytes)})}})});
 }};
}
async function project(app,name='one'){
 const created=await app.request('/api/projects',{name,brief:'Synthetic scope',commandId:name});const p=created.body.project,route='/api/projects/'+p.id;
 const confirmed=await app.request(route+'/commands',{kind:'confirm-task-card',taskCardId:p.activeTaskCardId,commandId:'confirm',expectedRevision:0});
 assert.equal(confirmed.status,200);return route;
}
const upload=(revision=1,commandId='upload')=>({base64:png.toString('base64'),metadata,commandId,expectedRevision:revision});
function provider(calls){return {model:'synthetic',async execute({runId,prompt,outputSchema,images}){
 calls.push({runId,prompt,images});for(const image of images)assert.deepEqual(await readImageDescriptor(image),png);
 assert.ok(!prompt.includes(metadata.description));
 const manifest=imageManifest(images),report={manifestHash:outputSchema.properties.manifestHash.const,observations:manifest.map((image,index)=>({imageId:image.imageId,imageSha256:image.sha256,visibleFeatures:[{id:'feature_'+index,description:'Visible light region',region:'whole image'}],legibleText:[],uncertainties:['No readable lettering'],limitations:['Pixels cannot establish authenticity or physical properties']}))};
 return {runId,requestedModel:'synthetic',threadId:'thread-'+runId,inputPacketHash:digest(JSON.stringify({runId,model:'synthetic',prompt,outputSchema,images:manifest})),images:manifest,exitCode:0,responseText:JSON.stringify(report),parsedOutput:report};
}}}

test('HTTP image upload registers immutable bytes, rejects malformed/path payloads, isolates projects and survives restart',async t=>{
 const app=await fixture(t),route=await project(app),other=await project(app,'two');
 for(const body of [{...upload(),path:'/tmp/private'},{...upload(),base64:'@@=='},{...upload(),base64:'Zg==='},{...upload(),base64:'Zh=='},{...upload(),base64:'Zg==\n'},{...upload(),metadata:{...metadata,path:'/tmp/private'}}])assert.ok([400,422].includes((await app.request(route+'/images',body)).status));
 assert.equal((await app.request(route+'/images',{...upload(),base64:Buffer.from('not pixels').toString('base64')})).status,422);
 assert.equal((await app.request(route+'/images',{...upload(),base64:'A'.repeat(4*Math.ceil((8*1024*1024)/3)+4)})).status,400);
 const saved=await app.request(route+'/images',upload());assert.equal(saved.status,201,JSON.stringify(saved.body));
 const {asset}=saved.body;assert.equal(asset.sha256,digest(png));assert.equal(saved.body.project.revision,2);
 assert.equal((await app.request(route+'/images',upload())).body.asset.id,asset.id);
 assert.equal((await app.request(route+'/images',{...upload(),metadata:{...metadata,description:'changed'}})).status,409);
 const image=await app.request(route+'/images/'+asset.id);assert.equal(image.headers['Content-Type'],'image/png');assert.equal(image.headers.ETag,'"'+digest(png)+'"');assert.deepEqual(image.body,png);
 assert.equal((await app.request(other+'/images/'+asset.id)).status,404);
 assert.equal((await app.request(other+'/observations',{imageIds:[asset.id],commandId:'foreign',expectedRevision:1})).status,422);
 assert.equal((await app.request(route+'/images/../../db')).status,404);
 app.reopen();assert.deepEqual((await app.request(route+'/images/'+asset.id)).body,png);
 const again=await app.request(route+'/images',{...upload(2,'second'),metadata:{...metadata,description:'Second provenance'}});assert.equal(again.status,201);assert.notEqual(again.body.asset.id,asset.id);assert.equal(again.body.asset.sha256,asset.sha256);
});

test('HTTP observation freezes task and actual image bytes, saves report and receipt, rejects forgery and retries idempotently',async t=>{
 const calls=[],app=await fixture(t,{observer:provider(calls)}),route=await project(app),saved=await app.request(route+'/images',upload()),imageId=saved.body.asset.id;
 const request={imageIds:[imageId],commandId:'observe',expectedRevision:2};
 for(const imageIds of [[],[imageId,imageId],Array(5).fill(imageId),['/tmp/file']])assert.equal((await app.request(route+'/observations',{...request,imageIds})).status,400);
 assert.equal((await app.request(route+'/observations',{...request,rawReport:{}})).status,400);
 for(const kind of ['register-image','request-observation','complete-observation'])assert.equal((await app.request(route+'/commands',{kind,commandId:'forged',expectedRevision:2})).status,403);
 const queued=await app.request(route+'/observations',request);assert.equal(queued.status,202);assert.equal(queued.body.project.jobs[0].status,'queued');
 await app.drain();const p=(await app.request(route)).body.project;
 assert.equal(calls.length,1);assert.equal(p.jobs[0].status,'succeeded',JSON.stringify(p.jobs[0].error));assert.equal(p.imageObservations.length,1);
 assert.equal(p.imageObservations[0].taskCard.brief,'Synthetic scope');assert.equal(p.artifacts.length,0);assert.equal(p.verifications.length,0);assert.equal(p.releases.length,0);
 assert.equal((await app.request(route+'/observations',request)).body.jobId,queued.body.jobId);await app.drain();assert.equal(calls.length,1);
 app.reopen();assert.equal((await app.request(route)).body.project.imageObservations.length,1);
 const capability=(await app.request('/api/capabilities')).body;assert.equal(capability.imageObservation.available,true);assert.equal(capability.image.available,false);
});

test('startup dispatches a durable observation queue with frozen images exactly once',async t=>{
 const calls=[],app=await fixture(t,{observer:provider(calls)}),route=await project(app),saved=await app.request(route+'/images',upload());
 const store=openStore(app.options.dbPath),executor=createExecutor({store,rootDir:app.directory,bindings:{observation:binding}});
 const projectId=saved.body.project.id;
 const jobId=await executor.enqueueObservation(projectId,{imageIds:[saved.body.asset.id],commandId:'queued-at-restart',expectedRevision:2});store.close();
 app.reopen();await app.drain();assert.equal(calls.length,1);
 const p=(await app.request(route)).body.project;assert.equal(p.jobs.find(job=>job.id===jobId).status,'succeeded');assert.equal(p.imageObservations.length,1);
 app.reopen();await app.drain();assert.equal(calls.length,1);
});

 test('observation retry after a missing provider keeps its frozen task and does not become production recovery',async t=>{
 const app=await fixture(t),route=await project(app),saved=await app.request(route+'/images',upload());
 const queued=await app.request(route+'/observations',{imageIds:[saved.body.asset.id],commandId:'missing-provider',expectedRevision:2});await app.drain();
 let p=(await app.request(route)).body.project;assert.equal(p.jobs[0].status,'blocked');assert.equal(p.jobs[0].error.code,'PROVIDER_MISSING');
 const calls=[],store=openStore(app.options.dbPath),executor=createExecutor({store,rootDir:app.directory,providers:{observer:provider(calls)},bindings:{observation:binding}});
 await executor.execute(p.id,queued.body.jobId,{retry:true});p=store.read(p.id);store.close();
 assert.equal(p.jobs[0].attempts.length,2);assert.equal(p.jobs[0].status,'succeeded');assert.equal(calls.length,1);assert.equal(p.artifacts.length,0);
 assert.equal(p.imageObservations[0].taskCard.id,saved.body.project.activeTaskCardId);
 });
