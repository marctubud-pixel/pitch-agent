/**
 * Research-stage demo: Luma. Its research board is built from the Workbench research artifact
 * (claims, sources, images, checks), and it is genuinely held by the evidence checks: one claim
 * has no citation and the audience evidence does not isolate the age band in the brief.
 * Later stages have no content yet.
 */
import type { CanDesign, Proposal } from '../../../domain/proposal';
import { LEADS, pack, stage } from './helpers';

const LUMA_CAN: CanDesign = { base: '#e8b43c', ink: '#2b1d12', accent: '#d9604c', pattern: 'plain', wordmark: 'Luma', flavour: 'Current can (2025)' };

export const luma: Proposal = {
  id: 'luma-pack',
  workbenchId: 'luma',
  name: 'Luma Social Spirits — can redesign',
  client: 'Luma Drinks Co. (fictional)',
  type: 'packaging',
  summary: 'Three packaging routes for Luma’s can before next spring’s redesign decision.',
  cover: pack('can', 'three-quarter', LUMA_CAN),
  mode: 'automatic',
  checkpoints: [],
  currentStage: 'research',
  stages: {
    brief: stage('done', 'Task card confirmed (v2): audience narrowed to adults aged 25–34 by the client.', LEADS.brief, '2026-10-16T09:10:00Z', 2),
    research: stage('needs_revision', 'Evidence checks found 2 issues. Research cannot be released until they are fixed.', LEADS.research, '2026-10-24T08:31:00Z'),
    strategy: stage('not_started', 'Waits for released research.', LEADS.strategy, null),
    themes: stage('not_started', 'Waits for strategy.', LEADS.themes, null),
    visual: stage('not_started', '', LEADS.visual, null),
    content_review: stage('not_started', '', LEADS.content_review, null),
    layout: stage('not_started', '', LEADS.layout, null),
    delivery: stage('not_started', '', LEADS.delivery, null),
  },
  task: {
    assignment: 'Three evidence-backed packaging routes for Luma’s 250 ml can.',
    output: 'Packaging routes with rationale and an editable deck.',
    occasion: 'Small gatherings at home',
    scope: ['Three can routes', 'Shelf mockups', 'Editable deck'],
    inputs: [{ id: 'li1', kind: 'image', title: 'Current can (2025)', note: 'Designed for a single bar partner.', art: pack('can', 'front', LUMA_CAN) }],
    unknowns: [
      { id: 'lu1', topic: 'Alcohol strength', why: 'The brief calls the brand “light and easy-going”. That describes its tone, not its strength, so no strength is shown or implied.' },
      { id: 'lu2', topic: 'Who buys and who drinks', why: 'Hosts may buy for guests; the brief does not say whether the buyer is also the drinker.' },
      { id: 'lu3', topic: 'Redesign budget', why: 'Not in the brief.' },
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
    { id: 'lt1', stage: 'research', agent: 'Research Lead', level: 'lead', task: 'Draft research from 8 sources', status: 'done', startedAt: '2026-10-22T09:58:00Z', seconds: 94, receipt: 'rcpt_lu_res' },
    { id: 'lt2', stage: 'research', agent: 'Evidence Verifier', level: 'evaluator', task: 'Verify every claim against its source excerpts', status: 'done', startedAt: '2026-10-23T09:10:00Z', seconds: 41, receipt: 'rcpt_lu_verify' },
    { id: 'lt3', stage: 'research', agent: 'Sufficiency Reviewer', level: 'evaluator', task: 'Check evidence coverage per topic', status: 'done', startedAt: '2026-10-23T09:38:00Z', seconds: 33, receipt: 'rcpt_lu_ready' },
  ],
  reviews: [],
  handoffs: [],
  versions: [
    { id: 'lv1', stage: 'brief', label: 'Task card', version: 2, inputs: ['Client call notes'], at: '2026-10-16T09:10:00Z', state: 'current', impact: null },
    { id: 'lv2', stage: 'research', label: 'Research', version: 1, inputs: ['Task card v2', '8 sources'], at: '2026-10-22T10:00:00Z', state: 'needs_review', impact: 'A new audience source arrived after verification; checks must run again.' },
  ],
  revision: 14,
  updatedAt: '2026-10-24T08:31:00Z',
};
