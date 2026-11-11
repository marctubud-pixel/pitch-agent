/**
 * Locale-aware formatting. The I18nProvider sets the locale; components that format also read
 * the i18n context, so they re-render when the language changes.
 */
let locale = 'en';
let cache = build('en');

function build(tag: string) {
  const dateLocale = tag === 'en' ? 'en-GB' : tag;
  return {
    dateTime: new Intl.DateTimeFormat(dateLocale, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    dateOnly: new Intl.DateTimeFormat(dateLocale, { day: 'numeric', month: 'short', year: 'numeric' }),
    relative: new Intl.RelativeTimeFormat(tag, { numeric: 'auto' }),
    number: new Intl.NumberFormat(tag, { maximumFractionDigits: 1 }),
    seconds: new Intl.NumberFormat(tag, { style: 'unit', unit: 'second', unitDisplay: 'short', maximumFractionDigits: 1 }),
    ms: new Intl.NumberFormat(tag, { style: 'unit', unit: 'millisecond', unitDisplay: 'short' }),
    minutes: new Intl.NumberFormat(tag, { style: 'unit', unit: 'minute', unitDisplay: 'short' }),
  };
}

export function setFormatLocale(next: string) {
  if (next === locale) return;
  locale = next;
  cache = build(next);
}

export const formatDateTime = (iso: string) => cache.dateTime.format(new Date(iso));
export const formatDate = (iso: string) => cache.dateOnly.format(new Date(iso));

export function formatRelative(iso: string, now = Date.now()): string {
  const diff = now - Date.parse(iso);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < 0) return formatDateTime(iso);
  if (diff < minute) return cache.relative.format(0, 'second');
  if (diff < hour) return cache.relative.format(-Math.round(diff / minute), 'minute');
  if (diff < day) return cache.relative.format(-Math.round(diff / hour), 'hour');
  if (diff < 7 * day) return cache.relative.format(-Math.round(diff / day), 'day');
  return formatDate(iso);
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return cache.ms.format(ms);
  const s = ms / 1000;
  if (s < 60) return cache.seconds.format(Number(s.toFixed(s < 10 ? 1 : 0)));
  const m = Math.floor(s / 60);
  return `${cache.minutes.format(m)} ${cache.seconds.format(Math.round(s - m * 60))}`;
}

export const formatNumber = (n: number) => cache.number.format(n);

export const shortId = (id: string | null | undefined) => (id ? id.replace(/^cmd-/, '').slice(0, 8) : '');
