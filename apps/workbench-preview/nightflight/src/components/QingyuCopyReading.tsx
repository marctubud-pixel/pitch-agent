import archive from '../../../src/proposal/qingyu-themes/reviewed-copy.json';
import type { CopyReview, ReviewedDirection } from '../live';
import { CopyOutput } from './TextStageOutput';
import { CopyReviewPanel } from './CopyReviewPanel';
import { QingyuCopyReview } from './QingyuCopyReview';

const archiveRound = archive.rounds.find((round) => round.id === archive.currentRoundId);
interface Publication {
  version: 1;
  status: 'published';
  copyReview: CopyReview;
  reviewsByDirection?: Partial<Record<ReviewedDirection['id'], CopyReview>>;
  retainedA?: { draftId: string; verdict: string; source: string };
  receipt: { director: string; contentSha256: string };
}

// The publication is written only after the review closes. Working drafts are outside this path.
const snapshots = import.meta.glob<Publication>([
  '../../../src/proposal/qingyu-themes/published-copy.json',
  '../../../src/proposal/qingyu-themes/published-experiment.json',
], {
  eager: true, import: 'default',
});

function retainedOriginalsMatch(snapshot: Publication) {
  const original = archiveRound?.draft.directions.find((d) => d.id === 'n7');
  const originalC = archiveRound?.draft.directions.find((d) => d.id === 'v2');
  const directions = snapshot.copyReview.draft.directions;
  const kept = directions.find((d) => d.id === 'A');
  return original && originalC && snapshot.retainedA?.draftId === original.id && snapshot.retainedA.verdict &&
    snapshot.retainedA.source && kept && kept.name === original.name && kept.main === original.slogan &&
    kept.secondary === original.subline && kept.mechanism === original.mechanism &&
    kept.touchpoints.length === original.extensions.length && original.extensions.every((point, i) =>
      point.label === kept.touchpoints[i].label && point.text === kept.touchpoints[i].text) &&
    directions.find((d) => d.id === 'C')?.main === originalC.slogan;
}

function publication(edition: 'distilled' | 'experiment') {
  const file = edition === 'experiment' ? 'published-experiment.json' : 'published-copy.json';
  const snapshot = snapshots['../../../src/proposal/qingyu-themes/' + file];
  if (snapshot?.version !== 1 || snapshot.status !== 'published' ||
      !snapshot.receipt?.director || !snapshot.receipt.contentSha256) return;
  const review = snapshot.copyReview;
  if (review?.protocol !== 'dual-panel-v2' || review.status !== 'ready' ||
      !review.adjudication?.ready || !review.adjudication.set?.ready) return;
  const directions = review.draft?.directions;
  const ids = ['A', 'B', 'C'] as const;
  if (directions?.length !== 3 || !ids.every((id) =>
    directions.some((d) => d.id === id) && review.adjudication.single?.some((entry) => entry.directionId === id && entry.ready))) return;
  if (!['AB', 'AC', 'BC'].every((pair) => review.adjudication.pairs?.some((entry) => entry.pair === pair && entry.distinct === true))) return;
  if (edition === 'distilled' && !retainedOriginalsMatch(snapshot)) return;
  const candidateIds = edition === 'experiment' ? ids : (['B', 'C'] as const);
  const roles = ['copy', 'brand', 'user', 'comms'] as const;
  for (const id of candidateIds) {
    const published = directions.find((d) => d.id === id);
    const ticket = snapshot.reviewsByDirection?.[id] ?? review;
    const scored = ticket.draft?.directions.find((d) => d.id === id);
    if (!published || !scored || scored.name !== published.name || scored.main !== published.main ||
        scored.secondary !== published.secondary || scored.mechanism !== published.mechanism ||
        scored.touchpoints.length !== published.touchpoints.length ||
        !scored.touchpoints.every((point, i) => point.label === published.touchpoints[i].label && point.text === published.touchpoints[i].text)) return;
    if (!roles.every((role) => {
      const vote = ticket.finalVotes?.find((vote) => vote.role === role);
      const item = vote?.items.find((entry) => entry.directionId === id);
      return vote?.runId && item?.decision === 'pass' && !item.blockers.length && !item.hardRejects.length &&
        item.scores.length === 4 && item.scores.every((score) => score.score !== null && score.score >= 4);
    })) return;
  }
  return snapshot;
}

