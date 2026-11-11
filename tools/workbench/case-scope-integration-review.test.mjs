import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createProject, applyCommand, projectCaseEvidenceCatalogue, projectCatalogueState} from './project.mjs';

import {buildCaseIdentityRequest,validateCaseIdentityOutput,CASE_IDENTITY_MEANING} from './case-identity.mjs';
import {RESEARCH_DATA_VERSION,researchDataBasis} from './research-chart-data.mjs';
import {buildStageRequest,validateStageOutput} from './stage-content.mjs';
import {NUMERICAL_REVIEW_PROTOCOL} from './evidence-protocols.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const human = {actorType:'human',actorId:'human',runId:'human-run',contextId:'human-context'};
const reviewer = {actorType:'agent',actorId:'case-reviewer',runId:'review-run',contextId:'review-context'};
function fixture() {
  let p = createProject({id:'p',name:'Synthetic',brief:'Dinner packaging'},human), seq=0;
  const send=(command,context=reviewer)=>p=applyCommand(p,{...command,commandId:`command-${++seq}`,expectedRevision:p.revision},context);
  send({kind:'confirm-task-card',taskCardId:p.activeTaskCardId},human);
  const assets=['reference','source'].map((id,i)=>({id:`img_${id}`,projectId:'p',sha256:hash(id),byteLength:10+i,mediaType:'image/png',width:2,height:2,uploadedAt:'2026-10-25',provenance:{representation:'supplied_image'}}));
  for(const asset of assets)send({kind:'register-image',asset});
  const page='https://example.test/case',image='https://example.test/source.png';
  function capsule(url,mimeType,text,sha256,byteLength,images=[]) {
    const record={schemaVersion:1,requestedUrl:url,normalizedRequestedUrl:url,finalUrl:url,redirects:[],retrievedAt:'2026-10-25',httpStatus:200,mimeType,raw:{sha256,byteLength,file:`raw/${sha256}.bin`},extraction:{method:text?'static-html-tokenizer-v1':'none',text,textHash:hash(text),images}};
    return {record,recordHash:hash(JSON.stringify(record,null,2)+'\n')};
  }
  const pageCapture=capsule(page,'text/html','Brand Product dinner packaging',hash('page'),20,[{url:image}]);
  const sourceImageCapture=capsule(image,'image/png','',assets[1].sha256,assets[1].byteLength);
  for(const [i,capture] of [pageCapture,sourceImageCapture].entries()) {
    const jobId=`capture-${i}`,attemptId=`capture-attempt-${i}`;
    send({kind:'request-source-capture',jobId,task:{id:jobId,url:capture.record.requestedUrl}});
    send({kind:'start-job',jobId,attemptId},{actorType:'agent',actorId:`acquisition-${i}`,runId:`acquisition-run-${i}`,contextId:`acquisition-context-${i}`});
    send({kind:'complete-source-capture',jobId,attemptId,capture:{...capture,id:`capture_${capture.recordHash}`,projectId:'p',recordPath:`/synthetic/${capture.recordHash}.json`}},{actorType:'agent',actorId:`acquisition-${i}`,runId:`acquisition-run-${i}`,contextId:`acquisition-context-${i}`});
  }
  const descriptor=asset=>({imageId:asset.id,sha256:asset.sha256,byteLength:asset.byteLength,mediaType:asset.mediaType});
  const binding={providerId:'synthetic',model:'synthetic',role:'independent-reviewer'};
  const input={taskCard:p.taskCards[0],pageCapture,sourceImageCapture,referenceImage:descriptor(assets[0]),sourceImage:{...descriptor(assets[1]),sourceImageUrl:image}};
  const researchTask=(id,sourceRecords=[])=>({id,parentId:'p',owner:'research',taskCardId:p.activeTaskCardId,brief:p.taskCards[0].brief,
    researchContractVersion:RESEARCH_DATA_VERSION,researchDataBasis:researchDataBasis({taskCard:p.taskCards[0],confirmations:p.confirmations,sourceRecords}),sourceRecords,visualCatalogue:[]});
  return {send,get:()=>p,binding,input,researchTask};
}
test('case identity rejects a reviewer actor who is an ancestor of an earlier failed author',()=>{
  const f=fixture();
  const author={actorType:'agent',actorId:'author-child',runId:'author-run',contextId:'author-context',ancestorActorIds:[reviewer.actorId]};
  f.send({kind:'request-stage',stage:'research',jobId:'research',binding:f.binding,task:f.researchTask('research-task')},author);
  f.send({kind:'start-job',jobId:'research',attemptId:'research-attempt'},author);
  f.send({kind:'finish-job-error',jobId:'research',attemptId:'research-attempt',status:'failed',error:{code:'SYNTHETIC_FAILURE',message:'Synthetic failure'}},author);
  f.send({kind:'request-case-identity',jobId:'identity',binding:f.binding,task:{id:'identity-task',parentId:'p',owner:'identity',caseIdentityInput:f.input}});
  assert.throws(()=>f.send({kind:'start-job',jobId:'identity',attemptId:'identity-attempt'}),{code:'SELF_REVIEW'});
});

