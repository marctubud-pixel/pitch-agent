import { useCallback, useEffect, useState } from 'react';

/** "auto" follows the system; the other two pin the interface to one mode. */
export type ThemeChoice = 'auto' | 'light' | 'dark';

const KEY = 'pw.theme';

export function readTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    /* storage can be blocked; fall back to following the system */
  }
  return 'auto';
}

/** Styles key off `data-theme` on the root; with none set, the system preference decides. */
export function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
}

export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(readTheme);
  useEffect(() => {
    applyTheme(choice);
  }, [choice]);
  const set = useCallback((next: ThemeChoice) => {
    setChoice(next);
    try {
      if (next === 'auto') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {
      /* the choice still applies for this visit */
    }
  }, []);
  return [choice, set] as const;
}
