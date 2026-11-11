/**
 * Prototype service for the creative stages (Strategy → Delivery), modes, checkpoints and the
 * agent process record. Content is scripted demo data; agent work is simulated with a short
 * delay and labelled as such in the interface.
 *
 * The Brief and Research stages defer to the Workbench service: a brief counts as done only
 * when the Workbench says it is confirmed, and research only when its evidence checks have
 * passed and it has been released. The prototype never overrides those protections.
 */
import type { ID } from '../../domain/models';
import {
  CHECKPOINT_STAGES,
  STAGES,
  type CheckpointStage,
  type ContributionInput,
  type CreateProposalInput,
  type DecisionInput,
  type LayoutStyle,
  type ProductionMode,
  type Proposal,
  type ProposalService,
  type ProposalSummary,
  type StageId,
} from '../../domain/proposal';
import type { WorkbenchService } from '../../domain/service';
import { isDemoControls } from '../demo';
import { needsYou } from '../../proposal/needs';
import type { KeyValueStore } from '../mock/storage';
import { LEADS, pack, stage } from './fixtures/helpers';
import { luma } from './fixtures/luma';
import { northline } from './fixtures/northline';
import { plumtide } from './fixtures/plumtide';

const STORAGE_KEY = 'proposal-workbench/demo/proposals';
const SCHEMA = 4;
const ME = 'Alex Morgan';

/** Stage content, used to decide what an advancing stage can reveal. */
const CONTENT_KEY: Partial<Record<StageId, keyof Proposal>> = {
  strategy: 'strategy',
  themes: 'themes',
  visual: 'visual',
  content_review: 'contentReview',
  layout: 'layout',
  delivery: 'delivery',
};

function seed(): Record<ID, Proposal> {
  return Object.fromEntries([northline, plumtide, luma].map((p) => [p.id, structuredClone(p)]));
}

const nextStage = (s: StageId): StageId | null => STAGES[STAGES.indexOf(s) + 1] ?? null;

export class MockProposalService implements ProposalService {
  readonly backing = 'prototype' as const;
  private data: Record<ID, Proposal>;
  private listeners = new Set<(id: ID | null) => void>();
  private timers = new Set<ReturnType<typeof setTimeout>>();

  constructor(
    private readonly workbench: WorkbenchService,
    private readonly store: KeyValueStore,
    private readonly options: { latency?: number; agentDelay?: number; clock?: () => number } = {},
  ) {
    this.data = this.load();
    workbench.subscribe((event) => {
      if (event.type === 'reset') {
        this.timers.forEach(clearTimeout);
        this.timers.clear();
        this.data = seed();
        this.persist();
        this.emit(null);
      }
      if (event.type === 'data-changed' && event.projectId) {
        const p = Object.values(this.data).find((x) => x.workbenchId === event.projectId);
        if (p) this.emit(p.id);
      }
    });
  }

  private now() {
    return new Date(this.options.clock?.() ?? Date.now()).toISOString();
  }

  private load(): Record<ID, Proposal> {
    try {
      const raw = this.store.get(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { schema: number; data: Record<ID, Proposal> };
        if (parsed.schema === SCHEMA) return parsed.data;
      }
    } catch {
      /* fall back to the seed */
    }
    return seed();
  }

  private persist() {
    try {
      this.store.set(STORAGE_KEY, JSON.stringify({ schema: SCHEMA, data: this.data }));
    } catch {
      /* stays in memory */
    }
  }

  private emit(id: ID | null) {
    this.listeners.forEach((l) => l(id));
  }

