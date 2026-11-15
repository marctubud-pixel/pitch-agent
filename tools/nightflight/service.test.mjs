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
    conclusion: '可区分两种观看场景',
    evidence: '夹具中两处展示位置不同',
    source: '案例夹具',
    url: 'https://example.test/poster',
    implication: '策略要明确主要观看场景',
  };
  async function run({ stage, dir, project }) {
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
    if (stage === 'layout') assert.equal(await readFile(join(dir, 'update.md'), 'utf8'), 'update');
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
        artifacts.push({name,kind:'image',visual:{direction:'A',role:'main',candidate,mean:score,blocked:false,reason:'合成评语',recommended:candidate===2,scores:['视觉','品牌','用户','传播'].map(role=>({role,score,reason:'合成依据'}))}});
      }
      return {artifacts};
    }
    if(stage==='layout') assert.deepEqual((await import('node:fs/promises').then(fs=>fs.readdir(dir))).filter(n=>n.endsWith('.png')),['稿2.png']);
    await writeFile(join(dir, name), body);
    return {
      research,
      researchReturn,
      artifacts: [{ kind, name, ...(stage === 'copy' ? { text: body } : {}) }],
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
  assert.equal((await request(base, input, 'http://foreign.invalid')).status, 403);
  assert.equal((await request(base, input)).status, 201);
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
  await action({ kind: 'message', text: 'change', attachments: [file('update.md', 'update')] });
  const revised = await wait('waiting');
  assert.equal(revised.versions.length, 4);
  assert.equal((await action({ kind: 'adopt', expectedRevision: visual.revision })).status, 409);
  const adoption = { kind: 'adopt', expectedRevision: revised.revision, opId: 'my-choice' };
  assert.equal((await action(adoption)).status, 200);
  const finished = await wait('done');
  assert.equal(finished.artifacts.length, 9);
  assert.equal((await action(adoption)).status, 200);
  service.close();
  service = createNightflight(options);
  assert.deepEqual(await project(), finished);
  await action({ kind: 'research_again', expectedRevision: finished.revision });
  const resumed = await wait('waiting');
  assert.equal(resumed.stage, 'copy');
  assert.equal(resumed.choice, null);
  assert.equal(resumed.visualAdoption, null);
  assert.deepEqual(resumed.versions.at(-1).artifacts, finished.artifacts);
  assert.deepEqual(resumed.versions.at(-1).copyReview, finished.copyReview);
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
      if (project.status !== 'running') break;
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
