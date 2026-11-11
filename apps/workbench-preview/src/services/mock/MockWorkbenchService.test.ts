import { describe, expect, it, vi } from 'vitest';
import { ServiceError } from '../../domain/service';
import { MockWorkbenchService } from './MockWorkbenchService';
import { memoryStore } from './storage';

function setup() {
  let now = Date.parse('2026-10-24T10:00:00Z');
  const store = memoryStore();
  const svc = new MockWorkbenchService({ store, latency: { read: 0, write: 0 }, clock: () => now, autoTick: false });
  let n = 0;
  const cmd = () => `cmd-test-${++n}`;
  const advance = (ms: number) => {
    now += ms;
    svc.tick();
  };
  const rev = async (projectId: string) => (await svc.getProjectOverview(projectId)).project.revision;
  return { svc, store, cmd, advance, rev };
}

async function expectError(promise: Promise<unknown>, kind: ServiceError['kind']) {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ServiceError);
    expect((error as ServiceError).kind).toBe(kind);
    return error as ServiceError;
  }
  throw new Error(`Expected a ${kind} error`);
}

describe('seed data', () => {
  it('puts each demo project in its intended state', async () => {
    const { svc } = setup();
    const { items } = await svc.listProjects({});
    const byId = Object.fromEntries(items.map((p) => [p.id, p]));
    expect(byId.luma.status).toBe('blocked');
    expect(byId.luma.currentStage).toBe('verification');
    expect(byId.northline.status).toBe('ready');
    expect(byId.northline.currentStage).toBe('handoff');
    expect(byId.morrow.currentStage).toBe('strategy');
    expect(byId.morrow.status).toBe('ready');
  });

  it('explains exactly why Luma is blocked', async () => {
    const { svc } = setup();
    const ws = await svc.getResearchWorkspace('luma');
    expect(ws.verification?.decision).toBe('fail');
    expect(ws.verification?.findings.some((f) => f.severity === 'blocking' && f.message.includes('没有引用任何来源'))).toBe(true);
    expect(ws.verification?.findings.some((f) => f.severity === 'major' && f.message.includes('21–44'))).toBe(true);
    expect(ws.readiness?.decision).toBe('fail');
    expect(ws.readiness?.coverage.find((c) => c.topic === 'audience')).toMatchObject({ supported: 1, required: 2, met: false });
    const overview = await svc.getProjectOverview('luma');
    expect(overview.eligibility.eligible).toBe(false);
    expect(overview.blockers.length).toBeGreaterThanOrEqual(3);
  });

  it('marks Northline as eligible and Morrow as having research history', async () => {
    const { svc } = setup();
    expect((await svc.getProjectOverview('northline')).eligibility.eligible).toBe(true);
    const artifacts = await svc.listArtifacts('morrow');
    const research = artifacts.items.filter((a) => a.stage === 'research');
    expect(research.map((a) => a.version)).toEqual([3, 2, 1]);
    expect(research.filter((a) => !a.isCurrent)).toHaveLength(2);
    expect(artifacts.items.find((a) => a.stage === 'strategy')?.status).toBe('ready');
  });
});

