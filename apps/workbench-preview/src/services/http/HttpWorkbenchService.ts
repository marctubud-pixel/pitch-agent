import {projectResearchWorkspace, projectSources, projectHandoff, readResearchArtifact, mapArtifact, artifactSummary, mapHandoff, projectResearchJob} from './researchProjection';
import {pendingWriteKind, pendingWriteLabels, BriefWriteJournal} from './briefRecovery';
import type {BriefRecovery, PendingWriteKind} from '../../domain/service';
import type {WorkbenchService, EnvironmentInfo, ServiceListener} from '../../domain/service';
import {ServiceError} from '../../domain/service';
import type {BriefInput, CommandMeta, CreateProjectInput, ProjectQuery, SourceQuery, SourceInput, HandoffInput} from '../../domain/models';
import {ACTIVE_TASK_FIELDS} from '../../domain/models';
import {legacyBriefFields} from '../../domain/briefRequirements';
import {isProposalType} from '../../domain/proposalType';
import {isPresentationLocalTime} from '../../domain/presentationTime';
import {object, records, text, parseSnapshot, type Snapshot} from './dto';
import {emptyBrief, metadataFor, readBrief, writeBrief} from './briefEnvelope';
import {mapProject, mapBrief, currentCard, briefVersions, mapAttachments, mapOverview, briefCapabilities} from './briefModels';

