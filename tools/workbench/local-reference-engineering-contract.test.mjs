import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,rm,readFile,chmod,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {referencePackets,referenceNodePlan,referenceNodeInput,referenceState,validateReferenceProductionOutput} from './reference-dossier.mjs';
import {referenceReviewFixturePacket,referenceReviewFixtureOutput} from './reference-review-fixtures.mjs';
import {referenceHash,validateReferenceReviewOutput} from './reference-review.mjs';
import {localReferenceResponse} from './local-acceptance-reference-driver.mjs';
import {prepareLocalAcceptanceRuntime} from './local-acceptance-runtime.mjs';
import {LOCAL_REFERENCE_ENGINEERING_CONTRACT,localReferenceEngineeringResponse,prepareLocalReferenceResponseContract} from './local-reference-engineering-contract.mjs';
const binding={providerId:'local-synthetic',model:'synthetic'};
function scenario({engineering=false,mechanical=false,realUnknown=false}={}){
 const directionIds=['a','b','c'],d={id:'domain-scenario',envelope:{envelopeHash:'a'.repeat(64),directionIds,source:{taskCard:{brief:'Local engineering schema and lifecycle only.'},source:{content:{directions:directionIds.map(id=>({id,slogan:id,supportingCopy:'Synthetic public body',creativeExplanation:'Synthetic hypothesis only'}))}},sourceRecords:[],policy:{humanGates:[],authorizedThrough:'sketch'}},configuration:{budget:{maxModelCalls:129,maxSearchCalls:6},calibrations:mechanical?['visual','brand','user','communication'].map(role=>({protocolVersion:'reference-pixel-review-v1',applicabilityProfile:'direction',role,...binding,status:'verified',evidenceRef:'pure-domain-mechanical-schema-calibration-only',evidenceHash:'a'.repeat(64)})):[]},bindings:{reference_lead:{...binding,role:'references-lead'},...Object.fromEntries(['visual','brand','user','communication'].map(role=>['reference_score_'+role,binding]))}},reports:[],candidates:[],tools:[],adoptions:[],previousReturns:[],paused:false};
 directionIds.forEach((directionId,index)=>{const packet=referenceReviewFixturePacket();packet.images.forEach((image,i)=>{image.imageId=`img-${index}-${i}`;image.sha256=String(index*2+i+1).repeat(64);d.candidates.push({directionId,image,provenance:[]});});});
 for(let cycle=0;cycle<30;cycle++){
  let added=0;
  for(const node of referenceNodePlan(d).filter(n=>!d.reports.some(r=>r.nodeKey===n.key)&&n.dependencies.every(k=>d.reports.some(r=>r.nodeKey===k)))){
   const input=referenceNodeInput(d,node),context={job:{purpose:'reference',binding},packet:input,project:{id:'domain',name:'梦之蓝 M6+'},case:{caseId:'m6'}},rawReport=(engineering?localReferenceEngineeringResponse:localReferenceResponse)(context);
   if(realUnknown&&node.phase==='first_read'&&node.role==='visual'&&node.packetId==='candidate-0')rawReport.readings[0].uncertainties=['The crop hides the package opening; opening feasibility is unknown.'];
   if(node.kind==='review')validateReferenceReviewOutput(rawReport,input);else validateReferenceProductionOutput(rawReport,input);
   d.reports.push({nodeKey:node.key,rawReport,reportHash:referenceHash(JSON.stringify(rawReport,null,2))});added++;
  }
  if(!added)break;
 }
 return {d,state:referenceState({jobs:[]},d)};
}
test('actual 129 local responses reproduce 150 blockers; engineering generation retains limitations and reaches only mechanical closure',()=>{
 const old=scenario(),before=JSON.stringify(old.d),positive=scenario({engineering:true,mechanical:true});
 assert.equal(old.d.reports.length,129);assert.equal(old.state.status,'choice_blocked');assert.equal(old.state.historyCoverage.blocks.length,150);
 assert.equal(positive.d.reports.length,129);assert.equal(positive.state.status,'ready_for_sketch');assert.equal(positive.state.historyCoverage.blocks.length,0);assert.equal(positive.d.adoptions.length,0);
 for(const report of positive.d.reports){const prior=old.d.reports.find(r=>r.nodeKey===report.nodeKey);assert.deepEqual(report.rawReport.limitations,prior.rawReport.limitations);assert.ok(report.rawReport.limitations.some(s=>/Synthetic|Local/.test(s)));for(const reading of report.rawReport.readings??[]){assert.equal(reading.meaning,'Synthetic neutral first read.');assert.ok(reading.evidence.every(e=>e.observation==='Synthetic fixture observation; no actual aesthetic judgment.'));}for(const evaluation of report.rawReport.evaluations??[])for(const dimension of evaluation.dimensions){assert.equal(dimension.reason,'Synthetic fixture only.');assert.equal(dimension.score,dimension.status==='scored'?4:null);}}
 assert.equal(JSON.stringify(old.d),before);assert.equal(referenceState({jobs:[]},old.d).historyCoverage.blocks.length,150);
});
test('uncalibrated engineering outputs cannot automatically advance and an actual design unknown still blocks',()=>{
 const uncalibrated=scenario({engineering:true}),unknown=scenario({engineering:true,mechanical:true,realUnknown:true});
 assert.equal(uncalibrated.state.status,'diagnostic');assert.equal(uncalibrated.state.reason,'UNCALIBRATED_REFERENCE_PANEL');assert.ok(uncalibrated.state.coverage.every(x=>x.calibration==='uncalibrated'));
 assert.equal(unknown.state.status,'choice_blocked');assert.equal(unknown.state.historyCoverage.blocks.length,1);
});
test('ordinary review fixture still deliberately emits its negative uncertainty',()=>{
 const d=scenario(),first=referenceNodePlan(d.d).find(n=>n.phase==='first_read'),input=referenceNodeInput(d.d,first);
 assert.deepEqual(referenceReviewFixtureOutput(input).readings[0].uncertainties,['Synthetic pixels have not been judged.']);
 for(const bad of [{providerId:'remote',model:'synthetic'},{providerId:'local-synthetic',model:'real-model'},undefined])assert.throws(()=>localReferenceEngineeringResponse({job:{purpose:'reference',binding:bad},packet:input}),{code:'LOCAL_REFERENCE_ENGINEERING_BINDING_REQUIRED'});
});
async function setup(t){const executionRoot=await realpath(await mkdtemp(join(tmpdir(),'ref-contract-small-')));t.after(()=>rm(executionRoot,{recursive:true,force:true}));const projects=new Map();return {executionRoot,projects,projectStore:{list:()=>[...projects.values()].map(p=>({id:p.id})),read:id=>projects.get(id)},selection:{version:LOCAL_REFERENCE_ENGINEERING_CONTRACT,projectIds:['new-case']}};}
test('contract freezes before reference work, replays on restart and cannot retrofit an old reference case',async t=>{
 const f=await setup(t);f.projects.set('new-case',{id:'new-case',jobs:[]});const initial=await prepareLocalReferenceResponseContract(f),registration=initial.descriptor.registrations[0],before=await readFile(registration.path);
 assert.equal(initial.descriptor.realQualityVerified,false);assert.equal(initial.descriptor.productionFinalAuthority,false);assert.equal(JSON.parse(before).attemptRoot,f.executionRoot);
 f.projects.get('new-case').jobs.push({purpose:'reference'});const restarted=await prepareLocalReferenceResponseContract(f);assert.deepEqual(restarted.descriptor,initial.descriptor);assert.deepEqual(await readFile(registration.path),before);
 f.projects.set('old-case',{id:'old-case',jobs:[{purpose:'reference'}]});await assert.rejects(prepareLocalReferenceResponseContract({...f,selection:{...f.selection,projectIds:['old-case']}}),{code:'LOCAL_REFERENCE_ENGINEERING_RETROFIT_FORBIDDEN'});
});
test('missing opt-in or tampered registration cannot silently switch a registered case to another contract',async t=>{
 const f=await setup(t),selected=await prepareLocalReferenceResponseContract(f),context={project:{id:'new-case'},job:{purpose:'reference',binding}};
 const legacy=await prepareLocalReferenceResponseContract({...f,selection:undefined});await assert.rejects(legacy.response(context),{code:'LOCAL_REFERENCE_ENGINEERING_SELECTION_REQUIRED'});
 const other=await prepareLocalReferenceResponseContract({...f,selection:{...f.selection,projectIds:['other-case']}});await assert.rejects(other.response(context),{code:'LOCAL_REFERENCE_ENGINEERING_SELECTION_REQUIRED'});
 const registration=selected.descriptor.registrations[0];await chmod(registration.path,0o600);await writeFile(registration.path,'{}');await assert.rejects(selected.response(context),{code:'LOCAL_REFERENCE_ENGINEERING_CONTRACT_CHANGED'});await assert.rejects(prepareLocalReferenceResponseContract(f),{code:'LOCAL_REFERENCE_ENGINEERING_CONTRACT_CHANGED'});
});
test('selection rejects open ended lists, unknown versions and undeclared identity fields',async t=>{
 const f=await setup(t);for(const selection of [{version:'other',projectIds:['p']},{version:LOCAL_REFERENCE_ENGINEERING_CONTRACT,projectIds:[]},{version:LOCAL_REFERENCE_ENGINEERING_CONTRACT,projectIds:['p','p']},{...f.selection,allowExisting:true}])await assert.rejects(prepareLocalReferenceResponseContract({...f,selection}),{code:'LOCAL_REFERENCE_ENGINEERING_SELECTION_REQUIRED'});
});

