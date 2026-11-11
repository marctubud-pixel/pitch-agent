import { PermissionFields } from '../collaboration/TeamTools';
import { useTeam } from '../collaboration/context';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, CircleCheck, Lock, Save, TriangleAlert, Undo2 } from 'lucide-react';
import { useCommand, type Command } from '../app/commands';
import { useServiceQuery } from '../app/query';
import { Link, projectPath, useNavigationBlocker, useRouter } from '../app/router';
import { useService } from '../app/services';
import type { ProposalType } from '../domain/proposalType';
import type { BriefDraftContext } from '../domain/assistant';
import { LIST_FIELDS, TASK_FIELDS, type Brief, type BriefInput, type BriefHistory, type TaskField } from '../domain/models';
import { useI18n, useT } from '../i18n';
import { ChangeReview } from '../intake/ChangeReview';
import { IntakeSourcePanel } from '../intake/IntakeSourcePanel';
import { MappingBanner } from '../intake/MappingBanner';
import { attachmentFrom, diffCards, fromBrief, mergeForUpdate, missingRequired, pendingSuggestions, toBriefInput, unclear, type TaskCardState, preserveHiddenFields } from '../intake/taskCard';
import { TaskCardEditor, type SourceDoc } from '../intake/TaskCardEditor';
import { useIntakeRun } from '../intake/useIntakeRun';
import { Modal } from '../ui/Modal';
import { Action, CommandFeedback, PageHeader, QueryView, Skeleton, TextInput, Time } from '../ui/kit';
import { useWorkBot, useWorkBotDraft } from '../workbot/context';
import { WorkBotCharacter } from '../workbot/Character';

const PREFIX = 'brief-field';
const VERSION_QUERY_KEYS: readonly string[] = ['version', 'intake'];
const fingerprint = (card: TaskCardState) => JSON.stringify(TASK_FIELDS.map((f) => [card[f].text.trim(), card[f].provenance.origin]));

function sourcesOf(data: BriefHistory, t: ReturnType<typeof useT>): SourceDoc[] {
  return data.attachments.filter((a) => a.text).map((a) => ({ id: a.id, label: `${a.fileName ?? t(`attach.kind.${a.kind}`)} · ${t('common.version', { v: a.briefVersion })}`, text: a.text }));
}

type BriefViewProps = { projectId: string; settings?: ReactNode; supportingContent?: ReactNode; fallbackProposalType?: ProposalType };

export function BriefView({ projectId, settings, supportingContent, fallbackProposalType = 'kv' }: BriefViewProps) {
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
          if (updating && data.current) return <BriefUpdate data={data} fallbackProposalType={fallbackProposalType} />;
          return <BriefEditor data={data} settings={settings} supportingContent={supportingContent} fallbackProposalType={fallbackProposalType} />;
        }}
      </QueryView>
    </div>
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
        <Link className="text-link" to={projectPath(data.project.id, 'proposal', { stage: 'brief' })}>
          {t('brief.goCurrent')}
        </Link>
      </p>
      <TaskCardEditor multilineBrand presentation="compact" proposalType={{ kind: 'readonly', value: brief.proposalType }} state={card} onChange={() => {}} idPrefix={PREFIX} readOnly={[...TASK_FIELDS]} disabled sources={sourcesOf(data, t)} />
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

