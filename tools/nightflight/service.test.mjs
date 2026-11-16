import { createHash } from 'node:crypto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { createNightflight } from './service.mjs';

async function localRequest(service, path, data, origin = 'http://localhost:4420') {
  const req = Readable.from(data ? [Buffer.from(JSON.stringify(data))] : []);
  Object.assign(req, {
    url: path,
    method: data ? 'POST' : 'GET',
    headers: { host: 'localhost:4420', origin, 'content-type': 'application/json' },
    socket: { remoteAddress: '127.0.0.1' },
  });
  const res = {
    writeHead(status) {
      this.status = status;
    },
    end(result) {
      this.data = JSON.parse(result);
    },
  };
  await service.handle(req, res);
  return res;
}

test('a personal run waits for direction and current image adoption, saves user files and survives reopening', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'nightflight-service-'));
  const id = 'isolated-project',
    base = '/api/projects';
  const calls = [];
  const finding = {
    chapter: '人群与接触情境',
    conclusion: '可区分两种观看场景',
    evidence: '夹具中两处展示位置不同',
    source: '案例夹具',
    url: 'https://example.test/poster',
    implication: '策略要明确主要观看场景',
  };
  async function run({ stage, dir, project }) {
    if (project.researchDigestOnly) {
      assert.deepEqual(project.attachments,[]);
      assert.deepEqual(project.artifacts,[]);
      return {strategyAdvice:[{recommendation:"比较用户能否辨认规格",findingIndices:[0]}],researchDigest:[{chapter:finding.chapter,title:'场景不同',detail:'展示位置不同',findingIndex:0}],artifacts:[]};
    }
    calls.push(stage);
    const round = calls.filter((s) => s === 'research').length;
    if (stage === 'research' && round === 2) {
      assert.equal(project.previousResearch.ready, false);
      assert.equal(project.feedback.at(-1).text, '重点补查');
      assert.equal(project.feedback.at(-1).question, '优先哪个渠道？');
      assert.equal(project.researchFollowup, true);
      assert.equal(project.researchQuestionAnswered, true);
    }
    const research =
      stage === 'research' && round > 1
        ? { ready: true, findings: [finding], gaps: [], next: '' }
        : {
            ready: false,
            findings: [finding],
            gaps: ['渠道待定'],
            next: '比较渠道',
            question: '优先哪个渠道？',
          };
    const researchReturn = stage === 'strategy' && round === 2 ? '请补查第二种渠道的实际案例' : undefined;
    assert.equal(await readFile(join(dir, 'brief.md'), 'utf8'), 'brief attachment');
    if (stage === 'layout') {
      assert.equal(await readFile(join(dir, 'update.md'), 'utf8'), 'update');
      assert.equal(project.proposalKind, 'packaging');
      assert.deepEqual(project.outlineOptions, { include: ['series'], singleTouchpoint: true });
      assert.deepEqual(project.layoutCompetitorReferences, ['公开包装.jpg']);
      assert.equal(project.artifacts.some(a => a.visual?.role === 'reference'), false);
      assert.equal(await readFile(join(dir, '公开包装.jpg'), 'utf8'), '公开原图');
      assert.equal(await readFile(join(dir, '逐页材料.md'), 'utf8'), '指定版次');
    }
    const kind = stage === 'layout' ? 'pptx' : stage === 'visual' ? 'image' : 'text';
    const name = 'output-' + stage + { pptx: '.pptx', image: '.png', text: '.md' }[kind];
    const draft = { directions: ['A','B','C'].map((name,i) => ({id:name, name, duty:['emotion','continuity','feature'][i], main:name+' 标题'})) };
    const body = stage === 'copy' ? draft.directions.map(d => '## '+d.name+'\n主标题：'+d.main).join('\n\n') : 'isolated '+stage;
    if (stage === 'visual') {
      const artifacts=[];
      for (const candidate of [1,2,3]) {
        const name='稿'+candidate+'.png';
        await writeFile(join(dir,name),'合成图'+candidate);
        const score=candidate===2?5:4;
        artifacts.push({name,kind:'image',visual:{direction:'A',role:'main',blind:{first:'茶',action:'入杯',words:'青屿',alternative:'山泉'},edit:'放大文字',research:'无',candidate,mean:score,blocked:false,reason:'合成评语',recommended:candidate===2,scores:['视觉','品牌','用户','传播'].map(role=>({role,score,reason:'合成依据'}))}});
      }
      if (project.previousVisual?.length) {
        assert.equal(project.previousReferences[0].direction, 'A');
        assert.equal(await readFile(project.previousReferences[0].path,'utf8'), '公开原图');
      } else assert.equal(project.attachments.some(a=>/\.(jpg|png)$/i.test(a.name)),false);
      const ref = '公开包装.jpg';
      await writeFile(join(dir,ref),'公开原图');
      artifacts.push({name:ref,kind:'image',visual:{role:'reference',direction:'A',query:'茶饮包装',sha256:createHash('sha256').update('公开原图').digest('hex'),pageUrl:'https://example.org/product',sourceUrl:'https://example.org/product.jpg'}});
      const board='同类并排.png';
      await writeFile(join(dir,board),'合成对照');
      artifacts.push({name:board,kind:'image',visual:{role:'comparison',direction:'A',references:[ref]}});
      return {artifacts};
    }
    if(stage==='layout') assert.deepEqual((await import('node:fs/promises').then(fs=>fs.readdir(dir))).filter(n=>n.endsWith('.png')),['稿2.png']);
    if (stage==='layout') await writeFile(join(dir,'page-0001.jpg'),'fixture-page');
    await writeFile(join(dir, name), body);
    return {
      research,
      researchReturn,
      artifacts: [{ kind, name, ...(stage === 'copy' ? { text: body } : {}) }, ...(stage==='layout' ? [{kind:'image',name:'page-0001.jpg',renderPage:1}] : [])],
      copyReview: stage === 'copy' ? {
        version: 3, protocol: 'dual-panel-headline-v4', status: 'ready',
        adjudication: { ready: true, set: { ready: true },
          single: draft.directions.map((d,i)=>({directionId:d.id,ready:true,checks:['事实准确，归属清楚','单句读得懂，念得顺','能接上本案策略',['用户氛围或情绪放大','稳健延续','品牌或产品特征放大'][i]].map(criterion=>({criterion,passed:true,evidence:d.main,reason:'同版核对'}))})),
          pairs: ['AB','AC','BC'].map(pair => ({pair, distinct:true})),
        }, bodyHash: createHash('sha256').update(body).digest('hex'),
        draft,
        recommendation: {directionId:'A',reason:'推荐说明',tradeoff:'取舍',memory:'记忆',retell:'复述',scene:'适用场景'},
        ...Object.fromEntries(['anonymousReads','firstVotes','criticReads','challenges','finalVotes']
          .map(field => [field, ['copy','brand','user','comms'].map(role => ({role}))])),
      } : undefined,
      finalReview: stage === 'final' ? {outcome:'pass',returnStage:'',reason:'核查完成',pages:[1]} : undefined,
      directions: stage === 'copy' ? ['A', 'B', 'C'] : undefined,
    };
  }
  const options = { root, runStage: run, runLayout: run };
  let service = createNightflight(options);
  t.after(async () => {
    service.close();
    await rm(root, { recursive: true, force: true });
  });
  const request = (...args) => localRequest(service, ...args);
  const project = async () => (await request(base + '/' + id)).data.project;
  const action = (data) => request(base + '/' + id + '/action', data);
  const wait = async (status) => {
    for (let i = 0; i < 300; i++) {
      const p = await project();
      if (p.status === status) return p;
      if (p.status === 'failed') assert.fail(p.error);
      await new Promise((r) => setTimeout(r, 10));
    }
    assert.fail('timed out at ' + status);
  };
  const file = (name, body) => ({ name, data: Buffer.from(body).toString('base64') });
  const input = { id, brief: 'test', mode: 'collab', attachments: [file('brief.md', 'brief attachment')] };
  input.proposalKind = 'packaging';
  input.outlineOptions = { include: ['series'], singleTouchpoint: true };
  assert.equal((await request(base, { ...input, proposalKind: 'tvc' })).status, 400);
  assert.equal((await request(base, { ...input, outlineOptions: { include: ['motion'] } })).status, 400);
  assert.equal((await request(base, input, 'http://foreign.invalid')).status, 403);
  assert.equal((await request(base, input)).status, 201);
  assert.equal((await request(base, input)).status, 201);
  assert.equal((await request(base, { ...input, outlineOptions: {} })).status, 409);
  const briefCheck = await wait('waiting');
  assert.equal(briefCheck.stage, 'brief');
  await action({kind:'confirm_brief',expectedRevision:briefCheck.revision});
  const pending = await wait('waiting');
  assert.equal(pending.stage, 'research');
  assert.equal(pending.research.ready, false);
  assert.deepEqual(calls, ['brief', 'research']);
  const supplement = {
    kind: 'research_again',
    expectedRevision: pending.revision,
    text: '重点补查',
    opId: 'follow-up',
  };
  assert.equal((await action({ ...supplement, expectedRevision: pending.revision - 1 })).status, 409);
  await action(supplement);
  const returned = await wait('waiting');
  assert.equal(returned.stage, 'research');
  assert.equal(returned.research.ready, false);
  assert.match(returned.research.next, /第二种渠道/);
  assert.equal(
    returned.artifacts.some((a) => a.stage === 'strategy'),
    false,
  );
  assert.equal((await action(supplement)).status, 200);
  await action({ kind: 'research_again', expectedRevision: returned.revision });
  const copy = await wait('waiting');
  assert.equal(copy.stage, 'copy');
  assert.equal(copy.copyReview.status, 'ready');
  assert.equal(
    (await action({ kind: 'choice', text: 'A', expectedRevision: copy.revision - 1 })).status,
    409,
  );
  await action({ kind: 'choice', text: 'A', expectedRevision: copy.revision });
  const visual = await wait('waiting');
  assert.equal(visual.stage, 'visual');
  await action({ kind: 'message', text: 'change', attachments: [file('update.md', 'update'), ...Array.from({length:5},(_,i)=>file('补图'+i+'.jpg','reference'+i))] });
  const revised = await wait('waiting');
  assert.equal(revised.versions.length, 4);
  assert.equal(revised.attachments.filter(a=>a.visualOnly).length,5);
  assert.equal((await action({ kind: 'adopt', expectedRevision: visual.revision })).status, 409);
  const adoption = { kind: 'adopt', expectedRevision: revised.revision, opId: 'my-choice', attachments: [file('逐页材料.md', '指定版次')] };
  assert.equal((await action(adoption)).status, 200);
  const finished = await wait('done');
  assert.equal(finished.artifacts.length, 12);
  assert.equal(finished.visualAdoption.artifacts.length,1);
  assert.equal(finished.artifacts.find(a=>a.visual?.role==='reference').visual.query,'茶饮包装');
  assert.equal((await action(adoption)).status, 200);
  service.close();
  service = createNightflight(options);
  assert.deepEqual(await project(), finished);
  await action({ kind: 'research_again', expectedRevision: finished.revision, researchOnly:true });
  const deskReport = await wait('waiting');
  assert.equal(deskReport.stage, 'research');
  assert.equal(deskReport.research.ready, true);
  assert.equal((await action({kind:'research_continue', expectedRevision:finished.revision})).status,409);
  const edit = {kind:'research_digest', expectedRevision:deskReport.revision,opId:'edit-once'};
  await action(edit);
  const edited = await wait('waiting');
  assert.equal(edited.research.digest[0].detail,'展示位置不同');
  assert.deepEqual(edited.research.findings,deskReport.research.findings);
  assert.deepEqual(edited.artifacts,deskReport.artifacts);
  assert.deepEqual(edited.versions.at(-1).research,deskReport.research);
  await action(edit);
  assert.equal((await project()).revision,edited.revision);
  await action({kind:'research_again',expectedRevision:edited.revision,researchOnly:true});
  const reopened=await wait('waiting');
  assert.equal(reopened.researchFollowup,false);
  assert.deepEqual(reopened.versions.at(-1).research,edited.research);
  await action({kind:'research_continue', expectedRevision:reopened.revision});
  const resumed = await wait('waiting');
  assert.equal(resumed.stage, 'copy');
  assert.equal(resumed.choice, null);
  assert.equal(resumed.visualAdoption, null);
  assert.deepEqual(resumed.versions.at(-3).artifacts, finished.artifacts);
  assert.deepEqual(resumed.versions.at(-3).copyReview, finished.copyReview);
  assert.equal(calls.filter((s) => s === 'brief').length, 1);
});

