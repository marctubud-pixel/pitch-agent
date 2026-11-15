import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { createStageRunner } from './codex-runner.mjs';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC';
// Used only by the test CLI, which gets a new thread and private request for each call.
function copyFixture(input, action) {
  const step = input.match(/COPY_([A-Z_]+)/)?.[1];
  const packet = JSON.parse(input.split('实际项目输入（JSON）').at(-1));
  const source = '制作测试茶的包装概念稿';
  const directions = ['山风', '晨雾', '旧街'].map((name, i) => ({
    id: ['A','B','C'][i], duty: ['emotion','continuity','feature'][i],
    name, basis: source, claim: name + '的主张', mechanism: name + '的创意方法', strategyLink: name + '承接策略',
    main: name + '原稿主文', secondary: name + '的副文', touchpoints: [{label:'瓶侧',text:name + '瓶侧文案'}], risk: name + '的风险',
  }));
  if (step === 'CREATE') {
    if (action === 'badcopy') directions[2].duty = directions[0].duty;
    if (!input.includes('slogan-engine') || !input.includes('寻找连接与改句')) throw Error('创作没有加载口号方法');
    return {directions};
  }
  if (step === 'ANONYMOUS') {
    if (Object.keys(packet).sort().join() !== 'candidates,role' || input.includes(source) || input.includes('盲测污染哨兵')) throw Error('匿名首读泄露任务');
    return {items:packet.candidates.map(c => {
      if (Object.keys(c).sort().join() !== 'directionId,main,secondary') throw Error('匿名稿泄露创意解释');
      return {directionId:c.directionId,reading:'读到'+c.main,uncertainty:'品牌身份待了解'};
    })};
  }
  if (step === 'REVISE') {
    if (['copy-clarify','copy-clean'].includes(action)) throw Error('同稿纠正不该调用创作岗');
    if (!input.includes('寻找连接与改句')) throw Error('改稿没有加载口号方法');
    const revised=structuredClone(packet.draft.directions);
    if (action==='copy-frozen' && packet.failures) revised[0].main+='越权改稿';
    revised[1].main=packet.failures ? revised[1].main+'（再澄清）' : '晨雾修改后主文';
    return {baseHash:action==='copy-stale' && packet.failures ? '旧稿' : packet.baseHash,
      draft:{directions:revised},changes:['澄清晨雾主文']};
  }
  if (step === 'CRITIC_BLIND') {
    if (action === 'copy-clean') return {items:directions.map(d=>({directionId:d.id,risk:'',evidence:''}))};
    if (packet.vote || packet.dimensions || packet.firstVotes || input.includes('盲测污染哨兵')) throw Error('对抗首读泄露原票');
    const items=packet.draft.directions.map(d => ({directionId:d.id,risk:'检查能否读懂该案',evidence:d.main}));
    if (packet.role === 'brand') {
      const d=packet.draft.directions.find(d=>d.id==='B');
      items.push({directionId:d.id,risk:'副文还可能误读产品身份',evidence:d.secondary});
    }
    return {items};
  }
  if (['FIRST','RECHECK'].includes(step)) {
    if (step === 'FIRST' && (!packet.anonymousRead || !input.includes(source) || input.includes('盲测污染哨兵'))) throw Error('评分未取得封存首读与依据');
    return {items:packet.draft.directions.map((d) => {
      const low = action !== 'copy-clean' && d.id === 'B' && packet.role === 'user' && (step === 'FIRST' || action === 'copy-blocked' || action==='copy-polish-recheck' && !packet.priorAdjudication);
      return {directionId:d.id,decision:low?'revise':'pass',reason:'本案说明'+d.main,
        hardRejects:[],blockers:low?['需澄清用途']:[], scores:packet.dimensions.map((dimension) => ({
          dimension,score:low && dimension==='直接理解'?3:4,evidence:d.main,reason:'据同版主文可以判断',scope:'本组文字概念',
        }))};
    })};
  }
  if (step === 'CHALLENGE') {
    if (!packet.vote || !packet.blindRead) throw Error('对应对抗缺原票或首读');
    const dimension=packet.vote.items[0].scores[0].dimension;
    const coverage=packet.blindRead.items.map(read=>({
      readId:read.readId,directionId:read.directionId,dimension,reason:'核对本案原评范围',
    }));
    if (action === 'copy-missing-coverage' && packet.role === 'brand') coverage.pop();
    const b=packet.draft.directions.find(d=>d.id==='B');
    const initial=b.main==='晨雾原稿主文';
    const fresh=action.startsWith('copy-new-challenge') && b.main==='晨雾修改后主文';
    return {coverage,
      items:action !== 'copy-clean' && packet.role === 'user' && (initial || fresh) ? [{
        directionId:'B',dimension:'直接理解',objection:fresh?'新稿新增读者歧义':'核查原判引用',
        evidence:b.main,action:'复核读者理解',blocking:true,
      }]:[]};
  }
  if (step === 'PLAN') return {rulings:packet.issues.map(issue=>({challengeId:issue.id,verdict:'accepted_now',action:action==='copy-clarify' || (action==='copy-polish-recheck' && packet.initialDraft.directions[1].main!=='晨雾原稿主文') || (action==='copy-mixed' && issue.origin==='score') ? 'recheck':'revise',reason:'按原句核对使用情境'}))};
  if (step === 'REPAIR_PLAN') {
    if (action==='copy-polish-tool-error') throw Error('模拟工具中断');
    return {baseHash:packet.baseHash,actions:packet.failures.map(f=>{
      const d=packet.draft.directions.find(d=>d.id==='B' && f.eligible.includes(d.id))
        || packet.draft.directions.find(d=>f.eligible.includes(d.id));
      return {issueId:f.id,directionId:d.id,action:['copy-blocked','copy-similar'].includes(action)?'pause':action==='copy-new-challenge-bypass'?'recheck':
        action==='copy-polish-recheck'?'recheck':'revise',evidence:d.main,reason:'按本案的实际条件核对'};
    })};
  }
  const followupCase=['copy-polish','copy-frozen','copy-stale','copy-budget','copy-polish-tool-error'].includes(action);
  const distinct=action!=='copy-similar' && action!=='copy-budget' &&
    (!followupCase || packet.draft?.directions[1].main.includes('再澄清'));
  if (step === 'ADJUDICATE') return {ready:true,reason:'本地概念阶段完成',
    recommendation:{directionId:'B',reason:'说明清楚',tradeoff:'适用范围有限'},
    rulings:packet.requiredRulingIds.map(challengeId=>({challengeId,verdict:'resolved',reason:'已按原始裁定核验'})),
    single:directions.map(d=>({directionId:d.id,ready:true,reason:'主副文可以同读'})),
    pairs:['AB','AC','BC'].map(pair=>({pair,distinct:pair==='AC' || distinct,reason:'逐对比对表达和使用情境'})),
    set:{ready:distinct,reason:'三案组内比较结论'}};
  throw Error('未知文案测试步骤');
}

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
 if(!action.startsWith('copy') && action!=='badcopy' && !input.includes('测试茶')) process.exit(4);
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
 if(action.startsWith('copy') || action==='badcopy') body=(${copyFixture.toString()})(input,action);
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

