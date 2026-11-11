import { selectionKeys } from '../ui/selectionKeys';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowUpRight, CircleAlert, History, RotateCcw, Send, X } from 'lucide-react';
import { useServiceQuery } from '../app/query';
import { projectPath, useRouter } from '../app/router';
import { useAssistant } from '../app/services';
import { scopeKey, type AssistantContext, type AssistantMessage, type AssistantRef, type AssistantScope, type Conversation, type SuggestedQuestion } from '../domain/assistant';
import { useI18n, useT } from '../i18n';
import { Spinner } from '../ui/kit';
import { useWorkBot, type ScopeChoice } from './context';
import { WorkBotCharacter, type WorkBotAct, type WorkBotMood } from './Character';
import { useTeam } from '../collaboration/context';

/** What the assistant is actually doing, reported by the panel. Drives DOT's expression. */
export interface Lifecycle {
  mood: WorkBotMood;
  pending: boolean;
  unread: boolean;
}

const KIND_ORDER = ['fact', 'interpretation', 'recommendation', 'missing', 'guidance'] as const;

const ACTS: Exclude<WorkBotAct, null>[] = ['look-left', 'look-right', 'wave', 'stretch', 'hop', 'tap'];
/** How long each gesture plays, matching its animation in workbot.css. */
const ACT_MS: Record<Exclude<WorkBotAct, null>, number> = { 'look-left': 1900, 'look-right': 1900, wave: 1400, stretch: 1600, hop: 900, tap: 1300 };

/**
 * Idle life for the launcher: every few seconds WorkBot plays one small gesture (a look to one
 * side, a wave, a stretch, a hop, a tap of the hand), and now and then the "Ask WorkBot" bubble
 * comes out with it and goes away again. It rests while the panel is open, while the page is in
 * the background, and while the person is hovering it. Under reduced motion there are no
 * gestures; the bubble still appears now and then, without animation.
 */
function useIdleLife(active: boolean) {
  const [act, setAct] = useState<WorkBotAct>(null);
  const [bubble, setBubble] = useState(false);
  // Counted across pauses, so hovering and leaving doesn't restart the opening wave each time.
  const rounds = useRef(0);
  useEffect(() => {
    if (!active) {
      setAct(null);
      setBubble(false);
      return;
    }
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));
    let last: WorkBotAct = null;
    const step = () => {
      if (document.hidden) return later(step, 2000);
      rounds.current += 1;
      const first = rounds.current === 1;
      // The first gesture is a wave with the bubble, so the invitation is seen once early on.
      const next = first ? 'wave' : ACTS.filter((a) => a !== last)[Math.floor(Math.random() * (ACTS.length - 1))];
      last = next;
      // Under reduced motion the bubble shows once and then stays away: nothing keeps flashing.
      // Otherwise it speaks with every wave and at least every third gesture: now and then, never constantly.
      const talk = reduce ? first : first || next === 'wave' || rounds.current % 3 === 0;
      if (!reduce) {
        setAct(next);
        later(() => setAct(null), ACT_MS[next]);
      }
      if (talk) {
        setBubble(true);
        later(() => setBubble(false), 3600);
      }
      later(step, 4000 + Math.random() * 4500);
    };
    later(step, rounds.current === 0 ? 2200 : 3000);
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [active]);
  return { act, bubble };
}