function BriefEditor({ data, settings, supportingContent, fallbackProposalType }: { data: BriefHistory; fallbackProposalType: ProposalType } & Pick<BriefViewProps, 'settings' | 'supportingContent'>) {
  const { can } = useTeam();
  const service = useService();
  const save = useCommand();
  const confirmCmd = useCommand();
  const { t, rich, list } = useI18n();
  const { ask } = useWorkBot();
  const current = data.current;
  const [base, setBase] = useState({ revision: data.project.revision, brief: current, proposalType: current?.proposalType ?? fallbackProposalType });
  const [proposalType, setProposalType] = useState(base.proposalType);
  const baseCard = useMemo(() => fromBrief(base.brief, data.project.name), [base.brief, data.project.name]);
  const [card, setCard] = useState<TaskCardState>(() => baseCard);
  const [reviewing, setReviewing] = useState(false);
  const [changeNote, setChangeNote] = useState('');
  const operationRef = useRef(false);
  const retryingRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const busy = submitting || save.pending || confirmCmd.pending;
  const { focus, request } = useFieldFocus();
  const dirty = fingerprint(card) !== fingerprint(baseCard) || proposalType !== base.proposalType;
  const draftRef = useRef({ card, proposalType });
  draftRef.current = { card, proposalType };

  useEffect(() => {
    if (retryingRef.current && !save.pending && !confirmCmd.pending) {
      retryingRef.current = false;
      operationRef.current = false;
      setSubmitting(false);
    }
  }, [save.state, confirmCmd.state]);

  const retry = (command: Command) => {
    if (operationRef.current || save.pending || confirmCmd.pending) return;
    operationRef.current = true;
    retryingRef.current = true;
    setSubmitting(true);
    command.retry();
  };
  const saveFeedback = { ...save, retry: () => retry(save) };
  const confirmFeedback = { ...confirmCmd, retry: () => retry(confirmCmd) };

  useNavigationBlocker(dirty, t('brief.unsaved'), VERSION_QUERY_KEYS);
  // A conflict is explained in its own dialog; get the review out of the way so the edits can be kept.
  useEffect(() => {
    if (save.state.status === 'conflict') setReviewing(false);
  }, [save.state.status]);

  useEffect(() => {
    if (!dirty && !busy && data.project.revision > base.revision) {
      setBase({ revision: data.project.revision, brief: data.current, proposalType: data.current?.proposalType ?? fallbackProposalType });
      setProposalType(data.current?.proposalType ?? fallbackProposalType);
      setCard(fromBrief(data.current, data.project.name));
    }
  }, [data, busy, dirty, base.revision, fallbackProposalType]);

  const confirmed = Boolean(base.brief?.confirmedAt);
  const nextVersion = (base.brief?.version ?? 0) + 1;
  const newerAvailable = dirty && data.project.revision > base.revision;
  const changes = useMemo(() => {
    const result = diffCards(baseCard, card);
    if (proposalType !== base.proposalType) result.push({ field: 'proposalType', before: t(`pw.type.${base.proposalType}`), after: t(`pw.type.${proposalType}`) });
    return result;
  }, [baseCard, card, proposalType, base.proposalType, t]);
  const required = missingRequired(card);
  const suggestions = pendingSuggestions(card);

  const saveDraft = async () => {
    const submitted = { card, proposalType };
    const fields = toBriefInput(submitted.card, null, changeNote);
    const input = { ...(base.brief ? preserveHiddenFields(fields, base.brief) : fields), proposalType: submitted.proposalType, editScope: 'task_card' } satisfies BriefInput;
    return save.run({
      label: confirmed ? t('brief.saveAsLabel', { v: nextVersion }) : t('brief.saveDraftLabel'),
      payload: input,
      expectedRevision: base.revision,
      execute: (meta) => service.saveBrief(data.project.id, input, meta),
      success: (r) => (r.data.version > (base.brief?.version ?? 0) ? t('brief.savedVersion', { v: r.data.version }) : t('brief.draftSaved')),
      onSuccess: (r) => {
        setBase({ revision: r.revision, brief: r.data, proposalType: r.data.proposalType ?? submitted.proposalType });
        if (fingerprint(draftRef.current.card) === fingerprint(submitted.card) && draftRef.current.proposalType === submitted.proposalType) {
          setProposalType(r.data.proposalType ?? submitted.proposalType);
          setCard(fromBrief(r.data, data.project.name));
          setChangeNote('');
        }
        setReviewing(false);
      },
    });
  };

  const withGuard = async (operation: () => Promise<unknown>) => {
    if (operationRef.current || save.pending || confirmCmd.pending) return;
    operationRef.current = true;
    setSubmitting(true);
    try {
      await operation();
    } finally {
      operationRef.current = false;
      setSubmitting(false);
    }
  };

  const commit = () => withGuard(saveDraft);
  const confirmBrief = () => withGuard(async () => {
    if (!can({ kind: 'workflow' }) || confirmed || required.length || suggestions.length) return;
    const saved = dirty ? await saveDraft() : null;
    if (dirty && !saved) return;
    const target = saved ? { revision: saved.revision, brief: saved.data } : base;
    if (!target.brief || target.brief.confirmedAt) return;
    await confirmCmd.run({
      label: t('wf.confirmBrief'),
      payload: { version: target.brief.version },
      expectedRevision: target.revision,
      execute: (meta) => service.confirmBrief(data.project.id, meta),
      success: t('wf.confirmBrief.done'),
      onSuccess: (r) => setBase({ revision: r.revision, brief: r.data, proposalType: r.data.proposalType ?? proposalType }),
    });
  });

  const operatorDraft = !can({ kind: 'workflow' }) && can({ kind: 'edit_brief' });
  const confirmReason = required.length
    ? t('brief.addBefore', { fields: list(required.map((f) => t(`taskField.${f}`))) })
    : suggestions.length
      ? t('brief.acceptFirst', { fields: list(suggestions.map((f) => t(`taskField.${f}`))) })
      : null;
  const actionReason = confirmed
    ? !dirty ? '请先在下方修改简报内容。' : null
    : operatorDraft ? !dirty ? '没有待保存的更改。' : null : confirmReason;

  return (
    <>
      <PageHeader
        eyebrow={`第${base.brief?.version ?? 1}版${dirty ? ' · 有未保存更改' : ''}`}
        title="任务卡"
        actions={
          <>
            <Action
              permission={{ kind: confirmed || operatorDraft ? 'edit_brief' : 'workflow' }}
              label={confirmed ? '更新简报' : operatorDraft ? t('brief.saveDraft') : '确认简报'}
              variant="primary"
              icon={confirmed || operatorDraft ? <Save size={16} aria-hidden="true" /> : <CircleCheck size={16} aria-hidden="true" />}
              pending={busy}
              disabled={Boolean(actionReason)}
              reason={actionReason}
              onClick={() => confirmed ? setReviewing(true) : operatorDraft ? void commit() : void confirmBrief()}
            />
            <Link className="btn btn--secondary brief-next-stage" to={projectPath(data.project.id, 'proposal', { stage: 'research' })}>
              进入下一阶段 <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </>
        }
      >
        <div className="cluster brief-current-meta">
          <span className="small muted">
            {confirmed && base.brief?.confirmedAt ? rich('brief.confirmedBy', { by: base.brief.confirmedBy ?? '', time: <Time iso={base.brief.confirmedAt} /> }) : t('brief.waiting')}
          </span>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => ask('brief')}>
            <WorkBotCharacter height={20} /> {t('brief.askWorkBot')}
          </button>
        </div>
      </PageHeader>
      <CommandFeedback command={confirmFeedback} />
      <CommandFeedback command={saveFeedback} />
      {settings}

      {newerAvailable && (
        <div className="banner banner--row" data-tone="warn" role="status">
          <TriangleAlert size={16} aria-hidden="true" />
          <div className="stack-sm">
            <p>{t('brief.newer', { from: base.revision, to: data.project.revision })}</p>
            <div>
              <button type="button" className="btn btn--secondary btn--sm" disabled={busy} onClick={() => {
                if (data.project.revision > base.revision) setBase({ revision: data.project.revision, brief: data.current, proposalType: data.current?.proposalType ?? fallbackProposalType });
              }}>
                {t('brief.keepEdits')}
              </button>
            </div>
          </div>
        </div>
      )}
      {!confirmed && <DecisionStrip card={card} onFocus={request} />}

      <TaskCardEditor multilineBrand presentation="compact" proposalType={{ kind: 'editable', value: proposalType, onChange: setProposalType }} disabled={busy || !can({ kind: 'edit_brief' })} state={card} onChange={setCard} idPrefix={PREFIX} readOnly={['projectName']} focus={focus} sources={sourcesOf(data, t)} moreContent={<div className="brief-supporting">
        {supportingContent}
      </div>} />

      {dirty && <div className="save-bar card" data-dirty>
        <p className="small">{confirmed ? t('brief.willCreate', { next: nextVersion, v: base.brief?.version ?? 1 }) : t('brief.unsavedShort', { count: Math.max(changes.length, 1) })}</p>
        <div className="cluster">
            <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => { setCard(baseCard); setProposalType(base.proposalType); }}>
              <Undo2 size={16} aria-hidden="true" /> {t('brief.discard')}
            </button>
        </div>
      </div>}
      <Modal
        open={reviewing}
        onClose={() => { if (!busy) setReviewing(false); }}
        title={t('change.title')}
        size="lg"
        footer={
          <>
            <button type="button" className="btn btn--secondary" disabled={busy} onClick={() => setReviewing(false)}>
              {t('common.cancel')}
            </button>
            <Action permission={{ kind: 'edit_brief' }} label={t('change.apply', { v: nextVersion })} variant="primary" pending={busy} onClick={() => void commit()} />
          </>
        }
      >
        <ChangeReview changes={changes} confirmed={confirmed} currentVersion={base.brief?.version ?? 1} dependents={data.dependentArtifacts} sourceLabel={null} />
        <TextInput label={t('brief.changeNote')} disabled={busy} value={changeNote} onChange={(e) => setChangeNote(e.target.value)} placeholder="说明本次调整，例如客户沟通后的要求变化" />
        <CommandFeedback command={saveFeedback} />
      </Modal>
    </>
  );
}

