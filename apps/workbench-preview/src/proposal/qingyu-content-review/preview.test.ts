import { afterEach, describe, expect, it, vi } from 'vitest';
import { qingyuProposal } from '../../services/cases/qingyuFixture';
import { MockWorkbenchService } from '../../services/mock/MockWorkbenchService';
import { memoryStore } from '../../services/mock/storage';
import { northline } from '../../services/proposal/fixtures/northline';
import { resolveQingyuContentReading, isQingyuContentReading } from './preview';

async function input() {
  const service = new MockWorkbenchService({ store: memoryStore(), latency: { read: 0, write: 0 }, autoTick: false });
  return { proposal: structuredClone(qingyuProposal), workspace: await service.getResearchWorkspace('qingyu'), history: await service.getBriefHistory('qingyu') };
}
afterEach(() => { vi.doUnmock('../qingyu-strategy/summary.ts?raw'); vi.doUnmock('../qingyu-themes/reviewed-copy.json?raw'); vi.doUnmock('../qingyu-visual/concept-images.ts?raw'); vi.resetModules(); });

describe('content reading is bound to the actual upstream versions', () => {
  it('returns actual open issues and leaves all business inputs unchanged', async () => {
    const data = await input();
    const original = JSON.stringify(data);
    const result = resolveQingyuContentReading(data);
    expect(result.kind).toBe('current');
    if (result.kind === 'unavailable') throw new Error(result.message);
    expect(result.reading.issues.map(issue => issue.id)).toEqual(['QY-CR-01', 'QY-CR-02', 'QY-CR-03']);
    expect(result.reading.issues.filter(issue => issue.kind === 'revision')).toHaveLength(1);
    expect(result.reading.images).toHaveLength(6);
    expect(result.reading.changes).toEqual([]);
    expect(JSON.stringify(data)).toBe(original);
    expect(data.proposal.contentReview).toBeNull();
    expect(data.proposal.stages.content_review.status).toBe('not_started');
  });

  it('keeps an old Brief reading historical instead of applying it to a new Brief', async () => {
    const data = await input();
    if (!data.history.current) throw new Error('fixture requires current brief');
    data.history.current = { ...data.history.current, version: 2 };
    const result = resolveQingyuContentReading(data);
    expect(result.kind).toBe('historical');
    if (result.kind !== 'historical') throw new Error('historical required');
    expect(result.briefVersion).toBe(1);
    expect(result.latestBriefVersion).toBe(2);
  });

  it('does not count a missing current Brief as a current review', async () => {
    const data = await input(); data.history.current = null;
    expect(resolveQingyuContentReading(data).kind).toBe('historical');
  });

  it('refuses a changed research head and an inconsistent snapshot', async () => {
    const data = await input();
    if (!data.workspace.artifact) throw new Error('fixture requires artifact');
    data.workspace.artifact = { ...data.workspace.artifact, id: 'different-head' };
    expect(resolveQingyuContentReading(data).kind).toBe('unavailable');
    const mismatched = await input(); mismatched.history.project.revision += 1;
    expect(resolveQingyuContentReading(mismatched).kind).toBe('unavailable');
  });

  it('refuses another project, formal content, and an already running formal review', async () => {
    const data = await input();
    for (const proposal of [northline, { ...data.proposal, id: 'other' }, { ...data.proposal, workbenchId: 'other' }, { ...data.proposal, contentReview: { checks: [], narrative: [] } }, { ...data.proposal, stages: { ...data.proposal.stages, content_review: { ...data.proposal.stages.content_review, status: 'in_progress' } } } satisfies typeof qingyuProposal]) {
      expect(isQingyuContentReading(proposal)).toBe(false);
      expect(resolveQingyuContentReading({ ...data, proposal }).kind).toBe('unavailable');
    }
  });

  it.each(['../qingyu-strategy/summary.ts?raw', '../qingyu-themes/reviewed-copy.json?raw', '../qingyu-visual/concept-images.ts?raw'])('refuses a same-identity source changed after the reading: %s', async path => {
    vi.doMock(path, () => ({ default: 'same identity, changed upstream words' }));
    const { resolveQingyuContentReading: changed } = await import('./preview');
    expect(changed(await input())).toEqual({ kind: 'unavailable', message: '策略、文案或视觉输入已改变，本轮审读不再对应当前稿。请先重新审读。' });
  });
});
