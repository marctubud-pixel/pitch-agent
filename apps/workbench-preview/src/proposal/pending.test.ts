import { describe, expect, it } from 'vitest';
import { MockWorkbenchService } from '../services/mock/MockWorkbenchService';
import { memoryStore } from '../services/mock/storage';
import { MockProposalService } from '../services/proposal/MockProposalService';
import { pendingVisuals } from './pending';

async function plumtide() {
  const store = memoryStore();
  const workbench = new MockWorkbenchService({ store, latency: { read: 0, write: 0 }, autoTick: false });
  const proposals = new MockProposalService(workbench, store, { latency: 0, agentDelay: 0 });
  return { proposals, p: (await proposals.findByWorkbenchId('plumtide'))! };
}

describe('pendingVisuals', () => {
  it('names the direction and artwork version that wait for review, not the first accepted one', async () => {
    const { p } = await plumtide();
    const pending = pendingVisuals(p);
    expect(pending.map((x) => x.directionId)).toEqual(['C']);
    expect(pending[0].direction?.name).toBe('传给身边的人');
    expect(pending[0].refined.version).toBe(1);
    expect(pending[0].previous).toBeNull();
  });

  it('reports only issues recorded in the data, and keeps a partly upheld challenge open', async () => {
    const { p } = await plumtide();
    const [c] = pendingVisuals(p);
    expect(c.openIssues).toEqual([expect.objectContaining({ kind: 'challenge', outcome: 'partly_upheld' })]);
  });

  it('approving the stage is stage-wide: the decision is recorded against the stage, not a direction', async () => {
    const { proposals, p } = await plumtide();
    const after = await proposals.decide(p.id, 'visual', { kind: 'approve', comment: '' });
    expect(after.stages.visual.status).toBe('done');
    const d = after.decisions[after.decisions.length - 1];
    expect(d.stage).toBe('visual');
    expect(Object.keys(d)).not.toContain('directionId');
  });
});