for (const mode of ['auto', 'collab']) {
  test(mode + ' researches before interacting and stops after one inconclusive follow-up', async (t) => {
    const root = await mkdtemp(join(tmpdir(), 'bounded-research-'));
    const rounds = [];
    const service = createNightflight({
      root,
      async runStage({ stage, dir, project }) {
        assert.ok(['brief', 'research'].includes(stage));
        if (stage === 'research') {
          rounds.push(project);
          if (rounds.length > 2) throw Error('Unexpected third research run');
        }
        const name = stage + '.md';
        await writeFile(join(dir, name), stage);
        return {
          artifacts: [{ name, kind: 'text' }],
          research: {
            ready: false,
            findings: [],
            gaps: ['初轮缺少来源原件'],
            next: '定向查找实际案例',
            question: '请输入渠道？',
          },
        };
      },
    });
    t.after(async () => {
      service.close();
      await rm(root, { recursive: true, force: true });
    });
    const path = '/api/projects';
    await localRequest(service, path, { id: 'short-brief', brief: '新品玩具，彩色，新年海报', mode });
    let project;
    for (let i = 0; i < 200; i++) {
      project = (await localRequest(service, path + '/short-brief')).data.project;
      if (mode==='collab' && project.stage==='brief' && project.status==='waiting') {
        await localRequest(service,path+'/short-brief/action',{kind:'confirm_brief',expectedRevision:project.revision});
      } else if (project.status !== 'running') break;
      await new Promise((r) => setTimeout(r, 10));
    }
    assert.equal(project.stage, 'research');
    assert.equal(project.status, 'waiting');
    assert.equal(project.research.question, '');
    assert.equal(rounds.length, 2);
    assert.equal(rounds[1].researchFollowup, true);
    assert.equal(rounds[1].previousResearch.next, '定向查找实际案例');
    assert.equal(project.versions.length, 1);
    assert.equal(project.artifacts.filter((a) => a.stage === 'research').length, 1);
  });
}

