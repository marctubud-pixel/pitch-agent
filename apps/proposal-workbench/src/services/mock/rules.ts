/**
 * Business rules for the demo, as pure functions over the mock database. A real backend
 * owns these decisions; the mock reproduces them deterministically so the demo is repeatable.
 *
 * The concepts stay separate on purpose:
 *  - verification asks whether cited excerpts support each claim;
 *  - readiness asks whether the evidence is sufficient for the next stage;
 *  - handoff records what each owner accepts and the limits that apply;
 *  - release allows the artifact to be used downstream.
 */
import {
  STAGES,
  type Artifact,
  type ArtifactSummary,
  type Blocker,
  type Brief,
  type Capabilities,
  type Claim,
  type ContinuationEligibility,
  type CoverageMetric,
  type EligibilityCheck,
  type EvidenceGap,
  type Finding,
  type Handoff,
  type HumanGate,
  type ID,
  type JobRecovery,
  type NextAction,
  type Project,
  type ProjectStatus,
  type Review,
  type Source,
  type SourceVerificationStatus,
  type Stage,
  type StageProgress,
  type SupportStatus,
} from '../../domain/models';
import type { DemoDatabase, JobRecord } from './db';
import { m } from './i18n';

const newestFirst = <T extends { createdAt: string }>(a: T, b: T) => b.createdAt.localeCompare(a.createdAt);

export function clip(text: string, max = 90): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

const topic = (t: Claim['topic']) => m(`topic.${t}`);
const topicLc = (t: Claim['topic']) => m(`topicLc.${t}`);
/** "an audience source", "a category source" */
const src = (t: Claim['topic']) => m(`topicSrc.${t}`);
/** Claim text for quoting inside a sentence (the message adds the quote marks), without its final full stop. */
const quoted = (text: string, max = 90) => clip(text.replace(/\.\s*$/, ''), max);
export const docLabel = (a: Pick<Artifact, 'stage' | 'version'>) => m(a.stage === 'strategy' ? 'doc.strategy' : 'doc.research', { v: a.version });

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export function currentBrief(db: DemoDatabase, projectId: ID): Brief | null {
  return db.briefs.filter((b) => b.projectId === projectId).sort((a, b) => b.version - a.version)[0] ?? null;
}

export function currentArtifact(db: DemoDatabase, projectId: ID, stage: Artifact['stage']): Artifact | null {
  return db.artifacts.find((a) => a.projectId === projectId && a.stage === stage && a.isCurrent) ?? null;
}

export function claimsFor(db: DemoDatabase, artifact: Artifact): Claim[] {
  const byId = new Map(db.claims.filter((c) => c.artifactId === artifact.id).map((c) => [c.id, c]));
  return artifact.claimIds.map((id) => byId.get(id)).filter((c): c is Claim => Boolean(c));
}

export function sourcesById(db: DemoDatabase, projectId: ID): Map<ID, Source> {
  return new Map(db.sources.filter((s) => s.projectId === projectId).map((s) => [s.id, s]));
}

export function latestReview(
  db: DemoDatabase,
  artifactId: ID,
  type: Review['type'],
  includeOutdated = true,
): Review | null {
  return (
    db.reviews
      .filter((r) => r.artifactId === artifactId && r.type === type && (includeOutdated || !r.outdated))
      .sort(newestFirst)[0] ?? null
  );
}

export const reviewPassed = (review: Review | null) => Boolean(review && !review.outdated && review.decision !== 'fail');

export function currentHandoff(db: DemoDatabase, artifact: Artifact | null, side: Handoff['side']): Handoff | null {
  if (!artifact) return null;
  return (
    db.handoffs
      .filter((h) => h.artifactId === artifact.id && h.side === side && !h.outdated)
      .sort(newestFirst)[0] ?? null
  );
}

export function activeJobs(db: DemoDatabase, projectId: ID): JobRecord[] {
  return db.jobs.filter((j) => j.projectId === projectId && (j.status === 'queued' || j.status === 'running'));
}

export function summarizeArtifact(db: DemoDatabase, artifact: Artifact): ArtifactSummary {
  return {
    id: artifact.id,
    lineageId: artifact.lineageId,
    stage: artifact.stage,
    version: artifact.version,
    title: artifact.title,
    status: artifact.status,
    isCurrent: artifact.isCurrent,
    createdAt: artifact.createdAt,
    supersededAt: artifact.supersededAt,
    claimCount: claimsFor(db, artifact).length,
  };
}

// ---------------------------------------------------------------------------
// Verification: do the cited excerpts support each claim?
// ---------------------------------------------------------------------------

