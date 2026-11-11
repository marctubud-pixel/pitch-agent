import { useId } from 'react';
import { circleRadius, figureError, figureTable, type ResearchFigure } from './model';

const inks = ['#4169bc', '#809bc8', '#bdd0e9'];
const tones = { ok: '#dbe9f6', partial: '#f5e9cd', gap: '#f2d8d8', unknown: '#e9edf2' };
const short = (text: string, length = 18) => text.length > length ? `${text.slice(0, length)}…` : text;

export function ResearchFigureView({ figure }: { figure: ResearchFigure }) {
  const uid = useId();
  const error = figureError(figure);
  const table = figureTable(figure);
  const sample = figure.origin.kind === 'sample';
  const chartHeight = figure.kind === 'matrix' ? Math.max(310, 60 + figure.rows.length * 40) : figure.kind === 'bars' ? Math.max(310, 70 + figure.rows.length * 51) : 310;
  return <figure className="rm-figure" data-chart-kind={figure.kind} data-origin={figure.origin.kind} aria-labelledby={`${uid}-title`}>
    <figcaption><span className="rm-kicker">{sample ? '独立工程示例' : '当前报告依据'}</span><h4 id={`${uid}-title`}>{figure.title}</h4><p>{figure.description}</p></figcaption>
    {error ? <p className="rm-alert" role="status">图表未绘制：{error}</p> : <svg viewBox={`0 0 640 ${chartHeight}`} role="img" aria-labelledby={`${uid}-title ${uid}-desc`}><desc id={`${uid}-desc`}>{figure.description}。完整数值与文字见下方数据表。</desc><Geometry figure={figure} /></svg>}
    <p className="rm-provenance">{sample && '独立工程示例 · '}{figure.origin.note}</p>
    <details className="rm-table"><summary>查看{sample ? '独立工程示例' : '依据'}数据表</summary><table><caption>{sample ? '独立工程示例 · ' : ''}{figure.title}</caption><thead><tr>{table.headings.map(h => <th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j}>{c}</td>)}</tr>)}</tbody></table></details>
  </figure>;
}

