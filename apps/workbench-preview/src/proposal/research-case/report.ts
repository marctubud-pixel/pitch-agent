import rawReport from './luma-report.json';
import { caseBinding, resolveCaseBinding, type CaseBindingResult } from './binding';

export type CaseSource = { id: string; title: string; publisher: string; url: string; published: string | null; accessedOn: string; geography: string; method: string; limitations: string[] };
type DatumBase = { id: string; label: string; value: number; unit: string; period: string; geography: string; population: string };
export type CaseDatum = DatumBase & ({ basis: 'reported'; sourceId: string; locator: string } | { basis: 'calculated'; formula: string; inputDatumIds: [string, string] });
export type CaseAssumption = { id: string; text: string } & ({ kind: 'brief'; field: string } | { kind: 'case-assumption'; reason: string });
export type CaseFinding = { id: string; text: string; limitations: string[] } & ({ kind: 'public-fact'; sourceIds: string[]; context: { kind: 'source-page' } | { kind: 'inspected-image'; locator: string; image: string } } | { kind: 'analysis'; premiseIds: string[] });
export type CaseSegment = { id: string; title: string; task: string; barrier: string; packaging: string; premiseIds: string[]; test: string };
export type CaseProduct = { id: string; name: string; type: string; sourceId: string; url: string; availability: string; visual: string; signal: string; caveat: string; datumIds: { volume: string; abv: string; price: string; 'unit-price': string }; image: string; observationId: string };
type FigureBase = { id: string; title: string; description: string; note: string };
export type CaseStep = { label: string; text: string; premiseIds: string[] };
export type CaseDirection = { id: string; title: string; visual: string; because: string; premiseIds: string[]; test: string };
export type CaseFigure = FigureBase & (
  | { kind: 'signed-bars'; unit: string; datumIds: string[]; min: number; max: number }
  | { kind: 'bars'; unit: string; datumIds: string[]; max: number }
  | { kind: 'segments'; segmentIds: string[] }
  | { kind: 'scatter'; xLabel: string; yLabel: string; xMax: number; yMax: number; productIds: string[] }
  | { kind: 'products' | 'references' | 'packaging-matrix'; productIds: string[] }
  | { kind: 'hierarchy' | 'chain'; steps: CaseStep[] }
  | { kind: 'directions'; items: CaseDirection[] }
);
export type SectionId = 'market' | 'segments' | 'competitors' | 'product-packaging' | 'breakthrough';
export type CaseSection = { id: SectionId; title: string; headlineId: string; summary: string; findingIds: string[]; figures: CaseFigure[]; callouts: { text: string; datumId: string }[] };
export type CaseReport = { schemaVersion: 1; id: `case-report:${string}`; edition: number; authoredOn: string; title: string; subtitle: string; provenance: 'authored-desk-research'; fictionalBrand: true; scopeNote: string; binding: { projectId: string; expectedHead: { artifactId: string; version: number; briefVersion: number }; acceptedBriefSnapshotsFrom: string }; assumptions: CaseAssumption[]; sources: CaseSource[]; datums: CaseDatum[]; findings: CaseFinding[]; segments: CaseSegment[]; products: CaseProduct[]; sections: [CaseSection, CaseSection, CaseSection, CaseSection, CaseSection] };
export type ParsedCase = { kind: 'valid'; report: CaseReport } | { kind: 'invalid'; message: string };

