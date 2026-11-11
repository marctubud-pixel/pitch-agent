import { projectPath } from '../app/router';
import type { ContributionTarget, Proposal, StageId } from '../domain/proposal';

export interface TargetedRecord {
  stage: StageId;
  target?: ContributionTarget;
}

export type RecordDestination =
  | { kind: 'exact'; to: string; label: string; binding: string }
  | { kind: 'stage_context'; to: string; label: string; binding: string };

/** Stable identity is made only from an explicit target, never from a record's prose. */
export function recordTargetKey(target: ContributionTarget): string {
  return target.kind === 'stage'
    ? `${target.kind}:${target.stage}:${target.version}`
    : `${target.kind}:${target.stage}:${target.directionId}:${target.version}`;
}

/** A historical record may open an exact object only when that object still exists. */
export function recordDestination(proposal: Proposal, record: TargetedRecord): RecordDestination {
  if (record.stage === 'content_review') return { kind: 'stage_context', to: projectPath(proposal.workbenchId, 'process', { tab: 'reviews', stage: record.stage }), label: '查看旧流程内容审阅记录', binding: '旧流程内容审阅，原阶段身份保留。' };
  const context = (binding: string): RecordDestination => ({
    kind: 'stage_context',
    to: projectPath(proposal.workbenchId, 'proposal', { stage: record.stage }),
    label: '查看阶段上下文',
    binding,
  });
  const target = record.target;
  if (!target) return context('历史记录未绑定具体稿件；阶段入口不代表当时原稿。');
  if (target.stage !== record.stage) return context('记录与稿件的阶段不一致，暂不能定位原稿。');
  switch (target.kind) {
    case 'visual': {
      const visual = proposal.visual?.branches.find((branch) => branch.directionId === target.directionId)?.refined.find((item) => item.version === target.version);
      const binding = `方向 ${target.directionId} · 精修视觉第 ${target.version} 版`;
      return visual
        ? { kind: 'exact', to: projectPath(proposal.workbenchId, 'proposal', { stage: 'visual', dir: target.directionId, version: String(target.version), part: 'current', focus: 'artwork' }), label: '查看对应稿件', binding }
        : context(`${binding}；该稿件内容暂不可查看。`);
    }
    case 'theme': {
      const binding = `方向 ${target.directionId} · 主题阶段第 ${target.version} 版`;
      return proposal.stages.themes.version === target.version && proposal.themes?.directions.some((direction) => direction.id === target.directionId)
        ? { kind: 'exact', to: projectPath(proposal.workbenchId, 'proposal', { stage: 'themes', focus: `copy-${target.directionId}`, version: String(target.version) }), label: '查看对应文案', binding }
        : context(`${binding}；历史主题内容暂不可查看。`);
    }
    case 'stage':
      return proposal.stages[target.stage].version === target.version
        ? { kind: 'exact', to: projectPath(proposal.workbenchId, 'proposal', { stage: target.stage }), label: '查看对应阶段版本', binding: `阶段第 ${target.version} 版（整阶段对象）` }
        : context(`阶段第 ${target.version} 版；历史阶段内容暂不可查看。`);
    default: {
      const exhaustive: never = target;
      return exhaustive;
    }
  }
}
