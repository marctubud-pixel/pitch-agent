import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,realpath,readFile,writeFile,lstat,rm,unlink,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createLocalPdfExtractor,PDF_LIMITS} from './intake-pdf.mjs';
const pythonBinary=process.env.PITCH_PDF_TEST_PYTHON;
const optional={skip:pythonBinary?false:'Set PITCH_PDF_TEST_PYTHON to an installed local PDF runtime; environment parsing unverified'};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function python(binary,args){const result=spawnSync(binary,['-I','-B',...args],{encoding:'utf8',timeout:10000});assert.equal(result.status,0,String(result.stderr||result.error));return result.stdout.trim();}
async function venv(t){
 const paths=JSON.parse(python(pythonBinary,['-c','import json,sysconfig,pypdf,pdfplumber; print(json.dumps([sysconfig.get_path("purelib"),sysconfig.get_path("platlib")]))']));
 const root=await realpath(await mkdtemp(join(tmpdir(),'pdf-python-environment-')));t.after(()=>rm(root,{recursive:true,force:true}));
 python(pythonBinary,['-m','venv','--without-pip','--symlinks',join(root,'venv')]);
 const configured=join(root,'venv','bin','python');assert.equal((await lstat(configured)).isSymbolicLink(),true,'Ordinary symlink venv must exercise the regression');
 const site=python(configured,['-c','import sysconfig; print(sysconfig.get_path("purelib"))']);await writeFile(join(site,'controlled-test-packages.pth'),[...new Set(paths)].join('\n')+'\n');
 assert.equal(python(configured,['-c','import sys,pypdf,pdfplumber; print(sys.executable)']),configured);
 return {root,configured};
}
test('configured symlink venv keeps its Python environment while physical hashes and PDF resource limits remain verified',optional,async t=>{
 const {configured}=await venv(t),physical=await realpath(configured),parser=createLocalPdfExtractor({pythonBinary:configured}),cap=await parser.capability();
 assert.equal(cap.available,true,JSON.stringify(cap));assert.equal(cap.identity.python,configured);assert.equal(cap.identity.configuredBinary,configured);assert.equal(cap.identity.binary,physical);assert.equal(cap.identity.binarySha256,sha(await readFile(physical)));assert.equal(cap.identity.scriptSha256,sha(await readFile(new URL('./intake-pdf-worker.py',import.meta.url))));assert.ok(cap.memoryProtection.samples>0);assert.equal(cap.memoryProtection.hardRssCap,false);
 const bytes=await readFile(new URL('./fixtures/intake/mixed.pdf',import.meta.url)),result=await parser.extract(bytes);
 assert.equal(result.status,'partial');assert.equal(result.pages.length,2);assert.equal(result.identity.python,configured);assert.equal(result.identity.binary,physical);assert.equal(result.rawHash,sha(bytes));assert.equal(result.textHash,sha(Buffer.from(result.text)));assert.equal(result.identity.binarySha256,cap.identity.binarySha256);assert.equal(result.identity.scriptSha256,cap.identity.scriptSha256);assert.equal(result.memoryProtection.available,true);assert.ok(result.memoryProtection.samples>0);assert.deepEqual(result.limits,PDF_LIMITS);
 const limited=await createLocalPdfExtractor({pythonBinary:configured,limits:{pages:1}}).extract(bytes);assert.equal(limited.status,'limit_exceeded');assert.equal(limited.identity.python,configured);
});
test('direct configured Python still probes and parses with the configured interpreter identity',optional,async()=>{
 const parser=createLocalPdfExtractor({pythonBinary}),cap=await parser.capability();assert.equal(cap.available,true,JSON.stringify(cap));assert.equal(cap.identity.python,pythonBinary);assert.equal(cap.identity.binary,await realpath(pythonBinary));
 const parsed=await parser.extract(await readFile(new URL('./fixtures/intake/emoji.pdf',import.meta.url)));assert.equal(parsed.text,'😀 Age 25');assert.equal(parsed.identity.python,pythonBinary);assert.equal(parsed.pages[0].textEndUtf16,9);assert.equal(parsed.memoryProtection.available,true);
});
test('unconfigured and missing Python paths remain unavailable without fallback',async()=>{
 assert.equal((await createLocalPdfExtractor(null).capability()).available,false);assert.equal((await createLocalPdfExtractor({pythonBinary:'/not-installed/pdf-python'}).capability()).available,false);
 await assert.rejects(createLocalPdfExtractor({pythonBinary:'/not-installed/pdf-python'}).extract(Buffer.from('%PDF-')),error=>error.code==='ENOENT'||error.code==='PDF_EXTRACTOR_UNAVAILABLE');
});
test('an invocation captures its configured path before asynchronous identity reads',optional,async()=>{
 const configuration={pythonBinary},parser=createLocalPdfExtractor(configuration),pending=parser.capability();configuration.pythonBinary='/not-installed/changed-after-start';
 const cap=await pending;assert.equal(cap.available,true,JSON.stringify(cap));assert.equal(cap.identity.configuredBinary,pythonBinary);assert.equal(cap.identity.python,pythonBinary);
});
for(const drift of ['retargeted','deleted'])test(`a configured symlink ${drift} during Python startup is a controlled identity failure`,optional,async t=>{
 const {configured}=await venv(t),physical=await realpath(configured),site=python(configured,['-c','import sysconfig; print(sysconfig.get_path("purelib"))']);
 await writeFile(join(site,'retarget-controlled-interpreter.pth'),`import os; os.path.islink(${JSON.stringify(configured)}) and os.unlink(${JSON.stringify(configured)}); ${drift==='retargeted'?`os.symlink("/bin/sh", ${JSON.stringify(configured)})`:''}\n`);
 const cap=await createLocalPdfExtractor({pythonBinary:configured}).capability();assert.equal(cap.available,false);assert.equal(cap.reason,'PDF_EXTRACTOR_ENVIRONMENT_CHANGED');if(drift==='retargeted'){assert.equal(await realpath(configured),await realpath('/bin/sh'));await unlink(configured);}await symlink(physical,configured);
 await assert.rejects(createLocalPdfExtractor({pythonBinary:configured}).extract(await readFile(new URL('./fixtures/intake/mixed.pdf',import.meta.url))),{code:'PDF_EXTRACTOR_ENVIRONMENT_CHANGED'});
});
