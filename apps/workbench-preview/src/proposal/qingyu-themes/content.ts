export type Evidence = string | number | boolean | null | Evidence[] | { [key: string]: Evidence };
export type EvidenceObject = { [key: string]: Evidence };
export type SourceRef = { path: string; sha256: string };
export type ReviewRole = 'copy' | 'brand' | 'user' | 'comms';
export const roleNames: Record<ReviewRole, string> = { copy: '文案', brand: '品牌', user: '用户模拟', comms: '传播' };
export type Rating = (
  | { status: 'scored'; score: number }
  | { status: 'unknown' | 'not_applicable'; score: null }
);
export type Score = { group: 'direction' | 'copy'; dimensionId: string; dimension: string; required: true; evidence: Evidence } & Rating;
export type ReviewItem = { id: string; scores: Score[]; decision: 'pass' | 'revise' | 'hold' | 'reject_use'; raw: EvidenceObject };
export type CopyDirection = { id: string; name: string; slogan: string; subline: string; raw: EvidenceObject };
export type CopyScale = { min: 1; max: 5; source: SourceRef; raw: Evidence };
type FollowUpDecision = ReviewItem['decision'] | `pass_within_${ReviewRole}_role`;
export type FollowUpPresentation = { directionId: string; directionName: string; dimensionId: string; dimensionName: string; issueId: string; original: Rating & { decision: ReviewItem['decision']; blocking: boolean }; current: Rating & { decision: FollowUpDecision; blocking: boolean } };
export type CopyFollowUp = { source: SourceRef; raw: EvidenceObject; presentation: FollowUpPresentation };
export type CopyRound = { id: string; draftSource: SourceRef; responseSource: SourceRef; draft: EvidenceObject; directions: CopyDirection[]; reviews: { role: ReviewRole; model: string; source: SourceRef; items: ReviewItem[]; raw: EvidenceObject; followUps: CopyFollowUp[] }[]; critics: { role: ReviewRole; source: SourceRef; firstReadSource: SourceRef; firstRead: Evidence; raw: Evidence }[]; response: Evidence };
export type CopyBundle = { schemaVersion: 1; id: string; basedOnStrategyDraftId: string; researchSha256: string; scale: CopyScale | null; currentRound: CopyRound; rounds: CopyRound[]; recommendation: { directionId: string; reasons: string[]; tradeoffs: string[]; scope: string; source: SourceRef; rawDirector: Evidence }; identity: { scope: string; sourceRecords: SourceRef[] } };
export type CopyBundleResult = { kind: 'ready'; bundle: CopyBundle } | { kind: 'invalid'; message: string };

