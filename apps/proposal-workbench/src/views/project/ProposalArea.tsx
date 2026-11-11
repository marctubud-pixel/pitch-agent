/**
 * The proposal workspace: the eight creative stages. Each stage page leads with the work itself;
 * reviews are summarised in one line and the detail lives in Process & History.
 */
import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Hand, MessageSquarePlus } from 'lucide-react';
import { useProposalAction } from '../../app/proposalQuery';
import { Link, projectPath, useRouter } from '../../app/router';
import { STAGES, type Contribution, type Proposal, type StageId } from '../../domain/proposal';
import { useT } from '../../i18n';
import { Backed, STAGE_ICON, STATUS_ICON, StatusPill } from '../../proposal/ui';
import { Action, Time } from '../../ui/kit';
import { BriefStage } from '../stages/BriefStage';
import { ContentReviewStage } from '../stages/ContentReviewStage';
import { DeliveryStage } from '../stages/DeliveryStage';
import { LayoutStage } from '../stages/LayoutStage';
import { ResearchStage } from '../stages/ResearchStage';
import { StrategyStage } from '../stages/StrategyStage';
import { ThemesStage } from '../stages/ThemesStage';
import { VisualStage } from '../stages/VisualStage';

const BACKING: Record<StageId, 'connected' | 'prototype'> = {
  brief: 'connected',
  research: 'connected',
  strategy: 'prototype',
  themes: 'prototype',
  visual: 'prototype',
  content_review: 'prototype',
  layout: 'prototype',
  delivery: 'prototype',
};