function completeIdentity(f, {id, input=f.input, usable=true}) {
  const context={actorType:'agent',actorId:`reviewer-${id}`,runId:`reviewer-run-${id}`,contextId:`reviewer-context-${id}`};
  const taskId=`task-${id}`,attemptId=`attempt-${id}`;
  f.send({kind:'request-case-identity',jobId:id,binding:f.binding,task:{id:taskId,parentId:'p',owner:'identity',caseIdentityInput:input}},context);
  f.send({kind:'start-job',jobId:id,attemptId},context);
  const request=buildCaseIdentityRequest(input),packet=request.packet;
  const ref={location:'/pageCapture/record/extraction/text',quote:'Brand Product dinner packaging'};
  const finding=value=>({status:'supported',value,reason:'Attributed case text',refs:[ref],pixels:[]});
  const unknown={status:'unknown',value:'unknown',reason:'No edition or date',refs:[],pixels:[]};
  const rawReport={protocolVersion:packet.protocolVersion,packetHash:packet.packetHash,actualImageManifestHash:packet.actualImageManifestHash,identityMeaning:CASE_IDENTITY_MEANING,
    fields:{brand:finding('Brand'),product:finding('Product'),use:finding('dinner packaging'),edition:unknown,time:unknown},
    imageMatch:{status:usable?'supported':'uncertain',reason:'Independent assessment',refs:[ref],pixels:packet.orderedImages.map(image=>({imageId:image.imageId,imageSha256:image.sha256,region:'center',observation:'Package silhouette'}))},
    taskFit:{status:'same_use',reason:'Same packaging use',refs:[ref,{location:'/taskCard/brief',quote:'Dinner packaging'}]},verdict:usable?'usable':'blocked',limitations:['Captured attribution only']};
  const executionReceipt={attemptId,runId:attemptId,providerId:f.binding.providerId,model:f.binding.model,requestedModel:f.binding.model,role:f.binding.role,taskId,threadId:`thread-${id}`,exitCode:0,images:request.manifest,responseText:JSON.stringify(rawReport),inputPacketHash:hash(JSON.stringify({runId:attemptId,model:f.binding.model,prompt:request.prompt,outputSchema:request.outputSchema,images:request.manifest}))};
  // Validation appends standard limits before hashing the persisted report.
  return {context,executionReceipt,rawReport,id,attemptId};
}

test('a later blocked identity with identical bytes and different uploaded IDs invalidates earlier usable evidence',async()=>{
  const {validateCaseIdentityOutput}=await import('./case-identity.mjs');
  const f=fixture();
  function finish(params) {
    const result=completeIdentity(f,params),input=params.input??f.input;
    const validated=validateCaseIdentityOutput(result.rawReport,input,[input.referenceImage,input.sourceImage]);
    f.send({kind:'complete-case-identity',jobId:result.id,attemptId:result.attemptId,reportId:`report-${result.id}`,rawReport:result.rawReport,payloadRef:`/synthetic/${result.id}.json`,contentHash:hash(JSON.stringify(validated,null,2)),executionReceipt:result.executionReceipt},result.context);
  }
  finish({id:'positive'});
  const prior=projectCaseEvidenceCatalogue(f.get())[0];assert.ok(prior);
  const input=structuredClone(f.input);
  const oldAsset=f.get().imageAssets.find(asset=>asset.id===input.sourceImage.imageId);
  const newAsset={...structuredClone(oldAsset),id:'img_recaptured_same_bytes'};
  f.send({kind:'register-image',asset:newAsset});
  input.sourceImage.imageId=newAsset.id;
  input.sourceImageCapture.record.retrievedAt='2026-10-25T01:00:00Z';
  input.sourceImageCapture.recordHash=hash(JSON.stringify(input.sourceImageCapture.record,null,2)+'\n');
  const acquisition={actorType:'agent',actorId:'acquisition-repeat',runId:'acquisition-repeat-run',contextId:'acquisition-repeat-context'};
  f.send({kind:'request-source-capture',jobId:'capture-repeat',task:{id:'capture-repeat',url:input.sourceImageCapture.record.requestedUrl}},acquisition);
  f.send({kind:'start-job',jobId:'capture-repeat',attemptId:'capture-repeat-attempt'},acquisition);
  f.send({kind:'complete-source-capture',jobId:'capture-repeat',attemptId:'capture-repeat-attempt',capture:{...input.sourceImageCapture,id:`capture_${input.sourceImageCapture.recordHash}`,projectId:'p',recordPath:'/synthetic/recaptured.json'}},acquisition);
  finish({id:'negative',input,usable:false});
  assert.equal(f.get().caseIdentityReviews.length,2);
  let catalogue;
  try {catalogue=projectCaseEvidenceCatalogue(f.get());} catch(error) {assert.equal(error.code,'INVALID_CASE_IDENTITY');return;}
  assert.equal(catalogue.some(record=>record.id===prior.id),false,'A retained blocked review of the same task/page/source-image/reference bytes must prevent reuse of the earlier usable case');
});