function isRecord(raw: unknown): raw is Record<string, unknown> { return typeof raw === 'object' && raw !== null && !Array.isArray(raw); }
function record(raw: unknown): Record<string, unknown> {
  if (!isRecord(raw)) throw new Error('Expected object');
  return raw;
}
function string(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) throw new Error('Expected nonempty text');
  return raw;
}
function number(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) throw new Error('Expected finite number');
  return raw;
}
function list<T>(raw: unknown, parse: (item: unknown) => T): T[] {
  if (!Array.isArray(raw)) throw new Error('Expected list');
  return raw.map(parse);
}
const strings = (raw: unknown) => list(raw, string);
function nonemptyStrings(raw: unknown): string[] {
  const parsed = strings(raw);
  if (!parsed.length) throw new Error('Expected at least one reference');
  return parsed;
}
function httpsUrl(raw: unknown): string {
  const value = string(raw);
  if (new URL(value).protocol !== 'https:') throw new Error('Expected HTTPS source');
  return value;
}
function positiveInteger(raw: unknown): number {
  const value = number(raw);
  if (!Number.isInteger(value) || value < 1) throw new Error('Expected positive version');
  return value;
}
function reportId(raw: unknown): raw is `case-report:${string}` { return typeof raw === 'string' && /^case-report:[a-z0-9-]+$/.test(raw); }
function sectionId(raw: unknown): SectionId {
  if (raw === 'market' || raw === 'segments' || raw === 'competitors' || raw === 'product-packaging' || raw === 'breakthrough') return raw;
  throw new Error('Unknown chapter');
}
function source(raw: unknown): CaseSource {
  const value = record(raw);
  return { id: string(value.id), title: string(value.title), publisher: string(value.publisher), url: httpsUrl(value.url), published: value.published === null ? null : string(value.published), accessedOn: string(value.accessedOn), geography: string(value.geography), method: string(value.method), limitations: strings(value.limitations) };
}
function datum(raw: unknown): CaseDatum {
  const value = record(raw);
  const base = { id: string(value.id), label: string(value.label), value: number(value.value), unit: string(value.unit), period: string(value.period), geography: string(value.geography), population: string(value.population) };
  if (value.basis === 'reported') return { ...base, basis: 'reported', sourceId: string(value.sourceId), locator: string(value.locator) };
  if (value.basis === 'calculated') {
    const inputs = strings(value.inputDatumIds);
    if (inputs.length !== 2) throw new Error('Unit price needs price and volume');
    return { ...base, basis: 'calculated', formula: string(value.formula), inputDatumIds: [inputs[0], inputs[1]] };
  }
  throw new Error('Unknown numeric basis');
}
function finding(raw: unknown): CaseFinding {
  const value = record(raw);
  const base = { id: string(value.id), text: string(value.text), limitations: strings(value.limitations) };
  if (value.kind === 'public-fact') return { ...base, kind: 'public-fact', sourceIds: nonemptyStrings(value.sourceIds), context: value.locator === undefined && value.image === undefined ? { kind: 'source-page' } : { kind: 'inspected-image', locator: string(value.locator), image: string(value.image) } };
  if (value.kind === 'analysis') return { ...base, kind: 'analysis', premiseIds: nonemptyStrings(value.premiseIds) };
  throw new Error('Unknown finding kind');
}
function assumption(raw: unknown): CaseAssumption {
  const value = record(raw);
  const base = { id: string(value.id), text: string(value.text) };
  if (value.kind === 'brief') return { ...base, kind: 'brief', field: string(value.field) };
  if (value.kind === 'case-assumption') return { ...base, kind: 'case-assumption', reason: string(value.reason) };
  throw new Error('Unknown assumption kind');
}
function segment(raw: unknown): CaseSegment {
  const value = record(raw);
  return { id: string(value.id), title: string(value.title), task: string(value.task), barrier: string(value.barrier), packaging: string(value.packaging), premiseIds: nonemptyStrings(value.premiseIds), test: string(value.test) };
}
function product(raw: unknown): CaseProduct {
  const value = record(raw);
  const ids = record(value.datumIds);
  const image = string(value.image);
  if (!/^\/research-case\/luma-uk-20261109\/[a-z0-9-]+\.jpg$/.test(image)) throw new Error('Unexpected reference image path');
  return { id: string(value.id), name: string(value.name), type: string(value.type), sourceId: string(value.sourceId), url: httpsUrl(value.url), availability: string(value.availability), visual: string(value.visual), signal: string(value.signal), caveat: string(value.caveat), datumIds: { volume: string(ids.volume), abv: string(ids.abv), price: string(ids.price), 'unit-price': string(ids['unit-price']) }, image, observationId: string(value.observationId) };
}
function step(raw: unknown): CaseStep {
  const value = record(raw);
  return { label: string(value.label), text: string(value.text), premiseIds: nonemptyStrings(value.premiseIds) };
}
function direction(raw: unknown): CaseDirection {
  const value = record(raw);
  return { id: string(value.id), title: string(value.title), visual: string(value.visual), because: string(value.because), premiseIds: nonemptyStrings(value.premiseIds), test: string(value.test) };
}
function figure(raw: unknown): CaseFigure {
  const value = record(raw);
  const base = { id: string(value.id), title: string(value.title), description: string(value.description), note: string(value.note) };
  const kind = value.kind;
  if (kind === 'signed-bars') return { ...base, kind, unit: string(value.unit), datumIds: nonemptyStrings(value.datumIds), min: number(value.min), max: number(value.max) };
  if (kind === 'bars') return { ...base, kind, unit: string(value.unit), datumIds: nonemptyStrings(value.datumIds), max: number(value.max) };
  if (kind === 'segments') return { ...base, kind, segmentIds: nonemptyStrings(value.segmentIds) };
  if (kind === 'scatter') return { ...base, kind, xLabel: string(value.xLabel), yLabel: string(value.yLabel), xMax: number(value.xMax), yMax: number(value.yMax), productIds: nonemptyStrings(value.productIds) };
  if (kind === 'products' || kind === 'references' || kind === 'packaging-matrix') return { ...base, kind, productIds: nonemptyStrings(value.productIds) };
  if (kind === 'hierarchy' || kind === 'chain') return { ...base, kind, steps: list(value.steps, step) };
  if (kind === 'directions') return { ...base, kind, items: list(value.items, direction) };
  throw new Error('Unknown figure kind');
}
function section(raw: unknown): CaseSection {
  const value = record(raw);
  return { id: sectionId(value.id), title: string(value.title), headlineId: string(value.headlineId), summary: string(value.summary), findingIds: strings(value.findingIds), figures: list(value.figures, figure), callouts: value.callouts === undefined ? [] : list(value.callouts, rawCallout => { const callout = record(rawCallout); return { text: string(callout.text), datumId: string(callout.datumId) }; }) };
}
function uniqueIds(values: { id: string }[], label: string) {
  if (new Set(values.map(value => value.id)).size !== values.length) throw new Error(`Duplicate ${label} ID`);
}
function requireRef<T>(map: Map<string, T>, id: string): T {
  const value = map.get(id);
  if (value === undefined) throw new Error(`Missing reference ${id}`);
  return value;
}

