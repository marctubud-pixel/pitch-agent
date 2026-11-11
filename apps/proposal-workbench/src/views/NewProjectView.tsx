import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, FilePlus2, Info, Megaphone, Package, RotateCcw } from 'lucide-react';
import { WorkBotCharacter } from '../workbot/Character';
import { useCommand } from '../app/commands';
import { useServiceQuery } from '../app/query';
import { Link, projectPath, useNavigationBlocker, useRouter } from '../app/router';
import { useAssistant, useService, useServiceContext } from '../app/services';
import type { CheckpointStage, ProductionMode, ProposalType } from '../domain/proposal';
import { ModeFields } from './stages/ModeFields';
import type { BriefDraftContext } from '../domain/assistant';
import type { ExecutionMode, TaskField } from '../domain/models';
import { LIST_FIELDS, TASK_FIELDS } from '../domain/models';
import { useI18n } from '../i18n';
import { MappingBanner } from '../intake/MappingBanner';
import { IntakeSourcePanel } from '../intake/IntakeSourcePanel';
import { attachmentFrom, fromDraft, missingRequired, toBriefInput, type TaskCardState } from '../intake/taskCard';
import { originCounts, TaskCardEditor } from '../intake/TaskCardEditor';
import { emptyCard } from '../intake/emptyCard';
import { useIntakeRun } from '../intake/useIntakeRun';
import { Action, CommandFeedback, TextInput } from '../ui/kit';
import { useWorkBot, useWorkBotDraft } from '../workbot/context';

const STEPS = ['source', 'review', 'create'] as const;

/**
 * Start a project from a brief. The brief is read and mapped into a draft task card that the
 * person checks and corrects. Creating the project saves that draft unconfirmed: it does not
 * confirm the brief, start research or spend anything.
 */
