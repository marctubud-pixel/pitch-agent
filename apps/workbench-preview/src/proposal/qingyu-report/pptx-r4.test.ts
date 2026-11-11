import { unzipSync, strFromU8 } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { qingyuR4Report } from './bundle-r4';
import { buildQingyuR4Pptx, loadR4Media } from './pptx-r4';
import { r4Charts } from './report-r4';

const report = () => { if (qingyuR4Report.kind !== 'valid') throw new Error(qingyuR4Report.message); return structuredClone(qingyuR4Report.report); };
function realMedia() { vi.stubGlobal('fetch', vi.fn(async (input: string) => new Response(readFileSync(new URL(`../../../public${new URL(input).pathname}`, import.meta.url))))); }
function xml(zip: Record<string, Uint8Array>, path: string) { const bytes = zip[path]; if (!bytes) throw new Error(`Missing ${path}`); return strFromU8(bytes); }
function chartForObject(zip: Record<string, Uint8Array>, slidePath: string, objectName: string) {
  const frame = xml(zip, slidePath).match(/<p:graphicFrame>[\s\S]*?<\/p:graphicFrame>/g)?.find(f => f.includes(`name="${objectName}"`));
  if (!frame) throw new Error(`Missing ${objectName}`);
  const id = frame.match(/<c:chart[^>]*r:id="([^"]+)"/)?.[1]; if (!id) throw new Error('Chart relation missing');
  const relations = xml(zip, slidePath.replace('/slides/', '/slides/_rels/') + '.rels');
  const target = relations.match(new RegExp(`<Relationship[^>]*Id="${id}"[^>]*Target="([^\"]+)"`))?.[1]; if (!target) throw new Error('Chart target missing');
  return new URL(target, `https://local/${slidePath}`).pathname.slice(1);
}
afterEach(() => vi.unstubAllGlobals());
describe('R4 native research delivery', () => {
  it('exports all six boards, canonical charts and five unchanged media with complete notes', async () => {
    realMedia(); const data = report();
    const blob = await buildQingyuR4Pptx(data, new AbortController().signal), bytes = new Uint8Array(await blob.arrayBuffer()), zip = unzipSync(bytes);
    if (process.env.QY_R4_EXPORT_EVIDENCE) writeFileSync(process.env.QY_R4_EXPORT_EVIDENCE, bytes);
    const slideFiles = Object.keys(zip).filter(path => /^ppt\/slides\/slide\d+\.xml$/.test(path));
    expect(slideFiles).toHaveLength(6 + Math.ceil(data.sources.length / 4));
    const slides = slideFiles.map(path => xml(zip, path)).join('');
    for (const b of data.chapters.flatMap(c => c.boards)) expect(slides).toContain(`${b.id}/`);
    expect((slides.match(/\/original-image/g) ?? [])).toHaveLength(4); expect(slides).toContain('/generated-scenario');
    const hashes = Object.entries(zip).filter(([path]) => path.startsWith('ppt/media/')).map(([, b]) => createHash('sha256').update(b).digest('hex'));
    for (const m of data.media) expect(hashes).toContain(m.sha256);
    const charts = data.chapters.flatMap(c => c.boards).flatMap(r4Charts);
    expect(Object.keys(zip).filter(p => /^ppt\/charts\/chart\d+\.xml$/.test(p))).toHaveLength(charts.length);
    expect(Object.keys(zip).filter(p => p.endsWith('.xlsx'))).toHaveLength(charts.length);
    for (const c of charts) {
      const slidePath = slideFiles.find(p => xml(zip, p).includes(`name="${c.id}/chart"`)); if (!slidePath) throw new Error('Chart owner missing');
      const chartPath = chartForObject(zip, slidePath, `${c.id}/chart`), chartXml = xml(zip, chartPath);
      for (const row of c.rows) { const fact = data.facts.find(f => f.id === row.factId); expect(chartXml).toContain(`<c:v>${fact?.quantity?.value}</c:v>`); }
      expect(chartXml).toContain('<c:externalData');
      if (c.kind === 'line') {
        expect(chartXml.match(/<c:catAx>[\s\S]*?<\/c:catAx>/)?.[0]).toContain('<c:axPos val="b"/>');
        expect(chartXml.match(/<c:valAx>[\s\S]*?<\/c:valAx>/)?.[0]).toContain('<c:axPos val="l"/>');
      }
      if (c.kind === 'bar' && c.unit === '%') { expect(chartXml).toContain('<c:min val="0"/>'); expect(chartXml).toContain('<c:max val="100"/>'); expect(slides).toContain('百分比轴 0–100% · 各项独立，不相加'); }
    }
    const notes = Object.keys(zip).filter(p => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(p)).map(p => xml(zip, p)).join('').replaceAll('&quot;', '"').replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>');
    for (const entry of [...data.facts, ...data.findings, ...data.gaps]) { expect(notes).toContain(`"id":"${entry.id}"`); expect(notes.includes(JSON.stringify(entry.text).slice(1, -1)), `完整备注缺少 ${entry.id}`).toBe(true); }
    for (const s of data.sources) { expect(notes).toContain(s.limits); expect(slides).toContain(s.id); if (s.url) expect(slides).toContain(s.url.replaceAll('&', '&amp;')); }
    expect(slides).toContain('生成情境示意'); expect(slides).toContain('168×428');
    expect(xml(zip, 'ppt/slides/slide1.xml')).toContain('单位 %');
    expect(xml(zip, 'ppt/slides/slide1.xml')).toContain('县级以上城市');
    expect(xml(zip, 'ppt/slides/slide5.xml')).toContain('题设面向25至34岁城市办公者');
    const landscape = data.chapters[2]?.boards[0]; if (landscape?.kind !== 'landscape') throw new Error('Landscape required');
    for (const id of landscape.groupFindingIds) expect(xml(zip, 'ppt/slides/slide3.xml')).toContain(`${id}/group`);
  });
  it('locates multiple editable charts on one slide by their own relationship and embedded workbook', async () => {
    realMedia(); const data = report(), market = data.chapters[0]?.boards[0]; if (market?.kind !== 'market') throw new Error('Market required');
    const first = market.charts[0]; if (!first) throw new Error('Chart required');
    const extra = structuredClone(first); extra.id = 'R4-TEST-SECOND-CHART'; extra.kind = 'bar'; market.charts.push(extra);
    const fact = data.facts.find(f => f.id === first.rows[0]?.factId); if (!fact?.quantity) throw new Error('Quantity required'); fact.quantity.value = 91.75;
    const zip = unzipSync(new Uint8Array(await (await buildQingyuR4Pptx(data, new AbortController().signal)).arrayBuffer()));
    const firstPath = chartForObject(zip, 'ppt/slides/slide1.xml', `${first.id}/chart`), secondPath = chartForObject(zip, 'ppt/slides/slide1.xml', `${extra.id}/chart`);
    expect(firstPath).not.toBe(secondPath);
    for (const chartPath of [firstPath, secondPath]) {
      expect(xml(zip, chartPath)).toContain('<c:v>91.75</c:v>');
      const relsPath = chartPath.replace('/charts/', '/charts/_rels/') + '.rels';
      const target = xml(zip, relsPath).match(/Target="([^\"]+\.xlsx)"/)?.[1]; if (!target) throw new Error('Workbook relation missing');
      const bookPath = new URL(target, `https://local/${chartPath}`).pathname.slice(1), book = unzipSync(zip[bookPath]!);
      expect(Object.entries(book).filter(([p]) => p.startsWith('xl/worksheets/')).map(([, b]) => strFromU8(b)).join('')).toContain('91.75');
    }
  });
  it('keeps historical task context on the first page', async () => {
    realMedia(); const zip = unzipSync(new Uint8Array(await (await buildQingyuR4Pptx(report(), new AbortController().signal, { historical: true, latestBriefVersion: 2 })).arrayBuffer()));
    expect(xml(zip, 'ppt/slides/slide1.xml')).toContain('保存的任务卡第1版'); expect(xml(zip, 'ppt/slides/slide1.xml')).toContain('当前任务卡为第2版');
  });
  it('rejects altered media, arbitrary same-origin paths and cancellation instead of emitting a partial report', async () => {
    const data = report(); vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>not a picture</html>')));
    await expect(loadR4Media(data, new AbortController().signal)).rejects.toThrow('图片身份核对失败');
    data.media[0]!.path = '/other-private-file';
    await expect(loadR4Media(data, new AbortController().signal)).rejects.toThrow('图片路径未通过');
    const controller = new AbortController(); controller.abort(); await expect(buildQingyuR4Pptx(report(), controller.signal)).rejects.toHaveProperty('name', 'AbortError');
  });
  it('cancels required-media fetches while the download is pending', async () => {
    vi.stubGlobal('fetch', vi.fn((_input: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => { init.signal?.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true }); })));
    const controller = new AbortController(), result = buildQingyuR4Pptx(report(), controller.signal); controller.abort();
    await expect(result).rejects.toHaveProperty('name', 'AbortError');
  });
});
