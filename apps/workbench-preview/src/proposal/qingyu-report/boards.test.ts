import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n';
import { ServiceProvider } from '../../app/services';
import { LocalIntakeService } from '../../services/intake/LocalIntakeService';
import { MockAssistantService } from '../../services/mock/MockAssistantService';
import { MockProposalService } from '../../services/proposal/MockProposalService';
import { MockWorkbenchService } from '../../services/mock/MockWorkbenchService';
import { memoryStore } from '../../services/mock/storage';
import { qingyuR2Report } from './bundle-r2';
import { byId } from './report';
import { BoardSvg, ChapterBoards, chapterBoards, perBottlePrice, SCENE_ASSET, type ResearchBoard } from './ChapterBoards';
import { embedBoardImages, rasterizeBoardSvg, readBoardAsset, type BoardAsset } from './board-export';
import { QingyuR2View } from './QingyuR2View';
import content from './content-r2.json';
import { parseQingyuR2 } from './report-r2';

function report() {
  if (qingyuR2Report.kind !== 'valid') throw new Error(qingyuR2Report.message);
  return structuredClone(qingyuR2Report.report);
}
function boards() { const value = report(); return value.sections.flatMap(section => chapterBoards(value, section)); }
function svg(board: ResearchBoard, value = report()) { return renderToStaticMarkup(createElement(BoardSvg, { report: value, board })); }
function assetBytes(asset: BoardAsset) { return new Uint8Array(readFileSync(new URL(`../../../public${asset.path}`, import.meta.url))); }
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('research board presentation and linked data', () => {
  it('renders six native boards across five collapsed chapters and retains every detailed section', () => {
    const value = report();
    const store = memoryStore(), service = new MockWorkbenchService({ store, latency: { read: 0, write: 0 }, autoTick: false });
    const children = createElement(I18nProvider, { children: createElement(QingyuR2View, { report: value, historical: false, latestBriefVersion: 1 }) });
    const html = renderToStaticMarkup(createElement(ServiceProvider, { service, intake: new LocalIntakeService({ latency: 0 }), assistant: new MockAssistantService(service, store, 0), proposals: new MockProposalService(service, store, { latency: 0 }), children }));
    expect((html.match(/data-board-svg=/g) ?? [])).toHaveLength(6);
    expect((html.match(/data-chapter-analysis=/g) ?? [])).toHaveLength(5);
    expect(html).not.toMatch(/<details[^>]*\bopen(?:=|>)/);
    expect(html).not.toContain('/Users/');
    expect(html).not.toContain('foreignObject');
    for (const section of value.sections) {
      const start = html.indexOf(`data-chapter-analysis="${section.id}"`);
      const end = html.indexOf('</details>', start);
      const details = html.slice(start, end);
      expect(details).toContain(section.headline);
      expect(details).toContain(section.conclusion);
      expect(details).toContain(section.footnote);
    }
    const identity = html.slice(html.indexOf('data-revision-identity="true"'));
    expect(identity).toContain(value.lead);
    expect(identity).toContain(value.scopeNote);
  });

  it('reads chart numbers from datum references even when cached row values differ', () => {
    const value = report();
    byId(value.datums, 'M-GROW').value = -7.25;
    byId(value.datums, 'M-SHARE').value = { '2024': 21, '2025': 31, '2026': 41 };
    const market = chapterBoards(value, byId(value.sections, 'market'))[0];
    const html = svg(market, value);
    expect(html).toContain('-7.25');
    expect(html).toContain('41%');
    expect(html).not.toContain('+12.16');
    expect(html).not.toContain('38.4%');
    expect(html).toContain('0 0 1600 900');
    expect(html).toContain('r3-20261109');
    expect(html).toContain('r4-visual-20261109');
  });

  it('plots twelve separate historical quotes with real pack division and keeps unknown prices off the axis', () => {
    const value = report(), competition = chapterBoards(value, byId(value.sections, 'competition'));
    const board = competition.find(board => board.kind === 'prices');
    if (!board) throw new Error('Price board missing');
    expect(perBottlePrice(value, byId(value.prices, 'CP01'))).toBeCloseTo(34.9 / 15);
    expect(perBottlePrice(value, byId(value.prices, 'CP06'))).toBe(4.2);
    expect(perBottlePrice(value, byId(value.prices, 'PRICE-CM08-UNKNOWN'))).toBeNull();
    const html = svg(board, value);
    expect((html.match(/data-price-point=/g) ?? [])).toHaveLength(12);
    expect(html).not.toContain('data-price-point="PRICE-CM08-UNKNOWN"');
    expect(html).toContain('2.33');
    expect(html).toContain('需15瓶 / 总价34.9元');
    expect(html).toContain('需2瓶 / 总价8.4元');
    expect(html).toContain('味型同价未核');
    expect(html).toContain('限量15万瓶');
    expect(html).toContain('不画为0');
    byId(value.datums, 'CP01-amount').value = 60;
    expect(perBottlePrice(value, byId(value.prices, 'CP01'))).toBe(4);
    expect(svg(board, value)).toContain('总价60元');
  });

  it('keeps all eight original identities separate from the labelled generated scene', () => {
    const value = report(), all = boards();
    const packs = all.find(board => board.kind === 'packs'), people = all.find(board => board.kind === 'people');
    if (!packs || !people) throw new Error('Image boards missing');
    expect(packs.assets).toHaveLength(8);
    expect(packs.assets.every(asset => asset.role === 'original')).toBe(true);
    expect(people.assets).toEqual([SCENE_ASSET]);
    expect(value.imageManifest).toHaveLength(8);
    expect(svg(people)).toContain('生成场景示意 · 非实拍、非调研样本');
    for (const asset of [...packs.assets, ...people.assets]) {
      expect(createHash('sha256').update(assetBytes(asset)).digest('hex')).toBe(asset.sha256);
      if (asset.role === 'original') expect(svg(packs)).toContain(asset.identity);
    }
  });

  it.each(['chart', 'price', 'brief', 'image', 'conclusion-source'])('shows a reading fallback for a missing required %s without hiding the chapter analysis', mutation => {
    const value = report();
    let section = byId(value.sections, 'competition');
    if (mutation === 'chart') { value.charts = value.charts.filter(chart => chart.id !== 'CH-WORK'); section = byId(value.sections, 'people'); }
    if (mutation === 'price') value.prices = value.prices.filter(price => price.id !== 'CP16');
    if (mutation === 'brief') { value.datums = value.datums.filter(datum => datum.id !== 'B-GIVEN'); section = byId(value.sections, 'product'); }
    if (mutation === 'image') section.caseIds = section.caseIds.filter(id => id !== 'CASE-CM02');
    if (mutation === 'conclusion-source') { value.sources = value.sources.filter(source => source.id !== 'PS04'); section = byId(value.sections, 'conclusion'); }
    const html = renderToStaticMarkup(createElement(ChapterBoards, { report: value, section, onInspect: () => {} }));
    expect(html).toContain('本章图版资料未齐，可展开完整分析');
    expect(html).not.toMatch(/下载PNG|下载SVG|重试.*导出/);
    expect(html).not.toContain('<svg');
  });

  it('shows human-readable short sources while keeping machine identities in metadata', () => {
    for (const board of boards()) {
      const markup = svg(board);
      const visibleText = [...markup.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map(match => match[1].replace(/<[^>]*>/g, '')).join(' ');
      expect(visibleText).not.toMatch(/\b(?:CM\d|CS\d|M-S\d|FS\d|G-[A-Z]|QINGYU|metadata|SHA)/);
      expect(visibleText).toContain('来源');
      if (board.kind === 'packs') { expect(visibleText).toContain('农夫山泉2025年报'); expect(visibleText).toContain('FBIF品牌投稿'); }
      if (board.kind === 'conclusion') expect(visibleText).toContain('Ipsos益普索');
    }
  });

  it.each(['extra-case', 'extra-price'])('preserves the full report when a parser-valid %s exceeds the authored board set', mutation => {
    const original = structuredClone(content);
    const input = { ...original, sections: original.sections.map(section => { const caseIds: string[] = [...section.caseIds]; return { ...section, caseIds }; }) };
    if (mutation === 'extra-case') {
      input.imageManifest.push({ ...input.imageManifest[0], id: 'CM09', caseId: 'CASE-CM09' });
      input.cases.push({ ...input.cases[0], id: 'CASE-CM09', imageId: 'CM09', title: '额外合法包装样本' });
      input.sections = input.sections.map(section => section.id === 'competition' ? { ...section, caseIds: [...section.caseIds, 'CASE-CM09'] } : section);
    } else input.prices.push({ ...input.prices[0], id: 'CP-EXTRA' });
    const parsed = parseQingyuR2(input);
    if (parsed.kind !== 'valid') throw new Error(parsed.message);
    const store = memoryStore(), service = new MockWorkbenchService({ store, latency: { read: 0, write: 0 }, autoTick: false });
    const children = createElement(I18nProvider, { children: createElement(QingyuR2View, { report: parsed.report, historical: false, latestBriefVersion: 1 }) });
    const html = renderToStaticMarkup(createElement(ServiceProvider, { service, intake: new LocalIntakeService({ latency: 0 }), assistant: new MockAssistantService(service, store, 0), proposals: new MockProposalService(service, store, { latency: 0 }), children }));
    expect(html).toContain('本章图版资料未齐，可展开完整分析');
    expect(html).not.toContain('data-board-svg="04-packs"');
    expect(html).toContain('data-chapter-analysis="competition"');
    if (mutation === 'extra-case') expect(html).toContain('额外合法包装样本');
    else expect(html).toContain('data-price-quote="CP-EXTRA"');
  });
});

describe('self-contained SVG export boundary', () => {
  it('embeds the actual local assets with matching SHA and leaves no external drawing resources', async () => {
    for (const board of boards().filter(board => board.assets.length > 0)) {
      const output = await embedBoardImages({ markup: svg(board), assets: board.assets, readAsset: asset => readBoardAsset(asset, async () => new Response(assetBytes(asset))) });
      expect(output).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect((output.match(/href="data:image\//g) ?? [])).toHaveLength(board.assets.length);
      expect(output).not.toMatch(/href="(?:\/|https?:)/);
      expect(output).not.toContain('foreignObject');
      expect(output).toContain('sourceDataSHA256');
    }
  });

  it('rejects missing, substituted or unlisted drawing images before producing a file', async () => {
    const board = boards().find(board => board.kind === 'people');
    if (!board) throw new Error('People board missing');
    const markup = svg(board), loader = vi.fn(async () => 'data:image/png;base64,AQID');
    await expect(embedBoardImages({ markup: markup.replace(`href="${SCENE_ASSET.path}"`, 'href="https://outside.example/image.png"'), assets: board.assets, readAsset: loader })).rejects.toThrow('身份清单不一致');
    await expect(embedBoardImages({ markup: markup.replace(/<image\b[^>]*>(?:<\/image>)?/, ''), assets: board.assets, readAsset: loader })).rejects.toThrow('图片尚未载入');
    await expect(embedBoardImages({ markup, assets: [], readAsset: loader })).rejects.toThrow('身份清单不一致');
    expect(loader).not.toHaveBeenCalled();
    await expect(embedBoardImages({ markup: markup.replace('</svg>', '<script>alert(1)</script></svg>'), assets: board.assets, readAsset: loader })).rejects.toThrow('不能安全导出');
  });

  it('fails explicitly for HTTP failure, corrupt bytes and disallowed local paths', async () => {
    await expect(readBoardAsset(SCENE_ASSET, async () => new Response(null, { status: 404 }))).rejects.toThrow('HTTP 404');
    await expect(readBoardAsset(SCENE_ASSET, async () => new Response('wrong image bytes'))).rejects.toThrow('完整性校验失败');
    const fetcher = vi.fn();
    await expect(readBoardAsset({ ...SCENE_ASSET, path: '/research-case/../secrets.png' }, fetcher)).rejects.toThrow('本地图版清单');
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('PNG browser API failure boundaries', () => {
  function browser({ decode = true, context = true, blob = true, draw = true } = {}) {
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-svg');
    vi.stubGlobal('Image', class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => decode ? this.onload?.() : this.onerror?.()); }
    });
    const drawImage = vi.fn(() => { if (!draw) throw new Error('Canvas drawing failed'); });
    const canvas = { width: 0, height: 0, getContext: () => context ? { fillStyle: '', fillRect: vi.fn(), drawImage } : null, toBlob: (callback: BlobCallback) => callback(blob ? new Blob(['png'], { type: 'image/png' }) : null) };
    vi.stubGlobal('document', { createElement: () => canvas });
    return { revoke, canvas, drawImage };
  }
  it('uses a fixed 1920 by 1080 canvas and releases the intermediate URL', async () => {
    const boundary = browser();
    expect((await rasterizeBoardSvg('<svg/>')).type).toBe('image/png');
    expect(boundary.canvas.width).toBe(1920);
    expect(boundary.canvas.height).toBe(1080);
    expect(boundary.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1920, 1080);
    expect(boundary.revoke).toHaveBeenCalledWith('blob:test-svg');
  });
  it.each([
    { options: { decode: false }, message: 'SVG解码失败' },
    { options: { context: false }, message: '无法建立PNG画布' },
    { options: { blob: false }, message: 'PNG文件生成失败' },
    { options: { draw: false }, message: 'Canvas drawing failed' },
  ])('returns no partial blob on $message and releases the URL', async ({ options, message }) => {
    const boundary = browser(options);
    await expect(rasterizeBoardSvg('<svg/>')).rejects.toThrow(message);
    expect(boundary.revoke).toHaveBeenCalledWith('blob:test-svg');
  });
});
