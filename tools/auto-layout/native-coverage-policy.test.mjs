import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,truncate,symlink,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {coveragePolicy as policy,coverageOutputLimit,checkNumericCoverage,jsonWireSize,anchorCoverageLimit} from './native-coverage-policy.mjs';
import {proofFiles,writeNativeAnchor} from '../workbench/layout-native-proof.mjs';
import {readManagedLayoutBytes} from '../workbench/managed-layout-bytes.mjs';
const limit=policy.completeNumericOutputBytes;
const transport={sha256:'a'.repeat(64),bytes:24},original={sha256:'b'.repeat(64),bytes:42};
const checked={transportVersion:'native-layout-lossless-v1',transport,original};
const report=()=>({schemaVersion:policy.completeVersion,semanticCoverageVersion:policy.semanticVersion,layoutTransport:transport,layoutOriginal:original});
test('exact UTF8 JSON byte accounting includes escaped and astral values',()=>{
 for(const v of ['',{},[],null,true,1e-7,{a:'中文😀\ud800\udfff\n\r\t"\\\u0000',b:[{},'',false]}])assert.equal(jsonWireSize(v,1000),Buffer.byteLength(JSON.stringify(v)));
 const v={a:'x'.repeat(limit-8)};assert.equal(jsonWireSize(v,limit),limit);v.a+='x';assert.throws(()=>jsonWireSize(v,limit),/OUTPUT_BOUND/);
});
test('actual representation and complete numeric tuple select finite capacity',()=>{
 assert.equal(coverageOutputLimit(checked),limit);assert.equal(coverageOutputLimit({transportVersion:null}),8388608);checkNumericCoverage(report(),checked);
 for(const mutate of [r=>r.schemaVersion='native-object-coverage-v4',r=>r.schemaVersion='native-object-coverage-v2',r=>delete r.semanticCoverageVersion,r=>r.semanticCoverageVersion='native-object-coverage-v1',r=>r.layoutTransport={...transport,bytes:25},r=>r.layoutOriginal={...original,sha256:'c'.repeat(64)}]){const r=report();mutate(r);assert.throws(()=>checkNumericCoverage(r,checked),/VERSION_TUPLE/);}
 assert.throws(()=>checkNumericCoverage(report(),{transportVersion:null}),/VERSION_TUPLE/);checkNumericCoverage({schemaVersion:policy.semanticVersion},{transportVersion:null});
});
test('anchor admission rejects unknown discriminator and wrong anchor protocol',()=>{
 assert.equal(anchorCoverageLimit({},64*1024**2),64*1024**2);
 assert.equal(anchorCoverageLimit({protocol:'project-native-proof-v2',coverageSchemaVersion:policy.completeVersion}),limit);
 for(const a of [{protocol:'project-native-proof-v1',coverageSchemaVersion:policy.completeVersion},{protocol:'project-native-proof-v2',coverageSchemaVersion:'native-object-coverage-v4'}])assert.throws(()=>anchorCoverageLimit(a,64*1024**2),/VERSION_TUPLE/);
});
test('managed complete coverage refuses oversize, symlinks and aggregate exhaustion before reads',async()=>{
 const root=await mkdtemp(join(tmpdir(),'coverage-policy-'));
 try{
  const file=join(root,'report.json');await writeFile(file,'');await truncate(file,limit);
  assert.equal((await readManagedLayoutBytes(root,file,limit)).length,limit);
  await truncate(file,limit+1);await assert.rejects(readManagedLayoutBytes(root,file,limit),/Bounded regular/);
  await symlink(file,join(root,'linked'));await assert.rejects(readManagedLayoutBytes(root,join(root,'linked'),limit),/symlink/);await rm(join(root,'linked'));
  await truncate(file,2);await assert.rejects(proofFiles(root,{root,budget:{started:Date.now(),chargedReadUpperBound:6*1024**3-2},pass:{tree:0,resources:0,entries:0},coverageLimit:limit}),/6 GiB/);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('configured coverage cap rejects first inventory and anchor before oversized allocation',async()=>{
 const root=await mkdtemp(join(tmpdir(),'coverage-inventory-'));
 try{
  await mkdir(join(root,'output/build'),{recursive:true});const file=join(root,'output/build/object-coverage.json');await writeFile(file,'');await truncate(file,limit+1);
  const originalAlloc=Buffer.alloc,allocations=[];Buffer.alloc=(size,...args)=>{allocations.push(size);return originalAlloc(size,...args);};
  try{
   const options={root,budget:{started:Date.now(),chargedReadUpperBound:0},pass:{tree:0,resources:0,entries:0},coverageLimit:limit};
   await assert.rejects(proofFiles(root,options),/read limit/);assert.equal(options.budget.chargedReadUpperBound,0);
   await assert.rejects(writeNativeAnchor(root,{protocol:'project-native-proof-v2',coverageSchemaVersion:policy.completeVersion}),/read limit/);
   assert(!allocations.some(size=>size>=limit));
  }finally{Buffer.alloc=originalAlloc;}
  await assert.rejects(access(join(root,'anchor.json')));
  await truncate(file,limit);const budget={started:Date.now(),chargedReadUpperBound:0};
  for(let i=0;i<2;i++)await proofFiles(root,{root,budget,pass:{tree:0,resources:0,entries:0},coverageLimit:limit});
  assert.equal(budget.chargedReadUpperBound,2*(limit+1));
 }finally{await rm(root,{recursive:true,force:true});}
});
