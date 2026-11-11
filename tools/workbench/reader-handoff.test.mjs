import test from 'node:test';
import http from 'node:http';
import assert from 'node:assert/strict';
import {mkdtemp,rm,realpath,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {openStore} from './store.mjs';
import {createExecutor} from './executor.mjs';
import {createResearchService} from './research-service.mjs';
import {providerSet,source,human,output,bindings as baseBindings} from './research-operator-fixture.mjs';
import {diskReceipt} from './selected-stage-fixture.mjs';
import {researchReaderEvidence,validateResearchReaderEvidence} from './research-reader-state.mjs';
import {researchWorkflowView,validatedResearchAssessment,researchHandlingBlocked,projectCatalogueState} from './project.mjs';
import {buildResearchHandoffPacket,buildResearchHandoffRequest,validateResearchHandoffOutput} from './research-handoff.mjs';
import {semanticHash} from './semantic-authority.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex');
const dimensions=['market','audience','competition','product','carrier','synthesis'];
function readerOutput(p,answered){const locations=[{location:'/summary',quote:source.text}],raw={protocolVersion:'research-reader-loop-v1',packetHash:p.packetHash,phase:p.phase,retellings:dimensions.map(dimension=>({dimension,understanding:'只说明合成产品。',classification:'mixed',locations})),answers:p.questionRegistration.questions.map(q=>({questionId:q.id,status:answered?'answered':'unresolved',answer:'颜色不说明偏好。',locations})),connections:[{dimensions:['product','audience'],explanation:'颜色不证明人群喜欢。',strategyConstraint:'不能预选偏好。',limitations:'不得从颜色推断偏好。',locations}],issues:[],rechecks:[],limitations:['Synthetic reader; no real consumers.']};return raw;}
async function fixture(t,{readerCount=1,answered=true,httpModel=false}={}){
 const root=await realpath(await mkdtemp(join(tmpdir(),'reader-owner-'))),store=openStore(join(root,'db')),calls=[];t.after(async()=>{store.close();await rm(root,{recursive:true,force:true});});
 store.create({id:'new',name:'Synthetic reader owner',brief:'只核合成蓝色产品，不推断购买偏好。',mode:'auto',humanGates:[],workflowVersion:'proposal-seven-v1'},human);
 store.command('new',{kind:'confirm-task-card',taskCardId:'new:scope:1',commandId:'confirm',expectedRevision:0},human);
 store.command('new',{kind:'register-research-source',source:{title:'Synthetic',publisher:'Test',url:source.url,excerpt:source.text,intendedUse:'category',attachToClaimId:null},commandId:'source',expectedRevision:1},human);
 const sourceId=store.read('new').sourceEntries[0].id,providers=providerSet(calls,(result,request)=>{const output=structuredClone(result.parsedOutput);if(request.packet?.readerEvidence)output.limitations=[...new Set([...(output.limitations??[]),...request.packet.readerEvidence.reports.flatMap(r=>[...r.rawReport.limitations,...r.rawReport.connections.map(c=>c.limitations),...r.rawReport.issues.map(i=>i.detail)])])];const responseText=JSON.stringify(output).replaceAll('s1',sourceId);return {...result,responseText,parsedOutput:JSON.parse(responseText)};},root);
 providers.reader={model:'synthetic',async execute(request){const raw=readerOutput(request.packet,answered);return diskReceipt(root,request,{runId:request.runId,model:'synthetic',requestedModel:'synthetic',threadId:`reader-${request.runId}`,inputPacketHash:sha(JSON.stringify({runId:request.runId,model:'synthetic',prompt:request.prompt,outputSchema:request.outputSchema})),exitCode:0,responseText:JSON.stringify(raw),parsedOutput:raw});}};
 if(httpModel){
  const model=http.createServer(async(req,res)=>{try{const chunks=[];for await(const chunk of req)chunks.push(chunk);const wire=JSON.parse(Buffer.concat(chunks)),isReader=wire.outputSchema.properties.protocolVersion?.enum[0]==='research-reader-loop-v1';let raw;
   if(isReader){const marker='UNTRUSTED_READER_PACKET\n',start=wire.prompt.indexOf(marker),end=wire.prompt.indexOf('\nEND_UNTRUSTED_READER_PACKET');raw=readerOutput(JSON.parse(wire.prompt.slice(start+marker.length,end)),answered);}
   else{raw=output({...wire,runId:wire.invocationId});const marker='UNTRUSTED_JSON_DATA\n',start=wire.prompt.indexOf(marker),end=wire.prompt.indexOf('\nEND_UNTRUSTED_JSON_DATA');if(!wire.outputSchema.properties.outputKind&&start>=0){const packet=JSON.parse(wire.prompt.slice(start+marker.length,end));if(packet.readerEvidence)raw.limitations=[...new Set([...(raw.limitations??[]),...packet.readerEvidence.reports.flatMap(r=>[...r.rawReport.limitations,...r.rawReport.connections.map(c=>c.limitations),...r.rawReport.issues.map(i=>i.detail)])])];}}
   res.end(JSON.stringify({protocol:wire.protocol,invocationId:wire.invocationId,contextMode:wire.contextMode,terminal:'completed',outputText:JSON.stringify(raw).replaceAll('s1',sourceId),reportedModel:'synthetic',requestId:null,usage:{inputTokens:null,outputTokens:null}}));}catch(error){res.destroy(error);}});
  await new Promise(resolve=>model.listen(0,'127.0.0.1',resolve));t.after(async()=>{model.closeAllConnections();await new Promise(resolve=>model.close(resolve));});
  for(const id of ['author','reviewer','strategist','reader']){const operatorConfig={adapter:'workbench-model-http-v1',endpoint:`http://127.0.0.1:${model.address().port}/model`,model:'synthetic',serviceIdentity:`reader-owner-engineering-${id}`,authentication:{kind:'none'},allowLoopbackHttp:true,timeoutMs:1000,maxRequestBytes:8*1024*1024,maxResponseBytes:4*1024*1024,maxOutputBytes:1024*1024,vision:false,envelopes:[],resourceProfile:'bounded-json-v1'};providers[id]={adapter:operatorConfig.adapter,model:'synthetic',operatorConfig};}
 }
 const bindings={...baseBindings,reader:{providerId:'reader',model:'synthetic',role:'independent-reader'}},service=createResearchService({store,rootDir:root,bindings,providers,executionAllowed:true});
 const {registrationId}=service.registerQuestions('new',{questions:[{id:'q1',question:'颜色能证明偏好吗？',critical:true}],readerCount,commandId:'questions',expectedRevision:2},human);
 await service.generate('new',{commandId:'generate',expectedRevision:store.read('new').revision,sourceEntryIds:[sourceId]});const artifactId=store.read('new').activeByStage.research;
 for(let seat=0;seat<readerCount;seat++)await service.readReport('new',{artifactId,registrationId,seat,commandId:`read-${seat}`,expectedRevision:store.read('new').revision});
 return {root,store,service,artifactId,registrationId,bindings,providers};
}
test('reader metadata proof requires every exact current seat and refuses unknown or changed methods',async t=>{
 const f=await fixture(t,{readerCount:2}),p=f.store.read('new'),e=researchReaderEvidence(p,f.artifactId);assert.equal(e.reports.length,2);assert.equal(e.humanApproval,false);assert.equal(e.consumerValidation,false);assert.equal(e.factualSufficiencyVerified,false);assert.equal(researchWorkflowView(p,{bindings:f.bindings,providers:f.providers}).checks.find(x=>x.id==='reader_loop').passed,true);
 const missing=structuredClone(p);missing.researchReaderReports.pop();assert.throws(()=>researchReaderEvidence(missing,f.artifactId));
 const unknown=structuredClone(p);unknown.jobs.push({...unknown.jobs.find(j=>j.purpose==='research_reader'),id:'unknown',status:'awaiting_reconciliation'});assert.throws(()=>researchReaderEvidence(unknown,f.artifactId));
 const changed=structuredClone(p);changed.researchQuestionRegistrations[0].method.sha256='b'.repeat(64);assert.throws(()=>researchReaderEvidence(changed,f.artifactId));assert.equal(researchWorkflowView(changed,{bindings:f.bindings,providers:f.providers}).checks.find(x=>x.id==='reader_loop').passed,false);
 const wrong=structuredClone(e);wrong.contentHash='c'.repeat(64);wrong.evidenceHash=semanticHash(Object.fromEntries(Object.entries(wrong).filter(([k])=>k!=='evidenceHash')));assert.throws(()=>validateResearchReaderEvidence(wrong,{artifactId:f.artifactId,contentHash:e.contentHash}));
});
test('unanswered latest reader cannot become positive evidence',async t=>{const f=await fixture(t,{answered:false});assert.throws(()=>researchReaderEvidence(f.store.read('new'),f.artifactId));assert.equal(researchWorkflowView(f.store.read('new')).checks.find(c=>c.id==='reader_loop').passed,false);});
async function ownerInput(f){
 await f.service.verify('new',{artifactId:f.artifactId,commandId:'verify',expectedRevision:f.store.read('new').revision});
 await f.service.assess('new',{artifactId:f.artifactId,commandId:'assess',expectedRevision:f.store.read('new').revision});
 const p=f.store.read('new'),a=p.artifacts.find(a=>a.id===f.artifactId),producer=p.jobs.find(j=>j.outputVersionIds?.includes(a.id)),assessment=validatedResearchAssessment(p,a.id),taskCard=p.taskCards.find(c=>c.id===p.activeTaskCardId),contentText=await readFile(a.payloadRef,'utf8');
 const declaration={id:'synthetic-declaration-only',artifactId:a.id,contentHash:a.contentHash,assessmentId:assessment.id,side:'research_owner',decision:'delivered',permittedUses:['Explore blue.'],prohibitedInferences:['No preference claim.'],unresolvedIssues:[]};
 return {p,input:{researchDataBasis:producer.task.researchDataBasis,handoffProtocolVersion:'research-handoff-v3',artifactId:a.id,contentHash:a.contentHash,contentText,content:JSON.parse(contentText),taskCard,taskCardConfirmed:true,sourceRecords:a.technicalReceipts.sourceCatalogue.records,visualCatalogue:a.technicalReceipts.visualCatalogue??[],side:'producer',targetStage:'strategy',ownerBinding:producer.binding,verificationReports:p.verifications.filter(r=>r.artifactId===a.id).map(r=>r.rawReport),readinessReports:p.readinessReports.filter(r=>r.artifactId===a.id).map(r=>r.rawReport),assessment,effectiveHandlingBlocked:researchHandlingBlocked(p,a.id),catalogueState:projectCatalogueState(p,a),operatorDeclaration:declaration,readerEvidence:researchReaderEvidence(p,a.id)}};
}
function ownerAnswer(input){const request=buildResearchHandoffRequest(input),packet=request.packet,bindings=Object.fromEntries(Object.entries(request.outputSchema.properties).filter(([,v])=>v.enum?.length===1).map(([k,v])=>[k,v.enum[0]]));return {...bindings,ownerBinding:input.ownerBinding,decision:'accept',understoodFindings:[{finding:'只做有界蓝色产品探索。',refs:[{location:'/content/sections/0/body',quote:source.text}]}],permittedUses:['Explore blue.'],prohibitedInferences:['No preference claim.'],unresolvedIssues:[],restrictionDispositions:packet.restrictionManifest.map(r=>({originKey:r.originKey,state:'retained',text:r.prohibitedUse})),limitations:[...new Set(input.readerEvidence.reports.flatMap(r=>[...r.rawReport.limitations,...r.rawReport.connections.map(c=>c.limitations)]))]};}
test('actual owner packet includes original reader packets and preserves their limits',async t=>{
 const f=await fixture(t),{p,input}=await ownerInput(f),packet=buildResearchHandoffPacket(input);
 assert.deepEqual(packet.readerEvidence,input.readerEvidence);assert.ok(buildResearchHandoffRequest(input).prompt.includes('Synthetic reader; no real consumers.'));
 const legacyShape={...input};delete legacyShape.readerEvidence;const without=buildResearchHandoffPacket(legacyShape);assert.ok(!Object.hasOwn(without,'readerEvidence'));assert.notEqual(packet.packetHash,without.packetHash);
 const answer=ownerAnswer(input);assert.equal(validateResearchHandoffOutput(answer,input).decision,'accept');assert.throws(()=>validateResearchHandoffOutput({...answer,limitations:['omitted reader limitations']},input),/reader limitations/);
 const inflated=structuredClone(input);inflated.readerEvidence.humanApproval=true;assert.throws(()=>buildResearchHandoffPacket(inflated));
 assert.throws(()=>f.store.command('new',{kind:'request-handoff',artifactId:f.artifactId,side:'producer',jobId:'owner-without-reader',binding:input.ownerBinding,task:{id:'owner-without-reader',owner:input.ownerBinding.role,parentId:'new',handoffInput:legacyShape,request:{}},commandId:'no-reader-originals',expectedRevision:p.revision},{actorType:'agent',actorId:'engineering-director',runId:'engineering-owner-run',contextId:'engineering-owner-context'}),/current reader originals/);
});

