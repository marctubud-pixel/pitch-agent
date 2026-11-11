import type { Artifact, Brief, Project } from '../../domain/models';
import type { Proposal } from '../../domain/proposal';
import { LEADS, stage } from '../proposal/fixtures/helpers';

const at = '2026-11-09T08:00:00Z';
export const qingyuAnchor = { projectId: 'qingyu', proposalId: 'qingyu-pack', briefId: 'brf-qingyu-v1', artifactId: 'art-qingyu-research-v1', lineageId: 'line-qingyu-pack-research', version: 1, briefVersion: 1 };
export const qingyuBrief: Brief = {
  id: qingyuAnchor.briefId, projectId: 'qingyu', version: 1, proposalType: 'packaging',
  brand: '青屿', background: '中国大陆虚构品牌青屿的包装设计研究。无糖即饮茶饮料，500ml单瓶，零售价目标6至8元；使用场景为便利店与电商商品图。全部为工程演练题设，不是已上市产品或真实客户任务。',
  audience: '25至34岁成年城市办公人群', objectives: ['理解货架选择、信息识别与审美参照，为包装策略提供研究输入'],
  researchQuestions: ['行业与市场有哪些已有变化？', '目标人群的包装信息与审美依据是什么？', '所选竞品如何表达茶种与产品特点？', '青屿已有条件及产品资料缺口是什么？'],
  deliverableType: '包装设计研究', deliverables: ['行业与市场、人群、竞品、产品本身、研究结论五板块研究'],
  constraints: ['清晰标明茶种及配料', '保留青色与山形线条', '不把无糖推导为健康功效', '消费者偏好与实际效果需来源支持'],
  timeline: '', budget: '', references: [], openQuestions: ['具体茶种、完整配料、工艺、口感与实物标签待提供', '目标人群审美与真实选择、同渠道价格资料待补'],
  provenance: {}, attachmentIds: [], confirmedAt: null, confirmedBy: null, createdAt: at, updatedAt: at, changeNote: '独立包装研究工程示例', supersededAt: null,
};
export const qingyuProject: Project = {
  id: 'qingyu', name: '青屿无糖茶 · 包装研究', client: '青屿（虚构品牌）', summary: '中国大陆无糖茶包装公开资料研究，目标人群与产品资料待补。',
  revision: 1, currentStage: 'research', status: 'blocked', createdAt: at, updatedAt: at, mode: 'supervised',
  humanGates: [{ id: 'qingyu-brief', stage: 'brief', label: '确认任务卡', description: '题设任务卡尚未确认。', status: 'not_reached', decidedAt: null, decidedBy: null }, { id: 'qingyu-release', stage: 'handoff', label: '研究释放', description: '研究待补，尚未核验或交接。', status: 'not_reached', decidedAt: null, decidedBy: null }],
  owners: { research: LEADS.research, strategy: LEADS.strategy }, taskCard: { briefVersion: 1, goal: qingyuBrief.objectives[0], successCriteria: [], confirmedAt: null, confirmedBy: null }, continuedToStrategyAt: null,
};
export const qingyuArtifact: Artifact = {
  id: qingyuAnchor.artifactId, projectId: 'qingyu', stage: 'research', lineageId: qingyuAnchor.lineageId, version: 1,
  title: '青屿无糖茶包装研究', summary: '公开资料研究待补；正文按五板块展示，未获得核验、充分性或释放批准。',
  sections: [{ id: 'qingyu-gap', heading: '待补研究', blocks: [{ kind: 'callout', tone: 'gap', text: '目标办公者审美与选择、青屿具体产品资料仍缺。' }] }],
  claimIds: [], createdAt: at, status: 'draft', isCurrent: true, supersededAt: null, basedOn: { briefVersion: 1, researchArtifactId: null }, staleReason: null,
  producedByJobId: null, release: null, coverage: [{ topic: 'audience', minSupportedClaims: 1, guidance: '补目标办公者审美与选择资料。' }, { topic: 'production', minSupportedClaims: 1, guidance: '补茶种、配料、工艺、口感与实物标签。' }], simulated: true,
};
export const qingyuProposal: Proposal = {
  id: 'qingyu-pack', workbenchId: 'qingyu', name: qingyuProject.name, client: qingyuProject.client, type: 'packaging', summary: qingyuProject.summary,
  cover: { kind: 'scene', scene: 'contour', palette: ['#89c6c3', '#153e47', '#d4e9df'], label: '青屿研究工程示例' },
  mode: 'automatic', checkpoints: [], currentStage: 'research', stages: {
    brief: stage('in_progress', '工程示例任务卡第1版，尚未确认。', LEADS.brief, at), research: stage('needs_revision', '研究待补，目标人群与产品资料仍缺。', LEADS.research, at),
    strategy: stage('not_started', '等待研究释放。', LEADS.strategy, null), themes: stage('not_started', '', LEADS.themes, null), visual: stage('not_started', '', LEADS.visual, null), content_review: stage('not_started', '', LEADS.content_review, null), layout: stage('not_started', '', LEADS.layout, null), delivery: stage('not_started', '', LEADS.delivery, null),
  },
  task: { assignment: qingyuBrief.objectives[0], output: qingyuBrief.deliverables[0], occasion: '便利店与电商商品图', scope: qingyuBrief.deliverables, inputs: [], unknowns: [{ id: 'qingyu-product', topic: '具体产品资料', why: qingyuBrief.openQuestions[0] }, { id: 'qingyu-people', topic: '目标人群', why: qingyuBrief.openQuestions[1] }] },
  research: null, strategy: null, themes: null, visual: null, contentReview: null, layout: null, delivery: null,
  decisions: [], contributions: [], tasks: [], reviews: [], handoffs: [], versions: [{ id: 'qingyu-b1', stage: 'brief', label: '任务卡', version: 1, inputs: ['工程演练题设'], at, state: 'needs_review', impact: null }, { id: 'qingyu-r1', stage: 'research', label: '研究', version: 1, inputs: ['任务卡第1版', '公开资料与官方物料'], at, state: 'needs_review', impact: '研究待补。' }], revision: 1, updatedAt: at,
};

export function qingyuBriefSnapshot(brief: Brief) {
  return { id: brief.id, projectId: brief.projectId, version: brief.version, proposalType: brief.proposalType, brand: brief.brand, background: brief.background, audience: brief.audience, objectives: brief.objectives, researchQuestions: brief.researchQuestions, deliverables: brief.deliverables, constraints: brief.constraints, deliverableType: brief.deliverableType, timeline: brief.timeline, budget: brief.budget, references: brief.references, openQuestions: brief.openQuestions, attachmentIds: brief.attachmentIds };
}
