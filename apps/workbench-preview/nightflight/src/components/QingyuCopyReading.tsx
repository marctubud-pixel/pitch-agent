import archive from '../../../src/proposal/qingyu-themes/reviewed-copy.json';
import { CopyOutput } from './TextStageOutput';

export default function QingyuCopyReading() {
  const draft = archive.rounds.find((round) => round.id === archive.currentRoundId)?.draft;
  if (!draft) return <p className="pending">青屿本版文案暂不可读。</p>;
  const directions = draft.directions;
  const recommended = directions.find((d) => d.id === archive.recommendation.directionId);
  const text = [
    '共同策略：先让人看清茶种和无糖属性，再放大青屿配方使用虎跑泉水这一具体选择。',
    recommended && '推荐方向：' + recommended.name,
    ...directions.flatMap((d) => [
      '## ' + d.name,
      '主文案：' + d.slogan,
      '策略承接：' + d.strategyLink,
      '副文案：' + d.subline,
      ...d.extensions.map((line) => line.label + '示例：' + line.text),
    ]),
  ].filter(Boolean).join('\n');
  return (
    <div className="sheet">
      <div className="sheet-bar"><a className="back-link" href="#/">← 回到提案台</a></div>
      <div className="sheet-scroll">
        <article className="sheet-doc">
          <header className="sheet-head">
            <p className="mono-label">青屿 · 本地演练稿 · 只读</p>
            <h1>文案与主题</h1>
          </header>
          <CopyOutput text={text} p={{
            id: archive.id, directions: directions.map((d) => d.name),
            artifacts: [], mode: 'auto', stage: 'copy', status: 'waiting',
          }} />
        </article>
      </div>
    </div>
  );
}
