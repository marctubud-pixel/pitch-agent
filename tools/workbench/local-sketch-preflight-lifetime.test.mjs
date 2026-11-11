import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from './store.mjs';
import {semanticConfiguration,SEMANTIC_PROTOCOL} from './semantic-authority.mjs';
import {withSketchPreflightProject} from './local-sketch-runner.mjs';
async function fixture(t){const root=await realpath(await mkdtemp(join(tmpdir(),'sketch-preflight-lifetime-')));t.after(()=>rm(root,{recursive:true,force:true}));const databasePath=join(root,'test.sqlite'),store=openStore(databasePath);try{store.create({id:'p',name:'Local lifetime test only',brief:'25岁社交；度数未定',mode:'assisted'},{actorType:'human',actorId:'explicit-test',runId:'test',contextId:'test'});store.registerSemanticConfiguration({rubricVersion:SEMANTIC_PROTOCOL,readinessBinding:{providerId:'local-synthetic',model:'synthetic',role:'readiness-reviewer'},challengeBinding:{providerId:'local-synthetic',model:'synthetic',role:'semantic-challenger'}},{expectedEpoch:0});}finally{store.close();}return {openStore,databasePath,projectId:'p'};}
test('actual native reader fails after premature store close, proving the original lifecycle defect',async t=>{const f=await fixture(t),store=openStore(f.databasePath),p=store.read('p');assert.equal(semanticConfiguration(p).rubricVersion,SEMANTIC_PROTOCOL);store.close();assert.throws(()=>semanticConfiguration(p),{code:'SEMANTIC_STORE_CLOSED'});});
test('preflight retains real semantic authority through all awaited evidence checks then closes before execution reopens',async t=>{
 const f=await fixture(t),checks=[];let retained;
 const result=await withSketchPreflightProject(f,async p=>{retained=p;checks.push(semanticConfiguration(p).challengeBinding.role);await new Promise(resolve=>setImmediate(resolve));checks.push(semanticConfiguration(p).readinessBinding.role);return {projectId:p.id,revision:p.revision};});
 assert.deepEqual(checks,['semantic-challenger','readiness-reviewer']);assert.deepEqual(result,{projectId:'p',revision:0});assert.throws(()=>semanticConfiguration(retained),{code:'SEMANTIC_STORE_CLOSED'});
 const executionStore=openStore(f.databasePath);try{const current=executionStore.read('p');assert.equal(current.revision,0);assert.equal(current.confirmations.length,0);assert.equal(current.jobs.length,0);assert.equal(semanticConfiguration(current).rubricVersion,SEMANTIC_PROTOCOL);}finally{executionStore.close();}
});
test('failed awaited preflight also closes its original native authority without approving anything',async t=>{const f=await fixture(t);let retained;await assert.rejects(()=>withSketchPreflightProject(f,async p=>{retained=p;await Promise.resolve();assert.equal(semanticConfiguration(p).rubricVersion,SEMANTIC_PROTOCOL);throw Object.assign(Error('actual check rejected'),{code:'SYNTHETIC_PREFLIGHT_REJECTION'});}),{code:'SYNTHETIC_PREFLIGHT_REJECTION'});assert.throws(()=>semanticConfiguration(retained),{code:'SEMANTIC_STORE_CLOSED'});});
