import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { createStageRunner } from './codex-runner.mjs';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC';
const fake = `#!${process.execPath}
const fs = require('node:fs'); const path = require('node:path');
const args = process.argv.slice(2);
if (args.join(' ')==='login status') {
 const auth=fs.readFileSync(path.join(process.env.CODEX_HOME,'action'),'utf8');
 console.error(auth==='api-key'?'Logged in using an API key':'Logged in using ChatGPT');process.exit(0);
}
if (!args.includes('--ignore-user-config') || !args.includes('read-only') || !args.includes('shell_tool') || process.env.OPENAI_API_KEY) process.exit(3);
const home = process.env.CODEX_HOME;
const action = fs.readFileSync(path.join(home,'action'),'utf8');
const id = require('node:crypto').randomUUID();
let input=''; process.stdin.setEncoding('utf8');
process.stdin.on('data',x=>input+=x);
process.stdin.on('end',()=>{
 console.log(JSON.stringify({type:'thread.started',thread_id:id}));
 if(action==='failed'){console.log('{"type":"turn.failed"}'); process.exitCode=1;return;}
 if(!input.includes('测试茶')) process.exit(4);
 if(action==='pdf' && !input.includes('NIGHTFLIGHT PDF TEST')) process.exit(8);
 if(action==='final' && (!input.includes('实际页面证据') || input.includes('大块预览输入'))) process.exit(6);
 if(action==='attachment' && (!input.includes('只有附件才有的词') || !args.includes('--image'))) process.exit(7);
 if(action==='search') console.log(JSON.stringify({type:'item.completed',item:{type:'web_search',query:'测试公开品类'}}));
 let body = {body:'按材料制订测试茶任务卡'};
 if(action==='copy') body={body:'方向一 山风／方向二 晨雾／方向三 旧街',directions:['山风','晨雾','旧街']};
 if(action==='badcopy') body={body:'山风',directions:['山风','山风','山风']};
 if(action==='image' || action==='other-thread'){
   if (!input.includes('指定方向："晨雾"')) process.exit(5);
   const folder=path.join(home,'generated_images',action==='image'?id:require('node:crypto').randomUUID());
   fs.mkdirSync(folder,{recursive:true});
   fs.writeFileSync(path.join(folder,'exec-'+id+'.png'),Buffer.from('${png}','base64'));
 }
 fs.writeFileSync(args[args.indexOf('-o')+1],args.includes('--output-schema')?JSON.stringify(body):'茶园晨雾概念稿');
 console.log('{"type":"turn.completed"}');
});`;

