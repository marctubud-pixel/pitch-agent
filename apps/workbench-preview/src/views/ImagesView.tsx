import { useTeam } from '../collaboration/context';
import { PermissionFields } from '../collaboration/TeamTools';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { ArrowRight, Eye, ImagePlus, Play, Upload } from 'lucide-react';
import { useCommand } from '../app/commands';
import { useServiceQuery } from '../app/query';
import { Link, projectPath, useRouter } from '../app/router';
import { useService } from '../app/services';
import type { ImageLibrary, ImageRecord } from '../domain/models';
import { useI18n, useT } from '../i18n';
import { Inspector, restoreFocus } from '../ui/Inspector';
import { prepareImage } from '../ui/image';
import { Action, CommandFeedback, PageHeader, QueryView, SimTag, Skeleton, StatePanel, TextArea, TextInput, Time } from '../ui/kit';
import { StatusBadge } from '../ui/status';

export function ImagesView({ projectId }: { projectId: string }) {
  const query = useServiceQuery(`images:${projectId}`, (s) => s.listImages(projectId), { projectId });
  const capabilities = useServiceQuery('capabilities', (s) => s.getCapabilities());
  return (
    <QueryView query={query} skeleton={<div className="page"><Skeleton lines={3} blocks={2} /></div>}>
      {(data) => <Images data={data} observationNote={capabilities.data?.image_observation.reason} />}
    </QueryView>
  );
}

function Images({ data, observationNote }: { data: ImageLibrary; observationNote?: string }) {
  const { can } = useTeam();
  const { params, setParams } = useRouter();
  const selectedId = params.get('image');
  const selected = data.items.find((i) => i.image.id === selectedId) ?? null;
  const t = useT();

  const close = () => {
    const id = selectedId;
    setParams({ image: null });
    if (id) restoreFocus(`[data-image-trigger="${id}"]`);
  };

  return (
    <div className={`with-inspector${selected ? ' is-open' : ''}`}>
      <div className="with-inspector__main page">
        <PageHeader eyebrow={t('src.eyebrow')} title={t('img.title')}>
          <p className="lede">{t('img.lede')}</p>
        </PageHeader>
        {observationNote && (
          <p className="banner" data-tone="info">
            <SimTag>{t('img.simulated')}</SimTag> {observationNote}
          </p>
        )}
        {can({ kind: 'edit_visual' }) && <UploadPanel data={data} onUploaded={(id) => setParams({ image: id })} />}
        {data.items.length === 0 ? (
          <StatePanel kind="empty" title={t('img.none')}>
            <p>{t('img.noneBody')}</p>
          </StatePanel>
        ) : (
          <ul className="image-grid" aria-label={t('nav.images')}>
            {data.items.map((record) => (
              <ImageCard key={record.image.id} record={record} active={record.image.id === selectedId} onOpen={() => setParams({ image: record.image.id })} />
            ))}
          </ul>
        )}
      </div>
      {selected && (
        <Inspector title={selected.image.name} eyebrow={t('img.inspector')} onClose={close}>
          <ImageDetail key={selected.image.id} record={selected} data={data} />
        </Inspector>
      )}
    </div>
  );
}

function ImageCard({ record, active, onOpen }: { record: ImageRecord; active: boolean; onOpen: () => void }) {
  const { image, observation } = record;
  const { t, rich } = useI18n();
  return (
    <li className="image-card" data-active={active}>
      <img src={image.previewUrl} alt={image.isPlaceholder ? t('img.altPlaceholder', { name: image.name }) : image.name} loading="lazy" />
      <div className="image-card__body">
        <h2 className="image-card__title">{image.name}</h2>
        <p className="small muted">
          {rich('img.uploaded', { time: <Time iso={image.uploadedAt} relative /> })}
          {image.isPlaceholder && ` · ${t('img.placeholder')}`}
        </p>
        <div className="cluster cluster--tight">
          <StatusBadge kind="observation" value={image.observationStatus} size="sm" />
          {observation && <StatusBadge kind="observationReview" value={observation.reviewStatus} size="sm" />}
        </div>
        {image.sourceNote && <p className="small clamp-2">{image.sourceNote}</p>}
        <button type="button" className="btn btn--secondary btn--sm" data-image-trigger={image.id} onClick={onOpen} aria-pressed={active}>
          <Eye size={14} aria-hidden="true" /> {t('img.inspect')}
        </button>
      </div>
    </li>
  );
}