test('actual owner invocations and explicit engineering operator release retain exact reader originals',async t=>{
 const f=await fixture(t,{httpModel:true});await ownerInput(f);const operator={actorType:'human',actorId:'engineering-test-operator',runId:'engineering-operator-run',contextId:'engineering-operator-context'};
 for(const side of ['research_owner','strategy_owner']){
  const p=f.store.read('new'),view=await f.service.workflowSnapshot(p),input={side,decision:side==='research_owner'?'delivered':'accepted',permittedUses:['Explore blue.'],prohibitedInferences:['No preference claim.','No real consumer or client approval.'],unresolvedIssues:[],note:'Explicit engineering manual-node fixture; not business approval.'};
  const receipt=await f.service.handoff('new',{artifactId:f.artifactId,contentHash:p.artifacts[0].contentHash,basisHash:view.basisHash,input,commandId:`owner-${side}`,expectedRevision:p.revision},operator),after=f.store.read('new'),job=after.jobs.find(j=>j.id===receipt.jobId);
  assert.equal(job.status,'succeeded',JSON.stringify(job.error));assert.ok(job.task.handoffInput.readerEvidence);assert.equal(job.task.handoffInput.readerEvidence.evidenceHash,researchReaderEvidence(after,f.artifactId).evidenceHash);
 }
 const p=f.store.read('new'),view=await f.service.workflowSnapshot(p);assert.equal(view.canRelease.allowed,true,JSON.stringify(view));assert.equal(p.handoffReports.length,2);assert.equal(p.researchHandoffDeclarations.length,2);
 const request={artifactId:f.artifactId,contentHash:p.artifacts[0].contentHash,basisHash:view.basisHash,policyVersion:p.policies.at(-1).version,commandId:'explicit-engineering-release',expectedRevision:p.revision},report=p.researchReaderReports[0],bytes=await readFile(report.payloadRef);
 await writeFile(report.payloadRef,'{}');await assert.rejects(f.service.release('new',request,operator),{code:'ORDINARY_DOMAIN_CHANGED'});assert.equal(f.store.read('new').releases.length,0);assert.equal((await f.service.workflowSnapshot(f.store.read('new'))).canRelease.allowed,false);await writeFile(report.payloadRef,bytes);
 const receipt=await f.service.release('new',request,operator),after=f.store.read('new');assert.ok(receipt.releaseId);assert.equal(after.releases.length,1);assert.equal(after.releases[0].actorId,'engineering-test-operator');assert.equal(after.jobs.some(j=>j.stage==='strategy'),false);
 const executor=createExecutor({store:f.store,rootDir:f.root,bindings:f.bindings,providers:f.providers});assert.throws(()=>executor.continueOperatorResearch('new',{artifactId:f.artifactId,policyVersion:after.policies.at(-1).version,commandId:'not-authorized-strategy',expectedRevision:after.revision}),{code:'AUTHORIZATION_ENDPOINT'});
});
