import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {deflateRawSync,inflateRawSync} from 'node:zlib';
import {createProject,applyCommand} from './project.mjs';
import {openStore} from './store.mjs';

const node=actor=>({actorId:actor,actorType:'human',runId:'fixture-run',contextId:'fixture-context'});
const actor=node('fixture-user');
const input={id:'codec-fixture',name:'编码测试',brief:'Brief: "quoted"\r\n第二行',mode:'assisted',humanGates:['copy']};
const confirm={commandId:'confirm-1',expectedRevision:0,kind:'confirm-task-card',taskCardId:'codec-fixture:scope:1'};
const policy={commandId:'policy-2',expectedRevision:1,kind:'set-policy',mode:'assisted',humanGates:['strategy','copy']};
const sha=bytes=>createHash('sha256').update(bytes).digest();
const magic=Buffer.from([0x57,0x42,0x53,0x53,0x00,0x0d,0x0a,0xff]);
const rawLimit=256*1024*1024;
const payloadLimit=257*1024*1024;
const blobLimit=84+payloadLimit;

function frame(raw,options={}) {
  raw=Buffer.from(raw);
  const payload=options.payload??deflateRawSync(raw);
  const header=Buffer.alloc(84);
  (options.magic??magic).copy(header);
  header[8]=options.version??1;
  header[9]=options.codec??1;
  header.writeUInt16BE(options.flags??0,10);
  header.writeBigUInt64BE(BigInt(options.declared??raw.length),12);
  (options.rawDigest??sha(raw)).copy(header,20);
  (options.payloadDigest??sha(payload)).copy(header,52);
  return Buffer.concat([header,payload]);
}

function withDatabase(fn) {
  const dir=mkdtempSync(join(tmpdir(),'workbench-codec-'));
  const file=join(dir,'test.sqlite');
  let store,sql;
  try {
    store=openStore(file);
    sql=new DatabaseSync(file);
    sql.exec('PRAGMA foreign_keys=ON');
    return fn({store,sql,file});
  } finally {
    sql?.close();
    store?.close();
    rmSync(dir,{recursive:true,force:true});
  }
}

test('legacy TEXT bytes, new BLOB bytes, history, replay and positional TEXT inserts coexist',()=>withDatabase(({store,sql,file})=>{
  const p0={...createProject(input,actor),sourceRecords:[{id:'source-1',text:'资料 "原文"\r\n中文',contentHash:'sha256:source'}],artifacts:[{id:'report-1',content:'Report\n"quote"',contentHash:'sha256:report'}]};
  const p1=applyCommand(p0,confirm,actor);
  const insert=sql.prepare('INSERT INTO revisions VALUES (?,?,?)');
  insert.run(input.id,0,JSON.stringify(p0));
  insert.run(input.id,1,JSON.stringify(p1));
  sql.prepare('INSERT INTO heads VALUES (?,?)').run(input.id,1);
  const old=sql.prepare('SELECT revision,typeof(snapshot) AS kind,CAST(snapshot AS BLOB) AS bytes FROM revisions ORDER BY revision').all();
  assert.deepEqual(old.map(row=>row.kind),['text','text']);
  const expected=applyCommand(p1,policy,actor);
  assert.deepEqual(store.command(input.id,policy,actor),expected);
  const saved=sql.prepare('SELECT typeof(snapshot) AS kind,snapshot FROM revisions WHERE revision=2').get();
  assert.equal(saved.kind,'blob');
  assert.deepEqual(Buffer.from(saved.snapshot.subarray(0,8)),magic);
  assert.equal(saved.snapshot.length>=85,true);
  assert.equal(saved.snapshot[8],1);
  assert.equal(saved.snapshot[9],1);
  assert.equal(Buffer.from(saved.snapshot).readUInt16BE(10),0);
  const payload=saved.snapshot.subarray(84);
  assert.deepEqual(sha(payload),Buffer.from(saved.snapshot.subarray(52,84)));
  const inflated=inflateRawSync(payload,{info:true});
  assert.equal(inflated.engine.bytesWritten,payload.length);
  const expectedBytes=Buffer.from(JSON.stringify(expected),'utf8');
  assert.equal(Buffer.from(saved.snapshot).readBigUInt64BE(12),BigInt(expectedBytes.length));
  assert.deepEqual(inflated.buffer,expectedBytes);
  assert.deepEqual(sha(expectedBytes),Buffer.from(saved.snapshot.subarray(20,52)));
  assert.deepEqual(store.read(input.id),expected);
  assert.deepEqual(store.read(input.id,0),p0);
  assert.deepEqual(store.read(input.id,1),p1);
  assert.deepEqual(store.list(),[{id:input.id,revision:2}]);
  const newStore=openStore(file);
  try {
    assert.deepEqual(newStore.read(input.id),expected);
    assert.deepEqual(newStore.command(input.id,policy,actor),expected);
    assert.equal(sql.prepare('SELECT count(*) AS n FROM revisions').get().n,3);
    assert.equal(sql.prepare('SELECT revision FROM heads').get().revision,2);
    assert.deepEqual(sql.prepare('SELECT snapshot FROM revisions WHERE revision=2').get().snapshot,saved.snapshot);
    const p3={...expected,revision:3,audit:[...expected.audit,{commandId:'legacy-direct',kind:'fixture',actorId:'fixture-user',revision:3,at:null}]};
    insert.run(input.id,3,JSON.stringify(p3));
    sql.prepare('UPDATE heads SET revision=3 WHERE project_id=?').run(input.id);
    assert.deepEqual(newStore.read(input.id),p3);
    assert.deepEqual(newStore.read(input.id,2),expected);
    assert.deepEqual(newStore.list(),[{id:input.id,revision:3}]);
  } finally {newStore.close();}
  const unchanged=sql.prepare('SELECT revision,typeof(snapshot) AS kind,CAST(snapshot AS BLOB) AS bytes FROM revisions WHERE revision<2 ORDER BY revision').all();
  assert.deepEqual(unchanged,old);
  assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(),[]);
}));

