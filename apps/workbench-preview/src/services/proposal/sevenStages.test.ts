import { describe, expect, it, vi } from 'vitest';
import { ACTIVE_CHECKPOINT_STAGES, ACTIVE_STAGES, STAGES, activeStage, nextActiveStage, type StageStatus } from '../../domain/proposal';
import { nextAction, nextFromSummary } from '../../proposal/derive';
import { needsYou } from '../../proposal/needs';
import { recordDestination } from '../../proposal/recordTargets';
import { resolveStageRoute } from '../../proposal/stageRoute';
import { MockWorkbenchService } from '../mock/MockWorkbenchService';
import { memoryStore } from '../mock/storage';
import { MockProposalService } from './MockProposalService';

const KEY = 'proposal-workbench/demo/proposals/zh-desktop-v1';
async function setup() {
  const store = memoryStore();
  const workbench = new MockWorkbenchService({ store, latency: { read: 0, write: 0 }, autoTick: false });
  const service = new MockProposalService(workbench, store, { latency: 0, agentDelay: 0 });
  const proposal = await service.findByWorkbenchId('plumtide');
  if (!proposal) throw new Error('Missing fixture');
  const save = () => store.set(KEY, JSON.stringify({ futureRoot: { untouched: ['原始未知字段'] }, schema: 4, caseInstallations: [], data: { [proposal.id]: proposal } }));
  return { service, store, workbench, proposal, save };
}

