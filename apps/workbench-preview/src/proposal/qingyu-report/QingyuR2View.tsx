import { useState } from 'react';
import { Drawer } from '../Drawer';
import { byId, type EvidenceKind, type QingyuSource } from './report';
import { r2Value, type QingyuR2Report, type R2Case, type R2Chart, type R2Price, type R2Sku } from './report-r2';
import { ChapterBoards } from './ChapterBoards';
import '../../styles/qingyu-report-r2.css';

export type Selection = { kind: 'references'; title: string; ids: string[] } | { kind: 'image'; product: R2Case } | { kind: 'chart'; chart: R2Chart };
type OpenRefs = (title: string, ids: string[]) => void;
export const priceNatureLabels: Record<R2Price['priceNature'], string> = {
  'observed-listing': '读取时可见渠道标价', promotion: '促销与条件报价',
  'brand-reported-launch': '品牌自述历史单价', 'reported-price': '公开文章转述报价', unknown: '尚未核实价格',
};
const r2EvidenceLabels: Record<EvidenceKind, string> = { 'published-report': '公开资料引述', 'visual-observation': '物料可见观察', 'brand-self-description': '品牌自述', 'research-synthesis': '研究分析', 'brief-condition': '虚构任务条件', 'brief-derived': '题设换算', 'method-reference': '方法参照' };
const priceCategories: R2Sku['category'][] = ['strict-tea', 'adjacent'];
const answerLabels = { answered: '已回答', partial: '部分回答', unanswered: '尚未回答' };
const formatNumber = (value: number) => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value);