test('separate attempt roots preserve native project identity and cannot import another attempt registration',async t=>{
 const f=await setup(t),a=join(f.executionRoot,'attempt-a'),b=join(f.executionRoot,'attempt-b');await mkdir(a);await mkdir(b);
 const first=await prepareLocalReferenceResponseContract({...f,attemptRoot:a});
 const second=await prepareLocalReferenceResponseContract({...f,attemptRoot:b});
 assert.equal(first.descriptor.registrations[0].projectId,second.descriptor.registrations[0].projectId);assert.notEqual(first.descriptor.registrations[0].sha256,second.descriptor.registrations[0].sha256);
 assert.equal(first.descriptor.nativeExecutionRoot,f.executionRoot);assert.equal(first.descriptor.attemptRoot,a);
 const target=second.descriptor.registrations[0].path;await chmod(target,0o600);await copyFile(first.descriptor.registrations[0].path,target);await assert.rejects(prepareLocalReferenceResponseContract({...f,attemptRoot:b}),{code:'LOCAL_REFERENCE_ENGINEERING_CONTRACT_CHANGED'});
 await assert.rejects(prepareLocalReferenceResponseContract({...f,attemptRoot:'/private/tmp'}),{code:'LOCAL_REFERENCE_ENGINEERING_ATTEMPT_ROOT_REQUIRED'});
});
test('old reference intent or dossier forbids retrofit even when it has no dispatched job',async t=>{
 const f=await setup(t);
 for(const [key,value] of [['referenceIntents',[{id:'intent'}]],['referenceDossiers',[{id:'dossier',reports:[]}]]]){const id='old-'+key;f.projects.set(id,{id,jobs:[],[key]:value});await assert.rejects(prepareLocalReferenceResponseContract({...f,selection:{...f.selection,projectIds:[id]}}),{code:'LOCAL_REFERENCE_ENGINEERING_RETROFIT_FORBIDDEN'});}
});

test('runtime cannot select the engineering reference contract without enabling references',async()=>{
 await assert.rejects(prepareLocalAcceptanceRuntime({referenceResponseContract:{version:LOCAL_REFERENCE_ENGINEERING_CONTRACT,projectIds:['p']}}),{code:'LOCAL_REFERENCE_ENGINEERING_REFERENCES_REQUIRED'});
});
