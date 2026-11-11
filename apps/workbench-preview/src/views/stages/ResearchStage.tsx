import {useServiceContext} from '../../app/services';
import {R7ResearchView} from '../../proposal/research-method/R7ResearchView';
import { selectionKeys } from '../../ui/selectionKeys';
/**
 * B. Research, as a visual workspace: four sections of short findings, image walls of case
 * groups and charts. The working evidence checks (verification, sufficiency, handoff, release)
 * sit in a secondary panel, not in the way of the work.
 *
 * Composition, after the supplied references:
 * - Atacama landing page → the summary as a lime panel beside a large picture with tag chips; the
 *   sections as a row of pill tiles ("We · Protect · → · Nature"); findings as the "initiatives"
 *   table (title, tags, an arrow), with a tilted thumbnail on hover; case groups as tall picture
 *   cards with tags on the image, a title over it and an "explore" pill;
 * - the "$300B" slide → each chart as a headline, two coloured stat tiles with arrow buttons and
 *   bold black bars with their values.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArrowRight, ArrowUpRight, BarChart3, ChevronRight, CircleAlert, ClipboardCheck, LoaderCircle, ShieldCheck } from 'lucide-react';
import { useServiceQuery } from '../../app/query';
import { useRouter } from '../../app/router';
import type { Claim, ResearchWorkspace, SupportStatus } from '../../domain/models';
import type { CaseItem, ChartSpec, MaterialKind, Proposal, ResearchBoard, ResearchSection } from '../../domain/proposal';
import { EvidenceBack } from '../../proposal/EvidenceBack';
import { useT } from '../../i18n';
import { Drawer } from '../../proposal/Drawer';
import { Backed } from '../../proposal/ui';
import { ArtFrame } from '../../ui/art/ArtFrame';
import { Embedded } from '../../ui/kit';
import { HandoffView } from '../HandoffView';
import { ResearchView } from '../ResearchView';
import { ResearchMethodView } from '../../proposal/research-method/ResearchMethodView';
import { currentResearchClaims, resolveResearchClaim } from '../../proposal/researchClaims';
import { AuthoredCaseSlot, resolveAuthoredCase } from '../../proposal/research-case';
import { QingyuReportRevisions } from '../../proposal/qingyu-report/QingyuReportRevisions';
import { resolveQingyuCase } from '../../proposal/qingyu-report/binding';

type ChecksTab = 'research' | 'handoff';

const SUPPORT_TONE: Record<SupportStatus, string> = { supported: 'ok', partial: 'warn', unsupported: 'bad', missing_citation: 'bad', unverified: 'neutral' };

export function ResearchStage({ proposal: p }: { proposal: Proposal }) {
  const t = useT();
  const pid = p.workbenchId;
  const connected = useServiceContext().proposals.backing === 'connected';
  const { params, setParams } = useRouter();
  const ws = useServiceQuery(`research:${pid}`, (s) => s.getResearchWorkspace(pid), { projectId: pid });
  const caseHistory = useServiceQuery(`research-case-briefs:${pid}`, (s) => (pid === 'luma' || pid === 'qingyu') ? s.getBriefHistory(pid) : Promise.resolve(undefined), { projectId: pid });
  const isLumaCase = pid === 'luma';
  const isQingyuCase = pid === 'qingyu';
  const isAuthoredCase = isLumaCase || isQingyuCase;
  const checks = params.get('checks') as ChecksTab | null;
  const claimParam = params.get('claim');
  const focus = params.get('focus');
  const [legacyOpen, setLegacyOpen] = useState(Boolean(focus || claimParam || params.get('hl')));
  const claimTrigger = useRef<HTMLElement | null>(null);
  const openClaim = (id: string) => {
    const claim = data ? resolveResearchClaim(data, id) : null;
    if (!claim || claim.id !== id) return;
    claimTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setParams({ checks: 'research', claim: id });
  };
  useEffect(() => {
    if (focus || claimParam || params.get('hl')) setLegacyOpen(true);
  }, [focus, claimParam, params]);
  // Arriving from a piece of evidence elsewhere (a strategy chip): what it was called there.
  const evLabel = params.get('ev');
  const open = Boolean(checks) || Boolean(claimParam && !p.research);
  const [tab, setTab] = useState<ChecksTab>(checks ?? 'research');
  useEffect(() => {
    if (checks) setTab(checks);
  }, [checks]);

  // A link to a case or chart scrolls it into view and marks it.
  useEffect(() => {
    if (!focus) return;
    const el = document.getElementById(`case-${focus}`) ?? document.getElementById(`chart-${focus}`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.add('is-flash');
    const tm = setTimeout(() => el.classList.remove('is-flash'), 1800);
    return () => clearTimeout(tm);
  }, [focus, legacyOpen, ws.data]);

  const data = ws.data?.project.id === pid ? ws.data : undefined;
  const authoredCase = isLumaCase && data && caseHistory.data ? resolveAuthoredCase({ requestedProjectId: pid, workspace: data, history: caseHistory.data }) : null;
  const qingyuCase = isQingyuCase && data && caseHistory.data ? resolveQingyuCase({ requestedProjectId: pid, workspace: data, history: caseHistory.data }) : null;
  const board = useMemo(() => p.research ?? (data ? boardFromClaims({ ...data, claims: currentResearchClaims(data) }, t) : null), [p.research, data, t]);
  const claimFor = (ref: string | null) => data ? resolveResearchClaim(data, ref) : null;
  const hlParam = params.get('hl');
  const highlight = claimFor(claimParam ?? hlParam);
  // A claim link names the claim as the strategy knows it ("c1"). Once the research has loaded,
  // resolve it to the live claim and open it in the checks drawer, where its support status,
  // limitations and source excerpts are shown. Until then the person is told it is being found;
  // a loading page is never reported as missing evidence.
  const lookup: 'none' | 'loading' | 'error' | 'missing' | 'found' = !claimParam ? 'none' : ws.status === 'loading' ? 'loading' : ws.status === 'error' ? 'error' : highlight ? 'found' : 'missing';
  useEffect(() => {
    if (lookup !== 'found' || !highlight) return;
    if (checks === 'research' && claimParam === highlight.id) return;
    setParams({ checks: 'research', claim: highlight.id });
  }, [lookup, highlight, checks, claimParam, setParams]);
  const label = evLabel ?? claimParam ?? '';
  // When the evidence cannot be shown, bring the explanation into view instead of leaving the
  // person wherever the previous page was scrolled.
  useEffect(() => {
    if (lookup !== 'missing' && lookup !== 'error') return;
    const id = requestAnimationFrame(() => document.querySelector('.pw-evstate')?.scrollIntoView({ block: 'center' }));
    return () => cancelAnimationFrame(id);
  }, [lookup]);

  return (
    <div className="pw-research">
      <EvidenceBack />
      {lookup === 'loading' && (
        <p className="pw-evstate" role="status">
          <LoaderCircle size={16} aria-hidden="true" className="spin" /> {t('pw.ev.loading', { label })}
        </p>
      )}
      {lookup === 'error' && (
        <p className="pw-evstate" data-tone="warn" role="alert">
          <CircleAlert size={16} aria-hidden="true" /> {t('pw.ev.error', { label })}{' '}
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => ws.refetch()}>
            {t('common.tryAgain')}
          </button>
        </p>
      )}
      {lookup === 'missing' && (
        <p className="pw-evstate" data-tone="warn" role="alert" style={{ scrollMarginTop: 80 }}>
          <CircleAlert size={16} aria-hidden="true" /> {t('pw.ev.missing', { label })}{' '}
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => setParams({ checks: 'research', claim: null })}>
            {t('pw.ev.openChecks')}
          </button>
        </p>
      )}
      {!isAuthoredCase && <ChecksBar data={data ?? null} onOpen={(which) => setParams({ checks: which })} />}
      {ws.status === 'loading' && !data && <p role="status">正在读取当前研究报告与依据。</p>}
      {ws.status === 'error' && !data && <p role="alert">研究读取失败，尚未取得当前报告。<button type="button" className="btn btn--secondary btn--sm" onClick={ws.refetch}>重试读取研究</button></p>}
      {ws.refreshError && <p className="rm-alert" role="alert">研究刷新失败，以下保留上次成功读取的报告。<button type="button" className="btn btn--secondary btn--sm" onClick={ws.refetch}>重试读取研究</button></p>}
      {isAuthoredCase && data && <>
        {caseHistory.status === 'loading' && !caseHistory.data && <p role="status">正在核对公开资料案例对应的历史简报。</p>}
        {caseHistory.status === 'error' && !caseHistory.data && <p className="rc-notice" role="alert">案例历史简报读取失败。<button type="button" className="btn btn--secondary btn--sm" onClick={caseHistory.refetch}>重试读取历史简报</button></p>}
        {caseHistory.refreshError && <p className="rc-notice" role="alert">历史简报刷新失败，以下按上次成功读取的绑定展示。<button type="button" className="btn btn--secondary btn--sm" onClick={caseHistory.refetch}>重试读取历史简报</button></p>}
        {qingyuCase && <QingyuReportRevisions key={`${pid}:${data.artifact?.id ?? 'none'}:${data.artifact?.version ?? 0}:${caseHistory.data?.current?.version ?? 0}`} result={qingyuCase} recheck={{ pending: ws.refreshing || caseHistory.refreshing, run: () => { ws.refetch(); caseHistory.refetch(); } }} />}
        {authoredCase && <AuthoredCaseSlot key={`${pid}:${data.artifact?.id ?? 'none'}:${data.artifact?.version ?? 0}:${caseHistory.data?.current?.version ?? 0}`} result={authoredCase} recheck={{ pending: ws.refreshing || caseHistory.refreshing, run: () => { ws.refetch(); caseHistory.refetch(); } }} />}
      </>}
      {!isAuthoredCase && data && (connected ? <R7ResearchView workspace={data} onClaim={openClaim} onOpenChecks={() => setParams({checks:'research',claim:null})}/> : <ResearchMethodView key={`${pid}:${data.artifact?.id ?? 'none'}`} workspace={data} onClaim={openClaim} onOpenChecks={() => setParams({ checks: 'research', claim: null })} />)}

      <details className="rm-legacy" open={legacyOpen} onToggle={event => setLegacyOpen(event.currentTarget.open)}>
      <summary>{isAuthoredCase ? (isLumaCase ? '既有研究与核验记录' : '研究与核验记录') : '既有研究板 · 案例、图表与原报告'}</summary>
      {isAuthoredCase && <>
        <p className="rc-legacy-note">{isQingyuCase ? '研究待补，以下为本项目独立研究记录。' : '以下为原有工程演示的研究、核验与研究板，状态只对应原记录，不代表上方公开资料案例已获批准。'}</p>
        <ChecksBar data={data ?? null} onOpen={(which) => setParams({ checks: which })} />
        {data && <ResearchMethodView key={`${pid}:${data.artifact?.id ?? 'none'}`} workspace={data} onClaim={openClaim} onOpenChecks={() => setParams({ checks: 'research', claim: null })} />}
      </>}
      {!board ? (
        <div className="pw-empty">
          <p>{t('pw.res.none')}</p>
        </div>
      ) : (
        <>
          <ResearchHero board={board} live={!p.research} />
          <nav className="rs-strip" aria-label={t('pw.res.sectionsLabel')}>
            <ul>
              {board.sections.map((s, n) => {
                const pic = s.groups.flatMap((g) => g.items).find((c) => c.art.kind === 'scene') ?? s.groups[0]?.items[0];
                return (
                  <li key={s.id} data-pic={(pic && n % 2 === 1) || undefined}>
                    <a href={`#sec-${s.id}`} onClick={(e) => (e.preventDefault(), document.getElementById(`sec-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))}>
                      {pic && n % 2 === 1 && (
                        <span className="rs-strip__pic" aria-hidden="true">
                          <ArtFrame spec={pic.art} fill />
                        </span>
                      )}
                      <span className="rs-strip__label">{t(`pw.res.section.${s.id}`)}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>

          {board.sections.map((s) => (
            <BoardSection key={s.id} section={s} claimFor={claimFor} highlight={highlight?.id ?? null} onClaim={(c) => openClaim(c.id)} />
          ))}
        </>
      )}
      </details>

      <Drawer
        open={open}
        onClose={() => {
          // Keep the claim marked on the board and land on its row, so the person keeps their place.
          const row = highlight?.id;
          setParams({ checks: null, claim: null, tab: null, ...(row ? { hl: row } : {}) });
          if (row)
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                const remembered = claimTrigger.current;
                const btn = remembered?.isConnected ? remembered : document.querySelector<HTMLElement>(`[data-claim-trigger="${CSS.escape(row)}"]`);
                btn?.scrollIntoView({ block: 'center' });
                btn?.focus({ preventScroll: true });
              }),
            );
        }}
        title={t('pw.res.checksTitle')}
        actions={
          <div className="pw-seg pw-seg--sm" role="tablist" aria-label={t('pw.res.checksTitle')}>
            {(['research', 'handoff'] as ChecksTab[]).map((k) => (
              <button key={k} type="button" role="tab" aria-controls="research-checks-content" tabIndex={tab === k ? 0 : -1} onKeyDown={selectionKeys} aria-selected={tab === k} onClick={() => setParams({ checks: k })}>
                {t(`pw.res.checks.${k}`)}
              </button>
            ))}
          </div>
        }
      >
        {/* With a claim open, the claim panel carries the way back (it covers this on phones). */}
        {!claimParam && <EvidenceBack />}
        <div id="research-checks-content" role="tabpanel" aria-label={t(`pw.res.checks.${tab}`)}><Embedded>{tab === 'handoff' ? <HandoffView projectId={pid} /> : <ResearchView projectId={pid} />}</Embedded></div>
      </Drawer>
    </div>
  );
}

