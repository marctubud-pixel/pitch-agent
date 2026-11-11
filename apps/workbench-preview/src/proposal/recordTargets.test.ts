import { describe, expect, it } from 'vitest';
import { MockWorkbenchService } from '../services/mock/MockWorkbenchService';
import { memoryStore } from '../services/mock/storage';
import { MockProposalService } from '../services/proposal/MockProposalService';
import { recordDestination, recordTargetKey } from './recordTargets';

async function northline() {
  const store = memoryStore();
  const workbench = new MockWorkbenchService({ store, latency: { read: 0, write: 0 }, autoTick: false });
  const service = new MockProposalService(workbench, store, { latency: 0, agentDelay: 0 });
  const proposal = await service.findByWorkbenchId('northline');
  if (!proposal) throw new Error('The northline demo fixture is required.');
  return proposal;
}

describe('recordDestination', () => {
  it('opens the explicitly bound older visual, preserving direction and version', async () => {
    const proposal = await northline();
    const destination = recordDestination(proposal, { stage: 'visual', target: { kind: 'visual', stage: 'visual', directionId: 'B', version: 1 } });
    expect(destination.kind).toBe('exact');
    const query = new URLSearchParams(destination.to.split('?')[1]);
    expect(query.get('dir')).toBe('B');
    expect(query.get('version')).toBe('1');
    expect(query.get('part')).toBe('current');
    expect(destination.binding).toContain('精修视觉第 1 版');
  });

  it('does not infer an exact draft from a legacy version record or its title', async () => {
    const proposal = await northline();
    const destination = recordDestination(proposal, { stage: 'visual' });
    expect(destination.kind).toBe('stage_context');
    expect(destination.to).toBe('/p/northline/proposal/visual');
    expect(destination.to).not.toContain('dir=');
    expect(destination.binding).toContain('未绑定具体稿件');
  });

  it('keeps a missing visual or unavailable historic stage honest', async () => {
    const proposal = await northline();
    expect(recordDestination(proposal, { stage: 'visual', target: { kind: 'visual', stage: 'visual', directionId: 'B', version: 99 } }).kind).toBe('stage_context');
    expect(recordDestination(proposal, { stage: 'themes', target: { kind: 'theme', stage: 'themes', directionId: 'B', version: 99 } }).kind).toBe('stage_context');
    expect(recordDestination(proposal, { stage: 'strategy', target: { kind: 'stage', stage: 'strategy', version: 99 } }).kind).toBe('stage_context');
  });

  it('rejects a record whose explicit object belongs to another stage', async () => {
    const proposal = await northline();
    const destination = recordDestination(proposal, { stage: 'strategy', target: { kind: 'visual', stage: 'visual', directionId: 'B', version: 1 } });
    expect(destination.kind).toBe('stage_context');
    expect(destination.to).toBe('/p/northline/proposal/strategy');
  });
});

describe('recordTargetKey', () => {
  it('does not mix direction versions or stage versions when linking related records', () => {
    const visual = recordTargetKey({ kind: 'visual', stage: 'visual', directionId: 'B', version: 1 });
    expect(visual).not.toBe(recordTargetKey({ kind: 'visual', stage: 'visual', directionId: 'B', version: 2 }));
    expect(visual).not.toBe(recordTargetKey({ kind: 'visual', stage: 'visual', directionId: 'C', version: 1 }));
    expect(visual).not.toBe(recordTargetKey({ kind: 'stage', stage: 'visual', version: 1 }));
  });
});
