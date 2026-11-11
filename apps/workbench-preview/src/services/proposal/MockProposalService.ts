import { installQingyu, readCaseStore } from '../cases/installQingyu';
/**
 * Prototype service for the creative stages (Strategy → Delivery), modes, checkpoints and the
 * agent process record. Content is scripted demo data; agent work is simulated with a short
 * delay and labelled as such in the interface.
 *
 * The Brief and Research stages defer to the Workbench service: a brief counts as done only
 * when the Workbench says it is confirmed, and research only when its evidence checks have
 * passed and it has been released. The prototype never overrides those protections.
 */
import type { ID } from '../../domain/models';
import {
  ACTIVE_CHECKPOINT_STAGES,
  activeStage,
  nextActiveStage,
  type ActiveStageId,
  STAGES,
  type CheckpointStage,
  type ContributionInput,
  type ContributionTarget,
  type ProposalWriteMeta,
  type CreateProposalInput,
  type DecisionInput,
  type LayoutStyle,
  type ProductionMode,
  type Proposal,
  type ProposalService,
  type ProposalSummary,
  type StageId,
} from '../../domain/proposal';
import { ServiceError } from '../../domain/service';
import { isPresentationLocalTime } from '../../domain/presentationTime';
import { brandResourceMetadata, sameBrandResources, validateBrandResources, validateBrandUploads, type BrandResourceRepository, type BrandResourceUpload } from '../../domain/brandResources';
import { markSharedStore, publishStoreChange, storeTransaction, subscribeStoreChanges } from '../mock/transactions';
import type { WorkbenchService } from '../../domain/service';
import { isDemoControls } from '../demo';
import { needsYou } from '../../proposal/needs';
import type { KeyValueStore } from '../mock/storage';
import { LEADS, pack, stage } from './fixtures/helpers';
import { luma } from './fixtures/luma';
import { northline } from './fixtures/northline';
import { plumtide } from './fixtures/plumtide';

import { t } from '../mock/i18n';

const STORAGE_KEY = 'proposal-workbench/demo/proposals/zh-desktop-v1';
const SCHEMA = 4;
const ME = '演示用户';

/** Stage content, used to decide what an advancing stage can reveal. */
const CONTENT_KEY: Partial<Record<StageId, keyof Proposal>> = {
  strategy: 'strategy',
  themes: 'themes',
  visual: 'visual',
  content_review: 'contentReview',
  layout: 'layout',
  delivery: 'delivery',
};

function seed(): Record<ID, Proposal> {
  return Object.fromEntries([northline, plumtide, luma].map((p) => [p.id, structuredClone(p)]));
}


export class MockProposalService implements ProposalService {
  readonly backing = 'prototype' as const;
  private data: Record<ID, Proposal>;
  private caseReady: Promise<void> | null = null;
  private caseInstallations: string[] = [];
  private listeners = new Set<(id: ID | null) => void>();
  private timers = new Set<ReturnType<typeof setTimeout>>();

  constructor(
    private readonly workbench: WorkbenchService,
    private readonly store: KeyValueStore,
    private readonly options: { latency?: number; agentDelay?: number; clock?: () => number; brandResources?: BrandResourceRepository; metadataPersistence?: 'local' | 'memory' } = {},
  ) {
    markSharedStore(store, isDemoControls(workbench) ? workbench.getDemoState().persistence === 'local' : typeof window !== 'undefined');
    this.data = this.load();
    subscribeStoreChanges(store, STORAGE_KEY, () => { this.data = this.load(); this.emit(null); });
    workbench.subscribe((event) => {
      if (event.type === 'reset') {
        this.timers.forEach(clearTimeout);
        this.timers.clear();
        void storeTransaction(this.store, STORAGE_KEY, () => {
          this.caseReady = null; this.caseInstallations = []; this.data = seed(); this.persist(); this.emit(null);
        });
      }
      if (event.type === 'data-changed' && event.projectId) {
        const p = Object.values(this.data).find((x) => x.workbenchId === event.projectId);
        if (p) this.emit(p.id);
      }
    });
  }

  private now() {
    return new Date(this.options.clock?.() ?? Date.now()).toISOString();
  }

