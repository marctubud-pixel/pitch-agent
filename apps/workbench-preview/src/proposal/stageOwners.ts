import type { StageId } from '../domain/proposal';

export const contentReviewOwner = '内容审阅负责人';

export function stageOwnerLabel(stage: StageId, savedLead: string): string {
  return stage === 'content_review' ? contentReviewOwner : stage === 'delivery' ? '比稿Agent' : savedLead;
}
