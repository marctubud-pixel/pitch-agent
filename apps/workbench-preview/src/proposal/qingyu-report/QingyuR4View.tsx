import { useEffect, useRef, useState } from 'react';
import { r3EvidenceLabels, type R3Source } from './report-r3';
import { r4BoardEvidence, r4ById, r4ChapterEvidence, r4ChartSeries, r4EvidenceText, r4Quantity, type QingyuR4Report, type R4Board, type R4Chart, type R4Evidence, type R4EvidenceClosure, type R4Media } from './report-r4';
import { buildQingyuR4Pptx } from './pptx-r4';
import { r3DownloadErrorMessage, saveR3Blob } from './pptx-r3';
import '../../styles/qingyu-report-r4.css';

type DownloadState = { kind: 'idle' } | { kind: 'pending' } | { kind: 'ready' } | { kind: 'error'; message: string };
const format = (value: number) => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value);
const dimensionLabels = { market: '市场', people: '人群', competition: '竞争', product: '本品' };
export function QingyuR4View({ report, historical, latestBriefVersion }: { report: QingyuR4Report; historical: boolean; latestBriefVersion: number | null }) {
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
      const blob = await buildQingyuR4Pptx(report, controller.signal, { historical, latestBriefVersion });
      controller.signal.throwIfAborted();
      if (latestContext.current !== startedContext || pending.current !== controller) return;
      saveR3Blob(blob, '青屿_公开资料调研报告_修订4_20261109.pptx');
      setDownload({ kind: 'ready' });
    } catch (error) {
      if (!controller.signal.aborted && pending.current === controller && latestContext.current === startedContext) setDownload({ kind: 'error', message: r3DownloadErrorMessage(error) });
    } finally { if (pending.current === controller) pending.current = null; }
  }
  return <article className="qy-r4" data-case-report={report.id} data-report-revision="4" aria-labelledby="qy-r4-title">
    <header className="qy-r4-cover"><div><p className="qy-r4-eyebrow">青屿 · 公开资料研究 · 修订4</p><h2 id="qy-r4-title">{report.title}</h2><p className="qy-r4-lead">{report.lead}</p></div><div className="qy-r4-edition"><strong>{report.status}</strong><span>资料截至 {report.asOf}</span><span>依据任务卡第1版</span></div></header>
    <p className="qy-r4-note qy-r4-scope">{report.scopeNote}</p>
    {historical && <p className="qy-r4-warning" data-case-historical="true">本文依据历史任务卡第1版。当前任务卡{latestBriefVersion === null ? '尚未取得' : `为第${latestBriefVersion}版`}，本报告未自动套用到新版任务。</p>}
    <nav className="qy-r4-nav" aria-label="青屿修订4研究章节">{report.chapters.map((c, i) => <a key={c.id} href={`#qy-r4-${c.id}`} onClick={event => { event.preventDefault(); document.getElementById(`qy-r4-${c.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}><span>{String(i + 1).padStart(2, '0')}</span>{c.title}</a>)}</nav>
    {report.chapters.map((chapter, i) => <section className="qy-r4-chapter" id={`qy-r4-${chapter.id}`} data-chapter={chapter.id} key={chapter.id}>
      <header className="qy-r4-chapter-head"><span>{String(i + 1).padStart(2, '0')}</span><h3>{chapter.title}</h3></header>
      {chapter.boards.map(board => <ResearchBoard key={board.id} report={report} board={board} />)}
      <details className="qy-r4-details" data-chapter-details={chapter.id}><summary>本章完整依据、方法与待补范围</summary><EvidenceDetails evidence={r4ChapterEvidence(report, chapter)} />{chapter.boards.flatMap(b => b.kind === 'people' ? [b.sceneId] : b.kind === 'packaging' ? b.samples.map(s => s.mediaId) : []).map(id => { const m = r4ById(report.media, id); return <div key={id} className="qy-r4-reference"><strong>{m.title} · {m.role === 'generated-scenario' ? '生成情境示意' : '原产品物料'}</strong><p>{m.identity}。{m.limits}</p><p className="qy-r4-note">SHA-256 {m.sha256}{m.role === 'generated-scenario' ? ` · ${m.generationReceipt}` : ''}</p></div>; })}</details>
    </section>)}
    <details className="qy-r4-details" data-method-notes="true"><summary>全部来源与适用限制 · {report.sources.length}份资料</summary>{report.sources.map(s => <Source source={s} key={s.id} />)}</details>
    <details className="qy-r4-details" data-revision-identity="true"><summary>报告身份与方法记录</summary><p>{report.subtitle}</p><p>独立公开资料报告·修订4。项目保存的研究头仍为研究第1版，依据任务卡第1版，本文不表示研究已批准或已进入策略。</p><p>采用调研方法 {report.origin.skillRevision}。文字、形状、图表及其数据可分别编辑，照片内文字仍为图像像素。情境示意只解释题设，不是消费者研究证据。</p></details>
    <footer className="qy-r4-download" data-report-download="true"><div><strong>整份调研报告</strong><p>可编辑PPTX · 图表及数据、独立原图、完整备注与来源附录</p></div><button className="btn btn--primary" type="button" disabled={download.kind === 'pending'} onClick={() => void downloadReport()}>{download.kind === 'pending' ? '正在核对图片并生成报告…' : '下载调研报告'}</button><p role={download.kind === 'error' ? 'alert' : 'status'} aria-live="polite">{download.kind === 'error' ? `${download.message}。请再次点击下载调研报告重试。` : download.kind === 'ready' ? '报告已交给浏览器下载。' : download.kind === 'pending' ? '全部图片身份核对完成后下载。' : ''}</p></footer>
  </article>;
}
function ResearchBoard({ report, board: b }: { report: QingyuR4Report; board: R4Board }) {
  const conclusion = r4ById(report.findings, b.conclusionId), sources = r4BoardEvidence(report, b).sources;
  return <section className={`qy-r4-board qy-r4-board--${b.kind}`} data-board={b.id} data-board-kind={b.kind}>
    <header className="qy-r4-board-head">{(b.kind === 'landscape' || b.kind === 'packaging') && <p className="qy-r4-eyebrow">{b.title}</p>}{b.kind !== 'synthesis' && <><h4>{conclusion.title}</h4><p className="qy-r4-conclusion">{conclusion.text}</p></>}</header>
    <BoardBody report={report} board={b} />
    <p className="qy-r4-board-source">{b.scope}{b.caveat && ` · ${b.caveat}`}<br />依据与来源：{sources.length}份资料，见本章下方展开。</p>
  </section>;
}
function BoardBody({ report, board: b }: { report: QingyuR4Report; board: R4Board }) {
  switch (b.kind) {
    case 'market': { const fact = r4ById(report.facts, b.heroFactId), q = r4Quantity(report, b.heroFactId); return <div className="qy-r4-market"><div className="qy-r4-hero"><strong>{format(q.value)}<small>{q.unit}</small></strong><p>{fact.text}</p><span className="qy-r4-note">{q.basis}</span></div><div className="qy-r4-market-charts">{b.charts.map(c => <Chart report={report} chart={c} key={c.id} />)}</div></div>; }
    case 'people': return <div className="qy-r4-people"><figure className="qy-r4-scene"><MediaImage media={r4ById(report.media, b.sceneId)} /><figcaption>生成情境示意 · 依据虚构任务条件，不代表实测行为</figcaption></figure><div className="qy-r4-people-information"><div className="qy-r4-profiles">{b.groups.map((g, i) => <div key={i}><h5>{g.label}</h5><EvidenceText report={report} evidence={g.evidence} /></div>)}</div><Chart report={report} chart={b.chart} /></div></div>;
    case 'landscape': return <><div className="qy-r4-competition-groups" aria-label="七品牌公开表达分组">{b.groupFindingIds.map(id => { const g = r4ById(report.findings, id); return <div key={id}><strong>{g.title}</strong><p>{g.text}</p></div>; })}</div><div className="qy-r4-table-wrap"><table><thead><tr><th scope="col">代表品牌</th>{b.columns.map((c, i) => <th scope="col" key={i}>{c}</th>)}</tr></thead><tbody>{b.rows.map((r, i) => <tr key={i}><th scope="row">{r.label}</th>{r.cells.map((e, j) => <td key={j}><EvidenceText report={report} evidence={e} /></td>)}</tr>)}</tbody></table></div></>;
    case 'packaging': return <div className="qy-r4-packaging">{b.samples.map(s => { const m = r4ById(report.media, s.mediaId); return <figure className="qy-r4-sample" key={s.mediaId} data-product-media={s.mediaId}><a className="qy-r4-original" href={m.path} target="_blank" rel="noreferrer" aria-label={`查看${m.title}完整原图`}><MediaImage media={m} /></a><figcaption><h5>{m.title}</h5><p className="qy-r4-image-identity">{m.role === 'original-product' && <>{m.capacity} · </>}{m.identity}</p><dl>{s.cells.map((cell, i) => <div key={i}><dt>{b.columns[i]}</dt><dd><EvidenceText report={report} evidence={cell} /></dd></div>)}</dl><a className="qy-r4-note" href={m.path} target="_blank" rel="noreferrer">查看完整原图 ↗</a></figcaption></figure>; })}</div>;
    case 'conditions': return <div className="qy-r4-conditions"><div className="qy-r4-condition-labels"><span>题设条件</span><span>对研究与后续判断的含义</span></div>{b.items.map((item, i) => <div className="qy-r4-condition" key={i}><div><h5>{item.label}</h5><EvidenceText report={report} evidence={{ factIds: item.briefFactIds, findingIds: [] }} /></div><span className="qy-r4-arrow" aria-hidden="true">→</span><div><EvidenceText report={report} evidence={{ factIds: [], findingIds: item.assessmentFindingIds }} /></div></div>)}</div>;
    case 'synthesis': { const final = r4ById(report.findings, b.conclusionId); return <div className="qy-r4-synthesis"><div className="qy-r4-synthesis-inputs">{b.links.map(link => <div key={link.dimension}><span>{dimensionLabels[link.dimension]}</span><strong>{r4ById(report.findings, link.findingId).title}</strong></div>)}</div><div className="qy-r4-converge" aria-hidden="true">→</div><div className="qy-r4-synthesis-result"><span className="qy-r4-eyebrow">四维研究形成的问题</span><h4>{final.title}</h4><p>{final.text}</p><p className="qy-r4-note">前提与适用范围 · {final.scope}</p></div></div>; }
    default: { const exhaustive: never = b; return exhaustive; }
  }
}
function MediaImage({ media }: { media: R4Media }) { const [failed, setFailed] = useState(false); return failed ? <div className="qy-r4-image-unavailable" role="img" aria-label={media.alt}>{media.title}<br />图片暂未加载，可从原图链接重试。</div> : <img src={media.path} width={media.width} height={media.height} alt={media.alt} loading="lazy" onError={() => setFailed(true)} />; }
function EvidenceText({ report, evidence }: { report: QingyuR4Report; evidence: R4Evidence }) { return <>{r4EvidenceText(report, evidence).map((t, i) => <p key={i}>{t}</p>)}</>; }
function Chart({ report, chart: c }: { report: QingyuR4Report; chart: R4Chart }) {
  const series = r4ChartSeries(report, c), percentBar = c.kind === 'bar' && c.unit === '%', low = Math.min(0, ...series.values), high = percentBar ? 100 : Math.max(1, ...series.values), range = high - low;
  return <figure className={`qy-r4-chart qy-r4-chart--${c.kind}`} data-chart={c.id}><figcaption><h5>{c.title}</h5><p className="qy-r4-note">{series.basis}</p></figcaption>{c.kind === 'bar' ? <div className="qy-r4-bars">{c.rows.map((r, i) => <div key={r.factId}><span>{r.label}</span><div className="qy-r4-bar-track"><span style={{ marginLeft: `${(Math.min(series.values[i] ?? 0, 0) - low) / range * 100}%`, width: `${Math.abs(series.values[i] ?? 0) / range * 100}%` }} /></div><strong>{format(series.values[i] ?? 0)}<small>{c.unit}</small></strong></div>)}{percentBar && <div className="qy-r4-bar-axis" aria-hidden="true"><span /><div><span>0</span><span>100%</span></div><span /></div>}</div> : <svg className="qy-r4-line" viewBox="0 0 600 245" role="img" aria-label={c.rows.map((r, i) => `${r.label} ${series.values[i]}${c.unit}`).join('；')}><line x1="50" y1="195" x2="550" y2="195" className="qy-r4-grid" /><text x="10" y="198" className="qy-r4-axis">{low}</text><line x1="50" y1="70" x2="550" y2="70" className="qy-r4-grid" /><text x="10" y="73" className="qy-r4-axis">{format(high)}</text><polyline fill="none" stroke="var(--qy-blue)" strokeWidth="4" points={series.values.map((v, i) => `${80 + i * 430 / Math.max(1, series.values.length - 1)},${195 - (v - low) / range * 125}`).join(' ')} />{c.rows.map((r, i) => { const x = 80 + i * 430 / Math.max(1, series.values.length - 1), y = 195 - ((series.values[i] ?? 0) - low) / range * 125; return <g key={r.factId}><circle cx={x} cy={y} r="6" fill="var(--qy-blue)" /><text x={x} y={y - 18} textAnchor="middle" className="qy-r4-point">{format(series.values[i] ?? 0)}{c.unit}</text><text x={x} y="229" textAnchor="middle">{r.label}</text></g>; })}</svg>}{percentBar && <p className="qy-r4-note">百分比轴 0–100% · 各项独立，不相加</p>}</figure>;
}
function EvidenceDetails({ evidence: e }: { evidence: R4EvidenceClosure }) { return <>{e.findings.map(f => <div className="qy-r4-reference" key={f.id}><strong>{f.id} · {f.title}</strong><p>{f.text}</p><p className="qy-r4-note">{f.scope} · {f.limits} · 依据 {f.factIds.join('、')} {f.sourceIds.join('、')}</p></div>)}{e.facts.map(f => <div className="qy-r4-reference" key={f.id}><strong>{f.id} · {r3EvidenceLabels[f.evidenceType]}</strong><p>{f.text}</p>{f.quantity && <p>{format(f.quantity.value)}{f.quantity.unit} · {f.quantity.basis}</p>}<p className="qy-r4-note">{f.scope} · 定位 {f.locator} · {f.sourceIds.join('、')}<br />{f.limits}{f.derivedFrom.length > 0 && ` · 派生依据 ${f.derivedFrom.join('、')}`}</p></div>)}{e.gaps.map(g => <div className="qy-r4-reference" key={g.id}><strong>待补 · {g.title}</strong><p>{g.text}</p><p className="qy-r4-note">{g.consequence}</p></div>)}{e.sources.map(s => <Source source={s} key={s.id} />)}</>; }
function Source({ source: s }: { source: R3Source }) { return <div className="qy-r4-reference"><strong>{s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.id} · {s.title} ↗</a> : `${s.id} · ${s.title}`}</strong><p>{s.publisher} · {s.published ?? '未标日期'} · {s.dataPeriod}</p><p className="qy-r4-note">{s.market} · {s.population}<br />{s.method} · 定位 {s.locator} · 读取 {s.access}<br />{s.limits}</p></div>; }
