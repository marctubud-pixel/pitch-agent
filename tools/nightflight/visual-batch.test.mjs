import assert from 'node:assert/strict';
import test from 'node:test';
import {holdSimilarPosterDirections,reviewPosterDirections,reviewVisualBatch,selectPosterRedraw} from './visual-batch.mjs';
import {imageManifest} from '../workbench/image-evidence.mjs';

const image = n => ({imageId:'image-'+n,path:'/fixture/'+n+'.png',mediaType:'image/png',byteLength:4000,sha256:String(n).repeat(64)});
const images = [1,2,3].map(image);
const slogan = '夜访昆虫，45分钟一场';
const reference = {image:image(0),threadId:'read-reference',model:'vision-reader',
  observations:{配色:'蓝紫背景配浅黄标题',布局:'标题居中，建筑占底边',景别:'整座建筑及两侧动物同框',笔法:'边缘有颗粒渐变',字体:'画面中央的粗黑体'}};
const transfers = [
  {borrow:['布局','景别','笔法'],change:['配色','字体']},
  {borrow:['配色','笔法','字体'],change:['布局','景别']},
  {borrow:['配色','布局','景别'],change:['笔法','字体']},
];
const changed = {配色:'墨绿底配白字',布局:'标题在左，人物和标本柜在右',景别:'放大至展柜半身近景',笔法:'硬边平涂色块',字体:'标题为细宋体'};
const judgment = {threadId:'comparison-request',model:'gpt-6.2-sol',inputPacketHash:'a'.repeat(64)};

function auditRows() {
  return transfers.map((plan,index)=>({candidate:index+1,checks:Object.fromEntries(Object.entries(reference.observations).map(([axis,referenceEvidence])=>{
    const retained = plan.borrow.includes(axis);
    return [axis,{referenceEvidence,candidateEvidence:retained ? referenceEvidence : changed[axis],relation:retained ? 'same' : 'different'}];
  }))}));
}

async function review({rows=auditRows(),posterTransfer={reference,transfers},missingSlogan=false,packaging=false,identity=judgment,verifiedComparators=[],productBrief,printed,makePreviews,posterIssues,innerPackets,blindWords=[],firstLooks=[],slogans=[],cropTitle,cropObserved,detailIssues,candidateImages=images,priorReview}={}) {
  const images=candidateImages;
  const calls = [];
  const batch = await reviewVisualBatch({direction:'时长',images,context:'简报',posterSlogan:slogan,posterTransfer,packagingExpected:packaging,theme:slogan,productBrief,makePreviews,cropTitle,priorReview,
    sources:packaging ? [image(4)] : [],verifiedComparators,makeBoard:async()=>({name:'包装同品类并排图'}),
    call:async(instruction,actual,schema,task)=>{
      calls.push({instruction,actual,schema,task});
      const candidate=images.findIndex(frame=>frame.sha256===actual[0]?.sha256);
      if (task.assignment==='独立读图者') return {parsedOutput:{first:firstLooks[candidate] ?? '展柜',action:'讲解',words:blindWords[candidate] ?? '预约',alternative:'展览',
        slogan:slogans[candidate] ?? (missingSlogan ? {status:'missing',text:'',location:'主标题区只见馆名'} : {status:'readable',text:slogan,location:'画面上半部'}),
        ...(innerPackets ? {innerPackets:innerPackets[candidate]} : {})}};
      if (task.assignment==='单图海报硬事实核验') return {...judgment,threadId:'single-original-'+candidate,
        parsedOutput:{artworkIssues:posterIssues?.[candidate] ?? []}};
      if (task.assignment==='海报标题原图裁片复读') return {...judgment,parsedOutput:cropObserved};
      if (task.assignment==='海报下部商品小字裁片核验') return {...judgment,parsedOutput:{artworkIssues:detailIssues}};
      if (task.assignment==='海报借改逐项核对') return {...identity,
        parsedOutput:Object.fromEntries(rows.map(row=>['candidate_'+row.candidate,row.checks]))};
      if (task.assignment==='核对同类参考') return {parsedOutput:{packaging,indices:[1]}};
      if (task.assignment==='独立核对包装本体原图') return {...identity,parsedOutput:printed[images.indexOf(actual[0])]};
      const fields = schema.properties.candidate_1.properties;
      const opinions=images.map((_,index)=>['candidate_'+(index+1),{reason:'原票认为主体清楚。',
        ...(fields.score ? {score:5} : {}),...(fields.onPackStatus ? {onPackStatus:'theme_printed'} : {}),
        ...(fields.priority ? {priority:index+1,edit:'原裁定建议放大副标。',research:'无',blocked:false} : {})}]);
      return {parsedOutput:Object.fromEntries(opinions)};
    }});
  return {batch,calls};
}

