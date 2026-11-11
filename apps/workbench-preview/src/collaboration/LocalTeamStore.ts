import type { Proposal } from '../domain/proposal';
import { ServiceError } from '../domain/service';
import { canActor, DEMO_MEMBERS, ROLE_LABELS, type FullCompletionEvent, type HumanActor, type PresenceSession, type TeamAction, type TeamNotification, type TeamSnapshot } from './types';

const PREFIX = 'proposal-workbench/team/v1/';
export const PRESENCE_TTL_MS = 25_000;
const OWNER = DEMO_MEMBERS[0];

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

function browserStorage(kind: 'localStorage' | 'sessionStorage'): Storage | null {
  try {
    const storage = globalThis[kind];
    const probe = `${PREFIX}probe`;
    storage.setItem(probe, '1'); storage.removeItem(probe);
    return storage;
  } catch { return null; }
}
function parse(value: string | null): unknown {
  try { return value ? JSON.parse(value) : null; } catch { return null; }
}
function isObject(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null; }
function nonempty(value: unknown): value is string { return typeof value === 'string' && value.length > 0; }
function isPresence(value: unknown): value is PresenceSession {
  return isObject(value) && nonempty(value.sessionId) && DEMO_MEMBERS.some((m) => m.id === value.actorId)
    && (value.projectId === null || nonempty(value.projectId)) && typeof value.lastSeenAt === 'number' && Number.isFinite(value.lastSeenAt) && typeof value.visible === 'boolean';
}
export function isFullCompletionEvent(value: unknown): value is FullCompletionEvent {
  if (!isObject(value) || !isObject(value.checks)) return false;
  const c = value.checks;
  return nonempty(value.id) && nonempty(value.projectId) && nonempty(value.proposalId) && nonempty(value.runId) && nonempty(value.deliveredVersionId)
    && (value.proposalName === undefined || nonempty(value.proposalName))
    && typeof value.proposalRevision === 'number' && Number.isInteger(value.proposalRevision) && value.proposalRevision >= 0
    && value.mode === 'automatic' && value.outcome === 'full_proposal_ready'
    && (value.origin === 'explicit-dev-simulation' || value.origin === 'verified-backend')
    && typeof value.completedAt === 'string' && Number.isFinite(Date.parse(value.completedAt))
    && c.content === 'passed' && c.layout === 'passed' && c.finalReview === 'passed' && c.assets === 'ready' && c.pendingTasks === 0 && c.pendingDecisions === 0;
}
function isNotification(value: unknown): value is TeamNotification {
  return isObject(value) && nonempty(value.id) && value.recipientId === OWNER.id && isFullCompletionEvent(value.event)
    && (value.readAt === null || typeof value.readAt === 'string');
}
const notificationId = (event: FullCompletionEvent) => [event.projectId, event.runId, event.deliveredVersionId, event.outcome].map(encodeURIComponent).join('|');
const sameEvent = (a: FullCompletionEvent, b: FullCompletionEvent) => a.id === b.id && a.projectId === b.projectId && a.proposalId === b.proposalId && a.runId === b.runId && a.deliveredVersionId === b.deliveredVersionId && a.proposalRevision === b.proposalRevision && a.origin === b.origin && a.completedAt === b.completedAt;

export interface LocalTeamOptions {
  storage?: Storage | null; sessionStorage?: Storage | null; sessionId?: string; now?: () => number; autoStart?: boolean;
}

/** Local demo collaboration only. Each presence and receipt has its own immutable storage key. */
export class LocalTeamStore {
  readonly sessionId: string;
  private storage: Storage;
  private session: Storage | null;
  private persistence: 'local' | 'memory';
  private now: () => number;
  private actor: HumanActor;
  private projectId: string | null = null;
  private pendingWrites = 0;
  private listeners = new Set<() => void>();
  private snapshot: TeamSnapshot;
  private timer: ReturnType<typeof setInterval> | null = null;
  private disposed = false;

