export type ChartDatum = { id: string; label: string; value: number; unit: string };
export type ScatterDatum = { id: string; label: string; price: number; abv: number };

export function signedBarGeometry({ values, min = Math.min(0, ...values), max = Math.max(0, ...values) }: { values: number[]; min?: number; max?: number }) {
  const span = max - min || 1;
  const x = (value: number) => 162 + ((value - min) / span) * 424;
  const zero = x(0);
  return { min, max, zero, bars: values.map(value => ({ x: Math.min(zero, x(value)), width: Math.abs(x(value) - zero), end: x(value) })) };
}

export function BarChart({ title, rows, signed = false, min = 0, max }: { title: string; rows: ChartDatum[]; signed?: boolean; min?: number; max: number }) {
  const geometry = signedBarGeometry({ values: rows.map(row => row.value), min, max });
  const height = 62 + rows.length * 43;
  return <div className="rc-chart">
    <svg viewBox={`0 0 660 ${height}`} role="img" aria-label={title}>
      <line x1={geometry.zero} y1="18" x2={geometry.zero} y2={height - 34} className="rc-zero" />
      {rows.map((row, index) => {
        const bar = geometry.bars[index];
        const y = 23 + index * 43;
        return <g key={row.id} data-datum-id={row.id}><text x="144" y={y + 19} textAnchor="end">{row.label}</text><rect x={bar.x} y={y} width={bar.width} height="28" rx="3" className={row.value < 0 ? 'rc-bar-negative' : 'rc-bar-positive'} /><text x="610" y={y + 19} className="rc-chart-value">{signed && row.value > 0 ? '+' : ''}{row.value}{row.unit.includes('%') ? '%' : ''}</text></g>;
      })}
      <text x={geometry.zero} y={height - 9} textAnchor="middle">0</text>
      {geometry.min !== 0 && <text x="162" y={height - 9} textAnchor="middle">{geometry.min}</text>}
      <text x="586" y={height - 9} textAnchor="middle">{geometry.max}</text>
    </svg>
    <details className="rc-data"><summary>查看图中数据</summary><table><caption>{title}</caption><thead><tr><th scope="col">指标</th><th scope="col">数值</th><th scope="col">单位</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><th scope="row">{row.label}</th><td>{signed && row.value > 0 ? '+' : ''}{row.value}</td><td>{row.unit}</td></tr>)}</tbody></table></details>
  </div>;
}

export function scatterGeometry({ points, maxPrice, maxAbv }: { points: ScatterDatum[]; maxPrice: number; maxAbv: number }) {
  return points.map(point => ({ ...point, x: 78 + point.price / maxPrice * 475, y: 312 - point.abv / maxAbv * 245 }));
}

export function PriceStrengthChart({ title, points, maxPrice, maxAbv }: { title: string; points: ScatterDatum[]; maxPrice: number; maxAbv: number }) {
  const geometry = scatterGeometry({ points, maxPrice, maxAbv });
  return <div className="rc-chart rc-scatter"><svg viewBox="0 0 660 390" role="img" aria-label={title}>
    {[0, .25, .5, .75, 1].map(fraction => <g key={fraction}><line x1="78" y1={312 - fraction * 245} x2="570" y2={312 - fraction * 245} className="rc-grid" /><text x="65" y={317 - fraction * 245} textAnchor="end">{(fraction * maxAbv).toFixed(1)}</text><text x={78 + fraction * 475} y="338" textAnchor="middle">{(fraction * maxPrice).toFixed(2)}</text></g>)}
    <path d="M78 51V312H570" fill="none" className="rc-zero" /><text x="324" y="375" textAnchor="middle">Tesco 标价 · £ / 罐</text><text x="78" y="27">酒精度 · ABV %</text>
    {geometry.map((point, index) => { const left = index === 0 || index === 2; const offsetY = index === 1 ? -20 : index === 2 ? 22 : index === 3 ? 38 : -10; return <g key={point.id} data-sku-id={point.id}><circle cx={point.x} cy={point.y} r="7" className="rc-dot" /><text x={point.x + (left ? -12 : 14)} y={point.y + offsetY} textAnchor={left ? 'end' : 'start'}>{point.label}</text></g>; })}
  </svg></div>;
}
