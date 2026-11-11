/**
 * A project: five areas. The proposal workspace (the eight creative stages) is where the work
 * happens; Overview says where things stand; Library holds material; Process & History keeps
 * the agent and review record; Delivery holds the finished proposal and its exports.
 */
import { needsYou } from '../proposal/needs';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Info, X } from 'lucide-react';
import { useServiceQuery } from '../app/query';
import { useProposalFor } from '../app/proposalQuery';
import { Link, projectPath, useRouter } from '../app/router';
import type { WorkspaceView } from '../domain/models';
import { STAGES, type Proposal, type StageId } from '../domain/proposal';
import { useT } from '../i18n';
import { toneFor } from '../proposal/tone';
import { Backed } from '../proposal/ui';
import { ErrorState, Skeleton } from '../ui/kit';
import { DeliveryArea } from './project/DeliveryArea';
import { LibraryArea } from './project/LibraryArea';
import { OverviewArea } from './project/OverviewArea';
import { ProcessArea } from './project/ProcessArea';
import { ProposalArea } from './project/ProposalArea';
import { SetupProposal } from './project/SetupProposal';

type Area = 'overview' | 'proposal' | 'library' | 'process' | 'delivery';
const AREAS: Area[] = ['overview', 'proposal', 'library', 'process', 'delivery'];

/** Where the older record-based views now live. Their links keep working and land in the new place. */
const LEGACY: Partial<Record<WorkspaceView, (p: URLSearchParams) => { view: WorkspaceView; params: Record<string, string> }>> = {
  brief: (p) => ({ view: 'proposal', params: { stage: 'brief', ...Object.fromEntries(p) } }),
  research: (p) => ({ view: 'proposal', params: { stage: 'research', ...(p.get('claim') || p.get('tab') ? { checks: p.get('tab') === 'readiness' ? 'readiness' : 'research' } : {}), ...Object.fromEntries(p) } }),
  handoff: () => ({ view: 'proposal', params: { stage: 'research', checks: 'handoff' } }),
  sources: (p) => ({ view: 'library', params: { tab: 'sources', ...Object.fromEntries(p) } }),
  images: (p) => ({ view: 'library', params: { tab: 'images', ...Object.fromEntries(p) } }),
  jobs: () => ({ view: 'process', params: { tab: 'tasks' } }),
  artifacts: (p) => ({ view: 'process', params: { tab: 'versions', ...Object.fromEntries(p) } }),
};

