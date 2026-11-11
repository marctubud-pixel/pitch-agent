import { describe, expect, it } from 'vitest';
import { MockWorkbenchService } from '../mock/MockWorkbenchService';
import { memoryStore } from '../mock/storage';
import { MockProposalService } from './MockProposalService';

function setup() {
  const store = memoryStore();
  const workbench = new MockWorkbenchService({ store, latency: { read: 0, write: 0 }, autoTick: false });
  const proposals = new MockProposalService(workbench, store, { latency: 0, agentDelay: 0 });
  return { workbench, proposals, store };
}

describe('MockProposalService', () => {
  it('seeds a KV project and packaging projects across the stages', async () => {
    const { proposals } = setup();
    const list = await proposals.listProposals();
    expect(list.map((p) => p.type).sort()).toEqual(['kv', 'packaging', 'packaging', 'packaging']);
    const kv = list.find((p) => p.type === 'kv')!;
    expect(kv.currentStage).toBe('delivery');
    expect(Object.keys(kv.stageStatus)).toHaveLength(8);
  });

  it('never marks research done while the working evidence checks have not released it', async () => {
    const { proposals } = setup();
    const luma = await proposals.findByWorkbenchId('luma');
    expect(luma?.stages.research.status).not.toBe('done');
    expect(luma?.currentStage).toBe('research');
    expect(luma?.stages.strategy.status).toBe('not_started');
  });

  it('only accepts decisions at a stage that is waiting for one, and needs a comment to revise', async () => {
    const { proposals } = setup();
    const p = (await proposals.findByWorkbenchId('plumtide'))!;
    await expect(proposals.decide(p.id, 'strategy', { kind: 'approve', comment: '' })).rejects.toThrow();
    await expect(proposals.decide(p.id, 'visual', { kind: 'request_revision', comment: '  ' })).rejects.toThrow(/需要修改什么/);
  });

  it('approving a checkpoint moves on until the next checkpoint, never past it', async () => {
    const { proposals } = setup();
    const p = (await proposals.findByWorkbenchId('plumtide'))!;
    expect(p.checkpoints).toContain('delivery');
    await proposals.decide(p.id, 'visual', { kind: 'approve', comment: 'C works.' });
    const after = await proposals.getProposal(p.id);
    expect(after.stages.visual.status).toBe('done');
    expect(after.stages.content_review).toEqual(p.stages.content_review);
    expect(after.stages.layout.status).toBe('done');
    // Delivery is a checkpoint: it waits for a person instead of completing by itself.
    expect(after.stages.delivery.status).toBe('waiting_for_you');
    expect(after.decisions.at(-1)).toMatchObject({ stage: 'visual', kind: 'approved', comment: 'C works.' });
  });

  it('records a choice made against reviewer advice separately from an approval', async () => {
    const { proposals } = setup();
    const p = (await proposals.findByWorkbenchId('plumtide'))!;
    await proposals.decide(p.id, 'visual', { kind: 'choose', comment: 'Keep the printed knot.', choice: 'C', reviewerPosition: 'Make it a real fold.' });
    const after = await proposals.getProposal(p.id);
    expect(after.decisions.at(-1)).toMatchObject({ kind: 'chosen_despite_review', reviewerPosition: 'Make it a real fold.' });
  });

  it('a revision request sends the stage back and returns a new version for review', async () => {
    const { proposals } = setup();
    const p = (await proposals.findByWorkbenchId('plumtide'))!;
    const v = p.stages.visual.version;
    await proposals.decide(p.id, 'visual', { kind: 'request_revision', comment: 'Warmer pink on C.' });
    const after = await proposals.getProposal(p.id);
    expect(after.stages.visual.status).toBe('waiting_for_you');
    expect(after.stages.visual.version).toBe(v + 1);
  });

  it('a new project starts at the brief and does not move on until the brief is confirmed', async () => {
    const { proposals, workbench, store } = setup();
    const list = await workbench.listProjects({ status: 'all' });
    const created = await workbench.createProject(
      { name: 'Test KV', client: 'Client', summary: '', mode: 'supervised', researchOwner: '', strategyOwner: '' },
      { commandId: 'cmd-1', expectedRevision: list.catalogRevision },
    );
    const p = await proposals.createProposal({ workbenchId: created.data.id, name: 'Test KV', client: 'Client', type: 'kv', mode: 'automatic', checkpoints: ['visual'], presentationLocalTime: '2027-01-01T00:05' });
    expect(p.checkpoints).toEqual([]);
    const read = await proposals.getProposal(p.id);
    expect(read.stages.brief.status).toBe('in_progress');
    expect(read.stages.research.status).toBe('not_started');
    const reopened = new MockProposalService(workbench, store, { latency: 0, agentDelay: 0 });
    expect((await reopened.getProposal(p.id)).presentationLocalTime).toBe('2027-01-01T00:05');
    expect((await reopened.findByWorkbenchId(created.data.id))?.presentationLocalTime).toBe('2027-01-01T00:05');
    expect((await reopened.listProposals()).find((item) => item.id === p.id)?.presentationLocalTime).toBe('2027-01-01T00:05');
    expect((await workbench.getProjectOverview(created.data.id)).brief?.confirmedAt).toBeNull();
    expect((await reopened.listProposals()).some((item) => item.id === 'northline-kv')).toBe(true);
  });

  it('keeps reporting time optional and reopens existing schema 4 records without resetting them', async () => {
    const { proposals, workbench, store } = setup();
    const p = await proposals.createProposal({ workbenchId: 'without-time', name: 'No time yet', client: '', type: 'kv', mode: 'assisted', checkpoints: [] });
    const reopened = new MockProposalService(workbench, store, { latency: 0 });
    expect(await reopened.getProposal(p.id)).not.toHaveProperty('presentationLocalTime');
    expect((await reopened.listProposals()).find((item) => item.id === p.id)?.presentationLocalTime).toBeUndefined();
    expect((await reopened.findByWorkbenchId('northline'))?.presentationLocalTime).toBeUndefined();
    expect(store.get('proposal-workbench/demo/proposals/zh-desktop-v1')).toContain('"schema":4');
  });

  it.each(['2024-02-29T00:05', '2000-02-29T23:59', '0001-01-01T00:00', '9999-12-31T23:59'])(
    'saves the exact Gregorian calendar minute %s', async (presentationLocalTime) => {
      const { proposals } = setup();
      const p = await proposals.createProposal({ workbenchId: 'valid-time', name: 'Calendar', client: '', type: 'kv', mode: 'assisted', checkpoints: [], presentationLocalTime });
      expect((await proposals.getProposal(p.id)).presentationLocalTime).toBe(presentationLocalTime);
    },
  );

  it.each(['', '2026-02-29T12:00', '1900-02-29T12:00', '2026-04-31T12:00', '0000-01-01T12:00', '2026-13-01T12:00', '2026-01-00T12:00', '2026-01-01T24:00', '2026-01-01T12:60', '2026-01-01T12:', '2026-01-01T12:00:00', '2026-01-01T12:00Z'])(
    'rejects invalid reporting time %j before saving', async (presentationLocalTime) => {
      const { proposals, store } = setup();
      await proposals.listProposals();
      const before = store.get('proposal-workbench/demo/proposals/zh-desktop-v1');
      await expect(proposals.createProposal({ workbenchId: 'invalid-time', name: 'Invalid', client: '', type: 'kv', mode: 'automatic', checkpoints: [], presentationLocalTime })).rejects.toMatchObject({ kind: 'validation' });
      expect(await proposals.findByWorkbenchId('invalid-time')).toBeNull();
      expect(store.get('proposal-workbench/demo/proposals/zh-desktop-v1')).toBe(before);
    },
  );

  it('contributions need text and do not change the stage', async () => {
    const { proposals } = setup();
    const p = (await proposals.findByWorkbenchId('northline'))!;
    await expect(proposals.contribute(p.id, 'themes', { kind: 'slogan', text: ' ', borrow: null })).rejects.toThrow();
    const after = await proposals.contribute(p.id, 'themes', { kind: 'slogan', text: 'Cold looks good on you.', borrow: null });
    expect(after.contributions.at(-1)).toMatchObject({ kind: 'slogan', status: 'new' });
    expect(after.stages.themes.status).toBe(p.stages.themes.status);
  });

  it('follows the Workbench demo scenario, so error and empty states match everywhere', async () => {
    const { proposals, workbench } = setup();
    const demo = workbench as unknown as { setScenario(s: string): void };
    demo.setScenario('network_error');
    await expect(proposals.listProposals()).rejects.toThrow(/网络/);
    demo.setScenario('empty');
    expect(await proposals.listProposals()).toEqual([]);
    expect(await proposals.findByWorkbenchId('northline')).toBeNull();
    demo.setScenario('normal');
    expect(await proposals.listProposals()).toHaveLength(4);
  });

  it('is restored by a demo reset', async () => {
    const { proposals, workbench } = setup();
    const p = (await proposals.findByWorkbenchId('plumtide'))!;
    await proposals.decide(p.id, 'visual', { kind: 'approve', comment: '' });
    await (workbench as unknown as { resetDemoData(): Promise<void> }).resetDemoData();
    expect((await proposals.getProposal(p.id)).stages.visual.status).toBe('waiting_for_you');
  });
});

