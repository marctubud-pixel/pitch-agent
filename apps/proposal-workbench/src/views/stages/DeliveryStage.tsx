/**
 * H. Final review & delivery. The rendered deck is reviewed again (content, hierarchy, images,
 * text fit, mockups, rendering, editability), the directions are compared side by side, and
 * the remaining limitations are stated. The deck itself lives in the Delivery Center.
 *
 * Composition, after the supplied decks: the way to the deck as the cobalt closing page ("We
 * Appreciate Your Time") with a lime arrow button; review counts and rows as in ReviewRows; the
 * recommendation as a headline with its phrase highlighted; limitations on a dark tile.
 */
import { ArrowUpRight } from 'lucide-react';
import { Link, projectPath } from '../../app/router';
import type { DirectionId, Proposal } from '../../domain/proposal';
import { useT } from '../../i18n';
import { DirectionMark, SectionHead } from '../../proposal/ui';
import { ReviewRows } from './ReviewRows';
import { StageEmpty } from './StageEmpty';


export function DeliveryStage({ proposal: p }: { proposal: Proposal }) {
  const t = useT();
  const d = p.delivery;
  if (!d || p.stages.delivery.status === 'not_started') return <StageEmpty proposal={p} stage="delivery" />;
  const dirs = p.themes?.directions ?? [];
  const ids = dirs.map((x) => x.id) as DirectionId[];
  return (
    <div className="pw-delivery">
      <Link to={projectPath(p.workbenchId, 'delivery')} className="pw-cta dl-cta">
        <span>
          <span className="pw-label">{t('pw.area.delivery')}</span>
          {t('pw.del.openCenter')}
        </span>
        <span className="dl-cta__orb" aria-hidden="true">
          <ArrowUpRight size={26} />
        </span>
      </Link>

      <section aria-labelledby="final-checks">
        <SectionHead id="final-checks" title={t('pw.del.checks')} kicker={t('pw.del.checksKicker')} />
        <ReviewRows title={t('pw.del.checks')} outcomes={['pass', 'fixed', 'open']} labelPrefix="pw.del.outcome" items={d.checks.map((c) => ({ id: c.id, title: c.area, note: c.note, outcome: c.outcome }))} />
      </section>

      {d.comparison.length > 0 && (
        <section aria-labelledby="compare">
          <SectionHead id="compare" title={t('pw.del.compare')} />
          <div className="tx-table-wrap">
            <table className="tx-table">
              <thead>
                <tr>
                  <th scope="col">{t('pw.del.criterion')}</th>
                  {dirs.map((x) => (
                    <th key={x.id} scope="col">
                      <DirectionMark id={x.id} color={x.color} /> {x.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.comparison.map((row) => (
                  <tr key={row.criterion}>
                    <th scope="row">{row.criterion}</th>
                    {ids.map((id) => (
                      <td key={id}>{row.values[id]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="dl-rec">
            <span className="pw-label">{t('pw.del.recommendation')}</span> <mark>{d.recommendation}</mark>
          </p>
        </section>
      )}

      <section className="dl-limits" aria-labelledby="limits">
        <h2 id="limits" className="dl-limits__title">
          {t('pw.del.limits')}
        </h2>
        <ul className="dl-limits__list">
          {d.limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