/** Deterministic stand-in for checking a newly added source: a usable excerpt passes. */
export function simulatedSourceCheck(source: Source): SourceVerificationStatus {
  if (source.verificationStatus !== 'unverified') return source.verificationStatus;
  return source.excerpt.trim().length >= 60 ? 'verified' : 'insufficient';
}

export function evaluateClaimSupport(claim: Claim, sources: Map<ID, Source>): SupportStatus {
  if (claim.sourceIds.length === 0) return 'missing_citation';
  const cited = claim.sourceIds.map((id) => sources.get(id)).filter((s): s is Source => Boolean(s));
  const verified = cited.filter((s) => s.verificationStatus === 'verified');
  if (verified.length === 0) return 'unsupported';
  const onTopic = verified.some((s) => s.intendedUse === claim.topic);
  return onTopic && verified.length === cited.length ? 'supported' : 'partial';
}

export interface VerificationOutcome {
  review: Omit<Review, 'id' | 'createdAt' | 'jobId'>;
  claimStatuses: Map<ID, SupportStatus>;
  sourceStatuses: Map<ID, SourceVerificationStatus>;
}

export function runVerification(db: DemoDatabase, artifact: Artifact, makeId: () => string): VerificationOutcome {
  const sources = sourcesById(db, artifact.projectId);
  const sourceStatuses = new Map<ID, SourceVerificationStatus>();
  const checked = new Map<ID, Source>();
  for (const [id, source] of sources) {
    const status = simulatedSourceCheck(source);
    sourceStatuses.set(id, status);
    checked.set(id, { ...source, verificationStatus: status });
  }

  const claims = claimsFor(db, artifact);
  const claimStatuses = new Map<ID, SupportStatus>();
  const findings: Finding[] = [];
  const counts = { supported: 0, partial: 0, missing: 0, unsupported: 0 };

  for (const claim of claims) {
    const status = evaluateClaimSupport(claim, checked);
    claimStatuses.set(claim.id, status);
    if (status === 'supported') counts.supported += 1;
    if (status === 'missing_citation') {
      counts.missing += 1;
      findings.push({
        id: makeId(),
        severity: 'blocking',
        message: m('f.missing.msg', { claim: quoted(claim.text) }),
        requiredAction: m('f.missing.act', { src: src(claim.topic) }),
        sourceIds: [],
        claimIds: [claim.id],
        resolved: false,
      });
    }
    if (status === 'unsupported') {
      counts.unsupported += 1;
      findings.push({
        id: makeId(),
        severity: 'blocking',
        message: m('f.unsupported.msg', { claim: quoted(claim.text) }),
        requiredAction: m('f.unsupported.act'),
        sourceIds: claim.sourceIds,
        claimIds: [claim.id],
        resolved: false,
      });
    }
    if (status === 'partial') {
      counts.partial += 1;
      const reason = claim.limitations[0] ?? m('f.partial.reason', { src: src(claim.topic) });
      findings.push({
        id: makeId(),
        severity: 'major',
        message: m('f.partial.msg', { claim: quoted(claim.text), reason }),
        requiredAction: m('f.partial.act', { src: src(claim.topic) }),
        sourceIds: claim.sourceIds,
        claimIds: [claim.id],
        resolved: false,
      });
    }
  }

  if (claims.length === 0) {
    findings.push({
      id: makeId(),
      severity: 'blocking',
      message: m('f.noClaims.msg'),
      requiredAction: m('f.noClaims.act'),
      sourceIds: [],
      claimIds: [],
      resolved: false,
    });
  }

  const insufficient = [...sourceStatuses.entries()].filter(([, s]) => s === 'insufficient').map(([id]) => id);
  if (insufficient.length > 0) {
    findings.push({
      id: makeId(),
      severity: 'minor',
      message: m('f.short.msg', { count: insufficient.length }),
      requiredAction: m('f.short.act'),
      sourceIds: insufficient,
      claimIds: [],
      resolved: false,
    });
  }

  const decision = findings.some((f) => f.severity === 'blocking')
    ? 'fail'
    : findings.some((f) => f.severity === 'major')
      ? 'pass_with_conditions'
      : 'pass';

  const parts = [m('v.supported', { supported: counts.supported, total: claims.length })];
  if (counts.missing) parts.push(m('v.missing', { count: counts.missing }));
  if (counts.partial) parts.push(m('v.partial', { count: counts.partial }));
  if (counts.unsupported) parts.push(m('v.unsupported', { count: counts.unsupported }));

  return {
    claimStatuses,
    sourceStatuses,
    review: {
      projectId: artifact.projectId,
      artifactId: artifact.id,
      artifactVersion: artifact.version,
      type: 'verification',
      decision,
      summary: m('v.summary', { parts }),
      findings,
      coverage: [],
      reviewer: m('reviewer.verifier'),
      simulated: true,
      outdated: false,
      outdatedReason: null,
    },
  };
}

