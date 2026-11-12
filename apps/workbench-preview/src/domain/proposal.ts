import type {PrelayoutReadRecord} from './prelayoutRead';
/**
 * The stored proposal model retains all eight historical stage identities.
 *
 * Two layers sit behind it:
 *  - The Workbench service contract (domain/service.ts) holds what the backend already
 *    implements: briefs and task cards, sources, research claims, evidence verification,
 *    sufficiency review, owner handoffs, release, jobs and artifact versions.
 *  - The Proposal service (this file) holds the creative stages, modes, checkpoints and the
 *    agent review record. In this build it is a prototype with scripted demo content.
 *
 * Each proposal links to one Workbench project, so the working parts are read from there.
 */
import type { ID, ISODateTime } from './models';
import type { BrandResource, BrandResourceUpload } from './brandResources';

import type { ProposalType } from './proposalType';
export type { ProposalType } from './proposalType';

export const STAGES = ['brief', 'research', 'strategy', 'themes', 'visual', 'content_review', 'layout', 'delivery'] as const;
export type StageId = (typeof STAGES)[number];

export const ACTIVE_STAGES = ['brief', 'research', 'strategy', 'themes', 'visual', 'layout', 'delivery'] as const;
export type ActiveStageId = (typeof ACTIVE_STAGES)[number];
export function activeStage(stage: StageId): ActiveStageId {
  return stage === 'content_review' ? 'layout' : stage;
}
export function nextActiveStage(stage: StageId): ActiveStageId | null {
  return stage === 'content_review' ? 'layout' : ACTIVE_STAGES[ACTIVE_STAGES.indexOf(stage) + 1] ?? null;
}


/** Stages a person can choose to pause at in assisted mode. */
export const CHECKPOINT_STAGES = ['strategy', 'themes', 'visual', 'content_review', 'delivery'] as const;
export type CheckpointStage = (typeof CHECKPOINT_STAGES)[number];
export const ACTIVE_CHECKPOINT_STAGES = CHECKPOINT_STAGES.filter((stage) => stage !== 'content_review');

export type StageStatus = 'done' | 'in_progress' | 'waiting_for_you' | 'needs_revision' | 'not_started';

export type ProductionMode = 'automatic' | 'assisted';

/** How a part of the product is backed in this build. Shown wherever it matters. */
export type Backing = 'connected' | 'prototype' | 'planned';

// ---------------------------------------------------------------------------
// Artwork: described as data, drawn by the interface. All demo artwork is generated.
// ---------------------------------------------------------------------------

export type SceneId =
  | 'ridge'
  | 'ridge-frost'
  | 'group-dusk'
  | 'fabric-terrain'
  | 'summit'
  | 'studio-jacket'
  | 'cabin-window'
  | 'contour'
  | 'knit'
  | 'thermos'
  | 'catalogue-1970'
  | 'plum-ink'
  | 'bubbles'
  | 'rooftop'
  | 'orchard'
  | 'gift-wrap'
  | 'shelf-lineup'
  | 'fruit-flatlay'
  | 'perfume-glass'
  | 'festival-lanterns'
  | 'chiller';

export interface SceneSpec {
  kind: 'scene';
  scene: SceneId;
  palette: string[];
  /** Variation within the scene (deterministic). */
  seed?: number;
  /** Horizon / focal arrangement, used for sketches and posters. */
  composition?: 'low-horizon' | 'high-horizon' | 'centered' | 'diagonal' | 'close-up' | 'wide' | 'split';
  /** Pencil-on-paper rendering, for composition sketches. */
  sketch?: boolean;
  label?: string;
}

export interface PosterSpec {
  kind: 'poster';
  scene: SceneSpec;
  headline: string;
  subline?: string;
  brand: string;
  /** Where the type sits and how it meets the image. */
  typeLayout: 'sky' | 'behind-ridge' | 'stacked-left' | 'bottom-band' | 'vertical';
  typeface: 'serif' | 'grotesk' | 'brush';
  ink: string;
  /** Print format. Posters come in standard ratios; portrait 3:4 unless stated. */
  format?: PosterFormat;
}

export type PosterFormat = '9:16' | '3:4' | '4:3' | '16:9';

