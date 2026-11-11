/**
 * C. Strategy. Starts from the question the proposal must answer, shows where category, brand
 * and audience meet (with the evidence behind each), argues to a conclusion that answers the
 * question, and names the creative opportunities that follow.
 *
 * Composition, after the supplied marketing deck: "How We Drive Growth?" → the question as a big
 * bold headline on a white sheet beside three tall numbered picture cards, one per circle, each
 * ending in a coloured pill; "E-com market is expected to exceed $300B" → the intersection set as
 * a headline with its phrase highlighted. The interactive three-circle diagram stays beside it.
 */
import { useState, type CSSProperties } from 'react';
import { ArrowDown, ArrowUpRight, Check, CornerDownRight } from 'lucide-react';
import { Link, projectPath, useRouter } from '../../app/router';
import type { ArtSpec, Proposal } from '../../domain/proposal';
import { useT } from '../../i18n';
import { DirectionMark, EvidenceChips, SectionHead } from '../../proposal/ui';
import { ArtFrame } from '../../ui/art/ArtFrame';
import { StageEmpty } from './StageEmpty';
import { QingyuStrategyPreview } from '../../proposal/qingyu-strategy/QingyuStrategyPreview';

/** A picture for each circle, taken from the matching research section. */
function sectionPic(p: Proposal, c: 'category' | 'brand' | 'audience'): ArtSpec | null {
  const items = (p.research?.sections.find((s) => s.id === c)?.groups ?? []).flatMap((g) => g.items);
  return (items.find((x) => x.art.kind === 'scene') ?? items[0])?.art ?? null;
}

type Circle = 'category' | 'brand' | 'audience';
const CIRCLES: Circle[] = ['category', 'brand', 'audience'];

