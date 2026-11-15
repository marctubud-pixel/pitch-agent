import type { CopyReview, CopyRole, CopyVote, ReviewedDirection } from '../live';

const roles: Record<CopyRole, string> = {
  copy: '文案', brand: '品牌', user: '目标用户模拟', comms: '传播',
};
const rulings = { resolved: '已解决', rejected: '未采纳', pending: '待核' };
const decisions = { pass: '通过', revise: '需修改', hold: '待核', reject: '退回' };

function Vote({ vote, direction, label }: { vote?: CopyVote; direction: ReviewedDirection; label: string }) {
  const item = vote?.items.find((entry) => entry.directionId === direction.id);
  return (
    <div>
      <h4>{label}{item && ' · ' + decisions[item.decision]}</h4>
      {item ? (
        <>
          <p>{item.reason}</p>
          {item.scores.map((score) => (
            <div key={score.dimension} data-dimension={score.dimension}>
              <strong>{score.dimension} · {score.score === null ? '待核' : score.score + ' 分'}</strong>
              <p>{score.reason}</p>
              {score.evidence !== score.reason && <p>依据　{score.evidence}</p>}
            </div>
          ))}
          {!!item.blockers.length && <p>阻断项　{item.blockers.join('；')}</p>}
          {!!item.hardRejects.length && <p>硬退项　{item.hardRejects.join('；')}</p>}
        </>
      ) : <p>本方向暂无这轮票据。</p>}
    </div>
  );
}

export function CopyReviewPanel({ review, direction }: { review: CopyReview; direction: ReviewedDirection }) {
  const recommended = review.draft.directions.find((d) => d.id === review.recommendation.directionId);
  const original = review.initialDraft.directions.find((d) => d.id === direction.id);
  return (
    <section className="copy-review" data-copy-review={direction.id}>
      <h2>推荐与取舍</h2>
      {recommended && <h3>建议优先讨论「{recommended.name}」</h3>}
      <p>{review.recommendation.reason}</p>
      <p>{review.recommendation.tradeoff}</p>
      {direction.risk && <p>本方向风险　{direction.risk}</p>}
      <details key={direction.id}>
        <summary>「{direction.name}」的四岗原评与复核</summary>
        <p className="hint">以下为本地模型审读。目标用户岗模拟阅读，实际受众反应仍待验证。</p>
        {Object.entries(roles).map(([role, title]) => {
          const first = review.firstVotes.find((vote) => vote.role === role);
          const final = review.finalVotes.find((vote) => vote.role === role);
          const objections = review.challenges.filter((record) => record.role === role)
            .flatMap((record) => record.items.filter((item) => item.directionId === direction.id));
          return (
            <details key={role} data-review-role={role}>
              <summary>{title}</summary>
              <Vote vote={first} direction={direction} label="原稿评分" />
              {!!objections.length && (
                <>
                  <h4>对应异议</h4>
                  {objections.map((item) => {
                    const ruling = review.adjudication.rulings.find((entry) => entry.challengeId === item.id);
                    return (
                      <div key={item.id}>
                        <strong>{item.dimension}</strong>
                        <p>{item.objection}</p>
                        <p>依据　{item.evidence}</p>
                        <p>建议　{item.action}</p>
                        {ruling && <p>裁定 · {rulings[ruling.verdict]}　{ruling.reason}</p>}
                      </div>
                    );
                  })}
                </>
              )}
              <Vote vote={final} direction={direction} label="交回稿复核" />
            </details>
          );
        })}
        <details>
          <summary>改稿与裁定记录</summary>
          {original && <><h4>本方向原稿</h4><p>{original.main}</p><p>{original.secondary}</p></>}
          {!!review.changes.length && <><h4>整组改稿记录</h4><ul className="plain-list">
            {review.changes.map((change, i) => <li key={i}>{change}</li>)}
          </ul></>}
          <h4>裁定理由</h4><p>{review.adjudication.reason}</p>
        </details>
      </details>
    </section>
  );
}
