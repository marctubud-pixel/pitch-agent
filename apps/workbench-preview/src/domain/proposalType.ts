export type ProposalType = 'kv' | 'packaging';

export function isProposalType(value: unknown): value is ProposalType {
  return value === 'kv' || value === 'packaging';
}
