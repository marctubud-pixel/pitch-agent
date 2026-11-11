/**
 * D. Copy & creative themes. Three directions that differ in mechanism, each led by its line.
 * Review outcomes are kept apart from what a person chose, so "passed review" and "kept by you
 * despite reviewer advice" never blur.
 *
 * Composition, after the supplied references:
 * - the Sky Grip / Net Pulse / Feather Rally page → a stacked three-line statement on the left
 *   (here the three direction names) beside three tall cards: a pale top panel with a tag chip,
 *   an arrow and a big two-line name, and a full colour panel below (here the direction's line);
 * - the "The opportunity" slide → the recommendation as a headline with one highlighted phrase;
 * - the comparison rows are a plain side-by-side table, so each direction answers the same questions.
 */
import { Award, UserCheck } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { Direction, Proposal } from '../../domain/proposal';
import { useT } from '../../i18n';
import { ChallengeCard, DirectionMark, More, Scores, SectionHead } from '../../proposal/ui';
import { inkOn } from '../../proposal/color';
import { StageEmpty } from './StageEmpty';

const OUTCOME_TONE: Record<Direction['reviewOutcome'], string> = { passed: 'ok', passed_with_notes: 'info', below_threshold: 'warn' };

export function ThemesStage({ proposal: p }: { proposal: Proposal }) {
  const t = useT();
  const th = p.themes;
  if (!th) return <StageEmpty proposal={p} stage="themes" />;
  const rec = th.directions.find((d) => d.id === th.recommendation.id);
  return (
    <div className="pw-themes tx">
      <section className="tx-hero" aria-label={t('pw.stage.themes')}>
        <div className="tx-intro">
          <p className="tx-stack" aria-hidden="true">
            {th.directions.map((d) => (
              <span key={d.id}>{d.name}.</span>
            ))}
          </p>
          <p className="tx-copydir">
            <span className="pw-label">{t('pw.th.copyDirection')}</span> {th.copyDirection}
          </p>
        </div>

        <ul className="tx-cards">
          {th.directions.map((d) => (
            <li key={d.id} className="tx-card" data-recommended={d.id === th.recommendation.id || undefined} style={{ '--dir': d.color, '--dir-ink': inkOn(d.color) } as CSSProperties}>
              <div className="tx-card__top">
                <div className="tx-card__chips">
                  <span className="tx-chip">{t(`pw.mech.${d.mechanism}`)}</span>
                  <DirectionMark id={d.id} color={d.color} />
                </div>
                <h2 className="tx-card__name">{d.name}</h2>
                <p className="tx-card__why">{d.rationale}</p>
              </div>
              <div className="tx-card__panel">
                {d.id === th.recommendation.id && (
                  <span className="tx-badge">
                    <Award size={13} aria-hidden="true" /> {t('pw.th.recommended')}
                  </span>
                )}
                <p className="tx-card__slogan">{d.slogan}</p>
                <p className="tx-card__sub">{d.subline}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {rec && (
        <section className="tx-rec" id="tx-rec" aria-labelledby="tx-rec-title" style={{ '--dir': rec.color } as CSSProperties}>
          <h2 id="tx-rec-title" className="tx-rec__title">
            {t('pw.th.recLead')} <mark>{`${rec.id} · ${rec.name}`}</mark>
          </h2>
          <ol className="tx-reasons">
            {th.recommendation.reasons.map((r, i) => (
              <li key={r}>
                <span className="tx-reasons__n">{String(i + 1).padStart(2, '0')}</span>
                <p>{r}</p>
              </li>
            ))}
          </ol>
          <p className="tx-rec__note">
            <span className="pw-label">{t('pw.th.director')}</span> {th.directorNote}
          </p>
          {th.historicalNote && <p className="small muted">{th.historicalNote}</p>}
        </section>
      )}

      <section aria-labelledby="tx-compare">
        <SectionHead id="tx-compare" title={t('pw.th.compare')} kicker={t('pw.th.compareKicker')} />
        <div className="tx-table-wrap">
          <table className="tx-table">
            <thead>
              <tr>
                <td />
                {th.directions.map((d) => (
                  <th key={d.id} scope="col">
                    <DirectionMark id={d.id} color={d.color} /> {d.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">{t('pw.th.brand')}</th>
                {th.directions.map((d) => (
                  <td key={d.id}>{d.connections.brand}</td>
                ))}
              </tr>
              <tr>
                <th scope="row">{t('pw.th.audience')}</th>
                {th.directions.map((d) => (
                  <td key={d.id}>{d.connections.audience}</td>
                ))}
              </tr>
              <tr>
                <th scope="row">{t('pw.th.assignment')}</th>
                {th.directions.map((d) => (
                  <td key={d.id}>{d.connections.assignment}</td>
                ))}
              </tr>
              <tr>
                <th scope="row">{t('pw.th.differs')}</th>
                {th.directions.map((d) => (
                  <td key={d.id}>{d.difference}</td>
                ))}
              </tr>
              <tr>
                <th scope="row">{t('pw.th.review')}</th>
                {th.directions.map((d) => (
                  <td key={d.id}>
                    <span className="tx-tags">
                      <span className="pw-tag" data-tone={OUTCOME_TONE[d.reviewOutcome]}>
                        {t(`pw.outcome.${d.reviewOutcome}`)}
                      </span>
                      {d.disposition === 'kept_by_you_despite_review' && (
                        <span className="pw-tag" data-tone="neutral">
                          <UserCheck size={12} aria-hidden="true" /> {t('pw.disp.kept_by_you_despite_review')}
                        </span>
                      )}
                    </span>
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row">{t('pw.th.lines')}</th>
                {th.directions.map((d) => (
                  <td key={d.id}>
                    {d.copyLines.length > 0 ? (
                      <More label={t('pw.th.copyLines', { count: d.copyLines.length })}>
                        <ul className="pw-copylines">
                          {d.copyLines.map((l) => (
                            <li key={l}>{l}</li>
                          ))}
                        </ul>
                      </More>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="evaluation">
        <SectionHead id="evaluation" title={t('pw.th.evaluation')} kicker={t('pw.th.evalKicker')} />
        <div className="pw-evals tx-evals">
          {th.directions.map((d) => (
            <div key={d.id} className="pw-eval">
              <p className="pw-eval__title">
                <DirectionMark id={d.id} color={d.color} /> {d.name}
              </p>
              <Scores rows={d.scores} compact />
              <More label={t('pw.th.evalMore')}>
                <Scores rows={d.scores} />
                <p className="small">
                  <span className="pw-label">{t('pw.th.brandView')}</span> {d.brandView}
                </p>
                <p className="small">
                  <span className="pw-label">{t('pw.th.audienceView')}</span> {d.audienceView}
                </p>
                {d.challenges.map((c) => (
                  <ChallengeCard key={c.claim} c={c} />
                ))}
              </More>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
