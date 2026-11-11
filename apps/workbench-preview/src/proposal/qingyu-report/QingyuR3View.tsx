import { useEffect, useRef, useState } from 'react';
import { blockFactIds, blockFindingIds, blockSourceIds, r3FactIds, r3EvidenceLabels, r3ById, r3Quantity, type QingyuR3Report, type R3Block, type R3Source } from './report-r3';
import { buildQingyuR3Pptx, r3DownloadErrorMessage, saveR3Blob } from './pptx-r3';
import '../../styles/qingyu-report-r3.css';

type DownloadState = { kind: 'idle' } | { kind: 'pending' } | { kind: 'error'; message: string } | { kind: 'ready' };
const format = (value: number) => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value);
const kindLabels = { synthesis: '研究综合', 'public-finding': '公开研究发现', 'brief-condition': '虚构任务条件' };
export function QingyuR3View({ report, historical, latestBriefVersion }: { report: QingyuR3Report; historical: boolean; latestBriefVersion: number | null }) {
  const [download, setDownload] = useState<DownloadState>({ kind: 'idle' });
  const pending = useRef<AbortController | null>(null);
  const context = `${JSON.stringify(report)}|${historical}|${latestBriefVersion}`;
  const latestContext = useRef(context); latestContext.current = context;
  useEffect(() => { setDownload({ kind: 'idle' }); return () => { pending.current?.abort(); pending.current = null; }; }, [context]);
  async function downloadReport() {
    if (pending.current) return;
    const controller = new AbortController(), startedContext = context;
    pending.current = controller; setDownload({ kind: 'pending' });
    try {
      const blob = await buildQingyuR3Pptx(report, controller.signal, { historical, latestBriefVersion });
      controller.signal.throwIfAborted();
      if (latestContext.current !== startedContext || pending.current !== controller) return;
      saveR3Blob(blob, '青屿_公开资料调研报告_修订3_20261109.pptx');
      setDownload({ kind: 'ready' });
    } catch (error) {
      if (!controller.signal.aborted && pending.current === controller) setDownload({ kind: 'error', message: r3DownloadErrorMessage(error) });
    } finally { if (pending.current === controller) pending.current = null; }
  }
  return <article className="qy-r3" data-case-report={report.id} data-report-revision="3" aria-labelledby="qy-r3-title">
    <header className="qy-r3-cover"><div><p className="qy-r3-eyebrow">公开资料研究 · 修订3</p><h2 id="qy-r3-title">{report.title}</h2><p className="qy-r3-lead">{report.lead}</p></div><div className="qy-r3-edition"><strong>{report.status}</strong><span>资料截至 {report.asOf}</span><span>依据任务卡第1版</span></div></header>
    <p className="qy-r3-scope">{report.scopeNote}</p>
    {historical && <p className="qy-r3-warning" data-case-historical="true">本文依据历史任务卡第1版。当前任务卡{latestBriefVersion === null ? '尚未取得' : `为第${latestBriefVersion}版`}，本报告未自动套用到新版任务。</p>}
    <nav className="qy-r3-nav" aria-label="青屿修订3研究章节">{report.chapters.map((c, i) => <a key={c.id} href={`#qy-r3-${c.id}`} onClick={event => { event.preventDefault(); document.getElementById(`qy-r3-${c.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}><span>{String(i + 1).padStart(2, '0')}</span>{c.title}</a>)}</nav>
    {report.chapters.map((chapter, i) => <section className="qy-r3-chapter" id={`qy-r3-${chapter.id}`} data-chapter={chapter.id} key={chapter.id}>
      <header><p className="qy-r3-eyebrow">{String(i + 1).padStart(2, '0')} / {chapter.title}</p><h3>{chapter.headline}</h3><p className="qy-r3-summary">{chapter.summary}</p></header>
      {chapter.blocks.map(b => <ResearchBlock key={b.id} report={report} block={b} />)}
      {chapter.findingIds.length + chapter.gapIds.length > 0 && <details className="qy-r3-details"><summary>本章判断与待补范围</summary><References report={report} factIds={[]} findingIds={chapter.findingIds} gapIds={chapter.gapIds} /></details>}
    </section>)}
    <details className="qy-r3-details" data-method-notes="true"><summary>全部来源与适用限制 · {report.sources.length}份资料</summary>{report.sources.map(s => <Source source={s} key={s.id} />)}</details>
    <details className="qy-r3-details" data-revision-identity="true"><summary>报告身份与方法记录</summary><p>{report.subtitle}</p><p>当前展示为独立编写的公开资料报告·修订3。关联项目保存的研究记录仍为研究第1版，依据任务卡第1版。本文不表示研究已批准或已进入策略。</p><p>采用调研方法 {report.origin.skillRevision}。原研究头 {report.binding.storedArtifactId}。</p><p>可编辑报告中的文字、图表数据与颜色、形状及图片分别保留原生对象。原产品照片中的文字仍是图像像素。</p></details>
    <footer className="qy-r3-download" data-report-download="true"><div><strong>整份调研报告</strong><p>可编辑PPTX · 含数据、独立图片、来源附录与研究限制</p></div><button className="btn btn--primary" type="button" disabled={download.kind === 'pending'} onClick={() => void downloadReport()}>{download.kind === 'pending' ? '正在核对原图并生成报告…' : '下载调研报告'}</button><p role={download.kind === 'error' ? 'alert' : 'status'} aria-live="polite">{download.kind === 'error' ? `${download.message}。请再次点击下载调研报告重试。` : download.kind === 'ready' ? '报告已交给浏览器下载。' : download.kind === 'pending' ? '请等待，全部资源核对完成后下载。' : ''}</p></footer>
  </article>;
}

function ResearchBlock({ report, block: b }: { report: QingyuR3Report; block: R3Block }) {
  const factIds = blockFactIds(report, b), findingIds = blockFindingIds(b), gapIds = [...b.gapIds, ...(b.kind === 'cards' ? b.items.flatMap(i => i.gapIds) : [])];
  return <section className={`qy-r3-block qy-r3-block--${b.kind}`} data-block={b.id} data-block-kind={b.kind}>
    <header><h4>{b.title}</h4>{b.subtitle && <p>{b.subtitle}</p>}</header>
    <p className="qy-r3-measure">{b.kind === 'chart' && <>单位 {b.unit} · </>}{b.scope}</p>
    {b.kind === 'chart' ? <Chart report={report} block={b} /> : b.kind === 'cards' ? <div className="qy-r3-cards">{b.items.map((item, i) => <div className="qy-r3-card" key={i}><h5>{item.label}</h5><References report={report} factIds={item.factIds} findingIds={item.findingIds} gapIds={item.gapIds} compact /></div>)}</div> : b.kind === 'comparison' ? <div className="qy-r3-table-wrap"><table><thead><tr><th scope="col">样本 / 项目</th>{b.columns.map((c, i) => <th scope="col" key={i}>{c}</th>)}</tr></thead><tbody>{b.rows.map((row, i) => <tr key={i}><th scope="row">{row.label}</th>{row.cells.map((cell, j) => <td key={j}>{cell.factIds.map(id => <p key={id}>{r3ById(report.facts, id).text}</p>)}</td>)}</tr>)}</tbody></table></div> : <div className="qy-r3-products">{b.mediaIds.map(id => { const m = r3ById(report.media, id); return <figure key={id} data-product-media={id}><a href={m.path} target="_blank" rel="noreferrer" aria-label={`查看${m.title}完整原图`}><img src={m.path} alt={m.alt} width={m.width} height={m.height} loading="lazy" /></a><figcaption><span className="qy-r3-eyebrow">{m.identity}</span><h5>{m.title}</h5><p>{m.sku} · {m.capacity}</p>{b.observations.filter(o => o.mediaId === id).flatMap(o => o.factIds).map(f => <p key={f}>{r3ById(report.facts, f).text}</p>)}<a href={m.sourceUrl} target="_blank" rel="noreferrer">原件出处 ↗</a></figcaption></figure>; })}</div>}
    {b.caveat && <p className="qy-r3-note qy-r3-caveat">{b.caveat}</p>}
    <details className="qy-r3-details"><summary>来源、方法与完整明细</summary><p>{b.method}</p>{b.kind === 'products' && b.mediaIds.map(id => { const m = r3ById(report.media, id); return <div key={id} className="qy-r3-reference" data-media-details={id}><h5>{m.title} · 原件边界</h5><p>{m.limits}</p><p className="qy-r3-note">SHA-256 {m.sha256}</p></div>; })}<References report={report} factIds={factIds} findingIds={[...new Set(findingIds)]} gapIds={[...new Set(gapIds)]} />{blockSourceIds(report, b).map(id => <Source key={id} source={r3ById(report.sources, id)} />)}</details>
  </section>;
}
function Chart({ report, block: b }: { report: QingyuR3Report; block: Extract<R3Block, { kind: 'chart' }> }) {
  const values = b.rows.map(r => r3Quantity(report, r.factId).value), min = Math.min(0, ...values), max = Math.max(1, ...values), range = max - min;
  return <figure className="qy-r3-chart"><figcaption className="qy-r3-note">{r3Quantity(report, b.rows[0]?.factId ?? '').basis}</figcaption>{b.chartType === 'bar' ? <div className="qy-r3-bars" role="img" aria-label={b.rows.map((r, i) => `${r.label} ${values[i]}${b.unit}`).join('；')}>{b.rows.map((row, i) => <div className="qy-r3-bar-row" key={row.factId}><span>{row.label}</span><div className="qy-r3-bar-track"><span style={{ marginLeft: `${(Math.min(values[i] ?? 0, 0) - min) / range * 100}%`, width: `${Math.abs(values[i] ?? 0) / range * 100}%` }} /></div><strong>{format(values[i] ?? 0)}<small>{b.unit}</small></strong></div>)}</div> : <><svg className="qy-r3-line" viewBox="0 0 900 300" role="img" aria-label={b.rows.map((r, i) => `${r.label} ${values[i]}${b.unit}`).join('；')}><line x1="60" y1="245" x2="850" y2="245" stroke="currentColor" /><polyline fill="none" stroke="var(--accent)" strokeWidth="4" points={values.map((v, i) => `${80 + i * 730 / Math.max(1, values.length - 1)},${225 - (v - min) / range * 180}`).join(' ')} />{b.rows.map((row, i) => { const x = 80 + i * 730 / Math.max(1, values.length - 1), y = 225 - ((values[i] ?? 0) - min) / range * 180; return <g key={row.factId}><circle cx={x} cy={y} r="6" fill="var(--accent)" /><text x={x} y={y - 16} textAnchor="middle">{format(values[i] ?? 0)}{b.unit}</text><text x={x} y={280} textAnchor="middle">{row.label}</text></g>; })}</svg></>}<p className="qy-r3-note">数轴从 {format(min)} 至 {format(max)}{b.unit}。{b.chartType === 'bar' ? '各项独立展示，不作堆叠或相加。' : '连线只用于本图明确的同口径序列。'}</p></figure>;
}
function References({ report, factIds, findingIds, gapIds, compact = false }: { report: QingyuR3Report; factIds: string[]; findingIds: string[]; gapIds: string[]; compact?: boolean }) {
  const selectedFactIds = compact ? factIds : r3FactIds(report, factIds, findingIds);
  return <>{selectedFactIds.map(id => { const f = r3ById(report.facts, id); return <div className="qy-r3-reference" key={id}><p>{f.text}</p>{f.quantity && <p className={compact ? 'qy-r3-card-quantity' : undefined}><strong>{format(f.quantity.value)}{f.quantity.unit}</strong> <span className="qy-r3-note">{f.quantity.basis}</span></p>}{!compact && <><p className="qy-r3-note">{r3EvidenceLabels[f.evidenceType]} · {f.scope}<br />定位 {f.locator} · {f.sourceIds.join('、')}<br />{f.limits}</p></>}</div>; })}{findingIds.map(id => { const f = r3ById(report.findings, id); return <div className="qy-r3-reference" key={id}>{!compact && <p className="qy-r3-eyebrow">{kindLabels[f.kind]}</p>}<strong>{f.title}</strong><p>{f.text}</p>{!compact && <p className="qy-r3-note">{f.scope} · {f.limits}</p>}</div>; })}{gapIds.map(id => { const g = r3ById(report.gaps, id); return <div className="qy-r3-gap" key={id}><strong>待补 · {g.title}</strong><p>{g.text}</p><p className="qy-r3-note">{g.consequence}</p></div>; })}</>;
}
function Source({ source: s }: { source: R3Source }) { return <div className="qy-r3-source"><h5>{s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.title} ↗</a> : s.title}</h5><p>{s.publisher} · {s.published ?? '未标发布日期'} · {s.id}</p><p>{s.dataPeriod} · {s.market} · {s.population}</p><p>{s.method}</p><p className="qy-r3-note">读取 {s.access} · 定位 {s.locator}<br />{s.limits}</p></div>; }
