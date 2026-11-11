import type { WorkbenchService, EnvironmentInfo, ServiceListener } from '../../domain/service';
import { ServiceError } from '../../domain/service';
import type { BriefInput, CommandMeta, CreateProjectInput, MutationResult, ProjectQuery, ProjectSummary } from '../../domain/models';
import { artifactSummary, mapArtifact, mapAttachments, mapBrief, mapCapabilities, mapJob, mapOverview, mapProject, mapClaims, mapSources, mapReview, mapHandoff, mapImageRecords, projectionGaps } from './mappers';
import { emptyBrief, metadataFor, readBrief, writeBrief } from './briefEnvelope';
import { object, parseSnapshot, records, text, type Snapshot } from './dto';
import type { CheckpointStage, ProductionMode } from '../../domain/proposal';

export interface HttpServiceOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  getHeaders?: () => Record<string, string> | Promise<Record<string, string>>;
}
const unavailable = (operation: string): Promise<never> => Promise.reject(new ServiceError('unavailable', `“${operation}”尚未接入真实后端。`));
export const gateNames: Record<CheckpointStage, string> = { strategy: 'strategy', themes: 'copy', visual: 'visual', content_review: 'content_review', delivery: 'final_review' };

export async function mapHttpError(response: Response | null, cause?: unknown): Promise<ServiceError> {
  if (!response) return new ServiceError('network', cause instanceof Error ? cause.message : '无法连接工作台服务。', { retryable: true, outcomeUnknown: true });
  let message = `Request failed (${response.status}).`, code = '';
  try {
    const body = object(await response.json()), error = body.error ? object(body.error) : body;
    message = text(error.message, message); code = text(error.code);
  } catch { /* Non-JSON response. */ }
  const detail = code ? `${code} · ${message}` : message;
  if (code === 'COMMAND_ID_REUSED') return new ServiceError('idempotency_mismatch', detail);
  if (response.status === 409 || response.status === 412) return new ServiceError('conflict', detail);
  if (response.status === 404) return new ServiceError('not_found', detail);
  if (response.status === 400 || response.status === 422 || response.status === 413) return new ServiceError('validation', detail);
  if (response.status === 403) return new ServiceError('not_eligible', detail);
  return new ServiceError('network', detail, { retryable: response.status >= 500 });
}

