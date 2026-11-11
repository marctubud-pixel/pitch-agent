import { describe, expect, it } from 'vitest';
import content from './content-r4.json';
import { parseQingyuR4, r4BoardEvidence, r4ChapterEvidence, r4Charts, r4ChartSeries } from './report-r4';

describe('R4 finite evidence boards', () => {
  it('accepts the authored report and keeps quantities in the fact registry', () => {
    const parsed = parseQingyuR4(content); if (parsed.kind !== 'valid') throw new Error(parsed.message);
    const report = parsed.report;
    expect(report.chapters.flatMap(c => c.boards).map(b => b.kind)).toEqual(['market', 'people', 'landscape', 'packaging', 'conditions', 'synthesis']);
    const market = report.chapters[0]?.boards[0]; if (!market || market.kind !== 'market') throw new Error('Market required');
    expect(r4ChartSeries(report, market.charts[0]!)).toMatchObject({ values: [28.2, 32.8, 38.4], unit: '%' });
    const closures = report.chapters.map(c => r4ChapterEvidence(report, c));
    for (const f of report.facts) expect(closures.some(e => e.facts.some(x => x.id === f.id))).toBe(true);
    for (const f of report.findings) expect(closures.some(e => e.findings.some(x => x.id === f.id))).toBe(true);
    for (const g of report.gaps) expect(closures.some(e => e.gaps.some(x => x.id === g.id))).toBe(true);
  });
  it('expands recursive facts and finding sources without changing the main-layer text', () => {
    const parsed = parseQingyuR4(content); if (parsed.kind !== 'valid') throw new Error(parsed.message);
    const report = parsed.report, market = report.chapters[0]?.boards[0]; if (!market) throw new Error('Market required');
    const closure = r4BoardEvidence(report, market);
    expect(closure.findings.some(f => f.id === market.conclusionId)).toBe(true);
    for (const c of r4Charts(market)) for (const r of c.rows) expect(closure.facts.some(f => f.id === r.factId)).toBe(true);
    report.facts.push({ ...report.facts[0]!, id: 'test-parent', text: '开发测试递归事实', derivedFrom: [] });
    report.facts[0]!.derivedFrom = ['test-parent'];
    const chapter = report.chapters[0]!; chapter.details.factIds.push(report.facts[0]!.id);
    expect(r4ChapterEvidence(report, chapter).facts.map(f => f.id)).toContain('test-parent');
  });
  it.each(['schema', 'skill', 'adoption', 'chart-copy', 'mixed-basis', 'percent-range', 'cycle', 'scene-role', 'scene-sha', 'product-sha', 'wrong-observation', 'missing-landscape-cell', 'missing-group', 'unknown-group', 'missing-link', 'uncovered-fact'])('rejects %s without a fallback report', mutation => {
    const parsed = parseQingyuR4(content); if (parsed.kind !== 'valid') throw new Error(parsed.message);
    const raw = structuredClone(parsed.report);
    if (mutation === 'schema') Object.assign(raw, { schemaVersion: 3 });
    if (mutation === 'skill') Object.assign(raw.origin, { skillRevision: 'r5-20261109' });
    if (mutation === 'adoption') raw.origin.adoptionSha256 = 'a'.repeat(64);
    if (mutation === 'chart-copy') { const b = raw.chapters[0]?.boards[0]; const chart = b?.kind === 'market' ? b.charts[0] : undefined; if (!chart) throw new Error('Chart required'); Object.assign(chart.rows[0]!, { value: 123 }); }
    if (mutation === 'mixed-basis') { const b = raw.chapters[0]?.boards[0]; const chart = b?.kind === 'market' ? b.charts[0] : undefined; const f = raw.facts.find(f => f.id === chart?.rows[0]?.factId); if (!f?.quantity) throw new Error('Quantity required'); f.quantity.basis = 'different sample'; }
    if (mutation === 'percent-range') { const b = raw.chapters[1]?.boards[0]; if (b?.kind !== 'people') throw new Error('People required'); const f = raw.facts.find(f => f.id === b.chart.rows[0]?.factId); if (!f?.quantity) throw new Error('Quantity required'); f.quantity.value = 101; }
    if (mutation === 'cycle') raw.facts[0]!.derivedFrom = [raw.facts[0]!.id];
    if (mutation === 'scene-role') Object.assign(raw.media.find(m => m.role === 'generated-scenario')!, { role: 'original-product' });
    if (mutation === 'scene-sha') raw.media.find(m => m.role === 'generated-scenario')!.sha256 = 'b'.repeat(64);
    if (mutation === 'product-sha') raw.media[0]!.sha256 = 'b'.repeat(64);
    if (mutation === 'wrong-observation') { const b = raw.chapters[2]?.boards[1]; const cells = b?.kind === 'packaging' ? b.samples[0]?.cells : undefined; if (!cells) throw new Error('Samples required'); cells[0]!.factIds = [raw.facts[0]!.id]; }
    if (mutation === 'missing-landscape-cell') { const b = raw.chapters[2]?.boards[0]; if (b?.kind === 'landscape') b.rows[0]?.cells.pop(); }
    if (mutation === 'missing-group') { const b = raw.chapters[2]?.boards[0]; if (b?.kind === 'landscape') b.groupFindingIds = []; }
    if (mutation === 'unknown-group') { const b = raw.chapters[2]?.boards[0]; if (b?.kind === 'landscape') b.groupFindingIds = ['unknown']; }
    if (mutation === 'missing-link') { const b = raw.chapters[4]?.boards[0]; if (b?.kind === 'synthesis') b.links.pop(); }
    if (mutation === 'uncovered-fact') raw.facts.push({ ...raw.facts[0]!, id: 'orphan-test-fact' });
    expect(parseQingyuR4(raw).kind).toBe('invalid');
  });
});