// ---------------------------------------------------------------------------
// Readiness: is the evidence sufficient to hand to strategy?
// ---------------------------------------------------------------------------

export function runReadiness(db: DemoDatabase, artifact: Artifact, makeId: () => string): Omit<Review, 'id' | 'createdAt' | 'jobId'> {
  const claims = claimsFor(db, artifact);
  const sources = sourcesById(db, artifact.projectId);
  const findings: Finding[] = [];
  const coverage: CoverageMetric[] = [];

  for (const req of artifact.coverage) {
    const supporting = claims.filter((c) => c.topic === req.topic && c.supportStatus === 'supported');
    const met = supporting.length >= req.minSupportedClaims;
    coverage.push({ topic: req.topic, required: req.minSupportedClaims, supported: supporting.length, met });
    if (!met) {
      const missing = req.minSupportedClaims - supporting.length;
      findings.push({
        id: makeId(),
        severity: 'blocking',
        message: m('r.incomplete.msg', { topic: topic(req.topic), supported: supporting.length, required: req.minSupportedClaims }),
        requiredAction:
          req.guidance ??
          m('r.incomplete.act', { count: missing, topicLc: topicLc(req.topic), src: src(req.topic) }),
        sourceIds: [],
        claimIds: claims.filter((c) => c.topic === req.topic && c.supportStatus !== 'supported').map((c) => c.id),
        resolved: false,
      });
    } else if (supporting.length > 0) {
      const distinct = new Set(supporting.flatMap((c) => c.sourceIds));
      if (distinct.size === 1) {
        const only = sources.get([...distinct][0]);
        findings.push({
          id: makeId(),
          severity: 'minor',
          message: m('r.single.msg', { topic: topic(req.topic), title: only?.title ?? '–' }),
          requiredAction: m('r.single.act'),
          sourceIds: [...distinct],
          claimIds: supporting.map((c) => c.id),
          resolved: false,
        });
      }
    }
  }

  const verification = latestReview(db, artifact.id, 'verification', false);
  if (!verification) {
    findings.push({
      id: makeId(),
      severity: 'minor',
      message: m('r.noVerif.msg'),
      requiredAction: m('r.noVerif.act'),
      sourceIds: [],
      claimIds: [],
      resolved: false,
    });
  }

  const unmet = coverage.filter((c) => !c.met);
  return {
    projectId: artifact.projectId,
    artifactId: artifact.id,
    artifactVersion: artifact.version,
    type: 'readiness',
    decision: unmet.length > 0 ? 'fail' : 'pass',
    summary:
      unmet.length > 0
        ? m('r.summary.fail', { topics: unmet.map((c) => topicLc(c.topic)) })
        : m('r.summary.pass'),
    findings,
    coverage,
    reviewer: m('reviewer.readiness'),
    simulated: true,
    outdated: false,
    outdatedReason: null,
  };
}

// ---------------------------------------------------------------------------
// Evidence gaps shown in the research workspace
// ---------------------------------------------------------------------------

export function computeGaps(db: DemoDatabase, artifact: Artifact): EvidenceGap[] {
  const claims = claimsFor(db, artifact);
  const gaps: EvidenceGap[] = [];
  for (const claim of claims) {
    if (claim.supportStatus === 'missing_citation' || (claim.sourceIds.length === 0 && claim.supportStatus === 'unverified')) {
      gaps.push({
        id: `gap-${claim.id}`,
        kind: 'missing_citation',
        title: m('g.missing.title'),
        detail: claim.text,
        recommendedAction: m('g.missing.act', { src: src(claim.topic) }),
        claimIds: [claim.id],
      });
    } else if (claim.supportStatus === 'partial') {
      gaps.push({
        id: `gap-${claim.id}`,
        kind: 'partial_support',
        title: m('g.partial.title'),
        detail: claim.limitations[0] ?? claim.text,
        recommendedAction: m('g.partial.act', { src: src(claim.topic) }),
        claimIds: [claim.id],
      });
    } else if (claim.supportStatus === 'unsupported') {
      gaps.push({
        id: `gap-${claim.id}`,
        kind: 'unsupported',
        title: m('g.unsupported.title'),
        detail: claim.text,
        recommendedAction: m('g.unsupported.act'),
        claimIds: [claim.id],
      });
    }
  }
  for (const req of artifact.coverage) {
    const supported = claims.filter((c) => c.topic === req.topic && c.supportStatus === 'supported').length;
    if (supported < req.minSupportedClaims) {
      gaps.push({
        id: `gap-coverage-${req.topic}`,
        kind: 'coverage',
        title: m('g.coverage.title', { topic: topic(req.topic), supported, required: req.minSupportedClaims }),
        detail: m('g.coverage.detail', { count: req.minSupportedClaims, topicLc: topicLc(req.topic) }),
        recommendedAction: req.guidance ?? m('g.coverage.act', { topicLc: topicLc(req.topic) }),
        claimIds: claims.filter((c) => c.topic === req.topic && c.supportStatus !== 'supported').map((c) => c.id),
      });
    }
  }
  return gaps;
}

