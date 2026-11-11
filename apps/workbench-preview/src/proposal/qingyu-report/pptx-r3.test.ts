import { unzipSync, strFromU8 } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildQingyuR3Pptx, imageSignature, loadR3Media, r3ChartScale, R3ExportError, r3DownloadErrorMessage } from './pptx-r3';
import { r3TestFixture } from './r3.test-fixture';
import { qingyuR3Report } from './bundle-r3';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

afterEach(() => vi.unstubAllGlobals());
describe('native R3 research PPTX', () => {
  it('exports the actual frozen 21 modules with all original images and native data charts', async () => {
    if (qingyuR3Report.kind !== 'valid') throw new Error(qingyuR3Report.message);
    const report = qingyuR3Report.report;
    vi.stubGlobal('fetch', vi.fn(async (input: string) => new Response(readFileSync(new URL(`../../../public${new URL(input).pathname}`, import.meta.url)))));
    const blob = await buildQingyuR3Pptx(report, new AbortController().signal), bytes = new Uint8Array(await blob.arrayBuffer()), zip = unzipSync(bytes);
    if (process.env.QY_R3_EXPORT_EVIDENCE) writeFileSync(process.env.QY_R3_EXPORT_EVIDENCE, bytes);
    const slideFiles = Object.entries(zip).filter(([path]) => /^ppt\/slides\/slide\d+\.xml$/.test(path)), slides = slideFiles.map(([, data]) => strFromU8(data)).join('');
    expect(slideFiles.length).toBeLessThanOrEqual(35);
    for (const chapter of report.chapters) for (const block of chapter.blocks) expect(slides).toContain(`${block.id}/`);
    expect(slides).toContain('70.8%');
    expect(slides).toContain('C02/comparison-table');
    expect((slides.match(/name="S01\/card-\d+-\d+\/background"/g) ?? [])).toHaveLength(4);
    expect((slides.match(/name="S01\/card-\d+-\d+\/body"/g) ?? [])).toHaveLength(4);
    expect(slides.includes('/text-0')).toBe(false);
    const charts = Object.entries(zip).filter(([path]) => /^ppt\/charts\/chart\d+\.xml$/.test(path));
    expect(charts).toHaveLength(report.chapters.flatMap(c => c.blocks).filter(b => b.kind === 'chart').length);
    for (const [, data] of charts) { const xml = strFromU8(data); expect(xml.includes('<c:majorUnit')).toBe(true); expect(xml.includes('E1E6EE')).toBe(true); }
    expect(Object.keys(zip).filter(path => path.endsWith('.xlsx'))).toHaveLength(charts.length);
    const hashes = Object.entries(zip).filter(([path]) => /^ppt\/media\//.test(path)).map(([, bytes]) => createHash('sha256').update(bytes).digest('hex'));
    for (const media of report.media) expect(hashes).toContain(media.sha256);
    expect((slides.match(/original-image/g) ?? [])).toHaveLength(4);
    const notes = Object.entries(zip).filter(([path]) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(path)).map(([, data]) => strFromU8(data)).join('').replaceAll('&quot;', '"').replaceAll('&amp;', '&');
    for (const id of ['C-RANG-REASON', 'C-INIKIN-REASON', 'C-CHUN-REASON']) {
      const fact = report.facts.find(f => f.id === id); if (!fact) throw new Error('Real source fact required');
      expect(notes).toContain(`"id":"${id}"`); expect(notes).toContain(fact.text); expect(notes).toContain(fact.locator); expect(notes).toContain(fact.limits);
    }
    for (const id of ['FP-IDENTITY', 'FS-INPUT']) {
      const finding = report.findings.find(f => f.id === id); if (!finding) throw new Error('Chapter finding required');
      expect(notes).toContain(finding.text); expect(notes).toContain(finding.scope); expect(notes).toContain(finding.limits);
    }
    for (const media of report.media) { expect(notes).toContain(media.limits); expect(slides).not.toContain(media.limits); }
    expect(slides).not.toContain('来源 。'); expect(slides).not.toContain('。。');
    for (const source of report.sources) {
      const url = source.url;
      if (!url) continue;
      const sourceSlide = slideFiles.find(([, data]) => strFromU8(data).includes(`<a:t>${url.replaceAll('&', '&amp;')}</a:t>`));
      expect(sourceSlide, `Complete URL text for ${source.id}`).toBeDefined();
      const path = sourceSlide?.[0]; if (!path) throw new Error('Source slide required');
      const relPath = path.replace('/slides/', '/slides/_rels/') + '.rels', rels = zip[relPath];
      if (!rels) throw new Error('Source URL relationships required');
      expect(strFromU8(rels)).toContain(url.replaceAll('&', '&amp;'));
    }
  });
  it.each([[12.16], [18, 25, 30], [51, 11], [70.8], [-7.5, 2.5]])('keeps a readable nice major scale and label headroom for %j', (...values) => {
    const scale = r3ChartScale(values), intervals = (scale.max - scale.min) / scale.majorUnit;
    expect(intervals).toBeGreaterThanOrEqual(4); expect(intervals).toBeLessThanOrEqual(6);
    expect(scale.max).toBeGreaterThan(Math.max(...values)); expect(scale.min).toBeLessThanOrEqual(Math.min(0, ...values));
  });
  it('uses numeric formats without trailing decimal dots while keeping workbook precision', () => {
    expect(r3ChartScale([18, 51]).format).toBe('0'); expect(r3ChartScale([18.2, 70.8]).format).toBe('0.0'); expect(r3ChartScale([12.16, 70.8]).format).toBe('0.00');
  });
  it('exports editable chart caches and embedded workbooks with canonical changed values', async () => {
    const report = r3TestFixture(); const f = report.facts[0]; if (!f?.quantity) throw new Error('Fixture numeric fact'); f.quantity.value = 91.75;
    const blob = await buildQingyuR3Pptx(report, new AbortController().signal), zip = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    const charts = Object.entries(zip).filter(([path]) => /^ppt\/charts\/chart\d+\.xml$/.test(path));
    expect(charts).toHaveLength(1); expect(strFromU8(charts[0]![1])).toContain('<c:v>91.75</c:v>');
    expect(strFromU8(charts[0]![1])).toContain('<c:externalData');
    const books = Object.entries(zip).filter(([path]) => path.endsWith('.xlsx')); expect(books).toHaveLength(1);
    const xlsx = unzipSync(books[0]![1]); expect(Object.entries(xlsx).filter(([p]) => p.startsWith('xl/worksheets/')).map(([, v]) => strFromU8(v)).join('')).toContain('91.75');
    const slides = Object.entries(zip).filter(([path]) => /^ppt\/slides\/slide\d+\.xml$/.test(path)).map(([, v]) => strFromU8(v)).join('');
    expect(slides).toContain('fixture-chart/chart'); expect(slides).toContain('market-fixture-card'); expect(slides).toContain('<a:t>'); expect(slides).not.toContain('<p:pic>');
    const notes = Object.entries(zip).filter(([p]) => p.startsWith('ppt/notesSlides/notesSlide') && p.endsWith('.xml')).map(([, v]) => strFromU8(v)).join('');
    expect(notes).toContain('https://example.com/test'); expect(notes).toContain('非业务事实');
  });
  it('rejects cancellation before generation', async () => { const controller = new AbortController(); controller.abort(); await expect(buildQingyuR3Pptx(r3TestFixture(), controller.signal)).rejects.toThrow(); });
  it('keeps the old brief and current brief visible in a historical download', async () => {
    const blob = await buildQingyuR3Pptx(r3TestFixture(), new AbortController().signal, { historical: true, latestBriefVersion: 2 });
    const zip = unzipSync(new Uint8Array(await blob.arrayBuffer())), cover = strFromU8(zip['ppt/slides/slide1.xml']!);
    expect(cover).toContain('保存的任务卡第1版'); expect(cover).toContain('当前任务卡为第2版'); expect(cover).toContain('未自动套用到新版任务');
  });
  it('cancels a report while its required original image is still loading', async () => {
    if (qingyuR3Report.kind !== 'valid') throw new Error(qingyuR3Report.message);
    vi.stubGlobal('fetch', vi.fn((_input: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => { init.signal?.addEventListener('abort', () => reject(new DOMException('任务已取消', 'AbortError')), { once: true }); })));
    const controller = new AbortController(), result = buildQingyuR3Pptx(qingyuR3Report.report, controller.signal);
    controller.abort(); await expect(result).rejects.toHaveProperty('name', 'AbortError');
  });
  it('localizes an ordinary fetch TypeError and preserves defined Chinese resource errors', async () => {
    expect(r3DownloadErrorMessage(new TypeError('Failed to fetch'))).toBe('调研报告生成失败，请检查网络后重试');
    expect(r3DownloadErrorMessage(new R3ExportError('产品图身份核对失败：测试图'))).toBe('产品图身份核对失败：测试图');
    if (qingyuR3Report.kind !== 'valid') throw new Error(qingyuR3Report.message);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(buildQingyuR3Pptx(qingyuR3Report.report, new AbortController().signal)).rejects.toThrow('产品图读取失败，请检查网络后重试');
  });
  it('rejects HTML and altered media rather than writing a partial report', async () => {
    const report = r3TestFixture(); report.media.push({ id: 'fixture-image', path: '/research-case/qingyu-r3-20261109/test.png', sha256: 'a'.repeat(64), mime: 'image/png', width: 1, height: 1, title: '测试图', sku: '测试款', capacity: '测试规格', sourceId: 'source-fixture', sourceUrl: 'https://example.com/test', identity: '测试图片', alt: '测试图片', limits: '非业务图', role: 'original-product' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>not a picture</html>')));
    await expect(loadR3Media(report, new AbortController().signal)).rejects.toThrow('产品图身份核对失败');
    await expect(buildQingyuR3Pptx(report, new AbortController().signal)).rejects.toThrow('产品图身份核对失败');
    expect(imageSignature(new Uint8Array([255,216,255]), 'image/jpeg')).toBe(true); expect(imageSignature(new Uint8Array([60,104,116]), 'image/png')).toBe(false);
  });
});
