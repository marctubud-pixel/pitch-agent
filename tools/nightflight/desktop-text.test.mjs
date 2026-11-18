import assert from 'node:assert/strict';
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
    const input=JSON.parse(instruction.split('实际项目输入（JSON）\\n\\n').at(-1));
    let answer;
    if (capability==='--vision-model') {
      assert.equal(content.length,2);
      answer={sharedBrand:[],directions:input.directions.map(d=>({
        direction:d.name,
        main:d.name==='产品'?[{source:input.sources[0].source,borrow:'剪纸笔法',apply:'重画本案街景'}]:[],
        auxiliary:[],gap:'',
      }))};
    } else {
      assert.equal(typeof content,'string');
      assert.match(content,/夜航生图提示词写作/);
      assert.equal(input.direction,'产品');
      answer={prompt:'  服务原文\\n借 '+input.transfer.borrow.join('、')+'  '};
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
  const project={title:'老照片分享会',brief:'做一张社区活动海报。',mode:'collab',choice:'产品',
    directions:['稳健','产品','用户'],attachments:[{name:'参考.png'}]};
  await assert.rejects(run({stage:'visual',project,dir}),/生图 API 调用失败：fixture image request received/);
  const entries=(await readFile(trace,'utf8')).trim().split('\n').map(line=>JSON.parse(line));
  const written=entries.filter(e=>e.written).map(e=>e.written).sort();
  const sent=entries.filter(e=>e.sent);
  assert.equal(new Set(written).size,3);
  assert.deepEqual(sent.map(e=>e.sent).sort(),written);
  for (const call of sent) assert.deepEqual(call.images,[{mime:'image/png',data:png}]);
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
