import {recoverReadinessTerminal} from './recovered-readiness-test-support.mjs';
import {numericFixture} from './research-numeric-fixture.mjs';
import {researchMaterialCases} from './research-history-material-fixture.mjs';
import {indexFinalHistoryRecords} from './final-history-index.mjs';
import {collectCheckedReviewOccurrences} from './final-review-occurrences.mjs';
import {diskReceipt} from './selected-stage-fixture.mjs';
import {createServer} from './server.mjs';
import {verifyReviewOriginal} from './review-original.mjs';
import {correctionSources} from './correction.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {syntheticResearch,acceptedOperatorResearch,releaseRequest,continuationRequest,human,bindings,declarationRequest} from './research-operator-fixture.mjs';
import {createExecutor} from './executor.mjs';
import {CREATIVE_PROTOCOL,STRATEGY_CREATIVE_PROTOCOL,CREATIVE_ROLES,creativeDecision} from './creative-panel.mjs';
import {panelFixtureOutput,syntheticOwnerOutput} from './owner-edge-fixtures.mjs';
import {requireResearchChartAdmission,strategyDeliveryEnvelope} from './project.mjs';
import {buildOwnerRequest,validateOwnerOutput} from './owner-edge.mjs';
const hash=t=>createHash('sha256').update(t).digest('hex');
for(const [conditional,calibrationProtocol] of [[true,STRATEGY_CREATIVE_PROTOCOL]])test(calibrationProtocol===CREATIVE_PROTOCOL?'engineering-only legacy calibration cannot authorize current strategy review or automatic owner handoff':'actual corrected research reaches current admission, envelope and final restriction join',async()=>{
const makeResearch=process.env.RESEARCH_NUMERIC?async options=>{
 const f=await numericFixture({compact:true,transform:options.transform});
 const run=async pending=>{const result=await f.executor.execute('p',await pending);assert.equal(result.status,'succeeded',JSON.stringify(result.error));return result;};
 await run(f.executor.enqueue('p','research',{sourceRecords:[f.source]}));f.artifact=f.store.read('p').artifacts[0];
 await run(f.executor.enqueueVerification('p',f.artifact.id));await run(f.executor.enqueueReadiness('p',f.artifact.id));
 return f;
}:syntheticResearch;
const f=await makeResearch({initialReadinessProtocol:conditional?'research-readiness-v1':'research-readiness-v2',transform:(receipt,request)=>{
 const packet=request.packet??(request.prompt.includes('UNTRUSTED_JSON_DATA\n')?JSON.parse(request.prompt.slice(request.prompt.indexOf('UNTRUSTED_JSON_DATA\n')+20,request.prompt.lastIndexOf('\nEND_UNTRUSTED_JSON_DATA'))):null);
 let raw=structuredClone(receipt.parsedOutput);
 if(packet?.researchRevision){raw.stageProtocolVersion=packet.researchRevision.protocolVersion;raw.assessmentGenerationHash=packet.researchRevision.generationHash;}
 if(packet?.correctionInput){
  if(packet.content){
   raw={protocolVersion:packet.reviewProtocolVersion,artifactId:packet.artifactId,contentHash:packet.contentHash,sourceSetHash:packet.correctionInput.sourceSetHash,contextHash:packet.context.contextHash,assessmentId:packet.assessment.id,generationHash:packet.assessment.rawReport.generationHash,findings:packet.responses.map(r=>({findingKey:r.findingKey,status:'unresolved',category:'missing_material',reason:'Conditional future evidence remains missing after revised research.',refs:[{location:'/summary',quote:packet.content.summary}]})),preservationCheck:{status:'complete',constraintManifestHash:packet.correctionInput.constraintManifestHash,violations:[]},limitations:['Synthetic independently retained missing evidence.']};
  }else{
   raw.summary='Revised research separates bounded blue exploration from future appearance ranking, which remains unsupported.';
   raw.revisionResponses=packet.correctionInput.sources.flatMap(s=>s.findings).map(f=>({findingKey:f.key,action:'partly_applied',explanation:'Revised scope; conditional evidence remains missing.',outputLocations:[{location:'/summary',quote:raw.summary}]}));
  }
  receipt.inputPacketHash=hash(JSON.stringify({runId:request.runId,model:'synthetic',prompt:request.prompt,outputSchema:request.outputSchema}));
 }

 if(packet?.protocolVersion==='research-readiness-v1')raw.findings=[{severity:'limitation',questionId:'same_use_comparisons',rationale:'Synthetic later appearance material missing.',refs:[{location:'/content/sections/0/body',quote:packet.content.sections[0].body}],downstreamImpact:'Explore blue.',researchNeeded:'Later appearance material.'}];
 if(packet?.protocolVersion==='research-readiness-v2'&&packet.applicability.origins.length){
  const refs=[{location:'/content/sections/0/body',quote:packet.content.sections[0].body}],requirements=[{location:'/taskCard/brief',quote:packet.taskCard.brief}];
  raw.obligationAssessments=packet.applicability.origins.map(o=>({originKey:o.key,preservation:{state:'retained',reason:'Synthetic missing evidence retained.',refs},procurement:{kind:'conditional_later',state:'missing',material:'Synthetic later preference material.',reason:'Only a bounded creative exploration is permitted.',refs,permittedUse:'Explore blue.',prohibitedUse:'No appearance ranking.',activationCondition:'Appearance ranking selection.',returnStage:'research'},requirementRefs:requirements,replacement:{originKeys:[],reason:'none',refs:[]},reason:'Synthetic independent classification.'}));
  raw.useScan.assessedOriginKeys=raw.obligationAssessments.map(o=>o.originKey);
 }
 if(packet?.protocolVersion==='research-handoff-v3'){raw.prohibitedInferences.push('No model manufactured endorsement.');if(process.env.RESEARCH_NARROWED)for(const d of raw.restrictionDispositions){d.state='narrowed';d.text+=' Additional synthetic restriction.';}}
 return {...receipt,parsedOutput:raw,responseText:JSON.stringify(raw)};
}});
try {
f.providers.correction={model:'synthetic',execute:async request=>{
 const packet=JSON.parse(request.prompt.slice(request.prompt.indexOf('UNTRUSTED_JSON_DATA\n')+20,request.prompt.lastIndexOf('\nEND_UNTRUSTED_JSON_DATA')));
 const raw={protocolVersion:packet.reviewProtocolVersion,artifactId:packet.artifactId,contentHash:packet.contentHash,sourceSetHash:packet.correctionInput.sourceSetHash,contextHash:packet.context.contextHash,assessmentId:packet.assessment.id,generationHash:packet.assessment.rawReport.generationHash,findings:packet.responses.map(r=>({findingKey:r.findingKey,status:'unresolved',category:'missing_material',reason:'Conditional future evidence remains missing after revised research.',refs:[{location:'/summary',quote:packet.content.summary}]})),preservationCheck:{status:'complete',constraintManifestHash:packet.correctionInput.constraintManifestHash,violations:[]},limitations:['Synthetic independently retained missing evidence.']};
 const result={runId:request.runId,requestedModel:'synthetic',model:'synthetic',threadId:randomUUID(),inputPacketHash:hash(JSON.stringify({runId:request.runId,model:'synthetic',prompt:request.prompt,outputSchema:request.outputSchema})),exitCode:0,responseText:JSON.stringify(raw),parsedOutput:raw};
 const persisted=await diskReceipt(f.root,request,result);return {...persisted,...result,provider:persisted.provider,paths:persisted.paths};
 }};
 f.executor=createExecutor({store:f.store,rootDir:f.root,providers:f.providers,bindings:{...bindings,correction_review:{providerId:'correction',model:'synthetic',role:'correction-reviewer'}},imageProvider:null});
 const previousResearch=f.artifact;
 let priorAdmission;
 if(process.env.RESEARCH_OLD_RELEASED){
  const oldAssessment=await f.executor.enqueueReadiness('p',previousResearch.id,{protocolVersion:'research-readiness-v2'});assert.equal((await f.executor.execute('p',oldAssessment)).status,'succeeded');
  await acceptedOperatorResearch(f);await f.executor.releaseResearch('p',releaseRequest(f),human);
  priorAdmission=requireResearchChartAdmission(f.store.read('p'),previousResearch.id);
  assert(priorAdmission.charts.length>0);
 }
 const revision=await f.executor.enqueueRevision('p',{artifactId:previousResearch.id,commandId:'actual-research-revision',expectedRevision:f.store.read('p').revision});
 const revised=await f.executor.execute('p',revision);assert.equal(revised.status,'succeeded',JSON.stringify(revised.error));
 f.artifact=f.store.read('p').artifacts.find(a=>a.id===revised.outputVersionIds[0]);
 assert.notEqual(f.artifact.id,previousResearch.id);
 assert.equal((await f.executor.execute('p',await f.executor.enqueueVerification('p',f.artifact.id))).status,'succeeded');
if(conditional){const id=await f.executor.enqueueReadiness('p',f.artifact.id,{commandId:'conditional-assessment',expectedRevision:f.store.read('p').revision,protocolVersion:'research-readiness-v2'});if(process.env.RESEARCH_RECOVERED)await recoverReadinessTerminal(f,id);else assert.equal((await f.executor.execute('p',id)).status,'succeeded',JSON.stringify(f.store.read('p').jobs.at(-1).error));}
const handling=await f.executor.enqueueCorrectionReview('p',{artifactId:f.artifact.id,commandId:'actual-research-handling',expectedRevision:f.store.read('p').revision,protocolVersion:'correction-handling-v4'});
 assert.equal((await f.executor.execute('p',handling)).status,'succeeded',JSON.stringify(f.store.read('p').jobs.at(-1).error));
if(process.env.RESEARCH_HTTP){
 const app=createServer({dbPath:join(f.root,'db'),rootDir:f.root,port:0,bindings,providers:f.providers,imageProvider:null});
 await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
 const receipts=[];
 const request=async(path,body)=>{const response=await fetch(`http://127.0.0.1:${app.address().port}/api/projects/p${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const value=await response.json();receipts.push({path,status:response.status,body:value});return {status:response.status,body:value};};
 try{
  const originalRequest=declarationRequest(f,'research_owner');
  assert.equal((await request('/research-handoffs',{...originalRequest,assessment:{approved:true}})).status,400);
  for(const side of ['research_owner','strategy_owner']){const result=await request('/research-handoffs',declarationRequest(f,side));assert.equal(result.status,200,JSON.stringify(result));await app.drain();}
  if(process.env.RESEARCH_REPEATED){const duplicate=await request('/research-handoffs',declarationRequest(f,'research_owner'));assert.equal(duplicate.status,422);assert.equal(duplicate.body.error.code,'HANDOFF_ALREADY_DECLARED');}
  const released=await request('/research-release',releaseRequest(f));assert.equal(released.status,200,JSON.stringify(released));
  const continued=await request('/continuations',continuationRequest(f));assert.equal(continued.status,202,JSON.stringify(continued));await app.drain();
  assert.equal(f.store.read('p').jobs.find(j=>j.id===continued.body.jobId).status,'succeeded');
  console.log(JSON.stringify({httpRequests:receipts.map(r=>({path:r.path,status:r.status})),freshLocalServer:true,existingServerRestarted:false}));
  await writeFile(join(f.root,'http-receipts.json'),JSON.stringify(receipts,null,2));
 }finally{await new Promise(resolve=>app.close(resolve));}
}else{
 await acceptedOperatorResearch(f);
 await f.executor.releaseResearch('p',releaseRequest(f),human);
 const id=f.executor.continueResearch('p',continuationRequest(f));assert.equal((await f.executor.execute('p',id)).status,'succeeded');
}
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
 console.log(JSON.stringify({phase:'actual_strategy_complete',root:f.root,priorReleased:Boolean(priorAdmission)}));
 const envelope=strategyDeliveryEnvelope(p,artifactId,contents,{providerId:'copy',model:'synthetic',role:'copy-lead'});
 const admission=requireResearchChartAdmission(p,f.artifact.id,contents);
 if(process.env.RESEARCH_NUMERIC){assert(admission.charts.length>0);assert(JSON.parse(await readFile(previousResearch.payloadRef,'utf8')).chartData.charts.length>0);}
 if(priorAdmission){assert.equal(priorAdmission.artifactId,previousResearch.id);assert(envelope.manifest.handoffReports.some(r=>r.artifactId===previousResearch.id));}
 assert.deepEqual(envelope.researchChartAdmissions,[admission]);
 assert.throws(()=>requireResearchChartAdmission(p,previousResearch.id,contents),{code:'STALE_ARTIFACT'});
 assert(envelope.sourceArtifacts.some(a=>a.id===previousResearch.id));
 assert.equal(hash(await readFile(previousResearch.payloadRef,'utf8')),previousResearch.contentHash);
 const originalReport=p.readinessReports.find(r=>r.protocolVersion==='research-readiness-v1');
 const index=indexFinalHistoryRecords(p),originals=[];
 for(const [kind,rows]of [['readiness',p.readinessReports],['handoff',p.handoffReports]])for(const report of rows){const checked={kind:'generic-review-original',...await verifyReviewOriginal(p,kind,report,{executionRoot:f.root})};originals.push({checked,checkedRawAnchors:index.reportAnchors.filter(a=>a.identity===report.id&&a.originalRecordPointer.startsWith(kind==='readiness'?'/readinessReports/':'/handoffReports/'))});}
 const collected=collectCheckedReviewOccurrences({planning:p,checked:{facts:originals},selected:{reportAnchors:originals.flatMap(f=>f.checkedRawAnchors)}});
 const occurrence=collected.occurrences.find(o=>o.reportIdentity===originalReport.id&&o.rawPointer==='/findings/0');assert(occurrence);
 const {finding:closedFinding,...result}=researchMaterialCases(p,index,originals,occurrence,envelope,contents,{mutations:!process.env.RESEARCH_OLD_RELEASED});
 let negative=0;
 const refused=(edit)=>{if(process.env.RESEARCH_OLD_RELEASED)return;const q=structuredClone(p),bytes=structuredClone(contents);edit(q,bytes);assert.throws(()=>strategyDeliveryEnvelope(q,artifactId,bytes,{providerId:'copy',model:'synthetic',role:'copy-lead'}));negative++;};
 refused((q,bytes)=>bytes.splice(bytes.findIndex(c=>c.artifactId===previousResearch.id),1));
 refused((q,bytes)=>bytes.find(c=>c.artifactId===previousResearch.id).contentText+=' ');
 refused(q=>q.jobs.find(j=>j.outputVersionIds?.includes(previousResearch.id)&&j.stage==='research').task.sourceRecords[0].text+=' changed');
 refused(q=>q.jobs.find(j=>j.outputVersionIds?.includes(artifactId)).task.strategyBasis.researchChartAdmission.artifactId=previousResearch.id);
 refused(q=>q.jobs.find(j=>j.outputVersionIds?.includes(artifactId)).inputVersionIds=[]);
 refused(q=>q.artifacts.find(a=>a.id===artifactId).inputVersionIds=[]);
 refused(q=>delete q.jobs.find(j=>j.outputVersionIds?.includes(artifactId)).task.strategyBasis.researchChartAdmission);
 refused(q=>q.releases=q.releases.filter(r=>r.artifactId!==f.artifact.id));
 refused(q=>q.verifications.find(v=>v.artifactId===previousResearch.id).rawReport.limitations.push('Changed historical original.'));
 if(process.env.RESEARCH_RECOVERED){
  const recovered=p.readinessReports.find(r=>r.resolutionId),resolution=p.readinessResolutions.find(r=>r.id===recovered.resolutionId);
  refused(q=>q.readinessResolutions=[]);
  refused(q=>q.readinessReports=q.readinessReports.filter(r=>r.id!==recovered.id));
  refused(q=>q.readinessResolutions.find(r=>r.id===resolution.id).kind='manual-resolution');
  refused(q=>q.readinessResolutions.find(r=>r.id===resolution.id).proof.responseText+=' ');
  refused(q=>q.readinessResolutions.find(r=>r.id===resolution.id).attemptId='crossed-attempt');
  refused(q=>q.readinessResolutions.push({...q.readinessResolutions.find(r=>r.id===resolution.id),id:'ambiguous-resolution'}));
  refused(q=>q.jobs.find(j=>j.id===recovered.jobId).attemptId='crossed-attempt');
  refused(q=>q.jobs.find(j=>j.id===recovered.jobId).status='running');
  refused(q=>{const job=q.jobs.find(j=>j.purpose==='verification'&&j.targetArtifactId===f.artifact.id);job.status='awaiting_reconciliation';job.attempts.at(-1).status='awaiting_reconciliation';});
 }

 if(!process.env.RESEARCH_OLD_RELEASED){
 const reordered=structuredClone(p);reordered.artifacts.reverse();reordered.jobs.reverse();
 assert.deepEqual(strategyDeliveryEnvelope(reordered,artifactId,[...contents].reverse(),{providerId:'copy',model:'synthetic',role:'copy-lead'}),envelope);
 }
 await writeFile(join(f.root,'research-closure.json'),JSON.stringify({result,occurrence,closedFinding,envelope,admissionNegativeCases:negative,priorAdmission,previousResearch:previousResearch.id,currentResearch:f.artifact.id},null,2));
 console.log(JSON.stringify({traceRoot:f.root,...result,admissionArtifact:admission.artifactId,historicalArtifact:previousResearch.id,historicalRetained:true,admissionNegativeCases:negative,materialNegativeCases:result.negativeCases,numeric:admission.charts.length>0}));
} finally {f.store.close();}
});
