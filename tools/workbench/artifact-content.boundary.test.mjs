import test from 'node:test';
import assert from 'node:assert/strict';
import fs,{mkdtemp,writeFile,mkdir,rm,symlink,appendFile,realpath,rename} from 'node:fs/promises';
import {syncBuiltinESMExports} from 'node:module';
import {constants} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {readArtifactContent} from './artifact-content.mjs';

const limit=1024*1024;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

async function fixture(t,raw=Buffer.from('{"theme":"得闲"}\n')){
  const parent=await mkdtemp(join(tmpdir(),'owned-artifact-boundary-'));
  t.after(()=>rm(parent,{recursive:true,force:true}));
  const root=join(parent,'managed');await mkdir(root);
  let path=join(root,'artifact.json');await writeFile(path,raw);path=await realpath(path);
  return {root,path,parent,raw,project:{artifacts:[{id:'a',payloadRef:path,contentHash:hash(raw)}]}};
}

test('retains exact UTF-8 text, parsed object, hash and public return shape',async t=>{
  const f=await fixture(t);
  assert.deepEqual(await readArtifactContent(f.project,'a',f.root),{artifactId:'a',contentHash:hash(f.raw),content:{theme:'得闲'},contentText:f.raw.toString('utf8')});
});

test('admits the existing exact 1 MiB limit',async t=>{
  const raw=Buffer.alloc(limit,32);Buffer.from('{"a":1}').copy(raw);
  const f=await fixture(t,raw);
  const result=await readArtifactContent(f.project,'a',f.root);
  assert.equal(Buffer.byteLength(result.contentText),limit);assert.deepEqual(result.content,{a:1});
});

test('preserves absent artifact and integrity error codes',async t=>{
  const f=await fixture(t);
  await assert.rejects(readArtifactContent(f.project,'missing',f.root),{code:'NOT_FOUND'});
  f.project.artifacts[0].contentHash='0'.repeat(64);
  await assert.rejects(readArtifactContent(f.project,'a',f.root),{code:'ARTIFACT_INTEGRITY'});
});

test('refuses oversized and non-regular content with the existing error',async t=>{
  const f=await fixture(t,Buffer.alloc(limit+1,32));
  await assert.rejects(readArtifactContent(f.project,'a',f.root),{code:'ARTIFACT_UNAVAILABLE'});
  f.project.artifacts[0].payloadRef=f.root;
  await assert.rejects(readArtifactContent(f.project,'a',f.root),{code:'ARTIFACT_UNAVAILABLE'});
  const dir=join(f.root,'directory');await mkdir(dir);f.project.artifacts[0].payloadRef=dir;
  await assert.rejects(readArtifactContent(f.project,'a',f.root),{code:'ARTIFACT_UNAVAILABLE'});
});

test('keeps confinement through managed symlink resolution',async t=>{
  const f=await fixture(t),outside=join(f.parent,'outside.json');await writeFile(outside,f.raw);
  const escape=join(f.root,'escape.json');await symlink(outside,escape);f.project.artifacts[0].payloadRef=escape;
  await assert.rejects(readArtifactContent(f.project,'a',f.root),{code:'ARTIFACT_UNAVAILABLE'});
  const alias=join(f.root,'alias.json');await symlink(f.path,alias);f.project.artifacts[0].payloadRef=alias;
  assert.equal((await readArtifactContent(f.project,'a',f.root)).content.theme,'得闲');
});

test('checks original bytes before reporting malformed structured text',async t=>{
  const f=await fixture(t,Buffer.from('{not json'));
  await assert.rejects(readArtifactContent(f.project,'a',f.root),{code:'ARTIFACT_UNAVAILABLE',message:'Artifact is not structured text'});
  f.project.artifacts[0].contentHash='0'.repeat(64);
  await assert.rejects(readArtifactContent(f.project,'a',f.root),{code:'ARTIFACT_INTEGRITY'});
});

test('retains native missing-file refusal',async t=>{
  const f=await fixture(t);await rm(f.path);
  await assert.rejects(readArtifactContent(f.project,'a',f.root),{code:'ENOENT'});
});

