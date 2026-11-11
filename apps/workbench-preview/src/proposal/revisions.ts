import type { HumanDecision, Proposal, RefinedVisual, ReviewRecord, StageId, VersionRecord, VisualBranch } from '../domain/proposal';
import { latestRefined } from './pending';

/**
 * Read-only views of revision records, built only from what the data holds. Nothing here infers a
 * change, a review pass or a new artwork the data does not state; where the data is silent the
 * result says so (`null` / empty), and the UI words it as "not recorded", never as "no change".
 */

const avgOf = (r: RefinedVisual) => (r.scores.length ? Math.round((r.scores.reduce((s, x) => s + x.score, 0) / r.scores.length) * 10) / 10 : null);
const meetsRule = (r: RefinedVisual) => {
  const a = avgOf(r);
  return a !== null && a >= 4 && r.requirements.every((q) => q.met);
};

/** One revision of a direction's refined artwork: the version before and the current one. */
export interface ArtworkRevision {
  previous: RefinedVisual;
  current: RefinedVisual;
  /** Why the previous version did not stand, as recorded: its upheld challenge and/or its failed acceptance rule. */
  request: { challenge: string | null; unmet: string[]; average: number | null; belowAverage: boolean };
  /** The recorded response to that challenge (its resolution), if any. */
  response: string | null;
  /** Requirement results that differ between the two versions, and checks added in the current one. */
  requirementChanges: Array<{ text: string; before: boolean | null; after: boolean }>;
  review: { previous: { average: number | null; meetsRule: boolean; status: RefinedVisual['status'] }; current: { average: number | null; meetsRule: boolean; status: RefinedVisual['status'] } };
  /** Open points recorded against the current version. */
  open: Array<{ kind: 'requirement'; text: string } | { kind: 'below'; average: number } | { kind: 'challenge'; text: string; outcome: 'upheld' | 'partly_upheld' }>;
}

export function artworkRevision(b: VisualBranch): ArtworkRevision | null {
  const current = latestRefined(b);
  if (!current) return null;
  const i = b.refined.indexOf(current);
  if (i < 1) return null;
  const previous = b.refined[i - 1];
  const ch = previous.challenge && previous.challenge.outcome !== 'rejected' ? previous.challenge : null;
  const pAvg = avgOf(previous);
  const before = new Map(previous.requirements.map((r) => [r.text, r.met]));
  const requirementChanges = current.requirements
    .filter((r) => !before.has(r.text) || before.get(r.text) !== r.met)
    .map((r) => ({ text: r.text, before: before.has(r.text) ? (before.get(r.text) as boolean) : null, after: r.met }));
  const cAvg = avgOf(current);
  const open: ArtworkRevision['open'] = [];
  for (const r of current.requirements) if (!r.met) open.push({ kind: 'requirement', text: r.text });
  if (cAvg !== null && cAvg < 4) open.push({ kind: 'below', average: cAvg });
  if (current.challenge && current.challenge.outcome !== 'rejected') open.push({ kind: 'challenge', text: current.challenge.challenge, outcome: current.challenge.outcome });
  return {
    previous,
    current,
    request: { challenge: ch?.challenge ?? null, unmet: previous.requirements.filter((r) => !r.met).map((r) => r.text), average: pAvg, belowAverage: pAvg !== null && pAvg < 4 },
    response: ch?.resolution ?? null,
    requirementChanges,
    review: { previous: { average: pAvg, meetsRule: meetsRule(previous), status: previous.status }, current: { average: cAvg, meetsRule: meetsRule(current), status: current.status } },
    open,
  };
}

/**
 * Directions whose slogan or copy lines contain exactly this text. An identical text proves only
 * that the text is the same: not that an idea was adopted, nor where existing copy came from.
 * Adoption is whatever the contribution's own recorded status and response say.
 */
export function matchingTextIn(p: Proposal, text: string): Array<{ directionId: string }> {
  const t = text.trim();
  if (!t) return [];
  return (p.themes?.directions ?? []).filter((x) => x.slogan.trim() === t || x.copyLines.some((l) => l.trim() === t)).map((x) => ({ directionId: x.id }));
}

/** The person's latest revision request for a stage, with what the data recorded after it. */
export interface RevisionRequestState {
  request: HumanDecision;
  /** Version records of this stage made after the request. */
  versions: VersionRecord[];
  /** Review records of this stage made after the request. */
  reviews: ReviewRecord[];
}

export function latestRevisionRequest(p: Proposal, stage: StageId): RevisionRequestState | null {
  const req = [...p.decisions].reverse().find((d) => d.stage === stage && d.kind === 'revision_requested');
  if (!req) return null;
  // A later approval of the stage closes the request; it is then history, not something pending.
  const closed = p.decisions.some((d) => d.stage === stage && d.kind !== 'revision_requested' && d.at > req.at);
  if (closed) return null;
  return {
    request: req,
    versions: p.versions.filter((v) => v.stage === stage && v.at > req.at),
    reviews: p.reviews.filter((r) => r.stage === stage && r.at > req.at),
  };
}