  private load(): Record<ID, Proposal> {
    try {
      const raw = this.store.get(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { schema: number; data: Record<ID, Proposal> };
        if (parsed.schema === SCHEMA) {
          const root = readCaseStore(this.store, 'proposal');
          this.caseInstallations = root && Array.isArray(root.caseInstallations) ? root.caseInstallations.filter((v): v is string => typeof v === 'string') : [];
          return parsed.data;
        }
      }
    } catch {
      /* fall back to the seed */
    }
    return seed();
  }

  private persist() {
    const root = readCaseStore(this.store, 'proposal');
    try {
      this.store.set(STORAGE_KEY, JSON.stringify({ ...root, schema: SCHEMA, data: this.data, caseInstallations: this.caseInstallations }));
    } catch {
      throw new ServiceError('unavailable', '提案保存失败，请保留输入并重试。', { retryable: true });
    }
    publishStoreChange(this.store, STORAGE_KEY);
  }

  private async ensureCaseReady() {
    if (isDemoControls(this.workbench) && this.workbench.getDemoState().scenario === 'empty') return;
    const local = isDemoControls(this.workbench) ? this.workbench.getDemoState().persistence === 'local' : typeof window !== 'undefined';
    if (local && !globalThis.navigator?.locks) { readCaseStore(this.store, 'proposal'); return; }
    if (!this.caseReady) this.caseReady = installQingyu({ store: this.store, kind: 'proposal', fallback: () => ({ schema: SCHEMA, data: seed() }) }).catch(error => { if (error instanceof ServiceError && error.kind === 'conflict') return; this.caseReady = null; throw error; });
    await this.caseReady;
  }

  private emit(id: ID | null) {
    this.listeners.forEach((l) => l(id));
  }

