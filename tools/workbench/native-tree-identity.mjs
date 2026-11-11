import {lstat,readlink,realpath,readdir,open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join,dirname,relative,parse,sep} from 'node:path';
import {sketchRequire as need} from './sketch-authority.mjs';
const MAX={files:40000,entries:100000,bytes:2*1024**3,depth:64,hops:64};
const CODE='LAYOUT_NATIVE_DEPENDENCY_CHANGED';
const absolute=p=>typeof p==='string'&&p.length>0&&p.length<=16384&&!p.includes('\0')&&resolve(p)===p;
const lexical=p=>typeof p==='string'&&p.startsWith('/')&&p.length<=16384&&!p.includes('\0');
const targetPath=(path,target)=>target.startsWith('/')?target:dirname(path)+'/'+target;
const contained=(p,root)=>p===root||p.startsWith(root+sep);
const mode=s=>Number(s.mode)&0o7777;
const keys=(v,expected)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===[...expected].sort().join('|');
const digest=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const number=n=>Number.isSafeInteger(n)&&n>=0;
const rel=p=>typeof p==='string'&&p.length>0&&!p.includes('\0')&&!p.includes('\\')&&!p.startsWith('/')&&p.split('/').every(x=>x&&x!=='.'&&x!=='..')&&p.split('/').length<=MAX.depth;
function bounded(counter,key,amount){counter[key]+=amount;need(counter[key]<=MAX[key],'LAYOUT_NATIVE_IDENTITY_LIMIT',`Native identity ${key} bound exceeded`);}
function sameStat(a,b){return a.dev===b.dev&&a.ino===b.ino&&a.size===b.size&&a.mode===b.mode&&a.mtimeNs===b.mtimeNs&&a.ctimeNs===b.ctimeNs;}
export function nativeIdentityBudget(){return {files:0,entries:0,bytes:0,hashed:new Map()};}
export async function nativeFileIdentity(path,budget=nativeIdentityBudget()){
 need(absolute(path),CODE,'Canonical absolute file path required');
 const before=await lstat(path,{bigint:true});
 need(before.isFile()&&!before.isSymbolicLink()&&before.size<=BigInt(Number.MAX_SAFE_INTEGER),CODE,'Native pin must be a regular file');
 const cached=budget.hashed.get(path);
 if(cached){need(sameStat(before,cached.stat),CODE,'Observed file changed within native identity read');return cached.value;}
 bounded(budget,'files',1);bounded(budget,'bytes',Number(before.size));
 const file=await open(path,'r'),hash=createHash('sha256'),buffer=Buffer.allocUnsafe(64*1024);let bytes=0;
 try{
  need(sameStat(before,await file.stat({bigint:true})),CODE,'Native file replaced before read');
  for(;;){const n=(await file.read(buffer,0,buffer.length,null)).bytesRead;if(!n)break;bytes+=n;need(bytes<=Number(before.size),CODE,'Native file grew during read');hash.update(buffer.subarray(0,n));}
  need(bytes===Number(before.size)&&sameStat(before,await file.stat({bigint:true}))&&sameStat(before,await lstat(path,{bigint:true})),CODE,'Native file replaced during read');
 }finally{await file.close();}
 const value={bytes,sha256:hash.digest('hex'),mode:mode(before)};budget.hashed.set(path,{stat:before,value});return value;
}
async function linkResolution(path,target){
 const lexicalTarget=targetPath(path,target),links=new Map(),pending=[lexicalTarget],visited=new Set();
 while(pending.length){
  const query=pending.shift();if(visited.has(query))continue;visited.add(query);
  const base=parse(query).root,components=query.slice(base.length).split(sep).filter(Boolean);let prefix=base;
  need(components.length<=MAX.depth,'LAYOUT_NATIVE_IDENTITY_LIMIT','External topology depth bound exceeded');
  for(const component of components){
   prefix=prefix.endsWith(sep)?prefix+component:prefix+sep+component;let s;
   try{s=await lstat(prefix,{bigint:true});}catch(error){if(error.code==='ENOENT')break;throw error;}
   if(s.isSymbolicLink()){
    const text=await readlink(prefix),old=links.get(prefix),record={path:prefix,target:text,mode:mode(s)};
    need(!old||JSON.stringify(old)===JSON.stringify(record),CODE,'External alias changed during observation');links.set(prefix,record);
    need(links.size<=MAX.hops,'LAYOUT_NATIVE_IDENTITY_LIMIT','Symbolic link observation bound exceeded');pending.push(targetPath(prefix,text));
   }
  }
 }
 let resolution;
 try{const canonicalPath=await realpath(path),s=await lstat(canonicalPath);need(s.isFile()||s.isDirectory(),CODE,'Unsupported symbolic target');resolution={state:'resolved',canonicalPath,targetKind:s.isFile()?'file':'directory'};}
 catch(error){if(error.code!=='ENOENT')throw error;resolution={state:'missing'};}
 for(const item of links.values()){const s=await lstat(item.path);need(s.isSymbolicLink()&&mode(s)===item.mode&&await readlink(item.path)===item.target,CODE,'External alias changed during observation');}
 return {...resolution,lexicalTarget,links:[...links.values()].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0)};
}
export async function exactTreeIdentity(directory,budget=nativeIdentityBudget()){
 need(absolute(directory)&&await realpath(directory)===directory,CODE,'Dependency root must be canonical');
 const rootStat=await lstat(directory);need(rootStat.isDirectory()&&!rootStat.isSymbolicLink(),CODE,'Dependency root must be a real directory');
 const entries=[{path:'.',kind:'directory',mode:mode(rootStat)}];bounded(budget,'entries',1);
 async function walk(dir,depth){
  need(depth<=MAX.depth,'LAYOUT_NATIVE_IDENTITY_LIMIT','Native tree depth bound exceeded');
  const directoryBefore=await lstat(dir,{bigint:true}),initial=await readdir(dir);
  for(const name of initial.sort()){
   const path=join(dir,name),info=await lstat(path,{bigint:true}),member=relative(directory,path);bounded(budget,'entries',1);
   if(info.isDirectory()){entries.push({path:member,kind:'directory',mode:mode(info)});await walk(path,depth+1);}
   else if(info.isFile())entries.push({path:member,kind:'file',...await nativeFileIdentity(path,budget)});
   else if(info.isSymbolicLink()){
    const target=await readlink(path),resolution=await linkResolution(path,target),after=await lstat(path,{bigint:true});
    need(sameStat(info,after)&&await readlink(path)===target,CODE,'Native symbolic link changed during read');entries.push({path:member,kind:'symlink',mode:mode(info),target,resolution});
   }else need(false,CODE,'Unsupported native tree member');
  }
  need(sameStat(directoryBefore,await lstat(dir,{bigint:true}))&&JSON.stringify(initial)===JSON.stringify((await readdir(dir)).sort()),CODE,'Native directory membership changed during observation');
 }
 await walk(directory,1);need(mode(await lstat(directory))===mode(rootStat),CODE,'Dependency root mode changed');
 entries.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);return {path:directory,format:'exact-tree-v2',entries};
}
function parseResolution(r){
 need(r&&['resolved','missing'].includes(r.state)&&keys(r,r.state==='resolved'?['state','canonicalPath','targetKind','lexicalTarget','links']:['state','lexicalTarget','links']),CODE,'Malformed symbolic resolution');
 need(lexical(r.lexicalTarget)&&Array.isArray(r.links)&&r.links.length<=MAX.hops,CODE,'Malformed symbolic topology');
 if(r.state==='resolved')need(absolute(r.canonicalPath)&&['file','directory'].includes(r.targetKind),CODE,'Malformed symbolic target');
 let prior='';for(const h of r.links){need(keys(h,['path','target','mode'])&&lexical(h.path)&&typeof h.target==='string'&&h.target.length>0&&h.target.length<=16384&&!h.target.includes('\0')&&number(h.mode)&&h.mode<=0o7777&&h.path>prior,CODE,'Malformed external alias');prior=h.path;}
}
export function parseExecutionV2(raw){
 const names=['node','engine','nativeCheck','python','soffice','bash','nativeRuntime','presentationsSkill'];
 need(raw&&Buffer.byteLength(JSON.stringify(raw))<=64*1024*1024,'LAYOUT_NATIVE_IDENTITY_LIMIT','Native configuration byte bound exceeded');
 need(keys(raw,['protocol','identitySemantics',...names,'files','dependencyRoots'])&&raw.protocol==='project-native-execution-v2'&&raw.identitySemantics==='complete-toolchain-trees-v2'&&names.every(k=>absolute(raw[k])),'LAYOUT_NATIVE_CONFIGURATION_REQUIRED','Exact versioned native configuration required');
 need(Array.isArray(raw.files)&&raw.files.length>0&&raw.files.length<=MAX.files&&Array.isArray(raw.dependencyRoots)&&raw.dependencyRoots.length>0&&raw.dependencyRoots.length<=MAX.entries,CODE,'Bounded native inventories required');
 const counter=nativeIdentityBudget(),pins=new Set();
 for(const f of raw.files){need(keys(f,['path','bytes','sha256','mode'])&&absolute(f.path)&&number(f.bytes)&&f.bytes>0&&digest(f.sha256)&&number(f.mode)&&f.mode<=0o7777&&!pins.has(f.path),CODE,'Malformed or duplicate native pin');pins.add(f.path);}
 need(names.slice(0,6).every(k=>pins.has(raw[k])),'LAYOUT_NATIVE_CONFIGURATION_REQUIRED','Every executable entry point requires a nonempty pin');
 const roots=[];
 for(const root of raw.dependencyRoots){
  need(keys(root,['path','format','entries'])&&absolute(root.path)&&root.format==='exact-tree-v2'&&Array.isArray(root.entries)&&root.entries.length>0&&!roots.some(p=>contained(p,root.path)||contained(root.path,p)),CODE,'Malformed duplicate or overlapping root');roots.push(root.path);
  let prior='';const dirs=new Set();
  for(const e of root.entries){
   bounded(counter,'entries',1);need(e&&typeof e.path==='string'&&(e.path==='.'||rel(e.path))&&e.path>prior&&number(e.mode)&&e.mode<=0o7777,CODE,'Malformed unsorted or duplicate tree member');prior=e.path;
   need(e.path==='.'||dirs.has(dirname(e.path)),CODE,'Tree members require exact directory ancestry');
   if(e.kind==='directory'){need(keys(e,['path','kind','mode']),CODE,'Malformed directory member');dirs.add(e.path);}
   else if(e.kind==='file'){need(keys(e,['path','kind','mode','bytes','sha256'])&&number(e.bytes)&&digest(e.sha256),CODE,'Malformed native file member');bounded(counter,'files',1);bounded(counter,'bytes',e.bytes);}
   else if(e.kind==='symlink'){need(keys(e,['path','kind','mode','target','resolution'])&&typeof e.target==='string'&&e.target.length>0&&e.target.length<=16384&&!e.target.includes('\0'),CODE,'Malformed symbolic member');parseResolution(e.resolution);need(e.resolution.lexicalTarget===targetPath(join(root.path,e.path),e.target),CODE,'Contradictory symbolic lexical target');}
   else need(false,CODE,'Unsupported expected member');
  }
  need(root.entries[0].path==='.'&&root.entries[0].kind==='directory',CODE,'Root directory identity required');
 }
 need(roots.includes(raw.nativeRuntime)&&roots.includes(raw.presentationsSkill),'LAYOUT_NATIVE_DEPENDENCIES_REQUIRED','Complete runtime and presentation roots required');
 for(const f of raw.files){const root=raw.dependencyRoots.find(r=>contained(f.path,r.path));if(root){const e=root.entries.find(e=>e.path===relative(root.path,f.path));need(e?.kind==='file'&&e.bytes===f.bytes&&e.sha256===f.sha256&&e.mode===f.mode,CODE,'Contradictory entry point and tree record');}else{bounded(counter,'files',1);bounded(counter,'bytes',f.bytes);}}
 for(const root of raw.dependencyRoots)for(const e of root.entries){const r=e.resolution;if(r?.state==='resolved')need(raw.dependencyRoots.some(x=>contained(r.canonicalPath,x.path))||(r.targetKind==='file'&&pins.has(r.canonicalPath)),'LAYOUT_NATIVE_DEPENDENCIES_REQUIRED','Resolved external targets require actual pin or complete root');}
 return raw;
}
export async function verifyExecutionV2Trees(raw){
 parseExecutionV2(raw);const budget=nativeIdentityBudget();
 for(const root of raw.dependencyRoots)need(JSON.stringify(await exactTreeIdentity(root.path,budget))===JSON.stringify(root),CODE,'Exact native tree identity changed');
 for(const f of raw.files)need(JSON.stringify(await nativeFileIdentity(f.path,budget))===JSON.stringify({bytes:f.bytes,sha256:f.sha256,mode:f.mode}),CODE,'Exact native file pin changed');
 return raw;
}
export async function buildNativeExecutionV2(paths){
 const names=['node','engine','nativeCheck','python','soffice','bash','nativeRuntime','presentationsSkill'];
 need(keys(paths,[...names,'extraFiles','extraRoots'])&&names.every(k=>absolute(paths[k]))&&Array.isArray(paths.extraFiles)&&paths.extraFiles.length<=MAX.files&&paths.extraFiles.every(absolute)&&Array.isArray(paths.extraRoots)&&paths.extraRoots.length<=MAX.entries&&paths.extraRoots.every(absolute),'LAYOUT_NATIVE_CONFIGURATION_REQUIRED','Explicit absolute configuration paths required');
 const budget=nativeIdentityBudget(),files=[],dependencyRoots=[];
 for(const path of [...new Set(names.slice(0,6).map(k=>paths[k]).concat(paths.extraFiles))].sort())files.push({path,...await nativeFileIdentity(path,budget)});
 for(const path of [...new Set([paths.nativeRuntime,paths.presentationsSkill,...paths.extraRoots])].sort())dependencyRoots.push(await exactTreeIdentity(path,budget));
 return parseExecutionV2({protocol:'project-native-execution-v2',identitySemantics:'complete-toolchain-trees-v2',...Object.fromEntries(names.map(k=>[k,paths[k]])),files,dependencyRoots});
}
