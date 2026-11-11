import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import {createBriefServer} from './brief-server.mjs';
import {cardHash} from './intake-contract.mjs';

const bytes=Buffer.from('%PDF-1.7\n% Storage-only fixture: parsing is not claimed.\n%%EOF');
const close=server=>new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
async function fixture(t){
  const root=await realpath(await mkdtemp(join(tmpdir(),'brief-original-http-'))),dbPath=join(root,'test.sqlite');
  let server=createBriefServer({dbPath});
  t.after(async()=>{await close(server);await rm(root,{recursive:true,force:true});});
  return {async reopen(){await close(server);server=createBriefServer({dbPath});},
    request(path,body,{method=body===undefined?'GET':'POST',headers={}}={}){
      const raw=body===undefined?'':JSON.stringify(body),req=Readable.from([Buffer.from(raw)]);
      Object.assign(req,{url:path,method,headers:{host:'127.0.0.1:4182','content-type':'application/json',...headers}});
      return new Promise(resolve=>{
        const result={headers:{}};
        server.emit('request',req,{setHeader(key,value){result.headers[key.toLowerCase()]=value;},writeHead(status,values){result.status=status;for(const [key,value]of Object.entries(values??{}))result.headers[key.toLowerCase()]=value;},end(value){result.bytes=Buffer.from(value??'');if(result.headers['content-type']?.startsWith('application/json'))result.body=JSON.parse(result.bytes.toString());resolve(result);}});
      });
    }};
}
async function project(app,key='one'){
  const response=await app.request('/api/v1/projects',{name:'原文件接入',brief:'用于工程原文件保存验证，未执行模型',commandId:`original-http-${key}`});
  assert.equal(response.status,201);return response.body.project;
}
const upload=p=>({commandId:'save-original',expectedRevision:p.revision,originalFilename:'品牌资料.pdf',taskCardId:p.activeTaskCardId,taskCardHash:cardHash(p.taskCards.find(c=>c.id===p.activeTaskCardId)),base64:bytes.toString('base64'),metadata:{clientResourceId:'brand-selected-1',declaredMediaType:'application/pdf',lastModified:123,note:'用户提供，尚未解析或采用'}});

test('PDF original saves before confirmation and reopens with exact bytes and receipt',async t=>{
  const app=await fixture(t),p=await project(app),route=`/api/v1/projects/${p.id}/documents`,body=upload(p);
  const caps=(await app.request('/api/v1/capabilities')).body;
  assert.equal(caps.originals.originalStorage,true);assert.equal(caps.executionAvailable,false);assert.equal(caps.originals.modelExtractionAvailable,false);
  const saved=await app.request(route,body);assert.equal(saved.status,200,JSON.stringify(saved.body));assert.equal(saved.body.receipt.replayed,false);
  assert.equal(saved.body.project.confirmations.length,0);assert.equal(saved.body.project.jobs.length,1);
  assert.deepEqual(saved.body.project.jobs.map(j=>[j.stage,j.purpose,j.status,j.attempts.length]),[['intake','intake_document','queued',0]]);
  assert.equal(saved.body.document.storage,'original_saved');assert.equal(saved.body.document.modelReading,'not_verified');assert.equal(saved.body.document.humanAdoption,'not_verified');
  const id=saved.body.receipt.documentId;
  await app.reopen();
  const listed=await app.request(route);assert.equal(listed.body.documents.length,1);assert.equal(listed.body.documents[0].isCurrent,true);
  const download=await app.request(`${route}/${id}/original`);assert.equal(download.status,200);assert.equal(download.headers['content-type'],'application/pdf');assert.deepEqual(download.bytes,bytes);
  const replay=await app.request(route,body);assert.equal(replay.status,200);assert.equal(replay.body.receipt.replayed,true);assert.equal(replay.body.project.revision,saved.body.project.revision);
  const mismatch=await app.request(route,{...body,metadata:{...body.metadata,note:'不同说明'}});assert.equal(mismatch.status,409);assert.equal(mismatch.body.error.code,'COMMAND_ID_REUSED');
  const second=await project(app,'two');assert.equal((await app.request(`/api/v1/projects/${second.id}/documents/${id}/original`)).status,404);
});

test('original routes retain local origin, exact query, body and method boundaries',async t=>{
  const app=await fixture(t),p=await project(app),route=`/api/v1/projects/${p.id}/documents`,body=upload(p);
  assert.equal((await app.request(`${route}?revision=0`)).status,400);
  assert.equal((await app.request(route,body,{headers:{origin:'https://outside.example'}})).status,403);
  assert.equal((await app.request(route,body,{method:'PUT'})).status,405);
  assert.equal((await app.request(route,{...body,base64:'abc==='})).status,400);
  assert.equal((await app.request(route,{...body,base64:Buffer.from('not PDF bytes').toString('base64')})).status,422);
  assert.equal((await app.request(route,{...body,parsed:true})).status,400);
  assert.equal((await app.request(route,{...body,metadata:{...body.metadata,note:'字'.repeat(1001)}})).status,422);
  assert.equal((await app.request(route,body,{headers:{'content-length':String(17*1024*1024)}})).status,413);
  const current=(await app.request(`/api/v1/projects/${p.id}`)).body.project;
  assert.equal(current.revision,0);assert.equal(current.jobs.length,0);
});
