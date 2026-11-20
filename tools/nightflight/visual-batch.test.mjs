import assert from 'node:assert/strict';
import test from 'node:test';
import {holdSimilarPosterDirections,reviewPosterDirections,reviewVisualBatch} from './visual-batch.mjs';
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

async function review({rows=auditRows(),posterTransfer={reference,transfers},missingSlogan=false,packaging=false,identity=judgment,verifiedComparators=[],productBrief,printed,makePreviews}={}) {
  const calls = [];
  const batch = await reviewVisualBatch({direction:'时长',images,context:'简报',posterSlogan:slogan,posterTransfer,packagingExpected:packaging,theme:slogan,productBrief,makePreviews,
    sources:packaging ? [image(4)] : [],verifiedComparators,makeBoard:async()=>({name:'包装同品类并排图'}),
    call:async(_instruction,actual,schema,task)=>{
      calls.push({actual,schema,task});
      if (task.assignment==='独立读图者') return {parsedOutput:{first:'展柜',action:'讲解',words:'预约',alternative:'展览',
        slogan:missingSlogan ? {status:'missing',text:'',location:'主标题区只见馆名'} : {status:'readable',text:slogan,location:'画面上半部'}}};
      if (task.assignment==='海报借改逐项核对') return {...identity,parsedOutput:{items:rows}};
      if (task.assignment==='核对同类参考') return {parsedOutput:{packaging,indices:[1]}};
      if (task.assignment==='独立核对包装本体原图') return {...identity,parsedOutput:printed[images.indexOf(actual[0])]};
      const fields = schema.properties.items.items.properties;
      return {parsedOutput:{items:images.map((_,index)=>({candidate:index+1,reason:'原票认为主体清楚。',
        ...(fields.score ? {score:5} : {}),...(fields.onPackStatus ? {onPackStatus:'theme_printed'} : {}),
        ...(fields.priority ? {priority:index+1,edit:'原裁定建议放大副标。',research:'无',blocked:false} : {})}))}};
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
  assert.ok(!auditCall.task.context.includes(slogan));
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
