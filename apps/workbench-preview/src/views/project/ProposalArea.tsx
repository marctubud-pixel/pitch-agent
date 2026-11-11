/**
 * The proposal workspace: the seven creative stages. Each stage page leads with the work itself;
 * reviews are summarised in one line and the detail lives in Process & History.
 */
import { useEffect, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Hand, MessageSquarePlus } from 'lucide-react';
import { useProposalAction } from '../../app/proposalQuery';
import { useServiceContext } from '../../app/services';
import { Link, projectPath, useRouter } from '../../app/router';
import { ACTIVE_STAGES, type Contribution, type Proposal, type StageId, type ActiveStageId } from '../../domain/proposal';
import { useT } from '../../i18n';
import { useTeam } from '../../collaboration/context';
import { ROLE_LABELS } from '../../collaboration/types';
import { contributionTargetLabel, displayedTarget } from '../../proposal/contributionTargets';
import { clearIfUnchanged, draftKey, pendingDrafts, readDraft, snapshotDraft, useIdeaDraft } from '../../proposal/drafts';
import { pendingVisuals } from '../../proposal/pending';
import { latestRevisionRequest, matchingTextIn } from '../../proposal/revisions';
import { recordDestination } from '../../proposal/recordTargets';
import { Backed, STAGE_ICON, STATUS_ICON, StatusPill } from '../../proposal/ui';
import { Action, Time } from '../../ui/kit';
import { BriefStage } from '../stages/BriefStage';
import { BriefVersionRecords } from '../../proposal/BriefVersionRecords';
import { DeliveryStage } from '../stages/DeliveryStage';
import { LayoutStage } from '../stages/LayoutStage';
import { ResearchStage } from '../stages/ResearchStage';
import { StrategyStage } from '../stages/StrategyStage';
import { ThemesStage } from '../stages/ThemesStage';
import { isQingyuVisualPreview } from '../../proposal/qingyu-visual/eligibility';
import { stageOwnerLabel } from '../../proposal/stageOwners';
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

