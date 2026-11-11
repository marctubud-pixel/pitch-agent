/**
 * Seed data for the demo: three fictional projects. Publishers, people, links and findings are
 * invented for illustration and are labelled as samples in the UI. Reviews are produced by the
 * same deterministic rules the simulator uses, so re-running a check gives consistent results.
 */
import type {
  Activity,
  ActivityType,
  Artifact,
  ArtifactBlock,
  ArtifactSection,
  Brief,
  Claim,
  CoverageRequirement,
  EvidenceTopic,
  Handoff,
  HumanGate,
  ID,
  ImageAsset,
  JobPurpose,
  JobStatus,
  Observation,
  Project,
  Review,
  Source,
  TaskCard,
} from '../../../domain/models';
import { emptyDatabase, type DemoDatabase, type JobRecord, type JobSimulation } from '../db';
import { applyReadiness, applyVerification, refreshProjectState } from '../simulation';
import { m } from '../i18n';
import { placeholderImage } from './placeholders';

const SAMPLE_BASE = 'https://example.com/sample';

type ClaimSpec = { claim: string; text: string; topic: EvidenceTopic; sources: string[]; limitations?: string[] };
type BlockSpec = Array<string | ClaimSpec> | { list: string[] } | { note: string } | { gap: string };

export function defaultGates(): HumanGate[] {
  const gate = (id: string, stage: HumanGate['stage'], label: string, description: string): HumanGate => ({
    id,
    stage,
    label,
    description,
    status: 'not_reached',
    decidedAt: null,
    decidedBy: null,
  });
  return [
    gate('gate-brief', 'brief', m('gate.brief'), m('gate.brief.desc')),
    gate('gate-release', 'handoff', m('gate.release'), m('gate.release.desc')),
    gate('gate-strategy', 'strategy', m('gate.strategy'), m('gate.strategy.desc')),
    gate('gate-final', 'final', m('gate.final'), m('gate.final.desc')),
  ];
}

type TaskExtras = 'brand' | 'researchQuestions' | 'deliverableType' | 'timeline' | 'budget' | 'references' | 'openQuestions' | 'provenance' | 'attachmentIds';

class SeedBuilder {
  db: DemoDatabase = emptyDatabase();
  private counters = new Map<string, number>();
  private sourceKeys = new Map<string, ID>();

  id = (prefix: string): string => {
    const n = (this.counters.get(prefix) ?? 0) + 1;
    this.counters.set(prefix, n);
    return `${prefix}-seed-${n}`;
  };

  project(p: Omit<Project, 'revision' | 'currentStage' | 'status' | 'humanGates'> & { revision: number }): Project {
    const project: Project = { ...p, currentStage: 'brief', status: 'draft', humanGates: defaultGates() };
    this.db.projects.push(project);
    return project;
  }

  brief(b: Omit<Brief, 'id' | TaskExtras> & Partial<Pick<Brief, TaskExtras>>): Brief {
    const brief: Brief = {
      brand: '',
      researchQuestions: [],
      deliverableType: '',
      timeline: '',
      budget: '',
      references: [],
      openQuestions: [],
      provenance: {},
      attachmentIds: [],
      ...b,
      id: `brf-${b.projectId}-v${b.version}`,
    };
    this.db.briefs.push(brief);
    return brief;
  }

  source(projectId: ID, key: string, s: Omit<Source, 'id' | 'projectId' | 'isSampleLink' | 'url' | 'addedBy'> & { path: string; addedBy?: string }): Source {
    const { path, addedBy, ...rest } = s;
    const source: Source = {
      ...rest,
      id: `src-${projectId}-${key}`,
      projectId,
      url: `${SAMPLE_BASE}/${path}`,
      isSampleLink: true,
      addedBy: addedBy ?? 'Research team',
    };
    this.sourceKeys.set(`${projectId}:${key}`, source.id);
    this.db.sources.push(source);
    return source;
  }

  artifact(spec: {
    projectId: ID;
    stage: Artifact['stage'];
    lineageId: ID;
    version: number;
    title: string;
    summary: string;
    createdAt: string;
    sections: Array<{ heading: string; blocks: BlockSpec[] }>;
    coverage?: CoverageRequirement[];
    briefVersion: number;
    researchArtifactId?: ID | null;
    isCurrent?: boolean;
    supersededAt?: string | null;
    staleReason?: string | null;
    jobId?: ID | null;
    status?: Artifact['status'];
    simulated?: boolean;
  }): Artifact {
    const id = `art-${spec.projectId}-${spec.stage}-v${spec.version}`;
    const claimIds: ID[] = [];
    const sections: ArtifactSection[] = spec.sections.map((section, si) => ({
      id: `${id}-s${si + 1}`,
      heading: section.heading,
      blocks: section.blocks.map((block): ArtifactBlock => {
        if (Array.isArray(block)) {
          return {
            kind: 'paragraph',
            segments: block.map((seg) => {
              if (typeof seg === 'string') return seg;
              const claim: Claim = {
                id: `${id}-${seg.claim}`,
                artifactId: id,
                text: seg.text,
                topic: seg.topic,
                sourceIds: seg.sources.map((k) => {
                  const sid = this.sourceKeys.get(`${spec.projectId}:${k}`);
                  if (!sid) throw new Error(`Unknown source ${k}`);
                  return sid;
                }),
                supportStatus: 'unverified',
                limitations: seg.limitations ?? [],
              };
              this.db.claims.push(claim);
              claimIds.push(claim.id);
              return { claimId: claim.id };
            }),
          };
        }
        if ('list' in block) return { kind: 'list', items: block.list };
        if ('note' in block) return { kind: 'callout', tone: 'note', text: block.note };
        return { kind: 'callout', tone: 'gap', text: block.gap };
      }),
    }));
    const artifact: Artifact = {
      id,
      projectId: spec.projectId,
      stage: spec.stage,
      lineageId: spec.lineageId,
      version: spec.version,
      title: spec.title,
      summary: spec.summary,
      sections,
      claimIds,
      createdAt: spec.createdAt,
      status: spec.status ?? 'draft',
      isCurrent: spec.isCurrent ?? true,
      supersededAt: spec.supersededAt ?? null,
      basedOn: { briefVersion: spec.briefVersion, researchArtifactId: spec.researchArtifactId ?? null },
      staleReason: spec.staleReason ?? null,
      producedByJobId: spec.jobId ?? null,
      release: null,
      coverage: spec.coverage ?? [],
      simulated: spec.simulated ?? true,
    };
    this.db.artifacts.push(artifact);
    return artifact;
  }

  verify(artifact: Artifact, at: string, jobId: ID): Review {
    return applyVerification(this.db, artifact, at, jobId, this.id);
  }

  readiness(artifact: Artifact, at: string, jobId: ID): Review {
    return applyReadiness(this.db, artifact, at, jobId, this.id);
  }

  handoff(h: Omit<Handoff, 'id' | 'outdated' | 'outdatedReason' | 'recordedBy'> & { recordedBy?: string }): Handoff {
    const handoff: Handoff = { ...h, id: this.id('hof'), outdated: false, outdatedReason: null, recordedBy: h.recordedBy ?? h.owner };
    this.db.handoffs.push(handoff);
    return handoff;
  }

  job(spec: {
    projectId: ID;
    purpose: JobPurpose;
    label: string;
    target: JobRecord['target'];
    at: string;
    seconds: number;
    status?: JobStatus;
    output?: JobRecord['output'];
    error?: JobRecord['error'];
    attempt?: number;
    retryOf?: ID | null;
    sim?: JobSimulation | null;
    savedRef?: string;
  }): JobRecord {
    const id = this.id('job');
    const start = new Date(Date.parse(spec.at) + 2000).toISOString();
    const end = new Date(Date.parse(spec.at) + 2000 + spec.seconds * 1000).toISOString();
    const status = spec.status ?? 'succeeded';
    const job: JobRecord = {
      id,
      projectId: spec.projectId,
      purpose: spec.purpose,
      label: spec.label,
      status,
      commandId: `cmd-seed-${id}`,
      createdAt: spec.at,
      startedAt: start,
      completedAt: status === 'awaiting_reconciliation' ? null : end,
      error: spec.error ?? null,
      receipt: {
        provider: 'Simulated provider',
        requestId: `req_${id.replace(/\W/g, '')}`,
        model: spec.purpose === 'image_observation' ? 'sim-vision-1' : 'sim-text-1',
        inputUnits: 1800 + spec.seconds * 37,
        outputUnits: status === 'failed' ? 0 : 640 + spec.seconds * 11,
        durationMs: spec.seconds * 1000,
        savedResultRef: spec.savedRef ?? null,
        raw: {
          simulated: true,
          request_id: `req_${id.replace(/\W/g, '')}`,
          status: status === 'failed' ? 'error' : 'ok',
          finished_at: end,
          ...(spec.savedRef ? { saved_result: spec.savedRef, delivery: 'not_acknowledged' } : {}),
        },
      },
      target: spec.target,
      output: spec.output ?? null,
      attempt: spec.attempt ?? 1,
      retryOfJobId: spec.retryOf ?? null,
      reconciledAt: null,
      simulated: true,
      sim: spec.sim ?? null,
    };
    this.db.jobs.push(job);
    return job;
  }

  image(i: Omit<ImageAsset, 'isPlaceholder' | 'width' | 'height'>): ImageAsset {
    const image: ImageAsset = { ...i, isPlaceholder: true, width: 800, height: 500 };
    this.db.images.push(image);
    return image;
  }

  observation(o: Omit<Observation, 'id' | 'simulated'>): Observation {
    const observation: Observation = { ...o, id: this.id('obs'), simulated: true };
    this.db.observations.push(observation);
    return observation;
  }

