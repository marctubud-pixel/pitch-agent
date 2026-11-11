/**
 * WorkBot, the contextual assistant. It answers, explains and points to records; it never
 * changes project data. Conversations are kept apart from project records and per scope.
 */
import type { TaskCardDraft } from './intake';
import type { ID, ISODateTime, MappingMode, TaskField, WorkspaceView } from './models';

export type AssistantScope = { kind: 'project'; projectId: ID; projectName: string } | { kind: 'general' } | { kind: 'draft' };

export const scopeKey = (scope: AssistantScope) => (scope.kind === 'project' ? `project:${scope.projectId}` : scope.kind);

/** An unsaved brief being reviewed in the intake flow, passed in so WorkBot can explain it. */
export interface BriefDraftContext {
  projectId: ID | null;
  fields: TaskCardDraft;
  mapping: MappingMode;
  simulated: boolean;
  fileName: string | null;
}

export interface AssistantContext {
  /** Where the person is. Used to order suggestions, never to read other projects. */
  view: WorkspaceView | 'dashboard' | 'new' | null;
  draft: BriefDraftContext | null;
}

export type AnswerKind = 'fact' | 'interpretation' | 'recommendation' | 'missing' | 'guidance';

export type RefTarget = { view: WorkspaceView; params?: Record<string, string> } | { draftField: TaskField };

export interface AssistantRef {
  label: string;
  kind: 'brief_field' | 'claim' | 'source' | 'artifact' | 'review' | 'handoff' | 'job' | 'blocker' | 'stage' | 'image' | 'draft_field';
  target: RefTarget;
}

export interface AnswerBlock {
  kind: AnswerKind;
  text: string;
  items: string[];
  refs: AssistantRef[];
}

export interface AssistantMessage {
  id: ID;
  role: 'user' | 'assistant';
  createdAt: ISODateTime;
  /** The question, for user messages. */
  text: string;
  blocks: AnswerBlock[];
  status: 'answer' | 'fallback' | 'error';
  simulated: boolean;
  /** What a project answer was based on, so the interface can flag answers made stale by later changes. */
  basedOn: { projectId: ID; revision: number; briefVersion: number | null; briefConfirmed: boolean } | null;
  /** The question that produced this answer, so an error or stale answer can be asked again. */
  question: { text: string; suggestionId: string | null } | null;
}

export interface Conversation {
  key: string;
  messages: AssistantMessage[];
}

export interface SuggestedQuestion {
  id: string;
  text: string;
}

export interface AssistantService {
  /** True when answers are simulated from the demo data. */
  readonly simulated: boolean;
  /** False when no assistant backend is connected. */
  readonly available: boolean;
  getConversation(scope: AssistantScope): Promise<Conversation>;
  suggestions(scope: AssistantScope, context: AssistantContext): Promise<SuggestedQuestion[]>;
  /** Adds the question and the answer to the scope's conversation and returns it. */
  ask(scope: AssistantScope, question: { text: string; suggestionId: string | null }, context: AssistantContext): Promise<Conversation>;
  newConversation(scope: AssistantScope): Promise<Conversation>;
  /** Notifies when conversations were cleared (for example after a demo reset). */
  subscribe(listener: () => void): () => void;
}
