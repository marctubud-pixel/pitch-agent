import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync,spawn} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {openStore} from '../workbench/store.mjs';
import {createImageEvidenceStore} from '../workbench/image-evidence.mjs';
import {referenceFixturePng} from '../workbench/reference-dossier-fixtures.mjs';
import {openLocalAcceptanceCoordinator} from '../workbench/local-acceptance-coordinator.mjs';
import {createLocalAcceptanceServer} from './server.mjs';

async function fixture(t,{onIngest}={}){
 const root=await realpath(await mkdtemp(join(tmpdir(),'reference-upload-http-'))),store=openStore(join(root,'native.sqlite')),workflow=join(root,'workflow.sqlite');
 const original=createImageEvidenceStore({rootDir:join(root,'images')});let ingests=0,pipeline,app,url,token;
 const imageStore={...original,async ingest(input){ingests++;const asset=await original.ingest(input);await onIngest?.({workflow,projectId:input.projectId});return asset;}};
 async function start(){pipeline=openLocalAcceptanceCoordinator({databasePath:workflow,projectStore:store,executor:{},imageStore});app=await createLocalAcceptanceServer({store:{},rootDir:root,pipeline});url=new URL(await app.listen(0)).origin;token=(await(await fetch(url+'/api/session')).json()).token;}
 await start();t.after(async()=>{await app.close();pipeline.close();store.close();await rm(root,{recursive:true,force:true});});
 const created=await pipeline.create({commandId:'create',caseId:'dexian',brief:'Synthetic upload transport acceptance only',mode:'assisted'});
 const request={commandId:'upload-one',expectedRevision:created.projectRevision,base64:referenceFixturePng(1).toString('base64'),metadata:{representation:'supplied_image',originalFilename:'synthetic.png',description:'Unreviewed supplied engineering image, not evidence.'}};
 async function post(path,body,{authorized=true}={}){const response=await fetch(url+path,{method:'POST',headers:{origin:url,'content-type':'application/json',...(authorized?{'x-acceptance-token':token}:{})},body:typeof body==='string'?body:JSON.stringify(body)});return {status:response.status,body:await response.json()};}
 return {root,workflow,store,imageStore,created,request,get pipeline(){return pipeline;},get ingests(){return ingests;},post,path:'/api/cases/'+created.id+'/reference-uploads',async restart(){await app.close();pipeline.close();await start();}};
}
test('actual HTTP upload registers original bytes once and survives service restart without reference or factual approval',async t=>{
 const f=await fixture(t),before=f.store.read(f.created.projectId),response=await f.post(f.path,f.request);assert.equal(response.status,201);assert.equal(response.body.factualAuthority,false);assert.equal(response.body.semanticReviewVerified,false);assert.equal(response.body.referenceReviewRequired,true);
 const p=f.store.read(f.created.projectId);assert.equal(p.imageAssets.length,1);for(const field of ['referenceMaterials','verifications','releases','decisions','jobs'])assert.deepEqual(p[field],before[field]);
 await f.restart();const replay=await f.post(f.path,f.request);assert.equal(replay.status,201);assert.equal(replay.body.reused,true);assert.deepEqual(replay.body.asset,response.body.asset);assert.equal(f.ingests,1);
 const bytes=await f.imageStore.read({projectId:p.id,imageId:response.body.asset.id,expectedHash:response.body.asset.sha256});assert.deepEqual(bytes.bytes,Buffer.from(f.request.base64,'base64'));
 const changed=await f.post(f.path,{...f.request,metadata:{...f.request.metadata,description:'another body'}});assert.equal(changed.status,409);assert.equal(changed.body.error,'LOCAL_UPLOAD_COMMAND_REUSED');
});
test('Origin session checks, native revision, metadata whitelist and other route body limits stay enforced',async t=>{
 const f=await fixture(t);
 assert.equal((await f.post(f.path,f.request,{authorized:false})).status,403);
 assert.equal((await f.post(f.path,{...f.request,expectedRevision:99})).status,409);
 assert.equal((await f.post(f.path,{...f.request,path:'/not-allowed'})).status,422);
 const invalid=await f.post(f.path,{...f.request,metadata:{representation:'supplied_image',verified:true}});assert.notEqual(invalid.status,201);
 assert.equal((await f.post('/api/cases',JSON.stringify({commandId:'too-large',brief:'x'.repeat(2*1024*1024)}))).status,413);
 assert.equal(f.store.read(f.created.projectId).imageAssets.length,0);
});
test('only the exact upload route accepts a valid image body above the ordinary 2MiB JSON limit',async t=>{
 const f=await fixture(t),large=execFileSync('python3',['-c',"import sys,random;from PIL import Image;Image.frombytes('RGB',(900,650),random.Random(7).randbytes(900*650*3)).save(sys.stdout.buffer,format='PNG',compress_level=0)"],{maxBuffer:4*1024*1024}),body={...f.request,base64:large.toString('base64')};assert.ok(Buffer.byteLength(JSON.stringify(body))>2*1024*1024);
 const response=await f.post(f.path,body);assert.equal(response.status,201,JSON.stringify(response.body));assert.equal(response.body.asset.byteLength,large.length);
 assert.equal((await f.post(f.path,JSON.stringify({base64:'A'.repeat(12*1024*1024)}))).status,413);
});
test('a separate process admitting a decision during ingestion prevents native registration without changing the pending decision',async t=>{
 let id;
 const f=await fixture(t,{onIngest:async({workflow})=>{execFileSync(process.execPath,['--input-type=module','-e',`import {DatabaseSync} from 'node:sqlite';const db=new DatabaseSync(process.argv[1]);const intent={state:'admitted',request:{commandId:'other-decision',module:'brief'},steps:[{kind:'native_command'}]};db.prepare('INSERT INTO acceptance_decision_intents VALUES(?,?,?,?)').run(process.argv[2],'other-decision','fixed-test-hash',JSON.stringify(intent));db.close();`,workflow,id],{stdio:'pipe'});}});id=f.created.id;
 const response=await f.post(f.path,f.request);assert.equal(response.status,409);assert.equal(response.body.error,'ACCEPTANCE_DECISION_RECONCILIATION_REQUIRED');assert.equal(f.store.read(f.created.projectId).imageAssets.length,0);
 const db=new DatabaseSync(f.workflow,{readOnly:true});try{assert.equal(JSON.parse(db.prepare('SELECT body FROM acceptance_decision_intents').get().body).state,'admitted');}finally{db.close();}
});
test('an unknown advance blocks new registration but cannot invalidate exact recovery of an already committed upload',async t=>{
 const f=await fixture(t);assert.equal((await f.post(f.path,f.request)).status,201);
 const db=new DatabaseSync(f.workflow);try{db.prepare('INSERT INTO acceptance_advances VALUES(?,?,?,?)').run(f.created.id,'unknown-advance','hash',JSON.stringify({state:'needs_reconciliation'}));}finally{db.close();}
 const replay=await f.post(f.path,f.request);assert.equal(replay.status,201);assert.equal(replay.body.reused,true);assert.equal(f.ingests,1);
 const fresh=await f.post(f.path,{...f.request,commandId:'upload-two',expectedRevision:f.store.read(f.created.projectId).revision});assert.equal(fresh.status,409);assert.equal(fresh.body.error,'LOCAL_UPLOAD_ADVANCE_UNRESOLVED');assert.equal(f.store.read(f.created.projectId).imageAssets.length,1);
});

