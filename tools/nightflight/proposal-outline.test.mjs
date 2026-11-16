import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildProposalOutline, normalizeOutlineOptions } from './proposal-outline.mjs';

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'nightflight-proposal-outline-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const names = ['春山', '青石', '晚风'];
  const drafts = names.map((name, i) => ({ id: 'ABC'[i], name, main: name + '入杯', mechanism: '线条连接茶杯与水源' }));
  const copy = drafts.map(d => '## ' + d.name + '\n主标题：' + d.main).join('\n\n');
  const texts = { brief: '## 已掌握的项目信息\n品牌：松泉\n输出目标：包装设计\n## 原稿记录\n后台文字哨兵',
    strategy: '## 研究结论\n强调用料\n## 方向交叉点\n茶水工艺和茶客购买需求相交\n## 策略发力点\n优先表达泡茶选水',
    copy };
  const artifacts = [];
  for (const [stage, text] of Object.entries(texts)) {
    await writeFile(join(dir, stage + '.md'), text + '\n');
    artifacts.push({ name: stage + '.md', stage, kind: 'text' });
  }
  for (const [index, direction] of names.entries()) artifacts.push({ name: 'main-' + index + '.png', kind: 'image', stage: 'visual',
    visual: { direction, role: 'main', candidate: 2, recommended: true, reason: direction + '可读', blind: { action: '水流入杯', words: '茶种' } } });
  const f = { chapter: '竞争与同类传播', conclusion: '同类展示茶种', evidence: '铁观音', source: '同类商品原页',
    url: 'https://example.test/tea', implication: '正面要留下品类位置' };
  return { dir, project: { title: '松泉提案', brief: '设计松泉包装', mode: 'auto', directions: names,
    artifacts, attachments: [{ name: '同类.png' }, { name: '冷柜.jpg' }, { name: '逐页材料.md' }],
    layoutCompetitorReferences: ['同类.png', '其他项目.png'], research: { findings: [f] },
    copyReview: { status: 'ready', bodyHash: createHash('sha256').update(copy).digest('hex'), draft: { directions: drafts } } } };
}

test('registers only current direction materials while preserving labelled research, sources and unfilled requirements', async t => {
  const { project, dir } = await fixture(t);
  await writeFile(join(dir, '逐页材料.md'), [
    '## packaging/pack-shelf/青石', '身份：售卖场景模拟', '图片：冷柜.jpg', '对应主稿：main-1.png',
    '来源：品牌提供的本次冷柜陈列设计', '说明：冷柜模拟环境中的青石', '',
    '## packaging/pack-shelf/春山', '身份：售卖场景模拟', '图片：冷柜.jpg', '对应主稿：旧批次.png',
    '来源：品牌资料', '说明：不得跨版复用', '',
    '## strategy/choice', '身份：同类原图', '图片：冷柜.jpg', '来源：附件', '说明：后门替换策略',
  ].join('\n'));
  const deck = await buildProposalOutline(project, dir);
  const pages = new Map(deck.pages.map(p => [p.instance_id, p]));
  assert.equal(deck.kind, 'packaging');
  assert.equal(deck.pages[0].type_id, 'cover');
  assert.equal(deck.pages[1].type_id, 'toc');
  assert.equal(deck.pages.at(-1).type_id, 'back-cover');
  assert.equal(pages.get('strategy/choice').client_title, '茶水工艺和茶客购买需求相交');
  assert.equal(pages.get('packaging/pack-idea/青石').client_title, '青石入杯');
  assert.deepEqual(pages.get('packaging/pack-front/青石').images, ['main-1.png']);
  assert.deepEqual(pages.get('research/competitors').images, ['同类.png']);
  assert.match(pages.get('research/competitors').material_ref, /https:\/\/example.test\/tea/);
  assert.deepEqual(pages.get('packaging/pack-shelf/青石').images, ['冷柜.jpg']);
  assert.match(pages.get('packaging/pack-shelf/青石').material_ref, /main-1.png/);
  assert.equal(pages.has('packaging/pack-shelf/春山'), false);
  assert.equal(deck.materialIssues.length, 2);
  assert.ok(deck.gaps.some(g => g.instance_id === 'packaging/pack-shelf/春山'));
  assert.doesNotMatch(deck.pages.map(p => p.content).join(' '), /后台文字哨兵|后门替换策略|不得跨版复用/);
  assert.match(pages.get('closing/decision').content, /同版包装的侧背/);
  assert.deepEqual(pages.get('closing/compare').images, ['main-0.png', 'main-1.png', 'main-2.png']);
});