test('a centrally composed reference and two left-hand candidates yield different layout verdicts for borrowing and changing',async()=>{
  const rows = auditRows();
  rows[0].checks.布局 = {...rows[1].checks.布局};
  rows[2].checks.笔法 = {relation:'unknown',referenceEvidence:'可见颗粒边缘',candidateEvidence:'底部线条太小，笔法看不清'};
  const {batch,calls} = await review({rows:rows.reverse()});
  assert.equal(batch.winner,2);
  assert.deepEqual(batch.candidates.map(c=>[c.blocked,c.mean,c.scores.length]),[[true,5,4],[false,5,4],[true,5,4]]);
  assert.deepEqual(batch.ruling.items.map(c=>c.blocked),[false,false,false]);
  const [first,second,third] = batch.candidates;
  assert.match(first.reason,/标题居中，建筑占底边/u);
  assert.match(first.reason,/标题在左，人物和标本柜在右/u);
  assert.match(first.edit,/原裁定建议放大副标/);
  assert.match(first.edit,/布局/);
  assert.equal(first.transferAudit.checks.布局.status,'mismatch');
  assert.equal(second.transferAudit.checks.布局.status,'matched');
  assert.equal(third.transferAudit.checks.笔法.status,'unknown');
  assert.equal(batch.transferAudit.referenceThreadId,reference.threadId);
  assert.equal(batch.transferAudit.referenceSha256,reference.image.sha256);
  assert.deepEqual(batch.transferAudit.observations,reference.observations);
  assert.equal(batch.transferAudit.model,judgment.model);
  assert.deepEqual(batch.transferAudit.items.map(c=>c.sha256),images.map(c=>c.sha256));
  assert.deepEqual(first.transferAudit,batch.transferAudit.items[0]);
  assert.deepEqual(calls.slice(0,3).map(c=>c.actual.map(i=>i.sha256)),images.map(c=>[c.sha256]));
  const auditCall = calls.find(c=>c.task.assignment==='海报借改逐项核对');
  assert.deepEqual(auditCall.actual,[reference.image,...images]);
  assert.deepEqual(auditCall.schema.required,['candidate_1','candidate_2','candidate_3']);
  assert.ok(!auditCall.task.context.includes(slogan));
});

test('poster transfer records the exact lighter review frames and retains the original title inputs',async()=>{
  const makePreviews=async frames=>frames.map((frame,i)=>({...frame,
    sha256:(i+6).toString(16).repeat(64),byteLength:frame.byteLength/2}));
  const {batch,calls}=await review({makePreviews});
  const originals=[reference.image,...images];
  const frames=await makePreviews(originals);
  assert.deepEqual(calls.find(c=>c.task.assignment==='海报借改逐项核对').actual,frames);
  assert.deepEqual(batch.transferAudit.previewEvidence,originals.map((frame,i)=>({
    originalSha256:frame.sha256,reviewSha256:frames[i].sha256,originalBytes:frame.byteLength,reviewBytes:frames[i].byteLength})));
  assert.deepEqual(batch.transferAudit.items.map(row=>row.sha256),images.map(frame=>frame.sha256));
  assert.deepEqual(calls.filter(c=>c.task.assignment==='独立读图者').map(c=>c.actual[0].sha256),images.map(frame=>frame.sha256));
});

test('unverified original features and unreadable results do not support a recommendation',async()=>{
  const unread = {...reference,observations:{...reference.observations,字体:'未核实'}};
  const {batch} = await review({posterTransfer:{reference:unread,transfers}});
  assert.equal(batch.winner,null);
  assert.ok(batch.candidates.every(c=>c.transferAudit.checks.字体.status==='unknown'));
  const rows = auditRows();
  rows[0].checks.布局.candidateEvidence='未核实';
  rows[1].checks.布局.candidateEvidence=rows[1].checks.布局.referenceEvidence;
  const {batch:unchecked} = await review({rows});
  assert.equal(unchecked.candidates[0].transferAudit.checks.布局.relation,'unknown');
  assert.equal(unchecked.candidates[1].transferAudit.checks.布局.status,'unknown');
  assert.equal(unchecked.winner,3);
});

test('the transfer assessment retains independent title, on-pack and visual failures together',async()=>{
  const rows=auditRows();
  rows[0].checks.布局=rows[1].checks.布局;
  const {batch} = await review({rows,missingSlogan:true,packaging:true});
  assert.equal(batch.winner,null);
  assert.match(batch.candidates[0].reason,/缺少已选 slogan/);
  assert.match(batch.candidates[0].reason,/主题印在包装本体/);
  assert.match(batch.candidates[0].reason,/布局应沿用/);
  assert.match(batch.candidates[0].edit,/海报主标题/);
  assert.match(batch.candidates[0].edit,/布局/);
});

const posterPolicy={approvedReferenceUse:'只借产品与留白的相对位置。',mainReferenceExclusions:'不要照搬自嘲熊联名、标志和南瓜帽等专有形象。'};
const yogurtBrief='为「午晴」做原味冷藏酸奶的 A3 竖版海报。150 克杯装，售价 5.9 元一杯，正式标志尚未定。';