// ---------------------------------------------------------------------------
// Artifact and project state
// ---------------------------------------------------------------------------

export function deriveResearchStatus(db: DemoDatabase, artifact: Artifact): Artifact['status'] {
  if (artifact.staleReason) return 'stale';
  if (!artifact.isCurrent) return artifact.status;
  const verification = latestReview(db, artifact.id, 'verification', false);
  const readiness = latestReview(db, artifact.id, 'readiness', false);
  if (artifact.release) return 'released';
  if (verification?.decision === 'fail' || readiness?.decision === 'fail') return 'blocked';
  if (reviewPassed(verification) && reviewPassed(readiness)) return 'ready';
  const running = activeJobs(db, artifact.projectId).some((j) => j.target.id === artifact.id);
  if (verification || readiness || running) return 'under_review';
  return 'draft';
}

export function computeEligibility(db: DemoDatabase, project: Project): ContinuationEligibility {
  const brief = currentBrief(db, project.id);
  const research = currentArtifact(db, project.id, 'research');
  const verification = research ? latestReview(db, research.id, 'verification', false) : null;
  const readiness = research ? latestReview(db, research.id, 'readiness', false) : null;
  const delivery = currentHandoff(db, research, 'research_owner');
  const acceptance = currentHandoff(db, research, 'strategy_owner');

  const blockingCount = (r: Review | null) => r?.findings.filter((f) => !f.resolved && f.severity === 'blocking').length ?? 0;

  const checks: EligibilityCheck[] = [
    {
      id: 'brief',
      label: m('e.brief'),
      passed: Boolean(brief?.confirmedAt),
      detail: brief?.confirmedAt
        ? m('e.brief.ok', { v: brief.version, atDate: brief.confirmedAt })
        : brief
          ? m('e.brief.unconfirmed', { v: brief.version })
          : m('e.brief.none'),
      fix: brief?.confirmedAt ? null : { label: m('e.fix.brief'), view: 'brief' },
    },
    {
      id: 'research',
      label: m('e.research'),
      passed: Boolean(research && !research.staleReason),
      detail: !research
        ? m('e.research.none')
        : research.staleReason
          ? research.staleReason
          : m('e.research.ok', { v: research.version, bv: research.basedOn.briefVersion }),
      fix: research && !research.staleReason ? null : { label: m('e.fix.research'), view: 'research' },
    },
    {
      id: 'verification',
      label: m('e.verification'),
      passed: reviewPassed(verification),
      detail: !verification
        ? m('e.verification.none')
        : verification.decision === 'fail'
          ? m('e.verification.fail', { count: blockingCount(verification) })
          : verification.decision === 'pass_with_conditions'
            ? m('e.verification.cond')
            : m('e.verification.pass'),
      fix: reviewPassed(verification) ? null : { label: m('e.fix.verification'), view: 'research', params: { tab: 'verification' } },
    },
    {
      id: 'readiness',
      label: m('e.readiness'),
      passed: reviewPassed(readiness),
      detail: !readiness
        ? m('e.readiness.none')
        : readiness.decision === 'fail'
          ? readiness.summary
          : m('e.readiness.pass'),
      fix: reviewPassed(readiness) ? null : { label: m('e.fix.readiness'), view: 'research', params: { tab: 'readiness' } },
    },
    {
      id: 'delivery',
      label: m('e.delivery'),
      passed: Boolean(delivery),
      detail: delivery
        ? m('e.delivery.ok', { owner: delivery.owner, v: delivery.artifactVersion, atDate: delivery.createdAt })
        : m('e.delivery.none', { owner: project.owners.research }),
      fix: delivery ? null : { label: m('e.fix.handoff'), view: 'handoff' },
    },
    {
      id: 'acceptance',
      label: m('e.acceptance'),
      passed: Boolean(acceptance && acceptance.decision !== 'returned'),
      detail: !acceptance
        ? m('e.acceptance.none', { owner: project.owners.strategy })
        : acceptance.decision === 'returned'
          ? m('e.acceptance.returned', { owner: acceptance.owner, note: acceptance.note || m('e.acceptance.seeIssues') })
          : m(acceptance.decision === 'accepted_with_conditions' ? 'e.acceptance.okCond' : 'e.acceptance.ok', { owner: acceptance.owner, atDate: acceptance.createdAt }),
      fix: acceptance && acceptance.decision !== 'returned' ? null : { label: m('e.fix.handoff'), view: 'handoff' },
    },
    {
      id: 'release',
      label: m('e.release'),
      passed: Boolean(research?.release && !research.staleReason),
      detail: research?.release
        ? m('e.release.ok', { by: research.release.releasedBy, atDate: research.release.releasedAt })
        : m('e.release.none'),
      fix: research?.release ? null : { label: m('e.fix.handoff'), view: 'handoff' },
    },
  ];

  const failing = checks.filter((c) => !c.passed);
  const alreadyContinued = Boolean(project.continuedToStrategyAt);
  return {
    projectId: project.id,
    target: 'strategy',
    eligible: failing.length === 0 && !alreadyContinued,
    alreadyContinued,
    checks,
    summary: alreadyContinued
      ? m('e.summary.continued', { atDate: project.continuedToStrategyAt! })
      : failing.length === 0
        ? m('e.summary.all', { count: checks.length })
        : m('e.summary.cannot', { failing: failing.length, count: checks.length }),
  };
}

