export type R3Source = { id: string; title: string; publisher: string; url: string | null; published: string | null; dataPeriod: string; market: string; population: string; method: string; access: string; locator: string; limits: string };
export type R3EvidenceType = 'published-report' | 'visual-observation' | 'brand-self-description' | 'brief-condition';
export const r3EvidenceLabels: Record<R3EvidenceType, string> = { 'published-report': '公开资料引述', 'visual-observation': '原件视觉观察', 'brand-self-description': '品牌自述', 'brief-condition': '虚构任务条件' };
export type R3Fact = { id: string; text: string; sourceIds: string[]; locator: string; scope: string; limits: string; evidenceType: R3EvidenceType; quantity: null | { value: number; unit: string; basis: string }; derivedFrom: string[] };
export type R3Finding = { id: string; title: string; text: string; factIds: string[]; sourceIds: string[]; scope: string; limits: string; kind: 'synthesis' | 'public-finding' | 'brief-condition' };
export type R3Gap = { id: string; title: string; text: string; consequence: string };
export type R3Media = { id: string; path: string; sha256: string; mime: string; width: number; height: number; title: string; sku: string; capacity: string; sourceId: string; sourceUrl: string; identity: string; alt: string; limits: string; role: 'original-product' };
type BlockBase = { id: string; title: string; subtitle: string; scope: string; caveat: string; factIds: string[]; findingIds: string[]; gapIds: string[]; method: string };
export type R3Block = BlockBase & (
  { kind: 'chart'; chartType: 'bar' | 'line'; unit: string; rows: { label: string; factId: string }[] }
  | { kind: 'cards'; items: { label: string; factIds: string[]; findingIds: string[]; gapIds: string[] }[] }
  | { kind: 'comparison'; columns: string[]; rows: { label: string; cells: { factIds: string[] }[] }[] }
  | { kind: 'products'; mediaIds: string[]; observations: { mediaId: string; factIds: string[] }[] }
);
export type R3Chapter = { id: 'market' | 'people' | 'competition' | 'product' | 'conclusion'; title: string; headline: string; summary: string; findingIds: string[]; gapIds: string[]; blocks: R3Block[] };
export type QingyuR3Report = { schemaVersion: 3; id: 'qingyu-packaging-public-report-r3-20261109'; binding: { briefVersion: 1; storedArtifactId: 'art-qingyu-research-v1' }; origin: { skillRevision: 'r5-20261109'; adoptionSha256: string; branchReceiptPaths: string[] }; title: string; subtitle: string; asOf: string; status: '研究待补'; lead: string; scopeNote: string; sources: R3Source[]; facts: R3Fact[]; findings: R3Finding[]; gaps: R3Gap[]; media: R3Media[]; chapters: R3Chapter[] };
export type QingyuR3Parsed = { kind: 'valid'; report: QingyuR3Report } | { kind: 'invalid'; message: string };
export const R3_ADOPTION_SHA = 'ba6b290c6e5781e8486189909e3b19818e08d974256f6f08dcf95295be7c8db5';

