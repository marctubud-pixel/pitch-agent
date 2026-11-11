import type { Deck, Node } from '../deck-studio/model';
import type { QingyuLayoutResult } from '../qingyu-layout/preview';
import storedRecord from './record.json';
import { reviewSourceText } from './sources';

export type FinalReviewRecord = Readonly<{
  id: string; inputSha256: string; layoutInputSha256: string; reviewedAt: string; scope: string;
  executionStatus: 'completed'; conclusion: 'needs_revision' | 'cannot_assess' | 'diagnostic_completed';
  summary: string; humanApproval: false;
  sourceHashes: Readonly<Record<string, string>>;
  expectedPages: readonly Readonly<{ id: string; title: string; text: readonly string[] }>[];
  roleSummaries: readonly Readonly<{ role: 'content' | 'visual' | 'brand' | 'user' | 'communication'; summary: string; primary: string; blind: string; challenge: string }>[];
  findings: readonly Readonly<{ id: string; kind: 'must_fix' | 'advisory' | 'unknown'; pages: readonly number[]; quote: string; evidence: string; action: string; owner: string }>[];
  knownScope: readonly string[]; unverified: readonly string[];
  recordReferences: readonly Readonly<{ label: string; path: string; sha256: string }>[];
  exportCheck: Readonly<{ summary: string; artifactSha256: string }>;
}>;
export type FinalReviewBinding = { kind: 'not_recorded' } | { kind: 'stale'; message: string } | { kind: 'current' | 'historical'; record: FinalReviewRecord };
function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw Error('记录对象无效');
  return Object.fromEntries(Object.entries(value));
}
function str(value: unknown): string { if (typeof value !== 'string' || !value.trim()) throw Error('记录文字缺失'); return value; }
function rows(value: unknown): unknown[] { if (!Array.isArray(value)) throw Error('记录列表缺失'); return value; }
function strings(value: unknown): string[] { return rows(value).map(str); }
function member<T extends string>(value: unknown, choices: readonly T[]): T { for (const choice of choices) if (value === choice) return choice; throw Error('记录状态无效'); }
function sha(value: unknown): string { const text = str(value); if (!/^[a-f0-9]{64}$/.test(text)) throw Error('记录哈希无效'); return text; }
export function parseFinalReview(value: unknown): FinalReviewRecord | null {
  if (value === null) return null;
  const r = object(value);
  if (r.executionStatus !== 'completed' || r.humanApproval !== false) throw Error('本地审读不能生成批准');
  const sourceHashes = Object.fromEntries(Object.entries(object(r.sourceHashes)).map(([key, value]) => [key, sha(value)]));
  const expectedPages = rows(r.expectedPages).map(value => { const p = object(value); return { id: str(p.id), title: str(p.title), text: strings(p.text) }; });
  if (expectedPages.length !== 23 || new Set(expectedPages.map(p => p.id)).size !== 23) throw Error('终审必须绑定23页');
  const roles = ['content', 'visual', 'brand', 'user', 'communication'] satisfies string[];
  const roleSummaries = rows(r.roleSummaries).map(value => { const p = object(value); return { role: member(p.role, ['content', 'visual', 'brand', 'user', 'communication']), summary: str(p.summary), primary: str(p.primary), blind: str(p.blind), challenge: str(p.challenge) }; });
  if (roleSummaries.length !== 5 || roles.some(role => !roleSummaries.some(row => row.role === role))) throw Error('五职责记录不完整');
  const findings = rows(r.findings).map(value => {
    const f = object(value); const pages = rows(f.pages).map(value => { if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 23) throw Error('问题页码无效'); return value; });
    if (!pages.length) throw Error('问题必须定位页面');
    return { id: str(f.id), kind: member(f.kind, ['must_fix', 'advisory', 'unknown']), pages, quote: str(f.quote), evidence: str(f.evidence), action: str(f.action), owner: str(f.owner) };
  });
  const recordReferences = rows(r.recordReferences).map(value => { const ref = object(value); return { label: str(ref.label), path: str(ref.path), sha256: sha(ref.sha256) }; });
  const exportCheck = object(r.exportCheck);
  return { id: str(r.id), inputSha256: sha(r.inputSha256), layoutInputSha256: sha(r.layoutInputSha256), reviewedAt: str(r.reviewedAt), scope: str(r.scope), executionStatus: 'completed', conclusion: member(r.conclusion, ['needs_revision', 'cannot_assess', 'diagnostic_completed']), summary: str(r.summary), humanApproval: false, sourceHashes, expectedPages, roleSummaries, findings, knownScope: strings(r.knownScope), unverified: strings(r.unverified), recordReferences, exportCheck: { summary: str(exportCheck.summary), artifactSha256: sha(exportCheck.artifactSha256) } };
}
export function nativePageText(nodes: readonly Node[]): string[] {
  return nodes.flatMap(node => node.kind === 'text' ? [node.runs.length ? node.runs.map(run => run.text).join('') : node.lines.join('')] : node.kind === 'chart' ? nativePageText([...node.plot.labels, ...node.plot.valueLabels]) : []);
}
export async function bindFinalReview({ result, deck, signal, record = storedRecord, sources = reviewSourceText }: { result: Exclude<QingyuLayoutResult, { kind: 'unavailable' }>; deck: Deck; signal: AbortSignal; record?: unknown; sources?: Readonly<Record<string, string>> }): Promise<FinalReviewBinding> {
  signal.throwIfAborted();
  let parsed: FinalReviewRecord | null;
  try { parsed = parseFinalReview(record); } catch { return { kind: 'stale', message: '终审记录不完整，当前稿需重新核对。' }; }
  if (!parsed) return { kind: 'not_recorded' };
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(result.input.context));
  signal.throwIfAborted();
  const layoutInputSha256 = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
  if (layoutInputSha256 !== parsed.layoutInputSha256) return { kind: 'stale', message: '排版动态输入已变化，原终审记录不适用于当前稿。' };
  try {
    for (const page of deck.pages) {
      // assemble appends the authoritative page identity as the final JSON line.
      const identity = object(object(JSON.parse(page.notes.trim().split('\n').at(-1) ?? '')).inputIdentity);
      if (identity.sha256 !== layoutInputSha256 || identity.proposal !== 'qingyu-pack' || identity.briefVersion !== result.input.brief.version || identity.currency !== result.input.themes.kind) throw Error('排版备注身份不符');
    }
  } catch { return { kind: 'stale', message: '成稿备注与终审输入身份不符，请重新核对。' }; }
  const expected = parsed.expectedPages;
  if (deck.pages.length !== expected.length || deck.pages.some((page, i) => page.id !== expected[i].id || page.title !== expected[i].title || JSON.stringify(nativePageText(page.nodes)) !== JSON.stringify(expected[i].text))) return { kind: 'stale', message: '成稿页序或文字已变化，原终审记录不适用于当前稿。' };
  if (Object.keys(sources).length !== Object.keys(parsed.sourceHashes).length || Object.keys(sources).some(key => !Object.hasOwn(parsed.sourceHashes, key))) return { kind: 'stale', message: '终审依据清单已变化，请重新核对。' };
  for (const [path, text] of Object.entries(sources)) {
    signal.throwIfAborted();
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    signal.throwIfAborted();
    const digest = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
    if (digest !== parsed.sourceHashes[path]) return { kind: 'stale', message: '成稿或上游依据已变化，原终审记录已转为待复核。' };
  }
  signal.throwIfAborted();
  return { kind: result.kind, record: parsed };
}
