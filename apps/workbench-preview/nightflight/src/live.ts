import type { BlindReading } from '../../src/proposal/qingyu-visual/VisualReview';
import type { Mode, StageId } from './types';
import { STAGES } from './data/project';
export interface Summary {
  id: string;
  title: string;
  stage: StageId;
  status: 'running' | 'waiting' | 'failed' | 'done';
  updatedAt?: string;
}
export interface Asset {
  name: string;
  url: string;
}
export interface Artifact extends Asset {
  stage: StageId;
  kind: 'text' | 'image' | 'pptx';
  text?: string;
  visual?: {
    direction: string;
    candidate?: number; mean?: number; recommended?: boolean; blocked?: boolean; reason?: string;
    scores?: {role:string; score:number; reason:string}[];
    blind?: BlindReading; edit?: string; research?: string; references?: string[];
    sha256?: string; pageUrl?: string; sourceUrl?: string; title?: string;
    referenceHandoff?: { admission?: { passed: boolean; ruling: {reason: string}; votes: {role: string; items: {dimension: string; score: number | null; evidence: string}[]}[] }; references: { why?: string; avoid?: string; role: 'main' | 'auxiliary' | 'sharedBrand'; name: string; sha256: string; borrow: string; apply: string }[] };
    role: 'reference' | 'comparison' | 'sketch' | 'main' | 'extension' | 'mockup';
    output?: 'packaging' | 'kv';
    format?: 'portrait' | 'landscape';
  };
}
export type CopyRole = 'copy' | 'brand' | 'user' | 'comms';
export type CopyDuty = 'continuity' | 'feature' | 'emotion';
export type DirectionId = 'A' | 'B' | 'C';
export interface ReviewedDirection {
  id: DirectionId;
  duty: CopyDuty;
  name: string;
  claim: string;
  mechanism: string;
  strategyLink: string;
  basis: string;
  main: string;
  secondary?: string;
  touchpoints?: { label: string; text: string }[];
  risk: string;
}
export interface CopyVote {
  reused?: boolean;
  role: CopyRole;
  draftHash: string;
  runId: string;
  items: {
    directionId: DirectionId;
    decision: 'pass' | 'revise' | 'hold' | 'reject';
    reason: string;
    hardRejects: string[];
    blockers: string[];
    scores: { dimension: string; score: number | null; evidence: string; reason: string; scope?: string }[];
  }[];
}
interface CopyFirstRead {
  role: CopyRole;
  runId: string;
  items: { directionId: DirectionId; reading: string; uncertainty: string }[];
}
export interface HeadlineCheck {
  criterion: string;
  passed: boolean;
  evidence: string;
  reason: string;
}
export const commonHeadlineCriteria = ['事实准确，归属清楚', '单句读得懂，念得顺', '能接上本案策略'];
export const headlineTaskByDuty: Record<CopyDuty, string> = {
  continuity: '稳健延续',
  feature: '品牌或产品特征放大',
  emotion: '用户氛围或情绪放大',
};
export function headlineReviewProtocol(review?: CopyReview) {
  if (review?.version === 3 && review.protocol === 'dual-panel-headline-v4') return 'v4';
  if (review?.version === 2 && review.protocol === 'dual-panel-headline-v3') return 'v3';
}
export interface CopyReview {
  protocol?: 'dual-panel-v2' | 'dual-panel-headline-v3' | 'dual-panel-headline-v4';
  anonymousReads?: CopyFirstRead[];
  finalAnonymousReads?: CopyFirstRead[];
  sameDraftRechecks?: CopyVote[];
  issues?: { id: string; role: CopyRole; directionId: DirectionId; origin: 'score' | 'challenge'; dimension?: string; reason?: string }[];
  criticReads?: {
    role: CopyRole;
    items: { readId?: string; directionId: DirectionId; risk: string; evidence: string }[];
  }[];
  decisionPlan?: {
    rulings: {
      challengeId: string;
      verdict: 'accepted_now' | 'accepted_later' | 'rejected' | 'pending';
      action: 'revise' | 'recheck' | 'none';
      reason: string;
    }[];
  };
  version: 1 | 2 | 3;
  status: 'ready';
  bodyHash: string;
  draft: { directions: ReviewedDirection[] };
  initialDraft: { directions: ReviewedDirection[] };
  firstVotes: CopyVote[];
  finalVotes: CopyVote[];
  challenges: {
    coverage?: {
      readId?: string; directionId: DirectionId; dimension: string; reason: string; originalClaim: string; originalObserved?: boolean; originalEvidence: string | null;
    }[];
    role: CopyRole;
    runId: string;
    draftHash: string;
    items: { id: string; directionId: DirectionId; dimension: string; objection: string; evidence: string; action: string }[];
  }[];
  changes: string[];
  recommendation: { directionId: DirectionId; reason: string; tradeoff: string; memory?: string; retell?: string; scene?: string };
  adjudication: {
    ready: boolean;
    reason: string;
    single?: { directionId: DirectionId; ready: boolean; reason: string; checks?: HeadlineCheck[] }[];
    pairs?: { pair: 'AB' | 'AC' | 'BC'; distinct?: boolean; reason: string }[];
    set?: { ready: boolean; reason: string };
    rulings: { challengeId: string; verdict: 'resolved' | 'rejected' | 'pending'; reason: string }[];
  };
}
export interface ResearchImage {
  name: string;
  sha256: string;
  title: string;
  pageUrl: string;
  sourceUrl: string;
  observation: string;
  creatorRationale?: string;
  rationaleSourceUrl?: string;
  rationaleQuote?: string;
  rationaleAttachment?: string;
  takeaway?: string;
}
export interface Project extends Summary {
  revision: number;
  mode: Mode;
  brief: string;
  events: { stage: StageId; text: string; at: string }[];
  artifacts: Artifact[];
  versions?: { at: string; stage: StageId; artifacts: Artifact[] }[];
  researchFollowup?: boolean;
  research?: {
    ready: boolean;
    question?: string;
    digestPending?: boolean;
    strategyAdvice?: { recommendation: string; findingIndices: number[] }[];
    digest?: {
      chapter: '行业与市场' | '竞争与同类传播' | '人群与接触情境';
      title: string;
      detail: string;
      findingIndex: number;
    }[];
    findings: { conclusion: string; evidence: string; source: string; url: string; implication: string; images?: ResearchImage[] }[];
    gaps: string[];
    next: string;
  };
  copyReview?: CopyReview | null;
  directions: string[];
  choice?: string;
  error?: string;
  attachments?: Asset[];
  feedback?: { text: string; at: string }[];
}
export type Action = 'message' | 'choice' | 'retry' | 'adopt' | 'research_again' | 'research_continue' | 'research_digest';
const statusName = { running: '进行中', waiting: '等你决定', failed: '已中断', done: '演练完成' };
type ResearchStatus = Summary & Partial<Pick<Project, 'mode' | 'research' | 'researchFollowup'>>;
export const researchQuestion = (p: ResearchStatus) =>
  p.stage === 'research' &&
  p.status === 'waiting' &&
  p.mode === 'collab' &&
  p.research &&
  !p.research.ready &&
  p.research.findings.length
    ? p.research.question?.trim() || ''
    : '';
