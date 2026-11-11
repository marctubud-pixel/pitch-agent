/**
 * A. Brief & task definition. A short task card first; the full editable task card (the
 * working Workbench brief, with provenance, versions and confirmation) is one click away.
 *
 * Composition, after the supplied Vision/Mission bento page: a numbered tag pill and a big title
 * beside a bento of picture and colour tiles (the supplied inputs, intended output, occasion and
 * scope), with an arrow set in a round notch cut from one tile's corner.
 */
import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, CircleHelp, FileText, Image as ImageIcon, Link2, Save } from 'lucide-react';
import { useProposalAction } from '../../app/proposalQuery';
import { useServiceQuery } from '../../app/query';
import { Link, projectPath, useRouter } from '../../app/router';
import type { TaskField } from '../../domain/models';
import type { CheckpointStage, ProductionMode, Proposal } from '../../domain/proposal';
import { useT } from '../../i18n';
import { OriginBadge } from '../../intake/TaskCardEditor';
import { proposalImages } from '../../proposal/derive';
import { Backed, More, SectionHead } from '../../proposal/ui';
import { ArtFrame } from '../../ui/art/ArtFrame';
import { Action, Embedded } from '../../ui/kit';
import { BriefView } from '../BriefView';
import { ModeFields } from './ModeFields';

const CARD_FIELDS: TaskField[] = ['brand', 'audience', 'constraints', 'openQuestions'];

