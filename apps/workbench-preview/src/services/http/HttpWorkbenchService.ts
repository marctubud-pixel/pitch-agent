import {BriefWriteJournal} from './briefRecovery';
import type {BriefRecovery} from '../../domain/service';
import type {WorkbenchService, EnvironmentInfo, ServiceListener} from '../../domain/service';
import {ServiceError} from '../../domain/service';
import type {BriefInput, CommandMeta, CreateProjectInput, ProjectQuery} from '../../domain/models';
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
  recovery?: {actorKey: () => string; storage: () => Storage; authorize: (label: string) => void};
  getHeaders?: () => Record<string, string> | Promise<Record<string, string>>;
}
const notConnected = (_operation: string): Promise<never> => Promise.reject(new ServiceError('unavailable', '本轮简报入口尚未接通此能力。'));
export async function mapHttpError(response: Response | null, _cause?: unknown): Promise<ServiceError> {
  if (!response) return new ServiceError('network', '无法连接简报服务，请检查本地服务。', {retryable: true});
  let message = `服务请求失败（${response.status}）。`, code = '';
  try { const body = object(await response.json()), error = body.error ? object(body.error) : body; code = text(error.code); } catch { /* Non-JSON error. */ }
  const messages: Record<string, string> = {REVISION_CONFLICT: '项目已更新，请保留当前草稿并核对新版本。', COMMAND_ID_REUSED: '同一命令标识已用于其他内容，未覆盖原记录。', NOT_FOUND: '未找到此项目或修订。', COMMAND_FORBIDDEN: '当前简报入口不允许此操作。', INVALID_REQUEST: '请求内容不符合简报合同，未保存。', CROSS_ORIGIN: '请求来源未获本地简报服务允许。'};
  if (messages[code]) message = messages[code];
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
  private connecting: Promise<void> | null = null;
  private writing = false;
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
          recovery?.authorize(pending.label);
          await this.connect();
          const body = object(JSON.parse(pending.body));
          const result = await this.write(pending.path, body, pending.label);
          let p: Snapshot;
          try {
            p = parseSnapshot(result.value);
            if (pending.path !== '/projects') {
              const receipt = object(object(result.value).receipt);
              if (receipt.commandId !== pending.commandId || typeof receipt.replayed !== 'boolean') throw new Error('Invalid receipt');
              if (pending.path !== `/projects/${p.id}/commands`) throw new Error('Invalid project');
            }
            mapProject(p);
          } catch { throw new ServiceError('response_lost', '核对响应不完整，原请求仍保留。', {outcomeUnknown: true, retryable: true}); }
          if (pending.path !== '/projects') {
            const card = p.cards.find(item => item.id === body.taskCardId);
            if (!card || (body.kind === 'revise-task-card' && card.brief !== body.brief) || (body.kind === 'confirm-task-card' && !p.confirmations.some(item => item.taskCardId === card.id))) throw new ServiceError('response_lost', '核对响应未绑定原任务卡，原提交仍保留。', {outcomeUnknown: true, retryable: true});
            if (p.activeTaskCardId !== card.id) throw new ServiceError('conflict', '原提交已记入历史，当前简报已有新稿。请查看保留内容与当前任务卡，再结束此记录。', {conflict: {expectedRevision: Number(body.expectedRevision), currentRevision: p.revision, changedBy: p.audit.at(-1)?.actorId ?? null, changeSummary: '原任务卡已被新稿替代。'}});
          }
          journal.clear(pending.commandId); this.emit(); return p.id;
        },
        acknowledge: () => { if (this.writing) return; const pending = journal.getPending(); if (pending) {recovery?.authorize(pending.label); journal.clear(pending.commandId);} this.emit(); },
      };
    }
  }
  private async write(path: string, body: Record<string, unknown>, label: string) {
    if (this.writing) throw new ServiceError('validation', '当前简报提交仍在处理中。');
    if (new TextEncoder().encode(JSON.stringify(body)).byteLength > 128 * 1024) throw new ServiceError('validation', '任务卡请求超过128 KiB，未保存。');
    const commandId = text(body.commandId);
    this.journal?.begin({path, body: JSON.stringify(body), commandId, label});
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
    this.state = connected ? {kind: 'live', label: '本地简报服务'} : {kind: 'unavailable', label: '后端未接通'};
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
      if (method === 'POST' && response.status >= 500) throw new ServiceError(error.kind, error.message, {retryable: true, outcomeUnknown: true});
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
      if (capability.surface !== 'brief-v1' || capability.executionAvailable !== false) throw new ServiceError('unavailable', '目标不是受限简报服务，未执行写入。');
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
  getCapabilities = async () => { await this.connect(); return briefCapabilities(); };
  listProjects = async (query: ProjectQuery) => {
    const all = (await this.snapshots()).map(p => {const project = mapProject(p); return {...project, openBlockers: 0, nextStep: {label: '查看简报', available: true}, coverImages: [], documents: []};});
    const needle = query.search?.trim().toLocaleLowerCase();
    const items = all.filter(p => (!needle || `${p.name} ${p.client}`.toLocaleLowerCase().includes(needle)) && (!query.status || query.status === 'all' || p.status === query.status));
    return {items, total: items.length, catalogRevision: 0};
  };
  getProjectOverview = async (id: string) => mapOverview(await this.snapshot(id));
  getBriefHistory = async (id: string) => { const p = await this.snapshot(id); return {project: mapProject(p), current: mapBrief(p, currentCard(p)), versions: briefVersions(p), dependentArtifacts: [], attachments: mapAttachments(p)}; };
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
  getResearchWorkspace = () => notConnected('getResearchWorkspace');
  listSources = () => notConnected('listSources');
  listImages = () => notConnected('listImages');
  getHandoffOverview = () => notConnected('getHandoffOverview');
  listJobs = () => notConnected('listJobs');
  listArtifacts = () => notConnected('listArtifacts');
  getArtifact = () => notConnected('getArtifact');

  addSource = () => notConnected('addSource');
  linkSourceToClaim = () => notConnected('linkSourceToClaim');
  addClaim = () => notConnected('addClaim');
  uploadImage = () => notConnected('uploadImage');
  requestObservation = () => notConnected('requestObservation');
  reviewObservation = () => notConnected('reviewObservation');
  generateResearch = () => notConnected('generateResearch');
  startVerification = () => notConnected('startVerification');
  startReadinessReview = () => notConnected('startReadinessReview');
  recordHandoff = () => notConnected('recordHandoff');
  releaseResearch = () => notConnected('releaseResearch');
  continueToStrategy = () => notConnected('continueToStrategy');
  retryJob = () => notConnected('retryJob');
  reconcileJob = () => notConnected('reconcileJob');
}
