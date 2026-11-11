/**
 * Review results shared by Content review and Final review, after the supplied references:
 * Patria's bracketed big-number tiles for the counts, then the Atacama "initiatives" rows (the
 * question, its note and an outcome tag) for each check.
 */
import type { CSSProperties } from 'react';
import { Check, CircleDot, RotateCcw, Wrench } from 'lucide-react';
import { useT, type TKey } from '../../i18n';

export type Outcome = 'pass' | 'revised' | 'fixed' | 'open';
const ICON = { pass: Check, revised: RotateCcw, fixed: Wrench, open: CircleDot } as const;

export function ReviewRows({ items, outcomes, labelPrefix, title }: { items: Array<{ id: string; title: string; note: string; outcome: Outcome }>; outcomes: Outcome[]; labelPrefix: 'pw.cr.outcome' | 'pw.del.outcome'; title: string }) {
  const t = useT();
  return (
    <div className="rv">
      <ul className="rv-tiles" aria-label={title}>
        {outcomes.map((o) => (
          <li key={o} className="rv-tile" data-outcome={o} data-zero={items.every((x) => x.outcome !== o) || undefined} style={{ '--n': items.filter((x) => x.outcome === o).length } as CSSProperties}>
            <span className="rv-tile__label">{t(`${labelPrefix}.${o}` as TKey)}</span>
            <span className="rv-tile__n">{items.filter((x) => x.outcome === o).length}</span>
            <span className="rv-tile__of">/ {items.length}</span>
          </li>
        ))}
      </ul>
      <ul className="rv-rows">
        {items.map((c) => {
          const Icon = ICON[c.outcome];
          return (
            <li key={c.id} data-outcome={c.outcome}>
              <span className="rv-rows__icon" aria-hidden="true">
                <Icon size={15} />
              </span>
              <div className="rv-rows__text">
                <p className="rv-rows__q">{c.title}</p>
                {c.note && <p className="rv-rows__note">{c.note}</p>}
              </div>
              <span className="rv-rows__tag" data-outcome={c.outcome}>
                {t(`${labelPrefix}.${c.outcome}` as TKey)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
