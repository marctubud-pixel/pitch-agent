import { useState } from 'react';
import { Drawer } from '../Drawer';
import { BarChart, PriceStrengthChart } from './charts';
import { datumFor, findingFor, productsFor, sourceIdsFor, type CaseFigure, type CaseProduct, type CaseReport, type CaseResolution } from './report';
import '../../styles/research-case.css';

type EvidenceSelection = { kind: 'references'; title: string; ids: string[] } | { kind: 'image'; product: CaseProduct };
type OpenEvidence = (selection: EvidenceSelection) => void;

function formatValue(value: number, decimals = 2) { return Number.isInteger(value) ? String(value) : value.toFixed(decimals).replace(/0+$/, '').replace(/\.$/, ''); }

export function AuthoredCaseSlot({ result, recheck }: { result: CaseResolution; recheck?: { pending: boolean; run: () => void } }) {
  const [evidence, setEvidence] = useState<EvidenceSelection | null>(null);
  if (result.kind === 'unavailable') return <section className="research-case" data-case-status={result.reason} aria-label="露玛公开资料案例状态"><p className="rc-notice" role="status">{result.message}</p>{result.reason === 'snapshot-mismatch' && recheck && <button type="button" className="btn btn--secondary btn--sm" disabled={recheck.pending} onClick={recheck.run}>{recheck.pending ? '正在重新核对' : '重新核对当前记录'}</button>}</section>;
  const { report, currency, historicalBrief } = result;
  return <article className="research-case" data-case-report={report.id} data-case-status={currency.kind} aria-labelledby="rc-report-title">
    <header className="rc-cover"><div><p className="rc-kicker">公开资料研究 · 案例分析</p><h2 id="rc-report-title">{report.title}</h2><p className="rc-intro">把“轻松”落实为好选口味、看清强度和直接备饮。五个章节从公开市场资料、真实竞品与包装观察推到三个待验证方向。</p></div><div className="rc-edition"><strong>研究案例 / 01</strong><span>{report.subtitle}</span><span>资料读取日 {report.authoredOn}</span><span>案例第{report.edition}版</span></div></header>
    <div className="rc-context"><span><strong>产品</strong> 250ml 铝罐气泡烈酒</span><span><strong>酒精度 / 售价</strong> 尚未确定</span><span><strong>任务依据</strong> 简报第{historicalBrief.version}版</span></div>
    <p className="rc-footnote">{report.scopeNote} 此案例由助手整理，不继承既有研究记录的核验或批准状态。</p>
    {currency.kind === 'historical' && <p className="rc-notice" data-tone="warn" data-case-historical="true">历史案例，依据简报第{historicalBrief.version}版。{currency.latestBriefVersion !== null ? `当前已保存简报为第${currency.latestBriefVersion}版，范围或状态已有变化。` : '当前简报状态尚未取得。'} 本文没有自动更新为当前任务结果。</p>}
    <nav className="rc-nav" aria-label="研究案例章节">{report.sections.map((chapter, index) => <a key={chapter.id} href={`#rc-chapter-${chapter.id}`} onClick={event => { event.preventDefault(); document.getElementById(`rc-chapter-${chapter.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}><span>{String(index + 1).padStart(2, '0')}</span>{chapter.title}</a>)}</nav>
    {report.sections.map((chapter, index) => {
      const headline = findingFor(report, chapter.headlineId);
      const paired = chapter.figures.every(figure => figure.kind === 'bars' || figure.kind === 'signed-bars');
      return <section key={chapter.id} className="rc-chapter" id={`rc-chapter-${chapter.id}`} aria-labelledby={`rc-heading-${chapter.id}`} data-chapter={chapter.id}>
        <header className="rc-chapter-head"><div><p className="rc-kicker">{String(index + 1).padStart(2, '0')} / 研究结果</p><h3 id={`rc-heading-${chapter.id}`}>{chapter.title}</h3></div><div><p className="rc-conclusion">{headline.text}</p><p className="rc-summary">{chapter.summary}</p><button type="button" className="rc-link" onClick={() => setEvidence({ kind: 'references', title: `${chapter.title} · 判断依据`, ids: [headline.id] })}>案例分析 · 查看判断依据与边界</button></div></header>
        <div className={paired ? 'rc-grid-two' : 'rc-exhibits'}>{chapter.figures.map(figure => <CaseExhibit key={figure.id} figure={figure} report={report} onEvidence={setEvidence} />)}</div>
        {chapter.findingIds.length > 0 && <div className="rc-chapter-findings">{chapter.findingIds.map(id => {
          const finding = findingFor(report, id);
          return <aside className="rc-insight" key={id}><p className="rc-kicker">{finding.kind === 'public-fact' ? '公开资料更新' : '案例分析'}</p><p>{finding.text}</p><SourceLinks report={report} ids={[id]} onEvidence={setEvidence} /><button type="button" className="rc-link" onClick={() => setEvidence({ kind: 'references', title: '判断依据与边界', ids: [id] })}>查看依据与边界</button></aside>;
        })}</div>}
        {chapter.callouts.map(callout => { const datum = datumFor(report, callout.datumId); return <p className="rc-footnote" key={callout.datumId}>{callout.text} <strong>{formatValue(datum.value)}%</strong>。口径为{datum.population}，不代表消费者偏好。<SourceLinks report={report} ids={[datum.id]} onEvidence={setEvidence} /></p>; })}
      </section>;
    })}
    <details className="rc-sources"><summary>全部公开来源与案例设定 · {report.sources.length}份资料</summary><ul className="rc-source-list">{report.sources.map(source => <li key={source.id} id={`rc-source-${source.id}`}><h4>{source.id} · {source.publisher} · <a href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a></h4><p>{source.geography} · {source.published ? `发布 ${source.published}` : '页面未标发布日期'} · 读取 {source.accessedOn}</p><p>{source.method}</p><p>{source.limitations.join(' ')}</p></li>)}</ul><ul className="rc-source-list">{report.assumptions.map(assumption => <li key={assumption.id}><h4>{assumption.kind === 'brief' ? '任务卡条件' : '案例设定'}</h4><p>{assumption.text}</p><p>{assumption.kind === 'case-assumption' ? assumption.reason : '依据已保存的历史任务卡。'}</p></li>)}</ul></details>
    <details className="rc-binding"><summary>案例身份与历史绑定</summary><p>公开资料案例研究 · 案例第{report.edition}版 · 整理日 {report.authoredOn}</p><p>依据任务卡第{report.binding.expectedHead.briefVersion}版与原研究第{report.binding.expectedHead.version}版的历史范围整理。此案例为独立只读资料，不是原记录生成、核验或批准的产物。</p></details>
    <Drawer open={evidence !== null} onClose={() => setEvidence(null)} title={evidence?.kind === 'image' ? `${evidence.product.name} · 包装原图与出处` : evidence?.title ?? '公开资料与案例依据'}>
      {evidence && <div className="research-case rc-evidence">{evidence.kind === 'image' ? <><img className="rc-evidence-image" src={evidence.product.image} alt={`${evidence.product.name} 原始商品图`} /><h3>{evidence.product.name}</h3><p>{evidence.product.visual}</p><p className="rc-footnote">{evidence.product.caveat} 图片版权归品牌与零售商，仅作有出处的包装参考，未裁切、改色或重绘。</p><a href={evidence.product.url} target="_blank" rel="noreferrer">查看 Tesco 原始商品页 ↗</a><EvidenceDetails report={report} ids={[evidence.product.observationId, ...Object.values(evidence.product.datumIds)]} /></> : <EvidenceDetails report={report} ids={evidence.ids} />}</div>}
    </Drawer>
  </article>;
}

function SourceLinks({ report, ids, onEvidence }: { report: CaseReport; ids: string[]; onEvidence: OpenEvidence }) {
  return <span className="rc-source-links">{sourceIdsFor(report, ids).map(id => { const source = report.sources.find(item => item.id === id); return source && <button type="button" key={id} className="rc-link" onClick={() => onEvidence({ kind: 'references', title: `${id} · ${source.publisher} · 来源详情`, ids: [id] })}>[{id}] {source.publisher}</button>; })}</span>;
}

function figurePremises(figure: CaseFigure, report: CaseReport): string[] {
  switch (figure.kind) {
    case 'signed-bars':
    case 'bars': return figure.datumIds;
    case 'segments': return report.segments.filter(segment => figure.segmentIds.includes(segment.id)).flatMap(segment => segment.premiseIds);
    case 'scatter':
    case 'products': return productsFor(report, figure.productIds).flatMap(product => Object.values(product.datumIds));
    case 'references':
    case 'packaging-matrix': return productsFor(report, figure.productIds).map(product => product.observationId);
    case 'hierarchy':
    case 'chain': return figure.steps.flatMap(step => step.premiseIds);
    case 'directions': return figure.items.flatMap(direction => direction.premiseIds);
    default: { const exhaustive: never = figure; return exhaustive; }
  }
}

function CaseExhibit({ figure, report, onEvidence }: { figure: CaseFigure; report: CaseReport; onEvidence: OpenEvidence }) {
  const ids = figurePremises(figure, report);
  return <figure className={`rc-figure rc-figure--${figure.kind}`} data-exhibit={figure.id} aria-labelledby={`rc-exhibit-${figure.id}`}>
    <figcaption><p className="rc-kicker">{figure.kind === 'bars' || figure.kind === 'signed-bars' || figure.kind === 'scatter' || figure.kind === 'products' ? '公开数据' : figure.kind === 'references' || figure.kind === 'packaging-matrix' ? '包装参考与观察' : '案例分析'}</p><h4 id={`rc-exhibit-${figure.id}`}>{figure.title}</h4><p className="rc-figure-subtitle">{figure.description}</p></figcaption>
    <FigureContent figure={figure} report={report} onEvidence={onEvidence} />
    <p className="rc-footnote">{figure.note}</p><SourceLinks report={report} ids={ids} onEvidence={onEvidence} /><button type="button" className="rc-link" onClick={() => onEvidence({ kind: 'references', title: `${figure.title} · 来源与推导`, ids })}>查看来源、口径与{figure.kind === 'chain' || figure.kind === 'directions' || figure.kind === 'hierarchy' || figure.kind === 'segments' ? '推导前提' : '数据记录'}</button>
  </figure>;
}

function FigureContent({ figure, report, onEvidence }: { figure: CaseFigure; report: CaseReport; onEvidence: OpenEvidence }) {
  switch (figure.kind) {
    case 'signed-bars':
    case 'bars': return <><p className="rc-chart-unit">{figure.unit}</p><BarChart title={figure.title} rows={figure.datumIds.map(id => datumFor(report, id))} signed={figure.kind === 'signed-bars'} min={figure.kind === 'signed-bars' ? figure.min : 0} max={figure.max} /></>;
    case 'scatter': return <PriceStrengthChart title={figure.title} points={productsFor(report, figure.productIds).map(product => ({ id: product.id, label: product.id === 'gordons-zero' ? "Gordon’s 0.0" : product.name.split(' ').slice(0, product.id === 'whiteclaw' ? 2 : 1).join(' '), price: datumFor(report, product.datumIds.price).value, abv: datumFor(report, product.datumIds.abv).value }))} maxPrice={figure.xMax} maxAbv={figure.yMax} />;
    case 'products': return <div className="rc-table-wrap"><table className="rc-competitor-table"><caption>五款SKU · Tesco 单罐标价快照</caption><thead><tr><th scope="col">SKU / 饮品身份</th><th scope="col">容量 ml</th><th scope="col">ABV %</th><th scope="col">£ / 罐</th><th scope="col">£ / 100ml</th><th scope="col">页面状态 / 出处</th></tr></thead><tbody>{productsFor(report, figure.productIds).map(product => <tr key={product.id} data-product={product.id}><th scope="row">{product.name}<span className="rc-cell-note">{product.type}</span></th><td>{formatValue(datumFor(report, product.datumIds.volume).value)}</td><td>{formatValue(datumFor(report, product.datumIds.abv).value, 1)}</td><td>{datumFor(report, product.datumIds.price).value.toFixed(2)}</td><td>{datumFor(report, product.datumIds['unit-price']).value.toFixed(3)}<span className="rc-cell-note">按标价 ÷ 容量 × 100</span></td><td>{product.availability}<a className="rc-cell-note" href={product.url} target="_blank" rel="noreferrer">[{product.sourceId}] Tesco ↗</a></td></tr>)}</tbody></table></div>;
    case 'segments': return <div className="rc-segments">{figure.segmentIds.map(id => { const segment = report.segments.find(item => item.id === id); return segment && <article className="rc-segment" key={id}><p className="rc-kicker">需求情境 · 分析假设</p><h4>{segment.title}</h4><dl><dt>任务</dt><dd>{segment.task}</dd><dt>障碍假设</dt><dd>{segment.barrier}</dd><dt>包装应回答</dt><dd>{segment.packaging}</dd><dt>下一步验证</dt><dd>{segment.test}</dd></dl><button type="button" className="rc-link" onClick={() => onEvidence({ kind: 'references', title: `${segment.title} · 分析前提`, ids: segment.premiseIds })}>查看本情境的前提</button></article>; })}</div>;
    case 'references': return <div className="rc-packshots">{productsFor(report, figure.productIds).map(product => <figure className="rc-packshot" key={product.id}><button type="button" className="rc-packshot-open" onClick={() => onEvidence({ kind: 'image', product })} aria-label={`查看 ${product.name} 包装大图与来源`}><img src={product.image} alt={`${product.name} 原始罐身商品图`} loading="lazy" /></button><figcaption><h4>{product.name}</h4><p>{product.visual}</p><a href={product.url} target="_blank" rel="noreferrer">[{product.sourceId}] Tesco 原图出处 ↗</a></figcaption></figure>)}</div>;
    case 'packaging-matrix': return <div className="rc-table-wrap"><table><caption>从包装观察到信息表达</caption><thead><tr><th scope="col">所选SKU</th><th scope="col">可见视觉线索</th><th scope="col">传达的信息 · 分析</th><th scope="col">观察边界</th></tr></thead><tbody>{productsFor(report, figure.productIds).map(product => <tr key={product.id}><th scope="row">{product.name}<button type="button" className="rc-link rc-cell-note" onClick={() => onEvidence({ kind: 'image', product })}>查看原图与出处 [{product.sourceId}]</button></th><td>{product.visual}</td><td>{product.signal}</td><td>{product.caveat}</td></tr>)}</tbody></table></div>;
    case 'hierarchy':
    case 'chain': return <div className="rc-chain">{figure.steps.map((step, index) => <div key={step.label}><p className="rc-kicker">{String(index + 1).padStart(2, '0')} / {figure.kind === 'hierarchy' ? '信息层级建议' : '案例推导'}</p><h4>{step.label}</h4><p>{step.text}</p><button type="button" className="rc-link" onClick={() => onEvidence({ kind: 'references', title: `${step.label} · 推导前提`, ids: step.premiseIds })}>查看此步前提</button></div>)}</div>;
    case 'directions': return <div className="rc-directions">{figure.items.map((direction, index) => <article className="rc-direction" key={direction.id}><p className="rc-kicker">方向 {String.fromCharCode(65 + index)} · 待验证</p><h4>{direction.title}</h4><p><strong>视觉动作</strong>{direction.visual}</p><p><strong>依据与取舍</strong>{direction.because}</p><p><strong>验证任务</strong>{direction.test}</p><button type="button" className="rc-link" onClick={() => onEvidence({ kind: 'references', title: `${direction.title} · 推导前提`, ids: direction.premiseIds })}>查看方向前提</button></article>)}</div>;
    default: { const exhaustive: never = figure; return exhaustive; }
  }
}

function EvidenceDetails({ report, ids }: { report: CaseReport; ids: string[] }) {
  const collected = new Set<string>();
  const collect = (id: string) => {
    if (collected.has(id)) return;
    collected.add(id);
    const finding = report.findings.find(item => item.id === id);
    const datum = report.datums.find(item => item.id === id);
    if (finding?.kind === 'analysis') finding.premiseIds.forEach(collect);
    if (datum?.basis === 'calculated') datum.inputDatumIds.forEach(collect);
  };
  ids.forEach(collect);
  const datums = report.datums.filter(item => collected.has(item.id));
  const findings = report.findings.filter(item => collected.has(item.id));
  const assumptions = report.assumptions.filter(item => collected.has(item.id));
  const sourceIds = sourceIdsFor(report, [...collected]);
  return <div className="rc-evidence-details">
    {findings.map(finding => <div className="rc-evidence-item" key={finding.id}><p className="rc-kicker">{finding.kind === 'analysis' ? '案例分析' : finding.context.kind === 'inspected-image' ? '已检查商品图 · 包装观察' : '公开事实'}</p><p>{finding.text}</p>{finding.kind === 'public-fact' && finding.context.kind === 'inspected-image' && <><img className="rc-evidence-thumb" src={finding.context.image} alt={`${report.products.find(product => product.observationId === finding.id)?.name ?? '所选产品'} 对应的原始商品图`} /><p className="rc-footnote">观察定位 {finding.context.locator.replace(finding.context.image, '所示商品原图')} · 来源 [{finding.sourceIds.join('、')}]</p></>}{finding.limitations.length > 0 && <p className="rc-footnote">{finding.limitations.join(' ')}</p>}</div>)}
    {datums.length > 0 && <div className="rc-table-wrap"><table><caption>数值、口径与来源定位</caption><thead><tr><th scope="col">记录 / 数值</th><th scope="col">时间与范围</th><th scope="col">原始出处或计算</th></tr></thead><tbody>{datums.map(datum => <tr key={datum.id}><th scope="row">{datum.label}<strong>{formatValue(datum.value, datum.basis === 'calculated' ? 6 : 2)} {datum.unit}</strong></th><td>{datum.period} · {datum.geography}<span className="rc-cell-note">{datum.population}</span></td><td>{datum.basis === 'reported' ? <><span>[{datum.sourceId}]</span><span className="rc-cell-note">{datum.locator}</span></> : <><span>{datum.formula}</span><span className="rc-cell-note">输入 {datumFor(report, datum.inputDatumIds[0]).label}、{datumFor(report, datum.inputDatumIds[1]).label}</span><span className="rc-cell-note">{datumFor(report, datum.inputDatumIds[0]).value} ÷ {datumFor(report, datum.inputDatumIds[1]).value} × 100 = {formatValue(datum.value, 6)}</span></>}</td></tr>)}</tbody></table></div>}
    {assumptions.map(assumption => <div className="rc-evidence-item" key={assumption.id}><p className="rc-kicker">{assumption.kind === 'brief' ? '历史任务卡条件' : '案例范围假设'}</p><p>{assumption.text}</p>{assumption.kind === 'case-assumption' && <p className="rc-footnote">{assumption.reason}</p>}</div>)}
    {report.sources.filter(source => sourceIds.includes(source.id)).map(source => <div className="rc-evidence-item" key={source.id}><p className="rc-kicker">公开来源 [{source.id}] · {source.publisher}</p><h4><a href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a></h4><p className="rc-footnote">{source.geography} · {source.published ? `发布 ${source.published}` : '页面未标发布日期'} · 读取 {source.accessedOn}</p><p>{source.method}</p><p className="rc-footnote">{source.limitations.join(' ')}</p></div>)}
  </div>;
}