export interface CanDesign {
  base: string;
  ink: string;
  accent: string;
  pattern: 'plum-ink' | 'bubbles' | 'panorama' | 'plain';
  wordmark: string;
  flavour: string;
  /** For the panorama route: which quarter of the shared picture this can carries. */
  panel?: 0 | 1 | 2 | 3;
}

export interface PackSpec {
  kind: 'pack';
  format: 'can' | 'four-pack' | 'gift-box';
  view: 'front' | 'three-quarter' | 'back' | 'top' | 'open';
  design: CanDesign;
}

export interface MockupSpec {
  kind: 'mockup';
  surface: 'bus-shelter' | 'elevator' | 'phone' | 'store-window' | 'billboard' | 'shelf' | 'gift-table' | 'hand';
  inner: PosterSpec | PackSpec | SceneSpec;
}

export type ArtSpec = SceneSpec | PosterSpec | PackSpec | MockupSpec;

export interface ChartSpec {
  id: string;
  kind: 'bar' | 'timeline' | 'split';
  title: string;
  /** What the numbers count, in plain words. */
  measure: string;
  data: Array<{ label: string; value: number; highlight?: boolean }>;
  note: string;
  /** Every chart in the demo is illustrative. */
  demoData: true;
}

// ---------------------------------------------------------------------------
// Evidence references (to Workbench claims, cases, sources or the brief)
// ---------------------------------------------------------------------------

export interface EvidenceRef {
  label: string;
  kind: 'claim' | 'case' | 'brief' | 'chart';
  /** Workbench claim ID (without the artifact prefix), case ID, brief field or chart ID. */
  ref: string;
}

// ---------------------------------------------------------------------------
// A. Brief & task definition (the task card itself lives in the Workbench brief)
// ---------------------------------------------------------------------------

export interface TaskExtras {
  /** One line: what the proposal must produce. */
  assignment: string;
  output: string;
  occasion: string | null;
  scope: string[];
  /** Material supplied beyond the brief document. */
  inputs: Array<{ id: ID; kind: 'image' | 'link' | 'pdf' | 'text'; title: string; note: string; art?: ArtSpec }>;
  /** Business facts the brief does not settle, kept as unknowns rather than guessed. */
  unknowns: Array<{ id: ID; topic: string; why: string }>;
}

// ---------------------------------------------------------------------------
// B. Research board
// ---------------------------------------------------------------------------

export type ResearchSectionId = 'brand' | 'category' | 'audience' | 'context';

/** What a piece of research material can be used for. Kept distinct on purpose. */
export type MaterialKind = 'comparison' | 'background' | 'inspiration' | 'unverified';

export interface CaseItem {
  id: ID;
  title: string;
  caption: string;
  art: ArtSpec;
  source: string;
  date: string;
  applicability: string;
  limitation: string | null;
}

export interface CaseGroup {
  id: ID;
  title: string;
  kind: MaterialKind;
  takeaway: string;
  items: CaseItem[];
}

export interface BoardFinding {
  id: ID;
  text: string;
  kind: MaterialKind | 'evidence';
  /** Workbench claim this finding restates, when there is one (its support status is read live). */
  claimRef: string | null;
  note: string | null;
}

export interface ResearchSection {
  id: ResearchSectionId;
  title: string;
  summary: string;
  findings: BoardFinding[];
  groups: CaseGroup[];
  chart: ChartSpec | null;
}

export interface ResearchBoard {
  /** Why the research took this shape for this assignment. */
  adaptation: string;
  summary: string;
  sections: ResearchSection[];
}

// ---------------------------------------------------------------------------
// C. Strategy
// ---------------------------------------------------------------------------

export interface StrategyPoint {
  text: string;
  evidence: EvidenceRef[];
}

export interface Strategy {
  question: string;
  structure: 'sequential' | 'question-parallel-synthesis';
  circles: Record<'category' | 'brand' | 'audience', { title: string; points: StrategyPoint[] }>;
  intersection: { insight: string; why: string };
  argument: Array<{ step: string; detail: string; evidence: EvidenceRef[] }>;
  conclusion: string;
  answer: string;
  opportunities: Array<{ id: ID; title: string; idea: string; because: string; evidence: EvidenceRef[]; leadsTo: DirectionId | null }>;
}