test('BLOB decoding rejects corrupt framing, digests, streams, UTF-8 and JSON',()=>withDatabase(({store,sql})=>{
  store.create(input,actor);
  const replace=sql.prepare('UPDATE revisions SET snapshot=? WHERE project_id=? AND revision=0');
  const original=frame(Buffer.from('{}'));
  const raw=Buffer.from('{}');
  const stream=deflateRawSync(raw);
  const cases=[
    ['empty BLOB',Buffer.alloc(0),'SNAPSHOT_CORRUPT'],
    ['short header',original.subarray(0,84),'SNAPSHOT_CORRUPT'],
    ['bad magic',frame(raw,{magic:Buffer.from('BADMAGIC')}),'SNAPSHOT_CORRUPT'],
    ['unsupported version',frame(raw,{version:2}),'SNAPSHOT_FORMAT_UNSUPPORTED'],
    ['unsupported codec',frame(raw,{codec:2}),'SNAPSHOT_FORMAT_UNSUPPORTED'],
    ['nonzero flags',frame(raw,{flags:1}),'SNAPSHOT_CORRUPT'],
    ['zero decoded length',frame(raw,{declared:0}),'SNAPSHOT_CORRUPT'],
    ['raw length one over cap',frame(raw,{declared:rawLimit+1}),'SNAPSHOT_CORRUPT'],
    ['payload digest mismatch',frame(raw,{payloadDigest:Buffer.alloc(32)}),'SNAPSHOT_CORRUPT'],
    ['raw digest mismatch',frame(raw,{rawDigest:Buffer.alloc(32)}),'SNAPSHOT_CORRUPT'],
    ['truncated stream',frame(raw,{payload:stream.subarray(0,-1)}),'SNAPSHOT_CORRUPT'],
    ['wrong declared length',frame(raw,{declared:3}),'SNAPSHOT_CORRUPT'],
    ['invalid UTF-8',frame(Buffer.from([0xff])),'SNAPSHOT_CORRUPT'],
    ['invalid JSON',frame(Buffer.from('{')),'SNAPSHOT_CORRUPT'],
    ['BOM JSON',frame(Buffer.from([0xef,0xbb,0xbf,0x7b,0x7d])),'SNAPSHOT_CORRUPT'],
    ['trailing byte',frame(raw,{payload:Buffer.concat([stream,Buffer.from([0])])}),'SNAPSHOT_CORRUPT'],
    ['concatenated streams',frame(raw,{payload:Buffer.concat([stream,stream])}),'SNAPSHOT_CORRUPT'],
    ['actual expansion beyond declaration',frame(Buffer.alloc(64*1024,0x41),{declared:1024}),'SNAPSHOT_CORRUPT'],
  ];
  for (const [name,value,code] of cases) {
    replace.run(value,input.id);
    assert.throws(()=>store.read(input.id),error=>error.code===code,name);
  }
  replace.run(frame(raw,{declared:rawLimit}),input.id);
  assert.throws(()=>store.read(input.id),{code:'SNAPSHOT_CORRUPT',message:'Snapshot decoded length mismatch'});
  replace.run('{oops',input.id);
  assert.throws(()=>store.read(input.id),SyntaxError);
}));

