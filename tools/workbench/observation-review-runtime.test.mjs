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
 const directory=await realpath(await mkdtemp(join(tmpdir(),'observation-http-'))),options={dbPath:join(directory,'db'),rootDir:directory,providers,bindings:{observation:binding,observation_review:{...binding,role:'image-reviewer'}}};
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


function reviewedProvider(calls, mode = 'success') {
 const observer=provider(calls);
 return {model:'synthetic',async execute(request){
  if(!request.outputSchema.properties.observationHash)return observer.execute(request);
  calls.push(request);for(const image of request.images)assert.deepEqual(await readImageDescriptor(image),png);
  if(mode==='lost')throw new Error('Invocation result unknown');
  const report={manifestHash:request.outputSchema.properties.manifestHash.const,observationHash:request.outputSchema.properties.observationHash.const,findings:[{id:'feature_0',status:'supported',reason:'Visible in actual pixels'}]};
  return {runId:request.runId,requestedModel:'synthetic',threadId:mode==='reused'?calls[0].runId:'thread-'+request.runId,
   inputPacketHash:digest(JSON.stringify({runId:request.runId,model:'synthetic',prompt:request.prompt,outputSchema:request.outputSchema,images:imageManifest(request.images)})),
   images:imageManifest(request.images),exitCode:0,responseText:JSON.stringify(report),parsedOutput:report};
 }};
}
async function observed(t,mode){
 const calls=[],app=await fixture(t,{observer:reviewedProvider(calls,mode)}),route=await project(app),saved=await app.request(route+'/images',upload());
 await app.request(route+'/observations',{imageIds:[saved.body.asset.id],commandId:'observe',expectedRevision:2});await app.drain();
 const p=(await app.request(route)).body.project;
 return {calls,app,route,p,request:{observationId:p.imageObservations[0].id,commandId:'review',expectedRevision:p.revision}};
}
test('registered observation review passes identical image bytes independently and persists append-only supported catalogue',async t=>{
 const {calls,app,route,p,request}=await observed(t);
 const other=await project(app,'other');assert.equal((await app.request(other+'/observation-reviews',{...request,expectedRevision:1})).status,422);
 assert.equal((await app.request(route+'/observation-reviews',{...request,rawReport:{}})).status,400);
 for(const kind of ['request-observation-review','complete-observation-review'])assert.equal((await app.request(route+'/commands',{kind,commandId:'forged',expectedRevision:p.revision})).status,403);
 const queued=await app.request(route+'/observation-reviews',request);assert.equal(queued.status,202,JSON.stringify(queued.body));await app.drain();
 let after=(await app.request(route)).body.project;assert.equal(after.jobs.at(-1).status,'succeeded',JSON.stringify(after.jobs.at(-1).error));
 assert.equal(calls.length,2);assert.deepEqual(imageManifest(calls[0].images),imageManifest(calls[1].images));
 assert.notEqual(after.jobs[0].attempts[0].executor.contextId,after.jobs[1].attempts[0].executor.contextId);
 assert.deepEqual(after.imageObservations,p.imageObservations);assert.equal(after.observationReviews.length,1);
 assert.equal(after.observationReviews[0].acceptedCatalogue.features.length,1);assert.equal(after.observationReviews[0].observationContentHash,p.imageObservations[0].reportHash);
 assert.deepEqual(after.releases,[]);assert.deepEqual(after.artifacts,[]);assert.deepEqual(after.activeByStage,{});
 assert.equal((await app.request(route+'/observation-reviews',request)).body.jobId,queued.body.jobId);await app.drain();assert.equal(calls.length,2);
 await app.request(route+'/observation-reviews',{...request,commandId:'review-again',expectedRevision:after.revision});await app.drain();
 after=(await app.request(route)).body.project;assert.equal(after.observationReviews.length,2);
 app.reopen();assert.equal((await app.request(route)).body.project.observationReviews.length,2);
 assert.equal((await app.request('/api/capabilities')).body.imageObservationReview.available,true);
});
test('lost review call stays unknown with no catalogue and cannot be retried',async t=>{
 const {app,route,request}=await observed(t,'lost');await app.request(route+'/observation-reviews',request);await app.drain();
 const p=(await app.request(route)).body.project,job=p.jobs.at(-1);assert.equal(job.status,'awaiting_reconciliation');assert.deepEqual(p.observationReviews,[]);
 const store=openStore(app.options.dbPath),executor=createExecutor({store,rootDir:app.directory});
 try{await assert.rejects(executor.execute(p.id,job.id,{retry:true}),/not eligible/);}finally{store.close();}
});
test('review target becomes blocked after task card revision without another provider invocation',async t=>{
 const {app,route,request,calls,p}=await observed(t);
 await app.request(route+'/commands',{kind:'revise-task-card',taskCardId:'scope2',brief:'Changed scope',commandId:'revise',expectedRevision:p.revision});
 const result=await app.request(route+'/observation-reviews',{...request,expectedRevision:p.revision+1});assert.equal(result.status,422);assert.equal(calls.length,1);
});