  activity(projectId: ID, type: ActivityType, message: string, actor: string, createdAt: string): Activity {
    const a: Activity = { id: this.id('act'), projectId, type, message, actor, createdAt };
    this.db.activity.push(a);
    return a;
  }
}

const task = (briefVersion: number, goal: string, successCriteria: string[], confirmedAt: string, confirmedBy: string): TaskCard => ({
  briefVersion,
  goal,
  successCriteria,
  confirmedAt,
  confirmedBy,
});

// ---------------------------------------------------------------------------
// 1. Luma Social Spirits — research blocked
// ---------------------------------------------------------------------------

function seedLuma(b: SeedBuilder) {
  const P = 'luma';
  const owners = { research: 'Mina Castell', strategy: 'Theo Brandt' };
  b.project({
    id: P,
    name: 'Luma Social Spirits',
    client: 'Luma Drinks Co.',
    summary: 'Can packaging exploration for Luma’s sparkling spirit, for adults aged 25–34 who host at home.',
    revision: 14,
    createdAt: '2026-10-13T08:30:00Z',
    updatedAt: '2026-10-24T08:31:00Z',
    mode: 'supervised',
    owners,
    taskCard: task(
      2,
      'Three evidence-backed packaging routes that signal a shareable occasion to adults aged 25–34, responsibly.',
      ['Every route traces back to verified claims.', 'Strength legibility and responsible-drinking constraints are met.', 'Audience evidence is specific to adults aged 25–34.'],
      '2026-10-16T09:10:00Z',
      "演示用户",
    ),
    continuedToStrategyAt: null,
  });

  const common = {
    projectId: P,
    background:
      'Luma Drinks Co. (fictional) is preparing a sparkling spirit sold in 250 ml cans. The client calls the brand “light and easy-going”; the strength is not stated in the brief. The current can was designed for a single bar partner and reads poorly on a crowded chilled shelf. The client wants three evidence-backed packaging routes before committing to a redesign for next spring.',
    objectives: [
      'Identify packaging cues that signal a social, shareable occasion without implying excess consumption.',
      'Map how competitor cans communicate flavour and strength on a chilled shelf.',
      'Define evidence-backed territories for three packaging routes.',
    ],
    deliverables: ['Verified research summary', 'Packaging territories (strategy)', 'Three design routes with rationale'],
    brand: 'Luma sparkling spirit, 250 ml can (strength not stated)',
    deliverableType: 'Packaging proposal',
    timeline: 'Routes needed before the redesign decision for next spring.',
    researchQuestions: ['Which shelf cues read as “for sharing” to adults aged 25–34?', 'How do competitors signal flavour and strength?'],
  };
  b.brief({
    ...common,
    version: 1,
    audience: 'Adults of legal drinking age who buy drinks for gatherings at home.',
    constraints: ['Recyclable aluminium can; no plastic sleeves.', 'Alcohol strength must be legible at arm’s length on the shelf.'],
    confirmedAt: '2026-10-14T10:00:00Z',
    confirmedBy: "演示用户",
    createdAt: '2026-10-13T08:30:00Z',
    updatedAt: '2026-10-14T10:00:00Z',
    changeNote: null,
    supersededAt: '2026-10-16T09:00:00Z',
  });
  b.brief({
    ...common,
    version: 2,
    audience: 'Adults aged 25–34, of legal drinking age, who host or attend small gatherings at home and buy drinks in convenience and grocery stores.',
    constraints: [
      'No imagery or language that links alcohol with social or sexual success.',
      'Alcohol strength must be legible at arm’s length on the shelf.',
      'Recyclable aluminium can; no plastic sleeves.',
      'Audience claims must be specific to adults aged 25–34.',
    ],
    confirmedAt: '2026-10-16T09:10:00Z',
    confirmedBy: "演示用户",
    createdAt: '2026-10-16T09:00:00Z',
    updatedAt: '2026-10-16T09:10:00Z',
    changeNote: 'Narrowed the audience to adults aged 25–34 and added the responsible-drinking constraint after the client call.',
    supersededAt: null,
  });

  b.source(P, 'trade', {
    title: 'Ready-to-drink spirits move into the chiller',
    publisher: 'Harbourline Trade Review (fictional)',
    path: 'harbourline/chilled-bay',
    capturedAt: '2026-10-19T14:20:00Z',
    excerpt: 'Store managers interviewed for this piece said ready-to-drink spirit lines now have their own facings in the chilled bay, usually beside premium mixers rather than beer.',
    intendedUse: 'category',
    verificationStatus: 'unverified',
  });
  b.source(P, 'audit', {
    title: 'Shelf audit notes — Harbour Street convenience stores',
    publisher: 'Luma research team (sample field notes)',
    path: 'luma/shelf-audit',
    capturedAt: '2026-10-20T11:05:00Z',
    excerpt: 'Across the four stores visited, competitor cans with botanical or fruit illustration were the most common approach. Two stores gave ready-to-drink spirit lines a dedicated chilled-bay facing at eye level.',
    intendedUse: 'competitor',
    verificationStatus: 'unverified',
  });
  b.source(P, 'buyers', {
    title: 'Retail buyer interviews — round 1',
    publisher: 'Luma research team (sample interview notes)',
    path: 'luma/buyer-interviews-1',
    capturedAt: '2026-10-20T16:40:00Z',
    excerpt: 'Buyers repeatedly said shoppers “go for the flavour first” and that vague flavour names slow people down at the chiller door.',
    intendedUse: 'category',
    verificationStatus: 'unverified',
  });
  b.source(P, 'hosting', {
    title: 'Hosting at home — sample interview notes',
    publisher: 'Luma research team (sample interview notes)',
    path: 'luma/hosting-round-1',
    capturedAt: '2026-10-21T10:15:00Z',
    excerpt: 'Participants described buying drinks they could put straight in the fridge and hand out without mixing, so they could spend time with guests instead of behind the counter.',
    intendedUse: 'audience',
    verificationStatus: 'unverified',
  });
  b.source(P, 'panel', {
    title: 'Drinking occasions panel — summary report',
    publisher: 'Meridian Consumer Panels (fictional)',
    path: 'meridian/occasions-summary',
    capturedAt: '2026-10-21T15:00:00Z',
    excerpt: 'Among adults aged 21–44, multi-pack purchases were most often linked to planned gatherings at home. Results are not broken down into narrower age bands.',
    intendedUse: 'category',
    verificationStatus: 'unverified',
  });
  b.source(P, 'finishes', {
    title: 'Recyclable can finishes — supplier note',
    publisher: 'Coastal Can Supply (fictional)',
    path: 'coastal/finishes',
    capturedAt: '2026-10-21T17:30:00Z',
    excerpt: 'Matte and soft-touch varnishes are available on standard aluminium cans without affecting recyclability, at a longer lead time than gloss.',
    intendedUse: 'production',
    verificationStatus: 'unverified',
  });
  b.source(P, 'photolog', {
    title: 'Shelf photo log — matte and soft-touch finishes',
    publisher: 'Luma research team (sample field notes)',
    path: 'luma/photo-log',
    capturedAt: '2026-10-22T09:20:00Z',
    excerpt: 'Photo log entries 4 to 9 show competitor cans with matte, low-saturation labels, all positioned on the upper, premium shelf of the chilled bay.',
    intendedUse: 'competitor',
    verificationStatus: 'unverified',
  });
  b.source(P, 'call', {
    title: 'Supplier call — finish options',
    publisher: 'Coastal Can Supply (fictional)',
    path: 'coastal/call-notes',
    capturedAt: '2026-10-22T13:45:00Z',
    excerpt: 'Matte varnish is available.',
    intendedUse: 'production',
    verificationStatus: 'unverified',
  });

  const genJob = b.job({ projectId: P, purpose: 'research_generation', label: m('job.draftResearch'), target: { kind: 'project', id: P, label: 'Luma Social Spirits' }, at: '2026-10-22T09:58:00Z', seconds: 94 });
  const research = b.artifact({
    projectId: P,
    stage: 'research',
    lineageId: 'lin-luma-research',
    version: 1,
    title: 'Category, shelf and audience research',
    summary: 'Evidence base for Luma’s packaging routes. Category and competitor evidence is in place; audience evidence does not yet isolate adults aged 25–34, and one competitor observation has no citation.',
    createdAt: '2026-10-22T10:00:00Z',
    briefVersion: 2,
    jobId: genJob.id,
    coverage: [
      {
        topic: 'audience',
        minSupportedClaims: 2,
        guidance: 'Add a source that isolates adults aged 25–34, attach it to the sharing-pack claim, then run verification and readiness again.',
      },
      { topic: 'category', minSupportedClaims: 2, guidance: null },
      { topic: 'competitor', minSupportedClaims: 1, guidance: null },
    ],
    sections: [
      {
        heading: 'Summary',
        blocks: [
          ['This draft collects category, shelf and audience evidence to ground three packaging routes for Luma. It is written for the strategy owner and should be read with the verification and readiness reports beside it.'],
          { gap: 'Two issues block handoff: a competitor observation has no citation, and no cited source isolates adults aged 25–34.' },
        ],
      },
      {
        heading: 'Category context',
        blocks: [
          [
            'Store managers and buyers describe ready-to-drink spirits gaining a more deliberate place in the chiller. ',
            { claim: 'c1', topic: 'category', sources: ['trade', 'audit'], text: 'Ready-to-drink spirit lines have been given dedicated chilled-bay facings in the convenience stores reviewed.' },
            ' ',
            { claim: 'c2', topic: 'category', sources: ['buyers'], text: 'Retail buyers say shoppers look for the flavour first when choosing a can from the chiller.' },
            ' For packaging, this suggests the can has to work as a flavour signal first and a brand signal second.',
          ],
        ],
      },
      {
        heading: 'Shelf and competitor packaging',
        blocks: [
          [
            { claim: 'c4', topic: 'competitor', sources: ['audit'], text: 'Several competitor cans on the sampled shelves use botanical or fruit illustration to signal flavour.' },
            ' The shelves were crowded and grouped by brand rather than by flavour, so flavour cues did most of the work.',
          ],
          [
            { claim: 'c3', topic: 'competitor', sources: [], text: 'Competitors increasingly use matte, low-saturation labels to signal a premium position.', limitations: ['Observed informally during the shelf visit but not recorded in the audit notes.'] },
            ' If confirmed, this is a look Luma should avoid copying, since it would blend into the premium end of the bay.',
          ],
          { note: 'Shelf evidence comes from four stores on one street. Treat it as a snapshot, not a survey.' },
        ],
      },
      {
        heading: 'Audience: adults aged 25–34',
        blocks: [
          [
            { claim: 'c5', topic: 'audience', sources: ['hosting'], text: 'Hosting participants describe choosing drinks they can serve straight from the fridge without preparation.' },
            ' Several linked this to wanting to spend the evening with guests rather than mixing drinks.',
          ],
          [
            { claim: 'c6', topic: 'audience', sources: ['panel'], text: 'Multi-can sharing packs are a deciding factor for adults aged 25–34 when buying for a gathering.', limitations: ['The occasions panel reports adults aged 21–44 as one group and does not isolate 25–34.'] },
          ],
          { gap: 'No cited source isolates the 25–34 band yet. The occasions panel reports adults aged 21–44 as one group.' },
        ],
      },
      {
        heading: 'Implications for packaging (draft)',
        blocks: [
          {
            list: [
              'Lead with flavour: make the flavour name and colour the first read at arm’s length.',
              'Keep the strength statement large and plain. It is a constraint and a trust cue.',
              'Hold any sharing-pack route until audience evidence for 25–34 is verified.',
              'Avoid the matte, muted look until the competitor observation is cited and confirmed.',
            ],
          },
        ],
      },
    ],
  });
  genJob.output = { kind: 'artifact', id: research.id };

  const vJob = b.job({ projectId: P, purpose: 'evidence_verification', label: m('job.verify', { target: m('doc.research', { v: 1 }) }), target: { kind: 'artifact', id: research.id, label: m('doc.research', { v: 1 }) }, at: '2026-10-23T09:10:00Z', seconds: 41 });
  const v = b.verify(research, '2026-10-23T09:11:00Z', vJob.id);
  vJob.output = { kind: 'review', id: v.id };
  const rJob = b.job({ projectId: P, purpose: 'readiness_review', label: m('job.readiness', { target: m('doc.research', { v: 1 }) }), target: { kind: 'artifact', id: research.id, label: m('doc.research', { v: 1 }) }, at: '2026-10-23T09:38:00Z', seconds: 33 });
  const r = b.readiness(research, '2026-10-23T09:39:00Z', rJob.id);
  rJob.output = { kind: 'review', id: r.id };

  // Added after the last verification, so it is still unverified.
  b.source(P, 'round2', {
    title: 'Hosting interviews — round 2, adults aged 25–34',
    publisher: 'Luma research team (sample interview notes)',
    path: 'luma/hosting-round-2',
    capturedAt: '2026-10-24T08:30:00Z',
    excerpt: 'All round-two participants were aged 25 to 34. Most said they buy multi-can packs when hosting, because one pack covers the evening and saves a second trip to the shop.',
    intendedUse: 'audience',
    verificationStatus: 'unverified',
    addedBy: 'Mina Castell',
  });

  // Images
  const shelf = b.image({ id: 'img-luma-shelf', projectId: P, name: 'Harbour St chilled bay', previewUrl: placeholderImage('shelf', ['#d9604c', '#e8b43c', '#4f8a74', '#6a5a86'], 'Harbour St chilled bay'), sourceNote: 'Shelf visit, store 2 of 4. Taken with the store manager’s permission.', uploadedAt: '2026-10-20T11:20:00Z', observationStatus: 'observed' });
  const lineup = b.image({ id: 'img-luma-lineup', projectId: P, name: 'Competitor can line-up', previewUrl: placeholderImage('lineup', ['#3f6c8f', '#c97b5a', '#85a35b', '#b7a3c9'], 'Competitor can line-up'), sourceNote: 'Bought at Harbour St stores for desk review.', uploadedAt: '2026-10-20T15:02:00Z', observationStatus: 'observed' });
  const bar = b.image({ id: 'img-luma-bar', projectId: P, name: 'Bar-back display', previewUrl: placeholderImage('bar', ['#c7a14a', '#8e3b46', '#4a7a8c', '#d8d2c4'], 'Bar-back display'), sourceNote: 'Current bar partner display, supplied by the client.', uploadedAt: '2026-10-23T10:10:00Z', observationStatus: 'pending' });
  const tent = b.image({ id: 'img-luma-tent', projectId: P, name: 'Festival bar tent', previewUrl: placeholderImage('festival', ['#e07a5f', '#3d405b', '#81b29a', '#f2cc8f'], 'Festival bar tent'), sourceNote: 'Client archive, summer event. Usage rights to be confirmed.', uploadedAt: '2026-10-24T07:50:00Z', observationStatus: 'failed' });

  b.db.imageMeta[tent.id] = { dominantColors: ['#e07a5f', '#3d405b', '#81b29a', '#f2cc8f'] };
  b.db.imageMeta[bar.id] = { dominantColors: ['#2c2a33', '#c7a14a', '#8e3b46', '#4a7a8c'] };

  const o1 = b.job({ projectId: P, purpose: 'image_observation', label: m('job.observe', { name: 'Harbour St chilled bay' }), target: { kind: 'image', id: shelf.id, label: shelf.name }, at: '2026-10-20T11:21:00Z', seconds: 12 });
  const ob1 = b.observation({
    imageId: shelf.id,
    visibleFeatures: ['Three shelves, each holding a row of slim cans.', 'Four can colours repeat across the shelves in a fixed order.', 'Every can has a pale label band across its middle.'],
    transcribedText: ['Caption strip: “Placeholder illustration · Harbour St chilled bay”'],
    uncertainties: ['The cans carry no legible brand marks, so brands cannot be identified.', 'Shelf depth and lighting cannot be judged from a flat illustration.'],
    reviewStatus: 'confirmed',
    reviewNote: 'Matches the visit notes.',
    reviewedAt: '2026-10-20T16:00:00Z',
    createdAt: '2026-10-20T11:21:14Z',
    jobId: o1.id,
  });
  o1.output = { kind: 'observation', id: ob1.id };
  const o2 = b.job({ projectId: P, purpose: 'image_observation', label: m('job.observe', { name: 'Competitor can line-up' }), target: { kind: 'image', id: lineup.id, label: lineup.name }, at: '2026-10-20T15:03:00Z', seconds: 10 });
  const ob2 = b.observation({
    imageId: lineup.id,
    visibleFeatures: ['Six cans standing in a row on a pale surface.', 'Can colours: blue, terracotta, green and lilac, with two repeated.', 'Each can has a white label band in the middle third.'],
    transcribedText: ['Caption strip: “Placeholder illustration · Competitor can line-up”'],
    uncertainties: ['Label artwork is not visible, so botanical illustration cannot be confirmed from this image.', 'Finish (gloss or matte) cannot be determined.'],
    reviewStatus: 'unreviewed',
    reviewNote: null,
    reviewedAt: null,
    createdAt: '2026-10-20T15:03:12Z',
    jobId: o2.id,
  });
  o2.output = { kind: 'observation', id: ob2.id };
  b.job({
    projectId: P,
    purpose: 'image_observation',
    label: m('job.observe', { name: 'Bar-back display' }),
    target: { kind: 'image', id: bar.id, label: bar.name },
    at: '2026-10-23T10:11:00Z',
    seconds: 14,
    status: 'awaiting_reconciliation',
    savedRef: 'saved_obs_7f3a91',
    sim: {
      queueMs: 0,
      runMs: 0,
      outcome: 'lost',
      savedObservation: {
        visibleFeatures: ['Two shelves of bottles against a dark back wall.', 'Bottle colours alternate between gold, deep red, teal and pale stone.', 'Each bottle has a pale square label at mid-height.'],
        transcribedText: ['Caption strip: “Placeholder illustration · Bar-back display”'],
        uncertainties: ['The Luma can does not appear in this display; it may sit below the frame.', 'Lighting makes the darker bottle colours hard to distinguish.'],
      },
    },
  });
  b.job({
    projectId: P,
    purpose: 'image_observation',
    label: m('job.observe', { name: 'Festival bar tent' }),
    target: { kind: 'image', id: tent.id, label: tent.name },
    at: '2026-10-24T07:51:00Z',
    seconds: 30,
    status: 'failed',
    error: {
      code: 'PROVIDER_TIMEOUT',
      message: 'The observation provider did not respond within 30 seconds.',
      detail: 'Simulated timeout from the provider. The input image is valid, so the same request can be retried.',
      retryable: true,
    },
  });

  b.db.strategyTemplates[P] = {
    title: 'Packaging territories — Luma',
    positioning: 'Luma is the can you open when people arrive: bright, easy to share, and plain about what is inside.',
    territories: [
      { name: 'Open house', description: 'Packaging that reads as an invitation to a relaxed evening at home, never as a promise about the night.' },
      { name: 'Flavour first', description: 'Flavour name and colour lead the can, with brand as a secondary signature.' },
      { name: 'Clear strength', description: 'Make the strength statement a confident design element rather than small print.' },
    ],
    openQuestions: ['Should a sharing-pack format lead, given the audience evidence?', 'How far can colour go before it reads as a soft drink?'],
  };

  const act = (type: ActivityType, message: string, actor: string, at: string) => b.activity(P, type, message, actor, at);
  act('project', 'Created the project.', "演示用户", '2026-10-13T08:30:00Z');
  act('brief', 'Confirmed brief v1.', "演示用户", '2026-10-14T10:00:00Z');
  act('brief', 'Saved brief v2: narrowed the audience to adults aged 25–34.', "演示用户", '2026-10-16T09:00:00Z');
  act('brief', 'Confirmed brief v2 and the task card.', "演示用户", '2026-10-16T09:10:00Z');
  act('image', 'Uploaded 2 shelf images.', 'Mina Castell', '2026-10-20T15:02:00Z');
  act('research', 'Simulated research report v1 was produced.', 'Simulator', '2026-10-22T10:00:00Z');
  act('review', 'Evidence verification failed: 1 claim has no citation and 1 is only partly supported.', 'Simulated evidence verifier', '2026-10-23T09:11:00Z');
  act('review', 'Readiness review failed: audience coverage below the agreed minimum.', 'Simulated readiness reviewer', '2026-10-23T09:39:00Z');
  act('job', 'Observation for “Bar-back display” finished at the provider but the result was not recorded.', 'Simulator', '2026-10-23T10:11:16Z');
  act('job', 'Observation for “Festival bar tent” failed: provider timeout.', 'Simulator', '2026-10-24T07:51:32Z');
  act('source', 'Added source “Hosting interviews — round 2, adults aged 25–34”.', 'Mina Castell', '2026-10-24T08:30:00Z');
}

