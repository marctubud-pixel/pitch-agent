import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,rm,statfs,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {webcrypto} from 'node:crypto';
import {openEditableProposalStore} from '../auto-layout/editable-proposal.mjs';
import {createLocalAcceptanceServer} from './server.mjs';
import {createBrowserPending,createPendingApi} from './browser-pending.mjs';
const font='/Users/marc/Documents/ChatGPT/调研agent/output/ppt/m6-integrated-v5/build/PingFangSC-Regular.ttf';
function storage(){const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};}
function locks(){let pending=Promise.resolve();return (_name,work)=>{const p=pending.then(work);pending=p.catch(()=>{});return p;};}
test('actual loopback command receipts recover lost editable save and restore responses without replaying POST bodies',async t=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'editable-command-http-'))),fs=await statfs(root,{bigint:true});assert.ok(fs.bavail*fs.bsize>=3n*1024n**3n,'Need >=3GiB before isolated native test');
 const store=await openEditableProposalStore({databasePath:join(root,'drafts.sqlite'),resourceRoot:join(root,'resources')});let app;
 t.after(async()=>{if(app?.server.listening)await app.close();store.close();await rm(root,{recursive:true,force:true});});
 const original=await store.create({id:'http-doc',sourceBinding:{kind:'isolated-command-http-test',finalAuthority:false},input:{brand:{font:{family:'PingFang SC',files:[font]}},assets:{}},plan:{width:1280,height:720,slides:[{id:'page',background:'#FFFFFF',elements:[{id:'title',type:'text',text:'HTTP 原稿标题',size:32,color:'#173C78',x:40,y:40,w:1000,h:100}]}]}});
 app=await createLocalAcceptanceServer({store,rootDir:root});const url=await app.listen(0),origin=new URL(url).origin;assert.equal(new URL(url).hostname,'127.0.0.1');const token=(await (await fetch(url+'api/session')).json()).token;assert.equal(typeof token,'string');
 const requests=[];async function http(path,body){requests.push({method:body===undefined?'GET':'POST',path,...(body?{commandId:body.commandId}:{})});const r=await fetch(origin+path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{Origin:origin,'Content-Type':'application/json','X-Acceptance-Token':token},...(body===undefined?{}:{body:JSON.stringify(body)})});const value=await r.json();if(!r.ok)throw Object.assign(Error(value.error??'HTTP_ERROR'),{status:r.status});return value;}
 const persisted=storage(),withLock=locks(),journal=()=>createBrowserPending({origin,storage:persisted,crypto:webcrypto,withLock});
 const lose=()=>{let once=true;return createPendingApi({journal:journal(),request:async(path,body)=>{const value=await http(path,body);if(body&&once){once=false;throw Error('Synthetic lost response after actual committed HTTP success');}return value;}});};
 const save={commandId:'lost-save-http',expectedRevision:1,changes:[{slideId:'page',elementId:'title',values:{text:'HTTP 保存标题'}}]};
 await assert.rejects(()=>lose().api('/api/documents/http-doc/save',save));assert.equal(store.read('http-doc').revision,2);assert.equal(journal().list()[0].commandId,save.commandId);
 const reload=createPendingApi({journal:journal(),request:http});await reload.reconcile();assert.equal(reload.pending().length,0);assert.equal(requests.filter(r=>r.method==='POST').length,1);assert.equal(requests.at(-1).path,'/api/documents/http-doc/commands/lost-save-http');
 const saved=await http('/api/documents/http-doc');assert.equal(saved.plan.slides[0].elements[0].text,'HTTP 保存标题');
 const restore={commandId:'lost-restore-http',expectedRevision:2,revision:1};await assert.rejects(()=>lose().api('/api/documents/http-doc/restore',restore));assert.equal(store.read('http-doc').revision,3);
 const secondReload=createPendingApi({journal:journal(),request:http});await secondReload.reconcile();assert.equal(secondReload.pending().length,0);assert.equal(requests.filter(r=>r.method==='POST').length,2);
 const current=await http('/api/documents/http-doc'),history=await http('/api/documents/http-doc/history'),old=await http('/api/documents/http-doc?revision=2');assert.equal(current.plan.slides[0].elements[0].text,'HTTP 原稿标题');assert.equal(old.documentHash,saved.documentHash);assert.equal(old.plan.slides[0].elements[0].text,'HTTP 保存标题');assert.equal(history.length,3);assert.equal(store.read('http-doc',1).documentHash,original.documentHash);
 await journal().prepare('/api/documents/http-doc/save',{...save,commandId:'never-dispatched',expectedRevision:3});await secondReload.reconcile();assert.equal(secondReload.pending().length,1);assert.equal(secondReload.pending()[0].commandId,'never-dispatched');
 const otherStorage=storage(),wrongJournal=createBrowserPending({origin,storage:otherStorage,crypto:webcrypto,withLock:locks()});await wrongJournal.prepare('/api/documents/http-doc/save',{...save,changes:[{slideId:'page',elementId:'title',values:{text:'Different input must not clear'}}]});const wrongClient=createPendingApi({journal:wrongJournal,request:http});await wrongClient.reconcile();assert.equal(wrongClient.pending().length,1);assert.equal(wrongClient.pending()[0].commandId,save.commandId);
 assert.equal(requests.filter(r=>r.method==='POST').length,2);assert.equal(store.read('http-doc').revision,3);
 const proof={scope:'isolated actual loopback HTTP and canonical SQLite; not browser',loopback:true,requests,postCount:2,revision:3,historyCount:3,saveAndRestoreSettledWithoutPostReplay:true,unknownKept:true,wrongHashKept:true,customerTextInReceipt:false,realModels:false};
 if(process.env.LOCAL_EDITOR_COMMAND_PROOF_PATH)await writeFile(process.env.LOCAL_EDITOR_COMMAND_PROOF_PATH,JSON.stringify(proof,null,2));console.log('EDITOR_COMMAND_HTTP_PROOF '+JSON.stringify(proof));
});
