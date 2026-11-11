import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {webcrypto} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {openStore} from '../workbench/store.mjs';
import {openLocalAcceptanceCoordinator} from '../workbench/local-acceptance-coordinator.mjs';
import {createLocalAcceptanceServer} from './server.mjs';
import {createBrowserPending,createPendingApi} from './browser-pending.mjs';
import {normalizeDecisionWire} from './request-identity.mjs';

async function fixture(t,{admittedFailure=false}={}){
 const root=await mkdtemp(join(tmpdir(),'decision-rejection-http-')),store=openStore(join(root,'native.sqlite'));let calls=0,coordinator,app,url,token;
 const source={read:(...a)=>store.read(...a),create:(...a)=>store.create(...a),command:(...a)=>{calls++;if(admittedFailure&&calls===1)throw Object.assign(Error('Failure after durable admission'),{code:'ACCEPTANCE_DECISION_STALE',status:409});return store.command(...a);}};
 const config={databasePath:join(root,'workflow.sqlite'),projectStore:source,executor:{}};
 const start=async port=>{coordinator=openLocalAcceptanceCoordinator(config);app=await createLocalAcceptanceServer({store:{},rootDir:root,pipeline:coordinator});url=new URL(await app.listen(port??0)).origin;token=(await (await fetch(url+'/api/session')).json()).token;};await start();
 t.after(async()=>{await app.close();coordinator.close();store.close();await rm(root,{recursive:true,force:true});});
 const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
 const journal=()=>createBrowserPending({origin:url,storage,crypto:webcrypto,withLock:(_name,work)=>Promise.resolve().then(work)});
 let posts=0;
 const request=async(path,body)=>{if(body)posts++;const response=await fetch(url+path,{method:body?'POST':'GET',headers:body?{Origin:url,'Content-Type':'application/json','X-Acceptance-Token':token}:{},...(body?{body:JSON.stringify(body)}:{})}),value=await response.json();if(!response.ok)throw Object.assign(Error(value.message),{status:response.status,code:value.error});return value;};
 return {root,store,request,data,journal,get coordinator(){return coordinator;},get url(){return url;},get calls(){return calls;},get posts(){return posts;},async restart(){const port=app.server.address().port;await app.close();coordinator.close();await start(port);},counts(){const db=new DatabaseSync(join(root,'workflow.sqlite'),{readOnly:true});try{return Object.fromEntries(['acceptance_decision_intents','acceptance_decisions','acceptance_decision_rejections'].map(table=>[table,db.prepare('SELECT count(*) n FROM '+table).get().n]));}finally{db.close();}}};
}
test('actual stale HTTP decision survives restart, settles only its exact receipt and permits explicit new-basis submission',async t=>{
 const f=await fixture(t),initial=await f.coordinator.create({commandId:'create',caseId:'dexian',brief:'得闲，25岁社交包装工程测试，度数未定。'}),path='/api/cases/'+initial.id+'/continue';
 let p=f.store.read(initial.projectId);f.store.command(p.id,{kind:'revise-task-card',taskCardId:'revised-card',brief:'得闲，25岁社交使用，轻松表达，未定信息仍未定。',commandId:'separate-revision',expectedRevision:p.revision},{actorType:'human',actorId:'engineering-fixture',runId:'revision-test',contextId:'revision-test'});
 const revision=f.store.read(p.id).revision,body={commandId:'stale',module:'brief',decision:'approve',expectedBasisHash:initial.nextAction.evidenceHash,comment:'私密测试正文不存浏览器'},api=createPendingApi({journal:f.journal(),request:f.request});
 await assert.rejects(()=>api.api(path,body),{status:409,code:'ACCEPTANCE_DECISION_STALE'});assert.equal(api.pending().length,1);assert.equal(f.calls,0);assert.equal(f.store.read(p.id).revision,revision);assert.deepEqual(f.counts(),{acceptance_decision_intents:0,acceptance_decisions:0,acceptance_decision_rejections:1});assert(!JSON.stringify([...f.data]).includes(body.comment));
 const retained=api.pending()[0],receipt=await f.request('/api/cases/'+initial.id+'/decisions/stale');assert.equal(receipt.requestDigest,retained.requestDigest);assert.equal(receipt.effects,'not_dispatched');
 await f.restart();const reopened=createPendingApi({journal:f.journal(),request:f.request});await reopened.reconcile();assert.equal(reopened.pending().length,0);assert.equal(f.calls,0);assert.equal(f.posts,1);
 await assert.rejects(()=>f.request(path,body),{code:'ACCEPTANCE_DECISION_STALE'});assert.equal(f.calls,0);
 const current=await f.request('/api/cases/'+initial.id);await assert.rejects(()=>f.request(path,{...body,expectedBasisHash:current.nextAction.evidenceHash}),{code:'ACCEPTANCE_COMMAND_REUSED'});assert.equal(f.calls,0);
 const result=await reopened.api(path,{...body,commandId:'explicit-new-command',expectedBasisHash:current.nextAction.evidenceHash});assert.equal(f.calls,1);assert.equal(result.nextAction.module,'research');assert.equal(reopened.pending().length,0);
 const asset=await fetch(f.url+'/request-identity.mjs');assert.equal(asset.status,200);
});
test('HTTP stage alias rejection is bound to the actual wire body, not the normalized internal request',async t=>{
 const f=await fixture(t),initial=await f.coordinator.create({commandId:'create',caseId:'m6',brief:'通用春节KV工程测试。'}),body={commandId:'alias',stage:'brief',decision:'approve',expectedBasisHash:'f'.repeat(64)},api=createPendingApi({journal:f.journal(),request:f.request});
 await assert.rejects(()=>api.api('/api/cases/'+initial.id+'/continue',body),{code:'ACCEPTANCE_DECISION_STALE'});const receipt=await f.request('/api/cases/'+initial.id+'/decisions/alias');assert.equal(receipt.requestDigest,await f.journal().digest(body));assert.notEqual(receipt.requestDigest,await f.journal().digest({...body,stage:undefined,module:'brief'}));await api.reconcile();assert.equal(api.pending().length,0);assert.equal(f.calls,0);
});
test('admitted409 and unauthorized POST cannot mint a safe rejection or settle an unknown command',async t=>{
 const f=await fixture(t,{admittedFailure:true}),initial=await f.coordinator.create({commandId:'create',caseId:'dexian',brief:'独立工程故障测试'}),path='/api/cases/'+initial.id+'/continue',body={commandId:'admitted',module:'brief',decision:'approve',expectedBasisHash:initial.nextAction.evidenceHash},api=createPendingApi({journal:f.journal(),request:f.request});
 await assert.rejects(()=>api.api(path,body),{status:409,code:'ACCEPTANCE_DECISION_STALE'});assert.equal(f.calls,1);assert.equal(f.counts().acceptance_decision_intents,1);assert.equal(f.counts().acceptance_decision_rejections,0);assert.equal((await f.request('/api/cases/'+initial.id+'/decisions/admitted')).state,'unknown');await api.reconcile();assert.equal(api.pending().length,1);
 await assert.rejects(()=>api.api(path,{...body,commandId:'unsafe-new',comment:'changed'}),{code:'LOCAL_PENDING_DIFFERENT_REQUEST'});assert.equal(f.calls,1);
 const denied=await fetch(f.url+path,{method:'POST',headers:{Origin:f.url,'Content-Type':'application/json'},body:JSON.stringify({...body,commandId:'no-token',expectedBasisHash:'f'.repeat(64)})});assert.equal(denied.status,403);assert.equal(f.counts().acceptance_decision_rejections,0);
});
test('module, stage and both-form committed decisions settle after lost response and restart without another POST',async t=>{
 for(const form of ['module','stage','both']){
  const f=await fixture(t),initial=await f.coordinator.create({commandId:'create',caseId:'dexian',brief:'wire identity engineering fixture'}),body={commandId:'confirm',...(form!=='stage'?{module:'brief'}:{}),...(form!=='module'?{stage:'brief'}:{}),decision:'approve',expectedBasisHash:initial.nextAction.evidenceHash,...(form==='both'?{comment:''}:{})};
  let lost=true;const api=createPendingApi({journal:f.journal(),request:async(path,value)=>{const result=await f.request(path,value);if(value&&lost){lost=false;throw Error('Lost successful decision response');}return result;}});
  await assert.rejects(()=>api.api('/api/cases/'+initial.id+'/continue',body),/Lost successful/);assert.equal(f.calls,1);assert.equal(api.pending().length,1);
  const view=await f.coordinator.read(initial.id),receipt=view.decisions[0].commandReceipt;assert.equal(receipt.protocol,'local-decision-commit-v1');assert.equal(receipt.requestDigest,await f.journal().digest(body));assert.equal(receipt.caseId,initial.id);
  await f.restart();const reopened=createPendingApi({journal:f.journal(),request:f.request});await reopened.reconcile();assert.equal(reopened.pending().length,0);assert.equal(f.calls,1);assert.equal(f.posts,1);assert.equal(f.store.read(initial.projectId).confirmations.length,1);
 }
});
function makeLegacy(f,{removeWire=false}={}){
 const db=new DatabaseSync(join(f.root,'workflow.sqlite'));try{
  for(const [table,column]of [['acceptance_cases','body'],['acceptance_creations','payload']])for(const row of db.prepare('SELECT rowid,'+column+' value FROM '+table).all()){const body=JSON.parse(row.value);delete body.decisionAdmissionProtocol;db.prepare('UPDATE '+table+' SET '+column+'=? WHERE rowid=?').run(JSON.stringify(body),row.rowid);}
  if(removeWire)for(const row of db.prepare('SELECT rowid,body FROM acceptance_decision_intents').all()){const body=JSON.parse(row.body);delete body.wireIdentity;db.prepare('UPDATE acceptance_decision_intents SET body=? WHERE rowid=?').run(JSON.stringify(body),row.rowid);}
 }finally{db.close();}
}
test('legacy case creation replay never adds the new protocol or retrospectively proves an unseen stale command safe',async t=>{
 const f=await fixture(t),create={commandId:'create',caseId:'m6',brief:'legacy fixture'},initial=await f.coordinator.create(create);makeLegacy(f);await f.restart();await f.coordinator.create(create);
 const db=new DatabaseSync(join(f.root,'workflow.sqlite'),{readOnly:true});try{assert.equal(JSON.parse(db.prepare('SELECT body FROM acceptance_cases').get().body).decisionAdmissionProtocol,undefined);assert.equal(JSON.parse(db.prepare('SELECT payload FROM acceptance_creations').get().payload).decisionAdmissionProtocol,undefined);}finally{db.close();}
 const api=createPendingApi({journal:f.journal(),request:f.request});await assert.rejects(()=>api.api('/api/cases/'+initial.id+'/continue',{commandId:'old-unknown',module:'brief',decision:'approve',expectedBasisHash:'f'.repeat(64)}),{code:'ACCEPTANCE_DECISION_STALE'});assert.equal(f.counts().acceptance_decision_rejections,0);await api.reconcile();assert.equal(api.pending().length,1);assert.equal(f.calls,0);
});
test('an old case and intent without wire metadata retain exact known-before-effect recovery',async t=>{
 const f=await fixture(t,{admittedFailure:true}),initial=await f.coordinator.create({commandId:'create',caseId:'dexian',brief:'legacy durable intent fixture'}),body={commandId:'old-confirm',module:'brief',decision:'approve',expectedBasisHash:initial.nextAction.evidenceHash};makeLegacy(f);
 await assert.rejects(()=>f.request('/api/cases/'+initial.id+'/continue',body),{code:'ACCEPTANCE_DECISION_STALE'});assert.equal(f.calls,1);assert.equal(f.counts().acceptance_decision_rejections,0);makeLegacy(f,{removeWire:true});await f.restart();
 const result=await f.request('/api/cases/'+initial.id+'/continue',body);assert.equal(result.nextAction.module,'research');assert.equal(f.calls,2);assert.equal(f.store.read(initial.projectId).confirmations.length,1);assert.equal(result.decisions[0].commandReceipt,undefined);assert.equal(f.counts().acceptance_decision_rejections,0);
});
test('new committed and interrupted intents cannot reuse one command ID with a different wire form',async t=>{
 for(const admittedFailure of [false,true])for(const form of ['module','stage','both']){
  const f=await fixture(t,{admittedFailure}),initial=await f.coordinator.create({commandId:'create',caseId:'m6',brief:'wire replay conflict fixture'}),path='/api/cases/'+initial.id+'/continue',body={commandId:'same-command',...(form!=='stage'?{module:'brief'}:{}),...(form!=='module'?{stage:'brief'}:{}),decision:'approve',expectedBasisHash:initial.nextAction.evidenceHash};
  if(admittedFailure)await assert.rejects(()=>f.request(path,body),{code:'ACCEPTANCE_DECISION_STALE'});else await f.request(path,body);
  const changed=form==='module'?{...body,stage:'brief'}:normalizeDecisionWire(body);assert.equal(JSON.stringify(normalizeDecisionWire(changed)),JSON.stringify(normalizeDecisionWire(body)));
  await assert.rejects(()=>f.request(path,changed),{status:409,code:'ACCEPTANCE_COMMAND_REUSED'});assert.equal(f.calls,1);assert.equal(f.counts().acceptance_decision_rejections,0);
  if(!admittedFailure){await f.request(path,body);assert.equal(f.calls,1);}
 }
});
