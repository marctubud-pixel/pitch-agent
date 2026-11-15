import type { CopyReview, CopyRole, CopyVote, ReviewedDirection } from '../live';

const roles: Record<CopyRole, string> = {
  copy: '文案', brand: '品牌', user: '目标用户模拟', comms: '传播',
};
const dispositions = { accepted_now: '本轮处理', accepted_later: '延后处理', rejected: '未采纳', pending: '待核' };
const actions = { revise: '改稿', recheck: '复核', none: '无追加动作' };
const rulings = { resolved: '已解决', rejected: '未采纳', pending: '待核' };
const decisions = { pass: '通过', revise: '需修改', hold: '待核', reject: '退回' };

type Coverage = NonNullable<CopyReview['challenges'][number]['coverage']>[number];
function CoverageNote({ entry }: { entry: Coverage }) {
  return <div>
    <h4>对抗岗核对原票 · {entry.dimension}</h4>
    <p>原判　{entry.originalClaim}</p>
    <p>原据　{entry.originalEvidence}</p>
    <p>{entry.reason}</p>
  </div>;
}

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
              {score.scope && <p>适用范围　{score.scope}</p>}
            </div>
          ))}
          {!!item.blockers.length && <p>阻断项　{item.blockers.join('；')}</p>}
          {!!item.hardRejects.length && <p>硬退项　{item.hardRejects.join('；')}</p>}
        </>
      ) : <p>本方向暂无这轮票据。</p>}
    </div>
  );
}

