import { useEffect, useState, type ReactNode } from 'react';
import { Bell, Check, Users } from 'lucide-react';
import { Link, projectPath, useRouter } from '../app/router';
import { useProposals } from '../app/services';
import type { ProposalSummary } from '../domain/proposal';
import { toServiceError } from '../domain/service';
import { Modal } from '../ui/Modal';
import { useTeam } from './context';
import { ROLE_LABELS, type TeamAction, type TeamNotification } from './types';

export function PermissionNotice({ action }: { action: TeamAction }) {
  const { can, snapshot } = useTeam();
  if (can(action)) return null;
  return <p className="team-permission-notice" role="note">当前为{ROLE_LABELS[snapshot.actor.role]}，此处仅可查看。</p>;
}

export function PermissionFields({ action, children }: { action: TeamAction; children: ReactNode }) {
  const { can } = useTeam();
  const allowed = can(action);
  return <fieldset className={`team-permission-fields${allowed ? '' : ' team-permission-fields--readonly'}`} disabled={!allowed} aria-label={allowed ? undefined : '当前身份只读'}>{children}</fieldset>;
}

function NotificationItem({ notification, onNavigate }: { notification: TeamNotification; onNavigate: () => void }) {
  const { store } = useTeam();
  const proposals = useProposals();
  const event = notification.event;
  const [projectName, setProjectName] = useState(event.proposalName ?? '全案完成通知');
  useEffect(() => {
    let active = true;
    void proposals.getProposal(event.proposalId).then((proposal) => { if (active) setProjectName(proposal.name); }).catch(() => { if (active && !event.proposalName) setProjectName('原方案当前不可读取'); });
    return () => { active = false; };
  }, [proposals, event.proposalId, event.proposalName]);
  return <article className={`team-notification${notification.readAt ? '' : ' team-notification--unread'}`}>
    <p className="team-notification__title">{projectName}</p>
    <p>{event.origin === 'explicit-dev-simulation' ? '模拟完成通知（本地演示）' : '全案完成回执'}</p>
    <p>方案修订 {event.proposalRevision} · {event.origin === 'explicit-dev-simulation' ? '模拟版本，无交付文件' : `版本 ${event.deliveredVersionId}`}</p>
    <small>{new Date(event.completedAt).toLocaleString('zh-CN')} · {notification.readAt ? '已读' : '未读'}</small>
    <div className="team-notification__actions">
      <Link className="btn btn--secondary btn--sm" to={projectPath(event.projectId, 'delivery', { receipt: notification.id, version: event.deliveredVersionId, revision: String(event.proposalRevision), proposal: event.proposalId })} onClick={onNavigate}>查看对应方案</Link>
      {!notification.readAt && <button type="button" className="btn btn--ghost btn--sm" onClick={() => store.markNotificationRead(notification.id)}><Check size={14} aria-hidden="true" />标记已读</button>}
    </div>
    <details><summary>回执与版本信息</summary><dl className="team-receipt-meta"><dt>项目</dt><dd>{event.projectId}</dd><dt>方案</dt><dd>{event.proposalId}</dd><dt>运行</dt><dd>{event.runId}</dd><dt>版本</dt><dd>{event.deliveredVersionId}</dd><dt>回执</dt><dd>{event.id}</dd></dl></details>
  </article>;
}

