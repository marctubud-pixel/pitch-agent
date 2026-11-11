import { useRef, useState } from 'react';
import { Download, FileText, Upload, X } from 'lucide-react';
import { useProposals } from '../app/services';
import { useTeam } from '../collaboration/context';
import { BRAND_RESOURCE_ACCEPT, BRAND_RESOURCE_LIMITS, brandResourceSize, validateBrandUploads, type BrandResourceUpload } from '../domain/brandResources';
import type { Proposal } from '../domain/proposal';
import { useT } from '../i18n';

export function BrandResourceUploadCard({ uploads, onChange, disabled }: {
  uploads: BrandResourceUpload[];
  onChange: (uploads: BrandResourceUpload[]) => void;
  disabled: boolean;
}) {
  const t = useT();
  const { can } = useTeam();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Set<string>>(new Set());
  const locked = disabled || !can({ kind: 'manage' });
  const append = (files: File[]) => {
    if (locked || !files.length) return;
    const additions = files.map((file) => ({
      file,
      resource: { id: globalThis.crypto.randomUUID(), fileName: file.name, size: file.size, mediaType: file.type, lastModified: file.lastModified, note: '' },
    }));
    try {
      const next = [...uploads, ...additions];
      validateBrandUploads(next);
      onChange(next);
      setError(null);
    } catch (failure) { setError(failure instanceof Error ? failure.message : t('brand.invalid')); }
  };
  return (
    <section className="card brand-upload" aria-labelledby="brand-upload-title" data-testid="brand-resources-upload"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => { event.preventDefault(); if (!locked) append(Array.from(event.dataTransfer.files)); }}>
      <div className="brand-upload__head">
        <div>
          <h2 id="brand-upload-title" className="card__title">{t('brand.title')}</h2>
          <p className="small muted">{t('brand.hint')}</p>
        </div>
        <button type="button" className="btn btn--secondary btn--sm" disabled={locked} onClick={() => { if (!locked) input.current?.click(); }}>
          <Upload size={15} aria-hidden="true" />{t('brand.upload')}
        </button>
        <input ref={input} type="file" multiple accept={BRAND_RESOURCE_ACCEPT} className="sr-only" data-testid="brand-resource-input"
          aria-label={t('brand.upload')} disabled={locked}
          onChange={(event) => { if (!locked) append(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = ''; }} />
      </div>
      <details className="brand-upload__requirements">
        <summary>{t('brand.requirements')}</summary>
        <p className="small muted brand-upload__limits">{t('brand.limits')}</p>
      </details>
      {uploads.length > 0 && <>
        <ul className="brand-files" data-testid="brand-resources-list">
          {uploads.map(({ resource }) => (
            <li key={resource.id} className="brand-files__row" data-testid="brand-resource-row">
              <FileText size={18} aria-hidden="true" />
              <div className="brand-files__body">
                <p className="brand-files__name">{resource.fileName} <span className="small muted">{brandResourceSize(resource.size)}</span></p>
                {notes.has(resource.id) || resource.note ? <label className="brand-files__note">
                  <span className="small muted">{t('brand.note')}</span>
                  <textarea rows={2} maxLength={BRAND_RESOURCE_LIMITS.noteLength} value={resource.note} disabled={locked}
                    aria-label={`${t('brand.note')} ${resource.fileName}`}
                    onChange={(event) => { if (!locked) onChange(uploads.map((upload) => upload.resource.id === resource.id ? { ...upload, resource: { ...upload.resource, note: event.target.value } } : upload)); }} />
                </label> : <button type="button" className="text-link small" disabled={locked}
                  aria-label={`${t('brand.addNote')} ${resource.fileName}`}
                  onClick={() => { if (!locked) setNotes((previous) => new Set([...previous, resource.id])); }}>{t('brand.addNote')}</button>}
              </div>
              <button type="button" className="btn btn--ghost btn--sm" disabled={locked} aria-label={`${t('brand.remove')} ${resource.fileName}`}
                onClick={() => { if (!locked) { onChange(uploads.filter((upload) => upload.resource.id !== resource.id)); setError(null); } }}><X size={16} aria-hidden="true" /></button>
            </li>
          ))}
        </ul>
        <p className="small muted" role="status">{t('brand.pending')}</p>
      </>}
      {error && <p className="field__error" role="alert">{error}</p>}
    </section>
  );
}

export function BrandResourceList({ proposal }: { proposal: Proposal }) {
  const t = useT();
  const service = useProposals();
  const [downloads, setDownloads] = useState<Record<string, { pending: boolean; error: string | null }>>({});
  const resources = proposal.brandResources ?? [];
  if (!resources.length) return null;
  const download = async (resourceId: string, fileName: string) => {
    if (downloads[resourceId]?.pending) return;
    setDownloads((previous) => ({ ...previous, [resourceId]: { pending: true, error: null } }));
    try {
      const blob = await service.getBrandResourceFile(proposal.id, resourceId);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      document.body.append(anchor);
      try { anchor.click(); }
      finally { anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 30_000); }
      setDownloads((previous) => ({ ...previous, [resourceId]: { pending: false, error: null } }));
    } catch (failure) {
      setDownloads((previous) => ({ ...previous, [resourceId]: { pending: false, error: failure instanceof Error ? failure.message : t('brand.unavailable') } }));
    }
  };
  return (
    <section className="brand-resources" aria-label={t('brand.title')} data-testid="brand-resources-readonly">
      <h2 className="pw-h3">{t('brand.title')}</h2>
      <p className="small muted">{t('brand.referenceHint')}</p>
      <ul className="brand-files" data-testid="brand-resources-list">
        {resources.map((resource) => <li key={resource.id} className="brand-files__row" data-testid="brand-resource-row">
          <FileText size={18} aria-hidden="true" />
          <div className="brand-files__body">
            <p className="brand-files__name">{resource.fileName} <span className="small muted">{brandResourceSize(resource.size)}</span></p>
            {resource.note && <p className="small brand-files__description">{resource.note}</p>}
            {downloads[resource.id]?.error && <p className="field__error" role="alert">{downloads[resource.id].error}</p>}
          </div>
          <button type="button" className="btn btn--secondary btn--sm" disabled={downloads[resource.id]?.pending}
            aria-label={`${t('brand.download')} ${resource.fileName}`} onClick={() => void download(resource.id, resource.fileName)}>
            <Download size={15} aria-hidden="true" />{t(downloads[resource.id]?.pending ? 'brand.downloading' : 'brand.download')}
          </button>
        </li>)}
      </ul>
    </section>
  );
}
