import type {VisualAService} from './visualA';
import type {CopyWorkflowService} from './copyWorkflow';
import type {SimpleStrategyService} from './simpleStrategy';
import type {ResearchAcquisitionService} from './researchAcquisition';
import type {OriginalDocumentsService} from './originalDocuments';
import type {ResearchReaderService} from './researchReader';
import type {
  Artifact,
  ArtifactDetail,
  ArtifactList,
  Brief,
  BriefHistory,
  BriefInput,
  Capabilities,
  Claim,
  ClaimInput,
  CommandMeta,
  CreateProjectInput,
  Handoff,
  HandoffInput,
  HandoffOverview,
  ID,
  ImageAsset,
  ImageLibrary,
  ImageUploadInput,
  Job,
  JobList,
  MutationResult,
  Observation,
  ObservationReviewInput,
  Project,
  ProjectList,
  ProjectOverview,
  ProjectQuery,
  ResearchWorkspace,
  Source,
  SourceInput,
  SourceLibrary,
  SourceQuery,
} from './models';

/**
 * The only way components talk to data. The demo uses MockWorkbenchService; a real backend
 * gets an HttpWorkbenchService implementing the same interface (src/services/http).
 */
export type PendingWriteKind = 'continue_copy' | 'confirm_strategy' | 'step_copy' | 'verify_copy' | 'review_copy' | 'create_project' | 'save_brief' | 'confirm_brief' | 'add_source' | 'generate_research' | 'verify_research' | 'review_readiness' | 'record_handoff' | 'release_research' | 'extract_original' | 'upload_original' | 'register_research_questions' | 'read_research' | 'reconcile_reader' | 'revise_research' | 'dispose_reader' | 'start_acquisition' | 'step_acquisition' | 'reconcile_acquisition' | 'continue_simple_strategy' | 'verify_simple_strategy' | 'reconcile_simple_strategy';
export interface PendingBriefWrite {kind: PendingWriteKind; path: string; body: string; commandId: string; label: string}
export interface BriefRecovery {
  getPending(): PendingBriefWrite | null;
  retry(): Promise<string>;
  acknowledge(): void;
}
export interface WorkbenchService {
  readonly environment: EnvironmentInfo;
  readonly briefRecovery?: BriefRecovery;
  readonly researchReader?: ResearchReaderService;
  readonly researchAcquisition?: ResearchAcquisitionService;
  readonly simpleStrategy?: SimpleStrategyService;
  readonly copyWorkflow?: CopyWorkflowService;
  readonly visualWorkflow?: VisualAService;
  readonly originalDocuments?: OriginalDocumentsService;

  /** Notifies when data may have changed so views can refresh. */
  subscribe(listener: ServiceListener): () => void;

  /**
   * Language for text the service generates (findings, checks, next steps, errors), as a BCP 47
   * tag. Views refresh through a data-changed event. A real backend reads it as Accept-Language.
   */
  setLocale(locale: string): void;

  // Reads
  getCapabilities(): Promise<Capabilities>;
  listProjects(query: ProjectQuery): Promise<ProjectList>;
  getProjectOverview(projectId: ID): Promise<ProjectOverview>;
  getBriefHistory(projectId: ID): Promise<BriefHistory>;
  getResearchWorkspace(projectId: ID): Promise<ResearchWorkspace>;
  listSources(projectId: ID, query: SourceQuery): Promise<SourceLibrary>;
  listImages(projectId: ID): Promise<ImageLibrary>;
  getHandoffOverview(projectId: ID): Promise<HandoffOverview>;
  listJobs(projectId: ID): Promise<JobList>;
  listArtifacts(projectId: ID): Promise<ArtifactList>;
  getArtifact(projectId: ID, artifactId: ID): Promise<ArtifactDetail>;
  /** The original uploaded brief file, or null when it is no longer available. */
  getBriefAttachmentFile(projectId: ID, attachmentId: ID): Promise<Blob | null>;

