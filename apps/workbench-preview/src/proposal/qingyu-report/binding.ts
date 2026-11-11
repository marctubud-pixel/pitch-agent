import type { ArtifactSummary, Brief, BriefHistory, ResearchWorkspace } from '../../domain/models';
import { qingyuAnchor, qingyuBrief, qingyuBriefSnapshot } from '../../services/cases/qingyuFixture';
import { qingyuReport, type QingyuReport } from './report';

export type QingyuResolution = { kind: 'available'; report: QingyuReport; brief: Brief; currency: 'current' | 'historical'; latestBriefVersion: number | null } | { kind: 'unavailable'; reason: 'invalid-bundle' | 'foreign-project' | 'snapshot-mismatch' | 'head-changed' | 'brief-missing' | 'brief-changed'; message: string };
export function resolveQingyuCase({ requestedProjectId, workspace, history }: { requestedProjectId: string; workspace: ResearchWorkspace; history: BriefHistory }): QingyuResolution {
  if (qingyuReport.kind === 'invalid') return { kind: 'unavailable', reason: 'invalid-bundle', message: '研究资料未通过完整性检查，暂不能展示正文。' };
  const expected = qingyuAnchor;
  if (requestedProjectId !== expected.projectId || workspace.project.id !== requestedProjectId || history.project.id !== requestedProjectId || history.current && history.current.projectId !== requestedProjectId) return { kind: 'unavailable', reason: 'foreign-project', message: '研究案例与当前项目不匹配，暂不展示正文。' };
  const mismatch: QingyuResolution = { kind: 'unavailable', reason: 'snapshot-mismatch', message: '研究与历史任务卡的读取记录不一致，请重新核对。' };
  if (workspace.project.revision !== history.project.revision) return mismatch;
  const head = workspace.artifact;
  if (!head || head.projectId !== requestedProjectId || head.id !== expected.artifactId || head.lineageId !== expected.lineageId || head.version !== expected.version || head.stage !== 'research' || !head.isCurrent || head.basedOn.briefVersion !== expected.briefVersion || head.basedOn.researchArtifactId !== null || !head.simulated) return { kind: 'unavailable', reason: 'head-changed', message: '当前研究头已更换或未匹配。此案例未自动套用到新版研究。' };
  const matches = (roster: ArtifactSummary[]) => {
    const current = roster.filter(item => item.stage === 'research' && item.isCurrent);
    return current.length === 1 && current[0].id === expected.artifactId && current[0].lineageId === expected.lineageId && current[0].version === expected.version;
  };
  if (!matches(workspace.versions) || !matches(history.dependentArtifacts)) return mismatch;
  const briefs = history.versions.filter(b => b.projectId === requestedProjectId && b.version === expected.briefVersion);
  if (briefs.length !== 1) return { kind: 'unavailable', reason: 'brief-missing', message: '未取得唯一的任务卡第1版历史记录，请重试读取。' };
  const brief = briefs[0]; const snapshot = JSON.stringify(qingyuBriefSnapshot(brief));
  if (snapshot !== JSON.stringify(qingyuBriefSnapshot(qingyuBrief))) return { kind: 'unavailable', reason: 'brief-changed', message: '任务卡第1版的内容与固定研究依据不同，暂不展示正文。' };
  const current = history.current;
  if (current?.version === expected.briefVersion && JSON.stringify(qingyuBriefSnapshot(current)) !== snapshot) return mismatch;
  return { kind: 'available', report: qingyuReport.report, brief, currency: current?.version === brief.version && !head.staleReason ? 'current' : 'historical', latestBriefVersion: current?.version ?? null };
}
