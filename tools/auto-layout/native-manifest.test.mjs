import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {encodeNativeManifest,readNativeManifest,readNativeManifestFile} from './native-manifest.mjs';
const fixture=()=>({schemaVersion:2,style:'editorial',semanticContent:{source:{sourceHash:'current',obligations:['current'],chartDelivery:{raw:'中文😀\ud800\\\n',values:[1e-7,1e21,1.25]},immutableBasis:{sourceHash:'basis',obligations:['basis'],chartDelivery:{raw:'中文😀\ud800\\\n',values:[1e-7,1e21,1.25]}}},chartPlacements:[{id:'one'}],manuscript:{chartPlacements:[{id:'one'}]}}});
const wire=()=>JSON.parse(encodeNativeManifest(fixture()));
const mutate=fn=>{const value=wire();fn(value);return JSON.stringify(value);};
const cases=[
 ['legacy',JSON.stringify(fixture(),null,2),true],
 ['transport',JSON.stringify(wire()),true],
 ['unknown-slot',mutate(v=>v.slots[0].kind='unknown'),false],
 ['missing-slot',mutate(v=>v.slots.shift()),false],
 ['duplicate-slot',mutate(v=>v.slots.push(v.slots[0])),false],
 ['slot-order',mutate(v=>v.slots.reverse()),false],
 ['slot-extra-key',mutate(v=>v.slots[0].path='/outside'),false],
 ['non-null-target',mutate(v=>v.root.semanticContent.source.chartDelivery={}),false],
 ['missing-target',mutate(v=>delete v.root.semanticContent.source.chartDelivery),false],
 ['nested-reference',mutate(v=>v.slots[0].value={$ref:'slots/0'}),false],
 ['byte-underreport',mutate(v=>v.expanded.bytes--),false],
 ['node-underreport',mutate(v=>v.expanded.nodes--),false],
 ['utf16-underreport',mutate(v=>v.expanded.utf16--),false],
 ['depth-underreport',mutate(v=>v.expanded.depth--),false],
 ['digest-change',mutate(v=>v.expanded.sha256='0'.repeat(64)),false],
 ['envelope-extra',mutate(v=>v.ref='file:///tmp'),false],
 ['unknown-version',mutate(v=>v.transportVersion='native-layout-lossless-v2'),false],
 ['duplicate-key','{"schemaVersion":2,"schemaVersion":2}',false],
 ['duplicate-escaped-key','{"a":1,"\\u0061":2}',false],
 ['invalid-number','{"a":1e999}',false],
 ['leading-zero','{"a":01}',false],
 ['deep','['.repeat(65)+'0'+']'.repeat(65),false],
 ['trailing-data','{}{}',false],
 ['array-root','[]',true],
];
test('shared adversarial corpus agrees in JS and Python',()=>{
 for(const [name,raw,pass]of cases){if(pass)readNativeManifest(Buffer.from(raw));else assert.throws(()=>readNativeManifest(Buffer.from(raw)),undefined,name);}
 const program=`import sys,json\nsys.path.insert(0,sys.argv[1])\nfrom native_manifest import read_native_manifest\nrows=json.load(sys.stdin)\nfor name,raw,wanted in rows:\n try:\n  read_native_manifest(raw.encode('utf-8'));actual=True\n except Exception:actual=False\n if actual!=wanted:raise AssertionError(name)\nprint(len(rows))\n`;
 const child=spawnSync('python3',['-c',program,fileURLToPath(new URL('.',import.meta.url))],{input:JSON.stringify(cases),encoding:'utf8',timeout:30000});assert.equal(child.status,0,child.stderr);assert.equal(Number(child.stdout.trim()),cases.length);
});
test('preserves source/basis and isolated occurrences; unequal pairs remain literal',()=>{
 const original=fixture(),decoded=readNativeManifest(encodeNativeManifest(original));assert.deepEqual(decoded.manifest,original);decoded.manifest.semanticContent.source.chartDelivery.values.push(99);assert.equal(decoded.manifest.semanticContent.source.immutableBasis.chartDelivery.values.length,3);
 original.semanticContent.source.immutableBasis.chartDelivery.raw='different';const raw=encodeNativeManifest(original);assert.equal(JSON.parse(raw).slots.some(s=>s.kind==='chartDelivery'),false);assert.deepEqual(readNativeManifest(raw).manifest,original);
});
test('raw scalar tokens determine identical expanded digest across languages',()=>{
 let raw=encodeNativeManifest({schemaVersion:2,n:1e-7,semanticContent:{source:{}}}).toString();const v=JSON.parse(raw);const oldRoot=JSON.stringify(v.root),newRoot=oldRoot.replace('1e-7','1.00e-07');v.expanded.bytes+=4;v.expanded.sha256=createHash('sha256').update(newRoot).digest('hex');raw=JSON.stringify(v).replace(oldRoot,newRoot);const js=readNativeManifest(Buffer.from(raw));
 const program="import sys,json;sys.path.insert(0,sys.argv[1]);from native_manifest import read_native_manifest;r=read_native_manifest(sys.stdin.buffer.read());print(json.dumps(r['original']))";
 const child=spawnSync('python3',['-c',program,fileURLToPath(new URL('.',import.meta.url))],{input:raw,encoding:'utf8',timeout:30000});assert.equal(child.status,0,child.stderr);assert.deepEqual(JSON.parse(child.stdout),js.original);
});
test('identity, invalid UTF8 and policy refusal precede expanded buffer allocation',()=>{
 const raw=encodeNativeManifest(fixture());assert.throws(()=>readNativeManifest(raw,{sha256:'0'.repeat(64)}));assert.throws(()=>readNativeManifest(Buffer.from([123,34,97,34,58,34,0xff,34,125])));
 let allocations=0;const original=Buffer.allocUnsafe;Buffer.allocUnsafe=(...a)=>{allocations++;return original(...a);};try{assert.throws(()=>readNativeManifest(raw,undefined,{expandedBytes:10}));assert.equal(allocations,0);}finally{Buffer.allocUnsafe=original;}
 assert.throws(()=>readNativeManifest(raw,undefined,{workBytes:raw.length}));assert.throws(()=>readNativeManifest(raw,undefined,{utf16:5}));assert.throws(()=>readNativeManifest(raw,undefined,{workNodes:10}));assert.throws(()=>readNativeManifest(raw,undefined,{encodedBytes:raw.length-1}));
});
test('bounded file owner refuses symbolic links and oversized files before read',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'native-manifest-test-'));try{const target=path.join(directory,'layout.json');fs.writeFileSync(target,encodeNativeManifest(fixture()));fs.symlinkSync(target,path.join(directory,'link.json'));assert.throws(()=>readNativeManifestFile(path.join(directory,'link.json')));assert.throws(()=>readNativeManifestFile(target,undefined,{encodedBytes:10}));assert.deepEqual(readNativeManifestFile(target).manifest,fixture());}finally{fs.rmSync(directory,{recursive:true});}
});
