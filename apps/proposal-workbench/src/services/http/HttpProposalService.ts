import type { Proposal, ProposalService, ProposalSummary, StageId, StageState, CheckpointStage } from '../../domain/proposal';
import { CHECKPOINT_STAGES, STAGES } from '../../domain/proposal';
import { ServiceError } from '../../domain/service';
import type { Snapshot } from './dto';
import { text } from './dto';
import { readBrief } from './briefEnvelope';
import { mapBrief, mapProject } from './mappers';
import { gateNames, type HttpWorkbenchService } from './HttpWorkbenchService';

const backendStages: Record<Exclude<StageId, 'brief'>, string[]> = { research: ['research'], strategy: ['strategy'], themes: ['copy'], visual: ['references', 'sketch', 'visual'], content_review: ['content_review'], layout: ['layout'], delivery: ['final_review'] };
function projectStage(p: Snapshot, stage: StageId): StageState {
  const project = mapProject(p);
  if (stage === 'brief') {
    const confirmed = p.confirmations.some((c) => c.taskCardId === p.activeTaskCardId);
    return { status: confirmed ? 'done' : 'in_progress', summary: confirmed ? '当前任务卡已由操作者确认。' : '任务卡仍为草稿，等待保存与确认。', updatedAt: project.updatedAt || null, lead: '', version: p.cards.length };
  }
  const stages = p.stages.filter((s) => backendStages[stage].includes(s.stage));
  const active = stages.filter((s) => s.activeArtifactId || ['running', 'queued', 'failed', 'awaiting_reconciliation'].includes(s.status));
  let status: StageState['status'] = 'not_started';
  if (stage === 'delivery') status = p.complete ? 'done' : active.length ? 'in_progress' : 'not_started';
  else if (stages.length && stages.every((s) => s.status === 'released')) status = 'done';
  else if (active.some((s) => ['stale', 'failed', 'awaiting_reconciliation'].includes(s.status))) status = 'needs_revision';
  else if (active.length) status = 'in_progress';
  return { status, summary: stages.map((s) => `${s.stage} · ${s.status}${s.blockedReasons.length ? ` · ${s.blockedReasons.join(', ')}` : ''}`).join('\n') || '尚未开始', updatedAt: active.length ? project.updatedAt || null : null, lead: '', version: p.artifacts.filter((a) => backendStages[stage].includes(text(a.stage))).length };
}
function projectProposal(p: Snapshot): Proposal {
  const card = p.cards.find((c) => c.id === p.activeTaskCardId);
  if (!card) throw new ServiceError('validation', 'Active task card missing.');
  const project = mapProject(p), envelope = readBrief(card.brief), brief = mapBrief(p, card);
  const stages: Proposal['stages'] = { brief: projectStage(p, 'brief'), research: projectStage(p, 'research'), strategy: projectStage(p, 'strategy'), themes: projectStage(p, 'themes'), visual: projectStage(p, 'visual'), content_review: projectStage(p, 'content_review'), layout: projectStage(p, 'layout'), delivery: projectStage(p, 'delivery') };
  const currentStage = [...STAGES].reverse().find((s) => s !== 'brief' && stages[s].status !== 'not_started') ?? (stages.brief.status === 'done' ? 'research' : 'brief');
  const checkpoints: CheckpointStage[] = CHECKPOINT_STAGES.filter((s) => p.policy.humanGates.includes(gateNames[s]));
  return { id: p.id, workbenchId: p.id, name: p.name, client: project.client, type: envelope.metadata.type, summary: project.summary, cover: null, mode: p.policy.mode === 'auto' ? 'automatic' : 'assisted', checkpoints, currentStage, stages,
    task: { assignment: brief.objectives.join('\n'), output: brief.deliverables.join('\n'), occasion: null, scope: brief.constraints, inputs: brief.attachmentIds.map((id) => ({ id, kind: 'text', title: envelope.fields.attachment?.fileName ?? '原始简报', note: envelope.fields.attachment?.text ?? '' })), unknowns: brief.openQuestions.map((topic, i) => ({ id: `${brief.id}:unknown:${i}`, topic, why: '任务卡保留的待确认事项。' })) },
    research: null, strategy: null, themes: null, visual: null, contentReview: null, layout: null, delivery: null, decisions: [], contributions: [], reviews: [], handoffs: [],
    tasks: [],
    versions: p.cards.map((c, i) => ({ id: c.id, stage: 'brief', label: `Brief v${i + 1}`, version: i + 1, inputs: [], at: mapBrief(p, c).createdAt, state: c.id === p.activeTaskCardId ? 'current' : 'superseded', impact: null })), revision: p.revision, updatedAt: project.updatedAt };
}
function summary(p: Proposal): ProposalSummary { return { id: p.id, name: p.name, client: p.client, type: p.type, summary: p.summary, cover: p.cover, mode: p.mode, currentStage: p.currentStage, currentStatus: p.stages[p.currentStage].status, stageStatus: { brief: p.stages.brief.status, research: p.stages.research.status, strategy: p.stages.strategy.status, themes: p.stages.themes.status, visual: p.stages.visual.status, content_review: p.stages.content_review.status, layout: p.stages.layout.status, delivery: p.stages.delivery.status }, workbenchId: p.workbenchId, attention: STAGES.filter((s) => ['waiting_for_you', 'needs_revision'].includes(p.stages[s].status)).length, updatedAt: p.updatedAt }; }
const unavailable = (): Promise<never> => Promise.reject(new ServiceError('unavailable', '此创作命令尚未接入真实后端，不会生成模拟结果。'));
export class HttpProposalService implements ProposalService {
  readonly backing = 'connected';
  constructor(private readonly workbench: HttpWorkbenchService) {}
  listProposals = async () => (await this.workbench.snapshots()).map(projectProposal).map(summary);
  getProposal = async (id: string) => projectProposal(await this.workbench.snapshot(id));
  findByWorkbenchId = async (id: string) => this.getProposal(id);
  createProposal: ProposalService['createProposal'] = async (input) => {
    const p = await this.workbench.snapshot(input.workbenchId);
    const expectedGates = input.checkpoints.map((c) => gateNames[c]);
    if (p.policy.mode !== (input.mode === 'automatic' ? 'auto' : 'assisted') || JSON.stringify(p.policy.humanGates) !== JSON.stringify(expectedGates)) return projectProposal(await this.workbench.setPolicy(p.id, input.mode, input.checkpoints));
    return projectProposal(p);
  };
  setMode: ProposalService['setMode'] = async (id, mode, checkpoints) => projectProposal(await this.workbench.setPolicy(id, mode, checkpoints));
  decide = unavailable;
  contribute = unavailable;
  editNarrative = unavailable;
  chooseLayout = unavailable;
  subscribe: ProposalService['subscribe'] = (listener) => this.workbench.subscribe((e) => listener(e.type === 'data-changed' ? e.projectId : null));
}