// ---------------------------------------------------------------------------
// 2. Northline Outdoor — eligible to continue
// ---------------------------------------------------------------------------

function seedNorthline(b: SeedBuilder) {
  const P = 'northline';
  const owners = { research: 'Sam Okafor', strategy: 'Lena Hart' };
  b.project({
    id: P,
    name: "北线户外",
    client: 'Northline Outdoor Co.',
    summary: 'Seasonal campaign for autumn–winter layering, testing an earlier shoulder-season launch.',
    revision: 22,
    createdAt: '2026-10-12T09:00:00Z',
    updatedAt: '2026-10-22T11:30:00Z',
    mode: 'step_by_step',
    owners,
    taskCard: task(
      1,
      'Recommend a campaign window and territory for Northline’s autumn–winter launch, grounded in when walkers start preparing for the cold.',
      ['Campaign window backed by verified seasonal evidence.', 'Territories avoid technical claims beyond tested specifications.', 'Imagery direction uses realistic, accessible routes.'],
      '2026-10-13T15:00:00Z',
      "演示用户",
    ),
    continuedToStrategyAt: null,
  });
  b.brief({
    projectId: P,
    version: 1,
    background:
      'Northline Outdoor (fictional) sells layering kit for walkers. Its autumn–winter campaign has usually launched in November, after the first cold snap. The client wants to test whether an earlier, shoulder-season campaign would better match when people start planning cold-weather walks.',
    audience: "全年都有周末步行习惯，但通常在经历寒冷不适后才考虑添购叠穿单品的人群。",
    objectives: [
      'Establish when walkers start preparing for colder weather.',
      'Understand what makes a layer feel worth buying before it is needed.',
      'Recommend a campaign window and territory for the autumn–winter launch.',
    ],
    deliverables: ['Verified seasonal research', 'Campaign strategy with territories', 'Creative brief'],
    constraints: [
      "发布必须配合既有零售伙伴排期。",
      "性能宣称不得超过已测试的范围。",
      "图像应呈现真实可抵达的路线，不使用远征场景。",
    ],
    brand: "北线户外秋冬叠穿系列",
    deliverableType: 'Seasonal campaign proposal',
    timeline: 'Campaign window to be set before the retail partner calendar closes.',
    openQuestions: ["今年哪些零售伙伴档期已经确认？"],
    confirmedAt: '2026-10-13T15:00:00Z',
    confirmedBy: "演示用户",
    createdAt: '2026-10-12T09:00:00Z',
    updatedAt: '2026-10-13T15:00:00Z',
    changeNote: null,
    supersededAt: null,
  });

  b.source(P, 'walkers', {
    title: "周末步行访谈（模拟笔记）",
    publisher: 'Northline insight team (sample interview notes)',
    path: 'northline/walker-interviews',
    capturedAt: '2026-10-14T13:00:00Z',
    excerpt: "Participants said the first properly cold weekend was when they dig out their kit and notice what is missing. Several described buying a layer only once they could picture a specific walk where it would have helped.",
    intendedUse: 'audience',
    verificationStatus: 'unverified',
  });
  b.source(P, 'survey', {
    title: "秋季户外零售渠道观察（演示）",
    publisher: 'Fellside Retail Journal (fictional)',
    path: 'fellside/autumn-survey',
    capturedAt: '2026-10-14T16:30:00Z',
    excerpt: "Retailers responding to the survey said customer questions about layering systems pick up in early autumn, typically several weeks before winter ranges are fully on the shop floor.",
    intendedUse: 'category',
    verificationStatus: 'unverified',
  });
  b.source(P, 'staff', {
    title: "叠穿主题店员交流（模拟）",
    publisher: 'Northline insight team (sample field notes)',
    path: 'northline/staff-notes',
    capturedAt: '2026-10-15T10:10:00Z',
    excerpt: "Staff described customers getting lost in fabric names and asking instead what to wear for a two-hour walk in the cold.",
    intendedUse: 'category',
    verificationStatus: 'unverified',
  });
  b.source(P, 'clubs', {
    title: "步行俱乐部秋季通讯（虚构）",
    publisher: 'Ridgeway Walkers’ Digest (fictional)',
    path: 'ridgeway/autumn-issues',
    capturedAt: '2026-10-15T14:45:00Z',
    excerpt: "Autumn issues focus on shorter social walks, early sunsets and pub stops, presenting the season as a time to keep walking together rather than to stop.",
    intendedUse: 'cultural',
    verificationStatus: 'unverified',
  });
  b.source(P, 'windows', {
    title: "十月初橱窗观察（演示）",
    publisher: 'Northline insight team (sample field notes)',
    path: 'northline/window-survey',
    capturedAt: '2026-10-16T09:30:00Z',
    excerpt: "Both stores visited in the first week of October still dressed their windows with summer ranges and lightweight shells.",
    intendedUse: 'category',
    verificationStatus: 'unverified',
  });
  b.source(P, 'fabric', {
    title: "中间层面料测试摘要（演示）",
    publisher: 'Northline product team (sample internal document)',
    path: 'northline/fabric-tests',
    capturedAt: '2026-10-16T11:00:00Z',
    excerpt: "The mid-layer fleece passed internal warmth and breathability tests at the specified weight. No waterproofing claims are supported by these tests.",
    intendedUse: 'production',
    verificationStatus: 'unverified',
  });

  const genJob = b.job({ projectId: P, purpose: 'research_generation', label: m('job.draftResearch'), target: { kind: 'project', id: P, label: "北线户外" }, at: '2026-10-17T08:55:00Z', seconds: 110 });
  const research = b.artifact({
    projectId: P,
    stage: 'research',
    lineageId: 'lin-northline-research',
    version: 1,
    title: "秋冬季节传播调研演示",
    summary: 'Evidence on when walkers start preparing for colder weather and what makes a layer feel worth buying early.',
    createdAt: '2026-10-17T09:00:00Z',
    briefVersion: 1,
    jobId: genJob.id,
    coverage: [
      { topic: 'audience', minSupportedClaims: 2, guidance: null },
      { topic: 'category', minSupportedClaims: 2, guidance: null },
      { topic: 'cultural', minSupportedClaims: 1, guidance: null },
    ],
    sections: [
      {
        heading: 'Summary',
        blocks: [
          ['The evidence points to an earlier campaign window. Walkers in the sample start thinking about colder conditions on the first noticeably cold weekend, not when winter officially begins, and they respond to practical, route-led content more than to technical specifications.'],
        ],
      },
      {
        heading: 'When preparation starts',
        blocks: [
          [
            { claim: 'c1', topic: 'audience', sources: ['walkers'], text: 'Walkers in the sample interviews start preparing for colder conditions after the first cold weekend of the season, rather than at a fixed date.' },
            ' ',
            { claim: 'c2', topic: 'category', sources: ['survey'], text: 'Outdoor retailers in the trade survey report that layering questions rise in early autumn, ahead of the main winter range.' },
          ],
          ['Together these suggest the campaign should be live before the first cold weekend, so it meets walkers while they are checking their kit.'],
        ],
      },
      {
        heading: 'What makes a layer worth buying',
        blocks: [
          [{ claim: 'c3', topic: 'audience', sources: ['walkers'], text: 'Participants were more willing to buy a layer early when they could picture a specific route where it would make a difference.' }],
          [
            { claim: 'c4', topic: 'category', sources: ['staff'], text: 'Store staff say shoppers find layering systems confusing when products are grouped by fabric technology rather than by use.' },
            ' ',
            { claim: 'c5', topic: 'cultural', sources: ['clubs'], text: 'Walking club newsletters in the sample frame autumn as a season for shorter, social walks rather than long expeditions.' },
          ],
        ],
      },
      {
        heading: 'Channel observations',
        blocks: [
          [{ claim: 'c6', topic: 'category', sources: ['windows'], text: 'Store windows reviewed in early October still showed summer ranges, leaving the shoulder season largely unaddressed.' }],
          { note: 'Window observations come from two stores in one city.' },
        ],
      },
      {
        heading: 'Constraints carried forward',
        blocks: [{ list: ['Technical claims stay within tested specifications.', 'Routes shown should be accessible, low-level walks.', 'Retail partner window dates still need confirmation.'] }],
      },
    ],
  });
  genJob.output = { kind: 'artifact', id: research.id };

  const vJob = b.job({ projectId: P, purpose: 'evidence_verification', label: m('job.verify', { target: m('doc.research', { v: 1 }) }), target: { kind: 'artifact', id: research.id, label: m('doc.research', { v: 1 }) }, at: '2026-10-19T10:00:00Z', seconds: 38 });
  const v = b.verify(research, '2026-10-19T10:01:00Z', vJob.id);
  vJob.output = { kind: 'review', id: v.id };

  const failed = b.job({
    projectId: P,
    purpose: 'readiness_review',
    label: m('job.readiness', { target: m('doc.research', { v: 1 }) }),
    target: { kind: 'artifact', id: research.id, label: m('doc.research', { v: 1 }) },
    at: '2026-10-20T09:00:00Z',
    seconds: 30,
    status: 'failed',
    error: {
      code: 'PROVIDER_TIMEOUT',
      message: "模拟评审服务未在30秒内响应。",
      detail: "模拟超时：输入有效，已在第2次尝试中重试。",
      retryable: true,
    },
  });
  const rJob = b.job({ projectId: P, purpose: 'readiness_review', label: m('job.readiness', { target: m('doc.research', { v: 1 }) }), target: { kind: 'artifact', id: research.id, label: m('doc.research', { v: 1 }) }, at: '2026-10-20T09:05:00Z', seconds: 29, attempt: 2, retryOf: failed.id });
  const r = b.readiness(research, '2026-10-20T09:06:00Z', rJob.id);
  rJob.output = { kind: 'review', id: r.id };

  const shared = {
    permittedUses: [
      'Use the six supported claims to set the campaign window and frame territories.',
      'Quote interview themes as qualitative direction, attributed to the sample.',
    ],
    prohibitedInferences: [
      'Do not present interview themes as representative of all Northline customers.',
      'Do not infer sales uplift or market size from the trade survey.',
      'Do not make technical performance claims beyond the fabric test summary.',
    ],
    unresolvedIssues: ['Audience evidence relies on a single interview round.', 'Retail partner window dates are not yet confirmed.'],
  };
  b.handoff({ projectId: P, artifactId: research.id, artifactVersion: 1, side: 'research_owner', owner: owners.research, decision: 'delivered', ...shared, note: 'Ready for strategy. Audience evidence is qualitative and from one round.', createdAt: '2026-10-21T10:20:00Z', recordedBy: 'Sam Okafor' });
  b.handoff({ projectId: P, artifactId: research.id, artifactVersion: 1, side: 'strategy_owner', owner: owners.strategy, decision: 'accepted', ...shared, note: 'Accepted. Audience claims stay directional in the strategy.', createdAt: '2026-10-22T09:05:00Z', recordedBy: 'Lena Hart' });
  research.release = { releasedAt: '2026-10-22T11:30:00Z', releasedBy: 'Lena Hart' };

  const trail = b.image({ id: 'img-northline-trail', projectId: P, name: "十月初的山脊路线", previewUrl: placeholderImage('trail', ['#7d8f6a', '#56664a', '#c9a66b', '#e8c26a'], "十月初的山脊路线"), sourceNote: "演示选景参考，归入北线户外品牌资料。", uploadedAt: '2026-10-15T08:40:00Z', observationStatus: 'observed' });
  const window = b.image({ id: 'img-northline-window', projectId: P, name: "十月初的门店橱窗", previewUrl: placeholderImage('window', ['#4f7c8a', '#c46b4f', '#d9b65c', '#5b5550'], "十月初的门店橱窗"), sourceNote: "演示橱窗观察，门店甲。", uploadedAt: '2026-10-16T09:35:00Z', observationStatus: 'observed' });
  const j1 = b.job({ projectId: P, purpose: 'image_observation', label: m('job.observe', { name: "十月初的山脊路线" }), target: { kind: 'image', id: trail.id, label: trail.name }, at: '2026-10-15T08:41:00Z', seconds: 11 });
  const ob1 = b.observation({
    imageId: trail.id,
    visibleFeatures: ['Layered hills in two shades of green under a pale sky.', 'A winding path climbs from the foreground towards a ridge.', 'A low sun sits in the upper right.'],
    transcribedText: ['Caption strip: “Placeholder illustration · Ridge trail, early October”'],
    uncertainties: ['Season and temperature cannot be read from the image itself.'],
    reviewStatus: 'confirmed',
    reviewNote: null,
    reviewedAt: '2026-10-15T12:00:00Z',
    createdAt: '2026-10-15T08:41:13Z',
    jobId: j1.id,
  });
  j1.output = { kind: 'observation', id: ob1.id };
  const j2 = b.job({ projectId: P, purpose: 'image_observation', label: m('job.observe', { name: "十月初的门店橱窗" }), target: { kind: 'image', id: window.id, label: window.name }, at: '2026-10-16T09:36:00Z', seconds: 9 });
  const ob2 = b.observation({
    imageId: window.id,
    visibleFeatures: ['A shop window framing three jacket shapes in blue, rust and mustard.', 'A dark band runs along the base of the window.'],
    transcribedText: ['Caption strip: “Placeholder illustration · Store window, early October”'],
    uncertainties: ['Garment weight (summer shell or winter layer) cannot be determined from shape alone.'],
    reviewStatus: 'confirmed',
    reviewNote: 'Matches the window survey notes.',
    reviewedAt: '2026-10-16T14:00:00Z',
    createdAt: '2026-10-16T09:36:11Z',
    jobId: j2.id,
  });
  j2.output = { kind: 'observation', id: ob2.id };

  b.db.strategyTemplates[P] = {
    title: 'Campaign strategy — First cold weekend',
    positioning: 'Northline is the layer you reach for when the season turns: kit that makes the first cold weekend feel like an invitation to go out.',
    territories: [
      { name: 'First cold weekend', description: 'Time the launch to meet walkers as they check their kit, before the first cold snap.' },
      { name: 'Layer by route', description: 'Explain layering through specific, accessible walks instead of fabric names.' },
      { name: 'Keep walking together', description: 'Borrow the clubs’ framing of autumn as a social season of shorter walks.' },
    ],
    openQuestions: ['Retail partner window dates are not yet confirmed.', 'Which territory should lead in store and which on social?'],
  };

  const act = (type: ActivityType, message: string, actor: string, at: string) => b.activity(P, type, message, actor, at);
  act('project', 'Created the project.', "演示用户", '2026-10-12T09:00:00Z');
  act('brief', 'Confirmed brief v1 and the task card.', "演示用户", '2026-10-13T15:00:00Z');
  act('research', 'Simulated research report v1 was produced.', 'Simulator', '2026-10-17T09:00:00Z');
  act('review', 'Evidence verification passed.', 'Simulated evidence verifier', '2026-10-19T10:01:00Z');
  act('job', 'Readiness review attempt 1 failed: provider timeout. Retried as attempt 2.', 'Simulator', '2026-10-20T09:00:32Z');
  act('review', 'Readiness review passed.', 'Simulated readiness reviewer', '2026-10-20T09:06:00Z');
  act('handoff', 'Sam Okafor delivered research v1 to strategy.', 'Sam Okafor', '2026-10-21T10:20:00Z');
  act('handoff', 'Lena Hart accepted research v1.', 'Lena Hart', '2026-10-22T09:05:00Z');
  act('release', 'Released research v1 for strategy work.', 'Lena Hart', '2026-10-22T11:30:00Z');
}

