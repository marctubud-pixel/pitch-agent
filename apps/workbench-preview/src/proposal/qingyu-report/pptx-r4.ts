import PptxGenJS from 'pptxgenjs';
import { imageSignature, R3ExportError, r3ChartScale } from './pptx-r3';
import { r4BoardEvidence, r4ById, r4ChapterEvidence, r4ChartSeries, r4EvidenceText, r4Quantity, r4MediaIdentityValid, type QingyuR4Report, type R4Board, type R4Chart, type R4Media } from './report-r4';

const BLUE = '002FA7', INK = '111A2A', MUTED = '596579', WASH = 'F1F4FA', RULE = 'DEE3EC', FONT = 'Microsoft YaHei';
type LoadedMedia = { id: string; media: R4Media; data: string };
export async function loadR4Media(report: QingyuR4Report, signal: AbortSignal): Promise<LoadedMedia[]> {
  return Promise.all(report.media.map(async media => {
    signal.throwIfAborted();
    const origin = globalThis.location?.origin ?? 'http://localhost', target = new URL(media.path, origin);
    if (target.origin !== origin || !r4MediaIdentityValid(media) || target.pathname !== media.path || target.search || target.hash) throw new R3ExportError('图片路径未通过逐项同源检查');
    let response: Response;
    try { response = await fetch(target.href, { signal, redirect: 'error', cache: 'no-cache' }); }
    catch { signal.throwIfAborted(); throw new R3ExportError('图片读取失败，请检查网络后重试'); }
    if (!response.ok || (response.url && response.url !== target.href)) throw new R3ExportError(`图片读取失败：${media.title}`);
    const buffer = await response.arrayBuffer(), bytes = new Uint8Array(buffer);
    signal.throwIfAborted();
    const sha = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)), b => b.toString(16).padStart(2, '0')).join('');
    if (!imageSignature(bytes, media.mime) || sha !== media.sha256) throw new R3ExportError(`图片身份核对失败：${media.title}`);
    let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
    return { id: media.id, media, data: `data:${media.mime};base64,${btoa(binary)}` };
  }));
}
function textLines(value: string, size: number, width: number): number { return value.split('\n').reduce((count, line) => count + Math.max(1, Math.ceil(Array.from(line).reduce((w, c) => w + (/[^\u0000-\u00ff]/u.test(c) ? 1 : .53), 0) / (width * 72 / size))), 0); }
function text(s: PptxGenJS.Slide, body: string, id: string, x: number, y: number, w: number, h: number, fontSize = 15, color = INK, bold = false) {
  if (textLines(body, fontSize, w) * fontSize / 72 * 1.25 > h + .08) throw new R3ExportError(`图版文字超出可读容量：${id}。请减少主层文字，完整内容保留在备注。`);
  s.addText(body, { x, y, w, h, fontFace: FONT, fontSize, color, bold, margin: 0, valign: 'top', breakLine: false, paraSpaceAfter: 0, objectName: id });
}
function image(s: PptxGenJS.Slide, item: LoadedMedia, id: string, box: { x: number; y: number; w: number; h: number }) { const scale = Math.min(box.w / item.media.width, box.h / item.media.height), w = item.media.width * scale, h = item.media.height * scale; s.addImage({ data: item.data, x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h, objectName: id, altText: item.media.alt }); }
export async function buildQingyuR4Pptx(report: QingyuR4Report, signal: AbortSignal, context: { historical: boolean; latestBriefVersion: number | null } = { historical: false, latestBriefVersion: 1 }): Promise<Blob> {
  signal.throwIfAborted();
  const loaded = await loadR4Media(report, signal);
  signal.throwIfAborted();
  const pptx = new PptxGenJS(); pptx.layout = 'LAYOUT_WIDE'; pptx.author = '提案工作台'; pptx.subject = report.scopeNote; pptx.title = report.title; pptx.company = '青屿虚构任务'; pptx.theme = { headFontFace: FONT, bodyFontFace: FONT };
  let page = 0;
  function slide(title: string, label: string, id: string, notes: string) {
    const s = pptx.addSlide(); page += 1; s.background = { color: 'FFFFFF' };
    text(s, label, `${id}/context`, .55, .25, 12.2, .24, 11, BLUE);
    text(s, title, `${id}/title`, .55, .74, 12.2, .65, 27, INK, true);
    text(s, `青屿 · 公开资料报告修订4 · 研究待补 · 依据任务卡第1版    ${page}`, `${id}/footer`, .55, 7.14, 12.2, .2, 10, MUTED);
    s.addNotes(notes); return s;
  }
  function chart(s: PptxGenJS.Slide, c: R4Chart, box: { x: number; y: number; w: number; h: number }) {
    const series = r4ChartSeries(report, c), percentBar = c.kind === 'bar' && c.unit === '%', baseScale = r3ChartScale(series.values), scale = percentBar ? { ...baseScale, min: 0, max: 100, majorUnit: 20 } : baseScale;
    text(s, c.title, `${c.id}/title`, box.x, box.y, box.w, .3, 14, INK, true);
    text(s, `${series.basis} · 单位 ${c.unit}`, `${c.id}/basis`, box.x, box.y + .34, box.w, .38, 10.5, MUTED);
    s.addChart(c.kind === 'bar' ? pptx.ChartType.bar : pptx.ChartType.line, [{ name: c.unit, labels: series.labels, values: series.values }], { x: box.x, y: box.y + .78, w: box.w, h: box.h - .78 - (percentBar ? .23 : 0), objectName: `${c.id}/chart`, catAxisLabelFontFace: FONT, catAxisLabelFontSize: 12, valAxisLabelFontFace: FONT, valAxisLabelFontSize: 10, valAxisMinVal: scale.min, valAxisMaxVal: scale.max, valAxisMajorUnit: scale.majorUnit, valGridLine: { color: RULE, size: .6 }, catGridLine: { style: 'none' }, catAxisLineColor: RULE, valAxisLineColor: RULE, chartColors: [BLUE], showLegend: false, showValue: true, dataLabelPosition: c.kind === 'bar' ? 'outEnd' : 't', dataLabelFormatCode: scale.format, valAxisLabelFormatCode: c.kind === 'bar' ? '0' : '0.0', barDir: c.kind === 'bar' ? 'bar' : 'col', showTitle: false });
    if (percentBar) text(s, '百分比轴 0–100% · 各项独立，不相加', `${c.id}/percentage-axis-note`, box.x, box.y + box.h - .2, box.w, .22, 10.5, MUTED);
  }
  function footer(s: PptxGenJS.Slide, b: R4Board) {
    const sources = r4BoardEvidence(report, b).sources.map(s => s.id).join(' / ');
    text(s, `${b.scope}${b.caveat ? ` · ${b.caveat}` : ''}\n来源 ${sources}。完整依据、方法与限制见备注及来源附录。`, `${b.id}/scope-and-sources`, .65, 6.58, 12, .48, 9.5, MUTED);
  }
  for (const [chapterIndex, chapter] of report.chapters.entries()) for (const b of chapter.boards) {
    signal.throwIfAborted();
    const conclusion = r4ById(report.findings, b.conclusionId);
    const notes = JSON.stringify({ report: { id: report.id, binding: report.binding, origin: report.origin, scopeNote: report.scopeNote, subtitle: report.subtitle }, chapter, board: b, evidence: r4BoardEvidence(report, b), chapterEvidence: r4ChapterEvidence(report, chapter), media: b.kind === 'packaging' ? b.samples.map(sample => r4ById(report.media, sample.mediaId)) : b.kind === 'people' ? [r4ById(report.media, b.sceneId)] : [], context });
    const s = slide(b.kind === 'synthesis' ? b.title : conclusion.title, `${chapterIndex === 0 ? `${report.title} · 修订4 · ` : ''}${String(chapterIndex + 1).padStart(2, '0')} / ${chapter.title}${b.kind === 'landscape' || b.kind === 'packaging' ? ` · ${b.title}` : ''}`, b.id, notes);
    if (b.kind !== 'synthesis') text(s, conclusion.text, `${b.id}/conclusion`, .65, 1.48, 12, .58, 14.5, MUTED);
    if (page === 1 && context.historical) text(s, `历史依据：保存的任务卡第1版。当前任务卡${context.latestBriefVersion === null ? '尚未取得' : `为第${context.latestBriefVersion}版`}，本文未自动套用到新版任务。`, 'cover/historical-context', .65, 2.12, 12, .28, 11, BLUE, true);
    switch (b.kind) {
      case 'market': {
        const q = r4Quantity(report, b.heroFactId), hero = r4ById(report.facts, b.heroFactId), start = context.historical ? 2.52 : 2.15;
        text(s, `${q.value}${q.unit}`, `${b.id}/hero-value`, .7, start + .4, 3.2, .95, 53, BLUE, true);
        text(s, hero.text, `${b.id}/hero-fact`, .7, start + 1.6, 3.2, 1.25, 17);
        text(s, q.basis, `${b.id}/hero-basis`, .7, start + 2.95, 3.2, .6, 11, MUTED);
        const height = (6.35 - start) / b.charts.length;
        b.charts.forEach((c, i) => chart(s, c, { x: 4.35, y: start + i * height, w: 8.15, h: height - .08 })); break;
      }
      case 'people': {
        const groupW = 12 / b.groups.length;
        b.groups.forEach((g, i) => { const x = .65 + i * groupW, body = r4EvidenceText(report, g.evidence).join('\n'); text(s, g.label, `${b.id}/group-${i}/label`, x, 2.15, groupW - .25, .24, 12, BLUE, true); text(s, body, `${b.id}/group-${i}/body`, x, 2.5, groupW - .25, .86, 11.5); });
        image(s, r4ById(loaded, b.sceneId), `${b.id}/${b.sceneId}/generated-scenario`, { x: .65, y: 3.5, w: 5.1, h: 2.65 });
        text(s, '生成情境示意 · 非实拍、非研究样本', `${b.id}/scenario-identity`, .65, 6.22, 5.1, .22, 10.5, BLUE);
        chart(s, b.chart, { x: 6.1, y: 3.48, w: 6.55, h: 2.96 }); break;
      }
      case 'landscape': {
        const groupW = 12 / b.groupFindingIds.length;
        b.groupFindingIds.forEach((id, i) => { const g = r4ById(report.findings, id), x = .65 + i * groupW; text(s, g.title, `${b.id}/${id}/group`, x, 2.13, groupW - .2, .24, 12, BLUE, true); text(s, g.text, `${b.id}/${id}/members`, x, 2.48, groupW - .2, .25, 11, MUTED); });
        const rows: PptxGenJS.TableRow[] = [[{ text: '代表品牌', options: { bold: true, fill: { color: WASH }, color: BLUE } }, ...b.columns.map(text => ({ text, options: { bold: true, fill: { color: WASH } } }))], ...b.rows.map(row => [{ text: row.label, options: { bold: true, color: BLUE } }, ...row.cells.map(cell => ({ text: r4EvidenceText(report, cell).join('\n') }))])];
        s.addTable(rows, { x: .65, y: 2.88, w: 12, h: 3.47, colW: [1.6, ...b.columns.map(() => 10.4 / b.columns.length)], rowH: [.34, ...b.rows.map(() => 3.13 / b.rows.length)], fontFace: FONT, fontSize: 11.5, color: INK, border: { type: 'solid', color: RULE, pt: .6 }, margin: 4, valign: 'middle', autoPage: false, objectName: `${b.id}/landscape-table` }); break;
      }
      case 'packaging': {
        b.samples.forEach((sample, i) => {
          const item = r4ById(loaded, sample.mediaId), x = .65 + i % 2 * 6.15, y = 2.1 + Math.floor(i / 2) * 2.14;
          s.addShape(pptx.ShapeType.rect, { x, y, w: 2.2, h: 1.98, fill: { color: 'FFFFFF' }, line: { color: RULE, width: .5 }, objectName: `${b.id}/${sample.mediaId}/image-frame` });
          image(s, item, `${b.id}/${sample.mediaId}/original-image`, { x: x + .05, y: y + .05, w: 2.1, h: 1.88 });
          text(s, item.media.title, `${b.id}/${sample.mediaId}/title`, x + 2.4, y, 3.55, .27, 14, INK, true);
          text(s, item.media.identity, `${b.id}/${sample.mediaId}/identity`, x + 2.4, y + .33, 3.55, .35, 9.5, MUTED);
          const rowH = 1.24 / sample.cells.length;
          sample.cells.forEach((cell, j) => { text(s, `${b.columns[j]}\n${r4EvidenceText(report, cell).join('\n')}`, `${b.id}/${sample.mediaId}/dimension-${j}`, x + 2.4, y + .75 + j * rowH, 3.55, rowH - .03, 11.5); });
        }); break;
      }
      case 'conditions': {
        const rowH = 4.2 / b.items.length;
        b.items.forEach((item, i) => {
          const y = 2.15 + i * rowH;
          s.addShape(pptx.ShapeType.line, { x: .65, y, w: 12, h: 0, line: { color: RULE, width: .7 }, objectName: `${b.id}/condition-${i}/rule` });
          text(s, item.label, `${b.id}/condition-${i}/label`, .75, y + .12, 4.6, .28, 13, BLUE, true);
          text(s, item.briefFactIds.map(id => r4ById(report.facts, id).text).join('\n'), `${b.id}/condition-${i}/brief`, .75, y + .47, 4.6, rowH - .56, 13);
          text(s, '→', `${b.id}/condition-${i}/arrow`, 5.55, y + .3, .4, .5, 23, BLUE);
          text(s, r4EvidenceText(report, { factIds: [], findingIds: item.assessmentFindingIds }).join('\n'), `${b.id}/condition-${i}/assessment`, 6.15, y + .2, 6.3, rowH - .3, 14);
        }); break;
      }
      case 'synthesis': {
        b.links.forEach((link, i) => {
          const y = 2.05 + i * .96, label = { market: '市场', people: '人群', competition: '竞争', product: '本品' }[link.dimension];
          text(s, label, `${b.id}/${link.dimension}/label`, .75, y, .65, .3, 11, MUTED);
          text(s, r4ById(report.findings, link.findingId).title, `${b.id}/${link.dimension}/finding`, 1.55, y, 3.45, .65, 16, INK, true);
          s.addShape(pptx.ShapeType.line, { x: 5.1, y: y + .28, w: .5, h: 0, line: { color: BLUE, width: 1.3, endArrowType: 'triangle' }, objectName: `${b.id}/${link.dimension}/link-to-${b.conclusionId}` });
        });
        s.addShape(pptx.ShapeType.rect, { x: 5.95, y: 1.9, w: 6.65, h: 4.4, fill: { color: WASH }, line: { color: WASH }, objectName: `${b.id}/result-background` });
        text(s, '四维研究形成的问题', `${b.id}/result-label`, 6.2, 2.12, 6.1, .3, 11, BLUE);
        text(s, conclusion.title, `${b.id}/result-title`, 6.2, 2.65, 6.1, .95, 23, BLUE, true);
        text(s, conclusion.text, `${b.id}/result-body`, 6.2, 3.8, 6.1, 1.55, 17);
        text(s, `前提与范围 · ${conclusion.scope}`, `${b.id}/result-conditions`, 6.2, 5.55, 6.1, .65, 11.5, MUTED); break;
      }
    }
    footer(s, b);
  }
  for (let start = 0; start < report.sources.length; start += 4) {
    signal.throwIfAborted();
    const group = report.sources.slice(start, start + 4), id = `sources/${start / 4}`;
    const s = slide('来源附录与适用范围', `完整来源 ${start + 1}至${Math.min(start + 4, report.sources.length)} / ${report.sources.length}`, id, JSON.stringify(report.sources));
    group.forEach((source, i) => {
      const y = 1.65 + i * 1.25;
      text(s, `${source.id} · ${source.publisher}《${source.title}》`, `${id}/${source.id}/title`, .65, y, 12, .38, 13, INK, true);
      const link = source.url ?? '虚构任务设定，无公开链接';
      s.addText(link, { x: .65, y: y + .4, w: 12, h: .3, fontFace: FONT, fontSize: 9.5, color: BLUE, margin: 0, ...(source.url ? { hyperlink: { url: source.url } } : {}), objectName: `${id}/${source.id}/url` });
      text(s, `发布 ${source.published ?? '未标日期'} · 数据期 ${source.dataPeriod}\n对象 ${source.population}。完整方法与限制见备注。`, `${id}/${source.id}/scope`, .65, y + .75, 12, .45, 10.5, MUTED);
    });
  }
  signal.throwIfAborted();
  const result = await pptx.write({ outputType: 'blob' });
  signal.throwIfAborted();
  if (!(result instanceof Blob)) throw new R3ExportError('研究报告生成格式异常');
  return result;
}
