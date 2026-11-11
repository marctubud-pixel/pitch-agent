/**
 * Adapter for the real Proposal Workbench backend. Replace each `notConnected` call with a
 * `request` call plus a mapper from ./mappers.ts once the endpoint shapes are confirmed.
 *
 * What is already decided here (and independent of payload shapes):
 *  - Every command sends its commandId and expectedRevision. The header names below are
 *    placeholders; align them with the backend (they may belong in the body instead).
 *  - HTTP failures are translated into ServiceError kinds the UI already handles:
 *    network → retry with the same commandId, 409 → revision conflict dialog, etc.
 *  - subscribe() is where server-sent events or polling should notify views to refresh.
 */
import type { WorkbenchService, EnvironmentInfo, ServiceListener } from '../../domain/service';
import { ServiceError } from '../../domain/service';
import type { CommandMeta } from '../../domain/models';

export interface HttpServiceOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  getHeaders?: () => Record<string, string> | Promise<Record<string, string>>;
}

export async function mapHttpError(response: Response | null, cause?: unknown): Promise<ServiceError> {
  if (!response) {
    return new ServiceError('network', cause instanceof Error ? cause.message : 'The workbench service could not be reached.', { retryable: true });
  }
  let message = `Request failed (${response.status}).`;
  let body: Record<string, unknown> = {};
  try {
    body = (await response.json()) as Record<string, unknown>;
    if (typeof body.message === 'string') message = body.message;
  } catch {
    /* non-JSON error body */
  }
  switch (response.status) {
    case 404:
      return new ServiceError('not_found', message);
    case 409:
    case 412:
      return new ServiceError('conflict', message, {
        conflict: {
          expectedRevision: Number(body.expectedRevision ?? NaN),
          currentRevision: Number(body.currentRevision ?? NaN),
          changedBy: typeof body.changedBy === 'string' ? body.changedBy : null,
          changeSummary: typeof body.changeSummary === 'string' ? body.changeSummary : null,
        },
      });
    case 422:
    case 400:
      return new ServiceError('validation', message);
    case 403:
      return new ServiceError('not_eligible', message);
    case 501:
    case 503:
      return new ServiceError('unavailable', message);
    default:
      return new ServiceError('network', message, { retryable: response.status >= 500 });
  }
}

function notConnected(operation: string): Promise<never> {
  return Promise.reject(
    new ServiceError('unavailable', `“${operation}” is not connected to the backend yet. Implement it in src/services/http/HttpWorkbenchService.ts.`),
  );
}

export class HttpWorkbenchService implements WorkbenchService {
  readonly environment: EnvironmentInfo = { kind: 'live', label: 'Connected' };
  private listeners = new Set<ServiceListener>();
  private locale = 'zh-CN';

  constructor(private readonly options: HttpServiceOptions) {}

  setLocale(locale: string) {
    if (locale === this.locale) return;
    this.locale = locale;
    for (const l of this.listeners) l({ type: 'data-changed', projectId: null });
  }

  subscribe(listener: ServiceListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Ready-to-use request helper. Not called until endpoints are mapped. */
  protected async request<T>(method: string, path: string, body?: unknown, meta?: CommandMeta): Promise<T> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Accept-Language': this.locale, ...(await this.options.getHeaders?.()) };
    if (meta) {
      headers['Idempotency-Key'] = meta.commandId; // placeholder name
      headers['If-Match'] = String(meta.expectedRevision); // placeholder name
    }
    let response: Response;
    try {
      response = await fetchImpl(`${this.options.baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (cause) {
      throw await mapHttpError(null, cause);
    }
    if (!response.ok) throw await mapHttpError(response);
    const data = (await response.json()) as T;
    if (method !== 'GET') for (const l of this.listeners) l({ type: 'data-changed', projectId: null });
    return data;
  }

  getCapabilities = () => notConnected('getCapabilities');
  listProjects = () => notConnected('listProjects');
  getProjectOverview = () => notConnected('getProjectOverview');
  getBriefHistory = () => notConnected('getBriefHistory');
  getResearchWorkspace = () => notConnected('getResearchWorkspace');
  listSources = () => notConnected('listSources');
  listImages = () => notConnected('listImages');
  getHandoffOverview = () => notConnected('getHandoffOverview');
  listJobs = () => notConnected('listJobs');
  listArtifacts = () => notConnected('listArtifacts');
  getArtifact = () => notConnected('getArtifact');
  getBriefAttachmentFile = () => notConnected('getBriefAttachmentFile');

  createProject = () => notConnected('createProject');
  saveBrief = () => notConnected('saveBrief');
  confirmBrief = () => notConnected('confirmBrief');
  addSource = () => notConnected('addSource');
  linkSourceToClaim = () => notConnected('linkSourceToClaim');
  addClaim = () => notConnected('addClaim');
  uploadImage = () => notConnected('uploadImage');
  requestObservation = () => notConnected('requestObservation');
  reviewObservation = () => notConnected('reviewObservation');
  generateResearch = () => notConnected('generateResearch');
  startVerification = () => notConnected('startVerification');
  startReadinessReview = () => notConnected('startReadinessReview');
  recordHandoff = () => notConnected('recordHandoff');
  releaseResearch = () => notConnected('releaseResearch');
  continueToStrategy = () => notConnected('continueToStrategy');
  retryJob = () => notConnected('retryJob');
  reconcileJob = () => notConnected('reconcileJob');
}