function Geometry({ figure: f }: { figure: ResearchFigure }) {
  switch (f.kind) {
    case 'scopes': return <>{f.scopes.map((s, i) => <g key={s.label}><circle cx="186" cy="154" r={circleRadius(s.value, f.scopes[0].value, 126)} fill={inks[i]} stroke="white" strokeWidth="2" /><text x="340" y={85 + i * 65} className="rm-svg-label">{s.label}</text><text x="340" y={109 + i * 65}>{s.value} {f.unit}</text></g>)}</>;
    case 'bars': return <><text x="200" y="27">0 至 {f.max} {f.unit}</text>{f.rows.map((r, i) => <g key={r.label}><text x="16" y={73 + i * 51}>{short(r.label, 10)}</text><rect x="200" y={54 + i * 51} width="332" height="25" fill="#edf1f6" />{r.metric.kind === 'known' ? <><rect x="200" y={54 + i * 51} width={332 * r.metric.value / f.max} height="25" fill={inks[i % 3]} /><text x="543" y={73 + i * 51}>{r.metric.value}</text></> : <text x="215" y={73 + i * 51}>未知，未绘制</text>}</g>)}</>;
    case 'trend': {
      const first = f.points[0].year;
      const span = f.points[f.points.length - 1].year - first;
      const x = (year: number) => 72 + (year - first) / span * 500;
      const y = (value: number) => 250 - value / f.max * 195;
      const boundary = x(f.forecastFrom);
      return <><rect x={boundary} y="43" width={572 - boundary} height="207" fill="#f0f4fa" /><text x="75" y="25">{f.unit}（0 至 {f.max}）</text><text x={boundary + 6} y="37">{f.origin.kind === 'sample' ? '预测示例 →' : '预测 →'}</text><path d="M72 50V250H580" fill="none" stroke="#8290a4" />{[0, f.max / 2, f.max].map(v => <text key={v} x="10" y={y(v) + 5}>{v}</text>)}{f.points.slice(1).map((p, i) => <line key={p.year} x1={x(f.points[i].year)} y1={y(f.points[i].value)} x2={x(p.year)} y2={y(p.value)} stroke="#4169bc" strokeWidth="3" strokeDasharray={p.year >= f.forecastFrom ? '7 5' : undefined} />)}{f.points.map(p => <g key={p.year}><circle cx={x(p.year)} cy={y(p.value)} r="5" fill="#4169bc" /><text x={x(p.year)} y={y(p.value) - 12} textAnchor="middle">{p.value}</text><text x={x(p.year)} y="276" textAnchor="middle">{p.year}</text></g>)}<text x="580" y="299" textAnchor="end">年份 · 实线历史 / 虚线预测</text></>;
    }
    case 'position':
    case 'risk':
    case 'bubbles': {
      const x = (n: number) => 100 + n / f.xMax * 460;
      const y = (n: number) => 245 - n / f.yMax * 185;
      const sizeMax = f.kind === 'bubbles' ? Math.max(...f.points.map(p => p.size)) : 1;
      return <>{f.kind === 'risk' && <rect x="330" y="60" width="230" height="92" fill="#f4e0de" />}<path d="M100 54V245H565" fill="none" stroke="#8290a4" /><path d="M330 60V245M100 152H560" fill="none" stroke="#cbd4df" strokeDasharray="4 4" /><text x="100" y="28">{f.yLabel} · 0 至 {f.yMax}</text><text x="565" y="299" textAnchor="end">{f.xLabel} · 0 至 {f.xMax}</text><text x="80" y="260">0</text>{f.points.map((p, i) => <g key={p.label}><circle cx={x(p.x)} cy={y(p.y)} r={f.kind === 'bubbles' && 'size' in p && typeof p.size === 'number' ? circleRadius(p.size, sizeMax, 34) : 8} fill={inks[i % 3]} fillOpacity="0.7" stroke="#4169bc" /><text x={x(p.x) + (p.x > f.xMax * .65 ? -12 : 12)} y={y(p.y) + (p.y > f.yMax * .8 ? 23 : -12)} textAnchor={p.x > f.xMax * .65 ? 'end' : 'start'}>{short(p.label, 18)}</text></g>)}{f.kind === 'bubbles' && <text x="100" y="278">圆面积 ∝ {f.sizeUnit}；最大气泡 {sizeMax}</text>}</>;
    }
    case 'matrix': {
      const cell = 440 / f.columns.length;
      const height = 40;
      const characters = Math.max(1, Math.floor((cell - 20) / 16));
      return <>{f.columns.map((c, j) => <text key={c} x={190 + j * cell + cell / 2} y="33" textAnchor="middle">{short(c, characters)}</text>)}{f.rows.map((r, i) => <g key={r.label}><text x="12" y={65 + i * height}>{short(r.label, 10)}</text>{r.cells.map((c, j) => <g key={j}><rect x={190 + j * cell} y={45 + i * height} width={cell - 5} height={height - 5} rx="4" fill={tones[c.tone]} /><text x={190 + j * cell + (cell - 5) / 2} y={65 + i * height} textAnchor="middle">{short(c.text, characters)}</text></g>)}</g>)}</>;
    }
    case 'palette': return <>{f.entries.map((e, i) => <g key={e.label}><text x={25 + i * (590 / f.entries.length)} y="38" className="rm-svg-label">{e.label}</text><rect x={25 + i * (590 / f.entries.length)} y="57" width={550 / f.entries.length} height="180" rx="18" fill="#f0f3f7" />{e.colors.map((c, j) => <g key={j}><rect x={40 + i * (590 / f.entries.length) + j * (470 / f.entries.length / e.colors.length)} y="80" width={470 / f.entries.length / e.colors.length} height="107" fill={c} /><text x={40 + i * (590 / f.entries.length) + j * (470 / f.entries.length / e.colors.length)} y="214" style={{ fontSize: 10 }}>{c}</text></g>)}<text x={25 + i * (590 / f.entries.length)} y="267">{short(e.note, 15)}</text></g>)}</>;
    case 'chain': return <>{f.steps.map((s, i) => {
      const width = 590 / f.steps.length;
      const characters = Math.max(1, Math.floor((width - 45) / 16));
      return <g key={s.label}><rect x={15 + i * width} y="54" width={width - 20} height="190" rx="10" fill={i === f.steps.length - 1 ? '#dce7f7' : '#eef2f7'} /><text x={29 + i * width} y="87" className="rm-svg-label">{s.label}</text>{Array.from({ length: 5 }, (_, line) => <text key={line} x={29 + i * width} y={119 + line * 23}>{line === 4 && s.text.length > characters * 5 ? `${s.text.slice(line * characters, (line + 1) * characters - 1)}…` : s.text.slice(line * characters, (line + 1) * characters)}</text>)}{i < f.steps.length - 1 && <text x={width - 2 + i * width} y="160">→</text>}</g>;
    })}</>;
    default: {
      const exhaustive: never = f;
      return exhaustive;
    }
  }
}
