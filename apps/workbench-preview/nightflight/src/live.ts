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
  secondary: string;
  touchpoints: { label: string; text: string }[];
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
export interface CopyReview {
  protocol?: 'dual-panel-v2';
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
  version: 1;
  status: 'ready';
  bodyHash: string;
  draft: { directions: ReviewedDirection[] };
  initialDraft: { directions: ReviewedDirection[] };
  firstVotes: CopyVote[];
  finalVotes: CopyVote[];
  challenges: {
    coverage?: {
      readId?: string; directionId: DirectionId; dimension: string; reason: string; originalClaim: string; originalEvidence: string;
    }[];
    role: CopyRole;
    runId: string;
    draftHash: string;
    items: { id: string; directionId: DirectionId; dimension: string; objection: string; evidence: string; action: string }[];
  }[];
  changes: string[];
  recommendation: { directionId: DirectionId; reason: string; tradeoff: string };
  adjudication: {
    ready: boolean;
    reason: string;
    single?: { directionId: DirectionId; ready: boolean; reason: string }[];
    pairs?: { pair: 'AB' | 'AC' | 'BC'; distinct?: boolean; reason: string }[];
    set?: { ready: boolean; reason: string };
    rulings: { challengeId: string; verdict: 'resolved' | 'rejected' | 'pending'; reason: string }[];
  };
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
    findings: { conclusion: string; evidence: string; source: string; url: string; implication: string }[];
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
export type Action = 'message' | 'choice' | 'retry' | 'adopt' | 'research_again';
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
  return p.stage === 'research' && p.status === 'waiting' ? '待补查' : statusName[p.status];
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