function isObject(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function object(value: unknown): Record<string, unknown> {
  if (!isObject(value)) throw new Error('记录结构无效');
  return value;
}
function array(value: unknown): unknown[] { if (!Array.isArray(value)) throw new Error('列表缺失'); return value; }
function text(value: unknown): string { if (typeof value !== 'string' || !value.trim()) throw new Error('必要文字缺失'); return value; }
function evidence(value: unknown): Evidence {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return value;
  if (Array.isArray(value)) return value.map(evidence);
  const record = object(value);
  return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, evidence(item)]));
}
function presentEvidence(value: unknown): Evidence {
  const result = evidence(value);
  if (result === null || result === '' || (typeof result === 'object' && !Object.keys(result).length)) throw new Error('原始评审内容缺失');
  return result;
}
function evidenceObject(value: unknown): EvidenceObject { return Object.fromEntries(Object.entries(object(value)).map(([key, item]) => [key, evidence(item)])); }
function digest(value: unknown): string { const result = text(value); if (!/^[a-f0-9]{64}$/.test(result)) throw new Error('来源摘要无效'); return result; }
function source(value: unknown): SourceRef { const item = object(value); return { path: text(item.path), sha256: digest(item.sha256) }; }
function role(value: unknown): ReviewRole { if (value === 'copy' || value === 'brand' || value === 'user' || value === 'comms') return value; throw new Error('评审岗位无效'); }
function decision(value: unknown): ReviewItem['decision'] { if (value === 'pass' || value === 'revise' || value === 'hold' || value === 'reject_use') return value; throw new Error('岗位结论缺失'); }
function strings(value: unknown): string[] { return array(value).map(text); }
function unique(values: string[], expected: number): void { if (values.length !== expected || new Set(values).size !== expected) throw new Error('记录数量或身份重复'); }
function score(value: unknown): Score {
  const item = object(value);
  if ((item.group !== 'direction' && item.group !== 'copy') || item.required !== true) throw new Error('评分组或必评项无效');
  const common = { group: item.group, dimensionId: text(item.dimension_id), dimension: text(item.dimension), required: true, evidence: evidence(item.evidence) } satisfies Omit<Score, 'status' | 'score'>;
  if (common.evidence === null || typeof common.evidence === 'number' || typeof common.evidence === 'boolean' || common.evidence === '' || (Array.isArray(common.evidence) && !common.evidence.length) || (typeof common.evidence === 'object' && !Object.keys(common.evidence).length)) throw new Error('评分依据缺失');
  return { ...common, ...rating(item) };
}
function rating(item: Record<string, unknown>): Rating {
  if (item.status === 'scored' && typeof item.score === 'number' && Number.isFinite(item.score) && item.score >= 1 && item.score <= 5) return { status: 'scored', score: item.score };
  if ((item.status === 'unknown' || item.status === 'not_applicable') && item.score === null) return { status: item.status, score: null };
  throw new Error('原始评分或评分状态无效');
}
function boolean(value: unknown): boolean { if (typeof value !== 'boolean') throw new Error('阻断状态缺失'); return value; }
const rolePassDecisions: Record<ReviewRole, FollowUpDecision> = { copy: 'pass_within_copy_role', brand: 'pass_within_brand_role', user: 'pass_within_user_role', comms: 'pass_within_comms_role' };
function followUpPresentation({ raw, critic, items, directions, role }: { raw: EvidenceObject; critic: EvidenceObject; items: ReviewItem[]; directions: CopyDirection[]; role: ReviewRole }): FollowUpPresentation {
  const challengeId = text(raw.challenge_id);
  const matching = array(critic.challenges).map(object).filter(item => item.id === challengeId);
  if (matching.length !== 1) throw new Error('原岗复核未对应唯一的同轮同岗异议');
  const challenge = matching[0], directionId = text(challenge.candidate_id), item = items.find(item => item.id === directionId), direction = directions.find(item => item.id === directionId);
  if (!item || !direction) throw new Error('原岗复核方向与原评失配');
  const original = object(raw.original), dimensionId = text(original.dimension_id), originalScore = item.scores.find(score => score.dimensionId === dimensionId);
  if (!originalScore || challenge.target_dimension_id !== dimensionId) throw new Error('原岗复核维度与配对异议、原评失配');
  const issueId = text(original.issue_id), issues = array(item.raw.issues).map(object), issue = issues.find(item => item.id === issueId);
  if (!issue || challenge.target_issue_id !== issueId) throw new Error('原岗复核问题与配对异议、原评失配');
  const originalDecision = decision(original.decision), originalBlocking = boolean(original.blocking);
  if (original.score !== originalScore.score || originalDecision !== item.decision || originalBlocking !== issue.blocking || (challenge.target_score !== undefined && challenge.target_score !== originalScore.score)) throw new Error('原岗复核所引原分、判定或阻断状态失配');
  const current = object(raw.current_independent_judgment), currentRating = rating(current), currentBlocking = boolean(current.blocking);
  const currentDecision = current.decision === rolePassDecisions[role] ? rolePassDecisions[role] : decision(current.decision);
  if (current.issue_status === 'withdraw_blocker' && (!originalBlocking || currentBlocking)) throw new Error('原岗复核撤回阻断的状态不一致');
  if (currentDecision === 'pass' || currentDecision === rolePassDecisions[role]) {
    if (currentRating.status !== 'scored' || currentRating.score < 4 || currentBlocking || item.scores.some(score => score.dimensionId !== dimensionId && (score.status !== 'scored' || score.score < 4)) || issues.some(other => other.id !== issueId && other.blocking === true) || array(item.raw.hard_rejects).length > 0) throw new Error('原岗复核通过与分数或阻断状态不一致');
  }
  return { directionId, directionName: direction.name, dimensionId, dimensionName: originalScore.dimension, issueId, original: { ...originalScore, decision: originalDecision, blocking: originalBlocking }, current: { ...currentRating, decision: currentDecision, blocking: currentBlocking } };
}

