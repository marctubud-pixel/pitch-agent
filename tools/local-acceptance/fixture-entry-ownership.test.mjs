import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable,Writable} from 'node:stream';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createLocalAcceptanceServer} from './server.mjs';
import {closeCompleteOwned} from './launch-complete.mjs';

async function request(server,method,url,token,{beforeBody}={}){
 const body=method==='POST'?JSON.stringify({commandId:'test',revision:1}):null;
 const req=Readable.from((async function*(){if(body){beforeBody?.();yield Buffer.from(body);}})());
 req.method=method;req.url=url;
 req.headers={host:'127.0.0.1:48123',...(body?{origin:'http://127.0.0.1:48123','x-acceptance-token':token,'content-type':'application/json'}:{})};
 let status,content='';
 const res=new Writable({write(chunk,encoding,done){content+=chunk.toString();done();}});
 res.setHeader=()=>{};res.writeHead=value=>{status=value;};
 const finished=new Promise(resolve=>res.once('finish',resolve));
 server.emit('request',req,res);await finished;
 return {status,body:JSON.parse(content)};
}

test('ownership refusal protects document save, restore, export and case creation',async t=>{
 const root=await mkdtemp(join(tmpdir(),'entry-all-writes-'));t.after(()=>rm(root,{recursive:true,force:true}));
 let effects=0,checks=0;
 const effect=()=>{effects++;return {ok:true};};
 const beforeMutation=async()=>{checks++;throw Object.assign(Error('lease replaced'),{code:'LOCAL_FIXTURE_LEASE_CHANGED'});};
 const {server}=await createLocalAcceptanceServer({rootDir:root,store:{save:effect,restore:effect,read:effect},pipeline:{create:effect},beforeMutation});
 server.address=()=>({port:48123});
 const token=(await request(server,'GET','/api/session')).body.token;
 for(const url of ['/api/documents/doc/save','/api/documents/doc/restore','/api/documents/doc/export','/api/cases']){
  const result=await request(server,'POST',url,token);
  assert.equal(result.body.error,'LOCAL_FIXTURE_LEASE_CHANGED',url);
 }
 assert.equal(effects,0);assert.equal(checks,4);
});

test('ownership is checked again after request body arrives',async t=>{
 const root=await mkdtemp(join(tmpdir(),'entry-body-ownership-'));t.after(()=>rm(root,{recursive:true,force:true}));
 let valid=true,effects=0,checks=0;
 const {server}=await createLocalAcceptanceServer({rootDir:root,store:{save:()=>effects++},beforeMutation:async()=>{
  checks++;if(!valid)throw Object.assign(Error('lease replaced'),{code:'LOCAL_FIXTURE_LEASE_CHANGED'});
 }});
 server.address=()=>({port:48123});
 const token=(await request(server,'GET','/api/session')).body.token;
 const result=await request(server,'POST','/api/documents/doc/save',token,{beforeBody:()=>{valid=false;}});
 assert.equal(result.body.error,'LOCAL_FIXTURE_LEASE_CHANGED');assert.equal(effects,0);assert.equal(checks,2);
});

test('failed listener close retains lease and dependencies, and a later close retries',async()=>{
 const sequence=[];let failed=false;
 const owned={
  app:{server:{listening:true},close:async()=>{sequence.push('app');if(!failed){failed=true;throw Error('listener still live');}owned.app.server.listening=false;}},
  imageServer:{listening:true,close:callback=>{sequence.push('image');owned.imageServer.listening=false;callback();}},
  pipeline:{close:()=>sequence.push('pipeline')},projectStore:{close:()=>sequence.push('project')},editableStore:{close:()=>sequence.push('editable')},fixtureSession:{close:()=>sequence.push('lease')},
 };
 await assert.rejects(closeCompleteOwned(owned),/LOCAL_COMPLETE_CLEANUP_FAILED/);
 assert.deepEqual(sequence,['app']);
 await closeCompleteOwned(owned);
 assert.deepEqual(sequence,['app','app','image','pipeline','project','editable','lease']);
 await closeCompleteOwned(owned);
 assert.deepEqual(sequence,['app','app','image','pipeline','project','editable','lease']);
});

test('failed pipeline close keeps stores and lease, successful steps are not repeated',async()=>{
 const sequence=[];let fail=true;
 const owned={app:{server:{listening:true},close:()=>{sequence.push('app');owned.app.server.listening=false;}},pipeline:{close:()=>{sequence.push('pipeline');if(fail){fail=false;throw Error('worker still active');}}},projectStore:{close:()=>sequence.push('project')},editableStore:{close:()=>sequence.push('editable')},fixtureSession:{close:()=>sequence.push('lease')}};
 await assert.rejects(closeCompleteOwned(owned),/LOCAL_COMPLETE_CLEANUP_FAILED/);
 assert.deepEqual(sequence,['app','pipeline']);
 await closeCompleteOwned(owned);
 assert.deepEqual(sequence,['app','pipeline','pipeline','project','editable','lease']);
});
