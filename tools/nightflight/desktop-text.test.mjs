import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chmod, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {createStageRunner} from './codex-runner.mjs';
import {desktopTextProvider} from './desktop-text.mjs';

test('API stages use configured providers without a Codex installation and record the answering models', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'onepitch-models-'));
  t.after(() => rm(dir, {recursive:true, force:true}));
  const executable = join(dir, 'fixture.mjs');
  await writeFile(executable, `#!/usr/bin/env node
const [mode, action] = process.argv.slice(2);
const vision = mode === '--vision-model';
const model = vision ? 'vision-model' : 'text-model';
if (action === 'profile') {
  console.log(JSON.stringify({host:'fixture.test',base:'https://fixture.test',model}));
} else {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const {body} = JSON.parse(Buffer.concat(chunks).toString());
  const content = body.messages[1].content;
  if (vision !== Array.isArray(content) || body.model !== model) process.exit(2);
  if (vision && !content[1].image_url.url.startsWith('data:image/png;base64,')) process.exit(3);
  console.log(JSON.stringify({id:'request-'+model,model:'actual-'+model,
    choices:[{message:{content:JSON.stringify(vision ? {body:'测试任务卡'} : {briefScope:{status:'accepted',types:['packaging'],reason:'客户委托包装设计'},facts:[{label:'提案任务',value:'测试',quote:'测试'}],unknowns:[]})}}]}));
}`);
  await chmod(executable, 0o700);
  const events = [];
  const onEvent = line => events.push(line);
  const original = process.env.ONEPITCH_TEXT_EXECUTABLE;
  process.env.ONEPITCH_TEXT_EXECUTABLE = executable;
  t.after(() => {
    if (original === undefined) delete process.env.ONEPITCH_TEXT_EXECUTABLE;
    else process.env.ONEPITCH_TEXT_EXECUTABLE = original;
  });
  const run = createStageRunner({binary:join(dir,'no-codex'),codexHome:join(dir,'no-home')});
  const brief = await run({stage:'brief',project:{brief:'测试',title:'测试'},dir,onEvent});
  assert.match(await readFile(join(dir,brief.artifacts[0].name),'utf8'),/提案任务：测试/);
  const path = join(dir,'fixture.png');
  await writeFile(path, 'fixture image bytes');
  const provider = await desktopTextProvider(executable,undefined,onEvent);
  const review = await provider.execute({runId:'review',prompt:'盲看',images:[{path,mediaType:'image/png'}],outputSchema:{}});
  assert.equal(review.model,'actual-vision-model');
  assert.ok(events.some(x=>x.includes('文字 API 回执') && x.includes('actual-text-model') && x.includes('request-text-model')));
  assert.ok(events.some(x=>x.includes('视觉理解 API 回执') && x.includes('actual-vision-model') && x.includes('request-vision-model')));
});

