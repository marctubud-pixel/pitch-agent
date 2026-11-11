/**
 * Process & History: who did what, how it was reviewed, how work was handed over, every
 * human decision, and the version record with stale dependencies. Kept out of the creative
 * workspace, available in full here.
 *
 * Composition, after the supplied references: Patria's big-number tiles in the header; folder tabs
 * on one sheet; the agent levels as the Atomix spines' coloured columns; reviews as the Atacama
 * "initiatives" rows with the score as a big number; decisions as a dashed timeline.
 */
import { ArrowRight, Bot, Crown, Gavel, ShieldAlert, Swords, UserRound, Users } from 'lucide-react';
import { projectPath, useRouter } from '../../app/router';
import { STAGES, type AgentLevel, type Proposal, type StageId } from '../../domain/proposal';
import { useT } from '../../i18n';
import { FolderTabs, useTab } from '../../proposal/Tabs';
import { Backed, ChallengeCard, SectionHead } from '../../proposal/ui';
import { Embedded, Time } from '../../ui/kit';
import { ArtifactsView } from '../ArtifactsView';
import { JobsView } from '../JobsView';
import { AreaHead } from './AreaHead';

const TABS = ['agents', 'reviews', 'handoffs', 'decisions', 'tasks', 'versions'] as const;
const LEVEL_ICON: Record<AgentLevel, typeof Bot> = { director: Crown, lead: Users, specialist: Bot, evaluator: Gavel, adversary: Swords };

export function ProcessArea({ proposal: p }: { proposal: Proposal }) {
  const t = useT();
  const [tab, setTab] = useTab(TABS, 'agents');
  const pid = p.workbenchId;
  return (
    <div className="page pw-page pw-process area">
      <AreaHead
        title={t('pw.area.process')}
        lede={t('pw.proc.lede')}
        stats={[
          { n: p.reviews.length, label: t('pw.proc.stat.reviews'), tone: 'lilac', to: projectPath(pid, 'process', { tab: 'reviews' }) },
          { n: p.decisions.length, label: t('pw.proc.stat.decisions'), tone: 'peach', to: projectPath(pid, 'process', { tab: 'decisions' }) },
          { n: p.versions.length, label: t('pw.proc.stat.versions'), tone: 'white', to: projectPath(pid, 'process', { tab: 'versions' }) },
        ]}
      />
      <FolderTabs tabs={TABS} current={tab} onChange={setTab} label={t('pw.area.process')} render={(x) => t(`pw.proc.tab.${x}`)}>
      {tab === 'agents' && <Agents proposal={p} />}
      {tab === 'reviews' && <Reviews proposal={p} />}
      {tab === 'handoffs' && <Handoffs proposal={p} />}
      {tab === 'decisions' && <Decisions proposal={p} />}
      {tab === 'tasks' && <Tasks proposal={p} />}
      {tab === 'versions' && <Versions proposal={p} />}
      </FolderTabs>
    </div>
  );
}

function Agents({ proposal: p }: { proposal: Proposal }) {
  const t = useT();
  const byLevel = (l: AgentLevel) => [...new Set(p.tasks.filter((x) => x.level === l).map((x) => x.agent))];
  const levels: AgentLevel[] = ['director', 'lead', 'specialist', 'evaluator', 'adversary'];
  return (
    <div>
      <div className="pw-sh">
        <p className="small">{t('pw.proc.agentsLede')}</p>
        <Backed as="prototype" note={t('pw.proc.simulatedAgents')} />
      </div>
      <ol className="pw-org">
        {levels.map((l) => {
          const Icon = LEVEL_ICON[l];
          const names = byLevel(l);
          return (
            <li key={l} data-level={l}>
              <span className="pw-org__n" aria-hidden="true">
                {String(levels.indexOf(l) + 1).padStart(2, '0')}
              </span>
              <p className="pw-org__level">
                <Icon size={16} aria-hidden="true" /> {t(`pw.level.${l}`)}
              </p>
              <p className="small muted">{t(`pw.level.${l}.desc`)}</p>
              <ul className="pw-org__names">
                {names.length ? names.map((n) => <li key={n}>{n}</li>) : <li className="muted">{t('pw.proc.noneYet')}</li>}
              </ul>
            </li>
          );
        })}
      </ol>
      <p className="small muted">
        <ShieldAlert size={14} aria-hidden="true" /> {t('pw.proc.independence')}
      </p>
    </div>
  );
}

