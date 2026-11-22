import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chmod, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {createStageRunner} from './codex-runner.mjs';
import {desktopImageProvider, desktopTextProvider} from './desktop-text.mjs';

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
  if (!vision && content.includes('比稿负责人整理研究摘要')) {
    const corrected=content.includes('这次只修正本次响应的校验问题：文字模型未返回有效 JSON');
    const result={digest:[{findingIndex:0,chapter:'行业与市场',title:'品类规模增长',detail:'2025年增长7%。'}],
      strategyAdvice:[{recommendation:'先展示份量',findingIndices:[0]}]};
    console.log(JSON.stringify({id:corrected?'research-corrected':'research-malformed',model:'actual-'+model,
      choices:[{message:{content:corrected?JSON.stringify(result):'{"digest":[}'}}]}));
    process.exit(0);
  }
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
  const research = await run({stage:'research',project:{brief:'测试',title:'测试',researchDigestOnly:true,
    research:{findings:[{chapter:'行业与市场',conclusion:'2025年增长7%',evidence:'2025年增长7%',source:'测试报告'}]}},dir,onEvent});
  assert.equal(research.researchDigest[0].findingIndex,0);
  assert.equal(events.filter(line=>/API 回执.*research-(?:malformed|corrected)$/.test(line)).length,2);
  assert.equal(events.filter(line=>line.includes('只重问这一项')).length,1);
  const path = join(dir,'fixture.png');
  await writeFile(path, 'fixture image bytes');
  const provider = await desktopTextProvider(executable,undefined,onEvent);
  const review = await provider.execute({runId:'review',prompt:'盲看',images:[{path,mediaType:'image/png'}],outputSchema:{}});
  assert.equal(review.model,'actual-vision-model');
  assert.ok(events.some(x=>x.includes('文字 API 回执') && x.includes('actual-text-model') && x.includes('request-text-model')));
  assert.ok(events.some(x=>x.includes('视觉理解 API 回执') && x.includes('actual-vision-model') && x.includes('request-vision-model')));
});