function validateReferences(report: CaseReport) {
  const sources = new Map(report.sources.map(item => [item.id, item]));
  const datums = new Map(report.datums.map(item => [item.id, item]));
  const findings = new Map(report.findings.map(item => [item.id, item]));
  const assumptions = new Map(report.assumptions.map(item => [item.id, item]));
  const products = new Map(report.products.map(item => [item.id, item]));
  const segments = new Map(report.segments.map(item => [item.id, item]));
  uniqueIds([...report.datums, ...report.findings, ...report.assumptions], 'premise');
  for (const [items, label] of [[report.sources, 'source'], [report.products, 'product'], [report.segments, 'segment']] satisfies [{ id: string }[], string][]) uniqueIds(items, label);
  uniqueIds(report.sections.flatMap(item => item.figures), 'figure');
  const checkPremise = (id: string) => { if (!datums.has(id) && !findings.has(id) && !assumptions.has(id)) throw new Error(`Missing premise ${id}`); };
  report.datums.forEach(item => {
    if (item.basis === 'reported') requireRef(sources, item.sourceId);
    else {
      const price = requireRef(datums, item.inputDatumIds[0]);
      const volume = requireRef(datums, item.inputDatumIds[1]);
      if (item.unit !== 'GBP/100ml' || price.unit !== 'GBP/罐' || volume.unit !== 'ml' || volume.value <= 0 || item.formula !== '单罐标价 ÷ 容量ml × 100' || Math.abs(item.value - price.value / volume.value * 100) > 1e-10) throw new Error(`Invalid unit-price derivation ${item.id}`);
    }
    if ((item.unit.startsWith('%') || item.unit === '销量同比%') && (item.value > 100 || item.value < -100)) throw new Error('Percentage out of range');
  });
  report.findings.forEach(item => item.kind === 'public-fact' ? item.sourceIds.forEach(id => requireRef(sources, id)) : item.premiseIds.forEach(checkPremise));
  const visit = (id: string, path: Set<string>) => {
    if (path.has(id)) throw new Error(`Cyclic analysis ${id}`);
    const item = findings.get(id);
    if (item?.kind === 'analysis') item.premiseIds.forEach(next => visit(next, new Set([...path, id])));
  };
  report.findings.forEach(item => visit(item.id, new Set()));
  report.segments.forEach(item => item.premiseIds.forEach(checkPremise));
  report.products.forEach(item => {
    if (requireRef(sources, item.sourceId).url !== item.url) throw new Error('Product source URL mismatch');
    const observation = requireRef(findings, item.observationId);
    if (observation.kind !== 'public-fact' || observation.context.kind !== 'inspected-image' || observation.context.image !== item.image || !observation.sourceIds.includes(item.sourceId) || observation.text !== item.visual) throw new Error('Packaging observation must match inspected source image');
    const expectedUnits = { volume: 'ml', abv: '% ABV', price: 'GBP/罐', 'unit-price': 'GBP/100ml' };
    for (const key of ['volume', 'abv', 'price', 'unit-price'] satisfies (keyof CaseProduct['datumIds'])[]) {
      const measured = requireRef(datums, item.datumIds[key]);
      if (measured.unit !== expectedUnits[key] || measured.value < 0) throw new Error(`Invalid product metric ${item.id}`);
      if (key === 'unit-price') {
        if (measured.basis !== 'calculated' || measured.inputDatumIds[0] !== item.datumIds.price || measured.inputDatumIds[1] !== item.datumIds.volume) throw new Error(`Product unit-price inputs mismatch ${item.id}`);
      } else if (measured.basis !== 'reported' || measured.sourceId !== item.sourceId) throw new Error('Product metric source mismatch');
    }
  });
  for (const chapter of report.sections) {
    if (requireRef(findings, chapter.headlineId).kind !== 'analysis' || !chapter.figures.length) throw new Error('Chapter must lead with analysis and concrete content');
    chapter.findingIds.forEach(id => requireRef(findings, id));
    chapter.callouts.forEach(item => requireRef(datums, item.datumId));
    for (const item of chapter.figures) {
      switch (item.kind) {
        case 'signed-bars':
        case 'bars': {
          const min = item.kind === 'signed-bars' ? item.min : 0;
          if (min > 0 || item.max <= 0 || min >= item.max) throw new Error('Chart must contain zero');
          item.datumIds.forEach(id => { const measured = requireRef(datums, id); if (measured.value < min || measured.value > item.max) throw new Error('Chart clips data'); });
          const units = new Set(item.datumIds.map(id => requireRef(datums, id).unit));
          if (units.size !== 1) throw new Error('Mixed bar chart units');
          break;
        }
        case 'segments': item.segmentIds.forEach(id => requireRef(segments, id)); break;
        case 'scatter':
          if (item.xMax <= 0 || item.yMax <= 0) throw new Error('Invalid scatter axis');
          item.productIds.forEach(id => { const selected = requireRef(products, id); if (requireRef(datums, selected.datumIds.price).value > item.xMax || requireRef(datums, selected.datumIds.abv).value > item.yMax) throw new Error('Scatter clips data'); });
          break;
        case 'products':
        case 'references':
        case 'packaging-matrix': item.productIds.forEach(id => requireRef(products, id)); break;
        case 'hierarchy':
        case 'chain': if (!item.steps.length) throw new Error('Empty inference'); else item.steps.forEach(step => step.premiseIds.forEach(checkPremise)); break;
        case 'directions': if (item.items.length !== 3) throw new Error('Expected three directions'); else item.items.forEach(direction => direction.premiseIds.forEach(checkPremise)); break;
        default: { const exhaustive: never = item; return exhaustive; }
      }
    }
  }
}