export function ProjectWorkspace({ projectId, view, artifactId, stage }: { projectId: string; view: WorkspaceView; artifactId: string | null; stage: string | null }) {
  const t = useT();
  // On narrow screens the tab bar scrolls; keep the current tab in view (scrolling only the bar).
  const tabs = useRef<HTMLElement>(null);
  useEffect(() => {
    const bar = tabs.current;
    const cur = bar?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!bar) return;
    // The edge fades only show where there is more to scroll, so they never cover the current tab.
    const edges = () => {
      bar.dataset.more = [bar.scrollLeft > 2 ? 'start' : '', bar.scrollLeft + bar.clientWidth < bar.scrollWidth - 2 ? 'end' : ''].join(' ').trim();
    };
    if (cur && bar.scrollWidth > bar.clientWidth) bar.scrollTo({ left: Math.max(0, cur.offsetLeft - (bar.clientWidth - cur.offsetWidth) / 2) });
    edges();
    bar.addEventListener('scroll', edges, { passive: true });
    window.addEventListener('resize', edges);
    return () => {
      bar.removeEventListener('scroll', edges);
      window.removeEventListener('resize', edges);
    };
  }, [view]);
  const { navigate, params } = useRouter();
  const overview = useServiceQuery(`overview:${projectId}`, (s) => s.getProjectOverview(projectId), { projectId });
  const proposal = useProposalFor(projectId);

  // Older links (WorkBot answers, bookmarks) land in the new structure.
  useEffect(() => {
    const legacy = LEGACY[view];
    if (!legacy) return;
    const target = legacy(params);
    if (artifactId) target.params.artifact = artifactId;
    void navigate(projectPath(projectId, target.view, target.params), { replace: true });
  }, [view, params, artifactId, projectId, navigate]);

  if (LEGACY[view]) return null;
  const area = (AREAS.includes(view as Area) ? view : 'overview') as Area;
  const stageId = (STAGES as readonly string[]).includes(stage ?? '') ? (stage as StageId) : null;

  if (overview.status === 'error' && !overview.data) {
    return (
      <div className="page">
        <ErrorState error={overview.error} onRetry={overview.refetch} />
      </div>
    );
  }

  const p = proposal.data;
  const name = p?.name ?? overview.data?.project.name ?? '';
  const client = p?.client ?? overview.data?.project.client ?? '';

  return (
    <div className="pw">
      <header className="pw-head" data-tone={toneFor(projectId)}>
        <div className="pw-head__inner">
          <Link to="/" className="back-link">
            <ArrowLeft size={14} aria-hidden="true" /> {t('pw.allProjects')}
          </Link>
          <div className="pw-head__row">
            <div className="pw-head__id">
              {name ? (
                <>
                  <p className="pw-kicker pw-head__tab">
                    {client}
                    {p && (
                      <>
                        {' · '}
                        {t(`pw.type.${p.type}`)}
                      </>
                    )}
                  </p>
                  <p className="pw-head__name">{name}</p>
                </>
              ) : (
                <Skeleton lines={1} />
              )}
            </div>
            {p && <ModeBadge proposal={p} />}
          </div>
          <nav className="pw-tabs" aria-label={t('pw.areas')} ref={tabs}>
            {AREAS.map((a) => (
              <Link
                key={a}
                to={a === 'proposal' ? projectPath(projectId, 'proposal', { stage: p?.currentStage ?? 'brief' }) : projectPath(projectId, a)}
                aria-current={area === a ? 'page' : undefined}
                className="pw-tab"
              >
                {t(`pw.area.${a}`)}
                {a === 'overview' && p && attentionCount(p) > 0 && (
                  <span className="pw-tab__count" aria-label={t('pw.attentionCount', { count: attentionCount(p) })}>
                    {attentionCount(p)}
                  </span>
                )}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <div className="pw-body">
        {proposal.status === 'loading' && !p ? (
          <div className="page">
            <Skeleton lines={4} blocks={2} />
          </div>
        ) : proposal.status === 'error' ? (
          <div className="page">
            <ErrorState error={null} onRetry={proposal.refetch} />
          </div>
        ) : !p ? (
          <SetupProposal projectId={projectId} name={name} client={client} />
        ) : (
          <>
            {area === 'overview' && <OverviewArea proposal={p} overview={overview.data ?? null} />}
            {area === 'proposal' && <ProposalArea proposal={p} stage={stageId ?? p.currentStage} />}
            {area === 'library' && <LibraryArea proposal={p} />}
            {area === 'process' && <ProcessArea proposal={p} />}
            {area === 'delivery' && <DeliveryArea proposal={p} />}
          </>
        )}
      </div>
    </div>
  );
}

export function attentionCount(p: Proposal) {
  return needsYou(p).length;
}

/** Mode, checkpoints and the "what is real in this build" legend. */
function ModeBadge({ proposal }: { proposal: Proposal }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className="pw-mode">
      <span className="pw-mode__chip">
        {t(`pw.mode.${proposal.mode}`)}
        {proposal.mode === 'assisted' && <span className="pw-mode__n">{t('pw.checkpointCount', { count: proposal.checkpoints.length })}</span>}
      </span>
      <button type="button" className="pw-mode__legend-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Info size={14} aria-hidden="true" /> {t('pw.whatsReal')}
      </button>
      {open && (
        <div className="pw-legend" role="dialog" aria-label={t('pw.whatsReal')}>
          <button type="button" className="icon-btn pw-legend__close" onClick={() => setOpen(false)} aria-label={t('common.close')}>
            <X size={16} aria-hidden="true" />
          </button>
          <p className="pw-legend__title">{t('pw.whatsReal')}</p>
          <ul>
            <li>
              <Backed as="connected" /> <span>{t('pw.legend.connected')}</span>
            </li>
            <li>
              <Backed as="prototype" /> <span>{t('pw.legend.prototype')}</span>
            </li>
            <li>
              <Backed as="planned" /> <span>{t('pw.legend.planned')}</span>
            </li>
          </ul>
          <p className="small muted">{t('pw.legend.note')}</p>
        </div>
      )}
    </div>
  );
}
