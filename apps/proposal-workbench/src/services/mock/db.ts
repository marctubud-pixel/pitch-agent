import type {
  Activity,
  Artifact,
  Brief,
  BriefAttachment,
  Claim,
  Handoff,
  ID,
  ImageAsset,
  Job,
  JobError,
  Observation,
  Project,
  Review,
  Source,
} from '../../domain/models';

/** How the simulator plays a job out. Lives only inside the mock; never reaches components. */
export interface JobSimulation {
  queueMs: number;
  runMs: number;
  outcome: 'success' | 'failure' | 'lost';
  failure?: JobError;
  /** Result the provider "saved" for a lost response, imported on reconciliation. */
  savedObservation?: Pick<Observation, 'visibleFeatures' | 'transcribedText' | 'uncertainties'>;
}

export type JobRecord = Omit<Job, 'recovery'> & { sim: JobSimulation | null };

export interface StrategyTemplate {
  title: string;
  positioning: string;
  territories: Array<{ name: string; description: string }>;
  openQuestions: string[];
}

export interface CommandRecord {
  name: string;
  hash: string;
  appliedAt: string;
  revision: number;
  data: unknown;
}

export interface DemoDatabase {
  schemaVersion: number;
  catalogRevision: number;
  projects: Project[];
  briefs: Brief[];
  /** Original brief material. The files themselves are kept in memory by the mock service. */
  briefAttachments: Array<Omit<BriefAttachment, 'fileAvailable'>>;
  sources: Source[];
  claims: Claim[];
  artifacts: Artifact[];
  reviews: Review[];
  handoffs: Handoff[];
  jobs: JobRecord[];
  images: ImageAsset[];
  observations: Observation[];
  activity: Activity[];
  imageMeta: Record<ID, { dominantColors: string[] }>;
  strategyTemplates: Record<ID, StrategyTemplate>;
  commands: Record<string, CommandRecord>;
}

export const SCHEMA_VERSION = 6;

export function emptyDatabase(): DemoDatabase {
  return {
    schemaVersion: SCHEMA_VERSION,
    catalogRevision: 1,
    projects: [],
    briefs: [],
    briefAttachments: [],
    sources: [],
    claims: [],
    artifacts: [],
    reviews: [],
    handoffs: [],
    jobs: [],
    images: [],
    observations: [],
    activity: [],
    imageMeta: {},
    strategyTemplates: {},
    commands: {},
  };
}

export const DEMO_USER = 'Alex Morgan';