export function BriefStage({ proposal: p }: { proposal: Proposal }) {
  const t = useT();
  const pid = p.workbenchId;
  const { params } = useRouter();
  const brief = useServiceQuery(`brief:${pid}`, (s) => s.getBriefHistory(pid), { projectId: pid });
  const current = brief.data?.current ?? null;
  const confirmed = Boolean(current?.confirmedAt);
  // The full editor opens by itself while the task card still needs confirming, or when a link asks for it.
  const images = proposalImages(p);
  // The dark scope tile shows a picture faded into its ground; a poster there would read as mud.
  const backdrop = images.slice(2).find((x) => x.art.kind === 'scene') ?? null;
  const editorOpen = (brief.data !== undefined && !confirmed) || params.has('field') || params.has('intake') || params.has('version');

  return (
    <div className="pw-brief">
      {/*
        After the supplied "Corporate Identity" slide (Vision / Mission / Strategy): a white sheet with
        a numbered tag and a label, the assignment as the headline, and a bento of coloured tiles
        and pictures for the output, the occasion and the scope.
      */}
      <section className="bf-sheet" aria-labelledby="task-title">
        <div className="bf-sheet__head">
          <span className="bf-tag">
            <span className="bf-tag__n">1</span>
            {t('pw.brief.assignment')}
          </span>
          <span className="bf-sheet__label">{p.client}</span>
        </div>
        <div className="bf-sheet__body">
          <div className="bf-lead">
            <h2 id="task-title" className="bf-title">
              {p.task.assignment || current?.objectives[0] || t('pw.brief.noAssignment')}
            </h2>
            <p className="small muted">
              <Backed as="prototype" /> {t('pw.brief.extrasNote')}
            </p>
            <span className="bf-lead__arrow" aria-hidden="true">
              <ArrowUpRight size={34} strokeWidth={1.8} />
            </span>
          </div>
          <div className="bf-bento">
            <figure className="bf-tile bf-tile--img bf-a">{images[0] ? <ArtFrame spec={images[0].art} title={images[0].title} fill /> : null}</figure>
            <div className="bf-tile bf-tile--lime bf-b">
              <p className="bf-tile__title">{t('pw.brief.output')}</p>
              <p className="bf-tile__text">{p.task.output || <span className="muted">{t('pw.brief.notSet')}</span>}</p>
            </div>
            <div className="bf-tile bf-tile--lilac bf-c">
              <p className="bf-tile__title">{t('pw.brief.occasion')}</p>
              <p className="bf-tile__text">{p.task.occasion ?? t('pw.brief.notSet')}</p>
            </div>
            <figure className="bf-tile bf-tile--img bf-d">{images[1] ? <ArtFrame spec={images[1].art} title={images[1].title} fill /> : null}</figure>
            <div className="bf-tile bf-tile--dark bf-e">
              <span className="bf-notch" aria-hidden="true">
                <ArrowDownLeft size={22} />
              </span>
              {backdrop && (
                <span className="bf-e__img" aria-hidden="true">
                  <ArtFrame spec={backdrop.art} fill />
                </span>
              )}
              <div className="bf-e__text">
                <p className="bf-tile__title">{t('pw.brief.scope')}</p>
                {p.task.scope.length > 0 ? (
                  <ul className="bf-tile__list">
                    {p.task.scope.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="bf-tile__text">{t('pw.brief.notSet')}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bf-fields" aria-label={t('pw.brief.fullCard')}>
        {CARD_FIELDS.map((f) => {
          const value = current ? (current[f as keyof typeof current] as string | string[]) : '';
          const list = Array.isArray(value) ? value : value ? [value] : [];
          const prov = current?.provenance?.[f];
          return (
            <div key={f} className="bf-field">
              <div className="bf-field__head">
                <span className="pw-label">{t(`taskField.${f}`)}</span>
                {current && <OriginBadge origin={prov?.origin ?? (list.length ? 'accepted' : 'missing')} filled={list.length > 0} />}
              </div>
              {list.length ? (
                <ul className="bf-field__list">
                  {list.map((v) => (
                    <li key={v}>{v}</li>
                  ))}
                </ul>
              ) : (
                <p className="muted small">{t('pw.brief.notStated')}</p>
              )}
            </div>
          );
        })}
        <p className="bf-fields__note small">
          <Backed as="connected" /> {confirmed ? t('pw.brief.confirmedV', { v: current?.version ?? 1 }) : t('pw.brief.unconfirmed')}
        </p>
      </section>

      {/* Unknowns as the lilac big-number tile from "Why Choose Our Strategy?" ("38K"). */}
      {p.task.unknowns.length > 0 && (
        <section className="bf-unknowns" aria-labelledby="unknowns" data-focus="unknowns" tabIndex={-1}>
          <div className="bf-unknowns__count">
            <span className="bf-unknowns__n">{p.task.unknowns.length}</span>
            <h2 id="unknowns" className="bf-unknowns__title">
              {t('pw.brief.unknowns')}
            </h2>
            <p className="bf-unknowns__kicker">{t('pw.brief.unknownsKicker')}</p>
          </div>
          <ul className="bf-unknowns__list">
            {p.task.unknowns.map((u) => (
              <li key={u.id}>
                <CircleHelp size={18} aria-hidden="true" />
                <div>
                  <p className="bf-unknowns__topic">{u.topic}</p>
                  <p className="small muted">{u.why}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Supplied material as picture cards with tags, after the case-study cards ("Trust & Co."). */}
      {p.task.inputs.length > 0 && (
        <section aria-labelledby="inputs">
          <SectionHead
            id="inputs"
            title={t('pw.brief.inputs')}
            aside={
              <Link className="text-link small" to={projectPath(pid, 'library')}>
                {t('pw.brief.inLibrary')}
              </Link>
            }
          />
          <ul className="bf-inputs">
            {p.task.inputs.map((x) => (
              <li key={x.id} className="bf-input">
                <div className="bf-input__thumb">
                  {x.art ? <ArtFrame spec={x.art} title={x.title} fill /> : x.kind === 'link' ? <Link2 size={26} aria-hidden="true" /> : x.kind === 'image' ? <ImageIcon size={26} aria-hidden="true" /> : <FileText size={26} aria-hidden="true" />}
                  <span className="bf-input__orb" aria-hidden="true">
                    <ArrowUpRight size={14} />
                  </span>
                </div>
                <p className="bf-input__title">{x.title}</p>
                <p className="small muted">{x.note}</p>
                <span className="bf-chip">{t(`pw.inputKind.${x.kind}`)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <WorkingMode proposal={p} />

      <section className="pw-editor" aria-labelledby="editor">
        <SectionHead id="editor" title={t('pw.brief.fullCard')} kicker={t('pw.brief.fullCardKicker')} aside={<Backed as="connected" />} />
        {/* One disclosure in both cases, so the editor is never remounted (and edits never lost) when a link's parameters are consumed. */}
        <More label={t('pw.brief.openEditor')} forceOpen={editorOpen}>
          <Embedded>
            <BriefView projectId={pid} />
          </Embedded>
        </More>
      </section>
    </div>
  );
}

/** Automatic or assisted mode, and the checkpoints. Changing them is recorded as a decision. */
function WorkingMode({ proposal: p }: { proposal: Proposal }) {
  const t = useT();
  const { run, pending, error } = useProposalAction();
  const [mode, setMode] = useState<ProductionMode>(p.mode);
  const [cps, setCps] = useState<CheckpointStage[]>(p.checkpoints);
  const dirty = mode !== p.mode || [...cps].sort().join() !== [...p.checkpoints].sort().join();
  return (
    <section className="card pw-workmode" aria-labelledby="workmode">
      <SectionHead id="workmode" title={t('pw.brief.howWeWork')} aside={<Backed as="prototype" />} />
      <ModeFields mode={mode} checkpoints={cps} onMode={setMode} onCheckpoints={setCps} />
      <p className="small muted">{t('pw.brief.authority')}</p>
      {dirty && (
        <div className="cluster">
          <Action label={t('pw.brief.saveMode')} variant="primary" icon={<Save size={16} aria-hidden="true" />} pending={pending === 'mode'} onClick={() => void run('mode', (s) => s.setMode(p.id, mode, cps), t('pw.brief.modeSaved'))} />
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              setMode(p.mode);
              setCps(p.checkpoints);
            }}
          >
            {t('brief.discard')}
          </button>
        </div>
      )}
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
