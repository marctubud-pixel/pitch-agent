import type { LucideIcon } from 'lucide-react';
import {
  Ban,
  BadgeCheck,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleDot,
  CircleX,
  Clock,
  Eye,
  Hourglass,
  Info,
  LoaderCircle,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  SquareDashed,
  TriangleAlert,
  Undo2,
  Unlink,
} from 'lucide-react';
import type {
  ArtifactStatus,
  FindingSeverity,
  GateStatus,
  HandoffDecision,
  JobStatus,
  ObservationReviewStatus,
  ObservationStatus,
  ProjectStatus,
  ReviewDecision,
  SourceVerificationStatus,
  StageState,
  SupportStatus,
} from '../domain/models';
import { useT, type TFunction, type TKey } from '../i18n';

export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral' | 'accent';
type Entry = [tone: Tone, icon: LucideIcon];

const TABLES = {
  project: {
    draft: ['neutral', CircleDashed],
    in_progress: ['info', CircleDot],
    blocked: ['bad', Ban],
    ready: ['ok', CircleCheck],
    needs_update: ['warn', RefreshCw],
  } satisfies Record<ProjectStatus, Entry>,
  artifact: {
    draft: ['neutral', CircleDashed],
    under_review: ['info', Eye],
    blocked: ['bad', Ban],
    ready: ['ok', CircleCheck],
    released: ['ok', BadgeCheck],
    stale: ['warn', Clock],
  } satisfies Record<ArtifactStatus, Entry>,
  job: {
    blocked: ['bad', Ban],
    queued: ['neutral', Hourglass],
    running: ['info', LoaderCircle],
    succeeded: ['ok', CircleCheck],
    failed: ['bad', CircleX],
    awaiting_reconciliation: ['warn', CircleAlert],
  } satisfies Record<JobStatus, Entry>,
  decision: {
    pass: ['ok', CircleCheck],
    pass_with_conditions: ['warn', CircleCheck],
    fail: ['bad', CircleX],
  } satisfies Record<ReviewDecision, Entry>,
  support: {
    supported: ['ok', CircleCheck],
    partial: ['warn', CircleAlert],
    unsupported: ['bad', CircleX],
    missing_citation: ['bad', Unlink],
    unverified: ['neutral', CircleDashed],
  } satisfies Record<SupportStatus, Entry>,
  source: {
    verified: ['ok', ShieldCheck],
    unverified: ['neutral', CircleDashed],
    insufficient: ['bad', ShieldAlert],
  } satisfies Record<SourceVerificationStatus, Entry>,
  observation: {
    not_requested: ['neutral', CircleDashed],
    pending: ['info', LoaderCircle],
    observed: ['ok', CircleCheck],
    failed: ['bad', CircleX],
  } satisfies Record<ObservationStatus, Entry>,
  observationReview: {
    unreviewed: ['neutral', Eye],
    confirmed: ['ok', CircleCheck],
    needs_revision: ['warn', TriangleAlert],
  } satisfies Record<ObservationReviewStatus, Entry>,
  severity: {
    blocking: ['bad', Ban],
    major: ['warn', TriangleAlert],
    minor: ['neutral', Info],
  } satisfies Record<FindingSeverity, Entry>,
  gate: {
    not_reached: ['neutral', CircleDashed],
    awaiting_decision: ['info', Hourglass],
    approved: ['ok', CircleCheck],
    blocked: ['bad', Ban],
  } satisfies Record<GateStatus, Entry>,
  handoff: {
    delivered: ['ok', Send],
    accepted: ['ok', CircleCheck],
    accepted_with_conditions: ['warn', CircleCheck],
    returned: ['bad', Undo2],
  } satisfies Record<HandoffDecision, Entry>,
  stage: {
    complete: ['ok', CircleCheck],
    current: ['accent', CircleDot],
    blocked: ['bad', Ban],
    upcoming: ['neutral', CircleDashed],
    not_in_demo: ['neutral', SquareDashed],
  } satisfies Record<StageState, Entry>,
};

type Tables = typeof TABLES;
export type StatusKind = keyof Tables;

/** Labels live in the interface catalogue under status.<kind>.<value>. */
export function statusInfo<K extends StatusKind>(kind: K, value: keyof Tables[K], t: TFunction): { label: string; tone: Tone; Icon: LucideIcon } {
  const [tone, Icon] = (TABLES[kind] as Record<string, Entry>)[value as string] ?? ['neutral', Info];
  return { label: t(`status.${kind}.${String(value)}` as TKey), tone, Icon };
}

/** Status label with icon and text, so meaning never depends on colour alone. */
export function StatusBadge<K extends StatusKind>({ kind, value, size = 'md' }: { kind: K; value: keyof Tables[K]; size?: 'sm' | 'md' }) {
  const { label, tone, Icon } = statusInfo(kind, value, useT());
  const spin = Icon === LoaderCircle;
  return (
    <span className={`badge badge--${size}`} data-tone={tone}>
      <Icon size={size === 'sm' ? 12 : 14} aria-hidden="true" className={spin ? 'spin' : undefined} />
      {label}
    </span>
  );
}

/** Compact status: a coloured dot plus its text label. */
export function DotPill<K extends StatusKind>({ kind, value }: { kind: K; value: keyof Tables[K] }) {
  const { label, tone } = statusInfo(kind, value, useT());
  return (
    <span className="dot-pill" data-tone={tone}>
      <span className="dot-pill__dot" aria-hidden="true" />
      {label}
    </span>
  );
}