export interface HttpServiceOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  recovery?: {actorKey: () => string; storage: () => Storage; authorize: (kind: PendingWriteKind) => void};
  getHeaders?: () => Record<string, string> | Promise<Record<string, string>>;
}
const notConnected = (_operation: string): Promise<never> => Promise.reject(new ServiceError('unavailable', '本轮简报入口尚未接通此能力。'));
export async function mapHttpError(response: Response | null, _cause?: unknown): Promise<ServiceError> {
  if (!response) return new ServiceError('network', '无法连接简报服务，请检查本地服务。', {retryable: true});
  let message = `服务请求失败（${response.status}）。`, code = '';
  try { const body = object(await response.json()), error = body.error ? object(body.error) : body; code = text(error.code); } catch { /* Non-JSON error. */ }
  const messages: Record<string, string> = {RESEARCH_R7_READER_REQUIRED:'独立读者回环尚未完成，研究交接与正式放行仍待核。',SEVEN_STAGE_ROUTE_REQUIRED:'当前阶段尚未接入此执行入口。',RESEARCH_EXECUTION_UNAVAILABLE: '研究执行未配置或仍处于暂停状态，本次未启动。', WORKFLOW_VERSION_REQUIRED: '旧项目保持原运行身份，不能直接采用新阶段规则。', REVISION_CONFLICT: '项目已更新，请保留当前草稿并核对新版本。', COMMAND_ID_REUSED: '同一命令标识已用于其他内容，未覆盖原记录。', NOT_FOUND: '未找到此项目或修订。', COMMAND_FORBIDDEN: '当前简报入口不允许此操作。', INVALID_REQUEST: '请求内容不符合简报合同，未保存。', CROSS_ORIGIN: '请求来源未获本地简报服务允许。'};
  if (messages[code]) message = messages[code];
  if (code === 'RESEARCH_EXECUTION_UNAVAILABLE') return new ServiceError('unavailable', message);
  if (code === 'COMMAND_ID_REUSED') return new ServiceError('idempotency_mismatch', message);
  if (response.status === 403) return new ServiceError('forbidden', message);
  if (response.status === 409 || response.status === 412) return new ServiceError('conflict', message);
  if (response.status === 404) return new ServiceError('not_found', message);
  if ([400, 413, 422].includes(response.status)) return new ServiceError('validation', message);
  return new ServiceError('network', message, {retryable: response.status >= 500});
}
export class HttpWorkbenchService implements WorkbenchService {
  private state: EnvironmentInfo = {kind: 'unavailable', label: '后端未接通'};
  get environment() { return this.state; }
  private listeners = new Set<ServiceListener>();
  private locale = 'zh-CN';
  private connected = false;
  private nativeCapability: Record<string, unknown> = {};
  private connecting: Promise<void> | null = null;
  private writing = false;
  private researchExecutionEnabled = false;
  private readonly journal: BriefWriteJournal | null;
  readonly briefRecovery?: BriefRecovery;
  constructor(private readonly options: HttpServiceOptions) {
    const recovery = options.recovery;
    this.journal = recovery ? new BriefWriteJournal(() => `pitch:brief-pending:v1:${encodeURIComponent(options.baseUrl.replace(/\/$/, ''))}:${encodeURIComponent(recovery.actorKey())}`, recovery.storage) : null;
    if (this.journal) {
      const journal = this.journal;
      this.briefRecovery = {
        getPending: () => this.writing ? null : journal.getPending(),
        retry: async () => {
          if (this.writing) throw new ServiceError('validation', '当前提交仍在处理中。');
          const pending = journal.getPending();
          if (!pending) throw new ServiceError('validation', '没有待核对的简报提交。');
          recovery?.authorize(pending.kind);
          await this.connect();
          const body = object(JSON.parse(pending.body));
          const result = await this.write(pending.path, body, pending.label);
          let p: Snapshot;
          try {
            p = parseSnapshot(result.value);
            if (pending.path !== '/projects') {
              const receipt = object(object(result.value).receipt);
              if (receipt.commandId !== pending.commandId || typeof receipt.replayed !== 'boolean') throw new Error('Invalid receipt');
              if (!pending.path.startsWith(`/projects/${p.id}/`)) throw new Error('Invalid project');
            }
            mapProject(p);
          } catch { throw new ServiceError('response_lost', '核对响应不完整，原请求仍保留。', {outcomeUnknown: true, retryable: true}); }
          if (pending.kind === 'save_brief' || pending.kind === 'confirm_brief') {
            const card = p.cards.find(item => item.id === body.taskCardId);
            if (!card || (body.kind === 'revise-task-card' && card.brief !== body.brief) || (body.kind === 'confirm-task-card' && !p.confirmations.some(item => item.taskCardId === card.id))) throw new ServiceError('response_lost', '核对响应未绑定原任务卡，原提交仍保留。', {outcomeUnknown: true, retryable: true});
            if (p.activeTaskCardId !== card.id) throw new ServiceError('conflict', '原提交已记入历史，当前简报已有新稿。请查看保留内容与当前任务卡，再结束此记录。', {conflict: {expectedRevision: Number(body.expectedRevision), currentRevision: p.revision, changedBy: p.audit.at(-1)?.actorId ?? null, changeSummary: '原任务卡已被新稿替代。'}});
          }
          if (!['create_project','save_brief','confirm_brief'].includes(pending.kind)) this.verifyResearchReceipt(p, object(object(result.value).receipt), body, pending.path);
          journal.clear(pending.commandId); this.emit(); return p.id;
        },
        acknowledge: () => { if (this.writing) return; const pending = journal.getPending(); if (pending) {recovery?.authorize(pending.kind); journal.clear(pending.commandId);} this.emit(); },
      };
    }
  }
  private async write(path: string, body: Record<string, unknown>, label: string) {
    if (this.writing) throw new ServiceError('validation', '当前简报提交仍在处理中。');
    if (new TextEncoder().encode(JSON.stringify(body)).byteLength > 128 * 1024) throw new ServiceError('validation', '任务卡请求超过128 KiB，未保存。');
    const commandId = text(body.commandId);
    const kind = pendingWriteKind(path, body);
    this.journal?.begin({kind, path, body: JSON.stringify(body), commandId, label: pendingWriteLabels[kind] || label});
    this.writing = true; this.emit();
    try { return await this.request('POST', path, body); }
    catch (error) {
      throw error;
    } finally {this.writing = false; this.emit();}
  }
  private completed(commandId: string) { this.journal?.clear(commandId); this.emit(); }
  setLocale(locale: string) { this.locale = locale; }
  subscribe(listener: ServiceListener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private emit() { for (const listener of this.listeners) listener({type: 'data-changed', projectId: null}); }
  private availability(connected: boolean) {
    if (this.connected === connected) return;
    this.connected = connected;
    this.state = connected ? {kind: 'live', label: this.researchExecutionEnabled ? '本地简报与研究服务' : '本地简报服务'} : {kind: 'unavailable', label: '后端未接通'};
    this.emit();
  }
  private async request(method: 'GET' | 'POST', path: string, body?: unknown): Promise<{value: unknown; status: number}> {
    const encoded = body === undefined ? undefined : JSON.stringify(body);
    if (encoded && new TextEncoder().encode(encoded).byteLength > 128 * 1024) throw new ServiceError('validation', '任务卡请求超过128 KiB，未保存。');
    let response: Response;
    try { response = await (this.options.fetchImpl ?? fetch)(`${this.options.baseUrl.replace(/\/$/, '')}${path}`, {method, headers: {'Content-Type': 'application/json', 'Accept-Language': this.locale, ...await this.options.getHeaders?.()}, cache: 'no-store', body: encoded}); }
    catch { this.availability(false); throw new ServiceError('network', '无法连接简报服务，请检查本地服务。', {retryable: true, outcomeUnknown: method !== 'GET'}); }
    if (!response.ok) {
      const error = await mapHttpError(response);
      if (method === 'POST' && response.status >= 500 && error.kind !== 'unavailable') throw new ServiceError(error.kind, error.message, {retryable: true, outcomeUnknown: true});
      throw error;
    }
    let value: unknown;
    try { value = await response.json(); }
    catch { this.availability(false); throw new ServiceError(method === 'GET' ? 'network' : 'response_lost', '服务响应未完整读取，请保留原命令核对。', {retryable: true, outcomeUnknown: method !== 'GET'}); }
    return {value, status: response.status};
  }
  private async connect(): Promise<void> {
    if (this.connected) return;
    this.connecting ??= this.request('GET', '/capabilities').then(({value}) => {
      const capability = object(value);
      if (!((capability.surface === 'brief-v1' && capability.executionAvailable === false) || (capability.surface === 'research-v1' && capability.executionAvailable === true && capability.workflowVersion === 'proposal-seven-v1'))) throw new ServiceError('unavailable', '目标不是受限简报服务，未执行写入。');
      this.nativeCapability = capability;
      this.researchExecutionEnabled = capability.surface === 'research-v1' && capability.executionAvailable === true;
      this.availability(true);
    }).finally(() => { this.connecting = null; });
    await this.connecting;
  }
  async snapshot(id: string, revision?: number): Promise<Snapshot> {
    await this.connect();
    const p = parseSnapshot((await this.request('GET', `/projects/${encodeURIComponent(id)}${revision === undefined ? '' : `?revision=${revision}`}`)).value);
    if (p.id !== id || (revision !== undefined && p.revision !== revision)) throw new ServiceError('validation', '服务返回了其他项目或修订，未采用。');
    return p;
  }
  async snapshots(): Promise<Snapshot[]> {
    await this.connect();
    const response = object((await this.request('GET', '/projects')).value);
    return Promise.all(records(response.projects).map(project => this.snapshot(text(project.id))));
  }
  private async command(id: string, fields: Record<string, unknown>, meta: CommandMeta): Promise<{p: Snapshot; replayed: boolean}> {
    try {
      const raw = (await this.write(`/projects/${encodeURIComponent(id)}/commands`, {...fields, commandId: meta.commandId, expectedRevision: meta.expectedRevision}, fields.kind === 'confirm-task-card' ? '确认简报' : '保存简报')).value;
      let p: Snapshot, replayed: boolean;
      try { const root = object(raw), receipt = object(root.receipt); p = parseSnapshot(raw);
        if (receipt.commandId !== meta.commandId || typeof receipt.replayed !== 'boolean') throw new Error('Receipt identity mismatch');
        replayed = receipt.replayed;
      } catch { throw new ServiceError('response_lost', '保存响应身份或回执不完整，请保留同一命令核对。', {retryable: true, outcomeUnknown: true}); }
      if (p.id !== id) throw new ServiceError('response_lost', '保存响应项目不符，请保留同一命令核对。', {retryable: true, outcomeUnknown: true});
      this.emit(); return {p, replayed};
    } catch (error) {
      if (error instanceof ServiceError && error.kind === 'conflict') {
        try { const current = await this.snapshot(id); throw new ServiceError('conflict', error.message, {conflict: {expectedRevision: meta.expectedRevision, currentRevision: current.revision, changedBy: current.audit.at(-1)?.actorId ?? null, changeSummary: current.audit.at(-1)?.kind ?? null}}); }
        catch (detail) { if (detail instanceof ServiceError && detail.kind === 'conflict') throw detail; }
      }
      throw error;
    }
  }
  getCapabilities = async () => {
    await this.connect();
    const raw=this.nativeCapability.research;
    if(!raw)return briefCapabilities();
    const capability=object(raw),method=object(capability.method);
    return {...briefCapabilities(),research:{configured:capability.configured===true,executionAllowed:capability.executionAllowed===true,method:{id:text(method.id),version:text(method.version),sha256:text(method.sha256)},reason:text(capability.reason)}};
  };
  listProjects = async (query: ProjectQuery) => {
    const all = (await this.snapshots()).map(p => {const project = mapProject(p); return {...project, openBlockers: 0, nextStep: {label: '查看简报', available: true}, coverImages: [], documents: []};});
    const needle = query.search?.trim().toLocaleLowerCase();
    const items = all.filter(p => (!needle || `${p.name} ${p.client}`.toLocaleLowerCase().includes(needle)) && (!query.status || query.status === 'all' || p.status === query.status));
    return {items, total: items.length, catalogRevision: 0};
  };
  getProjectOverview = async (id: string) => mapOverview(await this.snapshot(id));
  getBriefHistory = async (id: string) => { const p = await this.snapshot(id); return {project: mapProject(p), current: mapBrief(p, currentCard(p)), versions: briefVersions(p), dependentArtifacts: p.artifacts.filter(a => a.stage === 'research').map(a => artifactSummary(mapArtifact(p, a))), attachments: mapAttachments(p)}; };
  getBriefAttachmentFile = async () => null;
  createProject = async (input: CreateProjectInput, meta: CommandMeta) => {
    if (!isProposalType(input.brief?.proposalType)) throw new ServiceError('validation', '请先明确提案类型，未创建项目。');
    if (input.presentationLocalTime !== undefined && !isPresentationLocalTime(input.presentationLocalTime)) throw new ServiceError('validation', '汇报时间无效，未创建项目。');
    await this.connect();
    const gate = {strategy: 'strategy', themes: 'copy', visual: 'visual', delivery: 'final_review'};
    if (input.checkpoints?.includes('content_review')) throw new ServiceError('validation', '旧内容审阅节点已退役。');
    const humanGates = (input.checkpoints ?? []).flatMap(value => value === 'content_review' ? [] : [gate[value]]);
    const body = {name: input.name.trim(), brief: writeBrief(input.brief ?? emptyBrief(), metadataFor(input), ''), mode: input.mode === 'supervised' ? 'auto' : 'assisted', humanGates, commandId: meta.commandId};
    const result = await this.write('/projects', body, '新建提案');
    try {
      const p = parseSnapshot(result.value), data = mapProject(p);
      if (data.name !== input.name.trim()) throw new Error('Creation identity mismatch');
      this.completed(meta.commandId); return {data, revision: p.revision, commandId: meta.commandId, replayed: result.status === 200};
    } catch { throw new ServiceError('response_lost', '创建响应不完整，请保留同一命令核对，勿重复创建。', {retryable: true, outcomeUnknown: true}); }
  };
  saveBrief = async (id: string, input: BriefInput, meta: CommandMeta) => {
    // Read the submitted basis, not today's head, so retries after refresh keep exact bodies.
    const before = await this.snapshot(id, meta.expectedRevision), card = currentCard(before), original = readBrief(card.brief), brief = mapBrief(before, card);
    const hidden = input.editScope === 'task_card' ? legacyBriefFields(brief) : {};
    const provenance = input.editScope === 'task_card' ? {...brief.provenance} : input.provenance ?? brief.provenance;
    if (input.editScope === 'task_card') for (const field of ACTIVE_TASK_FIELDS) {const value = input.provenance?.[field]; if (value) provenance[field] = value;}
    const fields = {...input, ...hidden, provenance, proposalType: input.proposalType ?? brief.proposalType, attachment: input.attachment === undefined ? original.fields.attachment : input.attachment};
    const metadata = {...original.metadata, type: fields.proposalType};
    const taskCardId = `${id}:scope:${meta.commandId}`;
    const written = writeBrief(fields, metadata, '');
    const {p, replayed} = await this.command(id, {kind: 'revise-task-card', taskCardId, brief: written}, meta);
    const saved = p.cards.find(item => item.id === taskCardId);
    if (!saved || saved.brief !== written) throw new ServiceError('response_lost', '保存响应的任务卡或正文不符，请保留原命令核对。', {retryable: true, outcomeUnknown: true});
    if (p.activeTaskCardId !== taskCardId) throw new ServiceError('conflict', '原保存已记入历史，当前简报已有更新，请核对后继续。', {conflict: {expectedRevision: meta.expectedRevision, currentRevision: p.revision, changedBy: p.audit.at(-1)?.actorId ?? null, changeSummary: '当前任务卡已更换。'}});
    const data = mapBrief(p, saved); this.completed(meta.commandId);
    return {data, revision: p.revision, commandId: meta.commandId, replayed};
  };
  confirmBrief = async (id: string, meta: CommandMeta) => {
    const before = await this.snapshot(id, meta.expectedRevision), card = currentCard(before);
    const {p, replayed} = await this.command(id, {kind: 'confirm-task-card', taskCardId: card.id}, meta);
    if (!p.cards.some(item => item.id === card.id) || !p.confirmations.some(item => item.taskCardId === card.id)) throw new ServiceError('response_lost', '确认响应未绑定原任务卡，请保留同一命令核对。', {retryable: true, outcomeUnknown: true});
    if (p.activeTaskCardId !== card.id) throw new ServiceError('conflict', '原确认已记入历史，当前新稿尚未确认。', {conflict: {expectedRevision: meta.expectedRevision, currentRevision: p.revision, changedBy: p.audit.at(-1)?.actorId ?? null, changeSummary: '当前任务卡已更换。'}});
    const data = mapBrief(p, p.cards.find(item => item.id === card.id) ?? card); this.completed(meta.commandId);
    return {data, revision: p.revision, commandId: meta.commandId, replayed};
  };
  private researchTarget(p: Snapshot) {
    if (p.workflowVersion !== 'proposal-seven-v1') throw new ServiceError('unavailable', '旧项目保持原协议，不接入七阶段研究执行。');
    const target = p.artifacts.find(a => a.id === p.stages.find(s => s.stage === 'research')?.activeArtifactId && a.stage === 'research');
    if (!target || !Array.isArray(target.inputVersionIds) || !target.inputVersionIds.includes(p.activeTaskCardId) || p.stages.find(s => s.stage === 'research')?.status === 'stale') throw new ServiceError('not_eligible', '当前简报尚无有效研究产物，历史稿不能代替当前输入。');
    return target;
  }
  private verifyResearchReceipt(p: Snapshot, receipt: Record<string, unknown>, body: Record<string, unknown>, path: string) {
    if (receipt.commandId !== body.commandId || typeof receipt.replayed !== 'boolean') throw new ServiceError('response_lost', '研究提交回执不完整，原请求仍保留。', {outcomeUnknown: true, retryable: true});
    if (path.endsWith('/sources') && !p.sourceEntries.some(e => e.id === receipt.sourceId && e.taskCardId === p.activeTaskCardId)) throw new ServiceError('conflict', '原来源属于历史简报，请核对当前任务卡。');
    if (typeof body.artifactId === 'string' && (p.stages.find(s => s.stage === 'research')?.activeArtifactId !== body.artifactId || !p.artifacts.some(a => a.id === body.artifactId && Array.isArray(a.inputVersionIds) && a.inputVersionIds.includes(p.activeTaskCardId)))) throw new ServiceError('conflict', '原操作属于历史研究稿，当前产物已有变化。');
    if (path.endsWith('/research-jobs') && !p.jobs.some(j => j.id === receipt.jobId && j.stage === 'research' && Array.isArray(j.inputVersionIds) && j.inputVersionIds.includes(p.activeTaskCardId))) throw new ServiceError('response_lost', '研究请求没有对应原生任务，请保留原命令核对。', {outcomeUnknown: true, retryable: true});
    if ((path.endsWith('/research-verification') || path.endsWith('/research-readiness')) && !p.jobs.some(j => j.id === receipt.jobId && j.stage === 'research' && j.targetArtifactId === body.artifactId)) throw new ServiceError('response_lost', '核验回执未绑定原生研究任务，原提交仍保留。', {outcomeUnknown: true, retryable: true});
    if (path.endsWith('/research-handoffs') && typeof receipt.handoffId !== 'string') throw new ServiceError('response_lost', '交接声明回执缺少原生身份，原提交仍保留。', {outcomeUnknown: true, retryable: true});
    if (path.endsWith('/research-release') && !p.releases.some(r => r.artifactId === body.artifactId && r.policyVersion === body.policyVersion)) throw new ServiceError('response_lost', '放行回执缺少同版原生记录，原提交仍保留。', {outcomeUnknown: true, retryable: true});
  }
  private async researchMutation(id: string, resource: string, fields: Record<string, unknown>, meta: CommandMeta, before: Snapshot) {
    if (before.workflowVersion !== 'proposal-seven-v1') throw new ServiceError('unavailable', '旧项目不自动升级为七阶段研究。');
    if (resource !== 'sources' && resource !== 'research-release' && !(resource === 'research-handoffs' && object(fields.input).decision === 'returned') && !this.researchExecutionEnabled) throw new ServiceError('unavailable', '研究执行未配置或仍处于暂停状态，本次未发送。');
    const path = `/projects/${encodeURIComponent(id)}/${resource}`, body = {...fields, commandId: meta.commandId, expectedRevision: meta.expectedRevision};
    const value = (await this.write(path, body, resource)).value;
    let p: Snapshot, receipt: Record<string, unknown>;
    try {p = parseSnapshot(value); receipt = object(object(value).receipt); if (p.id !== id) throw new Error('Wrong project');}
    catch {throw new ServiceError('response_lost', '研究写入响应不完整，请保留原命令核对。', {outcomeUnknown: true, retryable: true});}
    this.verifyResearchReceipt(p, receipt, body, path);
    if (p.activeTaskCardId !== before.activeTaskCardId) throw new ServiceError('conflict', '提交时的简报已被新稿替代，请核对保留内容。');
    return {p, receipt, value};
  }
  private async researchJob(id: string, resource: string, fields: Record<string, unknown>, meta: CommandMeta, before: Snapshot) {
    const {p, receipt} = await this.researchMutation(id, resource, fields, meta, before);
    const raw = p.jobs.find(j => j.id === receipt.jobId && j.stage === 'research');
    if (!raw) throw new ServiceError('response_lost', '未取得研究任务原生记录，请保留原命令核对。', {outcomeUnknown: true, retryable: true});
    const data = projectResearchJob(p, raw); this.completed(meta.commandId);
    return {data, revision: p.revision, commandId: meta.commandId, replayed: receipt.replayed === true};
  }
  private contentLoader(id: string) {return async (artifactId: string) => (await this.request('GET', `/projects/${encodeURIComponent(id)}/artifacts/${encodeURIComponent(artifactId)}/content`)).value;}
  getResearchWorkspace = async (id: string) => projectResearchWorkspace(await this.snapshot(id), this.contentLoader(id));
  listSources = async (id: string, query: SourceQuery) => {
    const p = await this.snapshot(id), workspace = await projectResearchWorkspace(p, this.contentLoader(id));
    return projectSources(p, query, workspace);
  };
  listImages = () => notConnected('listImages');
  getHandoffOverview = async (id: string) => {const p = await this.snapshot(id); return projectHandoff(p, await projectResearchWorkspace(p, this.contentLoader(id)));};
  listJobs = async (id: string) => {const p = await this.snapshot(id); return {project: mapProject(p), items: p.jobs.filter(j => j.stage === 'research' && ['', 'stage', 'verification', 'readiness'].includes(text(j.purpose))).map(j => projectResearchJob(p, j))};};
  listArtifacts = async (id: string) => {const p = await this.snapshot(id), ws = await projectResearchWorkspace(p, this.contentLoader(id)); return {project: ws.project, items: ws.versions};};
  getArtifact = async (id: string, artifactId: string) => {const p = await this.snapshot(id), detail = await readResearchArtifact(p, artifactId, this.contentLoader(id)); return {...detail, project: mapProject(p), handoffs: p.textReports.handoff.filter(h => h.artifactId === artifactId).map(h => mapHandoff(p, detail.artifact, h)), versions: (await projectResearchWorkspace(p, this.contentLoader(id))).versions};};

  addSource = async (id: string, input: SourceInput, meta: CommandMeta) => {
    const before = await this.snapshot(id, meta.expectedRevision);
    const {p, receipt} = await this.researchMutation(id, 'sources', {input}, meta, before);
    const source = projectSources(p).items.find(item => item.id === receipt.sourceId);
    if (!source) throw new ServiceError('response_lost', '来源已返回但未取得同版记录，请核对原提交。', {outcomeUnknown: true, retryable: true});
    this.completed(meta.commandId); return {data: source, revision: p.revision, commandId: meta.commandId, replayed: receipt.replayed === true};
  };
  linkSourceToClaim = () => notConnected('linkSourceToClaim');
  addClaim = () => notConnected('addClaim');
  uploadImage = () => notConnected('uploadImage');
  requestObservation = () => notConnected('requestObservation');
  reviewObservation = () => notConnected('reviewObservation');
  generateResearch = async (id: string, meta: CommandMeta) => {
    const before = await this.snapshot(id, meta.expectedRevision), sourceEntryIds = before.sourceEntries.filter(e => e.taskCardId === before.activeTaskCardId).map(e => text(e.id));
    if (!sourceEntryIds.length) throw new ServiceError('not_eligible', '请先为当前简报登记实际来源。');
    return this.researchJob(id, 'research-jobs', {sourceEntryIds}, meta, before);
  };
  startVerification = async (id: string, meta: CommandMeta) => {const before = await this.snapshot(id, meta.expectedRevision); return this.researchJob(id, 'research-verification', {artifactId: this.researchTarget(before).id}, meta, before);};
  startReadinessReview = async (id: string, meta: CommandMeta) => {const before = await this.snapshot(id, meta.expectedRevision); return this.researchJob(id, 'research-readiness', {artifactId: this.researchTarget(before).id}, meta, before);};
  recordHandoff = async (id: string, input: HandoffInput, meta: CommandMeta) => {
    const before = await this.snapshot(id, meta.expectedRevision), artifact = this.researchTarget(before), basis = before.researchWorkflow;
    if (!basis || !text(basis.basisHash)) throw new ServiceError('not_eligible', '研究交接尚无当前有效的核验依据。');
    const {p, receipt, value} = await this.researchMutation(id, 'research-handoffs', {artifactId: artifact.id, contentHash: artifact.contentHash, basisHash: basis.basisHash, input}, meta, before);
    const raw = p.textReports.handoff.find(h => h.declarationId === receipt.handoffId || h.jobId === receipt.jobId);
    if (raw) {const detail = await readResearchArtifact(p, text(artifact.id), this.contentLoader(id)); const data = mapHandoff(p, detail.artifact, raw); this.completed(meta.commandId); return {data, revision: p.revision, commandId: meta.commandId, replayed: receipt.replayed === true};}
    const declaration = records(object(object(value).project).researchHandoffDeclarations).find(d => d.id === receipt.handoffId);
    if (input.decision === 'returned' && declaration?.decision === 'returned') {
      const detail = await readResearchArtifact(p, text(artifact.id), this.contentLoader(id));
      const data = {id: text(declaration.id), projectId: id, artifactId: text(artifact.id), artifactVersion: detail.artifact.version, side: input.side, owner: '本地操作人退回声明', decision: 'returned', permittedUses: input.permittedUses, prohibitedInferences: input.prohibitedInferences, unresolvedIssues: input.unresolvedIssues, note: input.note, createdAt: text(declaration.createdAt), recordedBy: text(object(declaration.recordedBy).actorId), outdated: false, outdatedReason: null} satisfies import('../../domain/models').Handoff;
      this.completed(meta.commandId); return {data, revision: p.revision, commandId: meta.commandId, replayed: receipt.replayed === true};
    }
    this.completed(meta.commandId);
    throw new ServiceError('not_eligible', '交接声明已保存，仍待独立负责人读取原件并形成实际报告；尚未记为已接收。');
  };
  releaseResearch = async (id: string, meta: CommandMeta) => {
    const before = await this.snapshot(id, meta.expectedRevision), artifact = this.researchTarget(before), basis = before.researchWorkflow;
    if (!basis || !text(basis.basisHash)) throw new ServiceError('not_eligible', '研究放行尚无当前有效交接依据。');
    const {p, receipt} = await this.researchMutation(id, 'research-release', {artifactId: artifact.id, contentHash: artifact.contentHash, basisHash: basis.basisHash, policyVersion: before.policy.version}, meta, before);
    const detail = await readResearchArtifact(p, text(artifact.id), this.contentLoader(id));
    if (!detail.artifact.release) throw new ServiceError('response_lost', '尚未取得当前研究的真实放行记录，请核对。', {outcomeUnknown: true, retryable: true});
    this.completed(meta.commandId); return {data: detail.artifact, revision: p.revision, commandId: meta.commandId, replayed: receipt.replayed === true};
  };
  continueToStrategy = () => notConnected('continueToStrategy');
  retryJob = () => notConnected('retryJob');
  reconcileJob = () => notConnected('reconcileJob');
}
