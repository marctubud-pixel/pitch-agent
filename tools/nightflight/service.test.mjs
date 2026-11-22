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
      ...(stage==='brief' ? {briefScope:{status:'accepted',types:['packaging'],reason:'客户委托包装设计'}} : {}),
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
  assert.equal((await action(supplement)).status,200);
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
  assert.equal(revised.versions.length, 2);
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
          ...(stage==='brief' ? {briefScope:{status:'accepted',types:['packaging'],reason:'客户委托包装设计'}} : {}),
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
    if (stage==='brief') return {artifacts,briefScope:{status:'accepted',types:['packaging'],reason:'客户委托包装设计'}};
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
  await localRequest(service,'/api/projects',{id:'edit-retry',brief:'测试包装',mode:'collab'});
  const card=await settled();
  await localRequest(service,path+'/action',{kind:'confirm_brief',expectedRevision:card.revision});
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

test('visual handoff preserves a revised poster original without making it a candidate',async t=>{
  const directions=['A','B','C'];
  const sourceName='visual-1-before.png';
  const sourceBytes=Buffer.from('original poster bytes');
  const sourceSha256=createHash('sha256').update(sourceBytes).digest('hex');
  const wrongSha256='0'.repeat(64);
  const revision={sourceName,sourceSha256,reason:'旧稿品牌露出不对',edit:'重做同一方向'};
  async function runCase(t,change=(original,proof)=>({original,proof}),layoutInputs=[]) {
    return legacyService(t,{stage:'visual',status:'failed',mode:'auto',directions,briefScope:{types:['kv']}},async({project,stage,dir})=>{
      if (stage==='layout') {
        layoutInputs.push(project.artifacts.map(a=>a.name));
        throw Error('只验证采用对象');
      }
      assert.equal(stage,'visual');
      const {original,proof}=change({role:'poster-original',direction:'A',sha256:sourceSha256},{...revision});
      await writeFile(join(dir,sourceName),sourceBytes);
      const artifacts=[{name:sourceName,kind:'image',visual:original}];
      for(const direction of directions) for(const candidate of [1,2,3]) {
        const name=direction+candidate+'.png';
        const score=candidate===1?5:4;
        await writeFile(join(dir,name),'current poster '+name);
        artifacts.push({name,kind:'image',visual:{role:'main',direction,candidate,mean:score,recommended:candidate===1,
          blind:{first:'新品',action:'开盖',words:'原味',alternative:'杯装'},edit:'无',research:'无',blocked:false,
          reason:'同版独立核对',scores:['视觉','品牌','用户','传播'].map(role=>({role,score})),
          ...(direction==='A' && candidate===1 ? {artworkRevision:proof} : {}),
        }});
      }
      return {artifacts};
    });
  }

  await t.test('publishes nine candidates and retains the original only for traceability',async t=>{
    const layoutInputs=[];
    const p=await runCase(t,undefined,layoutInputs);
    assert.equal((await p.action({kind:'retry'})).status,200);
    const ready=await p.settled();
    assert.equal(ready.status,'waiting',ready.error);
    const archived=ready.artifacts.find(a=>a.visual?.role==='poster-original');
    assert.equal(archived.name,sourceName);
    assert.equal(archived.visual.sha256,sourceSha256);
    assert.equal(archived.visual.candidate,undefined);
    const key=a=>a.url.split('/').at(-1);
    assert.deepEqual(await readFile(join(p.root,'example','files',key(archived))),sourceBytes);
    const candidates=ready.artifacts.filter(a=>a.visual?.candidate);
    assert.equal(candidates.length,9);
    const winners=candidates.filter(a=>a.visual.recommended);
    assert.deepEqual(winners.map(a=>a.name),['A1.png','B1.png','C1.png']);
    assert.deepEqual(winners[0].visual.artworkRevision,revision);
    assert.equal((await p.action({kind:'adopt',expectedRevision:ready.revision,
      candidateIds:[key(archived),...winners.slice(1).map(key)]})).status,409);
    const adopted=await p.action({kind:'adopt',expectedRevision:ready.revision});
    assert.equal(adopted.status,200);
    assert.deepEqual(adopted.data.project.visualAdoption.artifacts,winners.map(key));
    await p.settled();
    assert.deepEqual(layoutInputs,[winners.map(a=>a.name)]);
  });

  for(const [name,change] of [
    ['rejects a revision record without a source hash',(original,{sourceSha256,...proof})=>({original,proof})],
    ['rejects an original from another direction',(original,proof)=>({original:{...original,direction:'B'},proof})],
    ['rejects mismatched source hashes',(original,proof)=>({original,proof:{...proof,sourceSha256:wrongSha256}})],
    ['rejects a matching declared hash for different original bytes',(original,proof)=>({
      original:{...original,sha256:wrongSha256},proof:{...proof,sourceSha256:wrongSha256},
    })],
  ]) await t.test(name,async t=>{
    const p=await runCase(t,change);
    assert.equal((await p.action({kind:'retry'})).status,200);
    const stopped=await p.settled();
    assert.equal(stopped.status,'failed');
    assert.match(stopped.error,/修订|原图|初稿|哈希/u);
    assert.equal(stopped.artifacts.some(a=>a.stage==='visual'),false);
  });
});

