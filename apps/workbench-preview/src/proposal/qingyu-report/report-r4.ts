import originals from './content-r3.json';
import type { R3Source, R3Fact, R3Finding, R3Gap, R3Media, R3EvidenceType } from './report-r3';

export type R4Evidence = { factIds: string[]; findingIds: string[] };
type QuantityFactId = string & { readonly __brand: 'QuantityFactId' };
export type R4Chart = { id: string; title: string; kind: 'bar' | 'line'; unit: string; rows: { label: string; factId: QuantityFactId }[] };
type BoardBase = { id: string; title: string; conclusionId: string; scope: string; caveat: string; gapIds: string[] };
export type R4Board = BoardBase & (
  | { kind: 'market'; heroFactId: QuantityFactId; charts: R4Chart[] }
  | { kind: 'people'; sceneId: string; groups: { label: string; evidence: R4Evidence }[]; chart: R4Chart }
  | { kind: 'landscape'; groupFindingIds: string[]; columns: string[]; rows: { label: string; cells: R4Evidence[] }[] }
  | { kind: 'packaging'; columns: string[]; samples: { mediaId: string; cells: R4Evidence[] }[] }
  | { kind: 'conditions'; items: { label: string; briefFactIds: string[]; assessmentFindingIds: string[] }[] }
  | { kind: 'synthesis'; links: { dimension: 'market' | 'people' | 'competition' | 'product'; findingId: string }[] }
);
export type R4Scenario = { id: string; path: string; sha256: string; mime: 'image/png'; width: number; height: number; title: string; sourceId: 'BRIEF'; sourceUrl: null; identity: string; alt: string; limits: string; role: 'generated-scenario'; generationReceipt: string };
export type R4Media = R3Media | R4Scenario;
export type R4Chapter = { id: 'market' | 'people' | 'competition' | 'product' | 'conclusion'; title: string; details: R4Evidence & { gapIds: string[] }; boards: R4Board[] };
export type QingyuR4Report = { schemaVersion: 4; id: 'qingyu-packaging-public-report-r4-20261109'; binding: { briefVersion: 1; storedArtifactId: 'art-qingyu-research-v1' }; origin: { skillRevision: 'r6-20261109'; adoptionSha256: string; branchReceiptPaths: string[] }; title: string; subtitle: string; asOf: string; status: '研究待补'; lead: string; scopeNote: string; sources: R3Source[]; facts: R3Fact[]; findings: R3Finding[]; gaps: R3Gap[]; media: R4Media[]; chapters: R4Chapter[] };
export type QingyuR4Parsed = { kind: 'valid'; report: QingyuR4Report } | { kind: 'invalid'; message: string };
export const R4_ADOPTION_SHA = '281df7c52c66590fe0d2b2018ebc9fae040f38945e4129503d71a9dac9145026';
export const R4_SCENE_PATH = '/research-case/qingyu-boards-20261109/cooler-choice-illustration.png';
export const R4_SCENE_SHA = '75ca946b2e78a5aaa363c9e0638a0e5bf420db5fd27a13cc8b17570e7798835c';
const unique = (ids: string[]) => [...new Set(ids)];
function isObject(v: unknown): v is Record<string, unknown> { return typeof v === 'object' && v !== null && !Array.isArray(v); }
function object(v: unknown): Record<string, unknown> { if (!isObject(v)) throw new Error('应为对象'); return v; }
function string(v: unknown): string { if (typeof v !== 'string') throw new Error('应为文本'); return v; }
function text(v: unknown): string { const s = string(v); if (!s.trim()) throw new Error('核心文本不能为空'); return s; }
function number(v: unknown): number { if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error('应为有限数值'); return v; }
function list<T>(v: unknown, parse: (v: unknown) => T): T[] { if (!Array.isArray(v)) throw new Error('应为数组'); return v.map(parse); }
const ids = (v: unknown) => list(v, text);
function url(v: unknown): string { const s = text(v); if (new URL(s).protocol !== 'https:') throw new Error('公开来源须为HTTPS'); return s; }
function source(v: unknown): R3Source { const o = object(v), id = text(o.id); if ((id === 'BRIEF') !== (o.url === null)) throw new Error('仅题设来源可无公开链接'); return { id, title: text(o.title), publisher: text(o.publisher), url: o.url === null ? null : url(o.url), published: o.published === null ? null : text(o.published), dataPeriod: text(o.dataPeriod), market: text(o.market), population: text(o.population), method: text(o.method), access: text(o.access), locator: text(o.locator), limits: text(o.limits) }; }
function evidenceType(v: unknown): R3EvidenceType { if (v === 'published-report' || v === 'visual-observation' || v === 'brand-self-description' || v === 'brief-condition') return v; throw new Error('未知证据身份'); }
function fact(v: unknown): R3Fact { const o = object(v), q = o.quantity === null ? null : object(o.quantity); return { id: text(o.id), text: text(o.text), sourceIds: ids(o.sourceIds), locator: text(o.locator), scope: text(o.scope), limits: text(o.limits), evidenceType: evidenceType(o.evidenceType), quantity: q === null ? null : { value: number(q.value), unit: text(q.unit), basis: text(q.basis) }, derivedFrom: ids(o.derivedFrom) }; }
function finding(v: unknown): R3Finding { const o = object(v); if (o.kind !== 'synthesis' && o.kind !== 'public-finding' && o.kind !== 'brief-condition') throw new Error('未知判断类型'); return { id: text(o.id), title: text(o.title), text: text(o.text), factIds: ids(o.factIds), sourceIds: ids(o.sourceIds), scope: text(o.scope), limits: text(o.limits), kind: o.kind }; }
function gap(v: unknown): R3Gap { const o = object(v); return { id: text(o.id), title: text(o.title), text: text(o.text), consequence: text(o.consequence) }; }
function media(v: unknown): R4Media {
  const o = object(v), path = text(o.path);
  const base = { id: text(o.id), path, sha256: text(o.sha256), width: number(o.width), height: number(o.height), title: text(o.title), identity: text(o.identity), alt: text(o.alt), limits: text(o.limits) };
  if (o.role === 'generated-scenario') {
    if (path !== R4_SCENE_PATH || o.sha256 !== R4_SCENE_SHA || o.mime !== 'image/png' || o.width !== 1536 || o.height !== 1024 || o.sourceId !== 'BRIEF' || o.sourceUrl !== null) throw new Error('生成情境身份不匹配');
    return { ...base, mime: o.mime, sourceId: o.sourceId, sourceUrl: null, role: o.role, generationReceipt: text(o.generationReceipt) };
  }
  const frozen = originals.media.find(m => m.id === o.id);
  if (!frozen || !Object.entries(frozen).every(([key, value]) => o[key] === value)) throw new Error('原产品图登记必须与R3原件一致');
  if (o.role !== 'original-product' || (o.mime !== 'image/png' && o.mime !== 'image/jpeg')) throw new Error('原产品图身份无效');
  return { ...base, role: o.role, mime: o.mime, sku: text(o.sku), capacity: text(o.capacity), sourceId: text(o.sourceId), sourceUrl: url(o.sourceUrl) };
}
export function r4MediaIdentityValid(m: R4Media): boolean { return m.role === 'original-product' ? originals.media.some(f => f.id === m.id && f.path === m.path && f.sha256 === m.sha256 && f.mime === m.mime && f.width === m.width && f.height === m.height) : m.path === R4_SCENE_PATH && m.sha256 === R4_SCENE_SHA && m.mime === 'image/png' && m.width === 1536 && m.height === 1024 && m.sourceId === 'BRIEF'; }
export function r4ById<T extends { id: string }>(items: T[], id: string): T { const item = items.find(i => i.id === id); if (!item) throw new Error(`引用不存在 ${id}`); return item; }
function isQuantityFactId(v: unknown, facts: R3Fact[]): v is QuantityFactId { return typeof v === 'string' && facts.some(f => f.id === v && f.quantity !== null); }
function quantityId(v: unknown, facts: R3Fact[]): QuantityFactId { if (!isQuantityFactId(v, facts)) throw new Error('数值图须引用量化事实'); return v; }
export function r4Quantity(report: QingyuR4Report, id: string) { const q = r4ById(report.facts, id).quantity; if (!q) throw new Error('事实无数值'); return q; }
function evidence(v: unknown): R4Evidence { const o = object(v); return { factIds: ids(o.factIds), findingIds: ids(o.findingIds) }; }
function chart(v: unknown, facts: R3Fact[]): R4Chart { const o = object(v); if (o.kind !== 'bar' && o.kind !== 'line') throw new Error('未知图表类型'); return { id: text(o.id), title: text(o.title), kind: o.kind, unit: text(o.unit), rows: list(o.rows, v => { const row = object(v); if ('value' in row) throw new Error('图表不得重复数值'); return { label: text(row.label), factId: quantityId(row.factId, facts) }; }) }; }
function board(v: unknown, facts: R3Fact[]): R4Board {
  const o = object(v), base = { id: text(o.id), title: text(o.title), conclusionId: text(o.conclusionId), scope: text(o.scope), caveat: string(o.caveat), gapIds: ids(o.gapIds) };
  switch (o.kind) {
    case 'market': return { ...base, kind: o.kind, heroFactId: quantityId(o.heroFactId, facts), charts: list(o.charts, v => chart(v, facts)) };
    case 'people': return { ...base, kind: o.kind, sceneId: text(o.sceneId), groups: list(o.groups, v => { const g = object(v); return { label: text(g.label), evidence: evidence(g.evidence) }; }), chart: chart(o.chart, facts) };
    case 'landscape': return { ...base, kind: o.kind, groupFindingIds: ids(o.groupFindingIds), columns: ids(o.columns), rows: list(o.rows, v => { const row = object(v); return { label: text(row.label), cells: list(row.cells, evidence) }; }) };
    case 'packaging': return { ...base, kind: o.kind, columns: ids(o.columns), samples: list(o.samples, v => { const sample = object(v); return { mediaId: text(sample.mediaId), cells: list(sample.cells, evidence) }; }) };
    case 'conditions': return { ...base, kind: o.kind, items: list(o.items, v => { const i = object(v); return { label: text(i.label), briefFactIds: ids(i.briefFactIds), assessmentFindingIds: ids(i.assessmentFindingIds) }; }) };
    case 'synthesis': return { ...base, kind: o.kind, links: list(o.links, v => { const link = object(v); if (link.dimension !== 'market' && link.dimension !== 'people' && link.dimension !== 'competition' && link.dimension !== 'product') throw new Error('未知综合维度'); return { dimension: link.dimension, findingId: text(link.findingId) }; }) };
    default: throw new Error('未知R4图版');
  }
}
export function r4Charts(b: R4Board): R4Chart[] { return b.kind === 'market' ? b.charts : b.kind === 'people' ? [b.chart] : []; }
function boardEvidence(b: R4Board): R4Evidence {
  const found = [b.conclusionId];
  switch (b.kind) {
    case 'market': return { factIds: [b.heroFactId, ...b.charts.flatMap(c => c.rows.map(r => r.factId))], findingIds: found };
    case 'people': return { factIds: [...b.groups.flatMap(g => g.evidence.factIds), ...b.chart.rows.map(r => r.factId)], findingIds: [...found, ...b.groups.flatMap(g => g.evidence.findingIds)] };
    case 'landscape': return { factIds: b.rows.flatMap(r => r.cells.flatMap(c => c.factIds)), findingIds: [...found, ...b.groupFindingIds, ...b.rows.flatMap(r => r.cells.flatMap(c => c.findingIds))] };
    case 'packaging': return { factIds: b.samples.flatMap(s => s.cells.flatMap(c => c.factIds)), findingIds: [...found, ...b.samples.flatMap(s => s.cells.flatMap(c => c.findingIds))] };
    case 'conditions': return { factIds: b.items.flatMap(i => i.briefFactIds), findingIds: [...found, ...b.items.flatMap(i => i.assessmentFindingIds)] };
    case 'synthesis': return { factIds: [], findingIds: [...found, ...b.links.map(l => l.findingId)] };
  }
}
export type R4EvidenceClosure = { facts: R3Fact[]; findings: R3Finding[]; sources: R3Source[]; gaps: R3Gap[] };
export function r4EvidenceClosure(report: QingyuR4Report, refs: R4Evidence, gapIds: string[] = []): R4EvidenceClosure {
  const findings = unique(refs.findingIds).map(id => r4ById(report.findings, id));
  const seen = new Set<string>(), facts: R3Fact[] = [];
  const visit = (id: string) => { if (seen.has(id)) return; seen.add(id); const f = r4ById(report.facts, id); facts.push(f); f.derivedFrom.forEach(visit); };
  [...refs.factIds, ...findings.flatMap(f => f.factIds)].forEach(visit);
  const sources = unique([...facts.flatMap(f => f.sourceIds), ...findings.flatMap(f => f.sourceIds)]).map(id => r4ById(report.sources, id));
  return { facts, findings, sources, gaps: unique(gapIds).map(id => r4ById(report.gaps, id)) };
}
export function r4BoardEvidence(report: QingyuR4Report, b: R4Board): R4EvidenceClosure { return r4EvidenceClosure(report, boardEvidence(b), b.gapIds); }
export function r4ChapterEvidence(report: QingyuR4Report, chapter: R4Chapter): R4EvidenceClosure { const refs = chapter.boards.map(boardEvidence); return r4EvidenceClosure(report, { factIds: [...chapter.details.factIds, ...refs.flatMap(e => e.factIds)], findingIds: [...chapter.details.findingIds, ...refs.flatMap(e => e.findingIds)] }, [...chapter.details.gapIds, ...chapter.boards.flatMap(b => b.gapIds)]); }
export function r4ChartSeries(report: QingyuR4Report, c: R4Chart) { return { labels: c.rows.map(r => r.label), values: c.rows.map(r => r4Quantity(report, r.factId).value), unit: c.unit, basis: r4Quantity(report, c.rows[0]?.factId ?? '').basis }; }
export function r4EvidenceText(report: QingyuR4Report, refs: R4Evidence): string[] { return [...refs.factIds.map(id => r4ById(report.facts, id).text), ...refs.findingIds.map(id => { const f = r4ById(report.findings, id); return `${f.title}。${f.text}`; })]; }
export function parseQingyuR4(input: unknown): QingyuR4Parsed {
  try {
    const o = object(input), binding = object(o.binding), origin = object(o.origin);
    if (o.schemaVersion !== 4 || o.id !== 'qingyu-packaging-public-report-r4-20261109' || binding.briefVersion !== 1 || binding.storedArtifactId !== 'art-qingyu-research-v1' || origin.skillRevision !== 'r6-20261109' || origin.adoptionSha256 !== R4_ADOPTION_SHA || o.status !== '研究待补') throw new Error('R4身份不匹配');
    const facts = list(o.facts, fact);
    const chapters = list(o.chapters, (v): R4Chapter => { const c = object(v), d = object(c.details); if (c.id !== 'market' && c.id !== 'people' && c.id !== 'competition' && c.id !== 'product' && c.id !== 'conclusion') throw new Error('未知章节'); return { id: c.id, title: text(c.title), details: { ...evidence(d), gapIds: ids(d.gapIds) }, boards: list(c.boards, v => board(v, facts)) }; });
    const report: QingyuR4Report = { schemaVersion: 4, id: o.id, binding: { briefVersion: 1, storedArtifactId: binding.storedArtifactId }, origin: { skillRevision: origin.skillRevision, adoptionSha256: origin.adoptionSha256, branchReceiptPaths: ids(origin.branchReceiptPaths) }, title: text(o.title), subtitle: text(o.subtitle), asOf: text(o.asOf), status: o.status, lead: text(o.lead), scopeNote: text(o.scopeNote), sources: list(o.sources, source), facts, findings: list(o.findings, finding), gaps: list(o.gaps, gap), media: list(o.media, media), chapters };
    const boards = chapters.flatMap(c => c.boards), all = [...report.sources, ...facts, ...report.findings, ...report.gaps, ...report.media, ...chapters, ...boards, ...boards.flatMap(r4Charts)];
    if (new Set(all.map(x => x.id)).size !== all.length) throw new Error('记录ID重复');
    if (!report.origin.branchReceiptPaths.length || chapters.map(c => c.id).join(',') !== 'market,people,competition,product,conclusion' || chapters.map(c => c.boards.map(b => b.kind).join('+')).join(',') !== 'market,people,landscape+packaging,conditions,synthesis') throw new Error('五章六图版顺序无效');
    if (report.media.length !== 5 || report.media.filter(m => m.role === 'generated-scenario').length !== 1) throw new Error('须保留四件原图及一件生成情境');
    const check = <T extends { id: string }>(items: T[], refs: string[]) => refs.forEach(id => r4ById(items, id));
    const settled = new Set<string>();
    const visit = (id: string, ancestors: Set<string>) => { if (ancestors.has(id)) throw new Error('事实推导存在循环'); if (settled.has(id)) return; const f = r4ById(facts, id), next = new Set(ancestors).add(id); f.derivedFrom.forEach(id => visit(id, next)); settled.add(id); };
    facts.forEach(f => { check(report.sources, f.sourceIds); check(facts, f.derivedFrom); if (!f.sourceIds.length) throw new Error('事实无来源'); if (f.evidenceType === 'brief-condition' ? f.quantity !== null || f.derivedFrom.length > 0 || f.sourceIds.some(id => id !== 'BRIEF') : f.sourceIds.includes('BRIEF')) throw new Error('题设与公开事实不得混用'); visit(f.id, new Set()); });
    facts.forEach(f => { if (f.evidenceType !== 'brief-condition' && r4EvidenceClosure(report, { factIds: f.derivedFrom, findingIds: [] }).facts.some(p => p.evidenceType === 'brief-condition')) throw new Error('公开事实不得由题设推导'); });
    report.findings.forEach(f => { check(facts, f.factIds); check(report.sources, f.sourceIds); if (!f.factIds.length && !f.sourceIds.length) throw new Error('判断无依据'); if (f.kind === 'public-finding' && (f.sourceIds.includes('BRIEF') || r4EvidenceClosure(report, { factIds: f.factIds, findingIds: [] }).facts.some(p => p.evidenceType === 'brief-condition'))) throw new Error('公开判断不得混入题设'); });
    report.media.forEach(m => check(report.sources, [m.sourceId]));
    boards.forEach(b => {
      r4BoardEvidence(report, b);
      r4Charts(b).forEach(c => { if (!c.rows.length) throw new Error('图表不能为空'); const qs = c.rows.map(r => r4Quantity(report, r.factId)); if (qs.some(q => q.unit !== c.unit || q.basis !== qs[0]?.basis)) throw new Error('图表单位或比较口径混用'); if (c.kind === 'bar' && c.unit === '%' && qs.some(q => q.value < 0 || q.value > 100)) throw new Error('百分比条形图须在0至100范围内'); });
      switch (b.kind) {
        case 'market': if (!b.charts.length) throw new Error('市场须同屏有数列图'); break;
        case 'people': if (r4ById(report.media, b.sceneId).role !== 'generated-scenario' || !b.groups.length || b.groups.some(g => !g.evidence.factIds.length && !g.evidence.findingIds.length)) throw new Error('人群情境或画像依据无效'); break;
        case 'landscape': if (b.rows.length < 6 || !b.columns.length || !b.groupFindingIds.length || new Set(b.groupFindingIds).size !== b.groupFindingIds.length || b.groupFindingIds.some(id => r4ById(report.findings, id).kind !== 'synthesis') || b.rows.some(r => r.cells.length !== b.columns.length || r.cells.some(c => !c.factIds.length && !c.findingIds.length))) throw new Error('竞品整体比较范围或矩阵无效'); break;
        case 'packaging': {
          if (b.samples.map(s => s.mediaId).sort().join(',') !== 'C-A01,C-A02,C-A03,C-A04' || !b.columns.length) throw new Error('包装须为四件原图');
          b.samples.forEach(s => { const m = r4ById(report.media, s.mediaId); if (m.role !== 'original-product' || s.cells.length !== b.columns.length) throw new Error('包装比较矩阵无效'); s.cells.forEach(cell => { const e = r4EvidenceClosure(report, cell); if (!e.facts.length || e.facts.some(f => f.evidenceType !== 'visual-observation' || !f.sourceIds.includes(m.sourceId))) throw new Error('包装观察归属无效'); }); }); break;
        }
        case 'conditions': if (!b.items.length || b.items.some(i => !i.briefFactIds.length || !i.assessmentFindingIds.length || i.briefFactIds.some(id => r4ById(facts, id).evidenceType !== 'brief-condition'))) throw new Error('产品条件对应无效'); break;
        case 'synthesis': if (b.links.map(l => l.dimension).sort().join(',') !== 'competition,market,people,product' || r4ById(report.findings, b.conclusionId).kind !== 'synthesis') throw new Error('综合须由四维依据共同指向综合判断'); break;
      }
    });
    const closures = chapters.map(c => r4ChapterEvidence(report, c));
    if (facts.some(f => !closures.some(e => e.facts.some(x => x.id === f.id))) || report.findings.some(f => !closures.some(e => e.findings.some(x => x.id === f.id))) || report.gaps.some(g => !closures.some(e => e.gaps.some(x => x.id === g.id)))) throw new Error('完整详情有未覆盖的事实、判断或缺口');
    return { kind: 'valid', report };
  } catch (error) { return { kind: 'invalid', message: error instanceof Error ? error.message : 'R4内容无效' }; }
}