  subscribe(listener: (id: ID | null) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async wait() {
    const ms = this.options.latency ?? 250;
    if (ms > 0) await new Promise((r) => setTimeout(r, ms));
  }

  /**
   * Reads follow the same demo scenario as the Workbench they sit on, so loading, network-error
   * and empty states look the same everywhere. Returns true when the scenario is "empty".
   */
  private async gate(): Promise<boolean> {
    await this.ensureCaseReady();
    if (!isDemoControls(this.workbench)) return false;
    const { scenario } = this.workbench.getDemoState();
    if (scenario === 'loading') {
      // Never settles; the UI refetches when the scenario changes and ignores this request.
      await new Promise<never>(() => {});
    }
    if (scenario === 'network_error') throw new Error('无法连接提案服务（模拟网络错误）。');
    return scenario === 'empty';
  }

  private require(id: ID): Proposal {
    const p = this.data[id];
    if (!p) throw new Error(`未找到提案 ${id}`);
    return p;
  }

  private touch(p: Proposal) {
    p.revision += 1;
    p.updatedAt = this.now();
  }

  private newId(prefix: string) {
    return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
  }

  private async mutate(id: ID, meta: ProposalWriteMeta | undefined, apply: (p: Proposal) => void, append = false) {
    await this.ensureCaseReady();
    return storeTransaction(this.store, STORAGE_KEY, async () => {
      readCaseStore(this.store, 'proposal');
      this.data = this.load();
      const p = await this.sync(structuredClone(this.require(id)));
      if (!append && meta && meta.expectedRevision !== p.revision) {
        throw new ServiceError('conflict', '提案已在其他窗口更新，请重新读取后再提交；你的输入已保留。', { retryable: false,
          conflict: { expectedRevision: meta.expectedRevision, currentRevision: p.revision, changedBy: null, changeSummary: '其他窗口更新了提案。' } });
      }
      apply(p);
      this.touch(p);
      this.data[id] = p;
      this.persist();
      this.emit(id);
      return structuredClone(p);
    });
  }

  private validateTarget(p: Proposal, s: StageId, target: ContributionTarget | undefined) {
    if (!target) return;
    if (target.stage !== s) throw new ServiceError('validation', '意见对象不属于当前阶段。');
    const exists = target.kind === 'visual'
      ? p.visual?.branches.find((b) => b.directionId === target.directionId)?.refined.some((r) => r.version === target.version && r.status !== 'not_started')
      : target.kind === 'theme'
        ? p.themes?.directions.some((d) => d.id === target.directionId) && p.stages.themes.version === target.version
        : p.stages[s].version === target.version || p.versions.some((v) => v.stage === s && v.version === target.version);
    if (!exists) throw new ServiceError('conflict', '原稿版本已不存在，请核对意见对象后重试。', { retryable: false });
  }

  /** Brief and research follow the Workbench, which owns the evidence and decision rules. */
  private async sync(p: Proposal): Promise<Proposal> {
    try {
      const ov = await this.workbench.getProjectOverview(p.workbenchId);
      if (ov.brief?.proposalType) p.type = ov.brief.proposalType;
      const confirmed = Boolean(ov.brief?.confirmedAt);
      const research = ov.research;

      if (!confirmed && p.stages.brief.status === 'done') {
        p.stages.brief = { ...p.stages.brief, status: 'needs_revision', summary: '简报已变更，需要重新确认。' };
      }
      if (confirmed && p.stages.brief.status !== 'done') {
        p.stages.brief = { ...p.stages.brief, status: 'done', summary: `任务卡第${ov.brief?.version ?? 1}版已确认。`, updatedAt: ov.brief?.confirmedAt ?? this.now() };
        if (p.stages.research.status === 'not_started') p.stages.research = { ...p.stages.research, status: 'in_progress', summary: '正基于已确认的任务卡准备调研。', updatedAt: this.now() };
        if (p.currentStage === 'brief') p.currentStage = 'research';
      }
      if (research) {
        const released = research.status === 'released';
        const stale = research.status === 'stale';
        if (released && p.stages.research.status !== 'done') {
          p.stages.research = { ...p.stages.research, status: 'done', summary: '调研已完成证据检查与交接。', updatedAt: this.now() };
          if (p.stages.strategy.status === 'not_started') {
            p.stages.strategy = { ...p.stages.strategy, status: p.strategy ? 'done' : 'in_progress', summary: p.strategy ? p.stages.strategy.summary : '策略负责人正依据已交付调研工作（演示：此项目没有预置策略正文）。', updatedAt: this.now() };
            if (p.currentStage === 'research') p.currentStage = 'strategy';
          }
        }
        if (!released && p.stages.research.status === 'done') {
          p.stages.research = { ...p.stages.research, status: 'needs_revision', summary: stale ? '简报变更，调研已过期。' : '调研尚未具备交付状态。' };
          for (const s of STAGES.slice(STAGES.indexOf('strategy'))) {
            if (p.stages[s].status === 'done') p.stages[s] = { ...p.stages[s], status: 'needs_revision', summary: '所依据的调研已变化，需要复核。' };
          }
          p.currentStage = 'research';
        }
      }
    } catch {
      /* the Workbench is unreachable: show the last known state */
    }
    return p;
  }

  private summarize(p: Proposal): ProposalSummary {
    const attention = needsYou(p).length;
    return {
      id: p.id,
      name: p.name,
      client: p.client,
      presentationLocalTime: p.presentationLocalTime,
      type: p.type,
      summary: p.summary,
      cover: p.cover,
      mode: p.mode,
      currentStage: activeStage(p.currentStage),
      currentStatus: p.stages[activeStage(p.currentStage)].status,
      stageStatus: Object.fromEntries(STAGES.map((s) => [s, p.stages[s].status])) as ProposalSummary['stageStatus'],
      workbenchId: p.workbenchId,
      attention,
      updatedAt: p.updatedAt,
    };
  }

  async listProposals() {
    await this.wait();
    if (await this.gate()) return [];
    readCaseStore(this.store, 'proposal');
    const all = await Promise.all(Object.values(this.load()).map((p) => this.sync(structuredClone(p))));
    return structuredClone(all.map((p) => this.summarize(p)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  }

  async getProposal(id: ID) {
    await this.wait();
    if (await this.gate()) throw new Error(`未找到提案 ${id}`);
    readCaseStore(this.store, 'proposal');
    this.data = this.load();
    return structuredClone(await this.sync(structuredClone(this.require(id))));
  }

  async findByWorkbenchId(workbenchId: ID) {
    await this.wait();
    if (await this.gate()) return null;
    readCaseStore(this.store, 'proposal');
    const p = Object.values(this.load()).find((x) => x.workbenchId === workbenchId);
    return p ? structuredClone(await this.sync(structuredClone(p))) : null;
  }

  async ensureBrandResourceStorage() {
    const repository = this.options.brandResources;
    if (!repository || (repository.persistence !== 'test-memory' && (this.options.metadataPersistence !== 'local'
      || (isDemoControls(this.workbench) && this.workbench.getDemoState().persistence !== 'local')))) {
      throw new ServiceError('unavailable', '当前浏览器无法持久保存品牌资料。请允许网站存储后重试，或先移除资料再创建。');
    }
    const key = `${STORAGE_KEY}/brand-resource-probe/${this.newId('probe')}`;
    try {
      this.store.set(key, key);
      if (this.store.get(key) !== key) throw new Error('Metadata storage unavailable');
      this.store.remove(key);
    } catch {
      throw new ServiceError('unavailable', '提案资料信息无法保存，请检查浏览器存储空间及网站数据权限后重试。', { retryable: true });
    }
    await repository.ensureReady();
  }

  async stageBrandResources(input: { workbenchId: ID; resources: BrandResourceUpload[] }) {
    validateBrandUploads(input.resources);
    await this.ensureBrandResourceStorage();
    await this.workbench.getProjectOverview(input.workbenchId);
    const existing = await this.findByWorkbenchId(input.workbenchId);
    if (existing && !sameBrandResources(existing.brandResources, input.resources.map((upload) => upload.resource))) {
      throw new ServiceError('conflict', '此提案已保存另一份品牌资料清单，请核对后重试。');
    }
    const repository = this.options.brandResources;
    if (!repository) throw new ServiceError('unavailable', '品牌资料原件库不可用。');
    await repository.stage(input);
  }

  async getBrandResourceFile(proposalId: ID, resourceId: string) {
    const proposal = await this.getProposal(proposalId);
    const resource = proposal.brandResources?.find((item) => item.id === resourceId);
    if (!resource) throw new ServiceError('not_found', '此资料不属于当前提案。');
    const repository = this.options.brandResources;
    if (!repository) throw new ServiceError('unavailable', '品牌资料原件库不可用。');
    return repository.get({ workbenchId: proposal.workbenchId, resource });
  }

  async createProposal(input: CreateProposalInput, meta?: ProposalWriteMeta) {
    await this.wait();
    if (input.presentationLocalTime !== undefined && !isPresentationLocalTime(input.presentationLocalTime)) {
      throw new ServiceError('validation', '请填写有效的提案汇报日期和时间。');
    }
    if (input.brandResources !== undefined) validateBrandResources(input.brandResources);
    if (input.brandResources?.length) {
      await this.ensureBrandResourceStorage();
      const repository = this.options.brandResources;
      if (!repository) throw new ServiceError('unavailable', '品牌资料原件库不可用。');
      for (const resource of input.brandResources) await repository.get({ workbenchId: input.workbenchId, resource });
    }
    await this.ensureCaseReady();
    return storeTransaction(this.store, STORAGE_KEY, () => {
    readCaseStore(this.store, 'proposal');
    this.data = this.load();
    const id = `${input.workbenchId}-proposal`;
    if (this.data[id]) throw new ServiceError('conflict', '该项目已有提案，请重新读取。');
    if (meta && meta.expectedRevision !== 0) throw new ServiceError('conflict', '新建提案应使用第 0 版。');
    const now = this.now();
    const stages = Object.fromEntries(STAGES.map((s) => [s, stage('not_started', '', LEADS[s], null)])) as Proposal['stages'];
    stages.brief = stage('in_progress', '请核对并确认任务卡，再开始调研。', LEADS.brief, now);
    const p: Proposal = {
      id,
      workbenchId: input.workbenchId,
      name: input.name,
      client: input.client || '客户尚未填写',
      ...(input.presentationLocalTime === undefined ? {} : { presentationLocalTime: input.presentationLocalTime }),
      ...(input.brandResources?.length ? { brandResources: input.brandResources.map(brandResourceMetadata) } : {}),
      type: input.type,
      summary: input.type === 'kv' ? '主视觉提案。' : '包装提案。',
      cover: pack('can', 'front', { base: '#e6e8e3', ink: '#47524b', accent: '#bfc5bb', pattern: 'plain', wordmark: input.name.slice(0, 14), flavour: '新提案' }),
      mode: input.mode,
      checkpoints: input.mode === 'assisted' ? ACTIVE_CHECKPOINT_STAGES.filter((c) => input.checkpoints.includes(c)) : [],
      currentStage: 'brief',
      stages,
      task: { assignment: '', output: '', occasion: null, scope: [], inputs: [], unknowns: [] },
      research: null,
      strategy: null,
      themes: null,
      visual: null,
      contentReview: null,
      layout: null,
      delivery: null,
      decisions: [],
      contributions: [],
      tasks: [],
      reviews: [],
      handoffs: [],
      versions: [],
      revision: 1,
      updatedAt: now,
    };
    this.data[id] = p;
    this.persist();
    this.emit(id);
    return structuredClone(p);
    });
  }

  async setMode(id: ID, mode: ProductionMode, checkpoints: CheckpointStage[], meta?: ProposalWriteMeta) {
    await this.wait();
    return this.mutate(id, meta, (p) => {
      p.mode = mode;
      p.checkpoints = mode === 'assisted' ? ACTIVE_CHECKPOINT_STAGES.filter((c) => checkpoints.includes(c)) : [];
      p.decisions.push({ id: this.newId('hd'), stage: 'brief', kind: 'mode_changed', by: meta?.actor?.name ?? ME, at: this.now(), comment: mode === 'automatic' ? '自动模式。' : `协作模式；需你确认：${p.checkpoints.map((stage) => t(`wb.pstage.${stage}`)).join('、') || '无'}。`, reviewerPosition: null });
    });
  }

  async decide(id: ID, s: StageId, decision: DecisionInput, meta?: ProposalWriteMeta) {
    await this.wait();
    if (s === 'content_review') throw new ServiceError('validation', '内容审阅为旧流程历史节点，不能新增决定。');
    const result = await this.mutate(id, meta, (p) => {
      const state = p.stages[s];
      if (state.status !== 'waiting_for_you') throw new ServiceError('validation', '当前阶段不处于等待人工决定的状态。');
      if (decision.kind === 'request_revision' && !decision.comment.trim()) throw new ServiceError('validation', '请说明需要修改什么，便于继续处理。');
      const at = this.now();
      p.decisions.push({ id: this.newId('hd'), stage: s, kind: decision.kind === 'request_revision' ? 'revision_requested' : decision.kind === 'choose' ? 'chosen_despite_review' : 'approved', by: meta?.actor?.name ?? ME, at, comment: decision.comment, reviewerPosition: decision.kind === 'choose' ? decision.reviewerPosition : null });
      p.stages[s] = { ...state, status: decision.kind === 'request_revision' ? 'needs_revision' : 'done', summary: decision.kind === 'request_revision' ? `根据意见修订：“${decision.comment}”` : decision.comment ? `已确认：“${decision.comment}”` : '已确认本阶段。', updatedAt: at };
    });
    if (decision.kind === 'request_revision') {
      await this.later(async () => { await this.mutate(id, undefined, (q) => {
        if (q.currentStage !== s || q.stages[s].status !== 'needs_revision') return;
        const v = q.stages[s].version + 1;
        const target: ContributionTarget = { kind: 'stage', stage: s, version: v };
        q.stages[s] = { ...q.stages[s], status: 'waiting_for_you', version: v, summary: `已按意见形成第${v}版，等待确认（模拟状态，正文未重写）。`, updatedAt: this.now() };
        q.versions.push({ id: this.newId('ver'), stage: s, target, label: `阶段修订第${v}版`, version: v, inputs: [`人工意见：${decision.comment}`], at: this.now(), state: 'current', impact: null });
        q.reviews.push({ id: this.newId('rv'), stage: s, target, subject: `修订第${v}版`, evaluator: `${LEADS[s]}（模拟）`, average: null, verdict: '已完成模拟修订状态更新（本演示未实际重写正文）。', challenge: null, directorResolution: null, at: this.now() });
      }); });
    } else await this.advance(id, s);
    return result;
  }

  /** Every delayed simulator write reloads the whole backing store under the same lock. */
  private async advance(id: ID, from: ActiveStageId) {
    const to = nextActiveStage(from);
    if (!to) return;
    await this.mutate(id, undefined, (p) => {
      if (p.currentStage !== from || p.stages[from].status !== 'done') throw new ServiceError('conflict', '上游阶段已变化，请重新读取。');
      p.currentStage = to;
      p.stages[to] = { ...p.stages[to], status: 'in_progress', summary: `${LEADS[to]}与相关角色正在模拟处理。`, updatedAt: this.now() };
    });
    await this.later(async () => {
      let next = false;
      await this.mutate(id, undefined, (q) => {
        if (q.currentStage !== to || q.stages[from].status !== 'done' || q.stages[to].status !== 'in_progress') return;
        const key = CONTENT_KEY[to];
        if (key && q[key] === null) {
          q.stages[to] = { ...q.stages[to], summary: '进行中。演示中尚未预置此项目本阶段的正文。' };
          return;
        }
        const checkpoint = q.mode === 'assisted' && q.checkpoints.some((s) => s === to);
        q.stages[to] = { ...q.stages[to], status: checkpoint ? 'waiting_for_you' : 'done', summary: checkpoint ? '模拟处理完成，等待人工决定。' : '已完成模拟处理。', updatedAt: this.now() };
        if (to === 'layout' && q.layout && !q.layout.chosen) { q.layout.chosen = 'editorial'; q.layout.chosenBy = 'director'; }
        next = !checkpoint;
      });
      if (next) await this.advance(id, to);
    });
  }

  private async later(fn: () => Promise<void>) {
    const ms = this.options.agentDelay ?? 1600;
    if (ms <= 0) { await fn(); return; }
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      void fn().catch(() => this.emit(null));
    }, ms);
    this.timers.add(timer);
  }

  async contribute(id: ID, s: StageId, input: ContributionInput, meta?: ProposalWriteMeta) {
    await this.wait();
    if (s === 'content_review') throw new ServiceError('validation', '内容审阅为旧流程历史节点，不能新增意见。');
    return this.mutate(id, meta, (p) => {
      if (!input.text.trim()) throw new ServiceError('validation', '请先填写内容。');
      this.validateTarget(p, s, input.target);
      p.contributions.push({ id: this.newId('uc'), stage: s, kind: input.kind, text: input.text.trim(), borrow: input.borrow?.trim() || null,
        by: meta?.actor?.name ?? ME, authorId: meta?.actor?.id, authorRole: meta?.actor?.role, at: this.now(), status: 'new', response: null,
        target: input.target ?? { kind: 'stage', stage: s, version: p.stages[s].version }, processing: [] });
    }, true);
  }

  async resolveContribution(id: ID, contributionId: ID, input: { status: 'considered' | 'used'; reason: string }, meta?: ProposalWriteMeta) {
    await this.wait();
    return this.mutate(id, meta, (p) => {
      const contribution = p.contributions.find((c) => c.id === contributionId);
      if (!contribution) throw new ServiceError('not_found', '未找到这条意见。');
      if (contribution.stage === 'content_review') throw new ServiceError('validation', '内容审阅为旧流程历史节点，不能新增意见处理记录。');
      if (!input.reason.trim()) throw new ServiceError('validation', '请记录处理理由。');
      const processing = { id: this.newId('handling'), status: input.status, reason: input.reason.trim(), by: meta?.actor?.name ?? ME,
        authorId: meta?.actor?.id, authorRole: meta?.actor?.role, at: this.now(), target: contribution.target };
      contribution.processing = [...(contribution.processing ?? []), processing];
      contribution.status = input.status;
    });
  }

  async editNarrative(_id: ID, _sectionId: ID, _text: string, _meta?: ProposalWriteMeta): Promise<Proposal> {
    await this.wait();
    throw new ServiceError('validation', '内容审阅为旧流程历史节点，不能修改历史正文。');
  }

  async chooseLayout(id: ID, style: LayoutStyle['id'], meta?: ProposalWriteMeta) {
    await this.wait();
    return this.mutate(id, meta, (p) => {
      if (!p.layout) throw new ServiceError('validation', '尚未开始排版。');
      if (!p.layout.styles.some((s) => s.id === style)) throw new ServiceError('validation', '未找到此版式。');
      p.layout.chosen = style; p.layout.chosenBy = 'you';
    });
  }
}
