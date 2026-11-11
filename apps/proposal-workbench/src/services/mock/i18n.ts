/**
 * Localisation for text the service generates (findings, checks, next steps, errors).
 *
 * A real backend would localise these itself from the Accept-Language header. The mock does
 * the same: generated text is stored as a language-neutral token and rendered in the active
 * locale whenever data leaves the service, so switching language also translates records
 * that were created earlier. Demo content written by people (research text, notes) is left as is.
 */
import { en, type MockMessages } from './messages/en';
import { es } from './messages/es';
import { fr } from './messages/fr';
import { ja } from './messages/ja';
import { ko } from './messages/ko';
import { zhCN } from './messages/zh-CN';

export type MockLocale = 'en' | 'fr' | 'es' | 'ja' | 'ko' | 'zh-CN';
type Key = keyof MockMessages;
type PluralBase = { [K in Key]: K extends `${infer B}_other` ? B : never }[Key];
type Param = string | number | string[];

const CATALOGS: Record<MockLocale, MockMessages> = { en, fr, es, ja, ko, 'zh-CN': zhCN };
const DATE_LOCALES: Record<MockLocale, string> = { en: 'en-GB', fr: 'fr-FR', es: 'es-ES', ja: 'ja-JP', ko: 'ko-KR', 'zh-CN': 'zh-CN' };
const SEPARATORS: Record<MockLocale, string> = { en: ', ', fr: ', ', es: ', ', ja: '、', ko: ', ', 'zh-CN': '、' };

const PREFIX = '⁣i18n:';
let current: MockLocale = 'en';

export function setMockLocale(locale: string) {
  current = (Object.keys(CATALOGS) as MockLocale[]).find((l) => l === locale || l === locale.split('-')[0]) ?? 'en';
}

export const getMockLocale = () => current;

/** A language-neutral message. Store it anywhere a string goes; it renders on the way out. */
export function m(key: Key | PluralBase | '_join' | '_dots', params: Record<string, Param> = {}): string {
  return PREFIX + JSON.stringify([key, params]);
}

/** Renders a message immediately in the active locale (for error messages). */
export function t(key: Key | PluralBase, params: Record<string, Param> = {}): string {
  return render(m(key, params));
}

export function render(value: string, locale: MockLocale = current): string {
  if (!value.startsWith(PREFIX)) return value;
  const [key, params] = JSON.parse(value.slice(PREFIX.length)) as [string, Record<string, Param>];
  const values: Record<string, string> = {};
  for (const [name, raw] of Object.entries(params)) {
    if (Array.isArray(raw)) values[name] = raw.map((item) => render(item, locale)).join(SEPARATORS[locale]);
    else if (typeof raw === 'number') values[name] = new Intl.NumberFormat(DATE_LOCALES[locale]).format(raw);
    else if (name.endsWith('Date')) values[name] = new Date(raw).toLocaleDateString(DATE_LOCALES[locale], { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
    else values[name] = render(raw, locale);
  }
  if (key === '_join') return values.items ?? '';
  if (key === '_dots') return (params.items as string[]).map((item) => render(item, locale)).join(' · ');
  const catalog = CATALOGS[locale] as Record<string, string>;
  const fallback = en as Record<string, string>;
  let template: string | undefined;
  if (typeof params.count === 'number') {
    const form = new Intl.PluralRules(DATE_LOCALES[locale]).select(params.count);
    template = catalog[`${key}_${form}`] ?? catalog[`${key}_other`] ?? fallback[`${key}_other`];
  }
  template ??= catalog[key] ?? fallback[key];
  return (template ?? key).replace(/\{(\w+)\}/g, (_, name: string) => values[name] ?? '');
}

/** Renders every message token inside a value (objects, arrays, strings). */
export function localizeDeep<T>(value: T): T {
  if (typeof value === 'string') return render(value) as T;
  if (Array.isArray(value)) return value.map((v) => localizeDeep(v)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = localizeDeep(v);
    return out as T;
  }
  return value;
}
