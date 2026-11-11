import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir,hostname} from 'node:os';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFinalContinuation,validateFinalContinuationStart,assertFinalContinuationResume} from './local-final-content-continuation.mjs';
import {finalContentOptions} from './local-final-content-runner.mjs';
import {finalPanelNodes} from './final-visual.mjs';
import {recoveryHash,finalRecoveryBaseline} from './local-final-content-recovery.mjs';
const digest=b=>createHash('sha256').update(b).digest('hex');
async function pin(path){const b=await readFile(path);return {path,sha256:digest(b),byteLength:b.length};}
function projectFixture(){
 const finalKinds=['final_visual_plan',...Array(3).fill('final_visual_image'),...finalPanelNodes().map(()=> 'final_visual_review'),'final_visual_aggregate'];
 const jobs=finalKinds.map((purpose,i)=>({id:'final-'+i,purpose,finalVisualRunId:'run',status:'succeeded',binding:{providerId:purpose==='final_visual_image'?'local-synthetic-image':'local-synthetic',model:purpose==='final_visual_image'?'local-synthetic-image-v1':'synthetic'},outputVersionIds:['out-'+i],allowanceFamilyId:'family',attempts:[{id:'attempt-'+i,status:'succeeded',dispatchStarted:true,allowanceFamilyId:'family',receipt:purpose==='final_visual_image'?{outcome:'output_received',responseEvidence:{sha256:'a'.repeat(64)}}:{responseText:'Synthetic original only'}}]}));
 jobs.push(...Array.from({length:9},(_,i)=>({id:'sketch-'+i,purpose:'image_candidate',status:'succeeded',allowanceFamilyId:'family',attempts:[{dispatchStarted:true,allowanceFamilyId:'family'}]})));
 return {id:'p',revision:10,activeByStage:{copy:'copy',sketch:'sketch'},activeTaskCardId:'task',decisions:[],jobs,artifacts:[{id:'copy',stage:'copy'},{id:'sketch',stage:'sketch'}],finalVisualRuns:[{id:'run',reports:[]}],imageAllowance:{id:'family',maxCalls:12},finalVisualAllowance:{maxImageCalls:12,maxReviewCalls:40},taskCards:[{id:'task'}],policies:[{version:1}],imageAssets:[]};
}
async function fixture(t,mutations={}){
 const root=await realpath(await mkdtemp(join(tmpdir(),'final-continuation-')));t.after(()=>rm(root,{recursive:true,force:true}));const moduleRoot=join(root,'workbench'),workRoot=join(root,'case'),archiveRoot=join(root,'parent-archives');for(const p of [moduleRoot,workRoot,archiveRoot])await mkdir(p);
 async function file(path,bytes){await writeFile(path,bytes);return {path,sha256:digest(bytes),byteLength:Buffer.byteLength(bytes)};}
 const runnerPath=join(moduleRoot,'local-final-content-runner.mjs'),driverPath=join(moduleRoot,'local-acceptance-final-visual-driver.mjs'),originalPath=join(moduleRoot,'final-visual-original.mjs'),helperPath=join(moduleRoot,'local-final-content-recovery.mjs');
 const runner1=await file(join(root,'runner1'),'runner1'),runner2=await file(runnerPath,'runner2'),original1=await file(join(root,'original1'),'original1'),original2=await file(originalPath,'original2'),driver2=await file(driverPath,'driver2'),helper=await file(helperPath,'helper2');
 const owner=Number(execFileSync(process.execPath,['-e','process.stdout.write(String(process.pid))'],{encoding:'utf8'})),identity={projectId:'p',caseId:'m6'},configuration={engineeringOnly:true},p1=projectFixture(),v1={protocol:'local-final-content-plain-run-v1',status:'blocked',currentStage:'visual',state:{status:'blocked',reason:'LAYOUT_MANAGED_BYTES_REQUIRED'},writerPid:owner,host:hostname(),actionsTotal:19,lastRevision:p1.revision,baselineDecisionCount:0,sourceIdentity:identity,configuration,codePins:[{...runner1,path:runnerPath},{...original1,path:originalPath},driver2]};
 mutations.v1?.(v1);
 const oldMeta1=await file(join(workRoot,'FINAL_CONTENT_RUNNER.json'),JSON.stringify(v1)),oldIntent1=await file(join(workRoot,'final-content-intent.json'),JSON.stringify(v1));
 const parent={protocol:'local-final-reader-transition-v1',caseId:'m6',projectId:'p',workRoot,moduleRoot,host:hostname(),previousPid:owner,priorActions:19,configurationHash:recoveryHash(configuration),oldMeta:oldMeta1,oldIntent:oldIntent1,baseline:finalRecoveryBaseline(p1),changes:[{path:runnerPath,old:runner1,current:runner2},{path:originalPath,old:original1,current:original2}],addition:helper};
 const parentPin=await file(join(root,'parent.json'),JSON.stringify(parent));const p2=structuredClone(p1);p2.revision+=2;p2.activeByStage.visual='visual';p2.artifacts.push({id:'visual',contentHash:'visual-hash'});p2.releases=[{artifactId:'visual'}];
 const oldPins=[runner2,original2,driver2,helper],meta2={protocol:'local-final-content-plain-run-v2',status:'blocked',currentStage:'visual',state:{status:'blocked',reason:'ARTIFACT_UNAVAILABLE'},writerPid:owner,host:hostname(),actionsTotal:20,lastRevision:p2.revision,baselineDecisionCount:0,sourceIdentity:{...identity,basePins:[]},configuration,codePins:oldPins,sourceTransition:{path:parentPin.path,sha256:parentPin.sha256,priorActions:19,previousPid:owner}},intent2={...meta2,actionsTotal:19};v1.sourceIdentity=meta2.sourceIdentity;await file(oldMeta1.path,JSON.stringify(v1));await file(oldIntent1.path,JSON.stringify(v1));parent.oldMeta=await pin(oldMeta1.path);parent.oldIntent=await pin(oldIntent1.path);const updatedParent=await file(parentPin.path,JSON.stringify(parent));meta2.sourceTransition.sha256=updatedParent.sha256;intent2.sourceTransition=meta2.sourceTransition;
 mutations.v2?.(meta2);mutations.intent?.(intent2);
 const oldMeta=await file(join(workRoot,'FINAL_CONTENT_RUNNER_V2.json'),JSON.stringify(meta2)),oldIntent=await file(join(workRoot,'final-content-v2-intent.json'),JSON.stringify(intent2));
 const rows=[updatedParent,oldMeta,oldIntent,parent.oldMeta,parent.oldIntent,...oldPins,...v1.codePins,...parent.changes.flatMap(c=>[c.old,c.current]),helper],entries=[],seen=new Set();for(const logical of rows){const key=logical.path+'\0'+logical.sha256+'\0'+logical.byteLength;if(seen.has(key))continue;seen.add(key);const change=parent.changes.find(c=>c.path===logical.path&&c.old.sha256===logical.sha256),source=change?change.old.path:logical.path,bytes=await readFile(source);assert.equal(digest(bytes),logical.sha256);const saved=await file(join(archiveRoot,logical.sha256+'.bin'),bytes);entries.push({...logical,archive:saved});}
 const bundle={protocol:'local-final-historical-parent-bundle-v1',caseId:'m6',projectId:'p',workRoot,moduleRoot,executionAuthority:false,parentTransition:updatedParent,oldMeta,oldIntent,entries};const bundlePin=await file(join(root,'bundle.json'),JSON.stringify(bundle));
 const currentRunner=await file(runnerPath,'runner3'),currentDriver=await file(driverPath,'driver3'),addition=await file(join(moduleRoot,'local-final-content-continuation.mjs'),'continuation helper');
 const transition={protocol:'local-final-reader-continuation-v1',caseId:'m6',projectId:'p',workRoot,moduleRoot,host:hostname(),previousPid:owner,priorActions:20,configurationHash:recoveryHash(configuration),baseline:finalRecoveryBaseline(p2),visual:{artifactId:'visual',contentHash:'visual-hash'},parentBundle:bundlePin,changes:[{path:runnerPath,old:runner2,current:currentRunner},{path:driverPath,old:driver2,current:currentDriver}],addition};
 async function save(value=transition){const path=join(root,'continuation.json'),record=await file(path,JSON.stringify(value));return {...record,workRoot,moduleRoot,runnerPath};}
 return {root,workRoot,moduleRoot,runnerPath,transition,bundle,p1,p2,configuration,identity:meta2.sourceIdentity,save};
}

