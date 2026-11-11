import PptxGenJS from 'pptxgenjs';
import { blockFactIds, blockSourceIds, r3FactIds, r3ById, r3Quantity, type QingyuR3Report, type R3Block, type R3Media } from './report-r3';

const BLUE = '002FA7', INK = '192337', MUTED = '596579';
const FONT = 'Microsoft YaHei';
type LoadedMedia = { media: R3Media; data: string };
export class R3ExportError extends Error {}
export function r3DownloadErrorMessage(error: unknown): string { return error instanceof R3ExportError ? error.message : '调研报告生成失败，请检查网络后重试'; }
function check(signal: AbortSignal) { signal.throwIfAborted(); }
export function imageSignature(bytes: Uint8Array, mime: string): boolean {
  return mime === 'image/png' ? [137,80,78,71,13,10,26,10].every((v, i) => bytes[i] === v) : mime === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
}
export async function loadR3Media(report: QingyuR3Report, signal: AbortSignal): Promise<LoadedMedia[]> {
  return await Promise.all(report.media.map(async media => {
    check(signal);
    const target = new URL(media.path, globalThis.location?.origin ?? 'http://localhost');
    if (target.origin !== (globalThis.location?.origin ?? 'http://localhost') || !target.pathname.startsWith('/research-case/qingyu-r3-20261109/') || target.search || target.hash) throw new R3ExportError('产品图路径未通过同源检查');
    let response: Response;
    try { response = await fetch(target.href, { signal, redirect: 'error', cache: 'no-cache' }); }
    catch { check(signal); throw new R3ExportError('产品图读取失败，请检查网络后重试'); }
    if (!response.ok || new URL(response.url || target.href).origin !== target.origin) throw new R3ExportError(`产品图读取失败：${media.title}`);
    const buffer = await response.arrayBuffer(), bytes = new Uint8Array(buffer);
    check(signal);
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)), v => v.toString(16).padStart(2, '0')).join('');
    if (!imageSignature(bytes, media.mime) || hash !== media.sha256) throw new R3ExportError(`产品图身份核对失败：${media.title}`);
    let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
    return { media, data: `data:${media.mime};base64,${btoa(binary)}` };
  }));
}
function wrapped(text: string, width = 46): string[] {
  return text.split('\n').flatMap(paragraph => { const chars = Array.from(paragraph); const rows: string[] = []; while (chars.length) rows.push(chars.splice(0, width).join('')); return rows.length ? rows : ['']; });
}
function pages<T>(items: T[], size: number): T[][] { const out: T[][] = []; for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size)); return out; }
function factText(report: QingyuR3Report, id: string): string { const f = r3ById(report.facts, id); return `${f.text}${f.quantity ? `：${f.quantity.value}${f.quantity.unit}` : ''}`; }
function sourceText(report: QingyuR3Report, b: R3Block): string { return blockSourceIds(report, b).map(id => JSON.stringify(r3ById(report.sources, id))).join('\n'); }
export function r3ChartScale(values: number[]) {
  const low = Math.min(0, ...values), high = Math.max(1, ...values), span = high - low;
  const rough = span * 1.15 / 5, magnitude = 10 ** Math.floor(Math.log10(rough));
  const steps = [1, 2, 2.5, 5, 10].map(step => step * magnitude);
  const intervalCount = (step: number) => Math.ceil((high + span * .12) / step) - Math.floor(low / step);
  const majorUnit = steps.reduce((best, step) => Math.abs(intervalCount(step) - 5) < Math.abs(intervalCount(best) - 5) ? step : best, magnitude);
  const min = Math.floor(low / majorUnit) * majorUnit, max = Math.ceil((high + span * .12) / majorUnit) * majorUnit;
  const decimals = values.every(Number.isInteger) ? 0 : values.every(value => Math.abs(value * 10 - Math.round(value * 10)) < 1e-8) ? 1 : 2;
  return { min, max, majorUnit, format: decimals === 0 ? '0' : decimals === 1 ? '0.0' : '0.00' };
}
export async function buildQingyuR3Pptx(report: QingyuR3Report, signal: AbortSignal, context: { historical: boolean; latestBriefVersion: number | null } = { historical: false, latestBriefVersion: 1 }): Promise<Blob> {
  check(signal);
  const loaded = await loadR3Media(report, signal);
  check(signal);
  const pptx = new PptxGenJS(); pptx.layout = 'LAYOUT_WIDE'; pptx.author = '提案工作台'; pptx.subject = report.scopeNote; pptx.title = report.title; pptx.company = '青屿虚构任务'; pptx.theme = { headFontFace: FONT, bodyFontFace: FONT };
  let page = 0;
  function slide(title: string, context: string, id: string, notes: string) {
    const s = pptx.addSlide(); page += 1; s.background = { color: 'FFFFFF' };
    s.addText(context, { x: .55, y: .25, w: 12.2, h: .35, fontFace: FONT, fontSize: 11, color: BLUE, objectName: `${id}/context`, margin: 0 });
    s.addText(title, { x: .55, y: .75, w: 12.2, h: .85, fontFace: FONT, fontSize: title.length > 34 ? 24 : 28, bold: true, color: INK, margin: 0, objectName: `${id}/title` });
    s.addText(`青屿 · 公开资料报告修订3 · 研究待补 · 依据任务卡第1版    ${page}`, { x: .55, y: 7.15, w: 12.2, h: .2, fontFace: FONT, fontSize: 10, color: MUTED, objectName: `${id}/footer`, margin: 0 });
    s.addNotes(notes); return s;
  }
  function footer(s: PptxGenJS.Slide, b: R3Block) {
    const publishers = blockSourceIds(report, b).map(id => r3ById(report.sources, id).publisher).join('、');
    const caveat = b.caveat.replace(/[。.!！\s]+$/u, '');
    s.addText(`${b.scope}${b.kind === 'chart' ? ` · 单位${b.unit}` : ''}\n${caveat ? `${caveat}。` : ''}${publishers ? `来源 ${publishers}。` : ''}完整证据、方法与限制见本页备注及来源附录。`, { x: .65, y: 6.48, w: 12, h: .5, fontFace: FONT, fontSize: 10, color: MUTED, margin: 0, objectName: `${b.id}/scope-and-limits` });
  }
  const cover = slide(report.title, '四维研究与结论 · 公开资料报告修订3', 'cover', JSON.stringify({ reportId: report.id, binding: report.binding, origin: report.origin }));
  cover.addText(report.lead, { x: .7, y: 2, w: 11.8, h: 1.3, fontFace: FONT, fontSize: 23, color: BLUE, margin: 0, objectName: 'cover/lead' });
  cover.addText(`${report.scopeNote}\n\n${report.subtitle}\n资料截至 ${report.asOf} · 方法 ${report.origin.skillRevision}`, { x: .7, y: 3.7, w: 11.8, h: 2.6, fontFace: FONT, fontSize: 16, color: INK, margin: 0, objectName: 'cover/scope' });
  if (context.historical) cover.addText(`历史依据：本报告使用保存的任务卡第1版。当前任务卡${context.latestBriefVersion === null ? '尚未取得' : `为第${context.latestBriefVersion}版`}，本文未自动套用到新版任务。`, { x: .7, y: 6.42, w: 11.8, h: .48, fontFace: FONT, fontSize: 12, bold: true, color: BLUE, margin: 0, objectName: 'cover/historical-context' });
  for (const chapter of report.chapters) {
    const chapterNotes = JSON.stringify({ chapter, findings: chapter.findingIds.map(id => r3ById(report.findings, id)), gaps: chapter.gapIds.map(id => r3ById(report.gaps, id)), facts: r3FactIds(report, [], chapter.findingIds).map(id => r3ById(report.facts, id)), sources: report.sources });
    for (const b of chapter.blocks) {
      check(signal);
      const notes = `${chapter.title}：${chapter.headline}\n${chapter.summary}\n范围：${b.scope}\n限制：${b.caveat}\n方法：${b.method}\n${sourceText(report, b)}\n${blockFactIds(report, b).map(id => JSON.stringify(r3ById(report.facts, id))).join('\n')}\n${b.findingIds.map(id => JSON.stringify(r3ById(report.findings, id))).join('\n')}\n${b.gapIds.map(id => JSON.stringify(r3ById(report.gaps, id))).join('\n')}\n${b === chapter.blocks[0] ? chapterNotes : ''}`;
      const context = `${chapter.title} · ${chapter.headline}`;
      if (b.kind === 'chart') {
        const s = slide(b.title, context, b.id, notes);
        const values = b.rows.map(r => r3Quantity(report, r.factId).value), scale = r3ChartScale(values);
        s.addText(`${b.subtitle}\n${r3Quantity(report, b.rows[0]?.factId ?? '').basis}`, { x: .65, y: 1.65, w: 12, h: .55, fontFace: FONT, fontSize: 13, color: MUTED, objectName: `${b.id}/basis`, margin: 0 });
        s.addChart(b.chartType === 'bar' ? pptx.ChartType.bar : pptx.ChartType.line, [{ name: b.unit, labels: b.rows.map(r => r.label), values }], { x: .75, y: 2.35, w: 11.8, h: 3.7, objectName: `${b.id}/chart`, catAxisLabelFontFace: FONT, catAxisLabelFontSize: 14, valAxisLabelFontFace: FONT, valAxisLabelFontSize: 12, valAxisMinVal: scale.min, valAxisMaxVal: scale.max, valAxisMajorUnit: scale.majorUnit, valGridLine: { color: 'E1E6EE', size: .6 }, catGridLine: { style: 'none' }, catAxisLineColor: 'BBC4D1', valAxisLineColor: 'BBC4D1', chartColors: [BLUE], showLegend: false, showValue: true, dataLabelPosition: b.chartType === 'bar' ? 'outEnd' : 't', dataLabelFormatCode: scale.format, valAxisLabelFormatCode: '0.##', barDir: 'bar', showTitle: false });
        footer(s, b);
      } else if (b.kind === 'cards') {
        const entries = b.items.map(item => ({ label: item.label, body: [ ...item.factIds.map(id => factText(report, id)), ...item.findingIds.map(id => { const f = r3ById(report.findings, id); return `${f.title}。${f.text}`; }), ...item.gapIds.map(id => { const g = r3ById(report.gaps, id); return `待补：${g.title}。${g.text} ${g.consequence}`; }) ].join('\n\n') }));
        const useFour = entries.every(e => wrapped(e.body, 22).length <= 5);
        for (const [groupIndex, group] of pages(entries, useFour ? 4 : 2).entries()) {
          const s = slide(b.title + (groupIndex ? '（续）' : ''), context, `${b.id}/${groupIndex}`, `${notes}\n${b.items.flatMap(i => [...i.findingIds.map(id => JSON.stringify(r3ById(report.findings, id))), ...i.gapIds.map(id => JSON.stringify(r3ById(report.gaps, id)))]).join('\n')}`);
          group.forEach((item, i) => {
            const x = .65 + i % 2 * 6.15, y = 1.85 + (useFour ? Math.floor(i / 2) * 2.25 : 0), h = useFour ? 2.2 : 4.35;
            s.addShape(pptx.ShapeType.rect, { x, y, w: 5.85, h, fill: { color: 'EEF3FC' }, line: { color: 'D7E1F4' }, objectName: `${b.id}/card-${groupIndex}-${i}/background` });
            s.addText(item.label, { x: x + .18, y: y + .14, w: 5.49, h: .32, fontFace: FONT, fontSize: 17, bold: true, color: BLUE, margin: 0, objectName: `${b.id}/card-${groupIndex}-${i}/label` });
            if (wrapped(item.body, 22).length > (useFour ? 5 : 13)) throw new R3ExportError(`模块文字超出原生卡片容量：${b.title}`);
            s.addText(item.body, { x: x + .18, y: y + .55, w: 5.49, h: h - .7, fontFace: FONT, fontSize: 16, color: INK, margin: 0, valign: 'top', lineSpacingMultiple: 1.2, objectName: `${b.id}/card-${groupIndex}-${i}/body` });
          });
          footer(s, b);
        }
      } else if (b.kind === 'comparison') {
        for (const [index, group] of pages(b.rows, 4).entries()) {
          const s = slide(b.title + (index ? '（续）' : ''), context, `${b.id}/${index}`, notes);
          const rows: PptxGenJS.TableRow[] = [[{ text: '样本', options: { bold: true, fill: { color: BLUE }, color: 'FFFFFF' } }, ...b.columns.map(text => ({ text, options: { bold: true, fill: { color: BLUE }, color: 'FFFFFF' } }))], ...group.map(row => [{ text: row.label }, ...row.cells.map(cell => ({ text: cell.factIds.map(id => factText(report, id)).join('\n') }))])];
          s.addTable(rows, { x: .65, y: 1.9, w: 12, h: 4.25, colW: [2.6, ...b.columns.map(() => 9.4 / b.columns.length)], rowH: [.55, ...group.map(() => .9)], fontFace: FONT, fontSize: 16, color: INK, border: { type: 'solid', color: 'D7E1F4', pt: 1 }, margin: 8, valign: 'middle', autoPage: false, objectName: `${b.id}/comparison-table-${index}` });
          footer(s, b);
        }
      } else {
        for (const id of b.mediaIds) {
          const image = r3ById(loaded.map(item => ({ id: item.media.id, ...item })), id), m = image.media;
          const observations = b.observations.filter(o => o.mediaId === id).flatMap(o => o.factIds.map(id => factText(report, id)));
          const s = slide(m.title, context, `${b.id}/${id}`, `${notes}\n${JSON.stringify(m)}`), wide = m.width > m.height;
          const box = wide ? { x: .65, y: 1.75, w: 12, h: 4.05 } : { x: .65, y: 1.75, w: 5.3, h: 4.55 };
          const scale = Math.min(box.w / m.width, box.h / m.height), w = m.width * scale, h = m.height * scale;
          s.addImage({ data: image.data, x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h, altText: m.alt, objectName: `${b.id}/${id}/original-image` });
          const caption = `${m.sku} · ${m.capacity}\n${m.identity}\n${observations.join('\n')}${wide ? `\n${b.scope}。${b.caveat}` : ''}`;
          s.addText(caption, { x: wide ? .65 : 6.15, y: wide ? 5.85 : 1.9, w: wide ? 12 : 6.5, h: wide ? 1.05 : 4.4, fontFace: FONT, fontSize: wide ? 11 : 16, color: INK, margin: 0, breakLine: false, objectName: `${b.id}/${id}/identity-observation` });
          if (!wide) footer(s, b);
        }
      }
    }
  }
  type SourceLine = { id: string; text: string; url: string | null };
  const entries = report.sources.flatMap(source => {
    const body = wrapped(`发布日期 ${source.published ?? '未标日期'}。数据期 ${source.dataPeriod}。市场 ${source.market}。对象 ${source.population}。方法 ${source.method}。读取 ${source.access}。定位 ${source.locator}。限制 ${source.limits}`, 62);
    return pages(body, 13).map((part, index): SourceLine[] => [{ id: source.id, text: `${source.id}${index ? '（续）' : ''} · ${source.publisher}《${source.title}》`, url: null }, { id: source.id, text: source.url ?? '任务设定，无公开链接', url: source.url }, ...part.map(text => ({ id: source.id, text, url: null })), { id: source.id, text: '', url: null }]);
  });
  const sourcePages: SourceLine[][] = [];
  for (const entry of entries) {
    const previous = sourcePages.at(-1);
    if (previous && previous.length + entry.length <= 16) previous.push(...entry);
    else sourcePages.push([...entry]);
  }
  sourcePages.forEach((group, index) => {
    const s = slide('来源附录与使用边界', `完整引用 ${index + 1}`, `sources/${index}`, JSON.stringify(report.sources));
    group.forEach((line, i) => s.addText(line.text, { x: .65, y: 1.8 + i * .3, w: 12, h: .28, fontFace: FONT, fontSize: 13, color: line.url ? BLUE : INK, margin: 0, ...(line.url ? { hyperlink: { url: line.url } } : {}), objectName: `sources/${line.id}/${index}/${i}` }));
  });
  check(signal);
  const result = await pptx.write({ outputType: 'blob' });
  check(signal);
  if (!(result instanceof Blob)) throw new R3ExportError('研究报告生成格式异常');
  return result;
}

export function saveR3Blob(blob: Blob, filename: string): void { const href = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = href; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(href), 1000); }
