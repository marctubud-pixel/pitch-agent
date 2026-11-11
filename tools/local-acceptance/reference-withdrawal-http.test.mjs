import test from 'node:test';import assert from 'node:assert/strict';import {webcrypto} from 'node:crypto';
import {withdrawalFixture} from '../workbench/fixtures/local-reference-withdrawal-fixture.mjs';
import {createLocalReferenceRemoval} from '../workbench/local-reference-removal.mjs';
import {createLocalAcceptanceServer} from './server.mjs';
import {createBrowserPending,createPendingApi} from './browser-pending.mjs';
test('actual loopback removal receipt settles after lost reply using GET only; constructed native reducer fixture and separate SQL test scopes stay explicit',async t=>{
 const f=await withdrawalFixture(t),removal=createLocalReferenceRemoval(f.options);let app,origin,token,port=0;
 async function start(){app=await createLocalAcceptanceServer({store:{},rootDir:f.root,pipeline:{withdrawReferenceMaterial:(id,body)=>removal.withdraw(id,body),readReferenceCommand:(id,commandId)=>removal.readReceipt(id,commandId)}});origin=new URL(await app.listen(port)).origin;port=Number(new URL(origin).port);token=(await(await fetch(origin+'/api/session')).json()).token;}
 await start();t.after(async()=>{if(app.server.listening)await app.close();});
 const requests=[];async function request(path,body){requests.push({path,method:body?'POST':'GET'});const response=await fetch(origin+path,{method:body?'POST':'GET',headers:body?{'content-type':'application/json',origin,'x-acceptance-token':token}:{},...(body?{body:JSON.stringify(body)}:{})}),value=await response.json();if(!response.ok)throw Object.assign(Error(value.error),{status:response.status});return value;}
 const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)},journal=()=>createBrowserPending({origin,storage,crypto:webcrypto,withLock:(_key,work)=>work()}),path='/api/cases/case-one/reference-withdrawals';
 const first=createPendingApi({journal:journal(),request:async(path,body)=>{await request(path,body);throw Error('lost reply after committed native removal');}});
 await assert.rejects(first.api(path,f.request),/lost reply/);assert.equal(first.pending().length,1);assert.equal(f.records,1);assert.equal(JSON.stringify([...values]).includes(f.request.reason),false);
 await app.close();await start();requests.length=0;const reopened=createPendingApi({journal:journal(),request});await reopened.reconcile();assert.equal(reopened.pending().length,0);assert.deepEqual(requests,[{path:'/api/cases/case-one/reference-commands/withdraw',method:'GET'}]);assert.equal(f.records,1);
 const replay=await reopened.api(path,f.request);assert.equal(replay.reused,true);assert.equal(f.records,1);assert.equal(replay.commandReceipt.pixelsVerified,false);assert.equal(f.project.referenceMaterials.length,1);assert.equal(f.project.referenceMaterials[0].removed.reason,f.request.reason);
 await assert.rejects(request(path,{...f.request,reason:'changed reason'}),e=>e.status===409);assert.equal(f.records,1);
 const unauthenticated=await fetch(origin+path,{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify(f.request)});assert.equal(unauthenticated.status,403);assert.equal(f.records,1);
});
