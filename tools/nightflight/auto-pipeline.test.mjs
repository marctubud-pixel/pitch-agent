import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  autoFallbackBriefScope,
  broadCategoryLadder,
  coreSloganSkill,
  macroResearchGaps,
  matchesSourceBasis,
  pickAutoVisualAdoption,
  selectAestheticQuadrants,
} from './auto-pipeline.mjs';
import { createNightflight } from './service.mjs';
import { fastReviewReferencePlan } from './visual-references.mjs';
import { fastReviewVisualBatch } from './visual-batch.mjs';
import { engineCopyHandoffReady, engineCopyProtocol, runCopyReview } from './copy-review.mjs';
import { readFileSync } from 'node:fs';

test('broadCategoryLadder steps down from fine category (轻型白酒) to broad parent categories (低度白酒, 白酒)', () => {
  const ladder = broadCategoryLadder({
    specific: '轻型浓香白酒',
    planned: '',
    reportCategories: ['轻型浓香白酒'],
    consumerCategories: [],
    catalogTerms: [],
  });
  assert.deepEqual(ladder.fine, ['轻型浓香白酒']);
  assert.ok(ladder.broad.includes('低度白酒'));
  assert.ok(ladder.broad.includes('白酒'));
});

test('macroResearchGaps passes once the 3 macro dimensions (行业, 竞品, 用户) each have >=1 grounded finding', () => {
  const findings = [
    { chapter: '行业与市场', subject: 'market', conclusion: '白酒大类稳定增长', evidence: '2025年规模6500亿元', passage: '2025年规模6500亿元', source: '行业年报', url: 'https://example.org/market', implication: '依托白酒基础盘' },
    { chapter: '竞争与同类传播', subject: 'competitor', conclusion: '竞品多用瓷瓶礼盒', evidence: '主流品牌以红色礼盒为主', passage: '主流品牌以红色礼盒为主', source: '品牌官网', url: 'https://example.org/comp', implication: '透明小瓶形成差异' },
    { chapter: '人群与接触情境', subject: 'audience', conclusion: '白领偏好低度微醺佐餐', evidence: '62%受访者聚餐选低度酒', passage: '62%受访者聚餐选低度酒', source: '消费调查', url: 'https://example.org/user', implication: '切入下班晚餐场景' },
  ];
  const sections = findings.map((f, i) => ({
    chapter: f.chapter,
    conclusion: f.conclusion,
    explanation: f.evidence,
    evidenceIndices: [i],
  }));
  // Even without 4th dimension, 2nd audience quote, or competitor image originals, 3 macro dims pass!
  assert.deepEqual(macroResearchGaps({ findings, sections }, { briefScope: { types: ['kv', 'packaging'] } }), []);

  // Missing audience dimension still reports gap for 人群与接触情境
  const missingAudience = macroResearchGaps({ findings: findings.slice(0, 2), sections: sections.slice(0, 2) }, {});
  assert.equal(missingAudience.length, 1);
  assert.equal(missingAudience[0].chapter, '人群与接触情境');
});

test('autoFallbackBriefScope recovers unclear brief in auto mode with explicit assumption', () => {
  const res = autoFallbackBriefScope(
    { title: '清酌28度白酒', brief: '帮我做一套清酌28度330ml透明玻璃小瓶新品推广方案' },
    { status: 'unclear', types: [], reason: '未指明交付载体' },
  );
  assert.equal(res.briefScope.status, 'accepted');
  assert.ok(res.briefScope.types.includes('packaging'));
  assert.match(res.body, /自动模式降级受理/);
});

test('coreSloganSkill strips Python/install appendices (>50% reduction) and matchesSourceBasis tolerates punctuation', () => {
  const full = readFileSync(new URL('../../skills/slogan-engine/SKILL.md', import.meta.url), 'utf8');
  const core = coreSloganSkill(full);
  assert.ok(core.length < full.length * 0.65);
  assert.ok(core.includes('01 坐标'));
  assert.ok(!core.includes('附录 A · 机械门禁检查器'));
  assert.equal(matchesSourceBasis(['四川宜宾小窖固态发酵，降度不降香。'], '四川宜宾小窖固态发酵 降度不降香'), true);
});

