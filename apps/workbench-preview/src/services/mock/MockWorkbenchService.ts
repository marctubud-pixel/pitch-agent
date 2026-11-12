import {parseVisualRequirements} from '../../domain/visualRequirements';
import { installQingyu, readCaseStore } from '../cases/installQingyu';
import { demoChineseText } from './demoChinese';
import { ACTIVE_TASK_FIELDS } from '../../domain/models';
import { isProposalType } from '../../domain/proposalType';
import { legacyBriefFields, researchQuestions } from '../../domain/briefRequirements';
/**
 * In-browser implementation of WorkbenchService for the demo.
 *
 * Owns fixtures, local persistence, simulated latency, demo scenarios, command idempotency,
 * revision checks and deterministic job simulation. Components never import from this folder;
 * they receive a WorkbenchService through ServiceProvider (src/app/services.tsx).
 */
import type {
  ActivityType,
  TaskField,
  Artifact,
  ArtifactDetail,
  ArtifactList,
  Brief,
  BriefHistory,
  BriefInput,
  Capabilities,
  Claim,
  ClaimInput,
  CommandMeta,
  CreateProjectInput,
  Handoff,
  HandoffInput,
  HandoffOverview,
  ID,
  ImageAsset,
  ImageLibrary,
  ImageUploadInput,
  Job,
  JobList,
  JobPurpose,
  MutationResult,
  Observation,
  ObservationReviewInput,
  Project,
  ProjectList,
  ProjectOverview,
  ProjectQuery,
  ProjectSummary,
  ResearchWorkspace,
  Source,
  SourceInput,
  SourceLibrary,
  SourceQuery,
} from '../../domain/models';
import { ServiceError, type EnvironmentInfo, type ServiceEvent, type ServiceListener, type WorkbenchService } from '../../domain/service';
import type { DemoControls, DemoScenario, DemoState } from '../demo';
import { DEMO_USER, SCHEMA_VERSION, type DemoDatabase, type JobRecord, type JobSimulation } from './db';
import { localizeDeep, m, render, setMockLocale } from './i18n';
import { buildEmptyDatabase, buildSeedDatabase, defaultGates } from './fixtures/seed';
import {
  activeJobs,
  claimsFor,
  clip,
  computeBlockers,
  computeEligibility,
  computeGaps,
  computeNextAction,
  computeStages,
  currentArtifact,
  currentBrief,
  currentHandoff,
  docLabel,
  handoffPermissions,
  jobRecovery,
  latestReview,
  suggestHandoffContent,
  summarizeArtifact,
} from './rules';
import {
  applyReadiness,
  applyVerification,
  createResearchVersion,
  createStrategyArtifact,
  markBriefChanged,
  markEvidenceChanged,
  refreshProjectState,
  simulateObservation,
  touchProject,
} from './simulation';
import { browserStore, type KeyValueStore } from './storage';
import { markSharedStore, publishStoreChange, storeTransaction, subscribeStoreChanges } from './transactions';

const KEYS = {
  db: 'proposal-workbench/demo/db/zh-desktop-v1',
  empty: 'proposal-workbench/demo/empty-db/zh-desktop-v1',
  settings: 'proposal-workbench/demo/settings/zh-desktop-v1',
};

const CAPABILITIES: Capabilities = {
  continuation_to_strategy: {
    supported: true,
    label: m('c.continuation'),
    reason: m('c.continuation.reason'),
  },
  creative_development: {
    supported: false,
    label: m('c.creative'),
    reason: m('c.creative.reason'),
  },
  final_proposal: {
    supported: false,
    label: m('c.final'),
    reason: m('c.final.reason'),
  },
  image_observation: {
    supported: true,
    label: m('c.images'),
    reason: m('c.images.reason'),
  },
  job_recovery: {
    supported: true,
    label: m('c.recovery'),
    reason: m('c.recovery.reason'),
  },
};

/** Generated activity text is Chinese; user-authored text stays as entered. */
const activityText = (value: string) => render(value);

/** Errors leave the service in the active language. */
function localizeError(error: unknown): never {
  if (error instanceof ServiceError) error.message = render(error.message);
  throw error;
}

const COLLABORATOR = '演示协作者';
const JOB_TIMING = { queueMs: 1400, runMs: 3200 };

export interface MockServiceOptions {
  store?: KeyValueStore;
  persistence?: 'local' | 'memory';
  latency?: { read: number; write: number };
  clock?: () => number;
  autoTick?: boolean;
}

type Scope = { projectId: ID } | { catalog: true };

const clone = <T>(value: T): T => structuredClone(value);

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const cleanList = (items: string[]) => items.map((i) => i.trim()).filter(Boolean);

export class MockWorkbenchService implements WorkbenchService, DemoControls {
  readonly environment: EnvironmentInfo = { kind: 'demo', label: '演示模式 · 模拟数据' };

  private store: KeyValueStore;
  private persistence: 'local' | 'memory';
  private latency: { read: number; write: number };
  private clock: () => number;
  private autoTick: boolean;
  private db: DemoDatabase;
  private emptyDb: DemoDatabase;
  private scenario: DemoScenario = 'normal';
  private caseReady: Promise<void> | null = null;
  private dropNext = false;
  private conflictArmed = false;
  private storageWarning: string | null = null;
  /** Uploaded brief files, kept for this browser session only (too large for local storage). */
  private files = new Map<ID, Blob>();
  private listeners = new Set<ServiceListener>();
  private ticker: ReturnType<typeof setInterval> | null = null;
  private loadingWaiters: Array<() => void> = [];

  constructor(options: MockServiceOptions = {}) {
    if (options.store) {
      this.store = options.store;
      this.persistence = options.persistence ?? 'memory';
    } else {
      const { store, persistence } = browserStore();
      this.store = store;
      this.persistence = persistence;
    }
    markSharedStore(this.store, this.persistence === 'local');
    subscribeStoreChanges(this.store, KEYS.db, () => { this.reload(); this.emit({ type: 'data-changed', projectId: null }); this.ensureTicker(); });
    this.latency = options.latency ?? { read: 260, write: 420 };
    this.clock = options.clock ?? (() => Date.now());
    this.autoTick = options.autoTick ?? true;
    this.db = this.load(KEYS.db, buildSeedDatabase);
    this.emptyDb = this.load(KEYS.empty, buildEmptyDatabase);
    try {
      const settings = JSON.parse(this.store.get(KEYS.settings) ?? '{}') as { scenario?: DemoScenario };
      if (settings.scenario) this.scenario = settings.scenario;
      if (this.scenario === 'conflict') this.conflictArmed = true;
    } catch {
      /* ignore malformed settings */
    }
    if (this.persistence === 'memory') {
      this.storageWarning = m('demo.storageUnavailable');
    }
    if (this.persistence === 'local' && !globalThis.navigator?.locks) this.storageWarning = '此浏览器缺少 Web Locks；可查看本地数据，编辑与模拟推进已停用。';
    this.ensureTicker();
  }

  // -------------------------------------------------------------------------
  // Plumbing
  // -------------------------------------------------------------------------

  subscribe(listener: ServiceListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: ServiceEvent) {
    for (const listener of this.listeners) listener(event);
  }

  private now(): string {
    return new Date(this.clock()).toISOString();
  }

  private newId = (prefix: string): string => {
    const random =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID().slice(0, 8)
        : Math.random().toString(36).slice(2, 10);
    return `${prefix}-${this.clock().toString(36)}-${random}`;
  };

