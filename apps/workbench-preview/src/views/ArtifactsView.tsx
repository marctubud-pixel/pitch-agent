import { ArrowRight, Lock } from 'lucide-react';
import { useServiceQuery } from '../app/query';
import { Link, projectPath, useRouter } from '../app/router';
import type { ArtifactDetail, ArtifactList, ArtifactSummary } from '../domain/models';
import { Inspector, restoreFocus } from '../ui/Inspector';
import { PageHeader, QueryView, SimTag, Skeleton, StatePanel, Time } from '../ui/kit';
import { StatusBadge } from '../ui/status';
import { useI18n, useT } from '../i18n';
import { ArtifactDocument, ClaimDetail, ReviewReport } from './shared';

export function ArtifactsView({ projectId, artifactId }: { projectId: string; artifactId: string | null }) {
  if (artifactId) return <ArtifactViewer projectId={projectId} artifactId={artifactId} />;
  return <ArtifactIndex projectId={projectId} />;
}

function ArtifactIndex({ projectId }: { projectId: string }) {
  const query = useServiceQuery(`artifacts:${projectId}`, (s) => s.listArtifacts(projectId), { projectId });
  const t = useT();
  return (
    <div className="page">
      <PageHeader eyebrow={t('nav.artifacts')} title={t('art.title')}>
        <p className="lede">{t('art.lede')}</p>
      </PageHeader>
      <QueryView query={query} skeleton={<Skeleton lines={2} blocks={3} />}>
        {(data) => <ArtifactGroups data={data} />}
      </QueryView>
    </div>
  );
}