describe('commands', () => {
  it('does not apply an identical retry twice', async () => {
    const { svc, cmd, rev } = setup();
    const input = { title: 'Test source', publisher: 'Test publisher', url: '', excerpt: 'A long enough excerpt that would pass the simulated verification check easily.', intendedUse: 'audience' as const, attachToClaimId: null };
    const expectedRevision = await rev('luma');
    const id = cmd();
    const first = await svc.addSource('luma', input, { commandId: id, expectedRevision });
    const second = await svc.addSource('luma', input, { commandId: id, expectedRevision });
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.data.id).toBe(first.data.id);
    const library = await svc.listSources('luma', { search: 'Test source' });
    expect(library.items).toHaveLength(1);
    expect(await rev('luma')).toBe(expectedRevision + 1);
  });

  it('rejects a reused command ID with a different payload', async () => {
    const { svc, cmd, rev } = setup();
    const id = cmd();
    const expectedRevision = await rev('luma');
    const base = { title: 'One', publisher: 'P', url: '', excerpt: 'x'.repeat(70), intendedUse: 'category' as const, attachToClaimId: null };
    await svc.addSource('luma', base, { commandId: id, expectedRevision });
    await expectError(svc.addSource('luma', { ...base, title: 'Two' }, { commandId: id, expectedRevision }), 'idempotency_mismatch');
  });

  it('rejects a stale expected revision', async () => {
    const { svc, cmd, rev } = setup();
    const stale = (await rev('northline')) - 1;
    const error = await expectError(svc.startVerification('northline', { commandId: cmd(), expectedRevision: stale }), 'conflict');
    expect(error.conflict?.currentRevision).toBe(stale + 1);
  });

  it('creates a new brief version and marks dependants stale when a confirmed brief changes', async () => {
    const { svc, cmd, rev } = setup();
    const history = await svc.getBriefHistory('morrow');
    const current = history.current!;
    await svc.saveBrief(
      'morrow',
      { background: current.background, audience: current.audience, objectives: current.objectives, deliverables: current.deliverables, constraints: [...current.constraints, 'New constraint.'], changeNote: 'Added a constraint.' },
      { commandId: cmd(), expectedRevision: await rev('morrow') },
    );
    const after = await svc.getBriefHistory('morrow');
    expect(after.current?.version).toBe(current.version + 1);
    expect(after.current?.confirmedAt).toBeNull();
    expect(after.versions.find((v) => v.version === current.version)?.supersededAt).not.toBeNull();
    expect(after.dependentArtifacts.every((a) => a.status === 'stale')).toBe(true);
    const overview = await svc.getProjectOverview('morrow');
    expect(overview.project.currentStage).toBe('brief');
    await svc.confirmBrief('morrow', { commandId: cmd(), expectedRevision: overview.project.revision });
    const confirmed = await svc.getProjectOverview('morrow');
    expect(confirmed.project.status).toBe('needs_update');
    expect(confirmed.nextAction.command).toBe('regenerate_research');
  });

  it('refuses to continue a blocked project and explains why', async () => {
    const { svc, cmd, rev } = setup();
    const error = await expectError(svc.continueToStrategy('luma', { commandId: cmd(), expectedRevision: await rev('luma') }), 'not_eligible');
    expect(error.message).toContain('证据核验已通过');
  });

  it('replays a command whose response was lost', async () => {
    const { svc, cmd, rev } = setup();
    svc.setDropNextResponse(true);
    const id = cmd();
    const expectedRevision = await rev('northline');
    await expectError(svc.startVerification('northline', { commandId: id, expectedRevision }), 'response_lost');
    const retried = await svc.startVerification('northline', { commandId: id, expectedRevision });
    expect(retried.replayed).toBe(true);
    const jobs = await svc.listJobs('northline');
    expect(jobs.items.filter((j) => j.purpose === 'evidence_verification' && j.status === 'queued')).toHaveLength(1);
  });

  it('injects a collaborator change in the conflict scenario', async () => {
    const { svc, cmd, rev } = setup();
    svc.setScenario('conflict');
    const expectedRevision = await rev('northline');
    await expectError(svc.startVerification('northline', { commandId: cmd(), expectedRevision }), 'conflict');
    const ok = await svc.startVerification('northline', { commandId: cmd(), expectedRevision: await rev('northline') });
    expect(ok.replayed).toBe(false);
  });
});

