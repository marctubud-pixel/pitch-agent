import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jsonModelRequest } from './desktop-text.mjs';
import { attachDerivativesToPlan, collectManuscriptMaterials, createManuscriptRunner, formatManuscriptInput, manuscriptText, writeManuscript } from './manuscript.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const strategy = '# 策略一页纸\n\n## 核心策略\n\n先识别活动，再读预约。\n\n## 触点\n公众号横版封面。';
const published = '# 本版文案\n进馆看虫';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(),'manuscript-materials-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await Promise.all(Object.entries({
    'brief.md':'# 任务卡\n公众号横版封面',
    'strategy.md':strategy,
    'copy.md':published,
    'adopted.png':'选中的原件字节',
    'unused.png':'同批但未采用的原件字节',
  }).map(([name,body])=>writeFile(join(root,name),body)));
  return {
    root,
    project:{
      id:'project',title:'夜访昆虫',revision:12,mode:'auto',directions:['天黑进馆'],
      brief:'为亲子夜场做一张公众号横版封面。',
      briefScope:{types:['kv']},stageVersions:{strategy:3,visual:2},
      research:{findings:[{conclusion:'活动名在画面主位',evidence:'海报中央标题',source:'原发布页',url:'https://example.com/kv'}]},
      copyHandoff:{projectId:'project',strategy:[{name:'strategy.md',sha256:hash(strategy)}]},
      copyReview:{status:'ready',bodyHash:hash(published),draft:{directions:[{name:'天黑进馆',main:'进馆看虫',secondary:'须预约'}]}},
      visualAdoption:{at:'2026-11-20T00:00:00.000Z',artifacts:['adopted']},
      artifacts:[
        {stage:'brief',kind:'text',name:'brief.md'},
        {stage:'strategy',kind:'text',name:'strategy.md',strategyHash:hash(strategy)},
        {stage:'copy',kind:'text',name:'copy.md'},
        {stage:'visual',kind:'image',name:'adopted.png',adoptedForLayout:true,visual:{role:'main',candidate:2,direction:'天黑进馆'}},
        {stage:'visual',kind:'image',name:'unused.png',visual:{role:'main',candidate:1,direction:'天黑进馆'}},
      ],
    },
  };
}

test('逐页材料读取当前策略正文并只交接实际采用的原图', async t => {
  const {root,project}=await fixture(t);
  const {materials,originals}=await collectManuscriptMaterials(project,root);
  assert.equal(materials.strategy[0].body,strategy);
  assert.equal(materials.project.stageVersions.strategy,3);
  assert.equal(materials.research.findings[0].url,'https://example.com/kv');
  assert.equal(materials.copy.directions[0].secondary,'须预约');
  assert.deepEqual(originals.map(({id,name,sha256})=>({id,name,sha256})),[
    {id:'A2',name:'adopted.png',sha256:hash('选中的原件字节')},
  ]);
  assert.match(await formatManuscriptInput(materials),/先识别活动，再读预约/u);
});

test('拦住文案所用版次之外的策略正文', async t => {
  const {root,project}=await fixture(t);
  await writeFile(join(root,'strategy.md'),'另一版本的正文');
  await assert.rejects(collectManuscriptMaterials(project,root),/策略正文与文案所用版本不一致/u);
});

test('采用记录有原图缺件时停止交接', async t => {
  const {root,project}=await fixture(t);
  project.visualAdoption.artifacts.push('missing');
  await assert.rejects(collectManuscriptMaterials(project,root),/采用原图缺失/u);
});

async function nativeFixture(root,draft=null) {
  const executable=join(root,'native');
  await writeFile(executable,`#!/usr/bin/env node
const fs=require('node:fs');
const [mode,action]=process.argv.slice(2);
const profile=mode==='--vision-model' ? {base:'https://example.com/v1',host:'example.com',model:'vision-test'} :
  {base:'https://example.com',host:'example.com',model:'deepseek-test'};
if(action==='profile') process.stdout.write(JSON.stringify(profile));
else {
  const request=JSON.parse(fs.readFileSync(0,'utf8'));
  const content=request.body.messages.at(-1).content;
  const output=mode==='--vision-model' && content[1]?.image_url?.url.startsWith('data:image/png;base64,') ?
    {composition:'左标题，右展柜',legibleText:['进馆看虫'],visibleDetails:['玻璃展柜'],uncertain:[]} :
    mode==='--text-model' && typeof content==='string' ? ${JSON.stringify(draft)} : null;
  if(!output) process.exit(1);
  process.stdout.write(JSON.stringify({id:profile.model+'-request',model:profile.model,choices:[{message:{content:JSON.stringify(output)}}]}));
}
`,{mode:0o700});
  return executable;
}

