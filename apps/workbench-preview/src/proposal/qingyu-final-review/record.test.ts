import { describe, expect, it } from 'vitest';
import type { Deck } from '../deck-studio/model';
import { bindFinalReview, nativePageText, parseFinalReview, type FinalReviewRecord } from './record';
import { qingyuProposal } from '../../services/cases/qingyuFixture';
import { MockWorkbenchService } from '../../services/mock/MockWorkbenchService';
import { memoryStore } from '../../services/mock/storage';
import { resolveQingyuLayout } from '../qingyu-layout/preview';
async function result() {
  const service = new MockWorkbenchService({ store: memoryStore(), latency: { read: 0, write: 0 }, autoTick: false });
  const value = resolveQingyuLayout({ proposal: structuredClone(qingyuProposal), workspace: await service.getResearchWorkspace('qingyu'), history: await service.getBriefHistory('qingyu') });
  if (value.kind === 'unavailable') throw Error(value.message);
  return value;
}
const deck: Deck = { title: '测试夹具，非业务审查', fileName: 'fixture.pptx', status: 'fixture', style: 'fixture', pages: Array.from({ length: 23 }, (_, i) => ({ id: `fixture-${i}`, title: `fixture ${i}`, chapter: 'fixture', caption: '', notes: '', template: 'summary.list', bg: '#fff', nodes: [] })) };
async function digest(text: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), byte => byte.toString(16).padStart(2, '0')).join('');
}
async function fixture(source?: Awaited<ReturnType<typeof result>>): Promise<FinalReviewRecord> {
  const input = source ?? await result();
  const hash = await digest('fixture');
  const roles = ['content', 'visual', 'brand', 'user', 'communication'] satisfies FinalReviewRecord['roleSummaries'][number]['role'][];
  return { id: 'fixture-only', inputSha256: await digest('whole review input fixture'), layoutInputSha256: await digest(input.input.context), reviewedAt: 'fixture', scope: 'fixture only', executionStatus: 'completed', conclusion: 'cannot_assess', summary: 'fixture only', humanApproval: false, sourceHashes: { fixture: hash }, expectedPages: deck.pages.map(p => ({ id: p.id, title: p.title, text: nativePageText(p.nodes) })), roleSummaries: roles.map(role => ({ role, summary: 'fixture', primary: 'fixture', blind: 'fixture', challenge: 'fixture' })), findings: [], knownScope: [], unverified: ['fixture'], recordReferences: [], exportCheck: { summary: 'fixture', artifactSha256: '0'.repeat(64) } };
}
function identifiedDeck(source: Awaited<ReturnType<typeof result>>, record: FinalReviewRecord): Deck {
  return { ...deck, pages: deck.pages.map(page => ({ ...page, notes: '原始页备注\n页面适用范围：测试\n' + JSON.stringify({ inputIdentity: { sha256: record.layoutInputSha256, proposal: 'qingyu-pack', briefVersion: source.input.brief.version, currency: source.input.themes.kind } }) })) };
}
describe('readonly final-review binding', () => {
  it('keeps absence explicit and never manufactures approval', async () => {
    expect(parseFinalReview(null)).toBeNull();
    expect(await bindFinalReview({ result: await result(), deck, signal: new AbortController().signal, record: null })).toEqual({ kind: 'not_recorded' });
  });
  it('binds exact pages and source bytes, keeps history and does not mutate inputs', async () => {
    const source = await result(), record = await fixture(source), preparedDeck = identifiedDeck(source, record), before = JSON.stringify({ source, deck, record });
    const args = { result: source, deck: preparedDeck, record, sources: { fixture: 'fixture' }, signal: new AbortController().signal };
    expect((await bindFinalReview(args)).kind).toBe('current');
    expect((await bindFinalReview({ ...args, result: { ...source, kind: 'historical', latestBriefVersion: 2 } })).kind).toBe('historical');
    expect((await bindFinalReview({ ...args, sources: { fixture: 'changed' } })).kind).toBe('stale');
    expect((await bindFinalReview({ ...args, sources: {} })).kind).toBe('stale');
    const changed = structuredClone(preparedDeck); changed.pages[0].title += ' changed';
    expect((await bindFinalReview({ ...args, deck: changed })).kind).toBe('stale');
    expect(JSON.stringify({ source, deck, record })).toBe(before);
  });
  it('rejects changed dynamic context, layout hash and per-page note identities with unchanged pages and sources', async () => {
    const source = await result(), record = await fixture(source);
    const args = { result: source, deck: identifiedDeck(source, record), record, sources: { fixture: 'fixture' }, signal: new AbortController().signal };
    const changedContext = { ...source, input: { ...source.input, context: source.input.context + ' changed' } };
    expect((await bindFinalReview({ ...args, result: changedContext })).kind).toBe('stale');
    expect((await bindFinalReview({ ...args, result: { ...changedContext, kind: 'historical', latestBriefVersion: 2 } })).kind).toBe('stale');
    expect((await bindFinalReview({ ...args, record: { ...record, layoutInputSha256: '0'.repeat(64) } })).kind).toBe('stale');
    const changedNotes = structuredClone(args.deck);
    changedNotes.pages[22].notes = JSON.stringify({ inputIdentity: { sha256: '0'.repeat(64) } });
    expect((await bindFinalReview({ ...args, deck: changedNotes })).kind).toBe('stale');
    const historical = { ...changedContext, kind: 'historical', latestBriefVersion: 2 } satisfies Awaited<ReturnType<typeof result>>;
    const historicalRecord = await fixture(historical);
    expect((await bindFinalReview({ ...args, result: historical, record: historicalRecord, deck: identifiedDeck(historical, historicalRecord) })).kind).toBe('historical');
  });
  it('rejects invalid completeness and observes cancellation', async () => {
    const record = await fixture();
    expect(() => parseFinalReview({ ...record, expectedPages: record.expectedPages.slice(1) })).toThrow();
    expect(() => parseFinalReview({ ...record, roleSummaries: record.roleSummaries.slice(1) })).toThrow();
    expect(() => parseFinalReview({ ...record, humanApproval: true })).toThrow();
    expect(() => parseFinalReview({ ...record, layoutInputSha256: undefined })).toThrow();
    const controller = new AbortController(); controller.abort();
    await expect(bindFinalReview({ result: await result(), deck, record, sources: { fixture: 'fixture' }, signal: controller.signal })).rejects.toThrow();
  });
});
