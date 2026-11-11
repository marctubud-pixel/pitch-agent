import PptxGenJS from 'pptxgenjs';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { FONT } from './chart-layout';
import type { Box, Deck, Node } from './model';

const hex = (c: string) => c.slice(1);
const inches = (b: Box) => ({ x: b.x / 96, y: b.y / 96, w: b.w / 96, h: b.h / 96 });
function writeNode(p: PptxGenJS, s: PptxGenJS.Slide, n: Node, name: string) {
  switch (n.kind) {
    case 'text': {
      const opts: PptxGenJS.TextPropsOptions = {
        ...inches(n),
        fontFace: n.face,
        fontSize: n.size * .75,
        bold: n.weight >= 600,
        color: hex(n.color),
        margin: 0,
        align: n.align,
        valign: n.valign,
        wrap: false,
        paraSpaceAfter: 0,
        paraSpaceBefore: 0,
        charSpacing: n.ls * .75,
        transparency: Math.round((1 - n.opacity) * 100),
        objectName: name,
        lang: 'zh-CN'
      };
      const max = n.runs.length ? Math.max(...n.runs.map(r => r.size)) : n.size;
      opts.lineSpacing = max * n.lh * .75;
      if (n.runs.length) s.addText(n.runs.filter(r => r.text).map(r => ({ text: r.text, options: { fontFace: r.face, fontSize: r.size * .75, bold: r.weight >= 600, color: hex(r.color) } })), opts);
      else s.addText(n.lines.join('\n'), opts);
      break;
    }
    case 'line': s.addShape(p.ShapeType.line, {
      x: Math.min(n.x1, n.x2) / 96,
      y: Math.min(n.y1, n.y2) / 96,
      w: Math.abs(n.x2 - n.x1) / 96,
      h: Math.abs(n.y2 - n.y1) / 96,
      flipV: (n.x2 - n.x1) * (n.y2 - n.y1) < 0,
      line: { color: hex(n.color), width: n.width * .75, transparency: (1 - n.opacity) * 100 },
      objectName: name
    }); break;
    case 'rect': case 'ellipse': {
      const transparency = (1 - n.opacity) * 100;
      s.addShape(n.kind === 'ellipse' ? p.ShapeType.ellipse : n.radius ? p.ShapeType.roundRect : p.ShapeType.rect, {
        ...inches(n),
        rectRadius: n.radius / 96,
        fill: n.fill ? { color: hex(n.fill), transparency } : { transparency: 100 },
        line: n.stroke ? { color: hex(n.stroke), width: n.lw * .75, transparency } : { transparency: 100 },
        objectName: name
      });
      break;
    }
    case 'image': s.addImage({ ...inches(n), data: n.image.data, altText: n.image.alt, objectName: n.image.id }); break;
    case 'chart': {
      const c = n.chart, plot = n.plot;
      plot.labels.forEach((l, i) => writeNode(p, s, l, c.id + '/label-' + i));
      const top = c.kind === 'line' ? 40 : 0, right = c.kind === 'bar' ? 90 : 0;
      const frame = { x: plot.box.x, y: plot.box.y - top, w: plot.box.w + right, h: plot.box.h + top };
      const options: PptxGenJS.IChartOpts = {
        ...inches(frame),
        layout: { x: 0, y: top / frame.h, w: plot.box.w / frame.w, h: plot.box.h / frame.h },
        objectName: c.id,
        catAxisHidden: true,
        valAxisHidden: true,
        catGridLine: { style: 'none' },
        valGridLine: { style: 'none' },
        showTitle: false,
        showLegend: false,
        chartColors: plot.groupColors.map(hex),
        chartArea: { fill: { color: 'FFFFFF', transparency: 100 } },
        plotArea: { fill: { color: 'FFFFFF', transparency: 100 } },
        valAxisMinVal: plot.minY,
        valAxisMaxVal: plot.maxY,
        showValue: false,
        lang: 'zh-CN',
        catAxisLabelFontFace: FONT,
        valAxisLabelFontFace: FONT
      };
      if (c.kind === 'prices') {
        const series = c.groups.map(group => {
          const values = new Array<number>(c.points.length);
          c.points.forEach((pt, i) => {
            if (pt.group === group) values[i] = plot.rowY[i];
          });
          return { name: group, values };
        });
        s.addChart(p.ChartType.scatter, [{ name: '历史单瓶价（元／瓶）', values: c.points.map(pt => pt.value) }, ...series], {
          ...options,
          barDir: 'col',
          catAxisMinVal: plot.min,
          catAxisMaxVal: plot.max,
          lineSize: 0,
          lineDataSymbol: 'circle',
          lineDataSymbolSize: 8,
          displayBlanksAs: 'gap'
        });
      } else {
        const opt = {
          ...options,
          barDir: c.kind === 'bar' ? 'bar' as const : 'col' as const,
          lineSize: 2.5,
          lineDataSymbol: 'circle' as const,
          lineDataSymbolSize: 8,
          barGapWidthPct: 178,
          showValue: true,
          dataLabelPosition: c.kind === 'bar' ? 'outEnd' as const : 't' as const,
          dataLabelFormatCode: (c.values.some(v => !Number.isInteger(v)) ? '0.0' : '0') + (c.unit ? '"' + c.unit + '"' : ''),
          dataLabelColor: '17243A',
          dataLabelFontFace: FONT,
          dataLabelFontSize: c.kind === 'bar' ? 12 : 14,
          dataLabelFontBold: true
        };
        // PptxGenJS 3.12 emits the valid OOXML maxMin value but omits it in its TS declaration.
        if (c.kind === 'bar') Object.assign(opt, { catAxisOrientation: 'maxMin' });
        s.addChart(c.kind === 'bar' ? p.ChartType.bar : p.ChartType.line, [{ name: c.title, labels: c.labels, values: c.values }], opt);
      }
      break;
    }
  }
}
// PptxGenJS 3.12 writes sparse scatter cells as empty numeric values and adds a stray
// apostrophe to the embedded table range. Keep missing group memberships genuinely blank.
function normalizeChartBooks(bytes: Uint8Array, expected: number) {
  if (!expected) return bytes;
  const files = unzipSync(bytes);
  const charts = Object.keys(files).filter(path => /^ppt\/charts\/chart\d+\.xml$/.test(path));
  if (charts.length !== expected) throw new Error('图表部件身份异常');
  for (const chart of charts) {
    const rel = strFromU8(files[chart.replace('/charts/', '/charts/_rels/') + '.rels']), target = rel.match(/Target="(\.\.\/embeddings\/[^"]+\.xlsx)"/)?.[1];
    if (!target) throw new Error('图表缺少源工作簿');
    const work = 'ppt/' + target.slice(3), xml = strFromU8(files[chart]);
    files[chart] = strToU8(xml.replace(/<c:pt idx="\d+"><c:v><\/c:v><\/c:pt>/g, ''));
    const sheet = unzipSync(files[work]), path = 'xl/worksheets/sheet1.xml', table = 'xl/tables/table1.xml';
    sheet[path] = strToU8(strFromU8(sheet[path]).replace(/<c r="[A-Z]+\d+"><v><\/v><\/c>/g, ''));
    if (sheet[table]) sheet[table] = strToU8(strFromU8(sheet[table]).replace(/(ref="[A-Z]+\d+:[A-Z]+\d+)'"/g, '$1"'));
    files[work] = zipSync(sheet, { level: 1 });
  }
  return zipSync(files, { level: 1 });
}
export async function exportDeckStudio(deck: Deck, signal: AbortSignal): Promise<Blob> {
  signal.throwIfAborted();
  const p = new PptxGenJS();
  p.layout = 'LAYOUT_WIDE';
  p.title = deck.title;
  p.company = '提案工作台';
  p.subject = deck.status + ' · Deck Studio 1.7.0';
  p.theme = { headFontFace: FONT, bodyFontFace: FONT };
  let charts = 0;
  for (const page of deck.pages) {
    signal.throwIfAborted();
    const s = p.addSlide();
    s.background = { color: hex(page.bg) };
    page.nodes.forEach((n, i) => {
      writeNode(p, s, n, page.id + '/' + i);
      if (n.kind === 'chart') charts++;
    });
    s.addNotes(page.notes);
  }
  const result = await p.write({ outputType: 'arraybuffer', compression: true });
  signal.throwIfAborted();
  if (!(result instanceof ArrayBuffer)) throw new Error('PPTX输出格式无效');
  const bytes = normalizeChartBooks(new Uint8Array(result), charts);
  signal.throwIfAborted();
  return new Blob([Uint8Array.from(bytes).buffer], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
}
