import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize2, X } from 'lucide-react';
import type { LayoutStyle, Slide as SlideData } from '../domain/proposal';
import { useT } from '../i18n';
import { Slide, type DeckContext } from './Slide';

/** Horizontal, slide-by-slide viewing: one large slide, a filmstrip, keyboard arrows, full screen. */
export function DeckViewer({ slides, style, deck }: { slides: SlideData[]; style: LayoutStyle; deck: DeckContext }) {
  const t = useT();
  const [i, setI] = useState(0);
  const [full, setFull] = useState(false);
  const strip = useRef<HTMLOListElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const go = (n: number) => setI(Math.max(0, Math.min(slides.length - 1, n)));
  // Keep the current thumbnail centred by scrolling the strip itself, never the page (scrollIntoView
  // would also move the window, pulling the page down on load).
  useEffect(() => {
    const el = strip.current;
    const thumb = el?.querySelector<HTMLElement>(`[data-i="${i}"]`);
    if (!el || !thumb) return;
    const left = thumb.offsetLeft - (el.clientWidth - thumb.offsetWidth) / 2;
    el.scrollTo({ left: Math.max(0, left), behavior: i === 0 ? 'auto' : 'smooth' });
  }, [i]);
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFull(false);
      if (e.key === 'ArrowRight') setI((n) => Math.min(slides.length - 1, n + 1));
      if (e.key === 'ArrowLeft') setI((n) => Math.max(0, n - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [full, slides.length]);
  const s = slides[i];
  if (!s) return null;
  return (
    <div className="deck" data-full={full || undefined}>
      <div
        className="deck__stage"
        ref={stage}
        tabIndex={0}
        aria-label={t('pw.deck.label', { n: i + 1, total: slides.length })}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') (e.preventDefault(), go(i + 1));
          if (e.key === 'ArrowLeft') (e.preventDefault(), go(i - 1));
        }}
      >
        <Slide slide={s} style={style} index={i} deck={deck} />
      </div>
      <div className="deck__bar">
        <button type="button" className="icon-btn" onClick={() => go(i - 1)} disabled={i === 0} aria-label={t('pw.deck.prev')}>
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <span className="deck__count" aria-live="polite">
          {i + 1} / {slides.length}
        </span>
        <button type="button" className="icon-btn" onClick={() => go(i + 1)} disabled={i === slides.length - 1} aria-label={t('pw.deck.next')}>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
        {s.notes && <p className="deck__notes small">{s.notes}</p>}
        <button type="button" className="btn btn--ghost btn--sm deck__full" onClick={() => setFull((f) => !f)}>
          {full ? <X size={14} aria-hidden="true" /> : <Maximize2 size={14} aria-hidden="true" />} {full ? t('pw.deck.exitFull') : t('pw.deck.full')}
        </button>
      </div>
      <ol className="deck__strip" ref={strip} aria-label={t('pw.deck.strip')}>
        {slides.map((x, n) => (
          <li key={x.id} data-i={n}>
            <button type="button" aria-current={n === i ? 'true' : undefined} onClick={() => go(n)} aria-label={`${n + 1}. ${x.lead}`}>
              <Slide slide={x} style={style} index={n} deck={deck} label="" />
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
