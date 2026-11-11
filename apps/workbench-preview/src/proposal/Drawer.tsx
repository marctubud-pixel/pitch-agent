import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useT } from '../i18n';

/** True when the WorkBot panel is open and docked beside the workspace (wide screens). */
function workBotDocked() {
  return document.documentElement.dataset.workbot === 'open' && window.matchMedia('(min-width: 1000px)').matches;
}

/**
 * A wide side panel for secondary detail (checks, process records).
 *
 * Normally a modal native dialog: focus trap, backdrop and Escape come from the browser. When
 * WorkBot is docked open (for example because the person followed one of its references here),
 * the panel opens non-modally beside WorkBot instead, so the conversation stays visible and usable.
 */
export function Drawer({ open, onClose, title, children, actions }: { open: boolean; onClose: () => void; title: string; children: ReactNode; actions?: ReactNode }) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const restore = useRef<Element | null>(null);
  const [docked, setDocked] = useState(false);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      restore.current = document.activeElement;
      const beside = workBotDocked();
      setDocked(beside);
      if (beside) {
        d.show();
        d.querySelector<HTMLElement>('.pw-drawer__close')?.focus();
      } else {
        d.showModal();
      }
    } else if (!open && d.open) {
      d.close();
      (restore.current as HTMLElement | null)?.focus?.();
    }
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="pw-drawer"
      data-docked={docked || undefined}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onKeyDown={(e) => {
        // A non-modal dialog gets no cancel event, so Escape is handled here. A claim panel inside
        // the drawer handles its own Escape first.
        if (docked && e.key === 'Escape' && !ref.current?.querySelector('.inspector')) {
          e.preventDefault();
          onClose();
        }
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="pw-drawer__inner">
        <header className="pw-drawer__head">
          <p className="pw-drawer__title">{title}</p>
          {actions}
          <button type="button" className="icon-btn pw-drawer__close" onClick={onClose} aria-label={t('common.close')}>
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div className="pw-drawer__body">{open && children}</div>
      </div>
    </dialog>
  );
}
