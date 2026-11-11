/**
 * F. Full content review, before any slide styling. The whole narrative is read as a story:
 * does it answer the brief, do the parts connect, are claims supported, do words and images
 * say the same thing. Wording can be revised here; earlier text is kept.
 *
 * Composition: review counts and rows as in ReviewRows; the narrative as a magazine reading
 * column with large numbers, the changed passages marked in lime.
 */
import { useState } from 'react';
import { PenLine } from 'lucide-react';
import { useProposalAction } from '../../app/proposalQuery';
import type { NarrativeSection, Proposal } from '../../domain/proposal';
import { useT } from '../../i18n';
import { SectionHead } from '../../proposal/ui';
import { Action } from '../../ui/kit';
import { ReviewRows } from './ReviewRows';
import { StageEmpty } from './StageEmpty';


export function ContentReviewStage({ proposal: p }: { proposal: Proposal }) {
  const t = useT();
  const cr = p.contentReview;
  if (!cr || p.stages.content_review.status === 'not_started') return <StageEmpty proposal={p} stage="content_review" />;
  return (
    <div className="pw-content">
      <p className="pw-note">{t('pw.cr.before')}</p>
      <section aria-labelledby="cr-checks">
        <SectionHead id="cr-checks" title={t('pw.cr.checks')} />
        <ReviewRows title={t('pw.cr.checks')} outcomes={['pass', 'revised', 'open']} labelPrefix="pw.cr.outcome" items={cr.checks.map((c) => ({ id: c.id, title: c.question, note: c.note, outcome: c.outcome }))} />
      </section>
      <section aria-labelledby="cr-narrative">
        <SectionHead id="cr-narrative" title={t('pw.cr.narrative')} kicker={t('pw.cr.narrativeKicker')} />
        <ol className="pw-narrative">
          {cr.narrative.map((n, i) => (
            <Passage key={n.id} n={n} index={i} proposalId={p.id} />
          ))}
        </ol>
      </section>
    </div>
  );
}

function Passage({ n, index, proposalId }: { n: NarrativeSection; index: number; proposalId: string }) {
  const t = useT();
  const { run, pending, error } = useProposalAction();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(n.text);
  return (
    <li className="pw-passage" data-changed={n.before ? true : undefined}>
      <span className="pw-passage__n">{index + 1}</span>
      <div className="pw-passage__body">
        <p className="pw-passage__title">{n.title}</p>
        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run('edit', (s) => s.editNarrative(proposalId, n.id, text), t('pw.cr.saved')).then((ok) => ok && setEditing(false));
            }}
          >
            <label className="sr-only" htmlFor={`np-${n.id}`}>
              {n.title}
            </label>
            <textarea id={`np-${n.id}`} className="pw-textarea" rows={3} value={text} onChange={(e) => setText(e.target.value)} />
            <div className="cluster">
              <Action label={t('pw.cr.save')} type="submit" variant="primary" pending={pending === 'edit'} disabled={!text.trim() || text === n.text} reason={null} />
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  setText(n.text);
                  setEditing(false);
                }}
              >
                {t('common.cancel')}
              </button>
            </div>
            {error && (
              <p className="field__error" role="alert">
                {error}
              </p>
            )}
          </form>
        ) : (
          <>
            <p className="pw-passage__text">{n.text}</p>
            {n.before && (
              <p className="pw-passage__before">
                <span className="pw-label">{t('pw.cr.was')}</span> <s>{n.before}</s>
                {n.changeReason && <span className="small muted"> — {n.changeReason}</span>}
              </p>
            )}
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(true)}>
              <PenLine size={14} aria-hidden="true" /> {t('pw.cr.edit')}
              <span className="sr-only">: {n.title}</span>
            </button>
          </>
        )}
      </div>
    </li>
  );
}
