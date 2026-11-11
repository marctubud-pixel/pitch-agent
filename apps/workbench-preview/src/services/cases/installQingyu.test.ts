import { describe, expect, it, vi } from 'vitest';
import { MockWorkbenchService } from '../mock/MockWorkbenchService';
import { MockProposalService } from '../proposal/MockProposalService';
import { memoryStore, type KeyValueStore } from '../mock/storage';
import { buildSeedDatabase } from '../mock/fixtures/seed';
import { qingyuAnchor, qingyuArtifact, qingyuBrief, qingyuProject, qingyuProposal } from './qingyuFixture';
import { caseStorageKeys, installQingyu, qingyuInstallMarker, readCaseStore } from './installQingyu';
import { markSharedStore } from '../mock/transactions';
import { luma } from '../proposal/fixtures/luma';

const setup = (store = memoryStore()) => {
  const workbench = new MockWorkbenchService({ store, latency: { read: 0, write: 0 }, autoTick: false });
  const proposals = new MockProposalService(workbench, store, { latency: 0 });
  return { store, workbench, proposals };
};
const installWorkbench = (store: KeyValueStore) => installQingyu({ store, kind: 'workbench', fallback: buildSeedDatabase });
const installProposal = (store: KeyValueStore) => installQingyu({ store, kind: 'proposal', fallback: () => ({ schema: 4, data: { [luma.id]: structuredClone(luma) } }) });
function seedExisting(store: KeyValueStore) {
  const db = buildSeedDatabase();
  db.commands['user-command'] = { name: 'saved-user-command', hash: 'user-hash', appliedAt: '2026-11-08', revision: 12, data: { unchanged: true } };
  db.projects.push({ ...structuredClone(db.projects[0]), id: 'user-project', name: '用户项目', revision: 9 });
  store.set(caseStorageKeys.workbench, JSON.stringify(db));
  const user = { ...structuredClone(luma), id: 'user-proposal', workbenchId: 'user-project', name: '用户提案', revision: 12 };
  const proposals = { schema: 4, data: { [luma.id]: structuredClone(luma), [user.id]: user }, userExtension: { saved: true } };
  store.set(caseStorageKeys.proposal, JSON.stringify(proposals));
  return { db, proposals };
}
function arrayValue(value: unknown): unknown[] { if (!Array.isArray(value)) throw new Error('Array required'); return value; }