test('poster facts block copied brands, reference characters and invented claims even if scores and director pass',async()=>{
  const {calls:oldCalls}=await review();
  const makePreviews=async packet=>packet.map((frame,i)=>({...frame,sha256:String(i+6).repeat(64)}));
  const posterIssues=[
    [{kind:'foreign_identity',observed:'MoreYogurt 茉酸奶 × Joke Bear',location:'左上联名字和冷柜顶'},
      {kind:'reference_asset',observed:'带牛角和南瓜帽的三个自嘲熊联名角色',location:'画面底部'}],
    [{kind:'unconfirmed_claim',observed:'优质生牛乳／冷藏发酵／清洁配方',location:'画面右下功能字栏'}],
    [],
  ];
  const {batch,calls}=await review({posterTransfer:{reference,transfers,sourcePolicy:posterPolicy},productBrief:yogurtBrief,
    posterIssues,makePreviews});
  const hardReads=calls.filter(call=>call.task.assignment==='单图海报硬事实核验');
  assert.deepEqual(calls.filter(call=>!hardReads.includes(call)).map(call=>call.task.assignment),oldCalls.map(call=>call.task.assignment));
  assert.deepEqual(hardReads.map(call=>call.actual),images.map(original=>[original]));
  assert.deepEqual(JSON.parse(hardReads[0].task.context).已确认品牌资料,{allowedBrands:['午晴'],logoPending:true});
  const brandCall=calls.find(call=>call.task.assignment==='品牌独立评分岗');
  assert.equal(brandCall.actual[0].sha256,'6'.repeat(64));
  assert.ok(!Object.hasOwn(brandCall.schema.properties.candidate_1.properties,'artworkIssues'));
  assert.match(hardReads[0].instruction,/排除项不授权任何第三方内容/u);
  assert.equal(calls.find(call=>call.task.assignment==='视觉独立评分岗').actual[0].sha256,'6'.repeat(64));
  assert.deepEqual(batch.ruling.items.map(c=>c.blocked),[false,false,false]);
  assert.deepEqual(batch.candidates.map(c=>[c.mean,c.blocked]),[[5,true],[5,true],[5,false]]);
  assert.equal(batch.winner,3);
  assert.match(batch.candidates[0].reason,/左上联名字和冷柜顶可见「MoreYogurt 茉酸奶 × Joke Bear」/u);
  assert.match(batch.candidates[0].reason,/画面底部可见「带牛角和南瓜帽的三个自嘲熊联名角色」/u);
  assert.match(batch.candidates[1].reason,/画面右下功能字栏可见「优质生牛乳／冷藏发酵／清洁配方」/u);
  assert.deepEqual(batch.candidates[0].posterArtworkCheck,{sha256:images[0].sha256,threadId:'single-original-0',
    model:judgment.model,inputPacketHash:judgment.inputPacketHash,issues:posterIssues[0]});
});

test('located first-read competitor text survives an empty single-image audit without blocking the authorized wordmark',async()=>{
  const {batch}=await review({posterTransfer:{reference,transfers,sourcePolicy:posterPolicy},productBrief:yogurtBrief,
    blindWords:['品牌‘午晴’位于左上角。','品牌‘MoreYogurt’及其中文名‘茉酸奶’位于照片左上角。','品牌疑似‘茉酸奶’，远处字样看不清。']});
  assert.deepEqual(batch.candidates.map(c=>c.blocked),[false,true,false]);
  assert.deepEqual(batch.candidates[1].posterArtworkCheck.issues,[
    {kind:'foreign_identity',observed:'MoreYogurt 茉酸奶',location:'照片左上角'},
  ]);
});

test('a bare own brand authorizes only the exact wordmark and leaves reference names and mixed aliases blocked',async()=>{
  const brief='做一张 A3 海报。本案品牌名：午晴。不要使用参考品牌名：「茉酸奶」。竞品比较，品牌名：「MoreYogurt」。';
  const {batch,calls}=await review({posterTransfer:{reference,transfers,sourcePolicy:posterPolicy},productBrief:brief,
    blindWords:['品牌「午晴」位于左上角。','品牌「午晴联名茉酸奶」位于杯身中央。','品牌「午晴」及其别名「茉酸奶」位于杯身上。']});
  const facts=JSON.parse(calls.find(call=>call.task.assignment==='单图海报硬事实核验').task.context).已确认品牌资料;
  assert.deepEqual(facts.allowedBrands,['午晴']);
  assert.deepEqual(batch.candidates.map(candidate=>candidate.blocked),[false,true,true]);
  assert.deepEqual(batch.candidates[1].posterArtworkCheck.issues,[{kind:'foreign_identity',observed:'午晴联名茉酸奶',location:'杯身中央'}]);
  assert.deepEqual(batch.candidates[2].posterArtworkCheck.issues,[{kind:'foreign_identity',observed:'茉酸奶',location:'杯身上'}]);
  assert.equal(batch.winner,1);
});

