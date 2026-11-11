/**
 * Project overview, read top to bottom in the order a person asks about a proposal:
 * 0. the exact pending object and its safe viewing entry;
 * 1. what problem it solves (the assignment, the intended output, the occasion, the scope);
 * 2. how far it has come (the seven stages shown once, as a single track);
 * 3. what still needs confirmation (your decisions, blocked evidence, revisions, open facts);
 * 4. what has been produced so far (each stage's output, posters and slides at their own ratio);
 * 5. your ideas, the work in progress and recent decisions, with the full history one link away.
 *
 * Tile language after the supplied references: the "OxeliaMetrix" lime tile with a notched corner
 * for the progress tile, the black "Efficiency" tile and Patria's big numbers for what needs you,
 * the "Upcoming Meetings" day pills for the stage track, and the Wixel shelf of prints for outputs.
 */
import type { CSSProperties, ReactNode } from 'react';
import { ArrowRight, ArrowUpRight, CircleAlert, CircleHelp, Hand, LoaderCircle, MessageSquarePlus, RotateCcw } from 'lucide-react';
import { useServiceQuery } from '../../app/query';
import { Link, projectPath } from '../../app/router';
import type { Brief, ProjectOverview } from '../../domain/models';
import { ACTIVE_STAGES, activeStage, type Proposal } from '../../domain/proposal';
import { useT } from '../../i18n';
import { needsYou, nextAction, nextActionPath, producedOutputs, type Produced } from '../../proposal/derive';
import { Slide } from '../../proposal/Slide';
import { Backed, DirectionMark, More, STAGE_ICON, StatusPill } from '../../proposal/ui';
import { ArtFrame, naturalRatio } from '../../ui/art/ArtFrame';
import { QueryView, Time } from '../../ui/kit';
import { projectBriefSummary, type ProjectBriefSummary } from '../../proposal/projectDetails';
import { pendingVisuals } from '../../proposal/pending';
import { deckContext } from '../stages/LayoutStage';

