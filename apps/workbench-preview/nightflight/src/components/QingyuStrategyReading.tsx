import original from '../../../src/proposal/qingyu-strategy/reviewed-strategy.md?raw';
import { sectionsOf } from './stageText';
import { StrategyReadingView } from './StrategyOutput';

// These two editorial summaries are paired with the actual paragraphs in the R3 draft.
const research = sectionsOf(original).find((s) => s.heading === '研究解释了什么')!;
const reading = {
  focus: '先让人看清茶种和无糖属性，再放大青屿配方使用虎跑泉水这一具体选择。',
  findings: [
    { conclusion: '同类产品各有选茶理由，单讲茶种很难说明青屿有什么不同。', evidence: research.lines.find((line) => line.startsWith('行业提供了竞争背景。')) },
    { conclusion: '历史样本希望包装讲清口味、风味与无糖属性。', evidence: research.lines.find((line) => line.startsWith('包装所面对的判断比')) },
  ],
  intersection: [
    '研究：先让人看懂这是什么茶，再给一个继续比较的理由。',
    '产品：题设给出的具体差别是配方使用虎跑泉水；实际使用前仍需核对凭据。',
    '人群：面对在便利店或电商选单瓶茶的 25 至 34 岁城市办公者，水源可供想进一步了解原料的人比较。他们是否在意水源仍待验证。',
  ],
};
export function QingyuStrategyReading() {
  return <div className="sheet">
    <div className="sheet-bar"><a className="back-link" href="#/">← 回到提案台</a></div>
    <div className="sheet-scroll"><article className="sheet-doc">
      <header className="sheet-head"><p className="mono-label">青屿 · 本地演练稿 · 只读</p><h1>策略</h1></header>
      <StrategyReadingView reading={reading} />
      <details className="research-original"><summary>查看策略原稿</summary><div className="live-text">{original}</div></details>
    </article></div>
  </div>;
}
