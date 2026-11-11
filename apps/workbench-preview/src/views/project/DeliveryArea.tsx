/**
 * Delivery Center: the current complete proposal, its editable exports and a short review
 * status. Process records stay out of the client deck.
 *
 * Composition, after the supplied blue corporate deck: the head as its cobalt closing page (a big
 * statement, a lime round arrow, the main download as a pill), the deck itself, then each style as
 * a card showing its real cover slide, and the limitations on a dark tile.
 */
import { ArrowUpRight, CircleCheck, Download, FileWarning, Hand } from 'lucide-react';
import { Link, projectPath } from '../../app/router';
import { ACTIVE_STAGES, type LayoutStyle, type Proposal } from '../../domain/proposal';
import { useT } from '../../i18n';
import { DeckStudioPage, DeckStudioViewer, proposalReady, type Deck } from '../../proposal/deck-studio';
import { StudioCapability, StudioPreparationStatus, useProposalStudio, useStudioDownload } from '../../proposal/deck-studio-ui';
import { Backed, SectionHead, StatusPill } from '../../proposal/ui';
import { Spinner } from '../../ui/kit';

export function DeliveryArea({ proposal: p }: { proposal: Proposal }) {
  const t = useT();
  const layout = p.layout;
  const ready = proposalReady(p);
  const chosen = layout?.styles.find((s) => s.id === layout.chosen) ?? null;
  const studio = useProposalStudio(p);
  const output = useStudioDownload(studio.context);
  const chosenDeck = studio.state.kind === 'ready' ? studio.state.value.find(entry => entry.style.id === chosen?.id)?.deck : undefined;
  const error = output.state.kind === 'error' ? output.state.message : null;

  if (!ready || !layout || !chosen) {
    const left = ACTIVE_STAGES.filter((s) => p.stages[s].status !== 'done');
    return (
      <div className="page pw-page area">
        <header className="area-head">
          <div className="area-head__text">
            <h1 className="area-head__title">{t('pw.area.delivery')}</h1>
          </div>
        </header>
        <StudioCapability proposal={p} />
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
  const downloadButton = (st: LayoutStyle, prepared: Deck | undefined, primary = false) => {
    const busy = output.state.kind === 'pending';
    const active = output.state.kind === 'pending' && output.state.style === st.id;
    return <button type="button" className={primary ? 'dc-hero__cta' : `btn ${st.id === chosen.id ? 'btn--primary' : 'btn--secondary'} btn--sm`} onClick={() => { if (prepared) void output.download(prepared); }} disabled={!prepared || busy} aria-busy={active || undefined}>
      {active ? <Spinner size={14} /> : <Download size={primary ? 18 : 14} aria-hidden="true" />}
      {active ? '正在生成PPTX…' : primary ? t('pw.dc.downloadChosen', { style: st.name }) : t('pw.dc.download')}
    </button>;
  };
  return (
    <div className="page pw-page pw-dc area">
      <header className="dc-hero">
        <div className="dc-hero__text">
          <p className="bx-bracket">{t('pw.area.delivery')}</p>
          {/* The project name is already the page header; here the deck speaks for itself. */}
          <h1 className="dc-hero__title">{layout.slides.find((x) => x.kind === 'cover')?.lead ?? p.name}</h1>
          <p className="dc-hero__lede">{chosenDeck ? t('pw.dc.lede', { count: chosenDeck.pages.length, style: chosen.name }) : '正在准备实际版式与页数…'}</p>
          <p className="dc-hero__draft">{chosenDeck?.status ?? '本地工程模拟 · 尚待人工终审'}</p>
          <div className="dc-hero__actions">
            {downloadButton(chosen, chosenDeck, true)}
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
          {output.state.kind === 'saved' && <p className="dc-hero__draft" role="status">已交给浏览器下载 · {output.state.fileName}</p>}
          {error && (
            <p className="dc-hero__error" role="alert">
              {error}
            </p>
          )}
        </div>
        <ul className="dc-hero__stats">
          <li>
            <span className="dc-hero__n">{chosenDeck?.pages.length ?? '待定'}</span>
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

      <StudioPreparationStatus state={studio.state} retry={studio.retry} />
      {chosenDeck && <DeckStudioViewer key={`${studio.context}/${chosen.id}`} deck={chosenDeck} />}

      <section className="dc-styles" aria-labelledby="exports">
        <SectionHead id="exports" title={t('pw.dc.exports')} kicker={t('pw.dc.styles')} aside={<Backed as="connected" note={t('pw.dc.exportHint')} />} />
        <ul className="dc-cards">
          {layout.styles.map((st) => {
            const prepared = studio.state.kind === 'ready' ? studio.state.value.find(entry => entry.style.id === st.id)?.deck : undefined;
            const cover = prepared?.pages[0];
            return (
            <li key={st.id} className="dc-card" data-chosen={st.id === chosen.id || undefined}>
              <span className="dc-card__slide" aria-hidden="true">
                {cover ? <DeckStudioPage page={cover} /> : <span className="small muted">版式准备中</span>}
              </span>
              <div className="dc-card__body">
                <p className="dc-card__name">
                  {st.name}
                  {st.id === chosen.id && <span className="pw-tag">{t('pw.dc.current')}</span>}
                </p>
                <p className="small muted">{prepared ? t('pw.dc.file', { count: prepared.pages.length }) : '尚未生成'}</p>
              </div>
              {downloadButton(st, prepared)}
            </li>
          ); })}
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
