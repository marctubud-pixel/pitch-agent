import type { Box, Chart, Node, TextNode } from './model';
export const FONT = 'PingFang SC';
const ink = '#17243A', muted = '#495970', rule = '#D9E1ED', groupColors = ['#143F9B', '#08746D', '#855214'];
export const show = (value: number) => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value);
type Mark = { x: number; y: number; color: string; id: string; tip: string; };
type RectMark = Box & { color: string; };
export type Plot = {
  box: Box;
  min: number;
  max: number;
  minY: number;
  maxY: number;
  points: Mark[];
  bars: RectMark[];
  labels: Node[];
  valueLabels: TextNode[];
  groupColors: string[];
  rowY: number[];
};
function label(text: string, x: number, y: number, w: number, h: number, size: number, weight = 400, color = ink, align: TextNode['align'] = 'left'): TextNode {
  return {
    kind: 'text',
    x,
    y,
    w,
    h,
    lines: text.split('\n'),
    runs: [],
    align,
    valign: 'middle',
    weight,
    size,
    color,
    face: FONT,
    lh: 1.25,
    ls: 0,
    opacity: 1
  };
}
function line(x1: number, y1: number, x2: number, y2: number): Node {
  return { kind: 'line', x1, y1, x2, y2, color: rule, width: 1, opacity: 1 };
}
export function chartLayout(b: Box, chart: Chart, color: string): Plot {
  const { x, y, w, h } = b, labels: Node[] = [], valueLabels: TextNode[] = [], points: Mark[] = [], bars: RectMark[] = [], rowY: number[] = [];
  if (chart.kind === 'prices') {
    const max = Math.ceil(Math.max(chart.target[1], ...chart.points.map(p => p.value)) / 2) * 2 + 2;
    const plot = { x: x + w * .55, y: y + 53, w: w * .37, h: h - 113 }, full = chart.points.length + chart.groups.length + 1;
    const yy = (v: number) => plot.y + plot.h * (1 - v / full), xx = (v: number) => plot.x + plot.w * v / max;
    labels.push(label(chart.title, x, y, w * .5, 30, 20, 700), label(`题设 ${chart.target[0]}–${chart.target[1]}元 · 不是支付意愿`, x + w * .5, y, w * .5, 28, 16, 500, muted, 'right'));
    labels.push({
      kind: 'rect',
      x: xx(chart.target[0]),
      y: plot.y,
      w: xx(chart.target[1]) - xx(chart.target[0]),
      h: plot.h,
      fill: '#E9EFF9',
      stroke: null,
      radius: 0,
      lw: 0,
      opacity: 1
    });
    for (let v = 0; v <= max; v += 2)labels.push(line(xx(v), plot.y, xx(v), plot.y + plot.h), label(String(v), xx(v) - 20, plot.y - 22, 40, 20, 14, 500, muted, 'center'));
    let row = full;
    chart.groups.forEach((group, gi) => {
      row--;
      labels.push(label(group, x, yy(row) - 11, w * .53, 22, 16, 700, groupColors[gi]));
      for (const p of chart.points.filter(p => p.group === group)) {
        row--;
        const cy = yy(row), cx = xx(p.value);
        rowY.push(row);
        labels.push(label(p.label, x + 12, cy - 12, w * .34, 24, 16), label(p.spec, x + w * .34, cy - 10, w * .2, 20, 14, 400, muted), label(show(p.value), x + w * .924, cy - 12, w * .074, 24, 17, 700, groupColors[gi], 'right'));
        points.push({ id: p.id, x: cx, y: cy, color: groupColors[gi], tip: p.label + ' · ' + p.spec + ' · ' + show(p.value) + '元／瓶' });
      }
    });
    labels.push(label(chart.unknown + '　限量款、促销资格及整箱条件见明细。', x, y + h - 43, w, 34, 16, 500, muted));
    return { box: plot, min: 0, max, minY: 0, maxY: full, labels, valueLabels, points, bars, groupColors, rowY };
  }
  if (!chart.values.length || chart.labels.length !== chart.values.length || !chart.values.every(v => Number.isFinite(v) && v >= chart.min && v <= chart.max) || chart.min >= chart.max) throw new Error('图表数值或坐标轴无效');
  const isBar = chart.kind === 'bar', pad = Math.min(45, w * .065), panelY = y + (h > 550 ? 120 : 24), available = h - (panelY - y) - 70;
  labels.push(label(chart.title, x + pad, panelY, w - 2 * pad, 42, Math.min(26, w / 24), 700));
  const basis = chart.basis.length > 42 ? chart.basis.replace('；', '；\n') : chart.basis;
  labels.push(label(basis, x + pad, panelY + 45, w - 2 * pad, 52, 15, 400, muted));
  const plot = {
    x: x + pad + (isBar ? Math.min(160, w * .23) : 28),
    y: panelY + 128,
    w: w - 2 * pad - (isBar ? Math.min(160, w * .23) + 64 : 55),
    h: Math.max(96, available - 166)
  };
  const xx = (v: number) => plot.x + plot.w * (v - chart.min) / (chart.max - chart.min), yy = (v: number) => plot.y + plot.h * (1 - (v - chart.min) / (chart.max - chart.min));
  for (let i = 0; i <= 4; i++) {
    const v = chart.min + (chart.max - chart.min) * i / 4;
    if (isBar) labels.push(line(xx(v), plot.y, xx(v), plot.y + plot.h), label(show(v), xx(v) - 32, plot.y + plot.h + 6, 64, 22, 14, 400, muted, 'center'));
    else labels.push(line(plot.x, yy(v), plot.x + plot.w, yy(v)), label(show(v), x, yy(v) - 12, plot.x - x - 8, 24, 14, 400, muted, 'right'));
  }
  chart.values.forEach((v, i) => {
    const title = chart.labels[i], value = show(v) + chart.unit;
    if (isBar) {
      const step = plot.h / chart.values.length, cy = plot.y + step * (i + .5);
      bars.push({ x: Math.min(xx(0), xx(v)), y: cy - step * .18, w: Math.abs(xx(v) - xx(0)), h: step * .36, color });
      labels.push(label(title, x + 3, cy - 16, plot.x - x - 15, 32, 16, 500, ink, 'right'));
      valueLabels.push(label(value, xx(v) + 7, cy - 16, 80, 32, 16, 700));
    }
    else {
      const cx = plot.x + plot.w * (i + .5) / chart.values.length, cy = yy(v);
      points.push({ id: chart.id + ':' + i, x: cx, y: cy, color, tip: title + ' ' + value });
      valueLabels.push(label(value, cx - 44, cy - 35, 88, 26, 19, 700, ink, 'center'));
      labels.push(label(title, cx - 78, plot.y + plot.h + 7, 156, 28, 15, 400, muted, 'center'));
    }
  });
  return {
    box: plot,
    min: chart.min,
    max: chart.max,
    minY: chart.min,
    maxY: chart.max,
    labels,
    valueLabels,
    points,
    bars,
    groupColors: [color],
    rowY
  };
}
