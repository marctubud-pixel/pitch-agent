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
  retainedA: { draftId: string; verdict: string; source: string };
}

// The publication is written only after the review closes. Working drafts are outside this path.
const snapshots = import.meta.glob<Publication>('../../../src/proposal/qingyu-themes/published-copy.json', {
  eager: true, import: 'default',
});

function currentPublication() {
  const snapshot = Object.values(snapshots)[0];
  if (snapshot?.version !== 1 || snapshot.status !== 'published') return;
  const original = archiveRound?.draft.directions.find((d) => d.id === 'n7');
  const review = snapshot.copyReview;
  if (!original || snapshot.retainedA?.draftId !== original.id || !snapshot.retainedA.verdict ||
      !snapshot.retainedA.source || review?.protocol !== 'dual-panel-v2' || review.status !== 'ready' ||
      !review.adjudication?.ready || !review.adjudication.set?.ready) return;
  const directions = review.draft.directions;
  if (directions.length !== 3 || !['A', 'B', 'C'].every((id) =>
    directions.some((d) => d.id === id) && review.adjudication.single?.some((entry) => entry.directionId === id && entry.ready))) return;
  if (!['AB', 'AC', 'BC'].every((pair) => review.adjudication.pairs?.some((entry) => entry.pair === pair && entry.distinct === true))) return;
  const originalC = archiveRound?.draft.directions.find((d) => d.id === 'v2');
  if (!originalC || directions.find((d) => d.id === 'C')?.main !== originalC.slogan) return;
  const kept = directions.find((d) => d.id === 'A');
  if (!kept || kept.name !== original.name || kept.main !== original.slogan || kept.secondary !== original.subline ||
      kept.mechanism !== original.mechanism || kept.touchpoints.length !== original.extensions.length ||
      !original.extensions.every((point, i) => point.label === kept.touchpoints[i].label && point.text === kept.touchpoints[i].text)) return;
  const candidateIds = ['B', 'C'] as const;
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
      const item = ticket.finalVotes?.find((vote) => vote.role === role)?.items.find((entry) => entry.directionId === id);
      return item?.decision === 'pass' && !item.blockers.length && !item.hardRejects.length &&
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

function PublishedReview({ direction, snapshot }: { direction: ReviewedDirection; snapshot: Publication }) {
  return (
    <>
      {direction.id === 'A' && <details>
        <summary>A 原稿通过记录</summary>
        <p>{snapshot.retainedA.verdict}</p>
        <p className="hint">来源　{snapshot.retainedA.source}</p>
      </details>}
      <CopyReviewPanel review={snapshot.copyReview} direction={direction}
        scoreRecord={snapshot.reviewsByDirection?.[direction.id]} showOriginal={false} />
    </>
  );
}

export function QingyuCopyBody() {
  const snapshot = currentPublication();
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
    return direction && <PublishedReview key={direction.id} direction={direction} snapshot={snapshot} />;
  }} />;
}

export default function QingyuCopyReading({ historical = false }: { historical?: boolean }) {
  return (
    <div className="sheet">
      <div className="sheet-bar"><a className="back-link" href="#/">← 回到提案台</a></div>
      <div className="sheet-scroll" key={historical ? 'archive' : 'published'}>
        <article className="sheet-doc">
          <header className="sheet-head">
            <p className="mono-label">青屿 · {historical ? '历史原稿' : '本地演练稿'} · 只读</p>
            <h1>文案与主题</h1>
          </header>
          {historical ? <ArchivedCopy /> : <QingyuCopyBody />}
          <a className="back-link" href={historical ? '#/reference/qingyu/copy' : '#/reference/qingyu/copy?edition=archive'}>
            {historical ? '查看当前发布版' : '历史原稿与原票'}
          </a>
        </article>
      </div>
    </div>
  );
}