export function parseCaseReport(raw: unknown): ParsedCase {
  try {
    const value = record(raw);
    if (value.schemaVersion !== 1 || !reportId(value.id) || value.provenance !== 'authored-desk-research' || value.fictionalBrand !== true) throw new Error('Unexpected report identity');
    const binding = record(value.binding);
    const head = record(binding.expectedHead);
    if (binding.projectId !== caseBinding.projectId || head.artifactId !== caseBinding.artifactId || head.version !== caseBinding.artifactVersion || head.briefVersion !== caseBinding.briefVersion) throw new Error('Unexpected report anchor');
    const chapters = list(value.sections, section);
    const [market, segments, competitors, packaging, breakthrough] = chapters;
    if (chapters.length !== 5 || market.id !== 'market' || segments.id !== 'segments' || competitors.id !== 'competitors' || packaging.id !== 'product-packaging' || breakthrough.id !== 'breakthrough') throw new Error('Expected ordered five chapters');
    const report: CaseReport = { schemaVersion: 1, id: value.id, edition: positiveInteger(value.edition), authoredOn: string(value.authoredOn), title: string(value.title), subtitle: string(value.subtitle), provenance: 'authored-desk-research', fictionalBrand: true, scopeNote: string(value.scopeNote), binding: { projectId: string(binding.projectId), expectedHead: { artifactId: string(head.artifactId), version: positiveInteger(head.version), briefVersion: positiveInteger(head.briefVersion) }, acceptedBriefSnapshotsFrom: string(binding.acceptedBriefSnapshotsFrom) }, assumptions: list(value.assumptions, assumption), sources: list(value.sources, source), datums: list(value.datums, datum), findings: list(value.findings, finding), segments: list(value.segments, segment), products: list(value.products, product), sections: [market, segments, competitors, packaging, breakthrough] };
    validateReferences(report);
    return { kind: 'valid', report };
  } catch (error) { return { kind: 'invalid', message: error instanceof Error ? error.message : 'Invalid authored report' }; }
}