test('visual handoff takes intact, traceable originals from the current study', async t=>{
  const bytes=Buffer.from('fixture-original');
  const sha256=createHash('sha256').update(bytes).digest('hex');
  const ref={name:'真实包装.jpg',sha256,carrier:'packaging',sameCategory:true,categoryMatch:'同类',
    actualPackaging:true,visibleProduct:'独立小袋和外盒',pageUrl:'https://example.org/item',sourceUrl:'https://example.org/item.jpg'};
  const project=await legacyService(t,{stage:'visual',status:'failed',
    artifacts:[{stage:'research',kind:'image',name:ref.name,storageKey:'box.jpg'}],
    research:{findings:[{images:[{...ref,sha256:'0'.repeat(64)},ref,ref]}]}},
  async ({project:input})=>{
    assert.equal(input.researchReferences.length,1);
    const [original]=input.researchReferences;
    assert.equal(original.pageUrl,ref.pageUrl);
    assert.equal(original.sourceUrl,ref.sourceUrl);
    assert.equal(original.sha256,sha256);
    assert.deepEqual(await readFile(original.path),bytes);
    throw Error('只验证研究原图交接');
  });
  await writeFile(join(project.root,'example','files','box.jpg'),bytes);
  assert.equal((await project.action({kind:'retry'})).status,200);
  assert.equal((await project.settled()).error,'只验证研究原图交接');
});

