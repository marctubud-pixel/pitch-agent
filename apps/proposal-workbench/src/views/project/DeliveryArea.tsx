/**
 * Delivery Center: the current complete proposal, its editable exports and a short review
 * status. Process records stay out of the client deck.
 *
 * Composition, after the supplied blue corporate deck: the head as its cobalt closing page (a big
 * statement, a lime round arrow, the main download as a pill), the deck itself, then each style as
 * a card showing its real cover slide, and the limitations on a dark tile.
 */
import { useState } from 'react';
import { ArrowUpRight, CircleCheck, Download, FileWarning, Hand } from 'lucide-react';
import { useFeedback } from '../../app/feedback';
import { Link, projectPath } from '../../app/router';
import { STAGES, type LayoutStyle, type Proposal } from '../../domain/proposal';
import { useT } from '../../i18n';
import { DeckViewer } from '../../proposal/DeckViewer';
import { Slide } from '../../proposal/Slide';
import { Backed, SectionHead, StatusPill } from '../../proposal/ui';
import { Spinner } from '../../ui/kit';
import { deckContext } from '../stages/LayoutStage';

export function DeliveryArea({ proposal: p }: { proposal: Proposal }) {
  const t = useT();
  const { notify } = useFeedback();
  const layout = p.layout;
  const ready = layout && p.stages.layout.status !== 'not_started' && p.stages.layout.status !== 'in_progress';
  const chosen = layout?.styles.find((s) => s.id === layout.chosen) ?? null;
  const [busy, setBusy] = useState<{ style: string; done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const download = async (style: LayoutStyle) => {
    setError(null);
    setBusy({ style: style.id, done: 0, total: layout?.slides.length ?? 0 });
    try {
      const { exportPptx } = await import('../../proposal/pptx');
      const name = await exportPptx(p, style, (done, total) => setBusy({ style: style.id, done, total }));
      notify({ tone: 'success', message: t('pw.dc.downloaded', { name }) });
    } catch (e) {
      // Declining the viewer's save prompt is a choice, not an error.
      if ((e as Error).message !== 'declined') setError((e as Error).message || t('common.failed'));
    } finally {
      setBusy(null);
    }
  };

  if (!ready || !layout || !chosen) {
    const left = STAGES.filter((s) => p.stages[s].status !== 'done');
    return (
      <div className="page pw-page area">
        <header className="area-head">
          <div className="area-head__text">
            <h1 className="area-head__title">{t('pw.area.delivery')}</h1>
          </div>
        </header>
        <div className="pw-empty">
          <FileWarning size={28} aria-hidden="true" />
          <p className="pw-h3">{t('pw.dc.notYet')}</p>
          <p className="small">{t('pw.dc.notYetBody')}</p>
          <ul className="pw-left">
            {left.map((s) => (
              <li key={s}>
                <Link to={projectPath(p.workbenchId, 'proposal', { stage: s })}>{t(`pw.stage.${s}`)}</Link> <StatusPill status={p.stages[s].status} size="sm" />
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  const deliveryState = p.stages.delivery.status;
  const open = p.delivery?.checks.filter((c) => c.outcome === 'open').length ?? 0;
  const deck = deckContext(p);
  const cover = layout.slides.find((s) => s.kind === 'cover') ?? layout.slides[0];
  // A plain render helper (not a component), so buttons keep focus while the export runs.
  const downloadButton = (st: LayoutStyle, primary = false) => (
    <button type="button" className={primary ? 'dc-hero__cta' : `btn ${st.id === chosen.id ? 'btn--primary' : 'btn--secondary'} btn--sm`} onClick={() => void download(st)} disabled={Boolean(busy)} aria-busy={busy?.style === st.id || undefined}>
      {busy?.style === st.id ? <Spinner size={14} /> : <Download size={primary ? 18 : 14} aria-hidden="true" />}
      {busy?.style === st.id ? t('pw.dc.building', { done: busy.done, total: busy.total }) : primary ? t('pw.dc.downloadChosen', { style: st.name }) : t('pw.dc.download')}
    </button>
  );
  return (
    <div className="page pw-page pw-dc area">
      <header className="dc-hero">
        <div className="dc-hero__text">
          <p className="bx-bracket">{t('pw.area.delivery')}</p>
          {/* The project name is already the page header; here the deck speaks for itself. */}
          <h1 className="dc-hero__title">{layout.slides.find((x) => x.kind === 'cover')?.lead ?? p.name}</h1>
          <p className="dc-hero__lede">{t('pw.dc.lede', { count: layout.slides.length, style: chosen.name })}</p>
          <div className="dc-hero__actions">
            {downloadButton(chosen, true)}
            {deliveryState === 'done' ? (
              <p className="dc-hero__state">
                <CircleCheck size={16} aria-hidden="true" /> {t('pw.dc.signedOff')}
              </p>
            ) : deliveryState === 'waiting_for_you' ? (
              <Link to={projectPath(p.workbenchId, 'proposal', { stage: 'delivery', focus: 'decision' })} className="dc-hero__state dc-hero__state--link">
                <Hand size={16} aria-hidden="true" /> {t('pw.dc.awaitingSignoff')} <ArrowUpRight size={15} aria-hidden="true" />
              </Link>
            ) : (
              <StatusPill status={deliveryState} />
            )}
          </div>
          {error && (
            <p className="dc-hero__error" role="alert">
              {error}
            </p>
          )}
        </div>
        <ul className="dc-hero__stats">
          <li>
            <span className="dc-hero__n">{layout.slides.length}</span>
            <span>{t('pw.dc.stat.slides')}</span>
          </li>
          {p.delivery && (
            <>
              <li>
                <span className="dc-hero__n">{p.delivery.checks.length}</span>
                <span>{t('pw.dc.stat.checks')}</span>
              </li>
              <li data-open={open > 0 || undefined}>
                <span className="dc-hero__n">{open}</span>
                <span>{t('pw.dc.stat.open')}</span>
              </li>
            </>
          )}
        </ul>
      </header>

      <DeckViewer slides={layout.slides} style={chosen} deck={deck} />

      <section className="dc-styles" aria-labelledby="exports">
        <SectionHead id="exports" title={t('pw.dc.exports')} kicker={t('pw.dc.styles')} aside={<Backed as="connected" note={t('pw.dc.exportHint')} />} />
        <ul className="dc-cards">
          {layout.styles.map((st) => (
            <li key={st.id} className="dc-card" data-chosen={st.id === chosen.id || undefined}>
              <span className="dc-card__slide" aria-hidden="true">
                {cover && <Slide slide={cover} style={st} index={layout.slides.indexOf(cover)} deck={deck} label="" />}
              </span>
              <div className="dc-card__body">
                <p className="dc-card__name">
                  {st.name}
                  {st.id === chosen.id && <span className="pw-tag">{t('pw.dc.current')}</span>}
                </p>
                <p className="small muted">{t('pw.dc.file', { count: layout.slides.length })}</p>
                {st.reference && (
                  <p className="small muted">
                    {t('pw.lay.builtFrom')} {st.reference}
                  </p>
                )}
              </div>
              {downloadButton(st)}
            </li>
          ))}
        </ul>
        <div className="dc-edit">
          <div>
            <p className="pw-label">{t('pw.lay.native')}</p>
            <ul>
              {layout.editability.native.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="pw-label">{t('pw.lay.raster')}</p>
            <ul>
              {layout.editability.raster.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        </div>
        <p className="small muted">{t('pw.dc.clientOnly')}</p>
      </section>

      {p.delivery && p.delivery.limitations.length > 0 && (
        <section className="dl-limits" aria-labelledby="dc-limits">
          <h2 id="dc-limits" className="dl-limits__title">
            {t('pw.del.limits')}
          </h2>
          <ul className="dl-limits__list">
            {p.delivery.limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
