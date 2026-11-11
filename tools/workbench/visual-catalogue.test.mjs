import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildImageObservationRequest} from './image-evidence.mjs';
import {buildImageObservationReviewRequest, buildAcceptedImageFeatureCatalogue} from './image-observation-review.mjs';
import {buildVisualCatalogue, validateVisualCatalogue, visualCitation} from './visual-catalogue.mjs';
import {buildStageRequest, validateStageOutput} from './stage-content.mjs';
import {buildEvidenceReviewRequest, validateEvidenceReviewOutput, evidenceClaimManifest} from './evidence-review.mjs';
import {buildResearchReadinessRequest, buildResearchReadinessPacket, validateResearchReadinessOutput} from './research-readiness.mjs';
import {buildResearchHandoffPacket} from './research-handoff.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
function fixture() {
  const images = [{imageId:'img_one',sha256:'a'.repeat(64),mediaType:'image/png',byteLength:123}];
  const taskCard = {id:'card',brief:'研究包装可见特征，支持探索性策略。'};
  const rawReport = {manifestHash:buildImageObservationRequest({images}).manifestHash,observations:[{imageId:'img_one',imageSha256:images[0].sha256,visibleFeatures:[{id:'shape',description:'瓶身轮廓为方形',region:'中央'}],legibleText:[{id:'word',transcription:'示例',region:'顶部'}],uncertainties:['无法确认材质'],limitations:['图片不能证明真实材质或消费者偏好']}]};
  const observation={id:'obs',images,taskCard,rawReport,reportHash:hash(JSON.stringify(rawReport,null,2)),jobId:'observe',attemptId:'oa',executionReceipt:{exitCode:0,threadId:'observer'}};
  const req=buildImageObservationReviewRequest({images,rawReport});
  const rawReview={manifestHash:req.manifestHash,observationHash:req.observationHash,findings:[{id:'shape',status:'supported',reason:'轮廓可见'},{id:'word',status:'uncertain',reason:'字不清'}]};
  const review={id:'review',observationId:'obs',observationContentHash:observation.reportHash,images,taskCard,rawReport:rawReview,reportHash:hash(JSON.stringify(rawReview,null,2)),observationHash:req.observationHash,jobId:'reviewjob',attemptId:'ra',executionReceipt:{exitCode:0,threadId:'reviewer'},acceptedCatalogue:buildAcceptedImageFeatureCatalogue({images,rawReport,rawReview})};
  const job=(report,purpose)=>({id:report.jobId,purpose,status:'succeeded',outputVersionIds:[report.id],attempts:[{id:report.attemptId,status:'succeeded',receipt:structuredClone(report.executionReceipt)}]});
  const project={activeTaskCardId:taskCard.id,taskCards:[taskCard],confirmations:[{taskCardId:taskCard.id}],imageObservations:[observation],observationReviews:[review],jobs:[job(observation,'observation'),job(review,'observation_review')]};
  return {project,review,job,taskCard};
}
function input() {
  const {project,taskCard}=fixture(),visualCatalogue=buildVisualCatalogue(project),id=visualCatalogue[0].id;
  const raw={outputKind:'research_findings',status:'complete',title:'包装观察',summary:'有限图像观察',sections:[{heading:'轮廓',body:'瓶身轮廓为方形',evidenceIds:[id]}],claims:[{text:'瓶身轮廓为方形',kind:'fact',evidenceRefs:[id],limitations:['不证明材质']}],gaps:['待补用户场景证据'],evidenceClassifications:[]};
  const content=validateStageOutput('research',raw,{visualCatalogue}).content,contentText=JSON.stringify(content);
  return {artifactId:'artifact',taskCard,taskCardConfirmed:true,content,contentText,contentHash:hash(contentText),sourceRecords:[],visualCatalogue};
}
function reviewReport(i) {
  const request=buildEvidenceReviewRequest(i),p=request.outputSchema.properties;
  const report=Object.fromEntries(Object.entries(p).filter(([,s])=>s.enum?.length===1).map(([key,s])=>[key,s.enum[0]]));
  return {...report,results:[{claimKey:evidenceClaimManifest(i.content)[0].claimKey,outcome:'supported_visual',rationale:'可见轮廓支持',citations:[visualCitation(i.visualCatalogue[0])],requirementRefs:[],limitations:['不证明实际材质']}],wholeTextScan:{status:'complete',creativeClaimKeys:[],omissions:[],mismatchedCreative:[]},limitations:['像素支持不等于真实性']};
}
test('catalogue uses current registered successful observations and supported intersection across every review',()=>{
  const f=fixture(),catalogue=buildVisualCatalogue(f.project);
  assert.equal(catalogue.length,1);assert.equal(catalogue[0].id,'visual:obs:shape');assert.ok(catalogue[0].limits.includes('无法确认材质'));
  const negative=structuredClone(f.review);negative.id='negative';negative.jobId='negativejob';negative.attemptId='na';negative.rawReport.findings[0].status='unsupported';negative.reportHash=hash(JSON.stringify(negative.rawReport,null,2));negative.acceptedCatalogue=buildAcceptedImageFeatureCatalogue({images:negative.images,rawReport:f.project.imageObservations[0].rawReport,rawReview:negative.rawReport});
  f.project.observationReviews.unshift(negative);f.project.jobs.push(f.job(negative,'observation_review'));
  assert.deepEqual(buildVisualCatalogue(f.project),[]);
});
test('unregistered, unsuccessful and old task-card observations do not enter catalogue',()=>{
  for(const mutate of [p=>p.jobs.splice(0),p=>p.jobs[0].status='failed',p=>p.activeTaskCardId='new',p=>p.confirmations=[]]){const {project}=fixture();mutate(project);assert.deepEqual(buildVisualCatalogue(project),[]);}
  const {project}=fixture();project.observationReviews[0].acceptedCatalogue.features[0].description='forged';assert.throws(()=>buildVisualCatalogue(project),/Changed accepted/);
});
test('visual catalogue rejects text-source collisions, malformed hashes and forged fields',()=>{
  const catalogue=input().visualCatalogue;
  assert.throws(()=>validateVisualCatalogue(catalogue,[{id:catalogue[0].id}]),/unique/);
  for(const mutate of [v=>v[0].reviewHash='bad',v=>v[0].provenance='fake',v=>v[0].limits=[]]){const v=structuredClone(catalogue);mutate(v);assert.throws(()=>validateVisualCatalogue(v));}
});
test('visual-only stage can produce bounded findings while raw producer cannot forge frozen catalogue',()=>{
  const i=input(),req=buildStageRequest({stage:'research',brief:i.taskCard.brief,visualCatalogue:i.visualCatalogue});
  assert.ok(req.outputSchema.properties.claims.items.properties.evidenceRefs.items.enum.includes(i.visualCatalogue[0].id));assert.match(req.prompt,/separate reviewed pixel evidence/);assert.match(req.prompt,/concise findings/);
  assert.equal(i.content.claims[0].verification,'pending');assert.equal(i.content.visualCatalogue,undefined);
  assert.throws(()=>validateStageOutput('research',{...i.content,visualCatalogue:i.visualCatalogue},{visualCatalogue:i.visualCatalogue}));
});
test('visual evidence review requires exact separate citation identity and freezes catalogue manifest',()=>{
  const i=input(),report=reviewReport(i),validated=validateEvidenceReviewOutput(report,i);
  assert.equal(validated.hasBlockingFindings,false);assert.equal(validated.results[0].citations[0].start,undefined);
  for(const mutate of [r=>r.results[0].citations[0].reviewId='other',r=>r.results[0].citations[0].quote='玻璃材质',r=>r.results[0].outcome='supported_excerpt',r=>r.visualManifestHash='b'.repeat(64)]){const r=structuredClone(report);mutate(r);assert.throws(()=>validateEvidenceReviewOutput(r,i));}
  const changed=structuredClone(i);changed.visualCatalogue[0].limits.push('新增限制');assert.throws(()=>validateEvidenceReviewOutput(report,changed));
});
test('readiness packet freezes visual evidence and requires independent applicability assessment',()=>{
  const i=input(),request=buildResearchReadinessRequest(i),packet=request.packet,p=request.outputSchema.properties;
  assert.ok(Object.isFrozen(packet.visualCatalogue[0]));assert.match(request.prompt,/assess every visualCatalogue/);
  const report=Object.fromEntries(Object.entries(p).filter(([,s])=>s.enum?.length===1).map(([key,s])=>[key,s.enum[0]]));
  Object.assign(report,{verdict:'needs_research',coverage:packet.expectedCoverage.map(q=>({questionId:q.id,status:'gap',rationale:'缺用户研究',refs:[{location:'/taskCard/brief',quote:'研究包装'}],downstreamImpact:'不能推断偏好',researchNeeded:'补充场景'})),sourceAssessments:[],visualAssessments:[{visualId:i.visualCatalogue[0].id,use:'usable_with_limits',relevance:'包装轮廓',limitations:['不证明材质'],refs:[{location:'/visualCatalogue/0/text',quote:'瓶身轮廓'}]}],findings:[],downstreamUse:{allowed:[],prohibited:['不得推断偏好']},limitations:['证据有界']});
  assert.equal(validateResearchReadinessOutput(report,i).hasBlockingFindings,true);
  report.visualAssessments[0].use='not_used';assert.throws(()=>validateResearchReadinessOutput(report,i),/adopted source/);
});
test('handoff freezes visual evidence with every review and changes binding on any visual revision',()=>{
  const i=input(),v=validateEvidenceReviewOutput(reviewReport(i),i);
  const handoff={...i,side:'producer',targetStage:'strategy',ownerBinding:{providerId:'p',model:'m',role:'research_owner'},verificationReports:[v],readinessReports:[]};
  const before=buildResearchHandoffPacket(handoff);assert.ok(Object.isFrozen(before.visualCatalogue));
  const changed=structuredClone(handoff);changed.visualCatalogue[0].region='底部';assert.throws(()=>buildResearchHandoffPacket(changed));
  assert.equal(buildResearchReadinessPacket(i).visualCatalogue[0].id,i.visualCatalogue[0].id);
});
