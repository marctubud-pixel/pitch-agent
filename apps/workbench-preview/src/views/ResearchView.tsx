import { useTeam } from '../collaboration/context';
import { PermissionFields } from '../collaboration/TeamTools';
import { useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, CircleCheck, History, Paperclip, Play, Plus } from 'lucide-react';
import { useCommand } from '../app/commands';
import { useServiceQuery } from '../app/query';
import { Link, projectPath, useRouter } from '../app/router';
import { useService } from '../app/services';
import { TOPIC_LABELS, type Claim, type EvidenceTopic, type ResearchWorkspace, type SupportStatus } from '../domain/models';
import { Ring } from '../ui/charts';
import { useI18n, useT } from '../i18n';
import { Inspector, restoreFocus } from '../ui/Inspector';
import { Action, CommandFeedback, PageHeader, QueryView, SelectInput, SimTag, Skeleton, StatePanel, TextArea, Time } from '../ui/kit';
import { StatusBadge, statusInfo } from '../ui/status';
import { EvidenceBack } from '../proposal/EvidenceBack';
import { ArtifactDocument, ClaimDetail, ClaimLegend, ReviewReport } from './shared';
import { useWorkflowCommand } from './useWorkflowCommand';


export function ResearchView({ projectId }: { projectId: string }) {
  const query = useServiceQuery(`research:${projectId}`, (s) => s.getResearchWorkspace(projectId), { projectId });
  return (
    <QueryView query={query} skeleton={<div className="page"><Skeleton lines={6} blocks={2} /></div>}>
      {(data) => <Research data={data} />}
    </QueryView>
  );
}

type View = 'report' | 'claims' | 'fix';
const VIEWS: View[] = ['report', 'claims', 'fix'];

/** One thing to fix, from review findings or, where a review has not run, from the evidence gaps. */
interface FixItem {
  id: string;
  severity: 'blocking' | 'major' | 'minor';
  title: string;
  action: string;
  claimIds: string[];
  source: 'verification' | 'readiness' | 'gap';
}