test('Plan Q copy flow runs zero-context blind pick (3 calls) and passes engineCopyHandoffReady', async () => {
  const fullSkill = readFileSync(new URL('../../skills/slogan-engine/SKILL.md', import.meta.url), 'utf8');
  const phases = [];
  const brief = '清酌28度轻型白酒，330ml透明小瓶，四川宜宾小窖固态发酵。';
  const call = async (instruction, _images, _schema, task) => {
    const phase = instruction.split('\n')[0];
    phases.push({ phase, rulesLen: (task.rules || []).join('').length, ctx: task.context });
    if (phase === 'COPY_ENGINE_WRITE') {
      assert.ok((task.rules || []).join('').length < fullSkill.length);
      return {
        runId: 'r1', threadId: 't1', model: 'deepseek-chat', inputPacketHash: '1'.repeat(64),
        parsedOutput: {
          directions: ['A', 'B', 'C'].map((id, i) => ({
            id,
            name: ['透明纯粮', '加冰晚餐', '不扛高度'][i],
            basis: '330ml透明小瓶',
            claim: '主张' + id,
            mechanism: '机制' + id,
            strategyLink: '承接' + id,
            secondary: '副标' + id,
            candidates: [
              { text: ['28度真白酒，装进透明瓶', '晚饭配白酒，今天加冰喝', '不劝酒的白酒，28度刚刚好'][i], use: '海报' },
              { text: ['28度纯粮酿，瓶子敢透明', '开瓶加块冰，白酒配家常菜', '想喝口真白酒，不想扛52度'][i], use: '包装' },
              { text: ['脱掉老瓷瓶，28度照样浓', '顺手拎一瓶，28度配晚饭', '不看脸色喝白酒，选28度'][i], use: '货架' },
            ],
          })),
          picks: { A: 'A1', B: 'B1', C: 'C1' },
          authorCheck: {
            selections: [
              { directionId: 'A', phrase: '装进透明瓶', takeaway: '可见纯粮', sloganReady: true },
              { directionId: 'B', phrase: '加冰喝', takeaway: '日常佐餐', sloganReady: true },
              { directionId: 'C', phrase: '不劝酒', takeaway: '轻松微醺', sloganReady: true },
            ],
            pairs: [
              { pair: 'AB', distinct: true, reason: '产品vs场景' },
              { pair: 'AC', distinct: true, reason: '产品vs情绪' },
              { pair: 'BC', distinct: true, reason: '场景vs情绪' },
            ],
          },
        },
      };
    }
    if (phase === 'COPY_ENGINE_BLIND_PICK') {
      // Zero-context check: brief text must NOT leak into blind reader!
      assert.ok(!task.context.includes('四川宜宾'));
      return {
        runId: 'r2', threadId: 't2', model: 'deepseek-chat', inputPacketHash: '2'.repeat(64),
        parsedOutput: {
          picks: { A: 'A2', B: 'B2', C: 'C2' },
          lineNotes: { A: '瓶子敢透明更有信任感', B: '开瓶加块冰画面更活', C: '不想扛52度直击痛点' },
        },
      };
    }
    return {
      runId: 'r3', threadId: 't3', model: 'deepseek-chat', inputPacketHash: '3'.repeat(64),
      parsedOutput: { directionId: 'C', reason: '想喝口真白酒不想扛52度穿透力最强' },
    };
  };

  const result = await runCopyReview({
    call,
    project: { mode: 'auto', brief, proposalKind: 'kv' },
    inputs: { texts: [{ name: '策略.md', text: '核心策略：把白酒拉回晚餐桌。' }], images: [] },
    rules: [fullSkill],
    singleOwner: true,
  });

  assert.deepEqual(phases.map((p) => p.phase), ['COPY_ENGINE_WRITE', 'COPY_ENGINE_BLIND_PICK', 'COPY_ENGINE_RECOMMEND']);
  assert.equal(result.copyReview.protocol, engineCopyProtocol);
  assert.equal(result.copyReview.calls.length, 3);
  assert.deepEqual(result.copyReview.draft.directions.map((d) => d.main), [
    '28度纯粮酿，瓶子敢透明',
    '开瓶加块冰，白酒配家常菜',
    '想喝口真白酒，不想扛52度',
  ]);
  assert.equal(engineCopyHandoffReady(result.copyReview, result.directions, result.body), true);
});

