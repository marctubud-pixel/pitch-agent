import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createBrowserPending,createPendingApi,pendingPath} from './browser-pending.mjs';
const origin='http://127.0.0.1:4450';
function storage(){const data=new Map();return {data,getItem:k=>data.has(k)?data.get(k):null,setItem:(k,v)=>data.set(k,v)};}
function lock(){let tail=Promise.resolve();return (_name,work)=>{const result=tail.then(work);tail=result.catch(()=>{});return result;};}
function journal(s,withLock=lock(),o=origin){return createBrowserPending({origin:o,storage:s,crypto:webcrypto,withLock});}
test('actual API wrapper persists before dispatch and refresh reads case before same-id unknown advance replay',async()=>{
 const s=storage(),j=journal(s),log=[],api=createPendingApi({journal:j,request:async(path,body)=>{assert.equal(j.list()[0].commandId,body.commandId);log.push({path,body});throw Error('lost response');}});
 await assert.rejects(()=>api.api('/api/cases/p/continue',{commandId:'original-id'}));assert.equal(j.list()[0].state,'unknown');
 const fresh=journal(s),reopened=createPendingApi({journal:fresh,request:async(path,body)=>{log.push({path,body});if(!body)return {id:'p',nextAction:{status:'pending'}};return {advanceCommand:{commandId:body.commandId,state:'completed'}};}});
 await reopened.reconcile();assert.deepEqual(log.map(r=>[r.path,r.body?.commandId]),[['/api/cases/p/continue','original-id'],['/api/cases/p',undefined],['/api/cases/p/continue','original-id']]);assert.equal(fresh.list().length,0);
});
test('committed decision settles only after matching server request digest; changed basis never guessed',async()=>{
 const s=storage(),j=journal(s),body={commandId:'human-id',module:'copy',decision:'approve',expectedBasisHash:'a'.repeat(64),comment:'私有文案正文'};await j.prepare('/api/cases/p/continue',body);
 assert.ok(!JSON.stringify([...s.data]).includes('私有文案正文'));let posts=0;
 const reopened=createPendingApi({journal:journal(s),request:async(_path,b)=>{if(b)posts++;return {decisions:[{...body,expectedBasisHash:'b'.repeat(64),createdAt:'server'}]};}});await reopened.reconcile();assert.equal(posts,0);assert.equal(reopened.pending().length,1);
 await assert.rejects(()=>reopened.api('/api/cases/p/continue',{...body,commandId:'new-id',expectedBasisHash:'b'.repeat(64)}),{code:'LOCAL_PENDING_DIFFERENT_REQUEST'});
 const matched=createPendingApi({journal:journal(s),request:async()=>({decisions:[{...body,createdAt:'server',factualAuthority:false}]})});await matched.reconcile();assert.equal(matched.pending().length,0);
});
test('create and editor bodies are not stored or automatically reconstructed; exact user input reuses original command',async()=>{
 const s=storage(),j=journal(s),body={commandId:'create-id',brief:'绝不保存的客户Brief',caseId:'dexian',mode:'auto',checkpoints:[]};await j.prepare('/api/cases',body);let calls=0;
 const api=createPendingApi({journal:journal(s),request:async(path,b)=>{calls++;if(path==='/api/cases')assert.equal(b.commandId,'create-id');return {id:path==='/api/cases'?'new-case':'doc',revision:2};}});await api.reconcile();assert.equal(calls,0);assert.ok(!JSON.stringify([...s.data]).includes(body.brief));
 const response=await api.api('/api/cases',{...body,commandId:'replacement-id'});assert.equal(response.id,'new-case');assert.equal(api.pending().length,0);
 const edit={commandId:'edit-id',expectedRevision:1,changes:[{values:{text:'不可存储的客户正文'}}]};const old=await j.prepare('/api/documents/doc/save',edit),same=await journal(s).prepare('/api/documents/doc/save',{...edit,commandId:'other-id'});assert.equal(old.commandId,same.commandId);assert.ok(!JSON.stringify([...s.data]).includes(edit.changes[0].values.text));
});
test('storage or locking failure stops actual API mutation; non-success outcomes retain pending identity',async()=>{
 let dispatched=0;const s=storage();s.setItem=()=>{throw Error('quota denied');};const api=createPendingApi({journal:journal(s),request:async()=>{dispatched++;}});await assert.rejects(()=>api.api('/api/cases/p/continue',{commandId:'id'}));assert.equal(dispatched,0);
 const unlocked=createPendingApi({journal:createBrowserPending({origin,storage:storage(),crypto:webcrypto}),request:async()=>{dispatched++;}});await assert.rejects(()=>unlocked.api('/api/cases/p/continue',{commandId:'id'}),{code:'LOCAL_PENDING_LOCK_UNAVAILABLE'});assert.equal(dispatched,0);
 for(const status of [408,409,422,500,503]){const st=storage(),j=journal(st),f=createPendingApi({journal:j,request:async()=>{throw Object.assign(Error('server outcome'),{status});}});await assert.rejects(()=>f.api('/api/cases/p/continue',{commandId:'kept-id'}));assert.equal(j.list()[0].commandId,'kept-id');assert.equal(j.list()[0].state,'unknown');}
 const j=journal(storage()),r=await j.prepare('/api/cases/p/continue',{commandId:'unknown-success'});assert.equal(await j.acknowledge(r,{advanceCommand:{commandId:r.commandId,state:'needs_reconciliation'}}),false);assert.equal(j.list().length,1);
});
test('two tabs serialize writes, retain different resources and reuse same request ID without overriding pending items',async()=>{
 const s=storage(),shared=lock(),a=journal(s,shared),b=journal(s,shared);const [x,y]=await Promise.all([a.prepare('/api/cases/p/continue',{commandId:'tab-a'}),b.prepare('/api/cases/p/continue',{commandId:'tab-b'})]);assert.equal(x.commandId,y.commandId);
 await Promise.all([a.prepare('/api/cases/other/continue',{commandId:'other-case'}),b.prepare('/api/documents/d/save',{commandId:'doc-save',changes:[]})]);assert.equal(a.list().length,3);assert.equal(journal(s,shared,'http://127.0.0.1:4459').list().length,0);
 for(const path of ['https://elsewhere/api/cases','//evil/api/cases','/api/cases/p/continue?x=1','/api/cases/../continue','/api/commands'])assert.throws(()=>pendingPath(path));
});