// ---------------------------------------------------------------------------
// 3. Morrow Home — strategy complete, research history
// ---------------------------------------------------------------------------

function seedMorrow(b: SeedBuilder) {
  const P = 'morrow';
  const owners = { research: 'Ines Varga', strategy: 'Jon Achebe' };
  b.project({
    id: P,
    name: 'Morrow Home',
    client: 'Morrow Home',
    summary: 'Positioning proposal connecting durability with adaptability for first long-term homes and renters.',
    revision: 41,
    createdAt: '2026-08-25T09:00:00Z',
    updatedAt: '2026-10-09T16:20:00Z',
    mode: 'supervised',
    owners,
    taskCard: task(
      2,
      'A positioning that keeps Morrow’s durability story while feeling adaptable and personal, including for renters.',
      ['Positioning links durability and adaptability.', 'Proof points are ones the brand can stand behind today.', 'Tone direction is ready for the campaign brief.'],
      '2026-09-19T10:00:00Z',
      "演示用户",
    ),
    continuedToStrategyAt: '2026-10-03T10:00:00Z',
  });
  const base = {
    projectId: P,
    background:
      'Morrow Home (fictional) sells modular furniture and soft furnishings online and through two showrooms. The brand is known for durability but reads as formal next to newer competitors. The client wants a positioning that keeps the durability story while feeling more adaptable and personal.',
    objectives: ['Define a positioning that connects durability with adaptability.', 'Identify proof points the brand can stand behind today.', 'Set the tone for the next brand campaign.'],
    deliverables: ['Verified research', 'Positioning strategy', 'Campaign tone guide'],
    constraints: [
      'Durability claims must reference the existing warranty terms only.',
      'No sustainability claims beyond published material sourcing.',
      'Keep the existing logo and colour palette.',
    ],
    brand: 'Morrow Home modular furniture',
    deliverableType: 'Brand positioning proposal',
  };
  b.brief({ ...base, version: 1, audience: 'People furnishing their first long-term home.', confirmedAt: '2026-08-26T11:00:00Z', confirmedBy: "演示用户", createdAt: '2026-08-25T09:00:00Z', updatedAt: '2026-08-26T11:00:00Z', changeNote: null, supersededAt: '2026-09-18T14:00:00Z' });
  b.brief({
    ...base,
    version: 2,
    audience: 'People furnishing their first long-term home, including renters who expect to move within a few years and want pieces that move with them.',
    confirmedAt: '2026-09-19T10:00:00Z',
    confirmedBy: "演示用户",
    createdAt: '2026-09-18T14:00:00Z',
    updatedAt: '2026-09-19T10:00:00Z',
    changeNote: 'Added renters as a primary audience after the client workshop.',
    supersededAt: null,
  });

  b.source(P, 'firsthome', { title: 'First-home interviews — sample notes', publisher: 'Morrow insight team (sample interview notes)', path: 'morrow/first-home', capturedAt: '2026-08-29T10:00:00Z', excerpt: 'Participants talked about wanting pieces they would keep for many years, and several said they would rather wait and buy once than replace cheaper items.', intendedUse: 'audience', verificationStatus: 'unverified' });
  b.source(P, 'competitors', { title: 'Competitor imagery review', publisher: 'Morrow insight team (sample desk review)', path: 'morrow/competitor-imagery', capturedAt: '2026-09-04T15:00:00Z', excerpt: 'Most of the competitor product pages reviewed show furniture in informal, lived-in rooms with visible personal objects, rather than in empty studio settings.', intendedUse: 'competitor', verificationStatus: 'unverified' });
  b.source(P, 'showroom', { title: 'Showroom visit notes', publisher: 'Morrow insight team (sample field notes)', path: 'morrow/showroom-notes', capturedAt: '2026-09-05T12:30:00Z', excerpt: 'Visitors at both showrooms asked how pieces could be reconfigured when they move more often than they asked about materials.', intendedUse: 'category', verificationStatus: 'unverified' });

  // v1: missing citation, failed verification (job succeeded, artifact blocked)
  const g1 = b.job({ projectId: P, purpose: 'research_generation', label: m('job.draftResearch'), target: { kind: 'project', id: P, label: 'Morrow Home' }, at: '2026-09-02T09:00:00Z', seconds: 102 });
  const v1 = b.artifact({
    projectId: P, stage: 'research', lineageId: 'lin-morrow-research', version: 1, title: 'Home life and furniture research', briefVersion: 1, jobId: g1.id,
    summary: 'First draft: what first-home buyers want from durable furniture and how competitors present it.',
    createdAt: '2026-09-02T09:02:00Z',
    coverage: [{ topic: 'audience', minSupportedClaims: 1, guidance: null }, { topic: 'competitor', minSupportedClaims: 1, guidance: null }],
    sections: [
      { heading: 'Summary', blocks: [['First-home buyers in the sample value longevity, while competitors present furniture as part of informal, lived-in rooms.']] },
      { heading: 'Audience', blocks: [[{ claim: 'c1', topic: 'audience', sources: ['firsthome'], text: 'First-home buyers in the sample would rather buy once and keep a piece for many years than replace cheaper items.' }]] },
      { heading: 'Competitors', blocks: [[{ claim: 'c2', topic: 'competitor', sources: [], text: 'Newer competitors present furniture in lived-in, informal settings.' }]] },
    ],
  });
  g1.output = { kind: 'artifact', id: v1.id };
  const vj1 = b.job({ projectId: P, purpose: 'evidence_verification', label: m('job.verify', { target: m('doc.research', { v: 1 }) }), target: { kind: 'artifact', id: v1.id, label: m('doc.research', { v: 1 }) }, at: '2026-09-03T10:00:00Z', seconds: 35 });
  const rv1 = b.verify(v1, '2026-09-03T10:01:00Z', vj1.id);
  vj1.output = { kind: 'review', id: rv1.id };
  v1.status = 'blocked';
  v1.isCurrent = false;
  v1.supersededAt = '2026-09-10T09:02:00Z';

  // v2: citation fixed, passed; later made stale by the brief change.
  const g2 = b.job({ projectId: P, purpose: 'research_generation', label: m('job.regenerate'), target: { kind: 'artifact', id: v1.id, label: m('doc.research', { v: 1 }) }, at: '2026-09-10T09:00:00Z', seconds: 96 });
  const v2 = b.artifact({
    projectId: P, stage: 'research', lineageId: 'lin-morrow-research', version: 2, title: 'Home life and furniture research', briefVersion: 1, jobId: g2.id,
    summary: 'Second draft with the competitor claim cited.',
    createdAt: '2026-09-10T09:02:00Z',
    coverage: [{ topic: 'audience', minSupportedClaims: 1, guidance: null }, { topic: 'competitor', minSupportedClaims: 1, guidance: null }],
    sections: [
      { heading: 'Summary', blocks: [['First-home buyers in the sample value longevity, while competitors present furniture as part of informal, lived-in rooms.']] },
      { heading: 'Audience', blocks: [[{ claim: 'c1', topic: 'audience', sources: ['firsthome'], text: 'First-home buyers in the sample would rather buy once and keep a piece for many years than replace cheaper items.' }]] },
      { heading: 'Competitors', blocks: [[{ claim: 'c2', topic: 'competitor', sources: ['competitors'], text: 'Newer competitors present furniture in lived-in, informal settings rather than empty studio sets.' }]] },
      { heading: 'Showrooms', blocks: [[{ claim: 'c3', topic: 'category', sources: ['showroom'], text: 'Showroom visitors ask how pieces reconfigure for a move more often than they ask about materials.' }]] },
    ],
  });
  g2.output = { kind: 'artifact', id: v2.id };
  const vj2 = b.job({ projectId: P, purpose: 'evidence_verification', label: m('job.verify', { target: m('doc.research', { v: 2 }) }), target: { kind: 'artifact', id: v2.id, label: m('doc.research', { v: 2 }) }, at: '2026-09-11T10:00:00Z', seconds: 33 });
  const rv2 = b.verify(v2, '2026-09-11T10:01:00Z', vj2.id);
  vj2.output = { kind: 'review', id: rv2.id };
  v2.status = 'stale';
  v2.staleReason = m('o.staleBrief.research', { from: 1, to: 2 });
  v2.isCurrent = false;
  v2.supersededAt = '2026-09-22T09:02:00Z';

  b.source(P, 'renters', { title: 'Renter interviews — sample notes', publisher: 'Morrow insight team (sample interview notes)', path: 'morrow/renters', capturedAt: '2026-09-20T11:00:00Z', excerpt: 'Renters described modular pieces as the only furniture they trust to survive a move, and said they avoid anything that needs two people and tools to take apart.', intendedUse: 'audience', verificationStatus: 'unverified' });
  b.source(P, 'merch', { title: 'Online furniture merchandising roundup', publisher: 'Hearthline Interiors Quarterly (fictional)', path: 'hearthline/merchandising', capturedAt: '2026-09-20T16:00:00Z', excerpt: 'Several online furniture retailers now let shoppers browse modular ranges by room layout first, with individual pieces shown as parts of a configuration.', intendedUse: 'category', verificationStatus: 'unverified' });
  b.source(P, 'warranty', { title: 'Warranty terms summary', publisher: 'Morrow Home (sample client document)', path: 'morrow/warranty', capturedAt: '2026-09-21T09:00:00Z', excerpt: 'Frames carry a fifteen-year warranty; fabrics and cushions carry a three-year warranty. Terms apply to purchases from Morrow stores and the website.', intendedUse: 'production', verificationStatus: 'unverified' });

  // v3: current, released
  const g3 = b.job({ projectId: P, purpose: 'research_generation', label: m('job.regenerateFor', { v: 2 }), target: { kind: 'artifact', id: v2.id, label: m('doc.research', { v: 2 }) }, at: '2026-09-22T09:00:00Z', seconds: 118 });
  const v3 = b.artifact({
    projectId: P, stage: 'research', lineageId: 'lin-morrow-research', version: 3, title: 'Home life and furniture research', briefVersion: 2, jobId: g3.id,
    summary: 'Current research for brief v2, adding renters. Evidence supports adaptability as a credible partner to durability.',
    createdAt: '2026-09-22T09:02:00Z',
    coverage: [{ topic: 'audience', minSupportedClaims: 2, guidance: null }, { topic: 'category', minSupportedClaims: 1, guidance: null }, { topic: 'competitor', minSupportedClaims: 1, guidance: null }],
    sections: [
      { heading: 'Summary', blocks: [['Both audiences want furniture that lasts, and renters add a clear need for pieces that survive a move. Competitors already show furniture in lived-in rooms; Morrow’s opportunity is to make adaptability the visible proof of durability.']] },
      {
        heading: 'First long-term homes',
        blocks: [[{ claim: 'c1', topic: 'audience', sources: ['firsthome'], text: 'First-home buyers in the sample would rather buy once and keep a piece for many years than replace cheaper items.' }]],
      },
      {
        heading: 'Renters',
        blocks: [
          [{ claim: 'c4', topic: 'audience', sources: ['renters'], text: 'Renters in the sample choose furniture they can take apart and move without specialist help.' }, ' This makes modularity a practical requirement for them, not a style preference.'],
        ],
      },
      {
        heading: 'Category and competitors',
        blocks: [
          [{ claim: 'c2', topic: 'competitor', sources: ['competitors'], text: 'Newer competitors present furniture in lived-in, informal settings rather than empty studio sets.' }],
          [{ claim: 'c5', topic: 'category', sources: ['merch'], text: 'Online retailers increasingly let shoppers browse modular ranges by room layout first.' }, ' ', { claim: 'c3', topic: 'category', sources: ['showroom'], text: 'Showroom visitors ask how pieces reconfigure for a move more often than they ask about materials.' }],
        ],
      },
    ],
  });
  g3.output = { kind: 'artifact', id: v3.id };
  const vj3 = b.job({ projectId: P, purpose: 'evidence_verification', label: m('job.verify', { target: m('doc.research', { v: 3 }) }), target: { kind: 'artifact', id: v3.id, label: m('doc.research', { v: 3 }) }, at: '2026-09-24T10:00:00Z', seconds: 40 });
  const rv3 = b.verify(v3, '2026-09-24T10:01:00Z', vj3.id);
  vj3.output = { kind: 'review', id: rv3.id };
  const rj3 = b.job({ projectId: P, purpose: 'readiness_review', label: m('job.readiness', { target: m('doc.research', { v: 3 }) }), target: { kind: 'artifact', id: v3.id, label: m('doc.research', { v: 3 }) }, at: '2026-09-25T09:00:00Z', seconds: 31 });
  const rr3 = b.readiness(v3, '2026-09-25T09:01:00Z', rj3.id);
  rj3.output = { kind: 'review', id: rr3.id };
  const limits = {
    permittedUses: ['Use the six supported claims to build the positioning and proof points.', 'Quote interview themes as qualitative direction.'],
    prohibitedInferences: [
      'Do not present interview themes as representative of all customers.',
      'Do not make sustainability claims beyond published material sourcing.',
      'Durability claims reference the existing warranty terms only.',
    ],
    unresolvedIssues: ['Category evidence on showroom questions comes from a single round of visits.'],
  };
  b.handoff({ projectId: P, artifactId: v3.id, artifactVersion: 3, side: 'research_owner', owner: owners.research, decision: 'delivered', ...limits, note: 'Delivered with the renter section added for brief v2.', createdAt: '2026-09-30T15:00:00Z' });
  b.handoff({ projectId: P, artifactId: v3.id, artifactVersion: 3, side: 'strategy_owner', owner: owners.strategy, decision: 'accepted_with_conditions', ...limits, note: 'Accepted on condition that warranty wording is checked with the client before any external use.', createdAt: '2026-10-01T11:30:00Z' });
  v3.release = { releasedAt: '2026-10-02T09:00:00Z', releasedBy: 'Jon Achebe' };

  const sj = b.job({ projectId: P, purpose: 'strategy_generation', label: m('job.strategy', { target: m('doc.research', { v: 3 }) }), target: { kind: 'artifact', id: v3.id, label: m('doc.research', { v: 3 }) }, at: '2026-10-03T10:00:00Z', seconds: 186 });
  const strategy = b.artifact({
    projectId: P, stage: 'strategy', lineageId: 'lin-morrow-strategy', version: 1, title: 'Positioning strategy — Built to move with you', briefVersion: 2, researchArtifactId: v3.id, jobId: sj.id,
    summary: 'Positions Morrow as durable furniture designed to adapt to each home, with proof points the brand can stand behind today.',
    createdAt: '2026-10-03T10:03:10Z',
    status: 'ready',
    sections: [
      {
        heading: 'Positioning',
        blocks: [
          { note: 'Simulated strategy draft, reviewed and approved by the strategy owner on 9 Oct 2026.' },
          ['Morrow is furniture built to move with you: durable enough to last through several homes, and modular enough to fit each one.'],
        ],
      },
      {
        heading: 'Who it is for',
        blocks: [
          [{ claim: 's1', topic: 'audience', sources: ['renters'], text: 'Renters in the research choose pieces they can take apart and move without specialist help.' }],
          ['The positioning speaks to first long-term homes and to renters equally. Both want furniture that does not need replacing when life changes.'],
        ],
      },
      {
        heading: 'Proof points',
        blocks: [
          [{ claim: 's2', topic: 'production', sources: ['warranty'], text: 'Frames carry a fifteen-year warranty, which supports the durability promise without new claims.' }],
          [{ claim: 's3', topic: 'category', sources: ['showroom'], text: 'Showroom visitors ask how pieces reconfigure for a move, which supports leading with adaptability.' }],
        ],
      },
      {
        heading: 'Tone',
        blocks: [{ list: ['Practical and warm: talk about moving day, not lifestyle aspiration.', 'Show rooms that look lived in, with personal objects in frame.', 'Keep durability concrete: warranty terms, not superlatives.'] }],
      },
      {
        heading: 'Limits accepted at handoff',
        blocks: [{ list: limits.prohibitedInferences }],
      },
      {
        heading: 'Next steps',
        blocks: [{ list: ['Creative development: turn the positioning into a campaign tone guide. Not available in this demo.', 'Confirm warranty wording with the client’s legal team.'] }],
      },
    ],
  });
  sj.output = { kind: 'artifact', id: strategy.id };
  for (const claim of b.db.claims.filter((c) => c.artifactId === strategy.id)) claim.supportStatus = 'supported';
  b.db.reviews.push({
    id: b.id('rev'),
    projectId: P,
    artifactId: strategy.id,
    artifactVersion: 1,
    type: 'strategy_review',
    decision: 'pass',
    summary: 'The positioning stays within the limits accepted at handoff. Approved for creative development.',
    findings: [
      {
        id: b.id('fnd'),
        severity: 'minor',
        message: 'The showroom proof point comes from a single round of visits.',
        requiredAction: 'Use it as supporting colour, not a headline claim.',
        sourceIds: ['src-morrow-showroom'],
        claimIds: [`${strategy.id}-s3`],
        resolved: false,
      },
    ],
    coverage: [],
    createdAt: '2026-10-09T16:20:00Z',
    reviewer: 'Jon Achebe (simulated sign-off)',
    simulated: true,
    jobId: null,
    outdated: false,
    outdatedReason: null,
  });

  const room = b.image({ id: 'img-morrow-room', projectId: P, name: 'Rental living room', previewUrl: placeholderImage('room', ['#5f7a6b', '#7d9585', '#e0b25c', '#c9d6e3'], 'Rental living room'), sourceNote: 'Participant photo, shared with consent for internal use only.', uploadedAt: '2026-09-12T10:00:00Z', observationStatus: 'observed' });
  b.image({ id: 'img-morrow-swatches', projectId: P, name: 'Fabric swatches', previewUrl: placeholderImage('detail', ['#8a6f5c', '#b9a58c', '#5c6f7d', '#3f3a36'], 'Fabric swatches'), sourceNote: 'Showroom sample book. Colours are approximate.', uploadedAt: '2026-10-08T13:00:00Z', observationStatus: 'failed' });
  const oj = b.job({ projectId: P, purpose: 'image_observation', label: m('job.observe', { name: 'Rental living room' }), target: { kind: 'image', id: room.id, label: room.name }, at: '2026-09-12T10:01:00Z', seconds: 13 });
  const ob = b.observation({
    imageId: room.id,
    visibleFeatures: ['A green sofa with lighter back cushions on a sand-coloured floor.', 'A floor lamp with a yellow shade stands to the right.', 'A pale blue window panel sits behind the lamp.'],
    transcribedText: ['Caption strip: “Placeholder illustration · Rental living room”'],
    uncertainties: ['Whether the sofa is modular cannot be determined from the image.'],
    reviewStatus: 'confirmed',
    reviewNote: null,
    reviewedAt: '2026-09-12T15:00:00Z',
    createdAt: '2026-09-12T10:01:15Z',
    jobId: oj.id,
  });
  oj.output = { kind: 'observation', id: ob.id };
  b.job({
    projectId: P,
    purpose: 'image_observation',
    label: m('job.observe', { name: 'Fabric swatches' }),
    target: { kind: 'image', id: 'img-morrow-swatches', label: 'Fabric swatches' },
    at: '2026-10-08T13:01:00Z',
    seconds: 1,
    status: 'failed',
    error: {
      code: 'UNSUPPORTED_FORMAT',
      message: 'The original file was in HEIC format, which the observation provider does not accept.',
      detail: 'Retrying would send the same file and fail again. Upload a JPEG or PNG version instead.',
      retryable: false,
    },
  });

  const act = (type: ActivityType, message: string, actor: string, at: string) => b.activity(P, type, message, actor, at);
  act('project', 'Created the project.', "演示用户", '2026-08-25T09:00:00Z');
  act('brief', 'Confirmed brief v1.', "演示用户", '2026-08-26T11:00:00Z');
  act('review', 'Verification of research v1 failed: the competitor claim had no citation.', 'Simulated evidence verifier', '2026-09-03T10:01:00Z');
  act('research', 'Research v2 produced with the citation fixed.', 'Simulator', '2026-09-10T09:02:00Z');
  act('brief', 'Saved brief v2: added renters. Research v2 marked stale.', "演示用户", '2026-09-18T14:00:00Z');
  act('research', 'Research v3 produced for brief v2.', 'Simulator', '2026-09-22T09:02:00Z');
  act('handoff', 'Jon Achebe accepted research v3 with conditions.', 'Jon Achebe', '2026-10-01T11:30:00Z');
  act('release', 'Released research v3 for strategy work.', 'Jon Achebe', '2026-10-02T09:00:00Z');
  act('strategy', 'Continued to strategy. Simulated strategy draft v1 produced.', "演示用户", '2026-10-03T10:03:10Z');
  act('job', 'Observation for “Fabric swatches” failed: unsupported HEIC file.', 'Simulator', '2026-10-08T13:01:01Z');
  act('review', 'Strategy approved by Jon Achebe.', 'Jon Achebe', '2026-10-09T16:20:00Z');
}


