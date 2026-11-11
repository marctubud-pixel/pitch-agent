import { ServiceError } from '../../domain/service';

function isObject(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
export function object(value: unknown): Record<string, unknown> {
  if (!isObject(value)) throw new ServiceError('validation', '简报服务返回的对象格式无效。');
  return value;
}
export function text(value: unknown, fallback = ''): string { return typeof value === 'string' ? value : fallback; }
export function list(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
export function strings(value: unknown): string[] { return list(value).map((v) => text(v)).filter(Boolean); }
export function records(value: unknown): Record<string, unknown>[] { return list(value).map(object); }
export function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new ServiceError('validation', '简报服务返回的修订号无效。');
  return value;
}
export interface BackendCard { id: string; brief: string; createdBy: string; original?: Record<string, unknown> }
export interface BackendStage { stage: string; status: string; activeArtifactId: string | null; blockedReasons: string[] }
export interface Snapshot {
  id: string; name: string; revision: number; activeTaskCardId: string;
  workflowVersion: string | null; researchWorkflow: Record<string, unknown> | null;
  cards: BackendCard[];
  intakeDocuments?: Record<string, unknown>[]; intakeOperations?: Record<string, unknown>[];
  confirmations: Array<{ taskCardId: string; actorId: string }>;
  policy: { mode: 'auto' | 'assisted'; humanGates: string[]; authorizedThrough: string; version: number | null };
  stages: BackendStage[];
  sourceCaptures: Record<string, unknown>[]; sourceEntries: Record<string, unknown>[];
  imageAssets: Record<string, unknown>[]; imageObservations: Record<string, unknown>[]; observationReviews: Record<string, unknown>[]; releases: Record<string, unknown>[];
  textReports: { verification: Record<string, unknown>[]; readiness: Record<string, unknown>[]; handoff: Record<string, unknown>[]; correction: Record<string, unknown>[] };
  readinessResolutions: Record<string, unknown>[];
  stageAssessments: Record<string, { body: string; currentId: string | null }>;
  simpleStrategyRequests?: Record<string,unknown>[]; continuationIntents?: Record<string,unknown>[];
  acquisitions?: Record<string, unknown>[]; acquisitionRequests?: Record<string, unknown>[];
  readerDispositions?: Record<string, unknown>[];
  readerPlans?: Record<string, unknown>[]; readerReports?: Record<string, unknown>[];
  jobs: Record<string, unknown>[]; artifacts: Record<string, unknown>[];
  audit: Array<{ commandId: string; kind: string; actorId: string; revision: number; at: string }>;
  processedCommands: Record<string, unknown>;
  native?: Record<string,unknown>;
  complete: boolean;
}
export function parseSnapshot(value: unknown): Snapshot {
  const root = object(value), p = object(root.project), view = object(root.view), policy = object(view.policy);
  if (!text(p.id) || !text(p.name) || !['auto', 'assisted'].includes(text(policy.mode))) throw new ServiceError('validation', '简报服务返回的项目身份或工作方式无效。');
  return {
    native:p,
    workflowVersion: p.workflow ? text(object(p.workflow).version) : null, researchWorkflow: view.researchWorkflow ? object(view.researchWorkflow) : null,
    id: text(p.id), name: text(p.name), revision: integer(p.revision), activeTaskCardId: text(p.activeTaskCardId),
    cards: records(p.taskCards).map((c) => ({ id: text(c.id), brief: text(c.brief), createdBy: text(c.createdBy), original: c })),
    confirmations: records(p.confirmations).map((c) => ({ taskCardId: text(c.taskCardId), actorId: text(c.actorId) })),
    policy: { mode: policy.mode === 'auto' ? 'auto' : 'assisted', humanGates: strings(policy.humanGates), authorizedThrough: text(policy.authorizedThrough), version: policy.version === undefined ? null : integer(policy.version) },
    stages: records(view.stages).map((s) => ({ stage: text(s.stage), status: text(s.status), activeArtifactId: text(s.activeArtifactId) || null, blockedReasons: strings(s.blockedReasons) })),
    sourceCaptures: records(p.sourceCaptures), sourceEntries: records(p.sourceEntries),
    imageAssets: records(p.imageAssets), imageObservations: records(p.imageObservations), observationReviews: records(p.observationReviews), releases: records(p.releases),
    textReports: { verification: records(p.verifications), readiness: records(p.readinessReports), handoff: records(p.handoffReports), correction: records(p.correctionReviews) },
    readinessResolutions: records(p.readinessResolutions),
    stageAssessments: Object.fromEntries(records(view.stages).filter((stage) => stage.researchAssessment !== undefined).map((stage) => [text(stage.stage), { body: JSON.stringify(stage.researchAssessment), currentId: stage.researchAssessment && object(stage.researchAssessment).current === true ? text(object(stage.researchAssessment).assessmentId) || null : null }])),
    intakeDocuments: records(p.intakeDocuments), intakeOperations: records(p.intakeOperations),
    simpleStrategyRequests: records(p.simpleStrategyHttpRequests), continuationIntents: records(p.researchContinuationIntents),
    acquisitions: records(p.researchAcquisitions), acquisitionRequests: records(p.researchAcquisitionHttpRequests),
    readerDispositions: records(p.researchReaderDispositions),
    readerPlans: records(p.researchQuestionRegistrations), readerReports: records(p.researchReaderReports),
    jobs: records(p.jobs), artifacts: records(p.artifacts),
    audit: records(p.audit).map((a) => ({ commandId: text(a.commandId), kind: text(a.kind), actorId: text(a.actorId), revision: integer(a.revision), at: text(a.at) })),
    processedCommands: object(p.processedCommands), complete: view.complete === true,
  };
}