/** The DOT button and the side panel. Mounted once in the shell so it survives navigation. */
export function WorkBot() {
  const { open, setOpen } = useWorkBot();
  const { can, snapshot } = useTeam();
  const allowed = can({ kind: 'assistant' });
  const t = useT();
  const [life, setLife] = useState<Lifecycle>({ mood: 'idle', pending: false, unread: false });
  const launcher = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const wasOpen = useRef(open);
  const returning = useRef(false);
  const [near, setNear] = useState(false);
  const idle = useIdleLife(!open && !near && life.mood === 'idle' && !life.pending);
  const status = life.pending || life.mood === 'error' || life.unread;
  const showBubble = status || near || idle.bubble;

  useEffect(() => {
    document.documentElement.dataset.workbot = open && allowed ? 'open' : 'closed';
    if (wasOpen.current && !open) {
      returning.current = true;
      launcher.current?.focus();
      returning.current = false;
    }
    wasOpen.current = open;
    // Return focus to the desktop launcher after closing.
  }, [open, allowed]);
  useEffect(() => { if (!allowed) setOpen(false); }, [allowed, setOpen]);

  if (!allowed) return null;

  return (
    <>
      <button
        ref={launcher}
        type="button"
        className="workbot-launcher"
        aria-expanded={open}
        aria-controls={panelId}
        hidden={open}
        data-mood={life.mood}
        onClick={() => setOpen(true)}
        onPointerEnter={() => setNear(true)}
        onPointerLeave={() => setNear(false)}
        // Only keyboard focus counts as "near": focus returned to the button after the panel
        // closes must not pin the bubble on screen.
        onFocus={(e) => !returning.current && e.currentTarget.matches(':focus-visible') && setNear(true)}
        onBlur={() => setNear(false)}
      >
        {/*
          The bubble says what WorkBot is doing, so state never relies on the character's motion.
          When nothing is going on it comes and goes; its text stays the button's name either way.
        */}
        <span className="workbot-launcher__bubble" data-kind={life.pending ? 'pending' : life.mood === 'error' ? 'error' : life.unread ? 'unread' : 'idle'} data-show={showBubble || undefined}>
          {life.pending ? t('wb.launcherPending') : life.mood === 'error' ? t('wb.launcherError') : life.unread ? t('wb.launcherUnread') : t('wb.bubble')}
          <span className="sr-only">: {t('wb.openSuffix')}</span>
        </span>
        <WorkBotCharacter mood={life.mood} act={idle.act} height={64} className="workbot-launcher__figure" />
      </button>
      <WorkBotPanel key={snapshot.actor.id} id={panelId} onLifecycle={setLife} />
    </>
  );
}

function useScope(): { scope: AssistantScope; options: Array<{ choice: Exclude<ScopeChoice, 'auto'>; label: string }>; projectName: string | null; revision: number | null } {
  const { route } = useRouter();
  const { draft, choice, setChoice } = useWorkBot();
  const t = useT();
  const projectId = route.name === 'project' ? route.projectId : null;
  const overview = useServiceQuery(projectId ? `overview:${projectId}` : 'overview:none', (s) => (projectId ? s.getProjectOverview(projectId) : Promise.resolve(null)), { projectId: projectId ?? undefined });
  const loaded = projectId && overview.data?.project.id === projectId ? overview.data.project : null;
  // The open project is the scope even before (or without) its data loading, so a read error
  // never silently turns a project question into a general one.
  const project = projectId ? { id: projectId, name: loaded?.name ?? t('wb.scope.thisProject'), revision: loaded?.revision ?? null } : null;

  // A different project resets the choice: the panel never carries one project's scope into another.
  const lastProject = useRef(projectId);
  useEffect(() => {
    if (lastProject.current !== projectId) {
      lastProject.current = projectId;
      setChoice('auto');
    }
  }, [projectId, setChoice]);

  const options: Array<{ choice: Exclude<ScopeChoice, 'auto'>; label: string }> = [];
  if (project) options.push({ choice: 'project', label: project.name });
  if (draft && !draft.projectId) options.push({ choice: 'draft', label: t('wb.scope.draft') });
  options.push({ choice: 'general', label: t('wb.scope.general') });

  const resolved: Exclude<ScopeChoice, 'auto'> =
    choice !== 'auto' && options.some((o) => o.choice === choice) ? (choice as Exclude<ScopeChoice, 'auto'>) : project ? 'project' : draft && !draft.projectId ? 'draft' : 'general';
  const scope: AssistantScope = resolved === 'project' && project ? { kind: 'project', projectId: project.id, projectName: project.name } : resolved === 'draft' ? { kind: 'draft' } : { kind: 'general' };
  return { scope, options, projectName: project?.name ?? null, revision: project?.revision ?? null };
}

