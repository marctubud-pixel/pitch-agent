import type { ContributionTarget, Proposal, StageId } from '../domain/proposal';
import { latestRefined, pendingVisuals } from './pending';

export function displayedTarget(p: Proposal, stage: StageId, params: URLSearchParams): ContributionTarget {
  const wholeStage: ContributionTarget = { kind: 'stage', stage, version: p.stages[stage].version };
  if (stage === 'visual' && params.get('part') !== 'compare' && params.get('part') !== 'process') {
    const pending = p.stages.visual.status === 'waiting_for_you' ? pendingVisuals(p) : [];
    const branch = p.visual?.branches.find((b) => b.directionId === params.get('dir'))
      ?? p.visual?.branches.find((b) => b.directionId === pending[0]?.directionId) ?? p.visual?.branches[0];
    if (!branch) return wholeStage;
    const requested = params.get('version');
    const refined = requested ? branch.refined.find((r) => String(r.version) === requested && r.status !== 'not_started') : latestRefined(branch);
    if (refined) return { kind: 'visual', stage: 'visual', directionId: branch.directionId, version: refined.version };
  }
  if (stage === 'themes') {
    const direction = p.themes?.directions.find((d) => `copy-${d.id}` === params.get('focus') || d.id === params.get('dir'));
    if (direction) return { kind: 'theme', stage: 'themes', directionId: direction.id, version: p.stages.themes.version };
  }
  return wholeStage;
}

export function contributionTargetLabel(target: ContributionTarget | undefined): string {
  if (!target) return '历史阶段意见 · 未绑定原稿';
  if (target.kind === 'visual') return `视觉方向 ${target.directionId} · 精修第 ${target.version} 版`;
  if (target.kind === 'theme') return `主题方向 ${target.directionId} · 阶段第 ${target.version} 版`;
  return `整个阶段 · 第 ${target.version} 版`;
}

export function contributionTargetParams(target: ContributionTarget): Record<string, string> {
  if (target.kind === 'visual') return { stage: target.stage, dir: target.directionId, version: String(target.version), part: 'current', focus: 'artwork' };
  if (target.kind === 'theme') return { stage: target.stage, dir: target.directionId, version: String(target.version), focus: `copy-${target.directionId}` };
  return { stage: target.stage, version: String(target.version), focus: 'stage-work' };
}
