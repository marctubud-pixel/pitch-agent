import { ArrowUpRight } from 'lucide-react';
import type { StrategyInference } from './preview';

const evidenceLabels = { 'published-report': '公开研究', 'visual-observation': '可见表达观察', 'brand-self-description': '品牌自述', 'brief-condition': '题设条件' };

export function ClaimRecord({ claim: c }: { claim: StrategyInference }) {
  return <details className="qs-record" data-strategy-claim={c.id}><summary><span>{c.id}</span>{c.subject}</summary><div className="qs-record-body"><dl><div><dt>本轮判断</dt><dd>{c.judgment}</dd></div><div><dt>依据性质</dt><dd>{c.kind}</dd></div><div><dt>范围与限制</dt><dd>{c.limits}</dd></div><div><dt>本轮核查记录</dt><dd>{c.checkedEvidenceIds.join('、')}</dd></div></dl>
    <h4>原研究 R4 引用</h4>
    {c.researchR4.map(ref => <p className="small" key={ref.id}>{ref.id} · {ref.sourceIds.join('、')}<br />原稿引用定位 · {ref.locator}</p>)}
    {c.research.findings.map(f => <article className="qs-research-record" key={f.id}><p className="pw-label">{f.kind === 'brief-condition' ? '题设归纳' : '研究判断'} · {f.id}</p><h4>{f.title}</h4><p>{f.text}</p><p className="small muted">范围 · {f.scope}<br />限制 · {f.limits}<br />事实 · {f.factIds.join('、')}；来源 · {f.sourceIds.join('、')}</p></article>)}
    {c.research.facts.map(f => <article className="qs-research-record" key={f.id}><p className="pw-label">{evidenceLabels[f.evidenceType]} · {f.id}</p><p>{f.text}</p>{f.quantity && <p className="qs-quantity">原始数值 · <strong>{f.quantity.value}{f.quantity.unit}</strong><br />口径 · {f.quantity.basis}</p>}<p className="small muted">定位 · {f.locator}<br />范围 · {f.scope}<br />限制 · {f.limits}<br />来源 · {f.sourceIds.join('、')}{f.derivedFrom.length > 0 && <>；推导自 · {f.derivedFrom.join('、')}</>}</p></article>)}
    {c.research.gaps.map(g => <article className="qs-gap" key={g.id}><strong>待补 · {g.id} · {g.title}</strong><p>{g.text}</p><p>{g.consequence}</p></article>)}
    {c.research.sources.map(s => <article className="qs-research-record" key={s.id}><p className="pw-label">来源 · {s.id}</p><h4>{s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.title} <ArrowUpRight size={12} aria-hidden="true" /></a> : s.title}</h4><p className="small">{s.publisher} · {s.published ?? '发布日期未知'}<br />数据时期 · {s.dataPeriod}<br />市场与对象 · {s.market}；{s.population}<br />方法 · {s.method}<br />读取范围 · {s.access}<br />定位 · {s.locator}<br />限制 · {s.limits}</p></article>)}
    {c.supplements.length > 0 && <section className="qs-supplements"><h4>本轮补充依据，独立于原研究 R4</h4>{c.supplements.map(s => <article className="qs-research-record" key={s.id}><p className="pw-label">{s.kind} · {s.id}</p><h4>{s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.title} <ArrowUpRight size={12} aria-hidden="true" /></a> : s.title}</h4><p>{s.text}</p><p>定位 · {s.locator}<br />限制 · {s.limits}</p></article>)}</section>}
  </div></details>;
}
