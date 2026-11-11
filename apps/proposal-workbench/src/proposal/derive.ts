/** Read-only summaries of a proposal, shared by Overview, Home and the stage rail. */
import { projectPath } from '../app/router';
import type { ProjectOverview } from '../domain/models';
import { STAGES, type ArtSpec, type Direction, type Proposal, type ProposalSummary, type RefinedVisual, type StageId } from '../domain/proposal';

export interface Output {
  stage: StageId;
  /** Which kind of output it is, for the label. */
  kind: 'deck' | 'visual' | 'theme' | 'strategy' | 'research' | 'task';
  title: string;
  text: string | null;
  art: ArtSpec | null;
}

/** The most advanced piece of real work in the proposal, so Overview can lead with it. */
export function latestOutput(p: Proposal): Output | null {
  const done = (s: StageId) => p.stages[s].status !== 'not_started';
  if (p.layout && done('layout')) {
    const cover = p.layout.slides.find((s) => s.kind === 'cover') ?? p.layout.slides[0];
    return { stage: 'layout', kind: 'deck', title: cover?.lead ?? p.name, text: cover?.support ?? null, art: cover?.art ?? null };
  }
  if (p.visual && done('visual')) {
    const rec = p.themes?.recommendation.id;
    const branch = p.visual.branches.find((b) => b.directionId === rec) ?? p.visual.branches[0];
    const refined = [...(branch?.refined ?? [])].reverse().find((r) => r.status !== 'not_started');
    const dir = p.themes?.directions.find((d) => d.id === branch?.directionId);
    if (refined) return { stage: 'visual', kind: 'visual', title: dir ? `${dir.id} · ${dir.name}` : '', text: refined.explanation, art: refined.art };
  }
  if (p.themes && done('themes')) {
    const rec = p.themes.directions.find((d) => d.id === p.themes!.recommendation.id) ?? p.themes.directions[0];
    return { stage: 'themes', kind: 'theme', title: rec.slogan, text: rec.rationale, art: null };
  }
  if (p.strategy && done('strategy')) return { stage: 'strategy', kind: 'strategy', title: p.strategy.conclusion, text: p.strategy.answer, art: null };
  if (p.research && done('research')) return { stage: 'research', kind: 'research', title: p.research.summary, text: null, art: p.research.sections.flatMap((s) => s.groups.flatMap((g) => g.items))[0]?.art ?? null };
  if (p.task.assignment) return { stage: 'brief', kind: 'task', title: p.task.assignment, text: p.task.output, art: p.task.inputs.find((i) => i.art)?.art ?? null };
  return null;
}

export interface NextAction {
  kind: 'decide' | 'revision' | 'confirm_brief' | 'fix_research' | 'follow' | 'deliver';
  stage: StageId;
  /** For fix_research: the Workbench's own wording of the next step. */
  detail: string | null;
}

/** One clear next action. Human decisions come first, then genuine blockers, then progress. */
export function nextAction(p: Proposal, ov: ProjectOverview | null): NextAction {
  const waiting = STAGES.find((s) => p.stages[s].status === 'waiting_for_you');
  if (waiting) return { kind: 'decide', stage: waiting, detail: null };
  if (p.stages.brief.status !== 'done') return { kind: 'confirm_brief', stage: 'brief', detail: null };
  const blocking = ov?.blockers.some((b) => b.severity === 'blocking');
  if (blocking && p.stages.research.status !== 'done') return { kind: 'fix_research', stage: 'research', detail: ov?.nextAction.label ?? null };
  const revising = STAGES.find((s) => p.stages[s].status === 'needs_revision');
  if (revising) return { kind: 'revision', stage: revising, detail: null };
  if (p.stages.delivery.status === 'done') return { kind: 'deliver', stage: 'delivery', detail: null };
  return { kind: 'follow', stage: p.currentStage, detail: null };
}

