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
