import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {openStore} from './store.mjs';
import {createExecutor} from './executor.mjs';
import {COPY_CREATIVE_PROTOCOL,CREATIVE_PROTOCOL,CREATIVE_ROLES,creativeHash,creativeDecision,validateCreativeOutput,creativeNodeInput} from './creative-panel.mjs';
import {createServer} from './server.mjs';
import {Readable} from 'node:stream';
import http from 'node:http';
import {once} from 'node:events';
import {human,context,stageDraft,panelFixtureOutput,createPanelFixture} from './creative-test-fixtures.mjs';
async function request(server,path,body) {
 const req=Readable.from([Buffer.from(body===undefined?'':JSON.stringify(body))]);
 Object.assign(req,{url:path,method:body===undefined?'GET':'POST',headers:{host:'127.0.0.1:4181','content-type':'application/json'}});
 return new Promise(resolve=>server.emit('request',req,{setHeader(){},writeHead(status){this.status=status;},end(payload){resolve({status:this.status,body:JSON.parse(String(payload))});}}));
}
async function until(predicate) {
 for(let i=0;i<300;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,5));}
 assert.fail('Expected scheduler state was not observed');
}
function heldProvider(provider) {
 const original=provider.execute, started=[], release=[];
 let active=0, peak=0;
 provider.execute=async req=>{
   active++;peak=Math.max(peak,active);started.push(req);
   await new Promise(resolve=>release.push(resolve));
   try{return await original(req);}finally{active--;}
 };
 return {started,release,get active(){return active;},get peak(){return peak;}};
}
function close(server) {
 return new Promise(resolve=>server.close(error=>{assert.ok(!error||error.code==='ERR_SERVER_NOT_RUNNING');resolve();}));
}

test('default bound limits actual creative first reads, deduplicates jobs and drains all 17 graph calls',async t=>{
 const f=await createPanelFixture(t),held=heldProvider(f.providers.synthetic);
 const server=createServer({dbPath:f.dbPath,rootDir:f.root,providers:f.providers,bindings:f.bindings});
 const input=f.request(),route='/api/projects/p/creative-panels';
 assert.equal((await request(server,route,input)).status,202);
 assert.equal((await request(server,route,input)).status,202);
 await until(()=>held.started.length===2);
 const read=()=>f.store.read('p');
 assert.equal(read().jobs.filter(j=>j.status==='running').length,2);
 assert.equal(read().jobs.filter(j=>j.status==='queued').length,6);
 assert.equal(held.peak,2);
 held.release.shift()();await until(()=>held.started.length===3);
 assert.equal(read().jobs.filter(j=>j.status==='running').length,2);
 const draining=server.drain();let complete=false;draining.then(()=>{complete=true;});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(complete,false);
 for(let i=0;i<100&& !complete;i++) {
   held.release.splice(0).forEach(fn=>fn());
   await new Promise(resolve=>setTimeout(resolve,5));
 }
 await draining;
 assert.equal(held.started.length,17);assert.equal(held.peak,2);
 assert.equal(new Set(held.started.map(r=>r.runId)).size,17);
 assert.equal(read().creativeReports.filter(r=>r.artifactId===f.artifactId).length,17);assert.equal(read().jobs.some(j=>j.status==='queued'||j.status==='running'),false);
 assert.equal((await request(server,route,input)).status,202);await server.drain();assert.equal(held.started.length,17);
 await close(server);
});

test('close waits for in-flight saves, leaves six queued and reopen resumes without duplicate calls',async t=>{
 const f=await createPanelFixture(t),held=heldProvider(f.providers.synthetic);
 let server=createServer({dbPath:f.dbPath,rootDir:f.root,providers:f.providers,bindings:f.bindings});
 assert.equal((await request(server,'/api/projects/p/creative-panels',f.request())).status,202);
 await until(()=>held.started.length===2);
 let closed=false;const closing=close(server).then(()=>{closed=true;});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(closed,false);
 held.release.splice(0).forEach(fn=>fn());await closing;
 assert.equal(held.started.length,2);
 assert.equal(f.store.read('p').jobs.filter(j=>j.status==='queued').length,6);
 assert.equal(f.store.read('p').creativeReports.filter(r=>r.artifactId===f.artifactId).length,2);
 server=createServer({dbPath:f.dbPath,rootDir:f.root,providers:f.providers,bindings:f.bindings,maxConcurrentJobs:1});
 const draining=server.drain();let complete=false;draining.then(()=>{complete=true;});
 for(let i=0;i<150&&!complete;i++) {
   held.release.splice(0).forEach(fn=>fn());await new Promise(resolve=>setTimeout(resolve,5));
 }
 await draining;
 assert.equal(held.started.length,17);assert.equal(new Set(held.started.map(r=>r.runId)).size,17);
 assert.equal(f.store.read('p').creativeReports.filter(r=>r.artifactId===f.artifactId).length,17);
 await close(server);
});

