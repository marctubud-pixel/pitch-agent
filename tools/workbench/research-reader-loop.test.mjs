import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateStageOutput} from './stage-content.mjs';
import {projectResearchReaderReport,buildResearchReaderPacket,buildResearchReaderRequest,validateResearchReaderOutput,researchReaderEligibility,RESEARCH_READER_PROTOCOL} from './research-reader-loop.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
function input(){const contentText=JSON.stringify({title:'研究',sections:[{body:'市场在增长；人群行为未知。'}]});return {taskCard:{id:'task-1',purpose:'理解包装中的识别任务'},artifactId:'research-1',contentHash:sha(contentText),contentText,method:{id:'design-research-lead',version:'r7-20261109',sha256:'a'.repeat(64)},questionRegistration:{id:'questions-1',taskCardId:'task-1',questions:[{id:'q1',question:'谁在何处识别产品？',critical:true}]},visibleReport:projectResearchReaderReport(contentText),phase:'first_read',previous:null};}
function answer(p){const loc={location:'/sections/0/body',quote:'市场在增长'};return {protocolVersion:RESEARCH_READER_PROTOCOL,packetHash:p.packetHash,phase:p.phase,retellings:['market','audience','competition','product','carrier','synthesis'].map(dimension=>({dimension,understanding:'材料显示增长，但选择行为未知。',classification:'mixed',locations:[loc]})),answers:p.questionRegistration.questions.map(q=>({questionId:q.id,status:'answered',answer:'只能说明研究中的识别任务，效果未知。',locations:[loc]})),connections:[{dimensions:['market','audience'],explanation:'市场增长不证明人群识别。',strategyConstraint:'不能预选包装风格。',limitations:'实际选择仍需取证。',locations:[loc]}],issues:[],rechecks:[],limitations:['合成读者回答不是真实消费者。']};}
test('reader packet binds exact source bytes and excludes extra author/reviewer metadata',()=>{const i=input();const p=buildResearchReaderPacket(i);assert.equal(p.contentHash,i.contentHash);assert.throws(()=>buildResearchReaderPacket({...i,authorRecommendation:'选这个'}));assert.throws(()=>buildResearchReaderPacket({...i,contentHash:'b'.repeat(64)}));assert.ok(!buildResearchReaderRequest(p).prompt.includes('authorRecommendation'));});
test('independent retelling completion never certifies facts or human approval',()=>{const p=buildResearchReaderPacket(input()),r=answer(p);const state=researchReaderEligibility(p,r);assert.equal(state.understandingComplete,true);assert.equal(state.factualSufficiencyVerified,false);assert.equal(state.humanApproval,false);assert.equal(state.consumerValidation,false);assert.ok(buildResearchReaderRequest(p).outputSchema);});
test('critical unanswered questions and major misunderstandings block completion',()=>{const p=buildResearchReaderPacket(input()),r=answer(p);r.answers[0].status='unresolved';r.issues.push({id:'i1',type:'understanding',severity:'major',questionIds:['q1'],detail:'把供给增长理解成消费者偏好。',locations:r.answers[0].locations});assert.deepEqual(researchReaderEligibility(p,r).blocking,['question:q1','issue:i1']);});
test('invented evidence, missing dimensions and duplicate synthesis cannot pass',()=>{const p=buildResearchReaderPacket(input());let r=answer(p);r.answers[0].locations[0].quote='无此结论';assert.throws(()=>validateResearchReaderOutput(r,p));r=answer(p);r.retellings.pop();assert.throws(()=>validateResearchReaderOutput(r,p));r=answer(p);r.connections[0].dimensions=['market','market'];assert.throws(()=>validateResearchReaderOutput(r,p));const i=input();i.visibleReport.blocks[0].text='作者改写但不在原稿';assert.throws(()=>buildResearchReaderPacket(i));});
function revision(){const first=buildResearchReaderPacket(input()),raw=answer(first);raw.issues.push({id:'i1',type:'understanding',severity:'major',questionIds:['q1'],detail:'不清楚供给与需求区别。',locations:[{location:'/sections/0/body',quote:'市场在增长'}]});const i=input();i.phase='recheck';i.artifactId='research-2';i.contentText=JSON.stringify({title:'研究修订',sections:[{body:'市场在增长；这是供给增长，不能证明选择偏好。'}]});i.contentHash=sha(i.contentText);i.visibleReport=projectResearchReaderReport(i.contentText);i.previous={packet:first,rawReport:raw,dispositions:[{issueId:'i1',action:'clarified',response:'将区别写入实际正文。',locations:[{location:'/sections/0/body',quote:'不能证明选择偏好'}]}]};return i;}
test('recheck reads revised source and independently resolves each original issue',()=>{const i=revision(),p=buildResearchReaderPacket(i),r=answer(p);assert.throws(()=>validateResearchReaderOutput(r,p));r.rechecks=[{issueId:'i1',status:'unresolved',explanation:'仍有误解。',locations:[{location:'/sections/0/body',quote:'不能证明选择偏好'}]}];assert.equal(researchReaderEligibility(p,r).understandingComplete,false);r.rechecks[0].status='resolved';assert.equal(researchReaderEligibility(p,r).understandingComplete,true);assert.equal(p.previous.reportHash.length,64);});
test('author reply alone, wrong task and old report cannot impersonate revised review',()=>{let i=revision();i.contentHash=i.previous.packet.contentHash;i.artifactId=i.previous.packet.artifactId;i.contentText=input().contentText;i.visibleReport=input().visibleReport;assert.throws(()=>buildResearchReaderPacket(i));i=revision();i.questionRegistration.questions[0].question='另一个问题';assert.throws(()=>buildResearchReaderPacket(i));i=revision();i.previous.dispositions=[];assert.throws(()=>buildResearchReaderPacket(i));i=revision();i.previous.dispositions[0].action='unresolved';const p=buildResearchReaderPacket(i),r=answer(p);r.rechecks=[{issueId:'i1',status:'resolved',explanation:'只接受作者声明。',locations:r.answers[0].locations}];assert.throws(()=>validateResearchReaderOutput(r,p));});
test('first read refuses prior reviews, unsupported method and hidden recommendation locations',()=>{let i=input();i.previous=revision().previous;assert.throws(()=>buildResearchReaderPacket(i));i=input();i.method.version='r6';assert.throws(()=>buildResearchReaderPacket(i));i=input();i.visibleReport.blocks[0].location='/authorRecommendation';assert.throws(()=>buildResearchReaderPacket(i));});
test('rehashing an injected prior score does not turn it into a valid blind packet',()=>{const p=buildResearchReaderPacket(input());p.oldScores=[5];const {packetHash,...body}=p;p.packetHash=sha(JSON.stringify(body));assert.throws(()=>buildResearchReaderRequest(p));});
test('critical missing evidence remains blocking even when marked minor',()=>{const p=buildResearchReaderPacket(input()),r=answer(p);r.issues=[{id:'missing-q1',type:'missing_evidence',severity:'minor',questionIds:['q1'],detail:'关键人群依据仍缺。',locations:r.answers[0].locations}];assert.equal(researchReaderEligibility(p,r).understandingComplete,false);});