/** Where the next action is done. */
export function nextActionPath(workbenchId: string, next: NextAction) {
  if (next.kind === 'deliver') return projectPath(workbenchId, 'delivery');
  if (next.kind === 'fix_research') return projectPath(workbenchId, 'proposal', { stage: 'research', checks: 'research' });
  // A decision lands on the decision panel itself, not the top of the stage.
  if (next.kind === 'decide') return projectPath(workbenchId, 'proposal', { stage: next.stage, focus: 'decision' });
  return projectPath(workbenchId, 'proposal', { stage: next.stage });
}

/** One piece of work a stage has produced, in stage order, for the Overview shelf. */
export type Produced =
  | { key: string; stage: StageId; kind: 'task' | 'research' | 'strategy'; title: string; text: string | null; art: ArtSpec | null }
  | { key: string; stage: 'themes'; kind: 'theme'; directions: Direction[]; recommended: string }
  | { key: string; stage: 'visual'; kind: 'visual'; direction: Direction | null; art: ArtSpec; status: RefinedVisual['status'] }
  | { key: string; stage: 'layout'; kind: 'deck'; slides: number };

export function producedOutputs(p: Proposal): Produced[] {
  const out: Produced[] = [];
  const reachedAt = (s: StageId) => p.stages[s].status !== 'not_started';
  if (p.task.assignment) out.push({ key: 'task', stage: 'brief', kind: 'task', title: p.task.assignment, text: p.task.output, art: null });
  if (p.research && reachedAt('research')) out.push({ key: 'research', stage: 'research', kind: 'research', title: p.research.summary, text: null, art: p.research.sections.flatMap((s) => s.groups.flatMap((g) => g.items))[0]?.art ?? null });
  if (p.strategy && reachedAt('strategy')) out.push({ key: 'strategy', stage: 'strategy', kind: 'strategy', title: p.strategy.conclusion, text: p.strategy.answer, art: null });
  if (p.themes && reachedAt('themes')) out.push({ key: 'themes', stage: 'themes', kind: 'theme', directions: p.themes.directions, recommended: p.themes.recommendation.id });
  if (p.visual && reachedAt('visual'))
    for (const b of p.visual.branches) {
      const live = b.refined.filter((r) => r.status !== 'superseded' && r.status !== 'not_started');
      const r = live[live.length - 1];
      if (r) out.push({ key: `visual-${b.directionId}`, stage: 'visual', kind: 'visual', direction: p.themes?.directions.find((d) => d.id === b.directionId) ?? null, art: r.art, status: r.status });
    }
  if (p.layout && reachedAt('layout') && p.layout.slides.length) out.push({ key: 'deck', stage: 'layout', kind: 'deck', slides: p.layout.slides.length });
  return out;
}

/**
 * The same next action from a list summary, for places that show many proposals. Research held
 * by the evidence checks shows up as attention on the research stage.
 */
export function nextFromSummary(s: ProposalSummary): NextAction {
  const waiting = STAGES.find((x) => s.stageStatus[x] === 'waiting_for_you');
  if (waiting) return { kind: 'decide', stage: waiting, detail: null };
  if (s.stageStatus.brief !== 'done') return { kind: 'confirm_brief', stage: 'brief', detail: null };
  if (s.currentStage === 'research' && s.attention > 0 && s.stageStatus.research !== 'done') return { kind: 'fix_research', stage: 'research', detail: null };
  const revising = STAGES.find((x) => s.stageStatus[x] === 'needs_revision');
  if (revising) return { kind: 'revision', stage: revising, detail: null };
  if (s.stageStatus.delivery === 'done') return { kind: 'deliver', stage: 'delivery', detail: null };
  return { kind: 'follow', stage: s.currentStage, detail: null };
}

/** Stages that have anything to show. */
export const reached = (p: Proposal, s: StageId) => p.stages[s].status !== 'not_started';

/** Pictures the proposal already has (brief inputs, then research cases), for image tiles. */
export function proposalImages(p: Proposal): Array<{ art: ArtSpec; title: string }> {
  const out: Array<{ art: ArtSpec; title: string }> = [];
  for (const x of p.task.inputs) if (x.art) out.push({ art: x.art, title: x.title });
  for (const s of p.research?.sections ?? []) for (const g of s.groups) for (const c of g.items) out.push({ art: c.art, title: c.title });
  return out;
}

export { needsYou, type NeedsYou } from './needs';
