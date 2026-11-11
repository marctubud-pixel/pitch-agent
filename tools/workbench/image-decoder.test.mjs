import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,chmod,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {inspectImage as classical,createImageEvidenceStore as classicStore} from './image-evidence.mjs';
import {inspectImage as atomic,createImageEvidenceStore as atomicStore} from './image-evidence-atomic.mjs';
const python='/Users/marc/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3.12';
const base=new URL('./',import.meta.url);
async function fixture(t){const root=await realpath(await mkdtemp(join(tmpdir(),'shared-image-decoder-test-')));t.after(()=>rm(root,{recursive:true,force:true}));const script="from PIL import Image;import sys;im=Image.new('RGB',(12,7),'red');im.save(sys.argv[1]);im.save(sys.argv[2]);im.save(sys.argv[3]);im.save(sys.argv[4],save_all=True,append_images=[Image.new('RGB',(12,7),'blue')],format='PNG');Image.new('L',(5000,4001)).save(sys.argv[5])";const files=['sample.png','sample.jpg','sample.gif','animated.png','over-pixel.png'].map(n=>join(root,n));const result=spawnSync(python,['-c',script,...files],{encoding:'utf8',timeout:15000});assert.equal(result.status,0,result.stderr);const bytes=await Promise.all(files.map(f=>readFile(f)));const wrapper=join(root,'python3');await writeFile(wrapper,`#!/bin/sh\nexec '${python}' -c "import os; os.close(0)\n$2" "$3"\n`);await chmod(wrapper,0o700);return {root,bytes,wrapper};}
for(const [name,inspect,storeFactory] of [['classical',classical,classicStore],['atomic',atomic,atomicStore]]){
 test(name+' real PNG/JPEG and immutable store read roundtrip keep exact dimensions and original bytes',async t=>{const f=await fixture(t);for(const [index,type] of [[0,'image/png'],[1,'image/jpeg']])assert.deepEqual(await inspect(f.bytes[index],{pythonBinary:python}),{mediaType:type,width:12,height:7});const store=storeFactory({rootDir:join(f.root,'images'),pythonBinary:python});const asset=await store.ingest({projectId:'p',bytes:f.bytes[0],metadata:{representation:'supplied_image',description:'Local generated decoder fixture only.'}});const loaded=await store.read({projectId:'p',imageId:asset.id,expectedHash:asset.sha256});assert.deepEqual(loaded.bytes,f.bytes[0]);});
 test(name+' rejects invalid/truncated/unsupported/animated/over-pixel/over-byte inputs',async t=>{const f=await fixture(t);for(const bytes of [Buffer.from('bad'),f.bytes[0].subarray(0,-4),f.bytes[1].subarray(0,-2),f.bytes[2],f.bytes[3],f.bytes[4],Buffer.alloc(8*1024*1024+1)])await assert.rejects(()=>inspect(bytes,{pythonBinary:python}));await assert.rejects(()=>inspect('not bytes',{pythonBinary:python}));});
 test(name+' survives intentionally closed Python stdin without a loader or changed original validation rules',async t=>{const f=await fixture(t);assert.deepEqual(await inspect(f.bytes[0],{pythonBinary:f.wrapper}),{mediaType:'image/png',width:12,height:7});});
}
test('actual Node image-check CLI and grandchild Python work with closed stdin injection and no parent overlay',async t=>{const f=await fixture(t),cli=new URL('model-http-image-check.mjs',base);const result=spawnSync(process.execPath,[fileURLToPath(cli)],{input:f.bytes[0],env:{...process.env,PATH:f.root+':'+process.env.PATH},encoding:'utf8',timeout:15000});assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).width,12);});
test('input mutation after invocation cannot change the bytes selected for decoding',async t=>{const f=await fixture(t),bytes=Buffer.from(f.bytes[0]),pending=classical(bytes,{pythonBinary:python});bytes.fill(0);assert.equal((await pending).width,12);});
