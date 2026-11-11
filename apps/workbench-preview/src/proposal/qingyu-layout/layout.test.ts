import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { strFromU8, unzipSync } from 'fflate';
import { qingyuProposal } from '../../services/cases/qingyuFixture';
import { MockWorkbenchService } from '../../services/mock/MockWorkbenchService';
import { memoryStore } from '../../services/mock/storage';
import { resolveQingyuLayout } from './preview';
import { prepareQingyuLayoutDeck, loadLayoutImages } from './assemble';
import { exportDeckStudio } from '../deck-studio';
import { prepareResearchDeck } from '../deck-studio/research';
import { prepareStrategySummary } from '../qingyu-strategy/summary';
import manifest from './manifest.json';
const native = process.env.DECK_STUDIO_CANVAS;
async function source() {
  const service = new MockWorkbenchService({ store: memoryStore(), latency: { read: 0, write: 0 }, autoTick: false });
  return { proposal: structuredClone(qingyuProposal), workspace: await service.getResearchWorkspace('qingyu'), history: await service.getBriefHistory('qingyu') };
}
async function input() { const result = resolveQingyuLayout(await source()); if (result.kind === 'unavailable') throw new Error(result.message); return result.input; }
const localFetch = async (url: string | URL | Request, init?: RequestInit) => {
  init?.signal?.throwIfAborted();
  const u = new URL(typeof url === 'string' || url instanceof URL ? url : url.url);
  if (u.origin !== 'http://localhost' || !['/research-case/', '/visual-concepts/qingyu-20261110/'].some(root => u.pathname.startsWith(root))) throw new Error('No external reads');
  return new Response(readFileSync(new URL('../../../public' + u.pathname, import.meta.url)));
};
beforeEach(() => {
  if (native) createRequire(import.meta.url)('../../../scripts/deck-studio-probe.cjs')(native);
  else vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ measureText: (ch: string) => ({ width: /[ -~]/.test(ch) ? 50 : 100 }) }) }) });
  vi.stubGlobal('fetch', localFetch);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks();
  for (const path of ['../qingyu-strategy/summary.ts?raw', '../qingyu-strategy/intersection-page.ts?raw', '../qingyu-themes/reviewed-copy.json?raw', '../qingyu-visual/concept-images.ts?raw', '../qingyu-report/content-r2.json?raw']) vi.doUnmock(path);
});
describe('Qingyu sealed layout', () => {
  it('binds current and historical without writing source state and refuses identity mismatches', async () => {
    const data = await source(), before = JSON.stringify(data);
    expect(resolveQingyuLayout(data).kind).toBe('current');
    expect(JSON.stringify(data)).toBe(before);
    if (!data.history.current) throw new Error('Missing brief');
    data.history.current = { ...data.history.current, version: 2, id: 'new' };
    expect(resolveQingyuLayout(data).kind).toBe('historical');
    for (const mutation of ['project', 'brief', 'research', 'layout']) {
      const changed = await source();
      if (mutation === 'project') changed.proposal.workbenchId = 'other';
      if (mutation === 'brief') changed.history.versions[0].objectives.push('changed');
      if (mutation === 'research' && changed.workspace.artifact) changed.workspace.artifact.version += 1;
      if (mutation === 'layout') changed.proposal.type = 'kv';
      expect(resolveQingyuLayout(changed).kind).toBe('unavailable');
    }
  });
  it.each([
    ['../qingyu-strategy/summary.ts?raw', '../qingyu-strategy/summary.ts'],
    ['../qingyu-strategy/intersection-page.ts?raw', '../qingyu-strategy/intersection-page.ts'],
    ['../qingyu-themes/reviewed-copy.json?raw', '../qingyu-themes/reviewed-copy.json'],
    ['../qingyu-visual/concept-images.ts?raw', '../qingyu-visual/concept-images.ts'],
    ['../qingyu-report/content-r2.json?raw', '../qingyu-report/content-r2.json'],
  ])('refuses same-ID source drift in %s', async (modulePath, filePath) => {
    const bytes = readFileSync(new URL(filePath, import.meta.url), 'utf8');
    vi.resetModules();
    vi.doMock(modulePath, () => ({ default: bytes + ' ' }));
    const changed = await import('./preview');
    expect(changed.resolveQingyuLayout(await source()).kind).toBe('unavailable');
  });
  it('verifies all six actual PNG identities and rejects missing, corrupted and cancelled assets', async () => {
    const images = await loadLayoutImages(new AbortController().signal);
    expect(images.map(item => item.id)).toEqual(manifest.images.map(item => item.id));
    for (const image of manifest.images) {
      const bytes = readFileSync(new URL('../../../public' + image.path, import.meta.url));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(image.sha256);
      expect(bytes.readUInt32BE(16)).toBe(image.width); expect(bytes.readUInt32BE(20)).toBe(image.height);
    }
    vi.stubGlobal('fetch', async () => new Response('missing', { status: 404 }));
    await expect(loadLayoutImages(new AbortController().signal)).rejects.toThrow(/读取失败/);
    vi.stubGlobal('fetch', async () => new Response(new Uint8Array(24)));
    await expect(loadLayoutImages(new AbortController().signal)).rejects.toThrow(/身份/);
    const ctrl = new AbortController(); ctrl.abort();
    await expect(prepareQingyuLayoutDeck(await input(), ctrl.signal)).rejects.toThrow();
  });
  it('preserves all original pages, exact current copy, image ratios, editable shapes and source closure in the same PPTX', async () => {
    const data = await input(), deck = await prepareQingyuLayoutDeck(data, new AbortController().signal);
    expect(deck.pages).toHaveLength(23);
    const research = await prepareResearchDeck(data.research, new AbortController().signal), strategy = prepareStrategySummary();
    expect(deck.pages.slice(2, 14).map(page => page.id)).toEqual([...research.pages, ...strategy].map(page => page.id));
    for (const [i, page] of deck.pages.entries()) {
      expect(page.nodes.some(node => node.kind === 'text' && node.y >= 686 && node.lines.join('') === String(i + 1).padStart(2, '0'))).toBe(true);
      expect(page.notes).toContain(manifest.id);
    }
    for (const direction of data.themes.preview.bundle.currentRound.directions) {
      const page = deck.pages.find(page => page.id === `qy-${direction.id}-main`);
      const text = page?.nodes.flatMap(node => node.kind === 'text' ? [...node.lines, ...node.runs.map(run => run.text)] : []).join('').replaceAll('\n', '');
      expect(text).toContain(direction.slogan.replaceAll('\n', ''));
      expect(text).toContain(direction.subline);
      expect(page?.nodes.some(node => node.kind === 'image' && node.image.id === `${direction.id}-main`)).toBe(true);
    }
    for (const page of deck.pages) for (const node of page.nodes) if (node.kind === 'image') expect(node.w / node.h).toBeCloseTo(node.image.width / node.image.height, 5);
    const venn = deck.pages[12]; expect(venn.template).toBe('strategy.venn'); expect(venn.nodes.filter(node => node.kind === 'ellipse')).toHaveLength(3);
    const blob = await exportDeckStudio(deck, new AbortController().signal), bytes = new Uint8Array(await blob.arrayBuffer()), zip = unzipSync(bytes), paths = Object.keys(zip);
    expect(paths.filter(path => /^ppt\/slides\/slide\d+\.xml$/.test(path))).toHaveLength(23);
    expect(paths.filter(path => path.endsWith('.xlsx'))).toHaveLength(3);
    expect(paths.filter(path => /^ppt\/charts\/chart\d+\.xml$/.test(path))).toHaveLength(3);
    expect((strFromU8(zip['ppt/slides/slide13.xml']).match(/prst="ellipse"/g) ?? [])).toHaveLength(3);
    const hashes = paths.filter(path => /^ppt\/media\/[^/]+$/.test(path)).map(path => createHash('sha256').update(zip[path]).digest('hex'));
    for (const image of manifest.images) expect(hashes).toContain(image.sha256);
    const notes = paths.filter(path => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(path)).map(path => strFromU8(zip[path])).join('');
    for (const image of manifest.images) expect(notes).toContain(image.sha256);
    for (const source of data.research.report.sources) expect(notes).toContain(source.id);
    if (process.env.QINGYU_LAYOUT_OUTPUT) {
      writeFileSync(process.env.QINGYU_LAYOUT_OUTPUT + '/qingyu-layout.pptx', bytes);
      writeFileSync(process.env.QINGYU_LAYOUT_OUTPUT + '/deck.json', JSON.stringify(deck));
    }
  }, 120000);
});