export function deriveProjectState(db: DemoDatabase, project: Project): { stage: Stage; status: ProjectStatus } {
  const brief = currentBrief(db, project.id);
  const research = currentArtifact(db, project.id, 'research');
  if (!brief?.confirmedAt) return { stage: 'brief', status: research ? 'needs_update' : 'draft' };
  if (!research) return { stage: 'research', status: 'in_progress' };
  if (research.staleReason) return { stage: 'research', status: 'needs_update' };

  if (project.continuedToStrategyAt) {
    const strategy = currentArtifact(db, project.id, 'strategy');
    if (!strategy) return { stage: 'strategy', status: 'in_progress' };
    if (strategy.status === 'stale') return { stage: 'strategy', status: 'needs_update' };
    if (strategy.status === 'ready' || strategy.status === 'released') return { stage: 'strategy', status: 'ready' };
    return { stage: 'strategy', status: 'in_progress' };
  }

  if (activeJobs(db, project.id).some((j) => j.purpose === 'research_generation')) {
    return { stage: 'research', status: 'in_progress' };
  }
  const verification = latestReview(db, research.id, 'verification', false);
  if (!verification) return { stage: 'verification', status: 'in_progress' };
  if (verification.decision === 'fail') return { stage: 'verification', status: 'blocked' };
  const readiness = latestReview(db, research.id, 'readiness', false);
  if (!readiness) return { stage: 'readiness', status: 'in_progress' };
  if (readiness.decision === 'fail') return { stage: 'readiness', status: 'blocked' };
  const eligibility = computeEligibility(db, project);
  if (eligibility.eligible) return { stage: 'handoff', status: 'ready' };
  if (currentHandoff(db, research, 'strategy_owner')?.decision === 'returned') return { stage: 'handoff', status: 'blocked' };
  return { stage: 'handoff', status: 'in_progress' };
}

export function deriveGates(db: DemoDatabase, project: Project): HumanGate[] {
  const brief = currentBrief(db, project.id);
  const research = currentArtifact(db, project.id, 'research');
  const strategy = currentArtifact(db, project.id, 'strategy');
  const stageIndex = STAGES.indexOf(project.currentStage);
  return project.humanGates.map((gate) => {
    const next = { ...gate };
    if (gate.stage === 'brief') {
      next.status = brief?.confirmedAt ? 'approved' : brief ? 'awaiting_decision' : 'not_reached';
      next.decidedAt = brief?.confirmedAt ?? null;
      next.decidedBy = brief?.confirmedBy ?? null;
    } else if (gate.stage === 'handoff') {
      if (research?.release && !research.staleReason) {
        next.status = 'approved';
        next.decidedAt = research.release.releasedAt;
        next.decidedBy = research.release.releasedBy;
      } else {
        next.decidedAt = null;
        next.decidedBy = null;
        next.status =
          project.status === 'blocked' && stageIndex <= STAGES.indexOf('handoff')
            ? 'blocked'
            : project.currentStage === 'handoff'
              ? 'awaiting_decision'
              : 'not_reached';
      }
    } else if (gate.stage === 'strategy') {
      const approved = strategy && !strategy.staleReason && (strategy.status === 'ready' || strategy.status === 'released');
      const review = strategy ? latestReview(db, strategy.id, 'strategy_review', false) : null;
      next.status = approved ? 'approved' : strategy && strategy.status === 'under_review' ? 'awaiting_decision' : 'not_reached';
      next.decidedAt = approved ? (review?.createdAt ?? strategy!.createdAt) : null;
      next.decidedBy = approved ? project.owners.strategy : null;
    } else {
      next.status = 'not_reached';
    }
    return next;
  });
}