test('editor failure retains accepted research and retry resumes strategy from the same findings',async t=>{
  const root = await mkdtemp(join(tmpdir(),'editorial-retry-'));
  const finding={chapter:'行业与市场',conclusion:'样本分为礼盒和单盒',evidence:'礼盒，单盒',source:'产品目录',implication:'比较两类陈列'};
  let searches=0, edits=0;
  const service=createNightflight({root, async runStage({stage,project,dir}) {
    if (project.researchDigestOnly) {
      assert.deepEqual(project.research.findings,[finding]);
      if (++edits===1) throw Error('编辑服务暂时不可用');
      return {strategyAdvice:[{recommendation:"比较用户能否辨认规格",findingIndices:[0]}],researchDigest:[{chapter:finding.chapter,title:'礼盒与单盒分列',detail:'产品目录按销售形式区分。',findingIndex:0}]};
    }
    if (stage==='strategy') {
      assert.deepEqual(project.research.strategyAdvice,[{recommendation:'比较用户能否辨认规格',findingIndices:[0]}]);
      throw Error('测试止于策略收到完整底稿');
    }
    const name=stage+'.md';
    await writeFile(join(dir,name),stage);
    const artifacts=[{kind:'text',name}];
    if (stage==='brief') return {artifacts};
    searches++;
    return {artifacts,research:{ready:true,digestPending:true,findings:[finding],gaps:[]}};
  }});
  t.after(async()=>{service.close(); await rm(root,{recursive:true,force:true});});
  const path='/api/projects/edit-retry';
  async function settled() {
    for (let i=0;i<200;i++) {
      const project=(await localRequest(service,path)).data.project;
      if (project.status!=='running') return project;
      await new Promise(r=>setTimeout(r,10));
    }
    throw Error('未到检查点');
  }
  await localRequest(service,'/api/projects',{id:'edit-retry',brief:'测试包装',mode:'auto'});
  const waiting=await settled();
  assert.equal(waiting.status,'waiting');
  assert.equal(waiting.research.digestPending,true);
  assert.match(waiting.error,/编辑服务/);
  assert.equal((await localRequest(service,path+'/action',{kind:'research_digest',expectedRevision:waiting.revision})).status,200);
  const handedOff=await settled();
  assert.equal(handedOff.stage,'strategy');
  assert.match(handedOff.error,/策略收到完整底稿/);
  assert.equal(handedOff.research.digestPending,undefined);
  assert.deepEqual(handedOff.research.findings,waiting.research.findings);
  assert.deepEqual(handedOff.artifacts,waiting.artifacts);
  assert.equal(searches,1);
  assert.equal(edits,2);
});