function observeDescriptor(t,f,{afterStat,failRead}={}){
  const originalOpen=fs.open;
  const observed={reads:[],closeCount:0,statCount:0,flags:null};
  t.after(()=>{fs.open=originalOpen;syncBuiltinESMExports();});
  fs.open=async function(path,...args){
    const handle=await originalOpen(path,...args);
    if(path!==f.path)return handle;
    observed.flags=args[0];
    const original={stat:handle.stat,read:handle.read,close:handle.close};
    handle.stat=async function(...args){const info=await original.stat.apply(this,args);observed.statCount++;if(observed.statCount===1&&afterStat)await afterStat();return info;};
    handle.read=async function(...args){if(failRead)throw failRead;const result=await original.read.apply(this,args);observed.reads.push({length:args[2],position:args[3],bytesRead:result.bytesRead});return result;};
    handle.close=async function(...args){observed.closeCount++;return original.close.apply(this,args);};
    return handle;
  };
  syncBuiltinESMExports();
  return observed;
}

test('reads at most the admitted bytes plus a growth probe and closes once',async t=>{
  const raw=Buffer.alloc(limit,32);Buffer.from('{"a":1}').copy(raw);
  const f=await fixture(t,raw),observed=await observeDescriptor(t,f);
  assert.deepEqual((await readArtifactContent(f.project,'a',f.root)).content,{a:1});
  assert.equal(observed.statCount,1);assert.equal(observed.closeCount,1);
  assert.ok(observed.flags&constants.O_NOFOLLOW);assert.ok(observed.flags&constants.O_NONBLOCK);
  assert.equal(observed.reads.reduce((sum,r)=>sum+r.bytesRead,0),limit);
  assert.ok(observed.reads.every(r=>r.length<=64*1024&&Number.isInteger(r.position)));
  assert.deepEqual(observed.reads.at(-1),{length:1,position:limit,bytesRead:0});
});

test('rejects growth after descriptor admission without reading the appended body',async t=>{
  const f=await fixture(t),observed=observeDescriptor(t,f,{afterStat:()=>appendFile(f.path,Buffer.alloc(limit+1,32))});
  await assert.rejects(readArtifactContent(f.project,'a',f.root),{code:'ARTIFACT_UNAVAILABLE'});
  assert.equal(observed.closeCount,1);
  assert.equal(observed.reads.reduce((sum,r)=>sum+r.bytesRead,0),f.raw.length+1);
  assert.equal(observed.reads.at(-1).position,f.raw.length);
});

test('closes a refused oversized descriptor before any data read',async t=>{
  const f=await fixture(t,Buffer.alloc(limit+1,32)),observed=await observeDescriptor(t,f);
  await assert.rejects(readArtifactContent(f.project,'a',f.root),{code:'ARTIFACT_UNAVAILABLE'});
  assert.equal(observed.closeCount,1);assert.deepEqual(observed.reads,[]);
});

test('closes descriptor after read failure and keeps the original error',async t=>{
  const f=await fixture(t),observed=observeDescriptor(t,f,{failRead:Object.assign(new Error('owned read failure'),{code:'EIO'})});
  await assert.rejects(readArtifactContent(f.project,'a',f.root),{code:'EIO',message:'owned read failure'});
  assert.equal(observed.closeCount,1);
});

test('hashes exactly the retained short-read bytes and closes on integrity refusal',async t=>{
  const f=await fixture(t),observed=observeDescriptor(t,f,{afterStat:()=>writeFile(f.path,'{}')});
  await assert.rejects(readArtifactContent(f.project,'a',f.root),{code:'ARTIFACT_INTEGRITY'});
  assert.equal(observed.closeCount,1);
  assert.equal(observed.reads.reduce((sum,r)=>sum+r.bytesRead,0),2);
});

test('retains descriptor bytes if the resolved pathname is replaced after open',async t=>{
  const f=await fixture(t),replacement=join(f.root,'replacement.json');
  await writeFile(replacement,'{"different":true}');
  const observed=observeDescriptor(t,f,{afterStat:()=>rename(replacement,f.path)});
  assert.equal((await readArtifactContent(f.project,'a',f.root)).content.theme,'得闲');
  assert.equal(observed.closeCount,1);
});

test('detects one appended byte at the exact readable limit',async t=>{
  const raw=Buffer.alloc(limit,32);Buffer.from('{"a":1}').copy(raw);
  const f=await fixture(t,raw),observed=observeDescriptor(t,f,{afterStat:()=>appendFile(f.path,' ')});
  await assert.rejects(readArtifactContent(f.project,'a',f.root),{code:'ARTIFACT_UNAVAILABLE'});
  assert.equal(observed.reads.reduce((sum,r)=>sum+r.bytesRead,0),limit+1);
  assert.equal(observed.closeCount,1);
});
