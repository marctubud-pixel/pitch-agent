import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CircleCheck, Download, ExternalLink, FileText, FileUp, History, Lock, Save, TriangleAlert, Undo2 } from 'lucide-react';
import { useCommand } from '../app/commands';
import { useServiceQuery } from '../app/query';
import { Link, projectPath, useNavigationBlocker, useRouter } from '../app/router';
import { useService } from '../app/services';
import type { BriefDraftContext } from '../domain/assistant';
import { LIST_FIELDS, TASK_FIELDS, type Brief, type BriefAttachment, type BriefHistory, type TaskField } from '../domain/models';
import { useI18n, useT } from '../i18n';
import { ChangeReview } from '../intake/ChangeReview';
import { IntakeSourcePanel } from '../intake/IntakeSourcePanel';
import { MappingBanner } from '../intake/MappingBanner';
import { attachmentFrom, diffCards, fromBrief, mergeForUpdate, missingRequired, pendingSuggestions, toBriefInput, unclear, type TaskCardState } from '../intake/taskCard';
import { TaskCardEditor, type SourceDoc } from '../intake/TaskCardEditor';
import { useIntakeRun } from '../intake/useIntakeRun';
import { Modal } from '../ui/Modal';
import { Action, CommandFeedback, PageHeader, QueryView, Skeleton, TextInput, Time } from '../ui/kit';
import { StatusBadge } from '../ui/status';
import { useWorkBot, useWorkBotDraft } from '../workbot/context';
import { WorkBotCharacter } from '../workbot/Character';

const PREFIX = 'brief-field';
const fingerprint = (card: TaskCardState) => JSON.stringify(TASK_FIELDS.map((f) => [card[f].text.trim(), card[f].provenance.origin]));

function sourcesOf(data: BriefHistory, t: ReturnType<typeof useT>): SourceDoc[] {
  return data.attachments.filter((a) => a.text).map((a) => ({ id: a.id, label: `${a.fileName ?? t(`attach.kind.${a.kind}`)} · ${t('common.version', { v: a.briefVersion })}`, text: a.text }));
}

export function BriefView({ projectId }: { projectId: string }) {
  const query = useServiceQuery(`brief:${projectId}`, (s) => s.getBriefHistory(projectId), { projectId });
  const { params } = useRouter();
  const version = params.get('version');
  const updating = params.get('intake') === '1';
  return (
    <div className="page">
      <QueryView query={query} skeleton={<Skeleton lines={5} blocks={2} />}>
        {(data) => {
          const historical = version ? data.versions.find((v) => String(v.version) === version) : null;
          if (historical && historical.version !== data.current?.version) return <HistoricalBrief data={data} brief={historical} />;
          if (updating && data.current) return <BriefUpdate data={data} />;
          return <BriefEditor data={data} />;
        }}
      </QueryView>
    </div>
  );
}

