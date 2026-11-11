import {afterEach, describe, expect, it, vi} from 'vitest';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import type {Server} from 'node:http';
import {HttpWorkbenchService, type HttpServiceOptions} from './HttpWorkbenchService';
import {HttpProposalService} from './HttpProposalService';
import type {CreateProjectInput} from '../../domain/models';
import {createServices} from '../index';

const loadNative = createRequire(import.meta.url);
const module: unknown = loadNative(process.env.PITCH_INTAKE_TEST_SERVER ?? fileURLToPath(new URL('../../../../../tools/workbench/brief-server.mjs', import.meta.url)));
if (!module || typeof module !== 'object' || !('createBriefServer' in module) || typeof module.createBriefServer !== 'function') throw new Error('Actual brief server missing');
const createBriefServer = module.createBriefServer;
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {vi.unstubAllEnvs(); vi.unstubAllGlobals(); for (const cleanup of cleanups.splice(0).reverse()) await cleanup();});
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'pitch-brief-ui-'));
  const options = {dbPath: join(directory, 'brief.sqlite'), port: 4182};
  let server: Server = createBriefServer(options);
  const close = () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  cleanups.push(async () => {await close(); await rm(directory, {recursive: true, force: true});});
  const bodies: string[] = [];
  let loseNextPostBody = false;
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input)), headers = Object.fromEntries(new Headers(init?.headers));
    if (typeof init?.body === 'string') bodies.push(init.body);
    const req = Readable.from([Buffer.from(typeof init?.body === 'string' ? init.body : '')]);
    Object.assign(req, {url: url.pathname + url.search, method: init?.method ?? 'GET', headers: {host: url.host, ...headers}});
    const response = await new Promise<Response>(resolve => {
      const responseHeaders: Record<string, string> = {};
      const res = {status: 200, setHeader(key: string, value: string) {responseHeaders[key] = value;}, writeHead(status: number, values: Record<string, string> = {}) {this.status = status; Object.assign(responseHeaders, values);}, end(payload?: string) {resolve(new Response(payload ?? null, {status: this.status, headers: responseHeaders}));}};
      server.emit('request', req, res);
    });
    if (loseNextPostBody && init?.method === 'POST' && response.ok) {
      loseNextPostBody = false;
      return new Response(new ReadableStream({start(controller) {controller.error(new Error('Lost accepted response'));}}), {status: response.status});
    }
    return response;
  };
  const service = (recovery?: HttpServiceOptions['recovery']) => new HttpWorkbenchService({baseUrl: 'http://127.0.0.1:4182/api/v1', fetchImpl, recovery});
  return {service, fetchImpl, bodies, losePost() {loseNextPostBody = true;}, async reopen() {await close(); server = createBriefServer(options);}};
}
class SessionStore implements Storage {
  private values = new Map<string, string>();
  get length() {return this.values.size;}
  key(index: number) {return [...this.values.keys()][index] ?? null;}
  getItem(key: string) {return this.values.get(key) ?? null;}
  setItem(key: string, value: string) {this.values.set(key, value);}
  removeItem(key: string) {this.values.delete(key);}
  clear() {this.values.clear();}
}
const input = (): CreateProjectInput => ({name: '全新包装项目', client: '测试客户', summary: '实际任务摘要', mode: 'step_by_step', researchOwner: '研究负责人', strategyOwner: '策略负责人', checkpoints: ['strategy', 'delivery'], presentationLocalTime: '2026-12-01T10:30',
  brief: {proposalType: 'packaging', background: '原始背景', audience: '原始人群', objectives: ['保留隐藏目标'], deliverables: ['包装提案'], constraints: ['原限制'], brand: '测试品牌', budget: '原预算', timeline: '原时间', references: ['原参考'], openQuestions: ['原问题'], changeNote: '', provenance: {objectives: {origin: 'provided', reason: 'stated', spans: []}}}});

