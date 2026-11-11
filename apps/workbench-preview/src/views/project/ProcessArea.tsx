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
import { useServiceQuery } from '../../app/query';
import { Link, projectPath, useRouter } from '../../app/router';
import { STAGES, activeStage, type AgentLevel, type AgentTask, type ContributionTarget, type Proposal, type StageId } from '../../domain/proposal';
import { useT } from '../../i18n';
import { FolderTabs, useTab } from '../../proposal/Tabs';
import { recordDestination, recordTargetKey } from '../../proposal/recordTargets';
import { Backed, ChallengeCard, More, SectionHead } from '../../proposal/ui';
import { Embedded, Time } from '../../ui/kit';
import { ArtifactsView } from '../ArtifactsView';
import { JobsView } from '../JobsView';
import { AreaHead } from './AreaHead';

const TABS = ['agents', 'reviews', 'handoffs', 'decisions', 'tasks', 'versions'] as const;
const LEVEL_ICON: Record<AgentLevel, typeof Bot> = { director: Crown, lead: Users, specialist: Bot, evaluator: Gavel, adversary: Swords };

export function ProcessArea({ proposal: p }: { proposal: Proposal }) {
  const t = useT();
  const { params } = useRouter();
  const [tab, setTab] = useTab(TABS, 'agents');
  const pid = p.workbenchId;
  const research = useServiceQuery(`research:${pid}`, (service) => service.getResearchWorkspace(pid), { projectId: pid });
  const reports = [research.data?.verification, research.data?.readiness].filter((report) => report && !report.outdated);
  const unresolvedFindings = reports.flatMap((report) => report?.findings ?? []).filter((finding) => !finding.resolved).length;
  const creativeReviews = p.reviews.filter((review) => review.stage !== 'research' && review.stage !== 'brief');
  return (
    <div className="page pw-page pw-process area">
      <AreaHead
        title={t('pw.area.process')}
        lede={t('pw.proc.lede')}
        stats={[
          { n: creativeReviews.length, label: '创意评审与质疑', tone: 'lilac', to: projectPath(pid, 'process', { tab: 'reviews' }) },
          { n: p.decisions.length, label: t('pw.proc.stat.decisions'), tone: 'peach', to: projectPath(pid, 'process', { tab: 'decisions' }) },
          { n: p.versions.length, label: '创意版本记录', tone: 'white', to: projectPath(pid, 'process', { tab: 'versions' }) },
          { n: research.data ? reports.length : '—', label: '有效研究检查报告', tone: 'white', to: projectPath(pid, 'proposal', { stage: 'research', checks: 'research' }) },
        ]}
      >
        {research.data && <p className="process-stat-note">当前有效研究报告含 {unresolvedFindings} 条未解决发现，按报告条目计；过期报告不计入上方统计。</p>}
      </AreaHead>
      <FolderTabs tabs={TABS} current={tab} onChange={setTab} label={t('pw.area.process')} render={(x) => t(`pw.proc.tab.${x}`)}>
      {params.get('stage') === 'content_review' && <section className="pw-note">
        <h2>旧流程内容审阅</h2>
        <p>原阶段状态 · {t(`pw.status.${p.stages.content_review.status}`)}</p>
        <p>{p.stages.content_review.summary}</p>
        {p.contentReview?.checks.map((check) => <article key={check.id}><p>{check.question} · {check.outcome}</p><p>{check.note}</p></article>)}
        {p.contentReview?.narrative.map((section) => <details key={section.id}><summary>{section.title}</summary><p>{section.text}</p>{section.before && <p>原文 · {section.before}</p>}{section.changeReason && <p>{section.changeReason}</p>}</details>)}
        {p.contributions.filter((item) => item.stage === 'content_review').map((item) => <article key={item.id}><p>{item.text}</p><p>{item.by} · {item.status} · {item.at}</p>{item.borrow && <p>{item.borrow}</p>}{item.processing?.map((entry) => <p key={entry.id}>{entry.by} · {entry.at} · {entry.status} · {entry.reason}</p>)}{item.response && <p>{item.response}</p>}</article>)}
      </section>}
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
  const current = p.stages[activeStage(p.currentStage)];
  const tasks = [...p.tasks].filter((task) => task.stage === activeStage(p.currentStage)).reverse();
  const handoffs = p.handoffs.filter((handoff) => (handoff.from === activeStage(p.currentStage) || handoff.to === activeStage(p.currentStage)) && handoff.status !== 'accepted');
  const groups: Array<{ title: string; levels: AgentLevel[] }> = [
    { title: '三层制作责任', levels: ['director', 'lead', 'specialist'] },
    { title: '独立评审分支', levels: ['evaluator', 'adversary'] },
  ];
  return (
    <div className="stack process-collaboration">
      <section aria-labelledby="collaboration-now">
        <SectionHead id="collaboration-now" title="当前阶段的协作记录" aside={<Backed as="prototype" note={t('pw.proc.simulatedAgents')} />} />
        <p className="process-scope">本地演示记录；以下状态来自已保存任务，不代表实时调度或真人在线。</p>
        <div className="process-current-stage">
          <div><p className="pw-label">当前阶段 · {t(`pw.stage.${activeStage(p.currentStage)}`)}</p><p><strong>{current.lead}</strong> · {t(`pw.status.${current.status}`)}</p></div>
          <div><p className="pw-label">等待与下一步</p><p>{current.status === 'waiting_for_you' ? '等待有权限的真人决定该阶段。' : current.status === 'needs_revision' ? '阶段需要修改，处理内容见阶段记录。' : current.status === 'in_progress' ? '阶段尚在进行；具体等待对象以任务与交接记录为准。' : current.status === 'done' ? '该阶段已完成；整案交付以最终交付状态为准。' : '阶段尚未开始，未记录执行或等待对象。'}</p></div>
          <Link className="text-link" to={projectPath(p.workbenchId, 'proposal', { stage: activeStage(p.currentStage), ...(current.status === 'waiting_for_you' ? { focus: 'decision' } : {}) })}>{current.status === 'waiting_for_you' ? '查看阶段决定' : '查看阶段上下文'} <ArrowRight size={14} aria-hidden="true" /></Link>
        </div>
        {tasks.length ? <ul className="process-flow-tasks">{tasks.map((task) => <li key={task.id}>
          <div className="process-flow-tasks__head"><strong>{task.task}</strong><span className="pw-tag" data-tone={task.status === 'failed' ? 'warn' : task.status === 'done' ? 'ok' : 'neutral'}>{t(`pw.taskStatus.${task.status}`)}</span></div>
          <p className="process-meta">{task.agent} · {t(`pw.level.${task.level}`)} · 开始记录 <Time iso={task.startedAt} /></p>
          <p className="small">{taskWait(task)}</p>
          <RecordLinks proposal={p} stage={task.stage} target={task.target} />
          <More label="查看执行回执"><code className="process-receipt">{task.receipt}</code></More>
        </li>)}</ul> : <p className="small muted">当前阶段暂无岗位任务记录。<Link className="text-link" to={projectPath(p.workbenchId, 'process', { tab: 'tasks' })}>查看全部任务与回执</Link></p>}
        {handoffs.length > 0 && <ul className="process-waits">{handoffs.map((handoff) => <li key={handoff.id}><strong>{handoff.producer} → {handoff.consumer}</strong> · {t(`pw.proc.handoff.${handoff.status}`)}<p>{handoff.consumerCheck}</p><Link className="text-link" to={projectPath(p.workbenchId, 'process', { tab: 'handoffs' })}>查看交接记录</Link></li>)}</ul>}
        <Link className="text-link process-all-tasks" to={projectPath(p.workbenchId, 'process', { tab: 'tasks' })}>查看全部创意与研究任务 <ArrowRight size={14} aria-hidden="true" /></Link>
      </section>
      <More label="查看岗位职责与独立评审关系">
        <p className="small">{t('pw.proc.agentsLede')}</p>
        {groups.map((group) => <section className="process-role-group" key={group.title} aria-label={group.title}>
          <h3>{group.title}</h3>
          <ul className="pw-org" data-group={group.title}>{group.levels.map((level) => {
            const Icon = LEVEL_ICON[level];
            const names = [...new Set(p.tasks.filter((task) => task.level === level).map((task) => task.agent))];
            return <li key={level} data-level={level}><p className="pw-org__level"><Icon size={16} aria-hidden="true" /> {t(`pw.level.${level}`)}</p><p className="small muted">{t(`pw.level.${level}.desc`)}</p><ul className="pw-org__names">{names.length ? names.map((name) => <li key={name}>{name}</li>) : <li className="muted">{t('pw.proc.noneYet')}</li>}</ul></li>;
          })}</ul>
        </section>)}
        <p className="small process-scope"><ShieldAlert size={14} aria-hidden="true" /> {t('pw.proc.independence')}</p>
      </More>
    </div>
  );
}

function taskWait(task: AgentTask): string {
  if (task.status === 'queued') return '排队记录：未记录具体等待对象，不能据此判断前置任务已完成。';
  if (task.status === 'running') return '执行记录：未记录具体依赖或等待对象；本页不推断实时进度。';
  if (task.status === 'failed') return '执行失败；失败原因及恢复方式以原始回执为准。';
  return '岗位任务已完成；产物是否可用仍取决于评审、研究检查与交接。';
}

function RecordLinks({ proposal: p, stage, target }: { proposal: Proposal; stage: StageId; target?: ContributionTarget }) {
  const destination = recordDestination(p, { stage, target });
  const key = target ? recordTargetKey(target) : null;
  const same = (item: { target?: ContributionTarget }) => Boolean(key && item.target && recordTargetKey(item.target) === key);
  return <div className="process-record-links">
    <p className="process-meta">{destination.binding}</p>
    <div className="cluster cluster--tight"><Link className="text-link" to={destination.to}>{destination.label} <ArrowRight size={13} aria-hidden="true" /></Link>
      {key && p.reviews.some(same) && <Link className="text-link" to={projectPath(p.workbenchId, 'process', { tab: 'reviews', object: key })}>同对象评审</Link>}
      {key && p.handoffs.some(same) && <Link className="text-link" to={projectPath(p.workbenchId, 'process', { tab: 'handoffs', object: key })}>同对象交接</Link>}
      {key && p.versions.some(same) && <Link className="text-link" to={projectPath(p.workbenchId, 'process', { tab: 'versions', object: key })}>同对象版本记录</Link>}
    </div>
  </div>;
}

function matchesObject(target: ContributionTarget | undefined, key: string | null) {
  return !key || Boolean(target && recordTargetKey(target) === key);
}

function ObjectFilter() {
  const { params, setParams } = useRouter();
  return params.get('object') ? <p className="process-scope">仅显示同一显式绑定对象的记录。<button type="button" className="text-link" onClick={() => setParams({ object: null })}>查看全部对象</button></p> : null;
}

function Reviews({ proposal: p }: { proposal: Proposal }) {
  const t = useT();
  const { params, setParams } = useRouter();
  const rawStage = params.get('stage');
  const stage = STAGES.find((item) => item === rawStage) ?? null;
  const rows = p.reviews.filter((r) => (!stage || r.stage === stage) && matchesObject(r.target, params.get('object')));
  return (
    <div>
      <p className="process-scope">这里是创意评审与质疑记录。研究的证据核验、就绪度报告及未解决问题单独记录。<Link className="text-link" to={projectPath(p.workbenchId, 'proposal', { stage: 'research', checks: 'research' })}>查看研究评审与检查</Link></p>
      <ObjectFilter />
      <div className="pw-filter">
        <label htmlFor="rv-stage" className="small">
          {t('pw.proc.stageFilter')}
        </label>
        <select id="rv-stage" value={stage ?? ''} onChange={(e) => setParams({ stage: e.target.value || null, object: null })}>
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
              <RecordLinks proposal={p} stage={r.stage} target={r.target} />
              {r.challenge && <More label="查看质疑与处理记录"><ChallengeCard c={r.challenge} /></More>}
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
  const { params } = useRouter();
  const rows = p.handoffs.filter((handoff) => matchesObject(handoff.target, params.get('object')));
  return (
    <div>
      <div className="pw-sh">
        <p className="small">{t('pw.proc.handoffLede')}</p>
        <Backed as="prototype" />
      </div>
      <ObjectFilter />
      <ul className="pw-records">
        {rows.map((h) => (
          <li key={h.id}>
            <div className="pw-records__head">
              <span className="pw-records__subject">
                {t(`pw.stage.${h.from}`)} <ArrowRight size={14} aria-hidden="true" /> {t(`pw.stage.${h.to}`)}
              </span>
              <span className="pw-tag" data-tone={h.status === 'accepted' ? 'ok' : h.status === 'returned' ? 'warn' : 'neutral'}>
                {t(`pw.proc.handoff.${h.status}`)}
              </span>
            </div>
            <RecordLinks proposal={p} stage={h.target?.stage ?? h.from} target={h.target} />
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
      {rows.length === 0 && <p className="small muted">{t('pw.proc.noHandoffs')}</p>}
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
                {d.kind === 'chosen_despite_review' ? '保留不同意见并继续' : t(`pw.decision.${d.kind}`)} · {t(`pw.stage.${d.stage}`)}
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
      <p className="process-scope">统一查看两类记录：创意岗位记录说明分工与回执，研究执行记录说明证据任务、失败与恢复。岗位完成不等于研究检查通过或成果已可交付。</p>
      <section aria-labelledby="agent-tasks">
        <SectionHead id="agent-tasks" title="创意岗位记录" aside={<Backed as="prototype" note={t('pw.proc.simulatedAgents')} />} />
        <div className="pw-table-wrap">
          <table className="pw-table pw-table--dense">
            <thead>
              <tr>
                <th scope="col">{t('pw.proc.col.task')}</th>
                <th scope="col">{t('pw.proc.col.agent')}</th>
                <th scope="col">阶段与稿件对象</th>
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
                  <td><strong>{t(`pw.stage.${x.stage}`)}</strong><RecordLinks proposal={p} stage={x.stage} target={x.target} /></td>
                  <td>{t(`pw.taskStatus.${x.status}`)}</td>
                  <td>
                    <More label="查看回执"><code className="process-receipt">{x.receipt}</code></More>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="process-research-jobs" aria-labelledby="work-jobs">
        <SectionHead id="work-jobs" title="研究执行记录" aside={<Backed as="connected" />} />
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
  const rows = [...p.versions].reverse().filter((version) => matchesObject(version.target, params.get('object')));
  return (
    <div className="stack">
      <ObjectFilter />
      <section aria-labelledby="ver-list">
        <SectionHead id="ver-list" title={t('pw.proc.versions')} aside={<Backed as="prototype" />} />
        <ul className="pw-records">
          {rows.map((v) => (
            <li key={v.id} data-state={v.state}>
              <div className="pw-records__head">
                <span className="pw-tag">{t(`pw.stage.${v.stage}`)}</span>
                <span className="pw-records__subject">
                  {v.label} · 记录版本 {v.version}
                </span>
                <span className="pw-tag" data-tone={v.state === 'current' ? 'ok' : v.state === 'needs_review' ? 'warn' : 'neutral'}>
                  {t(`pw.ver.${v.state}`)}
                </span>
              </div>
              <p className="small">
                <span className="pw-label">{t('pw.proc.inputs')}</span> {v.inputs.join(' · ')}
              </p>
              <RecordLinks proposal={p} stage={v.stage} target={v.target} />
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
