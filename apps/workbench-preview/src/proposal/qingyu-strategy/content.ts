import type sourceShape from './draft-r3.json';
import draftRaw from './draft-r3.json?raw';
import reviewedBody from './reviewed-strategy.md?raw';
import identity from './identity.json';
import reviewedPacket from './reviewed-packet.json';
import { r4EvidenceClosure, type QingyuR4Report } from '../qingyu-report/report-r4';

export const strategyDocumentRaw = draftRaw;
export const strategyIdentity = identity;
export type StrategyClaim = typeof sourceShape.ledger.claims[number];
export type StrategySupplement = typeof sourceShape.supplements[number];
export type StrategyBlock =
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'table'; headers: string[]; rows: string[][] };
export type StrategySection = { title: string; blocks: StrategyBlock[] };
export type StrategyDocument = {
  schemaVersion: 3; draftId: string; body: string; title: string; sections: StrategySection[];
  ledger: { basis: typeof sourceShape.ledger.basis; claims: StrategyClaim[] };
  supplements: StrategySupplement[];
};
export type StrategyReviewRole = 'brand' | 'user' | 'strategy';
export type StrategyReview = Omit<typeof identity.reviews[number], 'roleKind'> & { roleKind: StrategyReviewRole };
export type StrategyIdentity = Omit<typeof identity, 'reviews'> & { reviews: StrategyReview[] };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function object(value: unknown): Record<string, unknown> {
  if (!isObject(value)) throw new Error('策略字段须为对象');
  return value;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('策略文本不能为空');
  return value;
}
function list<T>(value: unknown, parse: (value: unknown) => T): T[] {
  if (!Array.isArray(value)) throw new Error('策略字段须为数组');
  return value.map(parse);
}
function ids(value: unknown): string[] {
  const result = list(value, text);
  if (new Set(result).size !== result.length) throw new Error('引用不得重复');
  return result;
}
function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((value, index) => sameValue(value, right[index]));
  if (typeof left !== 'object' || left === null || typeof right !== 'object' || right === null) return false;
  const a = object(left), b = object(right);
  return Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([key, value]) => key in b && sameValue(value, b[key]));
}
function cells(line: string): string[] { return line.slice(1, -1).split('|').map(cell => cell.trim()); }

