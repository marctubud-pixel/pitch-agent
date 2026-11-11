import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useT } from '../i18n';

/**
 * Side panel beside the main content. It does not trap focus, so the reader can move between
 * the document and the panel; Escape closes it and the caller restores focus to the trigger.
 */
export function Inspector({ title, eyebrow, onClose, children }: { title: string; eyebrow?: string; onClose: () => void; children: ReactNode }) {
  const t = useT();
  const titleId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [title]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Inside a drawer, Escape closes this panel first and leaves the drawer open. A modal opened
      // on top of the panel keeps Escape for itself.
      const open = [...document.querySelectorAll('dialog[open]')];
      const top = open[open.length - 1];
      if (top && !top.contains(panelRef.current)) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <aside className="inspector" aria-labelledby={titleId} ref={panelRef}>
      <header className="inspector__header">
        <div>
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h2 id={titleId} ref={headingRef} tabIndex={-1}>
            {title}
          </h2>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label={t('inspector.close')}>
          <X size={18} aria-hidden="true" />
        </button>
      </header>
      <div className="inspector__body">{children}</div>
    </aside>
  );
}

/** Moves focus back to the element that opened a panel, once it is rendered again. */
export function restoreFocus(selector: string) {
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>(selector);
    el?.focus();
  });
}
