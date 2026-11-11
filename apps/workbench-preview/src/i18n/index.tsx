/**
 * Chinese-only interface. Components share Chinese messages and formatting. Browser and saved language preferences do not change it.
 *
 * Text written by people (project names, research, notes) is never translated. Text the
 * service generates (findings, checks, next steps, errors) arrives already localised, because
 * the provider tells the service which language to use.
 */
import { createContext, Fragment, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useService } from '../app/services';
import { zhCN, type Messages } from './messages/zh-CN';

export type Locale = 'zh-CN';
const locale: Locale = 'zh-CN';
const catalog: Record<string, string> = zhCN;

export type MessageKey = keyof Messages;
type PluralBase = { [K in MessageKey]: K extends `${infer B}_other` ? B : never }[MessageKey];
export type TKey = MessageKey | PluralBase;
type Params = Record<string, string | number>;
export type TFunction = (key: TKey, params?: Params) => string;

function lookup(key: string, params: Params): string {
  if (typeof params.count === 'number') return catalog[`${key}_other`] ?? catalog[key] ?? key;
  return catalog[key] ?? key;
}

export function translate(key: TKey, params: Params = {}): string {
  const number = new Intl.NumberFormat(locale);
  return lookup(key, params).replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = params[name];
    return value === undefined ? '' : typeof value === 'number' ? number.format(value) : value;
  });
}

interface I18nValue {
  locale: Locale;
  t: TFunction;
  /** Like t(), but placeholders can be React nodes (links, <Time>, <strong>). */
  rich: (key: TKey, params: Record<string, ReactNode>) => ReactNode;
  /** Joins items as a list in the active language ("a, b and c"). */
  list: (items: string[], type?: 'conjunction' | 'unit') => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const service = useService();
  useEffect(() => {
    document.documentElement.lang = locale;
    service.setLocale(locale);
  }, [service]);

  const value = useMemo<I18nValue>(() => {
    const t: TFunction = (key, params) => translate(key, params);
    const rich = (key: TKey, params: Record<string, ReactNode>) => {
      const counts: Params = {};
      for (const [name, value] of Object.entries(params)) if (typeof value === 'number') counts[name] = value;
      const parts = lookup(key, counts).split(/\{(\w+)\}/);
      return parts.map((part, i) => <Fragment key={i}>{i % 2 === 1 ? (typeof params[part] === 'number' ? new Intl.NumberFormat(locale).format(params[part] as number) : params[part]) : part}</Fragment>);
    };
    const list = (items: string[], type: 'conjunction' | 'unit' = 'conjunction') => new Intl.ListFormat(locale, { style: 'long', type }).format(items);
    return { locale, t, rich, list };
  }, []);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}

export const useT = () => useI18n().t;
