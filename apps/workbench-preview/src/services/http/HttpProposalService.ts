import type {Proposal, ProposalService, ProposalSummary, StageId, StageState, CheckpointStage} from '../../domain/proposal';
import {ACTIVE_STAGES} from '../../domain/proposal';
import {ServiceError} from '../../domain/service';
import {isProposalType} from '../../domain/proposalType';
import {currentCard, mapBrief, mapProject, briefVersions, mapAttachments} from './briefModels';
import {readBrief} from './briefEnvelope';
import type {Snapshot} from './dto';
import type {HttpWorkbenchService} from './HttpWorkbenchService';

const unavailable = (): Promise<never> => Promise.reject(new ServiceError('unavailable', '本轮仅接通简报读写，后续执行、协作写入和品牌原件保存尚未接入。'));
function proposal(p: Snapshot): Proposal {
  const project = mapProject(p), card = currentCard(p), brief = mapBrief(p, card), envelope = readBrief(card.brief);
  if (!isProposalType(brief.proposalType)) throw new ServiceError('unavailable', '历史任务卡未记录提案类型，不能自动补成已确认类型。');
  const stage = (id: StageId): StageState => ({status: id === 'brief' ? brief.confirmedBy ? 'done' : 'in_progress' : 'not_started', summary: id === 'brief' ? brief.confirmedBy ? '当前简报已确认，未启动后续执行。' : '当前简报待确认。' : '本轮尚未接通此阶段。', updatedAt: id === 'brief' ? brief.updatedAt || null : null, lead: '', version: id === 'brief' ? brief.version : 0});
  const gates: Record<string, CheckpointStage | undefined> = {strategy: 'strategy', copy: 'themes', visual: 'visual', final_review: 'delivery'};
  return {id: p.id, workbenchId: p.id, name: p.name, client: project.client || '客户尚未填写', type: brief.proposalType,
    ...(envelope.metadata.presentationLocalTime ? {presentationLocalTime: envelope.metadata.presentationLocalTime} : {}),
    summary: project.summary, cover: null, mode: p.policy.mode === 'auto' ? 'automatic' : 'assisted',
    checkpoints: p.policy.humanGates.flatMap(value => {const gate = gates[value]; return gate ? [gate] : [];}),
    currentStage: brief.confirmedBy ? 'research' : 'brief',
    stages: {brief: stage('brief'), research: stage('research'), strategy: stage('strategy'), themes: stage('themes'), visual: stage('visual'), content_review: stage('content_review'), layout: stage('layout'), delivery: stage('delivery')},
    task: {assignment: brief.background, output: brief.deliverables.join('\n'), occasion: null, scope: brief.constraints,
      inputs: mapAttachments(p).filter(item => brief.attachmentIds.includes(item.id)).map(item => ({id: item.id, kind: 'text', title: item.fileName ?? '简报原文', note: item.text})),
      unknowns: brief.openQuestions.map((topic, index) => ({id: `${card.id}:unknown:${index}`, topic, why: '任务卡保留的待确认事项。'}))},
    research: null, strategy: null, themes: null, visual: null, contentReview: null, layout: null, delivery: null,
    decisions: [], contributions: [], reviews: [], handoffs: [], tasks: [],
    versions: briefVersions(p).map(item => ({id: item.id, stage: 'brief', label: `简报 v${item.version}`, version: item.version, inputs: [], at: item.updatedAt, state: item.id === p.activeTaskCardId ? 'current' : 'superseded', impact: null})),
    revision: p.revision, updatedAt: project.updatedAt};
}
function summary(p: Proposal): ProposalSummary {
  return {id: p.id, workbenchId: p.workbenchId, name: p.name, client: p.client, type: p.type, summary: p.summary, cover: p.cover,
    ...(p.presentationLocalTime ? {presentationLocalTime: p.presentationLocalTime} : {}),
    mode: p.mode, currentStage: p.currentStage, currentStatus: p.stages[p.currentStage].status,
    stageStatus: {brief: p.stages.brief.status, research: p.stages.research.status, strategy: p.stages.strategy.status, themes: p.stages.themes.status, visual: p.stages.visual.status, content_review: p.stages.content_review.status, layout: p.stages.layout.status, delivery: p.stages.delivery.status},
    attention: ACTIVE_STAGES.filter(stage => ['waiting_for_you', 'needs_revision'].includes(p.stages[stage].status)).length, updatedAt: p.updatedAt};
}
export class HttpProposalService implements ProposalService {
  readonly backing = 'connected';
  constructor(private readonly workbench: HttpWorkbenchService) {}
  ensureBrandResourceStorage = unavailable;
  stageBrandResources = unavailable;
  getBrandResourceFile = unavailable;
  listProposals = async () => (await this.workbench.snapshots()).map(proposal).map(summary);
  getProposal = async (id: string) => proposal(await this.workbench.snapshot(id));
  findByWorkbenchId = async (id: string) => this.getProposal(id);
  createProposal: ProposalService['createProposal'] = async input => {
    const current = await this.getProposal(input.workbenchId);
    if (current.name !== input.name || current.client !== input.client || current.type !== input.type || current.mode !== input.mode || JSON.stringify(current.checkpoints) !== JSON.stringify(input.checkpoints) || current.presentationLocalTime !== input.presentationLocalTime || input.brandResources?.length) throw new ServiceError('conflict', '已保存的项目设置不符，请核对创建回执；未生成模拟提案。');
    return current;
  };
  setMode = unavailable;
  decide = unavailable;
  contribute = unavailable;
  resolveContribution = unavailable;
  editNarrative = unavailable;
  chooseLayout = unavailable;
  subscribe: ProposalService['subscribe'] = listener => this.workbench.subscribe(event => listener(event.type === 'data-changed' ? event.projectId : null));
}