test('collaborative adopted route and KV options do not expose other routes or infer completed extensions', async t => {
  const { project, dir } = await fixture(t);
  project.proposalKind = 'kv';
  project.mode = 'collab';
  project.choice = '晚风';
  project.outlineOptions = { include: ['adaptation', 'motion'], singleTouchpoint: true };
  project.attachments = [];
  const deck = await buildProposalOutline(project, dir);
  assert.equal(deck.kind, 'kv');
  assert.deepEqual([...new Set(deck.pages.map(p => p.direction).filter(Boolean))], ['晚风']);
  assert.deepEqual(deck.pages.find(p => p.type_id === 'kv-hero').images, ['main-2.png']);
  assert.ok(deck.gaps.some(g => g.type_id === 'kv-adaptation'));
  assert.ok(deck.gaps.some(g => g.type_id === 'kv-motion'));
  assert.ok(!deck.gaps.some(g => g.type_id === 'kv-second-use'));
  assert.ok(!deck.gaps.some(g => g.type_id === 'compare'));
  assert.deepEqual(deck.pages.find(p => p.type_id === 'competitors').images, []);
  assert.doesNotMatch(deck.pages.map(p => p.content).join(' '), /春山入杯|青石入杯/);
});

test('only competitor images attached to accepted research reach the packaging and KV comparison page', async t => {
  const { project, dir } = await fixture(t);
  project.attachments = [];
  project.layoutCompetitorReferences = [];
  project.research.findings[0].images = [{name:'competitor.jpg'}, {name:'old-version.jpg'}];
  project.artifacts.push({name:'competitor.jpg',stage:'research',kind:'image'},
    {name:'unused.jpg',stage:'research',kind:'image'});
  for (const kind of ['packaging','kv']) {
    const outline=await buildProposalOutline({...project,proposalKind:kind},dir);
    assert.deepEqual(outline.pages.find(p=>p.type_id==='competitors').images,['competitor.jpg']);
  }
});

test('mixed, unclassified and negative briefs retain the legacy path; explicit options validate', async t => {
  const { project, dir } = await fixture(t);
  project.artifacts = [];
  project.attachments = [];
  for (const brief of ['春日', '希望设计包装和 KV', '这次不要包装方案', '仅供参考的包装设计']) {
    assert.equal(await buildProposalOutline({ ...project, brief }, dir), null);
  }
  const deck = await buildProposalOutline({ ...project, brief: '请设计春季节庆KV，交付横竖两版及动效。' }, dir);
  assert.ok(deck.gaps.some(x => x.type_id === 'kv-adaptation'));
  assert.ok(deck.gaps.some(x => x.type_id === 'kv-motion'));
  assert.deepEqual(normalizeOutlineOptions(undefined), { include: [], singleTouchpoint: false });
  for (const [kind, options] of [['auto', {}], ['kv', { include: ['series'] }], [undefined, { include: ['process'] }],
    ['packaging', { singleTouchpoint: 1 }], ['kv', { unknown: 'motion' }]]) {
    assert.throws(() => normalizeOutlineOptions(kind, options), { status: 400 });
  }
});

test('mismatched signed copy does not enter the outline, old unbound images retain the legacy export', async t => {
  const { project, dir } = await fixture(t);
  project.attachments = [];
  project.copyReview.bodyHash = 'another-version';
  project.copyReview.recommendation = { directionId: 'B', reason: '失效推荐' };
  const current = await buildProposalOutline(project, dir);
  assert.ok(current.gaps.some(g => g.type_id === 'pack-idea'));
  assert.doesNotMatch(current.pages.map(p => p.client_title + p.content).join(' '), /青石入杯|失效推荐/);
  const peers = current.pages.find(p => p.type_id === 'competitors');
  assert.equal(peers.status, '待补');
  assert.ok(current.gaps.some(g => g.instance_id === peers.instance_id));
  project.artifacts.push({ stage: 'visual', name: '旧图.png', kind: 'image' });
  assert.equal(await buildProposalOutline(project, dir), null);
});

test('illustrative and unregistered attachments cannot stand in for same-version product shots', async t => {
  const { project, dir } = await fixture(t);
  await writeFile(join(dir, '逐页材料.md'), [
    '## packaging/pack-views/青石', '身份：同类原图', '图片：同类.png', '来源：品牌附件',
    '说明：别人的包装', '对应主稿：main-1.png',
    '## packaging/pack-shelf/晚风', '身份：售卖场景模拟', '图片：../其他项目.jpg',
    '来源：历史目录', '说明：不在本项目', '对应主稿：main-2.png',
  ].join('\n'));
  const deck = await buildProposalOutline(project, dir);
  assert.equal(deck.materialIssues.length, 2);
  assert.ok(deck.gaps.some(g => g.instance_id === 'packaging/pack-views/青石'));
  assert.doesNotMatch(deck.pages.map(p => p.content).join(' '), /别人的包装|不在本项目/);
});
