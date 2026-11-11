import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { parseCopyBundle, readingMean, type ReviewRole } from './content';
import { QingyuThemesResultView } from './QingyuThemesPreview';
import { resolveQingyuStrategyPreview } from '../qingyu-strategy/preview';
import { qingyuProposal } from '../../services/cases/qingyuFixture';
import { MockWorkbenchService } from '../../services/mock/MockWorkbenchService';
import { memoryStore } from '../../services/mock/storage';

const expected = { strategyDraftId: 'synthetic-strategy', researchSha256: 'a'.repeat(64) };
function fixture() {
  const roles: ReviewRole[] = ['copy', 'brand', 'user', 'comms'];
  const ref = { path: 'synthetic-only/draft.json', sha256: 'b'.repeat(64) };
  const responseSource = { path: 'synthetic-only/response.json', sha256: 'c'.repeat(64) };
  const scaleSource = { path: 'synthetic-only/protocol.md', sha256: 'd'.repeat(64) };
  const reports = roles.map((role, index) => ({ role, score: { path: `synthetic-only/${role}/score.json`, sha256: `${index}1`.repeat(32) }, critic: { path: `synthetic-only/${role}/critic.json`, sha256: `${index}2`.repeat(32) }, first: { path: `synthetic-only/${role}/first.json`, sha256: `${index}3`.repeat(32) } }));
  const directions = ['d1', 'd2', 'd3'].map(id => ({ id, name: `合成测试方向${id}`, slogan: `合成主文${id}`, subline: `合成副文${id}`, mechanism: `合成机制${id}` }));
  const scores = (id: string) => [
    { group: 'direction', dimension_id: 'direction_one', dimension: '方向一项', required: true, status: id === 'd1' ? 'unknown' : 'scored', score: id === 'd1' ? null : 5, evidence: { quotes: ['具体引用'], reason: '范围待核' } },
    { group: 'direction', dimension_id: 'direction_two', dimension: '方向二项', required: true, status: 'scored', score: 4, evidence: ['依据甲', '依据乙'] },
    { group: 'copy', dimension_id: 'copy_one', dimension: '文案一项', required: true, status: 'scored', score: id === 'd1' ? 3 : 5, evidence: '表达证据' },
    { group: 'copy', dimension_id: 'copy_two', dimension: '文案二项', required: true, status: 'scored', score: 4, evidence: '协作证据' },
  ];
  return {
    schemaVersion: 1, id: 'SYNTHETIC-TEST-ONLY', basedOnStrategyDraftId: expected.strategyDraftId, researchSha256: expected.researchSha256, scale: { min: 1, max: 5, source: scaleSource, raw: '合成测试量表说明，1至5分' }, currentRoundId: 'r1',
    rounds: [{ id: 'r1', draftSource: ref, responseSource, draft: { draftId: 'synthetic-r1-draft', basedOnStrategyDraftId: expected.strategyDraftId, directions, setDifference: '三种不同机制' },
      reviews: reports.map(({ role, score: source }) => ({ role, model: 'synthetic-test-model', source, raw: { schema_version: 2, role, model_id: 'synthetic-test-model', packet_version: 'r1', items: directions.map(direction => ({ id: direction.id, scores: scores(direction.id), decision: 'revise', hard_rejects: [], issues: [{ id: `${role}-issue`, evidence: '仍有异议', blocking: true }] })), pairwise: ['不可互换'], set_decision: 'revise' } })),
      critics: reports.map(({ role, score, critic, first }) => ({ role, source: critic, firstReadSource: first, firstRead: { note: '独立首读保留' }, raw: { role, packet_version: 'r1', candidate_version: 'synthetic-r1-draft', draft_sha256: ref.sha256, paired_score_path: score.path, paired_score_hash: score.sha256, first_read_path: first.path, first_read_sha256: first.sha256, issues: ['配对异议'], unresolved: ['未决保留'] } })), response: { accepted: ['修改甲'], rejected: ['保留异议乙'], unresolved: ['待核丙'] },
    }],
    recommendation: { directionId: 'd1', reasons: ['独立总监理由'], tradeoffs: ['仍有待核'], scope: '合成测试范围', source: ref, rawDirector: { reason: '没有按均分排序' } },
    identity: { scope: '合成测试，绝不作为真实交付', sourceRecords: [ref, responseSource, scaleSource, ...reports.flatMap(item => [item.score, item.critic, item.first])] },
  };
}
function followUpFixture() {
  const value = fixture(), followSource = { path: 'synthetic-only/user/clarification.json', sha256: 'e'.repeat(64) };
  const raw = { schema_version: 2, role: 'user', model_id: 'synthetic-test-model', packet_version: 'r1', draft_sha256: value.rounds[0].draftSource.sha256, challenge_id: 'synthetic-challenge', response: 'accept', original: { dimension_id: 'benefit_emotion', score: 3, issue_id: 'user-issue', blocking: true, decision: 'revise' }, current_independent_judgment: { score: 4, status: 'scored', issue_status: 'withdraw_blocker', blocking: false, decision: 'pass_within_user_role', reason: '原岗独立复核理由' }, limits: ['仅为文字可理解性'], custom_english_key: 'custom_enum' };
  return { ...value, rounds: [{ ...value.rounds[0], reviews: value.rounds[0].reviews.map(review => ({ ...review, raw: { ...review.raw, items: review.raw.items.map(item => review.role === 'user' && item.id === 'd1' ? { ...item, scores: item.scores.map((score, index) => index === 0 ? { ...score, status: 'scored', score: 4 } : index === 2 ? { ...score, dimension_id: 'benefit_emotion' } : score) } : item) }, followUps: review.role === 'user' ? [{ source: followSource, raw }] : [] })), critics: value.rounds[0].critics.map(critic => ({ ...critic, raw: { ...critic.raw, challenges: critic.role === 'user' ? [{ id: 'synthetic-challenge', candidate_id: 'd1', target_dimension_id: 'benefit_emotion', target_issue_id: 'user-issue', target_score: 3 }] : [] } })) }], identity: { ...value.identity, sourceRecords: [...value.identity.sourceRecords, followSource] } };
}
function ready(value = fixture()) { const result = parseCopyBundle(value, expected); if (result.kind !== 'ready') throw new Error(result.message); return result.bundle; }

