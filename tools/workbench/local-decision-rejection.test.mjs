import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {webcrypto} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {openDecisionRejections,decisionRequestDigest,decisionWireIdentity,validateDecisionWireIdentity,committedDecisionReceipt} from './local-decision-rejection.mjs';
import {createBrowserPending} from '../local-acceptance/browser-pending.mjs';
import {normalizeDecisionWire} from '../local-acceptance/request-identity.mjs';

const schema='CREATE TABLE acceptance_decision_intents(id TEXT,command_id TEXT,request_hash TEXT,body TEXT,PRIMARY KEY(id,command_id));CREATE TABLE acceptance_decisions(id TEXT,command_id TEXT,request_hash TEXT,body TEXT,PRIMARY KEY(id,command_id));';
const request=()=>({commandId:'theme-1',module:'copy',decision:'revise',expectedBasisHash:'a'.repeat(64),comment:'不保存正文',contribution:{kind:'copy_theme',directionId:'user',text:'得闲，慢慢聊',intendedUse:'仅为工程测试'}});
function fixture(){const db=new DatabaseSync(':memory:');db.exec(schema);return {db,journal:openDecisionRejections(db)};}
test('server and actual browser wire digests agree without command IDs, key order or JSON-only differences',async()=>{
 const storage={getItem:()=>null,setItem:()=>{}},client=createBrowserPending({origin:'http://127.0.0.1:4450',storage,crypto:webcrypto,withLock:(_name,work)=>work()}),body=request(),reverse=Object.fromEntries(Object.entries(body).reverse());
 assert.equal(decisionRequestDigest(body),await client.digest(body));assert.equal(decisionRequestDigest(reverse),await client.digest(body));assert.equal(decisionRequestDigest({...body,commandId:'different'}),await client.digest(body));
 assert.notEqual(decisionRequestDigest({...body,comment:'changed'}),await client.digest(body));
 assert.notEqual(decisionRequestDigest({items:[1,2]}),decisionRequestDigest({items:[2,1]}));assert.equal(decisionRequestDigest({x:undefined,items:[undefined,NaN]}),decisionRequestDigest({items:[null,null]}));
 const {module,...rest}=body,alias={...rest,stage:module};assert.deepEqual(normalizeDecisionWire(alias),body);assert.equal(decisionRequestDigest(alias),await client.digest(alias));assert.notEqual(decisionRequestDigest(alias),decisionRequestDigest(body));
});
test('new committed wire identity is reconstructed and cannot be replaced by a forged form or digest',()=>{
 const normalized=request(),{module,...rest}=normalized;
 for(const [form,wire]of [['module',normalized],['stage',{...rest,stage:module}],['both',{...normalized,stage:module}]]){
  const intent={request:normalized,wireIdentity:decisionWireIdentity(normalized,wire)};assert.equal(intent.wireIdentity.form,form);assert.deepEqual(validateDecisionWireIdentity(intent),intent.wireIdentity);const receipt=committedDecisionReceipt('case',intent);assert.equal(receipt.requestDigest,decisionRequestDigest(wire));assert.equal(receipt.state,'committed');
  for(const change of [i=>i.wireIdentity.digest='f'.repeat(64),i=>i.wireIdentity.form=form==='module'?'stage':'module',i=>i.request.comment='changed']){const copy=structuredClone(intent);change(copy);assert.throws(()=>committedDecisionReceipt('case',copy));}
 }
 assert.equal(committedDecisionReceipt('case',{request:normalized}),null);
 const missing={...normalized};delete missing.comment;assert.notEqual(decisionWireIdentity(missing,missing).digest,decisionWireIdentity({...missing,comment:''},{...missing,comment:''}).digest);
});
test('a durable stale rejection is immutable and prevents later admission or changed-body reuse',()=>{
 const {db,journal}=fixture();try{
  const body=request(),receipt=journal.recordStale('case',body,body);assert.equal(receipt.state,'rejected_before_admission');assert.equal(receipt.requestDigest,decisionRequestDigest(body));assert.equal(receipt.admitted,false);assert.equal(receipt.effects,'not_dispatched');assert.deepEqual(journal.read('case',body.commandId),receipt);
  assert.deepEqual(journal.recordStale('case',body,Object.fromEntries(Object.entries(body).reverse())),receipt);
  assert.throws(()=>journal.admissionOpen('case',body,body),{code:'ACCEPTANCE_DECISION_ADMISSION_TRANSACTION_REQUIRED'});
  db.exec('BEGIN IMMEDIATE');assert.throws(()=>journal.admissionOpen('case',body,body),{code:'ACCEPTANCE_DECISION_STALE'});db.exec('ROLLBACK');
  assert.throws(()=>journal.recordStale('case',body,{...body,comment:'changed'}),{code:'ACCEPTANCE_COMMAND_REUSED'});
  assert.equal(db.prepare('SELECT count(*) n FROM acceptance_decision_intents').get().n,0);assert.equal(db.prepare('SELECT count(*) n FROM acceptance_decision_rejections').get().n,1);
 }finally{db.close();}
});
test('any admitted or completed decision stays unprovable as a pre-admission rejection',()=>{
 for(const table of ['acceptance_decision_intents','acceptance_decisions']){
  const {db,journal}=fixture(),body=request();try{db.exec('BEGIN IMMEDIATE');journal.admissionOpen('case',body,body);db.prepare('INSERT INTO '+table+' VALUES(?,?,?,?)').run('case',body.commandId,'legacy-hash',JSON.stringify({state:'interrupted'}));db.exec('COMMIT');assert.equal(journal.recordStale('case',body,body),null);assert.equal(journal.read('case',body.commandId).state,'unknown');assert.equal(db.prepare('SELECT count(*) n FROM acceptance_decision_rejections').get().n,0);}finally{db.close();}
 }
 const {db,journal}=fixture();try{assert.equal(journal.read('case','old-unknown').state,'unknown');const body=request();journal.recordStale('case',body,body);db.prepare('INSERT INTO acceptance_decision_intents VALUES(?,?,?,?)').run('case',body.commandId,'bad','{}');assert.throws(()=>journal.read('case',body.commandId),{code:'ACCEPTANCE_DECISION_REJECTION_CONFLICT'});}finally{db.close();}
});
const worker=`import {DatabaseSync} from 'node:sqlite';import {openDecisionRejections} from ${JSON.stringify(new URL('./local-decision-rejection.mjs',import.meta.url).href)};
const db=new DatabaseSync(process.argv[1]);db.exec('PRAGMA busy_timeout=5000');const journal=openDecisionRejections(db),request=JSON.parse(process.argv[3]);
process.once('message',()=>{let outcome;try{if(process.argv[2]==='admit'){db.exec('BEGIN IMMEDIATE');try{journal.admissionOpen('case',request,request);db.prepare('INSERT INTO acceptance_decision_intents VALUES(?,?,?,?)').run('case',request.commandId,'test-hash','{}');db.exec('COMMIT');outcome='admitted';}catch(e){if(db.isTransaction)db.exec('ROLLBACK');if(e.code!=='ACCEPTANCE_DECISION_STALE')throw e;outcome='rejected-by-receipt';}}else outcome=journal.recordStale('case',request,request)?'rejected-recorded':'already-admitted';db.close();process.send({kind:'done',outcome});process.disconnect();}catch(e){console.error(e);process.exit(1);}});process.send({kind:'ready'});`;
function child(file,role,body){
 const p=spawn(process.execPath,['--input-type=module','-e',worker,file,role,JSON.stringify(body)],{stdio:['ignore','pipe','pipe','ipc']});let diagnostic='';p.stderr.on('data',b=>diagnostic+=b);let readyResolve,outcome;p.on('message',m=>{if(m.kind==='ready')readyResolve();else if(m.kind==='done')outcome=m.outcome;});
 const ready=new Promise(r=>readyResolve=r),done=new Promise((resolve,reject)=>{p.once('error',reject);p.once('exit',code=>code===0?resolve(outcome):reject(Error(diagnostic)));});done.catch(()=>{});return {p,ready,done};
}
test('separate OS processes cannot both reject and admit the same decision command',async t=>{
 const root=await mkdtemp(join(tmpdir(),'decision-admission-race-'));t.after(()=>rm(root,{recursive:true,force:true}));
 for(let n=0;n<3;n++){
  const file=join(root,'race-'+n+'.sqlite'),db=new DatabaseSync(file);db.exec(schema);openDecisionRejections(db);db.close();const body=request(),a=child(file,'admit',body),b=child(file,'reject',body);await Promise.all([a.ready,b.ready]);a.p.send('go');b.p.send('go');const outcomes=await Promise.all([a.done,b.done]);
  const check=new DatabaseSync(file);try{const admitted=check.prepare('SELECT count(*) n FROM acceptance_decision_intents').get().n,rejected=check.prepare('SELECT count(*) n FROM acceptance_decision_rejections').get().n;assert.equal(admitted+rejected,1);assert.equal(admitted&&rejected,0);assert(outcomes.includes(admitted?'admitted':'rejected-recorded'));}finally{check.close();}
 }
});