export function ProposalArea({ proposal: p, stage }: { proposal: Proposal; stage: ActiveStageId }) {
  const t = useT();
  const {service, proposals} = useServiceContext();
  const connectedStrategy = stage === 'strategy' && proposals.backing === 'connected' && Boolean(service.simpleStrategy);
  const connectedCopy = stage === 'themes' && proposals.backing === 'connected' && Boolean(service.copyWorkflow);
  const pid = p.workbenchId;
  const state = p.stages[stage];
  const i = ACTIVE_STAGES.indexOf(stage);
  const prev = ACTIVE_STAGES[i - 1];
  const next = ACTIVE_STAGES[i + 1];
  const reviews = p.reviews.filter((r) => r.stage === stage);
  const lastReview = reviews[reviews.length - 1];
  const challenges = reviews.filter((r) => r.challenge).length;
  const visualPreview = stage === 'visual' && isQingyuVisualPreview(p);
  const collaboration = <Contributions key={`${p.id}::${stage}`} proposal={p} stage={stage} />;
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
          on the left and the seven stages as tall coloured spines on the right (colour = status),
          each with its icon at the top, a vertical label and a round arrow at the foot. On narrow
          screens the spines become a row of pills.
        */}
        <section className="sp-hero" data-status={state.status}>
          <div className="sp-hero__text">
            <header className="pw-stage__head">
              <div className="pw-stage__title">
                <p className="pw-kicker">
                  {t('pw.stageOf', { n: i + 1, total: ACTIVE_STAGES.length })} · {stageOwnerLabel(stage, state.lead)}
                  {state.version > 1 && ` · ${t('pw.cp.stageVersion', { v: state.version })}`}
                </p>
                <h1 className="pw-h1" id="stage-title" tabIndex={-1}>
                  {t(`pw.stage.${stage}`)}
                </h1>
                <p className="pw-lede">{t(`pw.purpose.${stage}`)}</p>
              </div>
              <div className="pw-stage__meta">
                <StatusPill status={state.status} />
                <Backed as={connectedStrategy || connectedCopy ? 'connected' : BACKING[stage]} note={connectedCopy ? '文案正文、核验与评审记录来自本地服务；模拟评审不代表客户批准。' : connectedStrategy ? '策略正文、核验与负责人交接来自本地服务。' : (stage === 'layout' || stage === 'delivery') && p.id === 'qingyu-pack' && p.layout === null ? '当前演练稿；本地终审与正式流程状态分别记录' : visualPreview ? '设计试稿预览，含构图探索与模拟样机；正式流程状态保持。' : p.id === 'qingyu-pack' && pid === 'qingyu' && p.type === 'packaging' && stage === 'strategy' && p.strategy === null ? '策略分析为定位建设与优先验证方向预览；未启动正式策略流程。' : stage === 'brief' || stage === 'research' ? t('pw.backing.partly') : undefined} />
                {/* While the stage waits, the status already says so; otherwise the checkpoint is a quiet note. */}
                {isCheckpoint && state.status !== 'waiting_for_you' && (
                  <span className="pw-tag" data-tone="neutral">
                    <Hand size={12} aria-hidden="true" /> {t('pw.checkpoint')}
                  </span>
                )}
              </div>
            </header>
            {(
              <details className="stage-detail" open={!(pid === 'qingyu' && stage === 'research') && state.status === 'needs_revision' || undefined}>
                <summary>{t('xp.details')}{lastReview?.average !== null && lastReview?.average !== undefined && <span> · {t('pw.avgShort', { avg: lastReview.average.toFixed(1) })}</span>}</summary>
                <p className="stage-purpose">{t(`pw.purpose.${stage}`)}</p>
                {state.summary && <p className="pw-stage__summary">{state.summary}{state.updatedAt && <> · <Time iso={state.updatedAt} relative /></>}</p>}
                {lastReview && <p className="pw-reviewline">{lastReview.verdict}{challenges > 0 && <> · {t('pw.challenges', { count: challenges })}</>} <Link className="text-link" to={projectPath(pid, 'process', { tab: 'reviews', stage })}>{t('pw.reviewDetail')}</Link></p>}
              </details>
            )}
          </div>

          <nav className="sp-spines" aria-label={t('pw.stagesLabel')}>
            <ol>
              {ACTIVE_STAGES.map((s, n) => {
                const Icon = STAGE_ICON[s];
                const SIcon = STATUS_ICON[p.stages[s].status];
                const cp = p.mode === 'assisted' && (p.checkpoints as StageId[]).includes(s);
                return (
                  <li key={s} data-status={p.stages[s].status} data-current={s === stage || undefined}>
                    <Link to={projectPath(pid, 'proposal', { stage: s })} aria-current={s === stage ? 'step' : undefined} className="sp-spine" aria-label={`${n + 1}. ${t(`pw.stage.${s}`)} · ${t(`pw.status.${p.stages[s].status}`)}${cp ? ` · ${t('pw.checkpoint')}` : ''}`}>
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

        {state.status === 'waiting_for_you' && stage !== 'visual' && stage !== 'delivery' && <CheckpointPanel proposal={p} stage={stage} />}
        {state.status === 'needs_revision' && <RevisionStatus proposal={p} stage={stage} />}

        {stage !== 'visual' && <StageVersionNotice proposal={p} stage={stage} />}
        <div className="pw-stage__workspace" data-sidebar={stage === 'brief' || undefined}>
        <div className="pw-stage__main">
        <div className="pw-stage__body" id="stage-work" data-focus="stage-work" tabIndex={-1}>
          {stage === 'brief' && <BriefStage proposal={p} />}
          {stage === 'research' && <ResearchStage proposal={p} />}
          {stage === 'strategy' && <StrategyStage proposal={p} />}
          {stage === 'themes' && <ThemesStage proposal={p} />}
          {stage === 'visual' && <VisualStage proposal={p} collaboration={visualPreview ? collaboration : undefined} />}
          {stage === 'layout' && <LayoutStage proposal={p} />}
          {stage === 'delivery' && <DeliveryStage proposal={p} />}
        </div>

        {state.status === 'waiting_for_you' && (stage === 'visual' || stage === 'delivery') && <CheckpointPanel proposal={p} stage={stage} />}
        </div>
        {!visualPreview && <aside className="pw-stage__ideas" aria-label={stage === 'brief' ? '协作与版本记录' : t('pw.contrib.title')}>
          {stage === 'brief' && <BriefVersionRecords projectId={pid} />}
          {collaboration}
        </aside>}
        </div>

        {stage !== 'brief' && <nav className="pw-stage__pager" aria-label={t('pw.stagePager')}>
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
        </nav>}
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
    let frame = 0;
    const locate = () => {
      const el = document.querySelector<HTMLElement>(`[data-focus="${CSS.escape(focus)}"]`);
      if (!el) return false;
      for (let parent = el.parentElement; parent; parent = parent.parentElement) {
        if (parent instanceof HTMLDetailsElement) parent.open = true;
      }
      frame = requestAnimationFrame(() => {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
        el.focus({ preventScroll: true });
      });
      return true;
    };
    if (locate()) return () => cancelAnimationFrame(frame);
    const observer = new MutationObserver(() => { if (locate()) observer.disconnect(); });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [focus, stage]);
}

/**
 * A stage paused for a person in assisted mode. Nothing moves on without an explicit decision.
 *
 * The decision is about the whole stage (the service's `decide` takes a stage, not a direction or
 * an artwork): approving completes the stage and lets the agents move on; asking for a revision
 * sends the stage back. The panel says so, and names the work that is actually waiting, so the
 * person knows what they are looking at before they decide.
 */
function CheckpointPanel({ proposal: p, stage }: { proposal: Proposal; stage: StageId }) {
  const t = useT();
  const { can, snapshot } = useTeam();
  const canDecide = can({ kind: 'decide', stage });
  const { run, pending, error } = useProposalAction();
  const { setParams } = useRouter();
  const [comment, setComment] = useState('');
  const state = p.stages[stage];
  const stageName = t(`pw.stage.${stage}`);
  const waitingWork = stage === 'visual' ? pendingVisuals(p) : [];
  // Once decided the panel goes away: focus moves to the stage title, and the link target is cleared.
  const decided = (ok: boolean) => {
    if (!ok) return;
    setParams({ focus: null });
    requestAnimationFrame(() => document.getElementById('stage-title')?.focus());
  };
  const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Shows the waiting work without deciding anything: selects its direction and scrolls to it.
  const viewWork = (dir: string | null) => {
    if (dir) setParams({ dir, part: 'current', version: null, focus: null });
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = document.getElementById(dir ? 'vis-refined' : 'stage-work');
        el?.scrollIntoView({ block: 'start', behavior: reduce() ? 'auto' : 'smooth' });
        el?.focus({ preventScroll: true });
      }),
    );
  };
  return (
    <section className="pw-checkpoint" aria-labelledby="cp-title" data-focus="decision" tabIndex={-1}>
      <div className="pw-checkpoint__head">
        <Hand size={20} aria-hidden="true" />
        <div>
          <h2 id="cp-title">{t('pw.cp.title')}</h2>
          <p className="small">{stage === 'delivery' ? '请先查看本页成稿与终审记录。批准后进入交付；如需修改，请说明要改什么。' : t('pw.cp.body')}</p>
        </div>
        <Backed as="prototype" />
      </div>

      <dl className="pw-cp-target">
        <div>
          <dt className="pw-label">{t('pw.cp.scopeLabel')}</dt>
          <dd>
            {t('pw.cp.scopeStage', { stage: stageName })} <span className="muted">· {t('pw.cp.stageVersion', { v: state.version })}</span>
            <span className="small muted pw-cp-target__note">{t('pw.cp.scopeNote')}</span>
          </dd>
        </div>
        {waitingWork.map((w) => (
          <div key={w.directionId} className="pw-cp-target__work">
            <dt className="pw-label">{t('pw.cp.pendingLabel')}</dt>
            <dd>
              <strong>
                {t('pw.cp.direction', { id: w.directionId, name: w.direction?.name ?? '' })}
              </strong>{' '}
              · {t('pw.cp.artwork', { v: w.refined.version })}
              <span className="small">
                <span className="pw-label">{t('pw.cp.changes')}</span> {w.previous ? t('pw.cp.changesNotRecorded', { prev: w.previous.version }) : t('pw.cp.changesFirst')}
              </span>
              <span className="small">
                <span className="pw-label">{t('pw.cp.issues')}</span>{' '}
                {w.openIssues.length === 0
                  ? t('pw.cp.noIssues')
                  : w.openIssues
                      .map((x) =>
                        x.kind === 'requirement'
                          ? t('pw.cp.unmet', { text: x.text })
                          : x.kind === 'below'
                            ? t('pw.cp.below', { avg: x.avg.toFixed(1) })
                            : `${t(`pw.challenge.${x.outcome}`)}: ${x.text}`,
                      )
                      .join(' · ')}
              </span>
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => viewWork(w.directionId)}>
                {t('pw.cp.view')} <ArrowDown size={14} aria-hidden="true" />
              </button>
            </dd>
          </div>
        ))}
        {stage === 'visual' && waitingWork.length === 0 && (
          <div>
            <dt className="pw-label">{t('pw.cp.pendingLabel')}</dt>
            <dd className="muted">{t('pw.cp.noWorkData')}</dd>
          </div>
        )}
        {stage !== 'visual' && (
          <div>
            <dt className="pw-label">{t('pw.cp.pendingLabel')}</dt>
            <dd>
              <span className="muted">{stage === 'delivery' ? '终审与交付的成果，见上方。' : t('pw.cp.stageWork', { stage: stageName })}</span>{' '}
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => viewWork(null)}>
                {t('pw.cp.view')} {stage === 'delivery' ? <ArrowUp size={14} aria-hidden="true" /> : <ArrowDown size={14} aria-hidden="true" />}
              </button>
            </dd>
          </div>
        )}
      </dl>

      <RevisionStatus proposal={p} stage={stage} />

      {canDecide ? <>
      <label htmlFor="cp-comment" className="field__label">
        {t('pw.cp.comment')}
      </label>
      <textarea id="cp-comment" className="pw-textarea" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('pw.cp.placeholder')} />
      <div className="cluster">
        <Action
          label={t('pw.cp.approveStage', { stage: stageName })}
          variant="primary"
          pending={pending === 'approve'}
          onClick={() => void run('approve', (s) => s.decide(p.id, stage, { kind: 'approve', comment }, { expectedRevision: p.revision, actor: snapshot.actor }), t('pw.cp.approved', { stage: stageName })).then(decided)}
        />
        <Action
          label={t('pw.cp.revise')}
          pending={pending === 'revise'}
          disabled={!comment.trim()}
          reason={t('pw.cp.reviseNeedsComment')}
          onClick={() => void run('revise', (s) => s.decide(p.id, stage, { kind: 'request_revision', comment }, { expectedRevision: p.revision, actor: snapshot.actor }), t('pw.cp.revising')).then(decided)}
        />
      </div>
      <p className="small muted">{t('pw.cp.silence')}</p>
      </> : <p className="small muted">当前身份只能查看本阶段决定；审批需由获授权的负责人完成。</p>}
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

