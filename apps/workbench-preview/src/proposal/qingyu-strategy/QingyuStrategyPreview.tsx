import { useServiceQuery } from '../../app/query';
import type { Proposal } from '../../domain/proposal';
import { resolveQingyuStrategyPreview, type StrategyPreviewResult } from './preview';
import { DeckStudioPage } from '../deck-studio/Viewer';
import { prepareStrategySummary, strategySummaryBoards, strategySummaryIdentity } from './summary';
import '../../styles/qingyu-report-r4.css';
import '../../styles/deck-studio-ui.css';
import { ClaimRecord } from './ClaimRecord';
import './strategy.css';

export function QingyuStrategyPreview({ proposal }: { proposal: Proposal }) {
  const pid = proposal.workbenchId;
  const ws = useServiceQuery(`research:${pid}`, service => service.getResearchWorkspace(pid), { projectId: pid });
  const briefs = useServiceQuery(`research-case-briefs:${pid}`, service => service.getBriefHistory(pid), { projectId: pid });
  const retry = () => { ws.refetch(); briefs.refetch(); };
  if (ws.status === 'error' || briefs.status === 'error') return <PreviewUnavailable message="研究或任务卡读取失败，暂不能核对策略依据。" retry={retry} />;
  if (!ws.data || !briefs.data) return <p className="qs-status" role="status">正在核对研究与任务卡依据…</p>;
  const result = resolveQingyuStrategyPreview({ proposal, workspace: ws.data, history: briefs.data });
  return <>
    {(ws.refreshing || briefs.refreshing) && <p className="qs-status" role="status">正在重新读取研究与任务卡，以下仍是上次成功读取的依据。</p>}
    {(ws.refreshError || briefs.refreshError) && <p className="qs-status" role="alert">刷新失败，以下保留上次成功读取的依据，尚未重新核对。<button type="button" className="text-link" onClick={retry}>重试读取依据</button></p>}
    <QingyuStrategyResult result={result} retry={retry} />
  </>;
}

function PreviewUnavailable({ message, retry }: { message: string; retry: () => void }) {
  return <section className="qs-status" data-strategy-status="unavailable" role="alert"><p>{message}</p><button type="button" className="btn btn--secondary btn--sm" onClick={retry}>重新核对依据</button></section>;
}

export function QingyuStrategyResult({ result, retry }: { result: StrategyPreviewResult; retry: () => void }) {
  if (result.kind === 'unavailable') return <PreviewUnavailable message={result.message} retry={retry} />;
  const { document, basis, brief, claims } = result.preview;
  let pages;
  try { pages = prepareStrategySummary(); }
  catch (error) { return <PreviewUnavailable message={error instanceof Error ? error.message : '策略图版准备失败，请重新核对依据。'} retry={retry} />; }
  return <article className="pw-strategy qs-strategy qs-analysis qy-r4 qy-studio" data-strategy-preview={strategySummaryIdentity.draftId} data-strategy-context={result.kind} data-strategy-status="owner-draft" aria-labelledby="qs-analysis-title">
    <header className="qy-r4-cover"><div>
      <p className="qy-r4-eyebrow">青屿 · 策略图版</p>
      <h2 id="qs-analysis-title">{strategySummaryIdentity.title}</h2>
      <p className="qy-r4-lead">从研究结论到方向交叉点，再到值得放大的产品特质。</p>
    </div><div className="qy-r4-edition"><strong>策略建议 · 待验证</strong><span>3页固定图版</span><span>依据任务卡第{brief.basisVersion}版</span></div></header>
    <p className="qy-r4-note">虚构案例。按策略负责人基础要求重新撰写；本稿未沿用旧稿的三方审查结论，正式策略未开始。</p>
    {result.kind === 'historical' && <aside className="qs-history" role="status"><strong>历史依据预览</strong><p>本稿基于任务卡第 {brief.basisVersion} 版。{result.latestBriefVersion === null ? '当前任务卡缺失。' : `最新任务卡为第 ${result.latestBriefVersion} 版。`}尚未按最新依据重新推演，请勿作为当前任务结论。</p></aside>}
    {pages.map((page, index) => <section className="qy-r4-chapter" data-strategy-section={page.chapter} key={page.id}>
      <header className="qy-r4-chapter-head"><span>{String(index + 1).padStart(2, '0')}</span><h3>{page.chapter}</h3></header>
      <figure className="studio-research-page" data-studio-board={page.id}><DeckStudioPage page={page} /><figcaption>{page.caption}</figcaption></figure>
    </section>)}
    <details className="qs-evidence"><summary>依据与历史</summary>
      <p>本稿要求：{strategySummaryIdentity.ownerBrief}</p>
      <dl><div><dt>本稿身份</dt><dd>{strategySummaryIdentity.draftId}</dd></div><div><dt>原研究</dt><dd>R4 · 原生成方法 {basis.research.origin.skillRevision} · 研究待补</dd></div><div><dt>任务依据</dt><dd>第 {brief.basisVersion} 版 · {brief.basisConfirmed ? '已确认' : '未确认'}；正式业务状态未变更。</dd></div></dl>
      <p>人群的25至34岁、城市办公者及选茶渠道来自原任务卡设定。产品来自用户补充 U-PRODUCT-01。虎跑与饮茶的文化联系仅为背景，不能作为消费者偏好证据。未进行消费者实测，不代表真实客户批准。</p>
      {strategySummaryBoards.map(board => <p key={board.id}><strong>{board.chapter}</strong> · 原稿依据 {board.claimIds.join('、')}。{board.notes}</p>)}
      <h4>原研究与前稿依据记录</h4><p>以下是原研究与前稿的判断账本，用于追溯来源，前稿判断不等于本稿结论。</p>
      {claims.filter(claim => strategySummaryBoards.some(board => board.claimIds.includes(claim.id))).map(claim => <ClaimRecord key={claim.id} claim={claim} />)}
      <div className="qs-history-record"><h4>历史稿件</h4><p>{document.draftId} · {document.title}。该稿及其三方 AI 模拟审查记录保留为历史；回执只对应旧稿，不表示本稿通过审查。浏览器读取不会重新执行评审或对本地原件作密码学核验。</p><dl><div><dt>旧稿正文</dt><dd>{basis.strategy.artifacts['strategy.md'].path}</dd></div><div><dt>旧稿方法</dt><dd>{basis.strategy.strategy.skillId} · {basis.strategy.strategy.skillRevision}</dd></div></dl></div>
    </details>
  </article>;
}
