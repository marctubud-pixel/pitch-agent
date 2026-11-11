import type { StageId } from '../../domain/proposal';

export type ReadingIssue = {
  id: string;
  title: string;
  kind: 'revision' | 'evidence';
  status: string;
  owner: string;
  location: string;
  impact: string;
  observation: string;
  suggestion: string;
  notes: readonly { label: string; text: string }[];
  evidence: readonly string[];
  stages: readonly StageId[];
};
export type ReadingImage = { id: string; directionId: string; direction: string; label: string; url: string; alt: string; observation: string };
export type ReadingCopy = { directionId: string; direction: string; slogan: string; subline: string };
export type ReadingDocument = {
  id: string;
  title: string;
  summary: string;
  owner: string;
  ownerSummary: string;
  coordinator: { kind: 'pending' } | { kind: 'reviewed'; summary: string; details: readonly string[] };
  issues: readonly ReadingIssue[];
  connections: readonly { id: string; from: StageId; to: StageId; label: string; text: string }[];
  sections: readonly { id: string; stage: StageId; title: string; text: string; sourceRefs: readonly string[] }[];
  images: readonly ReadingImage[];
  reviewedCopy: readonly ReadingCopy[];
  changes: readonly { id: string; title: string; before: string; after: string; reason: string }[];
  records: readonly { label: string; text: string }[];
};

export const readingStages: Readonly<Partial<Record<StageId, string>>> = { brief: '简报与任务', research: '研究', strategy: '策略', themes: '文案与主题', visual: '视觉开发' };
