import { STAGES, type Proposal, type StageId } from '../domain/proposal';

/**
 * What still needs the person, counted the same way everywhere (Home, the Overview tab badge and
 * the Overview list): an unconfirmed task card, each stage waiting for a decision, each stage
 * sent back for revision (research held by blocking findings counts once), and open facts.
 */
export type NeedsYou = { kind: 'brief' } | { kind: 'decide'; stage: StageId } | { kind: 'revise'; stage: StageId } | { kind: 'unknowns'; count: number };
export function needsYou(p: Proposal): NeedsYou[] {
  const out: NeedsYou[] = [];
  const waiting = STAGES.filter((s) => p.stages[s].status === 'waiting_for_you');
  if (p.stages.brief.status !== 'done' && !waiting.includes('brief')) out.push({ kind: 'brief' });
  for (const s of waiting) out.push({ kind: 'decide', stage: s });
  for (const s of STAGES) if (p.stages[s].status === 'needs_revision') out.push({ kind: 'revise', stage: s });
  if (p.task.unknowns.length) out.push({ kind: 'unknowns', count: p.task.unknowns.length });
  return out;
}
