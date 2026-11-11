import {coveragePolicy,coverageOutputLimit,checkNumericCoverage} from '../auto-layout/native-coverage-policy.mjs';
import {numericContentContract} from './content-contract-versions.mjs';
import {readManagedLayoutBytes} from './managed-layout-bytes.mjs';
import {readNativeManifestFile} from '../auto-layout/native-manifest.mjs';
import {readFile,writeFile,open} from 'node:fs/promises';
import {fork,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {hostname} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {verifyExecutionPins,verifyNativeResources,writeNativeAnchor} from './layout-native-proof.mjs';
import {layoutHash} from './layout-boundary.mjs';
const config=JSON.parse(await readFile(process.argv[2],'utf8'));
const worker={pid:process.pid,host:hostname(),token:config.attemptId};
let started=false;
process.on('disconnect',()=>{if(!started)process.exit(0);});
async function durable(path,value){const h=await open(path,'wx');try{await h.writeFile(JSON.stringify(value));await h.sync();}finally{await h.close();}}
process.on('message',async message=>{
 if(started||message?.token!==config.attemptId)return;
 started=true;
 try{
  if(process.argv[3]==='native'){
   const {stdout,stderr}=await promisify(execFile)(config.execution.bash,[config.execution.nativeCheck,config.deck,config.native,'--brand',config.brand,'--layout',config.manifest,'--validation',config.validation,...(config.chartEvidence?['--ledger',join(config.directory,'ledger.json'),'--assets',config.assets,'--chart-evidence',config.chartEvidence]:[])],{env:{...process.env,CODEX_NATIVE_RUNTIME:config.execution.nativeRuntime,NATIVE_CHECK_PYTHON:config.execution.python,NATIVE_CHECK_SOFFICE:config.execution.soffice,NATIVE_CHECK_AUTHOR_TASK_ID:config.attemptId},maxBuffer:8*1024*1024});
   await writeFile(join(config.directory,'native-command.log'),stdout+stderr);process.send?.({done:true});process.disconnect?.();return;
  }
  await verifyExecutionPins(config.execution);const resources=await verifyNativeResources(config.root,config.binding);
  const {buildDeck}=await import(pathToFileURL(config.execution.engine).href);
  const result=await buildDeck({ledger:join(config.directory,'ledger.json'),...resources,style:config.style,output:join(config.directory,'output')});
  const nativeConfig={...config,deck:result.deckPath,native:join(config.directory,'native'),brand:resources.brand,assets:resources.assets,chartEvidence:result.nativeChartProofPath,manifest:result.manifestPath,validation:result.validationPath};
  const nativeRequest=join(config.directory,'native-request.json');await durable(nativeRequest,nativeConfig);
  await new Promise((resolve,reject)=>{
   const child=fork(fileURLToPath(import.meta.url),[nativeRequest,'native'],{execPath:config.execution.node,stdio:['ignore','inherit','inherit','ipc'],env:process.env});
   let permitted=false;
   child.on('message',async message=>{if(!message.ready||permitted)return;try{await durable(join(config.directory,'native-child.json'),message.ready);permitted=true;child.send({token:config.attemptId});}catch(error){child.disconnect();reject(error);}});
   child.on('error',reject);child.on('exit',(code,signal)=>code===0&&!signal&&permitted?resolve():reject(new Error('Original native child did not complete')));
  });
  await verifyExecutionPins(config.execution);await verifyNativeResources(config.root,config.binding);
  const checkedManifest=readNativeManifestFile(result.manifestPath);
  const numeric=numericContentContract(checkedManifest.manifest.semanticContent?.source);
  const coverage=JSON.parse(await readManagedLayoutBytes(config.root,result.objectCoveragePath,checkedManifest.transportVersion&&numeric?coverageOutputLimit(checkedManifest):64*1024*1024)),font=JSON.parse(await readManagedLayoutBytes(config.root,join(config.directory,'native/verification.json'),64*1024*1024));
  if(numeric)checkNumericCoverage(coverage,checkedManifest);
  if(checkedManifest.transportVersion&&!(coverage.schemaVersion==='native-object-coverage-v3'&&font.schemaVersion==='native-font-verification.v4'&&font.automationPassed===true))throw new Error('NATIVE_MANIFEST_RECEIPT_TUPLE');
  await writeNativeAnchor(config.directory,{protocol:checkedManifest.transportVersion?'project-native-proof-v2':'project-native-proof-v1',...(checkedManifest.transportVersion&&numeric?{coverageSchemaVersion:coveragePolicy.completeVersion}:{}),bindingHash:config.bindingHash,attemptId:config.attemptId,style:config.style,worker,executionHash:layoutHash(config.execution),slides:result.slides});
  process.send?.({anchored:true});process.disconnect?.();
 }catch(error){await writeFile(join(config.directory,'failure.json'),JSON.stringify({code:error.code??'LAYOUT_NATIVE_EXECUTION_UNKNOWN',message:error.message}));process.exitCode=1;process.disconnect?.();}
});
process.send?.({ready:worker});
