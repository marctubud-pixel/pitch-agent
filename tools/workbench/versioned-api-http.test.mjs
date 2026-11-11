import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from './server.mjs';
import http from 'node:http';
import {referenceFixture} from './reference-dossier-fixtures.mjs';

test('v1 project API shares durable commands with legacy paths and retains module owners',async t=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'versioned-workbench-')));
 const server=createServer({dbPath:join(root,'db'),rootDir:root,port:0,providers:{},bindings:{},imageProvider:null});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});});
 const base=`http://127.0.0.1:${server.address().port}`;
 const request=async(path,body,headers={},method=body===undefined?'GET':'POST')=>{
  const response=await fetch(base+path,{method,headers:{...(body===undefined?{}:{'content-type':'application/json'}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:response.status,body:await response.json()};
 };
 const initial=await request('/api/v1/capabilities');
 assert.equal(initial.status,200);
 assert.equal(initial.body.finalReview.deliveryAvailable,false);
 assert.equal(initial.body.stages.find(stage=>stage.stage==='research').available,false);
 assert.deepEqual((await request('/api/capabilities')).body,initial.body);
 const create={name:'版本接口项目',brief:'已提供包装设计简报',commandId:'shared-create'};
 const created=await request('/api/v1/projects',create);
 assert.equal(created.status,201,JSON.stringify(created.body));
 const id=created.body.project.id,legacy=`/api/projects/${id}`,v1=`/api/v1/projects/${id}`;
 assert.equal((await request('/api/projects',create)).status,200);
 assert.equal((await request('/api/v1/projects',{...create,brief:'不同简报'})).status,409);
 assert.equal((await request('/api/v1/projects')).body.projects[0].id,id);
 assert.equal((await request('/api/projects')).body.projects[0].id,id);
 assert.deepEqual((await request(v1)).body,(await request(legacy)).body);
 assert.equal((await request(v1)).body.project.revision,0);
 assert.ok(Object.hasOwn((await request(v1)).body,'view'));
 assert.equal((await request(`${legacy}?revision=0`)).body.project.revision,0);
 assert.equal((await request(`${v1}/documents`)).status,200);
 assert.equal((await request(`${v1}/final-review-status`)).status,200);
 assert.equal((await request(`${v1}/research-status`)).status,200);
 assert.deepEqual((await request(`${v1}/research-status`)).body,(await request(`${legacy}/research-status`)).body);
 const command={kind:'confirm-task-card',taskCardId:created.body.project.activeTaskCardId,commandId:'cross-alias-confirm',expectedRevision:0};
 assert.equal((await request(`${v1}/commands`,command)).body.project.revision,1);
 assert.equal((await request(`${legacy}/commands`,command)).body.project.revision,1);
 assert.deepEqual((await request(v1)).body,(await request(legacy)).body);
 for(const revision of [0,1])assert.deepEqual((await request(`${v1}?revision=${revision}`)).body,(await request(`${legacy}?revision=${revision}`)).body);
 for(const query of ['revision=oops','revision=0&revision=1','unknown=1']){
  assert.equal((await request(`${v1}?${query}`)).status,400);
  assert.equal((await request(`${legacy}?${query}`)).status,400);
 }
 assert.equal((await request(`${v1}?revision=999`)).status,(await request(`${legacy}?revision=999`)).status);
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAE0lEQVR4nGP8//8/AwMDEwMYAAAkBgMBXaJOiAAAAABJRU5ErkJggg==','base64');
 const uploaded=await request(`${v1}/images`,{base64:png.toString('base64'),metadata:{originalFilename:'image.png',representation:'screenshot',sourcePageUrl:'https://example.org',description:'Synthetic test pixels'},commandId:'image',expectedRevision:1});
 assert.equal(uploaded.status,201,JSON.stringify(uploaded.body));
 const image=await fetch(`${base}${v1}/images/${uploaded.body.asset.id}`);
 assert.equal(image.status,200);
 assert.deepEqual(Buffer.from(await image.arrayBuffer()),png);
 const source=await request(`${v1}/sources`,{title:'Provided note',publisher:'User',url:'https://example.org/note',excerpt:'A supplied excerpt',intendedUse:'category',attachToClaimId:null,commandId:'source',expectedRevision:2});
 assert.equal(source.status,200,JSON.stringify(source.body));
 assert.equal(await fetch(`${base}${v1}/sources/${source.body.sourceId}/content`).then(r=>r.text()),'A supplied excerpt');
 assert.equal(source.body.project.sourceEntries[0].verificationStatus,'unverified');
 assert.equal((await request(`${v1}/research-continuations`,{commandId:'wrong-protocol',expectedRevision:3,sourceEntryIds:[],materialIds:[]})).status,422);
 assert.equal((await request(`${v1}/commands`,{...command,taskCardId:'different'})).status,409);
 assert.equal((await request(`${v1}/commands`,{...command,commandId:'stale'})).status,409);
 assert.equal((await request(`${v1}/commands`,{kind:'record-review',commandId:'forge',expectedRevision:1})).status,403);
 assert.equal((await request(`${v1}/commands`,{...command,commandId:'bad-extra',invented:true})).status,400);
 assert.equal((await request(`${v1}/sources/missing/content`)).status,404);
 assert.equal((await request('/api/v1/projects/missing/commands',{...command,commandId:'missing'})).status,404);
 assert.equal((await request('/api/v2/projects')).body.error.code,'UNSUPPORTED_API_VERSION');
 assert.equal((await request(`${v1}/made-up`)).status,404);
 assert.equal((await request(`${v1}/commands`,command,{origin:'https://other.example'})).status,403);
 assert.equal((await request(`${v1}/commands`,command,{'sec-fetch-site':'cross-site'})).status,403);
 const wrongHost=await new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port:server.address().port,path:`${v1}/commands`,method:'POST',headers:{host:'other.example','content-type':'application/json'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end(JSON.stringify(command));});
 assert.equal(wrongHost,403);
});

