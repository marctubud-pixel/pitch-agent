import type { ReactNode } from 'react';
import { useRouter } from '../app/router';

/** Section tabs kept in the URL (?tab=), so links and reloads land on the same tab. */
export function useTab<T extends string>(tabs: readonly T[], fallback: T): [T, (t: T) => void] {
  const { params, setParams } = useRouter();
  const raw = params.get('tab') as T | null;
  const tab = raw && tabs.includes(raw) ? raw : fallback;
  return [tab, (t: T) => setParams({ tab: t, artifact: null, stage: null })];
}

/**
 * Tabs drawn as folder tabs on top of one sheet, after the supplied Floe and Moov folder pages:
 * the current tab is the same colour as the sheet below it, so the two read as one folder.
 */
export function FolderTabs<T extends string>({ tabs, current, onChange, label, render, children }: { tabs: readonly T[]; current: T; onChange: (t: T) => void; label: string; render: (t: T) => ReactNode; children: ReactNode }) {
  return (
    <div className="area-folder" data-first={current === tabs[0] || undefined}>
      <nav className="area-tabs" aria-label={label}>
        {tabs.map((t) => (
          <button key={t} type="button" aria-current={t === current ? 'page' : undefined} onClick={() => onChange(t)}>
            {render(t)}
          </button>
        ))}
      </nav>
      <div className="area-sheet">{children}</div>
    </div>
  );
}
