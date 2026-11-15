import legacy from '../../../src/proposal/qingyu-themes/legacy-headlines.json';
import { commonHeadlineCriteria, headlineReviewProtocol, headlineTaskByDuty, type CopyReview, type DirectionId } from '../live';
import { CopyOutput } from './TextStageOutput';
import { CopyReviewPanel } from './CopyReviewPanel';

interface Publication {
  version: 1;
  status: 'published';
  copyReview: CopyReview;
  receipt: { director: string; contentSha256: string };
}

const snapshots = import.meta.glob<Publication>('../../../src/proposal/qingyu-themes/published-experiment.json', {
  eager: true, import: 'default',
});
const ids: DirectionId[] = ['A', 'B', 'C'];
const roles = ['copy', 'brand', 'user', 'comms'] as const;

function publishedExperiment() {
  const snapshot = Object.values(snapshots)[0];
  const review = snapshot?.copyReview;
  const protocol = headlineReviewProtocol(review);
  if (snapshot?.version !== 1 || snapshot.status !== 'published' || !snapshot.receipt?.director ||
      !review?.bodyHash || snapshot.receipt.contentSha256 !== review.bodyHash ||
      !protocol || review.status !== 'ready' ||
      !review.adjudication?.ready || !review.adjudication.set?.ready) return;
  const directions = review.draft?.directions;
  if (directions?.length !== 3 || !ids.every((id) => {
    const d = directions.find((entry) => entry.id === id);
    const single = review.adjudication.single?.find((entry) => entry.directionId === id);
    if (!d?.main?.trim() || !single?.ready) return false;
    const criteria = [...commonHeadlineCriteria, headlineTaskByDuty[d.duty]];
    if (protocol === 'v4' && (!criteria[3] || single.checks?.length !== 4 ||
        !criteria.every((criterion) => single.checks?.some((check) =>
          check.criterion === criterion && check.passed && check.evidence?.trim() && check.reason?.trim())))) return false;
    return roles.every((role) => {
      const vote = review.finalVotes?.find((entry) => entry.role === role);
      const item = vote?.items.find((entry) => entry.directionId === id);
      if (!vote?.runId || !item) return false;
      if (protocol === 'v4') return true;
      return item.scores.length === 4 && item.decision === 'pass' && !item.blockers.length && !item.hardRejects.length &&
        item.scores.every(({ score }) => score !== null && score >= 4);
    });
  })) return;
  if (protocol === 'v4' && ![review.recommendation.memory, review.recommendation.retell,
    review.recommendation.scene].every((basis) => basis?.trim())) return;
  if (!['AB', 'AC', 'BC'].every((pair) => review.adjudication.pairs?.some((entry) => entry.pair === pair && entry.distinct))) return;
  return review;
}

export default function QingyuCopyReading({ edition }: { edition: string | null }) {
  const experiment = publishedExperiment();
  const archived = edition === 'archive';
  const copy = archived ? legacy.archive : legacy.distilled;
  const current = !archived && edition !== 'distilled' ? experiment : undefined;
  const directions = (current?.draft.directions ?? copy.directions).map(({ id, main }) => ({ name: id, main }));
  const preferred = current?.recommendation.directionId ?? copy.recommended;
  const versionName = archived ? '历史标题' : current ? '完整 Skill 实验稿' : '提炼规则稿';
  const base = '#/reference/qingyu/copy';
  return (
    <div className="sheet">
      <div className="sheet-bar"><a className="back-link" href="#/">← 回到提案台</a></div>
      <div className="sheet-scroll" key={versionName}>
        <article className="sheet-doc">
          <header className="sheet-head">
            <p className="mono-label">青屿 · {versionName} · 只读</p>
            <h1>文案与主题</h1>
          </header>
          {!archived && experiment && <p>
            <a className="back-link" href={current ? base + '?edition=distilled' : base}>
              {current ? '查看提炼规则稿' : '查看完整 Skill 实验稿'}
            </a>
          </p>}
          <CopyOutput publishedDirections={directions} text={'推荐方向：' + preferred}
            recommendationLabel={current ? '本版推荐' : '旧版推荐'}
            p={{id: 'qingyu', directions: directions.map((d) => d.name), artifacts: [], mode: 'auto', stage: 'copy', status: 'waiting'}}
            renderReview={(id) => {
              const direction = current?.draft.directions.find((d) => d.id === id);
              if (!direction || !current) return <details className="research-original">
                <summary>旧版推荐口径</summary>
                <p>旧版按主副文合读评审，推荐方向 {preferred}。单标题暂无独立通过记录。</p>
              </details>;
              const previous = legacy.distilled.directions.find((d) => d.id === id);
              return <>
                <details className="research-original"><summary>本标题的评审与推荐</summary>
                  <CopyReviewPanel review={current} direction={direction} />
                </details>
                {previous && <details className="research-original" data-compare-direction={id}>
                  <summary>对照提炼规则稿 · 方向 {id}</summary>
                  <div className="two-col">{[previous, direction].map((d, i) => <div key={i}>
                    <p className="mono-label">{i ? '完整 Skill 实验稿' : '提炼规则稿'}</p><p className="lead">{d.main}</p>
                  </div>)}</div>
                </details>}
              </>;
            }}
          />
          <a className="back-link" href={archived ? base : base + '?edition=archive'}>
            {archived ? '查看当前发布版' : '查看历史标题'}
          </a>
        </article>
      </div>
    </div>
  );
}
