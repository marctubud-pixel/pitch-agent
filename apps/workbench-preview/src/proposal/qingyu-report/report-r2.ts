import { byId, type EvidenceKind, type QingyuDatum, type QingyuFinding, type QingyuGap, type QingyuSection, type QingyuSource } from './report';

export type NumericRef = { datumId: string; valuePath: string | null };
export type R2Chart = {
  id: string; type: 'bar' | 'metrics'; title: string; metricLabel: string; unit: string;
  period: string; comparison: string; channel: string; population: string;
  sourceIds: string[]; scope: string; caption: string; locator: string;
  rows: (NumericRef & { label: string; value: number })[];
};
export type R2QuestionId = 'M1' | 'M2' | 'P1' | 'P2' | 'C1' | 'C2' | 'C3' | 'R1' | 'S1';
export type R2Question = { id: R2QuestionId; question: string; answerStatus: 'answered' | 'partial' | 'unanswered'; answer: string; findingIds: string[]; datumIds: string[]; gapIds: string[] };
export type R2Sku = { id: string; title: string; category: 'strict-tea' | 'adjacent'; categoryLabel: string; capacity: NumericRef | null; packCount: NumericRef | null; datumIds: string[] };
type QuoteBase = { id: string; skuId: string; quotedAt: string; publishedAt: string | null; readAt: string; channel: string; conditions: string; sourceId: string; locator: string };
export type R2Price = QuoteBase & (
  { kind: 'priced'; price: NumericRef; currency: 'CNY'; priceNature: 'observed-listing' | 'promotion' | 'brand-reported-launch' | 'reported-price' }
  | { kind: 'unknown'; priceNature: 'unknown'; reason: string }
);
export type R2Image = { id: string; caseId: string; path: string; sha256: string; sourceId: string; identityLabel: string; alt: string };
export type R2Case = { id: string; title: string; skuId: string; imageId: string; priceQuoteIds: string[]; sourceIds: string[]; datumIds: string[]; observation: string; comparisonUse: string; scope: string; locator: string; limits: string; transfer: null | { match: string; difference: string; use: string; cannotProve: string } };
export type QingyuR2Report = {
  id: string; revision: { number: 2; basedOnBriefVersion: 1; storedArtifactId: 'art-qingyu-research-v1'; authoredAt: string; skillId: string; skillRevision: string };
  title: string; subtitle: string; asOf: string; status: '研究待补'; lead: string; scopeNote: string;
  sources: QingyuSource[]; datums: QingyuDatum[]; findings: QingyuFinding[]; gaps: QingyuGap[];
  sections: QingyuSection[]; charts: R2Chart[]; questions: R2Question[]; skus: R2Sku[];
  priceScope: string; prices: R2Price[]; imageManifest: R2Image[]; cases: R2Case[];
  notes: { label: string; methodology: string[]; methodReferenceDatumIds: string[]; correctionsApplied: string[]; priorChecks: { role: string; scope: string }[] };
};
export type QingyuR2Parsed = { kind: 'valid'; report: QingyuR2Report } | { kind: 'invalid'; message: string };

