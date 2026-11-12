import { ArrowRight, TriangleAlert } from 'lucide-react';
import type { ArtifactSummary } from '../domain/models';
import { useI18n } from '../i18n';
import type { FieldChange } from './taskCard';

/**
 * What applying a brief change will do: each changed field before and after, whether a new
 * version is created (the previous one is kept), and which documents will go out of date.
 */
export function ChangeReview({
  changes,
  confirmed,
  currentVersion,
  dependents,
  sourceLabel,
}: {
  changes: FieldChange[];
  confirmed: boolean;
  currentVersion: number;
  dependents: ArtifactSummary[];
  sourceLabel: string | null;
}) {
  const { t, list } = useI18n();
  const stale = dependents.filter((d) => d.status !== 'stale');
  const show = (text: string) => (text ? text : <span className="muted">{t('change.empty')}</span>);
  return (
    <div className="change-review stack">
      <p className="banner" data-tone="info">
        {confirmed ? t('change.newVersion', { next: currentVersion + 1, v: currentVersion }) : t('change.sameDraft', { v: currentVersion })}
        {sourceLabel && ` ${t('change.source', { name: sourceLabel })}`}
      </p>
      {changes.length === 0 ? (
        <p className="muted">{t('change.none')}</p>
      ) : (
        <ol className="change-list" aria-label={t('change.listLabel', { count: changes.length })}>
          {changes.map((c) => (
            <li key={c.field} className="change">
              <p className="change__field">{c.field === 'visualRequirements' ? '视觉成果与视图要求' : c.field === 'proposalType' ? '提案类型' : t(`taskField.${c.field}`)}</p>
              <div className="change__pair">
                <div className="change__side" data-side="before">
                  <span className="change__tag">{t('change.before')}</span>
                  <p>{show(c.before)}</p>
                </div>
                <ArrowRight size={16} aria-hidden="true" className="change__arrow" />
                <div className="change__side" data-side="after">
                  <span className="change__tag">{t('change.after')}</span>
                  <p>{show(c.after)}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
      {confirmed && stale.length > 0 && (
        <div className="banner banner--row" data-tone="warn">
          <TriangleAlert size={16} aria-hidden="true" />
          <p>{t('change.stale', { docs: list(stale.map((d) => t(d.stage === 'research' ? 'res.versionLabel' : 'art.strategyLabel', { v: d.version }))) })}</p>
        </div>
      )}
      {confirmed && <p className="small muted">{t('change.reconfirm')}</p>}
    </div>
  );
}
