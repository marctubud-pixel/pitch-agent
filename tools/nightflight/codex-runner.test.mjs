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
 if(action==='final' && (!input.includes('ppt/slides/slide140.xml') || !input.includes('实际页面证据') || input.includes('大块预览输入'))) process.exit(6);
 if(action==='attachment' && (!input.includes('只有附件才有的词') || !args.includes('--image'))) process.exit(7);
 let body = {body:'按材料制订测试茶任务卡'};
 if(action.startsWith('research-')){
   const schema=JSON.parse(fs.readFileSync(args[args.indexOf('--output-schema')+1],'utf8')).properties;
   if(action==='research-followup' && !input.includes('用户暂不确定渠道'))process.exit(10);
   if(schema.queries) body={queries:['公开茶类年报']};
   else if(schema.findings) {
     console.log(JSON.stringify({type:'item.completed',item:{type:'web_search',action:{type:'search',queries:['测试公开品类']}}}));
     body={findings:[{chapter:'行业与市场',conclusion:'茶礼场景更强调赠礼用途',source:'合成行业报告',url:'https://source.example.org/report',evidence:action==='research-fiction'?'这是虚构引文':'本次样本单列礼盒用途',implication:'策略需比较礼赠与日常使用情境'}],gaps:['渠道尚未选定'],next:'比较可核实的渠道样本'};
     if(action==='research-followup')body.findings=[];
   } else if(schema.accepted){
     if(!input.includes('独立会话') || !input.includes('本次样本单列礼盒用途'))process.exit(11);
     body={ready:action==='research-ok',accepted:[0],question:'优先门店还是线上？还有多少预算？',gaps:[],next:'结合渠道验证礼赠方向'};
   } else process.exit(12);
 }
 if(action==='strategy-return')body={body:'当前研究缺少适用依据。',researchReturn:'请补查本地渠道的实际接触场景'};
 if(action==='copy') body={body:'方向一 山风／方向二 晨雾／方向三 旧街',directions:['山风','晨雾','旧街']};
 if(action==='badcopy') body={body:'山风',directions:['山风','山风','山风']};
 if(action==='disabled-host') console.log(JSON.stringify({type:'item.completed',item:{type:'error',message:'code-mode host is disabled'}}));
 if(action==='image' || action==='other-thread'){
   if(args[args.indexOf('code_mode_host')-1]!=='--enable'||args[args.indexOf('image_generation')-1]!=='--enable')process.exit(9);
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
  const requests=[];
  const researchDependencies={
    lookup:async()=>[{address:'93.184.216.34',family:4}],
    transport:async ({url})=>{
      requests.push(url.href);
      if(url.hostname==='lite.duckduckgo.com') throw Error('fixture discovery unavailable');
      if(url.hostname==='cn.bing.com') return {status:200,headers:{'content-type':'text/xml'},body:Buffer.from('<rss><channel><item><title>合成报告</title><link>https://source.example.org/report</link></item></channel></rss>')};
      return {status:200,headers:{'content-type':'text/html'},body:Buffer.from('<html><title>合成行业报告</title><p>本次样本单列礼盒用途。</p></html>')};
    },
  };
  const runner = createStageRunner({binary,codexHome:home,model:'fixture',researchDependencies});
  const project = {title:'测试茶',brief:'制作测试茶的包装概念稿',mode:'collab',attachments:[],artifacts:[],directions:['山风','晨雾','旧街'],choice:'晨雾'};
  return {dir, project, requests, run:(stage,overrides={})=>runner({stage,dir,project,...overrides})};
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
for (const [action,stage,error] of [['disabled-host','visual',/工具宿主未启用/],['other-thread','visual',/未留下原生生图文件/],['badcopy','copy',/三个/],['failed','brief',/调用失败/],['api-key','brief',/ChatGPT 账户/]]) {
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
for (const [action, ready, count] of [
  ['research-ok', true, 1],
  ['research-blocked', false, 1],
  ['research-fiction', false, 0],
]) {
  test(
    action + ' executes discovery from a sparse brief and gates only on grounded findings and review',
    async (t) => {
      const f = await fixture(t, action);
      f.project.brief = '测试茶';
      f.project.previousResearch = { legacyText: '上次的待补问题' };
      const { research, artifacts } = await f.run('research');
      assert.equal(research.ready, ready);
      assert.equal(research.question, action === 'research-blocked' ? '优先门店还是线上？' : '');
      assert.ok(artifacts[0].text.includes('调研方法版本：' + research.methodVersion));
      assert.equal(research.findings.length, count);
      assert.ok(f.requests.some((url) => url.startsWith('https://cn.bing.com/search?')));
      assert.ok(f.requests.includes('https://source.example.org/report'));
      assert.match(artifacts[0].text, /测试公开品类/);
      if (count) assert.match(artifacts[0].text, /本次样本单列礼盒用途/);
      else assert.match(research.gaps.join(' '), /未从.*核对/);
    },
  );
}
test('automatic research keeps a key gap without asking for a user decision', async (t) => {
  const f = await fixture(t, 'research-blocked');
  f.project.mode = 'auto';
  const {research} = await f.run('research');
  assert.equal(research.ready, false);
  assert.equal(research.question, '');
  assert.equal(research.findings.length, 1);
});

test('collaboration can ask its first decision after a follow-up obtains usable evidence', async (t) => {
  const f = await fixture(t, 'research-blocked');
  f.project.researchFollowup = true;
  f.project.previousResearch = {ready:false,findings:[],question:'',next:'定位礼赠的来源'};
  const {research} = await f.run('research');
  assert.equal(research.ready,false);
  assert.equal(research.findings.length,1);
  assert.equal(research.question,'优先门店还是线上？');
});

test('follow-up rechecks earlier evidence, considers user feedback and does not repeat a question', async (t) => {
  const f = await fixture(t, 'research-followup');
  const earlier = {chapter:'行业与市场', conclusion:'礼赠是此次样本中的一个场景', source:'上轮报告', url:'https://source.example.org/older', evidence:'本次样本单列礼盒用途', implication:'礼赠和日常用途可分别比较'};
  f.project.previousResearch = {question:'优先门店还是线上？',findings:[earlier]};
  f.project.researchFollowup = true;
  f.project.researchQuestionAnswered = true;
  f.project.feedback = [{stage:'research',text:'用户暂不确定渠道'}];
  const {research} = await f.run('research');
  assert.ok(f.requests.includes(earlier.url));
  assert.deepEqual(research.findings,[earlier]);
  assert.equal(research.question,'');
  assert.equal(research.ready,false);
});

test('strategy returns specific research question when the handoff cannot support a decision', async (t) => {
  const f = await fixture(t, 'strategy-return');
  assert.match((await f.run('strategy')).researchReturn, /实际接触场景/);
});
test('final reads native slide XML, excludes bulky deck JSON and records missing rendered pages',async t=>{
  const f=await fixture(t,'final');
  const requireApp=createRequire(new URL('../../apps/workbench-preview/package.json',import.meta.url));
  const {zipSync,strToU8}=requireApp('fflate');
  const slide = strToU8('<p:sld xmlns:p="urn:slide" xmlns:a="urn:text"><a:p><a:r><a:t>实际页面证据</a:t></a:r></a:p></p:sld>');
  const pptx = zipSync(Object.fromEntries(Array.from({length:140},(_,i)=>['ppt/slides/slide'+(i+1)+'.xml',slide])));
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