export function ProposalArea({ proposal: p, stage }: { proposal: Proposal; stage: StageId }) {
  const t = useT();
  const pid = p.workbenchId;
  const state = p.stages[stage];
  const i = STAGES.indexOf(stage);
  const prev = STAGES[i - 1];
  const next = STAGES[i + 1];
  const reviews = p.reviews.filter((r) => r.stage === stage);
  const lastReview = reviews[reviews.length - 1];
  const challenges = reviews.filter((r) => r.challenge).length;
  const isCheckpoint = p.mode === 'assisted' && (p.checkpoints as StageId[]).includes(stage);
  useFocusTarget(stage);
  // On narrow screens the stage chips scroll sideways: bring the current one into view (the row only).
  useEffect(() => {
    const row = document.querySelector<HTMLElement>('.sp-spines ol');
    const cur = row?.querySelector<HTMLElement>('li[data-current]');
    if (!row || !cur || row.scrollWidth <= row.clientWidth) return;
    row.scrollTo({ left: Math.max(0, cur.offsetLeft - (row.clientWidth - cur.offsetWidth) / 2) });
  }, [stage]);

  return (
    <div className="pw-proposal">
      <div className="page pw-page pw-stage" data-stage={stage}>
        {/*
          Stage header after the supplied "family office" and Atomix pages: the stage's title block
          on the left and the eight stages as tall coloured spines on the right (colour = status),
          each with its icon at the top, a vertical label and a round arrow at the foot. On narrow
          screens the spines become a row of pills.
        */}
        <section className="sp-hero">
          <div className="sp-hero__text">
            <header className="pw-stage__head">
              <div className="pw-stage__title">
                <p className="pw-kicker">
                  {t('pw.stageOf', { n: i + 1 })} · {state.lead}
                  {state.version > 1 && ` · v${state.version}`}
                </p>
                <h1 className="pw-h1" id="stage-title" tabIndex={-1}>
                  {t(`pw.stage.${stage}`)}
                </h1>
                <p className="pw-lede">{t(`pw.purpose.${stage}`)}</p>
              </div>
              <div className="pw-stage__meta">
                <StatusPill status={state.status} />
                <Backed as={BACKING[stage]} note={stage === 'brief' || stage === 'research' ? t('pw.backing.partly') : undefined} />
                {/* While the stage waits, the status already says so; otherwise the checkpoint is a quiet note. */}
                {isCheckpoint && state.status !== 'waiting_for_you' && (
                  <span className="pw-tag" data-tone="neutral">
                    <Hand size={12} aria-hidden="true" /> {t('pw.checkpoint')}
                  </span>
                )}
              </div>
            </header>
            {state.summary && (
              <p className="pw-stage__summary">
                {state.summary}
                {state.updatedAt && (
                  <span className="muted">
                    {' '}
                    · <Time iso={state.updatedAt} relative />
                  </span>
                )}
              </p>
            )}
            {lastReview && (
              <p className="pw-reviewline">
                <span className="pw-label">{t('pw.reviewLine')}</span> {lastReview.verdict}
                {lastReview.average !== null && <> · {t('pw.avgShort', { avg: lastReview.average.toFixed(1) })}</>}
                {challenges > 0 && <> · {t('pw.challenges', { count: challenges })}</>}{' '}
                <Link className="text-link" to={projectPath(pid, 'process', { tab: 'reviews', stage })}>
                  {t('pw.reviewDetail')}
                </Link>
              </p>
            )}
          </div>

          <nav className="sp-spines" aria-label={t('pw.stagesLabel')}>
            <ol>
              {STAGES.map((s, n) => {
                const Icon = STAGE_ICON[s];
                const SIcon = STATUS_ICON[p.stages[s].status];
                const cp = p.mode === 'assisted' && (p.checkpoints as StageId[]).includes(s);
                return (
                  <li key={s} data-status={p.stages[s].status} data-current={s === stage || undefined}>
                    <Link to={projectPath(pid, 'proposal', { stage: s })} aria-current={s === stage ? 'step' : undefined} className="sp-spine">
                      <span className="sp-spine__top">
                        <span className="sp-spine__icon">
                          <Icon size={15} aria-hidden="true" />
                        </span>
                        <span className="sp-spine__n">{n + 1}</span>
                        {cp && <Hand size={13} aria-hidden="true" className="sp-spine__cp" />}
                      </span>
                      <span className="sp-spine__name">{t(`pw.stage.${s}`)}</span>
                      <span className="sp-spine__foot" aria-hidden="true">
                        <SIcon size={15} />
                      </span>
                      <span className="sr-only">
                        : {t(`pw.status.${p.stages[s].status}`)}
                        {cp ? `, ${t('pw.checkpoint')}` : ''}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </nav>
        </section>

        {state.status === 'waiting_for_you' && <CheckpointPanel proposal={p} stage={stage} />}

        <div className="pw-stage__body">
          {stage === 'brief' && <BriefStage proposal={p} />}
          {stage === 'research' && <ResearchStage proposal={p} />}
          {stage === 'strategy' && <StrategyStage proposal={p} />}
          {stage === 'themes' && <ThemesStage proposal={p} />}
          {stage === 'visual' && <VisualStage proposal={p} />}
          {stage === 'content_review' && <ContentReviewStage proposal={p} />}
          {stage === 'layout' && <LayoutStage proposal={p} />}
          {stage === 'delivery' && <DeliveryStage proposal={p} />}
        </div>

        <Contributions proposal={p} stage={stage} />

        <nav className="pw-stage__pager" aria-label={t('pw.stagePager')}>
          {prev ? (
            <Link to={projectPath(pid, 'proposal', { stage: prev })} className="pw-pager">
              <ArrowLeft size={16} aria-hidden="true" />
              <span>
                <span className="pw-label">{t('pw.prevStage')}</span>
                {t(`pw.stage.${prev}`)}
              </span>
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link to={projectPath(pid, 'proposal', { stage: next })} className="pw-pager pw-pager--next">
              <span>
                <span className="pw-label">{t('pw.nextStage')}</span>
                {t(`pw.stage.${next}`)}
              </span>
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          )}
        </nav>
      </div>
    </div>
  );
}

/**
 * Links can name a part of the stage to land on (`?focus=decision`, `ideas`, `unknowns`): the page
 * scrolls it into view and moves keyboard focus there, instead of leaving people at the top.
 */
function useFocusTarget(stage: StageId) {
  const { params } = useRouter();
  const focus = params.get('focus');
  useEffect(() => {
    if (!focus) return;
    const id = requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-focus="${CSS.escape(focus)}"]`);
      if (!el) return;
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      el.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, [focus, stage]);
}

/** A stage paused for a person in assisted mode. Nothing moves on without an explicit decision. */
function CheckpointPanel({ proposal: p, stage }: { proposal: Proposal; stage: StageId }) {
  const t = useT();
  const { run, pending, error } = useProposalAction();
  const { setParams } = useRouter();
  const [comment, setComment] = useState('');
  // Once decided the panel goes away: focus moves to the stage title, and the link target is cleared.
  const decided = (ok: boolean) => {
    if (!ok) return;
    setParams({ focus: null });
    requestAnimationFrame(() => document.getElementById('stage-title')?.focus());
  };
  return (
    <section className="pw-checkpoint" aria-labelledby="cp-title" data-focus="decision" tabIndex={-1}>
      <div className="pw-checkpoint__head">
        <Hand size={20} aria-hidden="true" />
        <div>
          <h2 id="cp-title">{t('pw.cp.title')}</h2>
          <p className="small">{t('pw.cp.body')}</p>
        </div>
        <Backed as="prototype" />
      </div>
      <label htmlFor="cp-comment" className="field__label">
        {t('pw.cp.comment')}
      </label>
      <textarea id="cp-comment" className="pw-textarea" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('pw.cp.placeholder')} />
      <div className="cluster">
        <Action
          label={t('pw.cp.approve')}
          variant="primary"
          pending={pending === 'approve'}
          onClick={() => void run('approve', (s) => s.decide(p.id, stage, { kind: 'approve', comment }), t('pw.cp.approved', { stage: t(`pw.stage.${stage}`) })).then(decided)}
        />
        <Action
          label={t('pw.cp.revise')}
          pending={pending === 'revise'}
          disabled={!comment.trim()}
          reason={t('pw.cp.reviseNeedsComment')}
          onClick={() => void run('revise', (s) => s.decide(p.id, stage, { kind: 'request_revision', comment }), t('pw.cp.revising')).then(decided)}
        />
      </div>
      <p className="small muted">{t('pw.cp.silence')}</p>
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

const KINDS: Contribution['kind'][] = ['comment', 'slogan', 'reference', 'theme'];

/** People can add ideas at any stage: a comment, a line, a reference and what to borrow from it. */
function Contributions({ proposal: p, stage }: { proposal: Proposal; stage: StageId }) {
  const t = useT();
  const { run, pending, error } = useProposalAction();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Contribution['kind']>('comment');
  const [text, setText] = useState('');
  const [borrow, setBorrow] = useState('');
  const mine = p.contributions.filter((c) => c.stage === stage);
  // "Add an idea" links open the form straight away and put the cursor in it.
  const { params } = useRouter();
  const wantsForm = params.get('focus') === 'add-idea';
  useEffect(() => {
    if (wantsForm) setOpen(true);
  }, [wantsForm, stage]);
  // Focus once the form exists, and after the app's own move to the page heading (one frame
  // after navigation), so the cursor really ends up in the box.
  useEffect(() => {
    if (!wantsForm || !open) return;
    let id = requestAnimationFrame(() => {
      id = requestAnimationFrame(() => {
        const box = document.getElementById(`ct-${stage}`);
        box?.scrollIntoView({ block: 'center' });
        box?.focus({ preventScroll: true });
      });
    });
    return () => cancelAnimationFrame(id);
  }, [wantsForm, open, stage]);
  return (
    <section className="pw-contrib" aria-labelledby={`contrib-${stage}`} data-focus="ideas" tabIndex={-1}>
      <div className="pw-sh">
        <h2 id={`contrib-${stage}`} className="pw-h3">
          {t('pw.contrib.title')}
        </h2>
        {!open && (
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => setOpen(true)}>
            <MessageSquarePlus size={14} aria-hidden="true" /> {t('pw.contrib.add')}
          </button>
        )}
      </div>
      {mine.length > 0 && (
        <ul className="pw-contrib__list">
          {mine.map((c) => (
            <li key={c.id}>
              <span className="pw-tag">{t(`pw.contrib.kind.${c.kind}`)}</span>
              <p>{c.text}</p>
              {c.borrow && (
                <p className="small">
                  <span className="pw-label">{t('pw.contrib.borrow')}</span> {c.borrow}
                </p>
              )}
              {c.response && <p className="small muted">↳ {c.response}</p>}
              <p className="small muted">
                {c.by} · <Time iso={c.at} relative /> · {t(`pw.contrib.status.${c.status}`)}
              </p>
            </li>
          ))}
        </ul>
      )}
      {mine.length === 0 && !open && <p className="small muted">{t('pw.contrib.none')}</p>}
      {open && (
        <form
          className="pw-contrib__form"
          onSubmit={(e) => {
            e.preventDefault();
            void run('contrib', (s) => s.contribute(p.id, stage, { kind, text, borrow: kind === 'reference' ? borrow : null }), t('pw.contrib.sent')).then((ok) => {
              if (ok) {
                setText('');
                setBorrow('');
                setOpen(false);
              }
            });
          }}
        >
          <div className="pw-seg" role="radiogroup" aria-label={t('pw.contrib.kindLabel')}>
            {KINDS.map((k) => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}>
                {t(`pw.contrib.kind.${k}`)}
              </button>
            ))}
          </div>
          <label className="field__label" htmlFor={`ct-${stage}`}>
            {t(`pw.contrib.textLabel.${kind}`)}
          </label>
          <textarea id={`ct-${stage}`} className="pw-textarea" rows={2} value={text} onChange={(e) => setText(e.target.value)} />
          {kind === 'reference' && (
            <>
              <label className="field__label" htmlFor={`cb-${stage}`}>
                {t('pw.contrib.borrowLabel')}
              </label>
              <input id={`cb-${stage}`} className="pw-input" value={borrow} onChange={(e) => setBorrow(e.target.value)} placeholder={t('pw.contrib.borrowPh')} />
            </>
          )}
          <div className="cluster">
            <Action label={t('pw.contrib.send')} type="submit" variant="primary" pending={pending === 'contrib'} disabled={!text.trim()} reason={null} />
            <button type="button" className="btn btn--ghost" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </button>
          </div>
          <p className="small muted">{t('pw.contrib.note')}</p>
          {error && (
            <p className="field__error" role="alert">
              {error}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
