import type { Artifact, Brief, EvidenceTopic } from './models';

export type MethodLensId = 'A' | 'B' | 'D';
export type MethodBriefSnapshot = Pick<Brief, 'id' | 'projectId' | 'version' | 'brand' | 'background' | 'audience' | 'researchQuestions' | 'deliverables' | 'constraints' | 'proposalType'>;
export type ResearchMethodNode =
  | { kind: 'input'; id: MethodLensId; title: string; questions: string[]; topics: EvidenceTopic[]; dependsOn: [] }
  | { kind: 'synthesis'; id: 'C'; title: string; questions: string[]; dependsOn: ['A', 'B', 'D'] };

/** A question plan, not an execution record or research result. */
export interface ResearchMethodPlan {
  kind: 'dot-research-plan';
  schemaVersion: 1;
  binding: { projectId: string; artifactId: string; artifactVersion: number; brief: MethodBriefSnapshot };
  nodes: ResearchMethodNode[];
}

export function methodBriefSnapshot(brief: Brief): MethodBriefSnapshot {
  const { id, projectId, version, brand, background, audience, researchQuestions, deliverables, constraints, proposalType } = brief;
  return { id, projectId, version, brand, background, audience, researchQuestions: [...researchQuestions], deliverables: [...deliverables], constraints: [...constraints], ...(proposalType ? { proposalType } : {}) };
}

export function methodNodes(brief: MethodBriefSnapshot | null): ResearchMethodNode[] {
  const visual = brief?.proposalType === 'packaging'
    ? { title: '包装与视觉', questions: ['货架上如何识别品牌、口味与产品信息？', '包装信息层级应如何安排，哪些观察已有依据？', '材质、工艺与包装形式有哪些已知约束？'] }
    : brief?.proposalType === 'kv'
      ? { title: '主视觉表达', questions: ['投放媒介与观看距离有哪些明确条件？', '远距识别需要保留哪些品牌与主张信息？', '品牌、主张层级与画面表达有哪些依据和限制？'] }
      : { title: '产品与视觉', questions: ['品牌与产品有哪些已知条件和资产？', '产品、信息层级和视觉表达有哪些可用证据与限制？'] };
  return [
    { kind: 'input', id: 'A', title: '行业与人群', topics: ['category', 'audience', 'cultural'], dependsOn: [], questions: ['行业与使用场景发生了什么变化？', '哪些需求已被证据支持，哪些仍待验证？', ...(brief?.researchQuestions ?? [])] },
    { kind: 'input', id: 'B', title: '竞争与替代', topics: ['competitor'], dependsOn: [], questions: ['竞品怎样传达利益与差异？', '哪些竞争线索有直接记录，哪些只是印象？'] },
    { kind: 'input', id: 'D', ...visual, topics: ['production'], dependsOn: [] },
    { kind: 'synthesis', id: 'C', title: '机会假设', dependsOn: ['A', 'B', 'D'], questions: ['观察中有什么张力？', '可以提出什么待策略阶段验证的机会假设？'] },
  ];
}

export function createResearchMethodPlan(artifact: Artifact, brief: Brief): ResearchMethodPlan {
  return { kind: 'dot-research-plan', schemaVersion: 1, binding: { projectId: artifact.projectId, artifactId: artifact.id, artifactVersion: artifact.version, brief: methodBriefSnapshot(brief) }, nodes: methodNodes(methodBriefSnapshot(brief)) };
}