// ---------------------------------------------------------------------------
// 4. Plumtide — packaging for a new product; research released
// ---------------------------------------------------------------------------

function seedPlumtide(b: SeedBuilder) {
  const P = 'plumtide';
  const owners = { research: 'Research Lead (agent)', strategy: 'Strategy Lead (agent)' };
  b.project({
    id: P,
    name: "梅潮",
    client: "梅原饮品（虚构品牌）",
    summary: 'Can and gift-sleeve packaging for Plumtide, a new sparkling plum drink from the Oriya family.',
    revision: 18,
    createdAt: '2026-10-18T02:00:00Z',
    updatedAt: '2026-10-24T09:40:00Z',
    mode: 'supervised',
    owners,
    taskCard: task(
      1,
      'Can and four-can gift-sleeve packaging that is picked first in the chiller, works as a New Year gift and clearly belongs to Oriya.',
      ['Plum reads as the flavour at a glance.', 'The Oriya family mark is present.', 'Nothing about strength, size or materials is implied before the client confirms it.'],
      '2026-10-18T06:30:00Z',
      "演示用户",
    ),
    continuedToStrategyAt: '2026-10-21T08:00:00Z',
  });
  b.brief({
    projectId: P,
    version: 1,
    background:
      'Oriya (fictional) is a family plum-wine maker. It is launching Plumtide, a new sparkling plum drink in cans, plus a four-can gift sleeve for the New Year gifting season. The client describes the drink as “light and easy, for young people’s get-togethers”.',
    audience: 'Young adults who meet friends at home or outdoors. The brief gives no age range.',
    objectives: ['Make Plumtide stand out in convenience-store chillers.', 'Create a four-can gift sleeve suitable for New Year gifting.'],
    deliverables: ['Can design: front, back and three-quarter views', "四罐礼套", 'Conceptual mockups: chiller shelf and gift table'],
    constraints: ["保留梅原家族印章。", "必须能够识别梅子风味。"],
    brand: 'Plumtide by Oriya — sparkling plum drink (new)',
    deliverableType: 'Packaging proposal',
    timeline: 'Concepts before the New Year gifting range is set.',
    openQuestions: ['Does Plumtide contain alcohol, and at what strength?', 'What can size and material?', 'Who buys the gift sleeve — the drinkers, or people buying for them?'],
    provenance: {
      budget: { origin: 'missing', reason: 'not_stated', spans: [] },
      audience: { origin: 'provided', reason: 'stated', spans: [] },
    },
    confirmedAt: '2026-10-18T06:30:00Z',
    confirmedBy: "演示用户",
    createdAt: '2026-10-18T02:00:00Z',
    updatedAt: '2026-10-18T06:30:00Z',
    changeNote: null,
    supersededAt: null,
  });

  b.source(P, 'chiller', {
    title: 'Chiller audit — six convenience stores',
    publisher: 'Plumtide research team (sample field notes)',
    path: 'plumtide/chiller-audit',
    capturedAt: '2026-10-19T03:00:00Z',
    excerpt: 'Plum-flavoured sparkling drinks from three brands sat together in each chiller. All used dark purple or deep red cans with fruit photography.',
    intendedUse: 'competitor',
    verificationStatus: 'unverified',
  });
  b.source(P, 'gifting', {
    title: 'New Year gifting guide — convenience retail',
    publisher: 'Corner Shop Monthly (fictional)',
    path: 'cornershop/new-year-gifting',
    capturedAt: '2026-10-19T05:30:00Z',
    excerpt: 'Retailers stock multi-can gift sleeves from mid-December. Shoppers pick sleeves that look presentable without extra wrapping.',
    intendedUse: 'category',
    verificationStatus: 'unverified',
  });
  b.source(P, 'gatherings', {
    title: 'Get-together interviews — sample notes',
    publisher: 'Plumtide research team (sample interview notes)',
    path: 'plumtide/gatherings',
    capturedAt: '2026-10-19T08:10:00Z',
    excerpt: 'Participants described bringing a few cans to a friend’s place and sharing them out. Several said they liked drinks that looked good on the table.',
    intendedUse: 'audience',
    verificationStatus: 'unverified',
  });
  b.source(P, 'brandbook', {
    title: "母品牌规范",
    publisher: 'Oriya Drinks (client document, fictional)',
    path: 'oriya/brand-book',
    capturedAt: '2026-10-18T02:30:00Z',
    excerpt: 'Oriya labels use a hand-brushed plum branch and the family seal. The palette is cream, ink black and plum red.',
    intendedUse: 'category',
    verificationStatus: 'unverified',
  });
  b.source(P, 'customs', {
    title: 'New Year motifs — a short guide',
    publisher: 'Seasons & Customs Magazine (fictional)',
    path: 'seasons/new-year-motifs',
    capturedAt: '2026-10-19T09:00:00Z',
    excerpt: 'Plum blossom is a common New Year motif, associated with the first flowers of the year and with resilience.',
    intendedUse: 'cultural',
    verificationStatus: 'unverified',
  });

  const genJob = b.job({ projectId: P, purpose: 'research_generation', label: m('job.draftResearch'), target: { kind: 'project', id: P, label: "梅潮" }, at: '2026-10-19T09:30:00Z', seconds: 120 });
  const research = b.artifact({
    projectId: P,
    stage: 'research',
    lineageId: 'lin-plumtide-research',
    version: 1,
    title: 'Chiller, gifting and audience research',
    summary: 'Plum competitors look alike; gift sleeves must look presentable unwrapped; cans are shared at get-togethers; plum blossom is a New Year motif.',
    createdAt: '2026-10-19T09:32:00Z',
    briefVersion: 1,
    jobId: genJob.id,
    coverage: [
      { topic: 'audience', minSupportedClaims: 1, guidance: null },
      { topic: 'category', minSupportedClaims: 2, guidance: null },
      { topic: 'competitor', minSupportedClaims: 1, guidance: null },
      { topic: 'cultural', minSupportedClaims: 1, guidance: null },
    ],
    sections: [
      { heading: 'Summary', blocks: [['A new plum drink enters a chiller where every plum can looks the same, and a gifting season that rewards presentable packs.']] },
      {
        heading: 'Chiller and competitors',
        blocks: [
          [
            { claim: 'c1', topic: 'competitor', sources: ['chiller'], text: 'Plum-flavoured sparkling competitors in the audited chillers use dark purple or deep red cans with fruit photography.' },
            ' ',
            { claim: 'c2', topic: 'category', sources: ['gifting'], text: 'Multi-can gift sleeves are stocked from mid-December and chosen when they look presentable without extra wrapping.' },
          ],
          { note: 'Six stores in one city. A snapshot, not a survey.' },
        ],
      },
      {
        heading: 'Brand and audience',
        blocks: [
          [
            { claim: 'c4', topic: 'category', sources: ['brandbook'], text: "母品牌演示标签采用手绘梅枝、家族印章、米白、墨色与梅红配色。" },
            ' ',
            { claim: 'c3', topic: 'audience', sources: ['gatherings'], text: "模拟参与者会带饮品相聚，并在意罐子摆在桌面上的样子。" },
          ],
        ],
      },
      {
        heading: 'Season',
        blocks: [[{ claim: 'c5', topic: 'cultural', sources: ['customs'], text: 'Plum blossom is a common New Year motif, associated with the first flowers of the year.' }]],
      },
    ],
  });
  genJob.output = { kind: 'artifact', id: research.id };
  const vJob = b.job({ projectId: P, purpose: 'evidence_verification', label: m('job.verify', { target: m('doc.research', { v: 1 }) }), target: { kind: 'artifact', id: research.id, label: m('doc.research', { v: 1 }) }, at: '2026-10-20T01:00:00Z', seconds: 35 });
  const v = b.verify(research, '2026-10-20T01:01:00Z', vJob.id);
  vJob.output = { kind: 'review', id: v.id };
  const rJob = b.job({ projectId: P, purpose: 'readiness_review', label: m('job.readiness', { target: m('doc.research', { v: 1 }) }), target: { kind: 'artifact', id: research.id, label: m('doc.research', { v: 1 }) }, at: '2026-10-20T01:10:00Z', seconds: 28 });
  const r = b.readiness(research, '2026-10-20T01:11:00Z', rJob.id);
  rJob.output = { kind: 'review', id: r.id };
  const shared = {
    permittedUses: ['Use the five supported claims for strategy and creative.', 'Treat interview themes as qualitative direction.'],
    prohibitedInferences: [
      'Do not infer alcohol content from “light” in the brief.',
      'Do not assume an age range from “young”.',
      'Do not treat gift buyers and drinkers as the same people.',
    ],
    unresolvedIssues: ['Alcohol content, can size and materials are not confirmed by the client.'],
  };
  b.handoff({ projectId: P, artifactId: research.id, artifactVersion: 1, side: 'research_owner', owner: owners.research, decision: 'delivered', ...shared, note: 'Delivered by the Research Lead agent; producer check complete.', createdAt: '2026-10-20T02:00:00Z', recordedBy: 'Research Lead (agent)' });
  b.handoff({ projectId: P, artifactId: research.id, artifactVersion: 1, side: 'strategy_owner', owner: owners.strategy, decision: 'accepted', ...shared, note: 'Accepted by the Strategy Lead agent; consumer check complete.', createdAt: '2026-10-20T02:20:00Z', recordedBy: 'Strategy Lead (agent)' });
  research.release = { releasedAt: '2026-10-20T03:00:00Z', releasedBy: 'Proposal Director (agent, automatic mode)' };

  const act = (type: ActivityType, message: string, actor: string, at: string) => b.activity(P, type, message, actor, at);
  act('project', 'Created the project from the client brief.', "演示用户", '2026-10-18T02:00:00Z');
  act('brief', 'Confirmed brief v1 and the task card. Strength, size and age range left as open questions.', "演示用户", '2026-10-18T06:30:00Z');
  act('research', 'Research v1 produced.', 'Research Lead (agent)', '2026-10-19T09:32:00Z');
  act('review', 'Evidence verification passed.', 'Evidence verifier (agent)', '2026-10-20T01:01:00Z');
  act('review', 'Readiness review passed.', 'Sufficiency reviewer (agent)', '2026-10-20T01:11:00Z');
  act('handoff', 'Research and strategy leads completed the handoff checks.', 'Proposal Director (agent)', '2026-10-20T02:20:00Z');
  act('release', 'Released research v1 for strategy work.', 'Proposal Director (agent)', '2026-10-20T03:00:00Z');
}

export function buildSeedDatabase(): DemoDatabase {
  const b = new SeedBuilder();
  seedLuma(b);
  seedNorthline(b);
  seedMorrow(b);
  seedPlumtide(b);
  for (const project of b.db.projects) refreshProjectState(b.db, project.id);
  b.db.catalogRevision = 4;
  return b.db;
}

export function buildEmptyDatabase(): DemoDatabase {
  return emptyDatabase();
}

export type { Claim };
