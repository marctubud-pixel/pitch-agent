import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectManuscriptMaterials, createManuscriptRunner, formatManuscriptInput } from './manuscript.mjs';

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
  const page=(role,title,fields={})=>({role,title,points:[],figureId:'',imageNote:'',sourceIndices:[],internalNote:'',...fields});
  const executable=await nativeFixture(root,{
    cover:{title:'夜访昆虫',subtitle:'公众号封面提案',imageNote:''},
    chapters:[
      {title:'课题与洞察',pages:[page('brief','让家长认出馆内夜场'),
        page('trend','家长会先看时间',{points:['受访家长提到活动时间。'],sourceIndices:[1]}),
        page('trend','夜场增加导览',{points:['馆方公布两场夜间导览。'],sourceIndices:[2]}),
        page('peers','同类把活动名放在画面中央',{points:['海报中央写活动名。'],sourceIndices:[0]})]},
      {title:'策略与版式',pages:[page('strategy','不讲展柜，只讲预约'),page('execution','把预约放在活动名旁')]},
      {title:'作品与决定',pages:[page('direction','天黑进馆',{figureId:'A2',points:['让围着展柜的孩子进入画面。']}),
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
  assert.match(draft,/主标 · 进馆看虫\n  - 副标 · 须预约/u);
  assert.match(draft,/原图与文案左右分屏 ｜ `A2` · `adopted\.png`/u);
  assert.match(draft,/横幅全页展示 ｜ `A2` · `adopted\.png`\n- \*\*内部备注\*\*：检查展柜边角的裁切。/u);
  assert(!draft.includes('unused.png'));
  const planFile=result.artifacts.find(a=>a.name.endsWith('.plan.json'));
  const plan=JSON.parse(await readFile(join(root,planFile.name),'utf8'));
  assert.equal(plan.version,3);
  assert.equal(plan.pages.find(p=>p.role==='strategy').title,'先识别活动，再读预约。');
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
