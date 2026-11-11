import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { strFromU8, unzipSync } from 'fflate';
import { qingyuR2Report } from '../qingyu-report/bundle-r2';
import { qingyuR4Report } from '../qingyu-report/bundle-r4';
import { northline } from '../../services/proposal/fixtures/northline';
import { prepareResearchDeck, prepareProposalDeck, priceSnapshot, exportDeckStudio, type Deck } from './index';
import { compile, checkedNodes } from './engine';
import type { Chart, Draft, Media } from './model';

function input() {
  if (qingyuR4Report.kind !== 'valid' || qingyuR2Report.kind !== 'valid') throw new Error('Fixture invalid');
  return { report: qingyuR4Report.report, prices: qingyuR2Report.report, historical: false, latestBriefVersion: 1 };
}
const ctrl = () => new AbortController();
const native = process.env.DECK_STUDIO_CANVAS, output = process.env.DECK_STUDIO_OUTPUT;
const theme = { primary: '#002FA7', accent: '#112233', style: 'business', mode: 'light' } as const;
function run(t: Draft['template']) {
  return compile([{ id: 'test', template: t, notes: '', caption: '', chapter: 'test', title: '测试图版', eyebrow: '' }], '本地', theme)[0];
}
const chart: Chart = { kind: 'bar', id: 'charted', title: '计数', basis: '', unit: '', min: 0, max: 2, labels: ['甲', '乙'], values: [1, 2] };
const image: Media = { id: 'image', width: 2, height: 1, alt: '原图', data: 'data:image/png;base64,abc' };
beforeEach(() => {
  if (native) createRequire(import.meta.url)('../../../scripts/deck-studio-probe.cjs')(native);
  else {
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ measureText: (ch: string) => ({ width: /[ -~]/.test(ch) ? 50 : 100 }) }) }) });
    vi.stubGlobal('fetch', async (url: string) => new Response(readFileSync(new URL('../../../public' + new URL(url).pathname, import.meta.url))));
  }
});
afterEach(() => vi.unstubAllGlobals());
async function artifact(deck: Deck) {
  const b = await exportDeckStudio(deck, ctrl().signal), bytes = new Uint8Array(await b.arrayBuffer());
  if (output) writeFileSync(join(output, deck.style + '.pptx'), bytes);
  return unzipSync(bytes);
}
describe('shared measured Deck Studio plans', () => {
  it('rejects silently truncated layouts and checks rich number/unit runs', () => {
    const stat = { value: '12.16', unit: '%', label: '销售额同比' }, t = { kind: 'data.hero', stats: [stat], chart, sub: '' } as const;
    expect(() => run({ ...t, stats: [] })).toThrow(/可容纳/);
    expect(() => run({ ...t, stats: Array(5).fill(stat) })).toThrow(/可容纳/);
    expect(run({ ...t, stats: Array(4).fill(stat) }).nodes.filter(n => n.kind === 'text' && n.runs.length)).toHaveLength(4);
    for (const length of [0, 1, 7]) expect(() => run({ kind: 'compare.lineup', items: Array(length).fill({ name: '样品', desc: '', image }), sub: '' })).toThrow(/可容纳/);
  });
  it('replaces only the complete image bind and refuses missing, duplicate or unknown output', () => {
    const p = run({ kind: 'combo.grid', items: [{ item: image, cap: '原图' }, { item: chart, cap: '实际计数' }] });
    expect(p.nodes.filter(n => n.kind === 'image' || n.kind === 'chart').map(n => [n.kind, n.bind])).toEqual([['image', 'items.0.img'], ['chart', 'items.1.img']]);
    const shape = { k: 'image', id: 'charted', bind: 'img', x: 0, y: 0, w: 10, h: 10 };
    for (const els of [[], [shape, shape], [{ ...shape, bind: 'other' }], [{ k: 'unrecognized' }]]) expect(() => checkedNodes({ bg: '#FFFFFF', th: { text: '#111111' }, els }, new Map([['img', chart]]), '#002FA7')).toThrow();
  });
  it('keeps exact prices, original quantities, quote conditions and the unknown SKU', () => {
    const a = priceSnapshot(input().prices);
    expect(a.chart.points).toHaveLength(12);
    expect(a.chart.groups.map(g => a.chart.points.filter(p => p.group === g).length)).toEqual([6, 2, 4]);
    expect(a.chart.points.find(p => p.id === 'CP01')?.value).toBe(34.9 / 15);
    expect(a.chart.points.find(p => p.id === 'CP06')?.value).toBe(8.4 / 2);
    expect(a.records.find(r => r.quote.kind === 'unknown')?.perBottle).toBeNull();
    expect(a.chart.points.every(pt => pt.value > 0)).toBe(true);
  });
  it('exports the research source identities, native chart ranges, repeated scatter and exact images', async () => {
    const data = input(), deck = await prepareResearchDeck(data, ctrl().signal);
    const pack = deck.pages.find(p => p.template === 'compare.lineup');
    expect(pack?.nodes.filter(n => n.kind === 'image').map(n => n.image.id)).toEqual(['C-A01', 'C-A02', 'C-A03', 'C-A04']);
    const notes = deck.pages.map(p => p.notes).join('');
    for (const item of [...data.report.sources, ...data.report.facts, ...data.report.findings, ...data.report.gaps]) expect(notes).toContain(JSON.stringify(item));
    const zip = await artifact(deck);
    const files = Object.keys(zip), charts = files.filter(f => /^ppt\/charts\/chart\d+\.xml$/.test(f)), books = files.filter(f => f.endsWith('.xlsx'));
    expect(charts).toHaveLength(3);
    expect(books).toHaveLength(3);
    const scatter = charts.map(path => strFromU8(zip[path])).find(x => x.includes('<c:scatterChart>'));
    expect(scatter).toBeDefined();
    const series = scatter?.match(/<c:ser>[\s\S]*?<\/c:ser>/g) ?? [];
    expect(series.map(s => (s.match(/<c:yVal>([\s\S]*?)<\/c:yVal>/)?.[1].match(/<c:pt idx=/g) ?? []).length)).toEqual([6, 2, 4]);
    expect(scatter).toContain('<c:v>' + 34.9 / 15 + '</c:v>');
    expect(scatter).toContain('<c:v>4.2</c:v>');
    const sha = files.filter(f => /^ppt\/media\/[^/]+$/.test(f)).map(f => createHash('sha256').update(zip[f]).digest('hex'));
    expect(data.report.media.every(m => sha.includes(m.sha256))).toBe(true);
    // The library numbers charts globally, so a second export must resolve its own relationships.
    expect((await exportDeckStudio(deck, ctrl().signal)).size).toBeGreaterThan(1000);
  }, 30000);
  it('refuses incomplete media, stale data and cancellation', async () => {
    const b = ctrl();
    b.abort();
    await expect(prepareResearchDeck(input(), b.signal)).rejects.toThrow();
    const bad = structuredClone(input());
    bad.report.facts[0].sourceIds = ['foreign'];
    await expect(prepareResearchDeck(bad, ctrl().signal)).rejects.toThrow(/完整性/);
    vi.stubGlobal('fetch', async () => new Response('bad'));
    await expect(prepareResearchDeck(input(), ctrl().signal)).rejects.toThrow(/图片身份/);
  });
  it('blocks future/empty layouts and unauthorized style identities before rendering', async () => {
    const p = structuredClone(northline);
    if (!p.layout) throw new Error('Missing fixture');
    const st = p.layout.styles[0];
    await expect(prepareProposalDeck(p, { ...st, name: 'foreign' }, ctrl().signal)).rejects.toMatchObject({ code: 'style' });
    p.stages.layout.status = 'not_started';
    await expect(prepareProposalDeck(p, st, ctrl().signal)).rejects.toMatchObject({ code: 'not-ready' });
    p.layout = null;
    await expect(prepareProposalDeck(p, st, ctrl().signal)).rejects.toMatchObject({ code: 'not-ready' });
  });
  it.skipIf(!native)('exports the complete sixteen-page engineering case in each supplied style', async () => {
    const p = northline;
    if (!p.layout) throw new Error('Missing layout');
    for (const st of p.layout.styles) {
      const deck = await prepareProposalDeck(p, st, ctrl().signal);
      expect(deck.style).toBe(st.id);
      expect(deck.pages.map(s => s.id)).toEqual(p.layout.slides.map(s => s.id));
      expect(deck.status).toContain('待人工终审');
      const zip = await artifact(deck);
      expect(Object.keys(zip).filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f))).toHaveLength(16);
      expect(Object.keys(zip).filter(f => f.endsWith('.xlsx'))).toHaveLength(1);
      const chart = Object.keys(zip).find(f => /^ppt\/charts\/chart\d+\.xml$/.test(f));
      expect(strFromU8(zip[chart ?? ''])).toContain('<c:v>9</c:v>');
    }
  }, 90000);
});