export class HttpWorkbenchService implements WorkbenchService {
  readonly environment: EnvironmentInfo = { kind: 'live', label: '真实本地服务' };
  private listeners = new Set<ServiceListener>();
  private locale = 'en';
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pollFingerprint: string | null = null;
  private pendingBodies = new Map<string, { fingerprint: string; body: Record<string, unknown> }>();
  private prepare(meta: CommandMeta, fingerprint: string, make: () => Record<string, unknown>) {
    const previous = this.pendingBodies.get(meta.commandId);
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new ServiceError('idempotency_mismatch', '同一命令 ID 不能用于不同输入。');
      return previous.body;
    }
    const body = make();
    this.pendingBodies.set(meta.commandId, { fingerprint, body });
    if (this.pendingBodies.size > 100) { const oldest = this.pendingBodies.keys().next().value; if (oldest) this.pendingBodies.delete(oldest); }
    return body;
  }
  constructor(private readonly options: HttpServiceOptions) {}
  setLocale(locale: string) { if (locale !== this.locale) { this.locale = locale; this.emit(null); } }
  private emit(projectId: string | null) { for (const listener of this.listeners) listener({ type: 'data-changed', projectId }); }
  subscribe(listener: ServiceListener) {
    this.listeners.add(listener);
    if (this.listeners.size === 1) this.schedulePoll();
    return () => { this.listeners.delete(listener); if (!this.listeners.size && this.timer) { clearTimeout(this.timer); this.timer = null; this.pollFingerprint = null; } };
  }
  private schedulePoll() {
    if (!this.listeners.size || this.timer) return;
    this.timer = setTimeout(async () => {
      this.timer = null;
      try {
        const value = await this.request('GET', '/projects'), fingerprint = JSON.stringify(value);
        if (this.pollFingerprint !== fingerprint) this.emit(null);
        this.pollFingerprint = fingerprint;
      } catch { this.emit(null); }
      this.schedulePoll();
    }, 4000);
  }
  async request(method: string, path: string, body?: unknown): Promise<unknown> { return (await this.requestResult(method, path, body)).value; }
  private async requestResult(method: string, path: string, body?: unknown): Promise<{ value: unknown; status: number }> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const headers = { 'Content-Type': 'application/json', 'Accept-Language': this.locale, ...(await this.options.getHeaders?.()) };
    const encoded = body === undefined ? undefined : JSON.stringify(body);
    if (encoded && new TextEncoder().encode(encoded).byteLength > 128 * 1024) throw new ServiceError('validation', '任务卡请求超过后端 128 KiB 限制。未保存，请缩短原始材料。');
    let response: Response;
    try { response = await fetchImpl(`${this.options.baseUrl.replace(/\/$/, '')}${path}`, { method, headers, cache: 'no-store', body: encoded }); }
    catch (cause) {
      const error = await mapHttpError(null, cause);
      throw new ServiceError(error.kind, error.message, { retryable: true, outcomeUnknown: method !== 'GET' });
    }
    if (!response.ok) throw await mapHttpError(response);
    let value: unknown;
    try { value = await response.json(); }
    catch (cause) {
      throw new ServiceError(method === 'GET' ? 'network' : 'response_lost', cause instanceof Error ? cause.message : '无法读取服务响应，请使用同一命令重试。', { retryable: true, outcomeUnknown: method !== 'GET' });
    }
    if (method !== 'GET') this.emit(null);
    return { value, status: response.status };
  }
  async snapshot(projectId: string) { return parseSnapshot(await this.request('GET', `/projects/${encodeURIComponent(projectId)}`)); }
  async snapshots(): Promise<Snapshot[]> {
    const root = object(await this.request('GET', '/projects'));
    return Promise.all(records(root.projects).map((p) => this.snapshot(text(p.id))));
  }
  private mutation<T>(snapshot: Snapshot, data: T, meta: CommandMeta): MutationResult<T> {
    const audit = snapshot.audit.find((a) => a.commandId === meta.commandId);
    return { data, revision: snapshot.revision, commandId: meta.commandId, replayed: Boolean(audit && audit.revision < snapshot.revision) };
  }
  private async sourceMutation(id: string, path: string, body: Record<string, unknown>, meta: CommandMeta) {
    try { return await this.request('POST', `/projects/${encodeURIComponent(id)}/${path}`, body); }
    catch (error) {
      if (error instanceof ServiceError && error.kind === 'conflict') {
        const current = await this.snapshot(id);
        throw new ServiceError('conflict', error.message, { conflict: { expectedRevision: meta.expectedRevision, currentRevision: current.revision, changedBy: current.audit.at(-1)?.actorId ?? null, changeSummary: current.audit.at(-1)?.kind ?? null } });
      }
      throw error;
    }
  }
  async command(projectId: string, fields: Record<string, unknown>, meta: CommandMeta): Promise<Snapshot> {
    try { return parseSnapshot(await this.request('POST', `/projects/${encodeURIComponent(projectId)}/commands`, { ...fields, ...meta })); }
    catch (error) {
      if (error instanceof ServiceError && error.kind === 'conflict') {
        const current = await this.snapshot(projectId);
        throw new ServiceError('conflict', error.message, { conflict: { expectedRevision: meta.expectedRevision, currentRevision: current.revision, changedBy: current.audit.at(-1)?.actorId ?? null, changeSummary: current.audit.at(-1)?.kind ?? null } });
      }
      throw error;
    }
  }
  getCapabilities = async () => mapCapabilities(await this.request('GET', '/capabilities'));
  listProjects = async (query: ProjectQuery) => {
    const items: ProjectSummary[] = (await this.snapshots()).map((p) => {
      const overview = mapOverview(p), project = overview.project;
      return { ...project, openBlockers: overview.blockers.length, nextStep: { label: overview.nextAction.label, available: overview.nextAction.enabled }, coverImages: [], documents: [`Brief v${project.taskCard.briefVersion}`] };
    });
    const filtered = items.filter((p) => (!query.status || query.status === 'all' || query.status === p.status) && (!query.search || `${p.name} ${p.client} ${p.summary}`.toLowerCase().includes(query.search.toLowerCase())));
    return { items: filtered, total: filtered.length, catalogRevision: 0 };
  };
  getProjectOverview = async (id: string) => mapOverview(await this.snapshot(id));
  getBriefHistory = async (id: string) => {
    const p = await this.snapshot(id), versions = p.cards.map((c) => mapBrief(p, c));
    return { project: mapProject(p), current: versions.find((b) => b.id === p.activeTaskCardId) ?? null, versions: [...versions].reverse(), dependentArtifacts: p.artifacts.map((a) => artifactSummary(mapArtifact(p, a))), attachments: mapAttachments(p) };
  };
  private async artifactProjection(p: Snapshot, artifactId: string) {
    const raw = p.artifacts.find((a) => a.id === artifactId);
    if (!raw) throw new ServiceError('not_found', '后端未找到此产物。');
    const envelope = object(await this.request('GET', `/projects/${encodeURIComponent(p.id)}/artifacts/${encodeURIComponent(artifactId)}/content`));
    if (envelope.artifactId !== artifactId || envelope.contentHash !== raw.contentHash) throw new ServiceError('validation', '产物响应的版本或正文哈希不匹配。');
    const content = object(envelope.content);
    if (!Array.isArray(content.claims)) throw new ServiceError('validation', '研究产物缺少真实论点清单。');
    const artifact = mapArtifact(p, raw, content);
    const claims = await mapClaims(p, raw, content), sources = mapSources(p, raw);
    artifact.claimIds = claims.items.map((claim) => claim.id);
    const reviews = [...p.textReports.verification.filter((review) => review.artifactId === artifactId).map((review) => mapReview(p, artifact, raw, review, 'verification')), ...p.textReports.readiness.filter((review) => review.artifactId === artifactId).map((review) => mapReview(p, artifact, raw, review, 'readiness'))];
    const handoffs = p.textReports.handoff.filter((entry) => entry.artifactId === artifactId).map((entry) => mapHandoff(p, artifact, entry));
    return { artifact, raw, claims: claims.items, sources: sources.items, reviews, handoffs, gaps: projectionGaps(claims.unclassified, sources.unclassified), unclassifiedSources: sources.unclassified };
  }
  getResearchWorkspace = async (id: string) => {
    const p = await this.snapshot(id), state = p.stages.find((s) => s.stage === 'research');
    const detail = state?.activeArtifactId ? await this.artifactProjection(p, state.activeArtifactId) : null;
    const verification = detail?.reviews.filter((review) => review.type === 'verification' && !review.outdated) ?? [];
    const readiness = detail?.reviews.filter((review) => review.type === 'readiness') ?? [];
    return { project: mapProject(p), artifact: detail?.artifact ?? null, claims: detail?.claims ?? [], sources: detail?.sources ?? [], verification: verification.find((review) => review.decision === 'fail') ?? verification.at(-1) ?? null, readiness: readiness.find((review) => !review.outdated) ?? readiness.at(-1) ?? null, gaps: detail?.gaps ?? [], activeJobs: p.jobs.filter((j) => ['queued', 'running', 'awaiting_reconciliation'].includes(text(j.status))).map((j) => mapJob(p, j)), versions: p.artifacts.filter((a) => a.stage === 'research').map((a) => artifactSummary(mapArtifact(p, a))) };
  };
  listSources: WorkbenchService['listSources'] = async (id, query) => {
    const p = await this.snapshot(id), active = p.stages.find((stage) => stage.stage === 'research')?.activeArtifactId, artifact = p.artifacts.find((item) => item.id === active), sources = mapSources(p, artifact);
    const detail = active ? await this.artifactProjection(p, active) : null;
    const items = sources.items.map((source) => ({ ...source, citedByClaimIds: (detail?.claims ?? []).filter((claim) => claim.sourceIds.includes(source.id)).map((claim) => claim.id) }));
    return { project: mapProject(p), items: items.filter((source) => (!query.intendedUse || query.intendedUse === 'all' || source.intendedUse === query.intendedUse) && (!query.verificationStatus || query.verificationStatus === 'all' || source.verificationStatus === query.verificationStatus) && (!query.search || `${source.title} ${source.publisher} ${source.excerpt}`.toLowerCase().includes(query.search.toLowerCase()))), total: items.length, attachableClaims: detail?.claims ?? [] };
  };
  listImages = async (id: string) => { const p = await this.snapshot(id); return { project: mapProject(p), items: mapImageRecords(p, this.options.baseUrl) }; };
  getHandoffOverview = async (id: string) => {
    const p = await this.snapshot(id), active = p.stages.find((stage) => stage.stage === 'research')?.activeArtifactId;
    const detail = active ? await this.artifactProjection(p, active) : null;
    const verification = detail?.reviews.filter((review) => review.type === 'verification' && !review.outdated) ?? [];
    const readiness = detail?.reviews.filter((review) => review.type === 'readiness') ?? [];
    const history = p.textReports.handoff.map((entry) => {
      const raw = p.artifacts.find((artifact) => artifact.id === entry.artifactId);
      if (!raw) throw new ServiceError('validation', '历史交接缺少对应产物版本。');
      return mapHandoff(p, mapArtifact(p, raw), entry);
    });
    return { project: mapProject(p), artifact: detail ? artifactSummary(detail.artifact) : null, verification: verification.find((review) => review.decision === 'fail') ?? verification.at(-1) ?? null, readiness: readiness.find((review) => !review.outdated) ?? readiness.at(-1) ?? null, researchSide: history.filter((entry) => !entry.outdated && entry.side === 'research_owner').at(-1) ?? null, strategySide: history.filter((entry) => !entry.outdated && entry.side === 'strategy_owner').at(-1) ?? null, release: detail?.artifact.release ?? null, history, eligibility: mapOverview(p).eligibility, suggested: { permittedUses: [], prohibitedInferences: [], unresolvedIssues: detail?.artifact.sections.filter((section) => section.id.endsWith(':gaps')).flatMap((section) => section.blocks.flatMap((block) => block.kind === 'list' ? block.items : [])) ?? [] }, canDeliver: { allowed: false, reason: '原版人工交付表单与真实模型负责人交接尚未完成同构接入。' }, canAccept: { allowed: false, reason: '模型负责人的真实接收不能由人工表单冒充。' }, canRelease: { allowed: false, reason: '后端通过策略续接原子放行，不提供单独人工发布命令。' } };
  };
  listJobs = async (id: string) => { const p = await this.snapshot(id); return { project: mapProject(p), items: p.jobs.map((j) => mapJob(p, j)) }; };
  listArtifacts = async (id: string) => { const p = await this.snapshot(id); return { project: mapProject(p), items: p.artifacts.map((a) => artifactSummary(mapArtifact(p, a))) }; };
  getArtifact = async (id: string, artifactId: string) => {
    const p = await this.snapshot(id), detail = await this.artifactProjection(p, artifactId);
    return { project: mapProject(p), artifact: detail.artifact, claims: detail.claims, sources: detail.sources, reviews: detail.reviews, handoffs: detail.handoffs, versions: p.artifacts.filter((x) => x.stage === detail.raw.stage).map((x) => artifactSummary(mapArtifact(p, x))) };
  };
  getBriefAttachmentFile = async () => null;
  createProject = async (input: CreateProjectInput, meta: CommandMeta) => {
    const body = this.prepare(meta, JSON.stringify(input), () => ({ name: input.name, brief: writeBrief(input.brief ?? emptyBrief(), metadataFor(input), new Date().toISOString()), mode: input.mode === 'supervised' ? 'auto' : 'assisted', humanGates: (input.checkpoints ?? []).map((s) => gateNames[s]), authorizedThrough: 'final_review', commandId: meta.commandId }));
    const response = await this.requestResult('POST', '/projects', body), p = parseSnapshot(response.value);
    return { ...this.mutation(p, mapProject(p), meta), replayed: response.status === 200 };
  };
  saveBrief = async (id: string, input: BriefInput, meta: CommandMeta) => {
    const before = await this.snapshot(id), card = before.cards.find((c) => c.id === before.activeTaskCardId);
    if (!card) throw new ServiceError('validation', '后端缺少当前任务卡。');
    const original = readBrief(card.brief);
    const body = this.prepare(meta, JSON.stringify({ id, input }), () => ({ kind: 'revise-task-card', taskCardId: `${id}:scope:${meta.commandId}`, brief: writeBrief({ ...input, attachment: input.attachment ?? original.fields.attachment }, original.metadata, new Date().toISOString()) }));
    const p = await this.command(id, body, meta);
    const saved = p.cards.find((c) => c.id === body.taskCardId);
    if (!saved) throw new ServiceError('validation', '保存响应缺少当前任务卡。');
    return { ...this.mutation(p, mapBrief(p, saved), meta), replayed: Object.hasOwn(before.processedCommands, meta.commandId) };
  };
  confirmBrief = async (id: string, meta: CommandMeta) => {
    const current = await this.snapshot(id);
    const body = this.prepare(meta, id, () => ({ kind: 'confirm-task-card', taskCardId: current.activeTaskCardId }));
    const p = await this.command(id, body, meta), card = p.cards.find((c) => c.id === body.taskCardId);
    if (!card) throw new ServiceError('validation', '确认响应缺少任务卡。');
    return { ...this.mutation(p, mapBrief(p, card), meta), replayed: Object.hasOwn(current.processedCommands, meta.commandId) };
  };
  async setPolicy(id: string, mode: ProductionMode, checkpoints: CheckpointStage[]) {
    const p = await this.snapshot(id);
    const hiddenGates = p.policy.humanGates.filter((g) => !Object.values(gateNames).includes(g));
    return this.command(id, { kind: 'set-policy', mode: mode === 'automatic' ? 'auto' : 'assisted', humanGates: [...hiddenGates, ...checkpoints.map((s) => gateNames[s])], authorizedThrough: p.policy.authorizedThrough }, { commandId: crypto.randomUUID(), expectedRevision: p.revision });
  }
  addSource: WorkbenchService['addSource'] = async (id, input, meta) => {
    const before = await this.snapshot(id);
    const body = this.prepare(meta, JSON.stringify({id, input}), () => ({...input, ...meta}));
    const response = object(await this.sourceMutation(id, 'sources', body, meta));
    const next = parseSnapshot(response), source = mapSources(next).items.find((entry) => entry.id === response.sourceId);
    if (!source) throw new ServiceError('response_lost', '来源请求已返回但缺少保存记录，请用同一命令核对。', {retryable:true, outcomeUnknown:true});
    return {...this.mutation(next, source, meta), replayed: Object.hasOwn(before.processedCommands, meta.commandId)};
  };
  linkSourceToClaim = () => unavailable('来源关联');
  addClaim = () => unavailable('添加论点');
  uploadImage = () => unavailable('图片上传');
  requestObservation = () => unavailable('图片观察');
  reviewObservation = () => unavailable('图片观察复核');
  generateResearch: WorkbenchService['generateResearch'] = async (id, meta) => {
    const before = await this.snapshot(id);
    const body = this.prepare(meta, JSON.stringify({id, kind:'research-generation'}), () => {
      const sourceEntryIds = before.sourceEntries.filter((entry) => entry.taskCardId === before.activeTaskCardId).map((entry) => text(entry.id));
      if (!sourceEntryIds.length) throw new ServiceError('not_eligible', '当前任务卡没有已登记的来源，请先在资料库添加来源。旧任务卡材料不会自动采用。');
      return {stage:'research', sourceEntryIds, ...meta};
    });
    const response = object(await this.sourceMutation(id, 'jobs', body, meta));
    const next = parseSnapshot(response), job = next.jobs.find((entry) => entry.id === response.jobId);
    if (!job) throw new ServiceError('response_lost', '研究请求已返回但缺少任务身份，请用同一命令核对。', {retryable:true, outcomeUnknown:true});
    return {...this.mutation(next, mapJob(next, job), meta), replayed: Object.hasOwn(before.processedCommands, meta.commandId)};
  };
  private async enqueueReview(id: string, meta: CommandMeta, kind: 'verification' | 'readiness') {
    const p = await this.snapshot(id);
    const fields = this.prepare(meta, JSON.stringify({ id, kind }), () => {
      const artifactId = p.stages.find((stage) => stage.stage === 'research')?.activeArtifactId;
      if (!artifactId) throw new ServiceError('not_eligible', '当前没有可审查的真实研究产物。');
      return { artifactId, ...(kind === 'readiness' ? { protocolVersion: 'research-readiness-v2' } : {}) };
    });
    let result: Record<string, unknown>;
    try { result = object(await this.request('POST', `/projects/${encodeURIComponent(id)}/${kind === 'verification' ? 'verifications' : 'readiness'}`, { ...fields, ...meta })); }
    catch (error) {
      if (error instanceof ServiceError && error.kind === 'conflict') {
        const current = await this.snapshot(id);
        throw new ServiceError('conflict', error.message, { conflict: { expectedRevision: meta.expectedRevision, currentRevision: current.revision, changedBy: current.audit.at(-1)?.actorId ?? null, changeSummary: current.audit.at(-1)?.kind ?? null } });
      }
      throw error;
    }
    const next = parseSnapshot(result), job = next.jobs.find((entry) => entry.id === result.jobId);
    if (!job) throw new ServiceError('response_lost', '审查请求已返回但缺少任务身份，请用同一命令核对。', { outcomeUnknown: true, retryable: true });
    return { ...this.mutation(next, mapJob(next, job), meta), replayed: Object.hasOwn(p.processedCommands, meta.commandId) };
  }
  startVerification = (id: string, meta: CommandMeta) => this.enqueueReview(id, meta, 'verification');
  startReadinessReview = (id: string, meta: CommandMeta) => this.enqueueReview(id, meta, 'readiness');
  recordHandoff = () => unavailable('负责人交接');
  releaseResearch = () => unavailable('研究放行');
  continueToStrategy = () => unavailable('策略续接');
  retryJob = () => unavailable('任务重试');
  reconcileJob = () => unavailable('任务对账');
}