async function legacyService(t, state, runner) {
  const {DatabaseSync}=await import('node:sqlite');
  const {mkdir}=await import('node:fs/promises');
  const root=await mkdtemp(join(tmpdir(),'nightflight-legacy-'));
  await mkdir(join(root,'example','files'),{recursive:true});
  const database=join(root,'nightflight.sqlite');
  const db=new DatabaseSync(database);
  db.exec('CREATE TABLE projects(id TEXT PRIMARY KEY,revision INTEGER,state TEXT)');
  const project={id:'example',inputHash:'legacy',revision:1,stage:'copy',status:'waiting',mode:'collab',
    updatedAt:new Date().toISOString(),commands:{},brief:'简报',title:'测试',claim:null,owner:null,choice:null,
    directions:[],artifacts:[],attachments:[],versions:[],events:[],feedback:[],...state};
  if (state.artifacts===undefined && ['copy','final'].includes(project.stage)) {
    const text='原有的一页策略';
    const name='上次策略.md';
    await writeFile(join(root,'example','files','strategy.md'),text+'\n');
    project.artifacts.push({stage:'strategy',kind:'text',name,text,storageKey:'strategy.md'});
  }
  db.prepare('INSERT INTO projects VALUES(?,?,?)').run(project.id,project.revision,JSON.stringify(project));
  db.close();
  const service=createNightflight({root,runStage:runner,runLayout:runner});
  t.after(async()=>{service.close();await rm(root,{force:true,recursive:true});});
  const path='/api/projects/example';
  const read=async()=>(await localRequest(service,path)).data.project;
  return {root,database,read,action:data=>localRequest(service,path+'/action',data),
    async settled() {
      for(let n=0;n<200;n++) {
        const p=await read();
        if (p.status!=='running') return p;
        await new Promise(r=>setTimeout(r,5));
      }
      throw Error('阶段未停到检查点');
    }};
}

