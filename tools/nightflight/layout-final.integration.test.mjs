import assert from 'node:assert/strict';
import {mkdtemp, rm, mkdir, writeFile, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {Readable} from 'node:stream';
import test from 'node:test';
import {createNightflight} from './service.mjs';
import {runLayout} from './layout.mjs';
import {runStage} from './codex-runner.mjs';

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
