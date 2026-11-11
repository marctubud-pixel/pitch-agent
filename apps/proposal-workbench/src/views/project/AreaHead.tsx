/**
 * Header for the Library, Process & history and Delivery tabs: the title and what the tab holds
 * on the left, a few big-number tiles on the right (after Patria's coloured number tiles).
 */
import type { ReactNode } from 'react';
import { Link } from '../../app/router';

export interface AreaStat {
  n: ReactNode;
  label: string;
  tone: 'lime' | 'lilac' | 'dark' | 'white' | 'peach';
  to?: string;
}

export function AreaHead({ kicker, title, lede, stats, children }: { kicker?: string; title: string; lede: string; stats?: AreaStat[]; children?: ReactNode }) {
  return (
    <header className="area-head">
      <div className="area-head__text">
        {kicker && <p className="bx-bracket">{kicker}</p>}
        <h1 className="area-head__title">{title}</h1>
        <p className="area-head__lede">{lede}</p>
        {children}
      </div>
      {stats && stats.length > 0 && (
        <ul className="area-stats">
          {stats.map((s) => (
            <li key={s.label} data-tone={s.tone}>
              {s.to ? (
                <Link to={s.to} className="area-stat">
                  <Stat s={s} />
                </Link>
              ) : (
                <span className="area-stat">
                  <Stat s={s} />
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </header>
  );
}

const Stat = ({ s }: { s: AreaStat }) => (
  <>
    <span className="area-stat__n">{s.n}</span>
    <span className="area-stat__label">{s.label}</span>
  </>
);