function Reviews({ proposal: p }: { proposal: Proposal }) {
  const t = useT();
  const { params, setParams } = useRouter();
  const stage = params.get('stage') as StageId | null;
  const rows = p.reviews.filter((r) => !stage || r.stage === stage);
  return (
    <div>
      <div className="pw-filter">
        <label htmlFor="rv-stage" className="small">
          {t('pw.proc.stageFilter')}
        </label>
        <select id="rv-stage" value={stage ?? ''} onChange={(e) => setParams({ stage: e.target.value || null })}>
          <option value="">{t('pw.proc.allStages')}</option>
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {t(`pw.stage.${s}`)}
            </option>
          ))}
        </select>
        <Backed as="prototype" />
      </div>
      {rows.length === 0 ? (
        <p className="small muted">{t('pw.proc.noReviews')}</p>
      ) : (
        <ul className="pw-records">
          {rows.map((r) => (
            <li key={r.id}>
              <div className="pw-records__head">
                <span className="pw-tag">{t(`pw.stage.${r.stage}`)}</span>
                <span className="pw-records__subject">{r.subject}</span>
                {r.average !== null && (
                  <span className="pw-records__score">
                    {r.average.toFixed(1)}
                    <small>/5</small>
                  </span>
                )}
              </div>
              <p className="small">
                {r.evaluator} · {r.verdict}
              </p>
              {r.challenge && <ChallengeCard c={r.challenge} />}
              {r.directorResolution && (
                <p className="small">
                  <span className="pw-label">{t('pw.proc.director')}</span> {r.directorResolution}
                </p>
              )}
              <p className="small muted">
                <Time iso={r.at} />
              </p>
            </li>
          ))}
        </ul>
      )}
      <p className="small muted area-footnote">{t('pw.proc.evidenceReviews')}</p>
    </div>
  );
}

function Handoffs({ proposal: p }: { proposal: Proposal }) {
  const t = useT();
  return (
    <div>
      <div className="pw-sh">
        <p className="small">{t('pw.proc.handoffLede')}</p>
        <Backed as="prototype" />
      </div>
      <ul className="pw-records">
        {p.handoffs.map((h) => (
          <li key={h.id}>
            <div className="pw-records__head">
              <span className="pw-records__subject">
                {t(`pw.stage.${h.from}`)} <ArrowRight size={14} aria-hidden="true" /> {t(`pw.stage.${h.to}`)}
              </span>
              <span className="pw-tag" data-tone={h.status === 'accepted' ? 'ok' : h.status === 'returned' ? 'warn' : 'neutral'}>
                {t(`pw.proc.handoff.${h.status}`)}
              </span>
            </div>
            <div className="grid-2 small">
              <p>
                <span className="pw-label">{h.producer}</span> {h.producerCheck}
              </p>
              <p>
                <span className="pw-label">{h.consumer}</span> {h.consumerCheck}
              </p>
            </div>
            <p className="small muted">
              <Time iso={h.at} />
            </p>
          </li>
        ))}
      </ul>
      {p.handoffs.length === 0 && <p className="small muted">{t('pw.proc.noHandoffs')}</p>}
      <p className="small muted">{t('pw.proc.researchHandoff')}</p>
    </div>
  );
}

