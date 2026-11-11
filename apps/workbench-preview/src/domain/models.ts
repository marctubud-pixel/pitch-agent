/**
 * Frontend contract for Proposal Workbench.
 *
 * These types describe what the UI needs, not what any backend sends. A backend adapter
 * (see src/services/http) maps real payloads into these shapes. IDs are strings and all
 * timestamps are ISO 8601 strings.
 */

import type { ProposalType } from './proposalType';
import type { ResearchMethodPlan } from './researchMethod';

export type ID = string;
export type ISODateTime = string;

// ---------------------------------------------------------------------------
// Workflow stages
// ---------------------------------------------------------------------------

export const STAGES = [
  'brief',
  'research',
  'verification',
  'readiness',
  'handoff',
  'strategy',
  'creative',
  'final',
] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  brief: 'Brief',
  research: 'Research',
  verification: 'Evidence verification',
  readiness: 'Research readiness',
  handoff: 'Owner handoff',
  strategy: 'Strategy',
  creative: 'Creative development',
  final: 'Final proposal',
};

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

export type ProjectStatus = 'draft' | 'in_progress' | 'blocked' | 'ready' | 'needs_update';

/** How much the workflow runs on its own between human gates. */
export type ExecutionMode = 'supervised' | 'step_by_step';

export type GateStatus = 'not_reached' | 'awaiting_decision' | 'approved' | 'blocked';

export interface HumanGate {
  id: ID;
  stage: Stage;
  label: string;
  description: string;
  status: GateStatus;
  decidedAt: ISODateTime | null;
  decidedBy: string | null;
}

/** The confirmed interpretation of the brief that downstream work is held to. */
export interface TaskCard {
  briefVersion: number | null;
  goal: string;
  successCriteria: string[];
  confirmedAt: ISODateTime | null;
  confirmedBy: string | null;
}

export interface Project {
  id: ID;
  name: string;
  client: string;
  summary: string;
  /** Increments on every change to project state. Mutations must send it back as expectedRevision. */
  revision: number;
  currentStage: Stage;
  status: ProjectStatus;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  mode: ExecutionMode;
  humanGates: HumanGate[];
  owners: { research: string; strategy: string };
  taskCard: TaskCard;
  continuedToStrategyAt: ISODateTime | null;
}

// ---------------------------------------------------------------------------
// Brief
// ---------------------------------------------------------------------------

/**
 * The task card: every field of the brief, in display order. `projectName` lives on the project;
 * the rest are stored on each brief version.
 */
export const TASK_FIELDS = [
  'projectName',
  'brand',
  'background',
  'objectives',
  'researchQuestions',
  'audience',
  'deliverableType',
  'deliverables',
  'constraints',
  'timeline',
  'budget',
  'references',
  'openQuestions',
] as const;
export type TaskField = (typeof TASK_FIELDS)[number];
export type BriefField = Exclude<TaskField, 'projectName'>;
export const LIST_FIELDS: ReadonlySet<TaskField> = new Set(['objectives', 'researchQuestions', 'deliverables', 'constraints', 'references', 'openQuestions']);
/** Needed before research can start. Everything else may stay open. */
export const CARD_MAIN_FIELDS: readonly TaskField[] = ['projectName', 'brand', 'background', 'audience', 'deliverables'];
export const CARD_MORE_FIELDS: readonly TaskField[] = ['researchQuestions', 'constraints'];
export const ACTIVE_TASK_FIELDS: readonly TaskField[] = [...CARD_MAIN_FIELDS, ...CARD_MORE_FIELDS];
export const REQUIRED_FIELDS: readonly BriefField[] = ['background', 'audience', 'deliverables'];

/**
 * Where a field's value came from.
 *  - provided: stated in the brief (with the source passage)
 *  - suggested: proposed by extraction; a person must accept or change it
 *  - ambiguous: the brief mentions it, but not clearly enough to rely on
 *  - missing: the brief does not say
 *  - accepted: a person accepted a suggestion
 *  - edited: a person wrote or changed the value
 */
export type FieldOrigin = 'provided' | 'suggested' | 'ambiguous' | 'missing' | 'accepted' | 'edited';

export interface SourceSpan {
  attachmentId: ID;
  start: number;
  end: number;
  quote: string;
}

/**
 * Why a field has its origin. Codes rather than sentences, so any service can send them and the
 * interface explains them in the reader's language.
 */
export type ProvenanceReason =
  | 'stated' // the brief says it
  | 'heading' // copied word for word from under a matching heading
  | 'inferred' // a suggestion drawn from the wording; needs confirmation
  | 'vague' // mentioned, but not specific enough to rely on
  | 'conflict' // two statements do not agree
  | 'not_stated' // the brief does not say
  | 'no_mapping'; // not looked for: automatic mapping is unavailable for this material

