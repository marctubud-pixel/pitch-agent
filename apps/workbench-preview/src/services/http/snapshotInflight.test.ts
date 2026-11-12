import {describe, expect, it, vi} from 'vitest';
import {HttpWorkbenchService, type HttpServiceOptions} from './HttpWorkbenchService';
import {HttpProposalService} from './HttpProposalService';
import type {CreateProjectInput} from '../../domain/models';
import seed from './snapshot-inflight-fixture.json';

function deferred<T>() {
  let resolve = (_value: T): void => { throw Error('Deferred not initialized'); };
  let reject = (_error: unknown): void => { throw Error('Deferred not initialized'); };
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
}
function snapshot(id = seed.project.id, revision = 0) {
  const value = structuredClone(seed);
  value.project.id = id; value.project.revision = revision;
  return value;
}
function harness(options: Partial<HttpServiceOptions> = {}) {
  const reads: Array<{url: URL; init: RequestInit | undefined; gate: ReturnType<typeof deferred<Response>>}> = [];
  const writes: typeof reads = [];
  let capabilities = 0;
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/capabilities')) { capabilities++; return Response.json({surface: 'brief-v1', executionAvailable: false}); }
    const call = {url, init, gate: deferred<Response>()};
    (init?.method === 'POST' ? writes : reads).push(call);
    return call.gate.promise;
  };
  const service = new HttpWorkbenchService({baseUrl: 'http://snapshot.invalid/api/v1', fetchImpl, ...options});
  return {service, reads, writes, fetchImpl, capabilities: () => capabilities};
}
const arrived = (calls: unknown[], length: number) => vi.waitFor(() => expect(calls).toHaveLength(length));
class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}
const projectInput: CreateProjectInput = {name: seed.project.name, client: '本机测试', summary: '在途读取协议测试', mode: 'step_by_step', researchOwner: '研究', strategyOwner: '策略', brief: {proposalType: 'packaging', background: '工程测试', audience: '工程测试', objectives: [], deliverables: ['包装'], constraints: [], changeNote: ''}};

