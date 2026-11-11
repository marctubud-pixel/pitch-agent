/**
 * Proposals home, as a filing cabinet. One proposal lies open as the focal point with its work
 * fanned out inside (next step, latest output, directions or task card); the others are
 * packed into the drawer on the right, showing only their staggered tabs. Pulling a folder out
 * morphs it into place with the View Transitions API where supported.
 */
import { useMemo, useState, type CSSProperties } from 'react';
import { flushSync } from 'react-dom';
import { ArrowUpRight, Hand, Megaphone, Package, Plus, Search, X } from 'lucide-react';
import { useServiceQuery } from '../app/query';
import { useProposalFor, useProposalList } from '../app/proposalQuery';
import { Link, projectPath, useRouter } from '../app/router';
import { STAGES, type Proposal, type ProposalSummary, type ProposalType, type StageStatus } from '../domain/proposal';
import { useI18n, useT } from '../i18n';
import { latestOutput, nextAction, nextActionPath, nextFromSummary, type NextAction } from '../proposal/derive';
import { toneFor } from '../proposal/tone';
import { DirectionMark } from '../proposal/ui';
import { ArtFrame } from '../ui/art/ArtFrame';
import { ErrorState, Skeleton, StatePanel, Time } from '../ui/kit';

type Filter = 'all' | 'attention' | ProposalType;
const STATUS_DOT: Record<StageStatus, string> = {
  waiting_for_you: 'var(--warm)',
  needs_revision: 'var(--warm)',
  in_progress: 'var(--tone-sky)',
  done: 'var(--ok)',
  not_started: 'var(--ink-3)',
};

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Runs a state change as a view transition where the browser supports it, then calls `after`. */
function transition(update: () => void, after?: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { updateCallbackDone: Promise<void>; ready: Promise<void>; finished: Promise<void> } };
  if (doc.startViewTransition && !reduceMotion()) {
    const vt = doc.startViewTransition(() => flushSync(update));
    // A second pull while one is animating skips the first; that is expected, not an error.
    vt.ready.catch(() => {});
    vt.finished.catch(() => {});
    void vt.updateCallbackDone.then(after, after);
  } else {
    flushSync(update);
    after?.();
  }
}

