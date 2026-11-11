import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, CircleHelp, CircleSlash, Lightbulb, Quote, TriangleAlert, UserCheck } from 'lucide-react';
import { LIST_FIELDS, REQUIRED_FIELDS, type FieldOrigin, type SourceSpan, type TaskField } from '../domain/models';
import { useT } from '../i18n';
import { acceptField, editField, isFilled, ORIGIN_TONE, type TaskCardState } from './taskCard';

export const GROUPS: Array<{ id: 'ask' | 'who' | 'limits' | 'more'; fields: TaskField[] }> = [
  { id: 'ask', fields: ['projectName', 'brand', 'background', 'objectives', 'researchQuestions'] },
  { id: 'who', fields: ['audience', 'deliverableType', 'deliverables'] },
  { id: 'limits', fields: ['constraints', 'timeline', 'budget'] },
  { id: 'more', fields: ['references', 'openQuestions'] },
];

const SINGLE_LINE = new Set<TaskField>(['projectName', 'brand', 'deliverableType', 'timeline', 'budget']);
const ICON: Record<FieldOrigin, typeof Check> = { provided: Quote, accepted: UserCheck, edited: UserCheck, suggested: Lightbulb, ambiguous: TriangleAlert, missing: CircleSlash };

export interface SourceDoc {
  id: string;
  label: string;
  text: string;
}

export function fieldDomId(prefix: string, f: TaskField) {
  return `${prefix}-${f}`;
}

/** Counts by origin, for the summary line. */
export function originCounts(state: TaskCardState, fields: readonly TaskField[]) {
  const c = { from: 0, suggested: 0, unclear: 0, missing: 0 };
  for (const f of fields) {
    const o = state[f].provenance.origin;
    if (o === 'suggested') c.suggested += 1;
    else if (o === 'ambiguous') c.unclear += 1;
    else if (!isFilled(state[f])) c.missing += 1;
    else c.from += 1;
  }
  return c;
}

export function OriginBadge({ origin, filled }: { origin: FieldOrigin; filled: boolean }) {
  const t = useT();
  const shown: FieldOrigin = !filled && origin !== 'ambiguous' ? 'missing' : origin;
  const Icon = ICON[shown];
  return (
    <span className="origin" data-tone={ORIGIN_TONE[shown]}>
      <Icon size={13} aria-hidden="true" />
      {t(`origin.${shown}`)}
    </span>
  );
}

/**
 * The editable task card. Every field shows where its value came from and links back to the
 * passage it was taken from. Nothing here saves or confirms anything.
 */