  private load(key: string, fallback: () => DemoDatabase): DemoDatabase {
    try {
      const raw = this.store.get(key);
      if (raw) {
        const parsed = JSON.parse(raw) as DemoDatabase;
        if (parsed.schemaVersion === SCHEMA_VERSION) return parsed;
      }
    } catch {
      /* fall through to seed */
    }
    return fallback();
  }

  private async ensureCaseReady() {
    if (this.scenario === 'empty') return;
    if (this.persistence === 'local' && !globalThis.navigator?.locks) {
      readCaseStore(this.store, 'workbench');
      this.storageWarning = '此浏览器缺少 Web Locks；可读取既有资料，青屿示例尚未安全安装。';
      return;
    }
    if (!this.caseReady) this.caseReady = installQingyu({ store: this.store, kind: 'workbench', fallback: buildSeedDatabase }).catch(error => { if (error instanceof ServiceError && error.kind === 'conflict') { this.storageWarning = error.message; return; } this.caseReady = null; throw error; });
    await this.caseReady;
  }

  private persist() {
    readCaseStore(this.store, 'workbench');
    try {
      this.store.set(KEYS.db, JSON.stringify(this.db));
      this.store.set(KEYS.empty, JSON.stringify(this.emptyDb));
      if (this.persistence === 'local') this.storageWarning = null;
    } catch {
      this.storageWarning = m('demo.storageFull');
      throw new ServiceError('unavailable', '工作台保存失败，请保留输入并重试。');
    }
    publishStoreChange(this.store, KEYS.db);
  }

  private reload() {
    this.db = this.load(KEYS.db, buildSeedDatabase);
    this.emptyDb = this.load(KEYS.empty, buildEmptyDatabase);
  }

  private get active(): DemoDatabase {
    return this.scenario === 'empty' ? this.emptyDb : this.db;
  }

