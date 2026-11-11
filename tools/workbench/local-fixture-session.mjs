import {open,readFile,readdir,realpath,lstat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {lstatSync,realpathSync} from 'node:fs';
import {normalizeLocalFixtureIdentity,requireMatchingLocalFixtureIdentity} from './local-fixture-identity.mjs';
const need=(ok,code)=>{if(!ok)throw Object.assign(Error(code),{code});};
const facts=new WeakMap();
const leaseName='.local-fixture.lease.sqlite';
async function regularPath(path,kind){try{const s=await lstat(path);need(!s.isSymbolicLink()&&(kind==='directory'?s.isDirectory():s.isFile()),'LOCAL_FIXTURE_PATH_INVALID');need(await realpath(path)===path,'LOCAL_FIXTURE_PATH_INVALID');}catch(e){if(e.code!=='ENOENT')throw e;}}
function expectedPaths(root){return {databasePath:join(root,'case-workflow.sqlite'),executionRoot:join(root,'case-executions'),editableResourceRoot:join(root,'resources')};}
const lockError=e=>/database is locked|database is busy/i.test(e.message??'')?Object.assign(Error('LOCAL_FIXTURE_ROOT_BUSY'),{code:'LOCAL_FIXTURE_ROOT_BUSY',cause:e}):e;
export async function openLocalFixtureSession({root,fixtureIdentity,launch}){
 const identity=normalizeLocalFixtureIdentity(fixtureIdentity);need(identity!==undefined,'LOCAL_FIXTURE_IDENTITY_REQUIRED');
 need(typeof root==='string'&&resolve(root)===root&&await realpath(root)===root,'LOCAL_FIXTURE_ROOT_INVALID');const rootStat=await lstat(root);need(rootStat.isDirectory()&&!rootStat.isSymbolicLink(),'LOCAL_FIXTURE_ROOT_INVALID');
 need(launch&&typeof launch==='object'&&!Array.isArray(launch)&&launch.root===root,'LOCAL_FIXTURE_LAUNCH_INVALID');requireMatchingLocalFixtureIdentity(launch,identity);const body=JSON.stringify(launch,null,2);need(typeof body==='string','LOCAL_FIXTURE_LAUNCH_INVALID');
 const lockPath=join(root,leaseName),launchPath=join(root,'LAUNCH.json'),initialNames=await readdir(root);let db,locked=false,closed=false,created=false;
 if(!initialNames.includes('LAUNCH.json'))need(initialNames.every(n=>n===leaseName),'LOCAL_FIXTURE_ROOT_NOT_EMPTY');
 else {await regularPath(launchPath,'file');need(initialNames.includes(leaseName),'LOCAL_FIXTURE_LEASE_INVALID');}
 if(initialNames.includes(leaseName+'-journal'))await regularPath(lockPath+'-journal','file');
 try{
  try{const f=await open(lockPath,'wx',0o600);await f.close();created=true;}catch(e){if(e.code!=='EEXIST')throw e;await regularPath(lockPath,'file');}
  const initialLease=await lstat(lockPath);need(initialLease.isFile()&&!initialLease.isSymbolicLink(),'LOCAL_FIXTURE_LEASE_INVALID');
  db=new DatabaseSync(lockPath);db.exec('PRAGMA busy_timeout=0;BEGIN EXCLUSIVE');locked=true;
  const lockedLease=await lstat(lockPath);need(lockedLease.dev===initialLease.dev&&lockedLease.ino===initialLease.ino&&lockedLease.isFile()&&!lockedLease.isSymbolicLink(),'LOCAL_FIXTURE_LEASE_INVALID');
  if(lockedLease.size===0&&!initialNames.includes('LAUNCH.json')){db.exec('PRAGMA application_id=1279673939; CREATE TABLE fixture_lease(protocol TEXT NOT NULL,dev TEXT NOT NULL,ino TEXT NOT NULL)');db.prepare('INSERT INTO fixture_lease VALUES(?,?,?)').run('local-fixture-lease-v2',String(lockedLease.dev),String(lockedLease.ino));db.exec('COMMIT; BEGIN EXCLUSIVE');}
  const app=db.prepare('PRAGMA application_id').get().application_id,tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();need(app===1279673939&&tables.length===1&&tables[0].name==='fixture_lease','LOCAL_FIXTURE_LEASE_INVALID');const rows=db.prepare('SELECT protocol,dev,ino FROM fixture_lease').all();need(rows.length===1&&rows[0].protocol==='local-fixture-lease-v2'&&rows[0].dev===String(lockedLease.dev)&&rows[0].ino===String(lockedLease.ino),'LOCAL_FIXTURE_LEASE_INVALID');
  const names=await readdir(root);if(!names.includes('LAUNCH.json')){need(!initialNames.includes(leaseName+'-journal')&&names.every(n=>n===leaseName||n===leaseName+'-journal'),'LOCAL_FIXTURE_ROOT_NOT_EMPTY');const f=await open(launchPath,'wx',0o400);try{await f.writeFile(body);await f.sync();}finally{await f.close();}}
  else{await regularPath(launchPath,'file');need(await readFile(launchPath,'utf8')===body,'LOCAL_FIXTURE_LAUNCH_CHANGED');}
  const assertOwnedSync=()=>{need(!closed,'LOCAL_FIXTURE_SESSION_CLOSED');let current,lease,canonical;try{current=lstatSync(root);canonical=realpathSync(root);lease=lstatSync(lockPath);}catch(e){throw Object.assign(Error('LOCAL_FIXTURE_ROOT_CHANGED'),{code:'LOCAL_FIXTURE_ROOT_CHANGED',cause:e});}need(current.isDirectory()&&!current.isSymbolicLink()&&current.dev===rootStat.dev&&current.ino===rootStat.ino&&canonical===root,'LOCAL_FIXTURE_ROOT_CHANGED');need(lease.isFile()&&!lease.isSymbolicLink()&&lease.dev===lockedLease.dev&&lease.ino===lockedLease.ino,'LOCAL_FIXTURE_LEASE_CHANGED');};
  const assertOwnedRoot=async()=>assertOwnedSync();
  await assertOwnedRoot();
  const paths=expectedPaths(root);for(const [name,path] of Object.entries(paths))await regularPath(path,name==='databasePath'?'file':'directory');for(const file of ['case-projects.sqlite','drafts.sqlite'])await regularPath(join(root,file),'file');
  const release=()=>{if(closed)return;closed=true;try{if(locked)db.exec('ROLLBACK');}finally{db.close();}};
  await assertOwnedRoot();
  return {assertOwnedRoot,admitRuntime:async args=>{need(!closed,'LOCAL_FIXTURE_SESSION_CLOSED');need(args&&typeof args.projectStore==='object'&&args.projectStore!==null&&typeof args.editableStore==='object'&&args.editableStore!==null,'LOCAL_FIXTURE_STORE_INVALID');for(const [key,path] of Object.entries(paths)){need(args[key]===path,'LOCAL_FIXTURE_PATH_INVALID');await regularPath(path,key==='databasePath'?'file':'directory');}await assertOwnedRoot();const fact=Object.freeze(Object.create(null));facts.set(fact,{identity,paths,projectStore:args.projectStore,editableStore:args.editableStore,isClosed:()=>closed,assertOwnedSync});return fact;},close:async()=>release()};
 }catch(error){try{if(locked)db.exec('ROLLBACK');}catch{}try{db?.close();}catch{}throw lockError(error);}
}
export function requireLocalFixtureAdmission(fact,expected){const f=facts.get(fact);need(f&&!f.isClosed(),'LOCAL_FIXTURE_ADMISSION_INVALID');f.assertOwnedSync();requireMatchingLocalFixtureIdentity({fixtureIdentity:expected?.fixtureIdentity},f.identity);need(expected.projectStore===f.projectStore&&expected.editableStore===f.editableStore&&Object.entries(f.paths).every(([key,value])=>expected[key]===value),'LOCAL_FIXTURE_ADMISSION_INVALID');return true;}