test('copy feedback archives only the current edition, refusing in-flight edits and invalid text',async t=>{
  const seen=[];
  let proceed;
  const barrier=new Promise(resolve=>{proceed=resolve;});
  const old={at:'2025-01-01',stage:'copy',text:'上次旧意见'};
  const project=await legacyService(t,{feedback:[old,{...old,stage:'strategy'}]},async args=>{
    seen.push(args); await barrier; throw Error('测试止于新一版文案输入');
  });
  assert.equal((await project.action({kind:'message',text:42})).status,400);
  assert.equal((await project.action({kind:'message',text:'本轮仅改主标题'})).status,200);
  assert.equal((await project.action({kind:'message',text:'中途输入'})).status,409);
  proceed();
  const state=await project.settled();
  assert.equal(state.versions.length,1);
  assert.equal(seen[0].stage,'copy');
  assert.deepEqual(seen[0].project.feedback.map(f=>f.text),['本轮仅改主标题']);
  assert.equal(state.feedback.some(f=>f.text==='中途输入'),false);
  const first=seen[0];
  await project.action({kind:'retry'}); await project.settled();
  assert.equal(seen[1].checkpointDir,first.checkpointDir);
  assert.notEqual(seen[1].dir,first.dir);
  const {readdir}=await import('node:fs/promises');
  assert.equal((await readdir(join(project.root,'example'))).filter(s=>s.startsWith('attempt-')).length,1);
});

