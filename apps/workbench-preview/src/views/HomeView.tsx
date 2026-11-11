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
import { ACTIVE_STAGES, activeStage, type Proposal, type ProposalSummary, type ProposalType, type StageStatus } from '../domain/proposal';
import { useI18n, useT } from '../i18n';
import { latestOutput, nextAction, nextActionPath, nextFromSummary, type NextAction } from '../proposal/derive';
import { toneFor } from '../proposal/tone';
import { HomeDeadline } from './HomeDeadline';
import { useTeam } from '../collaboration/context';
import { ArtFrame } from '../ui/art/ArtFrame';
import { ErrorState, Skeleton, StatePanel } from '../ui/kit';

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
  const { can } = useTeam();
  const actionable = (p: ProposalSummary) => {
    if (!p.attention) return false;
    const next = nextFromSummary(p);
    if (next.kind === 'decide') return can({ kind: 'decide', stage: next.stage });
    if (next.kind === 'fix_research') return can({ kind: 'edit_research' });
    return can({ kind: 'manage' });
  };
  const needYou = all.filter(actionable).length;
  const open = all.find((p) => p.id === picked) ?? all[0] ?? null;
  const drawer = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all
      .filter((p) => filter === 'all' || (filter === 'attention' ? actionable(p) : p.type === filter))
      .filter((p) => !needle || `${p.name} ${folderName(p)[0]} ${p.summary}`.toLowerCase().includes(needle));
  }, [all, filter, q, can]);
  const stack = drawer;
  const date = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

  // Pulling a folder out moves focus to its name, so keyboard and screen-reader users land on it.
  const pull = (id: string) =>
    transition(
      () => setPicked(id),
      () => document.getElementById(`folder-${id}`)?.focus(),
    );

  return (
    <div className="dash">
      <div className="dash__inner">
        <header className="dash-hero">
          <div className="dash-hero__text">
            <p className="dash-hero__date">{date}</p>
            <h1 className="dash-hero__title">
              我的提案
            </h1>
            {list.data && <p>{all.length} 个项目{needYou > 0 && ' · 待我处理 ' + needYou + ' 个'}</p>}
          </div>
          {/* The one way to start a proposal; the empty state carries its own when there is nothing yet. */}
          {can({ kind: 'manage' }) && !(list.status === 'success' && all.length === 0) && (
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
                  项目列表
                </h2>

              </div>
              <div className="cabinet__labels" role="group" aria-label={t('pw.home.filter')}>
                {(['all', 'attention', 'kv', 'packaging'] as Filter[]).map((f) => (
                  <button key={f} type="button" className="drawer-label" data-kind={f === 'attention' ? 'attention' : undefined} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                    {f === 'attention' && <span className="drawer-label__dot" aria-hidden="true" />}
                    <span>{t(`pw.home.f.${f}`)}</span>

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
                        <DrawerFolder p={p} selected={open?.id === p.id} onPull={() => pull(p.id)} />
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

function folderName(p: ProposalSummary) {
  const [short, ...rest] = p.name.split(/\s*·\s*/);
  return rest.length ? [short, rest.join(' · ')] : [p.client.replace(/（虚构品牌）/g, '').trim(), p.name];
}

function DrawerFolder({ p, selected, onPull }: { p: ProposalSummary; selected: boolean; onPull: () => void }) {
  const t = useT();
  const next = nextFromSummary(p);
  return (
    <button type="button" className="cab-folder" aria-pressed={selected} data-tone={toneFor(p.workbenchId)} onClick={onPull} aria-label={t('home.pullOut', { name: p.name })} >
      <span className="cab-folder__tab" aria-hidden="true">
        {folderName(p)[0]}
      </span>
      <span className="cab-folder__body">
        <span className="cab-folder__name">{folderName(p)[1]}</span>
        <HomeDeadline id={p.id} presentationLocalTime={p.presentationLocalTime} />
        <StatusDot status={p.currentStatus} />
        <span className="cab-folder__next">
          {t('dash.next')}: {nextLabel(t, next)}
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

function nextDestinationLabel(next: NextAction): string {
  if (next.kind === 'decide') return next.stage === 'visual' ? '查看待审稿' : '查看阶段决定';
  if (next.kind === 'confirm_brief') return '查看任务卡';
  if (next.kind === 'fix_research') return '查看研究检查';
  if (next.kind === 'revision') return '查看需修改内容';
  if (next.kind === 'deliver') return '查看提案交付';
  return '查看当前阶段';
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
  const n = ACTIVE_STAGES.indexOf(activeStage(s.currentStage)) + 1;
  const tone = toneFor(pid);
  const kind = next.kind === 'decide' || next.kind === 'fix_research' || next.kind === 'confirm_brief' ? 'attention' : next.kind === 'deliver' ? 'ready' : 'active';

  return (
    <article className="open-folder" data-tone={tone} aria-labelledby={`folder-${s.id}`} style={{ viewTransitionName: `folder-${s.id}` } as CSSProperties}>
      {/* The tab hangs off the folder's back, so it sits level with the top of the cabinet. */}
      <div className="open-folder__back">
        <p className="open-folder__tab">{folderName(s)[0]}</p>
      </div>
      <div className="open-folder__sheets">
        <Link to={nextActionPath(pid, next)} className="sheet sheet--next" data-kind={kind} style={{ '--i': 0 } as CSSProperties}>
          <span className="sheet__label">{t('dash.next')}</span>
          <span className="sheet__big">{nextLabel(t, next)}</span>
          <span className="sheet__go">
            {nextDestinationLabel(next)} <ArrowUpRight size={14} aria-hidden="true" />
          </span>
        </Link>
        <OutputSheet s={s} p={p} />
        <ScopeSheet projectId={pid} proposal={p} />

      </div>

      <div className="open-folder__front">
        <div className="open-folder__meta">
          {/* Stage and status live in the progress row below; the meta line says only what needs you. */}
          {s.attention > 0 && (
            <span className="folder__alert">
              <Hand size={13} aria-hidden="true" /> {s.attention} 项待处理
            </span>
          )}
          <span className="small muted">
            
          </span>
        </div>
        <div className="home-title-row"><h2 id={`folder-${s.id}`} className="open-folder__name" tabIndex={-1}>
          {folderName(s)[1]}
        </h2><HomeDeadline id={s.id} presentationLocalTime={s.presentationLocalTime} /></div>
        <p className="open-folder__summary">{s.summary}</p>
        <div className="open-folder__stage">
          <div className="folder__stage-row">
            <span>当前第{n}阶段 · {t(`pw.stage.${activeStage(s.currentStage)}`)}</span>
            <span className="folder__stage-count">已完成{ACTIVE_STAGES.filter((stage) => s.stageStatus[stage] === 'done').length}/{ACTIVE_STAGES.length}</span>
          </div>
          <div className="track" role="img" aria-label={`当前第${n}阶段：${t(`pw.stage.${activeStage(s.currentStage)}`)}，已完成${ACTIVE_STAGES.filter((stage) => s.stageStatus[stage] === 'done').length}/${ACTIVE_STAGES.length}阶段`}>
            {ACTIVE_STAGES.map((x) => {
              const st = s.stageStatus[x];
              return <span key={x} data-state={st === 'done' ? 'done' : st === 'needs_revision' ? 'blocked' : x === activeStage(s.currentStage) ? 'current' : undefined} />;
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
  const to = out?.kind === 'deck' ? projectPath(s.workbenchId, 'delivery') : projectPath(s.workbenchId, 'proposal', { stage: out?.stage ?? activeStage(s.currentStage) });
  return (
    <Link to={to} className="sheet sheet--art" style={{ '--i': 1 } as CSSProperties}>
      <span className="sheet__label">{out ? t(`pw.output.${out.kind}`) : t('xp.coverPreview')}</span>
      {art ? <ArtFrame spec={art} ratio={[1, 1]} className="sheet__art" /> : <div className="sheet__art muted">尚无提案封面</div>}
      {out && <span className="sheet__caption sheet__lines--text">{out.title}</span>}
    </Link>
  );
}


function ScopeSheet({ projectId, proposal }: { projectId: string; proposal: Proposal | null }) {
  return (
    <Link to={projectPath(projectId, 'proposal', { stage: 'brief' })} className="sheet sheet--scope" style={{ '--i': 2 } as CSSProperties}>
      <span className="sheet__label">交付范围</span>
      {proposal ? (
        <ul className="sheet__scope">
          {proposal.task.scope.slice(0, 3).map((item) => <li key={item}>{item}</li>)}
        </ul>
      ) : <Skeleton lines={3} />}
      <span className="sheet__caption">查看任务卡 <ArrowUpRight size={14} aria-hidden="true" /></span>
    </Link>
  );
}