describe('seven active stages with preserved historical identity', () => {
  it('has one active order while keeping eight stored identities', () => {
    expect(STAGES).toHaveLength(8);
    expect(ACTIVE_STAGES).toEqual(['brief', 'research', 'strategy', 'themes', 'visual', 'layout', 'delivery']);
    expect(nextActiveStage('visual')).toBe('layout');
    expect(nextActiveStage('content_review')).toBe('layout');
    expect(nextActiveStage('layout')).toBe('delivery');
    expect(nextActiveStage('delivery')).toBeNull();
    expect(ACTIVE_CHECKPOINT_STAGES).not.toContain('content_review');
  });

  it('assisted simulation skips retired approval and preserves that historical record', async () => {
    const { service, proposal, save } = await setup();
    proposal.checkpoints = ['visual', 'content_review', 'delivery'];
    const retired = structuredClone(proposal.stages.content_review);
    save();
    await service.decide(proposal.id, 'visual', { kind: 'approve', comment: '保留终审' }, { expectedRevision: proposal.revision });
    const after = await service.getProposal(proposal.id);
    expect(after.currentStage).toBe('delivery');
    expect(after.stages.layout.status).toBe('done');
    expect(after.stages.delivery.status).toBe('waiting_for_you');
    expect(after.stages.content_review).toEqual(retired);
    expect(after.decisions.filter((item) => item.stage === 'content_review')).toEqual(proposal.decisions.filter((item) => item.stage === 'content_review'));
    expect(after.checkpoints).toEqual(proposal.checkpoints);
  });

  it('automatic simulation reaches delivery without producing retired events', async () => {
    const { service, proposal, save } = await setup();
    proposal.mode = 'automatic';
    save();
    await service.decide(proposal.id, 'visual', { kind: 'approve', comment: '' });
    const after = await service.getProposal(proposal.id);
    expect(after.stages.delivery.status).toBe('done');
    expect(after.stages.content_review).toEqual(proposal.stages.content_review);
    expect(after.reviews).toEqual(proposal.reviews);
  });

  it.each<StageStatus>(['not_started', 'waiting_for_you', 'done', 'needs_revision'])('projects retired current stage %s to real layout without writing', async (status) => {
    const { service, store, proposal, save } = await setup();
    Object.assign(proposal, { futureProposal: { raw: ['未迁移'] } });
    Object.assign(proposal.stages.content_review, { futureStage: { receipt: 'original' } });
    proposal.currentStage = 'content_review';
    proposal.stages.content_review.status = status;
    proposal.stages.visual.status = 'done';
    proposal.stages.layout.status = 'in_progress';
    proposal.task.unknowns = [];
    proposal.checkpoints = ['content_review', 'delivery'];
    save();
    const raw = store.get(KEY);
    const read = await service.getProposal(proposal.id);
    const summary = (await service.listProposals()).find((item) => item.id === proposal.id);
    expect(read.currentStage).toBe('content_review');
    expect(activeStage(read.currentStage)).toBe('layout');
    expect(summary).toMatchObject({ currentStage: 'layout', currentStatus: 'in_progress', attention: 0 });
    expect(nextAction(read, null)).toMatchObject({ stage: 'layout', kind: 'follow' });
    if (!summary) throw new Error('Missing summary');
    expect(nextFromSummary(summary)).toMatchObject({ stage: 'layout', kind: 'follow' });
    expect(needsYou(read)).toEqual([]);
    expect(store.get(KEY)).toBe(raw);
    await expect(service.decide(proposal.id, 'content_review', { kind: 'approve', comment: '' })).rejects.toMatchObject({ kind: 'validation' });
    await expect(service.contribute(proposal.id, 'content_review', { kind: 'comment', text: 'new', borrow: null })).rejects.toMatchObject({ kind: 'validation' });
    expect(store.get(KEY)).toBe(raw);
    const changed = await service.setMode(proposal.id, 'assisted', ['content_review', 'delivery'], { expectedRevision: read.revision });
    expect(changed.checkpoints).toEqual(['delivery']);
    expect(changed).toMatchObject({ futureProposal: { raw: ['未迁移'] } });
    expect(store.get(KEY)).toContain('原始未知字段');
    expect(changed.stages.content_review).toEqual(proposal.stages.content_review);
    expect(changed.contentReview).toEqual(proposal.contentReview);
    expect(changed.reviews).toEqual(proposal.reviews);
    expect(changed.versions).toEqual(proposal.versions);
    expect(changed.handoffs).toEqual(proposal.handoffs);
    expect(changed.contributions).toEqual(proposal.contributions);
  });

  it('rejects historical narrative edits without changing content, revision or storage bytes', async () => {
    const { service, store, proposal, save } = await setup();
    const section = proposal.contentReview?.narrative[0];
    if (!section) throw new Error('Missing historical narrative');
    save();
    const before = store.get(KEY);
    await expect(service.editNarrative(proposal.id, section.id, '不应写入的文字', { expectedRevision: proposal.revision })).rejects.toMatchObject({ kind: 'validation' });
    expect(store.get(KEY)).toBe(before);
    const after = await service.getProposal(proposal.id);
    expect(after.revision).toBe(proposal.revision);
    expect(after.contentReview).toEqual(proposal.contentReview);
    expect(after.contributions).toEqual(proposal.contributions);
    expect(after.stages.content_review).toEqual(proposal.stages.content_review);
  });

  it.each(['considered', 'used'] as const)('rejects %s handling of historical review comments without adding a receipt', async (status) => {
    const { service, store, proposal, save } = await setup();
    proposal.contributions.push({ id: 'historical-review-comment', stage: 'content_review', kind: 'comment', text: '原审读意见', borrow: null, by: '旧审阅者', at: '2026-11-10T00:00:00Z', status: 'new', response: '旧回复原文', processing: [], target: { kind: 'stage', stage: 'content_review', version: 1 } });
    save();
    const before = store.get(KEY);
    await expect(service.resolveContribution(proposal.id, 'historical-review-comment', { status, reason: '不应新增回执' }, { expectedRevision: proposal.revision })).rejects.toMatchObject({ kind: 'validation' });
    expect(store.get(KEY)).toBe(before);
    const after = await service.getProposal(proposal.id);
    expect(after.revision).toBe(proposal.revision);
    expect(after.contentReview).toEqual(proposal.contentReview);
    expect(after.contributions).toEqual(proposal.contributions);
    expect(after.stages.content_review).toEqual(proposal.stages.content_review);
  });

  it('retains research release and source invalidation protection', async () => {
    const { service, proposal, save } = await setup();
    proposal.workbenchId = 'luma';
    proposal.currentStage = 'layout';
    for (const stage of STAGES) proposal.stages[stage].status = 'done';
    save();
    const read = await service.getProposal(proposal.id);
    expect(read.currentStage).toBe('research');
    expect(read.stages.research.status).toBe('needs_revision');
    for (const stage of ACTIVE_STAGES.slice(2)) expect(read.stages[stage].status).toBe('needs_revision');
    await expect(service.decide(proposal.id, 'visual', { kind: 'approve', comment: '' }, { expectedRevision: read.revision })).rejects.toMatchObject({ kind: 'validation' });
  });

  it('does not let an outstanding simulator callback restore a retired current stage', async () => {
    vi.useFakeTimers();
    try {
      const { workbench, store, proposal, save } = await setup();
      const service = new MockProposalService(workbench, store, { latency: 0, agentDelay: 1000 });
      await service.decide(proposal.id, 'visual', { kind: 'approve', comment: '' });
      proposal.currentStage = 'content_review';
      proposal.stages.visual.status = 'done';
      const original = structuredClone(proposal.stages.content_review);
      save();
      await vi.advanceTimersByTimeAsync(1000);
      const after = await service.getProposal(proposal.id);
      expect(after.currentStage).toBe('content_review');
      expect(after.stages.content_review).toEqual(original);
      expect(after.stages.layout).toEqual(proposal.stages.layout);
      expect(after.decisions).toEqual(proposal.decisions);
    } finally {
      vi.useRealTimers();
    }
  });

  it('filters retired checkpoints on creation', async () => {
    const { service } = await setup();
    const created = await service.createProposal({ workbenchId: 'seven-stage-memory-only', name: '七阶段测试', client: '', type: 'kv', mode: 'assisted', checkpoints: ['content_review', 'visual', 'delivery'] });
    expect(created.checkpoints).toEqual(['visual', 'delivery']);
    expect(created.stages.content_review.status).toBe('not_started');
  });

  it('redirects legacy URLs without carrying their review approval focus', () => {
    expect(resolveStageRoute('content_review', new URLSearchParams('focus=decision&version=3&tab=notes'))).toEqual({ stage: 'layout', redirect: true, params: { tab: 'notes' } });
    expect(resolveStageRoute('visual', new URLSearchParams('focus=artwork'))).toMatchObject({ stage: 'visual', redirect: false, params: { focus: 'artwork' } });
    expect(resolveStageRoute('unknown', new URLSearchParams())).toBeNull();
  });

  it('links original review records to history with their original identity', async () => {
    const { proposal } = await setup();
    const link = recordDestination(proposal, { stage: 'content_review', target: { kind: 'stage', stage: 'content_review', version: 1 } });
    expect(link.to).toContain('/process');
    expect(link.to).toContain('stage=content_review');
    expect(link.label).toContain('旧流程');
  });
});
