import { createContext, useContext, useId, type ReactNode, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { CircleSlash, CloudOff, Inbox, Info, LoaderCircle, Sparkles } from 'lucide-react';
import type { QueryState } from '../app/query';
import type { Command } from '../app/commands';
import { Link } from '../app/router';
import { useService } from '../app/services';
import type { ServiceError } from '../domain/service';
import { useI18n, useT } from '../i18n';
import { formatDateTime, formatRelative, shortId } from './format';

// ---------------------------------------------------------------------------
// Buttons and actions
// ---------------------------------------------------------------------------

export function Spinner({ size = 16 }: { size?: number }) {
  return <LoaderCircle size={size} className="spin" aria-hidden="true" />;
}

interface ActionProps {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  /** Shown beside the control whenever it is disabled. */
  reason?: string | null;
  pending?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  icon?: ReactNode;
  type?: 'button' | 'submit';
  form?: string;
}

/**
 * A button that stays focusable when unavailable and explains why beside itself.
 * Uses aria-disabled rather than disabled so keyboard users can reach the explanation.
 */
export function Action({ label, onClick, disabled, reason, pending, variant = 'secondary', size = 'md', icon, type = 'button', form }: ActionProps) {
  const id = useId();
  const blocked = Boolean(disabled || pending);
  const showReason = Boolean(disabled && reason);
  return (
    <div className="action">
      <button
        type={type}
        form={form}
        className={`btn btn--${variant}${size === 'sm' ? ' btn--sm' : ''}`}
        aria-disabled={blocked || undefined}
        aria-describedby={showReason ? id : undefined}
        aria-busy={pending || undefined}
        onClick={(event) => {
          if (blocked) {
            event.preventDefault();
            return;
          }
          onClick?.();
        }}
      >
        {pending ? <Spinner size={size === 'sm' ? 14 : 16} /> : icon}
        <span>{label}</span>
      </button>
      {showReason && (
        <p id={id} className="action__reason">
          <Info size={14} aria-hidden="true" />
          <span>{reason}</span>
        </p>
      )}
    </div>
  );
}

/** Inline result of a command: progress, failure with a safe retry, or a conflict note. */
export function CommandFeedback({ command }: { command: Command }) {
  const { t, rich } = useI18n();
  const { state, retry, reset } = command;
  if (state.status === 'pending') {
    return (
      <p className="cmd-feedback" role="status">
        <Spinner size={14} /> {t('common.pending', { label: state.label ?? '' })}
      </p>
    );
  }
  if (state.status === 'conflict') {
    return (
      <p className="cmd-feedback cmd-feedback--warn" role="status">
        {t('common.conflictInline')}
      </p>
    );
  }
  if (state.status !== 'error' || !state.error) return null;
  const { error } = state;
  return (
    <div className="cmd-feedback cmd-feedback--error" role="alert">
      <p>
        <strong>{t('common.didNotComplete', { label: state.label ?? '' })}</strong> {error.message}
      </p>
      {error.retryable && (
        <p className="small muted">
          {rich(error.outcomeUnknown ? 'common.retryReusesUnknown' : 'common.retryReuses', { id: <code>{shortId(state.commandId)}</code> })}
        </p>
      )}
      <div className="cluster">
        {error.retryable && (
          <button type="button" className="btn btn--secondary btn--sm" onClick={retry}>
            {t('common.tryAgain')}
          </button>
        )}
        <button type="button" className="btn btn--ghost btn--sm" onClick={reset}>
          {t('common.dismiss')}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export function SimTag({ children, title }: { children?: ReactNode; title?: string }) {
  const t = useT();
  const service = useService();
  if (service.environment.kind === 'live') return null;
  return (
    <span className="sim-tag" title={title ?? t('common.simulatedTitle')}>
      <Sparkles size={12} aria-hidden="true" />
      {children ?? t('common.simulated')}
    </span>
  );
}

export function Time({ iso, relative = false }: { iso: string | null | undefined; relative?: boolean }) {
  useI18n(); // re-render when the language changes
  if (!iso) return <span className="muted">—</span>;
  return (
    <time dateTime={iso} title={formatDateTime(iso)}>
      {relative ? formatRelative(iso) : formatDateTime(iso)}
    </time>
  );
}

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

export function StatePanel({
  kind,
  title,
  children,
  action,
}: {
  kind: 'empty' | 'error' | 'unavailable' | 'loading';
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const Icon = kind === 'error' ? CloudOff : kind === 'unavailable' ? CircleSlash : kind === 'loading' ? LoaderCircle : Inbox;
  return (
    <div className="state" data-kind={kind} role={kind === 'error' ? 'alert' : undefined}>
      <Icon size={28} aria-hidden="true" className={kind === 'loading' ? 'spin' : undefined} />
      <h2 className="state__title">{title}</h2>
      {children && <div className="state__body">{children}</div>}
      {action && <div className="state__action">{action}</div>}
    </div>
  );
}

export function Skeleton({ lines = 4, blocks = 1 }: { lines?: number; blocks?: number }) {
  return (
    <div className="skeleton" aria-hidden="true">
      {Array.from({ length: blocks }).map((_, b) => (
        <div key={b} className="skeleton__block">
          <div className="skeleton__line skeleton__line--title" />
          {Array.from({ length: lines }).map((__, i) => (
            <div key={i} className="skeleton__line" style={{ width: `${92 - ((i * 17) % 35)}%` }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: ServiceError | null; onRetry?: () => void }) {
  const t = useT();
  if (error?.kind === 'not_found') {
    return (
      <StatePanel kind="unavailable" title={t('common.notAvailable')} action={<Link className="btn btn--secondary" to="/">{t('common.backToProjects')}</Link>}>
        <p>{error.message}</p>
      </StatePanel>
    );
  }
  if (error?.kind === 'unavailable') {
    return (
      <StatePanel kind="unavailable" title={t('common.featureUnavailable')}>
        <p>{error.message}</p>
      </StatePanel>
    );
  }
  return (
    <StatePanel
      kind="error"
      title={t('common.loadFailed')}
      action={
        onRetry && (
          <button type="button" className="btn btn--secondary" onClick={onRetry}>
            {t('common.tryAgain')}
          </button>
        )
      }
    >
      <p>{error?.message ?? t('common.somethingWrong')}</p>
      <p className="small muted">{t('common.nothingLost')}</p>
    </StatePanel>
  );
}

export function QueryView<T>({
  query,
  skeleton,
  children,
}: {
  query: QueryState<T>;
  skeleton?: ReactNode;
  children: (data: T) => ReactNode;
}) {
  const t = useT();
  if (query.status === 'loading') {
    return (
      <div aria-busy="true">
        <p className="sr-only" role="status">
          {t('common.loading')}
        </p>
        {skeleton ?? <Skeleton />}
      </div>
    );
  }
  if (query.status === 'error' || query.data === undefined) return <ErrorState error={query.error} onRetry={query.refetch} />;
  return (
    <>
      {query.refreshError && (
        <p className="banner" data-tone="warn" role="status">
          <CloudOff size={16} aria-hidden="true" /> {t('common.staleData', { message: query.refreshError.message })}
        </p>
      )}
      {children(query.data)}
    </>
  );
}

// ---------------------------------------------------------------------------
// Form fields
// ---------------------------------------------------------------------------

interface FieldShell {
  label: string;
  hint?: string;
  error?: string | null;
  optional?: boolean;
}

function FieldFrame({ id, label, hint, error, optional, children }: FieldShell & { id: string; children: ReactNode }) {
  const t = useT();
  return (
    <div className="field">
      <label htmlFor={id} className="field__label">
        {label}
        {optional && <span className="field__optional"> {t('common.optional')}</span>}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="field__hint">
          {hint}
        </p>
      )}
      {children}
      {error && (
        <p id={`${id}-error`} className="field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

const describedBy = (id: string, hint?: string, error?: string | null) =>
  [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;

export function TextInput({ label, hint, error, optional, id: given, ...rest }: FieldShell & InputHTMLAttributes<HTMLInputElement>) {
  const auto = useId();
  const id = given ?? auto;
  return (
    <FieldFrame id={id} label={label} hint={hint} error={error} optional={optional}>
      <input id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} {...rest} />
    </FieldFrame>
  );
}

export function TextArea({ label, hint, error, optional, id: given, ...rest }: FieldShell & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const auto = useId();
  const id = given ?? auto;
  return (
    <FieldFrame id={id} label={label} hint={hint} error={error} optional={optional}>
      <textarea id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} {...rest} />
    </FieldFrame>
  );
}

export function SelectInput({
  label,
  hint,
  error,
  optional,
  id: given,
  options,
  ...rest
}: FieldShell & SelectHTMLAttributes<HTMLSelectElement> & { options: Array<{ value: string; label: string }> }) {
  const auto = useId();
  const id = given ?? auto;
  return (
    <FieldFrame id={id} label={label} hint={hint} error={error} optional={optional}>
      <select id={id} aria-describedby={describedBy(id, hint, error)} {...rest}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldFrame>
  );
}

/**
 * True when a view is shown inside another page (for example the working Research views inside
 * a stage's checks panel). Embedded views use second-level headings so each page keeps one h1.
 */
export const EmbeddedContext = createContext(false);

export function Embedded({ children }: { children: ReactNode }) {
  return (
    <EmbeddedContext.Provider value={true}>
      <div className="embedded">{children}</div>
    </EmbeddedContext.Provider>
  );
}

export function PageHeader({ eyebrow, title, children, actions }: { eyebrow?: ReactNode; title: string; children?: ReactNode; actions?: ReactNode }) {
  const embedded = useContext(EmbeddedContext);
  const Heading = embedded ? 'h2' : 'h1';
  return (
    <header className={`page-header${embedded ? ' page-header--embedded' : ''}`}>
      <div className="page-header__text">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <Heading>{title}</Heading>
        {children && <div className="page-header__meta">{children}</div>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  );
}