describe('Qingyu incremental case installation', () => {
  it('appends to schema6/4 without changing old objects, receipts, app keys or extensions', async () => {
    const store = memoryStore(); const before = seedExisting(store);
    store.set('proposal-workbench/project', 'luma'); store.set('proposal-workbench/actor', 'guest');
    const { workbench, proposals } = setup(store);
    expect((await workbench.listProjects({})).items.some(p => p.id === 'qingyu')).toBe(true);
    expect(await proposals.findByWorkbenchId('qingyu')).toMatchObject({ id: qingyuAnchor.proposalId, workbenchId: 'qingyu' });
    const db = readCaseStore(store, 'workbench'); const ps = readCaseStore(store, 'proposal');
    if (!db || !ps) throw new Error('Stored databases required');
    for (const [key, value] of Object.entries(before.db)) {
      if (key === 'projects' || key === 'briefs' || key === 'artifacts') expect(arrayValue(db[key]).slice(0, -1)).toEqual(value);
      else if (key !== 'catalogRevision') expect(db[key]).toEqual(value);
    }
    expect(ps.data).toMatchObject(before.proposals.data); expect(ps.userExtension).toEqual({ saved: true });
    expect(db.caseInstallations).toEqual([qingyuInstallMarker]); expect(ps.caseInstallations).toEqual([qingyuInstallMarker]);
    expect(store.get('proposal-workbench/project')).toBe('luma'); expect(store.get('proposal-workbench/actor')).toBe('guest');
  });
  it('serializes concurrent initializers and leaves exactly one fixture in each library', async () => {
    const store = memoryStore(); seedExisting(store);
    await Promise.all([installWorkbench(store), installWorkbench(store), installProposal(store), installProposal(store)]);
    const before = [store.get(caseStorageKeys.workbench), store.get(caseStorageKeys.proposal)];
    await Promise.all([installWorkbench(store), installProposal(store)]);
    expect([store.get(caseStorageKeys.workbench), store.get(caseStorageKeys.proposal)]).toEqual(before);
    expect(arrayValue(readCaseStore(store, 'workbench')?.projects).filter(p => typeof p === 'object' && p !== null && 'id' in p && p.id === 'qingyu')).toHaveLength(1);
  });
  it('respects deletion after installation and does not repair altered subrecords', async () => {
    const store = memoryStore(); const original = seedExisting(store);
    await installWorkbench(store); await installProposal(store);
    const db = { ...original.db, caseInstallations: [qingyuInstallMarker] };
    const proposals = { ...original.proposals, caseInstallations: [qingyuInstallMarker] };
    store.set(caseStorageKeys.workbench, JSON.stringify(db)); store.set(caseStorageKeys.proposal, JSON.stringify(proposals));
    const { workbench, proposals: svc } = setup(store);
    expect((await workbench.listProjects({})).items.some(p => p.id === 'qingyu')).toBe(false);
    expect(await svc.findByWorkbenchId('qingyu')).toBeNull();
    expect(store.get(caseStorageKeys.workbench)).toBe(JSON.stringify(db));
    expect(store.get(caseStorageKeys.proposal)).toBe(JSON.stringify(proposals));
  });
  it.each(['project', 'brief', 'artifact', 'lineage', 'proposal', 'foreign-proposal-link'])('preserves both libraries when %s is occupied', async collision => {
    const store = memoryStore(); const { db, proposals } = seedExisting(store);
    if (collision === 'project') db.projects.push({ ...qingyuProject, name: '用户青屿' });
    if (collision === 'brief') db.briefs.push(structuredClone(qingyuBrief));
    if (collision === 'artifact') db.artifacts.push(structuredClone(qingyuArtifact));
    if (collision === 'lineage') db.artifacts.push({ ...qingyuArtifact, id: 'foreign-artifact', projectId: 'user-project' });
    if (collision === 'proposal' || collision === 'foreign-proposal-link') Object.assign(proposals.data, { collision: { ...qingyuProposal, id: collision === 'proposal' ? 'qingyu-pack' : 'other-qingyu' } });
    store.set(caseStorageKeys.workbench, JSON.stringify(db)); store.set(caseStorageKeys.proposal, JSON.stringify(proposals));
    const before = [store.get(caseStorageKeys.workbench), store.get(caseStorageKeys.proposal)];
    await expect(installWorkbench(store)).rejects.toMatchObject({ kind: 'conflict' });
    await expect(installProposal(store)).rejects.toMatchObject({ kind: 'conflict' });
    expect([store.get(caseStorageKeys.workbench), store.get(caseStorageKeys.proposal)]).toEqual(before);
  });
  it('leaves the normal libraries untouched in the empty scenario', async () => {
    const { store, workbench, proposals } = setup(); workbench.setScenario('empty');
    expect((await workbench.listProjects({})).items).toEqual([]); expect(await proposals.listProposals()).toEqual([]);
    expect(store.get(caseStorageKeys.workbench)).toBeNull(); expect(store.get(caseStorageKeys.proposal)).toBeNull();
  });
  it('recovers a failed second key independently without rewriting the successful first key', async () => {
    const backing = memoryStore(); const original = seedExisting(backing); let fail = true;
    const store: KeyValueStore = { get: k => backing.get(k), remove: k => backing.remove(k), set: (k, v) => { if (k === caseStorageKeys.proposal && fail) throw new Error('Quota'); backing.set(k, v); } };
    await installWorkbench(store); const firstKey = store.get(caseStorageKeys.workbench);
    await expect(installProposal(store)).rejects.toMatchObject({ kind: 'unavailable' });
    expect(store.get(caseStorageKeys.proposal)).toBe(JSON.stringify(original.proposals));
    fail = false; await installProposal(store);
    expect(store.get(caseStorageKeys.workbench)).toBe(firstKey); expect(readCaseStore(store, 'proposal')?.caseInstallations).toEqual([qingyuInstallMarker]);
  });
  it.each(['malformed', 'unsupported', 'missing-fields'])('never persists a fallback over %s data', async kind => {
    const store = memoryStore(); seedExisting(store);
    const broken = kind === 'malformed' ? '{broken' : JSON.stringify({ schemaVersion: kind === 'unsupported' ? 99 : 6 });
    store.set(caseStorageKeys.workbench, broken); const { workbench, proposals } = setup(store);
    await expect(workbench.listProjects({})).rejects.toMatchObject({ kind: 'unavailable' });
    await expect(proposals.listProposals()).rejects.toMatchObject({ kind: 'unavailable' });
    expect(store.get(caseStorageKeys.workbench)).toBe(broken);
  });
  it('does not write without Web Locks, while existing normal records remain readable', async () => {
    vi.stubGlobal('navigator', {});
    try {
      const store = memoryStore(); seedExisting(store); markSharedStore(store, true);
      const before = [store.get(caseStorageKeys.workbench), store.get(caseStorageKeys.proposal)];
      const workbench = new MockWorkbenchService({ store, persistence: 'local', latency: { read: 0, write: 0 }, autoTick: false });
      const proposals = new MockProposalService(workbench, store, { latency: 0 });
      expect((await workbench.listProjects({})).items.some(p => p.id === 'user-project')).toBe(true);
      expect((await proposals.listProposals()).some(p => p.id === 'user-proposal')).toBe(true);
      await expect(installWorkbench(store)).rejects.toMatchObject({ kind: 'unavailable' });
      expect([store.get(caseStorageKeys.workbench), store.get(caseStorageKeys.proposal)]).toEqual(before);
      expect(workbench.getDemoState().storageWarning).toContain('未安全安装');
    } finally { vi.unstubAllGlobals(); }
  });
  it('keeps existing project reads available when a case identity is occupied', async () => {
    const store = memoryStore(); const { db, proposals } = seedExisting(store);
    db.projects.push({ ...qingyuProject, name: '用户已有记录' });
    store.set(caseStorageKeys.workbench, JSON.stringify(db)); store.set(caseStorageKeys.proposal, JSON.stringify(proposals));
    const before = [store.get(caseStorageKeys.workbench), store.get(caseStorageKeys.proposal)];
    const services = setup(store);
    expect((await services.workbench.listProjects({})).items.some(p => p.id === 'user-project')).toBe(true);
    expect((await services.proposals.listProposals()).some(p => p.id === 'user-proposal')).toBe(true);
    expect(services.workbench.getDemoState().storageWarning).toContain('占用');
    expect([store.get(caseStorageKeys.workbench), store.get(caseStorageKeys.proposal)]).toEqual(before);
  });
  it('preserves wrapper metadata and both installed markers through normal service writes', async () => {
    const store = memoryStore(); seedExisting(store); const { workbench, proposals } = setup(store);
    const current = await proposals.findByWorkbenchId('luma'); if (!current) throw new Error('Luma required');
    await proposals.setMode(current.id, 'assisted', [], { expectedRevision: current.revision });
    expect(readCaseStore(store, 'proposal')?.userExtension).toEqual({ saved: true });
    expect(readCaseStore(store, 'proposal')?.caseInstallations).toEqual([qingyuInstallMarker]);
    const catalog = await workbench.listProjects({});
    await workbench.createProject({ name: '用户新增项目', client: '', summary: '', mode: 'supervised', researchOwner: '', strategyOwner: '' }, { commandId: 'preserve-marker', expectedRevision: catalog.catalogRevision });
    expect(readCaseStore(store, 'workbench')?.caseInstallations).toEqual([qingyuInstallMarker]);
  });
  it('can read an installed first library when the other library subsequently becomes damaged', async () => {
    const store = memoryStore(); seedExisting(store); await installWorkbench(store);
    store.set(caseStorageKeys.proposal, '{broken');
    const { workbench } = setup(store);
    expect((await workbench.getResearchWorkspace('qingyu')).artifact?.id).toBe(qingyuAnchor.artifactId);
  });
  it('keeps research ineligible and rejects attempts to release or continue it', async () => {
    const { workbench, proposals } = setup(); const overview = await workbench.getProjectOverview('qingyu');
    expect(overview.eligibility.eligible).toBe(false); expect(overview.project.continuedToStrategyAt).toBeNull();
    const ws = await workbench.getResearchWorkspace('qingyu');
    expect(ws.artifact?.coverage.map(c => c.minSupportedClaims)).toEqual([1, 1]);
    await expect(workbench.releaseResearch('qingyu', { commandId: 'release-qingyu', expectedRevision: 1 })).rejects.toThrow();
    await expect(workbench.continueToStrategy('qingyu', { commandId: 'continue-qingyu', expectedRevision: 1 })).rejects.toThrow();
    const proposal = await proposals.findByWorkbenchId('qingyu');
    expect(proposal?.stages.strategy.status).toBe('not_started'); expect(proposal?.tasks).toEqual([]); expect(proposal?.reviews).toEqual([]); expect(proposal?.handoffs).toEqual([]);
  });
});