export interface FieldProvenance {
  origin: FieldOrigin;
  reason: ProvenanceReason | null;
  /** Passages of the original material the value was taken from or relates to. */
  spans: SourceSpan[];
}

export type BriefProvenance = Partial<Record<TaskField, FieldProvenance>>;

/** The original material a brief version was built from. */
export interface BriefAttachment {
  id: ID;
  projectId: ID;
  /** Brief version the material was first applied to. */
  briefVersion: number;
  kind: 'file' | 'paste' | 'request' | 'sample';
  fileName: string | null;
  mimeType: string | null;
  size: number;
  /** The text extracted from the file, or the text as typed or pasted. */
  text: string;
  extraction: ExtractionSummary;
  mapping: MappingMode;
  sampleId: string | null;
  createdAt: ISODateTime;
  addedBy: string;
  /** False when the original file is no longer available (it is kept for the browser session only in the demo). */
  fileAvailable: boolean;
}

export interface ExtractionSummary {
  method: 'plain_text' | 'docx' | 'pdf' | 'typed';
  pages: number | null;
  warnings: string[];
}

/** How the task-card fields were produced from the text. */
export type MappingMode = 'simulated_sample' | 'headings' | 'none';

export interface Brief {
  id: ID;
  projectId: ID;
  version: number;
  proposalType?: ProposalType;
  editedBy?: string;
  editedAt?: ISODateTime;
  background: string;
  audience: string;
  objectives: string[];
  deliverables: string[];
  constraints: string[];
  brand: string;
  researchQuestions: string[];
  deliverableType: string;
  timeline: string;
  budget: string;
  references: string[];
  openQuestions: string[];
  provenance: BriefProvenance;
  /** Original material this version was built from (see BriefAttachment). */
  attachmentIds: ID[];
  confirmedAt: ISODateTime | null;
  confirmedBy: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  changeNote: string | null;
  /** Set when a newer version replaced this one. Superseded versions are read-only. */
  supersededAt: ISODateTime | null;
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

export type EvidenceTopic = 'audience' | 'category' | 'competitor' | 'cultural' | 'production';

export const TOPIC_LABELS: Record<EvidenceTopic, string> = {
  audience: 'Audience',
  category: 'Category',
  competitor: 'Competitor',
  cultural: 'Cultural context',
  production: 'Production',
};

export type SourceVerificationStatus = 'verified' | 'unverified' | 'insufficient';

export interface Source {
  id: ID;
  projectId: ID;
  title: string;
  publisher: string;
  url: string;
  /** True for the demo's illustrative links. They do not point to real material. */
  isSampleLink: boolean;
  capturedAt: ISODateTime;
  excerpt: string;
  intendedUse: EvidenceTopic;
  verificationStatus: SourceVerificationStatus;
  addedBy: string;
}

export type SupportStatus = 'supported' | 'partial' | 'unsupported' | 'missing_citation' | 'unverified';

export interface Claim {
  id: ID;
  artifactId: ID;
  text: string;
  topic: EvidenceTopic;
  sourceIds: ID[];
  supportStatus: SupportStatus;
  limitations: string[];
}

// ---------------------------------------------------------------------------
// Artifacts
// ---------------------------------------------------------------------------

export type ArtifactKind = 'research' | 'strategy';
export type ArtifactStatus = 'draft' | 'under_review' | 'blocked' | 'ready' | 'released' | 'stale';

export type InlineSegment = string | { claimId: ID };

export type ArtifactBlock =
  | { kind: 'paragraph'; segments: InlineSegment[] }
  | { kind: 'list'; items: string[] }
  | { kind: 'callout'; tone: 'note' | 'gap'; text: string };

export interface ArtifactSection {
  id: ID;
  heading: string;
  blocks: ArtifactBlock[];
}

export interface CoverageRequirement {
  topic: EvidenceTopic;
  minSupportedClaims: number;
  /** What a reviewer should do when this requirement is not met. */
  guidance: string | null;
}

export interface Artifact {
  researchMethodPlan?: ResearchMethodPlan;
  id: ID;
  projectId: ID;
  stage: ArtifactKind;
  /** Versions of the same document share a lineageId. */
  lineageId: ID;
  version: number;
  title: string;
  summary: string;
  sections: ArtifactSection[];
  claimIds: ID[];
  createdAt: ISODateTime;
  status: ArtifactStatus;
  /** False for superseded versions, which are read-only history. */
  isCurrent: boolean;
  supersededAt: ISODateTime | null;
  basedOn: { briefVersion: number; researchArtifactId: ID | null };
  staleReason: string | null;
  producedByJobId: ID | null;
  release: { releasedAt: ISODateTime; releasedBy: string } | null;
  coverage: CoverageRequirement[];
  /** True when the content was produced by the demo simulator. */
  simulated: boolean;
}

export interface ArtifactSummary {
  id: ID;
  lineageId: ID;
  stage: ArtifactKind;
  version: number;
  title: string;
  status: ArtifactStatus;
  isCurrent: boolean;
  createdAt: ISODateTime;
  supersededAt: ISODateTime | null;
  claimCount: number;
}

// ---------------------------------------------------------------------------
// Reviews and findings
// ---------------------------------------------------------------------------

export type ReviewType = 'verification' | 'readiness' | 'strategy_review';
export type ReviewDecision = 'pass' | 'pass_with_conditions' | 'fail';
export type FindingSeverity = 'blocking' | 'major' | 'minor';

export interface Finding {
  id: ID;
  severity: FindingSeverity;
  message: string;
  requiredAction: string;
  sourceIds: ID[];
  claimIds: ID[];
  resolved: boolean;
}

export interface CoverageMetric {
  topic: EvidenceTopic;
  required: number;
  supported: number;
  met: boolean;
}

export interface Review {
  id: ID;
  projectId: ID;
  artifactId: ID;
  artifactVersion: number;
  type: ReviewType;
  decision: ReviewDecision;
  summary: string;
  findings: Finding[];
  /** Readiness reviews report evidence coverage per topic. */
  coverage: CoverageMetric[];
  createdAt: ISODateTime;
  reviewer: string;
  simulated: boolean;
  jobId: ID | null;
  /** Evidence changed after this review ran, so it no longer counts. */
  outdated: boolean;
  outdatedReason: string | null;
}

// ---------------------------------------------------------------------------
// Handoff
// ---------------------------------------------------------------------------

export type HandoffSide = 'research_owner' | 'strategy_owner';
export type HandoffDecision = 'delivered' | 'accepted' | 'accepted_with_conditions' | 'returned';

export interface Handoff {
  id: ID;
  projectId: ID;
  artifactId: ID;
  artifactVersion: number;
  side: HandoffSide;
  owner: string;
  decision: HandoffDecision;
  permittedUses: string[];
  prohibitedInferences: string[];
  unresolvedIssues: string[];
  note: string;
  createdAt: ISODateTime;
  recordedBy: string;
  outdated: boolean;
  outdatedReason: string | null;
}

// ---------------------------------------------------------------------------
// Jobs (kept separate from artifact state)
// ---------------------------------------------------------------------------

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'awaiting_reconciliation';
export type JobPurpose =
  | 'research_generation'
  | 'evidence_verification'
  | 'readiness_review'
  | 'image_observation'
  | 'strategy_generation';

export interface JobError {
  code: string;
  message: string;
  detail: string;
  retryable: boolean;
}

export interface ProviderReceipt {
  provider: string;
  requestId: string;
  model: string;
  inputUnits: number;
  outputUnits: number;
  durationMs: number;
  savedResultRef: string | null;
  raw: Record<string, unknown>;
}

export type RecoveryAction = 'retry' | 'reconcile' | 'none';

export interface JobRecovery {
  action: RecoveryAction;
  eligible: boolean;
  reason: string;
}

export interface Job {
  id: ID;
  projectId: ID;
  purpose: JobPurpose;
  label: string;
  status: JobStatus;
  commandId: string;
  createdAt: ISODateTime;
  startedAt: ISODateTime | null;
  completedAt: ISODateTime | null;
  error: JobError | null;
  receipt: ProviderReceipt | null;
  target: { kind: 'artifact' | 'image' | 'project'; id: ID; label: string };
  output: { kind: 'artifact' | 'review' | 'observation'; id: ID } | null;
  attempt: number;
  retryOfJobId: ID | null;
  reconciledAt: ISODateTime | null;
  recovery: JobRecovery;
  simulated: boolean;
}

// ---------------------------------------------------------------------------
// Images and observations
// ---------------------------------------------------------------------------

export type ObservationStatus = 'not_requested' | 'pending' | 'observed' | 'failed';
export type ObservationReviewStatus = 'unreviewed' | 'confirmed' | 'needs_revision';

export interface ImageAsset {
  id: ID;
  projectId: ID;
  name: string;
  previewUrl: string;
  sourceNote: string;
  uploadedAt: ISODateTime;
  observationStatus: ObservationStatus;
  /** Bundled demo illustration rather than a user upload. */
  isPlaceholder: boolean;
  width: number | null;
  height: number | null;
}

export interface Observation {
  id: ID;
  imageId: ID;
  visibleFeatures: string[];
  transcribedText: string[];
  uncertainties: string[];
  reviewStatus: ObservationReviewStatus;
  reviewNote: string | null;
  reviewedAt: ISODateTime | null;
  createdAt: ISODateTime;
  jobId: ID | null;
  simulated: boolean;
}

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

export type ActivityType =
  | 'project'
  | 'brief'
  | 'research'
  | 'source'
  | 'review'
  | 'handoff'
  | 'release'
  | 'job'
  | 'image'
  | 'strategy'
  | 'collaborator';

export interface Activity {
  id: ID;
  projectId: ID;
  type: ActivityType;
  message: string;
  actor: string;
  createdAt: ISODateTime;
}

// ---------------------------------------------------------------------------
// Feature availability vs. project eligibility
// ---------------------------------------------------------------------------

export type FeatureKey =
  | 'continuation_to_strategy'
  | 'creative_development'
  | 'final_proposal'
  | 'image_observation'
  | 'job_recovery';

/** Whether this environment supports a feature at all, independent of any project. */
export interface FeatureAvailability {
  supported: boolean;
  label: string;
  reason: string;
}

export type Capabilities = Record<FeatureKey, FeatureAvailability>;

export interface EligibilityCheck {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
  fix: { label: string; view: WorkspaceView; params?: Record<string, string> } | null;
}

/** Whether this particular project may move to the next stage. */
export interface ContinuationEligibility {
  projectId: ID;
  target: 'strategy';
  eligible: boolean;
  alreadyContinued: boolean;
  summary: string;
  checks: EligibilityCheck[];
}

// ---------------------------------------------------------------------------
// View models composed by the service
// ---------------------------------------------------------------------------

export type WorkspaceView =
  | 'overview'
  | 'brief'
  | 'research'
  | 'sources'
  | 'images'
  | 'handoff'
  | 'jobs'
  | 'artifacts'
  // The proposal-centred areas. Older views above now open inside these.
  | 'proposal'
  | 'library'
  | 'process'
  | 'delivery';

export type StageState = 'complete' | 'current' | 'blocked' | 'upcoming' | 'not_in_demo';

export interface StageProgress {
  stage: Stage;
  label: string;
  state: StageState;
  note: string;
}

export interface Blocker {
  id: string;
  title: string;
  detail: string;
  recommendedAction: string;
  severity: FindingSeverity;
  link: { view: WorkspaceView; params?: Record<string, string> };
}

export type NextActionCommand =
  | 'confirm_brief'
  | 'generate_research'
  | 'regenerate_research'
  | 'run_verification'
  | 'run_readiness'
  | 'continue_to_strategy';

export interface NextAction {
  label: string;
  description: string;
  link: { view: WorkspaceView; params?: Record<string, string> } | null;
  command: NextActionCommand | null;
  enabled: boolean;
  disabledReason: string | null;
}

export interface ProjectSummary {
  id: ID;
  name: string;
  client: string;
  summary: string;
  currentStage: Stage;
  status: ProjectStatus;
  updatedAt: ISODateTime;
  revision: number;
  openBlockers: number;
  owners: { research: string; strategy: string };
  /** The single most useful next step, as shown on the project card. */
  nextStep: { label: string; available: boolean };
  /** Up to three images from the project's library, used as card covers. */
  coverImages: Array<{ url: string; alt: string }>;
  /** Current documents, for example "Brief v2" or "Research v1". */
  documents: string[];
}

export interface ProjectList {
  items: ProjectSummary[];
  total: number;
  /** Revision of the project catalogue, used as expectedRevision when creating a project. */
  catalogRevision: number;
}

export interface ProjectOverview {
  project: Project;
  brief: Brief | null;
  stages: StageProgress[];
  blockers: Blocker[];
  recentActivity: Activity[];
  nextAction: NextAction;
  eligibility: ContinuationEligibility;
  research: ArtifactSummary | null;
  strategy: ArtifactSummary | null;
  activeJobs: Job[];
}

export interface BriefHistory {
  project: Project;
  current: Brief | null;
  versions: Brief[];
  dependentArtifacts: ArtifactSummary[];
  attachments: BriefAttachment[];
}

export type GapKind = 'missing_citation' | 'partial_support' | 'unsupported' | 'coverage';

export interface EvidenceGap {
  id: string;
  kind: GapKind;
  title: string;
  detail: string;
  recommendedAction: string;
  claimIds: ID[];
}

export interface ResearchWorkspace {
  project: Project;
  artifact: Artifact | null;
  claims: Claim[];
  sources: Source[];
  verification: Review | null;
  readiness: Review | null;
  gaps: EvidenceGap[];
  activeJobs: Job[];
  versions: ArtifactSummary[];
}

export interface SourceWithUsage extends Source {
  citedByClaimIds: ID[];
}

export interface SourceLibrary {
  project: Project;
  items: SourceWithUsage[];
  total: number;
  /** Claims in the current research artifact, so a new source can be attached on creation. */
  attachableClaims: Array<Pick<Claim, 'id' | 'text' | 'topic' | 'supportStatus'>>;
}

export interface SourceQuery {
  search?: string;
  intendedUse?: EvidenceTopic | 'all';
  verificationStatus?: SourceVerificationStatus | 'all';
}

export interface ImageRecord {
  image: ImageAsset;
  observation: Observation | null;
  latestJob: Job | null;
}

export interface ImageLibrary {
  project: Project;
  items: ImageRecord[];
}

export interface HandoffOverview {
  project: Project;
  artifact: ArtifactSummary | null;
  verification: Review | null;
  readiness: Review | null;
  researchSide: Handoff | null;
  strategySide: Handoff | null;
  release: Artifact['release'];
  history: Handoff[];
  eligibility: ContinuationEligibility;
  /** Suggested content for a new delivery, drawn from review findings. */
  suggested: { permittedUses: string[]; prohibitedInferences: string[]; unresolvedIssues: string[] };
  canDeliver: { allowed: boolean; reason: string };
  canAccept: { allowed: boolean; reason: string };
  canRelease: { allowed: boolean; reason: string };
}

export interface JobList {
  project: Project;
  items: Job[];
}

export interface ArtifactList {
  project: Project;
  items: ArtifactSummary[];
}

export interface ArtifactDetail {
  project: Project;
  artifact: Artifact;
  claims: Claim[];
  sources: Source[];
  reviews: Review[];
  handoffs: Handoff[];
  versions: ArtifactSummary[];
}

export interface ProjectQuery {
  search?: string;
  status?: ProjectStatus | 'all';
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/** Every mutation carries these. Retrying an unchanged command reuses the same commandId. */
export interface CommandMeta {
  actor?: { id: string; name: string; role?: string };
  commandId: string;
  expectedRevision: number;
}

export interface MutationResult<T> {
  data: T;
  /** Project (or catalogue) revision after the command. */
  revision: number;
  /** True when this commandId had already been applied and the stored result was returned. */
  replayed: boolean;
  commandId: string;
}

export interface CreateProjectInput {
  name: string;
  client: string;
  summary: string;
  mode: ExecutionMode;
  researchOwner: string;
  strategyOwner: string;
  /** Optional starting brief, saved as an unconfirmed draft. */
  brief?: BriefInput;
}

/** Original material sent with a brief save. `file` is the uploaded file, when there is one. */
export interface AttachmentInput {
  id: ID;
  kind: BriefAttachment['kind'];
  fileName: string | null;
  mimeType: string | null;
  size: number;
  text: string;
  extraction: ExtractionSummary;
  mapping: MappingMode;
  sampleId: string | null;
  file: Blob | null;
}

export interface BriefInput {
  editScope?: 'task_card';
  proposalType?: ProposalType;
  background: string;
  audience: string;
  objectives: string[];
  deliverables: string[];
  constraints: string[];
  changeNote: string;
  brand?: string;
  researchQuestions?: string[];
  deliverableType?: string;
  timeline?: string;
  budget?: string;
  references?: string[];
  openQuestions?: string[];
  provenance?: BriefProvenance;
  attachment?: AttachmentInput | null;
}

export interface SourceInput {
  title: string;
  publisher: string;
  url: string;
  excerpt: string;
  intendedUse: EvidenceTopic;
  attachToClaimId: ID | null;
}

export interface ClaimInput {
  sectionId: ID;
  text: string;
  topic: EvidenceTopic;
  sourceIds: ID[];
}

export interface ImageUploadInput {
  name: string;
  dataUrl: string;
  sourceNote: string;
  width: number;
  height: number;
  dominantColors: string[];
}

export interface HandoffInput {
  side: HandoffSide;
  decision: HandoffDecision;
  permittedUses: string[];
  prohibitedInferences: string[];
  unresolvedIssues: string[];
  note: string;
}

export interface ObservationReviewInput {
  observationId: ID;
  decision: Exclude<ObservationReviewStatus, 'unreviewed'>;
  note: string;
}
