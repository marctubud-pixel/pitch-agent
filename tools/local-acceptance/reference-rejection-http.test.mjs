import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,realpath,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';import {webcrypto} from 'node:crypto';
import {openStore} from '../workbench/store.mjs';
import {createImageEvidenceStore} from '../workbench/image-evidence.mjs';
import {referenceFixturePng} from '../workbench/reference-dossier-fixtures.mjs';
import {createLocalAcceptanceServer} from './server.mjs';
import {openLocalAcceptanceCoordinator} from '../workbench/local-acceptance-coordinator.mjs';
import {createBrowserPending,createPendingApi} from './browser-pending.mjs';
test('HTTP rejected upload survives service restart and a corrected new request commits once',async t=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'reference-negative-http-'))),imageStore=createImageEvidenceStore({rootDir:join(root,'images')});let store,pipeline,app,origin,port=0,token,posts=0;
 async function start(){store=openStore(join(root,'native.sqlite'));pipeline=openLocalAcceptanceCoordinator({databasePath:join(root,'workflow.sqlite'),projectStore:store,executor:{},executionRoot:root,imageStore});app=await createLocalAcceptanceServer({store:{},rootDir:root,pipeline});origin=new URL(await app.listen(port)).origin;port=Number(new URL(origin).port);token=(await(await fetch(origin+'/api/session')).json()).token;}
 async function stop(){await app.close();pipeline.close();store.close();}
 await start();t.after(async()=>{await stop();await rm(root,{recursive:true,force:true});});
 const created=await pipeline.create({commandId:'create',caseId:'dexian',brief:'Synthetic HTTP correction test',mode:'assisted'}),memory=new Map();
 const journal=createBrowserPending({origin,crypto:webcrypto,storage:{getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)},withLock:async(_,work)=>work()});
 const api=createPendingApi({journal,request:async(path,body)=>{if(body)posts++;const r=await fetch(origin+path,{method:body?'POST':'GET',...(body?{headers:{origin,'x-acceptance-token':token,'content-type':'application/json'},body:JSON.stringify(body)}:{})});const value=await r.json();if(!r.ok)throw Object.assign(Error(value.error??'HTTP failure'),{status:r.status});return value;}});
 const path='/api/cases/'+created.id+'/reference-uploads';
 await assert.rejects(()=>api.api(path,{commandId:'bad',expectedRevision:created.projectRevision,base64:'invalid!'}));assert.equal(journal.list().length,1);
 await stop();await start();await api.reconcile();assert.equal(posts,1);assert.equal(journal.list().length,0);
 const uploaded=await api.api(path,{commandId:'corrected',expectedRevision:created.projectRevision,base64:referenceFixturePng(2).toString('base64'),metadata:{representation:'supplied_image',description:'Synthetic correction test'}});
 assert.equal(uploaded.commandReceipt.state,'committed');assert.equal(posts,2);assert.equal(journal.list().length,0);assert.equal(store.read(created.projectId).imageAssets.length,1);
 assert.ok(![...memory.values()].join('').includes('Synthetic correction test'));
});
