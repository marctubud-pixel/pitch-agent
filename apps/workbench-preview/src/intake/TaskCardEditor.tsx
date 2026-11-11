import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, CircleHelp, CircleSlash, Lightbulb, Quote, TriangleAlert, UserCheck } from 'lucide-react';
import { CARD_MAIN_FIELDS, CARD_MORE_FIELDS, LIST_FIELDS, REQUIRED_FIELDS, type FieldOrigin, type SourceSpan, type TaskField } from '../domain/models';
import { isProposalType, type ProposalType } from '../domain/proposalType';
import { useT } from '../i18n';
import { acceptField, editField, isFilled, ORIGIN_TONE, type TaskCardState } from './taskCard';

export const GROUPS: Array<{ id: 'ask' | 'who' | 'limits' | 'more'; fields: TaskField[] }> = [
  { id: 'ask', fields: [...CARD_MAIN_FIELDS] },
  { id: 'more', fields: [...CARD_MORE_FIELDS] },
];

const MAIN_FIELDS = CARD_MAIN_FIELDS;
const MORE_FIELDS = CARD_MORE_FIELDS;

type TypeControl = { kind: 'editable'; value: ProposalType; onChange: (value: ProposalType) => void } | { kind: 'readonly'; value: ProposalType | undefined };

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
  presentation = 'full',
  multilineBrand = false,
  moreContent,
  proposalType,
}: {
  state: TaskCardState;
  onChange: (next: TaskCardState) => void;
  sources: SourceDoc[];
  idPrefix: string;
  readOnly?: TaskField[];
  /** Scroll to and focus a field. `n` changes on every request so the same field can be asked twice. */
  focus?: { f: TaskField; n: number } | null;
  disabled?: boolean;
  presentation?: 'full' | 'compact';
  multilineBrand?: boolean;
  moreContent?: ReactNode;
  proposalType: TypeControl;
}) {
  const t = useT();
  const compact = presentation === 'compact';
  const [sourceOpen, setSourceOpen] = useState(false);
  const moreRef = useRef<HTMLDetailsElement>(null);
  const sourceToggleRef = useRef<HTMLButtonElement>(null);
  const pendingMore = MORE_FIELDS.filter((f) => ['suggested', 'ambiguous'].includes(state[f].provenance.origin)).length;
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
    if (compact && MORE_FIELDS.includes(focus.f) && moreRef.current) moreRef.current.open = true;
    let timer: ReturnType<typeof setTimeout>;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        const el = document.getElementById(fieldDomId(idPrefix, focus.f));
        if (!el) return;
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        el.querySelector<HTMLElement>('input,textarea')?.focus({ preventScroll: true });
        el.classList.add('is-flash');
        timer = setTimeout(() => el.classList.remove('is-flash'), 1600);
      });
    });
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); };
  }, [focus, idPrefix, compact]);

  useEffect(() => {
    if (active && markRef.current && panelRef.current) {
      const panel = panelRef.current;
      panel.scrollTop += markRef.current.getBoundingClientRect().top - panel.getBoundingClientRect().top - panel.clientHeight / 3;
    }
  }, [active, sourceOpen]);

  const showSource = (field: TaskField, span: SourceSpan) => {
    setSourceOpen(true);
    setActive({ field, span });
    setSourceId(span.attachmentId);
    requestAnimationFrame(() => {
      if (window.matchMedia?.('(max-width: 900px)').matches) panelRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  };

  const parts = useMemo(() => {
    if (!source) return null;
    const span = active && active.span.attachmentId === source.id ? active.span : null;
    if (!span) return { before: source.text, mark: '', after: '' };
    return { before: source.text.slice(0, span.start), mark: source.text.slice(span.start, span.end), after: source.text.slice(span.end) };
  }, [source, active]);

  const renderField = (f: TaskField) => <Fragment key={f}>
    <FieldRow
      field={f}
      state={state}
      id={fieldDomId(idPrefix, f)}
      readOnly={readOnly.includes(f)}
      onEdit={(text) => onChange(editField(state, f, text))}
      onAccept={() => onChange(acceptField(state, f))}
      onShow={(span) => showSource(f, span)}
      activeSpan={active?.field === f ? active.span : null}
      compact={compact}
      multilineBrand={multilineBrand}
    />
    {f === 'projectName' && <div className="tc-field tc-field--type">
      <label className="tc-field__label" htmlFor={`${idPrefix}-proposalType-input`}>提案类型</label>
      <select id={`${idPrefix}-proposalType-input`} value={proposalType.value ?? ''} disabled={proposalType.kind === 'readonly'} onChange={event => {
        if (proposalType.kind === 'editable' && isProposalType(event.target.value)) proposalType.onChange(event.target.value);
      }}>
        {proposalType.value === undefined && <option value="">类型未记录</option>}
        <option value="kv">{t('pw.type.kv')}</option>
        <option value="packaging">{t('pw.type.packaging')}</option>
      </select>
    </div>}
  </Fragment>;

  return (
    <div className={compact ? 'taskcard taskcard--compact' : 'taskcard'} data-has-source={(sources.length > 0 && (!compact || sourceOpen)) || undefined}>
      {compact && sources.length > 0 && (
        <div className="taskcard__toolbar">
          <button ref={sourceToggleRef} type="button" className="btn btn--secondary btn--sm" aria-expanded={sourceOpen} aria-controls={`${idPrefix}-source`} onClick={() => setSourceOpen(!sourceOpen)}>
            <Quote size={14} aria-hidden="true" /> {t(sourceOpen ? 'card.hideSource' : 'card.viewSource')}
          </button>
        </div>
      )}
      <div className="taskcard__fields">
        {compact ? (
          <>
            <fieldset className="taskcard__group taskcard__main card" disabled={disabled}>
              <legend className="sr-only">{t('card.mainFields')}</legend>
              {MAIN_FIELDS.map(renderField)}
            </fieldset>
            <details ref={moreRef} className="taskcard__more card">
              <summary>{t('card.moreFields')}{pendingMore > 0 && <span className="taskcard__pending">{t('card.pending', { count: pendingMore })}</span>}</summary>
              <fieldset className="taskcard__extra" disabled={disabled}>
                <legend className="sr-only">{t('card.moreFields')}</legend>
                {MORE_FIELDS.map(renderField)}
              </fieldset>
              {moreContent}
            </details>
          </>
        ) : GROUPS.map((g) => (
          <fieldset key={g.id} className="taskcard__group card" disabled={disabled}>
            <legend className="taskcard__legend">{t(`card.group.${g.id}`)}</legend>
            {g.fields.map(renderField)}
          </fieldset>
        ))}
      </div>
      {source && parts && (!compact || sourceOpen) && (
        <aside id={`${idPrefix}-source`} className="taskcard__source card" aria-label={t('card.sourceLabel')}>
          <div className="taskcard__source-head">
            <div className="taskcard__source-title">
              <h3 className="card__title">{t('card.sourceTitle')}</h3>
              {compact && <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setSourceOpen(false); sourceToggleRef.current?.focus(); }}>{t('card.hideSource')}</button>}
            </div>
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
  compact,
  multilineBrand,
}: {
  field: TaskField;
  state: TaskCardState;
  id: string;
  readOnly: boolean;
  onEdit: (text: string) => void;
  onAccept: () => void;
  onShow: (span: SourceSpan) => void;
  activeSpan: SourceSpan | null;
  compact: boolean;
  multilineBrand: boolean;
}) {
  const t = useT();
  const value = state[field];
  const { origin, reason, spans } = value.provenance;
  const filled = isFilled(value);
  const required = REQUIRED_FIELDS.some((f) => f === field);
  const inputId = `${id}-input`;
  const noteId = `${id}-note`;
  const list = LIST_FIELDS.has(field);
  const needsDecision = origin === 'suggested' || (origin === 'ambiguous' && filled);
  const needsReview = origin === 'suggested' || origin === 'ambiguous';
  const shownOrigin: FieldOrigin = !filled && origin !== 'ambiguous' ? 'missing' : origin;
  const label = t(compact && (field === 'deliverableType' || field === 'deliverables' || field === 'researchQuestions' || field === 'openQuestions') ? `card.compactLabel.${field}` : `taskField.${field}`);

  const acceptButton = needsDecision && !readOnly && (
    <button
      type="button"
      className="btn btn--secondary btn--sm tc-accept"
      onClick={onAccept}
      aria-label={`${origin === 'suggested' ? t('card.accept') : t('card.keepAsIs')}: ${label}`}
    >
      <Check size={14} aria-hidden="true" /> {origin === 'suggested' ? t('card.accept') : t('card.keepAsIs')}
    </button>
  );
  const explanation = (
    <div className="tc-field__note" id={noteId}>
      {compact && <OriginBadge origin={origin} filled={filled} />}
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
      {!compact && acceptButton}
      {origin === 'ambiguous' && !filled && <CircleHelp size={14} aria-hidden="true" className="muted" />}
    </div>
  );

  return (
    <div className="tc-field" id={id} data-origin={shownOrigin}>
      <div className="tc-field__head">
        <label htmlFor={inputId} className="tc-field__label">
          {label}
        </label>
        {(!compact || origin === 'suggested' || origin === 'ambiguous') && <OriginBadge origin={origin} filled={filled || (compact && origin === 'suggested')} />}
        {!compact && required && !filled && <span className="tc-field__need">{t('card.neededForResearch')}</span>}
      </div>
      {SINGLE_LINE.has(field) && !(field === 'brand' && multilineBrand) ? (
        <input id={inputId} value={value.text} onChange={(e) => onEdit(e.target.value)} readOnly={readOnly} aria-describedby={compact ? undefined : noteId} />
      ) : (
        <textarea
          id={inputId}
          value={value.text}
          onChange={(e) => onEdit(e.target.value)}
          readOnly={readOnly}
          rows={compact ? 3 : Math.min(8, Math.max(list ? 2 : 3, value.text.split('\n').length + (list ? 0 : Math.ceil(value.text.length / 90))))}
          aria-describedby={compact ? undefined : noteId}
          placeholder={list ? t('card.onePerLine') : undefined}
        />
      )}
      {compact ? (
        <>
          {acceptButton && <div className="tc-field__decision">{acceptButton}</div>}
          {needsReview && <details className="tc-field__explanation">
            <summary>{t('card.reviewReason')}</summary>
            {explanation}
          </details>}
        </>
      ) : explanation}
    </div>
  );
}
