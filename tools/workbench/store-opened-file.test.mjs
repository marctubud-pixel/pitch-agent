import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

const storeUrl=new URL('./store.mjs',import.meta.url).href;
function probe(body){
 const script=`import assert from 'node:assert/strict';
 import {mkdtempSync,realpathSync,statSync,renameSync,copyFileSync,rmSync,existsSync,openSync,closeSync} from 'node:fs';
 import {tmpdir} from 'node:os'; import {join} from 'node:path';
 import {openStore,assertNativeOpenedFileIdentity} from ${JSON.stringify(storeUrl)};
 const root=realpathSync(mkdtempSync(join(tmpdir(),'opened-file-proof-'))),file=join(root,'db');
 const pin=()=>{const s=statSync(file);return {dev:s.dev,ino:s.ino};};
 try{${body}}finally{rmSync(root,{recursive:true,force:true});}`;
 const result=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8',timeout:15000});
 assert.equal(result.status,0,String(result.stderr||result.error));
}

test('ordinary native stores remain usable without granting an opened-file proof',()=>probe(`
 const store=openStore(file);try{
  store.create({id:'p',name:'metadata',brief:'No models'}, {actorType:'agent',actorId:'metadata',runId:'metadata',contextId:'metadata',now:new Date().toISOString()});
  assert.equal(store.read('p').id,'p');
  assert.throws(()=>assertNativeOpenedFileIdentity(store,pin()),e=>e.code==='STORE_OPENED_FILE_REQUIRED');
 }finally{store.close();}
`));

test('a supported clean native open proves its actual file and close revokes it',()=>probe(`
 if(process.platform!=='darwin'){
  assert.throws(()=>openStore(file,{openedFileProof:true}),e=>e.code==='STORE_OPENED_FILE_UNSUPPORTED');
  assert.equal(existsSync(file),false);
 }else{
  const store=openStore(file,{openedFileProof:true}),identity=pin();
  assertNativeOpenedFileIdentity(store,identity);
  assert.throws(()=>assertNativeOpenedFileIdentity(Object.create(store),identity),e=>e.code==='STORE_OPENED_FILE_REQUIRED');
  store.close();
  assert.throws(()=>assertNativeOpenedFileIdentity(store,identity),e=>e.code==='STORE_OPENED_FILE_REQUIRED');
 }
`));

test('restoring the expected pathname cannot disguise a SQLite handle on another inode',()=>probe(`
 if(process.platform!=='darwin'){
  assert.throws(()=>openStore(file,{openedFileProof:true}),e=>e.code==='STORE_OPENED_FILE_UNSUPPORTED');
 }else{
  const first=openStore(file,{openedFileProof:true});
  first.create({id:'p',name:'metadata',brief:'Same bytes, different files'}, {actorType:'agent',actorId:'metadata',runId:'metadata',contextId:'metadata',now:new Date().toISOString()});
  const identity=pin();first.close();
  renameSync(file,join(root,'original'));copyFileSync(join(root,'original'),file);
  const second=openStore(file,{openedFileProof:true});
  try{
   assert.equal(second.read('p').id,'p');
   renameSync(file,join(root,'shadow'));renameSync(join(root,'original'),file);
   assert.deepEqual(pin(),identity);
   assert.throws(()=>assertNativeOpenedFileIdentity(second,identity),e=>e.code==='STORE_OPENED_FILE_CHANGED');
  }finally{second.close();}
 }
`));

test('unrelated regular descriptors stop opt-in proof instead of being guessed as SQLite',()=>probe(`
 const fd=openSync(join(root,'unrelated'),'w');
 try{
  assert.throws(()=>openStore(file,{openedFileProof:true}),e=>e.code==='STORE_OPENED_FILE_UNSUPPORTED');
  assert.equal(existsSync(file),false);
 }finally{closeSync(fd);}
`));