/**
 * What happened to the person's own revision request for this stage, read-only and only from
 * recorded data: the request, the recorded response, and the stage version it produced. When the
 * prototype only simulates the revision round (the content is not regenerated), it says so plainly.
 */
function RevisionStatus({ proposal: p, stage }: { proposal: Proposal; stage: StageId }) {
  const t = useT();
  const { proposals } = useServiceContext();
  const st = latestRevisionRequest(p, stage);
  if (!st) return null;
  const status = p.stages[stage].status;
  const returned = status === 'waiting_for_you' && st.versions.length > 0;
  const review = st.reviews[st.reviews.length - 1] ?? null;
  const version = st.versions[st.versions.length - 1] ?? null;
  // The prototype's revision round changes only the state and version number, and records that.
  const simulatedOnly = proposals.backing === 'prototype' && returned && review !== null;
  return (
    <section className="pw-rev pw-rev--request" aria-labelledby={`rq-${stage}`}>
      <p className="pw-label" id={`rq-${stage}`}>
        {t('pw.rev.yourRequest')}
      </p>
      <ol className="pw-rev__steps">
        <li>
          <span className="pw-rev__k">{t('pw.rev.request')}</span>
          <span>
            “{st.request.comment}” <span className="small muted">· {st.request.by} · <Time iso={st.request.at} relative /></span>
          </span>
        </li>
        <li>
          <span className="pw-rev__k">{t('pw.rev.response')}</span>
          <span>
            {review ? (
              <>
                “{review.verdict}” <span className="small muted">· {review.evaluator}</span>
              </>
            ) : (
              <span className="muted">{proposals.backing === 'prototype' ? t('pw.rev.notConnected') : t('pw.rev.noRecords')}</span>
            )}
          </span>
        </li>
        <li>
          <span className="pw-rev__k">{t('pw.rev.version')}</span>
          <span>{version ? t('pw.rev.stageVersion', { v: version.version }) : <span className="muted">{t('pw.rev.noVersion')}</span>}</span>
        </li>
        {returned && !simulatedOnly && (
          <li>
            <span className="pw-rev__k">{t('pw.rev.changed')}</span>
            <span className="muted">{t('pw.rev.locationUnknown')}</span>
          </li>
        )}
      </ol>
      {simulatedOnly && <p className="pw-rev__demo">{stage === 'visual' ? t('pw.rev.demoArtwork') : t('pw.rev.demoContent')}</p>}
    </section>
  );
}