test('a crop can confirm the chosen title without editing the preserved first read',async()=>{
  const wrong={status:'readable',text:'夜访昆虫，40分钟一场',location:'画面上半部'};
  const exact={...wrong,text:slogan};
  const scope={posterTransfer:{reference,transfers,sourcePolicy:posterPolicy},productBrief:yogurtBrief,
    slogans:[wrong],cropTitle:async (original,box)=>{
      assert.equal(original,images[0]);
      assert.deepEqual(box,[0,0,1000,580]);
      return image(8);
    }};
  const {batch,calls}=await review({...scope,cropObserved:exact});
  assert.equal(batch.winner,1);
  assert.deepEqual(batch.blind[0].slogan,wrong);
  assert.deepEqual(batch.candidates[0].posterTitleCheck.observation,exact);
  const cropReads=calls.filter(call=>call.task.assignment==='海报标题原图裁片复读');
  assert.deepEqual(cropReads.map(call=>call.actual.map(frame=>frame.sha256)),[[image(8).sha256]]);
  assert.ok(!JSON.stringify(cropReads).includes(slogan));
  const director=calls.find(call=>call.task.assignment==='独立视觉总监');
  assert.ok(!director.task.context.includes(wrong.text));
  assert.ok(director.task.context.includes(slogan));
  assert.match(director.task.context,/主标题原图裁片复核.*cropSha256/u);
  assert.match(director.instruction,/以裁片实见为准/u);
  const {batch:actuallyWrong}=await review({...scope,cropObserved:wrong});
  assert.equal(actuallyWrong.winner,2);
  assert.equal(actuallyWrong.candidates[0].posterTitleCheck.confirmed,false);
  assert.match(actuallyWrong.candidates[0].reason,/40分钟/);
});

test('an artwork issue needs a located visible quote or identifiable asset',async()=>{
  const scoped={posterTransfer:{reference,transfers,sourcePolicy:posterPolicy},productBrief:yogurtBrief};
  for (const malformed of [
    {kind:'foreign_identity',observed:'',location:'产品本体'},
    {kind:'unconfirmed_claim',observed:'优质生牛乳',location:''},
    {kind:'similar_color',observed:'暖黄',location:'标题右侧'},
  ]) {
    await assert.rejects(review({...scoped,posterIssues:[[malformed],[],[]]}),
      {code:'INVALID_STAGE_OUTPUT',message:/违规原字或可辨认图形及位置/u});
  }
});

test('a located confirmed value is not a product invention, but a modified or pending price still needs review',async()=>{
  const claim=observed=>({kind:'unconfirmed_claim',observed,location:'海报左下字样'});
  const posterIssues=[[claim('5.9元一杯'),claim('午晴原味冷藏酸奶'),claim('5.8元一杯')],[claim(slogan)],[]];
  const scope={posterTransfer:{reference,transfers,sourcePolicy:posterPolicy},posterIssues};
  const brief='请为「午晴」原味冷藏酸奶做一张便利店冷柜旁的 A3 竖版海报。150 克杯装，售价 5.9 元一杯，正式标志尚未定。';
  const {batch}=await review({...scope,productBrief:brief});
  assert.deepEqual(batch.candidates[0].posterArtworkCheck.issues,[claim('5.8元一杯')]);
  assert.deepEqual(batch.candidates[0].posterArtworkCheck.confirmedFalseAlarms,posterIssues[0].slice(0,2));
  assert.equal(batch.candidates[1].blocked,false);
  const {batch:pending}=await review({...scope,productBrief:brief.replace('售价','目标售价')});
  assert.ok(pending.candidates[0].posterArtworkCheck.issues.some(issue=>issue.observed==='5.9元一杯'));
});

test('comparison and pending prices cannot silence a located product claim',async()=>{
  const scope={posterTransfer:{reference,transfers,sourcePolicy:posterPolicy}};
  const placed={kind:'unconfirmed_claim',observed:'5.9元一杯',location:'海报左下价签'};
  for (const context of ['竞品信息，售价 5.9 元一杯。', '目标价，售价 5.9 元一杯。', '售价 5.9 元一杯，售价尚未确认。']) {
    const {batch}=await review({...scope,productBrief:'请为「午晴」原味冷藏酸奶做 A3 海报。'+context,posterIssues:[[placed],[],[]]});
    assert.deepEqual(batch.candidates[0].posterArtworkCheck.issues,[placed],context);
    assert.equal(batch.candidates[0].blocked,true,context);
    assert.equal(batch.winner,2,context);
  }
});

test('an explicit no-violation observation cannot disqualify a clean poster',async()=>{
  const absences=[
    {kind:'foreign_identity',observed:'无品牌名、商标或联名标识，杯身为纯白色无字样',location:'中央杯装产品'},
    {kind:'reference_asset',observed:'无照搬参考素材中的柿子，背景为虚化冷柜线条',location:'整体画面'},
    {kind:'unconfirmed_claim',observed:'无与客户确认资料冲突内容，所有文字均与已确认海报原文相符',location:'海报底部'},
  ];
  const violation={kind:'unconfirmed_claim',observed:'无糖、高钙',location:'杯身正面'};
  const {batch}=await review({posterTransfer:{reference,transfers,sourcePolicy:posterPolicy},productBrief:yogurtBrief,
    posterIssues:[absences,[violation],[]]});
  assert.deepEqual(batch.candidates[0].posterArtworkCheck.dismissedAsNoIssue,absences);
  assert.equal(batch.winner,1);
  assert.deepEqual(batch.candidates[1].posterArtworkCheck.issues,[violation]);
});