test('copy releases three reviewed directions only after blind votes, revision, rechecks and independent ruling',async t=>{
  const f=await fixture(t,'copy');
  f.project.feedback=[{stage:'copy',text:'盲测污染哨兵'}];
  const result=await f.run('copy');
  assert.deepEqual(result.directions,['山风','晨雾','旧街']);
  assert.match(await readFile(join(f.dir,result.artifacts[0].name),'utf8'),/旧街/);
  assert.equal(result.copyReview.status,'ready');
  assert.equal(result.copyReview.recommendation.directionId,'B');
  assert.equal(result.copyReview.initialDraft.directions[1].main,'晨雾原稿主文');
  assert.equal(result.copyReview.draft.directions[1].main,'晨雾修改后主文');
  for (const [votes,expected] of [[result.copyReview.firstVotes,3],[result.copyReview.finalVotes,4]]) {
    assert.deepEqual(new Set(votes.map(v=>v.role)),new Set(['copy','brand','user','comms']));
    const item=votes.find(v=>v.role==='user').items.find(d=>d.directionId==='B');
    assert.equal(item.scores.find(s=>s.dimension==='直接理解').score,expected);
  }
  const runs=await readdir(join(f.dir,'.codex-runs'));
  const receipts=await Promise.all(runs.map(async(id)=>JSON.parse(await readFile(join(f.dir,'.codex-runs',id,'receipt.json'),'utf8'))));
  assert.equal(receipts.length,result.copyReview.calls.length);
  assert.equal(new Set(receipts.map(r=>r.threadId)).size,receipts.length);
  assert.deepEqual(result.copyReview.criticReads.map(r=>r.role).sort(), ['brand','comms','copy','user']);
  assert.ok(result.copyReview.criticReads.every(r=>r.items.every(item=>!('scores' in item))));
  const brandReads=result.copyReview.criticReads.find(r=>r.role==='brand').items.filter(i=>i.directionId==='B');
  const coverage=result.copyReview.challenges.find(c=>c.role==='brand').coverage.filter(c=>c.directionId==='B');
  assert.equal(brandReads.length,2);
  assert.equal(new Set(brandReads.map(r=>r.readId)).size,2);
  assert.deepEqual(coverage.map(c=>c.readId),brandReads.map(r=>r.readId));
  assert.deepEqual(coverage.map(c=>c.independentRead),brandReads);
  assert.deepEqual(result.copyReview.adjudication.pairs.map(p=>p.pair).sort(),['AB','AC','BC']);
  assert.ok(receipts.every(r=>r.exitCode===0));
});
test('copy blocks when one of two risks on the same direction lacks coverage',async t=>{
  const f=await fixture(t,'copy-missing-coverage');
  await assert.rejects(f.run('copy'),/未逐条覆盖/);
  assert.ok(!(await readdir(f.dir)).some(n=>n.endsWith('.md')));
});
test('copy keeps actual empty critic findings and reuses unchallenged votes',async t=>{
  const f=await fixture(t,'copy-clean');
  const {copyReview:r}=await f.run('copy');
  assert.ok(r.challenges.every(c=>c.items.length===0 && c.coverage.length===3));
  assert.deepEqual(r.decisionPlan.rulings,[]);
  assert.ok(!r.calls.some(c=>['COPY_RECHECK','COPY_REVISE'].includes(c.phase)));
  assert.deepEqual(r.finalVotes.map(v=>v.runId),r.firstVotes.map(v=>v.runId));
});
test('copy corrects a mistaken vote on the identical draft through the original role',async t=>{
  const f=await fixture(t,'copy-clarify');
  const {copyReview:r}=await f.run('copy');
  assert.deepEqual(r.draft,r.initialDraft);
  assert.equal(r.panelHistory.length,1);
  assert.ok(!r.calls.some(c=>c.phase==='COPY_REVISE'));
  assert.deepEqual(r.calls.filter(c=>c.phase==='COPY_RECHECK').map(c=>c.role),['user']);
  const userScore = votes=>votes.find(v=>v.role==='user').items.find(d=>d.directionId==='B').scores.find(s=>s.dimension==='直接理解').score;
  assert.equal(userScore(r.firstVotes),3);
  assert.equal(userScore(r.finalVotes),4);
});
test('copy preserves the same-draft correction before reviewing a separately required edit',async t=>{
  const f=await fixture(t,'copy-mixed');
  const {copyReview:r}=await f.run('copy');
  assert.notDeepEqual(r.initialDraft,r.draft);
  const correction=r.sameDraftRechecks.find(v=>v.role==='user');
  const original=r.firstVotes.find(v=>v.role==='user');
  const revised=r.finalVotes.find(v=>v.role==='user');
  assert.equal(correction.draftHash,original.draftHash);
  assert.notEqual(revised.draftHash,correction.draftHash);
  assert.ok(r.calls.findIndex(c=>c.runId===correction.runId) < r.calls.findIndex(c=>c.phase==='COPY_REVISE'));
});
test('copy cannot release individually ready directions when the set lacks differences',async t=>{
  const f=await fixture(t,'copy-similar');
  await assert.rejects(f.run('copy'),/整组|差异|裁定/);
  assert.ok(!(await readdir(f.dir)).some(n=>n.endsWith('.md')));
});
test('copy stays unpublished when final review still contains a blocking score',async t=>{
  const f=await fixture(t,'copy-blocked');
  await assert.rejects(f.run('copy'), /文案复核未通过/);
  assert.ok(!(await readdir(f.dir)).some(n=>n.endsWith('.md')));
});