const KINDS: Contribution['kind'][] = ['comment', 'slogan', 'reference', 'theme'];

/**
 * People can add ideas at any stage: a comment, a line, a reference and what to borrow from it.
 * An unsent idea is a draft of this project and this stage: it stays here when the person moves
 * to another stage, comes back when they return, and is only ever submitted to the stage named
 * in the form.
 */
function Contributions({ proposal: p, stage }: { proposal: Proposal; stage: StageId }) {
  const t = useT();
  const { run, pending, error } = useProposalAction();
  const { snapshot, can } = useTeam();
  const { params } = useRouter();
  const actor = snapshot.actor;
  const canContribute = can({ kind: 'communicate' });
  const canWriteIdeas = stage === 'visual' || stage === 'layout' ? can({ kind: 'edit_visual' }) : can({ kind: 'edit_narrative' });
  const availableKinds = canWriteIdeas ? KINDS : KINDS.filter((kind) => kind === 'comment');
  const key = draftKey(p.id, stage, actor.id);
  const [draft, update, clear] = useIdeaDraft(key);
  const [legacy] = useIdeaDraft(draftKey(p.id, stage));
  const hasLegacy = snapshot.actor.role === 'pitch_owner' && Boolean(legacy.text.trim() || legacy.borrow.trim());
  const { open, kind, text, borrow } = draft;
  const currentTarget = displayedTarget(p, stage, params);
  const visualPreview = stage === 'visual' && isQingyuVisualPreview(p);
  const target = draft.target ?? currentTarget;
  const elsewhere = pendingDrafts(p.id, actor.id).filter((s) => s !== stage);
  const mine = p.contributions.filter((c) => c.stage === stage);
  const wantsForm = params.get('focus') === 'add-idea';
  const targetJSON = JSON.stringify(currentTarget);
  useEffect(() => {
    if (!canContribute) return;
    const current = readDraft(key);
    if ((wantsForm || current.open) && !current.target) update({ open: true, target: currentTarget });
  }, [wantsForm, key, canContribute, targetJSON, update]);
  useEffect(() => {
    if (!wantsForm || !open || !canContribute) return;
    const id = requestAnimationFrame(() => document.getElementById(`ct-${stage}`)?.focus());
    return () => cancelAnimationFrame(id);
  }, [wantsForm, open, stage, canContribute]);
  const stageName = t(`pw.stage.${stage}`);
  return (
    <section className="pw-contrib" aria-labelledby={`contrib-${stage}`} data-focus="ideas" tabIndex={-1}>
      <div className="pw-sh">
        <h2 id={`contrib-${stage}`} className="pw-h3">{t('pw.contrib.title')}</h2>
        {canContribute && !open && <button type="button" className="btn btn--secondary btn--sm" onClick={() => update({ open: true, target: currentTarget })}><MessageSquarePlus size={14} aria-hidden="true" /> {t('pw.contrib.add')}</button>}
      </div>
      {visualPreview && <p className="small muted">意见对象为整个视觉阶段；当前浏览的文案方向尚无正式视觉稿。已审阅或已采用仅代表原处理记录，不代表已修改、已复核。</p>}
      {hasLegacy && <details className="pw-note">
        <summary>找回此阶段的旧版未发送草稿</summary>
        <p className="small muted">旧版未记录作者及稿件版本。以下是本窗口保留的原文，仅比稿负责人可复制恢复，原草稿不会删除。</p>
        <p style={{ whiteSpace: 'pre-wrap' }}>{legacy.text}</p>
        {legacy.borrow && <p>{legacy.borrow}</p>}
        <button type="button" className="btn btn--secondary btn--sm" disabled={Boolean(draft.text.trim() || draft.borrow.trim())} onClick={() => update({ ...legacy, open: true, target: { kind: 'stage', stage, version: p.stages[stage].version } })}>复制到我的当前草稿</button>
        <p className="small muted">当前已有文字时不会覆盖。恢复后请核对原文，并重新确认意见对象再发送。</p>
      </details>}
      {canContribute && elsewhere.length > 0 && <p className="small muted pw-contrib__elsewhere">{t('pw.contrib.elsewhere')}{' '}{elsewhere.map((s) => <Link key={s} className="text-link" to={projectPath(p.workbenchId, 'proposal', { stage: s, focus: 'ideas' })}>{t(`pw.stage.${s}`)} </Link>)}</p>}
      {mine.length > 0 && <ul className="pw-contrib__list">{mine.map((c) => <ContributionItem key={c.id} contribution={c} proposal={p} canHandle={can({ kind: 'decide', stage })} />)}</ul>}
      {mine.length === 0 && (!open || !canContribute) && <p className="small muted">{stage === 'brief' ? '补充任务要求，或留下需要讨论的问题。' : t('pw.contrib.none')}</p>}
      {open && canContribute && <form className="pw-contrib__form" aria-describedby={`ct-dest-${stage}`} onSubmit={(e) => {
        e.preventDefault();
        const sent = snapshotDraft(key);
        void run('contrib', (service) => service.contribute(p.id, stage, { kind: sent.kind, text: sent.text, borrow: sent.kind === 'reference' ? sent.borrow : null, target: sent.target ?? currentTarget }, { expectedRevision: p.revision, actor }), t('pw.contrib.sentTo', { stage: stageName })).then((ok) => { if (ok) clearIfUnchanged(key, sent); });
      }}>
        <p className="pw-contrib__dest" id={`ct-dest-${stage}`}><span className="pw-label">意见对象</span> {stageName} · {p.name} · {contributionTargetLabel(target)}</p>
        <div className="cluster">
          <button type="button" className="btn btn--secondary btn--sm" aria-pressed={target.kind !== 'stage'} onClick={() => update({ target: currentTarget })}>{visualPreview ? '绑定整个视觉阶段' : '绑定当前显示稿件'}</button>
          <button type="button" className="btn btn--secondary btn--sm" aria-pressed={target.kind === 'stage'} onClick={() => update({ target: { kind: 'stage', stage, version: p.stages[stage].version } })}>对整个阶段提意见</button>
        </div>
        <p className="small muted">提交后保留此对象及原文；切换方向不会把已写意见悄悄移到新稿件。</p>
        <div className="pw-seg" role="radiogroup" aria-label={t('pw.contrib.kindLabel')} onKeyDown={(e) => {
          if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
          e.preventDefault();
          const index = availableKinds.indexOf(kind);
          const next = e.key === 'Home' ? 0 : e.key === 'End' ? availableKinds.length - 1 : (index + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1) + availableKinds.length) % availableKinds.length;
          update({ kind: availableKinds[next] });
          e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
        }}>
          {availableKinds.map((k) => <button key={k} type="button" role="radio" tabIndex={kind === k || (!availableKinds.includes(kind) && k === 'comment') ? 0 : -1} aria-checked={kind === k} onClick={() => update({ kind: k })}>{t(`pw.contrib.kind.${k}`)}</button>)}
        </div>
        <label className="field__label" htmlFor={`ct-${stage}`}>{t(`pw.contrib.textLabel.${kind}`)}</label>
        <textarea id={`ct-${stage}`} className="pw-textarea" rows={2} value={text} onChange={(e) => update({ text: e.target.value })} />
        {kind === 'reference' && <><label className="field__label" htmlFor={`cb-${stage}`}>{t('pw.contrib.borrowLabel')}</label><input id={`cb-${stage}`} className="pw-input" value={borrow} onChange={(e) => update({ borrow: e.target.value })} placeholder={t('pw.contrib.borrowPh')} /></>}
        <div className="cluster"><Action label={t('pw.contrib.sendTo', { stage: stageName })} type="submit" variant="primary" pending={pending === 'contrib'} disabled={!text.trim() || !availableKinds.includes(kind)} reason={!availableKinds.includes(kind) ? '当前身份在此阶段可提交交流意见，请选择意见类型。' : null} /><button type="button" className="btn btn--ghost" onClick={clear}>{text.trim() ? t('pw.contrib.discard') : t('common.cancel')}</button></div>
        <p className="small muted">{actor.name} · {ROLE_LABELS[actor.role]} · 提交只记录意见，处理结果需由真人另行记录。</p>
        {error && <p className="field__error" role="alert">{error}</p>}
      </form>}
    </section>
  );
}