// ---------------------------------------------------------------------------
// Overview composition
// ---------------------------------------------------------------------------

export function computeStages(db: DemoDatabase, project: Project, capabilities: Capabilities): StageProgress[] {
  const current = STAGES.indexOf(project.currentStage);
  const brief = currentBrief(db, project.id);
  const research = currentArtifact(db, project.id, 'research');
  const strategy = currentArtifact(db, project.id, 'strategy');
  const verification = research ? latestReview(db, research.id, 'verification') : null;
  const readiness = research ? latestReview(db, research.id, 'readiness') : null;
  const delivery = currentHandoff(db, research, 'research_owner');
  const acceptance = currentHandoff(db, research, 'strategy_owner');

  const decisionText = (r: Review | null) =>
    m(!r ? 's.notRun' : r.outdated ? 's.outdated' : r.decision === 'pass' ? 's.passed' : r.decision === 'fail' ? 's.failed' : 's.passedCond');
  const dots = (...items: string[]) => m('_dots', { items });

  const notes: Record<Stage, string> = {
    brief: brief ? m(brief.confirmedAt ? 's.brief.confirmed' : 's.brief.unconfirmed', { v: brief.version }) : m('s.notStarted'),
    research: research
      ? research.staleReason
        ? dots(m('s.research', { v: research.version, count: claimsFor(db, research).length }), m('s.stale'))
        : m('s.research', { v: research.version, count: claimsFor(db, research).length })
      : m('s.notProduced'),
    verification: decisionText(verification),
    readiness: decisionText(readiness),
    handoff: dots(
      m(delivery ? 's.delivered' : 's.notDelivered'),
      m(acceptance ? (acceptance.decision === 'returned' ? 's.returned' : 's.accepted') : 's.notAccepted'),
      ...(research?.release ? [m('s.released')] : []),
    ),
    strategy: strategy ? m('s.strategy', { v: strategy.version, status: m(`artifactStatus.${strategy.status}`) }) : m(project.continuedToStrategyAt ? 's.generating' : 's.notStarted'),
    creative: capabilities.creative_development.supported ? '' : m('s.noDemo'),
    final: capabilities.final_proposal.supported ? '' : m('s.noDemo'),
  };

  return STAGES.map((stage, index) => {
    let state: StageProgress['state'];
    const notInDemo =
      (stage === 'creative' && !capabilities.creative_development.supported) ||
      (stage === 'final' && !capabilities.final_proposal.supported);
    const failedReview =
      (stage === 'verification' && verification && !verification.outdated && verification.decision === 'fail') ||
      (stage === 'readiness' && readiness && !readiness.outdated && readiness.decision === 'fail');
    if (notInDemo) state = 'not_in_demo';
    else if (index < current) state = 'complete';
    else if (index === current) state = project.status === 'blocked' ? 'blocked' : 'current';
    else state = failedReview && !project.continuedToStrategyAt ? 'blocked' : 'upcoming';
    return { stage, label: m(`stage.${stage}`), state, note: notes[stage] };
  });
}

export function computeBlockers(db: DemoDatabase, project: Project): Blocker[] {
  const blockers: Blocker[] = [];
  const research = currentArtifact(db, project.id, 'research');
  if (research?.staleReason) {
    blockers.push({
      id: 'stale-research',
      title: m('b.staleResearch'),
      detail: research.staleReason,
      recommendedAction: m('b.staleResearch.act'),
      severity: 'blocking',
      link: { view: 'research' },
    });
  }
  if (research && !research.staleReason && !project.continuedToStrategyAt) {
    for (const type of ['verification', 'readiness'] as const) {
      const review = latestReview(db, research.id, type, false);
      if (!review) continue;
      for (const finding of review.findings) {
        if (finding.resolved || finding.severity === 'minor') continue;
        blockers.push({
          id: finding.id,
          title: m(`b.${type}.${finding.severity === 'blocking' ? 'blocking' : 'condition'}`),
          detail: finding.message,
          recommendedAction: finding.requiredAction,
          severity: finding.severity,
          link: finding.claimIds[0]
            ? { view: 'research', params: { tab: type, claim: finding.claimIds[0] } }
            : { view: 'research', params: { tab: type } },
        });
      }
    }
    const acceptance = currentHandoff(db, research, 'strategy_owner');
    if (acceptance?.decision === 'returned') {
      blockers.push({
        id: acceptance.id,
        title: m('b.returned'),
        detail: acceptance.note || acceptance.unresolvedIssues.join(' '),
        recommendedAction: m('b.returned.act'),
        severity: 'blocking',
        link: { view: 'handoff' },
      });
    }
  }
  const strategy = currentArtifact(db, project.id, 'strategy');
  if (strategy?.staleReason) {
    blockers.push({
      id: 'stale-strategy',
      title: m('b.staleStrategy'),
      detail: strategy.staleReason,
      recommendedAction: m('b.staleStrategy.act'),
      severity: 'major',
      link: { view: 'artifacts', params: { artifact: strategy.id } },
    });
  }
  return blockers.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'blocking' ? -1 : 1));
}

