import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import {createBriefServer} from './brief-server.mjs';
const close=server=>new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
async function fixture(t){
 const root=await realpath(await mkdtemp(join(tmpdir(),'reader-http-'))),dbPath=join(root,'test.sqlite');let server=createBriefServer({dbPath});
 t.after(async()=>{await close(server);await rm(root,{recursive:true,force:true});});
 return {async reopen(){await close(server);server=createBriefServer({dbPath});},request(path,body,{method=body===undefined?'GET':'POST',headers={}}={}){
  const req=Readable.from([Buffer.from(body===undefined?'':JSON.stringify(body))]);Object.assign(req,{url:path,method,headers:{host:'127.0.0.1:4182','content-type':'application/json',...headers}});
  return new Promise(resolve=>{const result={headers:{}};server.emit('request',req,{setHeader(k,v){result.headers[k.toLowerCase()]=v;},writeHead(status,values){result.status=status;Object.assign(result.headers,values);},end(value){result.body=JSON.parse(Buffer.from(value??'').toString());resolve(result);}});});
 }};
}
test('default local service can preregister questions and replays the exact request without executing a reader',async t=>{
 const f=await fixture(t),created=await f.request('/api/v1/projects',{name:'Reader input HTTP fixture',brief:'合成包装识别任务，不推断真实偏好。',commandId:'create'}),p=created.body.project,route=`/api/v1/projects/${p.id}`;
 const caps=(await f.request('/api/v1/capabilities')).body;assert.equal(caps.research.reader.configured,false);assert.equal(caps.research.reader.recheckAvailable,false);
 const request={questions:[{id:'q1',question:'蓝色是否能证明购买偏好？',critical:true}],readerCount:1,commandId:'questions',expectedRevision:0};
 assert.equal((await f.request(`${route}/research-questions`,request)).status,422,'Unconfirmed task cannot register a plan');
 const confirmed=await f.request(`${route}/commands`,{kind:'confirm-task-card',taskCardId:p.activeTaskCardId,commandId:'confirm',expectedRevision:0});assert.equal(confirmed.status,200);request.expectedRevision=confirmed.body.project.revision;
 const first=await f.request(`${route}/research-questions`,request);assert.equal(first.status,200,JSON.stringify(first.body));assert.equal(first.body.project.jobs.length,0);assert.equal(first.body.receipt.replayed,false);
 const plan=first.body.project.researchQuestionRegistrations[0];assert.equal(plan.id,first.body.receipt.registrationId);assert.match(plan.taskCardHash,/^[a-f0-9]{64}$/);assert.equal(plan.registeredRevision,first.body.project.revision);
 await f.reopen();const replay=await f.request(`${route}/research-questions`,request);assert.equal(replay.status,200);assert.equal(replay.body.receipt.replayed,true);assert.equal(replay.body.project.researchQuestionRegistrations.length,1);
 const revised=await f.request(`${route}/commands`,{kind:'revise-task-card',taskCardId:`${p.id}:scope:next`,brief:'另一范围，旧问题不能当本版计划',commandId:'revise',expectedRevision:replay.body.project.revision});assert.equal(revised.status,200);
 const historicalReplay=await f.request(`${route}/research-questions`,request);assert.equal(historicalReplay.status,200);assert.equal(historicalReplay.body.receipt.replayed,true);assert.equal(historicalReplay.body.receipt.registrationId,plan.id);assert.notEqual(historicalReplay.body.project.activeTaskCardId,plan.taskCardId);assert.equal(historicalReplay.body.project.researchQuestionRegistrations.length,1);
 const reused=await f.request(`${route}/research-questions`,{...request,readerCount:2});assert.equal(reused.status,409);assert.equal(reused.body.error.code,'COMMAND_ID_REUSED');
 const reconfirm=await f.request(`${route}/commands`,{kind:'confirm-task-card',taskCardId:historicalReplay.body.project.activeTaskCardId,commandId:'confirm-new',expectedRevision:historicalReplay.body.project.revision});assert.equal(reconfirm.status,200);
 const blocked=await f.request(`${route}/research-readers`,{artifactId:'no-report',registrationId:plan.id,seat:0,commandId:'reader',expectedRevision:replay.body.project.revision});assert.equal(blocked.status,422);assert.equal(blocked.body.error.code,'RESEARCH_EXECUTION_UNAVAILABLE');
 assert.equal((await f.request(`${route}/research-reader-reports/no-report`)).status,404);
 assert.equal((await f.request(`${route}/research-questions`,{...request,approved:true})).status,400);
 for(const questions of [[null],[{id:'q',question:'bad',critical:'yes'}]])assert.equal((await f.request(`${route}/research-questions`,{...request,commandId:'invalid',questions})).status,400);
 for(const patch of [{seat:'0'},{previousReportId:''},{previousReportId:'old'}])assert.equal((await f.request(`${route}/research-readers`,{artifactId:'no-report',registrationId:plan.id,seat:0,commandId:'invalid-reader',expectedRevision:reconfirm.body.project.revision,...patch})).status,400);
 assert.equal((await f.request(`${route}/research-reader-dispositions`,{artifactId:'no-report',previousReportId:'old',dispositions:[null],commandId:'invalid-disposition',expectedRevision:reconfirm.body.project.revision})).status,400);
 assert.equal((await f.request(`${route}/research-questions?revision=1`,request)).status,400);
 assert.equal((await f.request(`${route}/research-questions`,request,{headers:{origin:'https://outside.example'}})).status,403);
 assert.equal((await f.request(`${route}/research-reader-reports/no-report`,{},{})).status,405);
});
