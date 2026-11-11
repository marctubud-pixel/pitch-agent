import { useEffect, useId, useState, type FormEvent } from 'react';
import { ArrowRight, Plus, Search } from 'lucide-react';
import { useCommand } from '../app/commands';
import { useServiceQuery } from '../app/query';
import { Link, projectPath, useRouter } from '../app/router';
import { useService } from '../app/services';
import { TOPIC_LABELS, type EvidenceTopic, type SourceInput, type SourceLibrary, type SourceVerificationStatus } from '../domain/models';
import { Modal } from '../ui/Modal';
import { Action, CommandFeedback, PageHeader, QueryView, SelectInput, Skeleton, StatePanel, TextArea, TextInput } from '../ui/kit';
import { statusInfo } from '../ui/status';
import { useT } from '../i18n';
import { SourceExcerpt } from './shared';

const TOPICS = Object.keys(TOPIC_LABELS) as EvidenceTopic[];

export function SourcesView({ projectId }: { projectId: string }) {
  const { params, setParams } = useRouter();
  const q = params.get('q') ?? '';
  const use = (params.get('use') ?? 'all') as EvidenceTopic | 'all';
  const status = (params.get('status') ?? 'all') as SourceVerificationStatus | 'all';
  const [search, setSearch] = useState(q);
  const searchId = useId();
  const t = useT();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (search !== q) setParams({ q: search || null });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search, q, setParams]);

  const query = useServiceQuery(
    `sources:${projectId}:${q}:${use}:${status}`,
    (s) => s.listSources(projectId, { search: q, intendedUse: use, verificationStatus: status }),
    { projectId, keepPreviousData: true },
  );
  const adding = params.get('add') === '1';

  return (
    <div className="page">
      <PageHeader
        eyebrow={t('src.eyebrow')}
        title={t('src.title')}
        actions={
          <Action
            label={t('src.add')}
            variant="primary"
            icon={<Plus size={16} aria-hidden="true" />}
            onClick={() => setParams({ add: '1' })}
            disabled={!query.data}
            reason={t('src.addWaiting')}
          />
        }
      >
        <p className="lede">{t('src.lede')}</p>
      </PageHeader>

      <div className="toolbar" role="search" aria-label={t('src.filter')}>
        <div className="search-field">
          <label htmlFor={searchId} className="sr-only">
            {t('src.search')}
          </label>
          <Search size={16} aria-hidden="true" />
          <input id={searchId} type="search" placeholder={t('src.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <SelectInput
          label={t('src.use')}
          value={use}
          onChange={(e) => setParams({ use: e.target.value === 'all' ? null : e.target.value })}
          options={[{ value: 'all', label: t('src.allUses') }, ...TOPICS.map((id) => ({ value: id, label: t(`topic.${id}`) }))]}
        />
        <SelectInput
          label={t('review.verification')}
          value={status}
          onChange={(e) => setParams({ status: e.target.value === 'all' ? null : e.target.value })}
          options={[{ value: 'all', label: t('src.anyStatus') }, ...(['verified', 'unverified', 'insufficient'] as const).map((s) => ({ value: s, label: statusInfo('source', s, t).label }))]}
        />
      </div>

      <QueryView query={query} skeleton={<Skeleton lines={3} blocks={3} />}>
        {(data) => (
          <>
            {data.total === 0 ? (
              <StatePanel kind="empty" title={t('src.none')} action={<button type="button" className="btn btn--primary" onClick={() => setParams({ add: '1' })}>{t('src.addFirst')}</button>}>
                <p>{t('src.noneBody')}</p>
              </StatePanel>
            ) : data.items.length === 0 ? (
              <StatePanel
                kind="empty"
                title={t('src.noMatch')}
                action={
                  <button
                    type="button"
                    className="btn btn--secondary"
                    onClick={() => {
                      setSearch('');
                      setParams({ q: null, use: null, status: null });
                    }}
                  >
                    {t('src.clear')}
                  </button>
                }
              />
            ) : (
              <>
                <p className="small muted" role="status" aria-live="polite">
                  {t('src.showing', { n: data.items.length, count: data.total })}
                </p>
                <ul className="source-list">
                  {data.items.map((s) => (
                    <li key={s.id}>
                      <SourceExcerpt source={s}>
                        <p className="small">
                          {s.citedByClaimIds.length === 0 ? (
                            <span className="muted">{t('src.notCited')}</span>
                          ) : (
                            <>
                              {t('src.citedBy', { count: s.citedByClaimIds.length })}{' '}
                              {s.citedByClaimIds.map((id, i) => (
                                <span key={id}>
                                  {i > 0 && ', '}
                                  <Link className="text-link" to={projectPath(projectId, 'research', { claim: id })}>
                                    {t('src.openClaimN', { n: i + 1 })}
                                  </Link>
                                </span>
                              ))}
                            </>
                          )}
                          <span className="muted"> · {t('src.addedBy', { name: s.addedBy })}</span>
                        </p>
                      </SourceExcerpt>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <AddSourceDialog open={adding} data={data} initialClaim={params.get('claim')} onClose={() => setParams({ add: null, claim: null })} />
          </>
        )}
      </QueryView>
    </div>
  );
}

function AddSourceDialog({ open, data, initialClaim, onClose }: { open: boolean; data: SourceLibrary; initialClaim: string | null; onClose: () => void }) {
  const service = useService();
  const command = useCommand();
  const t = useT();
  const formId = useId();
  const blank = (): SourceInput => ({ title: '', publisher: '', url: '', excerpt: '', intendedUse: 'audience', attachToClaimId: initialClaim });
  const [form, setForm] = useState<SourceInput>(blank);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) setForm((f) => ({ ...f, attachToClaimId: initialClaim ?? f.attachToClaimId }));
  }, [open, initialClaim]);

  const errors = {
    title: touched && !form.title.trim() ? t('src.err.title') : null,
    publisher: touched && !form.publisher.trim() ? t('src.err.publisher') : null,
    excerpt: touched && !form.excerpt.trim() ? t('src.err.excerpt') : null,
  };
  const claim = data.attachableClaims.find((c) => c.id === form.attachToClaimId);

  const close = () => {
    command.reset();
    setTouched(false);
    onClose();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!form.title.trim() || !form.publisher.trim() || !form.excerpt.trim()) return;
    await command.run({
      label: t('src.add'),
      payload: form,
      expectedRevision: data.project.revision,
      execute: (meta) => service.addSource(data.project.id, form, meta),
      success: form.attachToClaimId ? t('src.addedAttached') : t('src.added'),
      onSuccess: () => {
        setForm(blank());
        setTouched(false);
        onClose();
      },
    });
  };

  const set = (key: keyof SourceInput) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('src.add')}
      size="lg"
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={close}>
            {t('common.cancel')}
          </button>
          <Action label={form.attachToClaimId ? t('src.addAttach') : t('src.add')} type="submit" form={formId} variant="primary" pending={command.pending} />
        </>
      }
    >
      <form id={formId} className="stack" onSubmit={submit} noValidate>
        <div className="grid-2">
          <TextInput label={t('src.f.title')} value={form.title} onChange={set('title')} error={errors.title} />
          <TextInput label={t('src.f.publisher')} value={form.publisher} onChange={set('publisher')} error={errors.publisher} />
        </div>
        <TextInput label={t('src.f.link')} type="url" value={form.url} onChange={set('url')} optional hint={t('src.f.linkHint')} />
        <TextArea label={t('src.f.excerpt')} value={form.excerpt} onChange={set('excerpt')} rows={4} error={errors.excerpt} hint={t('src.f.excerptHint')} />
        <div className="grid-2">
          <SelectInput label={t('src.use')} value={form.intendedUse} onChange={set('intendedUse')} options={TOPICS.map((id) => ({ value: id, label: t(`topic.${id}`) }))} hint={t('src.f.useHint')} />
          <SelectInput
            label={t('src.f.attach')}
            value={form.attachToClaimId ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, attachToClaimId: e.target.value || null }))}
            options={[{ value: '', label: t('src.f.noAttach') }, ...data.attachableClaims.map((c) => ({ value: c.id, label: `${c.text.slice(0, 70)}${c.text.length > 70 ? '…' : ''}` }))]}
            optional
          />
        </div>
        {claim && (
          <p className="banner" data-tone="info">
            {t('src.f.attachNote', { topic: t(`topic.${claim.topic}`) })}
            {claim.supportStatus !== 'unverified' && ` ${t('src.f.attachReviews')}`}
          </p>
        )}
        <CommandFeedback command={command} />
        {data.attachableClaims.length > 0 && (
          <Link className="text-link small" to={projectPath(data.project.id, 'research', { tab: 'gaps' })}>
            {t('src.needEvidence')} <ArrowRight size={12} aria-hidden="true" />
          </Link>
        )}
      </form>
    </Modal>
  );
}
