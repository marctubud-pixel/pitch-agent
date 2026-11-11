import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createProject,applyCommand} from './project.mjs';
import {feedbackHash,validateFeedbackReviewOutput} from './human-feedback.mjs';
import {buildLocalContributionPlan} from './local-contribution-plan.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex'),basis='a'.repeat(64),human={actorType:'human',actorId:'explicit-test-human',runId:'test-run',contextId:'test-context'};
function fixture(stage='copy'){
 const project=structuredClone(createProject({id:'p',name:'得闲',brief:'25岁年轻人社交；轻型为轻松社交表达；度数未定。',mode:'assisted'},human));
 const content=JSON.stringify({directions:[{id:'steady'},{id:'product'},{id:'user'}],summary:'度数未定。'});
 project.artifacts.push({id:'current',stage,contentHash:sha(content),inputVersionIds:[project.activeTaskCardId],technicalReceipts:{sourceCatalogue:{records:[]},visualCatalogue:[]}});project.activeByStage[stage]='current';
 project.imageAssets.push({id:'img_user',projectId:'p',sha256:'b'.repeat(64),mediaType:'image/png',byteLength:10,width:2,height:2});
 return {project,content};
}
function request(module,contribution){return {commandId:'explicit-user-idea',module,decision:'revise',expectedBasisHash:basis,comment:'保留原稿',contribution};}
function plan(f,r){return buildLocalContributionPlan({project:f.project,request:r,currentModule:r.module,currentBasisHash:basis,artifactContentText:f.content});}
test('strategy opinion and copy theme produce native-accepted plans without changing actual project',()=>{
 for(const [stage,c]of [['strategy',{kind:'strategy_opinion',instructions:'强调轻松社交，不解释为低度酒。'}],['copy',{kind:'copy_theme',text:'得闲，慢慢聊',intendedUse:'主题备选，不当用户调查事实'}]]){
  const f=fixture(stage),before=structuredClone(f.project),p=plan(f,request(stage,c));assert.deepEqual(f.project,before);
  const submitted=applyCommand(f.project,p.proposal,human);assert.equal(submitted.humanFeedback.length,1);assert.equal(submitted.humanFeedback[0].artifactHash,sha(f.content));assert.equal(p.disposition,'pending_review');assert.equal(p.factualAuthority,false);assert.equal(p.semanticReviewVerified,false);assert.deepEqual(p.sourcePins.policy,f.project.policies.at(-1));assert.match(f.project.taskCards[0].brief,/25岁.*度数未定/);
 }
});
test('reference plan reuses native exact-copy/direction/profile/limits validation',()=>{
 const f=fixture(),c={kind:'reference_image',imageId:'img_user',directionId:'steady',borrowingNote:'只借鉴留白构图，不推断偏好。',referenceKind:'component',applicabilityProfile:'composition_component'},p=plan(f,request('references',c));
 const submitted=applyCommand(f.project,p.proposal,human);assert.equal(submitted.referenceMaterials.length,1);assert.equal(submitted.referenceMaterials[0].provenance.kind,'manual_supplied');assert.equal(p.imagePin.sha256,'b'.repeat(64));assert.equal(f.project.referenceMaterials,undefined);
 for(const change of [{applicabilityProfile:'direction'},{referenceKind:'direction'},{directionId:'unknown'},{region:[0,0,2,1]},{visibleRegion:[0,0,1,1]}])assert.throws(()=>plan(f,request('references',{...c,...change})));
});
test('stable command and source pins change with source; stale basis rejects before proposal',()=>{
 const f=fixture(),r=request('copy',{kind:'copy_theme',text:'得闲',intendedUse:'候选主题'}),a=plan(f,r),b=plan(f,r);assert.deepEqual(a,b);f.project.revision++;assert.equal(plan(f,r).proposal.commandId,a.proposal.commandId);assert.notEqual(plan(f,r).sourcePins.projectRevision,a.sourcePins.projectRevision);
 assert.throws(()=>buildLocalContributionPlan({project:f.project,request:r,currentModule:'copy',currentBasisHash:'c'.repeat(64)}),{code:'LOCAL_CONTRIBUTION_STALE'});
 assert.throws(()=>plan(f,{...r,decision:'approve'}),{code:'LOCAL_CONTRIBUTION_REVISION_REQUIRED'});
 assert.throws(()=>buildLocalContributionPlan({project:f.project,request:r,currentModule:'strategy',currentBasisHash:basis}),{code:'LOCAL_CONTRIBUTION_MODULE_INVALID'});
});
test('unknown authority fields, cross-project images and unsupported values reject without effects',()=>{
 const f=fixture(),c={kind:'copy_theme',text:'每个人都喜欢',intendedUse:'人类创意提议，不是调查证据'},r=request('copy',c),before=structuredClone(f.project);
 for(const change of [{verified:true},{evidence:[]},{artifactId:'override'},{source:{}},{directionId:'unsupported'},{text:'a'.repeat(20001)}])assert.throws(()=>plan(f,{...r,contribution:{...c,...change}}));
 assert.throws(()=>plan(f,{...r,artifactContentText:'override'}));
 const ref={kind:'reference_image',imageId:'img_user',directionId:'steady',borrowingNote:'借鉴构图',referenceKind:'direction',applicabilityProfile:'direction'};
 f.project.imageAssets[0].projectId='other';assert.throws(()=>plan(f,request('references',ref)),{code:'LOCAL_CONTRIBUTION_IMAGE_REQUIRED'});f.project.imageAssets[0].projectId='p';assert.throws(()=>plan(f,request('references',{...ref,imageId:'missing'})),{code:'LOCAL_CONTRIBUTION_IMAGE_REQUIRED'});assert.deepEqual(f.project,before);
 const p=plan(f,r);assert.equal(p.claimsUnverified,true);assert.equal(p.contribution.text,c.text,'No keyword-based claim sanitizing or semantic approval');
});
test('native reviewer cannot mark factual risk addressed even when producer reports applied',()=>{
 const f=fixture(),p=plan(f,request('copy',{kind:'copy_theme',text:'人人都爱',intendedUse:'用户意见，事实未核验'})),item={id:p.proposal.feedbackId,instructions:'',themes:p.proposal.themes,materials:[]},feedback=[item],content={summary:'人人都爱'};
 const revisionInput={revisionOf:{artifactId:'current',contentHash:sha(f.content)},taskCardId:f.project.activeTaskCardId,policyVersion:1,baseContent:JSON.parse(f.content),feedback,feedbackHash:feedbackHash(feedback),materials:[]};
 const input={artifactId:'revised',contentHash:'d'.repeat(64),content,revisionInput,responses:[{feedbackId:item.id,action:'applied',explanation:'仅演练producer回应',outputLocations:[{location:'/summary',quote:'人人都爱'}]}]};
 const report={protocolVersion:'human-feedback-v1',artifactId:'revised',contentHash:input.contentHash,feedbackHash:revisionInput.feedbackHash,findings:[{feedbackId:item.id,status:'addressed',category:'factual_risk',reason:'没有调查证据',refs:[{location:'/summary',quote:'人人都爱'}]}],limitations:['Schema guard only, not a real model review.']};
 assert.throws(()=>validateFeedbackReviewOutput(report,input),{code:'INVALID_HUMAN_FEEDBACK'});report.findings[0].status='unresolved';assert.equal(validateFeedbackReviewOutput(report,input).hasBlockingFindings,true);
});

test('native dry-validation preserves human-only authority and per-direction reference cap',()=>{
 const f=fixture(),copy=plan(f,request('copy',{kind:'copy_theme',text:'得闲',intendedUse:'候选'}));
 assert.throws(()=>applyCommand(f.project,copy.proposal,{...human,actorType:'agent'}),{code:'HUMAN_REQUIRED'});
 const c={kind:'reference_image',imageId:'img_user',directionId:'steady',borrowingNote:'只参考构图',referenceKind:'direction',applicabilityProfile:'direction'};
 f.project.referenceMaterials=Array.from({length:12},(_,i)=>({id:'existing-'+i,artifactId:'current',directionId:'steady',image:{sha256:'b'.repeat(64)}}));
 assert.throws(()=>plan(f,request('references',c)));assert.equal(f.project.referenceMaterials.length,12);
 const broken=fixture();broken.project.taskCards=[];assert.throws(()=>plan(broken,request('copy',{kind:'copy_theme',text:'得闲',intendedUse:'候选'})),{code:'LOCAL_CONTRIBUTION_TASK_REQUIRED'});
});