export function NewProjectView() {
  const { t, list } = useI18n();
  const service = useService();
  const assistant = useAssistant();
  const { navigate } = useRouter();
  const command = useCommand();
  const { state: run, run: start, cancel } = useIntakeRun();
  const { ask } = useWorkBot();
  const catalog = useServiceQuery('projects::all', (s) => s.listProjects({ status: 'all' }));
  const [card, setCard] = useState<TaskCardState | null>(null);
  const [manual, setManual] = useState(false);
  const [focus, setFocus] = useState<{ f: TaskField; n: number } | null>(null);
  const [settings, setSettings] = useState({ client: '', researchOwner: '', strategyOwner: '' });
  const [ptype, setPtype] = useState<ProposalType>('kv');
  const [pmode, setPmode] = useState<ProductionMode>('assisted');
  const [checkpoints, setCheckpoints] = useState<CheckpointStage[]>(['strategy', 'themes', 'visual', 'delivery']);
  const { proposals } = useServiceContext();
  const [nameError, setNameError] = useState<string | null>(null);

  const done = run.status === 'done' ? run : null;
  const reviewing = Boolean(card);

  // Adopt each new mapping as the card to review, and start a fresh draft conversation.
  const [adopted, setAdopted] = useState<string | null>(null);
  if (done && adopted !== done.doc.id) {
    setAdopted(done.doc.id);
    setCard(fromDraft(done.mapping.fields));
    setSettings((s) => ({ ...s, client: s.client || (Array.isArray(done.mapping.fields.brand.value) ? '' : done.mapping.fields.brand.value.split(/ [—–-] /)[0].slice(0, 60)) }));
    void assistant.newConversation({ kind: 'draft' });
  }

  const [createdId, setCreatedId] = useState<string | null>(null);
  useNavigationBlocker(reviewing && !createdId, t('new.unsaved'));
  useEffect(() => {
    if (createdId) void navigate(projectPath(createdId, 'proposal', { stage: 'brief' }));
  }, [createdId, navigate]);

  const draftContext = useMemo<BriefDraftContext | null>(() => {
    if (!card) return null;
    const fields = Object.fromEntries(
      TASK_FIELDS.map((f) => [f, { value: LIST_FIELDS.has(f) ? card[f].text.split('\n').map((l) => l.trim()).filter(Boolean) : card[f].text.trim(), provenance: card[f].provenance }]),
    );
    return {
      projectId: null,
      fields: fields as unknown as BriefDraftContext['fields'],
      mapping: done?.mapping.mode ?? 'none',
      simulated: done?.mapping.simulated ?? false,
      fileName: done?.doc.fileName ?? null,
    };
  }, [card, done]);
  const focusField = useCallback((f: TaskField) => setFocus((p) => ({ f, n: (p?.n ?? 0) + 1 })), []);
  useWorkBotDraft(draftContext, focusField);

  const step = reviewing ? 1 : 0;
  const counts = card ? originCounts(card, TASK_FIELDS) : null;
  const required = card ? missingRequired(card) : [];

  const restart = () => {
    cancel();
    setCard(null);
    setManual(false);
    setAdopted(null);
    setNameError(null);
  };

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (!card || catalog.data === undefined) return;
    const name = card.projectName.text.trim();
    if (!name) {
      setNameError(t('create.nameRequired'));
      focusField('projectName');
      return;
    }
    setNameError(null);
    const brief = toBriefInput(card, done ? attachmentFrom(done.doc, done.mapping.mode) : null);
    const input = { name, proposalType: ptype, checkpoints, client: settings.client, summary: card.background.text.trim().split(/(?<=[.!?])\s/)[0]?.slice(0, 160) ?? '', mode: (pmode === 'automatic' ? 'supervised' : 'step_by_step') as ExecutionMode, researchOwner: settings.researchOwner, strategyOwner: settings.strategyOwner, brief };
    await command.run({
      label: t('new.create'),
      payload: { ...input, brief: { ...brief, attachment: brief.attachment ? { ...brief.attachment, file: null } : null } },
      expectedRevision: catalog.data.catalogRevision,
      execute: (meta) => service.createProject(input, meta),
      success: (r) => t('new.created', { name: r.data.name }),
      // The creative workspace is created next to the Workbench project; the brief stays an unconfirmed draft.
      onSuccess: (r) => service.environment.kind === 'live' ? setCreatedId(r.data.id) :
        void proposals
          .createProposal({ workbenchId: r.data.id, name: r.data.name, client: settings.client, type: ptype, mode: pmode, checkpoints })
          .finally(() => setCreatedId(r.data.id)),
    });
  };

  return (
    <div className="page page--new">
      <Link to="/" className="back-link">
        <ArrowLeft size={14} aria-hidden="true" /> {t('dash.all')}
      </Link>
      <header className="page-header">
        <div className="page-header__text">
          <p className="eyebrow">{t('new.eyebrow')}</p>
          <h1>{t('new.title')}</h1>
          <p className="muted">{t('new.lede')}</p>
        </div>
      </header>
      <ol className="flow-steps" aria-label={t('new.stepsLabel')}>
        {STEPS.map((s, i) => (
          <li key={s} data-state={i < step ? 'done' : i === step ? 'active' : 'todo'} aria-current={i === step ? 'step' : undefined}>
            <span className="flow-steps__n">{i + 1}</span>
            <span>{t(`new.step.${s}`)}</span>
          </li>
        ))}
      </ol>

      {!reviewing && (
        <>
          <IntakeSourcePanel state={run} onRun={(source) => void start(source)} onCancel={cancel} />
          {run.status !== 'working' && (
            <p className="small muted new-manual">
              {t('new.noBrief')}{' '}
              <button
                type="button"
                className="text-link"
                onClick={() => {
                  setManual(true);
                  setCard(emptyCard());
                }}
              >
                {t('new.startEmpty')}
              </button>
            </p>
          )}
        </>
      )}

      {card && counts && (
        <form className="stack new-review" onSubmit={create} noValidate>
          {done ? <MappingBanner mapping={done.mapping} doc={done.doc} /> : manual && <p className="banner" data-tone="neutral">{t('new.manualNote')}</p>}
          <div className="review-summary card">
            <dl className="review-summary__counts">
              <div data-tone="ok">
                <dt>{t('new.count.from')}</dt>
                <dd>{counts.from}</dd>
              </div>
              <div data-tone="info">
                <dt>{t('new.count.suggested')}</dt>
                <dd>{counts.suggested}</dd>
              </div>
              <div data-tone="warn">
                <dt>{t('new.count.unclear')}</dt>
                <dd>{counts.unclear}</dd>
              </div>
              <div data-tone="neutral">
                <dt>{t('new.count.missing')}</dt>
                <dd>{counts.missing}</dd>
              </div>
            </dl>
            <div className="review-summary__side">
              <p className="small">{required.length ? t('new.neededLater', { fields: list(required.map((f) => t(`taskField.${f}`))) }) : t('new.readyLater')}</p>
              <button type="button" className="btn btn--secondary" onClick={() => ask('brief', 'draft')}>
                <WorkBotCharacter height={22} /> {t('new.askWorkBot')}
              </button>
            </div>
          </div>

          <TaskCardEditor
            state={card}
            onChange={setCard}
            idPrefix="task-field"
            focus={focus}
            sources={done ? [{ id: done.doc.id, label: done.doc.fileName ?? t(`attach.kind.${done.doc.kind}`), text: done.doc.text }] : []}
          />
          {nameError && (
            <p className="field__error" role="alert">
              {nameError}
            </p>
          )}

          <section className="card stack" aria-labelledby="new-kind">
            <h2 id="new-kind" className="card__title">
              {t('new.kindTitle')}
            </h2>
            <fieldset className="pw-choice">
              <legend>{t('pw.setup.type')}</legend>
              {(['kv', 'packaging'] as const).map((k) => (
                <label key={k} className="pw-choice__opt">
                  <input type="radio" name="ptype" checked={ptype === k} onChange={() => setPtype(k)} />
                  {k === 'kv' ? <Megaphone size={18} aria-hidden="true" /> : <Package size={18} aria-hidden="true" />}
                  <span>
                    <strong>{t(`pw.type.${k}`)}</strong>
                    <span className="small muted">{t(`pw.type.${k}.desc`)}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <ModeFields mode={pmode} checkpoints={checkpoints} onMode={setPmode} onCheckpoints={setCheckpoints} />
          </section>

          <details className="card new-settings">
            <summary>{t('new.settings')}</summary>
            <div className="stack">
              <TextInput label={t('create.client')} value={settings.client} onChange={(e) => setSettings((s) => ({ ...s, client: e.target.value }))} optional />
              <div className="grid-2">
                <TextInput label={t('create.researchOwner')} value={settings.researchOwner} onChange={(e) => setSettings((s) => ({ ...s, researchOwner: e.target.value }))} optional hint={t('create.defaultsToYou')} />
                <TextInput label={t('create.strategyOwner')} value={settings.strategyOwner} onChange={(e) => setSettings((s) => ({ ...s, strategyOwner: e.target.value }))} optional hint={t('create.defaultsToYou')} />
              </div>
            </div>
          </details>

          <div className="create-bar card">
            <p className="small">
              <Info size={14} aria-hidden="true" /> {t('new.createNote')}
            </p>
            <div className="cluster">
              <button type="button" className="btn btn--ghost" onClick={restart}>
                <RotateCcw size={16} aria-hidden="true" /> {t('new.startOver')}
              </button>
              <Action label={t('new.create')} type="submit" variant="primary" icon={<FilePlus2 size={16} aria-hidden="true" />} pending={command.pending} disabled={catalog.data === undefined} />
            </div>
          </div>
          <CommandFeedback command={command} />
        </form>
      )}
    </div>
  );
}

