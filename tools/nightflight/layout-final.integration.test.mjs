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

test('v3: confirms a manuscript, preserves its pages in PPTX, returns a sourced issue, and rechecks the corrected deck',async t=>{
  const root=await mkdtemp(join(tmpdir(),'nightflight-manuscript-final-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const id='layout-v3', storage=join(root,id,'files');
  await mkdir(storage,{recursive:true});
  const brief='为馆内亲子活动做一张公众号封面，须预约。';
  const strategy='先看出馆内活动，再读预约。';
  const copy='本版文案稿';
  const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4uoAAAAASUVORK5CYII=','base64');
  const artifact=(stage,name,kind='text')=>({stage,name,kind,storageKey:name});
  await Promise.all(Object.entries({'任务卡.md':brief,'策略.md':strategy,'文案.md':copy,'原图.png':image})
    .map(([name,bytes])=>writeFile(join(storage,name),bytes)));
  const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
  const project={id,title:'馆内活动',brief,inputHash:'v3-test',mode:'collab',revision:1,stage:'visual',status:'waiting',
    commands:{},claim:null,owner:null,attachments:[],versions:[],feedback:[],events:[],
    briefScope:{status:'accepted',types:['kv']},directions:['馆内夜游'],choice:'馆内夜游',
    copyReview:{status:'ready',bodyHash:sha(copy),draft:{directions:[{name:'馆内夜游',main:'天黑进馆',secondary:'馆内讲解 · 须预约'}]}},
    research:{findings:[{chapter:'竞争与同类传播',source:'场馆原文',url:'https://example.invalid/venue',
      conclusion:'活动名在海报上方',evidence:'上方标题区为活动名称'}],sections:[{chapter:'竞争与同类传播',evidenceIndices:[0]}]},
    artifacts:[artifact('brief','任务卡.md'),artifact('strategy','策略.md'),artifact('copy','文案.md'),
      {...artifact('visual','原图.png','image'),visual:{direction:'馆内夜游',role:'main',candidate:1,recommended:true,sha256:sha(image)}}],
  };
  const db=new DatabaseSync(join(root,'nightflight.sqlite'));
  db.exec('CREATE TABLE projects(id TEXT PRIMARY KEY,revision INTEGER,state TEXT)');
  db.prepare('INSERT INTO projects VALUES(?,?,?)').run(id,1,JSON.stringify(project));
  db.close();
  const page=(role,title,fields={})=>({role,title,points:[],figureId:'',imageNote:'',internalNote:'',sourceIndices:[],...fields});
  const draft={cover:{title:'馆内活动',subtitle:'公众号封面提案',imageNote:''},chapters:[
    {title:'活动需求',pages:[page('brief','家长先看清参加条件',{points:['报名方式待定。','馆内讲解面向亲子。']}),
      page('peers','同类把活动名放上方',{points:['海报上方呈现活动名。'],sourceIndices:[0]})]},
    {title:'核心策略',pages:[page('strategy',strategy)]},
    {title:'作品与确认',pages:[page('direction','馆内夜游',{figureId:'A1',points:['突出馆内场景。']}),
      page('work','完整封面',{figureId:'A1',imageNote:'横版完整显示',internalNote:'排版前请核对展签'}),page('decision','请确认素材')]},
  ],closing:'感谢观看，期待与您确认下一步方向。'};
  const executable=join(root,'review-fixture.mjs');
  await writeFile(executable,`#!/usr/bin/env node
import {randomUUID} from 'node:crypto';
const [mode,action]=process.argv.slice(2);
const model=mode==='--vision-model'?'test-vision':'deepseek-fixture';
if(action==='profile') console.log(JSON.stringify({model,base:'https://fixture.invalid',host:'fixture.invalid'}));
else {
 const input=[];for await(const part of process.stdin)input.push(part);
 const {body}=JSON.parse(Buffer.concat(input));
 const last=body.messages.at(-1).content;
 const prompt=Array.isArray(last)?last[0].text:last;
 let reply;
 if(prompt.includes('本批PPT正文')) {
   if(!Array.isArray(last) || !last.some(p=>p.image_url?.url.startsWith('data:image/jpeg;base64,')) || !prompt.includes('馆内讲解 · 须预约'))
     throw Error('审稿缺少本版图或原文案');
   const first=prompt.includes('报名方式待定。') && !prompt.includes('客户已确认须预约。');
   reply={issues:first && prompt.includes('第 1、2、3、4 页')?[{page:3,kind:'manuscript',returnStage:'layout',problem:'把预约写成待定',evidence:'原 Brief 写须预约',change:'把「报名方式待定。」改为「客户已确认须预约。」'}]:[]};
 } else if(Array.isArray(last)) {
   reply={composition:'左边标题，右边展柜',legibleText:['天黑进馆'],visibleDetails:['展柜'],uncertain:[]};
 } else reply=${JSON.stringify(draft)};
 console.log(JSON.stringify({model,id:randomUUID(),choices:[{message:{content:JSON.stringify(reply)}}]}));
}`,{mode:0o700});
  const previous=process.env.ONEPITCH_TEXT_EXECUTABLE;
  process.env.ONEPITCH_TEXT_EXECUTABLE=executable;
  t.after(()=>{if(previous===undefined)delete process.env.ONEPITCH_TEXT_EXECUTABLE;else process.env.ONEPITCH_TEXT_EXECUTABLE=previous;});
  const service=createNightflight({root,runLayout,runStage,runManuscript:createManuscriptRunner(executable)});
  t.after(()=>service.close());
  async function request(data) {
    const req=Readable.from(data?[Buffer.from(JSON.stringify(data))]:[]);
    const host='localhost:4420';
    Object.assign(req,{method:data?'POST':'GET',headers:{host,origin:'http://'+host,'content-type':'application/json'},
      url:'/api/projects/'+id+(data?'/action':''),socket:{remoteAddress:'127.0.0.1'}});
    let status, result;
    await service.handle(req,{writeHead:value=>{status=value;},end:body=>{result=JSON.parse(body);}});
    assert.equal(status,200,JSON.stringify(result));
    return result.project;
  }
  async function wait(state) {
    for(let i=0;i<600 && state.status==='running';i++) {
      await new Promise(resolve=>setTimeout(resolve,100));state=await request();
    }
    assert.notEqual(state.status,'failed',state.error);
    return state;
  }
  let state=await wait(await request({kind:'adopt',draftOnly:true,expectedRevision:1}));
  assert.equal(state.canRenderManuscript,true);
  state=await wait(await request({kind:'render_manuscript',expectedRevision:state.revision,opId:randomUUID()}));
  assert.equal(state.status,'waiting');
  assert.equal(state.finalReturn.issues[0].page,3);
  assert.equal(state.finalReturn.issues[0].kind,'manuscript');
  assert.equal(state.versions.at(-1).artifacts.filter(a=>a.renderPage).length,9);
  state=await wait(await request({kind:'message',expectedRevision:state.revision,
    text:'第 3 页，把『报名方式待定。』改为『客户已确认须预约。』\n第 6 页，主图放右'}));
  assert.equal(state.status,'done',JSON.stringify(state.finalReturn));
  assert.equal(state.finalReview.pages.length,9);
  const pptx=state.artifacts.find(a=>a.kind==='pptx');
  const {unzipSync,strFromU8}=createRequire(new URL('../../apps/workbench-preview/package.json',import.meta.url))('fflate');
  const zip=unzipSync(await readFile(join(storage,pptx.url.split('/').at(-1))));
  const xml=name=>strFromU8(zip[name]);
  assert.equal(Object.keys(zip).filter(name=>/^ppt\/slides\/slide\d+\.xml$/u.test(name)).length,9);
  assert.match(xml('ppt/slides/slide3.xml'),/客户已确认须预约。/u);
  assert.match(xml('ppt/slides/slide6.xml'),/天黑进馆/u);
  assert.match(xml('ppt/slides/slide6.xml'),/<p:pic>/u);
  assert.match(xml('ppt/slides/slide7.xml'),/<p:pic>/u);
  assert.doesNotMatch(xml('ppt/slides/slide7.xml'),/排版前请核对展签/u);
  assert.match(xml('ppt/notesSlides/notesSlide7.xml'),/排版前请核对展签/u);
  assert.match(xml('ppt/slides/slide9.xml'),/期待与您确认下一步方向。/u);
  const deckFile=state.artifacts.find(a=>a.name.endsWith('.deck.json'));
  const deck=JSON.parse(await readFile(join(storage,deckFile.url.split('/').at(-1)),'utf8'));
  assert.equal(deck.pages[5].template,'design.halfR');
  assert.equal(deck.pages[6].template,'upload.framed');
});
