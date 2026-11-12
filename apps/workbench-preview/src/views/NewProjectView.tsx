import { useTeam } from '../collaboration/context';
import { BrandResourceUploadCard } from '../proposal/BrandResources';
import { sameBrandResources, validateBrandUploads, type BrandResourceUpload } from '../domain/brandResources';
import { PermissionFields } from '../collaboration/TeamTools';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, FilePlus2, Info, RotateCcw, TriangleAlert } from 'lucide-react';
import { WorkBotCharacter } from '../workbot/Character';
import { useCommand } from '../app/commands';
import { useServiceQuery } from '../app/query';
import { Link, projectPath, useNavigationBlocker, useRouter } from '../app/router';
import { useAssistant, useService, useServiceContext } from '../app/services';
import type { CheckpointStage, CreateProposalInput, ProductionMode, Proposal, ProposalType, BrandResourceUploadPolicy } from '../domain/proposal';
import { isPresentationLocalTime } from '../domain/presentationTime';
import { ServiceError, toServiceError } from '../domain/service';
import { ModeFields } from './stages/ModeFields';
import type { BriefDraftContext } from '../domain/assistant';
import type { ExecutionMode, MutationResult, Project, TaskField } from '../domain/models';
import { LIST_FIELDS, TASK_FIELDS } from '../domain/models';
import { useI18n } from '../i18n';
import { MappingBanner } from '../intake/MappingBanner';
import { IntakeSourcePanel } from '../intake/IntakeSourcePanel';
import { attachmentFrom, fromDraft, toBriefInput, type TaskCardState } from '../intake/taskCard';
import { TaskCardEditor } from '../intake/TaskCardEditor';
import { emptyCard } from '../intake/emptyCard';
import { useIntakeRun } from '../intake/useIntakeRun';
import { Action, CommandFeedback, TextInput } from '../ui/kit';
import { useWorkBot, useWorkBotDraft } from '../workbot/context';

const STEPS = ['source', 'review'] as const;

interface SavedCreation {
  receipt: MutationResult<Project>;
  proposal: CreateProposalInput;
  brandUploads: BrandResourceUpload[];
}

type CreationProgress = { kind: 'draft' } | { kind: 'awaiting-receipt' } | { kind: 'saved' };

function matchesCreation(proposal: Proposal, input: CreateProposalInput) {
  return proposal.workbenchId === input.workbenchId && proposal.name === input.name
    && proposal.client === input.client && proposal.type === input.type && proposal.mode === input.mode
    && proposal.presentationLocalTime === input.presentationLocalTime
    && sameBrandResources(proposal.brandResources, input.brandResources)
    && proposal.checkpoints.length === input.checkpoints.length
    && proposal.checkpoints.every((stage, index) => stage === input.checkpoints[index]);
}

/**
 * Start a project from a brief. The brief is read and mapped into a draft task card that the
 * person checks and corrects. Creating the project saves that draft unconfirmed: it does not
 * confirm the brief, start research or spend anything.
 */