export const projectStatus = (p: ResearchStatus) => {
  if (researchQuestion(p)) return '等待你的判断';
  if (p.stage === 'research' && p.status === 'running' && p.researchFollowup) return '定向补查中';
  if (p.stage === 'research' && p.status === 'waiting') {
    if (!p.research) return '查看研究';
    if (p.research.digestPending) return '摘要待编辑';
    return p.research.ready ? '可进入策略' : '待补查';
  }
  return statusName[p.status];
};
export function phase(p: Project, s: StageId) {
  const n = STAGES.findIndex((x) => x.id === s),
    current = STAGES.findIndex((x) => x.id === p.stage);
  return p.status === 'done' || n < current
    ? 'done'
    : n > current
      ? 'pending'
      : p.status === 'waiting'
        ? 'waiting'
        : 'active';
}
export const stageLabel = (p: Project, s: StageId) =>
  s === p.stage ? projectStatus(p) : phase(p, s) === 'done' ? '已完成' : '未开始';
export const endpoint = (id: string) => '/api/projects/' + encodeURIComponent(id);
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(
    path,
    body === undefined
      ? { cache: 'no-store' }
      : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  );
  const data = await r.json().catch(() => ({ error: '本地服务未返回项目数据' }));
  if (!r.ok || data.error)
    throw new Error(typeof data.error === 'string' ? data.error : '请求失败（' + r.status + '）');
  return data;
}
export function safeURL(raw: string) {
  try {
    const u = new URL(raw, location.origin);
    if (u.origin === location.origin && /^https?:$/.test(u.protocol)) return u.href;
  } catch {}
  return undefined;
}
export function encodeFile(f: File) {
  return new Promise<{ name: string; data: string }>((ok, bad) => {
    const r = new FileReader();
    r.onerror = () => bad(new Error('无法读取 ' + f.name));
    r.onload = () => ok({ name: f.name, data: String(r.result).split(',')[1] });
    r.readAsDataURL(f);
  });
}
export function clock(at: string) {
  const d = new Date(at);
  return Number.isNaN(d.getTime())
    ? at
    : d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

export const ACCEPT = '.txt,.md,.pdf,.docx,.pptx,.png,.jpg,.jpeg';
export function fileIssue(files: File[]) {
  if (files.some((f) => !ACCEPT.split(',').some((ext) => f.name.toLowerCase().endsWith(ext))))
    return '请选择 TXT、MD、PDF、DOCX、PPTX、PNG 或 JPG 文件。';
  if (files.length > 32) return '每次最多添加 32 个附件。';
  if (files.reduce((n, f) => n + f.size, 0) > 28 * 1024 * 1024) return '附件合计不能超过 28 MB。';
  if (files.some((f) => !f.size)) return '请移除空文件后再提交。';
  const keys = files.map((f) => f.name.normalize('NFC').toLowerCase());
  if (new Set(keys).size !== files.length) return '有两个附件同名，请重命名其中一份。';
  return '';
}

export const isDeckPreview = (a: Artifact) =>
  a.stage === 'layout' && a.kind === 'text' && a.name.endsWith('.deck.json');
