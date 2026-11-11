import type {Brief, BriefAttachment, Project, ProjectOverview, Capabilities} from '../../domain/models';
import {STAGES, STAGE_LABELS} from '../../domain/models';
import {ServiceError} from '../../domain/service';
import {bridgeStorageJob} from './intakeProjection';
import {readBrief} from './briefEnvelope';
import {object, type Snapshot, type BackendCard} from './dto';

export function currentCard(p: Snapshot): BackendCard {
  const card = p.cards.find(item => item.id === p.activeTaskCardId);
  if (!card || new Set(p.cards.map(item => item.id)).size !== p.cards.length) throw new ServiceError('validation', '后端任务卡身份缺失或重复。');
  return card;
}
export function eventTime(p: Snapshot, card: BackendCard, kind: string): string {
  for (const event of [...p.audit].reverse()) {
    const raw = p.processedCommands[event.commandId];
    if (typeof raw !== 'string') continue;
    try {
      const command = object(JSON.parse(raw));
      if (command.kind === kind && command.taskCardId === card.id) return event.at;
    } catch { /* Historical witnesses may be absent. Keep the time unknown. */ }
  }
  return '';
}
export function businessVersion(p: Snapshot, card: BackendCard): number {
  const index = p.cards.findIndex(item => item.id === card.id);
  if (index < 0) throw new ServiceError('validation', '任务卡不属于当前项目。');
  return 1 + p.cards.slice(0, index).filter(item => p.confirmations.some(c => c.taskCardId === item.id)).length;
}
export function mapBrief(p: Snapshot, card: BackendCard): Brief {
  const envelope = readBrief(card.brief), f = envelope.fields, index = p.cards.findIndex(item => item.id === card.id);
  const confirmed = p.confirmations.find(item => item.taskCardId === card.id);
  const editedAt = eventTime(p, card, 'revise-task-card') || envelope.savedAt;
  const confirmedAt = confirmed ? eventTime(p, card, 'confirm-task-card') : '';
  if (confirmed && !confirmedAt) throw new ServiceError('validation', '任务卡有确认身份但缺少原生确认时刻，不能推断为有效确认。');
  return {...f, id: card.id, projectId: p.id, version: businessVersion(p, card),
    ...(envelope.metadata.type ? {proposalType: envelope.metadata.type} : {}), editedBy: card.createdBy,
    ...(editedAt ? {editedAt} : {}), brand: f.brand ?? '', researchQuestions: f.researchQuestions ?? [],
    deliverableType: f.deliverableType ?? '', timeline: f.timeline ?? '', budget: f.budget ?? '', references: f.references ?? [],
    openQuestions: f.openQuestions ?? [], provenance: f.provenance ?? {},
    attachmentIds: [...new Set(p.cards.slice(0, index + 1).flatMap(item => {const a = readBrief(item.brief).fields.attachment; return a ? [a.id] : [];}))],
    confirmedAt: confirmed ? confirmedAt || null : null, confirmedBy: confirmed?.actorId ?? null,
    createdAt: editedAt, updatedAt: confirmedAt || editedAt, changeNote: f.changeNote || null,
    supersededAt: card.id === p.activeTaskCardId ? null : eventTime(p, p.cards[index + 1] ?? card, 'revise-task-card') || null};
}
export function briefVersions(p: Snapshot): Brief[] {
  const latest = new Map<number, Brief>();
  for (const card of p.cards) {const brief = mapBrief(p, card); latest.set(brief.version, brief);}
  return [...latest.values()].reverse();
}
export function mapAttachments(p: Snapshot): BriefAttachment[] {
  const seen = new Set<string>();
  return p.cards.flatMap(card => {
    const a = readBrief(card.brief).fields.attachment;
    if (!a || seen.has(a.id)) return [];
    seen.add(a.id);
    return [{...a, projectId: p.id, briefVersion: businessVersion(p, card), createdAt: eventTime(p, card, 'revise-task-card'), addedBy: card.createdBy, fileAvailable: false}];
  });
}
export function mapProject(p: Snapshot): Project {
  if ((p.jobs.length || p.artifacts.length) && (p.workflowVersion !== 'proposal-seven-v1' || p.jobs.some(j => j.stage !== 'research' && !bridgeStorageJob(p, j)) || p.artifacts.some(a => a.stage !== 'research'))) throw new ServiceError('unavailable', '此项目已有执行记录，本轮简报入口不映射旧生产链，请使用原运行记录。');
  const card = currentCard(p), b = mapBrief(p, card), m = readBrief(card.brief).metadata;
  const confirmed = p.confirmations.some(item => item.taskCardId === card.id);
  return {id: p.id, name: p.name, client: m.client, summary: m.summary, revision: p.revision,
    currentStage: confirmed ? 'research' : 'brief', status: confirmed ? 'in_progress' : 'draft', createdAt: readBrief(p.cards[0].brief).savedAt,
    updatedAt: p.audit.at(-1)?.at || b.updatedAt, mode: p.policy.mode === 'auto' ? 'supervised' : 'step_by_step',
    humanGates: p.policy.humanGates.map(id => ({id, stage: id === 'strategy' ? 'strategy' : id === 'final_review' ? 'final' : 'creative', label: id, description: '已保存的人工节点，后续执行尚未接通。', status: 'not_reached', decidedAt: null, decidedBy: null})),
    owners: {research: m.researchOwner, strategy: m.strategyOwner},
    taskCard: {briefVersion: b.version, goal: b.objectives.join('\n'), successCriteria: b.deliverables, confirmedAt: b.confirmedAt, confirmedBy: b.confirmedBy}, continuedToStrategyAt: null};
}
export function mapOverview(p: Snapshot): ProjectOverview {
  const project = mapProject(p), brief = mapBrief(p, currentCard(p));
  const confirmed = p.confirmations.some(item => item.taskCardId === p.activeTaskCardId);
  return {project, brief, stages: STAGES.map(stage => ({stage, label: STAGE_LABELS[stage], state: stage === 'brief' ? confirmed ? 'complete' : 'current' : 'upcoming', note: stage === 'brief' ? '以实际任务卡与确认记录为准。' : '本轮仅接通简报，未启动执行。'})),
    blockers: [], recentActivity: p.audit.slice(-12).reverse().map(item => ({id: item.commandId, projectId: p.id, type: 'brief', message: item.kind, actor: item.actorId, createdAt: item.at})),
    nextAction: {label: confirmed ? '查看简报' : '确认简报', description: '确认不启动研究或后续Agent。', link: {view: 'brief'}, command: confirmed ? null : 'confirm_brief', enabled: true, disabledReason: null},
    eligibility: {projectId: p.id, target: 'strategy', eligible: false, alreadyContinued: false, summary: '后续业务尚未接入当前简报入口。', checks: []}, research: null, strategy: null, activeJobs: []};
}
export function briefCapabilities(): Capabilities {
  const feature = {supported: false, label: '未接通', reason: '本轮只接通项目与简报，不执行后续阶段。'};
  return {continuation_to_strategy: feature, creative_development: feature, final_proposal: feature, image_observation: feature, job_recovery: feature};
}
