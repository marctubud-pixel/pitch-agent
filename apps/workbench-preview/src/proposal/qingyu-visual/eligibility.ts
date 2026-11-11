import type { Proposal } from '../../domain/proposal';

export function isQingyuVisualPreview(proposal: Proposal): boolean {
  return proposal.id === 'qingyu-pack' && proposal.workbenchId === 'qingyu' && proposal.type === 'packaging' && proposal.themes === null && proposal.visual === null;
}
