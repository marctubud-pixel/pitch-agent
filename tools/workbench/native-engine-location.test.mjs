import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,copyFile,symlink,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const sourceRoot=fileURLToPath(new URL('../../',import.meta.url));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function namedClosure(root){
 const pending=['tools/workbench/layout-native-proof.mjs'],seen=new Set();
 let bytes=0;
 while(pending.length){
  const rel=pending.pop();if(seen.has(rel))continue;seen.add(rel);
  const source=join(sourceRoot,rel),raw=await readFile(source);bytes+=raw.length;
  assert.ok(bytes<=32*1024*1024,'Named source closure stays below 32 MiB');
  const target=join(root,rel);await mkdir(dirname(target),{recursive:true});await copyFile(source,target);
  for(const match of raw.toString().matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)){
   if(match[1].startsWith('.'))pending.push(fileURLToPath(new URL(match[1],pathToFileURL(source))).slice(sourceRoot.length));
  }
 }
}
async function fixture(t,name='relocated-engine-'){
 const root=await realpath(await mkdtemp(join(tmpdir(),name)));t.after(()=>rm(root,{recursive:true,force:true}));
 await namedClosure(root);
 const engine=join(root,'tools/auto-layout/index.mjs'),nativeCheck=join(root,'tools/auto-layout/native-check.sh');
 const nativeRuntime=join(root,'fixture-runtime'),presentationsSkill=join(root,'fixture-skill');
 const paths=[engine,nativeCheck,...['node','python','soffice','bash'].map(n=>join(root,'fixture-tools',n)),join(nativeRuntime,'modules/package.json'),join(presentationsSkill,'skill.txt')];
 for(const path of paths){await mkdir(dirname(path),{recursive:true});await writeFile(path,`controlled dummy file ${path}\n`);}
 await symlink(join(nativeRuntime,'modules'),join(root,'tools/auto-layout/node_modules'));
 const files=[];for(const path of paths.slice(0,6)){const bytes=await readFile(path);files.push({path,bytes:bytes.length,sha256:hash(bytes)});}
 const manifest=files.slice(0,2).map(f=>({...f,path:f.path.slice(root.length+1)}));
 await writeFile(join(root,'renderer-source-manifest.json'),JSON.stringify(manifest));
 const {verifyExecutionPins,dependencyInventory}=await import(pathToFileURL(join(root,'tools/workbench/layout-native-proof.mjs')));
 const dependencyRoots=[];for(const path of [nativeRuntime,presentationsSkill])dependencyRoots.push({path,files:await dependencyInventory(path)});
 const execution={protocol:'project-native-execution-v1',engine,nativeCheck,node:paths[2],python:paths[3],soffice:paths[4],bash:paths[5],nativeRuntime,presentationsSkill,files,dependencyRoots};
 return {root,execution,verifyExecutionPins,manifest,dependencyInventory};
}
const rejects=(f,e,code)=>assert.rejects(()=>f.verifyExecutionPins(e),{code});
test('controlled fixture accepts exact pins after relocation to a fresh root',async t=>{
 const f=await fixture(t);const result=await f.verifyExecutionPins(f.execution);
 assert.deepEqual(result.files,f.execution.files);assert.match(result.closureHash,/^[a-f0-9]{64}$/);
});
test('controlled fixture decodes Chinese, spaces, percent and hash in module URL',async t=>{
 const f=await fixture(t,'原生 引擎 % # ');assert.deepEqual((await f.verifyExecutionPins(f.execution)).files,f.execution.files);
});
test('controlled fixture refuses old hardcoded deployment root',async t=>{
 const f=await fixture(t),old='/private/tmp/semantic-layout-v2-b5iff3zp';
 await rejects(f,{...f.execution,engine:join(old,'tools/auto-layout/index.mjs'),nativeCheck:join(old,'tools/auto-layout/native-check.sh')},'LAYOUT_NATIVE_ENGINE_CHANGED');
});
test('controlled fixture refuses mismatched declared engine',async t=>{
 const f=await fixture(t);await rejects(f,{...f.execution,engine:join(f.root,'other.mjs')},'LAYOUT_NATIVE_ENGINE_CHANGED');
});
test('controlled fixture refuses mismatched declared native check',async t=>{
 const f=await fixture(t);await rejects(f,{...f.execution,nativeCheck:join(f.root,'other.sh')},'LAYOUT_NATIVE_ENGINE_CHANGED');
});
for(const key of ['engine','nativeCheck'])test(`controlled fixture refuses mutated ${key} even with refreshed execution pin`,async t=>{
 const f=await fixture(t),path=f.execution[key];await writeFile(path,'mutated dummy\n');
 const bytes=await readFile(path),execution=structuredClone(f.execution);Object.assign(execution.files.find(x=>x.path===path),{bytes:bytes.length,sha256:hash(bytes)});
 await rejects(f,execution,'LAYOUT_NATIVE_ENGINE_CHANGED');
});
test('controlled fixture refuses manifest entry pointing at a different file',async t=>{
 const f=await fixture(t);f.manifest[0].path='fixture-tools/node';await writeFile(join(f.root,'renderer-source-manifest.json'),JSON.stringify(f.manifest));
 await rejects(f,f.execution,'LAYOUT_NATIVE_ENGINE_CHANGED');
});
test('controlled fixture requires manifest at its own source root',async t=>{
 const f=await fixture(t);await rm(join(f.root,'renderer-source-manifest.json'));
 await assert.rejects(()=>f.verifyExecutionPins(f.execution),{code:'ENOENT'});
});
test('controlled fixture preserves rejection of node modules outside pinned runtime',async t=>{
 const f=await fixture(t),link=join(f.root,'tools/auto-layout/node_modules');await rm(link);await symlink(f.execution.presentationsSkill,link);
 await rejects(f,f.execution,'LAYOUT_NATIVE_DEPENDENCY_CHANGED');
});
test('controlled fixture preserves exact external dependency inventory',async t=>{
 const f=await fixture(t);await writeFile(join(f.execution.nativeRuntime,'modules/package.json'),'changed dependency\n');
 await rejects(f,f.execution,'LAYOUT_NATIVE_DEPENDENCY_CHANGED');
});
test('controlled fixture preserves entry point pin requirement',async t=>{
 const f=await fixture(t);await rejects(f,{...f.execution,files:f.execution.files.filter(x=>x.path!==f.execution.bash)},'LAYOUT_NATIVE_CONFIGURATION_REQUIRED');
});
