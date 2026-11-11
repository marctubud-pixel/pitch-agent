import { useRef } from 'react';
import type { Proposal } from '../../domain/proposal';
import { useServiceQuery } from '../../app/query';
import { DeckStudioViewer } from '../deck-studio';
import { StudioPreparationStatus, useStudioDownload, useStudioPreparation } from '../deck-studio-ui';
import { resolveQingyuLayout, type QingyuLayoutResult } from './preview';
import { prepareQingyuLayoutDeck } from './assemble';
import { bindFinalReview } from '../qingyu-final-review/record';
import { FinalReviewSummary } from '../qingyu-final-review/FinalReviewSummary';
import './layout.css';

type Presentation = 'layout' | 'delivery';

export function QingyuLayoutPreview({ proposal, presentation = 'layout' }: { proposal: Proposal; presentation?: Presentation }) {
  const pid = proposal.workbenchId;
  const research = useServiceQuery(`research:${pid}`, service => service.getResearchWorkspace(pid), { projectId: pid });
  const briefs = useServiceQuery(`research-case-briefs:${pid}`, service => service.getBriefHistory(pid), { projectId: pid });
  const retry = () => { research.refetch(); briefs.refetch(); };
  if (research.status === 'error' || briefs.status === 'error' || research.refreshError || briefs.refreshError) return <Unavailable message="研究或任务卡读取失败，当前稿下载已停用。" retry={retry} />;
  if (!research.data || !briefs.data || research.refreshing || briefs.refreshing) return <p role="status">正在核对研究与任务卡，准备当前排版…</p>;
  const result = resolveQingyuLayout({ proposal, workspace: research.data, history: briefs.data });
  if (result.kind === 'unavailable') return <Unavailable message={result.message} retry={retry} />;
  return <Available key={result.context} result={result} presentation={presentation} />;
}
function Unavailable({ message, retry }: { message: string; retry: () => void }) {
  return <section className="studio-status" role="alert"><p>{message}</p><button type="button" className="btn btn--secondary" onClick={retry}>重新核对依据</button></section>;
}
function Available({ result, presentation }: { result: Exclude<QingyuLayoutResult, { kind: 'unavailable' }>; presentation: Presentation }) {
  const article = useRef<HTMLElement>(null);
  const delivery = presentation === 'delivery';
  const prepared = useStudioPreparation(result.context, async signal => {
    const deck = await prepareQingyuLayoutDeck(result.input, signal);
    const review = await bindFinalReview({ result, deck, signal });
    return { deck, review };
  });
  const output = useStudioDownload(result.context);
  const download = <button type="button" className="btn btn--primary" disabled={prepared.state.kind !== 'ready' || output.state.kind === 'pending'} onClick={() => { if (prepared.state.kind === 'ready') void output.download(prepared.state.value.deck); }}>{output.state.kind === 'pending' ? '正在生成…' : delivery ? result.kind === 'historical' ? '下载历史演练稿' : '下载演练稿' : result.kind === 'historical' ? '下载历史排版稿' : '下载本地排版稿'}</button>;
  const selectPage = (index: number) => {
    article.current?.querySelector<HTMLButtonElement>(`.deck__strip li:nth-child(${index + 1}) button`)?.click();
    article.current?.querySelector<HTMLElement>('.deck__stage')?.focus();
  };
  return <article ref={article} className="qy-layout-preview" data-qingyu-layout={result.kind} data-presentation={presentation}>
    <header className="qy-layout-toolbar"><div><h2>{delivery ? '当前成稿' : '青屿 · 包装提案'}</h2><p>{delivery ? '青屿 · 演练稿 · 本地终审与正式流程分别记录' : '演练 · 本地排版预览 · 待人工终审'}{prepared.state.kind === 'ready' ? ` · ${prepared.state.value.deck.pages.length}页` : ''}</p></div>{!delivery && download}</header>
    {result.kind === 'historical' && <p className="qy-layout-history">历史任务卡第1版；当前任务卡{result.latestBriefVersion === null ? '未取得' : `为第${result.latestBriefVersion}版`}。本稿未自动套用到新版任务。</p>}
    <StudioPreparationStatus state={prepared.state} retry={prepared.retry} />
    {prepared.state.kind === 'ready' && <DeckStudioViewer deck={prepared.state.value.deck} />}
    {delivery && <>
      <section className="qy-delivery-review" aria-labelledby="qy-final-review">
        <h2 id="qy-final-review">终审结论与待改问题</h2>
        {prepared.state.kind === 'ready' ? <FinalReviewSummary binding={prepared.state.value.review} selectPage={selectPage} /> : prepared.state.kind === 'loading' ? <p role="status">正在核对当前稿与终审记录…</p> : <p role="status">终审记录尚未完成核对，请先重新准备成稿。</p>}
        <p className="small muted">比稿Agent组织终审；人类比稿负责人决定交付。</p>
        {(prepared.state.kind !== 'ready' || !['current', 'historical'].includes(prepared.state.value.review.kind)) && <details className="qy-layout-records"><summary>已知范围与待验证内容</summary>
          <p>研究仍待补；虎跑泉用水为演练设定。主图和样机为生成试稿，完整标签、文案落位与读图效果尚未验证。</p>
          <p>以上限制随稿保留，不表示已通过业务评审。在线编辑、保存与恢复验收继续暂缓。</p>
        </details>}
      </section>
      <details className="qy-layout-records qy-delivery-comparison"><summary>方向比较与原推荐</summary>
        <p>沿用当前稿中的比较与原推荐，推荐仅代表文字概念优先。</p>
        {prepared.state.kind === 'ready' && prepared.state.value.deck.pages.map((page, i) => ['qy-layout-compare', 'qy-layout-recommendation'].includes(page.id) && <button key={page.id} type="button" className="text-link" onClick={() => selectPage(i)}>查看第{i + 1}页 · {page.title}</button>)}
      </details>
    </>}
    <details className="qy-layout-records"><summary>目录与排版说明</summary>
      {prepared.state.kind === 'ready' && <ol className="qy-layout-directory">{prepared.state.value.deck.pages.map((page, i) => <li key={page.id}><button type="button" className="text-link" onClick={() => selectPage(i)}>{page.title}</button></li>)}</ol>}
      <p>沿用研究9页与策略3页原模型；生成试稿以独立图片呈现。文字、三圈与数据图表可编辑；图片内文字仍是像素。</p><p>研究待补，历史报价与题设分开使用。原推荐仅为文案概念优先，未表示用户选案或实图效果通过。完整来源与封存输入保留在PPT备注。</p>
    </details>
    {delivery && <section className="qy-delivery-export" aria-labelledby="qy-export"><div><h2 id="qy-export">交付</h2><p>当前仅可下载演练稿，正式交付尚未批准。</p></div>{download}</section>}
    <p role={output.state.kind === 'error' ? 'alert' : 'status'} aria-live="polite">{output.state.kind === 'error' ? output.state.message : output.state.kind === 'saved' ? '排版稿已交给浏览器下载。' : ''}</p>
  </article>;
}