function toFix(data: ResearchWorkspace): FixItem[] {
  const { verification, readiness, gaps } = data;
  const items: FixItem[] = [];
  const fromReview = (r: NonNullable<typeof verification>, source: 'verification' | 'readiness') => {
    for (const f of r.findings) {
      if (!f.resolved) items.push({ id: f.id, severity: f.severity, title: f.message, action: f.requiredAction, claimIds: f.claimIds, source });
    }
  };
  if (verification && !verification.outdated) fromReview(verification, 'verification');
  else
    for (const g of gaps.filter((g) => g.kind !== 'coverage'))
      items.push({ id: g.id, severity: g.kind === 'partial_support' ? 'major' : 'blocking', title: `${g.title}: ${g.detail}`, action: g.recommendedAction, claimIds: g.claimIds, source: 'gap' });
  if (readiness && !readiness.outdated) fromReview(readiness, 'readiness');
  else
    for (const g of gaps.filter((g) => g.kind === 'coverage'))
      items.push({ id: g.id, severity: 'blocking', title: `${g.title}. ${g.detail}`, action: g.recommendedAction, claimIds: g.claimIds, source: 'gap' });
  const rank = { blocking: 0, major: 1, minor: 2 };
  return items.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

function Research({ data }: { data: ResearchWorkspace }) {
  const { t, rich } = useI18n();
  const { params, setParams } = useRouter();
  const { project, artifact, claims, sources, verification, readiness, activeJobs } = data;
  const raw = params.get('tab');
  const report = raw === 'verification' || raw === 'readiness' ? raw : null;
  const view: View = report || raw === 'gaps' ? 'fix' : VIEWS.includes(raw as View) ? (raw as View) : 'report';
  const claimId = params.get('claim');
  const claim = claims.find((c) => c.id === claimId) ?? null;
  const { command, exec } = useWorkflowCommand();
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const baseId = useId();

  if (!artifact) {
    const briefConfirmed = project.taskCard.confirmedAt !== null && project.currentStage !== 'brief';
    const generating = activeJobs.some((j) => j.purpose === 'research_generation');
    return (
      <div className="page">
        <PageHeader eyebrow={t('nav.research')} title={t('res.noneTitle')} />
        <StatePanel
          kind="empty"
          title={t('res.noneState')}
          action={
            <div className="stack-sm">
              <Action permission={{ kind: 'workflow' }}
                label={t('wf.generate_research')}
                variant="primary"
                icon={<Play size={16} aria-hidden="true" />}
                onClick={() => void exec('generate_research', project)}
                disabled={!briefConfirmed || generating}
                reason={generating ? t('res.generating') : t('res.confirmFirst')}
                pending={command.pending}
              />
              <CommandFeedback command={command} />
            </div>
          }
        >
          <p>{t('res.noneBody')}</p>
        </StatePanel>
      </div>
    );
  }

  const stale = Boolean(artifact.staleReason);
  const running = activeJobs[0];
  const fixes = toFix(data);
  const open = fixes.filter((f) => f.severity !== 'minor').length;
  const vOk = verification && !verification.outdated;
  const rOk = readiness && !readiness.outdated;

  const openClaim = (id: string) => setParams({ claim: id });
  const closeClaim = () => {
    const id = claimId;
    setParams({ claim: null });
    if (id) restoreFocus(`[data-claim-trigger="${id}"], #claim-anchor-${CSS.escape(id)}`);
  };
  const goFix = () => setParams({ tab: 'fix', claim: null });

  const findingsFor = (id: string) =>
    [verification, readiness]
      .filter((r): r is NonNullable<typeof r> => Boolean(r && !r.outdated))
      .flatMap((r) => r.findings.filter((f) => f.claimIds.includes(id)).map((f) => ({ ...f, reviewType: r.type })));

  // The single next step for this module, and the state colour of the status tile.
  type Step = { kind: 'attention' | 'active' | 'ready'; headline: string; detail: string; action: ReactNode };
  const runBtn = (kind: 'run_verification' | 'run_readiness' | 'regenerate_research', label: string) => (
    <Action permission={{ kind: 'workflow' }} label={label} variant="primary" icon={<Play size={16} aria-hidden="true" />} onClick={() => void exec(kind, project)} pending={command.pending} />
  );
  const step: Step = stale
    ? { kind: 'attention', headline: t('rs.stale'), detail: artifact.staleReason ?? '', action: runBtn('regenerate_research', t('wf.regenerate_research')) }
    : running
      ? { kind: 'active', headline: t('rs.running'), detail: running.label, action: <span className="cluster small"><StatusBadge kind="job" value={running.status} size="sm" /> {t('res.resultsAuto')}</span> }
      : !vOk
        ? { kind: 'active', headline: t('rs.unchecked'), detail: t('rs.uncheckedBody'), action: runBtn('run_verification', t('wf.run_verification')) }
        : verification.decision === 'fail'
          ? { kind: 'attention', headline: t('rs.blocked', { count: open }), detail: t('rs.blockedBody'), action: <button type="button" className="btn btn--primary" onClick={goFix}>{t('rs.fixNow')} <ArrowRight size={16} aria-hidden="true" /></button> }
          : !rOk
            ? { kind: 'active', headline: t('rs.enough'), detail: t('rs.enoughBody'), action: runBtn('run_readiness', t('wf.run_readiness')) }
            : readiness.decision === 'fail'
              ? { kind: 'attention', headline: t('rs.short'), detail: readiness.summary, action: <button type="button" className="btn btn--primary" onClick={goFix}>{t('rs.fixNow')} <ArrowRight size={16} aria-hidden="true" /></button> }
              : { kind: 'ready', headline: t('rs.ready'), detail: t('rs.readyBody'), action: <Link className="btn btn--primary" to={projectPath(project.id, 'handoff')}>{t('rs.toHandoff')} <ArrowRight size={16} aria-hidden="true" /></Link> };

  const counts = { supported: 0, partial: 0, missing_citation: 0, unsupported: 0, unverified: 0 } as Record<SupportStatus, number>;
  for (const c of claims) counts[c.supportStatus] += 1;
  const coverage = artifact.coverage.map((req) => {
    const supported = claims.filter((c) => c.topic === req.topic && c.supportStatus === 'supported').length;
    return { topic: req.topic, supported, required: req.minSupportedClaims };
  });

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = VIEWS.indexOf(view);
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % VIEWS.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + VIEWS.length) % VIEWS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = VIEWS.length - 1;
    else return;
    event.preventDefault();
    setParams({ tab: VIEWS[next] === 'report' ? null : VIEWS[next] });
    tabRefs.current[VIEWS[next]]?.focus();
  };

  const checkChip = (type: 'verification' | 'readiness', review: typeof verification) => (
    <button type="button" className="check-chip" onClick={() => setParams({ tab: type, claim: null })}>
      <span>{t(`review.${type}`)}</span>
      {!review ? <span className="badge badge--sm" data-tone="neutral">{t('rs.notRun')}</span> : review.outdated ? <span className="badge badge--sm" data-tone="warn">{t('ho.outdated')}</span> : <StatusBadge kind="decision" value={review.decision} size="sm" />}
      <ArrowRight size={14} aria-hidden="true" />
    </button>
  );

  return (
    <div className={`with-inspector${claim ? ' is-open' : ''}`}>
      <div className="with-inspector__main page page--module">
        <header className="mod-head">
          <p className="eyebrow">{t('res.eyebrow', { v: artifact.version, bv: artifact.basedOn.briefVersion })}</p>
          <h1>{artifact.title}</h1>
          <div className="cluster">
            <StatusBadge kind="artifact" value={artifact.status} />
            {artifact.simulated && <SimTag>{t('res.simContent')}</SimTag>}
            <span className="small muted">{rich('res.produced', { time: <Time iso={artifact.createdAt} /> })}</span>
            {data.versions.length > 1 && (
              <Link className="text-link small" to={projectPath(project.id, 'artifacts', { artifact: artifact.id })}>
                <History size={14} aria-hidden="true" /> {t('res.earlier', { count: data.versions.length - 1 })}
              </Link>
            )}
          </div>
        </header>

        <section className="mod-bento" aria-label={t('rs.summary')}>
          <div className="mod-status" data-kind={step.kind}>
            <p className="mod-status__label">{t('rs.whereNow')}</p>
            <h2 className="mod-status__headline">{step.headline}</h2>
            <p className="mod-status__detail">{step.detail}</p>
            <div className="mod-status__action">{step.action}</div>
            <CommandFeedback command={command} />
            <div className="mod-status__checks">
              {checkChip('verification', verification)}
              {checkChip('readiness', readiness)}
            </div>
          </div>

          <div className="mod-chart">
            <h2 className="mod-chart__title">{t('rs.support')}</h2>
            <div className="support">
              <Ring value={counts.supported} total={claims.length} size={112} />
              <ul className="support__legend">
                {(['supported', 'partial', 'missing_citation', 'unsupported', 'unverified'] as const)
                  .filter((k) => counts[k] > 0)
                  .map((k) => (
                    <li key={k} data-status={k}>
                      <span className="support__dot" aria-hidden="true" />
                      <span>{statusInfo('support', k, t).label}</span>
                      <strong>{counts[k]}</strong>
                    </li>
                  ))}
              </ul>
            </div>
            <div className="stackbar" aria-hidden="true">
              {(['supported', 'partial', 'missing_citation', 'unsupported', 'unverified'] as const).map((k) =>
                counts[k] ? <span key={k} data-status={k} style={{ flexGrow: counts[k] }} /> : null,
              )}
            </div>
          </div>

          <div className="mod-chart">
            <h2 className="mod-chart__title">{t('rs.coverage')}</h2>
            <p className="small muted">{t('rs.coverageHint')}</p>
            <ul className="bars">
              {coverage.map((c) => (
                <li key={c.topic} data-met={c.supported >= c.required}>
                  <span className="bars__label">{t(`topic.${c.topic}`)}</span>
                  <span className="bars__value">
                    {c.supported}/{c.required}
                  </span>
                  <span className="bars__track" aria-hidden="true">
                    <span className="bars__fill" style={{ width: `${Math.min(100, (c.supported / Math.max(1, c.required)) * 100)}%` }} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {stale && (
          <p className="banner" data-tone="warn" role="status">
            <strong>{t('res.stale')}</strong> {t('res.staleNote')}
          </p>
        )}

        <div className="tabs" role="tablist" aria-label={t('res.views')}>
          {VIEWS.map((id) => (
            <button
              key={id}
              ref={(el) => {
                tabRefs.current[id] = el;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${id}`}
              aria-selected={view === id}
              aria-controls={`${baseId}-panel-${id}`}
              tabIndex={view === id ? 0 : -1}
              className="tab"
              data-alert={id === 'fix' && open > 0 ? true : undefined}
              onClick={() => setParams({ tab: id === 'report' ? null : id })}
              onKeyDown={onTabKey}
            >
              {id === 'report' ? t('res.tab.report') : id === 'claims' ? t('res.tab.claims', { n: claims.length }) : t('rs.tabFix', { n: open })}
            </button>
          ))}
        </div>

        <div role="tabpanel" id={`${baseId}-panel-${view}`} aria-labelledby={`${baseId}-tab-${view}`} className="tabpanel">
          {view === 'report' && (
            <>
              <p className="fiction-note small">{t('res.fiction')}</p>
              <ClaimLegend />
              <ArtifactDocument
                artifact={artifact}
                claims={claims}
                sources={sources}
                activeClaimId={claimId}
                onOpenClaim={openClaim}
                footer={!stale && <AddClaimForm data={data} />}
              />
            </>
          )}
          {view === 'claims' && <ClaimsTable data={data} onOpen={openClaim} activeId={claimId} />}
          {view === 'fix' && (
            <div className="stack">
              <div className="segmented--plain" role="group" aria-label={t('rs.fixViews')}>
                {([null, 'verification', 'readiness'] as const).map((r) => (
                  <button key={r ?? 'cards'} type="button" className="seg-btn" aria-pressed={report === r} onClick={() => setParams({ tab: r ?? 'fix' })}>
                    {r === null ? t('rs.issues', { n: open }) : t(`rs.report.${r}`)}
                  </button>
                ))}
              </div>
              {report === null && <FixDeck items={fixes.filter((f) => f.severity !== 'minor')} claims={claims} onOpenClaim={openClaim} onDone={step.kind === 'ready'} />}
              {report === null && fixes.some((f) => f.severity === 'minor') && (
                <section className="fix-notes" aria-labelledby="fix-notes-title">
                  <h3 id="fix-notes-title" className="label">{t('rs.notes')}</h3>
                  <ul>
                    {fixes
                      .filter((f) => f.severity === 'minor')
                      .map((f) => (
                        <li key={f.id}>
                          <span>{f.title}</span>
                          <span className="small muted">{f.action}</span>
                        </li>
                      ))}
                  </ul>
                </section>
              )}
              {report === 'verification' &&
                (verification ? (
                  <ReviewReport review={verification} claims={claims} sources={sources} onOpenClaim={openClaim} />
                ) : (
                  <StatePanel kind="empty" title={t('res.noVerification')}>
                    <p>{t('res.noVerificationBody')}</p>
                  </StatePanel>
                ))}
              {report === 'readiness' &&
                (readiness ? (
                  <ReviewReport review={readiness} claims={claims} sources={sources} onOpenClaim={openClaim} />
                ) : (
                  <StatePanel kind="empty" title={t('res.noReadiness')}>
                    <p>{t('res.noReadinessBody')}</p>
                  </StatePanel>
                ))}
            </div>
          )}
        </div>
      </div>

      {claim && (
        <Inspector title={t('res.claimEvidence')} eyebrow={t('res.versionLabel', { v: artifact.version })} onClose={closeClaim}>
          <EvidenceBack />
          <ClaimDetail claim={claim} sources={sources} findings={findingsFor(claim.id)}>
            {stale ? <p className="small muted">{t('res.staleReadOnly')}</p> : <AttachSource data={data} claimId={claim.id} />}
          </ClaimDetail>
        </Inspector>
      )}
    </div>
  );
}

/** Issues shown one card at a time, so a person can work through them in order. */
function FixDeck({ items, claims, onOpenClaim, onDone }: { items: FixItem[]; claims: Claim[]; onOpenClaim: (id: string) => void; onDone: boolean }) {
  const t = useT();
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState<'next' | 'prev'>('next');
  const at = Math.min(index, Math.max(0, items.length - 1));
  if (items.length === 0) {
    return (
      <div className="fix-empty">
        <CircleCheck size={28} aria-hidden="true" />
        <h3>{t('rs.nothing')}</h3>
        <p className="muted">{onDone ? t('rs.nothingReady') : t('rs.nothingYet')}</p>
      </div>
    );
  }
  const item = items[at];
  const go = (to: number) => {
    setDir(to > at ? 'next' : 'prev');
    setIndex((to + items.length) % items.length);
  };
  return (
    <div className="fix-deck">
      <div className="fix-deck__rail" role="tablist" aria-label={t('rs.issueList')}>
        {items.map((it, i) => (
          <button
            key={it.id}
            type="button"
            role="tab"
            aria-selected={i === at}
            className="fix-dot"
            data-severity={it.severity}
            onClick={() => go(i)}
            aria-label={t('rs.issueN', { n: i + 1, total: items.length })}
          >
            {i + 1}
          </button>
        ))}
      </div>
      <div className="fix-deck__stage">
        <span className="fix-deck__ghost" aria-hidden="true" />
        <span className="fix-deck__ghost fix-deck__ghost--2" aria-hidden="true" />
        <article key={item.id} className="fix-card" data-severity={item.severity} data-dir={dir} aria-live="polite">
          <div className="fix-card__head">
            <StatusBadge kind="severity" value={item.severity} size="sm" />
            <span className="small muted">
              {t('rs.issueN', { n: at + 1, total: items.length })} · {item.source === 'gap' ? t('rs.fromGap') : t(`review.${item.source}`)}
            </span>
          </div>
          <h3 className="fix-card__title">{item.title}</h3>
          <div className="fix-card__todo">
            <span className="fix-card__todo-label">{t('rs.whatToDo')}</span>
            <p>{item.action}</p>
          </div>
          <div className="fix-card__foot">
            {item.claimIds[0] && claims.some((c) => c.id === item.claimIds[0]) ? (
              <button type="button" className="btn btn--primary" data-claim-trigger={item.claimIds[0]} onClick={() => onOpenClaim(item.claimIds[0])}>
                {t('rs.openClaim')} <ArrowRight size={16} aria-hidden="true" />
              </button>
            ) : (
              <span />
            )}
            <div className="cluster cluster--tight">
              <button type="button" className="round-btn" onClick={() => go(at - 1)} aria-label={t('rs.prev')} disabled={items.length < 2}>
                <ChevronLeft size={18} aria-hidden="true" />
              </button>
              <button type="button" className="round-btn round-btn--dark" onClick={() => go(at + 1)} aria-label={t('rs.next')} disabled={items.length < 2}>
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}

function ClaimsTable({ data, onOpen, activeId }: { data: ResearchWorkspace; onOpen: (id: string) => void; activeId: string | null }) {
  const t = useT();
  const [filter, setFilter] = useState<SupportStatus | 'all'>('all');
  const rows = data.claims.filter((c) => filter === 'all' || c.supportStatus === filter);
  return (
    <div className="stack">
      <div className="toolbar">
        <SelectInput
          label={t('res.show')}
          value={filter}
          onChange={(e) => setFilter(e.target.value as SupportStatus | 'all')}
          options={[{ value: 'all', label: t('res.allClaims') }, ...(['supported', 'partial', 'missing_citation', 'unsupported', 'unverified'] as const).map((s) => ({ value: s, label: statusInfo('support', s, t).label }))]}
        />
      </div>
      {rows.length === 0 ? (
        <StatePanel kind="empty" title={data.claims.length === 0 ? t('res.noClaims') : t('res.noClaimsStatus')}>
          <p>{data.claims.length === 0 ? t('res.noClaimsBody') : t('res.noClaimsStatusBody')}</p>
        </StatePanel>
      ) : (
        <ul className="claim-rows">
          {rows.map((c) => (
            <li key={c.id} className="claim-row" data-active={activeId === c.id}>
              <button type="button" className="claim-row__text" data-claim-trigger={c.id} onClick={() => onOpen(c.id)}>
                {c.text}
              </button>
              <div className="cluster">
                <StatusBadge kind="support" value={c.supportStatus} size="sm" />
                <span className="tag">{t(`topic.${c.topic}`)}</span>
                <span className="small muted">
                  {t('doc.sources', { count: c.sourceIds.length })}
                  {c.limitations.length ? ` · ${t('res.limitations', { count: c.limitations.length })}` : ''}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AttachSource({ data, claimId }: { data: ResearchWorkspace; claimId: string }) {
  const { can } = useTeam();
  const service = useService();
  const command = useCommand();
  const t = useT();
  const claim = data.claims.find((c) => c.id === claimId)!;
  const available = data.sources.filter((s) => !claim.sourceIds.includes(s.id));
  const [sourceId, setSourceId] = useState('');
  const chosen = sourceId || available[0]?.id || '';

  return (
    <fieldset disabled={!can({ kind: 'edit_research' })} className="panel stack-sm" aria-label={t('attach.title')}>
      <h3 className="label">{t('attach.title')}</h3>
      {available.length === 0 ? (
        <p className="small muted">{t('attach.allCited')}</p>
      ) : (
        <>
          <SelectInput
            label={t('attach.from')}
            value={chosen}
            onChange={(e) => setSourceId(e.target.value)}
            options={available.map((s) => ({ value: s.id, label: `${s.title} (${statusInfo('source', s.verificationStatus, t).label})` }))}
            hint={t('attach.hint')}
          />
          <Action permission={{ kind: 'edit_research' }}
            label={t('attach.submit')}
            icon={<Paperclip size={16} aria-hidden="true" />}
            pending={command.pending}
            onClick={() =>
              void command.run({
                label: t('attach.submit'),
                payload: { claimId, sourceId: chosen },
                expectedRevision: data.project.revision,
                execute: (meta) => service.linkSourceToClaim(data.project.id, claimId, chosen, meta),
                success: t('attach.done'),
                onSuccess: () => setSourceId(''),
              })
            }
          />
        </>
      )}
      <Link className="text-link small" to={projectPath(data.project.id, 'sources', { add: '1', claim: claimId })}>
        <Plus size={12} aria-hidden="true" /> {t('attach.new')}
      </Link>
      <CommandFeedback command={command} />
    </fieldset>
  );
}

function AddClaimForm({ data }: { data: ResearchWorkspace }) {
  const service = useService();
  const command = useCommand();
  const t = useT();
  const artifact = data.artifact!;
  const [sectionId, setSectionId] = useState(artifact.sections[artifact.sections.length > 1 ? 1 : 0]?.id ?? '');
  const [text, setText] = useState('');
  const [topic, setTopic] = useState<EvidenceTopic>('audience');
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const formId = useId();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (text.trim().length < 12) {
      setError(t('addClaim.short'));
      return;
    }
    setError(null);
    const input = { sectionId, text, topic, sourceIds };
    await command.run({
      label: t('addClaim.submit'),
      payload: input,
      expectedRevision: data.project.revision,
      execute: (meta) => service.addClaim(data.project.id, input, meta),
      success: t('addClaim.done'),
      onSuccess: () => {
        setText('');
        setSourceIds([]);
      },
    });
  };

  return (
    <details className="add-claim">
      <summary>
        <Plus size={16} aria-hidden="true" /> {t('addClaim.open')}
      </summary>
      <PermissionFields action={{ kind: 'edit_research' }}><form id={formId} className="stack" onSubmit={submit} noValidate>
        <p className="small muted">{t('addClaim.intro')}</p>
        <SelectInput label={t('addClaim.section')} value={sectionId} onChange={(e) => setSectionId(e.target.value)} options={artifact.sections.map((s) => ({ value: s.id, label: s.heading }))} />
        <TextArea label={t('doc.claim')} value={text} onChange={(e) => setText(e.target.value)} rows={3} error={error} />
        <SelectInput
          label={t('review.topic')}
          value={topic}
          onChange={(e) => setTopic(e.target.value as EvidenceTopic)}
          options={(Object.keys(TOPIC_LABELS) as EvidenceTopic[]).map((id) => ({ value: id, label: t(`topic.${id}`) }))}
          hint={t('addClaim.topicHint')}
        />
        <fieldset className="checkbox-list">
          <legend>{t('addClaim.cited')}</legend>
          {data.sources.length === 0 && <p className="small muted">{t('addClaim.noSources')}</p>}
          {data.sources.map((s) => (
            <label key={s.id} className="check">
              <input type="checkbox" checked={sourceIds.includes(s.id)} onChange={(e) => setSourceIds((ids) => (e.target.checked ? [...ids, s.id] : ids.filter((i) => i !== s.id)))} />
              <span>
                {s.title} <span className="small muted">· {t(`topic.${s.intendedUse}`)}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <Action permission={{ kind: 'edit_research' }} label={t('addClaim.submit')} type="submit" variant="primary" pending={command.pending} />
        <CommandFeedback command={command} />
      </form></PermissionFields>
    </details>
  );
}