function finishIdentity(f, id = 'positive', usable = true) {
  const result = completeIdentity(f, {id, usable});
  const validated = validateCaseIdentityOutput(result.rawReport, f.input, [f.input.referenceImage, f.input.sourceImage]);
  f.send({kind: 'complete-case-identity', jobId: result.id, attemptId: result.attemptId, reportId: `report-${result.id}`,
    rawReport: result.rawReport, payloadRef: `/synthetic/${result.id}.json`, contentHash: hash(JSON.stringify(validated, null, 2)), executionReceipt: result.executionReceipt}, result.context);
}
const artifactFor = records => ({technicalReceipts: {sourceCatalogue: {records}}});
test('trusted catalogue state projects only exact immutable successful independent case records', () => {
  const f = fixture(); finishIdentity(f);
  const p = f.get(), source = projectCaseEvidenceCatalogue(p)[0], artifact = artifactFor([source]);
  const state = projectCatalogueState(p, artifact);
  assert.equal(state.length, 1);
  assert.deepEqual(Object.keys(state[0]), ['sourceId', 'sourceRecordHash', 'taskCardId', 'caseReviewId', 'caseReviewHash', 'casePacketHash', 'identityStatus', 'taskFit', 'sourceVerification']);
  assert.equal(state[0].sourceId, source.id);
  assert.equal(state[0].caseReviewId, 'report-positive');
  assert.equal(state[0].caseReviewHash, p.caseIdentityReviews[0].reportHash);
  assert.equal(state[0].casePacketHash, source.caseIdentity.packetHash);
  assert.equal(state[0].sourceVerification, 'captured');
  assert.deepEqual(projectCatalogueState(p, artifactFor([{...source, text: 'forged'}])), []);
  assert.deepEqual(projectCatalogueState(p, artifactFor([{id: 'notes', url: 'https://example.test/', text: 'operator text', identityStatus: 'identity_checked', verification: 'captured'}])), []);
  const stale = structuredClone(p); stale.activeTaskCardId = 'stale-task';
  assert.deepEqual(projectCatalogueState(stale, artifact), []);
});
test('trusted catalogue state rejects changed reports, execution receipts and provenance', () => {
  const f = fixture(); finishIdentity(f);
  const original = f.get(), artifact = artifactFor(projectCaseEvidenceCatalogue(original));
  for (const mutate of [
    p => p.caseIdentityReviews[0].rawReport.fields.brand.value = 'Changed',
    p => p.caseIdentityReviews[0].reportHash = hash('changed'),
    p => p.caseIdentityReviews[0].executionReceipt.inputPacketHash = hash('changed'),
    p => p.jobs.find(j => j.purpose === 'case_identity').attempts[0].receipt.inputPacketHash = hash('changed'),
    p => p.caseIdentityReviews[0].caseEvidence.caseIdentity.packetHash = hash('changed'),
  ]) {
    const p = structuredClone(original); mutate(p);
    assert.throws(() => projectCatalogueState(p, artifact), /receipt|report|evidence|immutable|exact/i);
  }
});