describe('jobs and progression', () => {
  it('runs jobs through queued, running and succeeded', async () => {
    const { svc, cmd, rev, advance } = setup();
    const { data: job } = await svc.startVerification('luma', { commandId: cmd(), expectedRevision: await rev('luma') });
    expect(job.status).toBe('queued');
    advance(1500);
    expect((await svc.listJobs('luma')).items.find((j) => j.id === job.id)?.status).toBe('running');
    advance(4000);
    const done = (await svc.listJobs('luma')).items.find((j) => j.id === job.id)!;
    expect(done.status).toBe('succeeded');
    expect(done.output?.kind).toBe('review');
    expect(done.receipt?.provider).toBe('模拟服务提供方');
    // A successful job can still leave the artifact blocked.
    expect((await svc.getResearchWorkspace('luma')).artifact?.status).toBe('blocked');
  });

  it('recovers a saved result into the same job without creating another', async () => {
    const { svc, cmd, rev } = setup();
    const before = await svc.listJobs('luma');
    const waiting = before.items.find((j) => j.status === 'awaiting_reconciliation')!;
    expect(waiting.recovery).toMatchObject({ action: 'reconcile', eligible: true });
    const result = await svc.reconcileJob('luma', waiting.id, { commandId: cmd(), expectedRevision: await rev('luma') });
    expect(result.data.id).toBe(waiting.id);
    expect(result.data.status).toBe('succeeded');
    const after = await svc.listJobs('luma');
    expect(after.items).toHaveLength(before.items.length);
    const images = await svc.listImages('luma');
    expect(images.items.find((i) => i.image.id === waiting.target.id)?.observation).not.toBeNull();
    await expectError(svc.reconcileJob('luma', waiting.id, { commandId: cmd(), expectedRevision: await rev('luma') }), 'not_eligible');
  });

  it('lets Luma reach strategy once its evidence gaps are closed', async () => {
    const { svc, cmd, rev, advance } = setup();
    const ws = await svc.getResearchWorkspace('luma');
    const missing = ws.claims.find((c) => c.supportStatus === 'missing_citation')!;
    const partial = ws.claims.find((c) => c.supportStatus === 'partial')!;
    await svc.linkSourceToClaim('luma', missing.id, 'src-luma-photolog', { commandId: cmd(), expectedRevision: await rev('luma') });
    await svc.linkSourceToClaim('luma', partial.id, 'src-luma-round2', { commandId: cmd(), expectedRevision: await rev('luma') });
    await svc.startVerification('luma', { commandId: cmd(), expectedRevision: await rev('luma') });
    advance(6000);
    await svc.startReadinessReview('luma', { commandId: cmd(), expectedRevision: await rev('luma') });
    advance(6000);
    const reviewed = await svc.getResearchWorkspace('luma');
    expect(reviewed.verification?.decision).toBe('pass');
    expect(reviewed.readiness?.decision).toBe('pass');
    const handoff = await svc.getHandoffOverview('luma');
    expect(handoff.canDeliver.allowed).toBe(true);
    await svc.recordHandoff('luma', { side: 'research_owner', decision: 'delivered', ...handoff.suggested, note: '' }, { commandId: cmd(), expectedRevision: await rev('luma') });
    await svc.recordHandoff('luma', { side: 'strategy_owner', decision: 'accepted', ...handoff.suggested, note: '' }, { commandId: cmd(), expectedRevision: await rev('luma') });
    await svc.releaseResearch('luma', { commandId: cmd(), expectedRevision: await rev('luma') });
    expect((await svc.getProjectOverview('luma')).eligibility.eligible).toBe(true);
    await svc.continueToStrategy('luma', { commandId: cmd(), expectedRevision: await rev('luma') });
    advance(6000);
    const artifacts = await svc.listArtifacts('luma');
    expect(artifacts.items.find((a) => a.stage === 'strategy')?.status).toBe('under_review');
  });
});

describe('scenarios and persistence', () => {
  it('fails reads in the network error scenario', async () => {
    const { svc } = setup();
    svc.setScenario('network_error');
    await expectError(svc.listProjects({}), 'network');
  });

  it('shows an empty workspace and keeps the normal data', async () => {
    const { svc } = setup();
    svc.setScenario('empty');
    expect((await svc.listProjects({})).items).toHaveLength(0);
    svc.setScenario('normal');
    expect((await svc.listProjects({})).items).toHaveLength(5);
  });

  it('persists changes and restores the seed on reset', async () => {
    const { svc, store, cmd } = setup();
    const list = await svc.listProjects({});
    await svc.createProject(
      { name: 'Test project', client: 'C', summary: 'S', mode: 'supervised', researchOwner: 'R', strategyOwner: 'T' },
      { commandId: cmd(), expectedRevision: list.catalogRevision },
    );
    const reloaded = new MockWorkbenchService({ store, latency: { read: 0, write: 0 }, autoTick: false });
    expect((await reloaded.listProjects({})).items).toHaveLength(6);
    await reloaded.resetDemoData();
    expect((await reloaded.listProjects({})).items).toHaveLength(5);
  });
});

describe('localisation', () => {
  async function everything(svc: MockWorkbenchService) {
    const out: unknown[] = [await svc.getCapabilities(), await svc.listProjects({})];
    for (const id of ['luma', 'northline', 'morrow']) {
      out.push(
        await svc.getProjectOverview(id),
        await svc.getResearchWorkspace(id),
        await svc.getHandoffOverview(id),
        await svc.listJobs(id),
        await svc.listArtifacts(id),
        await svc.getBriefHistory(id),
      );
    }
    return JSON.stringify(out);
  }

  it.each(['en', 'fr', 'es', 'ja', 'ko', 'zh-CN'])('keeps generated text Chinese for legacy locale request %s', async (locale) => {
    const { svc } = setup();
    svc.setLocale(locale);
    const text = await everything(svc);
    expect(text).not.toContain('⁣');
    expect(text).not.toMatch(/\{[a-zA-Z]+\}/);
    svc.setLocale('en');
  });

  it('keeps findings, next steps and errors Chinese despite old language requests', async () => {
    const { svc, cmd, rev } = setup();
    svc.setLocale('fr');
    const overview = await svc.getProjectOverview('luma');
    expect(overview.nextAction.label).toBe('处理核验问题');
    expect(overview.stages[0].label).toBe('简报');
    svc.setLocale('ja');
    const again = await svc.getProjectOverview('luma');
    expect(again.nextAction.label).toBe('处理核验问题');
    expect(again.eligibility.checks[0].label).toBe('简报已确认');
    const error = await expectError(svc.continueToStrategy('luma', { commandId: cmd(), expectedRevision: await rev('luma') }), 'not_eligible');
    expect(error.message).toContain('未满足');
    svc.setLocale('en');
  });
});


