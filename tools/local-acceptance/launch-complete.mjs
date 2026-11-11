import {localFixtureProfileOf,localFixtureIdentityFor} from '../workbench/local-fixture-descriptor.mjs';
import {openLocalFixtureSession} from '../workbench/local-fixture-session.mjs';
import {referenceRuntimeProfileOf,LOCAL_REFERENCE_POOL_RUNTIME} from '../workbench/local-reference-runtime-profile.mjs';
import {mkdir,readFile,writeFile,realpath,statfs,lstat} from 'node:fs/promises';
import {join,resolve,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomBytes} from 'node:crypto';
import {once} from 'node:events';
const need=(v,code)=>{if(!v)throw Object.assign(Error(code),{code});};
const sha=b=>createHash('sha256').update(b).digest('hex');
const forbiddenPorts=new Set([4280,4380,4390]);
const shutdowns=new WeakMap();
export function completeLaunchOptions(env=process.env,cwd=process.cwd()){
 const referenceRuntimeProfile=referenceRuntimeProfileOf(env.LOCAL_COMPLETE_REFERENCE_PROFILE);
 const fixtureProfile=localFixtureProfileOf(env.LOCAL_COMPLETE_FIXTURE_PROFILE);
 const nativeConfigPath=env.LOCAL_COMPLETE_NATIVE_CONFIG;
 need(typeof nativeConfigPath==='string'&&isAbsolute(nativeConfigPath),'LOCAL_COMPLETE_NATIVE_CONFIG_PATH_REQUIRED');
 const port=Number(env.LOCAL_COMPLETE_PORT??(fixtureProfile?4470:referenceRuntimeProfile===LOCAL_REFERENCE_POOL_RUNTIME?4460:4450)),imagePort=Number(env.LOCAL_COMPLETE_IMAGE_PORT??(fixtureProfile?4471:referenceRuntimeProfile===LOCAL_REFERENCE_POOL_RUNTIME?4461:4451));
 need([port,imagePort].every(n=>Number.isSafeInteger(n)&&n>=1024&&n<=65535&&!forbiddenPorts.has(n))&&port!==imagePort,'LOCAL_COMPLETE_PORT_INVALID');
 const dataRoot=resolve(cwd,env.LOCAL_COMPLETE_DATA_ROOT??(fixtureProfile?'.data/local-complete-case-fixture-v1':referenceRuntimeProfile===LOCAL_REFERENCE_POOL_RUNTIME?'.data/local-complete-acceptance-pool-v2':'.data/local-complete-acceptance'));
 return {nativeConfigPath,dataRoot,port,imagePort,...(fixtureProfile?{fixtureProfile}:{}),host:'127.0.0.1',...(referenceRuntimeProfile===LOCAL_REFERENCE_POOL_RUNTIME?{referenceRuntimeProfile}:{})};
}
export async function completeHeadroom(root){const f=await statfs(root,{bigint:true});need(f.bavail*f.bsize>=3n*1024n**3n,'LOCAL_COMPLETE_DISK_HEADROOM');}
export function guardCompletePipeline(pipeline,check){
 return {...pipeline,...Object.fromEntries(['create','advance','decide','uploadReference','submitReferenceMaterial','withdrawReferenceMaterial'].filter(method=>typeof pipeline[method]==='function').map(method=>[method,async(...args)=>{await check();return pipeline[method](...args);}]))};
}
export async function closeCompleteOwned(owned){
 if(owned.fixtureSession){
  let state=shutdowns.get(owned);if(!state){state={done:new Set(),pending:null};shutdowns.set(owned,state);}
  if(state.pending)return state.pending;
  const steps=[
   ['app',async()=>{if(owned.app?.server?.listening)await owned.app.close();need(!owned.app?.server?.listening,'LOCAL_COMPLETE_LISTENER_STILL_ACTIVE');}],
   ['image',async()=>{if(owned.imageServer?.listening)await new Promise((resolve,reject)=>owned.imageServer.close(e=>e?reject(e):resolve()));need(!owned.imageServer?.listening,'LOCAL_COMPLETE_IMAGE_LISTENER_STILL_ACTIVE');}],
   ['pipeline',()=>owned.pipeline?.close()],['project',()=>owned.projectStore?.close()],['editable',()=>owned.editableStore?.close()],['lease',()=>owned.fixtureSession.close()],
  ];
  state.pending=(async()=>{try{for(const [key,close] of steps){if(state.done.has(key))continue;await close();state.done.add(key);}}catch(e){throw new AggregateError([e],'LOCAL_COMPLETE_CLEANUP_FAILED');}})();
  try{return await state.pending;}finally{state.pending=null;}
 }
 const errors=[];
 for(const close of [()=>owned.app?.server?.listening?owned.app.close():undefined,()=>owned.imageServer?.listening?new Promise((resolve,reject)=>owned.imageServer.close(e=>e?reject(e):resolve())):undefined,()=>owned.pipeline?.close(),()=>owned.projectStore?.close(),()=>owned.editableStore?.close(),()=>owned.fixtureSession?.close()])try{await close();}catch(e){errors.push(e);}
 if(errors.length)throw new AggregateError(errors,'LOCAL_COMPLETE_CLEANUP_FAILED');
}
export async function launchComplete(options,{signal}={}){
 const referenceRuntimeProfile=referenceRuntimeProfileOf(options.referenceRuntimeProfile);
 const fixtureProfile=localFixtureProfileOf(options.fixtureProfile),fixtureIdentity=await localFixtureIdentityFor(fixtureProfile);
 const checkStop=()=>need(!signal?.aborted,'LOCAL_COMPLETE_START_CANCELLED');checkStop();
 // No import starts a listener. Original module APIs are loaded only by the actual launcher.
 const [{openStore},{openEditableProposalStore},{openCompleteLocalAcceptance},{createLocalAcceptanceServer},{createSyntheticImageServer},{localLayoutToolStatus}]=await Promise.all([import('../workbench/store.mjs'),import('../auto-layout/editable-proposal.mjs'),import('../workbench/local-complete-acceptance.mjs'),import('./server.mjs'),import('./synthetic-image-server.mjs'),import('../workbench/local-layout-resource-bridge.mjs')]);
 const owned={};let closing;
 const close=()=>{owned.stopping=true;return closing??=(async()=>{try{await closeCompleteOwned(owned);}catch(error){closing=undefined;throw error;}})();};
 try{
  const configInfo=await lstat(options.nativeConfigPath);need(configInfo.isFile()&&configInfo.size>0&&configInfo.size<=1024*1024,'LOCAL_COMPLETE_CONFIG_LIMIT');const configBytes=await readFile(options.nativeConfigPath);need(configBytes.length<=1024*1024,'LOCAL_COMPLETE_CONFIG_LIMIT');
  let config;try{config=JSON.parse(configBytes);}catch{throw Object.assign(Error('LOCAL_COMPLETE_CONFIG_JSON_INVALID'),{code:'LOCAL_COMPLETE_CONFIG_JSON_INVALID'});}need(config&&Object.keys(config).every(k=>['tools','fontRecords'].includes(k)),'LOCAL_COMPLETE_CONFIG_FIELDS_INVALID');
  need((await localLayoutToolStatus(config.tools)).status==='configured'&&Array.isArray(config.fontRecords)&&config.fontRecords.length>0,'LOCAL_COMPLETE_NATIVE_RESOURCES_REQUIRED');
  for(const f of config.fontRecords){need(f&&isAbsolute(f.path)&&/^[a-f0-9]{64}$/.test(f.sha256),'LOCAL_COMPLETE_FONT_REQUIRED');const p=await realpath(f.path),info=await lstat(p);need(p===f.path&&info.isFile()&&info.size>0&&info.size<=64*1024*1024,'LOCAL_COMPLETE_FONT_REQUIRED');const bytes=await readFile(p);need(sha(bytes)===f.sha256&&(f.byteLength===undefined||f.byteLength===bytes.length),'LOCAL_COMPLETE_FONT_CHANGED');}
  await mkdir(options.dataRoot,{recursive:true,mode:0o700});const root=await realpath(options.dataRoot);need(root===options.dataRoot,'LOCAL_COMPLETE_CANONICAL_ROOT_REQUIRED');await completeHeadroom(root);
  const executionRoot=join(root,'case-executions'),editableResourceRoot=join(root,'resources');
  const frozen={protocol:'local-complete-launch-v1',root,host:'127.0.0.1',port:options.port,imagePort:options.imagePort,configHash:sha(configBytes),fontPath:config.fontRecords[0].path,...(referenceRuntimeProfile===LOCAL_REFERENCE_POOL_RUNTIME?{referenceRuntimeProfile}:{}),...(fixtureIdentity?{fixtureIdentity}:{})};
  if(fixtureIdentity)owned.fixtureSession=await openLocalFixtureSession({root,fixtureIdentity,launch:frozen});
  for(const p of [executionRoot,editableResourceRoot]){await mkdir(p,{recursive:true,mode:0o700});need(await realpath(p)===p,'LOCAL_COMPLETE_CANONICAL_ROOT_REQUIRED');}
  const launchFile=join(root,'LAUNCH.json'),body=JSON.stringify(frozen,null,2);if(!fixtureIdentity){try{await writeFile(launchFile,body,{flag:'wx',mode:0o400});}catch(e){if(e.code!=='EEXIST')throw e;need((await readFile(launchFile,'utf8'))===body,'LOCAL_COMPLETE_FROZEN_CONFIG_CHANGED');}}
  if(fixtureIdentity){await owned.fixtureSession.assertOwnedRoot();for(const name of ['case-projects.sqlite','drafts.sqlite','case-workflow.sqlite']){const file=join(root,name);try{const info=await lstat(file);need(info.isFile()&&!info.isSymbolicLink()&&info.nlink===1&&await realpath(file)===file,'LOCAL_FIXTURE_DATABASE_PATH_INVALID');}catch(error){if(error.code!=='ENOENT')throw error;}}}
  checkStop();owned.projectStore=openStore(join(root,'case-projects.sqlite'));
  owned.editableStore=await openEditableProposalStore({databasePath:join(root,'drafts.sqlite'),resourceRoot:editableResourceRoot});
  const fixtureAdmission=fixtureIdentity?await owned.fixtureSession.admitRuntime({projectStore:owned.projectStore,editableStore:owned.editableStore,databasePath:join(root,'case-workflow.sqlite'),executionRoot,editableResourceRoot}):undefined;
  checkStop();const token=randomBytes(32).toString('hex');
  owned.imageServer=createSyntheticImageServer({token,fontPath:config.fontRecords[0].path});owned.imageServer.listen(options.imagePort,'127.0.0.1');await once(owned.imageServer,'listening');
  checkStop();const composed=await openCompleteLocalAcceptance({databasePath:join(root,'case-workflow.sqlite'),projectStore:owned.projectStore,editableStore:owned.editableStore,executionRoot,editableResourceRoot,localImageService:{baseUrl:`http://127.0.0.1:${options.imagePort}/v1`,token},tools:config.tools,fontRecords:config.fontRecords,referenceRuntimeProfile,...(fixtureIdentity?{fixtureProfile,fixtureAdmission}:{})});owned.pipeline=composed.pipeline;
  const beforeMutation=async()=>{need(!owned.stopping,'LOCAL_COMPLETE_CLOSING');if(owned.fixtureSession)await owned.fixtureSession.assertOwnedRoot();await completeHeadroom(root);};
  checkStop();const pipeline=guardCompletePipeline(owned.pipeline,beforeMutation);
  owned.app=await createLocalAcceptanceServer({store:owned.editableStore,rootDir:root,pipeline,...(fixtureIdentity?{beforeMutation}:{})});
  checkStop();const url=await owned.app.listen(options.port);checkStop();
  return {metadata:{url,imageServiceUrl:`http://127.0.0.1:${options.imagePort}/v1`,root,referenceRuntimeProfile,...(fixtureIdentity?{fixtureIdentity}:{}),nativeConfigHash:frozen.configHash,engineeringOnly:true,syntheticOnly:true,allStagesWired:true,declaredModules:composed.declaredModules,wholeChainVerified:false,realQualityVerified:false,productionFinalAuthority:false,browserVerified:false,editorFixtureCreated:false},close};
 }catch(e){try{await close();}catch(cleanup){e.cleanupCode=cleanup.message;}throw e;}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 let app,stopped=false;const controller=new AbortController();
 const stop=()=>{if(stopped)return;stopped=true;controller.abort();if(app)app.close().catch(e=>{console.error(e.code??e.message);process.exitCode=1;});};
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,stop);
 try{app=await launchComplete(completeLaunchOptions(),{signal:controller.signal});if(stopped)await app.close();else console.log(JSON.stringify(app.metadata));}
 catch(e){console.error(JSON.stringify({error:e.code??'LOCAL_COMPLETE_START_FAILED',message:e.message,cleanupCode:e.cleanupCode??null,engineeringOnly:true}));process.exitCode=1;}
}