function ArchivedCopy() {
  if (!archiveRound) return <p className="pending">青屿历史原稿暂不可读。</p>;
  const directions = archiveRound.draft.directions;
  const recommended = directions.find((d) => d.id === archive.recommendation.directionId);
  const text = [
    recommended && '推荐方向：' + recommended.name,
    ...directions.flatMap((d) => [
      '## ' + d.name, '主文案：' + d.slogan, '策略承接：' + d.strategyLink,
      '副文案：' + d.subline, '创意说明：' + d.mechanism,
      ...d.extensions.map((line) => line.label + '示例：' + line.text),
    ]),
  ].filter(Boolean).join('\n');
  return (
    <CopyOutput text={text} renderReview={(name) => {
      const direction = directions.find((entry) => entry.name === name);
      return direction && <QingyuCopyReview key={direction.id} directionId={direction.id} />;
    }} p={{
      id: archive.id, directions: directions.map((d) => d.name),
      artifacts: [], mode: 'auto', stage: 'copy', status: 'waiting',
    }} />
  );
}

function PublishedReview({ direction, snapshot, compare }: { direction: ReviewedDirection; snapshot: Publication; compare?: Publication }) {
  const previous = compare?.copyReview.draft.directions.find((entry) => entry.id === direction.id);
  return (
    <>
      {previous && <details className="block" data-compare-direction={direction.id}>
        <summary>对照提炼规则稿 · 方向 {direction.id}</summary>
        <div className="two-col">{[previous, direction].map((copy, i) => <div key={i} data-edition={i ? 'experiment' : 'distilled'}>
          <p className="mono-label">{i ? '完整 Skill 实验稿' : '提炼规则稿'}</p>
          <h3>{copy.name}</h3>
          <p className="lead">{copy.main}</p>
          <p>{copy.secondary}</p>
          <dl>{copy.touchpoints.map((point, index) => <div key={index}>
            <dt>{point.label}</dt><dd style={{ whiteSpace: 'pre-line', marginInlineStart: 0 }}>{point.text}</dd>
          </div>)}</dl>
        </div>)}</div>
      </details>}
      {direction.id === 'A' && snapshot.retainedA && <details>
        <summary>A 原稿通过记录</summary>
        <p>{snapshot.retainedA.verdict}</p>
        <p className="hint">来源　{snapshot.retainedA.source}</p>
      </details>}
      <CopyReviewPanel review={snapshot.copyReview} direction={direction}
        scoreRecord={snapshot.reviewsByDirection?.[direction.id]} showOriginal={false} />
    </>
  );
}

function QingyuCopyBody({ snapshot, compare }: { snapshot?: Publication; compare?: Publication }) {
  if (!snapshot) return <p className="pending" role="status">文案打磨中</p>;
  const review = snapshot.copyReview;
  const directions = review.draft.directions;
  const recommended = directions.find((d) => d.id === review.recommendation.directionId);
  const text = [
    recommended && '推荐方向：' + recommended.name,
    ...directions.flatMap((d) => [
      '## ' + d.name, '主文案：' + d.main, '副文案：' + d.secondary, '创意说明：' + d.mechanism,
      ...d.touchpoints.map((p) => p.label + '示例：' + p.text),
    ]),
  ].filter(Boolean).join('\n');
  return <CopyOutput text={text} recommendationLabel="本版推荐" publishedDirections={directions} p={{
    id: 'qingyu-published-copy', directions: directions.map((d) => d.name), artifacts: [],
    mode: 'auto', stage: 'copy', status: 'waiting',
  }} renderReview={(name) => {
    const direction = directions.find((d) => d.name === name);
    return direction && <PublishedReview key={direction.id} direction={direction} snapshot={snapshot} compare={compare} />;
  }} />;
}

export default function QingyuCopyReading({ edition }: { edition: string | null }) {
  const distilled = publication('distilled');
  const experiment = publication('experiment');
  const historical = edition === 'archive';
  const selected = edition === 'distilled' ? distilled : (experiment ?? distilled);
  const isExperiment = !!experiment && selected === experiment;
  const versionName = historical ? '历史原稿' : isExperiment ? '完整 Skill 实验稿' : '提炼规则稿';
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
          {!historical && experiment && distilled && <p>
            <a className="back-link" href={isExperiment ? base + '?edition=distilled' : base}>
              {isExperiment ? '查看提炼规则稿' : '查看完整 Skill 实验稿'}
            </a>
          </p>}
          {historical ? <ArchivedCopy /> : <QingyuCopyBody snapshot={selected} compare={isExperiment ? distilled : undefined} />}
          <a className="back-link" href={historical ? '#/reference/qingyu/copy' : '#/reference/qingyu/copy?edition=archive'}>
            {historical ? '查看当前发布版' : '历史原稿与原票'}
          </a>
        </article>
      </div>
    </div>
  );
}
