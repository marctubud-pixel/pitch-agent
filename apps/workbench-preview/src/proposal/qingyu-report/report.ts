import rawContent from './content.json';

export type EvidenceKind = 'published-report' | 'visual-observation' | 'brand-self-description' | 'research-synthesis' | 'brief-condition' | 'brief-derived' | 'method-reference';
export type QingyuSource = { id: string; title: string; publisher: string; url: string | null; published: string | null; dataPeriod: string | null; market: string; population: string; method: string; access: string; locator: string; use: string | null };
export type QingyuDatum = { id: string; text: string; value: number | Record<string, number> | null; unit: string | null; basis: string | null; limits: string; sourceIds: string[]; derivedFrom: string[]; locator: string; scope: { market: string; period: string; population: string }; evidenceType: EvidenceKind };
export type QingyuFinding = { id: string; title: string; text: string; datumIds: string[]; sourceIds: string[]; locator: string; scope: string; kind: EvidenceKind; implication: string };
type ChartBase = { id: string; title: string; sourceIds: string[]; scope: string; caption: string; locator: string };
export type NumericRow = { label: string; value: number; datumId: string; valuePath: string | null };
export type QingyuChart = ChartBase & ({ type: 'bar' | 'metrics' | 'single-metric'; unit: string; rows: NumericRow[] } | { type: 'comparison-table'; columns: string[]; rows: { label: string; capacityMl: number; cue: string; identity: string; caseId: string; datumId: string; valuePath: string | null; cueDatumIds: string[] }[] });
export type QingyuCase = { id: string; title: string; sourceIds: string[]; datumIds: string[]; image: { path: string; sourcePage: string; identityLabel: string; alt: string; sha256: string }; capacityMl: number; observation: string; comparisonUse: string; scope: string; locator: string; limits: string };
export type QingyuGap = { id: string; title: string; text: string; scope: string; consequence: string; sourceIds: string[]; locator: string };
export type QingyuSectionId = 'market' | 'people' | 'competition' | 'product' | 'conclusion';
export type QingyuSection = { id: QingyuSectionId; title: string; headline: string; conclusion: string; findingIds: string[]; datumIds: string[]; chartIds: string[]; caseIds: string[]; gapIds: string[]; footnote: string; support: { text: string; datumIds: string[] }[]; conditions: { label: string; value: string; evidence: string }[]; takeaways: { text: string; findingIds: string[] }[] };
export type QingyuReport = { id: string; title: string; subtitle: string; asOf: string; status: string; lead: string; scopeNote: string; sections: [QingyuSection, QingyuSection, QingyuSection, QingyuSection, QingyuSection]; sources: QingyuSource[]; datums: QingyuDatum[]; findings: QingyuFinding[]; charts: QingyuChart[]; cases: QingyuCase[]; gaps: QingyuGap[]; notes: { label: string; methodology: string[]; methodReferenceDatumIds: string[]; correctionsApplied: string[]; priorChecks: { role: string; scope: string }[] } };
export type QingyuParsed = { kind: 'valid'; report: QingyuReport } | { kind: 'invalid'; message: string };
export const evidenceLabels: Record<EvidenceKind, string> = { 'published-report': '机构公开报告引述', 'visual-observation': '官方物料可见观察', 'brand-self-description': '品牌自述', 'research-synthesis': '研究分析', 'brief-condition': '虚构任务条件', 'brief-derived': '题设换算', 'method-reference': '境外方法参照' };

