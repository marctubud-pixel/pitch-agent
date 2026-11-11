/**
 * Localisation for text the service generates (findings, checks, next steps, errors).
 *
 * A real backend would localise these itself from the Accept-Language header. The mock does
 * the same: generated text is stored as a language-neutral token and rendered in the active
 * locale whenever data leaves the service, so switching language also translates records
 * that were created earlier. Built-in fictional demo copy is translated only in the output projection. Original
 * excerpts, attachment text and provenance quotes are preserved verbatim.
 */
import { zhCN, type MockMessages } from './messages/zh-CN';
import { demoChineseText } from './demoChinese';

export type MockLocale = 'zh-CN';
type Key = keyof MockMessages;
type PluralBase = { [K in Key]: K extends `${infer B}_other` ? B : never }[Key];
type Param = string | number | string[];
const catalog: Record<string, string> = zhCN;

const PREFIX = '⁣i18n:';
/** Retained service compatibility boundary; this frontend always renders Chinese. */
export function setMockLocale(_locale: string): MockLocale { return 'zh-CN'; }
export const getMockLocale = (): MockLocale => 'zh-CN';

/** A language-neutral message. Store it anywhere a string goes; it renders on the way out. */
export function m(key: Key | PluralBase | '_join' | '_dots', params: Record<string, Param> = {}): string {
  return PREFIX + JSON.stringify([key, params]);
}

/** Renders a message immediately in the active locale (for error messages). */
export function t(key: Key | PluralBase, params: Record<string, Param> = {}): string {
  return render(m(key, params));
}

export function render(value: string, locale: MockLocale = 'zh-CN'): string {
  if (!value.startsWith(PREFIX)) return value;
  const [key, params] = JSON.parse(value.slice(PREFIX.length)) as [string, Record<string, Param>];
  const values: Record<string, string> = {};
  for (const [name, raw] of Object.entries(params)) {
    if (Array.isArray(raw)) values[name] = raw.map((item) => render(item, locale)).join('、');
    else if (typeof raw === 'number') values[name] = new Intl.NumberFormat(locale).format(raw);
    else if (name.endsWith('Date')) values[name] = new Date(raw).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
    else values[name] = render(raw, locale);
  }
  if (key === '_join') return values.items ?? '';
  if (key === '_dots') return (params.items as string[]).map((item) => render(item, locale)).join(' · ');
  const template = typeof params.count === 'number' ? catalog[`${key}_other`] ?? catalog[key] : catalog[key];
  return (template ?? key).replace(/\{(\w+)\}/g, (_, name: string) => values[name] ?? '');
}

/** Translate known fixture parameters before rendering, without changing render's rule semantics. */
function displayMessage(value: string, fixture: boolean): string {
  if (!value.startsWith(PREFIX)) return fixture ? demoChineseText(value) : value;
  const token: unknown = JSON.parse(value.slice(PREFIX.length));
  if (!Array.isArray(token) || token.length !== 2) return render(value);
  const [key, params] = token;
  if (typeof key !== 'string' || !params || typeof params !== 'object' || Array.isArray(params)) return render(value);
  const claimId = 'claimId' in params ? params.claimId : undefined;
  const translateParams = typeof claimId === 'string' ? /^art-(?:luma|northline|morrow|plumtide)-/.test(claimId) : fixture;
  const translated: Record<string, Param> = {};
  for (const [name, raw] of Object.entries(params)) {
    if (typeof raw === 'string') translated[name] = displayMessage(raw, translateParams);
    else if (typeof raw === 'number') translated[name] = raw;
    else if (Array.isArray(raw) && raw.every((item): item is string => typeof item === 'string')) translated[name] = raw.map((item) => displayMessage(item, translateParams));
  }
  return render(PREFIX + JSON.stringify([key, translated]));
}

const demoProjectIds = new Set(['luma', 'northline', 'morrow', 'plumtide']);

/** Only direct fixture identity can opt a record into translated display. */
function fixtureScope(value: object, inherited: boolean): boolean {
  if (!('id' in value) || typeof value.id !== 'string') {
    if ('project' in value && value.project && typeof value.project === 'object' && 'id' in value.project && typeof value.project.id === 'string') return demoProjectIds.has(value.project.id);
    return inherited;
  }
  if ('severity' in value && 'claimIds' in value && Array.isArray(value.claimIds)) return value.claimIds.length > 0 && value.claimIds.every((id) => typeof id === 'string' && /^art-(?:luma|northline|morrow|plumtide)-/.test(id));
  if (demoProjectIds.has(value.id) || /^(?:gap-)?(?:art|src|img)-(?:luma|northline|morrow|plumtide)-/.test(value.id) || /^[a-z]+-seed-\d+$/.test(value.id)) return true;
  if (/^brf-(?:luma-v[12]|northline-v1|morrow-v[12]|plumtide-v1)$/.test(value.id)) return true;
  if ('projectId' in value || 'client' in value) return 'simulated' in value && value.simulated === true;
  if ('artifactId' in value && 'sourceIds' in value) return false;
  return inherited;
}

function methodPlanFixture(value: unknown): boolean {
  if (!value || typeof value !== 'object' || !('binding' in value)) return false;
  const binding = value.binding;
  if (!binding || typeof binding !== 'object' || !('brief' in binding)) return false;
  const brief = binding.brief;
  return Boolean(brief && typeof brief === 'object' && fixtureScope(brief, false));
}

function projectOutput<T>(value: T, demoFixture: boolean): T {
  if (typeof value === 'string') return (value.startsWith(PREFIX) ? displayMessage(value, demoFixture) : demoFixture ? demoChineseText(value) : value) as T;
  if (Array.isArray(value)) return value.map((v) => projectOutput(v, demoFixture)) as T;
  if (value && typeof value === 'object') {
    const attachment = 'fileName' in value && 'extraction' in value && 'text' in value;
    const scope = fixtureScope(value, demoFixture);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const childScope = k === 'researchMethodPlan' ? methodPlanFixture(v) : scope;
      out[k] = k === 'excerpt' || k === 'quote' || k === 'fileName' || (attachment && k === 'text') ? v : projectOutput(v, childScope);
    }
    return out as T;
  }
  return value;
}

/** Renders service output; raw evidence fields bypass both translation and token rendering. */
export function localizeDeep<T>(value: T): T {
  return projectOutput(value, false);
}
