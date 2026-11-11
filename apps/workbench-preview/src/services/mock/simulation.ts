/**
 * State-changing helpers shared by the mock service and the seed builder. Everything here is
 * deterministic: the same database and inputs always produce the same result.
 */
import type { Artifact, ArtifactSection, Claim, ID, Observation, Project, Review } from '../../domain/models';
import type { DemoDatabase, JobRecord } from './db';
import {
  claimsFor,
  currentArtifact,
  currentBrief,
  currentHandoff,
  deriveGates,
  deriveProjectState,
  deriveResearchStatus,
  latestReview,
  runReadiness,
  runVerification,
} from './rules';
import { m } from './i18n';
import { adoptedObjectives, researchQuestions } from '../../domain/briefRequirements';
import { createResearchMethodPlan } from '../../domain/researchMethod';

export type IdFactory = (prefix: string) => string;

export function applyVerification(db: DemoDatabase, artifact: Artifact, at: string, jobId: ID | null, newId: IdFactory): Review {
  const outcome = runVerification(db, artifact, () => newId('fnd'));
  for (const source of db.sources) {
    const status = outcome.sourceStatuses.get(source.id);
    if (status) source.verificationStatus = status;
  }
  for (const claim of db.claims) {
    const status = outcome.claimStatuses.get(claim.id);
    if (status && claim.artifactId === artifact.id) claim.supportStatus = status;
  }
  for (const r of db.reviews) {
    if (r.artifactId === artifact.id && r.type === 'verification' && !r.outdated) {
      r.outdated = true;
      r.outdatedReason = m('o.replacedVerification');
    }
  }
  const review: Review = { ...outcome.review, id: newId('rev'), createdAt: at, jobId };
  db.reviews.push(review);
  // Readiness depends on verified support, so an earlier readiness review no longer counts.
  for (const r of db.reviews) {
    if (r.artifactId === artifact.id && r.type === 'readiness' && !r.outdated) {
      r.outdated = true;
      r.outdatedReason = m('o.verificationRerun');
    }
  }
  return review;
}

export function applyReadiness(db: DemoDatabase, artifact: Artifact, at: string, jobId: ID | null, newId: IdFactory): Review {
  const result = runReadiness(db, artifact, () => newId('fnd'));
  for (const r of db.reviews) {
    if (r.artifactId === artifact.id && r.type === 'readiness' && !r.outdated) {
      r.outdated = true;
      r.outdatedReason = m('o.replacedReadiness');
    }
  }
  const review: Review = { ...result, id: newId('rev'), createdAt: at, jobId };
  db.reviews.push(review);
  return review;
}

/** Evidence changed: reviews, handoffs and release for this artifact no longer count. */
export function markEvidenceChanged(db: DemoDatabase, artifact: Artifact, reason: string) {
  for (const r of db.reviews) {
    if (r.artifactId === artifact.id && !r.outdated) {
      r.outdated = true;
      r.outdatedReason = reason;
    }
  }
  for (const h of db.handoffs) {
    if (h.artifactId === artifact.id && !h.outdated) {
      h.outdated = true;
      h.outdatedReason = reason;
    }
  }
  artifact.release = null;
}

/** A confirmed brief changed: downstream artifacts are stale and continuation resets. */
export function markBriefChanged(db: DemoDatabase, project: Project, fromVersion: number, toVersion: number): Artifact[] {
  const affected: Artifact[] = [];
  for (const artifact of db.artifacts) {
    if (artifact.projectId !== project.id || !artifact.isCurrent || artifact.staleReason) continue;
    artifact.staleReason = m(artifact.stage === 'strategy' ? 'o.staleBrief.strategy' : 'o.staleBrief.research', { from: fromVersion, to: toVersion });
    artifact.status = 'stale';
    affected.push(artifact);
    for (const h of db.handoffs) {
      if (h.artifactId === artifact.id && !h.outdated) {
        h.outdated = true;
        h.outdatedReason = m('o.briefChanged');
      }
    }
  }
  project.continuedToStrategyAt = null;
  return affected;
}

export function refreshProjectState(db: DemoDatabase, projectId: ID) {
  const project = db.projects.find((p) => p.id === projectId);
  if (!project) return;
  const research = currentArtifact(db, projectId, 'research');
  if (research) research.status = deriveResearchStatus(db, research);
  const state = deriveProjectState(db, project);
  project.currentStage = state.stage;
  project.status = state.status;
  project.humanGates = deriveGates(db, project);
}

export function touchProject(project: Project, at: string) {
  project.revision += 1;
  project.updatedAt = at;
}

