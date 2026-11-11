import { useServiceQuery } from '../../app/query';
import type { Proposal } from '../../domain/proposal';
import { ContentReadthrough } from '../content-review/ContentReadthrough';
import { resolveQingyuContentReading, type ContentReadingResult } from './preview';

export function QingyuContentReviewPreview({ proposal }: { proposal: Proposal }) {
  const pid = proposal.workbenchId;
  const research = useServiceQuery(`research:${pid}`, service => service.getResearchWorkspace(pid), { projectId: pid });
  const briefs = useServiceQuery(`research-case-briefs:${pid}`, service => service.getBriefHistory(pid), { projectId: pid });
  const retry = () => { research.refetch(); briefs.refetch(); };
  if (research.status === 'error' || briefs.status === 'error') return <ReadingUnavailable message="研究或任务卡读取失败，暂不能核对审读依据。" retry={retry} />;
  if (!research.data || !briefs.data) return <p className="cr-state" role="status">正在核对本轮审读依据…</p>;
  const result = resolveQingyuContentReading({ proposal, workspace: research.data, history: briefs.data });
  return <>
    {(research.refreshing || briefs.refreshing) && <p className="cr-reading-notice" role="status">正在重新核对依据，以下仍为上次成功读取的内容。</p>}
    {(research.refreshError || briefs.refreshError) && <p className="cr-reading-notice" role="alert">刷新失败，以下内容尚未重新核对。<button type="button" className="text-link" onClick={retry}>重试读取</button></p>}
    <QingyuContentReadingResult result={result} retry={retry} projectId={pid} />
  </>;
}

function ReadingUnavailable({ message, retry }: { message: string; retry: () => void }) {
  return <section className="cr-state" role="alert"><p>{message}</p><button type="button" className="btn btn--secondary btn--sm" onClick={retry}>重新核对依据</button></section>;
}

export function QingyuContentReadingResult({ result, retry, projectId }: { result: ContentReadingResult; retry: () => void; projectId: string }) {
  switch (result.kind) {
    case 'unavailable': return <ReadingUnavailable message={result.message} retry={retry} />;
    case 'current': return <ContentReadthrough key={result.reading.id} document={result.reading} projectId={projectId} />;
    case 'historical': return <><p className="cr-reading-notice" role="status">按任务卡第{result.briefVersion}版审读。{result.latestBriefVersion === null ? '尚未取得当前任务卡。' : `当前任务卡为第${result.latestBriefVersion}版。`}以下为历史审读，不代表新版内容。</p><ContentReadthrough key={`${result.reading.id}:historical`} document={result.reading} projectId={projectId} /></>;
    default: { const exhaustive: never = result; return exhaustive; }
  }
}