function isObject(input: unknown): input is Record<string, unknown> { return typeof input === 'object' && input !== null && !Array.isArray(input); }
function object(input: unknown): Record<string, unknown> {
  if (!isObject(input)) throw new Error('Expected object');
  return input;
}
function text(input: unknown): string { if (typeof input !== 'string' || !input.trim()) throw new Error('Expected text'); return input; }
function number(input: unknown): number { if (typeof input !== 'number' || !Number.isFinite(input)) throw new Error('Expected finite number'); return input; }
function list<T>(input: unknown, parse: (input: unknown) => T): T[] { if (!Array.isArray(input)) throw new Error('Expected list'); return input.map(parse); }
const strings = (input: unknown) => list(input, text);
const nullableText = (input: unknown) => input === null ? null : text(input);
function https(input: unknown): string { const value = text(input); if (new URL(value).protocol !== 'https:') throw new Error('Expected HTTPS source'); return value; }
function numericRef(input: unknown): NumericRef { const v = object(input); return { datumId: text(v.datumId), valuePath: nullableText(v.valuePath) }; }
function evidenceKind(input: unknown): EvidenceKind {
  if (input === 'published-report' || input === 'visual-observation' || input === 'brand-self-description' || input === 'research-synthesis' || input === 'brief-condition' || input === 'brief-derived' || input === 'method-reference') return input;
  throw new Error('Unknown evidence kind');
}
function source(input: unknown): QingyuSource {
  const v = object(input); const id = text(v.id);
  if (v.url === null && id !== 'BRIEF-S1') throw new Error('Only the brief may have no URL');
  return { id, title: text(v.title), publisher: text(v.publisher), url: v.url === null ? null : https(v.url), published: nullableText(v.published), dataPeriod: nullableText(v.dataPeriod), market: text(v.market), population: text(v.population), method: text(v.method), access: text(v.access), locator: text(v.locator), use: nullableText(v.use) };
}
function datum(input: unknown): QingyuDatum {
  const v = object(input); const scope = object(v.scope);
  const value = v.value === null ? null : typeof v.value === 'number' ? number(v.value) : Object.fromEntries(Object.entries(object(v.value)).map(([key, value]) => [key, number(value)]));
  return { id: text(v.id), text: text(v.text), value, unit: nullableText(v.unit), basis: nullableText(v.basis), limits: text(v.limits), sourceIds: strings(v.sourceIds), derivedFrom: v.derivedFrom === undefined ? [] : strings(v.derivedFrom), locator: text(v.locator), scope: { market: text(scope.market), period: text(scope.period), population: text(scope.population) }, evidenceType: evidenceKind(v.evidenceType) };
}
function finding(input: unknown): QingyuFinding { const v = object(input); return { id: text(v.id), title: text(v.title), text: text(v.text), datumIds: strings(v.datumIds), sourceIds: strings(v.sourceIds), locator: text(v.locator), scope: text(v.scope), kind: evidenceKind(v.kind), implication: text(v.implication) }; }
function gap(input: unknown): QingyuGap { const v = object(input); if (v.status !== '待补') throw new Error('Gap cannot be approved'); return { id: text(v.id), title: text(v.title), text: text(v.text), scope: text(v.scope), consequence: text(v.consequence), sourceIds: strings(v.sourceIds), locator: text(v.locator) }; }
function sectionId(input: unknown): QingyuSection['id'] { if (input === 'market' || input === 'people' || input === 'competition' || input === 'product' || input === 'conclusion') return input; throw new Error('Unknown section'); }
function section(input: unknown): QingyuSection {
  const v = object(input);
  return { id: sectionId(v.id), title: text(v.title), headline: text(v.headline), conclusion: text(v.conclusion), findingIds: strings(v.findingIds), datumIds: strings(v.datumIds), chartIds: strings(v.chartIds), caseIds: strings(v.caseIds), gapIds: strings(v.gapIds), footnote: text(v.footnote), support: v.support === undefined ? [] : list(v.support, input => { const p = object(input); return { text: text(p.text), datumIds: strings(p.datumIds) }; }), conditions: v.conditions === undefined ? [] : list(v.conditions, input => { const p = object(input); return { label: text(p.label), value: text(p.value), evidence: text(p.evidence) }; }), takeaways: v.takeaways === undefined ? [] : list(v.takeaways, input => { const p = object(input); return { text: text(p.text), findingIds: strings(p.findingIds) }; }) };
}
function chart(input: unknown): R2Chart {
  const v = object(input); if (v.type !== 'bar' && v.type !== 'metrics') throw new Error('Unknown chart type');
  return { id: text(v.id), type: v.type, title: text(v.title), metricLabel: text(v.metricLabel), unit: text(v.unit), period: text(v.period), comparison: text(v.comparison), channel: text(v.channel), population: text(v.population), sourceIds: strings(v.sourceIds), scope: text(v.scope), caption: text(v.caption), locator: text(v.locator), rows: list(v.rows, input => { const r = object(input); return { label: text(r.label), value: number(r.value), ...numericRef(r) }; }) };
}
function questionId(input: unknown): R2QuestionId { if (input === 'M1' || input === 'M2' || input === 'P1' || input === 'P2' || input === 'C1' || input === 'C2' || input === 'C3' || input === 'R1' || input === 'S1') return input; throw new Error('Unknown question'); }
function question(input: unknown): R2Question {
  const v = object(input); if (v.answerStatus !== 'answered' && v.answerStatus !== 'partial' && v.answerStatus !== 'unanswered') throw new Error('Unknown answer status');
  return { id: questionId(v.id), question: text(v.question), answerStatus: v.answerStatus, answer: text(v.answer), findingIds: strings(v.findingIds), datumIds: strings(v.datumIds), gapIds: strings(v.gapIds) };
}
function sku(input: unknown): R2Sku {
  const v = object(input); if (v.category !== 'strict-tea' && v.category !== 'adjacent') throw new Error('Unknown category');
  return { id: text(v.id), title: text(v.title), category: v.category, categoryLabel: text(v.categoryLabel), capacity: v.capacity === null ? null : numericRef(v.capacity), packCount: v.packCount === null ? null : numericRef(v.packCount), datumIds: strings(v.datumIds) };
}
function price(input: unknown): R2Price {
  const v = object(input); const base = { id: text(v.id), skuId: text(v.skuId), quotedAt: text(v.quotedAt), publishedAt: nullableText(v.publishedAt), readAt: text(v.readAt), channel: text(v.channel), conditions: text(v.conditions), sourceId: text(v.sourceId), locator: text(v.locator) };
  if (v.kind === 'unknown' && v.priceNature === 'unknown') {
    if ('price' in v || 'currency' in v) throw new Error('Unknown quote must not have a price');
    return { ...base, kind: 'unknown', priceNature: 'unknown', reason: text(v.reason) };
  }
  if (v.kind !== 'priced' || v.currency !== 'CNY' || (v.priceNature !== 'observed-listing' && v.priceNature !== 'promotion' && v.priceNature !== 'brand-reported-launch' && v.priceNature !== 'reported-price')) throw new Error('Unknown quote nature');
  return { ...base, kind: 'priced', price: numericRef(v.price), currency: 'CNY', priceNature: v.priceNature };
}
function image(input: unknown): R2Image {
  const v = object(input); const path = text(v.path); const sha256 = text(v.sha256);
  if (!/^\/research-case\/qingyu-pack-r2-20261109\/[A-Za-z0-9_-]+\.(png|jpg|jpeg|webp)$/.test(path) || !/^[0-9a-f]{64}$/.test(sha256)) throw new Error('Invalid original image identity');
  return { id: text(v.id), caseId: text(v.caseId), path, sha256, sourceId: text(v.sourceId), identityLabel: text(v.identityLabel), alt: text(v.alt) };
}
function productCase(input: unknown): R2Case {
  const v = object(input); const transfer = v.transfer === null ? null : object(v.transfer);
  return { id: text(v.id), title: text(v.title), skuId: text(v.skuId), imageId: text(v.imageId), priceQuoteIds: strings(v.priceQuoteIds), sourceIds: strings(v.sourceIds), datumIds: strings(v.datumIds), observation: text(v.observation), comparisonUse: text(v.comparisonUse), scope: text(v.scope), locator: text(v.locator), limits: text(v.limits), transfer: transfer === null ? null : { match: text(transfer.match), difference: text(transfer.difference), use: text(transfer.use), cannotProve: text(transfer.cannotProve) } };
}
export function r2Value(report: Pick<QingyuR2Report, 'datums'>, ref: NumericRef): number {
  const value = byId(report.datums, ref.datumId).value;
  if (ref.valuePath === null) return number(value);
  if (value === null || typeof value === 'number' || !Object.hasOwn(value, ref.valuePath)) throw new Error('Missing numeric path');
  return number(value[ref.valuePath]);
}
function validate(report: QingyuR2Report) {
  for (const items of [report.sources, report.datums, report.findings, report.gaps, report.sections, report.charts, report.questions, report.skus, report.prices, report.imageManifest, report.cases]) {
    if (new Set(items.map(item => item.id)).size !== items.length) throw new Error('Duplicate ID');
  }
  const refs = <T extends { id: string }>(ids: string[], items: T[]) => ids.forEach(id => byId(items, id));
  report.datums.forEach(d => { refs(d.sourceIds, report.sources); refs(d.derivedFrom, report.datums); });
  report.findings.forEach(f => { refs(f.datumIds, report.datums); refs(f.sourceIds, report.sources); });
  report.gaps.forEach(g => refs(g.sourceIds, report.sources));
  report.charts.forEach(c => {
    refs(c.sourceIds, report.sources); if (!c.rows.length) throw new Error('Empty chart');
    c.rows.forEach(row => {
      const d = byId(report.datums, row.datumId);
      if (row.value !== r2Value(report, row) || c.unit !== d.unit || c.type === 'bar' && row.value < 0) throw new Error('Chart value or unit differs from datum');
      if (d.sourceIds.some(id => !c.sourceIds.includes(id))) throw new Error('Chart source mismatch');
    });
  });
  const skuValue = (s: R2Sku, ref: NumericRef, unit: string) => {
    const d = byId(report.datums, ref.datumId); const value = r2Value(report, ref);
    if (!s.datumIds.includes(ref.datumId) || d.unit !== unit || value <= 0) throw new Error('SKU numeric identity mismatch');
    return value;
  };
  report.skus.forEach(s => {
    refs(s.datumIds, report.datums);
    if (s.capacity !== null) skuValue(s, s.capacity, 'ml');
    if (s.packCount !== null && !Number.isInteger(skuValue(s, s.packCount, '瓶'))) throw new Error('Invalid pack count');
  });
  report.prices.forEach(p => {
    const s = byId(report.skus, p.skuId); byId(report.sources, p.sourceId);
    if (p.kind === 'priced') {
      skuValue(s, p.price, '元');
      if (!byId(report.datums, p.price.datumId).sourceIds.includes(p.sourceId)) throw new Error('Quote source mismatch');
    }
  });
  report.imageManifest.forEach(i => {
    const c = byId(report.cases, i.caseId); const source = byId(report.sources, i.sourceId);
    if (source.url === null) throw new Error('Image must have a public source');
    if (c.imageId !== i.id || !c.sourceIds.includes(i.sourceId)) throw new Error('Image case/source mismatch');
  });
  report.cases.forEach(c => {
    const s = byId(report.skus, c.skuId); const i = byId(report.imageManifest, c.imageId);
    refs(c.sourceIds, report.sources); refs(c.datumIds, report.datums);
    if (i.caseId !== c.id || s.category === 'adjacent' && c.transfer === null) throw new Error('Case identity or transfer mismatch');
    c.priceQuoteIds.forEach(id => { if (byId(report.prices, id).skuId !== c.skuId) throw new Error('Case quote SKU mismatch'); });
  });
  report.questions.forEach(q => {
    refs(q.findingIds, report.findings); refs(q.datumIds, report.datums); refs(q.gapIds, report.gaps);
    if (q.answerStatus !== 'answered' && !q.gapIds.length || q.answerStatus === 'answered' && !q.findingIds.length && !q.datumIds.length) throw new Error('Answer lacks evidence or gap');
  });
  const questionIds: R2QuestionId[] = ['M1', 'M2', 'P1', 'P2', 'C1', 'C2', 'C3', 'R1', 'S1'];
  if (report.questions.length !== questionIds.length || questionIds.some(id => !report.questions.some(q => q.id === id))) throw new Error('Expected nine questions');
  const sectionIds = ['market', 'people', 'competition', 'product', 'conclusion'];
  if (report.sections.length !== 5 || report.sections.some((s, index) => s.id !== sectionIds[index])) throw new Error('Expected five ordered sections');
  report.sections.forEach(s => {
    refs(s.findingIds, report.findings); refs(s.datumIds, report.datums); refs(s.chartIds, report.charts); refs(s.caseIds, report.cases); refs(s.gapIds, report.gaps);
    s.support.forEach(p => refs(p.datumIds, report.datums)); s.takeaways.forEach(p => refs(p.findingIds, report.findings));
  });
  refs(report.notes.methodReferenceDatumIds, report.datums);
}
export function parseQingyuR2(input: unknown): QingyuR2Parsed {
  try {
    const v = object(input); const r = object(v.revision); const n = object(v.evidenceNotes);
    if (v.schemaVersion !== 2 || v.id !== 'qingyu-packaging-public-report-r2-20261109' || v.status !== '研究待补' || r.number !== 2 || r.basedOnBriefVersion !== 1 || r.storedArtifactId !== 'art-qingyu-research-v1' || n.defaultCollapsed !== true) throw new Error('Invalid revision identity');
    const report: QingyuR2Report = {
      id: text(v.id), revision: { number: 2, basedOnBriefVersion: 1, storedArtifactId: 'art-qingyu-research-v1', authoredAt: text(r.authoredAt), skillId: text(r.skillId), skillRevision: text(r.skillRevision) },
      title: text(v.title), subtitle: text(v.subtitle), asOf: text(v.asOf), status: '研究待补', lead: text(v.lead), scopeNote: text(v.scopeNote),
      sources: list(v.sources, source), datums: list(v.datums, datum), findings: list(v.findings, finding), gaps: list(v.gaps, gap), sections: list(v.sections, section), charts: list(v.charts, chart), questions: list(v.questions, question), skus: list(v.skus, sku), priceScope: text(v.priceScope), prices: list(v.prices, price), imageManifest: list(v.imageManifest, image), cases: list(v.cases, productCase),
      notes: { label: text(n.label), methodology: strings(n.methodology), methodReferenceDatumIds: strings(n.methodReferenceDatumIds), correctionsApplied: strings(n.correctionsApplied), priorChecks: list(n.priorChecks, input => { const c = object(input); return { role: text(c.role), scope: text(c.scope) }; }) },
    };
    validate(report); return { kind: 'valid', report };
  } catch (error) { return { kind: 'invalid', message: error instanceof Error ? error.message : 'Invalid report' }; }
}