export function QingyuR2View({ report, historical, latestBriefVersion }: { report: QingyuR2Report; historical: boolean; latestBriefVersion: number | null }) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const openRefs: OpenRefs = (title, ids) => setSelection({ kind: 'references', title, ids });
  const openImage = (product: R2Case) => setSelection({ kind: 'image', product });
  const openChart = (chart: R2Chart) => setSelection({ kind: 'chart', chart });
  const selectionTitle = selection?.kind === 'image' ? `${selection.product.title} · 原图与出处` : selection?.kind === 'chart' ? `${selection.chart.title} · 数值与口径` : selection?.title ?? '研究依据';
  return <article className="qy-r2" data-case-report={report.id} data-report-revision="2" aria-labelledby="qy-r2-title">
    <header className="qy-r2-cover"><div><p className="qy-r2-kicker">公开资料报告·修订2</p><h2 id="qy-r2-title">{report.title}</h2><p className="qy-r2-lead">虚构任务｜公开资料｜研究待补。五个章节，六张图版；展开可看完整分析与依据。</p></div><div className="qy-r2-edition"><strong>{report.status}</strong><span>资料截至 {report.asOf}</span><span>依据任务卡第1版</span></div></header>
    {historical && <p className="qy-r2-warning" data-case-historical="true">本文依据历史任务卡第1版。当前任务卡{latestBriefVersion === null ? '尚未取得' : `为第${latestBriefVersion}版`}，本报告未自动套用到新版任务。</p>}
    <nav className="qy-r2-nav" aria-label="青屿修订2研究章节">{report.sections.map((s, index) => <a key={s.id} href={`#qy-r2-${s.id}`} onClick={event => { event.preventDefault(); document.getElementById(`qy-r2-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}><span>{String(index + 1).padStart(2, '0')}</span>{s.title}</a>)}</nav>
    {report.sections.map((s, index) => <section className="qy-r2-section" id={`qy-r2-${s.id}`} data-chapter={s.id} key={s.id} aria-labelledby={`qy-r2-heading-${s.id}`}>
      <header className="qy-r2-chapter-label"><h3 id={`qy-r2-heading-${s.id}`}><span>{String(index + 1).padStart(2, '0')}</span>{s.title}</h3><button type="button" className="qy-r2-link" onClick={() => openRefs(`${s.title} · 研究依据`, [...s.findingIds, ...s.datumIds])}>依据与边界 ↗</button></header>
      <ChapterBoards report={report} section={s} onInspect={setSelection} />
      <details className="qy-r2-analysis" data-chapter-analysis={s.id}><summary>详细分析与数据 · {s.title}</summary><div className="qy-r2-analysis-body">
      <header className="qy-r2-section-head"><div><p className="qy-r2-kicker">{String(index + 1).padStart(2, '0')} / {s.title}</p><h3>{s.headline}</h3><p className="qy-r2-conclusion">{s.conclusion}</p></div></header>
      {s.chartIds.length > 0 && <div className="qy-r2-charts">{s.chartIds.map(id => <MetricChart key={id} chart={byId(report.charts, id)} report={report} openChart={openChart} />)}</div>}
      {s.id === 'competition' && <PriceMap report={report} openRefs={openRefs} />}
      {s.caseIds.length > 0 && <PackagingCases report={report} ids={s.caseIds} openImage={openImage} />}
      {s.conditions.length > 0 && <dl className="qy-r2-conditions">{s.conditions.map(c => <div key={c.label}><dt>{c.label} · {c.evidence}</dt><dd>{c.value}</dd></div>)}</dl>}
      {s.takeaways.length > 0 && <ol className="qy-r2-takeaways">{s.takeaways.map(t => <li key={t.text}><p>{t.text}</p><button type="button" className="qy-r2-link" onClick={() => openRefs('综合判断依据', t.findingIds)}>依据 ↗</button></li>)}</ol>}
      {s.support.length > 0 && <ul className="qy-r2-support">{s.support.map(p => <li key={p.text}><p>{p.text}</p><button type="button" className="qy-r2-link" onClick={() => openRefs('资料与适用范围', p.datumIds)}>资料 ↗</button></li>)}</ul>}
      <p className="qy-r2-note">{s.footnote}</p>
      {s.gapIds.length > 0 && <aside className="qy-r2-gaps" aria-label={`${s.title}待补资料`}>{s.gapIds.map(id => { const g = byId(report.gaps, id); return <div key={id}><strong>待补 · {g.title}</strong><p>{g.text}</p><p className="qy-r2-note">{g.consequence}</p><button type="button" className="qy-r2-link" onClick={() => openRefs(`${g.title} · 补查范围`, [id])}>补查范围与出处 ↗</button></div>; })}</aside>}
      </div></details>
    </section>)}
    <details className="qy-r2-details" data-question-matrix="true"><summary>研究问题与回答范围 · 九项问题</summary>{report.questions.map(q => <div className="qy-r2-evidence-item" key={q.id}><p className="qy-r2-kicker">{answerLabels[q.answerStatus]}</p><h4>{q.question}</h4><p>{q.answer}</p><button type="button" className="qy-r2-link" onClick={() => openRefs('问题回答依据与缺口', [...q.findingIds, ...q.datumIds, ...q.gapIds])}>证据与缺口 ↗</button></div>)}</details>
    <details className="qy-r2-details" data-method-notes="true"><summary>{report.notes.label} · {report.sources.length}份资料</summary><h3>方法与范围</h3><ul>{report.notes.methodology.map(p => <li key={p}>{p}</li>)}</ul>{report.notes.methodReferenceDatumIds.length > 0 && <button type="button" className="qy-r2-link" onClick={() => openRefs('方法参照及适用限制', report.notes.methodReferenceDatumIds)}>方法参照及限制 ↗</button>}<h3>全部来源</h3>{report.sources.map(s => <SourceDetails source={s} key={s.id} />)}<h3>已应用的纠正</h3><ul>{report.notes.correctionsApplied.map(p => <li key={p}>{p}</li>)}</ul><h3>独立检查范围</h3>{report.notes.priorChecks.map(c => <p key={c.role}><strong>{c.role}</strong> · {c.scope}</p>)}</details>
    <details className="qy-r2-details" data-revision-identity="true"><summary>报告身份与版本</summary><p>{report.subtitle}</p><p>{report.lead}</p><p>{report.scopeNote}</p><p>当前展示为独立编写的公开资料报告·修订2。关联项目保存的研究记录仍为研究第1版，依据任务卡第1版。本文不代表任务卡已确认、研究已批准或已进入策略。</p><p>成稿时间 {report.revision.authoredAt}。采用调研方法版本 {report.revision.skillRevision}。资料截至 {report.asOf}。</p></details>
    <Drawer open={selection !== null} onClose={() => setSelection(null)} title={selectionTitle}>{selection && <div className="qy-r2 qy-r2-evidence">{selection.kind === 'image' ? <OriginalImage report={report} product={selection.product} /> : selection.kind === 'chart' ? <ChartEvidence report={report} chart={selection.chart} /> : <EvidenceDetails report={report} ids={selection.ids} />}</div>}</Drawer>
  </article>;
}

function MetricChart({ report, chart, openChart }: { report: QingyuR2Report; chart: R2Chart; openChart: (chart: R2Chart) => void }) {
  const max = Math.max(chart.unit === '%' ? 100 : 1, ...chart.rows.map(row => r2Value(report, row)));
  return <figure className="qy-r2-chart" data-exhibit={chart.id}><figcaption><p className="qy-r2-kicker">{chart.metricLabel}</p><h4>{chart.title}</h4></figcaption>
    <p className="qy-r2-measure">单位 {chart.unit} · 统计期 {chart.period}<br />比较口径 {chart.comparison}<br />渠道 {chart.channel} · 样本 {chart.population}</p>
    {chart.type === 'bar' ? <div className="qy-r2-bars" role="img" aria-label={`${chart.metricLabel}，单位${chart.unit}，${chart.rows.map(row => `${row.label}${r2Value(report, row)}`).join('；')}`}>{chart.rows.map(row => <div className="qy-r2-bar" key={row.label}><span>{row.label}</span><div><span style={{ width: `${r2Value(report, row) / max * 100}%` }} /></div><strong>{formatNumber(r2Value(report, row))}{chart.unit}</strong></div>)}<p className="qy-r2-note">横轴 0{chart.unit}至{formatNumber(max)}{chart.unit}，各项独立展示，不作堆叠或相加。</p></div> : <div className="qy-r2-metrics">{chart.rows.map(row => <div key={row.label}><strong>{formatNumber(r2Value(report, row))}<small>{chart.unit}</small></strong><span>{row.label}</span></div>)}</div>}
    <p className="qy-r2-note">{chart.scope}</p><p className="qy-r2-note">{chart.caption}</p><button type="button" className="qy-r2-link" onClick={() => openChart(chart)}>来源与数值定位 ↗</button>
  </figure>;
}
export function ChartEvidence({ report, chart }: { report: QingyuR2Report; chart: R2Chart }) {
  return <><h3>{chart.metricLabel}</h3><p>统计期 {chart.period} · 比较口径 {chart.comparison}</p><p>渠道 {chart.channel} · 样本 {chart.population}</p><div className="qy-r2-table-wrap"><table><caption>图中原始数值，单位 {chart.unit}</caption><thead><tr><th scope="col">项目与时期</th><th scope="col">数值</th></tr></thead><tbody>{chart.rows.map(row => <tr key={row.label}><th scope="row">{row.label}</th><td>{formatNumber(r2Value(report, row))} {chart.unit}</td></tr>)}</tbody></table></div><EvidenceDetails report={report} ids={chart.rows.map(row => row.datumId)} /></>;
}
function Capacity({ report, sku }: { report: QingyuR2Report; sku: R2Sku }) { return <>{sku.capacity === null ? '单瓶容量未核实' : `${formatNumber(r2Value(report, sku.capacity))}ml/瓶`}{sku.packCount !== null && ` · ${formatNumber(r2Value(report, sku.packCount))}瓶装`}</>; }
function QuoteAmount({ report, quote }: { report: QingyuR2Report; quote: R2Price }) {
  if (quote.kind === 'unknown') return <><strong>价格未核实</strong><p>{quote.reason}</p></>;
  const sku = byId(report.skus, quote.skuId); const amount = r2Value(report, quote.price); const count = sku.packCount === null ? null : r2Value(report, sku.packCount);
  return <><strong>¥{formatNumber(amount)}{count === null ? '（原文报价）' : count === 1 ? '/瓶' : `/${count}瓶装`}</strong>{count !== null && count > 1 && <p>折合 ¥{formatNumber(amount / count)}/瓶<br />原包装总价÷{count}瓶</p>}{count === null && <p>销售单位未核实，不能推算单瓶价。</p>}</>;
}
function isTargetPrice(report: QingyuR2Report, quote: R2Price): boolean {
  if (quote.kind !== 'priced') return false;
  const sku = byId(report.skus, quote.skuId);
  if (sku.packCount === null) return false;
  const perBottle = r2Value(report, quote.price) / r2Value(report, sku.packCount);
  return perBottle >= 6 && perBottle <= 8;
}
function PriceMap({ report, openRefs }: { report: QingyuR2Report; openRefs: OpenRefs }) {
  const natures: R2Price['priceNature'][] = ['observed-listing', 'promotion', 'brand-reported-launch', 'reported-price', 'unknown'];
  return <section className="qy-r2-price-map" aria-label="本次采样价格地图"><h4>本次采样价格与目标价带</h4><p className="qy-r2-price-scope">{report.priceScope}</p>{report.prices.length === 0 && <p className="qy-r2-warning">尚无可用报价样本，不能建立价格排序。</p>}{priceCategories.map(category => {
    const quotes = report.prices.filter(p => byId(report.skus, p.skuId).category === category);
    if (!quotes.length) return null;
    return <div className="qy-r2-price-category" data-price-category={category} key={category}><h4>{category === 'strict-tea' ? '无糖即饮茶样本' : '邻近品类参照 · 不计入无糖茶样本'}</h4>{natures.map(nature => { const rows = quotes.filter(p => p.priceNature === nature); if (!rows.length) return null; return <div key={nature} data-price-nature={nature}><h5>{priceNatureLabels[nature]}</h5><div className="qy-r2-table-wrap"><table><caption>{priceNatureLabels[nature]}，逐条保留日期与条件</caption><thead><tr><th scope="col">产品与原规格</th><th scope="col">原报价与单瓶换算</th><th scope="col">时期、渠道与条件</th><th scope="col">价格出处</th></tr></thead><tbody>{rows.map(p => { const s = byId(report.skus, p.skuId); const source = byId(report.sources, p.sourceId); return <tr key={p.id} data-price-quote={p.id} data-target-band={isTargetPrice(report, p) || undefined}><th scope="row">{s.title}{isTargetPrice(report, p) && <span className="qy-r2-target-tag">题设6至8元/瓶参照</span>}<span>{s.categoryLabel}<br /><Capacity report={report} sku={s} /></span></th><td><QuoteAmount report={report} quote={p} /></td><td><p>报价时期 {p.quotedAt}</p><p>原文发布 {p.publishedAt ?? '页面未标日期'}</p><p>实际读取 {p.readAt}</p><p>渠道 {p.channel}</p><p className="qy-r2-price-condition">条件 {p.conditions}</p></td><td>{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a> : source.title}<p>{p.locator}</p><button type="button" className="qy-r2-link" onClick={() => openRefs('价格原值与报价范围', p.kind === 'priced' ? [p.price.datumId, ...s.datumIds] : [p.sourceId])}>原值与边界 ↗</button></td></tr>; })}</tbody></table></div></div>; })}</div>;
  })}</section>;
}
function PackagingCases({ report, ids, openImage }: { report: QingyuR2Report; ids: string[]; openImage: (product: R2Case) => void }) {
  return <>{priceCategories.map(category => {
    const categoryIds = ids.filter(id => byId(report.skus, byId(report.cases, id).skuId).category === category);
    if (!categoryIds.length) return null;
    const title = category === 'strict-tea' ? '同品类包装对照 · 无糖即饮茶样本' : '邻近品类包装参照 · 按适配理由借用';
    return <section className="qy-r2-packaging-group" data-packaging-category={category} key={category}><h4>{title}</h4><PackagingComparison report={report} ids={categoryIds} openImage={openImage} /><div className="qy-r2-cases">{categoryIds.map(id => <CaseCard key={id} product={byId(report.cases, id)} report={report} openImage={openImage} />)}</div></section>;
  })}</>;
}
function PackagingComparison({ report, ids, openImage }: { report: QingyuR2Report; ids: string[]; openImage: (product: R2Case) => void }) {
  return <div className="qy-r2-table-wrap"><table className="qy-r2-comparison"><caption>本组可见包装横向对照，结论仅覆盖实际观察样本</caption><thead><tr><th scope="col">样本与原规格</th><th scope="col">包装可见观察</th><th scope="col">选择理由与使用边界</th></tr></thead><tbody>{ids.map(id => { const c = byId(report.cases, id); const s = byId(report.skus, c.skuId); return <tr key={id}><th scope="row"><button type="button" className="qy-r2-link" onClick={() => openImage(c)}>{c.title}</button><span>{s.categoryLabel}<br /><Capacity report={report} sku={s} /></span></th><td>{c.observation}</td><td>{c.comparisonUse}<p className="qy-r2-note">{c.limits}</p></td></tr>; })}</tbody></table></div>;
}
function CaseCard({ report, product, openImage }: { report: QingyuR2Report; product: R2Case; openImage: (product: R2Case) => void }) {
  const image = byId(report.imageManifest, product.imageId); const sku = byId(report.skus, product.skuId);
  return <figure className="qy-r2-case" data-case={product.id}><button type="button" className="qy-r2-image-button" aria-label={`查看${product.title}原图与出处`} onClick={() => openImage(product)}><img src={image.path} alt={image.alt} loading="lazy" /></button><figcaption><span className="qy-r2-note">{image.identityLabel}</span><h4>{product.title}</h4><p className="qy-r2-note"><Capacity report={report} sku={sku} /></p>{product.transfer && <dl className="qy-r2-transfer"><div><dt>适配点</dt><dd>{product.transfer.match}</dd></div><div><dt>差异</dt><dd>{product.transfer.difference}</dd></div><div><dt>可借用</dt><dd>{product.transfer.use}</dd></div><div><dt>不能证明</dt><dd>{product.transfer.cannotProve}</dd></div></dl>}<button type="button" className="qy-r2-link" onClick={() => openImage(product)}>原图、身份与出处 ↗</button></figcaption></figure>;
}
function OriginalImage({ report, product }: { report: QingyuR2Report; product: R2Case }) {
  const image = byId(report.imageManifest, product.imageId); const source = byId(report.sources, image.sourceId); const sku = byId(report.skus, product.skuId);
  return <><img className="qy-r2-original" src={image.path} alt={image.alt} /><p className="qy-r2-kicker">{image.identityLabel}</p><h3>{product.title}</h3><p><Capacity report={report} sku={sku} /></p><p>{product.observation}</p><p><strong>对照用途</strong> {product.comparisonUse}</p><p className="qy-r2-note">{product.scope} · {product.limits}</p><p><a href={image.path} target="_blank" rel="noreferrer">打开完整原图 ↗</a></p><SourceDetails source={source} /><p>原件定位 {product.locator}</p>{product.priceQuoteIds.length > 0 && <div className="qy-r2-evidence-item"><h4>同款报价另列出处</h4>{product.priceQuoteIds.map(id => { const quote = byId(report.prices, id); return <div key={id}><p>{priceNatureLabels[quote.priceNature]} · {quote.quotedAt} · {quote.channel}</p><QuoteAmount report={report} quote={quote} /><p>{quote.conditions}</p><SourceDetails source={byId(report.sources, quote.sourceId)} /></div>; })}</div>}<EvidenceDetails report={report} ids={product.datumIds} /><details><summary>原件完整性</summary><p>SHA-256 {image.sha256}</p></details></>;
}
function SourceDetails({ source }: { source: QingyuSource }) {
  return <div className="qy-r2-evidence-item"><p className="qy-r2-kicker">{source.publisher}</p><h4>{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a> : source.title}</h4><p>{source.market} · {source.published ?? '页面未标发布日期'}</p><p>{source.dataPeriod ?? '未标数据时期'} · {source.population}</p><p>{source.method}</p><p className="qy-r2-note">{source.access} · 原件定位 {source.locator}</p><p className="qy-r2-note">{source.use}</p></div>;
}
function EvidenceDetails({ report, ids }: { report: QingyuR2Report; ids: string[] }) {
  const selected = new Set(ids); const datumIds = new Set<string>(); const sourceIds = new Set<string>();
  const collectDatum = (id: string) => { if (datumIds.has(id)) return; const d = byId(report.datums, id); datumIds.add(id); d.sourceIds.forEach(id => sourceIds.add(id)); d.derivedFrom.forEach(collectDatum); };
  report.findings.filter(f => selected.has(f.id)).forEach(f => { f.datumIds.forEach(collectDatum); f.sourceIds.forEach(id => sourceIds.add(id)); });
  report.gaps.filter(g => selected.has(g.id)).forEach(g => g.sourceIds.forEach(id => sourceIds.add(id)));
  report.datums.filter(d => selected.has(d.id)).forEach(d => collectDatum(d.id));
  report.sources.filter(s => selected.has(s.id)).forEach(s => sourceIds.add(s.id));
  return <>{report.findings.filter(f => selected.has(f.id)).map(f => <div className="qy-r2-evidence-item" key={f.id}><p className="qy-r2-kicker">{r2EvidenceLabels[f.kind]}</p><h3>{f.title}</h3><p>{f.text}</p><p>{f.implication}</p><p className="qy-r2-note">{f.scope} · 原件定位 {f.locator}</p></div>)}{report.gaps.filter(g => selected.has(g.id)).map(g => <div className="qy-r2-evidence-item" key={g.id}><h3>待补 · {g.title}</h3><p>{g.text}</p><p>{g.consequence}</p><p className="qy-r2-note">{g.scope} · 补查定位 {g.locator}</p></div>)}{report.datums.filter(d => datumIds.has(d.id)).map(d => <div className="qy-r2-evidence-item" key={d.id}><p className="qy-r2-kicker">{r2EvidenceLabels[d.evidenceType]}</p><p>{d.text}</p>{typeof d.value === 'number' && <p><strong>{formatNumber(d.value)} {d.unit}</strong></p>}<p>{d.basis}</p><p className="qy-r2-note">{d.scope.market} · {d.scope.period} · {d.scope.population}</p><p className="qy-r2-note">原件定位 {d.locator} · {d.limits}</p></div>)}{report.sources.filter(s => sourceIds.has(s.id)).map(s => <SourceDetails source={s} key={s.id} />)}</>;
}
