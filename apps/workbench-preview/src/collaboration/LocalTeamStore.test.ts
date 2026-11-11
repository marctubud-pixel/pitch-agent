import { describe, expect, it } from 'vitest';
import { LocalTeamStore, PRESENCE_TTL_MS } from './LocalTeamStore';
import { TestStorage } from './testSupport';
import type { FullCompletionEvent } from './types';

const completion = (): FullCompletionEvent => ({
  id: 'receipt-1', projectId: 'northline', proposalId: 'proposal-northline', runId: 'run-1', deliveredVersionId: 'delivered-5',
  proposalRevision: 5, mode: 'automatic', outcome: 'full_proposal_ready', origin: 'explicit-dev-simulation', completedAt: '2026-11-08T12:00:00Z',
  checks: { content: 'passed', layout: 'passed', finalReview: 'passed', assets: 'ready', pendingTasks: 0, pendingDecisions: 0 },
});

describe('real local window presence', () => {
  it('aggregates only actual sessions in the same project and expires absent heartbeats', () => {
    let now = 1_000;
    const shared = new TestStorage();
    const owner = new LocalTeamStore({ storage: shared, sessionStorage: new TestStorage(), sessionId: 'owner-tab', now: () => now, autoStart: false });
    const designer = new LocalTeamStore({ storage: shared.fork(), sessionStorage: new TestStorage(), sessionId: 'design-tab', now: () => now, autoStart: false });
    owner.setProject('northline'); designer.setProject('northline'); designer.selectActor('human-designer'); owner.refresh();
    expect(owner.getSnapshot().presence.filter((member) => member.state === 'online').map((p) => p.member.id)).toEqual(['human-owner', 'human-designer']);
    expect(owner.getSnapshot().presence.find((p) => p.member.id === 'human-visual')?.state).toBe('offline');
    designer.setProject('luma'); owner.refresh();
    expect(owner.getSnapshot().presence.find((p) => p.member.id === 'human-designer')?.state).toBe('offline');
    designer.setProject('northline'); now += PRESENCE_TTL_MS + 1; owner.heartbeat();
    expect(owner.getSnapshot().presence.find((p) => p.member.id === 'human-designer')?.state).toBe('offline');
    owner.destroy(); designer.destroy();
  });

  it('keeps actor selection per tab, counts two real windows, and removes closed sessions', () => {
    const shared = new TestStorage();
    const first = new LocalTeamStore({ storage: shared, sessionStorage: new TestStorage(), sessionId: 'one', autoStart: false });
    const second = new LocalTeamStore({ storage: shared.fork(), sessionStorage: new TestStorage(), sessionId: 'two', autoStart: false });
    first.refresh();
    expect(first.getSnapshot().presence.find((p) => p.member.id === 'human-owner')?.sessions).toBe(2);
    second.selectActor('human-guest'); first.refresh();
    expect(first.getActor().role).toBe('pitch_owner');
    expect(second.getActor().role).toBe('guest');
    expect(first.getSnapshot().presence.find((p) => p.member.id === 'human-guest')?.currentWindow).toBe(false);
    second.destroy(); first.refresh();
    expect(first.getSnapshot().presence.find((p) => p.member.id === 'human-guest')?.state).toBe('offline');
    first.destroy();
  });

  it('labels unavailable shared storage as current-window memory only', () => {
    const store = new LocalTeamStore({ storage: null, sessionStorage: null, autoStart: false });
    expect(store.getSnapshot().persistence).toBe('memory');
    expect(store.getSnapshot().presence.filter((p) => p.state === 'online')).toHaveLength(1);
    store.destroy();
  });
});

describe('explicit full-completion inbox', () => {
  it('deduplicates two-tab replay and reload, keeps exact version and owner recipient, and persists read separately', async () => {
    const shared = new TestStorage();
    const first = new LocalTeamStore({ storage: shared, sessionStorage: new TestStorage(), sessionId: 'one', autoStart: false });
    const second = new LocalTeamStore({ storage: shared.fork(), sessionStorage: new TestStorage(), sessionId: 'two', autoStart: false });
    second.selectActor('human-designer');
    await Promise.all([first.acceptCompletion(completion()), second.acceptCompletion(completion())]);
    first.refresh(); second.refresh();
    expect(second.getSnapshot().notifications).toEqual([]);
    const [notification] = first.getSnapshot().notifications;
    expect(notification).toMatchObject({ recipientId: 'human-owner', event: { id: 'receipt-1', deliveredVersionId: 'delivered-5', proposalRevision: 5, projectId: 'northline' } });
    first.markNotificationRead(notification.id);
    await second.acceptCompletion(completion());
    const reloaded = new LocalTeamStore({ storage: shared.fork(), sessionStorage: new TestStorage(), sessionId: 'reload', autoStart: false });
    expect(reloaded.getSnapshot().notifications).toHaveLength(1);
    expect(reloaded.getSnapshot().notifications[0].readAt).not.toBeNull();
    expect(() => second.markNotificationRead(notification.id)).toThrow(/自己的通知/);
    first.destroy(); second.destroy(); reloaded.destroy();
  });

  it('rejects ordinary last-stage/status events, incomplete receipts and reused receipt ids with other versions', async () => {
    const store = new LocalTeamStore({ storage: new TestStorage(), sessionStorage: null, autoStart: false });
    await expect(store.acceptCompletion({ currentStage: 'delivery', status: 'waiting_for_you', progress: '8/8' })).rejects.toMatchObject({ kind: 'validation' });
    await expect(store.acceptCompletion({ ...completion(), checks: { ...completion().checks, pendingTasks: 1 } })).rejects.toMatchObject({ kind: 'validation' });
    await expect(store.acceptCompletion({ ...completion(), mode: 'assisted' })).rejects.toMatchObject({ kind: 'validation' });
    expect(store.getSnapshot().notifications).toHaveLength(0);
    await store.acceptCompletion(completion());
    await expect(store.acceptCompletion({ ...completion(), deliveredVersionId: 'other-version' })).rejects.toMatchObject({ kind: 'idempotency_mismatch' });
    expect(store.getSnapshot().notifications).toHaveLength(1);
    store.destroy();
  });

  it('keeps a stable proposal name in the completion receipt while accepting older nameless receipts', async () => {
    const store = new LocalTeamStore({ storage: new TestStorage(), sessionStorage: null, autoStart: false });
    await store.acceptCompletion({ ...completion(), proposalName: '秋冬主视觉提案' });
    expect(store.getSnapshot().notifications[0].event.proposalName).toBe('秋冬主视觉提案');
    await expect(store.acceptCompletion({ ...completion(), id: 'bad-name', proposalName: 42 })).rejects.toMatchObject({ kind: 'validation' });
    store.destroy();
  });

  it('honors owner completion-alert settings and allows a new version/run to notify again', async () => {
    const store = new LocalTeamStore({ storage: new TestStorage(), sessionStorage: null, autoStart: false });
    expect(store.getSnapshot().completionAlerts).toBe(true);
    store.setCompletionAlerts(false);
    expect(await store.acceptCompletion(completion())).toBeNull();
    store.setCompletionAlerts(true);
    await store.acceptCompletion(completion());
    await store.acceptCompletion({ ...completion(), id: 'receipt-2', runId: 'run-2', deliveredVersionId: 'delivered-6', proposalRevision: 6 });
    expect(store.getSnapshot().notifications).toHaveLength(2);
    store.selectActor('human-operator');
    expect(() => store.setCompletionAlerts(false)).toThrow(/权限/);
    store.destroy();
  });
});