test('Plan Z visual fast gate & 2-step batch selection use 1+3 calls and catch bare product defect', async () => {
  const quadrants = selectAestheticQuadrants('28度轻型白酒透明小瓶首发海报', ['kv', 'packaging']);
  assert.equal(quadrants.length, 3);
  assert.equal(new Set(quadrants.map((q) => q.quadrant)).size, 3);

  let refCalls = 0;
  const refAdmission = await fastReviewReferencePlan({
    call: async () => {
      refCalls++;
      return { threadId: 'ref-1', parsedOutput: { passed: true, reason: '画质清晰、适配棚拍象限', borrowNote: '借光影构图', avoidNote: '禁照搬原品牌标' } };
    },
    project: { brief: '28度白酒海报' },
    direction: '透明纯粮',
    quadrant: quadrants[0],
    images: [{ sha256: 'a'.repeat(64) }],
    handoff: { references: [{ role: 'main', name: 'ref.png', sha256: 'a'.repeat(64) }] },
  });
  assert.equal(refCalls, 1);
  assert.equal(refAdmission.passed, true);

  let batchCalls = 0;
  const review = await fastReviewVisualBatch({
    call: async (_inst, imgs) => {
      batchCalls++;
      if (imgs.length === 1) {
        const isBare = imgs[0].sha256.startsWith('a');
        return {
          threadId: 'read-' + batchCalls,
          parsedOutput: {
            visibleText: '28度纯粮酿，瓶子敢透明',
            headlineAccurate: true,
            bareProduct: isBare,
            garbledOrFakeSeal: false,
            physicalGlitch: false,
            quadrantAligned: true,
            hardIssues: isBare ? ['瓶身无标裸瓶'] : [],
            summary: isBare ? '光影好但裸瓶' : '酒标清晰、构图高级',
          },
        };
      }
      return {
        threadId: 'pick-1',
        parsedOutput: { winner: 2, ranking: [2, 1], reason: '第2稿酒标清晰无裸瓶硬伤', edit: '无' },
      };
    },
    direction: '透明纯粮',
    quadrant: quadrants[0],
    posterSlogan: '28度纯粮酿，瓶子敢透明',
    packaging: true,
    context: '清酌28度白酒',
    images: [
      { sha256: 'a'.repeat(64), path: '/tmp/1.png' },
      { sha256: 'b'.repeat(64), path: '/tmp/2.png' },
    ],
  });
  assert.equal(batchCalls, 3); // 2 parallel reads + 1 side-by-side pick
  assert.equal(review.winner, 2);
  assert.equal(review.packaging, true);
  assert.deepEqual(review.references, []);
  assert.ok(review.candidates.every((c) => c.research === '无'));
  assert.ok(review.candidates[0].hardIssues.some((s) => s.includes('裸瓶')));
  assert.equal(review.candidates[1].hardIssues.length, 0);
});

