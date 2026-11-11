import {readFile,lstat,realpath} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {normalizeLocalFixtureIdentity} from './local-fixture-identity.mjs';
const need=(ok,code)=>{if(!ok)throw Object.assign(Error(code),{code});};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const manifestURL=new URL('../../local-fixture-source-manifest.json',import.meta.url);
export function localFixtureProfileOf(profile){
 need(profile===undefined||profile==='case-aware-grouped-v1','LOCAL_CASE_PROFILE_UNKNOWN');return profile;
}
export async function localFixtureIdentityFor(profile){
 if(localFixtureProfileOf(profile)===undefined)return undefined;
 const stat=await lstat(manifestURL);need(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>0&&stat.size<=1024*1024,'LOCAL_FIXTURE_MANIFEST_INVALID');
 const bytes=await readFile(manifestURL);need(bytes.length===stat.size,'LOCAL_FIXTURE_MANIFEST_CHANGED');let manifest;try{manifest=JSON.parse(bytes);}catch{need(false,'LOCAL_FIXTURE_MANIFEST_INVALID');}
 need(manifest&&Object.keys(manifest).length===3&&manifest.protocol==='local-fixture-source-manifest-v1'&&manifest.fixtureProfile===profile&&Array.isArray(manifest.entries)&&manifest.entries.length>0&&manifest.entries.length<=1024,'LOCAL_FIXTURE_MANIFEST_INVALID');
 need(manifest.entries.every(entry=>entry!==null&&typeof entry==='object'&&!Array.isArray(entry)),'LOCAL_FIXTURE_MANIFEST_INVALID');
 const paths=manifest.entries.map(entry=>entry.path);need(new Set(paths).size===paths.length&&paths.includes('tools/workbench/local-fixture-descriptor.mjs')&&paths.includes('tools/workbench/local-fixture-profile.mjs'),'LOCAL_FIXTURE_MANIFEST_INVALID');let total=0;
 for(const entry of manifest.entries){
  need(entry&&Object.keys(entry).length===3&&typeof entry.path==='string'&&/^tools\/(?:workbench|auto-layout|local-acceptance)\/[a-zA-Z0-9_./-]+\.(?:mjs|js|json|py|sh|html|css)$/.test(entry.path)&&!entry.path.includes('//')&&!entry.path.split('/').some(part=>part==='.'||part==='..'||part==='node_modules')&&typeof entry.sha256==='string'&&/^[a-f0-9]{64}$/.test(entry.sha256)&&Number.isSafeInteger(entry.bytes)&&entry.bytes>=0&&entry.bytes<=4*1024*1024,'LOCAL_FIXTURE_MANIFEST_INVALID');
  total+=entry.bytes;need(total<=32*1024*1024,'LOCAL_FIXTURE_MANIFEST_INVALID');
  const url=new URL('../../'+entry.path,import.meta.url),fileStat=await lstat(fileURLToPath(url));need(fileStat.isFile()&&!fileStat.isSymbolicLink()&&fileStat.size===entry.bytes&&await realpath(fileURLToPath(url))===fileURLToPath(url),'LOCAL_FIXTURE_SOURCE_CHANGED');
  const file=await readFile(url);need(file.length===entry.bytes&&sha(file)===entry.sha256,'LOCAL_FIXTURE_SOURCE_CHANGED');
 }
 return normalizeLocalFixtureIdentity({protocol:'local-fixture-identity-v1',fixtureProfile:profile,closureHash:sha(bytes)});
}
