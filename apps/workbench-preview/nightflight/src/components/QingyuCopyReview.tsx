import archive from '../../../src/proposal/qingyu-themes/reviewed-copy.json';
import strategyIdentity from '../../../src/proposal/qingyu-strategy/identity.json';
import { strategySummaryIdentity } from '../../../src/proposal/qingyu-strategy/summary';
import {
  parseCopyBundle, roleNames, type CopyFollowUp, type Evidence, type Rating, type ReviewItem,
} from '../../../src/proposal/qingyu-themes/content';

const record = parseCopyBundle(archive, {
  strategyDraftId: strategySummaryIdentity.draftId,
  researchSha256: strategyIdentity.research.contentSha256,
});

const decisions: Record<ReviewItem['decision'], string> = {
  pass: '岗位通过', revise: '需修改', hold: '待核', reject_use: '不建议使用',
};

function rating(value: Rating) {
  if (value.status === 'scored') return value.score + ' 分';
  return value.status === 'unknown' ? '待核' : '不适用';
}

function EvidenceText({ value }: { value: Evidence }) {
  if (Array.isArray(value)) return <ul>{value.map((line, i) => <li key={i}><EvidenceText value={line} /></li>)}</ul>;
  if (value === null) return <>未记录</>;
  if (typeof value === 'object') return <>{Object.entries(value).map(([key, content]) => (
    <div key={key}>
      {key === 'quotes' ? '原文' : key === 'reason' ? '理由' : key}
      <div><EvidenceText value={content} /></div>
    </div>
  ))}</>;
  return <>{String(value)}</>;
}

function FollowUp({ entry }: { entry: CopyFollowUp }) {
  const { presentation, raw, source } = entry;
  const current = raw.current_independent_judgment;
  const reason = current && typeof current === 'object' && !Array.isArray(current) ? current.reason : undefined;
  const currentDecision = presentation.current.decision;
  const result = currentDecision === 'pass' || currentDecision === 'revise' || currentDecision === 'hold' || currentDecision === 'reject_use'
    ? decisions[currentDecision]
    : '本岗位范围内通过';
  return (
    <div data-review-followup={presentation.dimensionId}>
      <h4>{presentation.dimensionName}</h4>
      <p>原分 {rating(presentation.original)} → 复核 {rating(presentation.current)}</p>
      <p>{decisions[presentation.original.decision]} → {result}。{presentation.current.blocking ? '当前仍有阻断。' : '当前该项无阻断。'}</p>
      {reason && <p><EvidenceText value={reason} /></p>}
      {raw.limits && <div><strong>复核范围</strong><EvidenceText value={raw.limits} /></div>}
      <details>
        <summary>复核原件与来源</summary>
        <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify({ ...raw, source }, null, 2)}</pre>
      </details>
    </div>
  );
}

export function QingyuCopyReview({ directionId }: { directionId: string }) {
  if (record.kind !== 'ready') return <p className="pending">青屿评审记录暂不可读。{record.message}</p>;
  const { currentRound, recommendation } = record.bundle;
  const current = currentRound.directions.find((item) => item.id === directionId);
  const recommended = currentRound.directions.find((item) => item.id === recommendation.directionId);
  if (!current || !recommended) return <p className="pending">本版未找到对应方向的评审记录。</p>;
  return (
    <section className="block" data-copy-review={directionId}>
      <h2>推荐与取舍</h2>
      <h3>独立总监建议优先讨论「{recommended.name}」</h3>
      {recommendation.reasons.map((line) => <p key={line}>{line}</p>)}
      {recommendation.tradeoffs.map((line) => <p key={line}>{line}</p>)}
      <p className="hint">建议范围为{recommendation.scope}。人工采用待确认。</p>
      <details key={directionId}>
        <summary>「{current.name}」的四岗原评与复核</summary>
        {currentRound.reviews.map((review) => {
          const item = review.items.find((candidate) => candidate.id === directionId);
          const followUps = review.followUps.filter((entry) => entry.presentation.directionId === directionId);
          return (
            <details key={review.role} data-review-role={review.role}>
              <summary>{roleNames[review.role]} · 原评{item ? decisions[item.decision] : '待核'}</summary>
              {item?.raw.reason && <p><EvidenceText value={item.raw.reason} /></p>}
              {item?.scores.map((score) => (
                <div key={score.dimensionId} data-dimension={score.dimensionId}>
                  <h4>{score.group === 'direction' ? '方向' : '文案'} · {score.dimension} · 原分 {rating(score)}</h4>
                  <div><EvidenceText value={score.evidence} /></div>
                </div>
              ))}
              <h4>原岗复核</h4>
              {followUps.length ? followUps.map((entry) => <FollowUp key={entry.source.sha256} entry={entry} />)
                : <p>本轮本方向无追加复核记录。</p>}
            </details>
          );
        })}
      </details>
    </section>
  );
}
