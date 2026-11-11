import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowRight, Check, ChevronLeft, ChevronRight, CircleDashed } from 'lucide-react';
import { useConfirm } from '../app/confirm';
import { useCommand } from '../app/commands';
import { useServiceQuery } from '../app/query';
import { Link, projectPath } from '../app/router';
import { useService } from '../app/services';
import type { Handoff, HandoffDecision, HandoffInput, HandoffOverview, HandoffSide } from '../domain/models';
import { useI18n, useT } from '../i18n';
import { Modal } from '../ui/Modal';
import { Action, CommandFeedback, PageHeader, QueryView, Skeleton, StatePanel, TextArea, Time } from '../ui/kit';
import { StatusBadge } from '../ui/status';
import { useWorkflowCommand } from './useWorkflowCommand';

export function HandoffView({ projectId }: { projectId: string }) {
  const query = useServiceQuery(`handoff:${projectId}`, (s) => s.getHandoffOverview(projectId), { projectId });
  return (
    <div className="page">
      <QueryView query={query} skeleton={<Skeleton lines={4} blocks={3} />}>
        {(data) => <Handoffs key={data.artifact?.id ?? 'none'} data={data} />}
      </QueryView>
    </div>
  );
}

type StepId = 'verification' | 'readiness' | 'delivery' | 'acceptance' | 'release';
const STEPS: StepId[] = ['verification', 'readiness', 'delivery', 'acceptance', 'release'];