function VersionList({ data, active }: { data: BriefHistory; active: number | undefined }) {
  const { t, rich } = useI18n();
  return (
    <nav className="card version-list" aria-label={t('brief.historyLabel')}>
      <h2 className="card__title">
        <History size={16} aria-hidden="true" /> {t('brief.history')}
      </h2>
      <ol>
        {data.versions.map((v) => (
          <li key={v.id}>
            <Link
              to={v.version === data.current?.version ? projectPath(data.project.id, 'brief') : projectPath(data.project.id, 'brief', { version: String(v.version) })}
              aria-current={v.version === active ? 'page' : undefined}
            >
              <span className="version-list__title">
                {t('common.version', { v: v.version })}
                {v.version === data.current?.version ? ` · ${t('brief.current')}` : ''}
              </span>
              <span className="small muted">{v.confirmedAt ? rich('brief.confirmedAt', { time: <Time iso={v.confirmedAt} /> }) : t('brief.notConfirmed')}</span>
              {v.changeNote && <span className="small">{v.changeNote}</span>}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The original material behind each brief version, with the file when this session still has it. */
function AttachmentList({ data }: { data: BriefHistory }) {
  const { t } = useI18n();
  const service = useService();
  const [error, setError] = useState<string | null>(null);
  const open = async (a: BriefAttachment, mode: 'open' | 'download') => {
    setError(null);
    try {
      const blob = await service.getBriefAttachmentFile(data.project.id, a.id);
      if (!blob) {
        setError(t('attach.gone', { name: a.fileName ?? '' }));
        return;
      }
      if (mode === 'download') download(blob, a.fileName ?? 'brief');
      else window.open(URL.createObjectURL(blob), '_blank', 'noopener');
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <section className="card attach-list" aria-labelledby="attach-title">
      <h2 className="card__title" id="attach-title">
        <FileText size={16} aria-hidden="true" /> {t('attach.originalTitle')}
      </h2>
      {data.attachments.length === 0 ? (
        <p className="small muted">{t('attach.none')}</p>
      ) : (
        <ul>
          {data.attachments.map((a) => (
            <li key={a.id} className="attach">
              <div>
                <p className="attach__name">{a.fileName ?? t(`attach.kind.${a.kind}`)}</p>
                <p className="small muted">
                  {t('common.version', { v: a.briefVersion })} · {t(`attach.kind.${a.kind}`)} · <Time iso={a.createdAt} relative />
                  {a.mapping === 'simulated_sample' && <> · {t('intake.simulatedMapping')}</>}
                </p>
                {a.fileName && !a.fileAvailable && <p className="small attach__gone">{t('attach.notInSession')}</p>}
              </div>
              <div className="cluster cluster--tight">
                {a.fileName && a.fileAvailable && (
                  <>
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => void open(a, 'open')}>
                      <ExternalLink size={14} aria-hidden="true" /> {t('attach.open')}
                      <span className="sr-only">: {a.fileName}</span>
                    </button>
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => void open(a, 'download')}>
                      <Download size={14} aria-hidden="true" /> {t('attach.download')}
                      <span className="sr-only">: {a.fileName}</span>
                    </button>
                  </>
                )}
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => download(new Blob([a.text], { type: 'text/plain' }), `${(a.fileName ?? 'brief').replace(/\.[^.]+$/, '')}-text.txt`)}>
                  <Download size={14} aria-hidden="true" /> {t('attach.text')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="small field__error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function HistoricalBrief({ data, brief }: { data: BriefHistory; brief: Brief }) {
  const { t, rich } = useI18n();
  const card = useMemo(() => fromBrief(brief, data.project.name), [brief, data.project.name]);
  return (
    <>
      <PageHeader eyebrow={t('brief.eyebrow', { v: brief.version })} title={t('brief.title', { name: data.project.name })} />
      <p className="banner" data-tone="neutral" role="status">
        <Lock size={16} aria-hidden="true" /> {t('brief.historical', { v: brief.version })}
        {brief.supersededAt && <> {rich('brief.superseded', { time: <Time iso={brief.supersededAt} /> })}</>}{' '}
        <Link className="text-link" to={projectPath(data.project.id, 'brief')}>
          {t('brief.goCurrent')}
        </Link>
      </p>
      <TaskCardEditor state={card} onChange={() => {}} idPrefix={PREFIX} readOnly={[...TASK_FIELDS]} disabled sources={sourcesOf(data, t)} />
      <div className="grid-2 brief-foot">
        <AttachmentList data={data} />
        <VersionList data={data} active={brief.version} />
      </div>
    </>
  );
}

function useFieldFocus() {
  const { params, setParams } = useRouter();
  const [focus, setFocus] = useState<{ f: TaskField; n: number } | null>(null);
  const requested = params.get('field') as TaskField | null;
  useEffect(() => {
    if (requested && (TASK_FIELDS as readonly string[]).includes(requested)) {
      setFocus((p) => ({ f: requested, n: (p?.n ?? 0) + 1 }));
      setParams({ field: null });
    }
  }, [requested, setParams]);
  const request = useCallback((f: TaskField) => setFocus((p) => ({ f, n: (p?.n ?? 0) + 1 })), []);
  return { focus, request };
}

/** What still needs a person before the brief can be confirmed, as buttons that jump to each field. */
function DecisionStrip({ card, onFocus }: { card: TaskCardState; onFocus: (f: TaskField) => void }) {
  const t = useT();
  const groups: Array<{ id: 'required' | 'suggested' | 'unclear'; fields: TaskField[] }> = [
    { id: 'required', fields: missingRequired(card) },
    { id: 'suggested', fields: pendingSuggestions(card) },
    { id: 'unclear', fields: unclear(card) },
  ];
  const shown = groups.filter((g) => g.fields.length);
  if (!shown.length) return null;
  return (
    <div className="decision-strip card" role="group" aria-label={t('brief.toDecide')}>
      <p className="decision-strip__title">{t('brief.toDecide')}</p>
      {shown.map((g) => (
        <div key={g.id} className="decision-strip__row" data-kind={g.id}>
          <span className="small">{t(`brief.decide.${g.id}`)}</span>
          <div className="cluster cluster--tight">
            {g.fields.map((f) => (
              <button key={f} type="button" className="field-chip" onClick={() => onFocus(f)}>
                {t(`taskField.${f}`)}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function draftContextOf(card: TaskCardState, projectId: string, extra: Partial<BriefDraftContext> = {}): BriefDraftContext {
  const fields = Object.fromEntries(
    TASK_FIELDS.map((f) => [f, { value: LIST_FIELDS.has(f) ? card[f].text.split('\n').map((l) => l.trim()).filter(Boolean) : card[f].text.trim(), provenance: card[f].provenance }]),
  );
  return { projectId, fields: fields as unknown as BriefDraftContext['fields'], mapping: 'none', simulated: false, fileName: null, ...extra };
}

function BriefEditor({ data }: { data: BriefHistory }) {
  const service = useService();
  const save = useCommand();
  const confirmCmd = useCommand();
  const { t, rich, list } = useI18n();
  const { setParams } = useRouter();
  const { ask } = useWorkBot();
  const current = data.current;
  const [base, setBase] = useState({ revision: data.project.revision, brief: current });
  const baseCard = useMemo(() => fromBrief(base.brief, data.project.name), [base.brief, data.project.name]);
  const [card, setCard] = useState<TaskCardState>(() => baseCard);
  const [reviewing, setReviewing] = useState(false);
  const [changeNote, setChangeNote] = useState('');
  const { focus, request } = useFieldFocus();
  const dirty = fingerprint(card) !== fingerprint(baseCard);

  useNavigationBlocker(dirty, t('brief.unsaved'));
  // A conflict is explained in its own dialog; get the review out of the way so the edits can be kept.
  useEffect(() => {
    if (save.state.status === 'conflict') setReviewing(false);
  }, [save.state.status]);

  useEffect(() => {
    if (!dirty) {
      setBase({ revision: data.project.revision, brief: data.current });
      setCard(fromBrief(data.current, data.project.name));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const confirmed = Boolean(current?.confirmedAt);
  const nextVersion = (current?.version ?? 0) + 1;
  const newerAvailable = dirty && data.project.revision !== base.revision;
  const changes = useMemo(() => diffCards(baseCard, card), [baseCard, card]);
  const required = missingRequired(card);
  const suggestions = pendingSuggestions(card);

  const commit = async () => {
    const input = toBriefInput(card, null, changeNote);
    await save.run({
      label: confirmed ? t('brief.saveAsLabel', { v: nextVersion }) : t('brief.saveDraftLabel'),
      payload: input,
      expectedRevision: base.revision,
      execute: (meta) => service.saveBrief(data.project.id, input, meta),
      success: (r) => (r.data.version > (current?.version ?? 0) ? t('brief.savedVersion', { v: r.data.version }) : t('brief.draftSaved')),
      onSuccess: (r) => {
        setBase({ revision: r.revision, brief: r.data });
        setCard(fromBrief(r.data, data.project.name));
        setReviewing(false);
        setChangeNote('');
      },
    });
  };

  const confirmBrief = () =>
    confirmCmd.run({
      label: t('wf.confirmBrief'),
      payload: { version: current?.version },
      expectedRevision: base.revision,
      execute: (meta) => service.confirmBrief(data.project.id, meta),
      success: t('wf.confirmBrief.done'),
    });

  const confirmReason = dirty
    ? t('brief.saveFirst')
    : confirmed
      ? t('brief.alreadyConfirmed', { v: current?.version ?? 1 })
      : required.length
        ? t('brief.addBefore', { fields: list(required.map((f) => t(`taskField.${f}`))) })
        : suggestions.length
          ? t('brief.acceptFirst', { fields: list(suggestions.map((f) => t(`taskField.${f}`))) })
          : null;

  return (
    <>
      <PageHeader
        eyebrow={t('brief.eyebrow', { v: current?.version ?? 1 })}
        title={t('brief.title', { name: data.project.name })}
        actions={
          <>
            <button type="button" className="btn btn--secondary" onClick={() => setParams({ intake: '1' })}>
              <FileUp size={16} aria-hidden="true" /> {t('brief.update')}
            </button>
            <Action
              label={t('wf.confirmBrief')}
              variant="primary"
              icon={<CircleCheck size={16} aria-hidden="true" />}
              onClick={() => void confirmBrief()}
              disabled={Boolean(confirmReason)}
              reason={confirmReason}
              pending={confirmCmd.pending}
            />
          </>
        }
      >
        <div className="cluster">
          {confirmed ? <StatusBadge kind="gate" value="approved" /> : <StatusBadge kind="gate" value="awaiting_decision" />}
          <span className="small muted">
            {confirmed && current?.confirmedAt ? rich('brief.confirmedBy', { by: current.confirmedBy ?? '', time: <Time iso={current.confirmedAt} /> }) : t('brief.waiting')}
          </span>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => ask('brief')}>
            <WorkBotCharacter height={20} /> {t('brief.askWorkBot')}
          </button>
        </div>
      </PageHeader>
      <CommandFeedback command={confirmCmd} />

      {newerAvailable && (
        <div className="banner banner--row" data-tone="warn" role="status">
          <TriangleAlert size={16} aria-hidden="true" />
          <div className="stack-sm">
            <p>{t('brief.newer', { from: base.revision, to: data.project.revision })}</p>
            <div>
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => setBase({ revision: data.project.revision, brief: data.current })}>
                {t('brief.keepEdits')}
              </button>
            </div>
          </div>
        </div>
      )}
      {!confirmed && <DecisionStrip card={card} onFocus={request} />}

      <TaskCardEditor state={card} onChange={setCard} idPrefix={PREFIX} readOnly={['projectName']} focus={focus} sources={sourcesOf(data, t)} />

      <div className="save-bar card" data-dirty={dirty || undefined}>
        <p className="small">{dirty ? (confirmed ? t('brief.willCreate', { next: nextVersion, v: current?.version ?? 1 }) : t('brief.unsavedShort', { count: Math.max(changes.length, 1) })) : t('brief.noChanges')}</p>
        <div className="cluster">
          {dirty && (
            <button type="button" className="btn btn--ghost" onClick={() => setCard(baseCard)}>
              <Undo2 size={16} aria-hidden="true" /> {t('brief.discard')}
            </button>
          )}
          <Action
            label={confirmed ? t('brief.reviewChanges') : t('brief.saveDraft')}
            variant="primary"
            icon={<Save size={16} aria-hidden="true" />}
            disabled={!dirty}
            reason={null}
            pending={save.pending && !reviewing}
            onClick={() => (confirmed ? setReviewing(true) : void commit())}
          />
        </div>
      </div>
      <CommandFeedback command={save} />

      <div className="grid-2 brief-foot">
        <AttachmentList data={data} />
        <VersionList data={data} active={current?.version} />
      </div>

      <Modal
        open={reviewing}
        onClose={() => setReviewing(false)}
        title={t('change.title')}
        size="lg"
        footer={
          <>
            <button type="button" className="btn btn--secondary" onClick={() => setReviewing(false)}>
              {t('common.cancel')}
            </button>
            <Action label={t('change.apply', { v: nextVersion })} variant="primary" pending={save.pending} onClick={() => void commit()} />
          </>
        }
      >
        <ChangeReview changes={changes} confirmed={confirmed} currentVersion={current?.version ?? 1} dependents={data.dependentArtifacts} sourceLabel={null} />
        <TextInput label={t('brief.changeNote')} value={changeNote} onChange={(e) => setChangeNote(e.target.value)} optional hint={t('brief.changeNoteHint')} />
        <CommandFeedback command={save} />
      </Modal>
    </>
  );
}

/**
 * Updating an existing brief from new material. The new reading is merged over the current
 * brief (fields the material does not mention keep their values) and nothing is applied until
 * the person has seen the changes and confirmed them.
 */
function BriefUpdate({ data }: { data: BriefHistory }) {
  const { t } = useI18n();
  const service = useService();
  const save = useCommand();
  const { setParams } = useRouter();
  const { ask } = useWorkBot();
  const { state: run, run: start, cancel } = useIntakeRun();
  const current = data.current!;
  const confirmed = Boolean(current.confirmedAt);
  const currentCard = useMemo(() => fromBrief(current, data.project.name), [current, data.project.name]);
  const [card, setCard] = useState<TaskCardState | null>(null);
  const [adopted, setAdopted] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [changeNote, setChangeNote] = useState('');
  const { focus, request } = useFieldFocus();
  const done = run.status === 'done' ? run : null;
  if (done && adopted !== done.doc.id) {
    setAdopted(done.doc.id);
    setCard(mergeForUpdate(currentCard, done.mapping.fields));
    setChangeNote(t('change.defaultNote', { name: done.doc.fileName ?? t(`attach.kind.${done.doc.kind}`) }));
  }
  const changes = useMemo(() => (card ? diffCards(currentCard, card) : []), [card, currentCard]);
  useNavigationBlocker(Boolean(card) && save.state.status !== 'success', t('brief.unsaved'));

  const draft = useMemo(
    () => (card && done ? draftContextOf(card, data.project.id, { mapping: done.mapping.mode, simulated: done.mapping.simulated, fileName: done.doc.fileName }) : null),
    [card, done, data.project.id],
  );
  useWorkBotDraft(draft, request);

  const leave = () => setParams({ intake: null });
  const nextVersion = confirmed ? current.version + 1 : current.version;

  const apply = async () => {
    if (!card || !done) return;
    const input = toBriefInput(card, attachmentFrom(done.doc, done.mapping.mode), changeNote);
    await save.run({
      label: t('change.apply', { v: nextVersion }),
      payload: { ...input, attachment: input.attachment ? { ...input.attachment, file: null } : null },
      expectedRevision: data.project.revision,
      execute: (meta) => service.saveBrief(data.project.id, input, meta),
      success: (r) => (r.data.version > current.version ? t('brief.savedVersion', { v: r.data.version }) : t('brief.draftSaved')),
      onSuccess: () => {
        setApplying(false);
        leave();
      },
    });
  };

  return (
    <>
      <button type="button" className="back-link" onClick={leave}>
        <ArrowLeft size={14} aria-hidden="true" /> {t('update.cancel')}
      </button>
      <PageHeader eyebrow={t('brief.eyebrow', { v: current.version })} title={t('update.title', { name: data.project.name })}>
        <p className="muted">{confirmed ? t('update.ledeConfirmed', { v: current.version }) : t('update.ledeDraft', { v: current.version })}</p>
      </PageHeader>
      {!card ? (
        <IntakeSourcePanel state={run} onRun={(s) => void start(s)} onCancel={cancel} />
      ) : (
        done && (
          <div className="stack">
            <MappingBanner mapping={done.mapping} doc={done.doc} />
            <section className="card update-summary" aria-labelledby="update-changes">
              <div className="update-summary__head">
                <h2 className="card__title" id="update-changes">
                  {t('update.changes', { count: changes.length })}
                </h2>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => ask('brief')}>
                  <WorkBotCharacter height={20} /> {t('new.askWorkBot')}
                </button>
              </div>
              <p className="small muted">{t('update.keepNote')}</p>
              <ChangeReview changes={changes} confirmed={confirmed} currentVersion={current.version} dependents={data.dependentArtifacts} sourceLabel={null} />
            </section>
            <DecisionStrip card={card} onFocus={request} />
            <TaskCardEditor state={card} onChange={setCard} idPrefix={PREFIX} readOnly={['projectName']} focus={focus} sources={[{ id: done.doc.id, label: done.doc.fileName ?? t(`attach.kind.${done.doc.kind}`), text: done.doc.text }]} />
            <div className="save-bar card" data-dirty="true">
              <p className="small">{t('update.nothingYet')}</p>
              <div className="cluster">
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => {
                    cancel();
                    setCard(null);
                    setAdopted(null);
                  }}
                >
                  {t('update.other')}
                </button>
                <Action label={t('update.review')} variant="primary" disabled={changes.length === 0} reason={t('update.noChanges')} onClick={() => setApplying(true)} />
              </div>
            </div>
          </div>
        )
      )}
      <Modal
        open={applying}
        onClose={() => setApplying(false)}
        title={t('change.title')}
        size="lg"
        footer={
          <>
            <button type="button" className="btn btn--secondary" onClick={() => setApplying(false)}>
              {t('common.cancel')}
            </button>
            <Action label={confirmed ? t('change.apply', { v: nextVersion }) : t('change.applyDraft', { v: nextVersion })} variant="primary" pending={save.pending} onClick={() => void apply()} />
          </>
        }
      >
        <ChangeReview changes={changes} confirmed={confirmed} currentVersion={current.version} dependents={data.dependentArtifacts} sourceLabel={done?.doc.fileName ?? null} />
        <TextInput label={t('brief.changeNote')} value={changeNote} onChange={(e) => setChangeNote(e.target.value)} optional />
        <CommandFeedback command={save} />
      </Modal>
    </>
  );
}
