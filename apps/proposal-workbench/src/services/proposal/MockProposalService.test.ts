import { describe, expect, it } from 'vitest';
import { MockWorkbenchService } from '../mock/MockWorkbenchService';
import { memoryStore } from '../mock/storage';
import { MockProposalService } from './MockProposalService';

function setup() {
  const store = memoryStore();
  const workbench = new MockWorkbenchService({ store, latency: { read: 0, write: 0 }, autoTick: false });
  const proposals = new MockProposalService(workbench, store, { latency: 0, agentDelay: 0 });
  return { workbench, proposals };
}

describe('MockProposalService', () => {
  it('seeds a KV project and packaging projects across the stages', async () => {
    const { proposals } = setup();
    const list = await proposals.listProposals();
    expect(list.map((p) => p.type).sort()).toEqual(['kv', 'packaging', 'packaging']);
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
    await expect(proposals.decide(p.id, 'visual', { kind: 'request_revision', comment: '  ' })).rejects.toThrow(/what should change/);
  });

  it('approving a checkpoint moves on until the next checkpoint, never past it', async () => {
    const { proposals } = setup();
    const p = (await proposals.findByWorkbenchId('plumtide'))!;
    expect(p.checkpoints).toContain('delivery');
    await proposals.decide(p.id, 'visual', { kind: 'approve', comment: 'C works.' });
    const after = await proposals.getProposal(p.id);
    expect(after.stages.visual.status).toBe('done');
    expect(after.stages.content_review.status).toBe('done');
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
    const { proposals, workbench } = setup();
    const list = await workbench.listProjects({ status: 'all' });
    const created = await workbench.createProject(
      { name: 'Test KV', client: 'Client', summary: '', mode: 'supervised', researchOwner: '', strategyOwner: '' },
      { commandId: 'cmd-1', expectedRevision: list.catalogRevision },
    );
    const p = await proposals.createProposal({ workbenchId: created.data.id, name: 'Test KV', client: 'Client', type: 'kv', mode: 'automatic', checkpoints: ['visual'] });
    expect(p.checkpoints).toEqual([]);
    const read = await proposals.getProposal(p.id);
    expect(read.stages.brief.status).toBe('in_progress');
    expect(read.stages.research.status).toBe('not_started');
  });

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
    await expect(proposals.listProposals()).rejects.toThrow(/network/);
    demo.setScenario('empty');
    expect(await proposals.listProposals()).toEqual([]);
    expect(await proposals.findByWorkbenchId('northline')).toBeNull();
    demo.setScenario('normal');
    expect(await proposals.listProposals()).toHaveLength(3);
  });

  it('is restored by a demo reset', async () => {
    const { proposals, workbench } = setup();
    const p = (await proposals.findByWorkbenchId('plumtide'))!;
    await proposals.decide(p.id, 'visual', { kind: 'approve', comment: '' });
    await (workbench as unknown as { resetDemoData(): Promise<void> }).resetDemoData();
    expect((await proposals.getProposal(p.id)).stages.visual.status).toBe('waiting_for_you');
  });
});
