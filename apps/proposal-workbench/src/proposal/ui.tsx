/**
 * Shared pieces for the proposal workspace: stage labels, status pills, the "how is this
 * backed" tag, evidence links and review summaries. Every screen uses these so the eight stages
 * read as one product.
 */
import { useId, useState, type ReactNode } from 'react';
import {
  BookOpen,
  Brush,
  ChevronDown,
  CircleCheck,
  CircleDashed,
  ClipboardCheck,
  Compass,
  FileText,
  Hand,
  LayoutTemplate,
  LoaderCircle,
  PackageCheck,
  PenLine,
  RotateCcw,
  Search,
  type LucideIcon,
} from 'lucide-react';
import { Link, projectPath } from '../app/router';
import type { Backing, Challenge, DirectionId, EvidenceRef, ScoreLine, StageId, StageStatus } from '../domain/proposal';
import { useT } from '../i18n';

export const STAGE_ICON: Record<StageId, LucideIcon> = {
  brief: FileText,
  research: Search,
  strategy: Compass,
  themes: PenLine,
  visual: Brush,
  content_review: ClipboardCheck,
  layout: LayoutTemplate,
  delivery: PackageCheck,
};

export const STATUS_ICON: Record<StageStatus, LucideIcon> = {
  done: CircleCheck,
  in_progress: LoaderCircle,
  waiting_for_you: Hand,
  needs_revision: RotateCcw,
  not_started: CircleDashed,
};

const STATUS_TONE: Record<StageStatus, string> = {
  done: 'ok',
  in_progress: 'info',
  waiting_for_you: 'attention',
  needs_revision: 'warn',
  not_started: 'neutral',
};

export function StatusPill({ status, size = 'md' }: { status: StageStatus; size?: 'sm' | 'md' }) {
  const t = useT();
  const Icon = STATUS_ICON[status];
  return (
    <span className="pw-status" data-tone={STATUS_TONE[status]} data-size={size}>
      <Icon size={size === 'sm' ? 12 : 14} aria-hidden="true" />
      {t(`pw.status.${status}`)}
    </span>
  );
}

/** Says how a part of the product is backed in this build: working, prototype or not built yet. */
export function Backed({ as, note }: { as: Backing; note?: string }) {
  const t = useT();
  return (
    <span className="pw-backed" data-backing={as} title={note ?? t(`pw.backing.${as}.hint`)}>
      <span className="pw-backed__dot" aria-hidden="true" />
      {t(`pw.backing.${as}`)}
      {note && <span className="sr-only">: {note}</span>}
    </span>
  );
}

export function DirectionMark({ id, color }: { id: DirectionId; color?: string }) {
  return (
    <span className="pw-dir" style={color ? { background: color } : undefined} aria-hidden="true">
      {id}
    </span>
  );
}

/** Links an evidence reference to where it lives: a research claim, a case, a chart or the brief. */
export function EvidenceChips({ refs, projectId }: { refs: EvidenceRef[]; projectId: string }) {
  const t = useT();
  if (!refs.length) return null;
  return (
    <span className="pw-ev">
      <span className="sr-only">{t('pw.evidence')}: </span>
      {refs.map((r, i) => {
        const to =
          r.kind === 'brief'
            ? projectPath(projectId, 'proposal', { stage: 'brief' })
            : r.kind === 'claim'
              ? projectPath(projectId, 'proposal', { stage: 'research', claim: r.ref })
              : projectPath(projectId, 'proposal', { stage: 'research', focus: r.ref });
        return (
          <Link key={`${r.ref}-${i}`} to={to} className="pw-ev__chip" data-kind={r.kind} title={t(`pw.evKind.${r.kind}`)}>
            <BookOpen size={11} aria-hidden="true" />
            {r.label}
          </Link>
        );
      })}
    </span>
  );
}

export const average = (rows: ScoreLine[]) => (rows.length ? Math.round((rows.reduce((s, r) => s + r.score, 0) / rows.length) * 10) / 10 : null);

/** A row of criterion scores out of 5, with the average and the calibrated threshold. */
export function Scores({ rows, threshold = 4, compact = false }: { rows: ScoreLine[]; threshold?: number; compact?: boolean }) {
  const t = useT();
  const avg = average(rows);
  if (!rows.length) return null;
  return (
    <div className="pw-scores" data-compact={compact || undefined}>
      <ul>
        {rows.map((r) => (
          <li key={r.criterion}>
            <span className="pw-scores__label">{r.criterion}</span>
            <span className="pw-scores__bar" aria-hidden="true">
              <i style={{ width: `${(r.score / 5) * 100}%` }} data-low={r.score < threshold || undefined} />
            </span>
            <span className="pw-scores__n">{r.score.toFixed(1)}</span>
            {!compact && r.note && <span className="pw-scores__note">{r.note}</span>}
          </li>
        ))}
      </ul>
      {avg !== null && (
        <p className="pw-scores__avg" data-pass={avg >= threshold || undefined}>
          {t('pw.avg', { avg: avg.toFixed(1), threshold })}
        </p>
      )}
    </div>
  );
}

const OUTCOME_TONE: Record<Challenge['outcome'], string> = { upheld: 'warn', partly_upheld: 'info', rejected: 'neutral' };

export function ChallengeCard({ c }: { c: Challenge }) {
  const t = useT();
  return (
    <div className="pw-challenge">
      <p className="pw-challenge__claim">
        <span className="pw-label">{t('pw.challenge.claim')}</span> {c.claim}
      </p>
      <p>
        <span className="pw-label">{t('pw.challenge.challenge')}</span> {c.challenge}
      </p>
      <p>
        <span className="pw-label">{t('pw.challenge.resolution')}</span> {c.resolution}
      </p>
      <span className="pw-tag" data-tone={OUTCOME_TONE[c.outcome]}>
        {t(`pw.challenge.${c.outcome}`)}
      </span>
    </div>
  );
}

/** Secondary detail, closed by default. */
export function More({ label, children, defaultOpen = false, forceOpen = false }: { label: string; children: ReactNode; defaultOpen?: boolean; forceOpen?: boolean }) {
  const [userOpen, setOpen] = useState(defaultOpen);
  // A caller can open the disclosure (for example when a link points into it); it never closes it.
  const [forced, setForced] = useState(forceOpen);
  if (forceOpen && !forced) setForced(true);
  const open = userOpen || forced;
  const id = useId();
  return (
    <div className="pw-more" data-open={open || undefined}>
      <button type="button" className="pw-more__btn" aria-expanded={open} aria-controls={id} onClick={() => {
          setForced(false);
          setOpen(!open);
        }}>
        <ChevronDown size={14} aria-hidden="true" />
        {label}
      </button>
      <div id={id} hidden={!open} className="pw-more__body">
        {children}
      </div>
    </div>
  );
}

export function SectionHead({ title, kicker, aside, id }: { title: string; kicker?: string; aside?: ReactNode; id?: string }) {
  return (
    <div className="pw-sh">
      <div>
        {kicker && <p className="pw-kicker">{kicker}</p>}
        <h2 id={id}>{title}</h2>
      </div>
      {aside && <div className="pw-sh__aside">{aside}</div>}
    </div>
  );
}