test('historical project view stays fixed after policy changes and v1 rejects unknown write queries',async t=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'versioned-history-')));
 const server=createServer({dbPath:join(root,'db'),rootDir:root,port:0,providers:{},bindings:{},imageProvider:null});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});});
 const base=`http://127.0.0.1:${server.address().port}`;
 const request=async(path,body)=>{
  const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:response.status,body:await response.json()};
 };
 const created=await request('/api/v1/projects',{name:'历史视图',brief:'用户简报',commandId:'create-history'});
 assert.equal(created.status,201,JSON.stringify(created.body));
 const path=`/api/v1/projects/${created.body.project.id}`;
 const historical=(await request(`${path}?revision=0`)).body;
 assert.equal(historical.project.revision,0);
 assert.equal(historical.view.researchWorkflow.authorizationPath,'model-owners');
 for(const queryPath of ['/api/v1/capabilities?unexpected=1','/api/v1/projects?unexpected=1',`${path}/research-status?unexpected=1`]){
  const rejected=await request(queryPath);
  assert.equal(rejected.status,422,queryPath);
  assert.equal(rejected.body.error.code,'INVALID_QUERY');
 }
 assert.equal((await request(`${path}/made-up?unexpected=1`)).status,404);
 assert.equal((await request('/api/v1/capabilities?unexpected=1',{})).status,404);
 assert.equal((await request(`${path}/commands?unexpected=1`)).status,404);
 const confirm={kind:'confirm-task-card',taskCardId:created.body.project.activeTaskCardId,commandId:'query-rejected-confirm',expectedRevision:0};
 const rejected=await request(`${path}/commands?unexpected=1`,confirm);
 assert.equal(rejected.status,422);
 assert.equal(rejected.body.error.code,'INVALID_QUERY');
 const dualMethodRejected=await request(`${path}/readiness-resolutions?unexpected=1`,{});
 assert.equal(dualMethodRejected.status,422);
 assert.equal(dualMethodRejected.body.error.code,'INVALID_QUERY');
 assert.equal((await request(path)).body.project.revision,0);
 assert.equal((await request(`${path}/commands`,confirm)).body.project.revision,1);
 const changed=await request(`${path}/commands`,{kind:'set-policy',mode:'assisted',humanGates:['research'],authorizedThrough:'final_review',commandId:'later-policy',expectedRevision:1});
 assert.equal(changed.status,200,JSON.stringify(changed.body));
 assert.equal(changed.body.project.revision,2);
 assert.equal(changed.body.view.researchWorkflow.authorizationPath,'legacy-human-gate');
 assert.deepEqual((await request(`${path}?revision=0`)).body,historical);
 assert.deepEqual((await request(`/api/projects/${created.body.project.id}?revision=0`)).body,historical);
 assert.equal((await request(`${path}?revision=2`)).body.project.revision,2);
 for(const validQuery of [`${path}/readiness-resolutions?jobId=missing&attemptId=missing`,`${path}/sketch-review-input?generationId=missing`]){
  const result=await request(validQuery);
  assert.notEqual(result.body.error?.code,'INVALID_QUERY',validQuery);
 }
 assert.equal((await request(`${path}/documents?unexpected=1`)).status,422);
 assert.equal((await request('/api/v1/intake/capabilities?unexpected=1')).status,422);
});

test('historical reference view uses its recorded project revision after a later project change',async t=>{
 const fixture=await referenceFixture(t);
 const started=await fixture.executor.continueCopy('p',fixture.request());
 assert.equal(started.status,'working',JSON.stringify(started));
 const revision=fixture.store.read('p').revision;
 assert.equal(fixture.store.read('p').referenceDossiers.length,1);
 const server=createServer({dbPath:join(fixture.root,'db'),rootDir:fixture.root,port:0,providers:{},bindings:{},imageProvider:null});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 await server.drain();
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));});
 const base=`http://127.0.0.1:${server.address().port}`;
 const path='/api/v1/projects/p';
 const read=async suffix=>{
  const response=await fetch(base+path+suffix);
  assert.equal(response.status,200);
  return response.json();
 };
 const historical=await read(`?revision=${revision}`);
 assert.equal(historical.view.references.length,1);
 const current=await read('');
 const changed=await fetch(base+path+'/sources',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:'Later supplied note',publisher:'User',url:'https://example.org/later',excerpt:'A later supplied excerpt',intendedUse:'category',attachToClaimId:null,commandId:'after-reference',expectedRevision:current.project.revision})});
 assert.equal(changed.status,200,await changed.text());
 assert.ok((await read('')).project.revision>current.project.revision);
 assert.deepEqual(await read(`?revision=${revision}`),historical);
 assert.deepEqual(await read(`?revision=${revision}`),await (await fetch(base+`/api/projects/p?revision=${revision}`)).json());
});
