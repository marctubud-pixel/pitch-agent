import type { ResearchWorkspace } from '../domain/models';

export function currentResearchClaims(workspace: ResearchWorkspace) {
  const artifact = workspace.artifact;
  if (!artifact || artifact.projectId !== workspace.project.id || artifact.stage !== 'research' || !artifact.isCurrent) return [];
  return workspace.claims.filter(claim => claim.artifactId === artifact.id && artifact.claimIds.includes(claim.id));
}

export function resolveResearchClaim(workspace: ResearchWorkspace, ref: string | null) {
  if (!ref) return null;
  const claims = currentResearchClaims(workspace);
  const exact = claims.find(claim => claim.id === ref);
  if (exact) return exact;
  return /^c\d+$/.test(ref) ? claims.find(claim => claim.id.endsWith(`-${ref}`)) ?? null : null;
}
