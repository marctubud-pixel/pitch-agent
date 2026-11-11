import { useEffect, useRef } from 'react';
import { ArrowRight, RotateCcw, Undo2 } from 'lucide-react';
import { useCommand } from '../app/commands';
import { useServiceQuery } from '../app/query';
import { Link, projectPath, useRouter } from '../app/router';
import { useService } from '../app/services';
import type { Job, JobList, JobPurpose, JobStatus, Project } from '../domain/models';
import { Action, CommandFeedback, PageHeader, QueryView, SimTag, Skeleton, StatePanel, Time } from '../ui/kit';
import { StatusBadge, statusInfo } from '../ui/status';
import { formatDuration, formatNumber, shortId } from '../ui/format';
import { useI18n, useT, type TFunction } from '../i18n';

const purpose = (p: JobPurpose, t: TFunction) => t(`jobs.purpose.${p}`);

const FILTERS: Array<JobStatus | 'all'> = ['all', 'queued', 'running', 'succeeded', 'failed', 'awaiting_reconciliation'];

export function JobsView({ projectId }: { projectId: string }) {
  const query = useServiceQuery(`jobs:${projectId}`, (s) => s.listJobs(projectId), { projectId });
  const t = useT();
  return (
    <div className="page">
      <PageHeader eyebrow={t('nav.jobs')} title={t('jobs.title')}>
        <p className="lede">{t('jobs.lede')}</p>
      </PageHeader>
      <QueryView query={query} skeleton={<Skeleton lines={3} blocks={4} />}>
        {(data) => <Jobs data={data} />}
      </QueryView>
    </div>
  );
}

