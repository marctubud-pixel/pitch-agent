import {registeredOriginals} from './intakeProjection';
import {sameBrandResources} from '../../domain/brandResources';
import type {Proposal, ProposalService, ProposalSummary, StageId, StageState, CheckpointStage} from '../../domain/proposal';
import {ACTIVE_STAGES} from '../../domain/proposal';
import {ServiceError} from '../../domain/service';
import {isProposalType} from '../../domain/proposalType';
import {currentCard, mapBrief, mapProject, briefVersions, mapAttachments} from './briefModels';
import {readBrief} from './briefEnvelope';
import type {Snapshot} from './dto';
import type {HttpWorkbenchService} from './HttpWorkbenchService';

const unavailable = (): Promise<never> => Promise.reject(new ServiceError('unavailable', '此操作尚未接入当前本地服务。'));
function proposal(p: Snapshot): Proposal {
  const project = mapProject(p), card = currentCard(p), brief = mapBrief(p, card), envelope = readBrief(card.brief);
  if (!isProposalType(brief.proposalType)) throw new ServiceError('unavailable', '历史任务卡未记录提案类型，不能自动补成已确认类型。');
  const research = p.stages.find(s => s.stage === 'research'), workflow = p.researchWorkflow;
  const hasResearch = Boolean(research?.activeArtifactId || p.jobs.some(j => j.stage === 'research'));
  const released = Boolean(workflow && Array.isArray(workflow.checks) && workflow.checks.some(c => c && typeof c === 'object' && 'id' in c && c.id === 'release' && 'passed' in c && c.passed === true));
  const researchStatus: StageState['status'] = !hasResearch ? 'not_started' : research && (['stale','blocked','failed','awaiting_reconciliation'].includes(research.status) || research.blockedReasons.length) ? 'needs_revision' : released ? 'done' : 'in_progress';
  const stage = (id: StageId): StageState => ({status: id === 'brief' ? brief.confirmedBy ? 'done' : 'in_progress' : id === 'research' ? researchStatus : 'not_started', summary: id === 'brief' ? brief.confirmedBy ? '当前简报已确认。' : '当前简报待确认。' : id === 'research' ? !hasResearch ? '当前尚无研究产物；真实执行以配置与授权为准。' : released ? '当前研究已有真实放行记录；未启动策略生产。' : '当前研究仍待核验或负责人交接，已有产物可阅读。' : '本轮尚未接通此阶段。', updatedAt: id === 'brief' ? brief.updatedAt || null : id === 'research' && hasResearch ? project.updatedAt || null : null, lead: '', version: id === 'brief' ? brief.version : id === 'research' ? p.artifacts.filter(a => a.stage === 'research').length : 0});
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
    brandResources: registeredOriginals(p).flatMap(d => d.resource ? [d.resource] : []),
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
  getBrandResourceUploadPolicy = () => this.workbench.originalUploadPolicy();
  ensureBrandResourceStorage: ProposalService['ensureBrandResourceStorage'] = resources => this.workbench.ensureOriginalStorage(resources);
  stageBrandResources: ProposalService['stageBrandResources'] = input => this.workbench.saveBrandResources(input.workbenchId, input.resources);
  getBrandResourceFile: ProposalService['getBrandResourceFile'] = (id, resourceId) => this.workbench.readBrandResource(id, resourceId);
  listProposals = async () => (await this.workbench.snapshots()).map(proposal).map(summary);
  getProposal = async (id: string) => proposal(await this.workbench.snapshot(id));
  findByWorkbenchId = async (id: string) => this.getProposal(id);
  createProposal: ProposalService['createProposal'] = async input => {
    const current = await this.getProposal(input.workbenchId);
    if (current.name !== input.name || current.client !== input.client || current.type !== input.type || current.mode !== input.mode || JSON.stringify(current.checkpoints) !== JSON.stringify(input.checkpoints) || current.presentationLocalTime !== input.presentationLocalTime || !sameBrandResources(current.brandResources, input.brandResources)) throw new ServiceError('conflict', '已保存的项目设置不符，请核对创建回执；未生成模拟提案。');
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