// ---------------------------------------------------------------------------
// D. Copy & creative themes
// ---------------------------------------------------------------------------

export type DirectionId = 'A' | 'B' | 'C';
export type Mechanism = 'evolution' | 'product' | 'audience';

export interface ScoreLine {
  criterion: string;
  score: number;
  note: string;
}

export interface Challenge {
  /** The positive judgement being challenged. */
  claim: string;
  challenge: string;
  resolution: string;
  outcome: 'upheld' | 'partly_upheld' | 'rejected';
}

export interface Direction {
  id: DirectionId;
  mechanism: Mechanism;
  name: string;
  slogan: string;
  subline: string;
  rationale: string;
  connections: { brand: string; audience: string; assignment: string };
  difference: string;
  copyLines: string[];
  color: string;
  scores: ScoreLine[];
  challenges: Challenge[];
  brandView: string;
  audienceView: string;
  /** Review outcome, kept apart from what a person chose. */
  reviewOutcome: 'passed' | 'passed_with_notes' | 'below_threshold';
  /** What happened to the direction, including a person overriding a reviewer. */
  disposition: 'recommended' | 'kept' | 'kept_by_you_despite_review' | 'replaced';
}

export interface Themes {
  copyDirection: string;
  historicalNote: string;
  directions: Direction[];
  recommendation: { id: DirectionId; reasons: string[] };
  directorNote: string;
}

// ---------------------------------------------------------------------------
// E. Visual development (one branch per direction)
// ---------------------------------------------------------------------------

export interface ReferenceCandidate {
  id: ID;
  title: string;
  origin: 'task_matched' | 'cross_industry';
  art: ArtSpec;
  borrow: string;
  verdict: 'selected' | 'rejected';
  reason: string;
}

export interface SketchCandidate {
  id: ID;
  title: string;
  art: ArtSpec;
  scores: ScoreLine[];
  verdict: 'selected' | 'rejected';
  reason: string;
}

export interface RefinedVisual {
  version: number;
  art: ArtSpec;
  explanation: string;
  scores: ScoreLine[];
  /** Calibrated threshold: average of at least 4 out of 5, plus every mandatory requirement. */
  requirements: Array<{ text: string; met: boolean; note: string }>;
  status: 'accepted' | 'superseded' | 'awaiting_review' | 'not_started';
  challenge: Challenge | null;
}

export interface VisualBranch {
  directionId: DirectionId;
  search: { seeking: string; borrow: string[]; notFor: string };
  references: ReferenceCandidate[];
  referenceNote: string;
  sketches: SketchCandidate[];
  sketchNote: string;
  refined: RefinedVisual[];
  /** Packaging: views of the concept. KV: empty. */
  views: Array<{ label: string; art: ArtSpec }>;
  mockups: Array<{ label: string; why: string; art: ArtSpec }>;
}

export interface VisualDevelopment {
  branches: VisualBranch[];
  similarity: Array<{ pair: [DirectionId, DirectionId]; level: 'low' | 'medium' | 'high'; note: string; action: string }>;
  /** Packaging only: what the concept does not settle. */
  conceptLimits: string[];
}

// ---------------------------------------------------------------------------
// F. Full content review (before layout)
// ---------------------------------------------------------------------------

export interface NarrativeSection {
  id: ID;
  title: string;
  text: string;
  /** Text before the review changed it, when it changed. */
  before: string | null;
  changeReason: string | null;
}

export interface ContentReview {
  checks: Array<{ id: ID; question: string; outcome: 'pass' | 'revised' | 'open'; note: string }>;
  narrative: NarrativeSection[];
}

// ---------------------------------------------------------------------------
// G. Presentation layout
// ---------------------------------------------------------------------------

export type SlideKind = 'cover' | 'question' | 'insight' | 'data' | 'conclusion' | 'strategy' | 'theme' | 'visual' | 'mockup' | 'comparison' | 'recommendation' | 'closing';

export interface Slide {
  id: ID;
  kind: SlideKind;
  /** The one thing that leads the slide. */
  lead: string;
  support: string;
  directionId?: DirectionId;
  art?: ArtSpec;
  chart?: ChartSpec;
  bigNumber?: string;
  notes: string;
}