test('an exact confirmed price does not clear an issue located on the package',async()=>{
  const onPack={kind:'unconfirmed_claim',observed:'5.9元一杯',location:'酸奶杯身正面'};
  const {batch}=await review({posterTransfer:{reference,transfers,sourcePolicy:posterPolicy},productBrief:yogurtBrief,
    posterIssues:[[onPack],[],[]]});
  assert.deepEqual(batch.candidates[0].posterArtworkCheck.issues,[onPack]);
  assert.equal(batch.winner,2);
});

test('a first read that sees small footer labels triggers one verified crop audit',async()=>{
  const processClaim={kind:'unconfirmed_claim',observed:'低温发酵',location:'第二个温度计图标下方'};
  const {batch,calls}=await review({posterTransfer:{reference,transfers,sourcePolicy:posterPolicy},productBrief:yogurtBrief,
    firstLooks:['中下方有五个图标配说明'],detailIssues:[processClaim],cropTitle:async(original,box)=>{
      assert.equal(original,images[0]);
      assert.deepEqual(box,[0,550,1000,1000]);
      return image(8);
    }});
  assert.deepEqual(calls.filter(call=>call.task.assignment==='海报下部商品小字裁片核验').map(call=>call.actual),[[image(8)]]);
  assert.deepEqual(batch.candidates[0].posterArtworkCheck.issues,[processClaim]);
  assert.equal(batch.candidates[0].posterArtworkCheck.detail.sha256,image(8).sha256);
  assert.equal(batch.winner,2);
});

test('one redraw reuses only same-scope original reading facts and still reruns comparative judgments',async()=>{
  const profile={base:'https://example.test',model:'actual-vision',host:'example.test'};
  const scope={posterTransfer:{reference,transfers,sourcePolicy:posterPolicy,reviewProfile:profile},productBrief:yogurtBrief};
  const {batch:priorReview}=await review(scope);
  const candidateImages=[image(7),images[1],images[2]];
  const reorderedProfile={model:profile.model,host:profile.host,base:profile.base};
  const {batch,calls}=await review({...scope,posterTransfer:{...scope.posterTransfer,reviewProfile:reorderedProfile},candidateImages,priorReview});
  assert.deepEqual(batch.reusedOriginalReads,images.slice(1).map(frame=>frame.sha256));
  for(const assignment of ['独立读图者','单图海报硬事实核验'])
    assert.deepEqual(calls.filter(call=>call.task.assignment===assignment).map(call=>call.actual[0].sha256),[image(7).sha256]);
  assert.equal(calls.filter(call=>call.task.assignment==='海报借改逐项核对').length,1);
  assert.equal(calls.filter(call=>call.task.assignment==='视觉独立评分岗').length,1);
  assert.deepEqual(batch.candidates[1].posterArtworkCheck,priorReview.candidates[1].posterArtworkCheck);
  const changedProfile={...scope.posterTransfer,reviewProfile:{...profile,model:'other-vision'}};
  const {batch:changed}=await review({...scope,posterTransfer:changedProfile,candidateImages,priorReview});
  assert.deepEqual(changed.reusedOriginalReads,[]);
});

test('poster redraw picks the fewest concrete defects among score-eligible drafts',()=>{
  const highest={mean:4.5,repairDefects:['布局','景别','笔法'],priority:1};
  const close={mean:4,repairDefects:['布局'],priority:3};
  const low={mean:3.75,repairDefects:[],priority:2};
  assert.equal(selectPosterRedraw([highest,close,low]),close);
});

test('workbench-verified packaging goes into the comparison with its original signature',async()=>{
  const original=image(5);
  const {batch,calls}=await review({packaging:true,verifiedComparators:[original,original]});
  assert.deepEqual(batch.reusedResearch,[original.sha256]);
  assert.deepEqual(batch.references,[{name:original.name,sha256:original.sha256}]);
  assert.ok(!calls.some(call=>call.task.assignment==='核对同类参考'));
  const scores=calls.find(call=>call.task.assignment==='品牌独立评分岗');
  assert.ok(scores.actual.some(image=>image.sha256===original.sha256));
  assert.equal(batch.winner,null);
  assert.match(batch.candidates[0].reason,/主题印在包装本体/);
});

test('a reduced side-by-side packet never certifies where the theme is printed',async()=>{
  const productBrief='混合坚果，25 克。做包装正面和电商 KV。';
  const printed=[
    {status:'verified',printed:[{text:'混合坚果',location:'盒身中央'},{text:'25 克',location:'右下角'}],reason:'盒面为品名和规格。'},
    {status:'verified',printed:[{text:slogan,location:'袋身左上'}],reason:'袋身左上可读。'},
    {status:'unverified',printed:[],reason:'盒面反光，字样看不清。'},
  ];
  const makePreviews=async packet=>packet.map((image,index)=>index<3 ? {...image,sha256:String(index+6).repeat(64),byteLength:40} : image);
  const {batch,calls}=await review({packaging:true,productBrief,printed,makePreviews});
  assert.equal(batch.winner,1);
  assert.deepEqual(batch.candidates.map(candidate=>candidate.blocked),[false,true,true]);
  assert.deepEqual(batch.votes.find(vote=>vote.role==='品牌').items.map(row=>row.onPackStatus),Array(3).fill('theme_printed'));
  assert.deepEqual(Object.values(batch.onPackAudits).map(audit=>audit.status),['verified','theme_printed','unverified']);
  assert.equal(batch.onPackAudits[2].sha256,images[1].sha256);
  assert.match(batch.candidates[1].reason,/袋身左上/);
  assert.deepEqual(calls.filter(call=>call.task.assignment==='独立核对包装本体原图').map(call=>call.actual),images.map(image=>[image]));
  assert.ok(calls.filter(call=>call.task.assignment==='独立核对包装本体原图').every(call=>!call.task.context.includes(slogan)));
  assert.equal(calls.find(call=>call.task.assignment==='品牌独立评分岗').actual[0].sha256,'6'.repeat(64));
  assert.deepEqual(batch.previewEvidence.map(evidence=>evidence.originalSha256),images.map(image=>image.sha256));
});