describe('sealed copy boundary and readonly rendering, synthetic fixtures only', () => {
  it('requires four independent roles and exactly two required scores per group', () => {
    expect(ready().currentRound.reviews.map(item => item.role)).toEqual(['copy', 'brand', 'user', 'comms']);
    const missingRole = fixture(); missingRole.rounds[0].reviews.pop(); expect(parseCopyBundle(missingRole, expected).kind).toBe('invalid');
    const missingDimension = fixture(); missingDimension.rounds[0].reviews[0].raw.items[0].scores.pop(); expect(parseCopyBundle(missingDimension, expected).kind).toBe('invalid');
    const missingCritic = fixture(); missingCritic.rounds[0].critics.pop(); expect(parseCopyBundle(missingCritic, expected).kind).toBe('invalid');
  });
  it('keeps unknown out of the denominator and never turns it into zero', () => {
    const item = ready().currentRound.reviews[0].items[0];
    expect(readingMean(item.scores, 'direction', ready().scale)).toBe('原评展示均分 4.00 / 5（已评分 1/2；待核 1）');
    const scores = item.scores.map(item => ({ ...item, status: 'unknown', score: null } satisfies typeof item));
    expect(readingMean(scores, 'direction', ready().scale)).toBe('原评展示均分 待核（已评分 0/2；待核 2）');
  });
  it('shows not applicable explicitly without manufacturing a passing score', () => {
    const value = fixture();
    const score = value.rounds[0].reviews[0].raw.items[0].scores[0];
    score.status = 'not_applicable';
    const bundle = ready(value);
    expect(readingMean(bundle.currentRound.reviews[0].items[0].scores, 'direction', bundle.scale)).toBe('原评展示均分 4.00 / 5（已评分 1/2；不适用 1）');
    expect(bundle.currentRound.reviews[0].items[0].decision).toBe('revise');
  });
  it.each(['pending', 'version', 'strategy', 'research', 'source', 'source-hash', 'report-version', 'role', 'score', 'target', 'decision'])('refuses %s without presumed passing data', mutation => {
    const value = fixture();
    if (mutation === 'pending') { expect(parseCopyBundle({ pending: true }, expected).kind).toBe('invalid'); return; }
    if (mutation === 'version') value.schemaVersion = 2;
    if (mutation === 'strategy') value.basedOnStrategyDraftId = 'foreign';
    if (mutation === 'research') value.researchSha256 = 'c'.repeat(64);
    if (mutation === 'source') value.identity.sourceRecords = [];
    if (mutation === 'source-hash') value.rounds[0].reviews[0].source = { path: value.identity.sourceRecords[0].path, sha256: 'c'.repeat(64) };
    if (mutation === 'report-version') value.rounds[0].reviews[0].raw.packet_version = 'r0';
    if (mutation === 'role') value.rounds[0].reviews[0].raw.role = 'brand';
    if (mutation === 'score') value.rounds[0].reviews[0].raw.items[0].scores[0].score = 0;
    if (mutation === 'target') value.recommendation.directionId = 'missing';
    if (mutation === 'decision') value.rounds[0].reviews[0].raw.items[0].decision = '';
    expect(parseCopyBundle(value, expected).kind).toBe('invalid');
  });
  it('shows only original scores when no compatible source-backed scale is supplied', () => {
    expect(readingMean(ready().currentRound.reviews[0].items[0].scores, 'direction', null)).toContain('量表兼容性尚未核实');
    expect(parseCopyBundle({ ...fixture(), scale: undefined }, expected).kind).toBe('ready');
    expect(parseCopyBundle({ ...fixture(), scale: { ...fixture().scale, max: 10 } }, expected).kind).toBe('invalid');
  });
  it.each(['critic-round', 'critic-draft', 'critic-score-hash', 'critic-first-hash', 'critic-score-path', 'critic-first-path', 'response-source', 'response-empty', 'first-source'])('refuses %s with original cross-record metadata', mutation => {
    const value = fixture(), critic = value.rounds[0].critics[0];
    if (mutation === 'critic-round') critic.raw.packet_version = 'r0';
    if (mutation === 'critic-draft') critic.raw.draft_sha256 = 'f'.repeat(64);
    if (mutation === 'critic-score-hash') critic.raw.paired_score_hash = 'f'.repeat(64);
    if (mutation === 'critic-first-hash') critic.raw.first_read_sha256 = 'f'.repeat(64);
    if (mutation === 'critic-score-path') critic.raw.paired_score_path = 'synthetic-only/brand/score.json';
    if (mutation === 'critic-first-path') critic.raw.first_read_path = 'synthetic-only/brand/first.json';
    if (mutation === 'response-source') value.rounds[0].responseSource = { path: 'missing-response.json', sha256: 'f'.repeat(64) };
    if (mutation === 'first-source') critic.firstReadSource = { path: 'missing-first.json', sha256: 'f'.repeat(64) };
    if (mutation === 'response-empty') { expect(parseCopyBundle({ ...value, rounds: [{ ...value.rounds[0], response: null }] }, expected).kind).toBe('invalid'); return; }
    expect(parseCopyBundle(value, expected).kind).toBe('invalid');
  });
  it('validates both original hash aliases without inventing fields that are absent', () => {
    const value = fixture(), raw = value.rounds[0].critics[0].raw;
    const { paired_score_hash, first_read_sha256, ...other } = raw;
    const transformed = { ...value, rounds: [{ ...value.rounds[0], critics: [{ ...value.rounds[0].critics[0], raw: { ...other, paired_score_sha256: paired_score_hash, first_read_hash: first_read_sha256 } }, ...value.rounds[0].critics.slice(1)] }] };
    expect(parseCopyBundle(transformed, expected).kind).toBe('ready');
    transformed.rounds[0].critics[0].raw = { ...other, paired_score_sha256: 'f'.repeat(64), first_read_hash: first_read_sha256 };
    expect(parseCopyBundle(transformed, expected).kind).toBe('invalid');
  });
  it('rejects mismatched present input hashes and does not invent absent critic metadata', () => {
    const value = fixture(), critic = value.rounds[0].critics[0];
    const wrongInputs = { ...critic, raw: { ...critic.raw, input_hashes: { [critic.firstReadSource.path]: 'f'.repeat(64) } } };
    expect(parseCopyBundle({ ...value, rounds: [{ ...value.rounds[0], critics: [wrongInputs, ...value.rounds[0].critics.slice(1)] }] }, expected).kind).toBe('invalid');
    const { packet_version: _packet, candidate_version: _candidate, ...withoutVersion } = critic.raw;
    expect(parseCopyBundle({ ...value, rounds: [{ ...value.rounds[0], critics: [{ ...critic, raw: withoutVersion }, ...value.rounds[0].critics.slice(1)] }] }, expected).kind).toBe('ready');
  });
  it.each(['role', 'model', 'packet', 'draft', 'source'])('rejects mismatched follow-up %s while preserving original review', mutation => {
    const value = followUpFixture(), followUp = value.rounds[0].reviews[2].followUps[0];
    if (mutation === 'role') followUp.raw.role = 'brand';
    if (mutation === 'model') followUp.raw.model_id = 'foreign-model';
    if (mutation === 'packet') followUp.raw.packet_version = 'r0';
    if (mutation === 'draft') followUp.raw.draft_sha256 = 'f'.repeat(64);
    if (mutation === 'source') followUp.source = { ...followUp.source, sha256: 'f'.repeat(64) };
    expect(parseCopyBundle(value, expected).kind).toBe('invalid');
  });
  it('retains the original 3 and revise plus a separate same-role clarification 4 without applying approval', async () => {
    const value = followUpFixture(), before = JSON.stringify(value), parsed = parseCopyBundle(value, expected);
    if (parsed.kind === 'invalid') throw new Error(parsed.message);
    const review = parsed.bundle.currentRound.reviews[2];
    expect(review.items[0].scores[2].score).toBe(3);
    expect(review.items[0].decision).toBe('revise');
    expect(readingMean(review.items[0].scores, 'copy', parsed.bundle.scale)).toContain('原评展示均分 3.50');
    expect(review.followUps[0].raw.current_independent_judgment).toMatchObject({ score: 4, decision: 'pass_within_user_role' });
    expect(parsed.bundle.currentRound.reviews[0].followUps).toEqual([]);
    expect(parsed.bundle.currentRound.id).toBe('r1'); expect(parsed.bundle.rounds).toHaveLength(1);
    expect(JSON.stringify(value)).toBe(before);
    const service = new MockWorkbenchService({ store: memoryStore(), latency: { read: 0, write: 0 }, autoTick: false });
    const strategy = resolveQingyuStrategyPreview({ proposal: qingyuProposal, workspace: await service.getResearchWorkspace('qingyu'), history: await service.getBriefHistory('qingyu') });
    if (strategy.kind === 'unavailable') throw new Error(strategy.message);
    const html = renderToStaticMarkup(createElement(QingyuThemesResultView, { result: { kind: 'current', preview: { bundle: parsed.bundle, basis: strategy.preview.basis, brief: strategy.preview.brief } }, retry: () => {} }));
    for (const text of ['原评记录', '原岗复核说明', '原分 3 → 原岗复核 4', '不是总控调分', '生效范围以独立总监裁决为准', '接受异议', '撤回阻断', '用户岗位范围内达到本轮要求', '原岗独立复核理由']) expect(html).toContain(text);
    expect(html).toContain('<dt>补充说明</dt><dd><span>原始标记（详见技术记录）</span>');
    expect(html).toContain('<dt>custom_english_key</dt>'); expect(html).toContain('custom_enum');
    expect(html).not.toMatch(/<details[^>]* open/);
  });
  it('keeps older round scores and revisions attached to their own draft version', () => {
    const value = fixture(), older = structuredClone(value.rounds[0]);
    older.id = 'r0';
    older.draft.draftId = 'synthetic-r0-draft';
    older.critics.forEach(critic => { critic.raw.packet_version = 'r0'; critic.raw.candidate_version = 'synthetic-r0-draft'; });
    older.reviews.forEach(review => { review.raw.packet_version = 'r0'; review.raw.items.forEach(item => { item.scores.forEach(score => { if (score.status === 'scored') score.score = 2; }); }); });
    older.response = { accepted: ['旧稿修改'], rejected: ['旧稿争议'], unresolved: ['旧稿未决'] };
    value.rounds.unshift(older);
    const bundle = ready(value);
    expect(bundle.currentRound.id).toBe('r1');
    expect(bundle.rounds[0].reviews[0].items[0].scores[1].score).toBe(2);
    expect(bundle.currentRound.reviews[0].items[0].scores[1].score).toBe(4);
    expect(bundle.rounds[0].response).toEqual(older.response);
    expect(bundle.currentRound.reviews[0].items[0].decision).toBe('revise');
  });
  it('renders exact scores/evidence and unresolved objections under closed disclosures; director is independent of means', async () => {
    const bundle = ready();
    const service = new MockWorkbenchService({ store: memoryStore(), latency: { read: 0, write: 0 }, autoTick: false });
    const strategy = resolveQingyuStrategyPreview({ proposal: qingyuProposal, workspace: await service.getResearchWorkspace('qingyu'), history: await service.getBriefHistory('qingyu') });
    if (strategy.kind === 'unavailable') throw new Error(strategy.message);
    const html = renderToStaticMarkup(createElement(QingyuThemesResultView, { result: { kind: 'current', preview: { bundle, brief: strategy.preview.brief, basis: strategy.preview.basis } }, retry: () => {} }));
    expect(html).toContain('data-director-recommendation="d1"');
    expect(html).toContain('独立总监理由'); expect(html).toContain('没有按均分排序');
    expect((html.match(/data-review-role=/g) ?? [])).toHaveLength(4);
    expect((html.match(/data-critic-role=/g) ?? [])).toHaveLength(4);
    for (const text of ['3 / 5', '5 / 5', '待核', '具体引用', '范围待核', '依据甲', '依据乙', '仍有异议', '配对异议', '保留异议乙', '未决保留']) expect(html).toContain(text);
    expect(html).not.toMatch(/<details[^>]* open|自动通过|总体通过/);
    for (const section of ['derivation', 'reviews', 'history']) expect(html).toContain(`data-copy-section="${section}"`);
    expect(html.indexOf('data-copy-section="reviews"')).toBeLessThan(html.indexOf('data-score-status'));
    expect(html).toContain('模型内部尺度'); expect(html).toContain('不代表客户批准');
  });
});