export const authoredLumaCase = parseCaseReport(rawReport);
export type CaseResolution = Extract<CaseBindingResult, { kind: 'available' }> & { report: CaseReport } | Exclude<CaseBindingResult, { kind: 'available' }> | { kind: 'unavailable'; reason: 'invalid-bundle'; message: string };
export function resolveAuthoredCase(input: Parameters<typeof resolveCaseBinding>[0]): CaseResolution {
  if (authoredLumaCase.kind === 'invalid') return { kind: 'unavailable', reason: 'invalid-bundle', message: '公开资料案例未通过完整性检查，暂不展示正文。既有研究记录仍可查阅。' };
  const binding = resolveCaseBinding(input);
  return binding.kind === 'available' ? { ...binding, report: authoredLumaCase.report } : binding;
}

export function datumFor(report: CaseReport, id: string): CaseDatum { return requireRef(new Map(report.datums.map(item => [item.id, item])), id); }
export function findingFor(report: CaseReport, id: string): CaseFinding { return requireRef(new Map(report.findings.map(item => [item.id, item])), id); }
export function productsFor(report: CaseReport, ids: string[]): CaseProduct[] { const products = new Map(report.products.map(item => [item.id, item])); return ids.map(id => requireRef(products, id)); }
export function sourceIdsFor(report: CaseReport, ids: string[]): string[] {
  const sources = new Set<string>();
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const datum = report.datums.find(item => item.id === id);
    const finding = report.findings.find(item => item.id === id);
    if (datum?.basis === 'reported') sources.add(datum.sourceId);
    if (datum?.basis === 'calculated') datum.inputDatumIds.forEach(visit);
    if (finding?.kind === 'public-fact') finding.sourceIds.forEach(source => sources.add(source));
    if (finding?.kind === 'analysis') finding.premiseIds.forEach(visit);
    if (report.sources.some(item => item.id === id)) sources.add(id);
  };
  ids.forEach(visit);
  return report.sources.filter(item => sources.has(item.id)).map(item => item.id);
}