test('weekly packaging checks use exact original labels and retain the punctuation-only sibling',async t=>{
  const caption='七袋，分好一周';
  const weeklyImages=[
    {...images[0],sha256:'75aa3f6b431a46f3ff28f8112845a1858a5e1f7c35db1f3b69751e58e876ed9b'},
    {...images[1],sha256:'1fd5d5ad9fedf8a4fc02d2102b14b7a897beccdd93b9deea358300de351012e2'},
    images[2],
  ];
  // Native reads on the two real O/76 originals, with the positively identified panel check.
  const absent={labels:[],location:'',uncertain:''};
  const duplicate={labels:['周二','周二','周三','周四','周五','周六','周日'],
    location:'盒身正面中下部，每个小包装上方的横排星期标签',uncertain:''};
  const receipts=['chatcmpl-Emi44LSkBBoaf44CcVfDAWl6Z9XKp','chatcmpl-Emi5Jz7iyerWrWbnvWcOSdZiUlVOE','fixture-3'];
  const packetHashes=['15f12a22ce580db3ae7f9fc6b351c15cd0ca4483ccc2bd883cb069a14bed7cb5',
    'ea45b82e61df623ebd5795df23bb6e5604debc3bb3ee2a6b387b3a2728890252','a'.repeat(64)];
  const model='gpt-4.1-mini-2025-04-14';
  async function run(labelReads,{direction='七袋分一周',mentionsWeek=true}={}) {
    const calls=[];
    const batch=await reviewVisualBatch({direction,images:weeklyImages,context:'已确认项目材料',
      packagingExpected:true,theme:direction,posterSlogan:caption,productBrief:'做包装外盒正面和电商上新 KV。每袋25克，盒内7袋。',
      sources:[image(4)],makeBoard:async()=>({name:'包装同品类并排图'}),
      call:async(instruction,actual,schema,task)=>{
        const index=weeklyImages.findIndex(img=>img.sha256===actual[0]?.sha256);
        if(task.assignment==='独立读图者') return {parsedOutput:{first:'外盒',action:'桌面陈列',alternative:'独立分装',
          words:mentionsWeek && index===1 ? '盒面从周一到周日' : '盒面写25克',
          innerPackets:{form:'printed_illustration',location:'盒面',evidence:'盒面印有小袋图示'},
          slogan:{status:'readable',text:caption+(index===0?'。':''),location:'画面顶部'}}};
        if(task.assignment==='核对同类参考') return {parsedOutput:{packaging:true,indices:[1]}};
        if(task.assignment==='独立核对包装本体原图') return {model,threadId:'existing-on-pack-audit',
          parsedOutput:{status:'verified',printed:[{text:direction,location:'盒身中央'}],reason:'图上确实印了方向题名。'}};
        if(task.assignment==='独立核读包装日序') {
          calls.push({instruction,actual,task});
          return {model,threadId:receipts[index],inputPacketHash:packetHashes[index],parsedOutput:labelReads[index]};
        }
        const fields=schema.properties.candidate_1.properties;
        return {parsedOutput:Object.fromEntries(weeklyImages.map((_,i)=>['candidate_'+(i+1),{reason:'原票认为主体可读。',
          ...(fields.score ? {score:5} : {}),...(fields.onPackStatus ? {onPackStatus:i===2?'theme_printed':'verified'} : {}),
          ...(fields.priority ? {priority:i===1?1:i===0?2:3,edit:'无',research:'无',blocked:false} : {})}]))};
      }});
    return {batch,calls};
  }

  await t.test('the duplicated Tuesday in the verified O/76 winner blocks without flagging the unlabelled package',async()=>{
    const {batch,calls}=await run([absent,duplicate,absent]);
    assert.equal(batch.votes.find(v=>v.role==='品牌').items[1].onPackStatus,'verified');
    assert.equal(batch.ruling.items[1].blocked,false);
    assert.equal(batch.winner,null);
    assert.equal(batch.sloganRepair.candidate,1);
    assert.equal(batch.candidates[0].titlePunctuation,true);
    assert.equal(batch.candidates[0].weeklyLabelCheck.issue,undefined);
    assert.equal(batch.candidates[1].blocked,true);
    assert.match(batch.candidates[1].reason,/周二、周二、周三/u);
    assert.match(batch.candidates[1].edit,/去掉重复日期/u);
    assert.match(batch.candidates[2].reason,/主题印在包装本体/u);
    assert.deepEqual(batch.candidates[1].weeklyLabelCheck,{...duplicate,issue:batch.candidates[1].weeklyLabelCheck.issue,
      sha256:weeklyImages[1].sha256,model,threadId:receipts[1],inputPacketHash:packetHashes[1]});
    assert.deepEqual(calls.map(call=>call.actual),weeklyImages.map(draft=>[draft]));
    for (const call of calls) {
      assert.doesNotMatch(call.task.context,/周二|分好一周/u);
      assert.match(call.instruction,/没有任何可定位的实际星期原字时，labels 填空数组/u);
    }
  });

  await t.test('unique weekday labels pass, and only a positively identified unreadable label blocks',async()=>{
    const complete={...duplicate,labels:['周一','周二','周三','周四','周五','周六','周天']};
    const ambiguous={labels:['',''],location:'包装盒正面中心中部',uncertain:'所有星期栏目均看不清'};
    const {batch:pass}=await run([ambiguous,complete,absent]);
    assert.equal(pass.candidates[0].weeklyLabelCheck.issue,undefined);
    assert.equal(pass.candidates[0].titlePunctuation,true);
    assert.equal(pass.winner,2);
    for(const unread of [
      {...complete,labels:['周一','周二','','周四','周五','周六','周日'],uncertain:'第三格未核实'},
      {...complete,labels:complete.labels.slice(0,6)},
    ]) {
      const {batch}=await run([absent,unread,absent]);
      assert.equal(batch.candidates[1].blocked,true);
      assert.ok(batch.candidates[1].weeklyLabelCheck.issue);
      assert.equal(batch.sloganRepair.candidate,1);
    }
  });

  await t.test('a weekday hint seen only in a specific blind read does not send the other originals',async()=>{
    const {batch,calls}=await run([absent,duplicate,absent],{direction:'桌面分装'});
    assert.deepEqual(calls.map(call=>call.actual),[[weeklyImages[1]]]);
    assert.equal(batch.candidates[0].weeklyLabelCheck,undefined);
    const noHint=await run([absent,absent,absent],{direction:'桌面分装',mentionsWeek:false});
    assert.equal(noHint.calls.length,0);
  });
});

