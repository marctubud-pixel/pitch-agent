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
import { useState, type CSSProperties } from 'react';
import { ArrowLeftRight, Check, ChevronDown, CircleAlert, Sparkles, X } from 'lucide-react';
import { useRouter } from '../../app/router';
import type { DirectionId, Proposal, RefinedVisual, VisualBranch } from '../../domain/proposal';
import { useT } from '../../i18n';
import { average, ChallengeCard, DirectionMark, More, Scores, SectionHead } from '../../proposal/ui';
import { ArtFrame, naturalRatio } from '../../ui/art/ArtFrame';
import { inkOn } from '../../proposal/color';
import { StageEmpty } from './StageEmpty';

const STEPS = ['search', 'references', 'sketches', 'refined'] as const;

export function VisualStage({ proposal: p }: { proposal: Proposal }) {
  const t = useT();
  const { params, setParams } = useRouter();
  const v = p.visual;
  if (!v) return <StageEmpty proposal={p} stage="visual" />;
  const dirs = p.themes?.directions ?? [];
  const requested = params.get('dir') as DirectionId | null;
  const current = v.branches.find((b) => b.directionId === requested) ?? v.branches[0];
  const dir = dirs.find((d) => d.id === current.directionId);

  return (
    <div className="pw-visual">
      {v.conceptLimits.length > 0 && (
        <div className="pw-limits" role="note">
          <CircleAlert size={18} aria-hidden="true" />
          <div>
            <p className="pw-label">{t('pw.vis.conceptOnly')}</p>
            <ul>
              {v.conceptLimits.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </div>
        </div>
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
              className="pw-branch"
              onClick={() => setParams({ dir: b.directionId })}
              style={{ ['--dir' as string]: d?.color, ['--dir-ink' as string]: d ? inkOn(d.color) : undefined }}
            >
              <span className="pw-branch__thumb">{latest && <ArtFrame spec={latest.art} ratio={[3, 4]} />}</span>
              <span className="pw-branch__text">
                <span className="pw-branch__name">
                  <DirectionMark id={b.directionId} color={d?.color} /> {d?.name}
                </span>
                <span className="small">{latest ? t(`pw.vis.refined.${latest.status}`) : t('pw.vis.noRefined')}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div role="tabpanel" className="pw-branch-panel" aria-label={dir ? `${dir.id} · ${dir.name}` : undefined}>
        <ol className="pw-pipeline" aria-label={t('pw.vis.pipeline')}>
          {STEPS.map((s, i) => (
            <li key={s}>
              <a href={`#vis-${s}`} onClick={(e) => (e.preventDefault(), document.getElementById(`vis-${s}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))}>
                <span className="pw-pipeline__n">{i + 1}</span>
                {t(`pw.vis.step.${s}`)}
              </a>
            </li>
          ))}
        </ol>
        <Branch key={current.directionId} branch={current} dirColor={dir?.color} />
      </div>

      <section aria-labelledby="similarity">
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
      </section>
    </div>
  );
}

export function latestRefined(b: VisualBranch): RefinedVisual | null {
  const live = b.refined.filter((r) => r.status !== 'superseded' && r.status !== 'not_started');
  return live[live.length - 1] ?? b.refined[b.refined.length - 1] ?? null;
}

function Branch({ branch: b, dirColor }: { branch: VisualBranch; dirColor?: string }) {
  const t = useT();
  const [picked, setPicked] = useState<string | null>(null);
  const ref = b.references.find((r) => r.id === picked) ?? b.references.find((r) => r.verdict === 'selected') ?? b.references[0] ?? null;
  const refined = latestRefined(b);
  const earlier = b.refined.filter((r) => r !== refined);
  const [big, setBig] = useState<number | null>(null);
  return (
    <div className="pw-branch-body">
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

      <section id="vis-refined" aria-labelledby="vs-refined">
        <SectionHead id="vs-refined" kicker={`4 · ${t('pw.vis.step.refined')}`} title={refined ? t('pw.vis.refinedTitle', { v: refined.version }) : t('pw.vis.noRefined')} />
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
        {earlier.length > 0 && (
          <More label={t('pw.vis.earlier', { count: earlier.length })}>
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
                <button type="button" className="pw-view" aria-pressed={big === i} onClick={() => setBig(big === i ? null : i)}>
                  <ArtFrame spec={x.art} title={x.label} ratio={[3, 4]} />
                  <span className="small">{x.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {b.mockups.length > 0 && <Mockups mockups={b.mockups} />}
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