export function HomeView() {
  const t = useT();
  const { locale } = useI18n();
  const { navigate } = useRouter();
  const list = useProposalList();
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string | null>(null);

  const all = useMemo(() => [...(list.data ?? [])].sort((a, b) => b.attention - a.attention || b.updatedAt.localeCompare(a.updatedAt)), [list.data]);
  const needYou = all.filter((p) => p.attention > 0).length;
  const open = all.find((p) => p.id === picked) ?? all[0] ?? null;
  const drawer = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all
      .filter((p) => filter === 'all' || (filter === 'attention' ? p.attention > 0 : p.type === filter))
      .filter((p) => !needle || `${p.name} ${p.client} ${p.summary}`.toLowerCase().includes(needle));
  }, [all, filter, q]);
  const stack = drawer.filter((p) => p.id !== open?.id);
  const count = (f: Filter) => all.filter((p) => f === 'all' || (f === 'attention' ? p.attention > 0 : p.type === f)).length;
  const date = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

  // Pulling a folder out moves focus to its name, so keyboard and screen-reader users land on it.
  const pull = (id: string) =>
    transition(
      () => setPicked(id),
      () => document.getElementById(`folder-${id}`)?.focus(),
    );

  const title =
    list.status === 'loading' && !list.data
      ? t('dash.titleLoading')
      : all.length === 0
        ? t('dash.titleEmpty')
        : t('dash.title', {
            count: all.length,
            hl: '⁣',
          });
  const [before, after] = title.split('⁣');

  return (
    <div className="dash">
      <div className="dash__inner">
        <header className="dash-hero">
          <div className="dash-hero__text">
            <p className="dash-hero__date">{date}</p>
            <h1 className="dash-hero__title">
              {before}
              {after !== undefined && <span className={needYou ? 'hl' : 'hl hl--calm'}>{needYou ? t('dash.needYou', { count: needYou }) : t('dash.onTrack')}</span>}
              {after}
            </h1>
          </div>
          {/* The one way to start a proposal; the empty state carries its own when there is nothing yet. */}
          {!(list.status === 'success' && all.length === 0) && (
            <div className="dash-hero__tools">
              <button type="button" className="btn btn--primary" onClick={() => void navigate('/new')}>
                <span className="btn-orb" aria-hidden="true">
                  <Plus size={16} />
                </span>
                {t('pw.home.new')}
              </button>
            </div>
          )}
        </header>

        {list.status === 'loading' && !list.data ? (
          <div className="archive" aria-busy="true">
            <div className="open-folder open-folder--ghost">
              <Skeleton lines={3} />
            </div>
            <div className="cabinet cabinet--ghost">
              <Skeleton lines={4} />
            </div>
          </div>
        ) : list.status === 'error' ? (
          <ErrorState error={null} onRetry={list.refetch} />
        ) : all.length === 0 ? (
          <StatePanel
            kind="empty"
            title={t('dash.emptyTitle')}
            action={
              <button type="button" className="btn btn--primary" onClick={() => void navigate('/new')}>
                <Plus size={16} aria-hidden="true" /> {t('pw.home.new')}
              </button>
            }
          >
            <p>{t('pw.home.emptyBody')}</p>
          </StatePanel>
        ) : (
          <div className="archive">
            {open && <OpenFolder key={open.id} summary={open} />}

            <section className="cabinet" aria-labelledby="cabinet-title">
              <div>
                <h2 id="cabinet-title" className="cabinet__title">
                  {t('home.archive')} <span className="cabinet__count">{all.length}</span>
                </h2>
                <p className="small muted">{t('home.archiveHint')}</p>
              </div>
              <div className="cabinet__labels" role="group" aria-label={t('pw.home.filter')}>
                {(['all', 'attention', 'kv', 'packaging'] as Filter[]).map((f) => (
                  <button key={f} type="button" className="drawer-label" data-kind={f === 'attention' ? 'attention' : undefined} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                    {f === 'attention' && <span className="drawer-label__dot" aria-hidden="true" />}
                    <span>{t(`pw.home.f.${f}`)}</span>
                    <span>{count(f)}</span>
                  </button>
                ))}
              </div>
              <label className="cabinet__search">
                <Search size={16} aria-hidden="true" />
                <span className="sr-only">{t('pw.home.search')}</span>
                <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('pw.home.search')} />
                {q && (
                  <button type="button" className="icon-btn" onClick={() => setQ('')} aria-label={t('dash.clear')}>
                    <X size={16} aria-hidden="true" />
                  </button>
                )}
              </label>
              <div className="cabinet__drawer">
                {/* The open folder leaves the drawer entirely; it is already on the desk to the left. */}
                {stack.length === 0 ? (
                  <p className="cabinet__empty">{drawer.length > 0 ? t('home.onlyOpen') : q ? t('dash.noMatchQuery', { q }) : t('dash.noMatchGroup')}</p>
                ) : (
                  <ul className="cabinet__stack">
                    {stack.map((p) => (
                      <li key={p.id} className="cab-item">
                        <DrawerFolder p={p} onPull={() => pull(p.id)} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function DrawerFolder({ p, onPull }: { p: ProposalSummary; onPull: () => void }) {
  const t = useT();
  const next = nextFromSummary(p);
  return (
    <button type="button" className="cab-folder" data-tone={toneFor(p.workbenchId)} onClick={onPull} aria-label={t('home.pullOut', { name: p.name })} style={{ viewTransitionName: `folder-${p.id}` } as CSSProperties}>
      <span className="cab-folder__tab" aria-hidden="true">
        {p.client}
      </span>
      <span className="cab-folder__body">
        <span className="cab-folder__name">{p.name}</span>
        <StatusDot status={p.currentStatus} />
        <span className="cab-folder__next">
          {STAGES.indexOf(p.currentStage) + 1}/8 · {t('dash.next')}: {nextLabel(t, next)}
        </span>
      </span>
    </button>
  );
}

function StatusDot({ status }: { status: StageStatus }) {
  const t = useT();
  return (
    <span className="dot-pill">
      <span className="dot-pill__dot" style={{ '--tone': STATUS_DOT[status] } as CSSProperties} aria-hidden="true" />
      {t(`pw.status.${status}`)}
    </span>
  );
}

const nextLabel = (t: ReturnType<typeof useT>, next: NextAction) => t(`pw.next.${next.kind}`, { stage: t(`pw.stage.${next.stage}`) });

/** The folder lying open: its work fanned out on top, the project itself on the front flap. */
function OpenFolder({ summary: s }: { summary: ProposalSummary }) {
  const t = useT();
  const pid = s.workbenchId;
  const full = useProposalFor(pid);
  const overview = useServiceQuery(`overview:${pid}`, (svc) => svc.getProjectOverview(pid), { projectId: pid });
  const p = full.data ?? null;
  const next = p ? nextAction(p, overview.data ?? null) : nextFromSummary(s);
  const n = STAGES.indexOf(s.currentStage) + 1;
  const tone = toneFor(pid);
  const kind = next.kind === 'decide' || next.kind === 'fix_research' || next.kind === 'confirm_brief' ? 'attention' : next.kind === 'deliver' ? 'ready' : 'active';

  return (
    <article className="open-folder" data-tone={tone} aria-labelledby={`folder-${s.id}`} style={{ viewTransitionName: `folder-${s.id}` } as CSSProperties}>
      {/* The tab hangs off the folder's back, so it sits level with the top of the cabinet. */}
      <div className="open-folder__back">
        <p className="open-folder__tab">{s.client}</p>
      </div>
      <div className="open-folder__sheets">
        <Link to={nextActionPath(pid, next)} className="sheet sheet--next" data-kind={kind} style={{ '--i': 0 } as CSSProperties}>
          <span className="sheet__label">{t('dash.next')}</span>
          <span className="sheet__big">{nextLabel(t, next)}</span>
          <span className="sheet__go">
            {t('home.goThere')} <ArrowUpRight size={14} aria-hidden="true" />
          </span>
        </Link>
        <OutputSheet s={s} p={p} />
        <FourthSheet s={s} p={p} />
      </div>

      <div className="open-folder__front">
        <div className="open-folder__meta">
          {/* Stage and status live in the progress row below; the meta line says only what needs you. */}
          {s.attention > 0 && (
            <span className="folder__alert">
              <Hand size={13} aria-hidden="true" /> {t('pw.attentionCount', { count: s.attention })}
            </span>
          )}
          <span className="small muted">
            <Time iso={s.updatedAt} relative />
          </span>
        </div>
        <h2 id={`folder-${s.id}`} className="open-folder__name" tabIndex={-1}>
          {s.name}
        </h2>
        <p className="open-folder__summary">{s.summary}</p>
        <div className="open-folder__stage">
          <div className="folder__stage-row">
            <span>{t(`pw.stage.${s.currentStage}`)}</span>
            <span className="folder__stage-count">{t('dash.stageOf', { n, total: 8 })}</span>
          </div>
          <div className="track" role="img" aria-label={t('pw.home.progress', { n, stage: t(`pw.stage.${s.currentStage}`) })}>
            {STAGES.map((x) => {
              const st = s.stageStatus[x];
              return <span key={x} data-state={st === 'done' ? 'done' : st === 'needs_revision' ? 'blocked' : x === s.currentStage ? 'current' : undefined} />;
            })}
          </div>
        </div>
        <div className="open-folder__foot">
          <span className="small muted">
            {s.type === 'kv' ? <Megaphone size={14} aria-hidden="true" /> : <Package size={14} aria-hidden="true" />} {t(`pw.type.${s.type}`)} · {t(`pw.mode.${s.mode}`)}
          </span>
          <Link to={projectPath(pid)} className="btn open-folder__open">
            {t('home.openProject')} <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  );
}

/** The newest piece of work: the deck cover, a refined visual, or the cover art. */
function OutputSheet({ s, p }: { s: ProposalSummary; p: Proposal | null }) {
  const t = useT();
  const out = p ? latestOutput(p) : null;
  const art = out?.art ?? s.cover;
  const to = out?.kind === 'deck' ? projectPath(s.workbenchId, 'delivery') : projectPath(s.workbenchId, 'proposal', { stage: out?.stage ?? s.currentStage });
  return (
    <Link to={to} className="sheet sheet--art" style={{ '--i': 1 } as CSSProperties}>
      <span className="sheet__label">{out ? t(`pw.output.${out.kind}`) : t('pw.ov.noOutput')}</span>
      {art && <ArtFrame spec={art} ratio={[1, 1]} className="sheet__art" />}
      {out && <span className="sheet__caption sheet__lines--text">{out.title}</span>}
    </Link>
  );
}

/** Three directions once they exist; until then, the task card. */
function FourthSheet({ s, p }: { s: ProposalSummary; p: Proposal | null }) {
  const t = useT();
  const pid = s.workbenchId;
  if (p?.themes && p.stages.themes.status !== 'not_started') {
    const rec = p.themes.recommendation.id;
    return (
      <Link to={projectPath(pid, 'proposal', { stage: 'themes' })} className="sheet" style={{ '--i': 2 } as CSSProperties}>
        <span className="sheet__label">{t('pw.cab.directions')}</span>
        <ul className="sheet__dirs">
          {p.themes.directions.map((d) => (
            <li key={d.id} data-rec={d.id === rec || undefined}>
              <DirectionMark id={d.id} color={d.color} />
              <span>{d.name}</span>
            </li>
          ))}
        </ul>
        <span className="sheet__caption">{t('pw.cab.recommended', { id: rec })}</span>
      </Link>
    );
  }
  return (
    <Link to={projectPath(pid, 'proposal', { stage: 'brief' })} className="sheet" style={{ '--i': 2 } as CSSProperties}>
      <span className="sheet__label">{t('pw.cab.taskCard')}</span>
      {p ? (
        <>
          <span className={`sheet__state${s.stageStatus.brief === 'done' ? ' is-ok' : ''}`}>{s.stageStatus.brief === 'done' ? t('home.confirmed') : t(`pw.status.${s.stageStatus.brief}`)}</span>
          <span className="sheet__lines sheet__lines--text">{p.task.assignment}</span>
          {p.task.unknowns.length > 0 && <span className="sheet__caption">{t('pw.cab.unknowns', { count: p.task.unknowns.length })}</span>}
        </>
      ) : (
        <Skeleton lines={3} />
      )}
    </Link>
  );
}