test('every candidate must have exactly five judgments with evidence for each attached image',async()=>{
  for (const mutate of [
    rows=>{rows[0].candidate=2;}, rows=>{rows.pop();}, rows=>{delete rows[1].checks.布局;},
    rows=>{rows[0].checks.抠图=rows[0].checks.笔法;}, rows=>{rows[0].checks.字体.referenceEvidence='  ';},
    rows=>{rows[2].checks.景别.candidateEvidence='';}, rows=>{rows[2].checks.配色.relation='approved';},
  ]) {
    const rows=auditRows();
    mutate(rows);
    await assert.rejects(review({rows}),{code:'INVALID_STAGE_OUTPUT'});
  }
  await assert.rejects(review({identity:{...judgment,threadId:''}}),/请求编号/);
  await assert.rejects(review({posterTransfer:{reference,transfers:[{borrow:['配色','笔法','字体'],change:['笔法','布局']},...transfers.slice(1)]}}),/借三改二项目/);
});

const directions = ['馆内导览','活动时长','先约再访'];
const entries = directions.map((direction,index)=>({direction,image:images[index]}));
const pairs = [
  {first:2,second:3,structure:'unknown',basis:'unknown',firstEvidence:'左上印字落在深蓝底上',secondEvidence:'右侧主体太小，轮廓难辨',reason:'第三张主角无法辨清'},
  {first:2,second:1,structure:'same',basis:'surface',firstEvidence:'左标题右展柜，深蓝底',secondEvidence:'左标题右展柜，墨绿底',reason:'只改了配色和题字'},
  {first:1,second:3,structure:'different',basis:'framing',firstEvidence:'横幅从左至右包含整座建筑',secondEvidence:'中央仅见放大的复眼',reason:'全景改为局部特写'},
];

test('all three cross-direction comparisons bind both pieces of evidence to their original, regardless of reported order',async()=>{
  const winners = entries.map(entry=>({...entry,image:{...entry.image,imageId:'candidate_1'}}));
  const result = await reviewPosterDirections({entries:winners,call:async(_prompt,actual,_schema,task)=>{
    assert.deepEqual(imageManifest(actual).map(item=>item.sha256),images.map(item=>item.sha256));
    assert.deepEqual(actual.map(item=>item.path),images.map(item=>item.path));
    assert.equal(task.assignment,'海报三方向实图区分');
    return {...judgment,parsedOutput:{pairs}};
  }});
  assert.equal(result.threadId,judgment.threadId);
  assert.equal(result.model,judgment.model);
  assert.deepEqual(result.pairs.map(p=>p.directions),[[directions[0],directions[1]],[directions[0],directions[2]],[directions[1],directions[2]]]);
  assert.deepEqual(result.pairs.map(p=>p.distinct),[false,true,false]);
  assert.deepEqual(result.pairs[0].sha256,[images[0].sha256,images[1].sha256]);
  assert.equal(result.pairs[0].firstEvidence,pairs[1].secondEvidence);
  assert.equal(result.pairs[0].secondEvidence,pairs[1].firstEvidence);
});

