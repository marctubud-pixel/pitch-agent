import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import type { ServiceError } from '../domain/service';
import { useI18n } from '../i18n';
import { Modal } from '../ui/Modal';
import { useServiceContext } from './services';

export interface Toast {
  id: number;
  tone: 'success' | 'info' | 'error';
  message: string;
}

export interface ConflictReport {
  label: string;
  error: ServiceError;
}

interface FeedbackValue {
  notify: (toast: Omit<Toast, 'id'>) => void;
  reportConflict: (report: ConflictReport) => void;
}

const FeedbackContext = createContext<FeedbackValue | null>(null);

/** Toasts and the shared revision-conflict dialog. */
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const { reloadAll } = useServiceContext();
  const { t, rich } = useI18n();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [conflict, setConflict] = useState<ConflictReport | null>(null);
  const counter = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);
  const notify = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = ++counter.current;
      setToasts((all) => [...all.slice(-3), { ...toast, id }]);
      window.setTimeout(() => dismiss(id), toast.tone === 'error' ? 9000 : 6000);
    },
    [dismiss],
  );
  const value = useMemo(() => ({ notify, reportConflict: setConflict }), [notify]);
  const details = conflict?.error.conflict;

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <div className="toast-region" role="status" aria-live="polite" aria-relevant="additions">
        {toasts.map((toast) => (
          <div key={toast.id} className="toast" data-tone={toast.tone}>
            {toast.tone === 'success' ? <CircleCheck size={18} aria-hidden="true" /> : toast.tone === 'error' ? <CircleAlert size={18} aria-hidden="true" /> : <Info size={18} aria-hidden="true" />}
            <p>{toast.message}</p>
            <button type="button" className="icon-btn" onClick={() => dismiss(toast.id)} aria-label={t('feedback.dismissToast')}>
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
      <Modal
        open={conflict !== null}
        title={t('feedback.conflictTitle')}
        onClose={() => setConflict(null)}
        role="alertdialog"
        footer={
          <>
            <button type="button" className="btn btn--secondary" onClick={() => setConflict(null)}>
              {t('common.close')}
            </button>
            <button
              type="button"
              className="btn btn--primary"
              autoFocus
              onClick={() => {
                reloadAll();
                setConflict(null);
                notify({ tone: 'info', message: t('feedback.reloaded') });
              }}
            >
              {t('feedback.reload')}
            </button>
          </>
        }
      >
        <div className="stack-sm">
          <p>
            {rich('feedback.conflictBody', {
              label: <strong>{conflict?.label}</strong>,
              from: details?.expectedRevision ?? '?',
              to: details?.currentRevision ?? '?',
            })}
          </p>
          {details?.changeSummary && (
            <p className="conflict-change">
              {t('feedback.latestChange', { change: details.changeSummary })}
              {details.changedBy ? ` (${details.changedBy})` : ''}
            </p>
          )}
          <p>{t('feedback.conflictHelp')}</p>
        </div>
      </Modal>
    </FeedbackContext.Provider>
  );
}

export function useFeedback(): FeedbackValue {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback must be used inside FeedbackProvider');
  return ctx;
}