for (const targetStage of [undefined,'copy']) test('finished edits start at '+(targetStage || 'layout')+' and preserve upstream records',async t=>{
  let ran;
  const project=await legacyService(t,{status:'done',stage:'final',choice:'A'},async({stage})=>{ran=stage;throw Error('只验证修改起点');});
  await project.action({kind:'message',text:'第1页改字',targetStage});
  const state=await project.settled();
  assert.equal(ran,targetStage || 'layout');
  assert.equal(state.choice,targetStage==='copy' ? null : 'A');
  assert.equal(state.versions[0].choice,'A');
});

test('human adopts a non-recommended candidate with an explicit reason, or revises at most three times',async t=>{
  const candidates=[1,2].map((n)=>({stage:'visual',kind:'image',storageKey:'candidate-'+n,name:n+'.png',visual:{role:'main',candidate:n,direction:'A',recommended:false}}));
  const project=await legacyService(t,{stage:'visual',choice:'A',directions:['A'],visualRevisions:3,artifacts:candidates},async()=>{throw Error('停止');});
  assert.equal((await project.action({kind:'message',text:'第四次修改'})).status,409);
  const selection={kind:'adopt',expectedRevision:1,candidateIds:['candidate-2']};
  assert.equal((await project.action({...selection,candidateIds:['other']})).status,409);
  assert.equal((await project.action(selection)).status,400);
  const choice=await project.action({...selection,overrideReason:'第二稿让品牌更醒目'});
  assert.deepEqual(choice.data.project.visualAdoption.artifacts,['candidate-2']);
  assert.equal(choice.data.project.visualAdoption.overrideReason,'第二稿让品牌更醒目');
  await project.settled();
});

test('recovery ignores a reused PID, excludes another server and migrates legacy artifact text and events', async t=>{
  const {DatabaseSync}=await import('node:sqlite');
  const before={stage:'brief',at:'2025-01-01',text:'原来的事件'};
  const file={stage:'brief',name:'任务卡.md',kind:'text',storageKey:'stored.md',text:'之前版本的正文'};
  const p=await legacyService(t,{stage:'brief',status:'running',owner:process.ppid,claim:'old',
    events:[before],artifacts:[file],versions:[{stage:'brief',at:before.at,artifacts:[file]}]},async()=>{});
  const current=await p.read();
  assert.equal(current.status,'failed');
  assert.equal(current.events[0].text,before.text);
  assert.equal(current.versions[0].artifacts[0].text,file.text);
  assert.throws(()=>createNightflight({root:p.root}),/已有运行中的/);
  const db=new DatabaseSync(p.database,{readOnly:true});
  try {
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM artifact_texts').get().n,1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM project_events').get().n,2);
    assert.ok(!db.prepare('SELECT state FROM projects').get().state.includes(file.text));
  } finally {db.close();}
});

test('final review returns to the named stage and waits for a person; completed attempts are removed',async t=>{
  const {readdir}=await import('node:fs/promises');
  const calls=[];
  const project=await legacyService(t,{status:'failed',stage:'final'},async({stage,dir})=>{
    calls.push(stage);
    await writeFile(join(dir,'终审.md'),'缺排版实图');
    return {artifacts:[{kind:'text',name:'终审.md',text:'缺排版实图'}],
      finalReview:{outcome:'return',returnStage:'layout',reason:'请按原版补齐排版实图',pages:[]}};
  });
  await project.action({kind:'retry'});
  const state=await project.settled();
  assert.equal(state.status,'waiting');
  assert.equal(state.stage,'layout');
  assert.equal(state.finalReturn.returnStage,'layout');
  assert.equal(state.versions[0].artifacts.at(-1).text,'缺排版实图');
  assert.deepEqual(calls,['final']);
  assert.ok(!(await readdir(join(project.root,'example'))).some(s=>s.startsWith('attempt-')));
});

test('one strategy return archives one edition and keeps structured research gaps',async t=>{
  const gap={kind:'coverage',chapter:'人群与接触情境',message:'缺人群公开材料',findingRef:''};
  const p=await legacyService(t,{status:'failed',stage:'strategy',research:{ready:false,findings:[],gaps:[gap]}},async ({stage,dir,project})=>{
    if (stage==='research') {
      assert.deepEqual(project.previousResearch.gaps,[gap]);
      throw Error('检查定向补查已收到');
    }
    await writeFile(join(dir,'待补依据.md'),'请补用户资料');
    return {researchReturn:'请补用户资料',artifacts:[{kind:'text',name:'待补依据.md',text:'请补用户资料'}]};
  });
  await p.action({kind:'retry'});
  const state=await p.settled();
  assert.equal(state.versions.length,1);
  assert.equal(state.error,'检查定向补查已收到');
});

