export type Metric = { kind: 'known'; value: number } | { kind: 'unknown'; reason: string };
export type FigureOrigin = { kind: 'project'; note: string; claimIds: string[]; sourceIds: string[] } | { kind: 'sample'; note: string };
type FigureBase = { id: string; title: string; description: string; origin: FigureOrigin };
type Point = { label: string; x: number; y: number };
export type ResearchFigure = FigureBase & (
  | { kind: 'scopes'; unit: string; scopes: [{ label: string; value: number }, { label: string; value: number }, { label: string; value: number }] }
  | { kind: 'trend'; unit: string; points: { year: number; value: number }[]; forecastFrom: number; max: number }
  | { kind: 'bubbles'; xLabel: string; yLabel: string; xMax: number; yMax: number; sizeUnit: string; points: (Point & { size: number })[] }
  | { kind: 'bars'; unit: string; max: number; rows: { label: string; metric: Metric }[] }
  | { kind: 'position'; xLabel: string; yLabel: string; xMax: number; yMax: number; points: Point[] }
  | { kind: 'matrix'; columns: string[]; rows: { label: string; cells: { text: string; tone: 'ok' | 'partial' | 'gap' | 'unknown' }[] }[] }
  | { kind: 'palette'; entries: { label: string; colors: string[]; note: string }[] }
  | { kind: 'risk'; xLabel: string; yLabel: string; xMax: number; yMax: number; points: Point[] }
  | { kind: 'chain'; steps: { label: string; text: string }[] }
);

/** Validate numerical meaning at the chart input boundary, before geometry is calculated. */
export function figureError(figure: ResearchFigure): string | null {
  const positive = (n: number) => Number.isFinite(n) && n > 0;
  const nonnegative = (n: number) => Number.isFinite(n) && n >= 0;
  const unit = (value: string) => Boolean(value.trim()) && value.length <= 80 && !/[<>\u0000-\u001f]/.test(value);
  switch (figure.kind) {
    case 'scopes': {
      const [total, serviceable, obtainable] = figure.scopes;
      return !unit(figure.unit) || !positive(total.value) || !nonnegative(serviceable.value) || !nonnegative(obtainable.value) || total.value < serviceable.value || serviceable.value < obtainable.value ? '市场范围需满足总量 ≥ 可服务 ≥ 可获得，单位明确且数值有限、非负；总量为零时不绘制面积。' : null;
    }
    case 'trend':
      return !unit(figure.unit) || !positive(figure.max) || figure.points.length < 2 || !Number.isFinite(figure.forecastFrom) || !figure.points.some(p => p.year < figure.forecastFrom) || !figure.points.some(p => p.year >= figure.forecastFrom) || figure.points.some((p, i) => !Number.isFinite(p.year) || !nonnegative(p.value) || p.value > figure.max || (i > 0 && p.year <= figure.points[i - 1].year)) ? '趋势需包含按年份递增的历史和预测数据，数值不得超出明确量尺。' : null;
    case 'bars':
      return !unit(figure.unit) || !positive(figure.max) || !figure.rows.length || figure.rows.some(r => r.metric.kind === 'known' && (!nonnegative(r.metric.value) || r.metric.value > figure.max)) ? '柱形图需要数据行、明确单位、正量尺和量尺内的非负有限值；未知值不得当作零。' : null;
    case 'bubbles':
    case 'position':
    case 'risk':
      return !unit(figure.xLabel) || !unit(figure.yLabel) || !positive(figure.xMax) || !positive(figure.yMax) || !figure.points.length || figure.points.some(p => !nonnegative(p.x) || !nonnegative(p.y) || p.x > figure.xMax || p.y > figure.yMax) || (figure.kind === 'bubbles' && (!unit(figure.sizeUnit) || figure.points.some(p => !nonnegative(p.size)))) ? '坐标和气泡面积需要数据点、明确量尺与单位，所有值必须位于量尺内。' : null;
    case 'matrix':
      return !figure.columns.length || !figure.rows.length || figure.rows.some(r => r.cells.length !== figure.columns.length) ? '矩阵需要数据行，且各行必须与列标题对应。' : null;
    case 'palette':
      return !figure.entries.length || figure.entries.some(e => !e.colors.length || e.colors.some(c => !/^#[0-9a-fA-F]{6}$/.test(c))) ? '色板需要数据项，且仅接受明确的六位十六进制颜色。' : null;
    case 'chain':
      return figure.steps.length < 2 || figure.steps.some(s => !s.label.trim() || !s.text.trim()) ? '推导链需至少两个有说明的节点。' : null;
    default: {
      const exhaustive: never = figure;
      return exhaustive;
    }
  }
}

export function circleRadius(value: number, maximum: number, radius: number): number {
  if (value === 0 && maximum === 0) return 0;
  return radius * Math.sqrt(value / maximum);
}

export function figureTable(figure: ResearchFigure): { headings: string[]; rows: string[][] } {
  switch (figure.kind) {
    case 'scopes': return { headings: ['范围', figure.unit], rows: figure.scopes.map(s => [s.label, String(s.value)]) };
    case 'trend': return { headings: ['年份', figure.unit, '数据类型'], rows: figure.points.map(p => [String(p.year), String(p.value), `${p.year >= figure.forecastFrom ? '预测' : '历史'}${figure.origin.kind === 'sample' ? '示例' : ''}`]) };
    case 'bars': return { headings: ['项目', figure.unit], rows: figure.rows.map(r => [r.label, r.metric.kind === 'known' ? String(r.metric.value) : `未知：${r.metric.reason}`]) };
    case 'bubbles': return { headings: ['人群', figure.xLabel, figure.yLabel, figure.sizeUnit], rows: figure.points.map(p => [p.label, String(p.x), String(p.y), String(p.size)]) };
    case 'position':
    case 'risk': return { headings: ['对象', figure.xLabel, figure.yLabel], rows: figure.points.map(p => [p.label, String(p.x), String(p.y)]) };
    case 'matrix': return { headings: ['对象', ...figure.columns], rows: figure.rows.map(r => [r.label, ...r.cells.map(c => c.text)]) };
    case 'palette': return { headings: ['对象', '颜色值', '说明'], rows: figure.entries.map(e => [e.label, e.colors.join(' / '), e.note]) };
    case 'chain': return { headings: ['环节', '内容'], rows: figure.steps.map(s => [s.label, s.text]) };
    default: {
      const exhaustive: never = figure;
      return exhaustive;
    }
  }
}
