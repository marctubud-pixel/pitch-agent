/**
 * Backend → frontend model mapping.
 *
 * The backend's payloads have not been supplied yet, so every mapper here is a typed seam:
 * it receives `unknown` and must return the frontend contract from src/domain/models.ts.
 * When the real payloads arrive, define their DTO types in ./dto.ts (create it), narrow the
 * `unknown` parameters to those types and fill these functions in. Nothing in the UI changes.
 *
 * Guidelines:
 *  - Convert timestamps to ISO 8601 strings and IDs to strings here, not in components.
 *  - Map backend status vocabularies onto the frontend unions (JobStatus, ArtifactStatus, …).
 *    Unknown values should fail loudly in development rather than render as something else.
 *  - Keep derived view models (ProjectOverview, HandoffOverview, …) here or in the adapter if
 *    the backend returns raw entities; prefer backend-computed eligibility when available.
 */
import type {
  Artifact,
  Brief,
  Capabilities,
  Claim,
  ContinuationEligibility,
  Handoff,
  ImageAsset,
  Job,
  Observation,
  Project,
  Review,
  Source,
} from '../../domain/models';

function notMapped(entity: string): never {
  throw new Error(`No mapping for ${entity} yet. Implement it in src/services/http/mappers.ts once the backend payload is known.`);
}

export const mapProject = (_dto: unknown): Project => notMapped('Project');
export const mapBrief = (_dto: unknown): Brief => notMapped('Brief');
export const mapSource = (_dto: unknown): Source => notMapped('Source');
export const mapClaim = (_dto: unknown): Claim => notMapped('Claim');
export const mapArtifact = (_dto: unknown): Artifact => notMapped('Artifact');
export const mapReview = (_dto: unknown): Review => notMapped('Review');
export const mapHandoff = (_dto: unknown): Handoff => notMapped('Handoff');
export const mapJob = (_dto: unknown): Job => notMapped('Job');
export const mapImageAsset = (_dto: unknown): ImageAsset => notMapped('ImageAsset');
export const mapObservation = (_dto: unknown): Observation => notMapped('Observation');
export const mapEligibility = (_dto: unknown): ContinuationEligibility => notMapped('ContinuationEligibility');
export const mapCapabilities = (_dto: unknown): Capabilities => notMapped('Capabilities');
