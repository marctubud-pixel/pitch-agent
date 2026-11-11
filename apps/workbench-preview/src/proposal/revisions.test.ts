import { describe, expect, it } from 'vitest';
import { MockWorkbenchService } from '../services/mock/MockWorkbenchService';
import { memoryStore } from '../services/mock/storage';
import { MockProposalService } from '../services/proposal/MockProposalService';
import { artworkRevision, latestRevisionRequest, matchingTextIn } from './revisions';

async function load(id: string, agentDelay = 0) {
  const store = memoryStore();
  const workbench = new MockWorkbenchService({ store, latency: { read: 0, write: 0 }, autoTick: false });
  const proposals = new MockProposalService(workbench, store, { latency: 0, agentDelay });
  return { proposals, p: (await proposals.findByWorkbenchId(id))! };
}

describe('artworkRevision', () => {
  it('describes a recorded revision only from recorded data', async () => {
    const { p } = await load('northline');
    const b = p.visual!.branches.find((x) => x.directionId === 'B')!;
    const r = artworkRevision(b)!;
    expect(r.previous.version).toBe(1);
    expect(r.current.version).toBe(2);
    expect(r.request.challenge).toMatch(/季节只存在于标题中/);
    expect(r.response).toMatch(/让寒冷出现在地形/);
    expect(r.requirementChanges).toEqual([{ text: '季节融入画面', before: false, after: true }]);
    expect(r.review.previous.meetsRule).toBe(false);
    expect(r.review.current.meetsRule).toBe(true);
    expect(r.open).toEqual([]);
  });

  it('reports a check that only exists in the new version as added, not as changed', async () => {
    const { p } = await load('northline');
    const c = artworkRevision(p.visual!.branches.find((x) => x.directionId === 'C')!)!;
    expect(c.requirementChanges).toEqual([{ text: '与其他方向形成差异', before: null, after: true }]);
  });

  it('returns nothing when there is no previous version (no empty panel)', async () => {
    const { p } = await load('northline');
    expect(artworkRevision(p.visual!.branches.find((x) => x.directionId === 'A')!)).toBeNull();
    const plum = (await load('plumtide')).p;
    expect(plum.visual!.branches.map(artworkRevision)).toEqual([null, null, null]);
  });
});

describe('matchingTextIn', () => {
  it('finds identical text, and nothing more: a new idea that matches existing copy stays unadopted', async () => {
    const { proposals, p } = await load('northline');
    expect(matchingTextIn(p, '同一条路，冷了几分。')).toEqual([{ directionId: 'A' }]);
    expect(matchingTextIn(p, 'Not in any direction')).toEqual([]);
    const after = await proposals.contribute(p.id, 'themes', { kind: 'slogan', text: '同一条路，冷了几分。', borrow: null });
    const added = after.contributions[after.contributions.length - 1];
    // the match exists, but the recorded status says the idea has not been used
    expect(matchingTextIn(after, added.text)).toEqual([{ directionId: 'A' }]);
    expect(added.status).toBe('new');
  });
});

describe('latestRevisionRequest', () => {
  it('is empty without a request, and follows a request through the simulated round', async () => {
    const { proposals, p } = await load('plumtide', 40);
    expect(latestRevisionRequest(p, 'visual')).toBeNull();
    const asked = await proposals.decide(p.id, 'visual', { kind: 'request_revision', comment: 'Make the knot real' });
    const s1 = latestRevisionRequest(asked, 'visual')!;
    expect(s1.request.comment).toBe('Make the knot real');
    expect(s1.versions).toEqual([]);
    await new Promise((r) => setTimeout(r, 120));
    const back = (await proposals.getProposal(p.id))!;
    const s2 = latestRevisionRequest(back, 'visual')!;
    expect(back.stages.visual.status).toBe('waiting_for_you');
    expect(s2.versions.length).toBe(1);
    expect(s2.reviews[0].verdict).toMatch(/未实际重写正文/);
    const approved = await proposals.decide(p.id, 'visual', { kind: 'approve', comment: '' });
    expect(latestRevisionRequest(approved, 'visual')).toBeNull();
  });
});