function Handoffs({ data }: { data: HandoffOverview }) {
  const service = useService();
  const confirm = useConfirm();
  const release = useCommand();
  const capabilities = useServiceQuery('capabilities', (s) => s.getCapabilities());
  const { command: continueCmd, exec } = useWorkflowCommand();
  const [form, setForm] = useState<HandoffSide | null>(null);
  const { t, rich } = useI18n();
  const { project, artifact, verification, readiness, eligibility } = data;
  const passed = (id: StepId) => eligibility.checks.find((c) => c.id === id)?.passed ?? false;
  const firstOpen = STEPS.find((id) => !passed(id)) ?? 'release';
  const [picked, setPicked] = useState<StepId | null>(null);
  const [dir, setDir] = useState<'next' | 'prev'>('next');
  const current = picked ?? firstOpen;
  const at = STEPS.indexOf(current);

  if (!artifact) {
    return (
      <>
        <PageHeader eyebrow={t('stage.handoff')} title={t('ho.noneTitle')} />
        <StatePanel kind="empty" title={t('ho.noneState')}>
          <p>{t('ho.noneBody')}</p>
        </StatePanel>
      </>
    );
  }

  const go = (id: StepId) => {
    setDir(STEPS.indexOf(id) >= at ? 'next' : 'prev');
    setPicked(id);
  };

  const feature = capabilities.data?.continuation_to_strategy;
  const continueReason = eligibility.alreadyContinued
    ? eligibility.summary
    : !eligibility.eligible
      ? eligibility.summary
      : feature && !feature.supported
        ? feature.reason
        : null;

  const doRelease = async () => {
    const ok = await confirm({ title: t('ho.releaseTitle', { v: artifact.version }), body: t('ho.releaseBody'), confirmLabel: t('ho.releaseConfirm') });
    if (!ok) return;
    await release.run({
      label: t('ho.releaseLabel'),
      payload: { artifactId: artifact.id },
      expectedRevision: project.revision,
      execute: (meta) => service.releaseResearch(project.id, meta),
      success: t('ho.released', { v: artifact.version }),
    });
  };

  const reviewBody = (type: 'verification' | 'readiness', review: typeof verification) => (
    <>
      <div className="cluster">
        {!review ? (
          <span className="badge" data-tone="neutral">{t('rs.notRun')}</span>
        ) : review.outdated ? (
          <span className="badge" data-tone="warn">{t('ho.outdated')}</span>
        ) : (
          <StatusBadge kind="decision" value={review.decision} />
        )}
        {review && <span className="small muted"><Time iso={review.createdAt} /></span>}
      </div>
      <p className="step-card__text">{review ? (review.outdated ? review.outdatedReason : review.summary) : t(type === 'verification' ? 'res.noVerificationBody' : 'res.noReadinessBody')}</p>
      <div className="cluster">
        <Link className={`btn ${passed(type) ? 'btn--secondary' : 'btn--primary'}`} to={projectPath(project.id, 'research', { tab: passed(type) ? type : 'fix' })}>
          {passed(type) ? t(`rs.report.${type}`) : t('ho.fixInResearch')} <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </>
  );

  const ownerBody = (side: HandoffSide, record: Handoff | null, permission: { allowed: boolean; reason: string }, actionLabel: string) => (
    <>
      <p className="small muted">{t('ho.owner', { name: side === 'research_owner' ? project.owners.research : project.owners.strategy })}</p>
      {record ? (
        <>
          <div className="cluster">
            <StatusBadge kind="handoff" value={record.decision} />
            <span className="small muted">{rich('ho.recorded', { time: <Time iso={record.createdAt} />, by: record.recordedBy })}</span>
          </div>
          {record.note && <p className="handoff-note">“{record.note}”</p>}
          <ul className="count-chips">
            <li data-tone="ok">{t('ho.countPermitted', { count: record.permittedUses.length })}</li>
            <li data-tone="bad">{t('ho.countProhibited', { count: record.prohibitedInferences.length })}</li>
            <li data-tone="warn">{t('ho.countUnresolved', { count: record.unresolvedIssues.length })}</li>
          </ul>
          <details className="disclosure">
            <summary>{t('ho.showLimits')}</summary>
            <div className="stack-sm">
              <HandoffLists record={record} />
            </div>
          </details>
        </>
      ) : (
        <p className="step-card__text">{t('ho.nothing')}</p>
      )}
      {(!record || record.decision === 'returned') && (
        <Action label={actionLabel} variant="primary" onClick={() => setForm(side)} disabled={!permission.allowed} reason={permission.reason} />
      )}
    </>
  );

  const body: Record<StepId, ReactNode> = {
    verification: reviewBody('verification', verification),
    readiness: reviewBody('readiness', readiness),
    delivery: ownerBody('research_owner', data.researchSide, data.canDeliver, t('ho.recordDelivery')),
    acceptance: ownerBody('strategy_owner', data.strategySide, data.canAccept, t('ho.recordDecision')),
    release: data.release ? (
      <p className="step-card__text">{rich('ho.releasedBy', { by: data.release.releasedBy, time: <Time iso={data.release.releasedAt} />, v: String(artifact.version) })}</p>
    ) : (
      <>
        <p className="step-card__text">{t('ho.notReleased')}</p>
        <Action label={t('ho.releaseV', { v: artifact.version })} variant="primary" onClick={() => void doRelease()} disabled={!data.canRelease.allowed} reason={data.canRelease.reason} pending={release.pending} />
        <CommandFeedback command={release} />
      </>
    ),
  };

  const unmet = eligibility.checks.filter((c) => !c.passed);

  return (
    <div className="page--module">
      <header className="mod-head">
        <p className="eyebrow">{t('ho.eyebrow', { v: artifact.version })}</p>
        <h1>{t('ho.title')}</h1>
        <p className="muted">{t('ho.ledeShort')}</p>
      </header>

      <ol className="steps" aria-label={t('ho.checks')}>
        {STEPS.map((id, i) => {
          const done = passed(id);
          const state = done ? 'done' : id === firstOpen ? 'current' : 'todo';
          return (
            <li key={id} data-state={state}>
              <button type="button" className="steps__btn" aria-current={current === id ? 'step' : undefined} onClick={() => go(id)}>
                <span className="steps__dot" aria-hidden="true">
                  {done ? <Check size={16} /> : i + 1}
                </span>
                <span className="steps__label">{t(`ho.step.${id}`)}</span>
                <span className="steps__state">{done ? t('ho.stepDone') : state === 'current' ? t('ho.stepNow') : t('ho.stepLater')}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="handoff-grid">
        <div className="fix-deck__stage">
          <span className="fix-deck__ghost" aria-hidden="true" />
          <span className="fix-deck__ghost fix-deck__ghost--2" aria-hidden="true" />
          <article key={current} className="fix-card step-card" data-dir={dir} aria-labelledby="step-title">
            <div className="fix-card__head">
              <span className="step-card__num">{at + 1}</span>
              <span className="small muted">{t('ho.stepOf', { n: at + 1, total: STEPS.length })}</span>
            </div>
            <h2 id="step-title" className="fix-card__title">
              {t(`ho.ask.${current}`)}
            </h2>
            <div className="stack-sm">{body[current]}</div>
            <div className="fix-card__foot">
              <span />
              <div className="cluster cluster--tight">
                <button type="button" className="round-btn" onClick={() => go(STEPS[Math.max(0, at - 1)])} disabled={at === 0} aria-label={t('ho.prevStep')}>
                  <ChevronLeft size={18} aria-hidden="true" />
                </button>
                <button type="button" className="round-btn round-btn--dark" onClick={() => go(STEPS[Math.min(STEPS.length - 1, at + 1)])} disabled={at === STEPS.length - 1} aria-label={t('ho.nextStep')}>
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
              </div>
            </div>
          </article>
        </div>

        <aside className="mod-status continue-tile" data-kind={eligibility.alreadyContinued ? 'active' : eligibility.eligible ? 'ready' : 'waiting'} aria-labelledby="continue-title">
          <p className="mod-status__label">{t('ho.finally')}</p>
          <h2 id="continue-title" className="mod-status__headline">
            {eligibility.alreadyContinued ? t('ho.continued') : eligibility.eligible ? t('ho.canContinue') : t('ho.notYet')}
          </h2>
          {!eligibility.alreadyContinued && !eligibility.eligible && (
            <>
              <p className="mod-status__detail">{t('ho.stillNeeded', { count: unmet.length })}</p>
              <ul className="needed">
                {unmet.map((c) => (
                  <li key={c.id}>
                    <CircleDashed size={14} aria-hidden="true" /> {c.label}
                  </li>
                ))}
              </ul>
            </>
          )}
          {eligibility.alreadyContinued && <p className="mod-status__detail">{eligibility.summary}</p>}
          <div className="mod-status__action">
            {eligibility.alreadyContinued ? (
              <Link className="btn btn--primary" to={projectPath(project.id, 'artifacts')}>
                {t('ho.seeStrategy')} <ArrowRight size={16} aria-hidden="true" />
              </Link>
            ) : (
              <Action
                label={t('wf.continue_to_strategy')}
                variant="primary"
                icon={<ArrowRight size={16} aria-hidden="true" />}
                onClick={() => void exec('continue_to_strategy', project)}
                disabled={Boolean(continueReason)}
                reason={eligibility.eligible ? continueReason : null}
                pending={continueCmd.pending}
              />
            )}
          </div>
          <CommandFeedback command={continueCmd} />
          <p className="small continue-tile__foot">{feature ? feature.reason : t('elig.checking')}</p>
        </aside>
      </div>

      {data.history.length > 0 && (
        <details className="section disclosure">
          <summary>{t('ho.history', { count: data.history.length })}</summary>
          <ul className="plain-list stack-sm">
            {data.history.map((h) => (
              <li key={h.id} className="history-row">
                <StatusBadge kind="handoff" value={h.decision} size="sm" />
                <span>
                  {h.owner} · {t('res.versionLabel', { v: h.artifactVersion })} · <Time iso={h.createdAt} />
                </span>
                {h.outdated && <span className="tag">{t('ho.outdatedTag', { reason: h.outdatedReason ?? '' })}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}

      {form && <HandoffForm data={data} side={form} onClose={() => setForm(null)} />}
    </div>
  );
}

function HandoffLists({ record }: { record: Pick<Handoff, 'permittedUses' | 'prohibitedInferences' | 'unresolvedIssues'> }) {
  const t = useT();
  const block = (label: string, items: string[], tone: string) => (
    <div className="handoff-list" data-tone={tone}>
      <h3 className="label">{label}</h3>
      {items.length ? (
        <ul>
          {items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      ) : (
        <p className="small muted">{t('ho.noneRecorded')}</p>
      )}
    </div>
  );
  return (
    <>
      {block(t('ho.permitted'), record.permittedUses, 'ok')}
      {block(t('ho.prohibited'), record.prohibitedInferences, 'bad')}
      {block(t('ho.unresolved'), record.unresolvedIssues, 'warn')}
    </>
  );
}

function HandoffForm({ data, side, onClose }: { data: HandoffOverview; side: HandoffSide; onClose: () => void }) {
  const service = useService();
  const command = useCommand();
  const t = useT();
  const formId = useId();
  const owner = side === 'research_owner' ? data.project.owners.research : data.project.owners.strategy;
  const source = side === 'strategy_owner' && data.researchSide ? data.researchSide : data.suggested;
  const [decision, setDecision] = useState<HandoffDecision>(side === 'research_owner' ? 'delivered' : 'accepted');
  const [permitted, setPermitted] = useState(source.permittedUses.join('\n'));
  const [prohibited, setProhibited] = useState(source.prohibitedInferences.join('\n'));
  const [unresolved, setUnresolved] = useState(source.unresolvedIssues.join('\n'));
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);
  const toLines = (text: string) => text.split('\n').map((l) => l.trim()).filter(Boolean);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (decision === 'returned' && !note.trim()) {
      setNoteError(t('ho.err.note'));
      return;
    }
    setNoteError(null);
    const input: HandoffInput = { side, decision, permittedUses: toLines(permitted), prohibitedInferences: toLines(prohibited), unresolvedIssues: toLines(unresolved), note };
    await command.run({
      label: side === 'research_owner' ? t('ho.recordDelivery') : t('ho.recordStrategy'),
      payload: input,
      expectedRevision: data.project.revision,
      execute: (meta) => service.recordHandoff(data.project.id, input, meta),
      success: side === 'research_owner' ? t('ho.deliveryDone', { name: owner }) : t('ho.decisionDone', { name: owner }),
      onSuccess: onClose,
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={side === 'research_owner' ? t('ho.formDelivery') : t('ho.recordStrategy')}
      description={`${t('ho.formSim', { name: owner })} ${side === 'strategy_owner' ? t('ho.prefillDelivery') : t('ho.prefillFindings')}`}
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <Action label={t('ho.record')} type="submit" form={formId} variant="primary" pending={command.pending} />
        </>
      }
    >
      <form id={formId} className="stack" onSubmit={submit} noValidate>
        {side === 'strategy_owner' && (
          <fieldset className="radio-group">
            <legend>{t('ho.decision')}</legend>
            {(['accepted', 'accepted_with_conditions', 'returned'] as const).map((value) => (
              <label key={value} className="radio-card">
                <input type="radio" name="handoff-decision" checked={decision === value} onChange={() => setDecision(value)} />
                <span>
                  <strong>{t(`ho.d.${value}`)}</strong>
                  <span className="small muted">{t(`ho.d.${value}.desc`)}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
        <TextArea label={t('ho.permitted')} value={permitted} onChange={(e) => setPermitted(e.target.value)} rows={3} hint={t('brief.perLine')} />
        <TextArea label={t('ho.prohibited')} value={prohibited} onChange={(e) => setProhibited(e.target.value)} rows={4} hint={t('ho.prohibitedHint')} />
        <TextArea label={t('ho.unresolved')} value={unresolved} onChange={(e) => setUnresolved(e.target.value)} rows={3} hint={t('brief.perLine')} optional />
        <TextArea label={t('ho.note')} value={note} onChange={(e) => setNote(e.target.value)} rows={2} error={noteError} optional={decision !== 'returned'} />
        <CommandFeedback command={command} />
      </form>
    </Modal>
  );
}