export function computeNextAction(
  db: DemoDatabase,
  project: Project,
  eligibility: ContinuationEligibility,
  capabilities: Capabilities,
): NextAction {
  const brief = currentBrief(db, project.id);
  const research = currentArtifact(db, project.id, 'research');
  const strategy = currentArtifact(db, project.id, 'strategy');
  const running = activeJobs(db, project.id);
  const runningLabel = running[0]?.label;

  const action = (partial: Partial<NextAction> & Pick<NextAction, 'label' | 'description'>): NextAction => ({
    link: null,
    command: null,
    enabled: true,
    disabledReason: null,
    ...partial,
  });

  if (!brief?.confirmedAt) {
    return action({
      label: brief && brief.version > 1 ? m('n.confirmBriefV', { v: brief.version }) : m('n.completeBrief'),
      description: m('n.brief.desc'),
      link: { view: 'brief' },
    });
  }
  if (running.length > 0 && !project.continuedToStrategyAt) {
    return action({
      label: m('n.wait', { job: runningLabel }),
      description: m('n.wait.desc'),
      link: { view: 'jobs' },
      enabled: false,
      disabledReason: m('n.wait.reason', { job: runningLabel }),
    });
  }
  if (!research) {
    return action({
      label: m('n.generate'),
      description: m('n.generate.desc'),
      command: 'generate_research',
    });
  }
  if (research.staleReason) {
    return action({
      label: m('n.regenerate'),
      description: m('n.regenerate.desc', { reason: research.staleReason }),
      command: 'regenerate_research',
    });
  }
  if (project.continuedToStrategyAt) {
    if (running.some((j) => j.purpose === 'strategy_generation')) {
      return action({
        label: m('n.strategyGen'),
        description: m('n.strategyGen.desc'),
        link: { view: 'jobs' },
        enabled: false,
        disabledReason: m('n.strategyGen.reason'),
      });
    }
    if (strategy && strategy.status === 'under_review') {
      return action({
        label: m('n.reviewStrategy'),
        description: m('n.reviewStrategy.desc'),
        link: { view: 'artifacts', params: { artifact: strategy.id } },
      });
    }
    const creative = capabilities.creative_development;
    return action({
      label: m('n.creative'),
      description: m('n.creative.desc'),
      enabled: false,
      disabledReason: creative.supported ? null : creative.reason,
    });
  }
  const verification = latestReview(db, research.id, 'verification', false);
  if (!verification) {
    return action({
      label: m('n.verify'),
      description: m('n.verify.desc'),
      command: 'run_verification',
    });
  }
  if (verification.decision === 'fail') {
    const open = verification.findings.filter((f) => !f.resolved && f.severity !== 'minor').length;
    return action({
      label: m('n.resolve'),
      description: m('n.resolve.desc', { count: open }),
      link: { view: 'research', params: { tab: 'verification' } },
    });
  }
  const readiness = latestReview(db, research.id, 'readiness', false);
  if (!readiness) {
    return action({
      label: m('n.readiness'),
      description: m('n.readiness.desc'),
      command: 'run_readiness',
    });
  }
  if (readiness.decision === 'fail') {
    return action({
      label: m('n.closeGaps'),
      description: readiness.summary,
      link: { view: 'research', params: { tab: 'readiness' } },
    });
  }
  if (eligibility.eligible) {
    const feature = capabilities.continuation_to_strategy;
    return action({
      label: m('n.continue'),
      description: m('n.continue.desc'),
      command: 'continue_to_strategy',
      enabled: feature.supported,
      disabledReason: feature.supported ? null : feature.reason,
    });
  }
  const firstFailing = eligibility.checks.find((c) => !c.passed);
  return action({
    label: m(firstFailing?.id === 'delivery' ? 'n.deliver' : firstFailing?.id === 'acceptance' ? 'n.accept' : firstFailing?.id === 'release' ? 'n.release' : 'n.handoff'),
    description: firstFailing?.detail ?? m('n.handoff.desc'),
    link: { view: 'handoff' },
  });
}