test('runtime FIFO spans projects and configured slot release starts the next enqueued job',async t=>{
 const root=await mkdtemp(join(tmpdir(),'scheduler-fifo-')),dbPath=join(root,'db'),store=openStore(dbPath);
 t.after(async()=>{store.close();await rm(root,{recursive:true,force:true});});
 const providers={synthetic:{model:'synthetic',execute:async req=>({runId:req.runId,model:'synthetic',requestedModel:'synthetic',threadId:randomUUID(),inputPacketHash:'synthetic',exitCode:0,parsedOutput:{title:'plan',summary:'missing sources',sections:[],claims:[],gaps:['missing'],outputKind:'research_plan',status:'blocked',evidenceClassifications:[]}})}};
 const held=heldProvider(providers.synthetic),bindings={research:{providerId:'synthetic',model:'synthetic',role:'research'}};
 const ids=['first','second','third','fourth'];
 for(const id of ids){store.create({id,name:id,brief:'test',mode:'auto'},human);store.command(id,{kind:'confirm-task-card',taskCardId:id+':scope:1',commandId:'confirm',expectedRevision:0},human);}
 const startedProjects=()=>held.started.map(r=>ids.find(id=>store.read(id).jobs[0]?.attempts.some(a=>a.id===r.runId)));
 const server=createServer({dbPath,rootDir:root,providers,bindings,maxConcurrentJobs:1});
 for(const id of ids)assert.equal((await request(server,`/api/projects/${id}/jobs`,{stage:'research',commandId:'enqueue',expectedRevision:store.read(id).revision})).status,202);
 await until(()=>held.started.length===1);
 assert.deepEqual(startedProjects(),ids.slice(0,1));
 assert.equal(ids.reduce((n,id)=>n+store.read(id).jobs.filter(j=>j.status==='running').length,0),1);
 assert.equal(ids.reduce((n,id)=>n+store.read(id).jobs.filter(j=>j.status==='queued').length,0),3);
 const draining=server.drain();
 for(let i=2;i<=4;i++){held.release.shift()();await until(()=>held.started.length===i);assert.deepEqual(startedProjects(),ids.slice(0,i));}
 held.release.shift()();await draining;
 assert.deepEqual(startedProjects(),ids);assert.equal(held.peak,1);
 await close(server);
});

test('concurrency configuration rejects invalid values before opening the database',()=>{
 for(const maxConcurrentJobs of [0,9,1.1,NaN,Infinity,'2',null])assert.throws(()=>createServer({dbPath:'/nonexistent/no-write/db',maxConcurrentJobs}),/maxConcurrentJobs/);
});

test('close before dispatch does not hang on waiting jobs and retains all eight for startup recovery',async t=>{
 const f=await createPanelFixture(t);
 await f.executor.enqueueCreativePanel('p',f.request());f.executor.advanceCreativePanels('p');
 const options={dbPath:f.dbPath,rootDir:f.root,providers:f.providers,bindings:f.bindings,maxConcurrentJobs:8};
 let server=createServer(options);
 await close(server);
 assert.equal(f.calls.length,1);assert.equal(f.store.read('p').jobs.filter(j=>j.status==='queued').length,8);
 server=createServer(options);await server.drain();
 assert.equal(f.calls.length,18);assert.equal(f.store.read('p').creativeReports.filter(r=>r.artifactId===f.artifactId).length,17);
 await close(server);
});


test('real HTTP request admitted before close can finish its streamed body and persist a project',async t=>{
 const root=await mkdtemp(join(tmpdir(),'scheduler-http-close-')),dbPath=join(root,'db');
 t.after(()=>rm(root,{recursive:true,force:true}));
 const server=createServer({dbPath,rootDir:root});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const port=server.address().port,received=once(server,'request');
 let finishBody;
 const response=new Promise((resolve,reject)=>{
   const req=http.request({host:'127.0.0.1',port,path:'/api/projects',method:'POST',headers:{'content-type':'application/json','connection':'close'}},res=>{
     let body='';res.on('data',chunk=>{body+=chunk;});res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(body)}));
   });
   req.on('error',reject);req.write('{"name":"streaming shutdown",');
   finishBody=()=>req.end('"brief":"test","mode":"auto"}');
 });
 await received;
 let stopped=false;const closing=close(server).then(()=>{stopped=true;});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(stopped,false);
 finishBody();const actual=await response;await closing;
 assert.equal(actual.status,201);assert.equal(actual.body.project.name,'streaming shutdown');
 const store=openStore(dbPath);
 try{assert.equal(store.read(actual.body.project.id).taskCards[0].brief,'test');}finally{store.close();}
});