/** Header tools track only sessions observed in this browser and this project. */
export function TeamTools() {
  const { store, snapshot } = useTeam();
  const { route, params, setParams } = useRouter();
  const proposals = useProposals();
  const [panel, setPanel] = useState<'members' | 'inbox' | null>(null);
  const [receiptStatus, setReceiptStatus] = useState('');
  const projectId = route.name === 'project' ? route.projectId : null;
  const receiptId = params.get('receipt');
  const selected = snapshot.notifications.find((item) => item.id === receiptId && item.event.projectId === projectId);
  const selectedId = selected?.id;
  const selectedProposal = selected?.event.proposalId;
  const selectedRevision = selected?.event.proposalRevision;
  useEffect(() => { store.setProject(projectId); }, [store, projectId]);
  useEffect(() => {
    let active = true;
    setReceiptStatus('');
    if (selectedProposal && selectedRevision !== undefined) {
      setReceiptStatus('正在核对回执版本…');
      void proposals.getProposal(selectedProposal).then((proposal) => {
        if (!active) return;
        setReceiptStatus(proposal.revision > selectedRevision ? `此回执对应修订 ${selectedRevision}；当前已到修订 ${proposal.revision}，请核对较新的修改。` : `此回执对应修订 ${selectedRevision}。查看通知不会批准方案。`);
      }).catch(() => { if (active) setReceiptStatus('原方案当前不可读取，回执保留原项目、运行与版本信息。'); });
    }
    return () => { active = false; };
  }, [proposals, selectedId, selectedProposal, selectedRevision]);
  const online = snapshot.presence.filter((item) => item.state === 'online');
  const unread = snapshot.notifications.filter((item) => !item.readAt).length;
  return <>
    <div className="team-tools" aria-label="本地团队协作">
      <button type="button" className="team-presence-trigger" onClick={() => setPanel('members')} aria-label={`本地演示，${online.length}人在线，查看当前项目成员`}>
        <span className="team-avatar" aria-hidden="true">{snapshot.actor.name.slice(0, 1)}</span>
        <span className="team-presence-trigger__copy"><strong>{snapshot.actor.name} · {ROLE_LABELS[snapshot.actor.role]}</strong><small><span className="team-status-dot team-status-dot--online" />本地演示 · {online.length}人在线</small></span>
        <Users size={16} aria-hidden="true" />
      </button>
      <button type="button" className="team-inbox-trigger" onClick={() => setPanel('inbox')} aria-label={`站内通知，${unread}条未读`}><Bell size={18} aria-hidden="true" />{unread > 0 && <span className="team-inbox-count">{unread}</span>}</button>
    </div>
    <Modal open={panel === 'members'} title={projectId ? '当前项目 · 本地团队' : '当前工作台 · 本地团队'} onClose={() => setPanel(null)} size="sm">
      <p className="team-local-note">示例成员只在本浏览器实际打开窗口时显示在线。账号鉴权与跨设备在线尚未接入。</p>
      <ul className="team-member-list">{snapshot.presence.map(({ member, state, sessions, currentWindow }) => <li key={member.id}>
        <span className="team-avatar" aria-hidden="true">{member.name.slice(0, 1)}</span>
        <span className="team-member-copy"><strong>{member.name}{currentWindow ? '（此窗口）' : ''}</strong><span>{ROLE_LABELS[member.role]} · 示例成员</span></span>
        <span className={`team-member-state team-member-state--${state}`}><span className={`team-status-dot team-status-dot--${state}`} />{state === 'online' ? '在线' : state === 'away' ? '离开' : '未连接'}{sessions > 1 ? ` · ${sessions} 窗口` : ''}</span>
      </li>)}</ul>
      <details className="team-role-help"><summary>权限说明 · 最终交付由比稿负责人决定</summary><dl>
        <dt>比稿负责人</dt><dd>管理项目与模式，编辑全部内容，批准各阶段并决定最终交付。</dd>
        <dt>使用者</dt><dd>补充需求、研究与方案内容，参与交流；不批准阶段或管理团队。</dd>
        <dt>人类视觉负责人</dt><dd>编辑视觉内容、选择版式并批准视觉阶段，参与交流；不批准整案交付。</dd>
        <dt>设计师</dt><dd>编辑视觉内容、选择版式并参与交流；不批准阶段。</dd>
        <dt>游客</dt><dd>仅查看，没有编辑、交流或助手操作权限。</dd>
      </dl></details>
      <p className="team-local-note">{snapshot.persistence === 'memory' ? '当前仅在此窗口保存，多窗口同步不可用。' : '在线状态按项目区分；关闭或超过 25 秒无心跳的窗口将离线。'} 演示身份在开发演示页切换。</p>
    </Modal>
    <Modal open={panel === 'inbox'} title="站内通知" onClose={() => setPanel(null)} size="md">
      <p className="team-local-note">全案自动完成通知送达项目指定的比稿负责人。标记已读与阶段批准分别记录。</p>
      {snapshot.actor.role === 'pitch_owner' ? <>
        <label className="team-notification-setting"><input type="checkbox" checked={snapshot.completionAlerts} onChange={(event) => store.setCompletionAlerts(event.target.checked)} />自动模式全案完成时提醒我（所有项目）</label>
        <div className="team-inbox-list">{snapshot.notifications.length ? snapshot.notifications.map((notification) => <NotificationItem key={notification.id} notification={notification} onNavigate={() => setPanel(null)} />) : <p className="team-inbox-empty">暂无通知。只有明确的全案完成回执会进入收件箱。</p>}</div>
      </> : <p className="team-inbox-empty">此演示身份没有收件通知。全案完成通知由指定比稿负责人接收。</p>}
      <p className="team-local-note">外部消息渠道：未连接。当前浏览器关闭后不会继续执行任务。</p>
    </Modal>
    {selected && <aside className="team-receipt-banner" role="status"><div className="team-receipt-banner__head"><strong>{selected.event.origin === 'explicit-dev-simulation' ? '模拟完成通知（本地演示）' : '全案完成回执'}</strong><button type="button" onClick={() => setParams({ receipt: null, version: null, revision: null, proposal: null })}>收起</button></div><span>{receiptStatus}</span>{selected.event.origin === 'explicit-dev-simulation' && <span>仅检验通知投递；没有生成交付文件或改变实际审核结果。</span>}<details><summary>查看此回执</summary><dl className="team-receipt-meta"><dt>回执</dt><dd>{selected.event.id}</dd><dt>运行</dt><dd>{selected.event.runId}</dd><dt>版本</dt><dd>{selected.event.deliveredVersionId}</dd></dl></details></aside>}
  </>;
}