test('cross-direction comparison rejects foreign or repeated pairs, excess rows, and unsupported claims',async()=>{
  for (const mutate of [
    items=>{items.pop();}, items=>{items.push(items[0]);}, items=>{items[0]=items[1];},
    items=>{items[0].first=4;}, items=>{items[1].basis='colors';}, items=>{items[2].secondEvidence='';},
    items=>{delete items[1].structure;}, items=>{items[1].structure='almost';},
  ]) {
    const items=structuredClone(pairs);
    mutate(items);
    await assert.rejects(reviewPosterDirections({entries,call:async()=>({...judgment,parsedOutput:{pairs:items}})}),{code:'INVALID_STAGE_OUTPUT'});
  }
  await assert.rejects(reviewPosterDirections({entries:entries.slice(0,1),call:assert.fail}),/三个不同方向/);
});

test('a claimed composition change needs contrasting visual evidence and distinct original bytes',async()=>{
  const claims = structuredClone(pairs);
  claims[0].structure='different';
  claims[0].basis='focus';
  claims[0].secondEvidence=claims[0].firstEvidence;
  claims[1].structure='different';
  claims[1].basis='layout';
  const repeated = [entries[0],{...entries[1],image:entries[0].image},entries[2]];
  const result = await reviewPosterDirections({entries:repeated,call:async()=>({...judgment,parsedOutput:{pairs:claims}})});
  assert.deepEqual(result.pairs.map(pair=>pair.basis),['same','framing','unknown']);
  assert.deepEqual(result.pairs.map(pair=>pair.distinct),[false,true,false]);
});

test('the historical museum posters cannot pass for a change of brushwork or a small gesture',async()=>{
  const notes = [
    '左侧标题，右侧中景，卡通导览员指向发亮的标本柜。',
    '左侧标题，右侧中景，绘画笔触表现导览员摊手指引标本柜。',
    '左侧标题，右侧中景，写实导览员带人看发亮的标本柜。',
  ];
  const claims = [[1,2,'focus'],[1,3,'form'],[2,3,'form']].map(([first,second,basis])=>({
    first,second,basis,structure:'same',reason:'同样的空间组织和导览场景。',
    firstEvidence:notes[first-1],secondEvidence:notes[second-1],
  }));
  const result = await reviewPosterDirections({entries,call:async()=>({...judgment,parsedOutput:{pairs:claims}})});
  assert.deepEqual(result.pairs.map(pair=>pair.distinct),[false,false,false]);
});

test('similar representatives hold the affected directions without promoting unchecked alternates',()=>{
  const represented = directions.map(direction=>{
    const drafts=[5,4,3].map((mean,i)=>({visual:{candidate:i+1,mean,recommended:i===0,blocked:false,
      reason:'单稿原票',edit:'无'}}));
    return {direction,draft:drafts[0],drafts};
  });
  holdSimilarPosterDirections({pairs:[
    {directions:directions.slice(0,2),distinct:false,reason:'两稿都是左字右图。'},
    {directions:[directions[0],directions[2]],distinct:true,reason:'主体取景不同。'},
    {directions:directions.slice(1),distinct:true,reason:'主体取景不同。'},
  ]},represented);
  for (const {draft,drafts} of represented.slice(0,2)) {
    assert.ok(drafts.every(({visual})=>!visual.recommended && (visual.blocked || visual.mean<4)));
    assert.match(draft.visual.reason,/两稿都是左字右图/);
    assert.match(drafts[1].visual.reason,/单稿达标.*重新对照三案/);
    assert.equal(drafts[2].visual.reason,'单稿原票');
  }
  assert.equal(represented[2].draft.visual.recommended,true);
});


test('a loose-filled window never wins a box for individual bags, but printed food can remain',async()=>{
  const productBrief='外盒内装七袋，每袋25克。请做正面包装与KV。';
  const innerPackets=[
    {form:'loose_in_outer_box',evidence:'窗内直接堆着未分装的散粒',location:'外盒正面开窗'},
    {form:'printed_illustration',evidence:'草莓为盒面平整印刷图案',location:'外盒正面'},
    {form:'not_shown',evidence:'盒面封闭，只见一袋在桌上',location:'画面正中'},
  ];
  const printed=images.map(()=>({status:'verified',printed:[{text:'盒内七袋',location:'外盒正面'}],reason:'规格正确'}));
  const {batch,calls}=await review({posterTransfer:null,packaging:true,productBrief,printed,innerPackets});
  assert.equal(batch.candidates[0].mean,5);
  assert.equal(batch.candidates[0].blocked,true);
  assert.equal(batch.winner,2);
  assert.match(batch.candidates[0].reason,/外盒正面开窗可见散装内容/u);
  assert.equal(batch.candidates[0].blind.innerPackets.form,'loose_in_outer_box');
  assert.equal(batch.candidates[2].blocked,false);
  assert.equal(calls.filter(entry=>entry.task.assignment==='独立读图者').length,3);
});
