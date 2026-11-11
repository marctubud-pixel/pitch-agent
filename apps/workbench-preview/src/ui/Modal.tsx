import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useT } from '../i18n';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  description?: string;
  role?: 'dialog' | 'alertdialog';
}

/** Native <dialog> modal: focus trapping, Escape and backdrop come from the browser. */
export function Modal({ open, title, onClose, children, footer, size = 'md', description, role = 'dialog' }: ModalProps) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const restoreRef = useRef<Element | null>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      restoreRef.current = document.activeElement;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
      if (restoreRef.current instanceof HTMLElement) restoreRef.current.focus();
    }
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className={`modal modal--${size}`}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      role={role}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className="modal__inner">
          <header className="modal__header">
            <h2 id={titleId}>{title}</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label={t('modal.close')}>
              <X size={18} aria-hidden="true" />
            </button>
          </header>
          {description && (
            <p id={descId} className="modal__description">
              {description}
            </p>
          )}
          <div className="modal__body">{children}</div>
          {footer && <footer className="modal__footer">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}