test('copy polishes a refused direction and leaves the two accepted directions intact',async t=>{
  const f=await fixture(t,'copy-polish');
  const {copyReview:r}=await f.run('copy');
  assert.equal(r.polishRounds.length,1);
  const prior=r.polishRounds[0];
  assert.equal(prior.adjudication.set.ready,false);
  assert.deepEqual(r.draft.directions[0],prior.draft.directions[0]);
  assert.deepEqual(r.draft.directions[2],prior.draft.directions[2]);
  assert.notEqual(r.draft.directions[1].main,prior.draft.directions[1].main);
  assert.ok(r.adjudication.set.ready && r.adjudication.pairs.every(p=>p.distinct));
  assert.equal(new Set(r.finalVotes.map(v=>v.draftHash)).size,1);
  assert.equal(r.finalVotes[0].draftHash,prior.revisedHash);
});
test('copy reopens paired challenges and pre-edit rulings on every changed draft',async t=>{
  const f=await fixture(t,'copy-new-challenge');
  const {copyReview:r}=await f.run('copy');
  const panels=r.panelHistory;
  assert.equal(panels.length,3);
  assert.equal(new Set(panels.map(p=>p.draftHash)).size,3);
  for (const panel of panels) {
    assert.equal(panel.criticReads.length,4);
    assert.equal(panel.challenges.length,4);
    for (const c of panel.challenges) {
      assert.ok(c.draftHash===panel.draftHash &&
        panel.votes.some(v=>v.runId===c.voteRunId && v.draftHash===panel.draftHash) &&
        panel.criticReads.some(v=>v.runId===c.blindReadRunId && v.draftHash===panel.draftHash));
    }
  }
  const newIssue=panels[1].issues.find(i=>i.objection==='新稿新增读者歧义');
  assert.ok(newIssue);
  assert.ok(panels[1].decisionPlan.rulings.some(r=>r.challengeId===newIssue.id && r.action==='revise'));
  assert.match(r.draft.directions[1].main,/再澄清/);
  assert.ok(r.adjudication.rulings.some(r=>r.challengeId===newIssue.id));
});
test('copy rejects a repair plan that tries to bypass a required new-draft challenge edit',async t=>{
  const f=await fixture(t,'copy-new-challenge-bypass');
  await assert.rejects(f.run('copy'),/本版独立裁定/);
  assert.ok(!(await readdir(f.dir)).some(n=>n.endsWith('.md')));
});
test('copy can correct a rejected final score on the identical text without another author call',async t=>{
  const f=await fixture(t,'copy-polish-recheck');
  const {copyReview:r}=await f.run('copy');
  assert.equal(r.polishRounds.length,1);
  assert.deepEqual(r.polishRounds[0].draft,r.draft);
  assert.equal(r.calls.filter(c=>c.phase==='COPY_REVISE').length,1);
  assert.deepEqual(r.polishRounds[0].sameDraftRechecks.map(v=>v.role),['user']);
});
for (const [action,error] of [['copy-frozen',/冻结方向/],['copy-stale',/冻结原稿身份/],
  ['copy-budget',/打磨上限/],['copy-polish-tool-error',/调用失败/]]) {
  test('copy polishing halts safely: '+action,async t=>{
    const f=await fixture(t,action);
    await assert.rejects(f.run('copy'),error);
    const files=await readdir(f.dir);
    assert.ok(!files.some(name=>name.endsWith('.md')));
    const log=JSON.parse(await readFile(join(f.dir,files.find(name=>name.startsWith('copy-review-attempt-'))),'utf8'));
    assert.ok(log.polishRounds.length <= 2);
    assert.equal(log.status,'blocked');
  });
}
test('collaboration generates the chosen direction using the current thread PNG bytes',async t=>{
  const f=await fixture(t,'image');
  const result=await f.run('visual');
  assert.equal(result.artifacts.length,2);
  assert.match(result.artifacts[0].name,/^visual-2-/);
  assert.equal((await readFile(join(f.dir,result.artifacts[0].name))).toString('base64'),png);
  assert.match(result.artifacts[1].text,/晨雾/);
});
for (const [action,stage,error] of [['disabled-host','visual',/工具宿主未启用/],['other-thread','visual',/未留下原生生图文件/],['badcopy','copy',/方向|职责|探索/],['failed','brief',/调用失败/],['api-key','brief',/ChatGPT 账户/]]) {
  test('reject '+action+' without publishing business artifacts',async t=>{
    const f=await fixture(t,action);
    await assert.rejects(f.run(stage),error);
    assert.deepEqual((await readdir(f.dir)).filter(n=>!n.startsWith('.') && !n.startsWith('copy-review-attempt-')),[]);
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