/**
 * Updating an existing brief from new material. The new reading is merged over the current
 * brief (fields the material does not mention keep their values) and nothing is applied until
 * the person has seen the changes and confirmed them.
 */
function BriefUpdate({ data, fallbackProposalType }: { data: BriefHistory; fallbackProposalType: ProposalType }) {
  const { can } = useTeam();
  const { t } = useI18n();
  const service = useService();
  const save = useCommand();
  const { setParams } = useRouter();
  const { ask } = useWorkBot();
  const { state: run, run: start, cancel } = useIntakeRun();
  const [base] = useState({ brief: data.current!, revision: data.project.revision, proposalType: data.current?.proposalType ?? fallbackProposalType });
  const current = base.brief;
  const [proposalType, setProposalType] = useState(base.proposalType);
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
  const changes = useMemo(() => {
    const result = card ? diffCards(currentCard, card) : [];
    if (proposalType !== base.proposalType) result.push({ field: 'proposalType', before: t(`pw.type.${base.proposalType}`), after: t(`pw.type.${proposalType}`) });
    return result;
  }, [card, currentCard, proposalType, base.proposalType, t]);
  useEffect(() => { if (save.state.status === 'conflict') setApplying(false); }, [save.state.status]);
  useNavigationBlocker(Boolean(card) && save.state.status !== 'success', t('brief.unsaved'), VERSION_QUERY_KEYS);

  const draft = useMemo(
    () => (card && done ? draftContextOf(card, data.project.id, { mapping: done.mapping.mode, simulated: done.mapping.simulated, fileName: done.doc.fileName }) : null),
    [card, done, data.project.id],
  );
  useWorkBotDraft(draft, request);

  const leave = () => setParams({ intake: null });
  const nextVersion = confirmed ? current.version + 1 : current.version;

  const apply = async () => {
    if (!card || !done) return;
    const input = { ...preserveHiddenFields(toBriefInput(card, attachmentFrom(done.doc, done.mapping.mode), changeNote), base.brief), proposalType, editScope: 'task_card' } satisfies BriefInput;
    await save.run({
      label: t('change.apply', { v: nextVersion }),
      payload: { ...input, attachment: input.attachment ? { ...input.attachment, file: null } : null },
      expectedRevision: base.revision,
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
      {data.project.revision !== base.revision && <p className="banner" role="status">任务卡已有新版本。当前更新草稿已保留；请取消更新后，基于新版重新导入。</p>}
      <CommandFeedback command={save} />
      {!card ? (
        <PermissionFields action={{ kind: 'edit_brief' }}><IntakeSourcePanel state={run} onRun={(s) => void start(s)} onCancel={cancel} /></PermissionFields>
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
            <TaskCardEditor multilineBrand presentation="compact" proposalType={{ kind: 'editable', value: proposalType, onChange: setProposalType }} disabled={!can({ kind: 'edit_brief' })} state={card} onChange={setCard} idPrefix={PREFIX} readOnly={['projectName']} focus={focus} sources={[{ id: done.doc.id, label: done.doc.fileName ?? t(`attach.kind.${done.doc.kind}`), text: done.doc.text }]} />
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
                <Action permission={{ kind: 'edit_brief' }} label={t('update.review')} variant="primary" disabled={changes.length === 0} reason={t('update.noChanges')} onClick={() => setApplying(true)} />
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
            <Action permission={{ kind: 'edit_brief' }} label={confirmed ? t('change.apply', { v: nextVersion }) : t('change.applyDraft', { v: nextVersion })} variant="primary" pending={save.pending} onClick={() => void apply()} />
          </>
        }
      >
        <ChangeReview changes={changes} confirmed={confirmed} currentVersion={current.version} dependents={data.dependentArtifacts} sourceLabel={done?.doc.fileName ?? null} />
        <TextInput label={t('brief.changeNote')} value={changeNote} onChange={(e) => setChangeNote(e.target.value)} placeholder="说明本次调整，例如客户沟通后的要求变化" />
        <CommandFeedback command={save} />
      </Modal>
    </>
  );
}
