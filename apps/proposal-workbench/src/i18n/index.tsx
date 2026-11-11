/**
 * Interface language. Components call `useI18n()` for `t()` and locale-aware formatting.
 *
 * Text written by people (project names, research, notes) is never translated. Text the
 * service generates (findings, checks, next steps, errors) arrives already localised, because
 * the provider tells the service which language to use.
 */
import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useService } from '../app/services';
import { readPreference, writePreference } from '../app/prefs';
import { en, type Messages } from './messages/en';
import { es } from './messages/es';
import { fr } from './messages/fr';
import { ja } from './messages/ja';
import { ko } from './messages/ko';
import { zhCN } from './messages/zh-CN';
import { setFormatLocale } from '../ui/format';

export type Locale = 'en' | 'fr' | 'es' | 'ja' | 'ko' | 'zh-CN';

/** Each language is named in itself, so people can find theirs whatever is showing. */
export const LOCALES: Array<{ id: Locale; label: string; short: string }> = [
  { id: 'en', label: 'English', short: 'EN' },
  { id: 'fr', label: 'Français', short: 'FR' },
  { id: 'es', label: 'Español', short: 'ES' },
  { id: 'ja', label: '日本語', short: 'JA' },
  { id: 'ko', label: '한국어', short: 'KO' },
  { id: 'zh-CN', label: '简体中文', short: '中文' },
];

const CATALOGS: Record<Locale, Messages> = { en, fr, es, ja, ko, 'zh-CN': zhCN };
const PREF_KEY = 'locale';

export type MessageKey = keyof Messages;
type PluralBase = { [K in MessageKey]: K extends `${infer B}_other` ? B : never }[MessageKey];
export type TKey = MessageKey | PluralBase;
type Params = Record<string, string | number>;
export type TFunction = (key: TKey, params?: Params) => string;

export function matchLocale(tag: string | null | undefined): Locale | null {
  if (!tag) return null;
  const lower = tag.toLowerCase();
  if (lower.startsWith('zh')) return lower.includes('hant') || /-(tw|hk|mo)$/.test(lower) ? null : 'zh-CN';
  return LOCALES.find((l) => l.id.toLowerCase() === lower || l.id === lower.split('-')[0])?.id ?? null;
}

function initialLocale(): Locale {
  const saved = matchLocale(readPreference(PREF_KEY));
  if (saved) return saved;
  const preferred = typeof navigator !== 'undefined' ? (navigator.languages ?? [navigator.language]) : [];
  for (const tag of preferred) {
    const match = matchLocale(tag);
    if (match) return match;
  }
  return 'en';
}

function lookup(locale: Locale, key: string, params: Params): string {
  const catalog = CATALOGS[locale] as Record<string, string>;
  const fallback = en as Record<string, string>;
  let template: string | undefined;
  if (typeof params.count === 'number') {
    const form = new Intl.PluralRules(locale).select(params.count);
    template = catalog[`${key}_${form}`] ?? catalog[`${key}_other`] ?? fallback[`${key}_${form}`] ?? fallback[`${key}_other`];
  }
  template ??= catalog[key] ?? fallback[key] ?? key;
  return template;
}

export function translate(locale: Locale, key: TKey, params: Params = {}): string {
  const number = new Intl.NumberFormat(locale);
  return lookup(locale, key, params).replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = params[name];
    return value === undefined ? '' : typeof value === 'number' ? number.format(value) : value;
  });
}

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: TFunction;
  /** Like t(), but placeholders can be React nodes (links, <Time>, <strong>). */
  rich: (key: TKey, params: Record<string, ReactNode>) => ReactNode;
  /** Joins items as a list in the active language ("a, b and c"). */
  list: (items: string[], type?: 'conjunction' | 'unit') => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const service = useService();
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  // Set synchronously so formatting and the service agree with the first render.
  setFormatLocale(locale);

  useEffect(() => {
    document.documentElement.lang = locale;
    service.setLocale(locale);
  }, [locale, service]);

  const setLocale = useCallback((next: Locale) => {
    writePreference(PREF_KEY, next);
    setLocaleState(next);
  }, []);

  const value = useMemo<I18nValue>(() => {
    const t: TFunction = (key, params) => translate(locale, key, params);
    const rich = (key: TKey, params: Record<string, ReactNode>) => {
      const counts = Object.fromEntries(Object.entries(params).filter(([, v]) => typeof v === 'number')) as Params;
      const parts = lookup(locale, key, counts).split(/\{(\w+)\}/);
      return parts.map((part, i) => <Fragment key={i}>{i % 2 === 1 ? (typeof params[part] === 'number' ? new Intl.NumberFormat(locale).format(params[part] as number) : params[part]) : part}</Fragment>);
    };
    const list = (items: string[], type: 'conjunction' | 'unit' = 'conjunction') => new Intl.ListFormat(locale, { style: 'long', type }).format(items);
    return { locale, setLocale, t, rich, list };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}

export const useT = () => useI18n().t;