  // Commands. Each takes a commandId (idempotency key) and the expected project revision.
  createProject(input: CreateProjectInput, meta: CommandMeta): Promise<MutationResult<Project>>;
  saveBrief(projectId: ID, input: BriefInput, meta: CommandMeta): Promise<MutationResult<Brief>>;
  confirmBrief(projectId: ID, meta: CommandMeta): Promise<MutationResult<Brief>>;
  addSource(projectId: ID, input: SourceInput, meta: CommandMeta): Promise<MutationResult<Source>>;
  linkSourceToClaim(projectId: ID, claimId: ID, sourceId: ID, meta: CommandMeta): Promise<MutationResult<Claim>>;
  addClaim(projectId: ID, input: ClaimInput, meta: CommandMeta): Promise<MutationResult<Claim>>;
  uploadImage(projectId: ID, input: ImageUploadInput, meta: CommandMeta): Promise<MutationResult<ImageAsset>>;
  requestObservation(projectId: ID, imageId: ID, meta: CommandMeta): Promise<MutationResult<Job>>;
  reviewObservation(projectId: ID, input: ObservationReviewInput, meta: CommandMeta): Promise<MutationResult<Observation>>;
  generateResearch(projectId: ID, meta: CommandMeta): Promise<MutationResult<Job>>;
  startVerification(projectId: ID, meta: CommandMeta): Promise<MutationResult<Job>>;
  startReadinessReview(projectId: ID, meta: CommandMeta): Promise<MutationResult<Job>>;
  recordHandoff(projectId: ID, input: HandoffInput, meta: CommandMeta): Promise<MutationResult<Handoff>>;
  releaseResearch(projectId: ID, meta: CommandMeta): Promise<MutationResult<Artifact>>;
  continueToStrategy(projectId: ID, meta: CommandMeta): Promise<MutationResult<Job>>;
  retryJob(projectId: ID, jobId: ID, meta: CommandMeta): Promise<MutationResult<Job>>;
  reconcileJob(projectId: ID, jobId: ID, meta: CommandMeta): Promise<MutationResult<Job>>;
}

export interface EnvironmentInfo {
  kind: 'demo' | 'live' | 'unavailable';
  label: string;
}

export type ServiceEvent =
  | { type: 'data-changed'; projectId: ID | null }
  /** Data visible to views was replaced wholesale (demo scenario switch). Views reload. */
  | { type: 'scenario-changed' }
  /** Environment status changed without touching data (for example, demo toggles). */
  | { type: 'demo-state-changed' }
  | { type: 'reset' };

export type ServiceListener = (event: ServiceEvent) => void;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type ServiceErrorKind =
  | 'forbidden'
  | 'network'
  | 'response_lost'
  | 'conflict'
  | 'not_found'
  | 'validation'
  | 'not_eligible'
  | 'unavailable'
  | 'idempotency_mismatch';

export interface ConflictDetails {
  expectedRevision: number;
  currentRevision: number;
  changedBy: string | null;
  changeSummary: string | null;
}

export class ServiceError extends Error {
  readonly kind: ServiceErrorKind;
  readonly retryable: boolean;
  readonly conflict: ConflictDetails | null;
  /** For response_lost: the change may or may not have been applied. */
  readonly outcomeUnknown: boolean;

  constructor(
    kind: ServiceErrorKind,
    message: string,
    options: { retryable?: boolean; conflict?: ConflictDetails; outcomeUnknown?: boolean } = {},
  ) {
    super(message);
    this.name = 'ServiceError';
    this.kind = kind;
    this.retryable = options.retryable ?? (kind === 'network' || kind === 'response_lost');
    this.conflict = options.conflict ?? null;
    this.outcomeUnknown = options.outcomeUnknown ?? false;
  }
}

export function toServiceError(error: unknown): ServiceError {
  if (error instanceof ServiceError) return error;
  const message = error instanceof Error ? error.message : 'Something went wrong.';
  return new ServiceError('network', message, { retryable: true });
}
