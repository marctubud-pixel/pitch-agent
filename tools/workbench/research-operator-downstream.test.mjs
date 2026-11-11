import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {syntheticResearch,acceptedOperatorResearch,releaseRequest,continuationRequest,human,bindings,declarationRequest} from './research-operator-fixture.mjs';
import {createExecutor} from './executor.mjs';
import {CREATIVE_PROTOCOL,STRATEGY_CREATIVE_PROTOCOL,CREATIVE_ROLES,creativeDecision} from './creative-panel.mjs';
import {panelFixtureOutput,syntheticOwnerOutput} from './owner-edge-fixtures.mjs';
import {strategyDeliveryEnvelope} from './project.mjs';
import {buildOwnerRequest,validateOwnerOutput} from './owner-edge.mjs';
const hash=t=>createHash('sha256').update(t).digest('hex');
for(const [conditional,calibrationProtocol] of [[false,STRATEGY_CREATIVE_PROTOCOL],[true,STRATEGY_CREATIVE_PROTOCOL],[false,CREATIVE_PROTOCOL]])test(calibrationProtocol===CREATIVE_PROTOCOL?'engineering-only legacy calibration cannot authorize current strategy review or automatic owner handoff':`v3 actual strategy envelope retains all limits through both owners, conditional=${conditional}`,async()=>{
const f=await syntheticResearch({initialReadinessProtocol:conditional?'research-readiness-v1':'research-readiness-v2',transform:(receipt,request)=>{
 const packet=request.packet??(!request.outputSchema.properties.outputKind&&request.prompt.includes('UNTRUSTED_JSON_DATA\n')?JSON.parse(request.prompt.split('UNTRUSTED_JSON_DATA\n')[1].split('\nEND_UNTRUSTED_JSON_DATA')[0]):null);
 const raw=structuredClone(receipt.parsedOutput);
 if(packet?.protocolVersion==='research-readiness-v1')raw.findings=[{severity:'limitation',questionId:'same_use_comparisons',rationale:'Synthetic later appearance material missing.',refs:[{location:'/content/sections/0/body',quote:packet.content.sections[0].body}],downstreamImpact:'Explore blue.',researchNeeded:'Later appearance material.'}];
 if(packet?.protocolVersion==='research-readiness-v2'&&packet.applicability.origins.length){
  const refs=[{location:'/content/sections/0/body',quote:packet.content.sections[0].body}],requirements=[{location:'/taskCard/brief',quote:packet.taskCard.brief}];
  raw.obligationAssessments=packet.applicability.origins.map(o=>({originKey:o.key,preservation:{state:'retained',reason:'Synthetic missing evidence retained.',refs},procurement:{kind:'conditional_later',state:'missing',material:'Synthetic later preference material.',reason:'Only a bounded creative exploration is permitted.',refs,permittedUse:'Explore blue.',prohibitedUse:'No appearance ranking.',activationCondition:'Appearance ranking selection.',returnStage:'research'},requirementRefs:requirements,replacement:{originKeys:[],reason:'none',refs:[]},reason:'Synthetic independent classification.'}));
  raw.useScan.assessedOriginKeys=raw.obligationAssessments.map(o=>o.originKey);
 }
 if(packet?.protocolVersion==='research-handoff-v3')raw.prohibitedInferences.push('No model manufactured endorsement.');
 return {...receipt,parsedOutput:raw,responseText:JSON.stringify(raw)};
}});
try {
if(conditional){const id=await f.executor.enqueueReadiness('p',f.artifact.id,{commandId:'conditional-assessment',expectedRevision:f.store.read('p').revision,protocolVersion:'research-readiness-v2'});assert.equal((await f.executor.execute('p',id)).status,'succeeded',JSON.stringify(f.store.read('p').jobs.at(-1).error));}
await acceptedOperatorResearch(f);
 await f.executor.releaseResearch('p',releaseRequest(f),human);
 const id=f.executor.continueResearch('p',continuationRequest(f));assert.equal((await f.executor.execute('p',id)).status,'succeeded');
 const artifactId=f.store.read('p').activeByStage.strategy;
 assert.equal((await f.executor.execute('p',await f.executor.enqueueVerification('p',artifactId))).status,'succeeded');
 const roles=['creative_director',...CREATIVE_ROLES.strategy.flatMap(r=>[`creative_score_${r}`,`creative_opposition_${r}`])];
 const panelBindings=Object.fromEntries(roles.map(role=>[role,{providerId:'panel',model:'synthetic',role:role+'-lead'}]));
 const panelProvider={model:'synthetic',execute:async request=>{
 const input=JSON.parse(request.prompt.slice(request.prompt.indexOf('UNTRUSTED_JSON_DATA\n')+20,request.prompt.lastIndexOf('\nEND_UNTRUSTED_JSON_DATA'))),output=panelFixtureOutput(input);assert.equal(input.protocolVersion,STRATEGY_CREATIVE_PROTOCOL);
 return {runId:request.runId,model:'synthetic',requestedModel:'synthetic',threadId:randomUUID(),inputPacketHash:hash(JSON.stringify({runId:request.runId,model:'synthetic',prompt:request.prompt,outputSchema:request.outputSchema})),exitCode:0,responseText:JSON.stringify(output),parsedOutput:output};}};
 const calibration=join(f.root,'calibration');const calibrationEvidence='Synthetic engineering fixture only, not real model calibration.';await writeFile(calibration,calibrationEvidence);
 const executor=createExecutor({store:f.store,rootDir:f.root,providers:{...f.providers,panel:panelProvider},bindings:{...bindings,...panelBindings},creativeCalibrations:[{protocolVersion:calibrationProtocol,stage:'strategy',role:'strategy',providerId:'panel',model:'synthetic',evidenceRef:calibration,evidenceHash:hash(calibrationEvidence)}],imageProvider:null});
 await executor.enqueueCreativePanel('p',{artifactId,commandId:'panel',expectedRevision:f.store.read('p').revision});
 for(let i=0;i<8;i++){const jobs=executor.advanceCreativePanels('p');if(!jobs.length)break;for(const job of jobs){const result=await executor.execute('p',job);assert.equal(result.status,'succeeded',JSON.stringify(result.error));}}
 const p=f.store.read('p'),contents=await Promise.all(p.artifacts.map(async a=>({artifactId:a.id,contentText:await readFile(a.payloadRef,'utf8')})));
 const panel=p.creativePanels.find(panel=>panel.packet.artifactId===artifactId);
 assert.equal(panel.packet.protocolVersion,STRATEGY_CREATIVE_PROTOCOL);
 assert.equal(panel.packet.calibrations[0].protocolVersion,calibrationProtocol);
 assert.equal(panel.packet.calibrations[0].status,'verified');
 if(calibrationProtocol===CREATIVE_PROTOCOL){
  assert.deepEqual(creativeDecision(panel,p.creativeReports),{status:'cannot_assess',reasons:['uncalibrated:strategy']});
  assert.throws(()=>strategyDeliveryEnvelope(p,artifactId,contents,{providerId:'copy',model:'synthetic',role:'copy-lead'}),{code:'CREATIVE_PANEL_NOT_PASSED'});
  assert.equal(await executor.ownerWaitingReason('p',artifactId),'CREATIVE_PANEL_NOT_PASSED');
  assert.deepEqual(await executor.advanceOwnerEdges('p'),[]);
  assert.equal(f.store.read('p').ownerEdges.length,0);
  assert.equal(f.store.read('p').jobs.some(job=>job.purpose==='owner_acceptance'),false);
  return;
 }
 assert.equal(creativeDecision(panel,p.creativeReports).status,'pass');
 for(const mismatch of [{model:'other-synthetic-model'},{role:'copy'},{providerId:'other-synthetic-provider'}]){
  const diagnostic=structuredClone(panel);Object.assign(diagnostic.packet.calibrations[0],mismatch);
  assert.deepEqual(creativeDecision(diagnostic,p.creativeReports),{status:'cannot_assess',reasons:['uncalibrated:strategy']},'Engineering-only pure decision check requires the exact calibration profile');
 }
 const envelope=strategyDeliveryEnvelope(p,artifactId,contents,{providerId:'copy',model:'synthetic',role:'copy-lead'});
 const input={envelope,side:'producer',producerReport:null},raw=syntheticOwnerOutput(buildOwnerRequest(input).packet);
 const constraints=envelope.researchOperatorConstraints;
 assert.equal(constraints.length,1);
 assert.equal(Boolean(envelope.researchRestrictionManifest?.length),conditional);
 assert.equal(constraints[0].reports.length,2);assert.equal(constraints[0].authority.declarations.length,2);assert.equal(constraints[0].authority.release.kind,'research-operator-release');
 const inherited=[...(envelope.researchRestrictionManifest??[]).map(r=>({id:`research:${r.originKey}`,kind:'prohibitedInferences',text:r.prohibitedUse})),...constraints.flatMap(c=>c.restrictions)];
 const missing=structuredClone(raw);
 for(const r of inherited)missing[r.kind]=missing[r.kind].filter(x=>x.id!==r.id);
 missing.restrictionDispositions=missing.restrictionDispositions.filter(d=>!inherited.some(r=>r.id===d.restrictionId));
 assert.throws(()=>validateOwnerOutput(missing,input),{code:'INVALID_OWNER_EDGE'});
 raw.permittedUses=[{id:'bounded-use',text:'Explore blue.'}];
 assert.equal(validateOwnerOutput(raw,input).decision,'accept');
 for(const r of inherited){const omitted=structuredClone(raw);omitted[r.kind]=omitted[r.kind].filter(x=>x.id!==r.id);assert.throws(()=>validateOwnerOutput(omitted,input),{code:'INVALID_OWNER_EDGE'});}
 const widened=structuredClone(raw);widened.permittedUses.push({id:'extra-permission',text:'Invent approval.'});assert.throws(()=>validateOwnerOutput(widened,input),{code:'INVALID_OWNER_EDGE'});
 const consumerInput={envelope,side:'consumer',producerReport:raw},consumer=syntheticOwnerOutput(buildOwnerRequest(consumerInput).packet);
 assert.equal(validateOwnerOutput(consumer,consumerInput).decision,'accept');
 for(const r of inherited){const omitted=structuredClone(consumer);omitted[r.kind]=omitted[r.kind].filter(x=>x.id!==r.id);assert.throws(()=>validateOwnerOutput(omitted,consumerInput),{code:'INVALID_OWNER_EDGE'});}
 assert(raw.prohibitedInferences.some(r=>r.text==='No model manufactured endorsement.'));
 for(const mutate of [p=>p.researchHandoffDeclarations[0].prohibitedInferences.push('Changed declaration.'),p=>p.handoffReports[0].rawReport.prohibitedInferences.push('Changed report.'),p=>p.releases[0].id='changed-release']){const changed=structuredClone(p);mutate(changed);assert.throws(()=>strategyDeliveryEnvelope(changed,artifactId,contents,{providerId:'copy',model:'synthetic',role:'copy-lead'}));}

 const stale=await f.executor.recordResearchHandoff('p',declarationRequest(f,'strategy_owner',{decision:'returned',permittedUses:[],prohibitedInferences:['Stop.'],note:'Synthetic return.'}),human);
 assert.equal(stale.jobId,null);assert.throws(()=>strategyDeliveryEnvelope(f.store.read('p'),artifactId,contents,{providerId:'copy',model:'synthetic',role:'copy-lead'}));
 console.log(JSON.stringify({accepted:true,prohibitionOrigins:inherited.length,operatorProhibitionRetained:raw.prohibitedInferences.some(r=>r.text==='No manufactured approval.'),allowedUses:constraints[0].permittedUses}));
} finally {await f.close();}
});
