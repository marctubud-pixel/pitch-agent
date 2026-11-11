import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {join} from 'node:path';
import {createBriefServer} from './brief-server.mjs';
import {acquisitionFixture} from './research-acquisition-fixture.mjs';
import {cardHash} from './intake-contract.mjs';
async function fixture(t,{enabled=false}={}){
 const f=await acquisitionFixture();const server=createBriefServer({dbPath:join(f.root,'db'),researchOptions:enabled?{...f.options,executionAllowed:true}:undefined});t.after(async()=>{await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));await f.close();});
 const request=(path,body,{method=body===undefined?'GET':'POST',headers={}}={})=>new Promise(resolve=>{const req=Readable.from([Buffer.from(body===undefined?'':JSON.stringify(body))]);Object.assign(req,{url:path,method,headers:{host:'127.0.0.1:4182','content-type':'application/json',...headers}});let status;server.emit('request',req,{setHeader(){},writeHead(value){status=value;},end(raw){resolve({status,body:raw?JSON.parse(String(raw)):null});}});});
 const created=await request('/api/v1/projects',{name:'Current bounded acquisition',brief:'Synthetic blue packaging only',commandId:'new-http'});const id=created.body.project.id,route=`/api/v1/projects/${id}`,path=route+'/research-acquisition';
 const body=async extra=>{const p=(await request(route)).body.project,c=p.taskCards.find(c=>c.id===p.activeTaskCardId);return {commandId:'http-'+p.revision,expectedRevision:p.revision,taskCardId:c.id,taskCardHash:cardHash(c),...extra};};
 await request(route+'/commands',{kind:'confirm-task-card',taskCardId:created.body.project.activeTaskCardId,commandId:'confirm-new',expectedRevision:0});await request(route+'/research-questions',{questions:[{id:'q1',question:'What is supported?',critical:true}],readerCount:1,commandId:'questions-new',expectedRevision:1});
 return {...f,request,body,id,route,path};
}
test('HTTP acquisition is read-only by default and never activates existing queued jobs',async t=>{
 const f=await fixture(t),status=await f.request(f.path);assert.equal(status.status,200);assert.equal(status.body.capability.available,false);assert.equal(status.body.acquisition.state,'not_started');assert.equal(status.body.project.revision,status.body.revision);assert.equal(status.body.view.revision,status.body.revision);
 const denied=await f.request(f.path+'/start',await f.body({sourceEntryIds:[],materialIds:[]}));assert.equal(denied.body.error.code,'ACQUISITION_UNAVAILABLE');assert.equal(f.calls.length,0);assert.equal(f.tools.length,0);
});
test('HTTP bounded selection and exact receipts connect planner, branches, seal and a single r7 producer',async t=>{
 const f=await fixture(t,{enabled:true}),body=await f.body({sourceEntryIds:[],materialIds:[]}),start=await f.request(f.path+'/start',body);assert.equal(start.status,200,JSON.stringify(start.body));assert.equal(start.body.receipt.replayed,false);assert.equal(start.body.project.researchAcquisitionHttpRequests[0].requestedBy.actorId,'local-operator');
 let status=start.body;for(let n=0;n<3;n++){const step=await f.body({generationId:start.body.receipt.generationId,jobIds:status.acquisition.queuedJobIds}),response=await f.request(f.path+'/step',step);assert.equal(response.status,200,JSON.stringify(response.body));const calls=f.calls.length,tools=f.tools.length;const replay=await f.request(f.path+'/step',step);assert.equal(replay.status,200);assert.equal(replay.body.receipt.replayed,true);assert.equal(f.calls.length,calls);assert.equal(f.tools.length,tools);status=response.body;}
 assert.equal(status.acquisition.producerStatus,'succeeded');assert.equal(f.calls.length,2);assert.equal(status.project.artifacts.length,1);assert.equal(status.project.releases.length,0);assert.equal(status.project.jobs.at(-1).task.researchQuestionRegistration.questions[0].id,'q1');const replay=await f.request(f.path+'/start',body);assert.equal(replay.body.receipt.replayed,true);assert.equal(f.calls.length,2);
});
test('HTTP acquisition retains exact fields, 128KiB, method, query, Host and Origin boundaries',async t=>{
 const f=await fixture(t),body=await f.body({sourceEntryIds:[],materialIds:[]});
 for(const [path,method]of [[f.path,'POST'],[f.path+'/start','GET'],[f.path+'/step','PUT']])assert.equal((await f.request(path,body,{method})).status,405);
 assert.equal((await f.request(f.path+'?revision=0')).status,400);assert.equal((await f.request(f.path+'/start',{...body,acquisitionRef:{forged:true}})).status,400);
 for(const headers of [{host:'outside.example'},{origin:'https://outside.example'},{'sec-fetch-site':'cross-site'}])assert.equal((await f.request(f.path+'/start',body,{headers})).status,403);
 assert.equal((await f.request(f.path+'/start',body,{headers:{'content-length':String(128*1024+1)}})).status,413);assert.equal((await f.request(f.path+'/start',{...body,commandId:'x'.repeat(128*1024)})).status,413);assert.equal(f.calls.length,0);assert.equal(f.tools.length,0);
});