describe('current frontend against actual restricted HTTP handler and SQLite', () => {
  it('reads actual projects, type, mode and date without simulated proposals or artwork', async () => {
    const host = await fixture(), service = host.service();
    expect(service.environment.kind).toBe('unavailable');
    const created = await service.createProject(input(), {commandId: 'create-one', expectedRevision: 0});
    expect(created.revision).toBe(0);
    expect(service.environment.kind).toBe('live');
    expect((await service.listProjects({})).items.map(p => p.id)).toEqual([created.data.id]);
    const proposals = new HttpProposalService(service), p = await proposals.getProposal(created.data.id);
    expect(p).toMatchObject({type: 'packaging', presentationLocalTime: '2026-12-01T10:30', mode: 'assisted', checkpoints: ['strategy', 'delivery'], cover: null, research: null, decisions: [], revision: 0});
    expect(p.stages.content_review.status).toBe('not_started');
    await expect(proposals.ensureBrandResourceStorage()).resolves.toBeUndefined();
    await expect(service.generateResearch(created.data.id,{commandId:'disabled-research',expectedRevision:created.revision})).rejects.toMatchObject({kind: 'not_eligible'});
  });
  it('keeps draft business version, hidden fields and provenance while native heads stay immutable', async () => {
    const host = await fixture(), service = host.service(), created = await service.createProject(input(), {commandId: 'create-draft', expectedRevision: 0}), id = created.data.id;
    const first = (await service.getBriefHistory(id)).current;
    const saved = await service.saveBrief(id, {...input().brief!, proposalType: 'kv', background: '修改背景', objectives: ['不应覆盖隐藏目标'], budget: '不应覆盖预算', editScope: 'task_card', provenance: {}}, {commandId: 'save-draft', expectedRevision: 0, actor: {id: 'local-designer', name: '面板模拟身份'}});
    expect(saved.data).toMatchObject({version: 1, proposalType: 'kv', background: '修改背景', objectives: ['保留隐藏目标'], budget: '原预算', editedBy: 'local-operator', confirmedAt: null});
    expect(saved.data.provenance.objectives).toEqual(first?.provenance.objectives);
    expect(saved.data.id).not.toBe(first?.id);
    expect((await service.getBriefHistory(id)).versions).toHaveLength(1);
    expect((await service.snapshot(id, 0)).cards[0].brief).toContain('原始背景');
    expect(host.bodies.every(body => !JSON.parse(body).actor)).toBe(true);
    expect((await new HttpProposalService(service).getProposal(id)).type).toBe('kv');
  });
  it('confirms the actual head and creates a pending new business version only after confirmation', async () => {
    const host = await fixture(), service = host.service(), created = await service.createProject(input(), {commandId: 'create-confirm', expectedRevision: 0}), id = created.data.id;
    const confirmed = await service.confirmBrief(id, {commandId: 'confirm', expectedRevision: 0});
    expect(confirmed.data.confirmedAt).toMatch(/^\d{4}-/);
    expect(confirmed.data.confirmedBy).toBe('local-operator');
    const next = await service.saveBrief(id, {...input().brief!, background: '确认后新稿'}, {commandId: 'after-confirm', expectedRevision: confirmed.revision});
    expect(next.data).toMatchObject({version: 2, confirmedAt: null, background: '确认后新稿'});
    const history = await service.getBriefHistory(id);
    expect(history.versions.map(b => b.version)).toEqual([2, 1]);
    expect(history.versions[1].confirmedAt).not.toBeNull();
    await host.reopen();
    expect((await host.service().getBriefHistory(id)).current).toMatchObject({version: 2, background: '确认后新稿'});
  });
  it('returns conflict details without silently rebasing a stale draft', async () => {
    const host = await fixture(), service = host.service(), created = await service.createProject(input(), {commandId: 'create-conflict', expectedRevision: 0}), id = created.data.id;
    await service.saveBrief(id, {...input().brief!, background: '另一页已保存'}, {commandId: 'winner', expectedRevision: 0});
    await expect(service.saveBrief(id, {...input().brief!, background: '待保留冲突草稿'}, {commandId: 'stale', expectedRevision: 0})).rejects.toMatchObject({kind: 'conflict', conflict: {expectedRevision: 0, currentRevision: 1}});
    expect((await service.getBriefHistory(id)).current?.background).toBe('另一页已保存');
  });
  it('recreates byte-identical save bodies after accepted response loss and service refresh', async () => {
    const host = await fixture(), service = host.service(), created = await service.createProject(input(), {commandId: 'create-retry', expectedRevision: 0}), id = created.data.id;
    const fields = {...input().brief!, background: '响应丢失也只保存一次'};
    host.losePost();
    await expect(service.saveBrief(id, fields, {commandId: 'same-save', expectedRevision: 0})).rejects.toMatchObject({kind: 'response_lost', outcomeUnknown: true});
    const result = await host.service().saveBrief(id, fields, {commandId: 'same-save', expectedRevision: 0});
    expect(result).toMatchObject({replayed: true, revision: 1});
    expect(host.bodies.at(-1)).toBe(host.bodies.at(-2));
    expect((await service.snapshot(id)).cards).toHaveLength(2);
    await expect(service.saveBrief(id, {...fields, background: '同ID改内容'}, {commandId: 'same-save', expectedRevision: 0})).rejects.toMatchObject({kind: 'idempotency_mismatch'});
  });
  it('recreates byte-identical creation bodies after response loss', async () => {
    const host = await fixture(); host.losePost();
    await expect(host.service().createProject(input(), {commandId: 'same-create', expectedRevision: 0})).rejects.toMatchObject({outcomeUnknown: true});
    const result = await host.service().createProject(input(), {commandId: 'same-create', expectedRevision: 0});
    expect(result.replayed).toBe(true);
    expect(host.bodies[1]).toBe(host.bodies[0]);
    expect((await host.service().listProjects({})).total).toBe(1);
  });
  it('keeps original attachment text and marks missing original files honestly', async () => {
    const host = await fixture(), service = host.service(), original = input();
    if (!original.brief) throw new Error('Starting brief missing');
    original.brief.attachment = {id: 'input-text', kind: 'paste', fileName: null, mimeType: null, size: 0, text: '用户原始简报', extraction: {method: 'typed', pages: null, warnings: []}, mapping: 'none', sampleId: null, file: null};
    const created = await service.createProject(original, {commandId: 'create-attached', expectedRevision: 0}), id = created.data.id;
    await service.saveBrief(id, {...input().brief!, background: '仍沿用原文'}, {commandId: 'keep-original', expectedRevision: 0});
    const history = await service.getBriefHistory(id);
    expect(history.attachments).toHaveLength(1);
    expect(history.attachments[0]).toMatchObject({id: 'input-text', text: '用户原始简报', fileAvailable: false, addedBy: 'local-operator'});
    expect(history.current?.attachmentIds).toEqual(['input-text']);
    expect(await service.getBriefAttachmentFile()).toBeNull();
  });
  it('uses the actual projection in the public service factory and retains guest write rejection', async () => {
    const host = await fixture();
    vi.stubEnv('VITE_WORKBENCH_API_URL', 'http://127.0.0.1:4182/api/v1');
    vi.stubGlobal('fetch', host.fetchImpl);
    vi.stubGlobal('sessionStorage', new SessionStore());
    const services = createServices();
    try {
      expect(services.proposals.backing).toBe('connected');
      const created = await services.workbench.createProject(input(), {commandId: 'factory-created', expectedRevision: 0});
      expect((await services.proposals.getProposal(created.data.id)).research).toBeNull();
      services.team.selectActor('human-guest');
      await expect(services.workbench.saveBrief(created.data.id, input().brief!, {commandId: 'guest', expectedRevision: 0})).rejects.toMatchObject({kind: 'forbidden'});
      expect((await host.service().snapshot(created.data.id)).revision).toBe(0);
    } finally {services.team.destroy();}
  });
  it('never presents a superseded save replay as the current editable head', async () => {
    const host = await fixture(), service = host.service(), created = await service.createProject(input(), {commandId: 'create-later', expectedRevision: 0}), id = created.data.id;
    const earlier = {...input().brief!, background: '原操作'};
    await service.saveBrief(id, earlier, {commandId: 'earlier', expectedRevision: 0});
    await service.saveBrief(id, {...earlier, background: '后续保存'}, {commandId: 'later', expectedRevision: 1});
    await expect(host.service().saveBrief(id, earlier, {commandId: 'earlier', expectedRevision: 0})).rejects.toMatchObject({kind: 'conflict', conflict: {currentRevision: 2}});
    expect((await service.getBriefHistory(id)).current?.background).toBe('后续保存');
  });
  it('never applies a historical confirmation replay to a new unconfirmed card', async () => {
    const host = await fixture(), service = host.service(), created = await service.createProject(input(), {commandId: 'create-later-confirm', expectedRevision: 0}), id = created.data.id;
    await service.confirmBrief(id, {commandId: 'confirmed-old', expectedRevision: 0});
    await service.saveBrief(id, {...input().brief!, background: '待确认新稿'}, {commandId: 'pending-new', expectedRevision: 1});
    await expect(host.service().confirmBrief(id, {commandId: 'confirmed-old', expectedRevision: 0})).rejects.toMatchObject({kind: 'conflict', conflict: {currentRevision: 2}});
    expect((await service.getBriefHistory(id)).current?.confirmedAt).toBeNull();
  });
  it('persists unknown creation before sending and recovers it with no caller-provided command after refresh', async () => {
    const host = await fixture(), storage = new SessionStore();
    const options = {actorKey: () => 'owner', storage: () => storage, authorize: () => {}};
    host.losePost();
    await expect(host.service(options).createProject(input(), {commandId: 'durable-create', expectedRevision: 0})).rejects.toMatchObject({outcomeUnknown: true});
    const refreshed = host.service(options);
    expect(refreshed.briefRecovery?.getPending()).toMatchObject({commandId: 'durable-create', path: '/projects'});
    await expect(refreshed.createProject(input(), {commandId: 'would-duplicate', expectedRevision: 0})).rejects.toMatchObject({kind: 'unavailable'});
    const id = await refreshed.briefRecovery?.retry();
    expect((await refreshed.listProjects({})).items.map(p => p.id)).toEqual([id]);
    expect(host.bodies[1]).toBe(host.bodies[0]);
    expect(refreshed.briefRecovery?.getPending()).toBeNull();
  });
  it('keeps an unsent draft through refresh, isolates endpoint and actor, and guards recovery permission', async () => {
    const host = await fixture(), storage = new SessionStore(), actor = {id: 'designer'}, permission = {allowed: true};
    const options = {actorKey: () => actor.id, storage: () => storage, authorize: () => {if (!permission.allowed) throw new Error('Denied');}};
    const service = host.service(options), created = await service.createProject(input(), {commandId: 'pending-save-project', expectedRevision: 0});
    const failing = new HttpWorkbenchService({baseUrl: 'http://127.0.0.1:4182/api/v1', recovery: options, fetchImpl: async (url, init) => {if (init?.method === 'POST') throw new Error('Offline before send'); return host.fetchImpl(url, init);}});
    await expect(failing.saveBrief(created.data.id, {...input().brief!, background: '刷新后仍保留的草稿'}, {commandId: 'unsent-save', expectedRevision: 0})).rejects.toMatchObject({outcomeUnknown: true});
    const refreshed = host.service(options);
    expect(refreshed.briefRecovery?.getPending()?.body).toContain('刷新后仍保留的草稿');
    actor.id = 'guest'; expect(refreshed.briefRecovery?.getPending()).toBeNull();
    actor.id = 'designer'; permission.allowed = false;
    await expect(refreshed.briefRecovery?.retry()).rejects.toThrow('Denied');
    permission.allowed = true;
    await refreshed.briefRecovery?.retry();
    expect((await refreshed.getBriefHistory(created.data.id)).current?.background).toBe('刷新后仍保留的草稿');
    const otherEndpoint = new HttpWorkbenchService({baseUrl: 'http://127.0.0.1:9999/api/v1', recovery: options});
    expect(otherEndpoint.briefRecovery?.getPending()).toBeNull();
  });
  it('refuses a write before sending when the pending journal cannot be stored', async () => {
    const host = await fixture(), storage = new SessionStore();
    storage.setItem = () => {throw new Error('Quota');};
    const service = host.service({actorKey: () => 'owner', storage: () => storage, authorize: () => {}});
    await expect(service.createProject(input(), {commandId: 'not-sent', expectedRevision: 0})).rejects.toMatchObject({kind: 'unavailable'});
    expect(host.bodies).toHaveLength(0);
  });

  it('locks the selected actor throughout refreshed recovery including capability handshake', async () => {
    const host = await fixture(), storage = new SessionStore();
    vi.stubEnv('VITE_WORKBENCH_API_URL', 'http://127.0.0.1:4182/api/v1');
    vi.stubGlobal('sessionStorage', storage); vi.stubGlobal('fetch', host.fetchImpl);
    const first = createServices(); host.losePost();
    try {await expect(first.workbench.createProject(input(), {commandId: 'role-locked', expectedRevision: 0})).rejects.toMatchObject({outcomeUnknown: true});}
    finally {first.team.destroy();}
    let release = () => {}, started = () => {};
    const gate = new Promise<void>(resolve => {release = resolve;}), ready = new Promise<void>(resolve => {started = resolve;});
    vi.stubGlobal('fetch', async (url: RequestInfo | URL, init?: RequestInit) => {if (String(url).endsWith('/capabilities')) {started(); await gate;} return host.fetchImpl(url, init);});
    const refreshed = createServices();
    try {
      const pending = refreshed.workbench.briefRecovery?.retry(); await ready;
      expect(() => refreshed.team.selectActor('human-guest')).toThrow('完成后才能切换');
      release(); await pending;
      refreshed.team.selectActor('human-guest');
      expect(refreshed.workbench.briefRecovery?.getPending()).toBeNull();
      expect((await host.service().listProjects({})).total).toBe(1);
    } finally {release(); refreshed.team.destroy();}
  });
  it('retains a recovered historical save instead of clearing it against a later head', async () => {
    const host = await fixture(), storage = new SessionStore(), recovery = {actorKey: () => 'owner', storage: () => storage, authorize: () => {}};
    const service = host.service(recovery), created = await service.createProject(input(), {commandId: 'historical-recovery-create', expectedRevision: 0}), id = created.data.id;
    host.losePost();
    await expect(service.saveBrief(id, {...input().brief!, background: '历史未决提交'}, {commandId: 'historical-pending', expectedRevision: 0})).rejects.toMatchObject({outcomeUnknown: true});
    await host.service().saveBrief(id, {...input().brief!, background: '其他窗口后续新稿'}, {commandId: 'new-head', expectedRevision: 1});
    const refreshed = host.service(recovery);
    await expect(refreshed.briefRecovery?.retry()).rejects.toMatchObject({kind: 'conflict', conflict: {currentRevision: 2}});
    expect(refreshed.briefRecovery?.getPending()?.body).toContain('历史未决提交');
    expect((await refreshed.getBriefHistory(id)).current?.background).toBe('其他窗口后续新稿');
  });

});