function sameSourcePath(left: string, right: string): boolean {
  const clean = (value: string) => value.replace(/^\.\//, '').replace(/\\/g, '/');
  const a = clean(left), b = clean(right);
  return a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`);
}
function verifyReferenceFields(raw: EvidenceObject, prefix: string, ref: SourceRef): void {
  for (const suffix of ['hash', 'sha256']) {
    const value = raw[`${prefix}_${suffix}`];
    if (value !== undefined && digest(value) !== ref.sha256) throw new Error(`${prefix} 摘要关联失配`);
  }
  const path = raw[`${prefix}_path`];
  if (path !== undefined && !sameSourcePath(text(path), ref.path)) throw new Error(`${prefix} 来源路径失配`);
}
function verifyDraftFields(raw: EvidenceObject, roundId: string, draft: EvidenceObject, ref: SourceRef): void {
  if (raw.packet_version !== undefined && raw.packet_version !== roundId) throw new Error('质疑轮次失配');
  if (raw.candidate_version !== undefined && raw.candidate_version !== roundId && raw.candidate_version !== draft.draftId) throw new Error('质疑稿件版本失配');
  verifyReferenceFields(raw, 'draft', ref);
  verifyInputSources(raw, [ref]);
}
function verifyInputSources(raw: EvidenceObject, refs: SourceRef[]): void {
  for (const key of ['input_hashes', 'inputsSeen']) {
    if (raw[key] === undefined) continue;
    for (const [path, hash] of Object.entries(object(raw[key]))) {
      const ref = refs.find(item => sameSourcePath(path, item.path));
      if (ref && digest(hash) !== ref.sha256) throw new Error('原件输入摘要失配');
    }
  }
}

export function parseCopyBundle(value: unknown, expected: { strategyDraftId: string; researchSha256: string }): CopyBundleResult {
  try {
    const input = object(value);
    if (input.pending === true) throw new Error('本轮独立评审与文案封存尚未完成');
    if (input.schemaVersion !== 1 || input.basedOnStrategyDraftId !== expected.strategyDraftId || input.researchSha256 !== expected.researchSha256) throw new Error('文案、策略或研究版本不匹配');
    const identity = object(input.identity), sourceRecords = array(identity.sourceRecords).map(source);
    unique(sourceRecords.map(item => item.path), sourceRecords.length);
    function boundSource(value: unknown) { const ref = source(value); if (!sourceRecords.some(item => item.path === ref.path && item.sha256 === ref.sha256)) throw new Error('评审来源未绑定封存记录'); return ref; }
    let scale: CopyScale | null = null;
    if (input.scale !== undefined) {
      const item = object(input.scale);
      if (item.min !== 1 || item.max !== 5) throw new Error('阅读汇总量表不兼容');
      scale = { min: 1, max: 5, source: boundSource(item.source), raw: presentEvidence(item.raw) };
    }
    const rounds = array(input.rounds).map(value => {
      const round = object(value), id = text(round.id), draft = evidenceObject(round.draft), draftSource = boundSource(round.draftSource), responseSource = boundSource(round.responseSource);
      if (draft.basedOnStrategyDraftId !== expected.strategyDraftId) throw new Error('稿件策略身份失配');
      const directions = array(draft.directions).map(value => { const item = object(value); return { id: text(item.id), name: text(item.name), slogan: text(item.slogan), subline: text(item.subline), raw: evidenceObject(item) }; });
      unique(directions.map(item => item.id), 3);
      const reviews = array(round.reviews).map(value => {
        const review = object(value), reviewRole = role(review.role), model = text(review.model), raw = evidenceObject(review.raw);
        if (raw.schema_version !== 2 || raw.packet_version !== id || raw.role !== reviewRole || raw.model_id !== model) throw new Error('评审版本、岗位或模型失配');
        verifyDraftFields(raw, id, draft, draftSource);
        const items = array(raw.items).map(value => {
          const item = object(value), itemId = text(item.id), scores = array(item.scores).map(score);
          if (!directions.some(direction => direction.id === itemId)) throw new Error('评审方向失配');
          unique(scores.map(item => item.dimensionId), 4);
          unique(scores.map(item => `${item.group}/${item.dimension}`), 4);
          if (scores.filter(item => item.group === 'direction').length !== 2 || scores.filter(item => item.group === 'copy').length !== 2) throw new Error('方向与文案必评项不完整');
          return { id: itemId, scores, decision: decision(item.decision), raw: evidenceObject(item) };
        });
        unique(items.map(item => item.id), 3);
        const followUps = review.followUps === undefined ? [] : array(review.followUps).map(value => {
          const item = object(value), followRaw = evidenceObject(item.raw);
          if (followRaw.role !== reviewRole || followRaw.model_id !== model || followRaw.packet_version !== id) throw new Error('原岗复核的岗位、模型或轮次失配');
          verifyDraftFields(followRaw, id, draft, draftSource);
          verifyInputSources(followRaw, sourceRecords);
          return { source: boundSource(item.source), raw: followRaw };
        });
        return { role: reviewRole, model, source: boundSource(review.source), items, raw, followUps };
      });
      unique(reviews.map(item => item.role), 4);
      const critics = array(round.critics).map(value => {
        const item = object(value), criticRole = role(item.role), raw = evidenceObject(item.raw), firstReadSource = boundSource(item.firstReadSource);
        const paired = reviews.find(review => review.role === criticRole);
        if (!paired) throw new Error('质疑对应评分缺失');
        if (raw.role !== undefined && raw.role !== criticRole) throw new Error('质疑岗位失配');
        verifyDraftFields(raw, id, draft, draftSource);
        verifyReferenceFields(raw, 'paired_score', paired.source);
        verifyReferenceFields(raw, 'first_read', firstReadSource);
        verifyInputSources(raw, [draftSource, paired.source, firstReadSource]);
        const firstRead = presentEvidence(item.firstRead);
        if (isObject(firstRead)) {
          const first = evidenceObject(firstRead);
          if (first.candidate_version !== undefined && first.candidate_version !== id && first.candidate_version !== draft.draftId) throw new Error('质疑首读稿件失配');
          verifyReferenceFields(first, 'draft', draftSource);
          verifyInputSources(first, [draftSource]);
        }
        return { role: criticRole, source: boundSource(item.source), firstReadSource, firstRead, raw };
      });
      unique(critics.map(item => item.role), 4);
      const reviewed = reviews.map(review => {
        const critic = critics.find(item => item.role === review.role);
        if (!critic) throw new Error('原岗复核对应质疑缺失');
        return { ...review, followUps: review.followUps.map(followUp => ({ ...followUp, presentation: followUpPresentation({ raw: followUp.raw, critic: critic.raw, items: review.items, directions, role: review.role }) })) };
      });
      return { id, draftSource, responseSource, draft, directions, reviews: reviewed, critics, response: presentEvidence(round.response) };
    });
    unique(rounds.map(item => item.id), rounds.length);
    const currentRound = rounds.find(item => item.id === input.currentRoundId);
    if (!currentRound) throw new Error('当前稿件版本缺失');
    const recommendation = object(input.recommendation), directionId = text(recommendation.directionId), reasons = strings(recommendation.reasons);
    if (!currentRound.directions.some(item => item.id === directionId) || !reasons.length) throw new Error('独立总监推荐方向或理由缺失');
    return { kind: 'ready', bundle: { schemaVersion: 1, id: text(input.id), basedOnStrategyDraftId: text(input.basedOnStrategyDraftId), researchSha256: digest(input.researchSha256), scale, rounds, currentRound, recommendation: { directionId, reasons, tradeoffs: strings(recommendation.tradeoffs), scope: text(recommendation.scope), source: boundSource(recommendation.source), rawDirector: presentEvidence(recommendation.rawDirector) }, identity: { scope: text(identity.scope), sourceRecords } } };
  } catch (error) { return { kind: 'invalid', message: error instanceof Error ? error.message : '文案封存记录无效' }; }
}

export function readingMean(scores: Score[], group: Score['group'], scale: CopyScale | null): string {
  if (!scale) return '未汇总：量表兼容性尚未核实。原分与状态见下。';
  const rows = scores.filter(item => item.group === group), scored = rows.filter(item => item.status === 'scored');
  const unknown = rows.filter(item => item.status === 'unknown').length, notApplicable = rows.filter(item => item.status === 'not_applicable').length;
  const mean = scored.length ? `${(scored.reduce((sum, item) => sum + item.score, 0) / scored.length).toFixed(2)} / 5` : unknown ? '待核' : '不适用';
  return `原评展示均分 ${mean}（已评分 ${scored.length}/${rows.length}${unknown ? `；待核 ${unknown}` : ''}${notApplicable ? `；不适用 ${notApplicable}` : ''}）`;
}
