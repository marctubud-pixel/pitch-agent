import type {PendingWriteKind} from '../domain/service';
import type { StageId } from '../domain/proposal';

export type HumanRole = 'pitch_owner' | 'operator' | 'visual_lead' | 'designer' | 'guest';
export interface HumanActor { id: string; name: string; role: HumanRole }
export type TeamAction =
  | { kind: 'read' }
  | { kind: 'manage' | 'edit_brief' | 'edit_research' | 'edit_visual' | 'edit_narrative' | 'communicate' | 'workflow' | 'assistant' | 'demo' }
  | { kind: 'decide'; stage: StageId };

export const ROLE_LABELS: Record<HumanRole, string> = {
  pitch_owner: '比稿负责人', operator: '使用者', visual_lead: '人类视觉负责人', designer: '设计师', guest: '游客',
};
export const DEMO_MEMBERS: readonly HumanActor[] = [
  { id: 'human-owner', name: '林予', role: 'pitch_owner' },
  { id: 'human-operator', name: '周宁', role: 'operator' },
  { id: 'human-visual', name: '陈澄', role: 'visual_lead' },
  { id: 'human-designer', name: '许言', role: 'designer' },
  { id: 'human-guest', name: '访客', role: 'guest' },
];

export function canActor(actor: HumanActor, action: TeamAction): boolean {
  if (action.kind === 'read' || actor.role === 'pitch_owner') return true;
  if (actor.role === 'guest') return false;
  switch (action.kind) {
    case 'assistant': case 'communicate': return true;
    case 'edit_visual': return true;
    case 'edit_brief': case 'edit_research': case 'edit_narrative': return actor.role === 'operator';
    case 'decide': return actor.role === 'visual_lead' && action.stage === 'visual';
    case 'manage': case 'workflow': case 'demo': return false;
    default: { const exhaustive: never = action; return exhaustive; }
  }
}

export interface PresenceSession {
  sessionId: string; actorId: string; projectId: string | null; lastSeenAt: number; visible: boolean;
}
export interface MemberPresence {
  member: HumanActor; state: 'online' | 'away' | 'offline'; sessions: number; currentWindow: boolean;
}
/** Only explicit full-completion receipts enter the inbox. No stage observer is connected. */
export interface FullCompletionEvent {
  id: string; projectId: string; proposalId: string; proposalName?: string; runId: string; deliveredVersionId: string;
  proposalRevision: number; mode: 'automatic'; outcome: 'full_proposal_ready';
  origin: 'explicit-dev-simulation' | 'verified-backend'; completedAt: string;
  checks: { content: 'passed'; layout: 'passed'; finalReview: 'passed'; assets: 'ready'; pendingTasks: 0; pendingDecisions: 0 };
}
export interface TeamNotification {
  id: string; recipientId: string; event: FullCompletionEvent; readAt: string | null;
}
export interface TeamSnapshot {
  actor: HumanActor; projectId: string | null; pendingWrites: number;
  members: readonly HumanActor[]; presence: MemberPresence[]; notifications: TeamNotification[];
  completionAlerts: boolean; persistence: 'local' | 'memory';
}

export function pendingWriteAction(kind: PendingWriteKind): TeamAction {
  if (kind === 'create_project') return {kind: 'manage'};
  if (kind === 'save_brief') return {kind: 'edit_brief'};
  if (kind === 'add_source') return {kind: 'edit_research'};
  return {kind: 'workflow'};
}