  constructor(options: LocalTeamOptions = {}) {
    const shared = options.storage === undefined ? browserStorage('localStorage') : options.storage;
    this.storage = shared ?? new MemoryStorage();
    this.persistence = shared ? 'local' : 'memory';
    this.session = options.sessionStorage === undefined ? browserStorage('sessionStorage') : options.sessionStorage;
    this.now = options.now ?? Date.now;
    this.sessionId = options.sessionId ?? globalThis.crypto?.randomUUID?.() ?? `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let actorId: string | null = null;
    try { actorId = this.session?.getItem(`${PREFIX}actor`) ?? null; } catch { /* Session-only fallback. */ }
    this.actor = DEMO_MEMBERS.find((m) => m.id === actorId) ?? OWNER;
    this.snapshot = this.buildSnapshot();
    this.heartbeat();
    if (options.autoStart !== false && typeof window !== 'undefined') {
      this.timer = setInterval(() => this.heartbeat(), 8_000);
      window.addEventListener('storage', this.onStorage);
      window.addEventListener('pagehide', this.onLeave);
      document.addEventListener('visibilitychange', this.onVisibility);
    }
  }

  getActor = (): HumanActor => ({ ...this.actor });
  getSnapshot = (): TeamSnapshot => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  can = (action: TeamAction) => canActor(this.actor, action);
  require(action: TeamAction): HumanActor {
    if (!this.can(action)) throw new ServiceError('forbidden', `当前身份为${ROLE_LABELS[this.actor.role]}，没有执行此操作的权限。`);
    return this.getActor();
  }
  async run<T>(action: TeamAction, operation: (actor: HumanActor) => Promise<T> | T): Promise<T> {
    const actor = this.require(action);
    this.pendingWrites += 1; this.refresh();
    try { return await operation(actor); }
    finally { this.pendingWrites -= 1; this.refresh(); }
  }
  selectActor(memberId: string) {
    if (this.pendingWrites) throw new ServiceError('not_eligible', '当前窗口仍有操作进行中，完成后才能切换演示身份。');
    const member = DEMO_MEMBERS.find((m) => m.id === memberId);
    if (!member) throw new ServiceError('validation', '演示成员不存在。');
    this.actor = member;
    try { this.session?.setItem(`${PREFIX}actor`, member.id); } catch { /* Identity remains per instance. */ }
    this.heartbeat();
  }
  setProject(projectId: string | null) {
    if (this.projectId === projectId) return;
    this.projectId = projectId; this.heartbeat();
  }
  heartbeat() {
    if (this.disposed) return;
    const presence: PresenceSession = { sessionId: this.sessionId, actorId: this.actor.id, projectId: this.projectId, lastSeenAt: this.now(), visible: typeof document === 'undefined' || document.visibilityState !== 'hidden' };
    this.write(`${PREFIX}presence/${this.sessionId}`, JSON.stringify(presence));
    this.refresh();
  }
  refresh = () => {
    this.snapshot = this.buildSnapshot();
    this.listeners.forEach((listener) => listener());
  };
  setCompletionAlerts(enabled: boolean) {
    const actor = this.require({ kind: 'manage' });
    this.write(`${PREFIX}alerts/${actor.id}`, enabled ? 'enabled' : 'disabled');
    this.refresh();
  }
  markNotificationRead(id: string) {
    const notification = this.snapshot.notifications.find((item) => item.id === id);
    if (!notification || notification.recipientId !== this.actor.id) throw new ServiceError('forbidden', '只能标记当前身份自己的通知。');
    this.write(`${PREFIX}read/${id}/${this.actor.id}`, new Date(this.now()).toISOString());
    this.refresh();
  }

  /** Adapter boundary: full receipt required; ordinary stage/status events are rejected. */
  async acceptCompletion(value: unknown): Promise<TeamNotification | null> {
    if (!isFullCompletionEvent(value)) throw new ServiceError('validation', '缺少明确的自动模式全案完成回执。');
    const event = structuredClone(value);
    const commit = () => {
      const existing = this.allNotifications().find((item) => item.event.id === event.id || item.id === notificationId(event));
      if (existing) {
        if (!sameEvent(existing.event, event)) throw new ServiceError('idempotency_mismatch', '此回执已存在，但运行或版本信息不同。');
        return existing;
      }
      if (this.read(`${PREFIX}alerts/${OWNER.id}`) === 'disabled') return null;
      const notification: TeamNotification = { id: notificationId(event), recipientId: OWNER.id, event, readAt: null };
      // Receipt and recipient are one record: replay cannot leave a receipt without its inbox entry.
      this.write(`${PREFIX}notification/${notification.id}`, JSON.stringify(notification));
      this.refresh();
      return notification;
    };
    const locks = globalThis.navigator?.locks;
    return locks ? locks.request(`${PREFIX}receipt-transaction`, async () => commit()) : commit();
  }

  async simulateCompletion(proposal: Proposal): Promise<TeamNotification | null> {
    return this.run({ kind: 'demo' }, async () => {
      if (proposal.mode !== 'automatic') throw new ServiceError('not_eligible', '仅自动模式可测试全案完成通知。');
      const id = `demo-completion:${proposal.id}:${proposal.revision}`;
      const existing = this.allNotifications().find((item) => item.event.id === id);
      const event: FullCompletionEvent = existing?.event ?? {
        id, projectId: proposal.workbenchId, proposalId: proposal.id, proposalName: proposal.name,
        runId: `demo-run:${proposal.id}:${proposal.revision}`, deliveredVersionId: `simulation:${proposal.id}:r${proposal.revision}`,
        proposalRevision: proposal.revision, mode: 'automatic', outcome: 'full_proposal_ready', origin: 'explicit-dev-simulation',
        completedAt: new Date(this.now()).toISOString(),
        checks: { content: 'passed', layout: 'passed', finalReview: 'passed', assets: 'ready', pendingTasks: 0, pendingDecisions: 0 },
      };
      return this.acceptCompletion(event);
    });
  }

  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.timer) clearInterval(this.timer);
    this.storage.removeItem(`${PREFIX}presence/${this.sessionId}`);
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', this.onStorage); window.removeEventListener('pagehide', this.onLeave);
      document.removeEventListener('visibilitychange', this.onVisibility);
    }
    this.listeners.clear();
  }
  private onStorage = (event: StorageEvent) => { if (event.key === null || event.key.startsWith(PREFIX)) this.refresh(); };
  private onVisibility = () => this.heartbeat();
  private onLeave = () => { this.storage.removeItem(`${PREFIX}presence/${this.sessionId}`); };
  private read(key: string): string | null { try { return this.storage.getItem(key); } catch { return null; } }
  private write(key: string, value: string) {
    try { this.storage.setItem(key, value); }
    catch { this.storage = new MemoryStorage(); this.persistence = 'memory'; this.storage.setItem(key, value); }
  }
  private records(segment: string): unknown[] {
    const values: unknown[] = [];
    try {
      for (let index = 0; index < this.storage.length; index += 1) {
        const key = this.storage.key(index);
        if (key?.startsWith(`${PREFIX}${segment}/`)) values.push(parse(this.read(key)));
      }
    } catch { /* Corrupt/blocked storage does not turn samples into real presence. */ }
    return values;
  }
  private allNotifications(): TeamNotification[] {
    return this.records('notification').filter(isNotification).map((item) => ({ ...item, readAt: this.read(`${PREFIX}read/${item.id}/${item.recipientId}`) ?? item.readAt }));
  }
  private buildSnapshot(): TeamSnapshot {
    const sessions = this.records('presence').filter(isPresence).filter((p) => p.projectId === this.projectId && this.now() - p.lastSeenAt < PRESENCE_TTL_MS && p.lastSeenAt <= this.now());
    return {
      actor: this.getActor(), projectId: this.projectId, pendingWrites: this.pendingWrites, members: DEMO_MEMBERS,
      presence: DEMO_MEMBERS.map((member) => {
        const active = sessions.filter((session) => session.actorId === member.id);
        return { member, state: active.some((session) => session.visible) ? 'online' : active.length ? 'away' : 'offline', sessions: active.length, currentWindow: active.some((session) => session.sessionId === this.sessionId) };
      }),
      notifications: this.allNotifications().filter((item) => item.recipientId === this.actor.id).sort((a, b) => b.event.completedAt.localeCompare(a.event.completedAt)),
      completionAlerts: this.read(`${PREFIX}alerts/${OWNER.id}`) !== 'disabled', persistence: this.persistence,
    };
  }
}