test('auto mode runs end-to-end brief -> research (3 macro dims) -> strategy -> copy -> visual (auto-adopt 3 dirs) -> layout -> final -> done without stopping', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'nightflight-auto-e2e-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const visited = [];
  const findings = [
    { chapter: '行业与市场', subject: 'market', conclusion: '白酒大类稳健', evidence: '6500亿', passage: '6500亿', source: '年报', url: 'https://example.org/m', implication: '大盘稳' },
    { chapter: '竞争与同类传播', subject: 'competitor', conclusion: '传统瓷瓶为主', evidence: '礼盒居多', passage: '礼盒居多', source: '官网', url: 'https://example.org/c', implication: '透明瓶突围' },
    { chapter: '人群与接触情境', subject: 'audience', conclusion: '年轻白领偏爱微醺', evidence: '62%选低度', passage: '62%选低度', source: '调研', url: 'https://example.org/u', implication: '晚餐切入' },
  ];
  const service = createNightflight({
    root,
    runStage: async ({ stage, dir }) => {
      visited.push(stage);
      if (stage === 'brief') {
        await writeFile(join(dir, '任务卡.md'), '## 已掌握的项目信息\n提案任务：包装+KV');
        return {
          briefScope: { status: 'accepted', types: ['packaging', 'kv'], reason: '包装与KV' },
          artifacts: [{ kind: 'text', name: '任务卡.md', text: '## 已掌握的项目信息\n提案任务：包装+KV' }],
        };
      }
      if (stage === 'research') {
        await writeFile(join(dir, '研究.md'), '# 研究');
        return {
          artifacts: [{ kind: 'text', name: '研究.md', text: '# 研究' }],
          research: {
            ready: true,
            findings,
            sections: findings.map((f, i) => ({ chapter: f.chapter, conclusion: f.conclusion, explanation: f.evidence, evidenceIndices: [i] })),
            gaps: [],
            next: '进入策略',
          },
        };
      }
      if (stage === 'strategy') {
        await writeFile(join(dir, '策略.md'), '# 策略\n## 核心策略\n透明小瓶上晚餐桌');
        return { artifacts: [{ kind: 'text', name: '策略.md', text: '# 策略\n## 核心策略\n透明小瓶上晚餐桌' }] };
      }
      if (stage === 'copy') {
        const dirs = ['透明纯粮', '加冰晚餐', '不扛高度'];
        const fullSkill = readFileSync(new URL('../../skills/slogan-engine/SKILL.md', import.meta.url), 'utf8');
        const { fullSloganHash } = await import('./slogan-workbook.mjs');
        const draft = {
          directions: dirs.map((name, i) => ({
            id: 'ABC'[i], name, basis: '28度', claim: '主张' + i, mechanism: '机制' + i, strategyLink: '承接' + i,
            secondary: '副标' + i, main: ['28度纯粮酿，瓶子敢透明', '开瓶加块冰，白酒配家常菜', '想喝口真白酒，不想扛52度'][i],
          })),
        };
        const body = draft.directions.map((d) => `## ${d.name}\n主标题：${d.main}\n副标：${d.secondary}`).join('\n\n');
        const { createHash } = await import('node:crypto');
        await writeFile(join(dir, '文案.md'), body);
        return {
          directions: dirs,
          artifacts: [{ kind: 'text', name: '文案.md', text: body }],
          copyReview: {
            protocol: engineCopyProtocol, version: 1, status: 'ready',
            bodyHash: createHash('sha256').update(body).digest('hex'),
            skillHash: fullSloganHash(fullSkill),
            draft,
            workbook: { directions: draft.directions.map(({ main, ...d }) => ({ ...d, candidates: [{ text: main, use: 'KV' }, { text: main + '2', use: '包装' }, { text: main + '3', use: '货架' }] })) },
            picks: { A: 'A1', B: 'B1', C: 'C1' },
            recommendation: { directionId: 'C', reason: '穿透力最强' },
            calls: [
              { phase: 'COPY_ENGINE_WRITE', runId: 'r1', threadId: 't1', model: 'deepseek-chat', inputPacketHash: '1'.repeat(64) },
              { phase: 'COPY_ENGINE_BLIND_PICK', runId: 'r2', threadId: 't2', model: 'deepseek-chat', inputPacketHash: '2'.repeat(64) },
              { phase: 'COPY_ENGINE_RECOMMEND', runId: 'r3', threadId: 't3', model: 'deepseek-chat', inputPacketHash: '3'.repeat(64) },
            ],
          },
        };
      }
      if (stage === 'visual') {
        const dirs = ['透明纯粮', '加冰晚餐', '不扛高度'];
        const artifacts = [];
        for (const [idx, d] of dirs.entries()) {
          for (const cand of [1, 2]) {
            const name = `v-${idx + 1}-${cand}.png`;
            await writeFile(join(dir, name), Buffer.from(`fake-png-${idx}-${cand}`));
            // Intentionally make direction 3 have no `recommended: true` to prove auto-fallback adoption!
            artifacts.push({
              kind: 'image', name,
              visual: {
                role: 'main', fastAuto: true, direction: d, candidate: cand,
                recommended: idx < 2 && cand === 1,
                hardIssues: idx === 2 ? (cand === 1 ? ['裸瓶', '乱码'] : ['轻微标点瑕疵']) : [],
                mean: cand === 1 ? 4.5 : 4.0, reason: 'ok',
              },
            });
          }
        }
        return { artifacts };
      }
      if (stage === 'final') {
        await writeFile(join(dir, '终审.md'), '# 自动模式快速终审通过');
        return {
          artifacts: [{ kind: 'text', name: '终审.md', text: '# 自动模式快速终审通过' }],
          finalReview: { outcome: 'pass', pages: [1], reason: '自动模式快速终审完成，已产出可下载 PPTX。' },
        };
      }
      throw Error('unexpected stage ' + stage);
    },
    runLayout: async ({ dir }) => {
      visited.push('layout');
      await writeFile(join(dir, '提案.pptx'), Buffer.from('fake-pptx'));
      await writeFile(join(dir, 'page-0001.jpg'), Buffer.from('fake-jpg'));
      return {
        artifacts: [
          { kind: 'pptx', name: '提案.pptx' },
          { kind: 'image', name: 'page-0001.jpg', renderPage: 1 },
        ],
      };
    },
  });
  t.after(() => service.close());

  const { Readable } = await import('node:stream');
  const rpc = async (method, url, payload) => {
    const req = Readable.from(payload ? [Buffer.from(JSON.stringify(payload))] : []);
    req.method = method;
    req.url = url;
    req.headers = { host: '127.0.0.1:4420', ...(method === 'POST' ? { origin: 'http://127.0.0.1:4420', 'content-type': 'application/json' } : {}) };
    req.socket = { remoteAddress: '127.0.0.1' };
    const out = { status: 0, body: '' };
    const res = {
      headersSent: false,
      writeHead(code) { out.status = code; this.headersSent = true; },
      end(chunk) { if (chunk) out.body += chunk; },
    };
    await service.handle(req, res);
    return { status: out.status, json: out.body ? JSON.parse(out.body) : null };
  };
  const created = await rpc('POST', '/api/projects', { id: 'auto-e2e-1', title: '清酌轻型白酒自动案', brief: '28度轻型白酒330ml透明小瓶包装+KV', mode: 'auto' });
  assert.equal(created.status, 201);
  const projectId = created.json.project?.id ?? created.json.id;
  let current;
  for (let i = 0; i < 120; i++) {
    const fetched = await rpc('GET', '/api/projects/' + projectId);
    current = fetched.json.project ?? fetched.json;
    if (current.status === 'done' || current.status === 'failed' || current.status === 'waiting') break;
    await new Promise((r) => setTimeout(r, 25));
  }
  assert.equal(current.status, 'done', 'unexpected status: ' + current.status + ' stage=' + current.stage + ' err=' + current.error);
  assert.deepEqual(visited, ['brief', 'research', 'strategy', 'copy', 'visual', 'layout', 'final']);
  assert.equal(current.visualAdoption.artifacts.length, 3);
  assert.ok(current.visualAdoption.autoFallbackNotes?.length === 1);
});