function parseBody(body: string): { title: string; sections: StrategySection[] } {
  const lines = body.trimEnd().split('\n');
  const first = lines.shift();
  if (!first?.startsWith('# ')) throw new Error('分析正文缺标题');
  const sections: StrategySection[] = [];
  let current: StrategySection | undefined;
  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (!line?.trim()) { index++; continue; }
    if (line.startsWith('## ')) {
      current = { title: line.slice(3), blocks: [] }; sections.push(current); index++; continue;
    }
    if (!current) throw new Error('分析正文缺章节');
    if (line.startsWith('|')) {
      const separator = lines[index + 1];
      if (!separator || !cells(separator).every(cell => /^:?-{3,}:?$/.test(cell))) throw new Error('分析表格分隔无效');
      const headers = cells(line), rows: string[][] = [];
      index += 2;
      while (lines[index]?.startsWith('|')) {
        const row = cells(lines[index] ?? '');
        if (row.length !== headers.length) throw new Error('分析表格列数不符');
        rows.push(row); index++;
      }
      current.blocks.push({ kind: 'table', headers, rows }); continue;
    }
    if (line.startsWith('- ')) {
      const items: string[] = [];
      while (lines[index]?.startsWith('- ')) { items.push((lines[index] ?? '').slice(2)); index++; }
      current.blocks.push({ kind: 'list', items }); continue;
    }
    const paragraph: string[] = [];
    while (lines[index]?.trim() && !/^(## |\||- )/.test(lines[index] ?? '')) { paragraph.push(lines[index] ?? ''); index++; }
    current.blocks.push({ kind: 'paragraph', text: paragraph.join('\n') });
  }
  if (!sections.length || sections.some(section => !section.blocks.length)) throw new Error('分析章节不可为空');
  return { title: first.slice(2), sections };
}

export function strategyResearchRefs(claim: StrategyClaim, report: QingyuR4Report) {
  const factIds: string[] = [], findingIds: string[] = [];
  for (const ref of claim.researchR4) {
    if (report.facts.some(fact => fact.id === ref.id)) factIds.push(ref.id);
    else if (report.findings.some(finding => finding.id === ref.id)) findingIds.push(ref.id);
    else throw new Error('声明引用的R4记录不存在');
    const closed = r4EvidenceClosure(report, { factIds: report.facts.some(fact => fact.id === ref.id) ? [ref.id] : [], findingIds: report.findings.some(finding => finding.id === ref.id) ? [ref.id] : [] });
    if (ref.sourceIds.some(id => !closed.sources.some(source => source.id === id))) throw new Error('声明来源不在原R4闭包');
  }
  return { factIds, findingIds };
}

export function parseStrategyDocument(input: unknown, report: QingyuR4Report): StrategyDocument {
  if (!sameValue(input, reviewedPacket.document)) throw new Error('判断账本或补充来源不同于封存的送审版');
  const root = object(input), ledger = object(root.ledger), b = object(ledger.basis);
  const draftId = text(root.draftId), body = text(root.body);
  if (root.schemaVersion !== 3 || draftId !== 'qingyu-strategy-r3-v2' || body !== reviewedBody) throw new Error('策略文档或送审正文身份不一致');
  if (!sameValue(b.binding, report.binding) || !sameValue(b.researchOrigin, report.origin) || b.researchId !== report.id || b.status !== report.status || b.strategyRevision !== 'r3-20261110' || b.taskId !== 'brf-qingyu-v1' || b.taskVersion !== 1) throw new Error('策略依据身份不匹配');
  const basis: typeof sourceShape.ledger.basis = {
    taskId: b.taskId, taskVersion: b.taskVersion, researchId: report.id, researchSha256: text(b.researchSha256),
    binding: report.binding, researchOrigin: report.origin, status: report.status, strategyRevision: b.strategyRevision,
  };
  const supplements = list(root.supplements, value => {
    const item = object(value);
    const url = item.url === null ? null : text(item.url);
    if (url !== null && !/^https:\/\//.test(url)) throw new Error('补充来源链接无效');
    return { id: text(item.id), kind: text(item.kind), title: text(item.title), text: text(item.text), url, locator: text(item.locator), limits: text(item.limits) };
  });
  if (new Set(supplements.map(item => item.id)).size !== supplements.length) throw new Error('补充来源ID重复');
  const claims = list(ledger.claims, value => {
    const item = object(value);
    return {
      id: text(item.id), subject: text(item.subject), judgment: text(item.judgment), kind: text(item.kind), limits: text(item.limits),
      researchR4: list(item.researchR4, value => { const ref = object(value); return { id: text(ref.id), sourceIds: ids(ref.sourceIds), locator: text(ref.locator) }; }),
      checkedEvidenceIds: ids(item.checkedEvidenceIds), supplementalSourceIds: ids(item.supplementalSourceIds),
    };
  });
  if (!claims.length || new Set(claims.map(item => item.id)).size !== claims.length) throw new Error('声明ID重复或缺失');
  for (const claim of claims) {
    strategyResearchRefs(claim, report);
    if (claim.supplementalSourceIds.some(id => !supplements.some(source => source.id === id))) throw new Error('补充来源不存在');
    if (claim.checkedEvidenceIds.some(id => !/^E(0[1-9]|1[0-2])$/.test(id) && !supplements.some(source => source.id === id))) throw new Error('本轮核查记录不存在');
  }
  for (const match of body.matchAll(/〔([^〕]+)〕/g)) {
    if (match[1]?.split('，').some(id => !claims.some(claim => claim.id === id))) throw new Error('分析正文引用不存在');
  }
  return { schemaVersion: 3, draftId, body, ...parseBody(body), ledger: { basis, claims }, supplements };
}

function digest(value: unknown): string {
  const result = text(value);
  if (!/^[a-f0-9]{64}$/.test(result)) throw new Error('身份摘要无效');
  return result;
}
function fileIdentity(value: unknown) {
  const item = object(value);
  return { path: text(item.path), sha256: digest(item.sha256) };
}
function role(value: unknown): StrategyReviewRole {
  if (value === 'brand' || value === 'user' || value === 'strategy') return value;
  throw new Error('未知评审角色');
}
export function parseStrategyIdentity(input: unknown, document: StrategyDocument, report: QingyuR4Report): StrategyIdentity {
  if (!sameValue(input, reviewedPacket.identity)) throw new Error('显示身份不同于封存的实际审查记录');
  const root = object(input), strategy = object(root.strategy), research = object(root.research), artifacts = object(root.artifacts);
  if (root.schemaVersion !== 3 || root.kind !== 'reviewed-strategy-direction' || root.draftId !== document.draftId || root.scopeId !== 'simulated-positioning-and-direction-validation') throw new Error('本轮身份或评审范围不匹配');
  if (strategy.skillId !== 'design-strategy-lead' || strategy.skillRevision !== document.ledger.basis.strategyRevision || research.id !== report.id || research.skillRevision !== report.origin.skillRevision || research.adoptionSha256 !== report.origin.adoptionSha256 || research.contentSha256 !== document.ledger.basis.researchSha256) throw new Error('方法或研究身份不匹配');
  const draft = fileIdentity(artifacts['strategy.md']);
  const reviews = list(root.reviews, value => {
    const item = object(value), firstRead = fileIdentity(item.firstRead);
    if (item.verdict !== '方向成立，可交接' || item.draftSha256 !== draft.sha256 || item.firstReadSha256 !== firstRead.sha256) throw new Error('评审非同版通过');
    return { roleKind: role(item.roleKind), label: text(item.label), verdict: item.verdict, scope: text(item.scope), positiveReasons: ids(item.positiveReasons), draftSha256: draft.sha256, firstReadSha256: firstRead.sha256, firstRead, firstReadRecord: fileIdentity(item.firstReadRecord), receipt: fileIdentity(item.receipt), report: fileIdentity(item.report) };
  });
  if (reviews.length !== 3 || new Set(reviews.map(review => review.roleKind)).size !== 3) throw new Error('三方角色不全或重复');
  return {
    schemaVersion: 3, kind: root.kind, draftId: document.draftId, scopeId: root.scopeId, scope: text(root.scope),
    strategy: { skillId: strategy.skillId, skillRevision: text(strategy.skillRevision), skillPath: text(strategy.skillPath), skillSha256: digest(strategy.skillSha256) },
    research: { id: report.id, skillRevision: report.origin.skillRevision, contentSha256: digest(research.contentSha256), adoptionSha256: report.origin.adoptionSha256 },
    artifacts: { 'draft-r3.json': fileIdentity(artifacts['draft-r3.json']), 'strategy.md': draft, 'claims.json': fileIdentity(artifacts['claims.json']), 'directions.md': fileIdentity(artifacts['directions.md']) },
    methodFiles: list(root.methodFiles, fileIdentity), inputs: list(root.inputs, fileIdentity), reviews, firstReadSeal: fileIdentity(root.firstReadSeal), closure: fileIdentity(root.closure), remaining: ids(root.remaining),
  };
}
