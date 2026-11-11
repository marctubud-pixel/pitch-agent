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
import { useTeam } from '../../collaboration/context';
import { SectionHead } from '../../proposal/ui';
import { Action } from '../../ui/kit';
import { ReviewRows } from './ReviewRows';
import { StageEmpty } from './StageEmpty';
import { isQingyuContentReading } from '../../proposal/qingyu-content-review/preview';
import { QingyuContentReviewPreview } from '../../proposal/qingyu-content-review/QingyuContentReviewPreview';


export function ContentReviewStage({ proposal: p }: { proposal: Proposal }) {
  const t = useT();
  const cr = p.contentReview;
  if (isQingyuContentReading(p)) return <QingyuContentReviewPreview proposal={p} />;
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
        <ChangedPassages proposal={p} />
        <ol className="pw-narrative">
          {cr.narrative.map((n, i) => (
            <Passage key={n.id} n={n} index={i} proposal={p} />
          ))}
        </ol>
      </section>
    </div>
  );
}

/**
 * An index of the changed passages, read-only: each passage's recorded reason and a link to the
 * passage, where the earlier wording is shown struck through. Changes can come from the review or
 * from a person editing the wording, and the data does not record which, so the index does not say.
 * The review's checks are not linked to passages in the data. Only shown when passages changed.
 */
function ChangedPassages({ proposal: p }: { proposal: Proposal }) {
  const t = useT();
  const cr = p.contentReview!;
  const changed = cr.narrative.map((n, i) => ({ n, i })).filter((x) => x.n.before);
  if (changed.length === 0) return null;
  const revisedChecks = cr.checks.filter((c) => c.outcome === 'revised').length;
  const go = (id: string) => {
    const el = document.getElementById(`cr-p-${id}`);
    el?.scrollIntoView({ block: 'center' });
    el?.focus({ preventScroll: true });
    el?.classList.add('is-flash');
    window.setTimeout(() => el?.classList.remove('is-flash'), 1800);
  };
  return (
    <div className="pw-rev pw-rev--passages">
      <p className="pw-label">{t('pw.rev.passages', { count: changed.length })}</p>
      <ul className="pw-rev__list">
        {changed.map(({ n, i }) => (
          <li key={n.id}>
            <button type="button" className="text-link" onClick={() => go(n.id)}>
              {i + 1}. {n.title}
            </button>
            <span className="small">{n.changeReason ? ` — ${n.changeReason}` : <span className="muted"> — {t('pw.rev.noReason')}</span>}</span>
          </li>
        ))}
      </ul>
      {revisedChecks > 0 && <p className="small muted">{t('pw.rev.checksNotLinked', { count: revisedChecks })}</p>}
    </div>
  );
}

function Passage({ n, index, proposal: p }: { n: NarrativeSection; index: number; proposal: Proposal }) {
  const t = useT();
  const { run, pending, error } = useProposalAction();
  const { can, snapshot } = useTeam();
  const canEdit = can({ kind: 'edit_narrative' });
  const [editRevision, setEditRevision] = useState(p.revision);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(n.text);
  return (
    <li className="pw-passage" id={`cr-p-${n.id}`} tabIndex={-1} data-changed={n.before ? true : undefined}>
      <span className="pw-passage__n">{index + 1}</span>
      <div className="pw-passage__body">
        <p className="pw-passage__title">{n.title}</p>
        {editing && canEdit ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run('edit', (s) => s.editNarrative(p.id, n.id, text, { expectedRevision: editRevision, actor: snapshot.actor }), t('pw.cr.saved')).then((ok) => ok && setEditing(false));
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
            <button hidden={!canEdit} type="button" className="btn btn--ghost btn--sm" onClick={() => { setText(n.text); setEditRevision(p.revision); setEditing(true); }}>
              <PenLine size={14} aria-hidden="true" /> {t('pw.cr.edit')}
              <span className="sr-only">: {n.title}</span>
            </button>
          </>
        )}
      </div>
    </li>
  );
}
