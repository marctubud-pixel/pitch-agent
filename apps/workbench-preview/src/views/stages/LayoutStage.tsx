/**
 * G. Presentation layout. First a sample spread in each of three genuinely different styles,
 * then the whole deck in the chosen one, viewed slide by slide. The editing boundary of the
 * exported PowerPoint is stated plainly.
 */
import { Check, Layers, Type } from 'lucide-react';
import { useProposalAction } from '../../app/proposalQuery';
import type { Proposal, Slide as SlideData } from '../../domain/proposal';
import { useT } from '../../i18n';
import { useTeam } from '../../collaboration/context';
import { DeckStudioPage, DeckStudioViewer, proposalReady } from '../../proposal/deck-studio';
import { StudioCapability, StudioPreparationStatus, useProposalStudio } from '../../proposal/deck-studio-ui';
import { directionArts, type DeckContext } from '../../proposal/Slide';
import { SectionHead } from '../../proposal/ui';
import { Action } from '../../ui/kit';
import { StageEmpty } from './StageEmpty';
import { QingyuLayoutPreview } from '../../proposal/qingyu-layout/QingyuLayoutPreview';
import { isQingyuLayoutProposal } from '../../proposal/qingyu-layout/preview';

export function deckContext(p: Proposal): DeckContext {
  return { title: p.name, client: p.client, directions: p.themes?.directions ?? [], total: p.layout?.slides.length ?? 0, arts: directionArts(p.layout?.slides ?? []) };
}

/** A small set of representative slides for comparing styles: a theme, a visual and a data or insight slide. */
export function sampleSlides(slides: SlideData[]): Array<{ slide: SlideData; index: number }> {
  const pick = (kinds: SlideData['kind'][]) => {
    const index = slides.findIndex((s) => kinds.includes(s.kind));
    return index >= 0 ? { slide: slides[index], index } : null;
  };
  return [pick(['theme']), pick(['visual', 'mockup']), pick(['data', 'insight', 'conclusion'])].filter((x): x is { slide: SlideData; index: number } => Boolean(x));
}

export function LayoutStage({ proposal: p }: { proposal: Proposal }) {
  if (isQingyuLayoutProposal(p)) return <QingyuLayoutPreview proposal={p} />;
  return <NativeLayoutStage proposal={p} />;
}

function NativeLayoutStage({ proposal: p }: { proposal: Proposal }) {
  const t = useT();
  const { run, pending, error } = useProposalAction();
  const { can, snapshot } = useTeam();
  const layout = p.layout;
  const studio = useProposalStudio(p);
  if (!layout || !proposalReady(p)) return <><StudioCapability proposal={p} /><StageEmpty proposal={p} stage="layout" /></>;
  const chosen = layout.styles.find((s) => s.id === layout.chosen) ?? null;
  const samples = sampleSlides(layout.slides);
  const chosenDeck = studio.state.kind === 'ready' ? studio.state.value.find(entry => entry.style.id === chosen?.id)?.deck : undefined;
  return (
    <div className="pw-layout">
      <section aria-labelledby="styles">
        <SectionHead id="styles" title={t('pw.lay.styles')} kicker={t('pw.lay.stylesKicker')} />
        <p className="studio-reading-note">版式工坊 · 本地工程模拟稿，待人工终审。预览与PPTX共用同一版式。</p>
        <StudioPreparationStatus state={studio.state} retry={studio.retry} />
        <ul className="pw-styles">
          {layout.styles.map((st) => {
            const prepared = studio.state.kind === 'ready' ? studio.state.value.find(entry => entry.style.id === st.id)?.deck : undefined;
            const preview = prepared ? samples.flatMap(({ slide }) => prepared.pages.filter(page => page.id === slide.id)).slice(0, 3) : [];
            return (
            <li key={st.id} className="pw-style" data-chosen={st.id === layout.chosen || undefined}>
              <div className="pw-style__spread">
                {(preview.length ? preview : prepared?.pages.slice(0, 3) ?? []).map(page => <DeckStudioPage key={page.id} page={page} />)}
                {!prepared && <span className="small muted">{studio.state.kind === 'error' ? '版式尚未准备完成' : '正在准备实际样页…'}</span>}
              </div>
              <div className="pw-style__info">
                <div className="pw-style__head">
                  <p className="pw-h3">{st.name}</p>
                  <span className="pw-style__swatches" aria-hidden="true">
                    {[...new Set(Object.values(st.palette))].map((c) => (
                      <i key={c} style={{ background: c }} />
                    ))}
                  </span>
                  <span className="pw-tag">
                    <Type size={12} aria-hidden="true" /> {t(`pw.lay.face.${st.typeface}`)}
                  </span>
                </div>
                <p>沿用本方向配色与字体，由版式工坊匹配固定图版。</p>
                {st.id === layout.chosen ? (
                  <p className="pw-chosen">
                    <Check size={14} aria-hidden="true" /> {layout.chosenBy === 'you' ? t('pw.lay.chosenByYou') : t('pw.lay.chosenByDirector')}
                  </p>
                ) : (
                  can({ kind: 'edit_visual' }) && <Action label={t('pw.lay.use', { name: st.name })} size="sm" pending={pending === st.id} onClick={() => void run(st.id, (s) => s.chooseLayout(p.id, st.id, { expectedRevision: p.revision, actor: snapshot.actor }), t('pw.lay.applied', { name: st.name }))} />
                )}
              </div>
            </li>
          ); })}
        </ul>
        {error && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}
      </section>

      {chosen && chosenDeck && (
        <section aria-labelledby="deck">
          <SectionHead id="deck" title={t('pw.lay.deck', { name: chosen.name, count: chosenDeck.pages.length })} kicker={t('pw.lay.deckKicker')} />
          <p className="studio-reading-note">{chosenDeck.status}</p>
          <DeckStudioViewer key={`${studio.context}/${chosen.id}`} deck={chosenDeck} />
        </section>
      )}

      <section className="pw-editable" aria-labelledby="editable">
        <SectionHead id="editable" title={t('pw.lay.editable')} />
        <div className="grid-2">
          <div>
            <p className="pw-label">
              <Type size={14} aria-hidden="true" /> {t('pw.lay.native')}
            </p>
            <ul className="pw-bullets">
              {layout.editability.native.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="pw-label">
              <Layers size={14} aria-hidden="true" /> {t('pw.lay.raster')}
            </p>
            <ul className="pw-bullets">
              {layout.editability.raster.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