async function fixture(t, action) {
  const root = await mkdtemp(join(tmpdir(),'nightflight-model-test-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const home = join(root,'home'),dir=join(root,'attempt'),binary=join(root,'fake-codex');
  await Promise.all([mkdir(home),mkdir(dir),writeFile(binary,fake,{mode:0o700})]);
  await writeFile(join(home,'action'),action);
  const runner = createStageRunner({binary,codexHome:home,model:'fixture'});
  const project = {title:'测试茶',brief:'制作测试茶的包装概念稿',mode:'collab',attachments:[],artifacts:[],directions:['山风','晨雾','旧街'],choice:'晨雾'};
  return {dir, project, run:(stage,overrides={})=>runner({stage,dir,project,...overrides})};
}

test('copy returns three labels bound to the output file and an isolated CLI receipt',async t=>{
  const f=await fixture(t,'copy');
  const result=await f.run('copy');
  assert.deepEqual(result.directions,['山风','晨雾','旧街']);
  assert.match(await readFile(join(f.dir,result.artifacts[0].name),'utf8'),/旧街/);
  const [run]=await readdir(join(f.dir,'.codex-runs'));
  const receipt=JSON.parse(await readFile(join(f.dir,'.codex-runs',run,'receipt.json')));
  assert.equal(receipt.exitCode,0);
  assert.ok(receipt.threadId);
});
test('collaboration generates the chosen direction using the current thread PNG bytes',async t=>{
  const f=await fixture(t,'image');
  const result=await f.run('visual');
  assert.equal(result.artifacts.length,2);
  assert.match(result.artifacts[0].name,/^visual-2-/);
  assert.equal((await readFile(join(f.dir,result.artifacts[0].name))).toString('base64'),png);
  assert.match(result.artifacts[1].text,/晨雾/);
});
for (const [action,stage,error] of [['other-thread','visual',/未留下原生生图文件/],['badcopy','copy',/三个/],['failed','brief',/调用失败/],['api-key','brief',/ChatGPT 账户/]]) {
  test('reject '+action+' without publishing business artifacts',async t=>{
    const f=await fixture(t,action);
    await assert.rejects(f.run(stage),error);
    assert.deepEqual((await readdir(f.dir)).filter(n=>!n.startsWith('.')),[]);
  });
}
test('no unselected collaborative image, invented review or path traversal',async t=>{
  const f=await fixture(t,'failed');
  delete f.project.choice;
  await assert.rejects(f.run('visual'),/先选定/);
  await assert.rejects(f.run('final'),/PPTX/);
  f.project.attachments.push({name:'../outside.md'});
  await assert.rejects(f.run('brief'),/文件名无效/);
});

test('reads attachment bytes and gives real image paths to Codex',async t=>{
  const f=await fixture(t,'attachment');
  await writeFile(join(f.dir,'参考.md'),'只有附件才有的词');
  await writeFile(join(f.dir,'产品.png'),Buffer.from(png,'base64'));
  f.project.attachments.push({name:'参考.md'},{name:'产品.png'});
  assert.equal((await f.run('brief')).artifacts.length,1);
});
test('research traces actual search events and reports evidence boundaries',async t=>{
  const f=await fixture(t,'search');
  const result=await f.run('research');
  assert.match(result.artifacts[0].text,/测试公开品类/);
});
test('final reads native slide XML, excludes bulky deck JSON and records missing rendered pages',async t=>{
  const f=await fixture(t,'final');
  const requireApp=createRequire(new URL('../../apps/workbench-preview/package.json',import.meta.url));
  const {zipSync,strToU8}=requireApp('fflate');
  const pptx=zipSync({'ppt/slides/slide1.xml':strToU8('<p:sld xmlns:p="urn:slide" xmlns:a="urn:text"><a:p><a:r><a:t>实际页面证据</a:t></a:r></a:p></p:sld>')});
  await writeFile(join(f.dir,'排版.pptx'),pptx);
  await writeFile(join(f.dir,'排版.deck.json'),'大块预览输入');
  f.project.artifacts=[{stage:'layout',name:'排版.pptx',kind:'pptx'},{stage:'layout',name:'排版.deck.json',kind:'text'}];
  const result=await f.run('final');
  assert.match(result.artifacts[0].text,/页级视觉审查待完成/);
});

test('rejects excessive image count and unsupported attachment type before starting Codex',async t=>{
  const f=await fixture(t,'failed');
  f.project.attachments=Array.from({length:5},(_,i)=>({name:'参考'+i+'.jpg'}));
  await assert.rejects(f.run('brief'),/最多上传 4 张/);
  f.project.attachments=[{name:'简报.pages'}];
  await writeFile(join(f.dir,'简报.pages'),'content');
  await assert.rejects(f.run('brief'),/转换成 PDF/);
});

test('extracts a real uploaded PDF with the pinned local runtime and passes its page text to Codex',
  {skip:process.env.NIGHTFLIGHT_TEST_PDF!=='1' && 'requires a local PDF runtime and owned-child RSS monitoring'}, async t=>{
    const f=await fixture(t,'pdf');
    const content='BT /F1 16 Tf 10 30 Td (NIGHTFLIGHT PDF TEST) Tj ET';
    const objects=['<</Type /Catalog /Pages 2 0 R>>','<</Type /Pages /Count 1 /Kids [3 0 R]>>',
      '<</Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources <</Font <</F1 5 0 R>>>>>>',
      '<</Length '+content.length+'>>\nstream\n'+content+'\nendstream',
      '<</Type /Font /Subtype /Type1 /BaseFont /Helvetica>>'];
    let pdf='%PDF-1.4\n';
    const offsets=[0];
    for(const [i,obj] of objects.entries()){
      offsets.push(pdf.length);
      pdf+=(i+1)+' 0 obj\n'+obj+'\nendobj\n';
    }
    const xref=pdf.length;
    pdf+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<</Size 6 /Root 1 0 R>>\nstartxref\n'+xref+'\n%%EOF';
    await writeFile(join(f.dir,'上传简报.pdf'),pdf);
    f.project.attachments=[{name:'上传简报.pdf'}];
    f.project.brief=''; // Only attachment submitted; no duplicate plaintext is supplied.
    assert.equal((await f.run('brief')).artifacts.length,1);
});