function ContributionItem({ contribution: c, proposal: p, canHandle }: { contribution: Contribution; proposal: Proposal; canHandle: boolean }) {
  const t = useT();
  const { snapshot } = useTeam();
  const { run, pending, error } = useProposalAction();
  const [handling, setHandling] = useState(false);
  const [reason, setReason] = useState('');
  const destination = recordDestination(p, { stage: c.stage, target: c.target });
  const authorRole = Object.entries(ROLE_LABELS).find(([role]) => role === c.authorRole)?.[1];
  return <li>
    <span className="pw-tag">{t(`pw.contrib.kind.${c.kind}`)}</span>
    <p className="small muted">{c.target ? <Link className="text-link" to={destination.to}>{contributionTargetLabel(c.target)} · {destination.label}</Link> : contributionTargetLabel(undefined)}</p>
    <p>{c.text}</p>
    {c.borrow && <p className="small"><span className="pw-label">{t('pw.contrib.borrow')}</span> {c.borrow}</p>}
    {c.response && <p className="small muted">历史处理备注（原文）：{c.response}</p>}
    {matchingTextIn(p, c.text).map((m) => <p key={m.directionId} className="small"><Link className="text-link" to={projectPath(p.workbenchId, 'proposal', { stage: 'themes', focus: `copy-${m.directionId}`, match: c.id })}>{t('pw.rev.findMatch', { id: m.directionId })}</Link></p>)}
    <p className="small muted">{c.by}{authorRole ? ` · ${authorRole}` : ' · 历史作者角色未记录'} · <Time iso={c.at} relative /> · {t(`pw.contrib.status.${c.status}`)}</p>
    {c.processing?.map((entry) => <p key={entry.id} className="small">{entry.status === 'used' ? '记录采用' : '记录审阅'} · {entry.by}{entry.authorRole && ` · ${Object.entries(ROLE_LABELS).find(([role]) => role === entry.authorRole)?.[1] ?? entry.authorRole}`} · <Time iso={entry.at} relative />：{entry.reason}</p>)}
    {canHandle && !handling && <button type="button" className="btn btn--ghost btn--sm" onClick={() => setHandling(true)}>记录真人处理</button>}
    {canHandle && handling && <form onSubmit={(e) => e.preventDefault()}>
      <label className="field__label" htmlFor={`handling-${c.id}`}>处理理由（保留原意见）</label>
      <textarea id={`handling-${c.id}`} className="pw-textarea" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="cluster">{(['considered', 'used'] as const).map((status) => <Action key={status} label={status === 'used' ? '记录已采用' : '记录已审阅'} disabled={!reason.trim()} pending={pending === status} onClick={() => void run(status, (service) => service.resolveContribution(p.id, c.id, { status, reason }, { expectedRevision: p.revision, actor: snapshot.actor }), '已记录真人处理').then((ok) => { if (ok) { setHandling(false); setReason(''); } })} />)}<button type="button" className="btn btn--ghost" onClick={() => setHandling(false)}>取消</button></div>
      {error && <p className="field__error" role="alert">{error}</p>}
    </form>}
  </li>;
}

function StageVersionNotice({ proposal: p, stage }: { proposal: Proposal; stage: StageId }) {
  const { params } = useRouter();
  const version = params.get('version');
  if (!version || version === String(p.stages[stage].version)) return null;
  return <p className="pw-note" role="status">链接指向阶段第 {version} 版；此演示未保存该阶段历史正文。下方仅显示当前第 {p.stages[stage].version} 版上下文，不能作为原稿。</p>;
}
