import type { ArtifactSummary, Brief, BriefHistory, ResearchWorkspace } from '../../domain/models';
import { methodBriefSnapshot } from '../../domain/researchMethod';
import { isProposalType } from '../../domain/proposalType';
import { originalLumaAttachments } from '../research-method/lumaReference';

export const caseBinding = {
  projectId: 'luma',
  artifactId: 'art-luma-research-v1',
  artifactVersion: 1,
  briefVersion: 2,
};

type RefusalReason = 'foreign-project' | 'head-changed' | 'brief-missing' | 'brief-changed' | 'snapshot-mismatch';
export type CaseBindingResult =
  | { kind: 'available'; historicalBrief: Brief; currency: { kind: 'current' } | { kind: 'historical'; latestBriefVersion: number | null } }
  | { kind: 'unavailable'; reason: RefusalReason; message: string };

function hasValidProposalType(brief: Brief): boolean {
  return !('proposalType' in brief) || isProposalType(brief.proposalType);
}

export function resolveCaseBinding({ requestedProjectId, workspace, history }: { requestedProjectId: string; workspace: ResearchWorkspace; history: BriefHistory }): CaseBindingResult {
  const expected = caseBinding;
  if (requestedProjectId !== expected.projectId || workspace.project.id !== requestedProjectId || history.project.id !== requestedProjectId || history.current && history.current.projectId !== requestedProjectId) {
    return { kind: 'unavailable', reason: 'foreign-project', message: '此案例只对应露玛的指定历史任务；当前项目不匹配。既有研究记录仍可查阅。' };
  }
  const mismatch: CaseBindingResult = { kind: 'unavailable', reason: 'snapshot-mismatch', message: '当前研究报告与历史简报的读取记录不一致，暂不展示此案例。请重新核对当前记录，既有研究仍可查阅。' };
  if (workspace.project.revision !== history.project.revision) return mismatch;
  const head = workspace.artifact;
  if (!head || head.projectId !== requestedProjectId || head.id !== expected.artifactId || head.version !== expected.artifactVersion || head.stage !== 'research' || !head.isCurrent || head.basedOn.briefVersion !== expected.briefVersion || !head.simulated) {
    return { kind: 'unavailable', reason: 'head-changed', message: '当前研究报告已更换或未匹配。此公开资料案例没有自动套用到新版报告，既有记录保留在下方。' };
  }
  const matchesHead = (summaries: ArtifactSummary[]) => {
    const current = summaries.filter(item => item.stage === 'research' && item.isCurrent);
    return current.length === 1 && current[0].id === head.id && current[0].version === head.version && current[0].lineageId === head.lineageId;
  };
  if (!matchesHead(workspace.versions) || !matchesHead(history.dependentArtifacts)) return mismatch;
  const versions = history.versions.filter(brief => brief.version === expected.briefVersion && brief.projectId === requestedProjectId);
  if (versions.length !== 1) return { kind: 'unavailable', reason: 'brief-missing', message: '未取得唯一的简报第2版历史记录，暂不展示此案例。最新简报不能替代报告原依据。' };
  const brief = versions[0];
  if (!hasValidProposalType(brief)) return { kind: 'unavailable', reason: 'brief-changed', message: '简报第2版的提案类型与案例绑定快照不同，暂不展示此案例。请查阅下方既有记录。' };
  const snapshot = methodBriefSnapshot(brief);
  if (!originalLumaAttachments.some(basis => JSON.stringify(snapshot) === JSON.stringify(basis.brief))) {
    return { kind: 'unavailable', reason: 'brief-changed', message: '简报第2版的研究范围已与案例绑定快照不同，暂不展示此案例。请查阅下方既有记录。' };
  }
  const current = history.current;
  const currentMatches = current && hasValidProposalType(current) && current.version === brief.version && JSON.stringify(methodBriefSnapshot(current)) === JSON.stringify(snapshot);
  return { kind: 'available', historicalBrief: brief, currency: currentMatches && !head.staleReason ? { kind: 'current' } : { kind: 'historical', latestBriefVersion: current?.version ?? null } };
}