function isObject(v: unknown): v is Record<string, unknown> { return typeof v === 'object' && v !== null && !Array.isArray(v); }
function object(v: unknown): Record<string, unknown> { if (!isObject(v)) throw new Error('应为对象'); return v; }
function string(v: unknown): string { if (typeof v !== 'string') throw new Error('应为文本'); return v; }
function text(v: unknown): string { const s = string(v); if (!s.trim()) throw new Error('核心文本不能为空'); return s; }
function number(v: unknown): number { if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error('应为有限数值'); return v; }
function list<T>(v: unknown, parse: (v: unknown) => T): T[] { if (!Array.isArray(v)) throw new Error('应为数组'); return v.map(parse); }
const ids = (v: unknown) => list(v, text);
function url(v: unknown): string { const s = text(v); if (new URL(s).protocol !== 'https:') throw new Error('来源须为HTTPS'); return s; }
function sha(v: unknown): string { const s = text(v); if (!/^[a-f0-9]{64}$/.test(s)) throw new Error('SHA256无效'); return s; }
function source(v: unknown): R3Source { const o = object(v), id = text(o.id); if ((id === 'BRIEF') !== (o.url === null)) throw new Error('仅本地任务设定来源允许无公开链接'); return { id, title: text(o.title), publisher: text(o.publisher), url: o.url === null ? null : url(o.url), published: o.published === null ? null : text(o.published), dataPeriod: text(o.dataPeriod), market: text(o.market), population: text(o.population), method: text(o.method), access: text(o.access), locator: text(o.locator), limits: text(o.limits) }; }
function evidenceType(v: unknown): R3EvidenceType { if (v === 'published-report' || v === 'visual-observation' || v === 'brand-self-description' || v === 'brief-condition') return v; throw new Error('本轮R3不支持此证据身份或题设换算'); }
function fact(v: unknown): R3Fact { const o = object(v); const q = o.quantity === null ? null : object(o.quantity); return { id: text(o.id), text: text(o.text), sourceIds: ids(o.sourceIds), locator: text(o.locator), scope: text(o.scope), limits: text(o.limits), evidenceType: evidenceType(o.evidenceType), quantity: q === null ? null : { value: number(q.value), unit: text(q.unit), basis: text(q.basis) }, derivedFrom: ids(o.derivedFrom) }; }
function finding(v: unknown): R3Finding { const o = object(v); if (o.kind !== 'synthesis' && o.kind !== 'public-finding' && o.kind !== 'brief-condition') throw new Error('未知判断类型'); return { id: text(o.id), title: text(o.title), text: text(o.text), factIds: ids(o.factIds), sourceIds: ids(o.sourceIds), scope: text(o.scope), limits: text(o.limits), kind: o.kind }; }
function gap(v: unknown): R3Gap { const o = object(v); return { id: text(o.id), title: text(o.title), text: text(o.text), consequence: text(o.consequence) }; }
function media(v: unknown): R3Media { const o = object(v); const path = text(o.path); if (!/^\/research-case\/qingyu-r3-20261109\/[a-zA-Z0-9_./-]+$/.test(path) || path.includes('..')) throw new Error('媒体路径超出R3目录'); if (o.role !== 'original-product') throw new Error('本轮产品图仅接受原产品物料'); if (o.mime !== 'image/png' && o.mime !== 'image/jpeg') throw new Error('图片格式不支持'); const width = number(o.width), height = number(o.height); if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new Error('图片尺寸无效'); return { id: text(o.id), path, sha256: sha(o.sha256), mime: o.mime, width, height, title: text(o.title), sku: text(o.sku), capacity: text(o.capacity), sourceId: text(o.sourceId), sourceUrl: url(o.sourceUrl), identity: text(o.identity), alt: text(o.alt), limits: text(o.limits), role: o.role }; }
function block(v: unknown): R3Block {
  const o = object(v); const base = { id: text(o.id), title: text(o.title), subtitle: string(o.subtitle), scope: text(o.scope), caveat: string(o.caveat), factIds: ids(o.factIds), findingIds: ids(o.findingIds), gapIds: ids(o.gapIds), method: text(o.method) };
  switch (o.kind) {
    case 'chart': { if (o.chartType !== 'bar' && o.chartType !== 'line') throw new Error('未知图表'); return { ...base, kind: 'chart', chartType: o.chartType, unit: text(o.unit), rows: list(o.rows, v => { const r = object(v); if ('value' in r) throw new Error('图表不得重复数字'); return { label: text(r.label), factId: text(r.factId) }; }) }; }
    case 'cards': return { ...base, kind: 'cards', items: list(o.items, v => { const r = object(v); return { label: text(r.label), factIds: ids(r.factIds), findingIds: ids(r.findingIds), gapIds: ids(r.gapIds) }; }) };
    case 'comparison': return { ...base, kind: 'comparison', columns: ids(o.columns), rows: list(o.rows, v => { const r = object(v); return { label: text(r.label), cells: list(r.cells, v => ({ factIds: ids(object(v).factIds) })) }; }) };
    case 'products': return { ...base, kind: 'products', mediaIds: ids(o.mediaIds), observations: list(o.observations, v => { const r = object(v); return { mediaId: text(r.mediaId), factIds: ids(r.factIds) }; }) };
    default: throw new Error('未知模块类型');
  }
}
function chapter(v: unknown): R3Chapter { const o = object(v); if (o.id !== 'market' && o.id !== 'people' && o.id !== 'competition' && o.id !== 'product' && o.id !== 'conclusion') throw new Error('未知章节'); return { id: o.id, title: text(o.title), headline: text(o.headline), summary: text(o.summary), findingIds: ids(o.findingIds), gapIds: ids(o.gapIds), blocks: list(o.blocks, block) }; }
export function r3ById<T extends { id: string }>(items: T[], id: string): T { const found = items.find(item => item.id === id); if (!found) throw new Error(`引用不存在 ${id}`); return found; }
export function r3Quantity(report: QingyuR3Report, id: string) { const q = r3ById(report.facts, id).quantity; if (q === null) throw new Error('非量化事实不能进入数值图'); return q; }
export function r3FactIds(report: QingyuR3Report, factIds: string[], findingIds: string[]): string[] {
  const facts = new Set([...factIds, ...findingIds.flatMap(id => r3ById(report.findings, id).factIds)]);
  const visit = (id: string) => r3ById(report.facts, id).derivedFrom.forEach(parent => { if (!facts.has(parent)) { facts.add(parent); visit(parent); } });
  [...facts].forEach(visit); return [...facts];
}
export function blockFindingIds(b: R3Block): string[] { return [...new Set([...b.findingIds, ...(b.kind === 'cards' ? b.items.flatMap(i => i.findingIds) : [])])]; }
export function blockFactIds(report: QingyuR3Report, b: R3Block): string[] { return r3FactIds(report, [...b.factIds, ...(b.kind === 'chart' ? b.rows.map(r => r.factId) : b.kind === 'cards' ? b.items.flatMap(i => i.factIds) : b.kind === 'comparison' ? b.rows.flatMap(r => r.cells.flatMap(c => c.factIds)) : b.observations.flatMap(o => o.factIds))], blockFindingIds(b)); }
export function blockSourceIds(report: QingyuR3Report, b: R3Block): string[] {
  return [...new Set([...blockFindingIds(b).flatMap(id => r3ById(report.findings, id).sourceIds), ...blockFactIds(report, b).flatMap(id => r3ById(report.facts, id).sourceIds), ...(b.kind === 'products' ? b.mediaIds.map(id => r3ById(report.media, id).sourceId) : [])])];
}
export function parseQingyuR3(input: unknown): QingyuR3Parsed {
  try {
    const o = object(input), binding = object(o.binding), origin = object(o.origin);
    if (o.schemaVersion !== 3 || o.id !== 'qingyu-packaging-public-report-r3-20261109' || binding.briefVersion !== 1 || binding.storedArtifactId !== 'art-qingyu-research-v1' || origin.skillRevision !== 'r5-20261109' || origin.adoptionSha256 !== R3_ADOPTION_SHA || o.status !== '研究待补') throw new Error('R3身份不匹配');
    const report: QingyuR3Report = { schemaVersion: 3, id: o.id, binding: { briefVersion: 1, storedArtifactId: binding.storedArtifactId }, origin: { skillRevision: origin.skillRevision, adoptionSha256: sha(origin.adoptionSha256), branchReceiptPaths: ids(origin.branchReceiptPaths) }, title: text(o.title), subtitle: text(o.subtitle), asOf: text(o.asOf), status: o.status, lead: text(o.lead), scopeNote: text(o.scopeNote), sources: list(o.sources, source), facts: list(o.facts, fact), findings: list(o.findings, finding), gaps: list(o.gaps, gap), media: list(o.media, media), chapters: list(o.chapters, chapter) };
    const all = [...report.sources, ...report.facts, ...report.findings, ...report.gaps, ...report.media, ...report.chapters, ...report.chapters.flatMap(c => c.blocks)];
    if (new Set(all.map(x => x.id)).size !== all.length) throw new Error('记录ID重复');
    if (report.chapters.map(c => c.id).join(',') !== 'market,people,competition,product,conclusion') throw new Error('五章顺序无效');
    const check = <T extends { id: string }>(items: T[], refs: string[]) => refs.forEach(id => r3ById(items, id));
    report.facts.forEach(f => { check(report.sources, f.sourceIds); check(report.facts, f.derivedFrom); if (!f.sourceIds.length || f.derivedFrom.includes(f.id)) throw new Error('事实依据无效'); if (f.evidenceType === 'brief-condition' ? f.quantity !== null || f.derivedFrom.length > 0 || f.sourceIds.some(id => id !== 'BRIEF') : f.sourceIds.includes('BRIEF')) throw new Error('题设条件与公开证据身份不能混用'); });
    const settled = new Set<string>();
    const visit = (id: string, ancestors: Set<string>) => { if (ancestors.has(id)) throw new Error('事实推导存在循环'); if (settled.has(id)) return; const next = new Set(ancestors); next.add(id); r3ById(report.facts, id).derivedFrom.forEach(parent => visit(parent, next)); settled.add(id); };
    report.facts.forEach(f => visit(f.id, new Set()));
    report.facts.forEach(f => { if (f.evidenceType !== 'brief-condition' && r3FactIds(report, f.derivedFrom, []).some(id => r3ById(report.facts, id).evidenceType === 'brief-condition')) throw new Error('公开事实不能由题设条件推导冒充'); });
    report.findings.forEach(f => { check(report.facts, f.factIds); check(report.sources, f.sourceIds); if (!f.factIds.length && !f.sourceIds.length) throw new Error('判断无依据'); });
    report.media.forEach(m => { check(report.sources, [m.sourceId]); if (m.sourceId === 'BRIEF') throw new Error('原产品图须有公开原件来源'); });
    report.chapters.forEach(c => { check(report.findings, c.findingIds); check(report.gaps, c.gapIds); if (!c.blocks.length) throw new Error('章节无模块'); c.blocks.forEach(b => {
      check(report.facts, blockFactIds(report, b)); check(report.findings, b.findingIds); check(report.gaps, b.gapIds);
      switch (b.kind) {
        case 'chart': { if (!b.rows.length) throw new Error('图表为空'); const qs = b.rows.map(r => r3Quantity(report, r.factId)); if (qs.some(q => q.unit !== b.unit || q.basis !== qs[0]?.basis)) throw new Error('图表单位或比较口径混用'); break; }
        case 'cards': if (!b.items.length) throw new Error('卡片为空'); b.items.forEach(i => { check(report.findings, i.findingIds); check(report.gaps, i.gapIds); if (!i.factIds.length && !i.findingIds.length && !i.gapIds.length) throw new Error('卡片无内容'); }); break;
        case 'comparison': if (!b.columns.length || !b.rows.length || b.rows.some(r => r.cells.length !== b.columns.length || r.cells.some(cell => !cell.factIds.length))) throw new Error('比较表维度无效'); break;
        case 'products': check(report.media, b.mediaIds); if (!b.mediaIds.length || b.observations.some(r => !b.mediaIds.includes(r.mediaId)) || b.mediaIds.some(id => !b.observations.some(r => r.mediaId === id && r.factIds.length))) throw new Error('产品图观察归属无效'); break;
        default: { const exhaustive: never = b; return exhaustive; }
      }
    }); });
    return { kind: 'valid', report };
  } catch (error) { return { kind: 'invalid', message: error instanceof Error ? error.message : 'R3内容无效' }; }
}