describe('shared-store transactions and target-bound feedback', () => {
  function sharedSetup() {
    const store = memoryStore();
    const workbench = new MockWorkbenchService({ store, latency: { read: 0, write: 0 }, autoTick: false });
    const a = new MockProposalService(workbench, store, { latency: 0, agentDelay: 100_000 });
    const b = new MockProposalService(workbench, store, { latency: 0, agentDelay: 100_000 });
    return { store, workbench, a, b };
  }

  it('retains competing appends and unrelated proposal updates from independent instances', async () => {
    const { a, b } = sharedSetup();
    const plum = (await a.findByWorkbenchId('plumtide'))!;
    const north = (await b.findByWorkbenchId('northline'))!;
    const target = { kind: 'stage', stage: 'visual', version: plum.stages.visual.version } as const;
    await Promise.all([
      a.contribute(plum.id, 'visual', { kind: 'comment', text: 'Window A', borrow: null, target }, { expectedRevision: plum.revision }),
      b.contribute(plum.id, 'visual', { kind: 'comment', text: 'Window B', borrow: null, target }, { expectedRevision: plum.revision }),
      b.setMode(north.id, 'automatic', [], { expectedRevision: north.revision }),
    ]);
    const after = await a.getProposal(plum.id);
    expect(after.contributions.map((c) => c.text)).toEqual(expect.arrayContaining(['Window A', 'Window B']));
    expect(new Set(after.contributions.map((c) => c.id)).size).toBe(after.contributions.length);
    expect((await a.getProposal(north.id)).mode).toBe('automatic');
  });

  it('rejects stale active writes and keeps retired narrative read-only', async () => {
    const { a, b } = sharedSetup();
    const p = (await a.findByWorkbenchId('plumtide'))!;
    const section = p.contentReview!.narrative[0];
    await expect(b.editNarrative(p.id, section.id, 'Other window edit.', { expectedRevision: p.revision })).rejects.toMatchObject({ kind: 'validation' });
    expect((await a.getProposal(p.id)).revision).toBe(p.revision);
    await b.setMode(p.id, 'automatic', [], { expectedRevision: p.revision });
    await expect(a.decide(p.id, 'visual', { kind: 'approve', comment: '' }, { expectedRevision: p.revision })).rejects.toMatchObject({ kind: 'conflict' });
    await expect(a.editNarrative(p.id, section.id, 'Old editor text.', { expectedRevision: p.revision })).rejects.toMatchObject({ kind: 'validation' });
    await expect(a.chooseLayout(p.id, 'editorial', { expectedRevision: p.revision })).rejects.toMatchObject({ kind: 'conflict' });
    expect((await a.getProposal(p.id)).contentReview).toEqual(p.contentReview);
  });

  it('keeps historical artwork binding and original authorship through explicit human handling', async () => {
    const { a, b } = sharedSetup();
    const p = (await a.findByWorkbenchId('northline'))!;
    const branch = p.visual!.branches.find((branch) => branch.refined.length > 1)!;
    const historical = branch.refined[0];
    const target = { kind: 'visual', stage: 'visual', directionId: branch.directionId, version: historical.version } as const;
    const authored = await a.contribute(p.id, 'visual', { kind: 'reference', text: 'Keep this exact older image.', borrow: 'its fold', target }, { expectedRevision: p.revision, actor: { id: 'designer', name: 'Design author', role: 'designer' } });
    const original = authored.contributions.at(-1)!;
    expect(original.response).toBeNull();
    await expect(b.contribute(p.id, 'visual', { kind: 'comment', text: 'Missing image', borrow: null, target: { ...target, version: 999 } }, { expectedRevision: p.revision })).rejects.toMatchObject({ kind: 'conflict' });
    const handled = await b.resolveContribution(p.id, original.id, { status: 'used', reason: 'The human lead selected the earlier fold for the next brief.' }, { expectedRevision: authored.revision, actor: { id: 'lead', name: 'Human lead', role: 'visual_lead' } });
    const final = handled.contributions.find((c) => c.id === original.id)!;
    expect(final).toMatchObject({ text: original.text, borrow: original.borrow, by: original.by, authorId: 'designer', at: original.at, target, response: null, status: 'used' });
    expect(final.processing).toEqual([expect.objectContaining({ by: 'Human lead', authorId: 'lead', status: 'used', target, reason: expect.stringContaining('human lead') })]);
  });

  it('reads derived workbench state without writing an older proposal snapshot', async () => {
    const { a, b, store } = sharedSetup();
    const p = (await a.findByWorkbenchId('plumtide'))!;
    await b.contribute(p.id, 'visual', { kind: 'comment', text: 'Keep across read projection.', borrow: null });
    const before = store.get('proposal-workbench/demo/proposals/zh-desktop-v1');
    await a.listProposals();
    await a.getProposal(p.id);
    expect(store.get('proposal-workbench/demo/proposals/zh-desktop-v1')).toBe(before);
    expect((await b.getProposal(p.id)).contributions.at(-1)?.text).toBe('Keep across read projection.');
  });
});