export function OverviewArea({ proposal: p, overview }: { proposal: Proposal; overview: ProjectOverview | null }) {
  const t = useT();
  const pid = p.workbenchId;
  const next = nextAction(p, overview);
  const nextText = t(`pw.next.${next.kind}`, { stage: t(`pw.stage.${next.stage}`) });
  const current = p.stages[activeStage(p.currentStage)];
  const n = ACTIVE_STAGES.indexOf(activeStage(p.currentStage)) + 1;
  const done = ACTIVE_STAGES.filter((s) => p.stages[s].status === 'done').length;
  // One shared count (proposal/needs.ts), so Home, the tab badge and this list always agree.
  const needs = needsYou(p);
  const briefOpen = needs.some((x) => x.kind === 'brief');
  const blockers = (overview?.blockers ?? []).filter((b) => b.severity === 'blocking' && p.stages.research.status !== 'done');
  const unknowns = p.task.unknowns;
  const running = p.tasks.filter((x) => x.status === 'running' || x.status === 'queued');
  const inProgress = ACTIVE_STAGES.filter((s) => p.stages[s].status === 'in_progress' && !(s === 'brief' && briefOpen));
  const jobs = overview?.activeJobs ?? [];
  const decisions = [...p.decisions].reverse().slice(0, 3);
  const ideas = [...p.contributions].reverse().slice(0, 3);
  const scored = p.reviews.filter((r) => r.average !== null);
  const avg = scored.length ? scored.reduce((a, r) => a + (r.average ?? 0), 0) / scored.length : null;
  const processNeeds = needs.filter((item) => item.kind !== 'unknowns');
  const confirm = processNeeds.length;
  // The task card is already the problem tile at the top, so the shelf starts from research.
  const produced = producedOutputs(p).filter((x) => x.kind !== 'task');
  const inputArt = p.task.inputs.find((x) => x.art)?.art ?? null;
  // The working brief (the same record the Brief stage reads): key constraints and open questions.
  const briefQ = useServiceQuery(`brief:${pid}`, (s) => s.getBriefHistory(pid), { projectId: pid });
  const pendingArtwork = next.kind === 'decide' && next.stage === 'visual' ? pendingVisuals(p) : [];
  // In-page shortcuts to the two things people come here for.
  const jump = (id: string) => {
    const el = document.getElementById(id);
    el?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    el?.focus({ preventScroll: true });
  };

  return (
    <div className="page pw-page pw-overview bx ov">
      <h1 className="sr-only">{t('pw.area.overview')}</h1>

      <section className="ov-next-action" aria-labelledby="ov-next-action-title">
        <div className="ov-next-action__text">
          <p className="pw-kicker">{needs.length > 0 ? t('xp.pending') : t('pw.ov.next')}</p>
          <h2 id="ov-next-action-title">{nextText}</h2>
          {pendingArtwork.length > 0 ? <ul className="ov-pending-artwork">{pendingArtwork.map((item) => <li key={item.directionId}><span><DirectionMark id={item.directionId} color={item.direction?.color} /> {item.direction?.name ?? item.directionId} · {t('pw.vis.refinedTitle', { v: item.refined.version })}</span><Link className="btn btn--primary btn--sm" to={projectPath(pid, 'proposal', { stage: 'visual', dir: item.directionId, part: 'current', focus: 'artwork' })}>查看待审稿 <ArrowUpRight size={13} aria-hidden="true" /></Link></li>)}</ul> : <p className="ov-next-action__summary">{next.detail || p.stages[next.stage].summary}</p>}
        </div>
        {pendingArtwork.length === 0 && <Link className="btn btn--primary" to={nextActionPath(pid, next)}>{next.kind === 'decide' ? '查看阶段决定' : next.kind === 'fix_research' ? '查看研究检查' : next.kind === 'confirm_brief' ? '查看任务卡' : next.kind === 'deliver' ? '查看提案交付' : '查看当前阶段'} <ArrowRight size={16} aria-hidden="true" /></Link>}
      </section>

      {produced.length > 0 && <div className="ov-jump" role="group" aria-label={t('pw.o.jumpLabel')}>
          <button type="button" className="ov-jump__btn" onClick={() => jump('ov-made-tile')}>
            {t('pw.o.jumpResults')} <span className="ov-jump__n">{produced.length}</span>
          </button>
      </div>}

      <section className="bx-tile bx-tile--white ov-problem" aria-labelledby="ov-problem">
        <div className="ov-problem__text">
          <QueryView query={briefQ}>
            {data => <SavedBriefSummary proposal={p} brief={data.current} />}
          </QueryView>
          <Link className="bx-chip-link ov-problem__link" to={projectPath(pid, 'proposal', { stage: 'brief' })}>
            {t('pw.o.taskCard')} <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        </div>
        {inputArt && <figure className="ov-problem__pic"><ArtFrame spec={inputArt} /></figure>}
      </section>

      {/* 2. How far it has come: the seven stages, shown once. */}
      <section className="bx-tile bx-tile--lime ov-progress" aria-labelledby="ov-progress">
        <div className="bx-notch">
          <StatusPill status={current.status} />
        </div>
        <div className="ov-progress__head">
          <div>
            <p className="bx-bracket">{t('pw.o.progress', { n, total: ACTIVE_STAGES.length })}</p>
            <h2 id="ov-progress" className="ov-progress__stage">
              {t(`pw.stage.${activeStage(p.currentStage)}`)}
            </h2>
            {current.summary && <p className="ov-progress__summary">{current.summary}</p>}
          </div>
          <div className="ov-progress__stats">
            <p className="ov-stat">
              <span className="ov-stat__n">{done}</span>
              <span className="ov-stat__label">{t('pw.o.doneOf8', { total: ACTIVE_STAGES.length })}</span>
            </p>
            {avg !== null && <Link className="ov-stat ov-stat--link" to={projectPath(pid, 'process', { tab: 'reviews' })}>
              <span className="ov-stat__n">{avg === null ? '—' : avg.toFixed(1)}</span>
              <span className="ov-stat__label">
                {t('pw.o.reviewAvg')} <Backed as="prototype" />
              </span>
            </Link>}
          </div>
        </div>
        <nav aria-label={t('pw.stagesLabel')}>
          <ol className="ov-track">
            {ACTIVE_STAGES.map((s, i) => {
              const Icon = STAGE_ICON[s];
              const st = p.stages[s].status;
              return (
                <li key={s} data-status={st} data-current={s === activeStage(p.currentStage) || undefined}>
                  <Link to={projectPath(pid, 'proposal', { stage: s })} aria-current={s === activeStage(p.currentStage) ? 'step' : undefined}>
                    <span className="ov-track__n">{i + 1}</span>
                    <Icon size={15} aria-hidden="true" />
                    <span className="ov-track__name">{t(`pw.stage.${s}`)}</span>
                    <span className="sr-only">: {t(`pw.status.${st}`)}</span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </nav>
      </section>

      {/* 3. What still needs confirmation, with the one next action. */}
      {(processNeeds.some(item => item.kind !== 'brief') || unknowns.length > 0) && <section className="bx-tile bx-tile--dark ov-confirm" id="ov-confirm-tile" tabIndex={-1} aria-labelledby="ov-confirm">
        <div className="ov-confirm__head">
          <h2 id="ov-confirm" className="bx-title">待确认与补充</h2>
          <p className="ov-parts">{confirm} 项流程处理 · {unknowns.length} 个未知事实</p>
          <p className="small bx-muted">阶段决定、修改任务与业务事实分别记录；未知事实的数量按具体条目计算。</p>
        </div>
        <div className="ov-confirm__body">
          {confirm === 0 ? (
            <p className="bx-muted">暂无待确认或需修改的流程事项。</p>
          ) : (
            <ul className="bx-list">
              {processNeeds.map((x) => {
                if (x.kind === 'brief') return <Item key="brief" tone="attention" icon={<Hand size={16} aria-hidden="true" />} to={projectPath(pid, 'proposal', { stage: 'brief' })} title={t('pw.o.briefOpen')} note={t('pw.brief.unconfirmed')} />;
                if (x.kind === 'decide')
                  return <Item key={`d-${x.stage}`} tone="attention" icon={<Hand size={16} aria-hidden="true" />} to={projectPath(pid, 'proposal', { stage: x.stage, focus: 'decision' })} title={t('pw.ov.waiting', { stage: t(`pw.stage.${x.stage}`) })} note={x.stage === p.currentStage ? null : p.stages[x.stage].summary} />;
                if (x.kind === 'revise' && x.stage === 'research' && blockers.length > 0)
                  return <Item key="r-research" tone="bad" icon={<CircleAlert size={16} aria-hidden="true" />} to={projectPath(pid, 'proposal', { stage: 'research', checks: 'research' })} title={t('pw.ov.revising', { stage: t('pw.stage.research') })} note={blockers.map((b) => b.detail || b.title).join(' · ')} backed={<Backed as="connected" />} />;
                if (x.kind === 'revise')
                  return <Item key={`r-${x.stage}`} tone="warn" icon={<RotateCcw size={16} aria-hidden="true" />} to={projectPath(pid, 'proposal', { stage: x.stage })} title={t('pw.ov.revising', { stage: t(`pw.stage.${x.stage}`) })} note={p.stages[x.stage].summary} />;
                return null;
              })}
            </ul>
          )}
          {unknowns.length > 0 && <div className="ov-open-facts">
            <h3><CircleHelp size={16} aria-hidden="true" /> 待补充事实 · {unknowns.length} 个</h3>
            <ul>{unknowns.map((unknown) => <li key={unknown.id}><strong>{unknown.topic}</strong><span>{unknown.why}</span></li>)}</ul>
            <Link className="text-link" to={projectPath(pid, 'proposal', { stage: 'brief', focus: 'unknowns' })}>查看任务卡中的未知事实 <ArrowUpRight size={14} aria-hidden="true" /></Link>
          </div>}
        </div>
      </section>}

      {/* 4. What has been produced so far, in stage order. */}
      {produced.length > 0 && <section className="bx-tile bx-tile--sage ov-made" id="ov-made-tile" tabIndex={-1} aria-labelledby="ov-made">
        <div className="ov-made__head">
          <h2 id="ov-made" className="bx-title">
            {t('pw.o.produced')}
          </h2>
          <p className="ov-made__count">{t('pw.o.producedCount', { count: produced.length })}</p>
        </div>
        {produced.length === 0 ? (
          <p className="muted">{t('pw.o.producedNone')}</p>
        ) : (
          <>
            {/* Text outputs share one row; the pieces (posters, packs, the deck) get a row of their own. */}
            {[produced.filter((x) => x.kind !== 'visual' && x.kind !== 'deck'), produced.filter((x) => x.kind === 'visual' || x.kind === 'deck')].map(
              (row, i) =>
                row.length > 0 && (
                  <ul key={i} className={`ov-shelf ov-shelf--${i === 0 ? 'text' : 'art'}`}>
                    {row.map((x) => (
                      <li key={x.key} data-kind={x.kind} style={x.kind === 'visual' ? ({ '--r': naturalRatio(x.art)[0] / naturalRatio(x.art)[1] } as CSSProperties) : x.kind === 'deck' ? ({ '--r': 16 / 9 } as CSSProperties) : undefined}>
                        <ProducedCard proposal={p} item={x} />
                      </li>
                    ))}
                  </ul>
                ),
            )}
          </>
        )}
      </section>}

      {/* 5. Your ideas, the work in progress and recent decisions. */}
      {(ideas.length + inProgress.length + running.length + jobs.length + decisions.length > 0) ? <div className="ov-row">
        {ideas.length > 0 && <section className="bx-tile bx-tile--lilac ov-ideas" aria-labelledby="ov-ideas">
          <div className="ov-tile-head">
            <h2 id="ov-ideas" className="bx-title">
              {t('pw.bx.ideas')} <span className="ov-count">{p.contributions.length}</span>
            </h2>
          </div>
          {ideas.length === 0 ? (
            <p className="ov-muted">{t('pw.contrib.none')}</p>
          ) : (
            <ul className="ov-ideas__list">
              {ideas.map((c) => (
                <li key={c.id}>
                  <Link to={projectPath(pid, 'proposal', { stage: c.stage, focus: 'ideas' })}>
                    <span className="ov-ideas__meta">
                      {t(`pw.contrib.kind.${c.kind}`)} · {t(`pw.stage.${c.stage}`)}
                    </span>
                    <span className="ov-ideas__text">{c.text}</span>
                    <span className="ov-ideas__status">{t(`pw.contrib.status.${c.status}`)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link className="bx-chip-link ov-tile-foot" to={projectPath(pid, 'proposal', { stage: activeStage(p.currentStage), focus: 'add-idea' })}>
            <MessageSquarePlus size={14} aria-hidden="true" /> {t('pw.contrib.add')}
          </Link>
        </section>}

        {(inProgress.length + running.length + jobs.length > 0) && <section className="bx-tile bx-tile--white ov-active" aria-labelledby="ov-active">
          <h2 id="ov-active" className="bx-title">
            {t('pw.ov.active')}
          </h2>
          {inProgress.length + running.length + jobs.length === 0 ? (
            <p className="ov-muted">{t('pw.ov.idle')}</p>
          ) : (
            <ul className="bx-list">
              {inProgress.map((s) => (
                <Item key={s} tone="info" icon={<LoaderCircle size={16} aria-hidden="true" />} to={projectPath(pid, 'proposal', { stage: s })} title={t('pw.ov.working', { lead: p.stages[s].lead, stage: t(`pw.stage.${s}`) })} note={p.stages[s].summary} backed={<Backed as="prototype" />} />
              ))}
              {running.map((x) => (
                <Item key={x.id} tone="info" icon={<LoaderCircle size={16} aria-hidden="true" />} to={projectPath(pid, 'process', { tab: 'tasks' })} title={x.task} note={x.agent} backed={<Backed as="prototype" />} />
              ))}
              {jobs.map((j) => (
                <Item key={j.id} tone="info" icon={<LoaderCircle size={16} aria-hidden="true" />} to={projectPath(pid, 'process', { tab: 'tasks' })} title={j.label} note={t(`pw.jobStatus.${j.status}`)} backed={<Backed as="connected" />} />
              ))}
            </ul>
          )}
        </section>}

        {decisions.length > 0 && <section className="bx-tile bx-tile--white ov-decisions" aria-labelledby="ov-decisions">
          <h2 id="ov-decisions" className="bx-title">
            {t('pw.ov.decisions')}
          </h2>
          {decisions.length === 0 ? (
            <p className="ov-muted">{t('pw.ov.noDecisions')}</p>
          ) : (
            <ol className="ov-timeline">
              {decisions.map((d) => (
                <li key={d.id} data-kind={d.kind}>
                  <p className="ov-timeline__what">
                    {t(`pw.decision.${d.kind}`)} · {t(`pw.stage.${d.stage}`)}
                  </p>
                  {d.comment && <p className="ov-timeline__quote">“{d.comment}”</p>}
                  <p className="small muted">
                    {d.by} · <Time iso={d.at} relative />
                  </p>
                </li>
              ))}
            </ol>
          )}
          <Link className="bx-chip-link ov-tile-foot" to={projectPath(pid, 'process', { tab: 'decisions' })}>
            {t('pw.ov.allHistory')} <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        </section>}
      </div> : <p className="small muted ov-start-note">确认任务卡后，制作成果与处理记录会逐步出现在这里。</p>}
      {ideas.length === 0 && <div className="ov-start-note"><Link className="text-link small" to={projectPath(pid, 'proposal', { stage: activeStage(p.currentStage), focus: 'add-idea' })}><MessageSquarePlus size={14} aria-hidden="true" /> {t('pw.contrib.add')}</Link></div>}
    </div>
  );
}

/** One output on the shelf. Posters keep their print ratio; the deck shows its real cover slide. */
function ProducedCard({ proposal: p, item: x }: { proposal: Proposal; item: Produced }) {
  const t = useT();
  const pid = p.workbenchId;
  const to = x.kind === 'deck' ? projectPath(pid, 'delivery') : projectPath(pid, 'proposal', { stage: x.stage, ...(x.kind === 'visual' && x.direction ? { dir: x.direction.id } : {}) });
  const labelText = x.kind === 'visual' ? t('pw.o.visualOf', { dir: x.direction ? `${x.direction.id} · ${x.direction.name}` : '' }) : x.kind === 'deck' ? t('pw.o.deck', { count: x.slides }) : x.kind === 'theme' ? t('pw.o.directions', { count: x.directions.length }) : t(`pw.output.${x.kind}`);
  const label = <span className="ov-card__label">{labelText}</span>;

  if (x.kind === 'visual') {
    return (
      <Link to={to} className="ov-card ov-card--print" data-status={x.status}>
        <ArtFrame spec={x.art} title={labelText} />
        {label}
        {/* Under the piece, never on it, so the artwork is always shown whole. */}
        {x.status !== 'accepted' && <span className="ov-card__state">{t(`pw.vis.refined.${x.status}`)}</span>}
      </Link>
    );
  }
  if (x.kind === 'deck') {
    const style = p.layout?.styles.find((s) => s.id === p.layout?.chosen) ?? p.layout?.styles[0];
    const cover = p.layout?.slides.find((s) => s.kind === 'cover') ?? p.layout?.slides[0];
    return (
      <Link to={to} className="ov-card ov-card--deck">
        <span className="ov-card__slide" aria-hidden="true">
          {style && cover && <Slide slide={cover} style={style} index={p.layout!.slides.indexOf(cover)} deck={deckContext(p)} label="" />}
        </span>
        {label}
      </Link>
    );
  }
  if (x.kind === 'theme') {
    return (
      <Link to={to} className="ov-card ov-card--text">
        {label}
        <ul className="ov-card__dirs">
          {x.directions.map((d) => (
            <li key={d.id} data-rec={d.id === x.recommended || undefined}>
              <DirectionMark id={d.id} color={d.color} />
              <span>{d.slogan}</span>
            </li>
          ))}
        </ul>
        <Arrow />
      </Link>
    );
  }
  return (
    <Link to={to} className="ov-card ov-card--text" data-kind={x.kind}>
      {label}
      <span className="ov-card__title">{x.title}</span>
      {x.text && <span className="ov-card__text">{x.text}</span>}
      <Arrow />
    </Link>
  );
}

const Arrow = () => (
  <span className="ov-card__orb" aria-hidden="true">
    <ArrowUpRight size={15} />
  </span>
);

function Item({ tone, icon, to, title, note, backed }: { tone: string; icon: ReactNode; to?: string; title: string; note?: string | null; backed?: ReactNode }) {
  return (
    <li data-tone={tone}>
      <span className="bx-list__icon">{icon}</span>
      <div>
        {to ? (
          <Link to={to} className="bx-list__title">
            {title}
          </Link>
        ) : (
          <p className="bx-list__title">{title}</p>
        )}
        {note && <p className="bx-list__note">{note}</p>}
      </div>
      {backed}
    </li>
  );
}

function SavedBriefSummary({ proposal, brief }: { proposal: Proposal; brief: Brief | null }) {
  const summary = projectBriefSummary({ brief, task: proposal.task });
  const hasDetails = Boolean(summary.audience || summary.brand || summary.timeline || summary.constraints.length || summary.openQuestions.length || (summary.source === 'proposal' && summary.scope.length));
  return <>
    <p className="bx-bracket">{summary.source === 'brief' ? `${summary.confirmed ? '已确认任务摘要' : '草稿任务摘要'} · 第${summary.version}版` : '提案任务摘要'}</p>
    <h2 id="ov-problem" className="ov-problem__title">{summary.background || '项目背景待补充'}</h2>
    <dl className="ov-facts ov-facts--saved">
      <div><dt>交付内容</dt><dd>{summary.deliverables.length ? <ul className="ov-lines">{summary.deliverables.map((value, index) => <li key={index}>{value}</li>)}</ul> : <span className="muted">交付内容待补充</span>}</dd></div>
      {summary.source === 'proposal' && proposal.task.occasion && <div><dt>使用场景</dt><dd>{proposal.task.occasion}</dd></div>}
    </dl>
    {hasDetails && <More label="查看任务补充信息"><SummaryDetails summary={summary} /></More>}
  </>;
}

function SummaryDetails({ summary }: { summary: ProjectBriefSummary }) {
  const rows: Array<{ label: string; values: string[] }> = [
    { label: '品牌或产品', values: summary.brand ? [summary.brand] : [] },
    { label: '目标受众', values: summary.audience ? [summary.audience] : [] },
    { label: summary.source === 'proposal' ? '范围' : '限制条件', values: summary.source === 'proposal' ? summary.scope : summary.constraints },
    { label: '调研要解决的问题', values: summary.researchQuestions },
  ];
  return <dl className="ov-fullbrief">{rows.filter(row => row.values.length).map(row => <div key={row.label}><dt>{row.label}</dt><dd><ul className="ov-lines">{row.values.map((value, index) => <li key={index}>{value}</li>)}</ul></dd></div>)}</dl>;
}