test('desktop visual generation sends the configured writer’s exact prompt and the selected original to the image API', async t=>{
  const dir = await mkdtemp(join(tmpdir(),'onepitch-visual-models-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const executable = join(dir,'fixture.mjs');
  const trace = join(dir,'trace.jsonl');
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC';
  await writeFile(join(dir,'参考.png'),Buffer.from(png,'base64'));
  await writeFile(executable,`#!/usr/bin/env node
import assert from 'node:assert/strict';
import {appendFileSync} from 'node:fs';
const [capability,action] = process.argv.slice(2);
const model = capability.slice(2);
const trace = ${JSON.stringify(trace)};
if (action === 'profile') {
  console.log(JSON.stringify({host:'fixture.test',base:'https://fixture.test',model}));
} else {
  const chunks=[];
  for await(const chunk of process.stdin) chunks.push(chunk);
  const {body,images} = JSON.parse(Buffer.concat(chunks));
  assert.equal(body.model,model);
  if (capability === '--image-model') {
    appendFileSync(trace,JSON.stringify({sent:body.prompt,images})+'\\n');
    console.log(JSON.stringify({failure:'fixture image request received'}));
  } else {
    const content=body.messages[1].content;
    const instruction=typeof content==='string' ? content : content[0].text;
    let answer;
    if (instruction.includes('海报主参考原图核读')) {
      assert.equal(capability,'--vision-model');
      assert.equal(content.length,2);
      answer={配色:'蓝紫底与浅黄字',布局:'标题和日期居中，两侧剪影',景别:'馆舍远景',笔法:'颗粒插画',字体:'浅黄粗体'};
    } else if (instruction.includes('夜航海报生图提示词写作')) {
      assert.equal(typeof content,'string');
      const input=JSON.parse(instruction.split('实际项目输入（JSON）\\n\\n').at(-1));
      assert.equal(input.posterSlogan,'这周六，把还喜欢的那件带来');
      assert.equal(input.strategyPurpose,'让附近住户认出旧衣修补活动。');
      assert.equal(input.mainReference.observations.布局,'标题和日期居中，两侧剪影');
      assert.doesNotMatch(instruction,/左侧白底右侧柜台|重画本案街景|海报文案.md/);
      const redesign={配色:'深绿与橙红',布局:'标题沿底部横排，人物居中',景别:'近景呈现双手缝补',笔法:'干净的硬切色块',字体:'细字重的现代宋体'};
      answer={format:'社区活动横版海报',subject:'住户互相帮忙修补旧衣',background:'社区活动室',lettering:['本周六开放'],
        changes:Object.fromEntries(input.transfer.change.map(element=>[element,redesign[element]]))};
      appendFileSync(trace,JSON.stringify({planned:answer})+'\\n');
    } else if (capability==='--vision-model') {
      const input=JSON.parse(instruction.split('实际项目输入（JSON）\\n\\n').at(-1));
      assert.equal(content.length,2);
      const directions=input.directions.map(d=>({
        main:d.name==='产品'?{source:input.sources[0].source,borrow:'剪纸笔法',apply:'重画本案街景'}:null,
        auxiliary:[],gap:'',
      }));
      answer={sharedBrand:[],directions:input.directions[0].id ?
        Object.fromEntries(input.directions.map((d,i)=>[d.id,directions[i]])) :
        input.directions.map((d,i)=>({direction:d.name,...directions[i]}))};
    } else {
      const input=JSON.parse(instruction.split('实际项目输入（JSON）\\n\\n').at(-1));
      assert.equal(typeof content,'string');
      assert.match(content,/夜航生图提示词写作/);
      if(input.direction.theme) {
        assert.equal(input.direction.theme,input.posterSlogan || '四种配料，正面读完');
        assert.ok(input.materials.every(item=>item.name!=='旧文案.md'));
        assert.match(input.drawingBrief,/提案方向名和 slogan 只用来指导包装画面/);
      }
      if(input.posterSlogan) {
        assert.equal(input.posterSlogan,'这周六，把还喜欢的那件带来');
        assert.match(input.drawingBrief,/作为清楚可读的主标题排入成图/);
        assert.ok(input.materials.every(item=>item.name!=='海报文案.md'));
      }
      if(input.brief==='制作社区活动宣传片') {
        assert.doesNotMatch(content,/盒身字样|只列确认可印|作为清楚可读的主标题排入成图/);
      }
      answer={prompt:'  服务原文\\n借 '+input.transfer.borrow.join('、')+'  '+(input.posterSlogan || '')};
      appendFileSync(trace,JSON.stringify({written:answer.prompt})+'\\n');
    }
    console.log(JSON.stringify({id:'request-'+model,model:'actual-'+model,choices:[{message:{content:JSON.stringify(answer)}}]}));
  }
}`);
  await chmod(executable,0o700);
  const original = process.env.ONEPITCH_TEXT_EXECUTABLE;
  process.env.ONEPITCH_TEXT_EXECUTABLE = executable;
  t.after(()=>{
    if (original === undefined) delete process.env.ONEPITCH_TEXT_EXECUTABLE;
    else process.env.ONEPITCH_TEXT_EXECUTABLE = original;
  });
  const run = createStageRunner({binary:join(dir,'no-codex'),codexHome:join(dir,'no-home')});
  const posterSlogan = '这周六，把还喜欢的那件带来';
  const copyBody = '## 产品\n\n主标题：'+posterSlogan+'\n\n备选：带上这件来。';
  await writeFile(join(dir,'海报文案.md'),copyBody+'\n');
  await writeFile(join(dir,'策略.md'),'## 核心策略\n让附近住户认出旧衣修补活动。\n\n## 核心主张\n- 左侧白底右侧柜台。\n');
  const project={title:'社区旧衣修补',brief:'做一张社区活动海报。',proposalKind:'packaging',mode:'collab',choice:'产品',
    briefScope:{status:'accepted',types:['kv'],reason:'明确委托活动海报'},
    directions:['稳健','产品','用户'],attachments:[{name:'参考.png'}],
    artifacts:[{stage:'copy',kind:'text',name:'海报文案.md'},{stage:'strategy',kind:'text',name:'策略.md'}],
    copyReview:{status:'ready',bodyHash:createHash('sha256').update(copyBody).digest('hex'),draft:{directions:[{name:'产品',main:posterSlogan}]}},
  };
  await assert.rejects(run({stage:'visual',project,dir}),/生图 API 调用失败：fixture image request received/);
  const entries=(await readFile(trace,'utf8')).trim().split('\n').map(line=>JSON.parse(line));
  const sent=entries.filter(e=>e.sent);
  assert.equal(entries.filter(e=>e.planned).length,3);
  assert.equal(new Set(sent.map(e=>e.sent)).size,3);
  assert.equal(sent.filter(e=>e.sent.includes('沿用主参考的布局。标题和日期居中，两侧剪影')).length,2);
  assert.equal(sent.filter(e=>e.sent.includes('重新设计布局。原图可见 标题和日期居中，两侧剪影。本张改为 标题沿底部横排，人物居中')).length,1);
  for (const call of sent) {
    assert.deepEqual(call.images,[{mime:'image/png',data:png}]);
    assert.ok(call.sent.includes(posterSlogan));
  }
  const stale={...project,copyReview:{...project.copyReview,bodyHash:'stale'}};
  await assert.rejects(run({stage:'visual',project:stale,dir}),/海报／KV 缺少.*本版已选 slogan/);
  assert.equal((await readFile(trace,'utf8')).trim().split('\n').length,entries.length);
  const legacy={...project,copyReview:undefined};
  await assert.rejects(run({stage:'visual',project:legacy,dir}),/生图 API 调用失败：fixture image request received/);
  const afterLegacy=(await readFile(trace,'utf8')).trim().split('\n').map(line=>JSON.parse(line));
  assert.deepEqual(afterLegacy.slice(entries.length).filter(e=>e.sent).map(e=>e.sent).sort(),sent.map(e=>e.sent).sort());
  const oldBody = '## 产品\n\n主标题：四种配料，正面读完\n\n旧用途：把四种配料，正面读完印在盒身。';
  await writeFile(join(dir,'旧文案.md'),oldBody);
  const packaging={...project, proposalKind:undefined, brief:'燕麦饮纸盒包装与活动方案',
    briefScope:{status:'accepted',types:['packaging','activity'],reason:'明确委托包装与活动'},
    artifacts:[{stage:'copy',kind:'text',name:'旧文案.md'}],
    copyReview:{status:'ready',bodyHash:createHash('sha256').update(oldBody).digest('hex'),draft:{directions:[{name:'产品',main:'四种配料，正面读完'}]}}};
  await assert.rejects(run({stage:'visual',project:packaging,dir}),/生图 API 调用失败：fixture image request received/);
  const packagingEntries=(await readFile(trace,'utf8')).trim().split('\n').slice(afterLegacy.length).map(line=>JSON.parse(line));
  assert.deepEqual(packagingEntries.filter(e=>e.sent).map(e=>e.sent).sort(),packagingEntries.filter(e=>e.written).map(e=>e.written).sort());
  assert.equal(packagingEntries.filter(e=>e.sent).length,3);
  const linked = {...project, briefScope:{status:'accepted',types:['packaging','kv'],reason:'明确委托包装与 KV'}};
  await assert.rejects(run({stage:'visual',project:linked,dir}),/生图 API 调用失败：fixture image request received/);
  const video = {...project, brief:'制作社区活动宣传片', briefScope:{status:'accepted',types:['tvc'],reason:'明确委托宣传片'}};
  await assert.rejects(run({stage:'visual',project:video,dir}),/生图 API 调用失败：fixture image request received/);
});

test('the desktop waits for the complete poster slogan before calling the image API', async () => {
  const {generateVisualWithDesktopModels}=await import('./visual-references.mjs');
  const posterSlogan='这周六，把还喜欢的那件带来';
  let imageCalls=0;
  await assert.rejects(generateVisualWithDesktopModels({images:[],context:{},drawingBrief:'海报',posterSlogan,
    call:async (_prompt,_images,schema)=>{
      if (!schema) imageCalls++;
      return {model:'deepseek-flash',threadId:'writer',parsedOutput:{prompt:'画上海报标题“把喜欢的那件带来”。'}};
    }}),/缺少该方向已选 slogan 的原句/);
  assert.equal(imageCalls,0);
});

test('KV原参考居中时，借布局的自由提示词不能替换成左文右图', async () => {
  const {generateVisualWithDesktopModels}=await import('./visual-references.mjs');
  const posterSlogan='夜访昆虫，45分钟一场';
  const image={name:'博物馆之夜2024.jpg',sha256:'f'.repeat(64)};
  const observations={配色:'蓝紫底与浅黄色字',布局:'标题和日期居中，两侧剪影围出文字区',
    景别:'馆舍和两侧剪影同框的远景',笔法:'颗粒插画',字体:'浅黄色粗体标题'};
  let imageCalls=0;
  await assert.rejects(generateVisualWithDesktopModels({
    images:[image],context:{transfer:{borrow:['布局','景别','笔法'],change:['配色','字体']}},
    drawingBrief:'生成夜场封面',posterSlogan,posterReference:{image,observations},
    call:async (_prompt,_images,schema)=>{
      if (!schema) imageCalls++;
      return {model:'deepseek-flash',threadId:'writer',parsedOutput:{prompt:posterSlogan+'。借布局：左侧集中文字区，右侧与底部为图像区。'}};
    },
  }),/借改/);
  assert.equal(imageCalls,0);
});

test('brief displays the client view separately and keeps its longer source in the manuscript',async()=>{
  const {makeBriefCard}=await import('./brief-intake.mjs');
  const brief='请设计包装。产品无糖，用泉水。我认为主要卖点是无糖。正面必须标注容量。';
  const facts=[
    {label:'产品卖点与亮点',value:'无糖',quote:'产品无糖'},
    {label:'产品卖点与亮点',value:'泉水',quote:'用泉水'},
    {label:'客户当前判断',value:'主要卖点是无糖',quote:'我认为主要卖点是无糖。'},
    {label:'硬性设计要求',value:'标注容量',quote:'正面必须标注容量'},
  ];
  const make=(rows)=>makeBriefCard(async()=>({parsedOutput:{briefScope:{status:'accepted',types:['packaging'],reason:'客户委托包装设计'},facts:[{label:'提案任务',value:'包装设计',quote:'请设计包装'},...rows],unknowns:[]}}),{brief},{texts:[],images:[]});
  const {body:factsOnly}=await make(facts.slice(0,2));
  assert.match(factsOnly,/产品卖点与亮点：无糖；泉水/);
  assert.doesNotMatch(factsOnly,/客户当前判断|硬性设计要求/);
  assert.match((await make(facts)).body,/客户当前判断：主要卖点是无糖\n硬性设计要求：正面必须标注容量/);
  await assert.rejects(make([{...facts[0],quote:'不存在的客户原话'}]),/原文中找不到/);
});

test('scope rejection returns no card, and invalid classifications cannot release one',async()=>{
  const {makeBriefCard}=await import('./brief-intake.mjs');
  const project={brief:'我需要开发一个库存系统'};
  const inputs={texts:[],images:[]};
  const scope={status:'unsupported',types:[],reason:'目前承接包装、海报、广告片或活动提案，请说明想委托的成果。'};
  const make=briefScope=>makeBriefCard(async()=>({parsedOutput:{briefScope,facts:[],unknowns:[]}}),project,inputs);
  assert.deepEqual(await make({...scope,unknowns:['品类？']}),{briefScope:scope});
  await assert.rejects(make({...scope,status:'accepted',types:['kv']}),/简报字段缺失/);
  for (const invalid of [undefined,{...scope,status:'accepted'},{...scope,status:'accepted',types:['website']}]) {
    await assert.rejects(make(invalid),/简报范围判断无效/);
  }
});