// ---------------------------------------------------------------------------
// Simulated generation
// ---------------------------------------------------------------------------

export function createResearchVersion(db: DemoDatabase, project: Project, at: string, jobId: ID | null, newId: IdFactory): Artifact {
  const brief = currentBrief(db, project.id);
  const previous = currentArtifact(db, project.id, 'research');
  const id = newId('art');
  let sections: ArtifactSection[];
  let claimIds: ID[] = [];

  if (previous) {
    const idMap = new Map<ID, ID>();
    for (const claim of claimsFor(db, previous)) {
      const next: Claim = { ...claim, id: newId('clm'), artifactId: id, supportStatus: 'unverified', sourceIds: [...claim.sourceIds], limitations: [...claim.limitations] };
      idMap.set(claim.id, next.id);
      db.claims.push(next);
      claimIds.push(next.id);
    }
    sections = previous.sections.map((section) => ({
      ...section,
      id: newId('sec'),
      blocks: section.blocks.map((block) =>
        block.kind === 'paragraph'
          ? { kind: 'paragraph', segments: block.segments.map((s) => (typeof s === 'string' ? s : { claimId: idMap.get(s.claimId) ?? s.claimId })) }
          : { ...block },
      ),
    }));
    sections[0] = {
      ...sections[0],
      blocks: [
        { kind: 'callout', tone: 'note', text: `本地模拟重新生成：沿用研究第${previous.version}版内容，供对照简报第${brief?.version ?? '待定'}版重新核验。` },
        ...sections[0].blocks.filter((b) => !(b.kind === 'callout' && (b.text.startsWith('Simulated regeneration') || b.text.startsWith('本地模拟重新生成：')))),
      ],
    };
    previous.isCurrent = false;
    previous.supersededAt = at;
  } else {
    const objectives = researchQuestions(brief).length ? researchQuestions(brief) : adoptedObjectives(brief);
    sections = [
      {
        id: newId('sec'),
        heading: '研究摘要',
        blocks: [
          { kind: 'callout', tone: 'note', text: '本地模拟研究框架，尚无研究发现。请先在资料库添加来源，再补充有引用的论点。' },
          { kind: 'paragraph', segments: [`本研究框架对应项目“${project.name}”，后续问题依据简报第${brief?.version ?? 1}版整理。`] },
        ],
      },
      ...objectives.map((objective) => ({
        id: newId('sec'),
        heading: objective.replace(/\.$/, ''),
        blocks: [{ kind: 'callout' as const, tone: 'gap' as const, text: '此问题尚无已收集的证据。' }],
      })),
    ];
    claimIds = [];
  }

  const artifact: Artifact = {
    id,
    projectId: project.id,
    stage: 'research',
    lineageId: previous?.lineageId ?? newId('lin'),
    version: (previous?.version ?? 0) + 1,
    title: previous?.title ?? `研究 · ${project.name}`,
    summary: previous?.summary ?? '根据任务简报生成的本地模拟研究框架。',
    sections,
    claimIds,
    createdAt: at,
    status: 'draft',
    isCurrent: true,
    supersededAt: null,
    basedOn: { briefVersion: brief?.version ?? 1, researchArtifactId: null },
    staleReason: null,
    producedByJobId: jobId,
    release: null,
    coverage: previous?.coverage.map((c) => ({ ...c })) ?? [
      { topic: 'audience', minSupportedClaims: 1, guidance: null },
      { topic: 'category', minSupportedClaims: 1, guidance: null },
    ],
    simulated: true,
  };
  if (brief) artifact.researchMethodPlan = createResearchMethodPlan(artifact, brief);
  db.artifacts.push(artifact);
  return artifact;
}