  subscribe(listener: (id: ID | null) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async wait() {
    const ms = this.options.latency ?? 250;
    if (ms > 0) await new Promise((r) => setTimeout(r, ms));
  }

  /**
   * Reads follow the same demo scenario as the Workbench they sit on, so loading, network-error
   * and empty states look the same everywhere. Returns true when the scenario is "empty".
   */
  private async gate(): Promise<boolean> {
    if (!isDemoControls(this.workbench)) return false;
    const { scenario } = this.workbench.getDemoState();
    if (scenario === 'loading') {
      // Never settles; the UI refetches when the scenario changes and ignores this request.
      await new Promise<never>(() => {});
    }
    if (scenario === 'network_error') throw new Error('Could not reach the proposal service (simulated network error).');
    return scenario === 'empty';
  }

  private require(id: ID): Proposal {
    const p = this.data[id];
    if (!p) throw new Error(`No proposal with id ${id}`);
    return p;
  }

  private touch(p: Proposal) {
    p.revision += 1;
    p.updatedAt = this.now();
    this.persist();
    this.emit(p.id);
  }

  /** Brief and research follow the Workbench, which owns the evidence and decision rules. */
  private async sync(p: Proposal): Promise<Proposal> {
    try {
      const ov = await this.workbench.getProjectOverview(p.workbenchId);
      const confirmed = Boolean(ov.brief?.confirmedAt);
      const research = ov.research;
      let changed = false;
      if (!confirmed && p.stages.brief.status === 'done') {
        p.stages.brief = { ...p.stages.brief, status: 'needs_revision', summary: 'The brief changed and needs confirming again.' };
        changed = true;
      }
      if (confirmed && p.stages.brief.status !== 'done') {
        p.stages.brief = { ...p.stages.brief, status: 'done', summary: `Task card confirmed (v${ov.brief?.version ?? 1}).`, updatedAt: ov.brief?.confirmedAt ?? this.now() };
        if (p.stages.research.status === 'not_started') p.stages.research = { ...p.stages.research, status: 'in_progress', summary: 'Research is being prepared from the confirmed task card.', updatedAt: this.now() };
        if (p.currentStage === 'brief') p.currentStage = 'research';
        changed = true;
      }
      if (research) {
        const released = research.status === 'released';
        const stale = research.status === 'stale';
        if (released && p.stages.research.status !== 'done') {
          p.stages.research = { ...p.stages.research, status: 'done', summary: 'Research released after the evidence checks and handoff.', updatedAt: this.now() };
          if (p.stages.strategy.status === 'not_started') {
            p.stages.strategy = { ...p.stages.strategy, status: p.strategy ? 'done' : 'in_progress', summary: p.strategy ? p.stages.strategy.summary : 'Strategy Lead is working from the released research (prototype: no scripted content for this project).', updatedAt: this.now() };
            if (p.currentStage === 'research') p.currentStage = 'strategy';
          }
          changed = true;
        }
        if (!released && p.stages.research.status === 'done') {
          p.stages.research = { ...p.stages.research, status: 'needs_revision', summary: stale ? 'Research is out of date after a brief change.' : 'Research is no longer released.' };
          for (const s of STAGES.slice(STAGES.indexOf('strategy'))) {
            if (p.stages[s].status === 'done') p.stages[s] = { ...p.stages[s], status: 'needs_revision', summary: 'Built on research that changed. Needs review.' };
          }
          p.currentStage = 'research';
          changed = true;
        }
      }
      if (changed) this.persist();
    } catch {
      /* the Workbench is unreachable: show the last known state */
    }
    return p;
  }

  private summarize(p: Proposal): ProposalSummary {
    const attention = needsYou(p).length;
    return {
      id: p.id,
      name: p.name,
      client: p.client,
      type: p.type,
      summary: p.summary,
      cover: p.cover,
      mode: p.mode,
      currentStage: p.currentStage,
      currentStatus: p.stages[p.currentStage].status,
      stageStatus: Object.fromEntries(STAGES.map((s) => [s, p.stages[s].status])) as ProposalSummary['stageStatus'],
      workbenchId: p.workbenchId,
      attention,
      updatedAt: p.updatedAt,
    };
  }

  async listProposals() {
    await this.wait();
    if (await this.gate()) return [];
    const all = await Promise.all(Object.values(this.data).map((p) => this.sync(p)));
    return structuredClone(all.map((p) => this.summarize(p)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  }

  async getProposal(id: ID) {
    await this.wait();
    if (await this.gate()) throw new Error(`No proposal with id ${id}`);
    return structuredClone(await this.sync(this.require(id)));
  }

  async findByWorkbenchId(workbenchId: ID) {
    await this.wait();
    if (await this.gate()) return null;
    const p = Object.values(this.data).find((x) => x.workbenchId === workbenchId);
    return p ? structuredClone(await this.sync(p)) : null;
  }

  async createProposal(input: CreateProposalInput) {
    await this.wait();
    const id = `${input.workbenchId}-proposal`;
    const now = this.now();
    const stages = Object.fromEntries(STAGES.map((s) => [s, stage('not_started', '', LEADS[s], null)])) as Proposal['stages'];
    stages.brief = stage('in_progress', 'Review the task card and confirm it to start research.', LEADS.brief, now);
    const p: Proposal = {
      id,
      workbenchId: input.workbenchId,
      name: input.name,
      client: input.client || 'Client not set',
      type: input.type,
      summary: input.type === 'kv' ? 'Key visual proposal.' : 'Packaging proposal.',
      cover: pack('can', 'front', { base: '#e6e8e3', ink: '#47524b', accent: '#bfc5bb', pattern: 'plain', wordmark: input.name.slice(0, 14), flavour: 'New project' }),
      mode: input.mode,
      checkpoints: input.mode === 'assisted' ? input.checkpoints : [],
      currentStage: 'brief',
      stages,
      task: { assignment: '', output: '', occasion: null, scope: [], inputs: [], unknowns: [] },
      research: null,
      strategy: null,
      themes: null,
      visual: null,
      contentReview: null,
      layout: null,
      delivery: null,
      decisions: [],
      contributions: [],
      tasks: [],
      reviews: [],
      handoffs: [],
      versions: [],
      revision: 1,
      updatedAt: now,
    };
    this.data[id] = p;
    this.persist();
    this.emit(id);
    return structuredClone(p);
  }

  async setMode(id: ID, mode: ProductionMode, checkpoints: CheckpointStage[]) {
    await this.wait();
    const p = this.require(id);
    p.mode = mode;
    p.checkpoints = mode === 'assisted' ? CHECKPOINT_STAGES.filter((c) => checkpoints.includes(c)) : [];
    p.decisions.push({ id: `hd-${Date.now()}`, stage: 'brief', kind: 'mode_changed', by: ME, at: this.now(), comment: mode === 'automatic' ? 'Automatic mode.' : `Assisted mode; checkpoints: ${p.checkpoints.join(', ') || 'none'}.`, reviewerPosition: null });
    this.touch(p);
    return structuredClone(p);
  }

  async decide(id: ID, s: StageId, decision: DecisionInput) {
    await this.wait();
    const p = this.require(id);
    const state = p.stages[s];
    if (state.status !== 'waiting_for_you') throw new Error('This stage is not waiting for a decision.');
    const at = this.now();
    if (decision.kind === 'request_revision') {
      if (!decision.comment.trim()) throw new Error('Say what should change, so the agents can act on it.');
      p.decisions.push({ id: `hd-${Date.now()}`, stage: s, kind: 'revision_requested', by: ME, at, comment: decision.comment, reviewerPosition: null });
      p.stages[s] = { ...state, status: 'needs_revision', summary: `Revising after your comment: “${decision.comment}”`, updatedAt: at };
      this.touch(p);
      this.later(() => {
        const q = this.data[id];
        if (!q || q.stages[s].status !== 'needs_revision') return;
        const v = q.stages[s].version + 1;
        q.stages[s] = { ...q.stages[s], status: 'waiting_for_you', version: v, summary: `Revised (v${v}) in response to your comment. Waiting for you again.`, updatedAt: this.now() };
        q.versions.push({ id: `ver-${Date.now()}`, stage: s, label: `${s} revision`, version: v, inputs: [`Your comment: ${decision.comment}`], at: this.now(), state: 'current', impact: null });
        q.reviews.push({ id: `rv-${Date.now()}`, stage: s, subject: `Revision v${v}`, evaluator: `${LEADS[s]} (simulated)`, average: null, verdict: 'Revised in response to your comment (simulated — content unchanged in this prototype)', challenge: null, directorResolution: null, at: this.now() });
        this.touch(q);
      });
      return structuredClone(p);
    }
    p.decisions.push({
      id: `hd-${Date.now()}`,
      stage: s,
      kind: decision.kind === 'choose' ? 'chosen_despite_review' : 'approved',
      by: ME,
      at,
      comment: decision.comment,
      reviewerPosition: decision.kind === 'choose' ? decision.reviewerPosition : null,
    });
    p.stages[s] = { ...state, status: 'done', summary: decision.comment ? `You approved: “${decision.comment}”` : 'You approved this stage.', updatedAt: at };
    this.touch(p);
    this.advance(id, s);
    return structuredClone(p);
  }

  /** Simulated agents move on to the next stage until they reach a checkpoint or run out of content. */
  private advance(id: ID, from: StageId) {
    const p = this.data[id];
    const to = nextStage(from);
    if (!p || !to) {
      if (p) p.stages.delivery.summary = 'Delivered. The deck is in the Delivery Center.';
      return;
    }
    p.currentStage = to;
    p.stages[to] = { ...p.stages[to], status: 'in_progress', summary: `${LEADS[to]} and specialists are working (simulated).`, updatedAt: this.now() };
    this.touch(p);
    this.later(() => {
      const q = this.data[id];
      if (!q || q.stages[to].status !== 'in_progress') return;
      const key = CONTENT_KEY[to];
      const hasContent = key ? q[key] !== null : true;
      if (!hasContent) {
        q.stages[to] = { ...q.stages[to], summary: 'In progress. This prototype has no scripted content for this stage of this project.' };
        this.touch(q);
        return;
      }
      const checkpoint = q.mode === 'assisted' && (q.checkpoints as StageId[]).includes(to);
      const summaries: Partial<Record<StageId, string>> = {
        content_review: 'Narrative reviewed before layout. Passages tightened; one unsupported line removed.',
        layout: 'Three sample spreads prepared. Choose a style or let the director pick.',
        delivery: 'Final review complete. The editable deck is ready.',
      };
      q.stages[to] = { ...q.stages[to], status: checkpoint ? 'waiting_for_you' : 'done', summary: (checkpoint ? 'Ready for your decision. ' : '') + (summaries[to] ?? 'Completed by the agents (simulated).'), updatedAt: this.now() };
      if (to === 'layout' && q.layout && !q.layout.chosen) {
        q.layout.chosen = 'editorial';
        q.layout.chosenBy = 'director';
      }
      this.touch(q);
      if (!checkpoint) this.advance(id, to);
    });
  }

  private later(fn: () => void) {
    const ms = this.options.agentDelay ?? 1600;
    if (ms <= 0) {
      fn();
      return;
    }
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
  }

  async contribute(id: ID, s: StageId, input: ContributionInput) {
    await this.wait();
    const p = this.require(id);
    if (!input.text.trim()) throw new Error('Add some text first.');
    p.contributions.push({
      id: `uc-${Date.now()}`,
      stage: s,
      kind: input.kind,
      text: input.text.trim(),
      borrow: input.borrow?.trim() || null,
      by: ME,
      at: this.now(),
      status: 'new',
      response: p.stages[s].status === 'done' ? 'This stage is complete. The agents will consider it if the stage is revised.' : 'The agents will consider this in the next revision.',
    });
    this.touch(p);
    return structuredClone(p);
  }

  async editNarrative(id: ID, sectionId: ID, text: string) {
    await this.wait();
    const p = this.require(id);
    const section = p.contentReview?.narrative.find((n) => n.id === sectionId);
    if (!section) throw new Error('Section not found.');
    if (section.text === text) return structuredClone(p);
    section.before = section.before ?? section.text;
    section.text = text;
    section.changeReason = 'Edited by you.';
    this.touch(p);
    return structuredClone(p);
  }

  async chooseLayout(id: ID, style: LayoutStyle['id']) {
    await this.wait();
    const p = this.require(id);
    if (!p.layout) throw new Error('Layout has not started yet.');
    p.layout.chosen = style;
    p.layout.chosenBy = 'you';
    this.touch(p);
    return structuredClone(p);
  }
}
