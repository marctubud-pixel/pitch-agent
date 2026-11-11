import { Fragment, type ReactNode } from 'react';
import { ArrowRight, CircleCheck, CircleX, ExternalLink } from 'lucide-react';
import { Link, projectPath } from '../app/router';
import {
  type Artifact,
  type Capabilities,
  type Claim,
  type ContinuationEligibility,
  type Finding,
  type ID,
  type Review,
  type Source,
} from '../domain/models';
import { SimTag, Time } from '../ui/kit';
import { StatusBadge, statusInfo } from '../ui/status';
import { useI18n, useT } from '../i18n';
import { demoSourceChineseSummary } from '../services/mock/demoChinese';

// ---------------------------------------------------------------------------
// Feature availability and project eligibility (kept visibly separate)
// ---------------------------------------------------------------------------

export function EligibilityPanel({
  projectId,
  eligibility,
  capabilities,
  compact = false,
}: {
  projectId: string;
  eligibility: ContinuationEligibility;
  capabilities: Capabilities | undefined;
  compact?: boolean;
}) {
  const t = useT();
  const feature = capabilities?.continuation_to_strategy;
  return (
    <div className="stack-sm">
      <dl className="availability">
        <div>
          <dt>{t('elig.feature')}</dt>
          <dd>
            {feature ? (
              <>
                <span className="badge" data-tone={feature.supported ? 'ok' : 'neutral'}>
                  {feature.supported ? <CircleCheck size={14} aria-hidden="true" /> : <CircleX size={14} aria-hidden="true" />}
                  {feature.supported ? t('elig.available') : t('common.notAvailable')}
                </span>
                <span className="small muted">{feature.reason}</span>
              </>
            ) : (
              <span className="small muted">{t('elig.checking')}</span>
            )}
          </dd>
        </div>
        <div>
          <dt>{t('elig.project')}</dt>
          <dd>
            <span className="badge" data-tone={eligibility.alreadyContinued ? 'info' : eligibility.eligible ? 'ok' : 'bad'}>
              {eligibility.eligible || eligibility.alreadyContinued ? <CircleCheck size={14} aria-hidden="true" /> : <CircleX size={14} aria-hidden="true" />}
              {eligibility.alreadyContinued ? t('elig.continued') : eligibility.eligible ? t('elig.eligible') : t('elig.notEligible')}
            </span>
            <span className="small muted">{eligibility.summary}</span>
          </dd>
        </div>
      </dl>
      <ul className="checklist" aria-label={t('elig.checks')}>
        {eligibility.checks.map((c) => (
          <li key={c.id} data-passed={c.passed}>
            {c.passed ? <CircleCheck size={16} aria-hidden="true" /> : <CircleX size={16} aria-hidden="true" />}
            <div>
              <p className="checklist__label">
                {c.label} <span className="sr-only">{c.passed ? t('elig.met') : t('elig.notMet')}</span>
              </p>
              {(!compact || !c.passed) && <p className="small muted">{c.detail}</p>}
              {!c.passed && c.fix && (
                <Link className="text-link small" to={projectPath(projectId, c.fix.view, c.fix.params)}>
                  {c.fix.label} <ArrowRight size={12} aria-hidden="true" />
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sources and excerpts
// ---------------------------------------------------------------------------

export function SourceLink({ source }: { source: Pick<Source, 'url' | 'isSampleLink'> }) {
  const t = useT();
  return (
    <a className="text-link small" href={source.url} target="_blank" rel="noreferrer noopener" title={source.url}>
      {source.isSampleLink ? t('src.sampleLink') : t('src.openLink')} <ExternalLink size={12} aria-hidden="true" />
      {source.isSampleLink && <span className="sr-only"> {t('src.sampleLinkSr')}</span>}
    </a>
  );
}

export function SourceExcerpt({ source, index, children, compact = false }: { source: Source; index?: number; children?: ReactNode; compact?: boolean }) {
  const { t, rich } = useI18n();
  const chineseSummary = demoSourceChineseSummary(source);
  return (
    <article className="excerpt-card" data-compact={compact || undefined}>
      <header className="excerpt-card__head">
        {index !== undefined && (
          <span className="cite-num" aria-label={t('src.numbered', { n: index })}>
            {index}
          </span>
        )}
        <div>
          <h3>{source.title}</h3>
          <p className="small muted">
            {source.publisher} · {rich('src.captured', { time: <Time iso={source.capturedAt} /> })}
          </p>
        </div>
      </header>
      {chineseSummary && <p className="excerpt"><span className="small muted">演示摘录中文释义：</span>{chineseSummary}</p>}
      <details className="source-original">
        <summary>{t('src.showOriginal')}</summary>
        <blockquote className="excerpt">{source.excerpt}</blockquote>
      </details>
      <div className="cluster">
        <StatusBadge kind="source" value={source.verificationStatus} size="sm" />
        <span className="tag">{t(`topic.${source.intendedUse}`)}</span>
        <SourceLink source={source} />
      </div>
      {children}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Artifact document
// ---------------------------------------------------------------------------

export function citationOrder(artifact: Artifact, claims: Claim[]): Map<ID, number> {
  const byId = new Map(claims.map((c) => [c.id, c]));
  const order = new Map<ID, number>();
  for (const section of artifact.sections) {
    for (const block of section.blocks) {
      if (block.kind !== 'paragraph') continue;
      for (const seg of block.segments) {
        if (typeof seg === 'string') continue;
        for (const sid of byId.get(seg.claimId)?.sourceIds ?? []) if (!order.has(sid)) order.set(sid, order.size + 1);
      }
    }
  }
  return order;
}

export function ArtifactDocument({
  artifact,
  claims,
  sources,
  activeClaimId,
  onOpenClaim,
  footer,
}: {
  artifact: Artifact;
  claims: Claim[];
  sources: Source[];
  activeClaimId: string | null;
  onOpenClaim: (id: string) => void;
  footer?: ReactNode;
}) {
  const t = useT();
  const byId = new Map(claims.map((c) => [c.id, c]));
  const order = citationOrder(artifact, claims);
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const cited = [...order.entries()].map(([id, n]) => ({ n, source: sourceById.get(id) })).filter((x) => x.source);

  return (
    <article className="doc" aria-label={artifact.title}>
      {artifact.sections.map((section) => (
        <section key={section.id} className="doc__section">
          <h2>{section.heading}</h2>
          {section.blocks.map((block, i) => {
            if (block.kind === 'list') {
              return (
                <ul key={i}>
                  {block.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              );
            }
            if (block.kind === 'callout') {
              return (
                <p key={i} className="callout" data-tone={block.tone}>
                  <strong>{block.tone === 'gap' ? t('doc.gap') : t('doc.note')} </strong>
                  {block.text}
                </p>
              );
            }
            return (
              <p key={i}>
                {block.segments.map((seg, j) => {
                  if (typeof seg === 'string') return <Fragment key={j}>{seg}</Fragment>;
                  const claim = byId.get(seg.claimId);
                  if (!claim) return null;
                  const nums = claim.sourceIds.map((sid) => order.get(sid)).filter((n): n is number => n !== undefined);
                  const status = statusInfo('support', claim.supportStatus, t);
                  return (
                    <button
                      key={j}
                      type="button"
                      id={`claim-anchor-${claim.id}`}
                      className="claim"
                      data-status={claim.supportStatus}
                      aria-pressed={activeClaimId === claim.id}
                      onClick={() => onOpenClaim(claim.id)}
                    >
                      {claim.text}
                      <span className="claim__cites" aria-hidden="true">
                        {nums.length ? `[${nums.join(', ')}]` : `[${t('doc.noSource')}]`}
                      </span>
                      <span className="sr-only">
                        {' '}
                        {t('doc.claimSr', { status: status.label, sources: t('doc.sources', { count: nums.length }) })}
                      </span>
                    </button>
                  );
                })}
              </p>
            );
          })}
        </section>
      ))}
      {cited.length > 0 && (
        <section className="doc__sources" aria-label={t('doc.cited')}>
          <h2>{t('doc.cited')}</h2>
          <ol>
            {cited.map(({ n, source }) => (
              <li key={n} value={n}>
                <span className="doc__source-title">{source!.title}</span> — {source!.publisher}. <SourceLink source={source!} />
              </li>
            ))}
          </ol>
        </section>
      )}
      {footer}
    </article>
  );
}

export function ClaimLegend() {
  const t = useT();
  return (
    <ul className="legend" aria-label={t('doc.legend')}>
      {(['supported', 'partial', 'missing_citation', 'unverified'] as const).map((s) => (
        <li key={s}>
          <span className="legend__swatch claim" data-status={s} aria-hidden="true">
            {t('doc.claim')}
          </span>
          {statusInfo('support', s, t).label}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Claim detail (inspector body)
// ---------------------------------------------------------------------------

export function ClaimDetail({
  claim,
  sources,
  findings,
  children,
}: {
  claim: Claim;
  sources: Source[];
  findings: Array<Finding & { reviewType: Review['type'] }>;
  children?: ReactNode;
}) {
  const t = useT();
  const byId = new Map(sources.map((s) => [s.id, s]));
  const cited = claim.sourceIds.map((id) => byId.get(id)).filter((s): s is Source => Boolean(s));
  return (
    <div className="stack">
      <div className="cluster">
        <StatusBadge kind="support" value={claim.supportStatus} />
        <span className="tag">{t(`topic.${claim.topic}`)}</span>
      </div>
      <blockquote className="claim-quote">{claim.text}</blockquote>
      {claim.limitations.length > 0 && (
        <div>
          <h3 className="label">{t('claim.limitations')}</h3>
          <ul className="plain-list">
            {claim.limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="stack-sm">
        <h3 className="label">{t('claim.excerpts', { n: cited.length })}</h3>
        {cited.length === 0 ? (
          <p className="callout" data-tone="gap">
            <strong>{t('claim.noSource')} </strong>{t('claim.noSourceBody')}
          </p>
        ) : (
          cited.map((s) => <SourceExcerpt key={s.id} source={s} />)
        )}
      </div>
      {findings.length > 0 && (
        <div className="stack-sm">
          <h3 className="label">{t('claim.findings')}</h3>
          <ul className="finding-list">
            {findings.map((f) => (
              <li key={f.id} className="finding" data-severity={f.severity}>
                <div className="finding__head">
                  <StatusBadge kind="severity" value={f.severity} size="sm" />
                  <span className="small muted">{t(`review.${f.reviewType}`)}</span>
                </div>
                <p>{f.message}</p>
                <p className="finding__action">
                  <strong>{t('finding.next')}</strong> {f.requiredAction}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Review report
// ---------------------------------------------------------------------------

export function ReviewReport({
  review,
  claims,
  sources,
  onOpenClaim,
}: {
  review: Review;
  claims: Claim[];
  sources: Source[];
  onOpenClaim?: (id: string) => void;
}) {
  const t = useT();
  const claimById = new Map(claims.map((c) => [c.id, c]));
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const open = review.findings.filter((f) => !f.resolved);
  return (
    <div className="report">
      <div className="report__head">
        <StatusBadge kind="decision" value={review.decision} />
        {review.simulated && <SimTag>{t('review.simulated')}</SimTag>}
        <span className="small muted">
          {review.reviewer} · <Time iso={review.createdAt} /> · {t('review.version', { v: review.artifactVersion })}
        </span>
      </div>
      {review.outdated && (
        <p className="banner" data-tone="warn">
          <strong>{t('review.outdated')}</strong> {review.outdatedReason} {t('review.outdatedNote')}
        </p>
      )}
      <p className="report__summary">{review.summary}</p>
      {review.coverage.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <caption>{t('review.coverage')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('review.topic')}</th>
                <th scope="col" className="num">
                  {t('review.supported')}
                </th>
                <th scope="col" className="num">
                  {t('review.required')}
                </th>
                <th scope="col">{t('review.result')}</th>
              </tr>
            </thead>
            <tbody>
              {review.coverage.map((c) => (
                <tr key={c.topic}>
                  <th scope="row">{t(`topic.${c.topic}`)}</th>
                  <td className="num">{c.supported}</td>
                  <td className="num">{c.required}</td>
                  <td>
                    <span className="badge badge--sm" data-tone={c.met ? 'ok' : 'bad'}>
                      {c.met ? <CircleCheck size={12} aria-hidden="true" /> : <CircleX size={12} aria-hidden="true" />}
                      {c.met ? t('review.met') : t('review.below')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h3 className="label">
        {t('review.findings', { open: open.length, total: review.findings.length })}
      </h3>
      {review.findings.length === 0 ? (
        <p className="muted">{t('review.noFindings')}</p>
      ) : (
        <ul className="finding-list">
          {review.findings.map((f) => (
            <li key={f.id} className="finding" data-severity={f.severity}>
              <div className="finding__head">
                <StatusBadge kind="severity" value={f.severity} size="sm" />
                {f.resolved && <span className="tag">{t('review.resolved')}</span>}
              </div>
              <p>{f.message}</p>
              <p className="finding__action">
                <strong>{t('finding.next')}</strong> {f.requiredAction}
              </p>
              {(f.claimIds.length > 0 || f.sourceIds.length > 0) && (
                <div className="finding__links">
                  {f.claimIds.map((id) => {
                    const claim = claimById.get(id);
                    if (!claim) return null;
                    return onOpenClaim ? (
                      <button key={id} type="button" className="chip-btn" onClick={() => onOpenClaim(id)}>
                        {t('review.openClaim', { text: claim.text.length > 48 ? `${claim.text.slice(0, 47)}…` : claim.text })}
                      </button>
                    ) : null;
                  })}
                  {f.sourceIds.map((id) => {
                    const source = sourceById.get(id);
                    return source ? (
                      <span key={id} className="tag">
                        {t('review.source', { title: source.title })}
                      </span>
                    ) : null;
                  })}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