export function TaskCardEditor({
  state,
  onChange,
  sources,
  idPrefix,
  readOnly = [],
  focus,
  disabled = false,
}: {
  state: TaskCardState;
  onChange: (next: TaskCardState) => void;
  sources: SourceDoc[];
  idPrefix: string;
  readOnly?: TaskField[];
  /** Scroll to and focus a field. `n` changes on every request so the same field can be asked twice. */
  focus?: { f: TaskField; n: number } | null;
  disabled?: boolean;
}) {
  const t = useT();
  const [active, setActive] = useState<{ field: TaskField; span: SourceSpan } | null>(null);
  const [sourceId, setSourceId] = useState<string | null>(sources[0]?.id ?? null);
  const markRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const source = sources.find((s) => s.id === (active?.span.attachmentId ?? sourceId)) ?? sources[0] ?? null;

  useEffect(() => {
    if (!sourceId && sources[0]) setSourceId(sources[0].id);
  }, [sources, sourceId]);

  useEffect(() => {
    if (!focus) return;
    const el = document.getElementById(fieldDomId(idPrefix, focus.f));
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.querySelector<HTMLElement>('input,textarea')?.focus({ preventScroll: true });
    el.classList.add('is-flash');
    const timer = setTimeout(() => el.classList.remove('is-flash'), 1600);
    return () => clearTimeout(timer);
  }, [focus, idPrefix]);

  useEffect(() => {
    if (active && markRef.current && panelRef.current) {
      const panel = panelRef.current;
      panel.scrollTop = markRef.current.offsetTop - panel.clientHeight / 3;
    }
  }, [active]);

  const showSource = (field: TaskField, span: SourceSpan) => {
    setActive({ field, span });
    setSourceId(span.attachmentId);
    if (window.matchMedia?.('(max-width: 900px)').matches) panelRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  const parts = useMemo(() => {
    if (!source) return null;
    const span = active && active.span.attachmentId === source.id ? active.span : null;
    if (!span) return { before: source.text, mark: '', after: '' };
    return { before: source.text.slice(0, span.start), mark: source.text.slice(span.start, span.end), after: source.text.slice(span.end) };
  }, [source, active]);

  return (
    <div className="taskcard" data-has-source={sources.length > 0 || undefined}>
      <div className="taskcard__fields">
        {GROUPS.map((g) => (
          <fieldset key={g.id} className="taskcard__group card" disabled={disabled}>
            <legend className="taskcard__legend">{t(`card.group.${g.id}`)}</legend>
            {g.fields.map((f) => (
              <FieldRow
                key={f}
                field={f}
                state={state}
                id={fieldDomId(idPrefix, f)}
                readOnly={readOnly.includes(f)}
                onEdit={(text) => onChange(editField(state, f, text))}
                onAccept={() => onChange(acceptField(state, f))}
                onShow={(span) => showSource(f, span)}
                activeSpan={active?.field === f ? active.span : null}
              />
            ))}
          </fieldset>
        ))}
      </div>
      {source && parts && (
        <aside className="taskcard__source card" aria-label={t('card.sourceLabel')}>
          <div className="taskcard__source-head">
            <h3 className="card__title">{t('card.sourceTitle')}</h3>
            {sources.length > 1 ? (
              <select
                aria-label={t('card.sourceChoose')}
                value={source.id}
                onChange={(e) => {
                  setActive(null);
                  setSourceId(e.target.value);
                }}
              >
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            ) : (
              <p className="small muted">{source.label}</p>
            )}
          </div>
          <div ref={panelRef} className="taskcard__text" tabIndex={0} aria-label={t('card.sourceText', { name: source.label })}>
            {parts.before}
            {parts.mark && (
              <mark ref={markRef} data-testid="source-highlight">
                {parts.mark}
              </mark>
            )}
            {parts.after}
          </div>
          {active && (
            <p className="small muted" role="status">
              {t('card.showing', { field: t(`taskField.${active.field}`) })}
            </p>
          )}
        </aside>
      )}
    </div>
  );
}

function FieldRow({
  field,
  state,
  id,
  readOnly,
  onEdit,
  onAccept,
  onShow,
  activeSpan,
}: {
  field: TaskField;
  state: TaskCardState;
  id: string;
  readOnly: boolean;
  onEdit: (text: string) => void;
  onAccept: () => void;
  onShow: (span: SourceSpan) => void;
  activeSpan: SourceSpan | null;
}) {
  const t = useT();
  const value = state[field];
  const { origin, reason, spans } = value.provenance;
  const filled = isFilled(value);
  const required = (REQUIRED_FIELDS as readonly TaskField[]).includes(field);
  const inputId = `${id}-input`;
  const noteId = `${id}-note`;
  const list = LIST_FIELDS.has(field);
  const needsDecision = origin === 'suggested' || (origin === 'ambiguous' && filled);
  const shownOrigin: FieldOrigin = !filled && origin !== 'ambiguous' ? 'missing' : origin;

  return (
    <div className="tc-field" id={id} data-origin={shownOrigin}>
      <div className="tc-field__head">
        <label htmlFor={inputId} className="tc-field__label">
          {t(`taskField.${field}`)}
        </label>
        <OriginBadge origin={origin} filled={filled} />
        {required && !filled && <span className="tc-field__need">{t('card.neededForResearch')}</span>}
      </div>
      {SINGLE_LINE.has(field) ? (
        <input id={inputId} value={value.text} onChange={(e) => onEdit(e.target.value)} readOnly={readOnly} aria-describedby={noteId} />
      ) : (
        <textarea
          id={inputId}
          value={value.text}
          onChange={(e) => onEdit(e.target.value)}
          readOnly={readOnly}
          rows={Math.min(8, Math.max(list ? 2 : 3, value.text.split('\n').length + (list ? 0 : Math.ceil(value.text.length / 90))))}
          aria-describedby={noteId}
          placeholder={list ? t('card.onePerLine') : undefined}
        />
      )}
      <div className="tc-field__note" id={noteId}>
        <span className="small">{t(`card.why.${shownOrigin}`, { reason: t(`card.reason.${reason ?? 'not_stated'}`) })}</span>
        {spans.map((s, i) => (
          <button
            key={`${s.start}-${i}`}
            type="button"
            className="quote-chip"
            aria-pressed={activeSpan?.start === s.start && activeSpan.attachmentId === s.attachmentId}
            onClick={() => onShow(s)}
            title={t('card.showPassage')}
          >
            <Quote size={12} aria-hidden="true" />
            <span className="quote-chip__text">{s.quote.length > 70 ? `${s.quote.slice(0, 68)}…` : s.quote}</span>
            <span className="sr-only">{t('card.showPassage')}</span>
          </button>
        ))}
        {needsDecision && !readOnly && (
          <button
            type="button"
            className="btn btn--secondary btn--sm tc-accept"
            onClick={onAccept}
            aria-label={`${origin === 'suggested' ? t('card.accept') : t('card.keepAsIs')}: ${t(`taskField.${field}`)}`}
          >
            <Check size={14} aria-hidden="true" /> {origin === 'suggested' ? t('card.accept') : t('card.keepAsIs')}
          </button>
        )}
        {origin === 'ambiguous' && !filled && <CircleHelp size={14} aria-hidden="true" className="muted" />}
      </div>
    </div>
  );
}
