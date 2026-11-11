import { readProvenance as bytes } from '../../test-support/provenance';
import { createHash } from 'node:crypto';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import reviewedCopy from './reviewed-copy.json';
import reviewedCopyRaw from './reviewed-copy.json?raw';
import { parseCopyBundle, readingMean, type SourceRef } from './content';
import { strategySummaryIdentity } from '../qingyu-strategy/summary';
import strategyDraft from '../qingyu-strategy/draft-r3.json';
import { QingyuThemesResultView } from './QingyuThemesPreview';
import { resolveQingyuThemesPreview } from './preview';
import { qingyuProposal } from '../../services/cases/qingyuFixture';
import { MockWorkbenchService } from '../../services/mock/MockWorkbenchService';
import { memoryStore } from '../../services/mock/storage';

function original(ref: SourceRef): unknown { return JSON.parse(bytes(ref.path).toString('utf8')); }
function bundle() {
  const parsed = parseCopyBundle(reviewedCopy, { strategyDraftId: strategySummaryIdentity.draftId, researchSha256: strategyDraft.ledger.basis.researchSha256 });
  if (parsed.kind === 'invalid') throw new Error(parsed.message);
  return parsed.bundle;
}

describe('actual sealed copy bundle and original-file associations', () => {
  it('ships exactly the independently sealed bundle bytes and binds all 95 actual sources', () => {
    expect(createHash('sha256').update(reviewedCopyRaw).digest('hex')).toBe('0b0f66606986f6b934edefdddabf4495aaa6eaa14abc8fcf3431f88343fe8256');
    expect(reviewedCopyRaw).toBe(bytes('.scratch/qingyu-copy-full-20261110/presentation/bundle.json').toString('utf8'));
    const sealed = bundle();
    expect(sealed.identity.sourceRecords).toHaveLength(95);
    for (const ref of sealed.identity.sourceRecords) expect(createHash('sha256').update(bytes(ref.path)).digest('hex'), ref.path).toBe(ref.sha256);
    for (const round of sealed.rounds) {
      expect(round.draft).toEqual(original(round.draftSource));
      expect(round.response).toEqual(original(round.responseSource));
      expect(round.reviews.map(item => item.role)).toEqual(['copy', 'brand', 'user', 'comms']);
      for (const review of round.reviews) {
        expect(review.raw).toEqual(original(review.source));
        for (const followUp of review.followUps) expect(followUp.raw).toEqual(original(followUp.source));
      }
      for (const critic of round.critics) { expect(critic.raw).toEqual(original(critic.source)); expect(critic.firstRead).toEqual(original(critic.firstReadSource)); }
    }
    expect(sealed.recommendation.rawDirector).toEqual(original(sealed.recommendation.source));
    expect(sealed.recommendation.directionId).toBe('n7');
  });
  it('keeps R2 original user 3 and revise with its actual same-role 4 clarification, without synthesizing a new draft', () => {
    const sealed = bundle(), user = sealed.currentRound.reviews.find(item => item.role === 'user');
    if (!user) throw new Error('Actual user review missing');
    const item = user.items.find(item => item.id === 'k4');
    if (!item) throw new Error('Actual k4 review missing');
    expect(item.scores.find(item => item.dimension === '利益或情绪的具体可理解性')).toMatchObject({ status: 'scored', score: 3 });
    expect(item.decision).toBe('revise');
    expect(user.followUps).toHaveLength(1);
    expect(user.followUps[0].presentation).toMatchObject({ directionId: 'k4', dimensionId: 'benefit_emotion', original: { score: 3, decision: 'revise', blocking: true }, current: { status: 'scored', score: 4, blocking: false, decision: 'pass_within_user_role' } });
    expect(user.followUps[0].raw.original).toMatchObject({ score: 3, decision: 'revise' });
    expect(user.followUps[0].raw.current_independent_judgment).toMatchObject({ score: 4, blocking: false, decision: 'pass_within_user_role' });
    expect(readingMean(item.scores, 'direction', sealed.scale)).toBe('原评展示均分 3.50 / 5（已评分 2/2）');
    expect(sealed.rounds.map(item => item.id)).toEqual(['r1', 'r2']);
    for (const round of sealed.rounds) for (const review of round.reviews) if (round.id !== 'r2' || review.role !== 'user') expect(review.followUps).toEqual([]);
  });
  it('renders the actual three directions, explicit director recommendation, four roles and closed R1/R2 history', async () => {
    const service = new MockWorkbenchService({ store: memoryStore(), latency: { read: 0, write: 0 }, autoTick: false });
    const result = resolveQingyuThemesPreview({ proposal: qingyuProposal, workspace: await service.getResearchWorkspace('qingyu'), history: await service.getBriefHistory('qingyu') });
    if (result.kind === 'unavailable') throw new Error(result.message);
    const html = renderToStaticMarkup(createElement(QingyuThemesResultView, { result, retry: () => {} }));
    expect((html.match(/data-copy-direction=/g) ?? [])).toHaveLength(3);
    for (const direction of result.preview.bundle.currentRound.directions) for (const text of [direction.name, direction.slogan, direction.subline]) expect(html).toContain(text);
    expect(html).toContain('data-director-recommendation="n7"');
    expect(html).toContain('原分 3 → 原岗复核 4');
    expect(html).toContain('原评展示均分 3.50');
    expect(html).toContain('不是总控调分');
    for (const label of ['修改前', '修改后', '提出角色', '前轮处置', '修改对应', '回应原版', '互换核验']) expect(html).toContain(`<dt>${label}</dt>`);
    for (const label of ['采纳并立即处理', '采纳，延后处理', '已在稿件中回应', '第一轮文案原稿']) expect(html).toContain(label);
    expect(html).toContain('r1 · 历史稿'); expect(html).toContain('r2 · 当前稿');
    for (const role of ['copy', 'brand', 'user', 'comms']) expect(html).toContain(`data-review-role="${role}"`);
    for (const section of ['derivation', 'reviews', 'history']) expect(html).toContain(`<details class="qs-evidence" data-copy-section="${section}">`);
    expect(html).not.toMatch(/<details[^>]* open/);
  });
  it('refuses an actual critic retargeted to another round and a follow-up bound to another model', () => {
    const criticMismatch = structuredClone(reviewedCopy);
    criticMismatch.rounds[1].critics[0].raw.packet_version = 'r1';
    expect(parseCopyBundle(criticMismatch, { strategyDraftId: strategySummaryIdentity.draftId, researchSha256: strategyDraft.ledger.basis.researchSha256 }).kind).toBe('invalid');
    const followMismatch = structuredClone(reviewedCopy);
    const user = followMismatch.rounds[1].reviews.find(item => item.role === 'user');
    if (!user || !('followUps' in user) || !user.followUps?.[0]) throw new Error('Actual follow-up missing');
    user.followUps[0].raw.model_id = 'foreign-model';
    expect(parseCopyBundle(followMismatch, { strategyDraftId: strategySummaryIdentity.draftId, researchSha256: strategyDraft.ledger.basis.researchSha256 }).kind).toBe('invalid');
  });
  it.each(['missing-challenge', 'original-score', 'reviewed-score-range', 'original-dimension', 'challenge-direction', 'challenge-dimension', 'original-decision', 'original-issue', 'original-blocking', 'reviewed-status', 'pass-blocking', 'pass-score'])('refuses actual follow-up semantic mismatch %s at the parse boundary', mutation => {
    const value = structuredClone(reviewedCopy), round = value.rounds[1];
    const user = round.reviews.find(item => item.role === 'user');
    const critic = round.critics.find(item => item.role === 'user');
    if (!user || !('followUps' in user) || !user.followUps?.[0] || !critic) throw new Error('Actual user follow-up pair missing');
    const raw = user.followUps[0].raw;
    if (mutation === 'missing-challenge') raw.challenge_id = 'unknown-test-challenge';
    if (mutation === 'original-score') raw.original.score = 2;
    if (mutation === 'reviewed-score-range') raw.current_independent_judgment.score = 99;
    if (mutation === 'original-dimension') raw.original.dimension_id = 'unknown-dimension';
    if (mutation === 'challenge-direction') { const challenge = critic.raw.challenges[0]; if (!('candidate_id' in challenge)) throw new Error('Actual candidate reference missing'); challenge.candidate_id = 'n7'; }
    if (mutation === 'challenge-dimension') { const challenge = critic.raw.challenges[0]; if (!('target_dimension_id' in challenge)) throw new Error('Actual dimension reference missing'); challenge.target_dimension_id = 'selection_context'; }
    if (mutation === 'original-decision') raw.original.decision = 'pass';
    if (mutation === 'original-issue') raw.original.issue_id = 'unknown-issue';
    if (mutation === 'original-blocking') raw.original.blocking = false;
    if (mutation === 'reviewed-status') raw.current_independent_judgment.status = 'unknown';
    if (mutation === 'pass-blocking') raw.current_independent_judgment.blocking = true;
    if (mutation === 'pass-score') raw.current_independent_judgment.score = 3;
    expect(parseCopyBundle(value, { strategyDraftId: strategySummaryIdentity.draftId, researchSha256: strategyDraft.ledger.basis.researchSha256 }).kind).toBe('invalid');
  });

  it.each([
    { originalStatus: 'not_applicable', currentStatus: 'scored', originalLabel: '不适用', currentLabel: '4' },
    { originalStatus: 'unknown', currentStatus: 'scored', originalLabel: '待核', currentLabel: '4' },
    { originalStatus: 'scored', currentStatus: 'unknown', originalLabel: '3', currentLabel: '待核' },
    { originalStatus: 'scored', currentStatus: 'not_applicable', originalLabel: '3', currentLabel: '不适用' },
  ])('renders original $originalStatus and reviewed $currentStatus from their distinct Rating statuses', async ({ originalStatus, currentStatus, originalLabel, currentLabel }) => {
    const value = structuredClone(reviewedCopy), round = value.rounds[1];
    const user = round.reviews.find(item => item.role === 'user'), critic = round.critics.find(item => item.role === 'user');
    if (!user || !('followUps' in user) || !user.followUps?.[0] || !critic) throw new Error('Actual follow-up pair missing');
    const raw = user.followUps[0].raw, originalScore = originalStatus === 'scored' ? 3 : null;
    const current = { ...raw.current_independent_judgment, status: currentStatus, score: currentStatus === 'scored' ? 4 : null, blocking: currentStatus !== 'scored', decision: currentStatus === 'scored' ? 'pass_within_user_role' : 'hold', issue_status: currentStatus === 'scored' ? 'withdraw_blocker' : 'pending' };
    const updatedUser = { ...user, raw: { ...user.raw, items: user.raw.items.map(item => item.id === 'k4' ? { ...item, scores: item.scores.map(score => score.dimension_id === 'benefit_emotion' ? { ...score, status: originalStatus, score: originalScore } : score) } : item) }, followUps: [{ ...user.followUps[0], raw: { ...raw, original: { ...raw.original, score: originalScore }, current_independent_judgment: current } }] };
    const updatedCritic = { ...critic, raw: { ...critic.raw, challenges: critic.raw.challenges.map(challenge => challenge.id === raw.challenge_id ? { ...challenge, target_score: originalScore } : challenge) } };
    const updated = { ...value, rounds: value.rounds.map(item => item.id === 'r2' ? { ...item, reviews: item.reviews.map(review => review.role === 'user' ? updatedUser : review), critics: item.critics.map(record => record.role === 'user' ? updatedCritic : record) } : item) };
    const parsed = parseCopyBundle(updated, { strategyDraftId: strategySummaryIdentity.draftId, researchSha256: strategyDraft.ledger.basis.researchSha256 });
    if (parsed.kind === 'invalid') throw new Error(parsed.message);
    const service = new MockWorkbenchService({ store: memoryStore(), latency: { read: 0, write: 0 }, autoTick: false });
    const result = resolveQingyuThemesPreview({ proposal: qingyuProposal, workspace: await service.getResearchWorkspace('qingyu'), history: await service.getBriefHistory('qingyu') });
    if (result.kind === 'unavailable') throw new Error(result.message);
    const html = renderToStaticMarkup(createElement(QingyuThemesResultView, { result: { ...result, preview: { ...result.preview, bundle: parsed.bundle } }, retry: () => {} }));
    expect(html).toContain(`原分 ${originalLabel} → 原岗复核 ${currentLabel}`);
    if (originalStatus !== 'scored') expect(html).toContain(`data-score-status="${originalStatus}">${originalLabel} · 必评项`);
    if (currentStatus !== 'scored') {
      current.decision = 'pass_within_user_role';
      expect(parseCopyBundle(updated, { strategyDraftId: strategySummaryIdentity.draftId, researchSha256: strategyDraft.ledger.basis.researchSha256 }).kind).toBe('invalid');
    }
  });

});