describe('only in-flight snapshot reads are shared', () => {
  it('twelve simultaneous current reads use one GET and each caller gets independent nested DTOs', async () => {
    const h = harness(), pending = Array.from({length: 12}, () => h.service.snapshot(seed.project.id));
    await arrived(h.reads, 1); expect(h.capabilities()).toBe(1);
    h.reads[0].gate.resolve(Response.json(snapshot()));
    const values = await Promise.all(pending);
    values[0].cards[0].original!.brief = 'mutated';
    values[0].native!.taskCards = [];
    values[0].policy.humanGates.push('foreign');
    expect(values[1].cards[0].original?.brief).toBe(seed.project.taskCards[0].brief);
    expect(values[1].native?.taskCards).toEqual(seed.project.taskCards);
    expect(values[1].policy.humanGates).toEqual(['strategy']);
    const later = h.service.snapshot(seed.project.id);
    await arrived(h.reads, 2); h.reads[1].gate.resolve(Response.json(snapshot(seed.project.id, 1)));
    expect((await later).revision).toBe(1);
  });
  it('workbench and proposal consumers share transport without sharing their mutable results', async () => {
    const h = harness(), proposal = new HttpProposalService(h.service);
    const pending = Promise.all([h.service.getProjectOverview(seed.project.id), h.service.getBriefHistory(seed.project.id), proposal.getProposal(seed.project.id)]);
    await arrived(h.reads, 1); h.reads[0].gate.resolve(Response.json(snapshot()));
    const [overview, history, result] = await pending;
    expect(overview.project.id).toBe(seed.project.id); expect(history.current?.proposalType).toBe('packaging'); expect(result.type).toBe('packaging');
  });
  it('connection data-changed listeners and initial callers share the one connected flight', async () => {
    const h = harness(), fromListeners: ReturnType<HttpWorkbenchService['snapshot']>[] = [];
    const unsubscribe = h.service.subscribe(() => { fromListeners.push(h.service.snapshot(seed.project.id), h.service.snapshot(seed.project.id)); });
    const initial = h.service.snapshot(seed.project.id);
    await arrived(h.reads, 1); h.reads[0].gate.resolve(Response.json(snapshot()));
    await Promise.all([initial, ...fromListeners]); unsubscribe(); expect(fromListeners).toHaveLength(2);
  });
  it('current, exact revisions and other projects do not share keys', async () => {
    const h = harness(), pending = [h.service.snapshot(seed.project.id), h.service.snapshot(seed.project.id, 0), h.service.snapshot(seed.project.id, 1), h.service.snapshot('other-project'), h.service.snapshot(seed.project.id, 1)];
    await arrived(h.reads, 4);
    for (const c of h.reads) c.gate.resolve(Response.json(snapshot(c.url.pathname.split('/').at(-1), Number(c.url.searchParams.get('revision') ?? 0))));
    expect((await Promise.all(pending)).map(p => p.revision)).toEqual([0, 0, 1, 0, 1]);
  });
  it('locale changes invalidate pending reads, including changing back', async () => {
    const h = harness(), first = h.service.snapshot(seed.project.id); await arrived(h.reads, 1);
    h.service.setLocale('en-US'); const second = h.service.snapshot(seed.project.id); await arrived(h.reads, 2);
    h.service.setLocale('zh-CN'); const third = h.service.snapshot(seed.project.id); await arrived(h.reads, 3);
    expect(h.reads.map(c => new Headers(c.init?.headers).get('Accept-Language'))).toEqual(['zh-CN', 'en-US', 'zh-CN']);
    for (const c of h.reads) c.gate.resolve(Response.json(snapshot())); await Promise.all([first, second, third]);
  });
  it('actor changes invalidate pending reads without requiring journal storage to be readable', async () => {
    let actor = 'one'; const h = harness({recovery: {actorKey: () => actor, storage: () => { throw Error('storage unavailable'); }, authorize: () => {}}});
    const first = h.service.snapshot(seed.project.id); await arrived(h.reads, 1);
    actor = 'two'; const second = h.service.snapshot(seed.project.id); await arrived(h.reads, 2);
    actor = 'one'; const third = h.service.snapshot(seed.project.id); await arrived(h.reads, 3);
    for (const c of h.reads) c.gate.resolve(Response.json(snapshot())); await Promise.all([first, second, third]);
  });
  it('an unavailable local actor key disables sharing without making reads require a write journal', async () => {
    const h = harness({recovery: {actorKey: () => { throw Error('actor unavailable'); }, storage: () => { throw Error('storage unavailable'); }, authorize: () => {}}});
    const pending = Promise.all([h.service.snapshot(seed.project.id), h.service.snapshot(seed.project.id)]);
    await arrived(h.reads, 2); for (const c of h.reads) c.gate.resolve(Response.json(snapshot())); await pending;
  });
  it('custom authentication headers conservatively opt out of read sharing', async () => {
    let token = 'first'; const h = harness({getHeaders: () => ({Authorization: token})});
    const first = h.service.snapshot(seed.project.id); await arrived(h.reads, 1);
    token = 'second'; const second = h.service.snapshot(seed.project.id); await arrived(h.reads, 2);
    expect(h.reads.map(c => new Headers(c.init?.headers).get('Authorization'))).toEqual(['first', 'second']);
    for (const c of h.reads) c.gate.resolve(Response.json(snapshot())); await Promise.all([first, second]);
  });
  it('different service instances do not share a flight', async () => {
    const h = harness(), other = new HttpWorkbenchService({baseUrl: 'http://snapshot.invalid/api/v1', fetchImpl: h.fetchImpl});
    const pending = Promise.all([h.service.snapshot(seed.project.id), other.snapshot(seed.project.id)]);
    await arrived(h.reads, 2); for (const c of h.reads) c.gate.resolve(Response.json(snapshot())); await pending;
  });
  for (const kind of ['http', 'network', 'json', 'project', 'revision'] as const) it(`propagates ${kind} failure to all waiters and permits a fresh read`, async () => {
    const h = harness(), revision = kind === 'revision' ? 1 : undefined;
    const outcome = Promise.allSettled([h.service.snapshot(seed.project.id, revision), h.service.snapshot(seed.project.id, revision)]);
    await arrived(h.reads, 1);
    if (kind === 'network') h.reads[0].gate.reject(Error('offline'));
    else h.reads[0].gate.resolve(kind === 'http' ? Response.json({error: {code: 'COMMAND_FORBIDDEN'}}, {status: 403}) : kind === 'json' ? new Response('invalid json') : Response.json(snapshot(kind === 'project' ? 'foreign-project' : seed.project.id)));
    expect((await outcome).map(r => r.status)).toEqual(['rejected', 'rejected']);
    const retry = h.service.snapshot(seed.project.id, revision); await arrived(h.reads, 2);
    h.reads[1].gate.resolve(Response.json(snapshot(seed.project.id, revision ?? 0))); expect((await retry).revision).toBe(revision ?? 0);
  });
  it('connection loss invalidates another pending project read before reconnect', async () => {
    const h = harness(), old = h.service.snapshot(seed.project.id); await arrived(h.reads, 1);
    const lost = h.service.snapshot('disconnected-project').catch(error => error); await arrived(h.reads, 2);
    h.reads[1].gate.reject(Error('connection lost')); await lost;
    const fresh = h.service.snapshot(seed.project.id); await arrived(h.reads, 3); expect(h.capabilities()).toBe(2);
    h.reads[0].gate.resolve(Response.json(snapshot())); h.reads[2].gate.resolve(Response.json(snapshot(seed.project.id, 1)));
    expect((await old).revision).toBe(0); expect((await fresh).revision).toBe(1);
  });
  it('write start/end invalidate reads and an older finally cannot evict a newer flight; POSTs are not deduplicated', async () => {
    const h = harness(), old = h.service.snapshot(seed.project.id); await arrived(h.reads, 1);
    const write = h.service.createProject(projectInput, {commandId: 'same-command', expectedRevision: 0}); await arrived(h.writes, 1);
    const during = h.service.snapshot(seed.project.id); await arrived(h.reads, 2);
    h.reads[0].gate.resolve(Response.json(snapshot())); await old;
    const sameDuring = h.service.snapshot(seed.project.id); await Promise.resolve(); expect(h.reads).toHaveLength(2);
    h.writes[0].gate.resolve(Response.json(snapshot())); await write;
    const after = h.service.snapshot(seed.project.id); await arrived(h.reads, 3);
    h.reads[1].gate.resolve(Response.json(snapshot())); await Promise.all([during, sameDuring]);
    const sameAfter = h.service.snapshot(seed.project.id); await Promise.resolve(); expect(h.reads).toHaveLength(3);
    h.reads[2].gate.resolve(Response.json(snapshot(seed.project.id, 1))); expect((await after).revision).toBe(1); await sameAfter;
    const again = h.service.createProject(projectInput, {commandId: 'same-command', expectedRevision: 0}); await arrived(h.writes, 2); h.writes[1].gate.resolve(Response.json(snapshot())); await again;
    expect(h.writes.map(c => c.init?.body)).toEqual([h.writes[0].init?.body, h.writes[0].init?.body]);
  });
  it('visual POST invalidates at authorization before its delayed response; pending journals do not block reads', async () => {
    const storage = new MemoryStorage(), h = harness({recovery: {actorKey: () => 'one', storage: () => storage, authorize: () => {}}, visualAuthorize: () => {}});
    const old = h.service.snapshot(seed.project.id); await arrived(h.reads, 1);
    const write = h.service.visualWorkflow.act(seed.project.id, {route: 'copy-continuations', input: {artifactId: 'copy', discoveryMode: 'manual_supplied'}}, {commandId: 'visual-start', expectedRevision: 0}).catch(error => error);
    await arrived(h.writes, 1); const fresh = h.service.snapshot(seed.project.id); await arrived(h.reads, 2);
    h.writes[0].gate.resolve(Response.json({error: {code: 'COMMAND_FORBIDDEN'}}, {status: 403})); expect(await write).toMatchObject({kind: 'forbidden'}); expect(storage.length).toBe(1);
    h.reads[0].gate.resolve(Response.json(snapshot())); h.reads[1].gate.resolve(Response.json(snapshot(seed.project.id, 1)));
    expect((await old).revision).toBe(0); expect((await fresh).revision).toBe(1);
  });
});