test('two actual processes cannot register different uploads under one command ID',async t=>{
 const f=await fixture(t),modules=Object.fromEntries(['store','image-evidence','local-acceptance-coordinator'].map(n=>[n,new URL('../workbench/'+n+'.mjs',import.meta.url).href]));
 const code=`import {openStore} from ${JSON.stringify(modules.store)};import {createImageEvidenceStore} from ${JSON.stringify(modules['image-evidence'])};import {openLocalAcceptanceCoordinator} from ${JSON.stringify(modules['local-acceptance-coordinator'])};import {join} from 'node:path';const [root,id,serialized]=process.argv.slice(1);const store=openStore(join(root,'native.sqlite')),pipeline=openLocalAcceptanceCoordinator({databasePath:join(root,'workflow.sqlite'),projectStore:store,executor:{},imageStore:createImageEvidenceStore({rootDir:join(root,'images')})});try{const result=await pipeline.uploadReference(id,JSON.parse(serialized));console.log(JSON.stringify({status:201,assetId:result.asset.id}));}catch(e){console.log(JSON.stringify({status:e.status??500,code:e.code,message:e.message}));}finally{pipeline.close();store.close();}`;
 function run(description){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--input-type=module','-e',code,f.root,f.created.id,JSON.stringify({...f.request,metadata:{...f.request.metadata,description}})],{stdio:['ignore','pipe','pipe']});let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);child.on('error',reject);child.on('close',status=>{try{assert.equal(status,0,err);resolve(JSON.parse(out));}catch(e){reject(e);}});});}
 const results=await Promise.all([run('first supplied reference'),run('different supplied reference')]);assert.deepEqual(results.map(r=>r.status).sort(),[201,409],JSON.stringify(results));assert.equal(results.find(r=>r.status===409).code,'LOCAL_UPLOAD_COMMAND_REUSED');assert.equal(f.store.read(f.created.projectId).imageAssets.length,1);
});
