import type { Direction, DirectionId, Proposal, RefinedVisual, VisualBranch } from '../domain/proposal';

/** The branch's current refined visual: the newest one that is neither superseded nor unstarted. */
export function latestRefined(b: VisualBranch): RefinedVisual | null {
  const live = b.refined.filter((r) => r.status !== 'superseded' && r.status !== 'not_started');
  return live[live.length - 1] ?? b.refined[b.refined.length - 1] ?? null;
}

/** A piece of visual work that is waiting for the person, as far as the data says. */
export interface PendingVisual {
  directionId: DirectionId;
  direction: Direction | null;
  refined: RefinedVisual;
  /** The version before this one, when there is one. */
  previous: RefinedVisual | null;
  /** Open points recorded against this version. Empty means none recorded, not "checked and fine". */
  openIssues: Array<{ kind: 'requirement'; text: string; note: string } | { kind: 'below'; avg: number } | { kind: 'challenge'; text: string; resolution: string; outcome: 'upheld' | 'partly_upheld' }>;
}

const avgOf = (r: RefinedVisual) => (r.scores.length ? Math.round((r.scores.reduce((s, x) => s + x.score, 0) / r.scores.length) * 10) / 10 : null);

/** Directions whose current refined visual is awaiting review, in branch order. */
export function pendingVisuals(p: Proposal): PendingVisual[] {
  const v = p.visual;
  if (!v) return [];
  const dirs = p.themes?.directions ?? [];
  const out: PendingVisual[] = [];
  for (const b of v.branches) {
    const refined = latestRefined(b);
    if (!refined || refined.status !== 'awaiting_review') continue;
    const i = b.refined.indexOf(refined);
    const previous = i > 0 ? b.refined[i - 1] : null;
    const openIssues: PendingVisual['openIssues'] = [];
    for (const r of refined.requirements) if (!r.met) openIssues.push({ kind: 'requirement', text: r.text, note: r.note });
    const avg = avgOf(refined);
    if (avg !== null && avg < 4) openIssues.push({ kind: 'below', avg });
    const c = refined.challenge;
    if (c && c.outcome !== 'rejected') openIssues.push({ kind: 'challenge', text: c.challenge, resolution: c.resolution, outcome: c.outcome });
    out.push({ directionId: b.directionId, direction: dirs.find((d) => d.id === b.directionId) ?? null, refined, previous, openIssues });
  }
  return out;
}