  private sleep(ms: number) {
    return ms > 0 ? new Promise<void>((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
  }

  private async read<T>(compose: (db: DemoDatabase) => T): Promise<T> {
    try {
      return await this.readRaw(compose);
    } catch (error) {
      return localizeError(error);
    }
  }

  private async readRaw<T>(compose: (db: DemoDatabase) => T): Promise<T> {
    await this.sleep(this.latency.read);
    await this.ensureCaseReady();
    if (this.scenario === 'loading') {
      // Wait until the scenario changes; the UI refetches on that event and drops this request.
      await new Promise<void>((resolve) => this.loadingWaiters.push(resolve));
      throw new ServiceError('network', m('err.loadingEnded'), { retryable: true });
    }
    if (this.scenario === 'network_error') {
      throw new ServiceError('network', m('err.networkRead'), { retryable: true });
    }
    if (this.persistence === 'local' && !globalThis.navigator?.locks) {
      this.reload();
      return localizeDeep(clone(compose(this.active)));
    }
    return storeTransaction(this.store, KEYS.db, () => {
      this.reload();
      if (this.scenario !== 'empty') readCaseStore(this.store, 'workbench');
      this.advanceJobs();
      return localizeDeep(clone(compose(this.active)));
    });
  }

  private requireProject(db: DemoDatabase, projectId: ID): Project {
    const project = db.projects.find((p) => p.id === projectId);
    if (!project) {
      throw new ServiceError(
        'not_found',
        this.scenario === 'empty'
          ? m('err.notFoundEmpty')
          : m('err.notFound'),
      );
    }
    return project;
  }

  private pushActivity(db: DemoDatabase, projectId: ID, type: ActivityType, message: string, actor: string) {
    db.activity.push({ id: this.newId('act'), projectId, type, message, actor, createdAt: this.now() });
  }

  /**
   * Central command handling: idempotency, conflict simulation, revision checks, atomic apply,
   * persistence, change events and the dropped-response simulation.
   */
  private async mutate<T>(
    name: string,
    scope: Scope,
    payload: unknown,
    meta: CommandMeta,
    apply: (db: DemoDatabase, now: string) => T,
  ): Promise<MutationResult<T>> {
    try {
      const result = await this.mutateRaw(name, scope, payload, meta, apply);
      return { ...result, data: localizeDeep(result.data) };
    } catch (error) {
      return localizeError(error);
    }
  }

  private async mutateRaw<T>(
    name: string,
    scope: Scope,
    payload: unknown,
    meta: CommandMeta,
    apply: (db: DemoDatabase, now: string) => T,
  ): Promise<MutationResult<T>> {
    await this.sleep(this.latency.write);
    await this.ensureCaseReady();
    if (this.scenario === 'network_error') {
      throw new ServiceError('network', m('err.networkWrite'), { retryable: true });
    }
    return storeTransaction(this.store, KEYS.db, () => {
      this.reload();
      if (this.scenario !== 'empty') readCaseStore(this.store, 'workbench');
      const db = this.active;
      const projectId = 'projectId' in scope ? scope.projectId : null;
      const requestHash = hash(stableStringify({ name, projectId, payload, expectedRevision: meta.expectedRevision }));

      const existing = db.commands[meta.commandId];
      if (existing) {
        if (existing.hash !== requestHash) {
          throw new ServiceError('idempotency_mismatch', m('err.idempotency'), { retryable: false });
        }
        return { data: clone(existing.data as T), revision: existing.revision, replayed: true, commandId: meta.commandId };
      }

      let project: Project | null = null;
      if (projectId) {
        project = this.requireProject(db, projectId);
        if (this.conflictArmed) {
          this.conflictArmed = false;
          touchProject(project, this.now());
          this.pushActivity(db, project.id, 'collaborator', '你工作期间，演示协作者更新了项目备注。', COLLABORATOR);
          this.persist();
          this.emit({ type: 'data-changed', projectId });
          this.emit({ type: 'demo-state-changed' });
        }
      }
      const currentRevision = project ? project.revision : db.catalogRevision;
      if (meta.expectedRevision !== currentRevision) {
        const lastChange = project
          ? db.activity.filter((a) => a.projectId === project!.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
          : null;
        throw new ServiceError('conflict', m(project ? 'err.conflict' : 'err.conflictWorkspace'), {
          retryable: false,
          conflict: {
            expectedRevision: meta.expectedRevision,
            currentRevision,
            changedBy: lastChange?.actor ?? null,
            changeSummary: lastChange?.message ?? null,
          },
        });
      }

      const snapshot = clone(db);
      const now = this.now();
      let data: T;
      try {
        data = apply(db, now);
        if (project) {
          touchProject(project, now);
          refreshProjectState(db, project.id);
        } else {
          db.catalogRevision += 1;
        }
      } catch (error) {
        this.restore(snapshot);
        throw error;
      }
      const revision = project ? project.revision : db.catalogRevision;
      const stored = clone(data);
      db.commands[meta.commandId] = { name, hash: requestHash, appliedAt: now, revision, data: stored };
      this.trimCommands(db);
      this.persist();
      this.emit({ type: 'data-changed', projectId });
      this.ensureTicker();

      if (this.dropNext) {
        this.dropNext = false;
        this.emit({ type: 'demo-state-changed' });
        throw new ServiceError('response_lost', m('err.responseLost'), {
          retryable: true,
          outcomeUnknown: true,
        });
      }
      return { data: clone(stored) as T, revision, replayed: false, commandId: meta.commandId };
    });
  }

  private restore(snapshot: DemoDatabase) {
    if (this.scenario === 'empty') this.emptyDb = snapshot;
    else this.db = snapshot;
  }

  private trimCommands(db: DemoDatabase) {
    const entries = Object.entries(db.commands);
    if (entries.length <= 300) return;
    entries.sort(([, a], [, b]) => a.appliedAt.localeCompare(b.appliedAt));
    for (const [key] of entries.slice(0, entries.length - 300)) delete db.commands[key];
  }

  // -------------------------------------------------------------------------
  // Job simulation
  // -------------------------------------------------------------------------

  private ensureTicker() {
    if (!this.autoTick || this.ticker || (this.persistence === 'local' && !globalThis.navigator?.locks)) return;
    const anyActive = [...this.db.jobs, ...this.emptyDb.jobs].some((j) => j.status === 'queued' || j.status === 'running');
    if (!anyActive) return;
    this.ticker = setInterval(() => { void this.tick().catch(() => this.emit({ type: 'demo-state-changed' })); }, 400);
  }

  /** Advances simulated jobs. Exposed for tests; the UI relies on the internal ticker. */
  async tick() {
    await this.ensureCaseReady();
    return storeTransaction(this.store, KEYS.db, () => {
      this.reload();
      const changed = this.advanceJobs();
      const stillActive = [...this.db.jobs, ...this.emptyDb.jobs].some((j) => j.status === 'queued' || j.status === 'running');
      if (!stillActive && this.ticker) {
        clearInterval(this.ticker);
        this.ticker = null;
      }
      return changed;
    });
  }

  private advanceJobs(): boolean {
    let changed = false;
    for (const db of [this.db, this.emptyDb]) {
      const touched = new Set<ID>();
      const nowMs = this.clock();
      for (const job of db.jobs) {
        if ((job.status !== 'queued' && job.status !== 'running') || !job.sim) continue;
        const startAt = Date.parse(job.createdAt) + job.sim.queueMs;
        const endAt = startAt + job.sim.runMs;
        if (job.status === 'queued' && nowMs >= startAt) {
          job.status = 'running';
          job.startedAt = new Date(startAt).toISOString();
          touched.add(job.projectId);
        }
        if (job.status === 'running' && nowMs >= endAt) {
          this.finishJob(db, job, startAt, endAt);
          touched.add(job.projectId);
        }
      }
      if (touched.size > 0) {
        changed = true;
        for (const projectId of touched) refreshProjectState(db, projectId);
        for (const projectId of touched) this.emit({ type: 'data-changed', projectId });
      }
    }
    if (changed) this.persist();
    return changed;
  }

  private receipt(job: JobRecord, startMs: number, endMs: number, savedRef: string | null) {
    const seed = parseInt(hash(job.id), 16);
    const requestId = `req_${hash(job.commandId + job.id)}`;
    return {
      provider: 'Simulated provider',
      requestId,
      model: job.purpose === 'image_observation' ? 'sim-vision-1' : 'sim-text-1',
      inputUnits: 1200 + (seed % 2400),
      outputUnits: job.sim?.outcome === 'failure' ? 0 : 300 + (seed % 900),
      durationMs: endMs - startMs,
      savedResultRef: savedRef,
      raw: {
        simulated: true,
        request_id: requestId,
        job_id: job.id,
        command_id: job.commandId,
        attempt: job.attempt,
        status: job.sim?.outcome === 'failure' ? 'error' : 'ok',
        started_at: new Date(startMs).toISOString(),
        finished_at: new Date(endMs).toISOString(),
        ...(savedRef ? { saved_result: savedRef, delivery: 'not_acknowledged' } : {}),
      },
    };
  }

  private finishJob(db: DemoDatabase, job: JobRecord, startMs: number, endMs: number) {
    const at = new Date(endMs).toISOString();
    const outcome = job.sim?.outcome ?? 'success';
    if (outcome === 'failure') {
      job.status = 'failed';
      job.completedAt = at;
      job.error = job.sim?.failure ?? { code: 'SIMULATED_FAILURE', message: '模拟任务失败。', detail: '用于验证固定失败情境。', retryable: true };
      job.receipt = this.receipt(job, startMs, endMs, null);
      if (job.target.kind === 'image') {
        const image = db.images.find((i) => i.id === job.target.id);
        if (image) image.observationStatus = 'failed';
      }
      this.pushActivity(db, job.projectId, 'job', `${activityText(job.label)}失败：${job.error.message}`, '模拟执行器');
      return;
    }
    if (outcome === 'lost') {
      job.status = 'awaiting_reconciliation';
      job.receipt = this.receipt(job, startMs, endMs, `saved_${hash(job.id).slice(0, 6)}`);
      this.pushActivity(db, job.projectId, 'job', `${activityText(job.label)}已在模拟服务完成，但结果尚未记录。`, '模拟执行器');
      return;
    }
    job.output = this.applyJobOutput(db, job, at);
    job.status = 'succeeded';
    job.completedAt = at;
    job.receipt = this.receipt(job, startMs, endMs, null);
    const project = db.projects.find((p) => p.id === job.projectId);
    if (project) touchProject(project, at);
  }

  private applyJobOutput(db: DemoDatabase, job: JobRecord, at: string): JobRecord['output'] {
    const project = db.projects.find((p) => p.id === job.projectId);
    if (!project) return null;
    const label = (message: string) => this.pushActivity(db, project.id, 'job', message, '模拟执行器');
    switch (job.purpose) {
      case 'research_generation': {
        const artifact = createResearchVersion(db, project, at, job.id, this.newId);
        label(`已生成模拟调研第${artifact.version}版。`);
        return { kind: 'artifact', id: artifact.id };
      }
      case 'evidence_verification': {
        const artifact = db.artifacts.find((a) => a.id === job.target.id);
        if (!artifact) return null;
        const review = applyVerification(db, artifact, at, job.id, this.newId);
        label(`证据核验${review.decision === 'fail' ? '未通过' : review.decision === 'pass' ? '通过' : '有条件通过'}：${activityText(review.summary)}`);
        return { kind: 'review', id: review.id };
      }
      case 'readiness_review': {
        const artifact = db.artifacts.find((a) => a.id === job.target.id);
        if (!artifact) return null;
        const review = applyReadiness(db, artifact, at, job.id, this.newId);
        label(`就绪度检查${review.decision === 'fail' ? '未通过' : '通过'}。${activityText(review.summary)}`);
        return { kind: 'review', id: review.id };
      }
      case 'image_observation': {
        const observation = simulateObservation(db, job, at, this.newId);
        label(`已记录“${activityText(job.target.label)}”的模拟观察。`);
        return { kind: 'observation', id: observation.id };
      }
      case 'strategy_generation': {
        const artifact = createStrategyArtifact(db, project, at, job.id, this.newId);
        label(`已生成模拟策略第${artifact.version}版，正在检查。`);
        return { kind: 'artifact', id: artifact.id };
      }
    }
  }

  private createJob(
    db: DemoDatabase,
    project: Project,
    purpose: JobPurpose,
    label: string,
    target: JobRecord['target'],
    commandId: string,
    extra: Partial<Pick<JobRecord, 'attempt' | 'retryOfJobId'>> & { sim?: JobSimulation } = {},
  ): JobRecord {
    const job: JobRecord = {
      id: this.newId('job'),
      projectId: project.id,
      purpose,
      label,
      status: 'queued',
      commandId,
      createdAt: this.now(),
      startedAt: null,
      completedAt: null,
      error: null,
      receipt: null,
      target,
      output: null,
      attempt: extra.attempt ?? 1,
      retryOfJobId: extra.retryOfJobId ?? null,
      reconciledAt: null,
      simulated: true,
      sim: extra.sim ?? { ...JOB_TIMING, outcome: 'success' },
    };
    db.jobs.push(job);
    return job;
  }

  private toJob(db: DemoDatabase, record: JobRecord): Job {
    const { sim: _sim, ...rest } = record;
    void _sim;
    return { ...rest, recovery: jobRecovery(db, record) };
  }

  private assertNoActiveJob(db: DemoDatabase, projectId: ID, purpose: JobPurpose, message: string) {
    if (activeJobs(db, projectId).some((j) => j.purpose === purpose)) {
      throw new ServiceError('validation', message);
    }
  }

  private requireCurrentResearch(db: DemoDatabase, projectId: ID, action: 'addClaims' | 'verify' | 'readiness' | 'handoff' | 'release'): Artifact {
    const research = currentArtifact(db, projectId, 'research');
    const act = m(`act.${action}`);
    if (!research) throw new ServiceError('validation', m('err.noResearch', { action: act }));
    if (research.staleReason) throw new ServiceError('validation', m('err.staleResearch', { v: research.version, action: act }));
    return research;
  }

  // -------------------------------------------------------------------------
  // Demo controls
  // -------------------------------------------------------------------------

  getDemoState(): DemoState {
    return {
      scenario: this.scenario,
      dropNextResponse: this.dropNext,
      conflictArmed: this.conflictArmed,
      persistence: this.persistence,
      storageWarning: this.storageWarning && render(this.storageWarning),
    };
  }

  setScenario(scenario: DemoScenario) {
    this.scenario = scenario;
    this.conflictArmed = scenario === 'conflict';
    const waiters = this.loadingWaiters;
    this.loadingWaiters = [];
    waiters.forEach((resolve) => resolve());
    this.store.set(KEYS.settings, JSON.stringify({ scenario }));
    this.emit({ type: 'scenario-changed' });
  }

  setDropNextResponse(enabled: boolean) {
    this.dropNext = enabled;
    this.emit({ type: 'demo-state-changed' });
  }

  armConflict() {
    this.conflictArmed = true;
    this.emit({ type: 'demo-state-changed' });
  }

  async resetDemoData() {
    return storeTransaction(this.store, KEYS.db, () => {
      this.db = buildSeedDatabase();
      this.emptyDb = buildEmptyDatabase();
      this.dropNext = false;
      this.scenario = 'normal';
      this.caseReady = null;
      this.conflictArmed = false;
      const waiters = this.loadingWaiters;
      this.loadingWaiters = [];
      waiters.forEach((resolve) => resolve());
      this.store.remove(KEYS.db);
      this.store.remove(KEYS.empty);
      this.files.clear();
      this.persist();
      this.store.set(KEYS.settings, JSON.stringify({ scenario: this.scenario }));
      this.emit({ type: 'reset' });
    });
  }

  setLocale(locale: string) {
    setMockLocale(locale);
    this.emit({ type: 'data-changed', projectId: null });
    this.emit({ type: 'demo-state-changed' });
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  async getCapabilities(): Promise<Capabilities> {
    return this.read(() => CAPABILITIES);
  }

  async listProjects(query: ProjectQuery): Promise<ProjectList> {
    return this.read((db) => {
      const search = query.search?.trim().toLowerCase() ?? '';
      const items: ProjectSummary[] = db.projects
        .filter((p) => !search || [p.name, p.client, p.summary].some((t) => t.toLowerCase().includes(search)))
        .filter((p) => !query.status || query.status === 'all' || p.status === query.status)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map((p) => ({
          id: p.id,
          name: p.name,
          client: p.client,
          summary: p.summary,
          currentStage: p.currentStage,
          status: p.status,
          updatedAt: p.updatedAt,
          revision: p.revision,
          openBlockers: computeBlockers(db, p).filter((b) => b.severity === 'blocking').length,
          owners: p.owners,
          nextStep: (() => {
            const next = computeNextAction(db, p, computeEligibility(db, p), CAPABILITIES);
            return { label: next.label, available: next.enabled };
          })(),
          coverImages: db.images
            .filter((i) => i.projectId === p.id)
            .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
            .slice(0, 3)
            .map((i) => ({ url: i.previewUrl, alt: i.name })),
          documents: [
            currentBrief(db, p.id),
            currentArtifact(db, p.id, 'research'),
            currentArtifact(db, p.id, 'strategy'),
          ]
            .filter((d) => d !== null)
            .map((d) => ('stage' in d! ? docLabel(d) : m('doc.brief', { v: d!.version }))),
        }));
      return { items, total: db.projects.length, catalogRevision: db.catalogRevision };
    });
  }

  async getProjectOverview(projectId: ID): Promise<ProjectOverview> {
    return this.read((db) => {
      const project = this.requireProject(db, projectId);
      const eligibility = computeEligibility(db, project);
      const research = currentArtifact(db, projectId, 'research');
      const strategy = currentArtifact(db, projectId, 'strategy');
      return {
        project,
        brief: currentBrief(db, projectId),
        stages: computeStages(db, project, CAPABILITIES),
        blockers: computeBlockers(db, project),
        recentActivity: db.activity
          .filter((a) => a.projectId === projectId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 8),
        nextAction: computeNextAction(db, project, eligibility, CAPABILITIES),
        eligibility,
        research: research ? summarizeArtifact(db, research) : null,
        strategy: strategy ? summarizeArtifact(db, strategy) : null,
        activeJobs: activeJobs(db, projectId).map((j) => this.toJob(db, j)),
      };
    });
  }

  async getBriefHistory(projectId: ID): Promise<BriefHistory> {
    return this.read((db) => {
      const project = this.requireProject(db, projectId);
      return {
        project,
        current: currentBrief(db, projectId),
        versions: db.briefs.filter((b) => b.projectId === projectId).sort((a, b) => b.version - a.version),
        dependentArtifacts: db.artifacts
          .filter((a) => a.projectId === projectId && a.isCurrent)
          .map((a) => summarizeArtifact(db, a)),
        attachments: db.briefAttachments
          .filter((a) => a.projectId === projectId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((a) => ({ ...a, fileAvailable: this.files.has(a.id) })),
      };
    });
  }

  async getBriefAttachmentFile(projectId: ID, attachmentId: ID): Promise<Blob | null> {
    await this.sleep(this.latency.read);
    await this.ensureCaseReady();
    const record = this.active.briefAttachments.find((a) => a.id === attachmentId && a.projectId === projectId);
    if (!record) throw new ServiceError('not_found', render(m('err.attachmentNotFound')));
    return this.files.get(attachmentId) ?? null;
  }

  /** Normalises the task-card fields of a brief save. */
  private briefFields(input: BriefInput) {
    if (input.proposalType !== undefined && !isProposalType(input.proposalType)) throw new ServiceError('validation', '请选择有效的提案类型。');
    return {
      ...(input.proposalType === undefined ? {} : { proposalType: input.proposalType }),
      background: input.background.trim(),
      audience: input.audience.trim(),
      objectives: cleanList(input.objectives),
      deliverables: cleanList(input.deliverables),
      ...(input.visualRequirements === undefined ? {} : {visualRequirements: parseVisualRequirements(input.visualRequirements)}),
      constraints: cleanList(input.constraints),
      brand: (input.brand ?? '').trim(),
      researchQuestions: cleanList(input.researchQuestions ?? []),
      deliverableType: (input.deliverableType ?? '').trim(),
      timeline: (input.timeline ?? '').trim(),
      budget: (input.budget ?? '').trim(),
      references: cleanList(input.references ?? []),
      openQuestions: cleanList(input.openQuestions ?? []),
    };
  }

  /** Keeps the original material with the brief version. The file itself stays in memory only. */
  private storeAttachment(db: DemoDatabase, projectId: ID, version: number, input: BriefInput, now: string, actor = DEMO_USER): ID | null {
    const att = input.attachment;
    if (!att) return null;
    if (att.file) this.files.set(att.id, att.file);
    if (!db.briefAttachments.some((a) => a.id === att.id)) {
      const { file: _file, ...rest } = att;
      void _file;
      db.briefAttachments.push({ ...rest, projectId, briefVersion: version, createdAt: now, addedBy: actor });
    }
    return att.id;
  }

  async getResearchWorkspace(projectId: ID): Promise<ResearchWorkspace> {
    return this.read((db) => {
      const project = this.requireProject(db, projectId);
      const artifact = currentArtifact(db, projectId, 'research');
      return {
        project,
        artifact,
        claims: artifact ? claimsFor(db, artifact) : [],
        sources: db.sources.filter((s) => s.projectId === projectId),
        verification: artifact ? latestReview(db, artifact.id, 'verification') : null,
        readiness: artifact ? latestReview(db, artifact.id, 'readiness') : null,
        gaps: artifact ? computeGaps(db, artifact) : [],
        activeJobs: activeJobs(db, projectId).map((j) => this.toJob(db, j)),
        versions: db.artifacts
          .filter((a) => a.projectId === projectId && a.stage === 'research')
          .sort((a, b) => b.version - a.version)
          .map((a) => summarizeArtifact(db, a)),
      };
    });
  }

  async listSources(projectId: ID, query: SourceQuery): Promise<SourceLibrary> {
    return this.read((db) => {
      const project = this.requireProject(db, projectId);
      const currentIds = new Set(db.artifacts.filter((a) => a.projectId === projectId && a.isCurrent).map((a) => a.id));
      const currentClaims = db.claims.filter((c) => currentIds.has(c.artifactId));
      const search = query.search?.trim().toLowerCase() ?? '';
      const all = db.sources.filter((s) => s.projectId === projectId);
      const items = all
        .filter((s) => !search || [s.title, s.publisher, s.excerpt].some((text) => text.toLowerCase().includes(search) || demoChineseText(text).toLowerCase().includes(search)))
        .filter((s) => !query.intendedUse || query.intendedUse === 'all' || s.intendedUse === query.intendedUse)
        .filter((s) => !query.verificationStatus || query.verificationStatus === 'all' || s.verificationStatus === query.verificationStatus)
        .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))
        .map((s) => ({ ...s, citedByClaimIds: currentClaims.filter((c) => c.sourceIds.includes(s.id)).map((c) => c.id) }));
      const research = currentArtifact(db, projectId, 'research');
      return {
        project,
        items,
        total: all.length,
        attachableClaims:
          research && !research.staleReason
            ? claimsFor(db, research).map((c) => ({ id: c.id, text: c.text, topic: c.topic, supportStatus: c.supportStatus }))
            : [],
      };
    });
  }

  async listImages(projectId: ID): Promise<ImageLibrary> {
    return this.read((db) => {
      const project = this.requireProject(db, projectId);
      const items = db.images
        .filter((i) => i.projectId === projectId)
        .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
        .map((image) => {
          const job = db.jobs.filter((j) => j.target.id === image.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
          return {
            image,
            observation: db.observations.find((o) => o.imageId === image.id) ?? null,
            latestJob: job ? this.toJob(db, job) : null,
          };
        });
      return { project, items };
    });
  }

  async getHandoffOverview(projectId: ID): Promise<HandoffOverview> {
    return this.read((db) => {
      const project = this.requireProject(db, projectId);
      const research = currentArtifact(db, projectId, 'research');
      const permissions = handoffPermissions(db, project);
      return {
        project,
        artifact: research ? summarizeArtifact(db, research) : null,
        verification: research ? latestReview(db, research.id, 'verification') : null,
        readiness: research ? latestReview(db, research.id, 'readiness') : null,
        researchSide: currentHandoff(db, research, 'research_owner'),
        strategySide: currentHandoff(db, research, 'strategy_owner'),
        release: research?.release ?? null,
        history: db.handoffs.filter((h) => h.projectId === projectId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        eligibility: computeEligibility(db, project),
        suggested: suggestHandoffContent(db, project),
        ...permissions,
      };
    });
  }

  async listJobs(projectId: ID): Promise<JobList> {
    return this.read((db) => {
      const project = this.requireProject(db, projectId);
      return {
        project,
        items: db.jobs
          .filter((j) => j.projectId === projectId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((j) => this.toJob(db, j)),
      };
    });
  }

  async listArtifacts(projectId: ID): Promise<ArtifactList> {
    return this.read((db) => {
      const project = this.requireProject(db, projectId);
      return {
        project,
        items: db.artifacts
          .filter((a) => a.projectId === projectId)
          .sort((a, b) => (a.stage === b.stage ? b.version - a.version : a.stage === 'strategy' ? -1 : 1))
          .map((a) => summarizeArtifact(db, a)),
      };
    });
  }

  async getArtifact(projectId: ID, artifactId: ID): Promise<ArtifactDetail> {
    return this.read((db) => {
      const project = this.requireProject(db, projectId);
      const artifact = db.artifacts.find((a) => a.id === artifactId && a.projectId === projectId);
      if (!artifact) throw new ServiceError('not_found', m('err.artifactNotFound'));
      const claims = claimsFor(db, artifact);
      const sourceIds = new Set(claims.flatMap((c) => c.sourceIds));
      return {
        project,
        artifact,
        claims,
        sources: db.sources.filter((s) => sourceIds.has(s.id)),
        reviews: db.reviews.filter((r) => r.artifactId === artifact.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        handoffs: db.handoffs.filter((h) => h.artifactId === artifact.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        versions: db.artifacts
          .filter((a) => a.lineageId === artifact.lineageId)
          .sort((a, b) => b.version - a.version)
          .map((a) => summarizeArtifact(db, a)),
      };
    });
  }

  // -------------------------------------------------------------------------
  // Commands
  // -------------------------------------------------------------------------

  createProject(input: CreateProjectInput, meta: CommandMeta): Promise<MutationResult<Project>> {
    return this.mutate('createProject', { catalog: true }, input, meta, (db, now) => {
      const name = input.name.trim();
      if (!name) throw new ServiceError('validation', m('err.nameRequired'));
      if (db.projects.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
        throw new ServiceError('validation', m('err.nameTaken', { name }));
      }
      const id = this.newId('prj');
      const project: Project = {
        id,
        name,
        client: input.client.trim() || '客户尚未填写',
        summary: input.summary.trim() || '尚未填写摘要。',
        revision: 1,
        currentStage: 'brief',
        status: 'draft',
        createdAt: now,
        updatedAt: now,
        mode: input.mode,
        humanGates: defaultGates(),
        owners: { research: input.researchOwner.trim() || (meta.actor?.name ?? DEMO_USER), strategy: input.strategyOwner.trim() || (meta.actor?.name ?? DEMO_USER) },
        taskCard: { briefVersion: null, goal: '', successCriteria: [], confirmedAt: null, confirmedBy: null },
        continuedToStrategyAt: null,
      };
      db.projects.push(project);
      const start = input.brief;
      const attachmentId = start ? this.storeAttachment(db, id, 1, start, now, meta.actor?.name) : null;
      db.briefs.push({
        id: this.newId('brf'),
        projectId: id,
        version: 1,
        ...this.briefFields(start ?? { background: '', audience: '', objectives: [], deliverables: [], constraints: [], changeNote: '' }),
        ...(meta.actor ? { editedBy: meta.actor.name } : {}),
        editedAt: now,
        provenance: start?.provenance ?? {},
        attachmentIds: attachmentId ? [attachmentId] : [],
        confirmedAt: null,
        confirmedBy: null,
        createdAt: now,
        updatedAt: now,
        changeNote: start?.changeNote.trim() || null,
        supersededAt: null,
      });
      this.pushActivity(db, id, 'project', '已创建提案。', (meta.actor?.name ?? DEMO_USER));
      if (start?.attachment) this.pushActivity(db, id, 'brief', `已依据${start.attachment.fileName ?? '输入材料'}建立简报草稿，尚未确认。`, (meta.actor?.name ?? DEMO_USER));
      refreshProjectState(db, id);
      return project;
    });
  }

  saveBrief(projectId: ID, input: BriefInput, meta: CommandMeta): Promise<MutationResult<Brief>> {
    return this.mutate('saveBrief', { projectId }, input, meta, (db, now) => {
      const project = this.requireProject(db, projectId);
      const brief = currentBrief(db, projectId);
      if (!brief) throw new ServiceError('not_found', m('err.noBrief'));
      const hidden = input.editScope === 'task_card' ? legacyBriefFields(brief) : {};
      const next = { ...this.briefFields({ ...input, visualRequirements: input.visualRequirements ?? brief.visualRequirements, proposalType: input.proposalType ?? brief.proposalType }), ...hidden };
      const current = { ...this.briefFields({ ...brief, changeNote: '' }), ...hidden };
      const same = stableStringify(next) === stableStringify(current) && !input.attachment;
      const provenance = input.editScope === 'task_card' ? { ...brief.provenance } : input.provenance ?? brief.provenance ?? {};
      if (input.editScope === 'task_card') for (const field of ACTIVE_TASK_FIELDS) {
        const entry = input.provenance?.[field];
        if (entry) provenance[field] = entry;
      }
      const source = input.attachment ? `，来自${input.attachment.fileName ?? '输入材料'}` : '';
      if (!brief.confirmedAt) {
        const attachmentId = this.storeAttachment(db, projectId, brief.version, input, now, meta.actor?.name);
        Object.assign(brief, next, {
          provenance,
          attachmentIds: attachmentId && !brief.attachmentIds.includes(attachmentId) ? [...brief.attachmentIds, attachmentId] : brief.attachmentIds,
          updatedAt: now,
          ...(meta.actor ? { editedBy: meta.actor.name } : {}),
          editedAt: now,
          changeNote: input.changeNote.trim() || brief.changeNote,
        });
        this.pushActivity(db, projectId, 'brief', `已保存简报草稿第${brief.version}版${source}。`, (meta.actor?.name ?? DEMO_USER));
        return brief;
      }
      if (same) throw new ServiceError('validation', m('err.briefSame', { v: brief.version }));
      brief.supersededAt = now;
      const attachmentId = this.storeAttachment(db, projectId, brief.version + 1, input, now, meta.actor?.name);
      const created: Brief = {
        id: this.newId('brf'),
        projectId,
        version: brief.version + 1,
        ...next,
        ...(meta.actor ? { editedBy: meta.actor.name } : {}),
        editedAt: now,
        provenance,
        attachmentIds: attachmentId ? [attachmentId] : [],
        confirmedAt: null,
        confirmedBy: null,
        createdAt: now,
        updatedAt: now,
        changeNote: input.changeNote.trim() || null,
        supersededAt: null,
      };
      db.briefs.push(created);
      const stale = markBriefChanged(db, project, brief.version, created.version);
      this.pushActivity(
        db,
        projectId,
        'brief',
        `已保存简报第${created.version}版${source}。${stale.length ? ` ${stale.length}份关联产物已标为过期。` : ''}`,
        (meta.actor?.name ?? DEMO_USER),
      );
      return created;
    });
  }

  confirmBrief(projectId: ID, meta: CommandMeta): Promise<MutationResult<Brief>> {
    return this.mutate('confirmBrief', { projectId }, {}, meta, (db, now) => {
      const project = this.requireProject(db, projectId);
      const brief = currentBrief(db, projectId);
      if (!brief) throw new ServiceError('not_found', m('err.noBrief'));
      if (brief.confirmedAt) throw new ServiceError('validation', m('err.briefConfirmed', { v: brief.version }));
      const missing = [
        !brief.background && m('field.background'),
        !brief.audience && m('field.audience'),
        brief.deliverables.length === 0 && m('field.deliverable'),
      ].filter((f): f is string => Boolean(f));
      if (missing.length) throw new ServiceError('validation', m('err.briefMissing', { fields: missing }));
      // A suggestion is not a requirement until a person accepts or changes it.
      const pending = Object.entries(brief.provenance ?? {})
        .filter(([field, p]) => ACTIVE_TASK_FIELDS.some(active => active === field) && p?.origin === 'suggested')
        .map(([field]) => m(`taskField.${field as TaskField}`));
      if (pending.length) throw new ServiceError('validation', m('err.briefSuggestions', { fields: pending }));
      brief.confirmedAt = now;
      brief.confirmedBy = (meta.actor?.name ?? DEMO_USER);
      brief.updatedAt = now;
      project.taskCard = {
        briefVersion: brief.version,
        goal: researchQuestions(brief)[0] ?? '',
        successCriteria: brief.deliverables.map((d) => `交付：${d}`).slice(0, 4),
        confirmedAt: now,
        confirmedBy: (meta.actor?.name ?? DEMO_USER),
      };
      this.pushActivity(db, projectId, 'brief', `已确认简报第${brief.version}版及任务卡。`, (meta.actor?.name ?? DEMO_USER));
      return brief;
    });
  }

  addSource(projectId: ID, input: SourceInput, meta: CommandMeta): Promise<MutationResult<Source>> {
    return this.mutate('addSource', { projectId }, input, meta, (db, now) => {
      this.requireProject(db, projectId);
      const title = input.title.trim();
      const excerpt = input.excerpt.trim();
      if (!title || !input.publisher.trim() || !excerpt) {
        throw new ServiceError('validation', m('err.sourceFields'));
      }
      const url = input.url.trim() || `https://example.com/sample/added/${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`;
      if (!/^https?:\/\//.test(url)) throw new ServiceError('validation', m('err.sourceUrl'));
      const source: Source = {
        id: this.newId('src'),
        projectId,
        title,
        publisher: input.publisher.trim(),
        url,
        isSampleLink: url.includes('example.com'),
        capturedAt: now,
        excerpt,
        intendedUse: input.intendedUse,
        verificationStatus: 'unverified',
        addedBy: (meta.actor?.name ?? DEMO_USER),
      };
      db.sources.push(source);
      this.pushActivity(db, projectId, 'source', `已添加来源“${clip(title, 60)}”。`, (meta.actor?.name ?? DEMO_USER));
      if (input.attachToClaimId) this.attach(db, projectId, input.attachToClaimId, source.id, meta.actor?.name);
      return source;
    });
  }

  private attach(db: DemoDatabase, projectId: ID, claimId: ID, sourceId: ID, actor = DEMO_USER): Claim {
    const claim = db.claims.find((c) => c.id === claimId);
    const artifact = claim && db.artifacts.find((a) => a.id === claim.artifactId);
    if (!claim || !artifact || artifact.projectId !== projectId) throw new ServiceError('not_found', m('err.claimNotFound'));
    if (!artifact.isCurrent) throw new ServiceError('validation', m('err.historical'));
    if (artifact.stage !== 'research') throw new ServiceError('validation', m('err.researchOnly'));
    if (artifact.staleReason) throw new ServiceError('validation', m('err.staleEvidence'));
    const source = db.sources.find((s) => s.id === sourceId && s.projectId === projectId);
    if (!source) throw new ServiceError('not_found', m('err.sourceNotFound'));
    if (claim.sourceIds.includes(sourceId)) throw new ServiceError('validation', m('err.alreadyCited'));
    claim.sourceIds.push(sourceId);
    claim.supportStatus = 'unverified';
    markEvidenceChanged(db, artifact, m('o.sourceAttached', { title: clip(source.title, 50) }));
    this.pushActivity(db, projectId, 'research', `已将“${clip(source.title, 50)}”关联到断言“${clip(claim.text, 60)}”。`, actor);
    return claim;
  }

  linkSourceToClaim(projectId: ID, claimId: ID, sourceId: ID, meta: CommandMeta): Promise<MutationResult<Claim>> {
    return this.mutate('linkSourceToClaim', { projectId }, { claimId, sourceId }, meta, (db) => this.attach(db, projectId, claimId, sourceId, meta.actor?.name));
  }

  addClaim(projectId: ID, input: ClaimInput, meta: CommandMeta): Promise<MutationResult<Claim>> {
    return this.mutate('addClaim', { projectId }, input, meta, (db) => {
      const research = this.requireCurrentResearch(db, projectId, 'addClaims');
      const section = research.sections.find((s) => s.id === input.sectionId);
      if (!section) throw new ServiceError('validation', m('err.section'));
      const text = input.text.trim();
      if (text.length < 12) throw new ServiceError('validation', m('err.claimShort'));
      const known = new Set(db.sources.filter((s) => s.projectId === projectId).map((s) => s.id));
      const claim: Claim = {
        id: this.newId('clm'),
        artifactId: research.id,
        text,
        topic: input.topic,
        sourceIds: input.sourceIds.filter((id) => known.has(id)),
        supportStatus: 'unverified',
        limitations: [],
      };
      db.claims.push(claim);
      research.claimIds.push(claim.id);
      section.blocks.push({ kind: 'paragraph', segments: [{ claimId: claim.id }] });
      markEvidenceChanged(db, research, m('o.claimAdded'));
      this.pushActivity(db, projectId, 'research', `已向“${section.heading}”添加一条${activityText(m(`topic.${input.topic}`))}断言。`, (meta.actor?.name ?? DEMO_USER));
      return claim;
    });
  }

  uploadImage(projectId: ID, input: ImageUploadInput, meta: CommandMeta): Promise<MutationResult<ImageAsset>> {
    return this.mutate('uploadImage', { projectId }, input, meta, (db, now) => {
      this.requireProject(db, projectId);
      if (!input.dataUrl.startsWith('data:image/')) throw new ServiceError('validation', m('err.imageType'));
      if (input.dataUrl.length > 3_000_000) throw new ServiceError('validation', m('err.imageSize'));
      const image: ImageAsset = {
        id: this.newId('img'),
        projectId,
        name: input.name.trim() || '未命名图片',
        previewUrl: input.dataUrl,
        sourceNote: input.sourceNote.trim(),
        uploadedAt: now,
        observationStatus: 'not_requested',
        isPlaceholder: false,
        width: input.width,
        height: input.height,
      };
      db.images.push(image);
      db.imageMeta[image.id] = { dominantColors: input.dominantColors.slice(0, 4) };
      this.pushActivity(db, projectId, 'image', `已上传图片“${clip(image.name, 50)}”。`, (meta.actor?.name ?? DEMO_USER));
      return image;
    });
  }

  requestObservation(projectId: ID, imageId: ID, meta: CommandMeta): Promise<MutationResult<Job>> {
    return this.mutate('requestObservation', { projectId }, { imageId }, meta, (db) => {
      const project = this.requireProject(db, projectId);
      if (!CAPABILITIES.image_observation.supported) throw new ServiceError('unavailable', CAPABILITIES.image_observation.reason);
      const image = db.images.find((i) => i.id === imageId && i.projectId === projectId);
      if (!image) throw new ServiceError('not_found', m('err.imageNotFound'));
      if (activeJobs(db, projectId).some((j) => j.target.id === imageId)) throw new ServiceError('validation', m('err.observing'));
      image.observationStatus = 'pending';
      const job = this.createJob(db, project, 'image_observation', m('job.observe', { name: clip(image.name, 40) }), { kind: 'image', id: image.id, label: image.name }, meta.commandId);
      this.pushActivity(db, projectId, 'job', `已请求对“${clip(image.name, 50)}”进行模拟观察。`, (meta.actor?.name ?? DEMO_USER));
      return this.toJob(db, job);
    });
  }

  reviewObservation(projectId: ID, input: ObservationReviewInput, meta: CommandMeta): Promise<MutationResult<Observation>> {
    return this.mutate('reviewObservation', { projectId }, input, meta, (db, now) => {
      const observation = db.observations.find((o) => o.id === input.observationId);
      const image = observation && db.images.find((i) => i.id === observation.imageId && i.projectId === projectId);
      if (!observation || !image) throw new ServiceError('not_found', m('err.observationNotFound'));
      if (input.decision === 'needs_revision' && !input.note.trim()) throw new ServiceError('validation', m('err.revisionNote'));
      observation.reviewStatus = input.decision;
      observation.reviewNote = input.note.trim() || null;
      observation.reviewedAt = now;
      this.pushActivity(db, projectId, 'image', `“${clip(image.name, 50)}”的观察结果${input.decision === 'confirmed' ? '已确认' : '已标为待修订'}。`, (meta.actor?.name ?? DEMO_USER));
      return observation;
    });
  }

  generateResearch(projectId: ID, meta: CommandMeta): Promise<MutationResult<Job>> {
    return this.mutate('generateResearch', { projectId }, {}, meta, (db) => {
      const project = this.requireProject(db, projectId);
      const brief = currentBrief(db, projectId);
      if (!brief?.confirmedAt) throw new ServiceError('validation', m('err.confirmFirst'));
      this.assertNoActiveJob(db, projectId, 'research_generation', m('err.running.research'));
      const research = currentArtifact(db, projectId, 'research');
      if (research && !research.staleReason) {
        throw new ServiceError('validation', m('err.researchCurrent', { v: research.version }));
      }
      const label = research ? m('job.regenerateFor', { v: brief.version }) : m('job.scaffold');
      const target = research ? { kind: 'artifact' as const, id: research.id, label: docLabel(research) } : { kind: 'project' as const, id: projectId, label: project.name };
      const job = this.createJob(db, project, 'research_generation', label, target, meta.commandId);
      this.pushActivity(db, projectId, 'job', `已开始：${activityText(label)}。`, (meta.actor?.name ?? DEMO_USER));
      return this.toJob(db, job);
    });
  }

  startVerification(projectId: ID, meta: CommandMeta): Promise<MutationResult<Job>> {
    return this.mutate('startVerification', { projectId }, {}, meta, (db) => {
      const project = this.requireProject(db, projectId);
      const research = this.requireCurrentResearch(db, projectId, 'verify');
      this.assertNoActiveJob(db, projectId, 'evidence_verification', m('err.running.verification'));
      const job = this.createJob(db, project, 'evidence_verification', m('job.verify', { target: docLabel(research) }), { kind: 'artifact', id: research.id, label: docLabel(research) }, meta.commandId);
      this.pushActivity(db, projectId, 'job', `已开始核验调研第${research.version}版的证据。`, (meta.actor?.name ?? DEMO_USER));
      return this.toJob(db, job);
    });
  }

  startReadinessReview(projectId: ID, meta: CommandMeta): Promise<MutationResult<Job>> {
    return this.mutate('startReadinessReview', { projectId }, {}, meta, (db) => {
      const project = this.requireProject(db, projectId);
      const research = this.requireCurrentResearch(db, projectId, 'readiness');
      this.assertNoActiveJob(db, projectId, 'readiness_review', m('err.running.readiness'));
      const job = this.createJob(db, project, 'readiness_review', m('job.readiness', { target: docLabel(research) }), { kind: 'artifact', id: research.id, label: docLabel(research) }, meta.commandId);
      this.pushActivity(db, projectId, 'job', `已开始检查调研第${research.version}版的就绪度。`, (meta.actor?.name ?? DEMO_USER));
      return this.toJob(db, job);
    });
  }

  recordHandoff(projectId: ID, input: HandoffInput, meta: CommandMeta): Promise<MutationResult<Handoff>> {
    return this.mutate('recordHandoff', { projectId }, input, meta, (db, now) => {
      const project = this.requireProject(db, projectId);
      const research = this.requireCurrentResearch(db, projectId, 'handoff');
      const permissions = handoffPermissions(db, project);
      const permission = input.side === 'research_owner' ? permissions.canDeliver : permissions.canAccept;
      if (!permission.allowed) throw new ServiceError('not_eligible', permission.reason);
      if (input.side === 'research_owner' && input.decision !== 'delivered') throw new ServiceError('validation', m('err.deliverDecision'));
      if (input.side === 'strategy_owner' && input.decision === 'delivered') throw new ServiceError('validation', m('err.acceptDecision'));
      const permittedUses = cleanList(input.permittedUses);
      const prohibitedInferences = cleanList(input.prohibitedInferences);
      if (input.side === 'research_owner' && permittedUses.length === 0) throw new ServiceError('validation', m('err.permittedUse'));
      if (input.decision === 'returned' && !input.note.trim()) throw new ServiceError('validation', m('err.returnNote'));
      const owner = input.side === 'research_owner' ? project.owners.research : project.owners.strategy;
      const handoff: Handoff = {
        id: this.newId('hof'),
        projectId,
        artifactId: research.id,
        artifactVersion: research.version,
        side: input.side,
        owner,
        decision: input.decision,
        permittedUses,
        prohibitedInferences,
        unresolvedIssues: cleanList(input.unresolvedIssues),
        note: input.note.trim(),
        createdAt: now,
        recordedBy: `${(meta.actor?.name ?? DEMO_USER)}代表${owner}记录（模拟确认）`,
        outdated: false,
        outdatedReason: null,
      };
      db.handoffs.push(handoff);
      if (input.decision === 'returned') {
        const delivery = currentHandoff(db, research, 'research_owner');
        if (delivery) {
          delivery.outdated = true;
          delivery.outdatedReason = m('o.returned', { owner, atDate: now });
        }
      }
      const verb = { delivered: '已交付', accepted: '已接受', accepted_with_conditions: '有条件接受', returned: '已退回' }[input.decision];
      this.pushActivity(db, projectId, 'handoff', `${owner}${verb}调研第${research.version}版（演示记录）。`, (meta.actor?.name ?? DEMO_USER));
      return handoff;
    });
  }

  releaseResearch(projectId: ID, meta: CommandMeta): Promise<MutationResult<Artifact>> {
    return this.mutate('releaseResearch', { projectId }, {}, meta, (db, now) => {
      const project = this.requireProject(db, projectId);
      const research = this.requireCurrentResearch(db, projectId, 'release');
      const { canRelease } = handoffPermissions(db, project);
      if (!canRelease.allowed) throw new ServiceError('not_eligible', canRelease.reason);
      research.release = { releasedAt: now, releasedBy: (meta.actor?.name ?? DEMO_USER) };
      this.pushActivity(db, projectId, 'release', `已释放调研第${research.version}版，供策略阶段使用。`, (meta.actor?.name ?? DEMO_USER));
      refreshProjectState(db, projectId);
      return research;
    });
  }

  continueToStrategy(projectId: ID, meta: CommandMeta): Promise<MutationResult<Job>> {
    return this.mutate('continueToStrategy', { projectId }, {}, meta, (db, now) => {
      const project = this.requireProject(db, projectId);
      const feature = CAPABILITIES.continuation_to_strategy;
      if (!feature.supported) throw new ServiceError('unavailable', feature.reason);
      const eligibility = computeEligibility(db, project);
      if (!eligibility.eligible) {
        const failing = eligibility.checks.filter((c) => !c.passed).map((c) => c.label);
        throw new ServiceError('not_eligible', eligibility.alreadyContinued ? eligibility.summary : m('err.notEligible', { summary: eligibility.summary, checks: failing }));
      }
      const research = currentArtifact(db, projectId, 'research')!;
      project.continuedToStrategyAt = now;
      const job = this.createJob(db, project, 'strategy_generation', m('job.strategy', { target: docLabel(research) }), { kind: 'artifact', id: research.id, label: docLabel(research) }, meta.commandId, {
        sim: { queueMs: 1200, runMs: 3800, outcome: 'success' },
      });
      this.pushActivity(db, projectId, 'strategy', '已进入策略阶段，正在生成模拟策略草稿。', (meta.actor?.name ?? DEMO_USER));
      return this.toJob(db, job);
    });
  }

  retryJob(projectId: ID, jobId: ID, meta: CommandMeta): Promise<MutationResult<Job>> {
    return this.mutate('retryJob', { projectId }, { jobId }, meta, (db) => {
      const project = this.requireProject(db, projectId);
      const job = db.jobs.find((j) => j.id === jobId && j.projectId === projectId);
      if (!job) throw new ServiceError('not_found', m('err.jobNotFound'));
      const recovery = jobRecovery(db, job);
      if (recovery.action !== 'retry' || !recovery.eligible) throw new ServiceError('not_eligible', recovery.reason);
      const retry = this.createJob(db, project, job.purpose, job.label, { ...job.target }, meta.commandId, { attempt: job.attempt + 1, retryOfJobId: job.id });
      if (job.target.kind === 'image') {
        const image = db.images.find((i) => i.id === job.target.id);
        if (image) image.observationStatus = 'pending';
      }
      this.pushActivity(db, projectId, 'job', `已重试“${activityText(job.label)}”，这是第${retry.attempt}次尝试。`, (meta.actor?.name ?? DEMO_USER));
      return this.toJob(db, retry);
    });
  }

  reconcileJob(projectId: ID, jobId: ID, meta: CommandMeta): Promise<MutationResult<Job>> {
    return this.mutate('reconcileJob', { projectId }, { jobId }, meta, (db, now) => {
      const job = db.jobs.find((j) => j.id === jobId && j.projectId === projectId);
      if (!job) throw new ServiceError('not_found', m('err.jobNotFound'));
      const recovery = jobRecovery(db, job);
      if (recovery.action !== 'reconcile' || !recovery.eligible) throw new ServiceError('not_eligible', recovery.reason);
      job.output = this.applyJobOutput(db, job, now);
      job.status = 'succeeded';
      job.completedAt = now;
      job.reconciledAt = now;
      if (job.receipt) job.receipt.raw = { ...job.receipt.raw, delivery: 'reconciled', reconciled_at: now };
      this.pushActivity(db, projectId, 'job', `已取回“${activityText(job.label)}”的保存结果，没有新建任务。`, (meta.actor?.name ?? DEMO_USER));
      return this.toJob(db, job);
    });
  }
}
