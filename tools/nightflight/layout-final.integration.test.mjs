import assert from 'node:assert/strict';
import {mkdtemp, rm, mkdir, writeFile, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {Readable} from 'node:stream';
import test from 'node:test';
import {createNightflight} from './service.mjs';
import {runLayout} from './layout.mjs';
import {runStage} from './codex-runner.mjs';
import {createManuscriptRunner} from './manuscript.mjs';

test('stored layout → editable PPTX and page JPGs → visual reads and final verdict',async t=>{
  const root=await mkdtemp(join(tmpdir(),'nightflight-layout-final-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const id='layout-final';
  const projectRoot=join(root,id);
  await mkdir(join(projectRoot,'files'),{recursive:true});
  const project={id,title:'夜航终审演练',brief:'陈列物料现场提案',inputHash:'fixture',
    mode:'auto',revision:1,stage:'layout',status:'failed',commands:{},claim:null,owner:null,
    artifacts:[],attachments:[],versions:[],feedback:[],events:[],directions:[],choice:null};
  const db=new DatabaseSync(join(root,'nightflight.sqlite'));
  db.exec('CREATE TABLE projects(id TEXT PRIMARY KEY,revision INTEGER,state TEXT)');
  db.prepare('INSERT INTO projects VALUES(?,?,?)').run(id,1,JSON.stringify(project));
  db.close();
  const executable=join(root,'local-reviewer.mjs');
  const log=join(root,'reads.log');
  await writeFile(executable,`#!/usr/bin/env node
import {appendFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const [mode,action]=process.argv.slice(2);
const model=mode==='--vision-model'?'test-vision':'test-text';
if(action==='profile') console.log(JSON.stringify({model,base:'https://fixture.invalid',host:'fixture.invalid'}));
else {
 const chunks=[];for await(const chunk of process.stdin)chunks.push(chunk);
 const {body}=JSON.parse(Buffer.concat(chunks));
 const content=body.messages[1].content;
 const images=Array.isArray(content)?content.filter(item=>item.type==='image_url'):[];
 for(const item of images) {
   const url=item.image_url.url;
   if(!url.startsWith('data:image/jpeg;base64,') || Buffer.from(url.split(',')[1],'base64').readUInt16BE(0)!==0xffd8) throw Error('页图字节错误');
 }
 appendFileSync(${JSON.stringify(log)},JSON.stringify({model,pages:images.length})+'\\n');
 const verdict=images.length ? {body:'已收到渲染页图'} : {outcome:'pass',returnStage:'',reason:'逐页收齐'};
 console.log(JSON.stringify({model,id:randomUUID(),choices:[{message:{content:JSON.stringify(verdict)}}]}));
}`,{mode:0o700});
  const previous=process.env.ONEPITCH_TEXT_EXECUTABLE;
  process.env.ONEPITCH_TEXT_EXECUTABLE=executable;
  t.after(()=>{if(previous===undefined)delete process.env.ONEPITCH_TEXT_EXECUTABLE;else process.env.ONEPITCH_TEXT_EXECUTABLE=previous;});
  const service=createNightflight({root,runLayout,runStage});
  t.after(()=>service.close());
  async function request(data) {
    const req=Readable.from(data?[Buffer.from(JSON.stringify(data))]:[]);
    const host='localhost:4420';
    Object.assign(req,{method:data?'POST':'GET',headers:{host,origin:'http://'+host,'content-type':'application/json'},
      url:'/api/projects/'+id+(data?'/action':''),socket:{remoteAddress:'127.0.0.1'}});
    let result;
    await service.handle(req,{writeHead:status=>assert.equal(status,200),end:body=>{result=JSON.parse(body).project;}});
    return result;
  }
  let state=await request({kind:'retry'});
  for(let i=0;i<1200 && state.status==='running';i++) {
    await new Promise(resolve=>setTimeout(resolve,100));state=await request();
  }
  assert.equal(state.status,'done',state.error || JSON.stringify(state.finalReturn));
  const pages=state.artifacts.filter(a=>a.stage==='layout' && a.renderPage);
  assert.ok(pages.length>0);
  assert.deepEqual(state.finalReview.pages,pages.map(a=>a.renderPage));
  const calls=(await readFile(log,'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(calls.filter(c=>c.model==='test-vision').reduce((n,c)=>n+c.pages,0),pages.length);
  assert.equal(calls.at(-1).model,'test-text');
  const pptx=state.artifacts.find(a=>a.kind==='pptx');
  assert.equal((await readFile(join(projectRoot,'files',pptx.url.split('/').at(-1)))).readUInt16LE(),0x4b50);
  t.diagnostic(pages.length+' 页与 '+calls.length+' 次隔离模型调用');
});

test('Case B refines native slides, rechecks the actual edition and waits for explicit acceptance',async t=>{
  const root=await mkdtemp(join(tmpdir(),'nightflight-manuscript-final-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const id='layout-case-b', storage=join(root,id,'files');
  await mkdir(storage,{recursive:true});
  const brief='为馆内亲子活动做一张公众号封面，须预约。联名七袋装外盒的电商目标价为29.9元/盒。每袋25克，盒内7袋。品牌名和正式标志还没定。';
  const strategy='先看出馆内活动，再读预约。';
  const copy='本版文案稿';
  const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4uoAAAAASUVORK5CYII=','base64');
  const visualIntent='用家长牵孩子进馆的动作表现亲子参与。';
  const observation={composition:'左边标题，右边展柜',legibleText:['天黑进馆','预约'],visibleDetails:['展柜'],uncertain:['未看清人物动作']};
  const peerSource={chapter:'竞争与同类传播',source:'场馆原文',url:'https://example.invalid/venue',
    conclusion:'活动名在海报上方',evidence:'上方标题区为活动名称'};
  const competitorRow='洽洽礼盒用透明容器和多罐分装展示不同坚果，规格为1.308—1.988千克。';
  const competitorConcern='竞品规格与项目 Brief 冲突';
  const packageImage=(brand,range)=>({actualPackaging:true,pageUrl:'https://example.invalid/package/'+range,
    observation:'包装原图可见净含量：'+range,firstRead:{brand,front:brand+'礼盒，净含量：'+range}});
  const packagingSource={chapter:peerSource.chapter,source:'礼盒包装原图',url:'https://example.invalid/package',
    conclusion:'同类礼盒展示透明容器与分装',evidence:'洽洽 1.308kg、1.988kg；沃隆 520克',
    images:[packageImage('洽洽','1.308kg'),packageImage('洽洽','1.988kg'),packageImage('沃隆','520克')]};
  const artifact=(stage,name,kind='text')=>({stage,name,kind,storageKey:name});
  await Promise.all(Object.entries({'任务卡.md':brief,'策略.md':strategy,'文案.md':copy,'原图.png':image})
    .map(([name,bytes])=>writeFile(join(storage,name),bytes)));
  const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
  const project={id,title:brief.repeat(4),brief,inputHash:'v3-test',mode:'collab',revision:1,stage:'visual',status:'waiting',
    commands:{},claim:null,owner:null,attachments:[],versions:[],feedback:[],events:[],
    briefScope:{status:'accepted',types:['kv']},directions:['馆内夜游'],choice:'馆内夜游',
    copyReview:{status:'ready',bodyHash:sha(copy),draft:{directions:[{name:'馆内夜游',main:'天黑进馆',secondary:'馆内讲解 · 须预约'}]}},
    research:{findings:[peerSource,packagingSource],sections:[{chapter:peerSource.chapter,evidenceIndices:[0,1]}]},
    artifacts:[artifact('brief','任务卡.md'),artifact('strategy','策略.md'),artifact('copy','文案.md'),
      {...artifact('visual','原图.png','image'),visual:{direction:'馆内夜游',role:'main',candidate:1,recommended:true,sha256:sha(image),
        blind:{sha256:sha(image)},scores:[{role:'品牌',candidate:1,score:5,onPackStatus:'verified',reason:'品牌名以空白框做占位。'}],
        referenceHandoff:{referenceTask:{translation:visualIntent}}}}],
  };
  const db=new DatabaseSync(join(root,'nightflight.sqlite'));
  db.exec('CREATE TABLE projects(id TEXT PRIMARY KEY,revision INTEGER,state TEXT)');
  db.prepare('INSERT INTO projects VALUES(?,?,?)').run(id,1,JSON.stringify(project));
  db.close();
  const page=(role,title,fields={})=>({role,title,points:[],figureId:'',imageNote:'',internalNote:'',sourceIndices:[],visibleQuotes:[],...fields});
  const sizePending='七袋装外盒正面尺寸与结构未提供：请补实物尺寸，确认版面比例。';
  const pricePending='29.9元/盒为电商目标价；同规格竞品价与四种内容物营养声称待核实后再定价值表达。';
  const wrongPriceUnit=pricePending.replace('元/盒','元/袋');
  const absentPending='实物包装背标照片未提供：请补照片，确认背标排版。';
  const joinedDecision='品牌名与正式标志提供后，请确认公众号封面的可替换标志区；确认封面图片比例与文字安全区。';
  const printed='海报上方呈现活动名。';
  const allegedMissingGlyph='海报上方呈活动名。';
  const croppedTranscription='海报下方呈现活动名。';
  const footerConcern='封底页缺少页码和页脚品牌标识，导致分页和全册视觉节奏不统一。';
  const sampleConcern='图中产品样稿未重画替换品牌占位';
  const sameWording='报名用词“预约”与简报“预约”不一致';
  const decisionLines=[joinedDecision,sizePending,pricePending,wrongPriceUnit];
  const wrappedDecisions={
    '缺少七袋装外盒正面实物尺寸及结构信息':sizePending,
    '定价核实后才能确认文案表达':pricePending,
    '遗漏待确认的包装背标照片':absentPending,
    '目标价写成按袋计价':wrongPriceUnit,
  };
  const draft={cover:{title:'馆内活动',subtitle:'公众号封面提案',imageNote:''},chapters:[
    {title:'活动需求',pages:[page('brief','家长先看清参加条件',{points:['报名方式待定。','馆内讲解面向亲子。','品牌名与正式标志待定。']}),
      page('peers','同类把活动名放上方',{points:[printed,competitorRow],sourceIndices:[0,1]})]},
    {title:'核心策略',pages:[page('strategy',strategy)]},
    {title:'作品与确认',pages:[page('direction','馆内夜游',{figureId:'A1',points:['拟突出馆内场景。'],visibleQuotes:['右边展柜'],
      internalNote:'图中产品为样稿，后续重画并替换品牌占位。'}),
      page('work','完整封面',{figureId:'A1',imageNote:'横版完整显示',internalNote:'排版前请核对展签'}),
      page('decision','请确认素材',{points:decisionLines})]},
  ],closing:'感谢观看，期待与您确认下一步方向。'};
  const executable=join(root,'review-fixture.mjs');
  const log=join(root,'case-b-calls.jsonl');
  const protectedCase=join(root,'protected-case');
  const unreadableCase=join(root,'unreadable-case');
  await writeFile(executable,`#!/usr/bin/env node
import {createHash,randomUUID} from 'node:crypto';
import {appendFileSync,existsSync} from 'node:fs';
process.on('uncaughtExceptionMonitor',error=>
  appendFileSync(${JSON.stringify(log)},JSON.stringify({fixtureError:error.message})+'\\n'));
const [mode,action]=process.argv.slice(2);
const model=mode==='--vision-model'?'test-vision':'deepseek-fixture';
if(action==='profile') console.log(JSON.stringify({model,base:'https://fixture.invalid',host:'fixture.invalid'}));
else {
 const input=[];for await(const part of process.stdin)input.push(part);
 const {body}=JSON.parse(Buffer.concat(input));
 const last=body.messages.at(-1).content;
 const prompt=Array.isArray(last)?last[0].text:last;
 let reply;
 if(prompt.includes('只转录裁片内实际可读的全部文字')) {
   const ctx=JSON.parse(prompt.split('实际项目输入（JSON）\\n\\n')[1]);
   const [crop]=last.filter(part=>part.type==='image_url');
   if(mode!=='--vision-model' || last.length!==2 || !crop?.image_url.url.startsWith('data:image/png;base64,') ||
      Object.keys(ctx).sort().join()!==['裁片位置','原始页图指纹','页码'].sort().join() || ctx['页码']!==4 ||
      !/^[a-f0-9]{64}$/.test(ctx['原始页图指纹']) || ctx['裁片位置'].length!==4 || !ctx['裁片位置'].every(Number.isFinite))
     throw Error('应只收到同版第4页的PNG裁片和定位');
   if(JSON.stringify(body.messages).includes(${JSON.stringify(printed)}) ||
      JSON.stringify(body.messages).includes(${JSON.stringify(allegedMissingGlyph)}) || prompt.includes('待核所见'))
     throw Error('裁片盲读泄露了原文或旧审查');
   const bytes=Buffer.from(crop.image_url.url.split(',')[1],'base64');
   if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a' || bytes.readUInt32BE(16)<=1 || bytes.readUInt32BE(20)<=1)
     throw Error('不是从实页取得的局部图');
   const negative=existsSync(${JSON.stringify(unreadableCase)});
   appendFileSync(${JSON.stringify(log)},JSON.stringify({role:'裁片盲读',pages:[4],unreadable:negative})+'\\n');
   reply=negative?{legibility:'unreadable',transcript:'海报上方'}:{legibility:'readable',transcript:${JSON.stringify(croppedTranscription)}};
 } else if(prompt.includes('核对剩余必改项。')) {
   if(!Array.isArray(last) || !last.some(item=>item.image_url)) throw Error('缺少必改项实页');
   const ctx=JSON.parse(prompt.split('实际项目输入（JSON）\\n\\n')[1]);
   reply={items:Object.fromEntries(Object.entries(ctx['待核所见']).map(([id,issue])=>{
     const location='正文',reason='逐字比对给定的实际证据';
     if(issue.problem==='建议统一馆内的叫法')
       return [id,{kind:'pending_confirmation',actual:'馆内',required:'馆内亲子活动',source:'B1',location,reason}];
     if(issue.problem==='策略页需重列参加条件')
       return [id,{kind:'confirmed_requirement_missing',actual:'',required:'策略页需重列参加条件',source:'S1',location,reason}];
     if(['封面缺少品牌标识占位','决策页缺少品牌标识占位'].includes(issue.problem))
       return [id,{kind:'confirmed_requirement_missing',actual:'页上未见品牌标识占位图形',
         required:'品牌名和正式标志还没定，当前页应加品牌占位图形',source:'B1',location,reason}];
     if(issue.problem==='同类参考点列少字')
       return [id,{kind:'fact_conflict',actual:'文本显示“'+${JSON.stringify(allegedMissingGlyph)}+'”',
         required:${JSON.stringify(printed)},source:'',location,reason}];
     if(issue.problem===${JSON.stringify(competitorConcern)})
       return [id,{kind:'fact_conflict',actual:'页面提及“规格为1.308—1.988千克”，与Brief的“每袋25克，盒内7袋”冲突',
         required:'每袋25克，盒内7袋',source:'B1',location,reason}];
     if(issue.problem===${JSON.stringify(footerConcern)})
       return [id,{kind:'confirmed_requirement_missing',actual:'封底无数字页码且无品牌页脚标识。',
         required:'全册需统一视觉节奏，含统一的位置页码与页脚品牌标识，确保册内导航与品牌识别连贯。',source:'S1',location,reason}];
     if(issue.problem===${JSON.stringify(sampleConcern)})
       return [id,{kind:'confirmed_requirement_missing',actual:issue.problem,required:'本页必须把占位重画成正式品牌。',source:'B1',location,reason}];
     if(issue.problem===${JSON.stringify(sameWording)})
       return [id,{kind:'fact_conflict',actual:issue.problem,required:'已确认用词“预约”',source:'B1',location,reason}];
     if(issue.problem==='待确认的两项需提案人拍板')
       return [id,{kind:'confirmed_requirement_missing',actual:'第8页两项仍需客户决定，不宜代客户拍板。',
         required:${JSON.stringify(joinedDecision)},source:'B1,S1',location,reason}];
     const quotedDecision=${JSON.stringify(wrappedDecisions)}[issue.problem];
     if(quotedDecision)
       return [id,{kind:'confirmed_requirement_missing',actual:issue.problem,
         required:'决策页：‘'+quotedDecision+'’',source:'S1',location,reason}];
     return [id,{kind:issue.page===2?'readable_suggestion':'fact_conflict',actual:'对应实页',
       required:issue.page===2?'':'须预约',location,reason,source:issue.page===2?'':'B1'}];
   }))};
 } else if(prompt.includes('本批PPT')) {
   if(!Array.isArray(last) || !last.some(p=>p.image_url?.url.startsWith('data:image/jpeg;base64,')) || !prompt.includes('馆内讲解 · 须预约'))
     throw Error('审稿缺少本版图或原文案');
   if(!prompt.includes('Case B 执行版')) throw Error('未加载 1.2.0');
   const ctx=JSON.parse(prompt.split('实际项目输入（JSON）\\n\\n')[1]);
   const pages=ctx['本批PPT'];
   const role=['逻辑岗','措辞岗','美术岗'].find(key=>prompt.includes(key+'：'));
   const roleId={'逻辑岗':'logic','措辞岗':'copy','美术岗':'craft'}[role];
   const initial=prompt.includes('结合全册页序读本批');
   const pageNumbers=pages.map(page=>page['页码']);
   if(role==='美术岗' && ctx['本批逐页稿'].some(page=>page.figures.length)) {
     if(Object.hasOwn(ctx,'采用图读图') || pages.some(page=>Object.hasOwn(page,'notes')) ||
        prompt.includes(${JSON.stringify(visualIntent)}) || prompt.includes('未看清人物动作') ||
        prompt.includes('后续重画并替换品牌占位') || ctx['本批图号'][0]?.sha256!==${JSON.stringify(sha(image))})
       throw Error('图注独立检查混入先前读图或失去采用图指纹');
     if(!prompt.includes('实际页图中的画面重点、并排图注与对应作品核对') ||
        !prompt.includes('数包装实物和线描图标要分开') || !prompt.includes('可删的配料细数或装饰图标数用 P1'))
       throw Error('美术岗未独立核对实页图注与数量');
   }
   if(role==='逻辑岗' && ctx['本批逐页稿'].some(page=>page.figures.length) &&
      JSON.stringify(ctx['采用图读图']?.[0]?.observation)!==JSON.stringify(${JSON.stringify(observation)}))
     throw Error('逻辑岗缺少同版采用原图的首次观察');
   const images=last.filter(item=>item.type==='image_url').map(item=>createHash('sha256')
     .update(Buffer.from(item.image_url.url.split(',')[1],'base64')).digest('hex'));
   if(initial && role==='美术岗' && pageNumbers.join(',')==='1,2,3,4') {
     appendFileSync(${JSON.stringify(log)},JSON.stringify({role,pages:pageNumbers,images,initial,truncated:true})+'\\n');
     console.log(JSON.stringify({model,id:'truncated-craft-p1-p4',choices:[{finish_reason:'length',message:{content:'{"issues": ['}}]}));
     process.exit(0);
   }
   if (ctx['本批待复核'].some(issue=>issue.role!==roleId)) throw Error('复验混入其他岗位的意见');
   const issue={level:'P0',impact:'proposal',problem:'把预约写成待定',evidence:'原 Brief 写须预约',change:'明确预约。',
     operation:'text',target:'layout',quote:'须预约',from:'报名方式待定。',to:'客户已确认须预约。'};
   const issues=[];
   if (role==='逻辑岗' && pages.some(p=>p['页码']===1))
     issues.push({...issue,page:1,operation:'note',target:'layout',from:'',to:'',quote:'',
       problem:'封面缺少品牌标识占位',evidence:'品牌名待确认，封面没有画占位',change:'建议封面加品牌图形'});
   if (role==='措辞岗' && pages.some(p=>p['页码']===4))
     issues.push({...issue,page:4,operation:'note',target:'layout',from:'',to:'',quote:'',
       problem:'同类参考点列少字',evidence:${JSON.stringify(allegedMissingGlyph)},change:'补字'});
   if (role==='逻辑岗' && pages.some(p=>p['页码']===4 && p.text.includes(${JSON.stringify(competitorRow)})))
     issues.push({...issue,page:4,operation:'hold',target:'research',from:'',to:'',quote:'',
       problem:${JSON.stringify(competitorConcern)},evidence:${JSON.stringify(competitorRow)},change:'把规格改为每袋25克'});
   if (role==='逻辑岗' && pages.some(p=>p.text.some(line=>line.includes('报名方式待定。')))) issues.push({...issue,page:3});
   if (role==='措辞岗' && pages.some(p=>p.text.some(line=>line.includes('报名方式待定。'))))
     issues.push({...issue,page:3,target:'copy',from:'报名方式待定',to:'须预约'});
   if (role==='措辞岗' && pages.some(p=>p['页码']===3 && p.text.includes('馆内讲解面向亲子。')))
     issues.push({...issue,page:3,operation:'hold',target:'brief',from:'',to:'',quote:'',
       problem:'建议统一馆内的叫法',evidence:'实页和原简报写馆内',change:'核对更正式的叫法'});
   if (role==='逻辑岗' && pages.some(p=>p['页码']===5))
     issues.push({...issue,page:5,operation:'hold',target:'strategy',from:'',to:'',quote:'',
       problem:'策略页需重列参加条件',evidence:'策略页只呈现已定策略句',change:'加一遍参加条件'});
   if (role==='逻辑岗' && pages.some(p=>p['页码']===6)) {
     for (const problem of [${JSON.stringify(sampleConcern)},${JSON.stringify(sameWording)}])
       issues.push({...issue,page:6,operation:'note',problem,evidence:problem,change:'交给责任阶段'});
   }
   if (role==='逻辑岗' && pages.some(p=>p['页码']===8)) {
     issues.push({...issue,page:8,operation:'note',target:'layout',from:'',to:'',quote:'',
       problem:'决策页缺少品牌标识占位',evidence:'决策页只有品牌名文字，没有单独图形',change:'建议加品牌图形'});
     issues.push({...issue,page:8,impact:'production',operation:'hold',target:'brief',from:'',to:'',quote:'',
       problem:'上线发布前须拿到正式报名链接',evidence:'本轮只交公众号封面提案',change:'记录为后续发布待确认'});
     issues.push({...issue,page:8,operation:'hold',target:'brief',from:'',to:'',quote:'',
       problem:'待确认的两项需提案人拍板',evidence:${JSON.stringify(joinedDecision)},change:'提案人确认后执行'});
     for (const [problem,evidence] of Object.entries(${JSON.stringify(wrappedDecisions)})) {
       if (['遗漏待确认的包装背标照片','目标价写成按袋计价'].includes(problem) &&
           !existsSync(${JSON.stringify(protectedCase)})) continue;
       issues.push({...issue,page:8,operation:'hold',target:'brief',from:'',to:'',quote:'',problem,evidence,change:'请提案人确认'});
     }
   }
   if (role==='美术岗' && pages.some(p=>p['页码']===2))
     issues.push({...issue,page:2,level:'P0',operation:'layout',target:'visual',
       problem:'目录导读可精简',evidence:'三个章名依次并列',change:'保留给排版设计判断'});
   if (role==='美术岗' && pages.some(p=>p['页码']===9 && p.text.includes('感谢观看，') && p.text.includes('期待与您确认下一步方向。')))
     issues.push({...issue,page:9,operation:'note',from:'',to:'',quote:'',problem:${JSON.stringify(footerConcern)},
       evidence:'第1至第8页均有页码与页脚标识，第9页无数字页码且无品牌页脚。',change:'补充该页页码并加品牌页脚。'});
   if (role==='美术岗' && pages.some(p=>p['页码']===7))
     issues.push({...issue,page:7,level:'P1',operation:'visual',target:'visual',
       problem:'可重绘原图光影',evidence:'领读主体背光',change:'留给视觉阶段提案人决定'});
   if (role==='美术岗' && pages.some(p=>p['页码']===7 && p.images.some(image=>image.sha256===${JSON.stringify(sha(image))}) && !p.text.includes('A1 · 采用原图')))
     issues.push({...issue,page:7,level:'P1',problem:'单图无展签',evidence:'全开图页的左右留空',change:'用双线画框和展签。',
       operation:'gallery',from:'',to:'',quote:''});
   if (role==='措辞岗' && pages.some(p=>p['页码']===7 && p.text.includes('成品展示')))
     issues.push({...issue,page:7,level:'P1',problem:'区分方案和可发布成品',change:'把眉标改为方案效果图。',
       from:'成品展示',to:'方案效果图',quote:''});
   if (role==='逻辑岗' && existsSync(${JSON.stringify(protectedCase)}) && pages.some(p=>p['页码']===5))
     issues.push({...issue,page:5,from:${JSON.stringify(strategy)},to:'删掉预约要求。'});
   appendFileSync(${JSON.stringify(log)},JSON.stringify({role,pages:pageNumbers,images,initial,actual:pages.map(p=>p.text.join(''))})+'\\n');
   reply={issues};
 } else if(prompt.includes('全览拼图')) {
   appendFileSync(${JSON.stringify(log)},JSON.stringify({role:'全览',pages:[]})+'\\n');
   reply={observation:'已检查全览'};
 } else if(Array.isArray(last)) {
   if(mode!=='--vision-model' || !last.some(item=>item.image_url?.url===${JSON.stringify('data:image/png;base64,'+image.toString('base64'))}))
     throw Error('读图未收到本版采用的原图');
   reply=${JSON.stringify(observation)};
 } else {
   const materials=JSON.parse(prompt.split(String.fromCharCode(96).repeat(3)).at(-2).slice(4));
   const figure=materials.figures[0];
   if(mode!=='--text-model' || figure.id!=='A1' || figure.sha256!==${JSON.stringify(sha(image))} ||
      figure.visualIntent!==${JSON.stringify(visualIntent)} || JSON.stringify(figure.observation)!==JSON.stringify(${JSON.stringify(observation)}))
     throw Error('DeepSeek 编稿未分开接收同版原图的画面意图和实际读图');
   if(JSON.stringify(materials.research.findings)!==JSON.stringify(${JSON.stringify([peerSource,{...packagingSource,images:packagingSource.images.map(({firstRead,...image})=>image)}])}) ||
      materials.research.sections[0].evidenceIndices.join()!=='0,1') throw Error('DeepSeek 编稿未收到同版同类结论和出处');
   reply=${JSON.stringify(draft)};
 }
 console.log(JSON.stringify({model,id:randomUUID(),choices:[{message:{content:JSON.stringify(reply)}}]}));
}`,{mode:0o700});
  const previous=process.env.ONEPITCH_TEXT_EXECUTABLE;
  process.env.ONEPITCH_TEXT_EXECUTABLE=executable;
  t.after(()=>{if(previous===undefined)delete process.env.ONEPITCH_TEXT_EXECUTABLE;else process.env.ONEPITCH_TEXT_EXECUTABLE=previous;});
  const service=createNightflight({root,runLayout,runStage,runManuscript:createManuscriptRunner(executable)});
  t.after(()=>service.close());
  async function request(data,expected=200) {
    const req=Readable.from(data?[Buffer.from(JSON.stringify(data))]:[]);
    const host='localhost:4420';
    Object.assign(req,{method:data?'POST':'GET',headers:{host,origin:'http://'+host,'content-type':'application/json'},
      url:'/api/projects/'+id+(data?'/action':''),socket:{remoteAddress:'127.0.0.1'}});
    let status, result;
    await service.handle(req,{writeHead:value=>{status=value;},end:body=>{result=JSON.parse(body);}});
    assert.equal(status,expected,JSON.stringify(result));
    return result.project;
  }
  async function wait(state) {
    for(let i=0;i<600 && state.status==='running';i++) {
      await new Promise(resolve=>setTimeout(resolve,100));state=await request();
    }
    if (state.status==='failed') {
      const calls=await readFile(log,'utf8').catch(()=>'');
      const errors=calls.trim().split('\n').filter(Boolean).map(line=>JSON.parse(line).fixtureError).filter(Boolean);
      assert.fail([state.error,...errors].filter(Boolean).join(' | '));
    }
    return state;
  }
  let state=await wait(await request({kind:'adopt',draftOnly:true,expectedRevision:1}));
  assert.equal(state.canRenderManuscript,true);
  state=await wait(await request({kind:'render_manuscript',expectedRevision:state.revision,opId:randomUUID()}));
  assert.equal(state.status,'waiting');
  assert(state.finalReview,JSON.stringify({stage:state.stage,status:state.status,error:state.error,finalReturn:state.finalReturn,events:state.events.slice(-8)}));
  assert.equal(state.finalReview.outcome,'ready',JSON.stringify(state.finalReview));
  assert.equal(state.finalReview.rounds,2);
  assert.equal(state.finalReview.changed,3);
  assert.equal(state.finalReview.acceptedAt,undefined);
  assert.equal(state.versions.at(-1).artifacts.filter(a=>a.renderPage).length,9);
  assert.equal(state.finalReview.pages.length,9);
  const pptx=state.artifacts.find(a=>a.kind==='pptx');
  const {unzipSync,strFromU8}=createRequire(new URL('../../apps/workbench-preview/package.json',import.meta.url))('fflate');
  const zip=unzipSync(await readFile(join(storage,pptx.url.split('/').at(-1))));
  const original=state.versions.at(-1).artifacts.find(a=>a.kind==='pptx');
  const before=unzipSync(await readFile(join(storage,original.url.split('/').at(-1))));
  const xml=name=>strFromU8(zip[name]);
  assert.equal(Object.keys(zip).filter(name=>/^ppt\/slides\/slide\d+\.xml$/u.test(name)).length,9);
  assert.match(xml('ppt/slides/slide3.xml'),/客户已确认须预约。/u);
  assert.match(strFromU8(before['ppt/slides/slide3.xml']),/报名方式待定。/u);
  assert.ok(xml('ppt/slides/slide4.xml').includes(printed));
  assert.ok(xml('ppt/slides/slide4.xml').includes(competitorRow));
  assert.match(xml('ppt/slides/slide6.xml'),/天黑进馆/u);
  assert.match(xml('ppt/slides/slide6.xml'),/右边展柜/u);
  assert.doesNotMatch(xml('ppt/slides/slide6.xml'),/原图 · 右边展柜/u);
  assert.match(xml('ppt/slides/slide6.xml'),/<p:pic>/u);
  assert.match(xml('ppt/slides/slide7.xml'),/<p:pic>/u);
  assert.match(xml('ppt/slides/slide7.xml'),/A1 · 采用原图/u);
  assert.match(xml('ppt/slides/slide7.xml'),/方案效果图/u);
  assert.match(xml('ppt/slides/slide7.xml'),/<a:effectLst\/>/u);
  assert.doesNotMatch(xml('ppt/slides/slide7.xml'),/排版前请核对展签/u);
  assert.match(xml('ppt/notesSlides/notesSlide7.xml'),/排版前请核对展签/u);
  const decisionText=Array.from(xml('ppt/slides/slide8.xml').matchAll(/<a:t>([^<]*)<\/a:t>/gu),match=>match[1]).join('');
  for (const line of decisionLines) assert.ok(decisionText.includes(line));
  assert.match(xml('ppt/slides/slide9.xml'),/期待与您确认下一步方向。/u);
  const deckFile=state.artifacts.find(a=>a.name.endsWith('.deck.json'));
  const deck=JSON.parse(await readFile(join(storage,deckFile.url.split('/').at(-1)),'utf8'));
  assert.equal(deck.pages[5].template,'design.half');
  assert.equal(deck.pages[6].template,'upload.framed');
  assert.equal(deck.pages[8].template,'closing.type');
  const reads=(await readFile(log,'utf8')).trim().split('\n').map(JSON.parse);
  for (const role of ['逻辑岗','措辞岗']) {
    assert.deepEqual(reads.filter(item=>item.role===role).slice(0,3).flatMap(item=>item.pages),[1,2,3,4,5,6,7,8,9]);
    assert.equal(reads.filter(item=>item.role===role && item.initial && item.pages.join(',')==='1,2,3,4').length,1);
  }
  const craft=reads.filter(item=>item.role==='美术岗' && item.initial);
  assert.equal(craft.filter(item=>item.truncated).length,1);
  assert.deepEqual(craft[0].pages,[1,2,3,4]);
  const parts=craft.slice(1,3).sort((a,b)=>a.pages[0]-b.pages[0]);
  assert.deepEqual(parts.map(item=>item.pages),[[1,2],[3,4]]);
  assert.deepEqual(parts.flatMap(item=>item.images),craft[0].images);
  assert.deepEqual(craft.slice(3,5).flatMap(item=>item.pages),[5,6,7,8,9]);
  assert(reads.some(item=>item.role==='全览'));
  assert(reads.some(item=>item.role==='裁片盲读' && !item.unreadable));
  assert(reads.some(item=>item.pages.includes(3) && item.actual?.some(text=>text.includes('客户已确认须预约。'))));
  assert(state.artifacts.some(item=>item.kind==='image' && item.name===state.finalReview.contact));
  const report=state.artifacts.find(item=>item.name===state.finalReview.report).text.split('## 待决定或可继续优化')[1];
  assert.match(report,/第 1 页 · P1 · 封面缺少品牌标识占位/u);
  assert.match(report,/第 4 页 · P1 · 同类参考点列少字/u);
  assert.ok(report.includes('第 4 页 · P1 · '+competitorConcern));
  assert.match(report,/实页为同类产品的规格，已逐一对到对应品牌的包装原图读字/u);
  assert.match(report,/第 8 页 · P1 · 决策页缺少品牌标识占位/u);
  assert.match(report,/品牌待确定已列在对应职责页/u);
  assert.match(report,/实页放大读到「呈现活动名。」，所报漏字在同版原生正文与实图均可核对/u);
  assert.ok(report.includes('第 9 页 · P1 · '+footerConcern));
  assert.match(report,/封底原句完整，页脚与页码作为版式建议/u);
  assert.ok(report.includes('readable '+croppedTranscription));
  assert.match(report,/第 8 页 · P1 · 上线发布前须拿到正式报名链接/u);
  assert.match(report,/第 8 页 · P1 · 待确认的两项需提案人拍板/u);
  assert.match(report,/第 8 页 · P1 · 缺少七袋装外盒正面实物尺寸及结构信息/u);
  assert.match(report,/第 8 页 · P1 · 定价核实后才能确认文案表达/u);
  assert.match(report,/当前 · 实页已列出所报的客户待确认事项。/u);
  assert.match(report,/第 2 页 · P1 · 目录导读可精简 · 版式/u);
  assert.match(report,/第 3 页 · P1 · 建议统一馆内的叫法/u);
  assert.match(report,/第 5 页 · P1 · 策略页需重列参加条件/u);
  assert.ok(report.includes('第 6 页 · P1 · '+sampleConcern));
  assert.ok(report.includes('第 6 页 · P1 · '+sameWording));
  assert.match(report,/采用原图的独立品牌核对已确认空白占位/u);
  assert.match(report,/实页原生文字、同版采用原图读字与已确认材料均为「预约」/u);
  assert.match(report,/第 7 页 · P1 · 可重绘原图光影 · 视觉/u);
  assert.doesNotMatch(report,/第 3 页 · P0/u);
  await request({kind:'accept_final',expectedRevision:state.revision-1},409);
  state=await request({kind:'accept_final',expectedRevision:state.revision});
  assert.equal(state.status,'done');
  assert(state.finalReview.acceptedAt);

  // Attempting a protected edit on the adopted edition keeps the native policy and blocks acceptance.
  await writeFile(protectedCase,'1');
  state=await wait(await request({kind:'message',expectedRevision:state.revision,targetStage:'final',text:'复看这一版'}));
  assert.equal(state.status,'waiting');
  assert.equal(state.finalReview.outcome,'blocked');
  assert.equal(state.finalReview.returnStage,'strategy');
  assert.equal(state.finalReview.rounds,2);
  assert.ok(state.finalReview.blockingPages.includes(8));
  const protectedReport=state.artifacts.find(item=>item.name===state.finalReview.report).text;
  assert.match(protectedReport,/第 8 页 · P0 · 遗漏待确认的包装背标照片/u);
  assert.match(protectedReport,/第 8 页 · P0 · 目标价写成按袋计价/u);
  const protectedPptx=state.artifacts.find(a=>a.kind==='pptx');
  const kept=unzipSync(await readFile(join(storage,protectedPptx.url.split('/').at(-1))));
  assert.match(strFromU8(kept['ppt/slides/slide5.xml']),/先看出馆内活动，再读预约。/u);
  await request({kind:'accept_final',expectedRevision:state.revision},409);

  await rm(protectedCase);
  await writeFile(unreadableCase,'1');
  state=await wait(await request({kind:'message',expectedRevision:state.revision,targetStage:'final',text:'复看裁片'}));
  assert.equal(state.finalReview.outcome,'blocked');
  assert.equal(state.finalReview.returnStage,'layout');
  assert.deepEqual(state.finalReview.blockingPages,[4]);
  const unreadableReport=state.artifacts.find(item=>item.name===state.finalReview.report).text;
  assert.match(unreadableReport,/第 4 页 · P0 · 同类参考点列少字/u);
  assert.match(unreadableReport,/unreadable 海报上方/u);
  await request({kind:'accept_final',expectedRevision:state.revision},409);

  // A mixed-in render cannot even reach the reviewer.
  const stale=state.artifacts.find(item=>item.renderPage===4);
  const callsBefore=await readFile(log,'utf8');
  await writeFile(join(storage,stale.url.split('/').at(-1)),image);
  state=await wait(await request({kind:'message',expectedRevision:state.revision,targetStage:'final',text:'复核附件版次'}));
  assert.equal(state.stage,'layout');
  assert.equal(state.status,'waiting');
  assert.match(state.finalReturn.reason,/第 4 页渲染与本版不符/u);
  assert.equal(await readFile(log,'utf8'),callsBefore);
});