test('research freezes reviewed visual evidence through HTTP, author invocation and downstream review packets',async t=>{
 const {buildVisualCatalogue}=await import('./visual-catalogue.mjs');
 const {stageVisualCatalogue,releaseReadiness}=await import('./project.mjs');
 const calls=[],baseObserver=reviewedProvider(calls),stageCalls=[];
 let negativeReview=false;
 const observer={model:'synthetic',async execute(request){const result=await baseObserver.execute(request);if(negativeReview&&request.outputSchema.properties.observationHash){result.parsedOutput.findings[0].status='unsupported';result.responseText=JSON.stringify(result.parsedOutput)}return result}};
 let visualId;
 const research={model:'synthetic',async execute(request){
  stageCalls.push(request);
  const report={outputKind:'research_findings',status:'draft',title:'Visible package',summary:'A light region is visible',sections:[{heading:'Visible appearance',body:'A light region is visible',evidenceIds:[visualId]}],claims:[{text:'A light region is visible',kind:'fact',evidenceRefs:[visualId],limitations:['Appearance only']}],gaps:['No evidence of consumer preference'],evidenceClassifications:[]};
  return {runId:request.runId,requestedModel:'synthetic',threadId:'research-'+request.runId,inputPacketHash:'packet',exitCode:0,responseText:JSON.stringify(report),parsedOutput:report};
 }};
 const app=await fixture(t,{observer,research});
 app.options.bindings.research={providerId:'research',model:'synthetic',role:'research-lead'};
 const route=await project(app),saved=await app.request(route+'/images',upload());
 await app.request(route+'/observations',{imageIds:[saved.body.asset.id],commandId:'observe',expectedRevision:2});await app.drain();
 let p=(await app.request(route)).body.project;
 await app.request(route+'/observation-reviews',{observationId:p.imageObservations[0].id,commandId:'review',expectedRevision:p.revision});await app.drain();
 p=(await app.request(route)).body.project;
 const catalogue=buildVisualCatalogue(p);assert.equal(catalogue.length,1);visualId=catalogue[0].id;
 assert.equal((await app.request(route+'/jobs',{stage:'research',sourceRecords:[],visualCatalogue:catalogue,commandId:'forged',expectedRevision:p.revision})).status,400);
 const queued=await app.request(route+'/jobs',{stage:'research',sourceRecords:[],commandId:'research',expectedRevision:p.revision});
 assert.equal(queued.status,202,JSON.stringify(queued.body));await app.drain();
 p=(await app.request(route)).body.project;
 const job=p.jobs.at(-1),artifact=p.artifacts.at(-1);
 assert.equal(job.status,'succeeded',JSON.stringify(job.error));assert.deepEqual(job.task.visualCatalogue,catalogue);assert.deepEqual(artifact.technicalReceipts.visualCatalogue,catalogue);
 assert.deepEqual(job.task.sourceRecords,[]);assert.equal(stageCalls.length,1);assert.match(stageCalls[0].prompt,/reviewed pixel evidence/);assert.ok(stageCalls[0].prompt.includes(visualId));
 assert.deepEqual(stageVisualCatalogue(p,'strategy',[artifact.id]),catalogue);
 assert.deepEqual(stageVisualCatalogue({...p,artifacts:[...p.artifacts,{id:'strategy',technicalReceipts:{visualCatalogue:catalogue}}]},'copy',['strategy']),catalogue);
 // Queue through the trusted runtime so each packet can be inspected without dispatching a provider.
 const store=openStore(app.options.dbPath);t.after(()=>store.close());
 const executor=createExecutor({store,rootDir:app.directory,bindings:app.options.bindings});
 await executor.enqueueVerification(p.id,artifact.id);
 await executor.enqueueReadiness(p.id,artifact.id);
 await executor.enqueueHandoff(p.id,artifact.id,'producer');
 p=store.read(p.id);
 for(const [purpose,key] of [['verification','verificationInput'],['readiness','readinessInput'],['handoff','handoffInput']])assert.deepEqual(p.jobs.find(item=>item.purpose===purpose).task[key].visualCatalogue,catalogue);
 assert.deepEqual(p.releases,[]);
 // A new independently executed negative review invalidates frozen dependents.
 negativeReview=true;
 const reviewed=await app.request(route+'/observation-reviews',{observationId:p.imageObservations[0].id,commandId:'review-negative',expectedRevision:p.revision});
 assert.equal(reviewed.status,202,JSON.stringify(reviewed.body));await app.drain();
 p=(await app.request(route)).body.project;
 assert.equal(p.jobs.at(-1).status,'succeeded',JSON.stringify(p.jobs.at(-1).error));
 assert.equal(p.observationReviews.length,2);
 const eligibility=releaseReadiness(p,artifact.id);
 assert.ok(eligibility.blockedReasons.includes('STALE_VISUAL_CATALOGUE'),JSON.stringify(eligibility));
 await assert.rejects(()=>executor.enqueueVerification(p.id,artifact.id),error=>error.code==='STALE_VISUAL_CATALOGUE');
});