test('conflicting negative case identity removes catalogue authority without deleting history', () => {
  const f = fixture(); finishIdentity(f);
  const prior = projectCaseEvidenceCatalogue(f.get())[0];
  finishIdentity(f, 'negative', false);
  assert.deepEqual(projectCatalogueState(f.get(), artifactFor([prior])), []);
  assert.equal(f.get().caseIdentityReviews.length, 2);
});
// Synthetic domain state exercises queued authority checks, not persisted originals or provider I/O.
function verificationWithState() {
  const f = fixture(); finishIdentity(f);
  const records = projectCaseEvidenceCatalogue(f.get());
  const author = {actorType: 'agent', actorId: 'research-author', runId: 'research-author-run', contextId: 'research-author-context'};
  f.send({kind: 'request-stage', stage: 'research', jobId: 'research', binding: f.binding, task: f.researchTask('research-task', records)}, author);
  f.send({kind: 'start-job', jobId: 'research', attemptId: 'research-attempt'}, author);
  const content = {researchContractVersion:RESEARCH_DATA_VERSION,chartData:null,quantitativeClaims:[],outputKind:'research_findings',status:'draft',title:'Case scope fixture',summary:'Attributed captured case',sections:[{heading:'Captured page',body:'Brand Product dinner packaging',evidenceIds:[records[0].id]}],claims:[{text:'Captured page says Brand Product dinner packaging',kind:'fact',evidenceRefs:[records[0].id],limitations:['Captured attribution only']}],gaps:[],evidenceClassifications: [{sourceId: records[0].id, scopeRelation: 'direct', reason: '已登记identity_checked且用途为same_use'}]};
  const task=f.get().jobs.find(j=>j.id==='research').task;
  const request=buildStageRequest({stage:'research',brief:task.brief,sourceRecords:records,researchContractVersion:task.researchContractVersion,researchDataBasis:task.researchDataBasis});
  const validated=validateStageOutput('research',content,{sourceRecords:records,researchContractVersion:task.researchContractVersion,researchDataBasis:task.researchDataBasis});
  const contentHash=hash(JSON.stringify(validated.content,null,2));
  const executionReceipt={...f.binding,taskId:task.id,attemptId:'research-attempt',runId:'research-attempt',requestedModel:f.binding.model,threadId:'research-author-thread',exitCode:0,responseText:JSON.stringify(content),validatedOutputHash:contentHash,inputPacketHash:hash(JSON.stringify({runId:'research-attempt',model:f.binding.model,...request}))};
  f.send({kind: 'complete-stage', jobId: 'research', attemptId: 'research-attempt', artifactId: 'research-artifact', payloadRef: '/synthetic/research.json', contentHash, claims: validated.claims, technicalReceipts: {sourceCatalogue: {version:1,records}}, executionReceipt}, author);
  const p = f.get(), artifact = p.artifacts[0];
  const input = {reviewProtocolVersion: NUMERICAL_REVIEW_PROTOCOL, catalogueState: projectCatalogueState(p, artifact),researchDataBasis:task.researchDataBasis,
    artifactId: artifact.id, contentHash: artifact.contentHash, content:validated.content, taskCard: f.input.taskCard, taskCardConfirmed: true, sourceRecords: records};
  f.send({kind: 'request-verification', artifactId: artifact.id, jobId: 'verify-state', binding: f.binding,
    task: {id: 'verify-state-task', owner: 'verification', parentId: 'p', verificationInput: input}});
  return f;
}
test('queued v4 verification rechecks authority before dispatch instead of trusting frozen metadata alone', async t => {
  const f = verificationWithState();
  const context = {actorType: 'agent', actorId: 'verification-agent', runId: 'verification-run', contextId: 'verification-context'};
  const original = f.get();
  for (const [name,mutate,code] of [
    ['changed case identity report field',p => p.caseIdentityReviews[0].rawReport.fields.brand.value = 'tampered','INVALID_EXECUTION_RECEIPT'],
    ['changed retained case identity attempt receipt hash',p => p.jobs.find(j => j.purpose === 'case_identity').attempts[0].receipt.inputPacketHash = hash('tampered'),'INVALID_CASE_IDENTITY'],
    ['changed research source catalogue and verification source text',p => { const source = p.artifacts[0].technicalReceipts.sourceCatalogue.records[0]; source.text = 'tampered'; p.jobs.find(j => j.purpose === 'verification').task.verificationInput.sourceRecords[0].text = 'tampered'; },'INVALID_VERIFICATION_INPUT'],
    ['changed queued verification catalogue case review hash',p => p.jobs.find(j => j.purpose === 'verification').task.verificationInput.catalogueState[0].caseReviewHash = hash('tampered'),'INVALID_VERIFICATION_INPUT'],
  ]) {
    await t.test(name, () => {
      const p = structuredClone(original); mutate(p);
      assert.throws(() => applyCommand(p, {kind: 'start-job', jobId: 'verify-state', attemptId: 'verify-state-attempt', commandId: 'start-tampered', expectedRevision: p.revision}, context),{code});
    });
  }
  f.send({kind: 'start-job', jobId: 'verify-state', attemptId: 'verify-state-attempt'}, context);
  assert.equal(f.get().jobs.find(j => j.id === 'verify-state').status, 'running');
});