function WorkBotPanel({ id, onLifecycle }: { id: string; onLifecycle: (life: Lifecycle) => void }) {
  const { open, setOpen, draft, setChoice, pendingAsk, clearPendingAsk, focusDraftField } = useWorkBot();
  const assistant = useAssistant();
  const { t } = useI18n();
  const { route, navigate } = useRouter();
  const { scope, options, revision } = useScope();
  const key = scopeKey(scope);
  const view: AssistantContext['view'] = route.name === 'project' ? route.view : route.name === 'new' ? 'new' : 'dashboard';
  const context = useMemo(() => ({ view, draft: draft && (scope.kind === 'draft' || (scope.kind === 'project' && draft.projectId === scope.projectId)) ? draft : null }), [view, draft, scope]);

  const [conversations, setConversations] = useState<Record<string, Conversation>>({});
  const [suggestions, setSuggestions] = useState<SuggestedQuestion[]>([]);
  const [pending, setPending] = useState<{ key: string; text: string } | null>(null);
  const [failure, setFailure] = useState<{ key: string; text: string; suggestionId: string | null } | null>(null);
  const [text, setText] = useState('');
  const [scopeNoticeKey, setScopeNoticeKey] = useState<string | null>(null);
  const scopeLabel = scope.kind === 'project' ? scope.projectName : scope.kind === 'draft' ? t('wb.scope.draft') : t('wb.scope.general');
  const scopeNotice = scopeNoticeKey === key ? t('wb.scopeChanged', { scope: scopeLabel }) : null;
  const titleId = useId();
  const logRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastKey = useRef(key);

  const load = useCallback(async () => {
    const convo = await assistant.getConversation(scope);
    setConversations((c) => ({ ...c, [convo.key]: convo }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assistant, key]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  useEffect(() => assistant.subscribe(() => {
    setConversations({});
    void load();
  }), [assistant, load]);

  useEffect(() => {
    let alive = true;
    if (open) void assistant.suggestions(scope, context).then((s) => alive && setSuggestions(s));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assistant, open, key, context.view, Boolean(context.draft)]);

  // Say so when the scope changes, so answers are never silently about something else.
  useEffect(() => {
    if (lastKey.current === key) return;
    lastKey.current = key;
    setScopeNoticeKey(key);
  }, [key, scope, t]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const convo = conversations[key];
  const messages = convo?.messages ?? [];

  // DOT's expression follows the request lifecycle: thinking only while a request is in flight,
  // a brief acknowledgement when an answer lands, concern when the last attempt failed.
  const [flash, setFlash] = useState<'welcome' | 'ack' | null>(null);
  const [unread, setUnread] = useState(false);
  const [freshError, setFreshError] = useState(false);
  const openRef = useRef(open);
  openRef.current = open;
  const flashFor = useCallback((kind: 'welcome' | 'ack', ms: number) => {
    setFlash(kind);
    window.setTimeout(() => setFlash((f) => (f === kind ? null : f)), ms);
  }, []);
  const seenOpen = useRef(false);
  useEffect(() => {
    if (!open) {
      // Once the person has opened the panel and seen an error, the launcher stops reporting it.
      // The message and its retry button stay in the conversation.
      if (seenOpen.current) setFreshError(false);
      return;
    }
    seenOpen.current = true;
    setUnread(false);
    flashFor('welcome', 900);
  }, [open, flashFor]);
  useEffect(() => setFreshError(false), [key]);
  const erroring = failure?.key === key || freshError;
  const mood: WorkBotMood = pending ? 'thinking' : erroring ? 'error' : (flash ?? 'idle');
  useEffect(() => onLifecycle({ mood, pending: Boolean(pending), unread }), [mood, pending, unread, onLifecycle]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, pending, open]);

  const ask = useCallback(
    async (question: string, suggestionId: string | null) => {
      if (!question.trim() || pending) return;
      setFailure(null);
      setFreshError(false);
      setScopeNoticeKey(null);
      setPending({ key, text: question });
      try {
        const next = await assistant.ask(scope, { text: question, suggestionId }, context);
        setConversations((c) => ({ ...c, [next.key]: next }));
        const last = next.messages[next.messages.length - 1];
        if (last?.status === 'error') setFreshError(true);
        else flashFor('ack', 1100);
        if (!openRef.current) setUnread(true);
      } catch {
        setFailure({ key, text: question, suggestionId });
      } finally {
        setPending(null);
      }
    },
    [assistant, scope, context, key, pending, flashFor],
  );

  // "Ask WorkBot about this brief" and similar entry points.
  useEffect(() => {
    if (!open || !pendingAsk || pending) return;
    const s = suggestions.find((q) => q.id === pendingAsk);
    if (!s) return;
    clearPendingAsk();
    void ask(s.text, s.id);
  }, [open, pendingAsk, suggestions, pending, ask, clearPendingAsk]);

  const follow = (ref: AssistantRef) => {
    if ('draftField' in ref.target) {
      focusDraftField(ref.target.draftField);
    } else if (scope.kind === 'project') {
      void navigate(projectPath(scope.projectId, ref.target.view, ref.target.params));
    }
    if (window.matchMedia?.('(max-width: 720px)').matches) setOpen(false);
  };

  const onKey = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      setOpen(false);
    }
  };

  const submit = () => {
    const q = text.trim();
    if (!q) return;
    setText('');
    void ask(q, null);
  };


  return (
    <section ref={panelRef} id={id} className="workbot" aria-labelledby={titleId} hidden={!open} onKeyDown={onKey} data-scope={scope.kind}>
      <header className="workbot__head">
        <div className="workbot__title">
          <span className="workbot__avatar" aria-hidden="true">
            <WorkBotCharacter mood={mood} height={30} />
          </span>
          <h2 id={titleId}>{t('wb.name')}</h2>
          {assistant.simulated && <span className="sim-label" title={t('wb.simulatedHint')}>{t('wb.simulated')}</span>}
        </div>
        <div className="workbot__tools">
          <button type="button" className="icon-btn" onClick={() => {
              setFreshError(false);
              setFailure(null);
              void assistant.newConversation(scope).then((c) => setConversations((all) => ({ ...all, [c.key]: c })));
            }} disabled={!messages.length} title={t('wb.new')}>
            <RotateCcw size={16} aria-hidden="true" />
            <span className="sr-only">{t('wb.new')}</span>
          </button>
          <button type="button" className="icon-btn" onClick={() => setOpen(false)} title={t('wb.close')}>
            <X size={18} aria-hidden="true" />
            <span className="sr-only">{t('wb.close')}</span>
          </button>
        </div>
      </header>

      <div className="workbot__scope">
        <span className="small muted" id={`${titleId}-scope`}>
          {t('wb.scopeLabel')}
        </span>
        <div className="scope-switch" role="radiogroup" aria-labelledby={`${titleId}-scope`}>
          {options.map((o) => (
            <button key={o.choice} type="button" role="radio" tabIndex={scope.kind === o.choice ? 0 : -1} onKeyDown={selectionKeys} aria-checked={scope.kind === o.choice} className="scope-switch__opt" onClick={() => setChoice(o.choice)}>
              {o.label}
            </button>
          ))}
        </div>
        <p className="small muted workbot__scope-note">{scope.kind === 'project' ? t('wb.scopeProjectNote') : scope.kind === 'draft' ? t('wb.scopeDraftNote') : t('wb.scopeGeneralNote')}</p>
        {scopeNotice && (
          <p className="workbot__notice" role="status">
            {scopeNotice}
          </p>
        )}
      </div>

      {!assistant.available ? (
        <div className="workbot__empty">
          <CircleAlert size={22} aria-hidden="true" />
          <p className="workbot__empty-title">{t('wb.unavailable')}</p>
          <p className="small muted">{t('wb.unavailableBody')}</p>
        </div>
      ) : (
        <>
          <div ref={logRef} className="workbot__log" role="log" aria-live="polite" aria-label={t('wb.logLabel', { scope: scopeLabel })}>
            {!convo ? (
              <div className="workbot__empty">
                <Spinner />
              </div>
            ) : messages.length === 0 && !pending ? (
              <div className="workbot__empty">
                <p className="workbot__empty-title">{t('wb.emptyTitle', { scope: scopeLabel })}</p>
                <p className="small muted">{t('wb.emptyBody')}</p>
              </div>
            ) : (
              messages.map((m) => <Message key={m.id} message={m} revision={revision} onRef={follow} onAgain={(q) => void ask(q.text, q.suggestionId)} />)
            )}
            {pending?.key === key && (
              <>
                <div className="wb-msg wb-msg--user">
                  <p>{pending.text}</p>
                </div>
                <div className="wb-msg wb-msg--bot wb-msg--typing" role="status">
                  <span className="wb-typing" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                  <span className="small">{t('wb.thinking')}</span>
                </div>
              </>
            )}
            {failure?.key === key && (
              <div className="wb-msg wb-msg--bot wb-msg--error" role="alert">
                <p>{t('wb.failed')}</p>
                <button type="button" className="btn btn--secondary btn--sm" onClick={() => void ask(failure.text, failure.suggestionId)}>
                  <RotateCcw size={14} aria-hidden="true" /> {t('common.tryAgain')}
                </button>
              </div>
            )}
          </div>

          {suggestions.length > 0 && (
            <div className="workbot__suggest" aria-label={t('wb.suggested')} role="group">
              {suggestions.slice(0, messages.length ? 4 : 6).map((s) => (
                <button key={s.id} type="button" className="suggest-chip" onClick={() => void ask(s.text, s.id)} disabled={Boolean(pending)}>
                  {s.text}
                </button>
              ))}
            </div>
          )}

          <form
            className="workbot__composer"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <label htmlFor={`${titleId}-input`} className="sr-only">
              {t('wb.inputLabel', { scope: scopeLabel })}
            </label>
            <textarea
              ref={inputRef}
              id={`${titleId}-input`}
              rows={1}
              value={text}
              placeholder={t('wb.placeholder')}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            <button type="submit" className="btn btn--primary btn--icon" aria-disabled={!text.trim() || Boolean(pending) || undefined} title={t('wb.send')}>
              <Send size={16} aria-hidden="true" />
              <span className="sr-only">{t('wb.send')}</span>
            </button>
          </form>
          <p className="workbot__rules small muted">{t('wb.rules')}</p>
        </>
      )}
    </section>
  );
}

function Message({ message, revision, onRef, onAgain }: { message: AssistantMessage; revision: number | null; onRef: (ref: AssistantRef) => void; onAgain: (q: { text: string; suggestionId: string | null }) => void }) {
  const t = useT();
  if (message.role === 'user')
    return (
      <div className="wb-msg wb-msg--user">
        <p>{message.text}</p>
      </div>
    );
  const stale = message.basedOn && revision !== null && message.basedOn.projectId && revision !== message.basedOn.revision;
  const blocks = [...message.blocks];
  return (
    <article className="wb-msg wb-msg--bot" data-status={message.status}>
      {message.status === 'fallback' && <p className="wb-msg__status">{t('wb.notUnderstood')}</p>}
      {message.status === 'error' && <p className="wb-msg__status" data-tone="bad">{t('wb.errorStatus')}</p>}
      {blocks.map((b, i) => (
        <div key={i} className="wb-block" data-kind={b.kind}>
          <span className="wb-block__kind">{t(`wb.kind.${KIND_ORDER.includes(b.kind) ? b.kind : 'fact'}`)}</span>
          <p>{b.text}</p>
          {b.items.length > 0 && (
            <ul>
              {b.items.map((item, j) => (
                <li key={j}>{item}</li>
              ))}
            </ul>
          )}
          {b.refs.length > 0 && (
            <div className="wb-refs">
              {b.refs.map((r, j) => (
                <button key={j} type="button" className="ref-chip" data-kind={r.kind} onClick={() => onRef(r)}>
                  {r.label}
                  <ArrowUpRight size={12} aria-hidden="true" />
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
      <footer className="wb-msg__foot small muted">
        {message.basedOn && (
          <span>
            <History size={12} aria-hidden="true" />{' '}
            {message.basedOn.briefVersion
              ? t(message.basedOn.briefConfirmed ? 'wb.basedOnConfirmed' : 'wb.basedOnDraft', { v: message.basedOn.briefVersion, r: message.basedOn.revision })
              : t('wb.basedOnRevision', { r: message.basedOn.revision })}
          </span>
        )}
        {message.simulated && <span>{t('wb.simulatedAnswer')}</span>}
      </footer>
      {message.status === 'error' && message.question && (
        <div className="wb-stale" data-tone="bad">
          <p className="small">{t('wb.errorHelp')}</p>
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => onAgain(message.question!)}>
            <RotateCcw size={14} aria-hidden="true" /> {t('common.tryAgain')}
          </button>
        </div>
      )}
      {stale && message.status !== 'error' && message.question && (
        <div className="wb-stale" role="note">
          <p className="small">{t('wb.stale', { r: revision ?? 0 })}</p>
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => onAgain(message.question!)}>
            <RotateCcw size={14} aria-hidden="true" /> {t('wb.askAgain')}
          </button>
        </div>
      )}
    </article>
  );
}