export function CopyReviewPanel({ review, direction, scoreRecord = review, showOriginal = true }: {
  review: CopyReview; direction: ReviewedDirection; scoreRecord?: CopyReview; showOriginal?: boolean;
}) {
  const recommended = review.draft.directions.find((d) => d.id === review.recommendation.directionId);
  const label = '方向 ' + direction.id;
  const original = scoreRecord.initialDraft.directions.find((d) => d.id === direction.id);
  const dual = review.protocol === 'dual-panel-headline-v3';
  const dualScores = scoreRecord.protocol === 'dual-panel-headline-v3';
  const single = dual && review.adjudication.single?.find((entry) => entry.directionId === direction.id);
  const comparison = dual && review.adjudication.pairs;
  const set = dual && review.adjudication.set;
  const nameOf = (id: string) => '方向 ' + id;
  return (
    <section className="copy-review" data-copy-review={direction.id}>
      {single && <div className="block">
        <h2>单案裁定 · {label}</h2>
        <p>{single.ready ? '可交接' : '待处理'}　{single.reason}</p>
      </div>}
      {comparison && <div className="block">
        <h2>三案差异</h2>
        <dl className="kv">
          {comparison.map(({ pair, reason }) => <div key={pair}>
            <dt>{nameOf(pair[0])} / {nameOf(pair[1])}</dt>
            <dd>{reason}</dd>
          </div>)}
        </dl>
        {set && <p>整组{set.ready ? '可交接' : '待处理'}　{set.reason}</p>}
      </div>}
      <h2>推荐与取舍</h2>
      {recommended && <h3>建议优先讨论「{nameOf(recommended.id)}」</h3>}
      <p>{review.recommendation.reason}</p>
      <p>{review.recommendation.tradeoff}</p>
      {direction.risk && <p>本方向风险　{direction.risk}</p>}
      <details key={direction.id}>
        <summary>「{label}」的四岗原评与复核</summary>
        <p className="hint">以下为本地模型审读。目标用户岗模拟阅读，实际受众反应仍待验证。</p>
        {Object.entries(roles).map(([role, title]) => {
          const first = scoreRecord.firstVotes.find((vote) => vote.role === role);
          const final = scoreRecord.finalVotes.find((vote) => vote.role === role);
          const firstRead = dualScores ? scoreRecord.anonymousReads?.find((entry) => entry.role === role) : undefined;
          const read = firstRead?.items.find((item) => item.directionId === direction.id);
          const finalRead = dualScores ? scoreRecord.finalAnonymousReads?.find((entry) => entry.role === role) : undefined;
          const newRead = finalRead && finalRead.runId !== firstRead?.runId
            ? finalRead.items.find((item) => item.directionId === direction.id) : undefined;
          const middle = scoreRecord.sameDraftRechecks?.filter((vote) => vote.role === role && vote.runId !== final?.runId);
          const risks = dualScores ? scoreRecord.criticReads?.find((entry) => entry.role === role)?.items
            .filter((item) => item.directionId === direction.id && item.risk) : undefined;
          const originalIssues = dualScores ? scoreRecord.issues?.filter((item) =>
            item.origin === 'score' && item.role === role && item.directionId === direction.id
          ) : undefined;
          const group = scoreRecord.challenges.find((entry) => entry.role === role);
          const coverage = group?.coverage?.filter((entry) => entry.directionId === direction.id);
          const otherCoverage = coverage?.filter((entry) =>
            !entry.readId || !risks?.some((risk) => risk.readId === entry.readId));
          const objections = group?.items.filter((entry) => entry.directionId === direction.id) ?? [];
          return (
            <details key={role} data-review-role={role}>
              <summary>{title}</summary>
              {read && <div>
                <h4>匿名首读</h4>
                <p>{read.reading}</p>
                {read.uncertainty && <p>不确定处　{read.uncertainty}</p>}
              </div>}
              <Vote vote={first} direction={direction} label="原稿评分" />
              {originalIssues?.map((issue) => {
                const plan = scoreRecord.decisionPlan?.rulings.find((entry) => entry.challengeId === issue.id);
                const decision = scoreRecord.adjudication.rulings.find((entry) => entry.challengeId === issue.id);
                return <div key={issue.id}>
                  <h4>原票阻断处置</h4>
                  {issue.reason && <p>{issue.dimension && issue.dimension + '　'}{issue.reason}</p>}
                  {plan && <p>处置 · {dispositions[plan.verdict]} · {actions[plan.action]}　{plan.reason}</p>}
                  {decision && <p>裁定 · {rulings[decision.verdict]}　{decision.reason}</p>}
                </div>;
              })}
              {!!risks?.length && <div>
                <h4>对抗岗独立首查</h4>
                {risks.map((critic, i) => <div key={critic.readId ?? i} data-critic-read={critic.readId}>
                  <p>{critic.risk}</p>
                  {critic.evidence && <p>依据　{critic.evidence}</p>}
                  {critic.readId && coverage?.filter((entry) => entry.readId === critic.readId)
                    .map((entry, j) => <CoverageNote key={j} entry={entry} />)}
                </div>)}
              </div>}
              {dualScores && otherCoverage?.map((entry, i) => <CoverageNote key={i} entry={entry} />)}
              {!!objections.length && (
                <>
                  <h4>对应异议</h4>
                  {objections.map((item) => {
                    const plan = dualScores && scoreRecord.decisionPlan?.rulings.find((entry) => entry.challengeId === item.id);
                    const ruling = scoreRecord.adjudication.rulings.find((entry) => entry.challengeId === item.id);
                    return (
                      <div key={item.id}>
                        <strong>{item.dimension}</strong>
                        <p>{item.objection}</p>
                        <p>依据　{item.evidence}</p>
                        <p>建议　{item.action}</p>
                        {plan && <p>处置 · {dispositions[plan.verdict]} · {actions[plan.action]}　{plan.reason}</p>}
                        {ruling && <p>裁定 · {rulings[ruling.verdict]}　{ruling.reason}</p>}
                      </div>
                    );
                  })}
                </>
              )}
              {middle?.map((vote) => <Vote key={vote.runId} vote={vote} direction={direction} label="同稿复核" />)}
              {newRead && <div><h4>新稿匿名首读</h4><p>{newRead.reading}</p>{newRead.uncertainty && <p>不确定处　{newRead.uncertainty}</p>}</div>}
              {final?.reused ? <p>本岗沿用原票。当前稿件未要求本岗追加复核。</p> : (
                <Vote vote={final} direction={direction}
                  label={dualScores ? first?.draftHash === final?.draftHash ? '同稿复核' : '新稿复核' : '交回稿复核'} />
              )}
            </details>
          );
        })}
        <details>
          <summary>改稿与裁定记录</summary>
          {showOriginal && original && <><h4>本方向原稿</h4><p>{original.main}</p></>}
          {!!scoreRecord.changes.length && <><h4>整组改稿记录</h4><ul className="plain-list">
            {scoreRecord.changes.map((change, i) => <li key={i}>{change}</li>)}
          </ul></>}
          <h4>裁定理由</h4><p>{scoreRecord.adjudication.reason}</p>
        </details>
      </details>
    </section>
  );
}
