import {useService} from '../../app/services';
import {VisualWorkflowPanel} from '../../proposal/VisualWorkflowPanel';
/**
 * E. Visual development. Each direction is its own branch: a reference search card, several
 * reference candidates with reasons for keeping or rejecting them, several composition sketches
 * with sketch-appropriate scores, then the refined visual against the calibrated threshold
 * (average of at least 4 out of 5 plus every mandatory requirement). The whole set is also
 * checked for directions drifting too close together.
 *
 * Composition, after the supplied references: the Wixel page ("Your partner in content") → the
 * reference search as a centred headline over a fan of candidate pictures, kept ones lifted;
 * the home cabinet's open folder → the sketches spread as sheets on a folder in the direction's
 * colour; the refined visual large, with its scores on a white card beside it.
 */
import { useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowLeftRight, ArrowDown, Check, ChevronDown, CircleAlert, Hand, Maximize2, Sparkles, X } from 'lucide-react';
import { useRouter } from '../../app/router';
import type { DirectionId, Proposal, RefinedVisual, VisualBranch } from '../../domain/proposal';
import { useT } from '../../i18n';
import { average, ChallengeCard, DirectionMark, More, Scores, SectionHead } from '../../proposal/ui';
import { ArtFrame, naturalRatio } from '../../ui/art/ArtFrame';
import { inkOn } from '../../proposal/color';
import { latestRefined, pendingVisuals } from '../../proposal/pending';
import { artworkRevision, type ArtworkRevision } from '../../proposal/revisions';
import { Modal } from '../../ui/Modal';
import { StageEmpty } from './StageEmpty';
import { isQingyuVisualPreview } from '../../proposal/qingyu-visual/eligibility';
import { QingyuVisualPreview } from '../../proposal/qingyu-visual/QingyuVisualPreview';

const STEPS = ['search', 'references', 'sketches'] as const;
type VisualPart = 'current' | 'process' | 'compare';

