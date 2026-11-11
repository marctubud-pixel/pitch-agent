import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {openStore} from './store.mjs';
test('owned exactly 120 MiB serialized shape admits one read and refuses before the next body fetch',t=>{
 const root=mkdtempSync(join(tmpdir(),'large-admission-')),file=join(root,'owned.db'),store=openStore(file),sql=new DatabaseSync(file);
 t.after(()=>{sql.close();store.close();rmSync(root,{recursive:true,force:true});});
 const prefix='{"id":"large-owned","revision":0,"payload":"',suffix='"}',bytes=120*1024**2,payloadBytes=bytes-Buffer.byteLength(prefix+suffix);
 sql.prepare(`INSERT INTO revisions VALUES('large-owned',0,? || replace(hex(zeroblob(?)),'00','a') || ?)`).run(prefix,payloadBytes,suffix);
 sql.prepare('INSERT INTO heads VALUES(?,?)').run('large-owned',0);
 assert.equal(sql.prepare('SELECT length(CAST(snapshot AS BLOB)) AS bytes FROM revisions').get().bytes,bytes);
 const prepare=DatabaseSync.prototype.prepare;let bodyFetches=0;
 DatabaseSync.prototype.prepare=function(text){if(text.includes('CASE WHEN typeof(snapshot)=?'))bodyFetches++;return prepare.call(this,text);};t.after(()=>{DatabaseSync.prototype.prepare=prepare;});
 const result=store.withReadAdmission('large-owned',{readAttempts:128,snapshotBytes:256*1024**2,decodedBytes:bytes,storedBytes:bytes},()=>{
  let p=store.read('large-owned');assert.equal(p.id,'large-owned');assert.equal(p.payload.length,payloadBytes);assert.equal(p.payload[0],'a');assert.equal(p.payload.at(-1),'a');p=null;
  assert.throws(()=>store.read('large-owned'),{code:'SNAPSHOT_READ_BYTES_LIMIT'});return {positiveReadChecked:true};
 });
 assert.equal(result.kind,'refused');assert.equal(result.value.positiveReadChecked,true);assert.equal(result.usage.readAttempts,2);assert.equal(result.usage.reservedDecodedBytes,bytes);assert.equal(result.usage.reservedStoredBytes,bytes);assert.equal(result.usage.fetchedSnapshots,1);assert.equal(bodyFetches,1);
 console.log(JSON.stringify({ownedSerializedBytes:bytes,usage:result.usage,bodyFetches}));
});