describe('Chinese desktop demo storage', () => {
  it('keeps the previous edition settings intact while switching and resetting this edition', async () => {
    const store = memoryStore();
    const oldSettings = JSON.stringify({ scenario: 'loading' });
    store.set('proposal-workbench/demo/settings', oldSettings);
    const svc = new MockWorkbenchService({ store, latency: { read: 0, write: 0 }, autoTick: false });
    expect((await svc.listProjects({ status: 'all' })).items.length).toBeGreaterThan(0);
    svc.setScenario('empty');
    expect((await svc.listProjects({ status: 'all' })).items).toHaveLength(0);
    await svc.resetDemoData();
    expect(store.get('proposal-workbench/demo/settings')).toBe(oldSettings);
  });
});

describe('whole-store concurrency', () => {
  it('reloads independent instances and preserves writes to different projects', async () => {
    const store = memoryStore();
    const options = { store, latency: { read: 0, write: 0 }, autoTick: false };
    const a = new MockWorkbenchService(options);
    const b = new MockWorkbenchService(options);
    const pa = await a.getProjectOverview('northline');
    const pb = await b.getProjectOverview('luma');
    const source = (title: string) => ({ title, publisher: 'Human editor', excerpt: 'A source excerpt that should survive both writes.', url: 'https://example.com/reference', intendedUse: 'audience' as const, attachToClaimId: null });
    await Promise.all([
      a.addSource('northline', source('Window A'), { commandId: 'concurrent-a', expectedRevision: pa.project.revision }),
      b.addSource('luma', source('Window B'), { commandId: 'concurrent-b', expectedRevision: pb.project.revision }),
    ]);
    expect((await b.listSources('northline', {})).items.some((item) => item.title === 'Window A')).toBe(true);
    expect((await a.listSources('luma', {})).items.some((item) => item.title === 'Window B')).toBe(true);
  });

  it('rejects the second same-revision writer while ticker/read advancement preserves the first write', async () => {
    let now = Date.parse('2026-10-24T10:00:00Z');
    const store = memoryStore();
    const options = { store, latency: { read: 0, write: 0 }, autoTick: false, clock: () => now };
    const a = new MockWorkbenchService(options);
    const b = new MockWorkbenchService(options);
    const p = await a.getProjectOverview('luma');
    const input = { title: 'Winning source', publisher: 'Human editor', excerpt: 'Original source remains after job projection and a stale save.', url: 'https://example.com/reference', intendedUse: 'audience' as const, attachToClaimId: null };
    const results = await Promise.allSettled([
      a.addSource('luma', input, { commandId: 'same-a', expectedRevision: p.project.revision }),
      b.addSource('luma', { ...input, title: 'Stale source' }, { commandId: 'same-b', expectedRevision: p.project.revision }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({ reason: { kind: 'conflict' } });
    now += 60_000;
    await Promise.all([a.tick(), b.listJobs('luma')]);
    expect((await b.listSources('luma', {})).items.some((item) => item.title === 'Winning source')).toBe(true);
    const reloaded = new MockWorkbenchService(options);
    expect((await reloaded.listSources('luma', {})).items.some((item) => item.title === 'Winning source')).toBe(true);
  });
});

describe('read-only fallback without browser locks', () => {
  it('keeps local reads available but refuses shared writes when Web Locks are unavailable', async () => {
    vi.stubGlobal('navigator', undefined);
    try {
    const store = memoryStore();
    const svc = new MockWorkbenchService({ store, persistence: 'local', latency: { read: 0, write: 0 }, autoTick: false });
    const overview = await svc.getProjectOverview('northline');
    expect(overview.project.id).toBe('northline');
    await expect(svc.addSource('northline', { title: 'Blocked', publisher: 'Human', excerpt: 'No unprotected shared-store write.', url: 'https://example.com/reference', intendedUse: 'audience', attachToClaimId: null }, { commandId: 'no-lock', expectedRevision: overview.project.revision })).rejects.toMatchObject({ kind: 'unavailable' });
    expect(store.get('proposal-workbench/demo/db/zh-desktop-v1')).toBeNull();
    expect(svc.getDemoState().storageWarning).toContain('Web Locks');
    } finally { vi.unstubAllGlobals(); }
  });
});
