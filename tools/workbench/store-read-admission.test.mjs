import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {deflateRawSync} from 'node:zlib';
import {openStore} from './store.mjs';
const limits={readAttempts:8,snapshotBytes:1024**2,decodedBytes:8*1024**2,storedBytes:8*1024**2};
const actor={actorId:'owned-human',actorType:'human',runId:'owned-run',contextId:'owned-context'};
const input={id:'owned',name:'Owned admission fixture',brief:'No external evidence',mode:'assisted',humanGates:['copy']};
const sha=b=>createHash('sha256').update(b).digest();
function frame(raw,options={}) {
 raw=Buffer.from(raw);const payload=options.payload??deflateRawSync(raw),h=Buffer.alloc(84);
 Buffer.from([0x57,0x42,0x53,0x53,0,0x0d,0x0a,0xff]).copy(h);h[8]=options.version??1;h[9]=options.codec??1;h.writeUInt16BE(options.flags??0,10);h.writeBigUInt64BE(BigInt(options.declared??raw.length),12);(options.rawDigest??sha(raw)).copy(h,20);(options.payloadDigest??sha(payload)).copy(h,52);return Buffer.concat([h,payload]);
}
function owned(t,{encoding}={}) {
 const root=mkdtempSync(join(tmpdir(),'read-admission-')),file=join(root,'owned.db');
 if(encoding){const seed=new DatabaseSync(file);seed.exec(`PRAGMA encoding='${encoding}'`);seed.exec('CREATE TABLE seed(value)');seed.close();}
 const store=openStore(file),sql=new DatabaseSync(file);t.after(()=>{sql.close();store.close();rmSync(root,{recursive:true,force:true});});
 const put=(value,revision=0,id='owned')=>{sql.prepare('INSERT OR REPLACE INTO revisions VALUES(?,?,?)').run(id,revision,value);sql.prepare('INSERT OR REPLACE INTO heads VALUES(?,?)').run(id,revision);};
 return {store,sql,root,file,put};
}
function trace(t,hook=()=>{}) {
 const original=DatabaseSync.prototype.prepare,events=[];
 DatabaseSync.prototype.prepare=function(sql){const stmt=original.call(this,sql);if(!sql.includes('FROM revisions'))return stmt;return new Proxy(stmt,{get(target,key){const value=Reflect.get(target,key,target);if(key!=='get')return typeof value==='function'?value.bind(target):value;return (...args)=>{const row=value.apply(target,args);events.push(sql);hook(sql,row);return row;};}});};
 t.after(()=>{DatabaseSync.prototype.prepare=original;});
 return {events,bodies:()=>events.filter(s=>s.includes('CASE WHEN typeof(snapshot)=?')).length};
}
test('actual UTF-8 multibyte and NUL lengths refuse before body retrieval',t=>{
 const f=owned(t),tr=trace(t),text=JSON.stringify({id:'owned',revision:0,text:'中文'});
 f.put(text);const bytes=Buffer.byteLength(text);assert.ok(bytes>text.length);
 let out=f.store.withReadAdmission('owned',{...limits,snapshotBytes:bytes-1},()=>f.store.read('owned'));
 assert.equal(out.code,'SNAPSHOT_READ_SIZE_LIMIT');assert.equal(tr.bodies(),0);assert.equal(out.usage.reservedDecodedBytes,0);
 out=f.store.withReadAdmission('owned',{...limits,snapshotBytes:bytes,decodedBytes:bytes,storedBytes:bytes},()=>f.store.read('owned'));
 assert.equal(out.kind,'complete');assert.equal(out.usage.reservedDecodedBytes,bytes);assert.equal(tr.bodies(),1);
 const nul='{"id":"owned","revision":0,"text":"a\u0000中文"}';f.put(nul);const stored=f.sql.prepare('SELECT length(snapshot) AS characters,length(CAST(snapshot AS BLOB)) AS bytes FROM revisions').get();assert.ok(stored.characters<stored.bytes);
 const before=tr.bodies();out=f.store.withReadAdmission('owned',{...limits,snapshotBytes:stored.bytes-1},()=>f.store.read('owned'));assert.equal(out.code,'SNAPSHOT_READ_SIZE_LIMIT');assert.equal(tr.bodies(),before);
 out=f.store.withReadAdmission('owned',limits,()=>f.store.read('owned'));assert.equal(out.kind,'failed');assert.equal(out.usage.reservedDecodedBytes,stored.bytes);assert.equal(out.usage.fetchedSnapshots,1);
});
test('BLOB declaration and stored cumulative boundaries reserve before body and never refund',t=>{
 const f=owned(t),tr=trace(t),raw=JSON.stringify({id:'owned',revision:0,text:'中文'}),blob=frame(raw);f.put(blob);
 let out=f.store.withReadAdmission('owned',{...limits,snapshotBytes:Buffer.byteLength(raw)-1},()=>f.store.read('owned'));assert.equal(out.code,'SNAPSHOT_READ_SIZE_LIMIT');assert.equal(tr.bodies(),0);assert.equal(out.usage.probeHeaderBytes,84);
 out=f.store.withReadAdmission('owned',{...limits,storedBytes:blob.length},()=>{f.store.read('owned');try{f.store.read('owned');}catch{}return {retained:'domain observation'};});
 assert.equal(out.code,'SNAPSHOT_READ_BYTES_LIMIT');assert.equal(out.usage.fetchedSnapshots,1);assert.equal(out.usage.reservedStoredBytes,blob.length);assert.equal(out.usage.probeHeaderBytes,168);assert.equal(tr.bodies(),1);assert.equal(out.value.retained,'domain observation');
 f.put(frame(raw,{rawDigest:Buffer.alloc(32)}));out=f.store.withReadAdmission('owned',limits,()=>{try{f.store.read('owned');}catch{}return 'caught';});assert.equal(out.kind,'failed');assert.equal(out.code,'SNAPSHOT_CORRUPT');assert.equal(out.usage.reservedDecodedBytes,Buffer.byteLength(raw));
});
test('admitted reads preserve every existing codec failure family and decoded SQL key equality',t=>{
 const f=owned(t),raw=Buffer.from('{}'),stream=deflateRawSync(raw),tr=trace(t);
 const cases=[['empty',Buffer.alloc(0),'SNAPSHOT_CORRUPT'],['short',frame(raw).subarray(0,84),'SNAPSHOT_CORRUPT'],['version',frame(raw,{version:2}),'SNAPSHOT_FORMAT_UNSUPPORTED'],['codec',frame(raw,{codec:2}),'SNAPSHOT_FORMAT_UNSUPPORTED'],['flags',frame(raw,{flags:1}),'SNAPSHOT_CORRUPT'],['zero',frame(raw,{declared:0}),'SNAPSHOT_CORRUPT'],['over format',frame(raw,{declared:256*1024**2+1}),'SNAPSHOT_CORRUPT'],['payload digest',frame(raw,{payloadDigest:Buffer.alloc(32)}),'SNAPSHOT_CORRUPT'],['raw digest',frame(raw,{rawDigest:Buffer.alloc(32)}),'SNAPSHOT_CORRUPT'],['truncated',frame(raw,{payload:stream.subarray(0,-1)}),'SNAPSHOT_CORRUPT'],['wrong length',frame(raw,{declared:3}),'SNAPSHOT_CORRUPT'],['utf8',frame(Buffer.from([255])),'SNAPSHOT_CORRUPT'],['json',frame('{'),'SNAPSHOT_CORRUPT'],['bom',frame(Buffer.from([239,187,191,123,125])),'SNAPSHOT_CORRUPT'],['trailing',frame(raw,{payload:Buffer.concat([stream,Buffer.from([0])])}),'SNAPSHOT_CORRUPT'],['concatenated',frame(raw,{payload:Buffer.concat([stream,stream])}),'SNAPSHOT_CORRUPT'],['expansion',frame(Buffer.alloc(65536,65),{declared:1024}),'SNAPSHOT_CORRUPT'],['SQL key',frame('{}'),'SNAPSHOT_CORRUPT']];
 const badMagic=frame(raw);badMagic[0]=0;cases.push(['magic',badMagic,'SNAPSHOT_CORRUPT']);
 for(const [name,payload,code] of cases){f.put(payload);const out=f.store.withReadAdmission('owned',limits,()=>f.store.read('owned'));assert.equal(out.code,code,name);}
 for(const p of [{id:'other',revision:0},{id:'owned',revision:1}]){f.put(JSON.stringify(p));assert.equal(f.store.withReadAdmission('owned',limits,()=>f.store.read('owned')).code,'SNAPSHOT_CORRUPT');}
 assert.ok(tr.bodies()>0);f.put(JSON.stringify({id:'owned',revision:0}));assert.equal(f.store.withReadAdmission('owned',limits,()=>f.store.read('owned')).kind,'complete');
});
test('UTF-16 is refused inside admission while ordinary reads remain compatible',t=>{
 const f=owned(t,{encoding:'UTF-16le'});f.put(JSON.stringify({id:'owned',revision:0,text:'中文'}));assert.equal(f.store.read('owned').text,'中文');const tr=trace(t),out=f.store.withReadAdmission('owned',limits,()=>f.store.read('owned'));assert.equal(out.code,'SNAPSHOT_READ_ENCODING_UNSUPPORTED');assert.equal(tr.bodies(),0);
});
test('attempts include repeated missing failed reads and caught failures cannot complete',t=>{
 const f=owned(t);f.put(JSON.stringify({id:'owned',revision:0}));
 let out=f.store.withReadAdmission('owned',{...limits,readAttempts:1},()=>{f.store.read('owned');try{f.store.read('owned');}catch{}return 'retained';});assert.equal(out.code,'SNAPSHOT_READ_COUNT_LIMIT');assert.equal(out.usage.readAttempts,2);assert.equal(out.usage.fetchedSnapshots,1);
 out=f.store.withReadAdmission('owned',limits,()=>{try{f.store.read('owned',9);}catch{}return 'caught missing';});assert.equal(out.code,'NOT_FOUND');assert.equal(out.usage.readAttempts,1);assert.equal(out.usage.fetchedSnapshots,0);
 out=f.store.withReadAdmission('owned',limits,()=>{f.store.read('owned');f.store.read('owned',0);});assert.equal(out.kind,'complete');assert.equal(out.usage.fetchedSnapshots,2);
});
test('short SQL transaction binds probe and body across external same-key rewrite',t=>{
 const f=owned(t);f.put(JSON.stringify({id:'owned',revision:0,value:'old'}));let changed=false;
 trace(t,(sql)=>{if(!changed&&sql.includes(' AS header')){changed=true;f.sql.prepare('UPDATE revisions SET snapshot=? WHERE project_id=?').run(JSON.stringify({id:'owned',revision:0,value:'new'}),'owned');}});
 const out=f.store.withReadAdmission('owned',limits,()=>[f.store.read('owned').value,f.store.read('owned').value]);assert.deepEqual(out.value,['old','new']);assert.equal(out.kind,'complete');
});
test('sync and async lifecycle retain failure evidence and deny closed escaped tasks',async t=>{
 const f=owned(t);f.put(JSON.stringify({id:'owned',revision:0}));let late;let out=f.store.withReadAdmission('owned',limits,()=>{late=()=>f.store.read('owned');throw Object.assign(Error('original failure'),{code:'OWNED_DOMAIN'});});assert.equal(out.code,'OWNED_DOMAIN');assert.equal(out.error.message,'original failure');
 let resume;const ready=new Promise(resolve=>{resume=resolve;});let escaped;
 out=await f.store.withReadAdmission('owned',limits,async()=>{escaped=ready.then(()=>{assert.throws(()=>f.store.read('owned'),{code:'SNAPSHOT_READ_SCOPE_CLOSED'});assert.throws(()=>f.store.command('owned',{},actor),{code:'SNAPSHOT_READ_SCOPE_CLOSED'});});await Promise.resolve();return f.store.read('owned');});assert.equal(out.kind,'complete');resume();await escaped;
 out=await f.store.withReadAdmission('owned',limits,async()=>{await Promise.resolve();throw Error('async domain');});assert.equal(out.error.message,'async domain');assert.equal(f.store.read('owned').revision,0);assert.equal(late().revision,0);
});
test('nested resets cross-store cross-project and store effects refuse before changes',async t=>{
 const f=owned(t),other=openStore(':memory:');t.after(()=>other.close());f.put(JSON.stringify({id:'owned',revision:0}));const missing=join(f.root,'never-created','store.db');
 const cases=[['nested',()=>f.store.withReadAdmission('owned',limits,()=>{}),'SNAPSHOT_READ_NESTED'],['cross store',()=>other.read('owned'),'SNAPSHOT_READ_SCOPE_MISMATCH'],['cross project',()=>f.store.read('other'),'SNAPSHOT_READ_SCOPE_MISMATCH'],['create',()=>f.store.create({...input,id:'new'},actor),'SNAPSHOT_READ_WRITE_FORBIDDEN'],['command',()=>f.store.command('owned',{},actor),'SNAPSHOT_READ_WRITE_FORBIDDEN'],['close',()=>f.store.close(),'SNAPSHOT_READ_WRITE_FORBIDDEN'],['open',()=>openStore(missing),'SNAPSHOT_READ_WRITE_FORBIDDEN']];
 for(const [name,run,code] of cases){const out=await f.store.withReadAdmission('owned',limits,async()=>{await Promise.resolve();try{run();}catch{}return 'swallowed';});assert.equal(out.code,code,name);}
 assert.equal(existsSync(join(f.root,'never-created')),false);assert.deepEqual(f.store.list(),[{id:'owned',revision:0}]);
});
test('concurrent scopes isolate counters and unrelated commands keep lexical transactions',async t=>{
 const f=owned(t);f.store.create(input,actor);let release;const gate=new Promise(resolve=>{release=resolve;});
 const first=f.store.withReadAdmission('owned',{...limits,readAttempts:1},async()=>{f.store.read('owned');await gate;return f.store.read('owned');});
 const second=await f.store.withReadAdmission('owned',limits,async()=>{await Promise.resolve();assert.equal(f.store.list()[0].revision,0);return f.store.read('owned');});
 const confirmed=f.store.command('owned',{commandId:'confirm',expectedRevision:0,kind:'confirm-task-card',taskCardId:'owned:scope:1'},actor);assert.equal(confirmed.revision,1);release();const exhausted=await first;assert.equal(exhausted.code,'SNAPSHOT_READ_COUNT_LIMIT');assert.equal(exhausted.usage.fetchedSnapshots,1);assert.equal(second.kind,'complete');assert.equal(second.usage.readAttempts,1);
});
test('invalid configuration refuses without SQL or callback and limits cannot mutate in flight',async t=>{
 const f=owned(t),tr=trace(t);f.put(JSON.stringify({id:'owned',revision:0}));let called=false;
 for(const bad of [{...limits,readAttempts:0},{...limits,storedBytes:Number.MAX_SAFE_INTEGER+1},{...limits,snapshotBytes:256*1024**2+1}])assert.equal(f.store.withReadAdmission('owned',bad,()=>{called=true;}).code,'SNAPSHOT_READ_CONFIGURATION');assert.equal(called,false);assert.equal(tr.bodies(),0);
 const mutable={...limits,readAttempts:1};const out=await f.store.withReadAdmission('owned',mutable,async()=>{f.store.read('owned');await Promise.resolve();mutable.readAttempts=100;return f.store.read('owned');});assert.equal(out.code,'SNAPSHOT_READ_COUNT_LIMIT');
});
