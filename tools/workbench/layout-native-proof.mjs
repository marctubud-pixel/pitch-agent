import {anchorCoverageLimit,checkNumericCoverage} from '../auto-layout/native-coverage-policy.mjs';
import {readNativeManifest} from '../auto-layout/native-manifest.mjs';
import {numericContentContract} from './content-contract-versions.mjs';
import {isDeepStrictEqual as equal} from 'node:util';
import {readFile,lstat,readdir,opendir,open,rename,readlink,realpath} from 'node:fs/promises';
import {join,resolve,relative,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseExecutionV2,verifyExecutionV2Trees} from './native-tree-identity.mjs';
import {layoutHash} from './layout-boundary.mjs';
import {readManagedLayoutBytes} from './managed-layout-bytes.mjs';
import {sketchRequire as need} from './sketch-authority.mjs';
export async function dependencyInventory(directory){
 const files=[];
 async function walk(dir){for(const name of (await readdir(dir)).sort()){const path=join(dir,name),info=await lstat(path);if(info.isSymbolicLink())files.push({path:relative(directory,path),type:'symlink',target:await readlink(path),resolved:await realpath(path)});else if(info.isDirectory())await walk(path);else{need(info.isFile(),'LAYOUT_NATIVE_DEPENDENCY_CHANGED','Dependency must be a file, directory or explicit link');files.push({path:relative(directory,path),bytes:info.size,sha256:layoutHash(await readFile(path))});}}}
 await walk(directory);return files;
}
export async function verifyExecutionPins(execution){
 const v2=execution?.protocol==='project-native-execution-v2';
 if(v2)parseExecutionV2(execution);
 need((v2||execution?.protocol==='project-native-execution-v1')&&Array.isArray(execution.files)&&execution.files.length>0,'LAYOUT_NATIVE_CONFIGURATION_REQUIRED','Explicit pinned native execution closure required');
 const engineRoot=fileURLToPath(new URL('../../',import.meta.url));
 need(execution.engine===join(engineRoot,'tools/auto-layout/index.mjs')&&execution.nativeCheck===join(engineRoot,'tools/auto-layout/native-check.sh'),'LAYOUT_NATIVE_ENGINE_CHANGED','Accepted frozen semantic v2 engine required');
 const sourceManifest=JSON.parse(await readFile(new URL('../../renderer-source-manifest.json',import.meta.url)));
 for(const f of sourceManifest){const path=join(engineRoot,f.path),info=await lstat(path);need(info.isFile()&&!info.isSymbolicLink()&&Number.isSafeInteger(f.bytes)&&f.bytes>0&&typeof f.sha256==='string'&&/^[a-f0-9]{64}$/.test(f.sha256)&&info.size===f.bytes&&layoutHash(await readFile(path))===f.sha256,'LAYOUT_NATIVE_ENGINE_CHANGED','Accepted exact semantic v2 source closure required');}
 const byPath=new Map(execution.files.map(f=>[f.path,f]));
 need(byPath.size===execution.files.length&&['node','engine','nativeCheck','python','soffice','bash'].every(k=>byPath.has(execution[k])),'LAYOUT_NATIVE_CONFIGURATION_REQUIRED','Entry points and tool binaries must be pinned');
 if(!v2){
 for(const f of execution.files){const info=await lstat(f.path);need(resolve(f.path)===f.path&&info.isFile()&&!info.isSymbolicLink()&&Number.isSafeInteger(f.bytes)&&f.bytes>0&&typeof f.sha256==='string'&&/^[a-f0-9]{64}$/.test(f.sha256)&&info.size===f.bytes&&layoutHash(await readFile(f.path))===f.sha256,'LAYOUT_NATIVE_DEPENDENCY_CHANGED',`Native dependency changed at ${f.path}`);}
 need(Array.isArray(execution.dependencyRoots)&&execution.dependencyRoots.some(r=>r.path===execution.nativeRuntime)&&execution.dependencyRoots.some(r=>r.path===execution.presentationsSkill),'LAYOUT_NATIVE_DEPENDENCIES_REQUIRED','Exact presentation and complete native runtime dependency trees required');
 need((await realpath(join(engineRoot,'tools/auto-layout/node_modules'))).startsWith(execution.nativeRuntime+'/'),'LAYOUT_NATIVE_DEPENDENCY_CHANGED','Engine modules must resolve inside the pinned runtime');
 for(const dependency of execution.dependencyRoots){const actual=await dependencyInventory(dependency.path);need(JSON.stringify(actual)===JSON.stringify(dependency.files),'LAYOUT_NATIVE_DEPENDENCY_CHANGED','Exact external dependency tree changed');for(const entry of actual.filter(e=>e.type==='symlink'))need(execution.dependencyRoots.some(r=>entry.resolved===r.path||entry.resolved.startsWith(r.path+'/'))||byPath.has(entry.resolved),'LAYOUT_NATIVE_DEPENDENCIES_REQUIRED','External symbolic dependency targets must also be explicitly pinned');}
 }else{
  await verifyExecutionV2Trees(execution);
  const modules=await realpath(join(engineRoot,'tools/auto-layout/node_modules'));
  need(modules.startsWith(execution.nativeRuntime+'/'),'LAYOUT_NATIVE_DEPENDENCY_CHANGED','Engine modules must resolve inside the pinned runtime');
 }
 return {closureHash:layoutHash(execution),files:execution.files};
}
const limits={entries:8192,depth:64,file:512*1024*1024,tree:2*1024*1024*1024,resources:512*1024*1024,json:64*1024*1024,reads:6*1024*1024*1024,duration:180000};
function budget(){return {started:Date.now(),chargedReadUpperBound:0};}
function inventoryBudget(){return {tree:0,resources:0,entries:0};}
function within(b,bytes=0){
 need(Date.now()-b.started<=limits.duration,'LAYOUT_PROOF_LIMIT','Native proof verification exceeded 180 seconds');
 need(Number.isSafeInteger(bytes)&&bytes>=0&&b.chargedReadUpperBound+bytes<=limits.reads,'LAYOUT_PROOF_LIMIT','Native proof reserved reads exceed 6 GiB');
 b.chargedReadUpperBound+=bytes;
}
async function checkedRead(root,path,max,b){
 within(b);
 const stated=await lstat(path);
 need(Number.isSafeInteger(stated.size)&&stated.size>=0&&stated.size<=max,'LAYOUT_PROOF_LIMIT','Native proof file exceeds its read limit');
 const permittedReadLimit=Math.min(max,Math.max(1,stated.size));
 within(b,permittedReadLimit+1);
 const bytes=await readManagedLayoutBytes(root,path,permittedReadLimit);
 within(b);
 return bytes;
}
async function checkedResources(root,binding,b,pass=inventoryBudget()){
 need(Array.isArray(binding.resources),'LAYOUT_NATIVE_RESOURCES_REQUIRED','One exact brand and assets manifest required');
 const resources=binding.resources.map(r=>({...r}));
 need(resources.filter(r=>r.kind==='brand').length===1&&resources.filter(r=>r.kind==='assets').length===1,'LAYOUT_NATIVE_RESOURCES_REQUIRED','One exact brand and assets manifest required');
 const contents=new Map();
 for(const r of resources){
  need(typeof r.path==='string'&&resolve(r.path)===r.path&&Number.isSafeInteger(r.byteLength)&&r.byteLength>0&&typeof r.sha256==='string'&&/^[a-f0-9]{64}$/.test(r.sha256),'LAYOUT_NATIVE_RESOURCES_REQUIRED','Explicit nonempty original resource byte evidence required');
  need(pass.resources+r.byteLength<=limits.resources,'LAYOUT_PROOF_LIMIT','Native resources exceed 512 MiB');
  const bytes=await checkedRead(root,r.path,64*1024*1024,b);
  need(bytes.length===r.byteLength&&layoutHash(bytes)===r.sha256,'LAYOUT_RESOURCE_BYTES_CHANGED','Frozen native resource changed');
  pass.resources+=bytes.length;
  contents.set(r.path,bytes);
 }
 const brand=resources.find(r=>r.kind==='brand'),assets=resources.find(r=>r.kind==='assets');
 const bText=contents.get(brand.path).toString('utf8'),aText=contents.get(assets.path).toString('utf8');
 const brandData=JSON.parse(bText),assetData=JSON.parse(aText);
 const paths=[...(brandData.font?.files??[]).map(p=>resolve(dirname(brand.path),p)),...Object.values(assetData.assets??{}).map(v=>resolve(dirname(assets.path),v.file))];
 need(paths.length>0&&paths.every(path=>resources.some(r=>r.path===path)),'LAYOUT_NATIVE_RESOURCES_REQUIRED','Every original font and image must be frozen as a managed resource');
 return {brand,assets,brandData,assetData,brandText:bText,assetText:aText,descriptors:resources};
}
export async function verifyNativeResources(root,binding){
 const checked=await checkedResources(root,binding,budget());
 return {brand:checked.brand.path,assets:checked.assets.path};
}
export async function proofFiles(directory,options){
 const entries=[];
 async function names(dir){
  if(!options)return (await readdir(dir)).sort();
  const found=[];
  for await(const entry of await opendir(dir)){
   within(options.budget);
   need(++options.pass.entries<=limits.entries,'LAYOUT_PROOF_LIMIT','Native proof exceeds 8192 tree entries');
   found.push(entry.name);
  }
  return found.sort();
 }
 async function walk(dir,depth){
  if(options)need(depth<=limits.depth,'LAYOUT_PROOF_LIMIT','Native proof exceeds 64 directory levels');
  for(const name of await names(dir)){
   const path=join(dir,name),s=await lstat(path);
   need(!s.isSymbolicLink(),'LAYOUT_PROOF_SYMLINK','Native proof cannot follow links');
   if(s.isDirectory())await walk(path,depth+1);
   else{
    need(s.isFile(),'LAYOUT_PROOF_FILE','Native proof must contain regular files');
    if(['anchor.json','anchor.pending','worker.log'].includes(relative(directory,path)))continue;
    if(options){
     const b=options.budget;
     need(Number.isSafeInteger(s.size)&&s.size<=limits.file&&options.pass.tree+s.size<=limits.tree,'LAYOUT_PROOF_LIMIT','Native proof tree exceeds finite inventory limits');
     options.pass.tree+=s.size;
     const fileLimit=relative(directory,path)==='output/build/object-coverage.json'?(options.coverageLimit??limits.file):limits.file;
     const bytes=await checkedRead(options.root,path,fileLimit,b);
     need(bytes.length===s.size,'LAYOUT_PROOF_CHANGED','Native proof file changed during inventory');
     entries.push({path:relative(directory,path),bytes:s.size,sha256:layoutHash(bytes)});
    }else entries.push({path:relative(directory,path),bytes:s.size,sha256:layoutHash(await readFile(path))});
   }
  }
 }
 await walk(directory,0);return entries;
}
export async function writeNativeAnchor(directory,value){
 const pending=join(directory,'anchor.pending'),handle=await open(pending,'wx');
 try{const coverageLimit=anchorCoverageLimit(value,limits.file);const options=Object.hasOwn(value,'coverageSchemaVersion')?{root:directory,budget:budget(),pass:inventoryBudget(),coverageLimit}:undefined;await handle.writeFile(JSON.stringify({...value,files:await proofFiles(directory,options)}));await handle.sync();}finally{await handle.close();}
 await rename(pending,join(directory,'anchor.json'));
 const dir=await open(directory,'r');try{await dir.sync();}finally{await dir.close();}
}
async function checkedNativeAnchor(root,directory,expected){
 const b=budget();
 const initialPass=inventoryBudget();
 need(['bindingHash','executionHash','ledgerHash'].every(k=>typeof expected?.[k]==='string'&&/^[a-f0-9]{64}$/.test(expected[k]))&&typeof expected.attemptId==='string'&&expected.attemptId.trim()&&['editorial','stage','evidence'].includes(expected.style)&&Number.isSafeInteger(expected.worker?.pid)&&expected.worker.pid>0&&typeof expected.worker.host==='string'&&expected.worker.host.trim()&&expected.worker.token===expected.attemptId,'LAYOUT_ANCHOR_EXPECTATION_REQUIRED','Typed original binding, ledger, execution and worker identities required');
 const anchorPath=join(directory,'anchor.json'),bytes=await checkedRead(root,anchorPath,32*1024*1024,b),a=JSON.parse(bytes);
 need(['project-native-proof-v1','project-native-proof-v2'].includes(a.protocol)&&a.bindingHash===expected.bindingHash&&a.attemptId===expected.attemptId&&a.style===expected.style&&a.executionHash===expected.executionHash&&a.worker?.token===expected.attemptId&&a.worker.pid===expected.worker.pid&&a.worker.host===expected.worker.host,'LAYOUT_ANCHOR_CHANGED','Original native attempt and worker binding required');
 const coverageLimit=anchorCoverageLimit(a,limits.json);
 const files=await proofFiles(directory,{root,budget:b,pass:initialPass,coverageLimit});
 need(JSON.stringify(a.files)===JSON.stringify(files),'LAYOUT_PROOF_CHANGED','Exact native evidence tree changed');
 const byPath=new Map(files.map(f=>[f.path,f]));
 const required=path=>{
  need(typeof path==='string'&&path&&resolve(directory,path).startsWith(resolve(directory)+'/'),'LAYOUT_PROOF_REQUIRED_FILE','Required native proof path must remain inside its original attempt');
  const f=byPath.get(relative(directory,resolve(directory,path)));
  need(f&&Number.isSafeInteger(f.bytes)&&f.bytes>0&&typeof f.sha256==='string'&&/^[a-f0-9]{64}$/.test(f.sha256),'LAYOUT_PROOF_REQUIRED_FILE',`Required nonempty native proof file missing at ${path}`);
  return f;
 };
 const match=(ref,file,countKey)=>{
  need(ref&&typeof ref.sha256==='string'&&/^[a-f0-9]{64}$/.test(ref.sha256)&&ref.sha256===file.sha256&&(!countKey||(Number.isSafeInteger(ref[countKey])&&ref[countKey]>0&&ref[countKey]===file.bytes)),'LAYOUT_PROOF_REFERENCE_CHANGED','Required native reference must match actual digest and byte evidence');
 };
 const hosts=new Map();
 const json=async path=>{
  const entry=required(path),raw=await checkedRead(root,join(directory,path),path==='output/build/object-coverage.json'?coverageLimit:limits.json,b);
  need(raw.length===entry.bytes&&layoutHash(raw)===entry.sha256,'LAYOUT_PROOF_CHANGED','Parsed native JSON must match the checked proof-tree bytes');
  const checked=path==='output/layout-manifest.json'?readNativeManifest(raw,{sha256:entry.sha256,bytes:entry.bytes}):null;
  const parsed=checked?checked.manifest:JSON.parse(raw);
  hosts.set(path,{originalPath:join(directory,path),sha256:entry.sha256,bytes:entry.bytes,raw:raw.toString('utf8'),parsed,...(checked?.transportVersion?{transportVersion:checked.transportVersion,original:checked.original}:{})});
  return parsed;
 };
 const resources=await checkedResources(root,{resources:expected.resources},b,initialPass);
 const nativeChild=await json('native-child.json');
 need(Number.isSafeInteger(nativeChild.pid)&&nativeChild.pid>0&&nativeChild.token===expected.attemptId&&nativeChild.host===expected.worker.host,'LAYOUT_NATIVE_OWNER_UNKNOWN','Original native child identity must precede effects');
 const ledger=await json('ledger.json'),manifest=await json('output/layout-manifest.json'),coverage=await json('output/build/object-coverage.json'),validation=await json('output/build/validation.json'),native=await json('native/verification.json'),pages=await json('native/review-manifest.json');
 const checkedLayout=hosts.get('output/layout-manifest.json'),transported=Boolean(checkedLayout.transportVersion),numeric=numericContentContract(manifest.semanticContent?.source);
 need((transported?a.protocol==='project-native-proof-v2':a.protocol==='project-native-proof-v1'),'LAYOUT_NATIVE_VERSION_TUPLE','Transport and anchor versions must match exactly');
 need(Object.hasOwn(a,'coverageSchemaVersion')===(transported&&numeric),'LAYOUT_NATIVE_VERSION_TUPLE','Transported numeric coverage requires its exact anchor discriminator');
 if(transported){
  const transport={sha256:checkedLayout.sha256,bytes:checkedLayout.bytes};
  need(coverage.schemaVersion==='native-object-coverage-v3'&&native.schemaVersion==='native-font-verification.v4'&&equal(coverage.layoutTransport,transport)&&equal(native.layoutTransport,transport)&&equal(coverage.layoutOriginal,checkedLayout.original)&&equal(native.layoutOriginal,checkedLayout.original)&&equal(pages.layoutTransport,transport)&&equal(pages.layoutOriginal,checkedLayout.original),'LAYOUT_NATIVE_VERSION_TUPLE','Coverage and fonts must bind encoded and expanded identities');
  need(coverage.semanticCoverageVersion===(numeric?'native-object-coverage-v2':'native-object-coverage-v1')&&native.semanticFontVersion===(numeric?'native-font-verification.v3':'native-font-verification.v2'),'LAYOUT_NATIVE_VERSION_TUPLE','Exact semantic report tuple required');
  if(numeric){
   checkNumericCoverage(coverage,{transportVersion:checkedLayout.transportVersion,transport,original:checkedLayout.original});
   within(b,3*(64*1024*1024+1)+2*(8*1024*1024+1)+4*(32*1024*1024+1));
   const {loadInput}=await import('../auto-layout/input.mjs');
   const {verifyNativeObjectCoverage}=await import('../auto-layout/native-charts/chart-export-binding.mjs');
   const inputBytes=async path=>{
    const descriptor=path===join(directory,'ledger.json')?{byteLength:required('ledger.json').bytes,sha256:expected.ledgerHash}:resources.descriptors.find(r=>r.path===path);
    need(descriptor,'LAYOUT_NATIVE_SOURCE_CHANGED','Nested input must be an original ledger or frozen resource');
    const raw=await checkedRead(root,path,Math.min(limits.json,descriptor.byteLength),b);
    need(raw.length===descriptor.byteLength&&layoutHash(raw)===descriptor.sha256,'LAYOUT_NATIVE_SOURCE_CHANGED','Nested input must retain original bounded bytes');
    return raw;
   };
   const input=await loadInput({ledger:join(directory,'ledger.json'),brand:resources.brand.path,assets:resources.assets.path},inputBytes);
   const plan=Object.fromEntries(['numericCompositionVersion','style','width','height','slides','decisions','placements','contentBinding','authority'].filter(k=>Object.hasOwn(manifest,k)).map(k=>[k,manifest[k]]));
   await json('output/build/native-chart-proof.json');
   const actual=verifyNativeObjectCoverage(join(directory,'output/delivery/deck.pptx'),input,plan,join(directory,'output/layout-manifest.json'),join(directory,'output/build/native-chart-proof.json'));
   need(equal(actual,coverage)&&native.regionCheckPassed===true&&native.expectation?.schemaVersion==='native-font-expectation.v3'&&equal(native.expectation.contentContract,manifest.semanticContent.source.contentContract)&&native.expectation?.chartProgramHash===coverage.chartProgramHash,'LAYOUT_NATIVE_NUMERIC_INVALID','Original source, package, workbook, coverage and regional font checks required');
  }
 }
 const hashOf=path=>required(path).sha256,deckFile=required('output/delivery/deck.pptx'),pdfFile=required('native/deck.pdf'),deck=deckFile.sha256,pdf=pdfFile.sha256,n=manifest.slides?.length;
 need(typeof expected.ledgerHash==='string'&&/^[a-f0-9]{64}$/.test(expected.ledgerHash),'LAYOUT_NATIVE_SOURCE_CHANGED','Required original ledger digest must be explicit');
 need(hashOf('ledger.json')===expected.ledgerHash&&JSON.stringify(manifest.semanticContent?.source)===JSON.stringify(ledger.source)&&JSON.stringify(manifest.semanticContent?.manuscript)===JSON.stringify(ledger.manuscript),'LAYOUT_NATIVE_SOURCE_CHANGED','Exact complete source and manuscript must survive export');
 need(Array.isArray(manifest.slides)&&n>0&&a.slides===n&&manifest.style===expected.style&&manifest.inputHashes?.ledger===expected.ledgerHash&&coverage.schemaVersion===(transported?'native-object-coverage-v3':'native-object-coverage-v1')&&coverage.deckSha256===deck&&coverage.manifestSha256===hashOf('output/layout-manifest.json')&&coverage.slideCount===n,'LAYOUT_NATIVE_COVERAGE_INVALID','Exact native XML coverage and source ledger required');
 need(validation.schemaVersion==='presentation-finalization.v1'&&validation.finalSha256===deck&&validation.firstPartyImport?.passed===true&&validation.firstPartyImport?.sha256===deck&&validation.firstPartyImport?.slideCount===n,'LAYOUT_NATIVE_PACKAGE_INVALID','Exact finalized package and import check required');
 need(native.schemaVersion===(transported?'native-font-verification.v4':'native-font-verification.v2')&&native.automationPassed===true&&Array.isArray(native.issues)&&native.issues.length===0&&native.checkedDeckSha256===deck&&native.outputs?.['deck.pdf']?.sha256===pdf&&Array.isArray(native.expectation?.pages)&&native.expectation.pages.length===n&&Array.isArray(native.evidence?.pages)&&native.evidence.pages.length===n&&native.visualInspection?.status==='pending'&&native.passed===false,'LAYOUT_NATIVE_FONT_INVALID','All native pages and exact font checks required without visual approval');
 need(pages.schemaVersion==='native-render-review-manifest.v1'&&pages.status==='complete'&&pages.pageCount===n&&Array.isArray(pages.pages)&&pages.pages.length===n&&pages.deck?.sha256===deck&&pages.pdf?.sha256===pdf&&pages.automation?.sha256===hashOf('native/verification.json')&&pages.visualInspection==='pending','LAYOUT_NATIVE_PAGES_INVALID','Complete original native page renders required');
 const verifyRef=(ref,path,countKey)=>{need(ref&&typeof ref.path==='string'&&resolve(ref.path)===resolve(directory,path),'LAYOUT_PROOF_REFERENCE_CHANGED','Required native reference path changed');match(ref,required(path),countKey);};
 verifyRef(pages.pdf,'native/deck.pdf','bytes');
 verifyRef(pages.automation,'native/verification.json','bytes');
 verifyRef(pages.deck,'native/inputs/deck.pptx','bytes');
 match(pages.deck,deckFile,'bytes');
 match(native.outputs['deck.pdf'],pdfFile,'byteCount');
 match(native.outputs['deck.pptx'],deckFile,'byteCount');
 const inputFiles={deck:'output/delivery/deck.pptx',layout:'output/layout-manifest.json',validation:'output/build/validation.json'};
 for(const [key,path] of Object.entries(inputFiles)){
  verifyRef(native.expectation.inputs?.[key],path,'byteCount');
  verifyRef(pages.inputs?.[key],path,'byteCount');
 }
 const brand=expected.resources?.find(r=>r.kind==='brand');
 need(brand&&typeof brand.path==='string'&&Number.isSafeInteger(brand.byteLength)&&brand.byteLength>0&&typeof brand.sha256==='string'&&/^[a-f0-9]{64}$/.test(brand.sha256),'LAYOUT_NATIVE_SOURCE_CHANGED','Original brand resource byte evidence required');
 const assets=expected.resources.find(r=>r.kind==='assets');
 need(manifest.inputHashes.brand===brand.sha256&&manifest.inputHashes.assets===assets.sha256,'LAYOUT_NATIVE_SOURCE_CHANGED','Native manifest must retain both original resource manifest digests');
 for(const [path,hash] of Object.entries(manifest.inputHashes.fonts??{}))need(typeof hash==='string'&&/^[a-f0-9]{64}$/.test(hash)&&expected.resources.some(r=>r.kind==='font'&&r.path===path&&r.sha256===hash),'LAYOUT_NATIVE_FONT_INVALID','Every manifest font digest must match an original resource');
 need(Object.keys(manifest.inputHashes.fonts??{}).length===Object.keys(native.expectation.fonts??{}).length,'LAYOUT_NATIVE_FONT_INVALID','Exact original font inventory must survive native verification');
 for(const image of Object.values(manifest.imageResources??{})){
  const resource=expected.resources.find(r=>r.path===image.file);
  need(resource&&typeof image.sha256==='string'&&/^[a-f0-9]{64}$/.test(image.sha256)&&image.sha256===resource.sha256&&Number.isSafeInteger(image.byteLength)&&image.byteLength>0&&image.byteLength===resource.byteLength,'LAYOUT_NATIVE_SOURCE_CHANGED','Every actual manifest image must match original resource bytes');
 }
 const fontPaths=(resources.brandData.font?.files??[]).map(path=>resolve(dirname(brand.path),path)).sort();
 need(fontPaths.length>0&&JSON.stringify(fontPaths)===JSON.stringify(Object.keys(manifest.inputHashes.fonts??{}).sort())&&JSON.stringify(fontPaths)===JSON.stringify(Object.keys(native.expectation.fonts??{}).sort()),'LAYOUT_NATIVE_FONT_INVALID','All original brand fonts require manifest digests and native snapshots');
 need(manifest.imageResources&&typeof manifest.imageResources==='object'&&!Array.isArray(manifest.imageResources)&&JSON.stringify(Object.keys(resources.assetData.assets??{}).sort())===JSON.stringify(Object.keys(manifest.imageResources).sort()),'LAYOUT_NATIVE_SOURCE_CHANGED','All original asset entries require exact native manifest image evidence');
 for(const [id,image] of Object.entries(manifest.imageResources))need(image.file===resolve(dirname(assets.path),resources.assetData.assets[id].file),'LAYOUT_NATIVE_SOURCE_CHANGED','Manifest image identity must retain its original asset path');
 for(const input of [native.expectation.inputs?.brand,pages.inputs?.brand]){need(input?.path===brand.path,'LAYOUT_NATIVE_SOURCE_CHANGED','Native brand input must be the original resource');match(input,{sha256:brand.sha256,bytes:brand.byteLength},'byteCount');}
 need(new Set(pages.pages.map(p=>p.page)).size===n&&pages.pages.every((p,i)=>p.page===i+1)&&native.expectation.pages.every((p,i)=>p.page===i+1)&&native.evidence.pages.every((p,i)=>p.page===i+1),'LAYOUT_NATIVE_PAGES_INVALID','Every native page must be present in original order');
 need(new Set(pages.pages.map(p=>p.image?.path)).size===n,'LAYOUT_NATIVE_PAGES_INVALID','Native pages must have distinct original image files');
 for(const page of pages.pages){need(typeof page.image?.path==='string','LAYOUT_NATIVE_PAGES_INVALID','Required native page image path missing');verifyRef(page.image,relative(directory,page.image.path),'bytes');}
 need(Array.isArray(manifest.renderPaths)&&manifest.renderPaths.length===n&&new Set(manifest.renderPaths).size===n,'LAYOUT_NATIVE_PAGES_INVALID','Every tool page must be anchored exactly once');
 for(const path of manifest.renderPaths){need(typeof path==='string'&&resolve(path)===path,'LAYOUT_NATIVE_PAGES_INVALID','Required absolute tool page path missing');required(relative(directory,path));}
 for(const [path,font] of Object.entries(native.expectation.fonts??{})){
  need(typeof font.snapshot==='string','LAYOUT_NATIVE_FONT_INVALID','Required original font snapshot missing');
  match(font,required(relative(directory,font.snapshot)));
  const original=expected.resources?.find(r=>r.kind==='font'&&r.path===path);
  need(original&&manifest.inputHashes.fonts?.[path]===font.sha256&&original.sha256===font.sha256&&original.byteLength===required(relative(directory,font.snapshot)).bytes,'LAYOUT_NATIVE_FONT_INVALID','Font snapshot must match original resource byte evidence');
  const bytes=await checkedRead(root,path,64*1024*1024,b);
  need(bytes.length===original.byteLength&&layoutHash(bytes)===original.sha256,'LAYOUT_NATIVE_FONT_INVALID','Actual original font bytes changed');
 }
 need(Object.keys(native.expectation.fonts??{}).length>0&&native.engineIdentity?.libreOffice&&pages.renderer?.pdfium,'LAYOUT_NATIVE_TOOLCHAIN_INVALID','Actual native engine and PDF renderer receipts required');
 const receipt={operation:'local-native-export',model:null,cost:null,costStatus:'unknown',attemptId:a.attemptId,bindingHash:a.bindingHash,style:a.style,anchorPath,anchorHash:layoutHash(bytes),deckHash:deck,pdfHash:pdf,slides:n,executionHash:a.executionHash,visualInspection:'pending',finalAuthorityAvailable:false};
 const fileIdentity=path=>{const f=required(path);return {originalPath:join(directory,path),sha256:f.sha256,bytes:f.bytes};};
 const resourceEnvelope=(r,contentText,parsed)=>({descriptor:r,contentText,parsed});
 const projection={
  anchor:{originalPath:anchorPath,sha256:layoutHash(bytes),bytes:bytes.length,raw:bytes.toString('utf8'),parsed:a},
  ledger:hosts.get('ledger.json'),layoutManifest:hosts.get('output/layout-manifest.json'),reviewManifest:hosts.get('native/review-manifest.json'),
  coverage:hosts.get('output/build/object-coverage.json'),validation:hosts.get('output/build/validation.json'),
  nativeVerification:hosts.get('native/verification.json'),nativeChild:hosts.get('native-child.json'),files,
  ...(numeric&&transported?{chartEvidence:hosts.get('output/build/native-chart-proof.json')}:{}),
  deliveryDeck:fileIdentity('output/delivery/deck.pptx'),nativeInputDeck:fileIdentity('native/inputs/deck.pptx'),pdf:fileIdentity('native/deck.pdf'),
  pageRenders:pages.pages.map(page=>({page,image:fileIdentity(relative(directory,page.image.path))})),
  assetsResource:resourceEnvelope(resources.assets,resources.assetText,resources.assetData),
  brandResource:resourceEnvelope(resources.brand,resources.brandText,resources.brandData)
 };
 const terminalDescriptors=expected.resources;
 need(JSON.stringify(terminalDescriptors)===JSON.stringify(resources.descriptors),'LAYOUT_RESOURCE_BYTES_CHANGED','Original resource descriptors changed during verification');
 const terminalPass=inventoryBudget();
 await checkedResources(root,{resources:resources.descriptors},b,terminalPass);
 const terminalFiles=await proofFiles(directory,{root,budget:b,pass:terminalPass,coverageLimit});
 need(JSON.stringify(terminalFiles)===JSON.stringify(files),'LAYOUT_PROOF_CHANGED','Native proof tree changed before projection return');
 const terminalAnchor=await checkedRead(root,anchorPath,32*1024*1024,b);
 need(terminalAnchor.length===bytes.length&&layoutHash(terminalAnchor)===layoutHash(bytes),'LAYOUT_ANCHOR_CHANGED','Native anchor changed before projection return');
 within(b);
 return {receipt,projection};
}
export async function verifyNativeAnchor(root,directory,expected){return (await checkedNativeAnchor(root,directory,expected)).receipt;}
export async function verifyNativeAnchorProjection(root,directory,expected){return checkedNativeAnchor(root,directory,expected);}
