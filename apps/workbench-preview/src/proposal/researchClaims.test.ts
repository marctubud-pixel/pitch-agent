import { describe, expect, it } from 'vitest';
import { MockWorkbenchService } from '../services/mock/MockWorkbenchService';
import { memoryStore } from '../services/mock/storage';
import { resolveResearchClaim } from './researchClaims';

async function research() {
  const service = new MockWorkbenchService({ store: memoryStore(), latency: { read: 0, write: 0 }, autoTick: false });
  return service.getResearchWorkspace('luma');
}

describe('current research claim references', () => {
  it('resolves an exact ID before an earlier suffix shadow', async () => {
    const workspace = await research();
    const exact = workspace.claims[0];
    if (!workspace.artifact) throw new Error('Research fixture required');
    const shadow = { ...exact, id: `new-${exact.id}` };
    workspace.claims.unshift(shadow);
    workspace.artifact.claimIds.unshift(shadow.id);
    expect(resolveResearchClaim(workspace, exact.id)?.id).toBe(exact.id);
  });

  it('does not rebind a retired full ID to a suffixed replacement', async () => {
    const workspace = await research();
    const retired = workspace.claims[0].id;
    if (!workspace.artifact) throw new Error('Research fixture required');
    workspace.claims[0].id = `regenerated-${retired}`;
    workspace.artifact.claimIds = workspace.claims.map(claim => claim.id);
    expect(resolveResearchClaim(workspace, retired)).toBeNull();
  });

  it('keeps genuine cN legacy references within the current roster', async () => {
    const workspace = await research();
    expect(resolveResearchClaim(workspace, 'c1')?.id).toBe('art-luma-research-v1-c1');
    expect(resolveResearchClaim(workspace, 'research-v1-c1')).toBeNull();
    expect(resolveResearchClaim(workspace, null)).toBeNull();
  });

  it('rejects unrostered, foreign-artifact and foreign-project claims', async () => {
    const workspace = await research();
    const own = workspace.claims[0];
    if (!workspace.artifact) throw new Error('Research fixture required');
    workspace.artifact.claimIds = workspace.artifact.claimIds.filter(id => id !== own.id);
    expect(resolveResearchClaim(workspace, own.id)).toBeNull();
    const foreign = { ...own, id: 'foreign-c9', artifactId: 'foreign-artifact' };
    workspace.claims.unshift(foreign);
    workspace.artifact.claimIds.push(foreign.id);
    expect(resolveResearchClaim(workspace, 'c9')).toBeNull();
    workspace.artifact.projectId = 'foreign-project';
    expect(resolveResearchClaim(workspace, workspace.claims[1].id)).toBeNull();
  });

  it('rejects a missing, superseded or non-research artifact', async () => {
    const workspace = await research();
    if (!workspace.artifact) throw new Error('Research fixture required');
    expect(resolveResearchClaim({ ...workspace, artifact: null }, 'c1')).toBeNull();
    expect(resolveResearchClaim({ ...workspace, artifact: { ...workspace.artifact, isCurrent: false } }, 'c1')).toBeNull();
    expect(resolveResearchClaim({ ...workspace, artifact: { ...workspace.artifact, stage: 'strategy' } }, 'c1')).toBeNull();
  });
});