test('the desktop retries an image only after a typed unsent TLS failure', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'onepitch-tls-'));
  t.after(() => rm(dir,{recursive:true,force:true}));
  const executable = join(dir,'fixture.mjs');
  const trace = join(dir,'requests.jsonl');
  const imagePath = join(dir,'attachment.png');
  const legacyFailures = {
    'legacy timeout':'The request timed out.',
    'legacy SSL':'An SSL error has occurred and a secure connection to the server cannot be made.',
    'connection lost':'The network connection was lost.',
  };
  await writeFile(imagePath,'fixture image bytes');
  await writeFile(trace,'');
  await writeFile(executable,`#!/usr/bin/env node
import {appendFileSync, readFileSync} from 'node:fs';
const [mode, action] = process.argv.slice(2);
const model = mode.slice(2);
if (action === 'profile') {
  console.log(JSON.stringify({host:'fixture.test',base:'https://fixture.test',model}));
} else {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const bytes = Buffer.concat(chunks);
  const {body} = JSON.parse(bytes);
  const message = body.messages?.[1].content;
  const prompt = body.prompt ?? (Array.isArray(message) ? message[0].text : message);
  const path = ${JSON.stringify(trace)};
  const previous = readFileSync(path,'utf8').split('\\n').filter(Boolean).map(line=>JSON.parse(line));
  const alreadySent = previous.some(entry=>entry.mode===mode && entry.prompt===prompt);
  appendFileSync(path,JSON.stringify({mode,prompt,bytes:bytes.toString('base64')})+'\\n');
  const legacyFailures = ${JSON.stringify(legacyFailures)};
  const failures = {'plain SSL':'SSL error','certificate':'The certificate for this server is invalid.',HTTP:'视觉理解接口 HTTP 401'};
  if (Object.hasOwn(failures,prompt)) {
    console.log(JSON.stringify({failure:failures[prompt]}));
  } else if (!alreadySent && Object.hasOwn(legacyFailures,prompt)) {
    console.log(JSON.stringify({failure:legacyFailures[prompt]}));
  } else if (prompt==='typed timeout'||prompt==='typed disconnect') {
    console.log(JSON.stringify({failure:legacyFailures['legacy timeout'],nativeTransport:'typed',
      retryCause:prompt==='typed timeout'?'read-timeout':'read-connection-lost'}));
  } else if (prompt==='untyped signal') {
    console.log(JSON.stringify({failure:legacyFailures['legacy SSL'],retryCause:'tls-before-send'}));
  } else if (!alreadySent || prompt==='persistent') {
    console.log(JSON.stringify({failure:legacyFailures['legacy SSL'],nativeTransport:'typed',retryCause:'tls-before-send'}));
  } else if (mode==='--image-model') {
    console.log(JSON.stringify({requestId:'accepted-image-model',data:[{b64_json:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC'}]}));
  } else {
    console.log(JSON.stringify({id:'accepted-'+model,model,choices:[{message:{content:'{"body":"received"}'}}]}));
  }
}`);
  await chmod(executable,0o700);
  const events = [];
  const provider = await desktopTextProvider(executable,undefined,line=>events.push(line));
  const images = [{path:imagePath,mediaType:'image/png'}];
  const execute = (prompt,attached=[])=>provider.execute({runId:prompt,prompt,images:attached,outputSchema:{}});
  const sent = async (mode,prompt)=>(await readFile(trace,'utf8')).trim().split('\n')
    .map(line=>JSON.parse(line)).filter(entry=>entry.mode===mode && entry.prompt===prompt);
  const assertSamePair = async (mode,prompt)=>{
    const requests = await sent(mode,prompt);
    assert.equal(requests.length,2);
    assert.equal(requests[0].bytes,requests[1].bytes);
    return createHash('sha256').update(Buffer.from(requests[0].bytes,'base64')).digest('hex');
  };

  for (const [mode,attached] of [['--text-model',[]],['--vision-model',images]]) {
    const result = await execute('recover',attached);
    assert.deepEqual(result.parsedOutput,{body:'received'});
    assert.equal(result.threadId,'accepted-'+mode.slice(2));
    assert.equal(result.inputPacketHash,await assertSamePair(mode,'recover'));
  }
  for (const [prompt,mode,attached] of [
    ['legacy timeout','--vision-model',images],
    ['legacy SSL','--vision-model',images],
    ['connection lost','--text-model',[]],
  ]) {
    const recovered = await execute(prompt,attached);
    assert.equal(recovered.threadId,'accepted-'+mode.slice(2));
    assert.equal(recovered.inputPacketHash,await assertSamePair(mode,prompt));
  }
  assert.equal(events.filter(line=>line.includes('在等待回复时超时。原样自动重试一次')).length,1);
  await assert.rejects(execute('persistent',images),{code:'TLS_BEFORE_SEND'});
  await assertSamePair('--vision-model','persistent');
  for (const [prompt,error] of [['plain SSL',/SSL error/],['certificate',/certificate/],['HTTP',/HTTP 401/]]) {
    await assert.rejects(execute(prompt,images),error);
    assert.equal((await sent('--vision-model',prompt)).length,1);
  }
  const imageProvider = desktopImageProvider(executable,dir,undefined,line=>events.push(line));
  const draw = prompt=>imageProvider.execute({runId:prompt,prompt,images});
  const image = await draw('image');
  assert.equal(image.requestId,'accepted-image-model');
  assert.equal(image.original.inspection.mediaType,'image/png');
  await assertSamePair('--image-model','image');
  await assert.rejects(draw('persistent'),{code:'TLS_BEFORE_SEND'});
  await assertSamePair('--image-model','persistent');
  for (const [prompt,reason] of [
    ...Object.entries(legacyFailures),['untyped signal',legacyFailures['legacy SSL']],
    ['typed timeout',legacyFailures['legacy timeout']],['typed disconnect',legacyFailures['legacy timeout']],
    ['plain SSL',/SSL error/],['certificate',/certificate/],['HTTP',/HTTP 401/],
  ]) {
    await assert.rejects(draw(prompt),typeof reason==='string'?{message:reason}:reason);
    assert.equal((await sent('--image-model',prompt)).length,1);
  }
  assert.equal(events.filter(line=>line.startsWith('生图 API 握手失败，确认尚未发送')).length,2);
  assert.equal(events.filter(line=>line.includes('原样自动重试一次')).length,8);
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
    if (instruction.includes('视觉参考美术任务')) {
      assert.equal(typeof content,'string');
      const input=JSON.parse(instruction.split('实际项目输入（JSON）\\n\\n').at(-1));
      assert.deepEqual(input.directions.map(({id,name})=>({id,name})),[{id:'B',name:'产品'}]);
      answer={directions:{B:{focus:'剪纸剪影之间的空隙',translation:'让人物剪影衬出活动标题'}}};
    } else if (instruction.includes('海报主参考原图核读')) {
      assert.equal(capability,'--vision-model');
      assert.equal(content.length,2);
      answer={配色:'蓝紫底与浅黄字',布局:'标题和日期居中，两侧剪影',景别:'馆舍远景',笔法:'颗粒插画',字体:'浅黄粗体'};
    } else if (instruction.includes('夜航海报生图提示词写作')) {
      assert.equal(typeof content,'string');
      const input=JSON.parse(instruction.split('实际项目输入（JSON）\\n\\n').at(-1));
      assert.equal(input.posterSlogan,'这周六，把还喜欢的那件带来');
      assert.equal(input.strategyPurpose,'让附近住户认出旧衣修补活动。');
      assert.equal(input.mainReference.observations.布局,'标题和日期居中，两侧剪影');
      assert.equal(input.mainReference.observations.景别,'远景');
      assert.equal(input.referenceTask.translation,'让人物剪影衬出活动标题');
      assert.equal(input.mainReferenceUse.apply,'重画本案街景');
      assert.doesNotMatch(instruction,/左侧白底右侧柜台|海报文案.md|馆舍远景/);
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
      answer={sharedBrand:[],directions:Object.fromEntries(input.directions.map((d,i)=>[d.id,directions[i]]))};
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
  assert.equal(sent.filter(e=>e.sent.includes('重新设计布局。本张改为 标题沿底部横排，人物居中')).length,1);
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

test('a complete wrapped headline reaches the image API without changing the writer’s prompt', async () => {
  const {generateVisualWithDesktopModels}=await import('./visual-references.mjs');
  const lines='主标题排入画面左上，分两行。\n下午的停顿，\n撕开一袋';
  const numbered='海报主标题按下列顺序排版。\n第一行：倒出来，\n第二行：四种都认得\n副标另排。';
  const numberedLiteral='第一行逐字：不用开整盒，\n第二行逐字：下午拆一袋';
  const samples=[
    {line:'下午的停顿，撕开一袋',prompt:lines,allowed:true},
    {line:'下午的停顿，撕开一袋',prompt:lines.replace('停顿，','停顿！'),allowed:false},
    {line:'下午的停顿，撕开一袋',prompt:lines.replace('停顿，\n','停顿，\n\n'),allowed:false},
    {line:'Try it，下午见',prompt:'画面写\nTry\n  it，\n下午见',allowed:true},
    {line:'Try it，下午见',prompt:'画面写\nTryit，\n下午见',allowed:false},
    {line:'倒出来，四种都认得',prompt:numbered,allowed:true},
    {line:'不用开整盒，下午拆一袋',prompt:numberedLiteral,allowed:true},
    {line:'不用开整盒，下午拆一袋',prompt:numberedLiteral.replace('整盒，','整盒'),allowed:false},
    {line:'倒出来，四种都认得',prompt:numbered.replace('第二行','第一行'),allowed:false},
    {line:'倒出来，四种都认得',prompt:numbered.replace('倒出来，','倒出来'),allowed:false},
    {line:'倒出来，四种都认得',prompt:numbered.replace('四种都认得','四种都认得。'),allowed:false},
    {line:'倒出来，四种都认得',prompt:'画面标题第一行「倒出来，」，第二行「四种都认得」。',allowed:true},
    {line:'倒出来，四种都认得',prompt:'画面标题第二行「倒出来，」，第一行「四种都认得」。',allowed:false},
    {line:'倒出来，四种都认得',prompt:'画面标题第一行「倒出来，」，第二行「四种都认得。」',allowed:false},
    {line:'三点一到，拆一袋',prompt:'载体文字：第一行写“三点一到，”，第二行写“拆一袋”；保留中文逗号。',allowed:true},
    {line:'三点一到，拆一袋',prompt:'载体文字：第一行写“三点一到！”，第二行写“拆一袋”。',allowed:false},
  ];
  for (const {line,prompt,allowed} of samples) {
    const sent=[];
    const run=generateVisualWithDesktopModels({images:[],context:{},drawingBrief:'包装与电商KV',posterSlogan:line,packaging:true,
      call:async (instruction,_images,schema)=>{
        if (!schema) sent.push(instruction);
        return {model:'deepseek-flash',threadId:'writer',parsedOutput:{prompt}};
      }});
    if (allowed) await run;
    else await assert.rejects(run,/缺少该方向已选 slogan 的原句/);
    assert.deepEqual(sent,allowed?[prompt]:[]);
  }
});

test('the image API receives an all-visible pack count only when the brief confirms it', async () => {
  const {generateVisualWithDesktopModels}=await import('./visual-references.mjs');
  const posterSlogan='下午，缺一点脆，也缺一点酸';
  const brief='做七袋装混合坚果外盒正面及电商KV。盒内7袋，每袋25克。';
  const explicit=brief+'客户要求七只全部可见、可数。';
  const priceBrief=brief+'电商目标价29.9元/盒。';
  const partial='闭盒正面印「7袋×25克」，盒旁展示取用一袋。';
  const all='外盒印「7袋×25克」，盒口七只全部可见、可数。';
  const exclusions='\n【不出现】\n价签、29.9 元、促销角标、优惠信息；保鲜、补能、健康功效类话术；认证与奖项图标；可识别人脸；第三方 logo。';
  const reference={name:'原始主参考.png',sha256:'a'.repeat(64)};
  for (const sample of [
    {brief,prompt:all,blocked:true},
    {brief,prompt:partial},
    {brief,prompt:partial+'不要画盒内七袋同时露出，不要要求七袋全部可见或可数。'},
    {brief,prompt:partial+'只用于理解分装关系；不得据此要求七袋全部可见或可数。'},
    {brief,prompt:partial+'无需展示价格，七袋全部可见或可数。',blocked:true},
    {brief:explicit,prompt:all,count:7},
    {brief:explicit,prompt:all.replace('七只全部','八只全部'),blocked:true},
    {brief:priceBrief,prompt:partial+'价签大字写「29.9元/盒」。',priceBlocked:true},
    {brief:priceBrief,prompt:partial+'不画价签、价格和促销角标，29.9 元/盒留在提案材料里。'},
    {brief:priceBrief,prompt:partial+'不画品牌，右下角印29.9元/盒。',priceBlocked:true},
    {brief:priceBrief,prompt:partial+'标示为「目标价29.9元/盒」。'},
    {brief:priceBrief,prompt:partial+exclusions},
    {brief:priceBrief,prompt:partial+exclusions+'\n【画面文字】\n右下角印29.9元/盒。',priceBlocked:true},
    {brief:priceBrief,prompt:partial+exclusions+'\n\n右下角印29.9元/盒。',priceBlocked:true},
  ]) {
    const sent=[];
    const prompt='画面主标题逐字排「'+posterSlogan+'」。'+sample.prompt;
    const run=generateVisualWithDesktopModels({images:[reference],context:{brief:sample.brief},
      drawingBrief:'包装与电商KV',posterSlogan,packaging:true,call:async(instruction,images,schema,task)=>{
        if (schema) {
          assert.match(instruction,/不可凭空要求全数内装同时可见或可数/u);
          assert.deepEqual(images,[]);
          return {model:'deepseek-flash',threadId:'writer',parsedOutput:{prompt}};
        }
        assert.deepEqual(images,[reference]);
        assert.equal(task.exactImagePrompt,true);
        sent.push(instruction);
        return {requestId:'image-fixture'};
      }});
    if (sample.blocked) await assert.rejects(run,{code:'INVALID_STAGE_OUTPUT',message:/不承诺全部内装可见或可数/u});
    else if (sample.priceBlocked) await assert.rejects(run,{code:'INVALID_STAGE_OUTPUT',message:/目标价保留待确认限定/u});
    else {
      const result=await run;
      assert.equal(result.result.requestId,'image-fixture');
      assert.equal(result.promptWriting.visiblePackageUnits,sample.count);
      assert.equal(result.promptWriting.prompt,sent[0]);
      const [written,structure]=sent[0].split('\n\n【已确认的包装结构】');
      assert.equal(written,prompt);
      assert.match(structure,/外盒中的产品是独立内袋/u);
    }
    assert.equal(sent.length,sample.blocked||sample.priceBlocked?0:1);
  }
});

test('the packaging image writer only receives amounts authorized for the artwork', async t=>{
  const {generateVisualWithDesktopModels}=await import('./visual-references.mjs');
  const posterSlogan='15:00，拆一袋';
  const base='做外盒正面及电商首屏 KV。每盒125克，盒内7袋。下午15:00食用。';
  const pending=base+'电商目标价 29.9 元/盒。';
  const drawingBrief='用本案主标题「'+posterSlogan+'」。提案只留目标价29.9元/盒，图上展示125克。';
  const materials=[
    {name:'任务卡.md',text:'目标价29.9元/盒，下午15:00，125克。'},
    {name:'研究.md',text:'同类129.9元，某调查29.9%，本项目目标价为29.9 元/盒。'},
    {name:'策略.md',text:'目标价 ¥29.9 留到提案；展示125克。'},
  ];
  const reference={name:'原始主参考.png',sha256:'a'.repeat(64)};
  const cleanPrompt='首屏写「'+posterSlogan+'」。盒身标125克。';
  function run(brief,prompt,seen) {
    const context={brief,materials,posterSlogan,direction:{name:'到点拆袋',theme:posterSlogan}};
    const original=structuredClone(context);
    const result=generateVisualWithDesktopModels({images:[reference],context,drawingBrief,posterSlogan,packaging:true,
      call:async(instruction,images,schema,task)=>{
        assert.deepEqual(context,original);
        if (schema) {
          seen.context=JSON.parse(task.context);
          assert.deepEqual(images,[]);
          return {model:'deepseek-flash',threadId:'writer',parsedOutput:{prompt}};
        }
        assert.deepEqual(images,[reference]);
        assert.equal(task.exactImagePrompt,true);
        seen.dispatched.push(instruction);
        return {requestId:'image-fixture'};
      }});
    return result.finally(()=>assert.deepEqual(context,original));
  }
  function assertPendingHidden(context) {
    for (const line of [context.brief,context.drawingBrief,...context.materials.map(item=>item.text)]) {
      assert.doesNotMatch(line,/(?<![\d.])29\.9\s*元|¥\s*29\.9/u);
    }
    assert.equal(context.posterSlogan,posterSlogan);
    assert.equal(context.direction.theme,posterSlogan);
    assert.match(context.brief,/125克.*15:00/u);
    assert.match(context.drawingBrief,/15:00，拆一袋.*125克/u);
    assert.match(context.materials[1].text,/129\.9元.*29\.9%/u);
  }
  await t.test('omits the pending amount from every writer field only',async()=>{
    const seen={dispatched:[]};
    await run(pending,cleanPrompt,seen);
    assertPendingHidden(seen.context);
    assert.deepEqual(seen.dispatched,[cleanPrompt]);
  });
  await t.test('still refuses a naked amount in the actual image instructions',async()=>{
    const seen={dispatched:[]};
    await assert.rejects(run(pending,cleanPrompt+'首屏价签写29.9元/盒。',seen),
      {code:'INVALID_STAGE_OUTPUT',message:/目标价保留待确认限定/u});
    assertPendingHidden(seen.context);
    assert.deepEqual(seen.dispatched,[]);
  });
  await t.test('retains the target amount when the client explicitly asks for a qualified KV price',async()=>{
    const seen={dispatched:[]};
    const brief=pending+'请在电商首屏 KV 标出电商目标价 29.9 元/盒。';
    const prompt=cleanPrompt+'KV 显示「电商目标价 29.9 元/盒」。';
    await run(brief,prompt,seen);
    assert.equal(seen.context.brief,brief);
    assert.deepEqual(seen.context.materials,materials);
    assert.equal(seen.context.drawingBrief,drawingBrief);
    assert.deepEqual(seen.dispatched,[prompt]);
  });
  await t.test('retains the actual confirmed sale price',async()=>{
    const seen={dispatched:[]};
    const brief=pending+'现在已确认电商售价为29.9元/盒。';
    const prompt=cleanPrompt+'标售价29.9元/盒。';
    await run(brief,prompt,seen);
    assert.equal(seen.context.brief,brief);
    assert.deepEqual(seen.context.materials,materials);
    assert.deepEqual(seen.dispatched,[prompt]);
  });
});

test('a title correction sends only the actual draft and retains the writer’s exact instructions', async () => {
  const {repairVisualTitle}=await import('./visual-references.mjs');
  const image={name:'已评候选.png',sha256:'a'.repeat(64)};
  const posterSlogan='在一袋里碰头';
  const observed={text:posterSlogan+'。',location:'左上方'};
  const prompt='只去掉句号，标题写「在一袋里碰头」。';
  const result=await repairVisualTitle({image,posterSlogan,observed,call:async(instruction,images,schema,task)=>{
    if (schema) {
      assert.deepEqual(images,[]);
      assert.deepEqual(JSON.parse(task.context),{已见字样:observed.text,实际位置:observed.location,核定原句:posterSlogan,载体:'海报／KV主标题'});
      return {model:'text-model',threadId:'original-writer',parsedOutput:{prompt}};
    }
    assert.deepEqual(images,[image]);
    assert.equal(instruction,prompt);
    assert.equal(task.exactImagePrompt,true);
    return {requestId:'image-edit'};
  }});
  assert.equal(result.result.requestId,'image-edit');
  assert.equal(result.promptWriting.threadId,'original-writer');
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

test('A3 pure-poster transfer keeps per-axis color and redraw guidance independent of source asset bans',async()=>{
  const {generateVisualWithDesktopModels,posterIdentityExclusions}=await import('./visual-references.mjs');
  const image={name:'主参考.jpg',sha256:'44539bee0542aeeb9bc502b2d5abb65822c5e79cce970921e04c0483a44075f4'};
  const posterSlogan='下班这杯，原味就好';
  const avoid='不照搬自嘲熊、南瓜装、蝙蝠、满月、橙紫万圣节配色、合作标识及“萃果狂欢”等原字；不保留多角色群像和底部弧形品牌条。';
  const observations={配色:'主体用橙色和紫色为主色，黄色月亮形成强烈对比，黑色蝙蝠作为点缀。',
    布局:'标题区在上部中央，占整体高度约15%，留白主要在背景大面积橙色，主体在下部中间，占画面约35%。',
    景别:'中景比例，显示三角色占全景约三分之一，背景简化为抽象地平线及月亮。',
    笔法:'线条简洁明快，轮廓清晰，画风扁平卡通，色块分明。',字体:'字体为圆润的无衬线体，字重适中偏粗，黄色填充与背景形成较好区分。'};
  const revision={sourceName:'已退回稿.png',reason:'布局应沿用，实图与要求不符。景别应沿用，实图与要求不符。笔法应沿用，实图与要求不符。',
    edit:'参照原图的留白和中景。增加真实感，避免过于扁平。'};
  const redraw='标题保持上部居中，手和杯聚在下半部，保持环境范围，用醒目的手绘边缘重画。';
  const newDesign={配色:'乳白与浅蓝为底，使用冷柜白光。',字体:'改用利落的无衬线字、中等字重、深色字。',笔法:'改用油画厚涂和柔和边缘。'};
  const safe=posterIdentityExclusions(avoid);
  assert.equal(safe,'不照搬自嘲熊、南瓜装、蝙蝠、满月、合作标识及“萃果狂欢”等原字；不保留多角色群像和底部弧形品牌条');
  assert.equal(posterIdentityExclusions('勿仿照品牌专属字体；不保留右下橙色品牌标识。'),'勿仿照品牌专属字体；不保留右下橙色品牌标识');
  assert.equal(posterIdentityExclusions('不照搬黄色月亮和蝙蝠以及橙紫万圣节配色、橙色圆环品牌标识。'),
    '不照搬黄色月亮和蝙蝠、橙色圆环品牌标识');
  async function run(transfer,repair,revisionFix=redraw,attachments=[image]) {
    const writerPackets=[],dispatch=[];
    const context={brief:'做便利店冷柜旁的 A3 竖版海报，品牌午晴。产品名「乳白小杯原味酸奶」。',transfer,hasBrandArtwork:false,
      mainReferenceUse:{avoid,apply:'重画为手拿一杯，背景采用大面积低干扰冷色留白。'},
      referenceTask:{focus:'保留大面积冷色留白',translation:'画手拿唯一一杯，并用冷柜光照亮杯子。'},
      ...(repair ? {revision:repair} : {})};
    const raw=structuredClone({context,observations});
    const out=await generateVisualWithDesktopModels({images:attachments,context,posterSlogan,posterReference:{image,observations},
      call:async(instruction,images,schema,task)=>{
        if (!schema) {
          assert.deepEqual(images,attachments);
          assert.equal(task.exactImagePrompt,true);
          dispatch.push(instruction);
          return {requestId:'image-attempt'};
        }
        assert.deepEqual(images,[]);
        const input=JSON.parse(task.context);
        writerPackets.push(input);
        assert.equal(input.mainReferenceUse.avoid,safe);
        assert.doesNotMatch(input.mainReferenceUse.apply+input.referenceTask.focus,/冷色/u);
        assert.doesNotMatch(input.mainReference.observations.布局,/橙/u);
        assert.doesNotMatch(input.mainReference.observations.配色,/月亮|蝙蝠/u);
        assert.equal(input.mainReference.observations.景别,'中景，主体约占画面 三分之一，环境简化');
        assert.equal(Boolean(schema.properties.revisionFix),Boolean(repair));
        return {model:'deepseek-flash',threadId:'same-writer',parsedOutput:{format:'便利店冷柜旁海报',subject:'穿白衣服的人伸手拿橙色手套旁的午晴「乳白小杯原味酸奶」',
          background:'低干扰冷色留白与冷柜光',lettering:[posterSlogan,'午晴','乳白小杯原味酸奶'],changes:Object.fromEntries(transfer.change.map(key=>[key,newDesign[key]])),
          ...(repair ? {revisionFix} : {})}};
      }});
    assert.equal(writerPackets.length,1);
    assert.equal(dispatch.length,1);
    assert.deepEqual({context,observations},raw);
    assert.equal(out.promptWriting.prompt,dispatch[0]);
    assert.match(dispatch[0],/A3竖版，宽高比 297:420/u);
    assert.match(dispatch[0],/完整主标题「下班这杯，原味就好」/u);
    assert.match(dispatch[0],/杯盖、盒身及侧面留白/u);
    assert.equal(dispatch[0].split(posterSlogan).length,2);
    assert.match(dispatch[0],/不保留多角色群像和底部弧形品牌条/u);
    assert.doesNotMatch(dispatch[0],/背景大面积橙色|橙紫万圣节配色/u);
    assert.match(dispatch[0],/画面主体和动作。穿衣服的人伸手拿手套旁的午晴「乳白小杯原味酸奶」/u);
    return {prompt:dispatch[0],input:writerPackets[0],plan:out.promptWriting.plan};
  }
  const keepPalette=await run({borrow:['配色','布局','景别'],change:['笔法','字体']});
  assert.match(keepPalette.prompt,/沿用主参考的配色。橙色、紫色（主色）；黄色（对比）；黑色（点缀）/u);
  assert.match(keepPalette.prompt,/标题区在上部中央，占整体高度约15%.*主体在下部中间，占画面约35%/u);
  assert.match(keepPalette.prompt,/沿用主参考的景别。中景，主体约占画面 三分之一，环境简化/u);
  assert.doesNotMatch(keepPalette.prompt,/冷色留白|本轮重新绘制/u);
  const colorFix='让橙色与紫色分别占较大的色域，黄色只作对比。';
  const colorRevision=await run({borrow:['配色','布局','景别'],change:['笔法','字体']},
    {...revision,reason:'配色应沿用，实图与要求不符。'},colorFix);
  assert.match(colorRevision.prompt,/重画上一稿的配色。执行下列已核定/u);
  assert.match(colorRevision.prompt,/沿用主参考的配色。橙色、紫色（主色）/u);
  assert.doesNotMatch(colorRevision.prompt,/分别占较大的色域/u);
  const revised=await run({borrow:['布局','景别','笔法'],change:['配色','字体']},revision,
    redraw+'避免扁平质感，换成实物摄影。');
  assert.deepEqual(revised.input.revision.axes,['布局','景别','笔法']);
  assert.match(revised.plan.revisionFix,/换成实物摄影/u);
  assert.match(revised.prompt,/重画上一稿的布局、景别、笔法/u);
  assert.match(revised.prompt,/整张海报画成二维平涂插画。商品、人物、手、道具和背景都用统一的手绘轮廓与色块/u);
  assert.match(revised.prompt,/重新设计配色。本张改为 乳白与浅蓝为底/u);
  assert.doesNotMatch(revised.prompt,/沿用主参考的配色|换成实物摄影|避免过于扁平|已退回稿.png/u);
  const factRevision=await run({borrow:['布局','景别','笔法'],change:['配色','字体']},
    {...revision,reason:'杯口出现未确认的莓果',edit:'画不带果肉的原味酸奶杯'},'杯口不出现莓果。');
  assert.match(factRevision.prompt,/上一稿的具体修正。杯口不出现莓果/u);
  const noOriginal={...revision,referenceInput:'observations'};
  const official={name:'客户品牌资料.png',sha256:'a'.repeat(64)};
  const transfer={borrow:['布局','景别','笔法'],change:['配色','字体']};
  const described=await run(transfer,noOriginal,redraw,[official]);
  assert.equal(described.input.mainReference.descriptionOnly,true);
  assert.equal(described.input.mainReference.imageNumber,undefined);
  assert.match(described.prompt,/参照信息来自同一原图观察/u);
  assert.doesNotMatch(described.prompt,/张附件是本方向主参考/u);
  await assert.rejects(run(transfer,noOriginal),/实际附件.*不一致/u);
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