test('exact historical archive plus current V3 pair admits existing visual without resetting native history',async t=>{
 const f=await fixture(t),profile=await readFinalContinuation(await f.save());
 const store={read:(_id,rev)=>rev===f.p1.revision?f.p1:f.p2};
 await validateFinalContinuationStart(profile,store,{identity:f.identity,configuration:f.configuration,initial:true});
 assert.equal(profile.transition.priorActions,20);assert.equal(profile.transition.baseline.inventory.imageCalls,3);
 await assert.rejects(()=>validateFinalContinuationStart(profile,store,{identity:f.identity,configuration:{wrong:true},initial:true}),{code:'FINAL_CONTINUATION_CONFIG_CHANGED'});
});
test('explicit source families cannot be mixed and new resume never rewrites completion or rolls counters back',()=>{
 const a={mode:'start',workRoot:'/case',sketchPid:123,continuationPath:'/permit',continuationHash:'a'.repeat(64)};assert.doesNotThrow(()=>finalContentOptions(a));assert.throws(()=>finalContentOptions({...a,sourceTransitionPath:'/old',sourceTransitionHash:'b'.repeat(64)}),{code:'FINAL_CONTINUATION_REQUIRED'});
 const profile={path:'/p',sha256:'a'.repeat(64),transition:{priorActions:20,baseline:{decisionCount:2}}},meta={protocol:'local-final-content-plain-run-v3',status:'paused',sourceTransition:{path:'/p',sha256:'a'.repeat(64),priorActions:20},baselineDecisionCount:2,actionsTotal:21};assert.doesNotThrow(()=>assertFinalContinuationResume(meta,profile));for(const patch of [{actionsTotal:19},{actionsTotal:101},{actionsTotal:NaN},{baselineDecisionCount:0},{status:'complete'}])assert.throws(()=>assertFinalContinuationResume({...meta,...patch},profile));
});
test('wrong immutable identity, budget baseline, changed path and source fail closed',async t=>{
 const f=await fixture(t);
 for(const change of [v=>v.caseId='dexian',v=>v.priorActions=0,v=>v.previousPid=process.pid,v=>v.configurationHash='0'.repeat(64),v=>v.changes.push({...v.changes[0],path:join(f.moduleRoot,'project.mjs')})]){const v=structuredClone(f.transition);change(v);await assert.rejects(()=>f.save(v).then(readFinalContinuation));}
 const input=await f.save();await writeFile(f.transition.changes[0].current.path,'RUNNER3');await assert.rejects(()=>readFinalContinuation(input),{code:'FINAL_CONTINUATION_PIN_CHANGED'});
});

test('historical host, stage, state, decision and V2 intent protections survive archive rebinding',async t=>{
 for(const mutations of [
  {v1:v=>v.host='different-host'},
  {v1:v=>v.currentStage='content'},
  {v1:v=>v.state.status='complete'},
  {v1:v=>v.baselineDecisionCount=9},
  {v2:v=>v.state.status='complete'},
  {intent:v=>v.protocol='local-final-content-plain-run-v1'},
  {intent:v=>v.sourceTransition={...v.sourceTransition,previousPid:999999}}
 ]){const f=await fixture(t,mutations);await assert.rejects(()=>f.save().then(readFinalContinuation));}
});
