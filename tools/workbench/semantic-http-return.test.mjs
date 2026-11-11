import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import {layoutIssue} from '../auto-layout/semantic-input.mjs';
let failure;
mock.module('./executor.mjs',{namedExports:{createExecutor:()=>({layoutSemanticPlans:async()=>{throw failure;}})}});
const {createServer}=await import('./server.mjs');
async function observe(t){
 const dir=await mkdtemp(join(tmpdir(),'semantic-http-error-SYN-'));
 const server=createServer({dbPath:join(dir,'db'),rootDir:join(dir,'executions'),port:4181,imageProvider:null});
 t.after(async()=>{await server.drain();server.emit('close');await rm(dir,{recursive:true,force:true});});
 const req=Readable.from([]);Object.assign(req,{url:'/api/projects/synthetic/layout-semantic-plans',method:'GET',headers:{host:'127.0.0.1:4181'}});
 return new Promise(resolve=>server.emit('request',req,{setHeader(){},writeHead(status){this.status=status;},end(raw){resolve({status:this.status,body:JSON.parse(String(raw))});}}));
}
test('source-addressed semantic input return reaches HTTP as422 retaining owner and exact location',async t=>{
 try{layoutIssue('SEMANTIC_CENTRAL_OVERFLOW',{artifactId:'actual-first-author-original',style:'stage',pointer:'/manuscript/pageIntents/3',owner:'content-author',originIds:['source:s1'],contentHash:'d55e3ea48a40814027ff2748a84369da61e892e7680bff14fdff31c868400c39'},'Exact central message exceeds its readable title region',{requiredHeight:200,availableHeight:100});}catch(error){failure=error;}
 const result=await observe(t);
 assert.equal(result.status,422,JSON.stringify(result));assert.equal(result.body.error.code,failure.code);assert.deepEqual(result.body.error.issues,failure.issues);
 assert.equal(result.body.error.issues[0].responsibleOwner,'content-author');assert.equal(result.body.error.issues[0].pointer,'/manuscript/pageIntents/3');assert.deepEqual(result.body.error.issues[0].originIds,['source:s1']);
});
test('unrelated programmer errors remain masked500 without fabricated semantic return',async t=>{
 failure=new Error('private implementation diagnostic');const result=await observe(t);assert.equal(result.status,500);assert.equal(result.body.error.code,'INTERNAL_ERROR');assert.equal(Object.hasOwn(result.body.error,'issues'),false);assert.equal(JSON.stringify(result).includes('private implementation diagnostic'),false);
});