test('unsupported SQL storage class is distinct from legacy JSON text',()=>{
  const dir=mkdtempSync(join(tmpdir(),'workbench-codec-type-'));
  const file=join(dir,'test.sqlite');
  const sql=new DatabaseSync(file);
  let store;
  try {
    sql.exec(`CREATE TABLE revisions(project_id TEXT NOT NULL,revision INTEGER NOT NULL,snapshot INTEGER NOT NULL,PRIMARY KEY(project_id,revision));
      CREATE TABLE heads(project_id TEXT PRIMARY KEY,revision INTEGER NOT NULL,
      FOREIGN KEY(project_id,revision) REFERENCES revisions(project_id,revision));`);
    sql.prepare('INSERT INTO revisions VALUES (?,?,?)').run(input.id,0,42);
    sql.prepare('INSERT INTO heads VALUES (?,?)').run(input.id,0);
    store=openStore(file);
    assert.throws(()=>store.read(input.id),{code:'SNAPSHOT_STORAGE_TYPE'});
    sql.prepare('UPDATE revisions SET snapshot=? WHERE project_id=?').run(1.25,input.id);
    assert.throws(()=>store.read(input.id),{code:'SNAPSHOT_STORAGE_TYPE'});
  } finally {store?.close();sql.close();rmSync(dir,{recursive:true,force:true});}
});

test('serialization and SQL aborts roll back both revision and head',()=>withDatabase(({store,sql})=>{
  store.create(input,actor);
  const state=()=>({head:sql.prepare('SELECT revision FROM heads').get().revision,
    count:sql.prepare('SELECT count(*) AS n FROM revisions').get().n,
    project:store.read(input.id)});
  const initial=state();
  assert.throws(()=>store.command(input.id,confirm,{...actor,now:1n}),TypeError);
  assert.deepEqual(state(),initial);
  sql.exec(`CREATE TRIGGER stop_insert BEFORE INSERT ON revisions BEGIN SELECT RAISE(ABORT,'revision insert blocked'); END;`);
  assert.throws(()=>store.command(input.id,confirm,actor),/revision insert blocked/);
  assert.deepEqual(state(),initial);
  sql.exec('DROP TRIGGER stop_insert');
  sql.exec(`CREATE TRIGGER stop_head BEFORE UPDATE ON heads BEGIN SELECT RAISE(ABORT,'head update blocked'); END;`);
  assert.throws(()=>store.command(input.id,confirm,actor),/head update blocked/);
  assert.deepEqual(state(),initial);
  sql.exec('DROP TRIGGER stop_head');
  assert.equal(store.command(input.id,confirm,actor).revision,1);
  assert.equal(state().count,2);
}));

test('SQL BLOB projection suppresses oversized bodies before JavaScript receives them',()=>{
  const sql=new DatabaseSync(':memory:');
  try {
    const row=sql.prepare(`SELECT typeof(snapshot) AS kind,length(snapshot) AS bytes,
      CASE WHEN typeof(snapshot)='blob' AND length(snapshot)>? THEN NULL ELSE snapshot END AS guarded
      FROM (SELECT zeroblob(?) AS snapshot)`).get(blobLimit,blobLimit+1);
    assert.equal(row.kind,'blob');
    assert.equal(row.bytes,blobLimit+1);
    assert.equal(row.guarded,null);
  } finally {sql.close();}
});
