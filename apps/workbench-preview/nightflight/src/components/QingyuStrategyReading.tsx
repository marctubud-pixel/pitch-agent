import original from '../../../src/proposal/qingyu-strategy/reviewed-strategy.md?raw';
export function QingyuStrategyReading() {
  return <div className="sheet">
    <div className="sheet-bar"><a className="back-link" href="#/">← 回到提案台</a></div>
    <div className="sheet-scroll"><article className="sheet-doc">
      <header className="sheet-head"><p className="mono-label">青屿 · 本地演练稿 · 只读</p><h1>策略</h1></header>
      <details className="research-original"><summary>查看策略原稿</summary><div className="live-text">{original}</div></details>
    </article></div>
  </div>;
}