/** One line of working check results. The checks themselves run in the Workbench. */
function ChecksBar({ data, onOpen }: { data: ResearchWorkspace | null; onOpen: (tab: ChecksTab) => void }) {
  const t = useT();
  if (!data?.artifact) return null;
  const v = data.verification;
  const r = data.readiness;
  const released = Boolean(data.artifact.release);
  type CheckState = 'none' | 'outdated' | 'fail' | 'pass' | 'pending';
  const state = (rev: typeof v): CheckState => (!rev ? 'none' : rev.outdated ? 'outdated' : rev.decision === 'fail' ? 'fail' : 'pass');
  const items: Array<{ key: string; label: string; state: CheckState; tab: ChecksTab }> = [
    { key: 'verification', label: t('pw.res.check.verification'), state: state(v), tab: 'research' },
    { key: 'sufficiency', label: t('pw.res.check.sufficiency'), state: state(r), tab: 'research' },
    { key: 'handoff', label: t('pw.res.check.handoff'), state: released ? 'pass' : data.artifact.status === 'ready' ? 'pending' : 'none', tab: 'handoff' },
  ];
  const problems = items.filter((i) => i.state === 'fail' || i.state === 'outdated').length;
  return (
    <section className="pw-checks" data-problem={problems > 0 || undefined} aria-label={t('pw.res.checksTitle')}>
      <ShieldCheck size={18} aria-hidden="true" />
      <p className="pw-checks__lead">{problems ? t('pw.res.checksProblem', { count: problems }) : released ? t('pw.res.checksReleased') : t('pw.res.checksLead')}</p>
      <ul>
        {items.map((i) => (
          <li key={i.key}>
            <button type="button" className="pw-check-chip" data-state={i.state} onClick={() => onOpen(i.tab)}>
              {i.label}: {t(`pw.res.state.${i.state}`)}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn--secondary btn--sm" onClick={() => onOpen('research')}>
        <ClipboardCheck size={14} aria-hidden="true" /> {t('pw.res.openChecks')}
      </button>
      <Backed as="connected" />
    </section>
  );
}

function ResearchHero({ board, live }: { board: ResearchBoard; live: boolean }) {
  const t = useT();
  const items = board.sections.flatMap((s) => s.groups.flatMap((g) => g.items));
  // A landscape scene fills the large frame; posters and packs would be letterboxed.
  const pic = items.find((c) => c.art.kind === 'scene') ?? items[0];
  return (
    <section className="rs-hero" aria-label={t('pw.stage.research')} data-nopic={!pic || undefined}>
      <div className="rs-hero__panel">
        <p className="rs-hero__summary" data-long={board.summary.length > 140 || undefined}>
          {board.summary}
        </p>
        <p className="rs-hero__shape">
          <span className="pw-label">{t('pw.res.shape')}</span> {board.adaptation}
        </p>
        {live && <Backed as="connected" note={t('pw.res.fromClaims')} />}
      </div>
      <div className="rs-hero__pic">
        {pic && <ArtFrame spec={pic.art} title={pic.title} fill />}
        <ul className="rs-hero__kinds" aria-label={t('pw.res.kindsLabel')}>
          {(['comparison', 'background', 'inspiration', 'unverified'] as MaterialKind[]).map((k) => (
            <li key={k} className="rs-kind" data-kind={k}>
              <span className="rs-kind__dot" aria-hidden="true" />
              <span>
                <strong>{t(`pw.kind.${k}`)}</strong>
                <span className="rs-kind__hint">{t(`pw.kind.${k}.hint`)}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function BoardSection({ section: s, claimFor, highlight, onClaim }: { section: ResearchSection; claimFor: (ref: string | null) => Claim | null; highlight: string | null; onClaim: (c: Claim) => void }) {
  const t = useT();
  const [openCase, setOpenCase] = useState<CaseItem | null>(null);
  const thumb = s.groups[0]?.items[0] ?? null;
  return (
    <section className="rs-section" aria-labelledby={`sec-${s.id}`} data-section={s.id}>
      <div className="rs-section__head">
        <div>
          {/* The kicker names the kind of section; it only shows when the title says something else. */}
          {t(`pw.res.section.${s.id}`).trim().toLowerCase() !== s.title.trim().toLowerCase() && <p className="pw-kicker">{t(`pw.res.section.${s.id}`)}</p>}
          <h2 id={`sec-${s.id}`} className="rs-section__title">
            {s.title}
          </h2>
        </div>
        <p className="rs-section__summary">{s.summary}</p>
      </div>

      {s.findings.length > 0 && (
        <table className="rs-rows">
          <thead>
            <tr>
              <th scope="col">{t('pw.res.col.finding')}</th>
              <th scope="col">{t('pw.res.col.tags')}</th>
              <th scope="col">
                <span className="sr-only">{t('pw.res.col.open')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {s.findings.map((f, n) => {
              const c = claimFor(f.claimRef);
              const kind = f.kind === 'evidence' ? 'evidence' : f.kind;
              return (
                <tr key={f.id} data-kind={kind} data-hl={c && c.id === highlight ? true : undefined}>
                  <td className="rs-rows__text">
                    {f.text}
                    {f.note && <span className="rs-rows__note">{f.note}</span>}
                  </td>
                  <td>
                    <span className="rs-tags">
                      {kind !== 'evidence' && (
                        <span className="rs-tag" data-kind={kind}>
                          {t(`pw.kind.${kind}`)}
                        </span>
                      )}
                      {c ? (
                        <span className="rs-tag rs-tag--support" data-tone={SUPPORT_TONE[c.supportStatus]}>
                          {t(`pw.support.${c.supportStatus}`)}
                        </span>
                      ) : (
                        f.claimRef && (
                          <span className="rs-tag rs-tag--support" data-tone="neutral">
                            {t('pw.support.unknown')}
                          </span>
                        )
                      )}
                    </span>
                  </td>
                  <td className="rs-rows__go">
                    {thumb && n === 0 && (
                      <span className="rs-rows__thumb" aria-hidden="true">
                        <ArtFrame spec={thumb.art} fill />
                      </span>
                    )}
                    {c ? (
                      <button type="button" className="rs-arrow" data-claim-trigger={c.id} onClick={() => onClaim(c)} aria-label={t('pw.res.openClaim', { text: f.text.slice(0, 60) })}>
                        <ArrowRight size={16} aria-hidden="true" />
                      </button>
                    ) : (
                      <span className="rs-arrow rs-arrow--off" aria-hidden="true">
                        <ArrowRight size={16} />
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {s.groups.map((g) => (
        <div key={g.id} className="rs-group" data-kind={g.kind}>
          <div className="rs-group__head">
            <p className="rs-group__title">{g.title}</p>
            <p className="rs-group__take">{g.takeaway}</p>
          </div>
          <ul className="rs-cards" data-count={g.items.length}>
            {g.items.map((c, n) => (
              <li key={c.id} id={`case-${c.id}`} className="rs-card" data-open={openCase?.id === c.id || undefined} data-first={n === 0 || undefined}>
                <ArtFrame spec={c.art} title={c.title} fill className="rs-card__art" />
                <span className="rs-card__shade" aria-hidden="true" />
                <span className="rs-card__tags">
                  <span className="rs-tag rs-tag--glass" data-kind={g.kind}>
                    {t(`pw.kind.${g.kind}`)}
                  </span>
                </span>
                <span className="rs-card__orb" aria-hidden="true">
                  <ArrowUpRight size={15} />
                </span>
                <div className="rs-card__text">
                  <p className="rs-card__title">{c.title}</p>
                  <p className="rs-card__cap">{c.caption}</p>
                  <button type="button" className="rs-card__explore" onClick={() => setOpenCase(openCase?.id === c.id ? null : c)} aria-expanded={openCase?.id === c.id}>
                    {t('pw.res.explore')} <ChevronRight size={14} aria-hidden="true" />
                    <span className="sr-only">: {c.title}</span>
                  </button>
                </div>
                {openCase?.id === c.id && (
                  <dl className="rs-card__detail">
                    <div>
                      <dt>{t('pw.case.source')}</dt>
                      <dd>
                        {c.source} · {c.date}
                      </dd>
                    </div>
                    <div>
                      <dt>{t('pw.case.applies')}</dt>
                      <dd>{c.applicability}</dd>
                    </div>
                    {c.limitation && (
                      <div>
                        <dt>{t('pw.case.limit')}</dt>
                        <dd>{c.limitation}</dd>
                      </div>
                    )}
                  </dl>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {s.chart && <Chart chart={s.chart} />}
    </section>
  );
}

/** A small, honest bar chart: the measure is stated and demo data is labelled. */
export function Chart({ chart }: { chart: ChartSpec }) {
  const t = useT();
  const max = Math.max(...chart.data.map((d) => d.value), 1);
  const ranked = [...chart.data].sort((a, b) => Number(Boolean(b.highlight)) - Number(Boolean(a.highlight)) || b.value - a.value);
  const tiles = ranked.slice(0, 2);
  return (
    <figure className="rs-chart" id={`chart-${chart.id}`}>
      <div className="rs-chart__text">
        <span className="rs-chart__tag">
          <BarChart3 size={13} aria-hidden="true" /> {t('pw.res.chartTag')}
        </span>
        <figcaption className="rs-chart__title">{chart.title}</figcaption>
        <p className="rs-chart__measure">{chart.measure}</p>
        <ul className="rs-chart__tiles">
          {tiles.map((d, i) => (
            <li key={d.label} data-alt={i === 0 || undefined}>
              <span className="rs-chart__orb" aria-hidden="true">
                <ArrowUpRight size={15} />
              </span>
              <span className="rs-chart__n">{d.value}</span>
              <span className="rs-chart__l">{d.label}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="rs-chart__plot">
        <ol className="rs-bars" style={{ '--n': chart.data.length } as CSSProperties}>
          {chart.data.map((d) => (
            <li key={d.label} data-hl={d.highlight || undefined}>
              <span className="rs-bars__v">{d.value}</span>
              <span className="rs-bars__bar" style={{ height: `${Math.max(3, Math.round((d.value / max) * 190))}px` }} aria-hidden="true" />
              <span className="rs-bars__l">{d.label}</span>
            </li>
          ))}
        </ol>
        <p className="small muted rs-chart__note">
          {chart.note} {chart.demoData && <span className="pw-tag">{t('pw.demoData')}</span>}
        </p>
      </div>
    </figure>
  );
}

/** Without a scripted board, group the working research claims by topic so the stage still shows real content. */
function boardFromClaims(data: ResearchWorkspace, t: ReturnType<typeof useT>): ResearchBoard | null {
  if (!data.artifact) return null;
  const map: Record<string, ResearchSection['id']> = { audience: 'audience', category: 'category', competitor: 'category', cultural: 'context', production: 'brand' };
  const sections = new Map<ResearchSection['id'], ResearchSection>();
  for (const c of data.claims) {
    const id = map[c.topic] ?? 'context';
    if (!sections.has(id)) sections.set(id, { id, title: t(`pw.res.section.${id}`), summary: '', findings: [], groups: [], chart: null });
    sections.get(id)!.findings.push({ id: c.id, text: c.text, kind: 'evidence', claimRef: c.id, note: c.limitations[0] ?? null });
  }
  const order: ResearchSection['id'][] = ['brand', 'category', 'audience', 'context'];
  return {
    adaptation: t('pw.res.fallbackShape'),
    summary: data.artifact.summary,
    sections: order.filter((o) => sections.has(o)).map((o) => sections.get(o)!),
  };
}