function isObject(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function object(value: unknown): Record<string, unknown> {
  if (!isObject(value)) throw new Error('Expected object');
  return value;
}
function text(value: unknown): string { if (typeof value !== 'string' || !value.trim()) throw new Error('Expected text'); return value; }
function number(value: unknown): number { if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Expected finite number'); return value; }
function list<T>(value: unknown, parse: (value: unknown) => T): T[] { if (!Array.isArray(value)) throw new Error('Expected list'); return value.map(parse); }
const strings = (value: unknown) => list(value, text);
const optionalText = (value: unknown) => value === null || value === undefined ? null : text(value);
function https(value: unknown): string { const url = text(value); if (new URL(url).protocol !== 'https:') throw new Error('Expected HTTPS source'); return url; }
function evidenceKind(value: unknown): EvidenceKind {
  if (value === 'published-report' || value === 'visual-observation' || value === 'brand-self-description' || value === 'research-synthesis' || value === 'brief-condition' || value === 'brief-derived' || value === 'method-reference') return value;
  throw new Error('Unknown evidence kind');
}
function source(raw: unknown): QingyuSource {
  const v = object(raw); const id = text(v.id);
  if (v.url === null && id !== 'BRIEF-S1') throw new Error('Only the local brief has no URL');
  return { id, title: text(v.title), publisher: text(v.publisher), url: v.url === null ? null : https(v.url), published: optionalText(v.published), dataPeriod: optionalText(v.dataPeriod), market: text(v.market), population: text(v.population), method: text(v.method), access: text(v.access), locator: text(v.locator), use: optionalText(v.use) };
}
function numericValue(raw: unknown): QingyuDatum['value'] {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return number(raw);
  return Object.fromEntries(Object.entries(object(raw)).map(([key, value]) => [key, number(value)]));
}
function datum(raw: unknown): QingyuDatum {
  const v = object(raw); const scope = object(v.scope);
  return { id: text(v.id), text: text(v.text), value: numericValue(v.value), unit: optionalText(v.unit), basis: optionalText(v.basis), limits: text(v.limits), sourceIds: strings(v.sourceIds), derivedFrom: v.derivedFrom === undefined ? [] : strings(v.derivedFrom), locator: text(v.locator), scope: { market: text(scope.market), period: text(scope.period), population: text(scope.population) }, evidenceType: evidenceKind(v.evidenceType) };
}
function finding(raw: unknown): QingyuFinding { const v = object(raw); return { id: text(v.id), title: text(v.title), text: text(v.text), datumIds: strings(v.datumIds), sourceIds: strings(v.sourceIds), locator: text(v.locator), scope: text(v.scope), kind: evidenceKind(v.kind), implication: text(v.implication) }; }
function chart(raw: unknown): QingyuChart {
  const v = object(raw); const base = { id: text(v.id), title: text(v.title), sourceIds: strings(v.sourceIds), scope: text(v.scope), caption: text(v.caption), locator: text(v.locator) };
  if (v.type === 'bar' || v.type === 'metrics' || v.type === 'single-metric') return { ...base, type: v.type, unit: text(v.unit), rows: list(v.rows, rawRow => { const r = object(rawRow); return { label: text(r.label), value: number(r.value), datumId: text(r.datumId), valuePath: optionalText(r.valuePath) }; }) };
  if (v.type === 'comparison-table') return { ...base, type: v.type, columns: strings(v.columns), rows: list(v.rows, rawRow => { const r = object(rawRow); return { label: text(r.label), capacityMl: number(r.capacityMl), cue: text(r.cue), identity: text(r.identity), caseId: text(r.caseId), datumId: text(r.datumId), valuePath: optionalText(r.valuePath), cueDatumIds: strings(r.cueDatumIds) }; }) };
  throw new Error('Unknown chart type');
}
const imageNames = new Map([['PK-CASE01', 'moli.png'], ['PK-CASE02', 'wulong.png'], ['PK-CASE03', 'yulu.png'], ['PK-CASE04', 'annual2025-p18-image0.jpeg'], ['PK-CASE05', 'annual2025-p18-image1.jpeg']]);
function productCase(raw: unknown): QingyuCase {
  const v = object(raw); const img = object(v.image); const id = text(v.id); const filename = imageNames.get(id); const file = text(img.file);
  if (!filename || file.split('/').at(-1) !== filename || img.preserveEntireImage !== true || !/^[0-9a-f]{64}$/.test(text(img.sha256))) throw new Error('Invalid original image identity');
  return { id, title: text(v.title), sourceIds: strings(v.sourceIds), datumIds: strings(v.datumIds), image: { path: `/research-case/qingyu-pack-20261109/${filename}`, sourcePage: https(img.sourcePage), identityLabel: text(img.identityLabel), alt: text(img.alt), sha256: text(img.sha256) }, capacityMl: number(v.capacityMl), observation: text(v.observation), comparisonUse: text(v.comparisonUse), scope: text(v.scope), locator: text(v.locator), limits: text(v.limits) };
}
function gap(raw: unknown): QingyuGap { const v = object(raw); if (v.status !== '待补') throw new Error('Gap cannot be approved'); return { id: text(v.id), title: text(v.title), text: text(v.text), scope: text(v.scope), consequence: text(v.consequence), sourceIds: strings(v.sourceIds), locator: text(v.locator) }; }
function sectionId(raw: unknown): QingyuSectionId { if (raw === 'market' || raw === 'people' || raw === 'competition' || raw === 'product' || raw === 'conclusion') return raw; throw new Error('Unknown section'); }
function section(raw: unknown): QingyuSection {
  const v = object(raw);
  return { id: sectionId(v.id), title: text(v.title), headline: text(v.headline), conclusion: text(v.conclusion), findingIds: strings(v.findingIds), datumIds: strings(v.datumIds), chartIds: strings(v.chartIds), caseIds: strings(v.caseIds), gapIds: strings(v.gapIds), footnote: text(v.footnote), support: v.support === undefined ? [] : list(v.support, raw => { const item = object(raw); return { text: text(item.text), datumIds: strings(item.datumIds) }; }), conditions: v.conditions === undefined ? [] : list(v.conditions, raw => { const item = object(raw); return { label: text(item.label), value: text(item.value), evidence: text(item.evidence) }; }), takeaways: v.takeaways === undefined ? [] : list(v.takeaways, raw => { const item = object(raw); return { text: text(item.text), findingIds: strings(item.findingIds) }; }) };
}
export function byId<T extends { id: string }>(items: T[], id: string): T { const found = items.find(item => item.id === id); if (!found) throw new Error(`Missing reference ${id}`); return found; }
export function chartValue(report: QingyuReport, row: Pick<NumericRow, 'datumId' | 'valuePath'>): number {
  const value = byId(report.datums, row.datumId).value;
  if (row.valuePath === null) return number(value);
  if (value === null || typeof value === 'number') throw new Error(`Missing numeric path ${row.datumId}`);
  return number(value[row.valuePath]);
}
function validate(report: QingyuReport) {
  for (const items of [report.sources, report.datums, report.findings, report.charts, report.cases, report.gaps]) {
    if (new Set(items.map(item => item.id)).size !== items.length) throw new Error('Duplicate ID');
  }
  const refs = <T extends { id: string }>(ids: string[], items: T[]) => ids.forEach(id => byId(items, id));
  report.datums.forEach(d => { refs(d.sourceIds, report.sources); refs(d.derivedFrom, report.datums); if (['CP-F1', 'CP-F2', 'CP-F3'].includes(d.id)) throw new Error('Quarantined datum'); });
  report.findings.forEach(f => { refs(f.datumIds, report.datums); refs(f.sourceIds, report.sources); });
  report.gaps.forEach(g => refs(g.sourceIds, report.sources));
  report.cases.forEach(c => {
    refs(c.sourceIds, report.sources); refs(c.datumIds, report.datums);
    if (!c.sourceIds.some(id => c.image.sourcePage.split('#')[0] === byId(report.sources, id).url)) throw new Error('Image source mismatch');
    const capacity = c.datumIds.map(id => byId(report.datums, id)).find(d => d.id === 'CP-F15' || d.id === 'CP-F17');
    if (!capacity || chartValue(report, { datumId: capacity.id, valuePath: capacity.id === 'CP-F15' ? 'capacityMl' : null }) !== c.capacityMl) throw new Error('Case capacity mismatch');
  });
  report.charts.forEach(c => {
    refs(c.sourceIds, report.sources);
    if (!c.rows.length) throw new Error('Empty chart');
    if (c.type === 'comparison-table') c.rows.forEach(r => {
      const product = byId(report.cases, r.caseId);
      refs(r.cueDatumIds, report.datums);
      if (r.cueDatumIds.some(id => !product.datumIds.includes(id))) throw new Error('Cue datum mismatch');
      const value = chartValue(report, { datumId: r.datumId, valuePath: r.valuePath });
      if (r.capacityMl !== value || product.capacityMl !== value || !product.datumIds.includes(r.datumId) || product.title !== r.label) throw new Error('Comparison capacity mismatch');
    });
    else c.rows.forEach(r => {
      if (r.value !== chartValue(report, r) || r.value < 0 || (c.type === 'single-metric' && r.value > 100)) throw new Error('Chart value differs from datum');
      const datumSources = byId(report.datums, r.datumId).sourceIds;
      if (datumSources.some(id => !c.sourceIds.includes(id))) throw new Error('Chart source mismatch');
    });
  });
  report.sections.forEach(s => { refs(s.findingIds, report.findings); refs(s.datumIds, report.datums); refs(s.chartIds, report.charts); refs(s.caseIds, report.cases); refs(s.gapIds, report.gaps); s.support.forEach(p => refs(p.datumIds, report.datums)); s.takeaways.forEach(p => refs(p.findingIds, report.findings)); });
  refs(report.notes.methodReferenceDatumIds, report.datums);
}
export function parseQingyuReport(raw: unknown): QingyuParsed {
  try {
    const v = object(raw); if (v.schemaVersion !== 1 || v.id !== 'qingyu-packaging-results-20261109' || v.status !== '研究待补') throw new Error('Invalid report status');
    const chapters = list(v.sections, section); const [market, people, competition, product, conclusion] = chapters;
    if (chapters.length !== 5 || market.id !== 'market' || people.id !== 'people' || competition.id !== 'competition' || product.id !== 'product' || conclusion.id !== 'conclusion') throw new Error('Expected five ordered sections');
    const notes = object(v.evidenceNotes); if (notes.defaultCollapsed !== true) throw new Error('Evidence notes must start collapsed');
    const report: QingyuReport = { id: text(v.id), title: text(v.title), subtitle: text(v.subtitle), asOf: text(v.asOf), status: text(v.status), lead: text(v.lead), scopeNote: text(v.scopeNote), sections: [market, people, competition, product, conclusion], sources: list(v.sources, source), datums: list(v.datums, datum), findings: list(v.findings, finding), charts: list(v.charts, chart), cases: list(v.cases, productCase), gaps: list(v.gaps, gap), notes: { label: text(notes.label), methodology: strings(notes.methodology), methodReferenceDatumIds: strings(notes.methodReferenceDatumIds), correctionsApplied: strings(notes.correctionsApplied), priorChecks: list(notes.priorChecks, raw => { const c = object(raw); return { role: text(c.role), scope: text(c.scope) }; }) } };
    validate(report); return { kind: 'valid', report };
  } catch (error) { return { kind: 'invalid', message: error instanceof Error ? error.message : 'Invalid report' }; }
}
export const qingyuReport = parseQingyuReport(rawContent);