function Decisions({ proposal: p }: { proposal: Proposal }) {
  const t = useT();
  const rows = [...p.decisions].reverse();
  return (
    <div>
      <p className="small">{t('pw.proc.decisionsLede')}</p>
      <ul className="pw-records pw-records--timeline">
        {rows.map((d) => (
          <li key={d.id} data-kind={d.kind}>
            <div className="pw-records__head">
              <UserRound size={16} aria-hidden="true" />
              <span className="pw-records__subject">
                {t(`pw.decision.${d.kind}`)} · {t(`pw.stage.${d.stage}`)}
              </span>
            </div>
            {d.comment && <p>“{d.comment}”</p>}
            {d.reviewerPosition && (
              <p className="small">
                <span className="pw-label">{t('pw.proc.reviewersSaid')}</span> {d.reviewerPosition}
              </p>
            )}
            <p className="small muted">
              {d.by} · <Time iso={d.at} />
            </p>
          </li>
        ))}
      </ul>
      {rows.length === 0 && <p className="small muted">{t('pw.ov.noDecisions')}</p>}
    </div>
  );
}

function Tasks({ proposal: p }: { proposal: Proposal }) {
  const t = useT();
  return (
    <div className="stack">
      <section aria-labelledby="agent-tasks">
        <SectionHead id="agent-tasks" title={t('pw.proc.agentTasks')} aside={<Backed as="prototype" note={t('pw.proc.simulatedAgents')} />} />
        <div className="pw-table-wrap">
          <table className="pw-table pw-table--dense">
            <thead>
              <tr>
                <th scope="col">{t('pw.proc.col.task')}</th>
                <th scope="col">{t('pw.proc.col.agent')}</th>
                <th scope="col">{t('pw.proc.col.stage')}</th>
                <th scope="col">{t('pw.proc.col.status')}</th>
                <th scope="col">{t('pw.proc.col.receipt')}</th>
              </tr>
            </thead>
            <tbody>
              {[...p.tasks].reverse().map((x) => (
                <tr key={x.id}>
                  <td>{x.task}</td>
                  <td>
                    {x.agent} <span className="muted small">({t(`pw.level.${x.level}`)})</span>
                  </td>
                  <td>{t(`pw.stage.${x.stage}`)}</td>
                  <td>{t(`pw.taskStatus.${x.status}`)}</td>
                  <td>
                    <code>{x.receipt}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section aria-labelledby="work-jobs">
        <SectionHead id="work-jobs" title={t('pw.proc.jobs')} aside={<Backed as="connected" />} />
        <Embedded>
          <JobsView projectId={p.workbenchId} />
        </Embedded>
      </section>
    </div>
  );
}

function Versions({ proposal: p }: { proposal: Proposal }) {
  const t = useT();
  const { params } = useRouter();
  const artifact = params.get('artifact');
  const rows = [...p.versions].reverse();
  return (
    <div className="stack">
      <section aria-labelledby="ver-list">
        <SectionHead id="ver-list" title={t('pw.proc.versions')} aside={<Backed as="prototype" />} />
        <ul className="pw-records">
          {rows.map((v) => (
            <li key={v.id} data-state={v.state}>
              <div className="pw-records__head">
                <span className="pw-tag">{t(`pw.stage.${v.stage}`)}</span>
                <span className="pw-records__subject">
                  {v.label} · v{v.version}
                </span>
                <span className="pw-tag" data-tone={v.state === 'current' ? 'ok' : v.state === 'needs_review' ? 'warn' : 'neutral'}>
                  {t(`pw.ver.${v.state}`)}
                </span>
              </div>
              <p className="small">
                <span className="pw-label">{t('pw.proc.inputs')}</span> {v.inputs.join(' · ')}
              </p>
              {v.impact && <p className="small pw-impact">{v.impact}</p>}
              <p className="small muted">
                <Time iso={v.at} />
              </p>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="ver-docs">
        <SectionHead id="ver-docs" title={t('pw.proc.documents')} aside={<Backed as="connected" />} />
        <Embedded>
          <ArtifactsView projectId={p.workbenchId} artifactId={artifact} />
        </Embedded>
      </section>
    </div>
  );
}