test('write verification failure and corrupt persisted schema never fall back to volatile mutation',async()=>{let calls=0;const backing=storage();backing.setItem=()=>{};const api=createPendingApi({journal:journal(backing),request:async()=>calls++});await assert.rejects(()=>api.api('/api/cases/p/continue',{commandId:'id'}),{code:'LOCAL_PENDING_STORAGE_WRITE_FAILED'});assert.equal(calls,0);const broken=storage();broken.setItem('proposal-local-pending-v1:'+origin,JSON.stringify([{origin,path:'/api/cases',commandId:'id',requestDigest:'a'.repeat(64),state:'unknown',token:'forbidden'}]));const failed=createPendingApi({journal:journal(broken),request:async()=>calls++});await assert.rejects(()=>failed.api('/api/cases/p/continue',{commandId:'id'}),{code:'LOCAL_PENDING_STORAGE_CORRUPT'});assert.equal(calls,0);});

test('one page joins duplicate same-ID requests rather than dispatching twice',async()=>{const j=journal(storage());let release,calls=0,entered;const start=new Promise(r=>entered=r),wait=new Promise(r=>release=r),api=createPendingApi({journal:j,request:async(_path,b)=>{calls++;entered();await wait;return {advanceCommand:{commandId:b.commandId,state:'completed'}};}}),a=api.api('/api/cases/p/continue',{commandId:'first'});await start;const b=api.api('/api/cases/p/continue',{commandId:'second'});await new Promise(r=>setImmediate(r));assert.equal(calls,1);release();assert.deepEqual(await a,await b);assert.equal(api.pending().length,0);});
test('only an exact durable pre-admission stale receipt settles a nonempty decision request',async()=>{
 const body={commandId:'old-theme',module:'copy',decision:'revise',expectedBasisHash:'a'.repeat(64),contribution:{kind:'copy_theme',directionId:'user',text:'不保存的客户文案',intendedUse:'不保存的说明'}};
 const changes=[{caseId:'another'},{commandId:'another'},{requestDigest:'b'.repeat(64)},{operation:'advance'},{state:'unknown'},{reason:'VALIDATION_FAILED'},{admitted:true},{effects:'dispatched'},{protocol:'old-protocol'}];
 for(const patch of changes){const s=storage(),j=journal(s),record=await j.prepare('/api/cases/p/continue',body);await j.unknown(record);const receipt={protocol:'local-decision-rejection-v1',caseId:'p',commandId:record.commandId,requestDigest:record.requestDigest,operation:'decision',state:'rejected_before_admission',reason:'ACCEPTANCE_DECISION_STALE',admitted:false,effects:'not_dispatched',...patch};let posts=0;await j.reconcile({readDecisionCommand:async()=>receipt,readCase:async()=>({decisions:[]}),replayAdvance:async()=>posts++});assert.equal(j.list().length,1);assert.equal(posts,0);assert(!JSON.stringify([...s.data]).includes(body.contribution.text));}
 const j=journal(storage()),record=await j.prepare('/api/cases/p/continue',body);await j.unknown(record);let fallback=0;await j.reconcile({readDecisionCommand:async()=>({protocol:'local-decision-rejection-v1',caseId:'p',commandId:record.commandId,requestDigest:record.requestDigest,operation:'decision',state:'rejected_before_admission',reason:'ACCEPTANCE_DECISION_STALE',admitted:false,effects:'not_dispatched'}),readCase:async()=>{fallback++;}});assert.equal(j.list().length,0);assert.equal(fallback,0);
});
test('settlement storage failure and unavailable receipt endpoint never trigger a replacement mutation',async()=>{
 const s=storage(),j=journal(s),body={commandId:'stale',module:'copy',decision:'revise',expectedBasisHash:'a'.repeat(64)},record=await j.prepare('/api/cases/p/continue',body);await j.unknown(record);s.setItem=()=>{throw Error('storage denied');};
 await assert.rejects(()=>j.reconcile({readDecisionCommand:async()=>({protocol:'local-decision-rejection-v1',caseId:'p',commandId:'stale',requestDigest:record.requestDigest,operation:'decision',state:'rejected_before_admission',reason:'ACCEPTANCE_DECISION_STALE',admitted:false,effects:'not_dispatched'})}),/storage denied/);assert.equal(j.list().length,1);
 const other=journal(storage()),pending=await other.prepare('/api/cases/p/continue',body);await other.unknown(pending);await other.reconcile({readDecisionCommand:async()=>{throw Error('old server404');},readCase:async()=>({decisions:[]})});assert.equal(other.list().length,1);
});
test('a new committed receipt must match completely and never falls back to legacy body acknowledgement',async()=>{
 const body={commandId:'confirmed',module:'copy',decision:'approve',expectedBasisHash:'a'.repeat(64)};
 for(const patch of [{caseId:'wrong-case'},{requestDigest:'b'.repeat(64)},{commandId:'wrong-command'},{operation:'advance'},{state:'admitted'},{factualAuthority:true},{protocol:'unknown'}]){
  const j=journal(storage()),record=await j.prepare('/api/cases/p/continue',body),receipt={protocol:'local-decision-commit-v1',caseId:'p',commandId:record.commandId,requestDigest:record.requestDigest,operation:'decision',state:'committed',factualAuthority:false,...patch};
  assert.equal(await j.acknowledge(record,{decisions:[{...body,commandReceipt:receipt}]}),false);assert.equal(j.list().length,1);
 }
 const j=journal(storage()),record=await j.prepare('/api/cases/p/continue',body);assert.equal(await j.acknowledge(record,{decisions:[{...body,commandReceipt:{protocol:'local-decision-commit-v1',caseId:'p',commandId:record.commandId,requestDigest:record.requestDigest,operation:'decision',state:'committed',factualAuthority:false}}]}),true);assert.equal(j.list().length,0);
});