export function createStrategyArtifact(db: DemoDatabase, project: Project, at: string, jobId: ID | null, newId: IdFactory): Artifact {
  const brief = currentBrief(db, project.id);
  const research = currentArtifact(db, project.id, 'research');
  const previous = currentArtifact(db, project.id, 'strategy');
  const acceptance = currentHandoff(db, research, 'strategy_owner');
  const template = db.strategyTemplates[project.id];
  const id = newId('art');

  const carried = research ? claimsFor(db, research).filter((c) => c.supportStatus === 'supported').slice(0, 4) : [];
  const newClaims: Claim[] = carried.map((c) => ({
    id: newId('clm'),
    artifactId: id,
    text: c.text,
    topic: c.topic,
    sourceIds: [...c.sourceIds],
    supportStatus: 'supported',
    limitations: [...c.limitations],
  }));
  db.claims.push(...newClaims);

  const objectives = researchQuestions(brief).length ? researchQuestions(brief) : adoptedObjectives(brief);
  const territories = template?.territories ?? objectives.slice(0, 3).map((o, i) => ({
    name: `Territory ${String.fromCharCode(65 + i)}`,
    description: `A route that answers: ${o}`,
  }));

  const sections: ArtifactSection[] = [
    {
      id: newId('sec'),
      heading: 'Positioning',
      blocks: [
        { kind: 'callout', tone: 'note', text: `Simulated strategy draft generated from research v${research?.version ?? '–'} and brief v${brief?.version ?? '–'}. Review before use.` },
        { kind: 'paragraph', segments: [template?.positioning ?? `A positioning for ${project.name} that answers the brief’s first question: ${objectives[0] ?? 'see brief'}`] },
      ],
    },
    {
      id: newId('sec'),
      heading: 'Evidence carried forward',
      blocks: newClaims.length
        ? newClaims.map((c) => ({ kind: 'paragraph' as const, segments: [{ claimId: c.id }] }))
        : [{ kind: 'callout' as const, tone: 'gap' as const, text: 'No supported research claims were available to carry forward.' }],
    },
    {
      id: newId('sec'),
      heading: 'Territories',
      blocks: [{ kind: 'list', items: territories.map((t) => `${t.name}: ${t.description}`) }],
    },
    {
      id: newId('sec'),
      heading: 'Limits accepted at handoff',
      blocks: [
        {
          kind: 'list',
          items: acceptance ? [...acceptance.prohibitedInferences, ...acceptance.unresolvedIssues.map((i) => `Open: ${i}`)] : ['No handoff limits were recorded.'],
        },
      ],
    },
    {
      id: newId('sec'),
      heading: 'Open questions',
      blocks: [{ kind: 'list', items: template?.openQuestions ?? ['Which territory should lead?', 'What would the client need to see to choose between them?'] }],
    },
  ];

  if (previous) {
    previous.isCurrent = false;
    previous.supersededAt = at;
  }

  const artifact: Artifact = {
    id,
    projectId: project.id,
    stage: 'strategy',
    lineageId: previous?.lineageId ?? newId('lin'),
    version: (previous?.version ?? 0) + 1,
    title: template?.title ?? `Strategy — ${project.name}`,
    summary: 'Simulated strategy draft. It stays under review until the strategy owner approves it.',
    sections,
    claimIds: newClaims.map((c) => c.id),
    createdAt: at,
    status: 'under_review',
    isCurrent: true,
    supersededAt: null,
    basedOn: { briefVersion: brief?.version ?? 1, researchArtifactId: research?.id ?? null },
    staleReason: null,
    producedByJobId: jobId,
    release: null,
    coverage: [],
    simulated: true,
  };
  db.artifacts.push(artifact);
  return artifact;
}

export function simulateObservation(db: DemoDatabase, job: JobRecord, at: string, newId: IdFactory): Observation {
  const image = db.images.find((i) => i.id === job.target.id);
  const saved = job.sim?.savedObservation;
  let content: Pick<Observation, 'visibleFeatures' | 'transcribedText' | 'uncertainties'>;
  if (saved) {
    content = saved;
  } else {
    const w = image?.width ?? 0;
    const h = image?.height ?? 0;
    const orientation = w > h ? 'Landscape' : w < h ? 'Portrait' : 'Square';
    const colors = image ? (db.imageMeta[image.id]?.dominantColors ?? []) : [];
    content = {
      visibleFeatures: [
        `${orientation} image, ${w} × ${h} px.`,
        colors.length ? `Dominant colours sampled in your browser: ${colors.join(', ')}.` : 'No colour sample was recorded.',
        'Subject and composition are not described: the demo does not analyse image content.',
      ],
      transcribedText: [],
      uncertainties: [
        'Simulated observation. Features come from file metadata, not visual analysis.',
        'No text transcription was attempted in demo mode.',
      ],
    };
  }
  const observation: Observation = {
    id: newId('obs'),
    imageId: job.target.id,
    ...content,
    reviewStatus: 'unreviewed',
    reviewNote: null,
    reviewedAt: null,
    createdAt: at,
    jobId: job.id,
    simulated: true,
  };
  db.observations = db.observations.filter((o) => o.imageId !== job.target.id);
  db.observations.push(observation);
  if (image) image.observationStatus = 'observed';
  return observation;
}

export function latestStrategyReview(db: DemoDatabase, artifactId: ID) {
  return latestReview(db, artifactId, 'strategy_review');
}