test('pickAutoVisualAdoption prefers recommended and falls back to fewest hardIssues', () => {
  const res = pickAutoVisualAdoption({
    mode: 'auto',
    directions: ['A', 'B'],
    artifacts: [
      { stage: 'visual', name: 'a1.png', storageKey: 'k-a1', visual: { candidate: 1, direction: 'A', recommended: true } },
      { stage: 'visual', name: 'b1.png', storageKey: 'k-b1', visual: { candidate: 1, direction: 'B', recommended: false, hardIssues: ['裸瓶', '乱码'] } },
      { stage: 'visual', name: 'b2.png', storageKey: 'k-b2', visual: { candidate: 2, direction: 'B', recommended: false, hardIssues: ['轻微标点'] } },
    ],
  });
  assert.deepEqual(res.artifacts, ['k-a1', 'k-b2']);
  assert.equal(res.autoFallbackNotes.length, 1);
  assert.match(res.autoFallbackNotes[0], /b2\.png/);
});

test('writeManuscript in auto mode normalizes prefix/count nitpicks and preserves compare quotes', async (t) => {
  const { writeManuscript } = await import('./manuscript.mjs');
  const { jsonModelRequest } = await import('./desktop-text.mjs');
  const { createHash } = await import('node:crypto');
  const cpDir = await mkdtemp(join(tmpdir(), 'nightflight-ms-auto-'));
  t.after(() => rm(cpDir, { recursive: true, force: true }));
  const profile = { provider: 'deepseek', host: 'api.deepseek.com', base: 'https://api.deepseek.com', model: 'deepseek-chat' };
  const makeFigure = (id, direction, detailWithCount, cleanDetail) => ({
    id, direction, name: id.toLowerCase() + '.png', sha256: '1'.repeat(64),
    reading: { model: 'gpt-4.1-mini', completionId: 'cmpl-' + id },
    observation: {
      composition: cleanDetail,
      visibleDetails: [detailWithCount, cleanDetail],
      legibleText: ['清酌', '28度'],
      uncertain: [],
    },
  });
  const materials = {
    project: { title: '清酌28度轻型白酒', id: 'p-ms-auto', mode: 'auto', carriers: ['packaging', 'kv'], stageVersions: {} },
    brief: { original: '清酌28度轻型浓香白酒，330ml透明玻璃小瓶，包装与KV提案。', task: { name: 'brief.md', sha256: '2'.repeat(64), body: '简报' } },
    research: {
      method: 'r42',
      findings: [
        { chapter: '行业与市场', conclusion: '白酒大类稳定', evidence: '2025年中期报告', source: '199IT', url: 'https://example.org/a' },
        { chapter: '竞争与同类传播', conclusion: '竞品多用瓷瓶', evidence: '京东页样本', source: 'JD', url: 'https://example.org/b' },
      ],
      sections: [
        { chapter: '行业与市场', conclusion: '白酒大类稳定', explanation: '2025年中期报告', evidenceIndices: [0] },
        { chapter: '竞争与同类传播', conclusion: '竞品多用瓷瓶', explanation: '京东页样本', evidenceIndices: [1] },
      ],
      gaps: [],
    },
    strategy: [{ name: 's.md', sha256: '3'.repeat(64), body: '# 策略\n\n## 核心策略\n\n把28度白酒放回晚餐桌。' }],
    copy: {
      name: 'c.md', sha256: '4'.repeat(64),
      directions: [
        { name: '透明物证', main: '330ml透明瓶，28度不藏', secondary: '副标A', basis: '透明瓶', displayed: true },
        { name: '把酒局换回晚饭', main: '酒不必敬谁，饭要好好吃', secondary: '副标C', basis: '晚饭桌', displayed: true },
      ],
    },
    adoption: { at: '2026-11-23T00:00:00Z', explanation: '' },
    figures: [
      makeFigure('A1', '透明物证', '桌上有两只玻璃杯', '瓶身布满水珠显示冷藏状态'),
      makeFigure('B1', '把酒局换回晚饭', '左侧三只手举杯敬酒', '瓶身居中分隔左右冷暖场景'),
    ],
    feedback: [],
  };
  const provider = {
    profile,
    async execute({ prompt, outputSchema }) {
      const parsedOutput = {
        cover: { title: '清酌提案', subtitle: '包装与KV', imageNote: '' },
        closing: '谢谢观看',
        chapters: [
          {
            title: '需求与研究',
            pages: [
              { role: 'brief', title: '需求回顾', points: ['330ml透明瓶'], imageNote: '', internalNote: '', figureId: '', sourceIndices: [], visibleQuotes: [] },
              { role: 'trend', title: '行业趋势', points: ['白酒大类稳定'], imageNote: '', internalNote: '', figureId: '', sourceIndices: [0], visibleQuotes: [] },
              { role: 'peers', title: '竞品观察', points: ['竞品多用瓷瓶'], imageNote: '', internalNote: '', figureId: '', sourceIndices: [1], visibleQuotes: [] },
            ],
          },
          {
            title: '策略与方案',
            pages: [
              { role: 'strategy', title: '把28度白酒放回晚餐桌。', points: ['多余的要点应自动清空'], imageNote: '', internalNote: '', figureId: '', sourceIndices: [], visibleQuotes: [] },
              // Direction A: point does NOT start with 拟/可试, quote has count "两只" -> must auto-normalize instead of crashing!
              { role: 'direction', title: '透明物证', points: ['用透光瓶身建立第一信任'], imageNote: '不该有值', internalNote: '', figureId: 'A1', sourceIndices: [], visibleQuotes: ['桌上有两只玻璃杯'] },
              { role: 'work', title: '透明物证成品', points: ['不应有要点'], imageNote: '', internalNote: '', figureId: 'A1', sourceIndices: [], visibleQuotes: [] },
              { role: 'direction', title: '把酒局换回晚饭', points: ['对比应酬与晚饭'], imageNote: '', internalNote: '', figureId: 'B1', sourceIndices: [], visibleQuotes: ['左侧三只手举杯敬酒'] },
              { role: 'work', title: '把酒局换回晚饭成品', points: [], imageNote: '', internalNote: '', figureId: 'B1', sourceIndices: [], visibleQuotes: [] },
            ],
          },
          {
            title: '对比与决定',
            pages: [
              { role: 'compare', title: '并排对比', points: ['讲透明物证', '讲情绪松弛'], imageNote: '', internalNote: '', figureId: '', sourceIndices: [], visibleQuotes: ['桌上有两只玻璃杯', '左侧三只手举杯敬酒'] },
              { role: 'decision', title: '请确认方向', points: ['选定主推方向'], imageNote: '', internalNote: '', figureId: '', sourceIndices: [], visibleQuotes: [] },
            ],
          },
        ],
      };
      const req = jsonModelRequest(profile, prompt, outputSchema);
      return {
        model: profile.model,
        threadId: 'ms-auto-1',
        inputPacketHash: createHash('sha256').update(JSON.stringify(req)).digest('hex'),
        parsedOutput,
      };
    },
  };
  const { plan } = await writeManuscript(provider, { materials, checkpointDir: cpDir });
  const comparePage = plan.pages.find((p) => p.role === 'compare');
  assert.equal(comparePage.points.length, 2);
  assert.match(comparePage.points[0], /瓶身布满水珠显示冷藏状态.*适合/);
  assert.match(comparePage.points[1], /瓶身居中分隔左右冷暖场景.*适合/);
});
