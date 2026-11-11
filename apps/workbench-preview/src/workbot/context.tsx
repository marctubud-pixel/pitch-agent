import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { BriefDraftContext } from '../domain/assistant';
import { useTeam } from '../collaboration/context';
import type { TaskField } from '../domain/models';

export type ScopeChoice = 'auto' | 'project' | 'draft' | 'general';

interface WorkBotValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  /** An unsaved brief draft on screen, if any. Only the page that owns it sets it. */
  draft: BriefDraftContext | null;
  focusDraftField: (field: TaskField) => void;
  choice: ScopeChoice;
  setChoice: (choice: ScopeChoice) => void;
  /** A question to ask as soon as the panel is ready (from "Ask WorkBot about this brief"). */
  pendingAsk: string | null;
  clearPendingAsk: () => void;
  ask: (suggestionId: string, choice?: ScopeChoice) => void;
  registerDraft: (draft: BriefDraftContext | null, focus: ((f: TaskField) => void) | null) => void;
}

const Ctx = createContext<WorkBotValue | null>(null);

export function WorkBotProvider({ children }: { children: ReactNode }) {
  const { can } = useTeam();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<BriefDraftContext | null>(null);
  const [choice, setChoice] = useState<ScopeChoice>('auto');
  const [pendingAsk, setPendingAsk] = useState<string | null>(null);
  const focusRef = useRef<((f: TaskField) => void) | null>(null);

  const registerDraft = useCallback((next: BriefDraftContext | null, focus: ((f: TaskField) => void) | null) => {
    setDraft(next);
    focusRef.current = focus;
    if (!next) setChoice((c) => (c === 'draft' ? 'auto' : c));
  }, []);

  const value = useMemo<WorkBotValue>(
    () => ({
      open,
      setOpen,
      draft,
      focusDraftField: (f) => focusRef.current?.(f),
      choice,
      setChoice,
      pendingAsk,
      clearPendingAsk: () => setPendingAsk(null),
      ask: (suggestionId, nextChoice) => {
        if (!can({ kind: 'assistant' })) return;
        if (nextChoice) setChoice(nextChoice);
        setPendingAsk(suggestionId);
        setOpen(true);
      },
      registerDraft,
    }),
    [open, draft, choice, pendingAsk, registerDraft, can],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkBot(): WorkBotValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useWorkBot must be used inside WorkBotProvider');
  return ctx;
}

/** Lets WorkBot explain the draft shown on this page. The draft is cleared when the page goes. */
export function useWorkBotDraft(draft: BriefDraftContext | null, focus: (f: TaskField) => void) {
  const { registerDraft } = useWorkBot();
  const focusRef = useRef(focus);
  focusRef.current = focus;
  useEffect(() => {
    registerDraft(draft, (f) => focusRef.current(f));
  }, [draft, registerDraft]);
  useEffect(() => () => registerDraft(null, null), [registerDraft]);
}