export function VisualStage({ proposal: p, collaboration }: { proposal: Proposal; collaboration?: ReactNode }) {
  const t = useT();
  const { params, setParams } = useRouter();
  const service=useService();
  const v = p.visual;
  if(service.visualWorkflow&&!v)return <>{collaboration}<VisualWorkflowPanel projectId={p.id}/></>;
  if (!v) {
    if (isQingyuVisualPreview(p)) return <QingyuVisualPreview proposal={p} collaboration={collaboration} />;
    return <StageEmpty proposal={p} stage="visual" />;
  }
  const dirs = p.themes?.directions ?? [];
  const requested = params.get('dir') as DirectionId | null;
  // With no direction chosen in the link, a stage that waits for the person opens on the work
  // that is actually waiting. A direction the person picks goes into the URL and is kept.
  const waiting = p.stages.visual.status === 'waiting_for_you';
  const pending = waiting ? pendingVisuals(p) : [];
  const current = v.branches.find((b) => b.directionId === requested) ?? v.branches.find((b) => b.directionId === pending[0]?.directionId) ?? v.branches[0];
  const pendingHere = pending.some((x) => x.directionId === current.directionId);
  const dir = dirs.find((d) => d.id === current.directionId);
  const hasCurrent = current.refined.some((r) => r.status !== 'not_started' && r.status !== 'superseded');
  const requestedPart = params.get('part');
  const part: VisualPart = requestedPart === 'compare' ? 'compare' : requestedPart === 'process' || !hasCurrent ? 'process' : 'current';
  const showPart = (value: VisualPart) => setParams({ part: value });


  return (
    <div className="pw-visual">
      {v.conceptLimits.length > 0 && (
        <details className="pw-limits pw-limits--compact">
          <summary><CircleAlert size={16} aria-hidden="true" /><strong>{t('pw.vis.conceptOnly')}</strong><span>查看 {v.conceptLimits.length} 项使用限制</span></summary>
          <ul>{v.conceptLimits.map((limit) => <li key={limit}>{limit}</li>)}</ul>
        </details>
      )}

      <div className="pw-branches" role="tablist" aria-label={t('pw.vis.branches')}>
        {v.branches.map((b) => {
          const d = dirs.find((x) => x.id === b.directionId);
          const latest = latestRefined(b);
          return (
            <button
              key={b.directionId}
              type="button"
              role="tab"
              aria-selected={b.directionId === current.directionId}
              tabIndex={b.directionId === current.directionId ? 0 : -1}
              id={`visual-tab-${b.directionId}`}
              aria-controls={`visual-panel-${b.directionId}`}
              onKeyDown={(e) => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
                e.preventDefault();
                const index = v.branches.indexOf(b);
                const next = e.key === 'Home' ? 0 : e.key === 'End' ? v.branches.length - 1 : (index + (e.key === 'ArrowLeft' ? -1 : 1) + v.branches.length) % v.branches.length;
                const direction = v.branches[next].directionId;
                setParams({ dir: direction, version: null });
                document.getElementById(`visual-tab-${direction}`)?.focus();
              }}
              className="pw-branch"
              onClick={() => setParams({ dir: b.directionId, version: null })}
              style={{ ['--dir' as string]: d?.color, ['--dir-ink' as string]: d ? inkOn(d.color) : undefined }}
            >
              <span className="pw-branch__thumb">{latest && <ArtFrame spec={latest.art} ratio={[3, 4]} />}</span>
              <span className="pw-branch__text">
                <span className="pw-branch__name">
                  <DirectionMark id={b.directionId} color={d?.color} /> <span>{d?.name}</span>
                </span>
                <span className="small">{latest ? t(`pw.vis.refined.${latest.status}`) : t('pw.vis.noRefined')}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="visual-view-controls" role="group" aria-label={t('pw.vis.pipeline')}>
        <button type="button" aria-pressed={part === 'current'} disabled={!hasCurrent} onClick={() => showPart('current')}>{t('xp.current')}</button>
        <button type="button" aria-pressed={part === 'process'} onClick={() => showPart('process')}>{t('xp.process')}</button>
        <button type="button" aria-pressed={part === 'compare'} onClick={() => showPart('compare')}><ArrowLeftRight size={14} aria-hidden="true" /> {t('xp.compare')}</button>
      </div>
      {part !== 'compare' && <div role="tabpanel" id={`visual-panel-${current.directionId}`} aria-labelledby={`visual-tab-${current.directionId}`} className="pw-branch-panel" aria-label={dir ? `${dir.id} · ${dir.name}` : undefined}>
        {part === 'process' && <ol className="pw-pipeline" aria-label={t('xp.process')}>
          {STEPS.map((step, i) => <li key={step}><a href={`#vis-${step}`} onClick={(e) => { e.preventDefault(); document.getElementById(`vis-${step}`)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); }}><span className="pw-pipeline__n">{i + 1}</span>{t(`pw.vis.step.${step}`)}</a></li>)}
        </ol>}
        <Branch key={current.directionId} branch={current} dirColor={dir?.color} dirName={dir?.name} pendingHere={pendingHere} part={part} />
      </div>}

      {part === 'compare' && <section aria-labelledby="similarity">
        <SectionHead id="similarity" title={t('pw.vis.similarity')} kicker={t('pw.vis.similarityKicker')} />
        <div className="pw-sim">
          <div className="pw-sim__row">
            {v.branches.map((b) => {
              const r = latestRefined(b);
              const d = dirs.find((x) => x.id === b.directionId);
              return (
                <figure key={b.directionId}>
                  {r && <ArtFrame spec={r.art} title={d?.name} />}
                  <figcaption>
                    <DirectionMark id={b.directionId} color={d?.color} /> {d?.name}
                    <button type="button" className="text-link" onClick={() => setParams({ dir: b.directionId, part: 'current', version: null })}>{t('xp.view')} <ArrowLeftRight size={12} aria-hidden="true" /></button>
                  </figcaption>
                </figure>
              );
            })}
          </div>
          <ul className="pw-sim__pairs">
            {v.similarity.map((s) => (
              <li key={s.pair.join()} data-level={s.level}>
                <span className="pw-sim__pair">
                  {s.pair[0]} <ArrowLeftRight size={12} aria-hidden="true" />
                  <span className="sr-only">/</span> {s.pair[1]}
                </span>
                <span className="pw-tag" data-tone={s.level === 'high' ? 'bad' : s.level === 'medium' ? 'warn' : 'ok'}>
                  {t(`pw.vis.sim.${s.level}`)}
                </span>
                <span className="small">{s.note}</span>
                <span className="small muted">→ {s.action}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>}
    </div>
  );
}

export { latestRefined };

function Branch({ branch: b, dirColor, dirName, pendingHere, part }: { branch: VisualBranch; dirColor?: string; dirName?: string; pendingHere: boolean; part: 'current' | 'process' }) {
  const t = useT();
  const [picked, setPicked] = useState<string | null>(null);
  const ref = b.references.find((r) => r.id === picked) ?? b.references.find((r) => r.verdict === 'selected') ?? b.references[0] ?? null;
  const { params, setParams } = useRouter();
  const requestedVersion = params.get('version');
  const latest = latestRefined(b);
  const refined = requestedVersion ? b.refined.find((r) => String(r.version) === requestedVersion && r.status !== 'not_started') : latest;
  const earlier = b.refined.filter((r) => refined && r.version < refined.version);
  const [big, setBig] = useState<number | null>(null);
  const revision = artworkRevision(b);
  const [showEarlier, setShowEarlier] = useState(false);
  const bigView = big !== null ? b.views[big] : null;
  return (
    <div className="pw-branch-body">
      {part === 'process' && <>
      <section id="vis-search" className="vd-search" aria-labelledby="vs-search">
        <p className="pw-kicker" id="vs-search">
          1 · {t('pw.vis.step.search')}
        </p>
        <p className="vd-search__seeking">{b.search.seeking}</p>
        <ul className="vd-borrow" aria-label={t('pw.vis.borrow')}>
          {b.search.borrow.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
        <p className="vd-search__not">
          <span className="pw-label">{t('pw.vis.notFor')}</span> {b.search.notFor}
        </p>

        <div id="vis-references" className="vd-refs">
          <h2 className="vd-refs__title">
            <span className="pw-kicker">2 · {t('pw.vis.step.references')}</span>
            {t('pw.vis.refsTitle', { count: b.references.length, kept: b.references.filter((r) => r.verdict === 'selected').length })}
          </h2>
          <ul className="vd-fan" style={{ '--n': b.references.length } as CSSProperties}>
            {b.references.map((r, i) => (
              <li key={r.id} data-verdict={r.verdict} style={{ '--i': i - (b.references.length - 1) / 2 } as CSSProperties}>
                <button type="button" className="vd-fan__card" aria-pressed={ref?.id === r.id} onClick={() => setPicked(r.id)}>
                  <ArtFrame spec={r.art} title={r.title} ratio={[3, 4]} />
                  <span className="vd-fan__chip">
                    <Verdict v={r.verdict} />
                  </span>
                  <span className="sr-only">{r.title}</span>
                </button>
              </li>
            ))}
          </ul>
          {ref && (
            <div className="vd-ref" data-verdict={ref.verdict} aria-live="polite">
              <div className="vd-ref__head">
                <p className="vd-ref__title">{ref.title}</p>
                <Verdict v={ref.verdict} />
                <span className="pw-kindtag" data-kind={ref.origin === 'cross_industry' ? 'inspiration' : 'comparison'}>
                  {t(`pw.vis.origin.${ref.origin}`)}
                </span>
              </div>
              <p className="small">
                <span className="pw-label">{t('pw.vis.borrowShort')}</span> {ref.borrow}
              </p>
              <p className="small muted">{ref.reason}</p>
            </div>
          )}
          <p className="pw-note">{b.referenceNote}</p>
        </div>
      </section>

      <section id="vis-sketches" className="vd-sketches" aria-labelledby="vs-sketch">
        <SectionHead id="vs-sketch" kicker={`3 · ${t('pw.vis.step.sketches')}`} title={t('pw.vis.sketchTitle', { count: b.sketches.length })} />
        <div className="vd-folder" style={{ '--dir': dirColor } as CSSProperties}>
          <span className="vd-folder__tab" aria-hidden="true">
            {b.directionId}
          </span>
          <ul className="vd-sheets">
            {b.sketches.map((s) => (
              <li key={s.id} className="vd-sheet" data-verdict={s.verdict}>
                <ArtFrame spec={s.art} title={s.title} ratio={[4, 3]} />
                <div className="vd-sheet__head">
                  <span className="vd-sheet__title">{s.title}</span>
                  <Verdict v={s.verdict} />
                </div>
                <Scores rows={s.scores} compact />
                <p className="small muted">{s.reason}</p>
              </li>
            ))}
          </ul>
        </div>
        <p className="pw-note">{b.sketchNote}</p>
      </section>

      </>}
      {part === 'current' && <>
      <section id="vis-refined" aria-labelledby="vs-refined" data-focus="artwork" tabIndex={-1}>
        <div className="visual-versionbar">
          <SectionHead id="vs-refined" title={refined ? t('pw.vis.refinedTitle', { v: refined.version }) : t('pw.vis.noRefined')} />
          {b.refined.filter((item) => item.status !== 'not_started').length > 1 && <label className="visual-version-picker">查看稿件版本
            <select className="pw-input" aria-label="查看稿件版本" id={`visual-version-${b.directionId}`} value={requestedVersion ?? String(latest?.version ?? '')} onChange={(event) => setParams({ version: event.target.value })}>
              {b.refined.filter((item) => item.status !== 'not_started').map((item) => <option key={item.version} value={item.version}>精修第 {item.version} 版 · {t(`pw.vis.refined.${item.status}`)}</option>)}
            </select>
          </label>}
        </div>
        {requestedVersion && !refined && <p role="status" className="pw-note">未找到链接指定的原稿第 {requestedVersion} 版；未替换为其他稿件。</p>}
        {refined && latest && refined.version !== latest.version && <p className="pw-note">正在查看历史精修第 {refined.version} 版；本阶段审批范围仍为当前完整阶段。</p>}
        {refined && pendingHere && refined.status === 'awaiting_review' && (
          <p className="pw-pendingnote">
            <Hand size={16} aria-hidden="true" />
            <span>{t('pw.vis.pendingHere', { v: refined.version })}</span>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={() => {
                const panel = document.querySelector<HTMLElement>('[data-focus="decision"]');
                panel?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
                panel?.focus({ preventScroll: true });
              }}
            >
              <ArrowDown size={14} aria-hidden="true" /> {t('pw.vis.toDecision')}
            </button>
          </p>
        )}
        {refined && (
          <div className="pw-refined" data-status={refined.status}>
            <figure className="pw-refined__art">
              <ArtFrame spec={refined.art} title={t('pw.vis.refinedTitle', { v: refined.version })} />
            </figure>
            <div className="pw-refined__side">
              <span className="pw-tag" data-tone={refined.status === 'accepted' ? 'ok' : refined.status === 'awaiting_review' ? 'attention' : 'neutral'}>
                {t(`pw.vis.refined.${refined.status}`)}
              </span>
              <p className="pw-refined__why">{refined.explanation}</p>
              <Scores rows={refined.scores} />
              <ThresholdLine refined={refined} />
              <ul className="pw-reqs" aria-label={t('pw.vis.requirements')}>
                {refined.requirements.map((r) => (
                  <li key={r.text} data-met={r.met}>
                    {r.met ? <Check size={14} aria-hidden="true" /> : <X size={14} aria-hidden="true" />}
                    <span>
                      {r.text}
                      <span className="sr-only">: {r.met ? t('pw.vis.met') : t('pw.vis.notMet')}</span>
                      {r.note && <span className="small muted"> — {r.note}</span>}
                    </span>
                  </li>
                ))}
              </ul>
              {refined.challenge && <ChallengeCard c={refined.challenge} />}
            </div>
          </div>
        )}
        {revision && (
          <RevisionRecord
            revision={revision}
            onCompare={() => {
              setShowEarlier(true);
              requestAnimationFrame(() => document.getElementById(`vis-compare-${b.directionId}`)?.scrollIntoView({ block: 'center' }));
            }}
          />
        )}
        {earlier.length > 0 && (
          <More label={t('pw.vis.earlier', { count: earlier.length })} forceOpen={showEarlier}>
            {/* Previous and current side by side, only when a previous version exists. */}
            {revision && (
              <div className="pw-compare" id={`vis-compare-${b.directionId}`}>
                {[revision.previous, revision.current].map((r, n) => (
                  <figure key={r.version}>
                    <ArtFrame spec={r.art} title={`v${r.version}`} />
                    <figcaption className="small">
                      <span className="pw-label">{n === 0 ? t('pw.rev.previous') : t('pw.rev.current')}</span> v{r.version} · {t(`pw.vis.refined.${r.status}`)}
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
            <ul className="pw-earlier">
              {earlier.map((r) => (
                <li key={r.version}>
                  <ArtFrame spec={r.art} />
                  <p className="small">
                    v{r.version} · {t(`pw.vis.refined.${r.status}`)}
                  </p>
                  <p className="small muted">{r.explanation}</p>
                </li>
              ))}
            </ul>
          </More>
        )}
      </section>

      {b.views.length > 0 && (
        <section aria-labelledby="vs-views">
          <SectionHead id="vs-views" title={t('pw.vis.views')} kicker={t('pw.vis.viewsKicker')} />
          <ul className="pw-views">
            {b.views.map((x, i) => (
              <li key={x.label}>
                <button type="button" className="pw-view" aria-haspopup="dialog" aria-label={t('pw.vis.viewOpen', { label: x.label })} onClick={() => setBig(i)}>
                  <ArtFrame spec={x.art} title={x.label} ratio={[3, 4]} />
                  <span className="small pw-view__label">
                    {x.label} <Maximize2 size={12} aria-hidden="true" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {/* The view whole and large, at its own proportions. Escape or the close button returns focus to the view. */}
          <Modal open={bigView !== null} onClose={() => setBig(null)} size="lg" title={bigView ? `${bigView.label} · ${b.directionId}${dirName ? ` · ${dirName}` : ''}` : ''}>
            {bigView && (
              <figure className="pw-viewbig">
                <ArtFrame spec={bigView.art} title={bigView.label} />
                <figcaption className="small muted">{t('pw.vis.viewOf', { n: (big ?? 0) + 1, count: b.views.length })}</figcaption>
              </figure>
            )}
          </Modal>
        </section>
      )}

      {b.mockups.length > 0 && <Mockups mockups={b.mockups} />}
      </>}
    </div>
  );
}

/**
 * Placement mockups, folded away by default: the closed fold shows how many there are and a row of
 * small previews; opening it shows each one whole, at its own proportions.
 */
function Mockups({ mockups }: { mockups: VisualBranch['mockups'] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <section className="pw-fold" data-open={open || undefined} aria-labelledby="vs-mockups">
      <button type="button" className="pw-fold__head" aria-expanded={open} aria-controls="vs-mockups-body" onClick={() => setOpen(!open)}>
        <span className="pw-fold__text">
          <span className="pw-kicker">{t('pw.vis.mockupsKicker')}</span>
          <span id="vs-mockups" className="pw-fold__title">
            {t('pw.vis.mockups')} <span className="pw-fold__count">{mockups.length}</span>
          </span>
          <span className="small muted">{mockups.map((m) => m.label).join(' · ')}</span>
        </span>
        {!open && (
          <span className="pw-fold__peek" aria-hidden="true">
            {mockups.slice(0, 4).map((m) => (
              <ArtFrame key={m.label} spec={m.art} />
            ))}
          </span>
        )}
        <span className="pw-fold__toggle">
          <span>{open ? t('pw.fold.hide') : t('pw.fold.show')}</span>
          <ChevronDown size={18} aria-hidden="true" />
        </span>
      </button>
      <div id="vs-mockups-body" className="pw-fold__body" hidden={!open}>
        <ul className="pw-mockups">
          {mockups.map((m) => {
            const [w, h] = naturalRatio(m.art);
            return (
              <li key={m.label} style={{ '--r': w / h } as CSSProperties}>
                <ArtFrame spec={m.art} title={m.label} />
                <p className="pw-mockups__label">{m.label}</p>
                <p className="small muted">{m.why}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/**
 * What happened to a revised artwork, read-only and only from recorded data: why the earlier
 * version did not stand (its upheld challenge or failed acceptance rule), the recorded response,
 * what changed (versions and requirement results), both review results and what is still open.
 */
function RevisionRecord({ revision: r, onCompare }: { revision: ArtworkRevision; onCompare: () => void }) {
  const t = useT();
  const v = (n: number) => `v${n}`;
  const rule = (x: ArtworkRevision['review']['previous']) =>
    `${x.average === null ? t('pw.rev.noScore') : t('pw.rev.avg', { avg: x.average.toFixed(1) })} · ${x.meetsRule ? t('pw.rev.meets') : t('pw.rev.notMeets')} · ${t(`pw.vis.refined.${x.status}`)}`;
  return (
    <section className="pw-rev" aria-labelledby={`rev-${r.current.version}`}>
      <p className="pw-label" id={`rev-${r.current.version}`}>
        {t('pw.rev.title', { from: v(r.previous.version), to: v(r.current.version) })}
      </p>
      <ol className="pw-rev__steps">
        <li>
          <span className="pw-rev__k">{t('pw.rev.request')}</span>
          <span>
            {r.request.challenge ? (
              <>
                {t('pw.rev.challenge', { v: v(r.previous.version) })} “{r.request.challenge}”
              </>
            ) : r.request.unmet.length || r.request.belowAverage ? (
              t('pw.rev.ruleFailed', { v: v(r.previous.version) })
            ) : (
              <span className="muted">{t('pw.rev.noRequest', { v: v(r.previous.version) })}</span>
            )}
            {r.request.unmet.length > 0 && <span className="small muted"> {t('pw.rev.unmetList', { list: r.request.unmet.join('; ') })}</span>}
          </span>
        </li>
        <li>
          <span className="pw-rev__k">{t('pw.rev.response')}</span>
          <span>{r.response ? `“${r.response}”` : <span className="muted">{t('pw.rev.noResponse')}</span>}</span>
        </li>
        <li>
          <span className="pw-rev__k">{t('pw.rev.changed')}</span>
          <span>
            {t('pw.rev.changedArt', { from: v(r.previous.version), to: v(r.current.version) })}{' '}
            <a
              href="#vis-refined"
              className="text-link"
              onClick={(e) => {
                e.preventDefault();
                document.querySelector('.pw-refined__art')?.scrollIntoView({ block: 'center' });
              }}
            >
              {t('pw.rev.seeCurrent', { v: v(r.current.version) })}
            </a>
            {r.requirementChanges.length > 0 && (
              <ul className="pw-rev__reqs">
                {r.requirementChanges.map((c) => (
                  <li key={c.text}>
                    {c.text}: {c.before === null ? t('pw.rev.reqAdded', { state: c.after ? t('pw.vis.met') : t('pw.vis.notMet') }) : t('pw.rev.reqChange', { from: c.before ? t('pw.vis.met') : t('pw.vis.notMet'), to: c.after ? t('pw.vis.met') : t('pw.vis.notMet') })}
                  </li>
                ))}
              </ul>
            )}
            <span className="small muted pw-rev__limit">{t('pw.rev.noDiff')}</span>
          </span>
        </li>
        <li>
          <span className="pw-rev__k">{t('pw.rev.review')}</span>
          <span>
            {v(r.previous.version)}: {rule(r.review.previous)}
            <br />
            {v(r.current.version)}: {rule(r.review.current)}
          </span>
        </li>
        <li>
          <span className="pw-rev__k">{t('pw.rev.open')}</span>
          <span>
            {r.open.length === 0 ? (
              <span className="muted">{t('pw.rev.noneRecorded', { v: v(r.current.version) })}</span>
            ) : (
              r.open.map((x) => (x.kind === 'requirement' ? t('pw.cp.unmet', { text: x.text }) : x.kind === 'below' ? t('pw.cp.below', { avg: x.average.toFixed(1) }) : `${t(`pw.challenge.${x.outcome}`)}: ${x.text}`)).join(' · ')
            )}
          </span>
        </li>
      </ol>
      <button type="button" className="btn btn--secondary btn--sm" onClick={onCompare}>
        {t('pw.rev.compare', { from: v(r.previous.version), to: v(r.current.version) })}
      </button>
    </section>
  );
}

function Verdict({ v }: { v: 'selected' | 'rejected' }) {
  const t = useT();
  return (
    <span className="pw-verdict" data-v={v}>
      {v === 'selected' ? <Sparkles size={12} aria-hidden="true" /> : <X size={12} aria-hidden="true" />}
      {t(`pw.vis.verdict.${v}`)}
    </span>
  );
}

/** States the acceptance rule in words: average ≥ 4 and every mandatory requirement met. */
function ThresholdLine({ refined }: { refined: RefinedVisual }) {
  const t = useT();
  const avg = average(refined.scores);
  const unmet = refined.requirements.filter((r) => !r.met).length;
  const pass = avg !== null && avg >= 4 && unmet === 0;
  return (
    <p className="pw-threshold" data-pass={pass || undefined}>
      {pass ? t('pw.vis.passes') : unmet ? t('pw.vis.unmet', { count: unmet }) : t('pw.vis.belowAvg')}
    </p>
  );
}