function UploadPanel({ data, onUploaded }: { data: ImageLibrary; onUploaded: (id: string) => void }) {
  const service = useService();
  const command = useCommand();
  const t = useT();
  const inputId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const clear = () => {
    setFile(null);
    setPreview(null);
    setName('');
    setNote('');
    setError(null);
    command.reset();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file) return;
    setPreparing(true);
    setError(null);
    try {
      const prepared = await prepareImage(file, { unreadable: t('img.err.unreadable'), notImage: t('img.err.type'), cannotProcess: t('img.err.process') });
      const input = { name: name.trim() || file.name, sourceNote: note, ...prepared };
      await command.run({
        label: t('img.upload'),
        payload: { name: input.name, sourceNote: note, size: file.size, lastModified: file.lastModified, fileName: file.name },
        expectedRevision: data.project.revision,
        execute: (meta) => service.uploadImage(data.project.id, input, meta),
        success: t('img.uploaded.done'),
        onSuccess: (r) => {
          clear();
          onUploaded(r.data.id);
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('img.err.prepare'));
    } finally {
      setPreparing(false);
    }
  };

  return (
    <PermissionFields action={{ kind: 'edit_visual' }}><form className="upload card" onSubmit={submit} aria-label={t('img.uploadLabel')}>
      {!file ? (
        <label htmlFor={inputId} className="dropzone">
          <ImagePlus size={24} aria-hidden="true" />
          <span>
            <strong>{t('img.choose')}</strong>
            <span className="small muted">{t('img.chooseHint')}</span>
          </span>
        </label>
      ) : (
        <div className="upload__preview">
          {preview && <img src={preview} alt={t('img.previewAlt', { name: file.name })} />}
          <div className="stack-sm">
            <p className="small muted">
              {t('img.preview', { name: file.name, kb: Math.round(file.size / 1024) })}
            </p>
            <TextInput label={t('img.name')} value={name} placeholder={file.name} onChange={(e) => setName(e.target.value)} optional />
            <TextArea label={t('img.sourceNote')} value={note} onChange={(e) => setNote(e.target.value)} rows={2} hint={t('img.sourceNoteHint')} optional />
            <div className="cluster">
              <Action permission={{ kind: 'edit_visual' }} label={t('img.upload')} type="submit" variant="primary" icon={<Upload size={16} aria-hidden="true" />} pending={preparing || command.pending} />
              <button type="button" className="btn btn--ghost" onClick={clear}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
      <input
        id={inputId}
        className="sr-only"
        type="file"
        accept="image/*"
        onChange={(e) => {
          const chosen = e.target.files?.[0] ?? null;
          setError(null);
          if (chosen && !chosen.type.startsWith('image/')) {
            setError(t('img.err.type'));
            return;
          }
          setFile(chosen);
          e.target.value = '';
        }}
      />
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
      <CommandFeedback command={command} />
    </form></PermissionFields>
  );
}

function ImageDetail({ record, data }: { record: ImageRecord; data: ImageLibrary }) {
  const service = useService();
  const request = useCommand();
  const review = useCommand();
  const { t, rich } = useI18n();
  const { image, observation, latestJob } = record;
  const [note, setNote] = useState(observation?.reviewNote ?? '');
  const [noteError, setNoteError] = useState<string | null>(null);
  const jobActive = latestJob && (latestJob.status === 'queued' || latestJob.status === 'running');

  const decide = (decision: 'confirmed' | 'needs_revision') => {
    if (!observation) return;
    if (decision === 'needs_revision' && !note.trim()) {
      setNoteError(t('img.err.note'));
      return;
    }
    setNoteError(null);
    const input = { observationId: observation.id, decision, note };
    void review.run({
      label: decision === 'confirmed' ? t('img.confirm') : t('img.flagLabel'),
      payload: input,
      expectedRevision: data.project.revision,
      execute: (meta) => service.reviewObservation(data.project.id, input, meta),
      success: decision === 'confirmed' ? t('img.confirmed') : t('img.flagged'),
    });
  };

  return (
    <div className="stack">
      <img className="inspector__image" src={image.previewUrl} alt={image.isPlaceholder ? t('img.altPlaceholder', { name: image.name }) : image.name} />
      <dl className="kv">
        <dt>{t('img.sourceNote')}</dt>
        <dd>{image.sourceNote || <span className="muted">{t('common.none')}</span>}</dd>
        <dt>{t('img.uploadedLabel')}</dt>
        <dd>
          <Time iso={image.uploadedAt} />
        </dd>
        {image.width && (
          <>
            <dt>{t('img.size')}</dt>
            <dd>
              {image.width} × {image.height} px{image.isPlaceholder ? ` (${t('img.placeholder')})` : ''}
            </dd>
          </>
        )}
      </dl>

      {observation ? (
        <section className="stack-sm" aria-label={t('img.observation')}>
          <div className="cluster">
            <h3 className="label">{t('img.observation')}</h3>
            {observation.simulated && <SimTag>{t('img.simulatedOne')}</SimTag>}
            <StatusBadge kind="observationReview" value={observation.reviewStatus} size="sm" />
          </div>
          <h4 className="label label--sub">{t('img.features')}</h4>
          <ul className="plain-list">
            {observation.visibleFeatures.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <h4 className="label label--sub">{t('img.transcribed')}</h4>
          {observation.transcribedText.length ? (
            <ul className="plain-list mono-list">
              {observation.transcribedText.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : (
            <p className="small muted">{t('img.noText')}</p>
          )}
          <h4 className="label label--sub">{t('img.uncertainties')}</h4>
          <ul className="plain-list">
            {observation.uncertainties.map((u) => (
              <li key={u}>{u}</li>
            ))}
          </ul>
          {observation.reviewedAt && (
            <p className="small muted">
              {rich('img.reviewed', { time: <Time iso={observation.reviewedAt} /> })}
              {observation.reviewNote ? `: ${observation.reviewNote}` : ''}
            </p>
          )}
          <div className="panel stack-sm">
            <TextArea label={t('img.reviewNote')} value={note} onChange={(e) => setNote(e.target.value)} rows={2} error={noteError} optional hint={t('img.reviewNoteHint')} />
            <div className="cluster">
              <Action permission={{ kind: 'workflow' }} label={t('img.confirm')} variant="primary" size="sm" onClick={() => decide('confirmed')} pending={review.pending} disabled={observation.reviewStatus === 'confirmed'} reason={t('img.alreadyConfirmed')} />
              <Action permission={{ kind: 'workflow' }} label={t('status.observationReview.needs_revision')} size="sm" onClick={() => decide('needs_revision')} pending={review.pending} />
            </div>
            <CommandFeedback command={review} />
          </div>
        </section>
      ) : (
        <section className="stack-sm" aria-label={t('img.observation')}>
          <h3 className="label">{t('img.observation')}</h3>
          {image.observationStatus === 'failed' && latestJob?.error && (
            <p className="banner" data-tone="bad">
              <strong>{t('img.lastFailed')}</strong> {latestJob.error.message}
            </p>
          )}
          {latestJob?.status === 'awaiting_reconciliation' && (
            <p className="banner" data-tone="warn">
              {t('img.awaiting')}
            </p>
          )}
          {jobActive ? (
            <p className="cluster" role="status">
              <StatusBadge kind="job" value={latestJob.status} size="sm" /> {t('img.inProgress')}
            </p>
          ) : (
            <Action permission={{ kind: 'workflow' }}
              label={image.observationStatus === 'failed' ? t('img.requestNew') : t('img.request')}
              variant="primary"
              icon={<Play size={16} aria-hidden="true" />}
              pending={request.pending}
              disabled={latestJob?.status === 'awaiting_reconciliation'}
              reason={t('img.waitingRecovery')}
              onClick={() =>
                void request.run({
                  label: t('img.request'),
                  payload: { imageId: image.id },
                  expectedRevision: data.project.revision,
                  execute: (meta) => service.requestObservation(data.project.id, image.id, meta),
                  success: t('img.queued'),
                })
              }
            />
          )}
          <CommandFeedback command={request} />
        </section>
      )}
      {latestJob && (
        <Link className="text-link small" to={projectPath(data.project.id, 'jobs', { job: latestJob.id })}>
          {t('img.viewJob')} <ArrowRight size={12} aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