test('legacy one-page strategy reaches copy with the exact source file hash; changed or missing files block before model calls',async t=>{
  const seen=[];
  const p=await legacyService(t,{status:'failed',stage:'copy'},async ({project})=>{
    seen.push(project);throw Error('文案已收到原稿');
  });
  await p.action({kind:'retry'});await p.settled();
  const sha256=createHash('sha256').update('原有的一页策略\n').digest('hex');
  assert.deepEqual(seen[0].strategyHandoff,[{name:'上次策略.md',sha256}]);
  await writeFile(join(p.root,'example','files','strategy.md'),'被更换的一页策略');
  await p.action({kind:'retry'});
  assert.match((await p.settled()).error,/策略副本与本项目存档不一致/);
  assert.equal(seen.length,1);
  const missing=await legacyService(t,{status:'failed',stage:'copy',artifacts:[]},()=>assert.fail('不应调用文案'));
  await missing.action({kind:'retry'});
  assert.match((await missing.settled()).error,/未找到本项目当前策略稿/);
});

test('a saved finding can go to strategy for a conditional assessment while research gaps stay open',async t=>{
  const finding={source:'公开报告',url:'https://example.org/report',evidence:'有可核记录',passage:'有可核记录',conclusion:'新品密集',implication:'先解决新品识别'};
  const research={ready:false,findings:[finding],gaps:['渠道未定'],next:'新品识别可作条件性方向'};
  const p=await legacyService(t,{stage:'research',research,researchFollowup:true},async ({stage,project,dir})=>{
    assert.equal(stage,'strategy');
    assert.equal(project.research.conditional,true);
    assert.equal(project.research.ready,false);
    assert.deepEqual(project.research.gaps,['渠道未定']);
    await writeFile(join(dir,'待补.md'),'缺实际产品识别点');
    return {researchReturn:'缺实际产品识别点',artifacts:[{kind:'text',name:'待补.md',text:'缺实际产品识别点'}]};
  });
  const current=await p.read();
  assert.equal(current.canRequestStrategy,true);
  await p.action({kind:'research_continue',expectedRevision:current.revision});
  const returned=await p.settled();
  assert.equal(returned.stage,'research');
  assert.equal(returned.research.next,'缺实际产品识别点');
  assert.equal(returned.canRequestStrategy,false);
  const empty=await legacyService(t,{stage:'research',research:{...research,findings:[]}},()=>{throw Error('unexpected')});
  assert.equal((await empty.action({kind:'research_continue',expectedRevision:1})).status,409);
});

test('auto hands conditional evidence to strategy and funds one targeted follow-up after a real return',async t=>{
  const stages=[];
  const finding={source:'报告',url:'https://example.org/report',evidence:'报告原文',passage:'报告原文',conclusion:'新品增加',implication:'先解决新品识别'};
  const research={ready:false,findings:[finding],gaps:['渠道未定'],next:'可按新品识别推进'};
  const reason='首销点是店内还是外卖列表，决定第一触点。';
  const p=await legacyService(t,{stage:'research',mode:'auto',status:'failed',researchFollowup:true},async({stage,project,dir})=>{
    stages.push(stage);
    const name=stage+'.md';
    await writeFile(join(dir,name),stage);
    const artifacts=[{kind:'text',name,text:stage}];
    if(stage==='strategy'){
      assert.equal(project.research.conditional,true);
      assert.deepEqual(project.research.gaps,research.gaps);
      return {artifacts,researchReturn:reason};
    }
    if(stages.length>1) assert.equal(project.previousResearch.next,reason);
    return {artifacts,research};
  });
  await p.action({kind:'retry'});
  const state=await p.settled();
  assert.deepEqual(stages,['research','strategy','research','strategy']);
  assert.equal(state.status,'waiting');
  assert.equal(state.autoStrategyResume,false);
  assert.equal(state.research.next,reason);
});