// ---------------------------------------------------------------------------
// Handoff permissions and suggestions
// ---------------------------------------------------------------------------

export function handoffPermissions(db: DemoDatabase, project: Project) {
  const research = currentArtifact(db, project.id, 'research');
  const verification = research ? latestReview(db, research.id, 'verification', false) : null;
  const readiness = research ? latestReview(db, research.id, 'readiness', false) : null;
  const delivery = currentHandoff(db, research, 'research_owner');
  const acceptance = currentHandoff(db, research, 'strategy_owner');

  let canDeliver = { allowed: true, reason: m('p.deliver.ok', { owner: project.owners.research, v: research?.version ?? '–' }) };
  if (!research) canDeliver = { allowed: false, reason: m('p.deliver.noResearch') };
  else if (research.staleReason) canDeliver = { allowed: false, reason: m('p.deliver.stale') };
  else if (!reviewPassed(verification)) canDeliver = { allowed: false, reason: m('p.deliver.verification') };
  else if (!reviewPassed(readiness)) canDeliver = { allowed: false, reason: m('p.deliver.readiness') };
  else if (delivery) canDeliver = { allowed: false, reason: m('p.deliver.done', { atDate: delivery.createdAt }) };

  let canAccept = { allowed: true, reason: m('p.accept.ok', { owner: project.owners.strategy }) };
  if (!delivery) canAccept = { allowed: false, reason: m('p.accept.noDelivery') };
  else if (acceptance && acceptance.decision !== 'returned') canAccept = { allowed: false, reason: m('p.accept.done', { atDate: acceptance.createdAt }) };

  let canRelease = { allowed: true, reason: m('p.release.ok') };
  if (!research) canRelease = { allowed: false, reason: m('p.release.noResearch') };
  else if (research.release) canRelease = { allowed: false, reason: m('p.release.done', { atDate: research.release.releasedAt }) };
  else if (!acceptance || acceptance.decision === 'returned') canRelease = { allowed: false, reason: m('p.release.noAcceptance') };

  return { canDeliver, canAccept, canRelease };
}

export function suggestHandoffContent(db: DemoDatabase, project: Project) {
  const research = currentArtifact(db, project.id, 'research');
  if (!research) return { permittedUses: [], prohibitedInferences: [], unresolvedIssues: [] };
  const claims = claimsFor(db, research);
  const supported = claims.filter((c) => c.supportStatus === 'supported').length;
  const partial = claims.filter((c) => c.supportStatus === 'partial');
  const permittedUses = [m('h.cite', { count: supported })];
  if (partial.length) permittedUses.push(m('h.partial'));
  const prohibitedInferences = [m('h.noRepresent'), m('h.noMarket'), ...partial.map((c) => m('h.noGeneralise', { claim: quoted(c.text, 60) }))];
  const unresolvedIssues = (['verification', 'readiness'] as const).flatMap((type) => {
    const review = latestReview(db, research.id, type, false);
    return review ? review.findings.filter((f) => !f.resolved).map((f) => f.message) : [];
  });
  return { permittedUses, prohibitedInferences, unresolvedIssues };
}

// ---------------------------------------------------------------------------
// Job recovery
// ---------------------------------------------------------------------------

export function jobRecovery(db: DemoDatabase, job: JobRecord): JobRecovery {
  if (job.status === 'queued' || job.status === 'running') {
    return { action: 'none', eligible: false, reason: m('j.inProgress') };
  }
  if (job.status === 'succeeded') {
    return job.reconciledAt
      ? { action: 'none', eligible: false, reason: m('j.recovered') }
      : { action: 'none', eligible: false, reason: m('j.completed') };
  }
  if (job.status === 'awaiting_reconciliation') {
    return {
      action: 'reconcile',
      eligible: true,
      reason: m('j.reconcile', { ref: job.receipt?.savedResultRef ?? '–' }),
    };
  }
  const retry = db.jobs.find((j) => j.retryOfJobId === job.id);
  if (retry) return { action: 'retry', eligible: false, reason: m('j.retried', { attempt: retry.attempt }) };
  if (job.error && !job.error.retryable) {
    return { action: 'none', eligible: false, reason: m('j.notRetryable', { detail: job.error.detail }) };
  }
  if (job.target.kind === 'artifact') {
    const artifact = db.artifacts.find((a) => a.id === job.target.id);
    if (!artifact || !artifact.isCurrent) {
      return { action: 'retry', eligible: false, reason: m('j.superseded') };
    }
  }
  return { action: 'retry', eligible: true, reason: m('j.retry', { attempt: job.attempt + 1 }) };
}
