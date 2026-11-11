import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,mkdir,writeFile,readFile,rm,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir,hostname} from 'node:os';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {finalPanelNodes} from './final-visual.mjs';
import {finalContentOptions} from './local-final-content-runner.mjs';
import {finalRecoveryBaseline,finalRecoveryInventory,assertFinalRecoveryPreserved,guardFinalRecoveryExecutor,recoveryHash,readFinalRecoveryTransition,validateFinalRecoveryStart,assertFinalRecoveryResume} from './local-final-content-recovery.mjs';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function projectFixture(){
 const finalKinds=['final_visual_plan',...Array(3).fill('final_visual_image'),...finalPanelNodes().map(()=> 'final_visual_review'),'final_visual_aggregate'];
 const jobs=finalKinds.map((purpose,i)=>({id:'final-'+i,purpose,finalVisualRunId:'run',status:'succeeded',binding:{providerId:purpose==='final_visual_image'?'local-synthetic-image':'local-synthetic',model:purpose==='final_visual_image'?'local-synthetic-image-v1':'synthetic'},outputVersionIds:['out-'+i],allowanceFamilyId:'family',attempts:[{id:'attempt-'+i,status:'succeeded',dispatchStarted:true,allowanceFamilyId:'family',receipt:purpose==='final_visual_image'?{outcome:'output_received',responseEvidence:{sha256:'a'.repeat(64)}}:{responseText:'Synthetic original only'}}]}));
 jobs.push(...Array.from({length:9},(_,i)=>({id:'sketch-'+i,purpose:'image_candidate',status:'succeeded',allowanceFamilyId:'family',attempts:[{dispatchStarted:true,allowanceFamilyId:'family'}]})));
 return {id:'p',revision:10,activeByStage:{copy:'copy',sketch:'sketch'},activeTaskCardId:'task',decisions:[],jobs,artifacts:[{id:'copy',stage:'copy'},{id:'sketch',stage:'sketch'}],finalVisualRuns:[{id:'run',reports:[]}],imageAllowance:{id:'family',maxCalls:12},finalVisualAllowance:{maxImageCalls:12,maxReviewCalls:40},taskCards:[{id:'task'}],policies:[{version:1}],imageAssets:[]};
}
test('only a full successful local final set can authorize reader-only recovery',()=>{
 const p=projectFixture(),baseline=finalRecoveryBaseline(p);assert.equal(baseline.inventory.imageCalls,3);assert.equal(baseline.inventory.modelCalls,finalPanelNodes().length+2);assert.equal(assertFinalRecoveryPreserved(p,baseline).newContentJobs,0);
 for(const change of [q=>q.jobs[0].status='awaiting_reconciliation',q=>q.jobs[0].attempts[0].dispatchStarted=false,q=>delete q.jobs[0].attempts[0].receipt,q=>q.jobs[1].binding.model='real-model',q=>q.jobs[0].outputVersionIds=[],q=>q.jobs[0].attempts.push(q.jobs[0].attempts[0])]){const q=structuredClone(p);change(q);assert.throws(()=>finalRecoveryInventory(q));}
});
test('old originals and spent budgets cannot be reset or supplemented during recovery',()=>{
 const p=projectFixture(),b=finalRecoveryBaseline(p);
 for(const change of [q=>q.jobs[0].attempts[0].receipt.responseText='changed',q=>q.imageAllowance.maxCalls=15,q=>q.finalVisualAllowance={maxImageCalls:999,maxReviewCalls:999},q=>q.activeByStage.copy='other',q=>q.finalVisualRuns[0].reports.push({}),q=>q.jobs.push({...q.jobs[0],id:'new-final'}),q=>q.contentAllowance={maxCalls:39}]){const q=structuredClone(p);change(q);assert.throws(()=>assertFinalRecoveryPreserved(q,b));}
 const q=structuredClone(p);q.jobs.push({id:'content',purpose:'complete_content_plan',attempts:[],status:'queued'});q.contentAllowance={maxCalls:13};assert.equal(assertFinalRecoveryPreserved(q,b).newContentJobs,1);
 q.jobs.at(-1).attempts=[{dispatchStarted:true},{dispatchStarted:true}];assert.throws(()=>assertFinalRecoveryPreserved(q,b),{code:'FINAL_RECOVERY_NEW_DISPATCH_FORBIDDEN'});
});
test('the executor fence rejects visual dispatch before invoking the underlying executor',async()=>{
 const p=projectFixture(),b=finalRecoveryBaseline(p);let dispatched=0;const raw={execute:async()=>{dispatched++;},continueFinalVisual:()=>{dispatched++;},advanceFinalVisual:async()=>({status:'ready_for_content'})},store={read:()=>p},guard=guardFinalRecoveryExecutor(raw,store,b);
 await assert.rejects(()=>guard.execute('p',p.jobs[0].id),{code:'FINAL_RECOVERY_NEW_DISPATCH_FORBIDDEN'});await assert.rejects(()=>guard.continueFinalVisual(),{code:'FINAL_RECOVERY_NEW_DISPATCH_FORBIDDEN'});assert.equal(dispatched,0);
 p.jobs.push({id:'content',purpose:'complete_content_plan',attempts:[],status:'queued'});await guard.execute('p','content');assert.equal(dispatched,1);
 raw.advanceFinalVisual=async()=>{p.jobs.push({...p.jobs[0],id:'new-final'});return {};};await assert.rejects(()=>guard.advanceFinalVisual('p'),{code:'FINAL_RECOVERY_NEW_DISPATCH_FORBIDDEN'});assert.equal(dispatched,1);
});
async function transitionFixture(t){
 const root=await realpath(await mkdtemp(join(tmpdir(),'final-recovery-transition-')));t.after(()=>rm(root,{recursive:true,force:true}));const moduleRoot=join(root,'workbench'),workRoot=join(root,'case'),archive=join(root,'archive');for(const p of [moduleRoot,workRoot,archive])await mkdir(p);
 async function file(path,bytes){await writeFile(path,bytes);return {path,sha256:digest(bytes),byteLength:Buffer.byteLength(bytes)};}
 const changes=[],oldPins=[];for(const name of ['final-visual-original.mjs','local-final-content-runner.mjs']){const path=join(moduleRoot,name),old=await file(join(archive,name),'old-'+name),current=await file(path,'new-'+name);changes.push({path,old,current});oldPins.push({...old,path});}
 const addition=await file(join(moduleRoot,'local-final-content-recovery.mjs'),'new helper'),p=projectFixture(),owner=Number(execFileSync(process.execPath,['-e','process.stdout.write(String(process.pid))'],{encoding:'utf8'})),identity={projectId:'p',caseId:'m6'},configuration={engineeringOnly:true};
 const old={protocol:'local-final-content-plain-run-v1',status:'blocked',currentStage:'visual',state:{status:'blocked',reason:'LAYOUT_MANAGED_BYTES_REQUIRED'},writerPid:owner,host:hostname(),actionsTotal:19,lastRevision:p.revision,baselineDecisionCount:p.decisions.length,sourceIdentity:identity,configuration,codePins:oldPins};
 const oldMeta=await file(join(workRoot,'FINAL_CONTENT_RUNNER.json'),JSON.stringify(old)),oldIntent=await file(join(workRoot,'final-content-intent.json'),JSON.stringify({...old,status:'initialized',actionsTotal:0}));
 const value={protocol:'local-final-reader-transition-v1',projectId:'p',caseId:'m6',host:hostname(),workRoot,moduleRoot,previousPid:owner,priorActions:19,configurationHash:recoveryHash(configuration),oldMeta,oldIntent,changes,addition,baseline:finalRecoveryBaseline(p)},path=join(root,'transition.json');
 async function save(v=value){await writeFile(path,JSON.stringify(v));return {path,sha256:digest(await readFile(path)),workRoot,moduleRoot,runnerPath:join(moduleRoot,'local-final-content-runner.mjs')};}
 return {root,p,identity,configuration,value,save};
}
test('an explicit immutable transition retains old code, validates the current pair and rechecks the native head',async t=>{
 const f=await transitionFixture(t),profile=await readFinalRecoveryTransition(await f.save()),store={read:()=>f.p};await validateFinalRecoveryStart(profile,store,{identity:f.identity,configuration:f.configuration,initial:true});
 await assert.rejects(()=>validateFinalRecoveryStart(profile,store,{identity:f.identity,configuration:{changed:true},initial:true}),{code:'FINAL_RECOVERY_CONFIG_CHANGED'});
 const changed=structuredClone(f.p);changed.revision++;await assert.rejects(()=>validateFinalRecoveryStart(profile,{read:(_id,revision)=>revision===undefined?changed:f.p},{identity:f.identity,configuration:f.configuration,initial:true}),{code:'FINAL_RECOVERY_HEAD_CHANGED'});
});
test('no third changed file, wrong case, live owner or replaced transition can authorize recovery',async t=>{
 const f=await transitionFixture(t);
 for(const change of [v=>v.changes.push({...v.changes[0],path:join(v.moduleRoot,'project.mjs')}),v=>v.caseId='dexian',v=>v.priorActions=0,v=>{v.previousPid=process.pid;}]){const value=structuredClone(f.value);change(value);await assert.rejects(()=>f.save(value).then(readFinalRecoveryTransition));}
 const input=await f.save();await writeFile(input.path,'{}');await assert.rejects(()=>readFinalRecoveryTransition(input),{code:'FINAL_RECOVERY_TRANSITION_CHANGED'});
});
test('missing retained code fails closed and a profile cannot be requested without a matching digest',async t=>{
 const f=await transitionFixture(t),input=await f.save();await unlink(f.value.changes[0].old.path);await assert.rejects(()=>readFinalRecoveryTransition(input));
 const options={mode:'start',workRoot:f.value.workRoot,sketchPid:123,maxActions:50};assert.throws(()=>finalContentOptions({...options,sourceTransitionPath:input.path}),{code:'FINAL_RECOVERY_TRANSITION_REQUIRED'});assert.throws(()=>finalContentOptions({...options,sourceTransitionHash:input.sha256}),{code:'FINAL_RECOVERY_TRANSITION_REQUIRED'});
});

test('a V2 resume cannot roll counters back or rewrite a completed stage',()=>{
 const profile={path:'/transition',sha256:'a'.repeat(64),transition:{priorActions:19,baseline:{decisionCount:2}},old:{baselineDecisionCount:2}},meta={protocol:'local-final-content-plain-run-v2',status:'paused',sourceTransition:{path:'/transition',sha256:'a'.repeat(64),priorActions:19},actionsTotal:25,baselineDecisionCount:2};assert.doesNotThrow(()=>assertFinalRecoveryResume(meta,profile));
 for(const patch of [{actionsTotal:0},{actionsTotal:18},{actionsTotal:NaN},{actionsTotal:101},{actionsTotal:19.5},{baselineDecisionCount:0}])assert.throws(()=>assertFinalRecoveryResume({...meta,...patch},profile),{code:'FINAL_RECOVERY_COUNTER_CHANGED'});
 assert.throws(()=>assertFinalRecoveryResume({...meta,status:'complete'},profile),{code:'FINAL_RECOVERY_ALREADY_COMPLETE_USE_RESULT'});
});
