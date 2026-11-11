import { ArrowUpRight } from 'lucide-react';
import { Link, projectPath } from '../../app/router';
import type { Proposal } from '../../domain/proposal';
import { useT } from '../../i18n';
import { DirectionMark, SectionHead } from '../../proposal/ui';
import { ReviewRows } from './ReviewRows';
import { StageEmpty } from './StageEmpty';
import { StudioCapability, StudioPreparationStatus, useProposalStudio } from '../../proposal/deck-studio-ui';
import { DeckStudioViewer } from '../../proposal/deck-studio';
import { QingyuLayoutPreview } from '../../proposal/qingyu-layout/QingyuLayoutPreview';
import { isQingyuLayoutProposal } from '../../proposal/qingyu-layout/preview';


export function DeliveryStage({ proposal: p }: { proposal: Proposal }) {
  if (isQingyuLayoutProposal(p)) return <QingyuLayoutPreview proposal={p} presentation="delivery" />;
  return <NativeDeliveryStage proposal={p} />;
}

function NativeDeliveryStage({ proposal: p }: { proposal: Proposal }) {
  const t = useT();
  const studio = useProposalStudio(p);
  const deck = studio.state.kind === 'ready' ? studio.state.value.find(entry => entry.style.id === p.layout?.chosen)?.deck : undefined;
  const d = p.delivery;
  if (!d || p.stages.delivery.status === 'not_started') return <><StudioCapability proposal={p} /><StageEmpty proposal={p} stage="delivery" /></>;
  const dirs = p.themes?.directions ?? [];
  const ids = dirs.map((x) => x.id);
  return (
    <div className="pw-delivery">
      <section aria-labelledby="delivery-current-deck">
        <SectionHead id="delivery-current-deck" title="当前成稿" />
        <StudioPreparationStatus state={studio.state} retry={studio.retry} />
        {deck && <><p className="studio-reading-note">{deck.status}</p><DeckStudioViewer deck={deck} /></>}
      </section>

      <section aria-labelledby="final-checks">
        <SectionHead id="final-checks" title={t('pw.del.checks')} kicker={t('pw.del.checksKicker')} />
        <ReviewRows title={t('pw.del.checks')} outcomes={['pass', 'fixed', 'open']} labelPrefix="pw.del.outcome" items={d.checks.map((c) => ({ id: c.id, title: c.area, note: c.note, outcome: c.outcome }))} />
      </section>

      {d.comparison.length > 0 && (
        <details className="qy-layout-records" aria-labelledby="compare">
          <summary id="compare">{t('pw.del.compare')}与推荐</summary>
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
        </details>
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
      <section aria-labelledby="delivery-export"><SectionHead id="delivery-export" title="交付" />
      <Link to={projectPath(p.workbenchId, 'delivery')} className="pw-cta dl-cta">
        <span>
          <span className="pw-label">{t('pw.area.delivery')}</span>
          {t('pw.del.openCenter')}
        </span>
        <span className="dl-cta__orb" aria-hidden="true">
          <ArrowUpRight size={26} />
        </span>
      </Link>
      </section>
    </div>
  );
}
