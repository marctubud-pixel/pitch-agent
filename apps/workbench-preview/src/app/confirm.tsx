import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { useT } from '../i18n';
import { Modal } from '../ui/Modal';

export interface ConfirmOptions {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

/** In-page confirmation. Browser confirm() is avoided because embedded viewers block it. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<Confirm>(
    (next) =>
      new Promise<boolean>((resolve) => {
        resolveRef.current?.(false);
        resolveRef.current = resolve;
        setOptions(next);
      }),
    [],
  );

  const settle = (value: boolean) => {
    resolveRef.current?.(value);
    resolveRef.current = null;
    setOptions(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={options !== null}
        title={options?.title ?? ''}
        onClose={() => settle(false)}
        size="sm"
        role="alertdialog"
        footer={
          <>
            <button type="button" className="btn btn--secondary" onClick={() => settle(false)} autoFocus>
              {options?.cancelLabel ?? t('common.cancel')}
            </button>
            <button type="button" className={`btn ${options?.tone === 'danger' ? 'btn--danger' : 'btn--primary'}`} onClick={() => settle(true)}>
              {options?.confirmLabel}
            </button>
          </>
        }
      >
        <p>{options?.body}</p>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): Confirm {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside ConfirmProvider');
  return ctx;
}