function Jobs({ data }: { data: JobList }) {
  const { params, setParams } = useRouter();
  const t = useT();
  const filter = (params.get('status') ?? 'all') as JobStatus | 'all';
  const focusId = params.get('job');
  const items = data.items.filter((j) => filter === 'all' || j.status === filter);
  const counts = Object.fromEntries(FILTERS.map((f) => [f, f === 'all' ? data.items.length : data.items.filter((j) => j.status === f).length]));

  if (data.items.length === 0) {
    return (
      <StatePanel kind="empty" title={t('jobs.none')}>
        <p>{t('jobs.noneBody')}</p>
      </StatePanel>
    );
  }

  return (
    <div className="stack">
      <fieldset className="segmented">
        <legend className="sr-only">{t('jobs.filter')}</legend>
        {FILTERS.map((f) => (
          <label key={f} className="segmented__option">
            <input type="radio" name="job-status" checked={filter === f} onChange={() => setParams({ status: f === 'all' ? null : f })} />
            <span>
              {f === 'all' ? t('jobs.all') : statusInfo('job', f, t).label} <span className="count">{counts[f]}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {items.length === 0 ? (
        <StatePanel kind="empty" title={t('jobs.noneStatus')} />
      ) : (
        <ol className="job-list">
          {items.map((job) => (
            <JobItem key={job.id} job={job} project={data.project} highlighted={job.id === focusId} all={data.items} />
          ))}
        </ol>
      )}
    </div>
  );
}

function outputLink(project: Project, job: Job, t: TFunction) {
  if (!job.output) return null;
  if (job.output.kind === 'artifact') return { to: projectPath(project.id, 'artifacts', { artifact: job.output.id }), label: t('jobs.openArtifact') };
  if (job.output.kind === 'review') {
    const tab = job.purpose === 'readiness_review' ? 'readiness' : 'verification';
    return { to: projectPath(project.id, 'research', { tab }), label: t(`jobs.openReport.${tab}`) };
  }
  return { to: projectPath(project.id, 'images', { image: job.target.id }), label: t('jobs.openObservation') };
}

function JobItem({ job, project, highlighted, all }: { job: Job; project: Project; highlighted: boolean; all: Job[] }) {
  const service = useService();
  const command = useCommand();
  const ref = useRef<HTMLLIElement>(null);
  const { t, rich } = useI18n();
  const link = outputLink(project, job, t);
  const retryOf = job.retryOfJobId ? all.find((j) => j.id === job.retryOfJobId) : null;

  useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView({ block: 'center' });
  }, [highlighted]);

  const recover = () =>
    void command.run({
      label: job.recovery.action === 'reconcile' ? t('jobs.recover') : t('jobs.retryJob'),
      payload: { jobId: job.id, action: job.recovery.action },
      expectedRevision: project.revision,
      execute: (meta) => (job.recovery.action === 'reconcile' ? service.reconcileJob(project.id, job.id, meta) : service.retryJob(project.id, job.id, meta)),
      success: job.recovery.action === 'reconcile' ? t('jobs.recovered') : t('jobs.retryQueued'),
    });

  return (
    <li ref={ref} className="job" data-status={job.status} data-highlighted={highlighted}>
      <div className="job__head">
        <div>
          <p className="eyebrow">
            {purpose(job.purpose, t)} · {t('jobs.attempt', { n: job.attempt })}
          </p>
          <h2 className="job__title">{job.label}</h2>
        </div>
        <div className="cluster cluster--tight">
          <StatusBadge kind="job" value={job.status} />
          {job.simulated && <SimTag />}
        </div>
      </div>

      <dl className="job__times">
        <div>
          <dt>{t('status.job.queued')}</dt>
          <dd>
            <Time iso={job.createdAt} />
          </dd>
        </div>
        <div>
          <dt>{t('jobs.started')}</dt>
          <dd>
            <Time iso={job.startedAt} />
          </dd>
        </div>
        <div>
          <dt>{t('jobs.completed')}</dt>
          <dd>
            <Time iso={job.completedAt} />
          </dd>
        </div>
        <div>
          <dt>{t('jobs.target')}</dt>
          <dd>{job.target.label}</dd>
        </div>
      </dl>

      {retryOf && (
        <p className="small muted">
          <Undo2 size={12} aria-hidden="true" /> {rich(retryOf.status === 'failed' ? 'jobs.retryOfFailed' : 'jobs.retryOfUnfinished', { time: <Time iso={retryOf.createdAt} /> })}
        </p>
      )}
      {job.reconciledAt && (
        <p className="small">
          {rich('jobs.reconciled', { time: <Time iso={job.reconciledAt} /> })}
        </p>
      )}

      {job.error && (
        <div className="job__error" role="note">
          <p>
            <strong>{job.error.code}</strong> · {job.error.message}
          </p>
          <p className="small">{job.error.detail}</p>
        </div>
      )}

      {(job.recovery.action !== 'none' || job.status === 'failed' || job.status === 'awaiting_reconciliation') && (
        <div className="job__recovery">
          {job.recovery.action !== 'none' ? (
            <Action permission={{ kind: 'workflow' }}
              label={job.recovery.action === 'reconcile' ? t('jobs.recover') : t('jobs.retry')}
              icon={<RotateCcw size={16} aria-hidden="true" />}
              variant={job.recovery.eligible ? 'primary' : 'secondary'}
              size="sm"
              onClick={recover}
              disabled={!job.recovery.eligible}
              reason={job.recovery.reason}
              pending={command.pending}
            />
          ) : (
            <p className="small muted">{job.recovery.reason}</p>
          )}
          {job.recovery.eligible && <p className="small muted">{job.recovery.reason}</p>}
          <CommandFeedback command={command} />
        </div>
      )}

      {link && (
        <Link className="text-link small" to={link.to}>
          {link.label} <ArrowRight size={12} aria-hidden="true" />
        </Link>
      )}

      {job.receipt && (
        <details className="disclosure">
          <summary>{t('jobs.receipt')}</summary>
          <dl className="kv kv--compact">
            <dt>{t('jobs.provider')}</dt>
            <dd>{job.receipt.provider}</dd>
            <dt>{t('jobs.requestId')}</dt>
            <dd className="mono">{job.receipt.requestId}</dd>
            <dt>{t('jobs.model')}</dt>
            <dd className="mono">{job.receipt.model}</dd>
            <dt>{t('jobs.units')}</dt>
            <dd className="num">
              {formatNumber(job.receipt.inputUnits)} / {formatNumber(job.receipt.outputUnits)}
            </dd>
            <dt>{t('jobs.duration')}</dt>
            <dd>{formatDuration(job.receipt.durationMs)}</dd>
            {job.receipt.savedResultRef && (
              <>
                <dt>{t('jobs.savedResult')}</dt>
                <dd className="mono">{job.receipt.savedResultRef}</dd>
              </>
            )}
            <dt>{t('jobs.commandId')}</dt>
            <dd className="mono">{shortId(job.commandId)}…</dd>
          </dl>
          <pre className="raw">{JSON.stringify(job.receipt.raw, null, 2)}</pre>
        </details>
      )}
    </li>
  );
}
