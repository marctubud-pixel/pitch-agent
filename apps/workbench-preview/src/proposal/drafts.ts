import { useCallback, useSyncExternalStore } from 'react';
import type { Contribution, ContributionTarget, StageId } from '../domain/proposal';

/**
 * Unsent "Add an idea" drafts, one per project and stage, so a half-written idea stays with the
 * stage it was started on. Kept for the browser session only (sessionStorage, with an in-memory
 * fallback when storage is blocked). Nothing is sent to the backend until the person submits.
 */
export interface IdeaDraft {
  target?: ContributionTarget;
  open: boolean;
  kind: Contribution['kind'];
  text: string;
  borrow: string;
}

export const EMPTY_DRAFT: IdeaDraft = { open: false, kind: 'comment', text: '', borrow: '' };

const STORAGE_KEY = 'pw.ideaDrafts';
let drafts: Record<string, IdeaDraft> | null = null;
const listeners = new Set<() => void>();

export const draftKey = (proposalId: string, stage: StageId, actorId?: string) => actorId ? `${actorId}::${proposalId}::${stage}` : `${proposalId}::${stage}`;

function load(): Record<string, IdeaDraft> {
  if (drafts) return drafts;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    drafts = raw ? (JSON.parse(raw) as Record<string, IdeaDraft>) : {};
  } catch {
    drafts = {};
  }
  return drafts;
}

function save() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(drafts ?? {}));
  } catch {
    /* storage blocked or full: the draft still lives in memory for this visit */
  }
}

export function readDraft(key: string): IdeaDraft {
  return load()[key] ?? EMPTY_DRAFT;
}

export function writeDraft(key: string, next: IdeaDraft | null) {
  const all = { ...load() };
  if (!next || (!next.open && !next.text && !next.borrow)) delete all[key];
  else all[key] = next;
  drafts = all;
  save();
  listeners.forEach((l) => l());
}

/** What a submission sends. Any later change to one of these fields makes the draft newer than the submission. */
export type DraftSnapshot = Pick<IdeaDraft, 'kind' | 'text' | 'borrow' | 'target'>;

/** Reads the stored draft at the moment of submitting (not a value captured by an earlier render). */
export function snapshotDraft(key: string): DraftSnapshot {
  const { kind, text, borrow, target } = readDraft(key);
  return { kind, text, borrow, target };
}

/**
 * After a submission succeeded: clears the draft only if it is still exactly what was sent. If the
 * person changed the type, the text or the borrowing note while the request was in flight, the
 * newer draft is kept (and its form left open) so it can be edited and sent later. Returns whether
 * the draft was cleared.
 */
export function clearIfUnchanged(key: string, sent: DraftSnapshot): boolean {
  const now = readDraft(key);
  if (now.kind === sent.kind && now.text === sent.text && now.borrow === sent.borrow && JSON.stringify(now.target) === JSON.stringify(sent.target)) {
    writeDraft(key, null);
    return true;
  }
  // A draft the person discarded meanwhile stays discarded; a newer one keeps its form open.
  if (!now.open && (now.text || now.borrow)) writeDraft(key, { ...now, open: true });
  return false;
}

/** Drafts with text in them, for one proposal (stages other than the one on screen included). */
export function pendingDrafts(proposalId: string, actorId?: string): StageId[] {
  const prefix = actorId ? `${actorId}::${proposalId}::` : `${proposalId}::`;
  return Object.entries(load())
    .filter(([k, d]) => k.startsWith(prefix) && d.text.trim())
    .map(([k]) => k.slice(prefix.length) as StageId);
}

/** Test helper: forget every draft. */
export function resetDrafts() {
  drafts = {};
  save();
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The draft for one project and stage, with an updater and a way to discard it. */
export function useIdeaDraft(key: string) {
  const draft = useSyncExternalStore(subscribe, () => readDraft(key));
  const update = useCallback((patch: Partial<IdeaDraft>) => writeDraft(key, { ...readDraft(key), ...patch }), [key]);
  const clear = useCallback(() => writeDraft(key, null), [key]);
  return [draft, update, clear] as const;
}