test('只整理材料包时读取原图并停在编稿前', async t => {
  const {root,project}=await fixture(t);
  const executable=await nativeFixture(root);
  const run=createManuscriptRunner(executable);
  const result=await run({project:{...project,layoutMaterialsOnly:true},dir:root,checkpointDir:join(root,'calls')});
  assert.equal(result.artifacts.length,2);
  const bundle=result.artifacts.find(a=>a.name.startsWith('逐页材料包-'));
  const content=await readFile(join(root,bundle.name),'utf8');
  assert.match(content,/先识别活动，再读预约/u);
  assert.match(content,/左标题，右展柜/u);
  assert(result.artifacts.some(a=>a.name.startsWith('采用原图读图-')));
});

test('采用并写逐页稿时加载 v4，按章出稿并绑定本版来源、原文案和原图', async t=>{
  const {root,project}=await fixture(t);
  project.research.findings[0].chapter='竞争与同类传播';
  project.research.findings.push({chapter:'人群与接触情境',conclusion:'家长关注活动时间',
    evidence:'受访家长提到活动时间',source:'家长问卷',url:'https://example.com/survey'});
  project.research.findings.push({chapter:'行业与市场',conclusion:'夜场增设馆内讲解',
    evidence:'馆方公布两场夜间导览',source:'夜场公告',url:'https://example.com/night'});
  project.research.sections=project.research.findings.map(({chapter},i)=>({chapter,evidenceIndices:[i]}));
  const page=(role,title,fields={})=>({role,title,points:[],figureId:'',imageNote:'',sourceIndices:[],visibleQuotes:[],internalNote:'',...fields});
  const executable=await nativeFixture(root,{
    cover:{title:'夜访昆虫',subtitle:'公众号封面提案',imageNote:''},
    chapters:[
      {title:'课题与洞察',pages:[page('brief','让家长认出馆内夜场'),
        page('trend','家长会先看时间',{points:['受访家长提到活动时间。'],sourceIndices:[1]}),
        page('trend','夜场增加导览',{points:['馆方公布两场夜间导览。'],sourceIndices:[2]}),
        page('peers','同类把活动名放在画面中央',{points:['海报中央写活动名。'],sourceIndices:[0]})]},
      {title:'策略与版式',pages:[page('strategy','不讲展柜，只讲预约'),page('execution','把预约放在活动名旁')]},
      {title:'作品与决定',pages:[page('direction','天黑进馆',{figureId:'A2',points:['拟让围着展柜的孩子进入画面。'],visibleQuotes:['玻璃展柜']}),
        page('work','完整封面',{figureId:'A2',imageNote:'横幅全页展示',internalNote:'检查展柜边角的裁切。'}),
        page('decision','请确认预约入口')]},
    ],
    closing:'谢谢观看',
  });
  const run=createManuscriptRunner(executable);
  const result=await run({project,dir:root,checkpointDir:join(root,'calls')});
  assert.equal(result.artifacts.length,5);
  assert(result.artifacts.every(a=>a.kind==='text'));
  const draft=result.artifacts.find(a=>a.name.startsWith('逐页稿-')).text;
  assert.match(draft,/### P02 \| \[目录\][\s\S]*?- 课题与洞察\n  - 策略与版式\n  - 作品与决定\n/u);
  assert.match(draft,/### P04 \| \[趋势洞察\][\s\S]*?https:\/\/example\.com\/survey[\s\S]*?### P05 \| \[趋势洞察\][\s\S]*?https:\/\/example\.com\/night[\s\S]*?### P06 \| \[同类参考\][\s\S]*?https:\/\/example\.com\/kv/u);
  assert.match(draft,/### P07 \| \[核心策略\]\n- \*\*标题\/重点\*\*：先识别活动，再读预约。\n- \*\*解释内容\*\*：无/u);
  assert.match(draft,/主标 · 进馆看虫\n  - 副标 · 须预约\n  - 拟让围着展柜的孩子进入画面。\n  - 原图 · 玻璃展柜/u);
  assert.match(draft,/原图与文案左右分屏 ｜ `A2` · `adopted\.png`/u);
  assert.match(draft,/横幅全页展示 ｜ `A2` · `adopted\.png`\n- \*\*内部备注\*\*：检查展柜边角的裁切。/u);
  assert(!draft.includes('unused.png'));
  const planFile=result.artifacts.find(a=>a.name.endsWith('.plan.json'));
  const plan=JSON.parse(await readFile(join(root,planFile.name),'utf8'));
  assert.equal(plan.version,3);
  assert.equal(plan.pages.find(p=>p.role==='strategy').title,'先识别活动，再读预约。');
  assert.equal(plan.pages.find(p=>p.role==='direction').title,'进馆看虫');
  assert(!draft.includes('不讲展柜'));
  assert.deepEqual(plan.pages.filter(p=>p.role==='direction'||p.role==='work').map(p=>p.figures),[['A2'],['A2']]);
  const request=JSON.parse(await readFile(join(root,result.artifacts.find(a=>a.name.startsWith('DeepSeek实际请求-')).name),'utf8'));
  assert.equal(request.model,'deepseek-test');
  assert.equal(request.inputPacketSha256,hash(JSON.stringify(request.request)));
  const prompt=request.request.body.messages.at(-1).content;
  assert.match(prompt,/^# 夜航逐页编稿 · ppt-slide-script v4\n/u);
  for (const path of ['SKILL.md','references/proposal-blueprints.md','references/copy-polish-rules.md']) {
    const skill=await readFile(new URL('../../skills/ppt-slide-script/'+path,import.meta.url),'utf8');
    assert(prompt.includes(skill.trim()),'实际提示词包含完整 '+path);
  }
  assert.match(prompt,/左标题，右展柜/u);
});

test('包装逐页稿按采用图首读核实共同印字和实物陈列',async t=>{
  const {root}=await fixture(t);
  const brief='做七袋装外盒正面和电商首屏KV。每袋25克，盒内7袋，包含巴旦木、腰果、核桃和冻干草莓。';
  const recipe='巴旦木、腰果、核桃、冻干草莓';
  const approved='正面最先看到的是七袋独立分装，办公室下午加餐随手一袋。';
  const outline=(role,title,fields={})=>({role,title,points:[],figureId:'',imageNote:'',sourceIndices:[],visibleQuotes:[],internalNote:'',...fields});
  const directions=[
    {id:'A2',name:'拆一袋的下午',slogan:'下午拆一袋，盒子合上'},
    {id:'B1',name:'一点草莓红',slogan:'下午这袋坚果，有一点草莓红'},
    {id:'C1',name:'七个下午',slogan:'抽屉里，备着七个下午'},
  ];
  const materials={
    project:{title:'七袋混合坚果',carriers:['packaging','kv']},brief:{original:brief},
    research:{findings:[]},strategy:[{body:'## 核心策略\n\n'+approved}],adoption:{},
    copy:{directions:directions.map(({name,slogan})=>({name,main:slogan,displayed:true}))},
    figures:directions.map(({id,name,slogan},i)=>({
      id,direction:name,name:id+'.png',sha256:hash(id),reading:{completionId:id+'-first'},
      observation:{composition:'桌面外盒旁有一只独立小袋。',
        legibleText:[slogan,'混合坚果','25克×7袋',...(i<2?[recipe]:[])],
        visibleDetails:['小包装袋印有'+recipe+'的图案。'],uncertain:[]},
    })),
  };
  const observedExecution='三张采用图以盒身25克×7袋说明分装规格，画面展示单袋。';
  const quoteDetails='小包装袋印有'+recipe+'的图案。';
  const falseCompare='三案都保留25克×7袋与配料字样；区别在动作、颜色、收纳三个切入。';
  const falseExecution='正面拟在中央摆放七袋小袋实物，露出坚果与冻干草莓。';
  const falseDecision='请确认冻干草莓含量、四种坚果配比与口味测试是否补充，供包装和详情页文案使用。';
  const draft={
    cover:{title:'七袋混合坚果',subtitle:'外盒与首屏提案',imageNote:''},
    chapters:[
      {title:'需求与策略',pages:[outline('brief','七袋独立分装'),outline('strategy','模型写出的替代核心句'),
        outline('execution','包装正面与首屏',{points:[observedExecution]})]},
      {title:'三案呈现',pages:directions.flatMap(({id,name})=>[
        outline('direction',name,{figureId:id}),outline('work',name,{figureId:id,imageNote:'原图整版展示'})])},
      {title:'对比与决定',pages:[outline('compare','三案对比',{points:['适合讲分装','适合讲配料','适合讲一袋用量'],
          visibleQuotes:['一只独立小袋',recipe,quoteDetails.slice(0,-1)],imageNote:'三案并列'}),
        outline('decision','请确认配方',{points:['请确认配料配比。']})]},
    ],
    closing:'谢谢观看',
  };
  const setPoint=(spec,role,point)=>{spec.chapters.flatMap(chapter=>chapter.pages).find(page=>page.role===role).points=[point];};
  const profile={base:'https://example.com',model:'deepseek-test'};
  let index=0;
  async function replay(input,first,correction=first) {
    const sent=[];
    const provider={profile,async execute({prompt,images,outputSchema}){
      assert.deepEqual(images,[]);
      sent.push(prompt);
      return {parsedOutput:sent.length===1?first:correction,model:profile.model,threadId:'fixture-'+sent.length,
        inputPacketHash:hash(JSON.stringify(jsonModelRequest(profile,prompt,outputSchema)))};
    }};
    const result=await writeManuscript(provider,{materials:input,checkpointDir:join(root,'replay-'+index++)});
    return {result,sent};
  }

  await t.test('DeepSeek 看竞品包装的已核文字，材料包和本案采用图原字仍可完整核对',async()=>{
    const withResearch=structuredClone(materials);
    const pack={actualPackaging:true,sourceUrl:'https://example.com/pack.png',pageUrl:'https://example.com/pack',
      sha256:hash('竞品原图'),observation:'盒正面印有净含量：1.565kg。',firstRead:{front:'右侧透窗可见6瓶装',raw:'竞品原始读图回执'}};
    const nonPackaging={observation:'文化周海报',firstRead:{front:'海报原始读图'}};
    withResearch.research.findings=[{images:[pack,nonPackaging]}];
    const {result,sent}=await replay(withResearch,draft);
    const fromPrompt=prompt=>JSON.parse(prompt.split('## 同版编稿材料').at(-1).split('```json\n')[1].split('\n```')[0]);
    const actual=fromPrompt(sent[0]);
    const {firstRead,...verified}=pack;
    assert.deepEqual(actual.research.findings[0].images,[verified,nonPackaging]);
    assert.deepEqual(actual.figures,withResearch.figures);
    assert.deepEqual(result.plan.figures,withResearch.figures);
    assert.equal(result.plan.researchSha256,hash(JSON.stringify(withResearch.research)));
    const archive=fromPrompt(await formatManuscriptInput(withResearch));
    assert.deepEqual(archive.research.findings[0].images,[pack,nonPackaging]);
    assert.equal(firstRead.front,'右侧透窗可见6瓶装');
  });

  await t.test('退回原来的三个错误，保持首读原件和锁定策略',async()=>{
    const wrong=structuredClone(draft);
    setPoint(wrong,'execution',falseExecution);
    setPoint(wrong,'compare',falseCompare);
    setPoint(wrong,'decision',falseDecision);
    const {result,sent}=await replay(materials,wrong,draft);
    assert.equal(sent.length,2);
    assert(sent[1].startsWith(sent[0]));
    const correction=sent[1].slice(sent[0].length);
    assert.match(correction,/C1 的首次读图原字/u);
    assert.match(correction,/实物时，全数陈列/u);
    assert.match(correction,/不要把水果算入坚果种数/u);
    assert.equal(result.plan.pages.find(page=>page.role==='strategy').title,approved);
    assert.deepEqual(result.plan.figures,materials.figures);
    assert.ok(result.draft.includes(quoteDetails+'适合讲一袋用量'));
    assert.doesNotMatch(result.draft,/四种坚果配比|摆放七袋小袋实物/u);
  });

  await t.test('后续可试的陈列和已确认的装量可以写',async()=>{
    const proposed=structuredClone(draft);
    setPoint(proposed,'execution','盒内7袋是规格。后续可另试在中央摆放七袋小袋实物。');
    const {sent}=await replay(materials,proposed);
    assert.equal(sent.length,1);
  });

  await t.test('原简报明确要求陈列全部时保留已委托的动作',async()=>{
    const explicit=structuredClone(materials);
    explicit.brief.original+='客户要求七袋全部可见、可数。';
    const confirmed=structuredClone(draft);
    setPoint(confirmed,'execution',falseExecution);
    const {sent}=await replay(explicit,confirmed);
    assert.equal(sent.length,1);
  });

  await t.test('采用图首读确实核到同数实物时可以描述实际陈列',async()=>{
    const allVisible=structuredClone(materials);
    for (const figure of allVisible.figures) figure.observation.visibleDetails.push('前景摆放七袋小袋实物。');
    const seen=structuredClone(draft);
    setPoint(seen,'execution','采用图在前景摆放七袋小袋实物。');
    const {sent}=await replay(allVisible,seen);
    assert.equal(sent.length,1);
  });

  await t.test('O/77 图注保留同版印刷规格和画面关系，装饰物件数不从首读抄进页面',async()=>{
    const recorded=structuredClone(materials);
    const looseIngredients='散放的配料包括1颗核桃、1颗巴旦木、1颗腰果和3片冻干草莓';
    const packageIcons='七个小包装的示意图从文字延伸到独立包装小袋附近，形成视觉连贯性';
    recorded.figures[1].id='B2';
    recorded.figures[1].observation.visibleDetails.push(looseIngredients);
    recorded.figures[2].observation.visibleDetails.push(packageIcons);
    const safe=structuredClone(draft);
    const compare=safe.chapters[2].pages[0];
    const boxes=safe.chapters[1].pages;
    boxes[2].figureId=boxes[3].figureId='B2';
    compare.visibleQuotes[1]='散放的配料';
    compare.visibleQuotes[2]='小包装的示意图从文字延伸到独立包装小袋附近';
    boxes[2].visibleQuotes=['25克×7袋'];
    boxes[4].visibleQuotes=[compare.visibleQuotes[2]];
    const b2=structuredClone(safe);
    b2.chapters[1].pages[2].visibleQuotes=[looseIngredients];
    const c1=structuredClone(safe);
    c1.chapters[2].pages[0].visibleQuotes[2]=packageIcons;

    for (const [attempt,message] of [[b2,/B2 方向页图注/u],[c1,/并排页图注/u]]) {
      const {result,sent}=await replay(recorded,attempt,safe);
      assert.equal(sent.length,2);
      assert.match(sent[1].slice(sent[0].length),message);
      assert.deepEqual(result.plan.figures,recorded.figures);
      assert.match(result.draft,/25克×7袋/u);
      assert.match(result.draft,/小包装的示意图从文字延伸到独立包装小袋附近/u);
      assert.doesNotMatch(result.draft,/3片冻干草莓|七个小包装的示意图/u);
    }
  });

  await t.test('客户要求画面实物可数时，可回报有原图依据的件数',async()=>{
    const reviewed=structuredClone(materials);
    reviewed.brief.original+='客户要求七袋全部可见、可数。';
    const visible='前景摆放六袋小袋实物';
    reviewed.figures[0].observation.visibleDetails.push(visible);
    const compared=structuredClone(draft);
    compared.chapters[1].pages[0].visibleQuotes=[visible];
    const {result,sent}=await replay(reviewed,compared);
    assert.equal(sent.length,1);
    assert.match(result.draft,/前景摆放六袋小袋实物/u);
  });

  await t.test('确实在三张图读到了配料的原字才能写共有印字',async()=>{
    const allLabeled=structuredClone(materials);
    allLabeled.figures[2].observation.legibleText.push(recipe);
    const described=structuredClone(draft);
    const compare=described.chapters[2].pages[0];
    compare.visibleQuotes=materials.figures.map(()=>recipe);
    compare.points=[];
    const {result,sent}=await replay(allLabeled,described);
    assert.deepEqual(result.plan.pages.find(page=>page.role==='compare').points,[recipe,recipe,recipe]);
    assert.equal(sent.length,1);
  });

  await t.test('原图只拍到提起一袋，方向页可讲设想，并排页不把设想当成图上已见',async()=>{
    const sameEdition=structuredClone(materials);
    const adopted=sameEdition.figures[0];
    adopted.visualIntent='本案把同一种小包装沿一条横向或环形路径等距重复排开。';
    adopted.observation={composition:'画面中心是一只手正从桌面上的盒子中拿出一袋小包装的混合坚果。',
      legibleText:['盒内7袋  每袋25克'],visibleDetails:['配料图片有巴旦木、腰果、核桃和冻干草莓。'],
      uncertain:['未看到同一种小包装等距重复排开']};
    const corrected=structuredClone(draft);
    const a=corrected.chapters[1].pages[0];
    const compare=corrected.chapters[2].pages[0];
    const visible='一只手正从桌面上的盒子中拿出一袋小包装';
    a.points=['拟用等距排列讲分装节奏。'];
    a.visibleQuotes=[visible];
    compare.visibleQuotes[0]=visible;
    const unsupported=structuredClone(corrected);
    unsupported.chapters[2].pages[0].visibleQuotes[0]='同一种小包装等距重复排开';
    const {result,sent}=await replay(sameEdition,unsupported,corrected);
    assert.equal(sent.length,2);
    assert.match(sent[1].slice(sent[0].length),/A2、B1、C1 顺序/u);
    assert.ok(result.draft.includes('拟用等距排列讲分装节奏。'));
    assert.ok(result.draft.includes('原图 · '+visible));
    assert.ok(result.draft.includes(visible+'。适合讲分装'));
    assert.doesNotMatch(result.draft,/同一种小包装等距重复排开/u);
    const figureBlock=JSON.parse(sent[0].split('## 同版编稿材料').at(-1).split('```json\n')[1].split('\n```')[0]).figures[0];
    assert(Object.keys(figureBlock).indexOf('observation')<Object.keys(figureBlock).indexOf('visualIntent'));

    const claimed=structuredClone(corrected);
    claimed.chapters[1].pages[0].points=['等距重复说明七个下午。'];
    const rejected=await replay(sameEdition,claimed,corrected);
    assert.match(rejected.sent[1].slice(rejected.sent[0].length),/A2 方向页 points 只收/u);
  });

  await t.test('调序但逐字相同的两条观察沿用原图首读的顺序',async()=>{
    const reordered=structuredClone(materials);
    const observed='盒子立放在抽屉的右侧，袋子斜靠在抽屉左侧内壁';
    reordered.figures[2].observation.composition=observed+'。';
    const selected=structuredClone(draft);
    selected.chapters[1].pages[4].visibleQuotes=['袋子斜靠在抽屉左侧内壁，盒子立放在抽屉的右侧'];
    selected.chapters[2].pages[0].visibleQuotes[2]='袋子斜靠在抽屉左侧内壁，盒子立放在抽屉的右侧';
    const {result,sent}=await replay(reordered,selected);
    assert.equal(sent.length,1);
    assert.ok(result.draft.includes('原图 · '+observed));
    assert.ok(result.draft.includes(observed+'。适合讲一袋用量'));
  });

  await t.test('并排建议只去掉同一槽位的已绑定图号，保留逐图原字及位置校验',async()=>{
    const labeled=structuredClone(draft);
    const compare=labeled.chapters[2].pages[0];
    compare.points=['A2 适合讲分装','B1：适合讲配料','C1 · 适合讲一袋用量'];
    const raw=structuredClone(labeled);
    const {result,sent}=await replay(materials,labeled);
    assert.equal(sent.length,1);
    assert.deepEqual(labeled,raw);
    assert.deepEqual(result.plan.pages.find(page=>page.role==='compare').points,[
      '一只独立小袋。适合讲分装',recipe+'。适合讲配料',quoteDetails+'适合讲一袋用量',
    ]);
    const badCases=[
      {points:['B1 适合讲分装','A2 适合讲配料',compare.points[2]],hint:/并排页 points/u},
      {points:['D1 适合讲分装',...compare.points.slice(1)],hint:/并排页 points/u},
      {points:['A2 画面已经展示七袋实物',...compare.points.slice(1)],hint:/并排页 points/u},
      {visibleQuotes:['',...compare.visibleQuotes.slice(1)],hint:/并排页 points/u},
      {visibleQuotes:['下午这袋坚果，有一点草莓红',...compare.visibleQuotes.slice(1)],hint:/并排页 visibleQuotes/u},
    ];
    for (const {hint,...overrides} of badCases) {
      const wrong=structuredClone(labeled);
      Object.assign(wrong.chapters[2].pages[0],overrides);
      const retry=await replay(materials,wrong,labeled);
      assert.equal(retry.sent.length,2);
      assert.match(retry.sent[1].slice(retry.sent[0].length),hint);
    }
  });

  await t.test('保留 2019 调查 84% 的完整测量对象，也允许省略数值',async()=>{
    const survey=structuredClone(materials);
    survey.research.findings=[{chapter:'人群与接触情境',source:'2019 益普索包装问卷',
      url:'https://www.ipsos.com/zh-cn/consumer',evidence:'84%的消费者希望透过包装看到产品或原材料。'}];
    const correct=structuredClone(draft);
    correct.chapters[0].pages.splice(1,0,outline('trend','包装可见内容值得测试',{
      sourceIndices:[0],points:['2019益普索800多位样本：84%希望透过包装看到产品或原料。'],
    }));
    const drift=structuredClone(correct);
    setPoint(drift,'trend','2019益普索800多位样本：84%希望透过包装看到原料。');
    const {result,sent}=await replay(survey,drift,correct);
    assert.equal(sent.length,2);
    assert.match(sent[1].slice(sent[0].length),/看到产品或原材料/u);
    assert.match(result.draft,/84%希望透过包装看到产品或原料/u);
    setPoint(correct,'trend','受访者希望透过包装看到里边是什么。');
    assert.equal((await replay(survey,correct)).sent.length,1);
  });

  await t.test('分行的主标和看不清的配料不能当配料印字',async()=>{
    const noLabels=structuredClone(materials);
    noLabels.copy.directions[2].main=recipe;
    noLabels.figures[2].observation.legibleText=['巴旦木、腰果','核桃、冻干草莓','混合坚果','25克×7袋'];
    noLabels.figures[2].observation.uncertain=['疑似配料：'+recipe];
    const wrong=structuredClone(draft);
    setPoint(wrong,'compare',falseCompare);
    const {sent}=await replay(noLabels,wrong,draft);
    assert.equal(sent.length,2);
    assert.match(sent[1].slice(sent[0].length),/C1 的首次读图原字/u);
  });

  await t.test('延展图与样机自动接入逐页稿并跟在对应成品页后', () => {
    const basePlan = {
      version: 3,
      project: { title: '测试提案' },
      copy: [{ name: '方向一', main: '主标语一' }],
      figures: [{ id: 'A1', direction: '方向一', name: 'main-a.png', sha256: 'a'.repeat(64) }],
      pages: [
        { number: 1, role: 'cover', label: '封面', title: '测试提案', points: [], chapter: '', imageNote: '', notes: '', figures: [], sources: [] },
        { number: 2, role: 'work', label: '成品展示', title: '方向一', points: [], chapter: '视觉方案', imageNote: '', notes: '', figures: ['A1'], sources: [] },
        { number: 3, role: 'close', label: '封底', title: '谢谢', points: [], chapter: '', imageNote: '', notes: '', figures: [], sources: [] },
      ],
    };
    const derivatives = [
      { id: 'A-ext', direction: '方向一', role: 'extension', name: 'ext-a.png', sha256: 'b'.repeat(64), label: '横版 KV 延展', subject: '横版延展' },
      { id: 'A-mockup', direction: '方向一', role: 'mockup', name: 'mockup-a.png', sha256: 'c'.repeat(64), label: '地铁灯箱样机', subject: '地铁灯箱' },
    ];
    const upgraded = attachDerivativesToPlan(basePlan, derivatives);
    assert.equal(upgraded.pages.length, 4);
    assert.equal(upgraded.pages[2].role, 'application');
    assert.deepEqual(upgraded.pages[2].figures, ['A-ext', 'A-mockup']);
    assert.deepEqual(upgraded.pages.map(p => p.number), [1, 2, 3, 4]);
    const text = manuscriptText(upgraded);
    assert.match(text, /延展与样机/u);
    assert.match(text, /ext-a\.png/u);
    assert.match(text, /mockup-a\.png/u);
  });
});