export function NewProjectView() {
  const { t } = useI18n();
  const { can } = useTeam();
  const [brandUploads, setBrandUploads] = useState<BrandResourceUpload[]>([]);
  const service = useService();
  const assistant = useAssistant();
  const { navigate } = useRouter();
  const command = useCommand();
  const { state: run, run: start, cancel } = useIntakeRun();
  const { ask } = useWorkBot();
  const catalog = useServiceQuery('projects::all', (s) => s.listProjects({ status: 'all' }));
  const [card, setCard] = useState<TaskCardState | null>(null);
  const [focus, setFocus] = useState<{ f: TaskField; n: number } | null>(null);
  const [settings, setSettings] = useState({ client: '', researchOwner: '', strategyOwner: '' });
  const [ptype, setPtype] = useState<ProposalType>('kv');
  const [pmode, setPmode] = useState<ProductionMode>('assisted');
  const [checkpoints, setCheckpoints] = useState<CheckpointStage[]>(['strategy', 'themes', 'visual', 'delivery']);
  const { proposals } = useServiceContext();
  const [brandPolicy, setBrandPolicy] = useState<BrandResourceUploadPolicy | undefined>(() => proposals.getBrandResourceUploadPolicy ? {available: false, reason: '正在核对资料存储能力…'} : undefined);
  useEffect(() => {
    let active = true;
    if (proposals.getBrandResourceUploadPolicy) void proposals.getBrandResourceUploadPolicy().then(policy => {if (active) setBrandPolicy(policy);}).catch(() => {if (active) setBrandPolicy({available: false, reason: '无法核对资料存储能力，请重试。'});});
    else setBrandPolicy(undefined);
    return () => {active = false;};
  }, [proposals]);
  const [nameError, setNameError] = useState<string | null>(null);
  const [presentationLocalTime, setPresentationLocalTime] = useState('');
  const [timeError, setTimeError] = useState<string | null>(null);
  const timeInput = useRef<HTMLInputElement>(null);
  const savedCreationRef = useRef<SavedCreation | null>(null);
  const [creationProgress, setCreationProgress] = useState<CreationProgress>({ kind: 'draft' });
  const editsLocked = command.pending || creationProgress.kind !== 'draft';

  const done = run.status === 'done' ? run : null;
  const reviewing = Boolean(card);

  // Adopt each new mapping as the card to review, and start a fresh draft conversation.
  const [adopted, setAdopted] = useState<string | null>(null);
  if (done && adopted !== done.doc.id) {
    setAdopted(done.doc.id);
    setCard(previous => ({...fromDraft(done.mapping.fields), visualRequirements: previous?.visualRequirements}));
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

  const restart = () => {
    if (editsLocked) return;
    cancel();
    setCard(null);
    setAdopted(null);
    setNameError(null);
    setPresentationLocalTime('');
    setTimeError(null);
    setBrandUploads([]);
    command.reset();
  };

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (!can({ kind: 'manage' }) || !card || command.pending) return;
    if (creationProgress.kind !== 'draft') {
      command.retry();
      return;
    }
    if (catalog.data === undefined) return;
    const name = card.projectName.text.trim();
    if (!name) {
      setNameError(t('create.nameRequired'));
      focusField('projectName');
      return;
    }
    setNameError(null);
    if (!savedCreationRef.current && (timeInput.current?.validity.badInput || timeInput.current?.validity.valid === false
      || (presentationLocalTime !== '' && !isPresentationLocalTime(presentationLocalTime)))) {
      setTimeError(t('new.presentationTimeInvalid'));
      timeInput.current?.focus();
      return;
    }
    setTimeError(null);
    const brief = { ...toBriefInput(card, done ? attachmentFrom(done.doc, done.mapping.mode) : null), proposalType: ptype };
    const input = { name, client: settings.client, summary: card.background.text.trim().split(/(?<=[.!?])\s/)[0]?.slice(0, 160) ?? '', mode: (pmode === 'automatic' ? 'supervised' : 'step_by_step') as ExecutionMode, researchOwner: settings.researchOwner, strategyOwner: settings.strategyOwner, brief, checkpoints: pmode === 'assisted' ? [...checkpoints] : [], ...(presentationLocalTime ? { presentationLocalTime } : {}) };
    const frozenUploads = brandUploads.map((upload) => ({ file: upload.file, resource: { ...upload.resource } }));
    const proposalInput = {
      name, client: settings.client || '客户尚未填写', type: ptype, mode: pmode,
      checkpoints: pmode === 'assisted' ? [...checkpoints] : [],
      ...(presentationLocalTime ? { presentationLocalTime } : {}),
      ...(frozenUploads.length ? { brandResources: frozenUploads.map((upload) => upload.resource) } : {}),
    } satisfies Omit<CreateProposalInput, 'workbenchId'>;
    await command.run({
      label: t('new.create'),
      payload: { ...input, brief: { ...brief, attachment: brief.attachment ? { ...brief.attachment, file: null } : null }, proposal: proposalInput },
      expectedRevision: catalog.data?.catalogRevision ?? 0,
      execute: async (meta) => {
        let saved = savedCreationRef.current;
        if (!saved) {
          validateBrandUploads(frozenUploads);
          if (frozenUploads.length) await proposals.ensureBrandResourceStorage(frozenUploads);
          let receipt: MutationResult<Project>;
          try {
            receipt = await service.createProject(input, meta);
          } catch (error) {
            if (toServiceError(error).outcomeUnknown) setCreationProgress({ kind: 'awaiting-receipt' });
            throw error;
          }
          saved = { receipt, proposal: { ...proposalInput, workbenchId: receipt.data.id, name: receipt.data.name }, brandUploads: frozenUploads };
          savedCreationRef.current = saved;
          setCreationProgress({ kind: 'saved' });
        }
        if (saved.brandUploads.length) await proposals.stageBrandResources({ workbenchId: saved.receipt.data.id, resources: saved.brandUploads });
        let proposal = await proposals.findByWorkbenchId(saved.receipt.data.id);
        if (!proposal) {
          try {
            proposal = await proposals.createProposal(saved.proposal);
          } catch (error) {
            proposal = await proposals.findByWorkbenchId(saved.receipt.data.id);
            if (!proposal) throw error;
          }
        }
        if (!matchesCreation(proposal, saved.proposal)) {
          throw new ServiceError('conflict', t('new.creationConflict'));
        }
        return saved.receipt;
      },
      success: (r) => t('new.created', { name: r.data.name }),
      // The creative workspace is created next to the Workbench project; the brief stays an unconfirmed draft.
      onSuccess: (r) => setCreatedId(r.data.id),
    });
  };

  return (
    <div className="page page--new">
      <Link to="/" className="back-link">
        <ArrowLeft size={14} aria-hidden="true" /> {t('dash.all')}
      </Link>
      <header className="page-header">
        <div className="page-header__text">
          <h1>{t('new.title')}</h1>
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
                  setCard(emptyCard());
                }}
              >
                {t('new.startEmpty')}
              </button>
            </p>
          )}
        </>
      )}

      {card && (
        <PermissionFields action={{ kind: 'manage' }}><form className="stack new-review" onSubmit={create} noValidate>
          <section className="card new-review-intro">
            <div className="new-review-intro__text">
              {done && (
                <>
                  <details className="new-import-detail">
                    <summary>
                      <span>{done.doc.fileName ?? t(`attach.kind.${done.doc.kind}`)}</span>
                      <span className="small" data-simulated={done.mapping.simulated || undefined}>{t(`mapping.title.${done.mapping.mode}`)}</span>
                      <span className="small muted">{t('new.importDetails')}</span>
                    </summary>
                    <MappingBanner mapping={done.mapping} doc={done.doc} />
                  </details>
                  {done.doc.extraction.warnings.includes('little_text') && <p className="small new-import-warning" role="status"><TriangleAlert size={14} aria-hidden="true" /> {t('mapping.littleText')}</p>}
                </>
              )}
              <button type="button" className="btn btn--secondary btn--sm" disabled={editsLocked} onClick={() => ask('brief', 'draft')}>
                <WorkBotCharacter height={22} /> {t('new.askWorkBot')}
              </button>
            </div>
            <div className="new-presentation-time">
              <div className="field">
                <label htmlFor="new-presentation-time" className="field__label">
                  {t('new.presentationTime')}
                </label>
                <input
                  ref={timeInput}
                  id="new-presentation-time"
                  type="datetime-local"
                  step="60"
                  value={presentationLocalTime}
                  disabled={editsLocked}
                  onChange={(e) => { setPresentationLocalTime(e.target.value); setTimeError(null); }}
                  aria-invalid={timeError ? true : undefined}
                  aria-describedby={timeError ? 'new-presentation-time-error' : undefined}
                />
                {timeError && <p id="new-presentation-time-error" className="field__error" role="alert">{timeError}</p>}
              </div>
            </div>
          </section>

          <TaskCardEditor
            proposalType={{ kind: 'editable', value: ptype, onChange: setPtype }}
            presentation="compact"
            state={card}
            onChange={setCard}
            idPrefix="task-field"
            focus={focus}
            disabled={editsLocked}
            sources={done ? [{ id: done.doc.id, label: done.doc.fileName ?? t(`attach.kind.${done.doc.kind}`), text: done.doc.text }] : []}
          />
          {nameError && (
            <p className="field__error" role="alert">
              {nameError}
            </p>
          )}

          <BrandResourceUploadCard policy={brandPolicy} uploads={brandUploads} disabled={editsLocked} onChange={(next) => {
            if (!editsLocked && can({ kind: 'manage' })) { setBrandUploads(next); command.reset(); }
          }} />

          <section className="card stack new-production" aria-labelledby="new-kind">
            <h2 id="new-kind" className="card__title">
              {t('new.kindTitle')}
            </h2>
            <ModeFields mode={pmode} checkpoints={checkpoints} onMode={setPmode} onCheckpoints={setCheckpoints} disabled={editsLocked} />
          </section>

          <details className="card new-settings">
            <summary>{t('new.settings')}</summary>
            <div className="stack">
              <TextInput label={t('create.client')} value={settings.client} onChange={(e) => setSettings((s) => ({ ...s, client: e.target.value }))} disabled={editsLocked} />
              <div className="grid-2">
                <TextInput label={t('create.researchOwner')} value={settings.researchOwner} onChange={(e) => setSettings((s) => ({ ...s, researchOwner: e.target.value }))} disabled={editsLocked} />
                <TextInput label={t('create.strategyOwner')} value={settings.strategyOwner} onChange={(e) => setSettings((s) => ({ ...s, strategyOwner: e.target.value }))} disabled={editsLocked} />
              </div>
            </div>
          </details>

          <div className="create-bar card">
            <p className="small">
              <Info size={14} aria-hidden="true" /> {t('new.createNote')}
            </p>
            <div className="cluster">
              <button type="button" className="btn btn--ghost" disabled={editsLocked} onClick={restart}>
                <RotateCcw size={16} aria-hidden="true" /> {t('new.startOver')}
              </button>
              <Action permission={{ kind: 'manage' }} label={t(creationProgress.kind === 'draft' ? 'new.create' : 'new.finishCreate')} type="submit" variant="primary" icon={<FilePlus2 size={16} aria-hidden="true" />} pending={command.pending} disabled={creationProgress.kind === 'draft' && catalog.data === undefined} />
            </div>
          </div>
          {creationProgress.kind !== 'draft' && <p className="banner" data-tone="warn" role="status">{t(creationProgress.kind === 'awaiting-receipt' ? 'new.awaitingReceipt' : 'new.partialCreation')}</p>}
          <CommandFeedback command={command} />
        </form></PermissionFields>
      )}
    </div>
  );
}