export function StrategyStage({ proposal: p }: { proposal: Proposal }) {
  const t = useT();
  const pid = p.workbenchId;
  const s = p.strategy;
  // Coming back from a piece of evidence (`?focus=circle-brand`) reopens the circle it came from.
  const { params } = useRouter();
  const back = params.get('focus');
  const [active, setActive] = useState<Circle | 'center'>(() => {
    const c = back?.startsWith('circle-') ? (back.slice(7) as Circle) : null;
    return c && (CIRCLES as readonly string[]).includes(c) ? c : 'center';
  });
  if (p.id === 'qingyu-pack' && p.workbenchId === 'qingyu' && p.type === 'packaging' && s === null) return <QingyuStrategyPreview proposal={p} />;
  if (!s) return <StageEmpty proposal={p} stage="strategy" />;
  const dirs = p.themes?.directions ?? [];
  return (
    <div className="pw-strategy">
      <section className="st-sheet" aria-labelledby="q">
        <div className="st-sheet__lead">
          <span className="bf-tag">
            <span className="bf-tag__n">?</span>
            <span id="q">{t('pw.str.question')}</span>
          </span>
          <p className="st-question">{s.question}</p>
          <p className="small muted">{t(`pw.str.structure.${s.structure}`)}</p>
          <span className="bf-lead__arrow" aria-hidden="true">
            <ArrowUpRight size={34} strokeWidth={1.8} />
          </span>
        </div>
        <ol className="st-cards">
          {CIRCLES.map((c, n) => {
            const pic = sectionPic(p, c);
            return (
              <li key={c} className="st-card" data-c={c}>
                {pic && <ArtFrame spec={pic} fill className="st-card__art" />}
                <span className="st-card__shade" aria-hidden="true" />
                <span className="st-card__n">{n + 1}</span>
                <div className="st-card__text">
                  <p className="st-card__title">{s.circles[c].title}</p>
                  <p className="st-card__points">{s.circles[c].points[0]?.text}</p>
                  <button type="button" className="st-card__pill" aria-pressed={active === c} onClick={() => setActive(active === c ? 'center' : c)}>
                    {t(`pw.str.circle.${c}`)}
                    <Check size={14} aria-hidden="true" />
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="pw-venn-wrap st-meet" aria-labelledby="venn">
        <SectionHead id="venn" title={t('pw.str.where')} />
        <div className="pw-venn-grid">
          <div className="pw-venn__detail" aria-live="polite" data-focus={active === 'center' ? undefined : `circle-${active}`} tabIndex={-1}>
            {active === 'center' ? (
              <>
                <p className="pw-label">{t('pw.str.intersection')}</p>
                <p className="st-insight">
                  <mark>{s.intersection.insight}</mark>
                </p>
                <p className="small">{s.intersection.why}</p>
                <p className="small muted">{t('pw.str.pickCircle')}</p>
              </>
            ) : (
              <>
                <p className="pw-label">{t(`pw.str.circle.${active}`)}</p>
                <p className="pw-h3">{s.circles[active].title}</p>
                <ul className="pw-points">
                  {s.circles[active].points.map((pt) => (
                    <li key={pt.text}>
                      <p>{pt.text}</p>
                      <EvidenceChips refs={pt.evidence} projectId={pid} from={{ stage: 'strategy', at: `circle-${active}` }} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <div className="pw-venn" role="group" aria-label={t('pw.str.where')}>
            {CIRCLES.map((c) => (
              <button key={c} type="button" className="pw-venn__c" data-c={c} aria-pressed={active === c} onClick={() => setActive(active === c ? 'center' : c)}>
                <span>{t(`pw.str.circle.${c}`)}</span>
              </button>
            ))}
            <button type="button" className="pw-venn__center" aria-pressed={active === 'center'} onClick={() => setActive('center')}>
              {t('pw.str.intersection')}
            </button>
          </div>
        </div>
      </section>

      <section aria-labelledby="argument">
        <SectionHead id="argument" title={t('pw.str.argument')} />
        <ol className="pw-argument st-steps">
          {s.argument.map((a, i) => (
            <li key={a.step} data-focus={`arg-${i + 1}`} tabIndex={-1}>
              <span className="pw-argument__n">{i + 1}</span>
              <div>
                <p className="pw-argument__step">{a.step}</p>
                <p className="small">{a.detail}</p>
                <EvidenceChips refs={a.evidence} projectId={pid} from={{ stage: 'strategy', at: `arg-${i + 1}` }} />
              </div>
            </li>
          ))}
        </ol>
        <div className="pw-conclusion st-conclusion">
          <ArrowDown size={18} aria-hidden="true" />
          <p className="pw-label">{t('pw.str.conclusion')}</p>
          <p className="pw-display pw-display--md">{s.conclusion}</p>
          <div className="pw-answer">
            <CornerDownRight size={16} aria-hidden="true" />
            <p>
              <span className="pw-label">{t('pw.str.answers')}</span> {s.answer}
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="opps">
        <SectionHead id="opps" title={t('pw.str.opportunities')} kicker={t('pw.str.oppKicker')} />
        <ul className="pw-opps st-opps">
          {s.opportunities.map((o) => {
            const d = dirs.find((x) => x.id === o.leadsTo);
            return (
              <li key={o.id} className="pw-opp st-opp" data-focus={`opp-${o.id}`} tabIndex={-1} style={d ? ({ '--dir': d.color } as CSSProperties) : undefined}>
                <p className="pw-h3">{o.title}</p>
                <p>{o.idea}</p>
                <p className="small">
                  <span className="pw-label">{t('pw.str.because')}</span> {o.because}
                </p>
                <EvidenceChips refs={o.evidence} projectId={pid} from={{ stage: 'strategy', at: `opp-${o.id}` }} />
                {d && (
                  <Link className="pw-opp__leads" to={projectPath(pid, 'proposal', { stage: 'themes' })}>
                    <DirectionMark id={d.id} color={d.color} /> {t('pw.str.leadsTo', { name: d.name })}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