test('actual producer headings, claim limitations and gaps all reach the first reader',()=>{
  const content=validateStageOutput('research',{outputKind:'research_plan',status:'blocked',title:'研究待补',summary:'供给增加不说明需求。',sections:[{heading:'人群仍未知',body:'市场在增长；人群行为未知。',evidenceIds:[]}],claims:[{text:'仅可提出识别假设。',kind:'inference',evidenceRefs:[],limitations:['不能推成消费者偏好。']}],gaps:['关键中国人群证据尚缺。'],evidenceClassifications:[]});
  const i=input();i.contentText=JSON.stringify(content);i.contentHash=sha(i.contentText);
  i.visibleReport.blocks=[{location:'/title',text:content.title},{location:'/summary',text:content.summary},{location:'/sections/0/heading',text:content.sections[0].heading},{location:'/sections/0/body',text:content.sections[0].body},{location:'/claims/0/text',text:content.claims[0].text},{location:'/claims/0/kind',text:content.claims[0].kind},{location:'/claims/0/limitations/0',text:content.claims[0].limitations[0]},{location:'/gaps/0',text:content.gaps[0]}];
  const p=buildResearchReaderPacket(i);assert.ok(buildResearchReaderRequest(p).prompt.includes('关键中国人群证据尚缺。'));
  assert.throws(()=>buildResearchReaderPacket({...i,visibleReport:{...i.visibleReport,blocks:i.visibleReport.blocks.filter(b=>!b.location.startsWith('/gaps/')&&!b.location.includes('/limitations/'))}}));
  assert.throws(()=>buildResearchReaderPacket({...i,visibleReport:{...i.visibleReport,blocks:i.visibleReport.blocks.filter(b=>b.location==='/summary')}}));
});
test('persisted packet cannot rehash malformed or duplicate rendered page identities',()=>{
  for(const renderings of [
    [{pageId:'p',sha256:'not-a-sha'}],
    [{pageId:'p',sha256:'a'.repeat(64)},{pageId:'p',sha256:'b'.repeat(64)}],
    [{pageId:'p',sha256:'not-a-sha'},{pageId:'p',sha256:'also-not-a-sha'}],
  ]){
    const i=input();i.visibleReport.renderings=renderings;assert.throws(()=>buildResearchReaderPacket(i));
    const p=buildResearchReaderPacket(input());p.visibleReport.renderings=renderings;const {packetHash,...body}=p;p.packetHash=sha(JSON.stringify(body));
    assert.throws(()=>buildResearchReaderRequest(p));assert.throws(()=>validateResearchReaderOutput(answer(p),p));
  }
});
function nativePlan({claims=1,sections=1,body='市场在增长；人群行为未知。'}={}) {
  return validateStageOutput('research',{outputKind:'research_plan',status:'blocked',title:'研究待补',summary:'供给增加不说明需求。',sections:Array.from({length:sections},()=>({heading:'人群仍未知',body,evidenceIds:[]})),claims:Array.from({length:claims},()=>({text:'仅可提出识别假设。',kind:'inference',evidenceRefs:[],limitations:['不能推成消费者偏好。']})),gaps:['关键中国人群证据尚缺。'],evidenceClassifications:[]});
}
test('a native 33-claim report preserves all 104 visible blocks',()=>{
  const i=input();i.contentText=JSON.stringify(nativePlan({claims:33}));i.contentHash=sha(i.contentText);i.visibleReport=projectResearchReaderReport(i.contentText);
  assert.equal(i.visibleReport.blocks.length,104);
  const p=buildResearchReaderPacket(i);assert.ok(buildResearchReaderRequest(p).prompt.includes('/claims/32/limitations/0'));
});
test('whole source JSON can exceed a single-field limit while staying within reader packet budget',()=>{
  const i=input();i.contentText=JSON.stringify(nativePlan({sections:6,body:'研'.repeat(18000)}));assert.ok(i.contentText.length>100000);
  i.contentHash=sha(i.contentText);i.visibleReport=projectResearchReaderReport(i.contentText);const p=buildResearchReaderPacket(i);
  assert.ok(Buffer.byteLength(JSON.stringify(p))<1024*1024);assert.doesNotThrow(()=>buildResearchReaderRequest(p));
  const r=answer(p);r.limitations=Array.from({length:101},()=> '限制');assert.throws(()=>validateResearchReaderOutput(r,p),/Bounded array required/);
});
test('native report content still cannot exceed the one MiB byte budget',()=>{
  const contentText=JSON.stringify(nativePlan({sections:20,body:'研'.repeat(18000)}));
  assert.ok(Buffer.byteLength(contentText)>1024*1024);
  assert.throws(()=>projectResearchReaderReport(contentText),/Reader source exceeds 1 MiB/);
});
test('internal source and projection copies have separate byte budgets',()=>{
  const content=nativePlan({sections:8,body:'研'.repeat(18000)});
  const i=input();i.contentText=JSON.stringify(content);i.contentHash=sha(i.contentText);i.visibleReport=projectResearchReaderReport(i.contentText);
  assert.ok(Buffer.byteLength(i.contentText)<1024*1024);
  assert.ok(Buffer.byteLength(JSON.stringify(i))>1024*1024);
  const p=buildResearchReaderPacket(i);assert.ok(Buffer.byteLength(JSON.stringify(p))<1024*1024);
  assert.equal(p.visibleReport.blocks.length,22);assert.doesNotThrow(()=>buildResearchReaderRequest(p));
});
test('separate source budget does not permit an oversized final reader packet',()=>{
  const i=input();i.contentText=JSON.stringify(nativePlan({sections:4,body:'研'.repeat(18000)}));i.contentHash=sha(i.contentText);i.visibleReport=projectResearchReaderReport(i.contentText);
  i.questionRegistration.questions=Array.from({length:100},(_,n)=>({id:`q${n}`,question:'q'.repeat(9000),critical:true}));
  assert.ok(Buffer.byteLength(i.contentText)<1024*1024);
  assert.throws(()=>buildResearchReaderPacket(i),/Reader packet exceeds 1 MiB/);
});
