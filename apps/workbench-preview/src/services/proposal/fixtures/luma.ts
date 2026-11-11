/**
 * Research-stage demo: Luma. Its research board is built from the Workbench research artifact
 * (claims, sources, images, checks), and it is genuinely held by the evidence checks: one claim
 * has no citation and the audience evidence does not isolate the age band in the brief.
 * Later stages have no content yet.
 */
import type { CanDesign, Proposal } from '../../../domain/proposal';
import { LEADS, pack, stage } from './helpers';

const LUMA_CAN: CanDesign = { base: '#e8b43c', ink: '#2b1d12', accent: '#d9604c', pattern: 'plain', wordmark: "露玛", flavour: "现有罐装（2025年）" };

export const luma: Proposal = {
  id: 'luma-pack',
  workbenchId: 'luma',
  name: "露玛社交饮品 · 罐装改版",
  client: "露玛饮品（虚构品牌）",
  type: 'packaging',
  summary: "在下一年春季改版决定前，探索三个罐装包装方向。",
  cover: pack('can', 'three-quarter', LUMA_CAN),
  mode: 'automatic',
  checkpoints: [],
  currentStage: 'research',
  stages: {
    brief: stage('done', "任务卡第2版已确认，演示客户将受众收窄为25—34岁成年人。", LEADS.brief, '2026-10-16T09:10:00Z', 2),
    research: stage('needs_revision', "证据检查发现2项问题，修正前不能释放调研。", LEADS.research, '2026-10-24T08:31:00Z'),
    strategy: stage('not_started', "等待调研释放。", LEADS.strategy, null),
    themes: stage('not_started', "等待策略。", LEADS.themes, null),
    visual: stage('not_started', '', LEADS.visual, null),
    content_review: stage('not_started', '', LEADS.content_review, null),
    layout: stage('not_started', '', LEADS.layout, null),
    delivery: stage('not_started', '', LEADS.delivery, null),
  },
  task: {
    assignment: "为露玛250毫升罐装形成三个有依据的包装方向。",
    output: "包装方向、理由说明及可编辑提案。",
    occasion: "家庭小型相聚",
    scope: ["三个罐装方向", "货架应用示意", "可编辑演示文稿"],
    inputs: [{ id: 'li1', kind: 'image', title: "现有罐装（2025年）", note: "仅为一家合作酒吧设计。", art: pack('can', 'front', LUMA_CAN) }],
    unknowns: [
      { id: 'lu1', topic: "酒精度", why: "简报中的轻松随和是品牌语气，不代表酒精度，因此不展示或暗示具体数值。" },
      { id: 'lu2', topic: "谁购买，谁饮用", why: "主人可能为客人购买，简报没有说明购买者是否同时饮用。" },
      { id: 'lu3', topic: "改版预算", why: "简报未提供。" },
    ],
  },
  research: null,
  strategy: null,
  themes: null,
  visual: null,
  contentReview: null,
  layout: null,
  delivery: null,
  decisions: [],
  contributions: [],
  tasks: [
    { id: 'lt1', stage: 'research', agent: "调研负责人", level: 'lead', task: "来自8份演示来源的调研草稿", status: 'done', startedAt: '2026-10-22T09:58:00Z', seconds: 94, receipt: 'rcpt_lu_res' },
    { id: 'lt2', stage: 'research', agent: "证据核验员", level: 'evaluator', task: "将每条断言与来源摘录核对", status: 'done', startedAt: '2026-10-23T09:10:00Z', seconds: 41, receipt: 'rcpt_lu_verify' },
    { id: 'lt3', stage: 'research', agent: "充分性审阅员", level: 'evaluator', task: "检查各主题证据覆盖", status: 'done', startedAt: '2026-10-23T09:38:00Z', seconds: 33, receipt: 'rcpt_lu_ready' },
  ],
  reviews: [],
  handoffs: [],
  versions: [
    { id: 'lv1', stage: 'brief', label: "任务卡", version: 2, inputs: ["客户沟通演示笔记"], at: '2026-10-16T09:10:00Z', state: 'current', impact: null },
    { id: 'lv2', stage: 'research', label: "调研", version: 1, inputs: ["任务卡第2版", "8份演示来源"], at: '2026-10-22T10:00:00Z', state: 'needs_review', impact: "核验后新增了一份受众资料，需要重新检查受影响的依据。" },
  ],
  revision: 14,
  updatedAt: '2026-10-24T08:31:00Z',
};