function ArtifactGroups({ data }: { data: ArtifactList }) {
  const t = useT();
  if (data.items.length === 0) {
    return (
      <StatePanel kind="empty" title={t('art.none')}>
        <p>{t('art.noneBody')}</p>
      </StatePanel>
    );
  }
  const groups = (['strategy', 'research'] as const).map((stage) => ({ stage, items: data.items.filter((a) => a.stage === stage) })).filter((g) => g.items.length);
  return (
    <div className="stack">
      {groups.map((g) => (
        <section key={g.stage} aria-labelledby={`group-${g.stage}`} className="section">
          <h2 id={`group-${g.stage}`} className="section__title">
            {t(`stage.${g.stage}`)}
          </h2>
          <ol className="artifact-list">
            {g.items.map((a) => (
              <ArtifactRow key={a.id} projectId={data.project.id} artifact={a} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function ArtifactRow({ projectId, artifact }: { projectId: string; artifact: ArtifactSummary }) {
  const { t, rich } = useI18n();
  return (
    <li className="artifact-row">
      <div>
        <Link className="artifact-row__title" to={projectPath(projectId, 'artifacts', { artifact: artifact.id })}>
          {artifact.title} <span className="muted">· v{artifact.version}</span>
        </Link>
        <p className="small muted">
          {rich('res.produced', { time: <Time iso={artifact.createdAt} /> })} · {t('art.claims', { count: artifact.claimCount })}
          {artifact.supersededAt && <> · {rich('art.superseded', { time: <Time iso={artifact.supersededAt} /> })}</>}
        </p>
      </div>
      <div className="cluster cluster--tight">
        <StatusBadge kind="artifact" value={artifact.status} size="sm" />
        {artifact.isCurrent ? (
          <span className="tag tag--accent">{t('art.current')}</span>
        ) : (
          <span className="tag">
            <Lock size={12} aria-hidden="true" /> {t('art.historical')}
          </span>
        )}
      </div>
    </li>
  );
}

function ArtifactViewer({ projectId, artifactId }: { projectId: string; artifactId: string }) {
  const query = useServiceQuery(`artifact:${projectId}:${artifactId}`, (s) => s.getArtifact(projectId, artifactId), { projectId });
  return (
    <QueryView query={query} skeleton={<div className="page"><Skeleton lines={6} blocks={2} /></div>}>
      {(data) => <Viewer data={data} />}
    </QueryView>
  );
}

function Viewer({ data }: { data: ArtifactDetail }) {
  const { params, setParams } = useRouter();
  const { t, rich } = useI18n();
  const { artifact, claims, sources, reviews, handoffs, versions, project } = data;
  const claimId = params.get('claim');
  const claim = claims.find((c) => c.id === claimId) ?? null;
  const current = versions.find((v) => v.isCurrent);
  const readOnly = !artifact.isCurrent;

  const close = () => {
    const id = claimId;
    setParams({ claim: null });
    if (id) restoreFocus(`#claim-anchor-${CSS.escape(id)}`);
  };

  return (
    <div className={`with-inspector${claim ? ' is-open' : ''}`}>
      <div className="with-inspector__main page">
        <Link to={projectPath(project.id, 'artifacts')} className="back-link">
          {t('art.all')}
        </Link>
        <PageHeader eyebrow={t('art.eyebrow', { stage: t(`stage.${artifact.stage}`), v: artifact.version, bv: artifact.basedOn.briefVersion })} title={artifact.title}>
          <div className="cluster">
            <StatusBadge kind="artifact" value={artifact.status} />
            {readOnly ? (
              <span className="tag">
                <Lock size={12} aria-hidden="true" /> {t('art.historicalRo')}
              </span>
            ) : (
              <span className="tag tag--accent">{t('art.currentVersion')}</span>
            )}
            {artifact.simulated && <SimTag>{artifact.stage === 'strategy' ? t('art.simStrategy') : t('res.simContent')}</SimTag>}
            <span className="small muted">{rich('res.produced', { time: <Time iso={artifact.createdAt} /> })}</span>
          </div>
          <p className="lede">{artifact.summary}</p>
        </PageHeader>

        {versions.length > 1 && (
          <nav className="version-tabs" aria-label={t('art.versions')}>
            {versions.map((v) => (
              <Link key={v.id} to={projectPath(project.id, 'artifacts', { artifact: v.id })} aria-current={v.id === artifact.id ? 'page' : undefined}>
                v{v.version}
                {v.isCurrent ? ` · ${t('brief.current')}` : ''}
              </Link>
            ))}
          </nav>
        )}

        {readOnly && (
          <p className="banner" data-tone="neutral" role="status">
            <Lock size={16} aria-hidden="true" />{' '}
            {artifact.supersededAt
              ? rich('art.viewingSuperseded', { v: String(artifact.version), time: <Time iso={artifact.supersededAt} /> })
              : t('art.viewing', { v: artifact.version })}
            {current && (
              <>
                {' '}
                <Link className="text-link" to={projectPath(project.id, 'artifacts', { artifact: current.id })}>
                  {t('art.goVersion', { v: current.version })}
                </Link>
              </>
            )}
          </p>
        )}
        {artifact.staleReason && (
          <p className="banner" data-tone="warn">
            <strong>{t('res.stale')}</strong> {artifact.staleReason}
          </p>
        )}
        {!readOnly && artifact.stage === 'research' && (
          <p className="small">
            <Link className="text-link" to={projectPath(project.id, 'research')}>
              {t('art.workOn')} <ArrowRight size={12} aria-hidden="true" />
            </Link>
          </p>
        )}

        <ArtifactDocument artifact={artifact} claims={claims} sources={sources} activeClaimId={claimId} onOpenClaim={(id) => setParams({ claim: id })} />

        <section className="section" aria-labelledby="reviews-title">
          <h2 id="reviews-title" className="section__title">
            {t('art.reviews')}
          </h2>
          {reviews.length === 0 ? (
            <p className="muted">{t('art.noReviews')}</p>
          ) : (
            <div className="stack-sm">
              {reviews.map((r, i) => (
                <details key={r.id} className="disclosure" open={i === 0}>
                  <summary>
                    {t(`art.reviewType.${r.type}`)} · <Time iso={r.createdAt} />
                    {r.outdated ? ` · ${t('res.outdated')}` : ''}
                  </summary>
                  <ReviewReport review={r} claims={claims} sources={sources} onOpenClaim={(id) => setParams({ claim: id })} />
                </details>
              ))}
            </div>
          )}
        </section>

        {handoffs.length > 0 && (
          <section className="section" aria-labelledby="handoffs-title">
            <h2 id="handoffs-title" className="section__title">
              {t('art.handoffs')}
            </h2>
            <ul className="plain-list stack-sm">
              {handoffs.map((h) => (
                <li key={h.id} className="history-row">
                  <StatusBadge kind="handoff" value={h.decision} size="sm" />
                  <span>
                    {h.owner} · <Time iso={h.createdAt} />
                  </span>
                  {h.outdated && <span className="tag">{t('ho.outdated')}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      {claim && (
        <Inspector title={t('res.claimEvidence')} eyebrow={`${t(artifact.stage === 'research' ? 'res.versionLabel' : 'art.strategyLabel', { v: artifact.version })}${readOnly ? ` · ${t('art.readOnly')}` : ''}`} onClose={close}>
          <ClaimDetail
            claim={claim}
            sources={sources}
            findings={reviews.filter((r) => !r.outdated).flatMap((r) => r.findings.filter((f) => f.claimIds.includes(claim.id)).map((f) => ({ ...f, reviewType: r.type })))}
          >
            <p className="small muted">{readOnly ? t('art.historicalNote') : t('art.changeNote')}</p>
          </ClaimDetail>
        </Inspector>
      )}
    </div>
  );
}