/** Explicit local test actions. Never observes stage 8 or modifies proposal production. */
export function TeamDemoControls() {
  const { store, snapshot, can } = useTeam();
  const proposals = useProposals();
  const [list, setList] = useState<ProposalSummary[]>([]);
  const [selected, setSelected] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  useEffect(() => {
    let active = true;
    void proposals.listProposals().then((items) => { if (active) { setList(items); setSelected(items.find((p) => p.mode === 'automatic')?.id ?? items[0]?.id ?? ''); } }).catch((reason: unknown) => { if (active) setError(toServiceError(reason).message); });
    return () => { active = false; };
  }, [proposals]);
  const item = list.find((proposal) => proposal.id === selected);
  const simulate = async () => {
    setError(''); setMessage(''); setPending(true);
    try {
      const proposal = await proposals.getProposal(selected);
      const notification = await store.simulateCompletion(proposal);
      setMessage(notification ? '模拟通知已送达此项目的示例比稿负责人；重复的运行与版本回执会合并。' : '比稿负责人已关闭完成提醒，此次未投递。');
    } catch (reason) { setError(toServiceError(reason).message); }
    finally { setPending(false); }
  };
  return <section className="card stack team-demo-controls" aria-labelledby="team-demo-title">
    <h2 className="card__title" id="team-demo-title">真人协作 · 本地演示</h2>
    <p className="team-local-note">每个窗口独立选择示例身份。权限仅用于本地演示，真实账号鉴权尚未接入。</p>
    <label className="team-demo-field">此窗口身份<select aria-label="此窗口身份" value={snapshot.actor.id} disabled={snapshot.pendingWrites > 0 || pending} onChange={(event) => { try { store.selectActor(event.target.value); setError(''); } catch (reason) { setError(toServiceError(reason).message); } }}>{snapshot.members.map((member) => <option value={member.id} key={member.id}>{member.name} · {ROLE_LABELS[member.role]}</option>)}</select></label>
    {snapshot.pendingWrites > 0 && <p className="team-local-note" role="status">当前窗口仍有 {snapshot.pendingWrites} 项操作进行中，完成后可切换身份。</p>}
    <div className="team-demo-divider" />
    <label className="team-demo-field">通知测试方案<select aria-label="通知测试方案" value={selected} onChange={(event) => { setSelected(event.target.value); setMessage(''); }} disabled={pending}>{list.map((proposal) => <option key={proposal.id} value={proposal.id}>{proposal.name} · {proposal.mode === 'automatic' ? '自动模式' : '协作模式'}</option>)}</select></label>
    <p className="team-local-note">显式创建模拟完成回执，只检验站内通知，不改变方案阶段、内容或审核。无真实后台完成回执接入，关闭浏览器后不会继续运行。</p>
    <button type="button" className="btn btn--secondary" disabled={!can({ kind: 'demo' }) || pending || !item || item.mode !== 'automatic'} onClick={() => void simulate()}>{pending ? '正在投递…' : '模拟完成通知（本地演示）'}</button>
    {!can({ kind: 'demo' }) && <PermissionNotice action={{ kind: 'demo' }} />}
    {item && item.mode !== 'automatic' && <p className="team-local-note">此方案为协作模式，不能触发自动模式完成通知。</p>}
    {message && <p className="team-demo-result" role="status">{message}</p>}{error && <p className="team-demo-error" role="alert">{error}</p>}
  </section>;
}
