import type { FinalReviewBinding } from './record';
const roleNames = { content: '内容', visual: '视觉', brand: '品牌', user: '用户理解模拟', communication: '传播表达' };
const conclusions = { needs_revision: '终审已执行 · 需修改', cannot_assess: '终审已执行 · 待复核', diagnostic_completed: '演练终审已执行 · 未签正式通过' };
const kinds = { must_fix: '需修改', advisory: '优化建议', unknown: '待核验' };
export function FinalReviewSummary({ binding, selectPage }: { binding: FinalReviewBinding; selectPage: (index: number) => void }) {
  if (binding.kind === 'not_recorded') return <><p className="qy-delivery-state">尚未正式终审</p><p>当前稿可供查看与讨论，尚无本稿的独立终审结论或修正记录。</p></>;
  if (binding.kind === 'stale') return <div role="status"><p className="qy-delivery-state">当前稿待重新终审</p><p>{binding.message}</p></div>;
  const r = binding.record;
  return <div className="qy-final-record" data-final-review={binding.kind}>
    {binding.kind === 'historical' && <p className="qy-layout-history">以下为任务卡第1版历史成稿的终审记录，不适用于当前新版任务。</p>}
    <p className="qy-delivery-state">{conclusions[r.conclusion]}</p><p>{r.summary}</p>
    <p className="small muted">{r.scope} · {r.reviewedAt}</p>
    {r.findings.length > 0 ? <ol className="qy-final-findings">{r.findings.map(f => <li key={f.id}>
      <div className="qy-final-finding-head"><strong>{kinds[f.kind]}</strong><span>{f.pages.map(page => <button key={page} type="button" className="text-link" onClick={() => selectPage(page - 1)}>第{page}页</button>)}</span></div>
      <p>{f.action}</p><p className="small muted">负责板块：{f.owner}</p>
      <details className="qy-layout-records"><summary>依据与原句</summary><p>{f.evidence}</p><blockquote>{f.quote}</blockquote></details>
    </li>)}</ol> : <p>本轮未记录新增待改问题；未验证项和随稿限制仍保留。</p>}
    <details className="qy-layout-records"><summary>五类职责与独立审查记录</summary><ul className="qy-final-roles">{r.roleSummaries.map(role => <li key={role.role}><strong>{roleNames[role.role]}</strong><p>{role.summary}</p><p className="small muted">首读：{role.primary} · 独立复读：{role.blind} · 对应质疑：{role.challenge}</p></li>)}</ul><p>同模型独立上下文审读，未校准；用户与传播为模型模拟，不代表真人研究或客户批准。</p></details>
    <details className="qy-layout-records"><summary>交付核对与尚未验证</summary><p>{r.exportCheck.summary}</p><ul>{r.unverified.map(item => <li key={item}>{item}</li>)}</ul></details>
    <details className="qy-layout-records"><summary>已知随稿范围</summary><ul>{r.knownScope.map(item => <li key={item}>{item}</li>)}</ul></details>
    <details className="qy-layout-records"><summary>版本与原票索引</summary><p>记录：{r.id}</p><p className="qy-final-hash">输入：{r.inputSha256}</p><ul>{r.recordReferences.map(ref => <li key={ref.path}><strong>{ref.label}</strong><p className="small qy-final-hash">{ref.path}<br />SHA256 {ref.sha256}</p></li>)}</ul></details>
  </div>;
}
