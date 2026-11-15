import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { runLayout } from './layout.mjs';

const req = createRequire(new URL('../../apps/workbench-preview/package.json', import.meta.url));
const { unzipSync, strFromU8 } = req('fflate');

test('exports the fixture body as editable native text, keeps original PNG bytes, and paginates long copy', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nightflight-layout-'));
  try {
    const title = '很长的用户提案需求'.repeat(8);
    const text = '原创研究记录。'.repeat(90) + '尾端标记';
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
    await writeFile(join(dir, 'research.md'), text);
    await writeFile(join(dir, 'kv.png'), png);
    const { artifacts, pages } = await runLayout({ dir, project: {
      title, brief: '独立简报', directions: ['原野', '飞鸟', '星空'], choice: '星空',
      artifacts: [{ stage: 'research', kind: 'text', name: 'research.md' }, { stage: 'visual', kind: 'image', name: 'kv.png' }],
    } });
    const preview = artifacts.find(item => item.name.endsWith('.deck.json'));
    assert.equal(preview.kind, 'text');
    assert.equal(preview.text, undefined);
    const deck = JSON.parse(await readFile(join(dir, preview.name), 'utf8'));
    assert.equal(deck.title, title);
    assert.equal(deck.pages.length, pages);
    const media = deck.pages.flatMap(page => page.nodes).find(node => node.kind === 'image');
    assert.deepEqual(Buffer.from(media.image.data.split(',')[1], 'base64'), png);
    const files = unzipSync(await readFile(join(dir, artifacts[0].name)));
    const slides = Object.keys(files).filter(k => /^ppt\/slides\/slide\d+\.xml$/.test(k))
      .sort((a, b) => Number(a.match(/(\d+)\.xml/)[1]) - Number(b.match(/(\d+)\.xml/)[1]));
    assert.equal(slides.length, pages);
    assert.ok(pages > 3);
    const words = slides.map(k => [...strFromU8(files[k]).matchAll(/<a:t>([^<]*)<\/a:t>/gu)].map(m => m[1]).join('')).join('');
    assert.ok(words.includes('独立简报'));
    assert.ok(words.includes('尾端标记'));
    assert.ok(words.includes('采用方向：星空'));
    assert.ok(Object.entries(files).some(([k, bytes]) => k.startsWith('ppt/media/') && Buffer.from(bytes).equals(png)));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

for (const [kind, mode] of [['packaging', 'auto'], ['kv', 'collab']]) {
  test(kind + ' exports the ordered outline and the same visible pages as editable PowerPoint', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nightflight-outline-'));
    try {
      const directions = mode === 'collab' ? ['溪水', '晨雾与第一杯茶'.repeat(26)] : ['溪水', '晨雾'];
      const title = '很长的用户提案需求'.repeat(8);
      const finding = '同类产品用多种表达传达泡茶的方式。'.repeat(10) + '最终研究条件';
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
      const artifacts = [];
      for (const [i, direction] of directions.entries()) {
        const name = '主视觉-' + i + '.png';
        await writeFile(join(dir, name), png);
        artifacts.push({ name, stage: 'visual', kind: 'image', visual: {
          role: 'main', direction, candidate: 2, recommended: true, reason: '主形清楚人能辨认。',
        } });
      }
      const rejected = { name: '未选图.png', stage: 'visual', kind: 'image',
        visual: { role: 'main', direction: directions[0], candidate: 1, recommended: false } };
      const brief = '在两个渠道展示产品。'.repeat(90) + '简报末尾的限制条件';
      const result = await runLayout({ dir, project: {
        title, brief, proposalKind: kind, mode, directions, choice: directions[1],
        artifacts: [...artifacts, rejected], attachments: [], research: {
          findings: [{ chapter: '行业与市场', conclusion: finding, evidence: '观察同类产品的正面表达。',
            source: '测试原件', implication: '要让人先认出品牌。' }], gaps: [],
        },
      } });
      const name = suffix => result.artifacts.find(a => a.name.endsWith(suffix)).name;
      const deck = JSON.parse(await readFile(join(dir, name('.deck.json')), 'utf8'));
      const plan = JSON.parse(await readFile(join(dir, name('.outline.json')), 'utf8'));
      assert.equal(plan.kind, kind);
      assert.equal(plan.physical_page_count, deck.pages.length);
      assert.equal(result.pages, plan.physical_page_count);
      assert.equal(deck.pages[0].template, 'cover.type');
      assert.equal(deck.pages[1].template, 'contents.list');
      const visible = mode === 'collab' ? [directions[1]] : directions;
      const heroes = plan.pages.filter(p => p.type_id === (kind === 'kv' ? 'kv-hero' : 'pack-front'));
      assert.deepEqual(heroes.map(p => p.direction), visible);
      assert.deepEqual(heroes.map(p => p.images[0]), visible.map(n => '主视觉-' + directions.indexOf(n) + '.png'));
      assert.ok(plan.gaps.some(g => g.type_id === (kind === 'kv' ? 'kv-primary-use' : 'pack-shelf')));
      assert.ok(deck.status.includes('待补'));
      let next = 1;
      for (const p of plan.pages) {
        assert.equal(p.first_page, next);
        assert.ok(p.last_page >= p.first_page);
        assert.equal(deck.pages[p.first_page - 1].title, p.client_title);
        next = p.last_page + 1;
      }
      const titleSlide = plan.pages.find(p => p.type_id === 'assignment');
      assert.ok(titleSlide.last_page > titleSlide.first_page);
      const files = unzipSync(await readFile(join(dir, name('.pptx'))));
      const slides = Object.keys(files).filter(k => /^ppt\/slides\/slide\d+\.xml$/u.test(k));
      assert.equal(slides.length, deck.pages.length);
      const slideWords = n => [...strFromU8(files['ppt/slides/slide' + n + '.xml']).matchAll(/<a:t>([^<]*)<\/a:t>/gu)].map(m => m[1]).join('');
      const words = deck.pages.map((p, i) => slideWords(i + 1)).join('');
      assert.ok(words.includes('简报末尾的限制条件'));
      assert.ok(words.includes('最终研究条件'));
      assert.ok(deck.pages[0].notes.includes(title));
      assert.ok(heroes.every(h => deck.pages[h.first_page - 1].notes.includes(h.direction)));
      assert.ok(!words.includes('本页要填什么') && !words.includes('未选图'));
      const toc = plan.pages.find(p => p.type_id === 'toc');
      const tocWords = deck.pages.slice(toc.first_page - 1, toc.last_page).map((p, i) => slideWords(toc.first_page + i)).join('');
      for (const { chapter, display_title, start_page } of plan.contents) {
        assert.equal(deck.pages.findIndex(p => p.chapter === chapter) + 1, start_page);
        assert.ok(tocWords.includes(display_title) && tocWords.includes('P' + String(start_page).padStart(2, '0')));
      }
      assert.ok(Object.entries(files).some(([path, data]) => path.startsWith('ppt/media/') && Buffer.from(data).equals(png)));
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
}
