/**
 * G. Presentation layout. First a sample spread in each of three genuinely different styles,
 * then the whole deck in the chosen one, viewed slide by slide. The editing boundary of the
 * exported PowerPoint is stated plainly.
 */
import { Check, Layers, Type } from 'lucide-react';
import { useProposalAction } from '../../app/proposalQuery';
import type { Proposal, Slide as SlideData } from '../../domain/proposal';
import { useT } from '../../i18n';
import { DeckViewer } from '../../proposal/DeckViewer';
import { directionArts, Slide, type DeckContext } from '../../proposal/Slide';
import { SectionHead } from '../../proposal/ui';
import { Action } from '../../ui/kit';
import { StageEmpty } from './StageEmpty';

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
  const t = useT();
  const { run, pending, error } = useProposalAction();
  const layout = p.layout;
  if (!layout || p.stages.layout.status === 'not_started') return <StageEmpty proposal={p} stage="layout" />;
  const deck = deckContext(p);
  const chosen = layout.styles.find((s) => s.id === layout.chosen) ?? null;
  const samples = sampleSlides(layout.slides);
  return (
    <div className="pw-layout">
      <section aria-labelledby="styles">
        <SectionHead id="styles" title={t('pw.lay.styles')} kicker={t('pw.lay.stylesKicker')} />
        <ul className="pw-styles">
          {layout.styles.map((st) => (
            <li key={st.id} className="pw-style" data-chosen={st.id === layout.chosen || undefined}>
              <div className="pw-style__spread">
                {samples.map(({ slide, index }) => (
                  <Slide key={slide.id} slide={slide} style={st} index={index} deck={deck} />
                ))}
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
                {st.reference && (
                  <p className="pw-style__ref">
                    <span className="pw-label">{t('pw.lay.builtFrom')}</span> {st.reference}
                  </p>
                )}
                <p>{st.idea}</p>
                <ul className="pw-bullets small">
                  {st.decisions.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
                {st.id === layout.chosen ? (
                  <p className="pw-chosen">
                    <Check size={14} aria-hidden="true" /> {layout.chosenBy === 'you' ? t('pw.lay.chosenByYou') : t('pw.lay.chosenByDirector')}
                  </p>
                ) : (
                  <Action label={t('pw.lay.use', { name: st.name })} size="sm" pending={pending === st.id} onClick={() => void run(st.id, (s) => s.chooseLayout(p.id, st.id), t('pw.lay.applied', { name: st.name }))} />
                )}
              </div>
            </li>
          ))}
        </ul>
        {error && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}
      </section>

      {chosen && (
        <section aria-labelledby="deck">
          <SectionHead id="deck" title={t('pw.lay.deck', { name: chosen.name, count: layout.slides.length })} kicker={t('pw.lay.deckKicker')} />
          <DeckViewer slides={layout.slides} style={chosen} deck={deck} />
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
