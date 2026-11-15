import archive from '../../../src/proposal/qingyu-themes/reviewed-copy.json';
import { CopyOutput } from './TextStageOutput';

// Reading notes on the archived creative mechanisms, not additional reviewer votes.
const readingNotes: Record<string, { tone: string; scene: string; visual: string }> = {
  n7: {
    tone: '像递名片时的自我介绍。两句点名，短而利落，让一点文字游戏落回清楚的身份。',
    scene: '货架初看或电商浏览。读者可以第一次听说虎跑，也能从副文知道这个名字指什么。',
    visual: '让青屿与品牌、虎跑泉水与配方用水各自成组。主副文靠近，方便对照两个名字。',
  },
  k4: {
    tone: '像同事在工位旁招呼你歇一口气。先用“去趟虎跑”逗一句，再用拧瓶、喝茶揭晓意思。',
    scene: '工作间隙，读者正好能放下鼠标、拿起茶。原稿把这句邀请分别写在瓶侧和茶歇提醒里。',
    visual: '保留鼠标和工位，让放手、拧瓶两个动作接得上。读者要能看出这趟短途发生在原地。',
  },
  v2: {
    tone: '像给熟人捎东西时随口说的一句话。“上回你带我”与“这回我给你带”让情意有来有往。',
    scene: '送茶人与收茶人曾一起去过虎跑。瓶上的地名勾起同一段回忆，捎茶才有具体缘由。',
    visual: '让瓶上可读的“虎跑泉水”和随茶留言同时出现，把挑中这瓶茶的原因与收茶人联系起来。',
  },
};

export function QingyuCopyBody() {
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
      ...(readingNotes[d.id] ? [
        '气质：' + readingNotes[d.id].tone,
        '适用场景：' + readingNotes[d.id].scene,
        '视觉配合：' + readingNotes[d.id].visual,
      ] : []),
      '值得选：' + (d.id === archive.recommendation.directionId
        ? archive.recommendation.reasons.join('') : d.whyDistinct),
      '误读风险：' + d.risk,
      ...d.extensions.map((line) => line.label + '示例：' + line.text),
    ]),
  ].filter(Boolean).join('\n');
  return (
    <CopyOutput text={text} p={{
      id: archive.id, directions: directions.map((d) => d.name),
      artifacts: [], mode: 'auto', stage: 'copy', status: 'waiting',
    }} />
  );
}

export default function QingyuCopyReading() {
  return (
    <div className="sheet">
      <div className="sheet-bar"><a className="back-link" href="#/">← 回到提案台</a></div>
      <div className="sheet-scroll">
        <article className="sheet-doc">
          <header className="sheet-head">
            <p className="mono-label">青屿 · 本地演练稿 · 只读</p>
            <h1>文案与主题</h1>
          </header>
          <QingyuCopyBody />
        </article>
      </div>
    </div>
  );
}