export interface LayoutStyle {
  id: 'editorial' | 'poster' | 'gallery' | 'cobalt' | 'studio';
  name: string;
  idea: string;
  /** How references were turned into composition decisions. */
  decisions: string[];
  /** palette.highlight and palette.wash are the second accent and the pale alternate page, when a style has them. */
  palette: { paper: string; ink: string; accent: string; muted: string; highlight?: string; wash?: string };
  typeface: 'serif' | 'grotesk';
  /** The supplied reference this style was built from, when there is one. */
  reference?: string;
}

export interface Layout {
  styles: LayoutStyle[];
  chosen: LayoutStyle['id'] | null;
  chosenBy: 'you' | 'director' | null;
  slides: Slide[];
  editability: { native: string[]; raster: string[] };
}

// ---------------------------------------------------------------------------
// H. Final review & delivery
// ---------------------------------------------------------------------------

export interface Delivery {
  checks: Array<{ id: ID; area: string; outcome: 'pass' | 'fixed' | 'open'; note: string }>;
  comparison: Array<{ criterion: string; values: Record<DirectionId, string> }>;
  recommendation: string;
  limitations: string[];
}

// ---------------------------------------------------------------------------
// People, agents and the process record
// ---------------------------------------------------------------------------

export interface HumanDecision {
  id: ID;
  stage: StageId;
  kind: 'approved' | 'revision_requested' | 'chosen_despite_review' | 'mode_changed';
  by: string;
  at: ISODateTime;
  comment: string;
  /** For a choice made against reviewer advice: what the reviewers recommended. */
  reviewerPosition: string | null;
}

export type ContributionTarget =
  | { kind: 'stage'; stage: StageId; version: number }
  | { kind: 'visual'; stage: 'visual'; directionId: DirectionId; version: number }
  | { kind: 'theme'; stage: 'themes'; directionId: DirectionId; version: number };

export interface ProposalWriteMeta {
  expectedRevision: number;
  actor?: { id: ID; name: string; role?: string };
}

export interface ContributionProcessing {
  id: ID;
  status: 'considered' | 'used';
  reason: string;
  by: string;
  authorId?: ID;
  authorRole?: string;
  at: ISODateTime;
  target?: ContributionTarget;
}

export interface Contribution {
  id: ID;
  stage: StageId;
  kind: 'comment' | 'slogan' | 'reference' | 'theme';
  text: string;
  /** For a reference: what to borrow from it. */
  borrow: string | null;
  by: string;
  at: ISODateTime;
  status: 'new' | 'considered' | 'used';
  response: string | null;
  target?: ContributionTarget;
  authorId?: ID;
  authorRole?: string;
  processing?: ContributionProcessing[];
}

export type AgentLevel = 'director' | 'lead' | 'specialist' | 'evaluator' | 'adversary';

export interface AgentTask {
  target?: ContributionTarget;
  id: ID;
  stage: StageId;
  agent: string;
  level: AgentLevel;
  task: string;
  status: 'done' | 'running' | 'queued' | 'failed';
  startedAt: ISODateTime;
  seconds: number;
  receipt: string;
}

export interface ReviewRecord {
  target?: ContributionTarget;
  id: ID;
  stage: StageId;
  subject: string;
  evaluator: string;
  average: number | null;
  verdict: string;
  challenge: Challenge | null;
  directorResolution: string | null;
  at: ISODateTime;
}

export interface AgentHandoff {
  target?: ContributionTarget;
  id: ID;
  from: StageId;
  to: StageId;
  producer: string;
  consumer: string;
  producerCheck: string;
  consumerCheck: string;
  status: 'accepted' | 'returned' | 'pending';
  at: ISODateTime;
}

export interface VersionRecord {
  target?: ContributionTarget;
  id: ID;
  stage: StageId;
  label: string;
  version: number;
  inputs: string[];
  at: ISODateTime;
  state: 'current' | 'superseded' | 'needs_review';
  impact: string | null;
}

export interface StageState {
  status: StageStatus;
  /** One plain sentence about where the stage stands. */
  summary: string;
  updatedAt: ISODateTime | null;
  lead: string;
  version: number;
}