test('poster evidence recommendation survives publication and normal adoption below a four-point mean',async t=>{
  const layoutInputs=[];
  const caseProject=await legacyService(t,{stage:'visual',status:'failed',choice:'A',directions:['A','B','C'],briefScope:{types:['kv']}},
    async({project,stage,dir})=>{
      if (stage==='layout') {
        layoutInputs.push(project.artifacts.filter(file=>file.stage==='visual' && file.kind==='image').map(file=>file.name));
        throw Error('已核对实际采用对象');
      }
      assert.equal(stage,'visual');
      const artifacts=[];
      for (const candidate of [1,2,3]) {
        const score=[3,5,4][candidate-1];
        const name='海报-'+candidate+'.png';
        const hardIssues=candidate===2 ? ['海报左上印有竞品 MoreYogurt'] : [];
        await writeFile(join(dir,name),'poster '+candidate);
        artifacts.push({name,kind:'image',visual:{
          role:'main',direction:'A',candidate,mean:score,priority:candidate,recommended:candidate===1,
          selectionPolicy:'poster-evidence',transferAudit:{criteria:{}},hardIssues,blocked:hardIssues.length>0,
          blind:{first:'杯装',action:'取杯',words:'原味',alternative:'冷藏'},edit:'无',research:'无',reason:'本稿标题和产品关系清楚',
          scores:['视觉','品牌','用户','传播'].map(role=>({role,score,reason:'保留可见主次关系'})),
        }});
      }
      return {artifacts};
    });
  assert.equal((await caseProject.action({kind:'retry'})).status,200);
  const ready=await caseProject.settled();
  assert.equal(ready.status,'waiting',ready.error);
  const candidates=ready.artifacts.filter(a=>a.visual?.candidate);
  assert.deepEqual(candidates.map(a=>[a.visual.mean,a.visual.recommended,a.visual.blocked]),[[3,true,false],[5,false,true],[4,false,false]]);
  assert.equal((await caseProject.action({kind:'adopt',expectedRevision:ready.revision})).status,200);
  await caseProject.settled();
  assert.deepEqual(layoutInputs,[['海报-1.png']]);
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

for (const mode of ['auto','collab']) {
  test(mode+' applies its research handoff rule with a single source',async t=>{
    const stages=[];
    const f={conclusion:'新品密集',source:'报告',url:'https://example.org/report',evidence:'原文',passage:'原文',implication:'优先识别'};
    const research={ready:false,findings:[f],gaps:['渠道未知'],next:'可先解决新品识别'};
    const p=await legacyService(t,{stage:'research',status:mode==='auto'?'failed':'waiting',mode,research},async({stage,project,dir})=>{
      stages.push(stage);
      if(stage==='copy') throw Error('文案已收到策略稿');
      await writeFile(join(dir,stage+'.md'),stage);
      if(stage==='strategy') {
        assert.deepEqual(project.research.gaps,['渠道未知']);
        assert.deepEqual(project.research.findings,[f]);
      }
      return {artifacts:[{kind:'text',name:stage+'.md',text:stage}],research};
    });
    await p.action(mode==='auto'?{kind:'retry'}:{kind:'research_continue',expectedRevision:1});
    const result=await p.settled();
    if (mode==='auto') {
      assert.equal(result.stage,'research');
      assert.equal(result.status,'waiting');
      assert.equal(result.canRequestStrategy,false);
      assert.deepEqual(stages,['research','research']);
      assert.equal((await p.action({kind:'research_continue',expectedRevision:result.revision})).status,409);
      return;
    }
    assert.equal(result.stage,'copy');
    assert.equal(result.error,'文案已收到策略稿');
    assert.deepEqual(stages,['strategy','copy']);
  });
}

for (const [mode,status] of [['auto','unsupported'],['collab','unclear']]) {
  test(mode+' waits for a rephrased commission before research',async t=>{
    const root=await mkdtemp(join(tmpdir(),'brief-scope-'));
    const path='/api/projects/scope-test';
    const calls=[];
    const service=createNightflight({root,async runStage({stage,project,dir}){
      calls.push(stage);
      if(stage==='research') throw Error('研究已启动');
      if(!project.feedback.length) return {briefScope:{status,types:[],reason:'请说明提案的交付形式'},artifacts:[]};
      assert.equal(project.feedback.at(-1).text,'请设计包装和海报');
      await writeFile(join(dir,'任务卡.md'),'请设计包装和海报');
      return {briefScope:{status:'accepted',types:['packaging','kv'],reason:'包装和海报'},artifacts:[{name:'任务卡.md',kind:'text'}]};
    }});
    t.after(async()=>{service.close();await rm(root,{recursive:true,force:true});});
    async function settled() {
      for(let i=0;i<200;i++) {
        const p=(await localRequest(service,path)).data.project;
        if(p.status!=='running') return p;
        await new Promise(resolve=>setTimeout(resolve,5));
      }
      assert.fail('未到达检查点');
    }
    const action=data=>localRequest(service,path+'/action',data);
    await localRequest(service,'/api/projects',{id:'scope-test',mode,brief:'请帮我'});
    const p=await settled();
    assert.equal(p.stage,'brief');
    assert.equal(p.status,'waiting');
    assert.deepEqual(p.artifacts,[]);
    assert.equal(p.briefScope.status,status);
    for(const kind of ['confirm_brief','retry']) assert.equal((await action({kind,expectedRevision:p.revision})).status,409);
    assert.deepEqual(calls,['brief']);
    assert.equal((await action({kind:'message',text:'请设计包装和海报',expectedRevision:p.revision})).status,200);
    const revised=await settled();
    assert.deepEqual(revised.briefScope.types,['packaging','kv']);
    if(mode==='collab') {
      assert.equal(revised.status,'waiting');
      assert.equal(revised.stage,'brief');
      await action({kind:'confirm_brief',expectedRevision:revised.revision});
      await settled();
    }
    assert.deepEqual(calls,['brief','brief','research']);
  });
}

test('automatic handoff counts independent consumer evidence and published poster originals', async t=>{
  const {automaticResearchGaps}=await import('./research-sources.mjs');
  const chapters=['行业与市场','竞争与同类传播','人群与接触情境','产品与品牌'];
  const project={briefScope:{types:['kv']}};
  const findings=['market','competitor','audience','audience','audience','product'].map((subject,i)=>({
    subject,source:'来源'+i,url:subject==='product'?'':'https://example.org/survey',evidence:'引文'+i,
    passage:'原文'+i,implication:'策略用途',conclusion:'判断'+i,
  }));
  const sections=findings.map((f,i)=>({chapter:chapters[[0,1,2,2,2,3][i]],conclusion:f.conclusion,explanation:'解释',
    evidenceIndices:i===5?[5,1]:[i]}));
  Object.assign(sections[2],{audienceTopic:'人群',surveyQuestion:'谁使用'});
  Object.assign(sections[3],{audienceTopic:'使用场景',surveyQuestion:'在哪里使用'});
  Object.assign(sections[4],{audienceTopic:'选择因素',surveyQuestion:'如何选择'});
  const image={carrier:'kv',sameCategory:true,sha256:'a'.repeat(64),sourceUrl:'https://example.org/image',pageUrl:'https://example.org/poster'};
  findings[1].images=[image];
  const report={ready:true,findings,sections,gaps:['非关键的细分渠道未知']};
  const missing=()=>automaticResearchGaps(report,project).map(g=>g.message).join(' ');
  assert.match(missing(),/海报原图/);
  image.publicationQuote='品牌发布本次宣传海报';
  assert.match(missing(),/海报原图/);
  image.publicationPlacement='article';
  assert.match(missing(),/海报原图/);
  image.assetType='宣传海报或主视觉';
  assert.equal(missing(),'');
  const oldPackage={...image,carrier:'packaging'};
  project.briefScope.types.push('packaging');
  findings[1].images.push(oldPackage);
  assert.match(missing(),/包装原图/);
  Object.assign(oldPackage,{visibleProduct:'混合坚果',actualPackaging:true,categoryMatch:'同类'});
  assert.equal(missing(),'');
  findings[4].evidence=findings[3].evidence;
  assert.equal(missing(),'');
  findings[3].evidence=findings[2].evidence;
  findings[4].evidence=findings[2].evidence;
  assert.match(missing(),/1\/2/);
  findings[3].evidence='另一道调查题的答案';
  sections[5].evidenceIndices=[5];
  assert.match(missing(),/外部资料/);
  sections[5].evidenceIndices=[5,1];
  sections.splice(4,1); // Hand off with exactly two independent audience conclusions.
  // Use a nonvisual activity here; service-level image receipt validation is tested separately.
  delete findings[1].images;
  const p=await legacyService(t,{stage:'research',status:'failed',mode:'auto',briefScope:{types:['activity']}},async({stage,dir})=>{
    if(stage==='strategy') throw Error('策略收到了完整研究');
    await writeFile(join(dir,'研究.md'),'结论');
    return {artifacts:[{kind:'text',name:'研究.md'}],research:report};
  });
  await p.action({kind:'retry'});
  const state=await p.settled();
  assert.equal(state.stage,'strategy');
  assert.equal(state.error,'策略收到了完整研究');
});

test('a product image and an untraceable poster quote cannot become a published KV example', async()=>{
  const {researchCompetitors}=await import('./research-competitors.mjs');
  const url='https://example.org/campaign', page={url,title:'品牌发布页'};
  const image={width:800,height:600,sha256:'a'.repeat(64),imageId:'ref-a',name:'ad.png',title:'作品',articleText:'品牌在地铁发布本季主题海报。',pageUrl:url,sourceUrl:url+'/ad.png'};
  const quote='品牌在地铁发布本季主题海报。';
  async function observe(publishedPoster,publicationQuote,sameCategory=true) {
    return researchCompetitors({project:{brief:'一张海报'},carrier:'kv',pages:[page],
      acquiredByPage:new Map([[page,[image]]]),readSource:async()=>({text:quote}),
      call:async(_prompt,_images,_schema,task)=>({parsedOutput:task.assignment==='海报原图内容核读'?{observation:'中央为标题'}:{conclusion:'看过的案例',implication:'画面比较',
        samples:[{source:'ref-a',title:'已看图',observation:'中央为标题',sameCategory,assetType:'宣传海报或主视觉',publishedPoster,publicationQuote}]}})});
  }
  assert.equal(await observe(false,quote),null);
  assert.equal(await observe(true,'另一个项目的说明'),null);
  assert.equal(await observe(true,quote,false),null);
  assert.equal((await observe(true,quote)).finding.images[0].publicationQuote,quote);
});

test('two options of the same audience question form one row and cannot unlock strategy',async()=>{
  const {selectAudienceRows,missingAudienceTopics,automaticResearchGaps}=await import('./research-sources.mjs');
  const chapter='人群与接触情境';
  const findings=['工作','出行','年轻群体'].map((evidence,i)=>({subject:'audience',evidence,passage:evidence,source:'样本',url:'https://example.org/'+i}));
  const sections=findings.map((f,i)=>({chapter,conclusion:f.evidence,explanation:'调查原文为'+f.evidence,
    audienceTopic:i===2?'人群':'使用场景',surveyQuestion:['在哪喝','哪个场景饮用','谁在喝'][i],evidenceIndices:[i]}));
  const selected=selectAudienceRows(sections);
  assert.deepEqual(selected.map(r=>r.audienceTopic),['人群','使用场景']);
  assert.deepEqual(selected[1].evidenceIndices,[0,1]);
  assert.match(selected[1].explanation,/工作.*出行/);
  assert.deepEqual(missingAudienceTopics(selected).map(g=>g.message),['缺少关于选择时看重的因素的可核依据。']);
  assert.ok(!automaticResearchGaps({sections,findings},{}).some(g=>g.chapter===chapter));
  assert.ok(automaticResearchGaps({sections:sections.slice(0,2),findings},{}).some(g=>g.message.includes('1/2')));
  const mislabeled={...sections[1],audienceTopic:'选择因素',surveyQuestion:sections[0].surveyQuestion};
  assert.equal(selectAudienceRows([sections[0],mislabeled]).length,1);
});

test('different selection questions in the same consumer report retain two sourced rows',async()=>{
  const {selectAudienceRows,automaticResearchGaps}=await import('./research-sources.mjs');
  const chapter='人群与接触情境';
  const url='https://www.iimedia.cn/c400/108605.html';
  const facts=[
    {question:'不同社交场景下对休闲食品的需求差异是什么？',
      quote:'最突出的是“独自享用时更关注口味和品质”，占比高达70.71%',
      conclusion:'独自享用零食时，70.71%更看重口味和品质。'},
    {question:'购买休闲食品的主要原因是什么？',
      quote:'“休闲消遣”占比42.53%，是所有选项中占比最高的。其次是“本来就喜欢吃”，占比40.52%。',
      conclusion:'购买休闲食品的首要原因是休闲消遣（42.53%）。'},
  ];
  const findings=facts.map(({quote})=>({subject:'audience',evidence:quote,passage:quote,source:'艾媒咨询',url}));
  const sections=facts.map(({question,quote,conclusion},i)=>({chapter,conclusion,explanation:quote,
    audienceTopic:'选择因素',surveyQuestion:question,evidenceIndices:[i]}));
  assert.deepEqual(selectAudienceRows(sections).map(row=>[row.surveyQuestion,row.evidenceIndices]),
    facts.map(({question},i)=>[question,[i]]));
  assert.ok(!automaticResearchGaps({sections,findings},{}).some(g=>g.chapter===chapter));
});

test('a stored poster keeps its own publication evidence when a sidebar changes',async()=>{
  const {researchCompetitors}=await import('./research-competitors.mjs');
  const page='https://publisher.example.org/a', original='甲为坚果活动发布系列海报。', sidebar='乙发布另一活动。';
  const old={name:'poster.png',sha256:'a'.repeat(64),imageId:'ref-a',pageUrl:page,sourceUrl:page+'/poster.png',
    carrier:'kv',assetType:'宣传海报或主视觉',publicationPlacement:'article',publicationQuote:original};
  async function check(quote) {
    return researchCompetitors({carrier:'kv',project:{brief:'坚果海报'},previous:[old],readSource:async()=>({text:sidebar}),
      call:async(_prompt,_images,_schema,task)=>{
        if (task.assignment==='海报原图内容核读') return {parsedOutput:{observation:'坚果插画'}};
        assert.deepEqual(JSON.parse(task.context).sources[0].sourcePassages,[original]);
        return {parsedOutput:{samples:[{source:'ref-a',title:'甲海报',observation:'坚果插画',sameCategory:true,assetType:'宣传海报或主视觉',publishedPoster:true,publicationQuote:quote}],
          conclusion:'甲活动用了坚果插画',implication:'比较实际画面'}};
      }});
  }
  assert.equal(await check(sidebar),null);
  assert.equal((await check(original)).finding.images[0].publicationQuote,original);
});

test('a released video frame cannot count as a poster even when the model also marks it published',async()=>{
  const {researchCompetitors}=await import('./research-competitors.mjs');
  const url='https://publisher.example.org/case',page={url,title:'混合作品'},original='品牌发布贺岁轻喜剧。甲品牌上线本季影片。同期发布了短片同名海报。';
  const image={name:'image.png',sha256:'c'.repeat(64),imageId:'c',sourceUrl:url+'/image.png',pageUrl:url,articleText:original,width:400,height:640};
  async function review(title,assetType,quote) {
    return researchCompetitors({carrier:'kv',project:{brief:'坚果海报'},pages:[page],acquiredByPage:new Map([[page,[image]]]),
      call:async(_prompt,_images,_schema,task)=>({parsedOutput:task.assignment==='海报原图内容核读'?{observation:'可见标题'}:{samples:[{source:'c',title,observation:'可见标题',assetType,publishedPoster:true,sameCategory:true,publicationQuote:quote}],
        conclusion:'画面有标题',implication:'比较层级'}})});
  }
  assert.equal(await review('请问大师','视频画面','品牌发布贺岁轻喜剧。'),null);
  assert.equal(await review('请问大师广告片画面','宣传海报或主视觉','同期发布了短片同名海报。'),null);
  assert.equal(await review('请问大师','宣传海报或主视觉','品牌发布贺岁轻喜剧。'),null);
  assert.equal(await review('活动画面','宣传海报或主视觉','甲品牌上线本季影片。'),null);
  assert.equal((await review('请问大师同名海报','宣传海报或主视觉','同期发布了短片同名海报。')).finding.images.length,1);
});

test('follow-up retains the verified side of a mixed older board without repeating the obsolete claim',async()=>{
  const {reusableResearchFindings}=await import('./research-sources.mjs');
  const good={title:'坚果礼盒',observation:'盒侧可见坚果名',carrier:'packaging',sameCategory:true,actualPackaging:true,
    categoryMatch:'同类',visibleProduct:'坚果礼盒',sha256:'a'.repeat(64),pageUrl:'https://brand.example/case',sourceUrl:'https://brand.example/a.png'};
  const stale={...good,title:'魔芋',actualPackaging:undefined};
  const rows=reusableResearchFindings([{chapter:'竞争与同类传播',images:[good,stale],conclusion:'两种坚果包装'}]);
  assert.deepEqual(rows.map(r=>r.images),[[good]]);
  assert.equal(rows[0].evidence,good.observation);
  assert.ok(!rows[0].conclusion.includes('两种'));
});

test('two posters from one campaign each receive only their own image and cannot borrow its sibling’s number',async()=>{
  const {researchCompetitors}=await import('./research-competitors.mjs');
  const url='https://publisher.example.org/spring',page={url},quote='品牌发布了坚果系列海报。';
  const images=['a','b'].map(id=>({name:id+'.png',imageId:id,sha256:id.repeat(64),sourceUrl:url+'/'+id+'.png',
    pageUrl:url,width:400,height:640,articleText:quote}));
  const seen=[];
  const board=await researchCompetitors({carrier:'kv',project:{brief:'坚果海报'},pages:[page],acquiredByPage:new Map([[page,images]]),
    call:async(_prompt,group,schema,task)=>{
      assert.equal(group.length,1);
      const id=group[0].imageId;
      if (task.assignment==='海报原图内容核读') {
        assert.equal(id,'b');
        return {parsedOutput:{observation:'节日礼盒'}};
      }
      seen.push(id);
      assert.deepEqual(schema.properties.samples.items.properties.source.enum,[id]);
      assert.deepEqual(JSON.parse(task.context).sources.map(x=>[x.source,x.imageNumber]),[[id,1]]);
      return {parsedOutput:{conclusion:'主题',implication:'只属于'+id,samples:[{source:'b',title:'画面来自'+id,observation:'节日礼盒',
        sameCategory:true,publishedPoster:true,assetType:'宣传海报或主视觉',publicationQuote:quote}]}};
    }});
  assert.deepEqual(seen.sort(),['a','b']);
  assert.deepEqual(board.finding.images.map(i=>[i.title,i.sourceUrl]),[['画面来自b',url+'/b.png']]);
  assert.equal(board.finding.implication,'只属于b');
});
