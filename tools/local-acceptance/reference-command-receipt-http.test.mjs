import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,rm,chmod,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {webcrypto} from 'node:crypto';
import {openStore} from '../workbench/store.mjs';
import {createImageEvidenceStore} from '../workbench/image-evidence.mjs';
import {referenceFixturePng} from '../workbench/reference-dossier-fixtures.mjs';
import {openLocalAcceptanceCoordinator} from '../workbench/local-acceptance-coordinator.mjs';
import {createLocalAcceptanceServer} from './server.mjs';
import {createBrowserPending,createPendingApi} from './browser-pending.mjs';
async function fixture(t,{receipts=true}={}){
 const root=await realpath(await mkdtemp(join(tmpdir(),'reference-receipt-http-'))),nativePath=join(root,'native.sqlite'),workflow=join(root,'workflow.sqlite');let store,pipeline,app,origin,token,port=0,ingests=0;
 const images=createImageEvidenceStore({rootDir:join(root,'images')}),imageStore={...images,async ingest(input){ingests++;return images.ingest(input);}};
 async function start(){store=openStore(nativePath);pipeline=openLocalAcceptanceCoordinator({databasePath:workflow,projectStore:store,executor:{},imageStore,...(receipts?{executionRoot:root}:{})});app=await createLocalAcceptanceServer({store:{},rootDir:root,pipeline});origin=new URL(await app.listen(port)).origin;port=Number(new URL(origin).port);token=(await(await fetch(origin+'/api/session')).json()).token;}
 await start();t.after(async()=>{await app.close();pipeline.close();store.close();await rm(root,{recursive:true,force:true});});
 const created=await pipeline.create({commandId:'create',caseId:'dexian',brief:'Synthetic receipt transport only',mode:'assisted'}),body={commandId:'upload-one',expectedRevision:created.projectRevision,base64:referenceFixturePng(1).toString('base64'),metadata:{representation:'supplied_image',description:'Private purpose must not enter browser journal'}};
 async function request(path,body){const r=await fetch(origin+path,{method:body?'POST':'GET',headers:body?{origin,'content-type':'application/json','x-acceptance-token':token}:{},...(body?{body:JSON.stringify(body)}:{})});const value=await r.json();if(!r.ok)throw Object.assign(Error(value.error),{status:r.status});return value;}
 const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};const journal=()=>createBrowserPending({origin,storage,crypto:webcrypto,withLock:(_key,work)=>work()});
 return {root,created,body,request,journal,values,get store(){return store;},get ingests(){return ingests;},path:'/api/cases/'+created.id+'/reference-uploads',async restart(){await app.close();pipeline.close();store.close();await start();}};
}
test('actual upload POST receipt settles pending; GET proves same committed identity without new registration',async t=>{
 const f=await fixture(t),before=f.store.read(f.created.projectId),j=f.journal(),api=createPendingApi({journal:j,request:f.request});const result=await api.api(f.path,f.body);assert.equal(j.list().length,0);assert.equal(result.commandReceipt.state,'committed');assert.equal(result.commandReceipt.referenceAdoptionVerified,false);assert.equal(result.commandReceipt.identity.imageId,result.asset.id);const receipt=await f.request('/api/cases/'+f.created.id+'/reference-commands/upload-one');assert.deepEqual(receipt,result.commandReceipt);assert.equal(f.ingests,1);const p=f.store.read(f.created.projectId);for(const name of ['jobs','verifications','releases','decisions'])assert.deepEqual(p[name],before[name]);
});
test('response loss then same-origin process restart reconciles by GET only and retains private payload outside journal',async t=>{
 const f=await fixture(t),j=f.journal(),api=createPendingApi({journal:j,request:async(path,body)=>{await f.request(path,body);throw Error('synthetic response loss after commit');}});await assert.rejects(()=>api.api(f.path,f.body));assert.equal(j.list()[0].state,'unknown');const saved=JSON.stringify([...f.values]);assert(!saved.includes(f.body.base64));assert(!saved.includes(f.body.metadata.description));await f.restart();const calls=[],reopened=createPendingApi({journal:f.journal(),request:async(path,body)=>{calls.push({path,hasBody:body!==undefined});return f.request(path,body);}});await reopened.reconcile();assert.equal(reopened.pending().length,0);assert.equal(f.ingests,1);assert.deepEqual(calls,[{path:'/api/cases/'+f.created.id+'/reference-commands/upload-one',hasBody:false}]);assert.equal(f.store.read(f.created.projectId).imageAssets.length,1);
});
test('not-connected receipt capability is explicit and a changed original cannot produce a new success proof',async t=>{
 const f=await fixture(t,{receipts:false}),result=await f.request(f.path,f.body);assert.equal(result.commandReceipt,undefined);await assert.rejects(()=>f.request('/api/cases/'+f.created.id+'/reference-commands/upload-one'),e=>e.status===501);
 const ready=await fixture(t),uploaded=await ready.request(ready.path,ready.body),path=join(ready.root,'images/objects',uploaded.asset.sha256),bytes=await readFile(path);await chmod(path,0o600);bytes[bytes.length-1]^=1;await writeFile(path,bytes);await assert.rejects(()=>ready.request('/api/cases/'+ready.created.id+'/reference-commands/upload-one'));assert.equal(ready.ingests,1);
});