export interface Proposal {
  /** Saved prelayout metadata only; no native IO or approval qualification. */
  prelayoutRecords?:PrelayoutReadRecord[];
  id: ID;
  workbenchId: ID;
  name: string;
  client: string;
  /** Local calendar minute (YYYY-MM-DDTHH:mm), without timezone conversion. */
  presentationLocalTime?: string;
  brandResources?: BrandResource[];
  type: ProposalType;
  summary: string;
  cover: ArtSpec | null;
  mode: ProductionMode;
  checkpoints: CheckpointStage[];
  currentStage: StageId;
  stages: Record<StageId, StageState>;
  task: TaskExtras;
  research: ResearchBoard | null;
  strategy: Strategy | null;
  themes: Themes | null;
  visual: VisualDevelopment | null;
  contentReview: ContentReview | null;
  layout: Layout | null;
  delivery: Delivery | null;
  decisions: HumanDecision[];
  contributions: Contribution[];
  tasks: AgentTask[];
  reviews: ReviewRecord[];
  handoffs: AgentHandoff[];
  versions: VersionRecord[];
  revision: number;
  updatedAt: ISODateTime;
}

export interface ProposalSummary {
  id: ID;
  name: string;
  client: string;
  presentationLocalTime?: string;
  type: ProposalType;
  summary: string;
  cover: ArtSpec | null;
  mode: ProductionMode;
  currentStage: StageId;
  currentStatus: StageStatus;
  stageStatus: Record<StageId, StageStatus>;
  workbenchId: ID;
  attention: number;
  updatedAt: ISODateTime;
}

export interface CreateProposalInput {
  workbenchId: ID;
  name: string;
  client: string;
  presentationLocalTime?: string;
  brandResources?: BrandResource[];
  type: ProposalType;
  mode: ProductionMode;
  checkpoints: CheckpointStage[];
}

export type DecisionInput =
  | { kind: 'approve'; comment: string }
  | { kind: 'request_revision'; comment: string }
  | { kind: 'choose'; comment: string; choice: string; reviewerPosition: string };

export interface ContributionInput {
  target?: ContributionTarget;
  kind: Contribution['kind'];
  text: string;
  borrow: string | null;
}

/** Prototype service for the creative stages. Replace with a backend adapter when one exists. */
export type BrandResourceUploadPolicy = {available: true; accept: string; maxBytes: number; maxCount: number; hint: string} | {available: false; reason: string};

export interface ProposalService {
  readonly backing: Backing;
  getBrandResourceUploadPolicy?(): Promise<BrandResourceUploadPolicy>;
  ensureBrandResourceStorage(resources?: BrandResourceUpload[]): Promise<void>;
  stageBrandResources(input: { workbenchId: ID; resources: BrandResourceUpload[] }): Promise<void>;
  getBrandResourceFile(proposalId: ID, resourceId: string): Promise<Blob>;
  listProposals(): Promise<ProposalSummary[]>;
  getProposal(id: ID): Promise<Proposal>;
  findByWorkbenchId(workbenchId: ID): Promise<Proposal | null>;
  createProposal(input: CreateProposalInput, meta?: ProposalWriteMeta): Promise<Proposal>;
  setMode(id: ID, mode: ProductionMode, checkpoints: CheckpointStage[], meta?: ProposalWriteMeta): Promise<Proposal>;
  decide(id: ID, stage: StageId, decision: DecisionInput, meta?: ProposalWriteMeta): Promise<Proposal>;
  contribute(id: ID, stage: StageId, input: ContributionInput, meta?: ProposalWriteMeta): Promise<Proposal>;
  resolveContribution(id: ID, contributionId: ID, input: { status: 'considered' | 'used'; reason: string }, meta?: ProposalWriteMeta): Promise<Proposal>;
  editNarrative(id: ID, sectionId: ID, text: string, meta?: ProposalWriteMeta): Promise<Proposal>;
  chooseLayout(id: ID, style: LayoutStyle['id'], meta?: ProposalWriteMeta): Promise<Proposal>;
  subscribe(listener: (proposalId: ID | null) => void): () => void;
}
