import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react';
import type { WorkspaceView } from '../domain/models';
import { useT } from '../i18n';
import { useConfirm } from './confirm';

export type Route =
  | { name: 'dashboard' }
  | { name: 'new' }
  | { name: 'dev' }
  | { name: 'project'; projectId: string; view: WorkspaceView; artifactId: string | null; stage: string | null }
  | { name: 'not_found'; path: string };

const VIEWS: WorkspaceView[] = ['overview', 'brief', 'research', 'sources', 'images', 'handoff', 'jobs', 'artifacts', 'proposal', 'library', 'process', 'delivery'];

export function parsePath(path: string): Route {
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts.length === 0) return { name: 'dashboard' };
  if (parts.length === 1 && parts[0] === 'new') return { name: 'new' };
  if (parts.length === 1 && parts[0] === 'dev') return { name: 'dev' };
  if (parts[0] === 'p' && parts[1]) {
    const view = (parts[2] ?? 'overview') as WorkspaceView;
    if (!VIEWS.includes(view)) return { name: 'not_found', path };
    if (view === 'artifacts') return { name: 'project', projectId: parts[1], view, artifactId: parts[3] ?? null, stage: null };
    if (view === 'proposal') return parts.length > 4 ? { name: 'not_found', path } : { name: 'project', projectId: parts[1], view, artifactId: null, stage: parts[3] ?? null };
    if (parts.length > 3) return { name: 'not_found', path };
    return { name: 'project', projectId: parts[1], view, artifactId: null, stage: null };
  }
  return { name: 'not_found', path };
}

export function projectPath(projectId: string, view: WorkspaceView = 'overview', params?: Record<string, string>): string {
  const base = view === 'overview' ? `/p/${encodeURIComponent(projectId)}` : `/p/${encodeURIComponent(projectId)}/${view}`;
  const artifact = view === 'artifacts' && params?.artifact ? `/${encodeURIComponent(params.artifact)}` : view === 'proposal' && params?.stage ? `/${encodeURIComponent(params.stage)}` : '';
  const rest = { ...params };
  if (view === 'artifacts') delete rest.artifact;
  if (view === 'proposal') delete rest.stage;
  const qs = new URLSearchParams(rest).toString();
  return `${base}${artifact}${qs ? `?${qs}` : ''}`;
}

interface Blocker {
  message: string;
}

interface RouterValue {
  path: string;
  params: URLSearchParams;
  route: Route;
  navigate: (to: string, options?: { replace?: boolean }) => Promise<boolean>;
  setParams: (updates: Record<string, string | null>) => void;
  registerBlocker: (blocker: Blocker | null) => void;
}

const RouterContext = createContext<RouterValue | null>(null);

function split(location: string) {
  const [path, query = ''] = location.split('?');
  return { path: path || '/', query };
}

/**
 * Small router. "hash" keeps the location in the URL so a refresh returns to the same view;
 * "memory" is used for the single-file build, where the host frame owns the URL.
 */
export function RouterProvider({ mode, children }: { mode: 'hash' | 'memory'; children: ReactNode }) {
  const confirm = useConfirm();
  const t = useT();
  const read = () => (mode === 'hash' ? window.location.hash.replace(/^#/, '') || '/' : '/');
  const [location, setLocation] = useState(read);
  const blockerRef = useRef<Blocker | null>(null);
  const currentRef = useRef(location);
  currentRef.current = location;
  const ignoreNextHash = useRef(false);

  const commit = useCallback(
    (to: string, replace: boolean) => {
      if (mode === 'hash') {
        if (replace) window.history.replaceState(null, '', `#${to}`);
        else {
          ignoreNextHash.current = true;
          window.location.hash = to;
        }
      }
      setLocation(to);
    },
    [mode],
  );

  const shouldProceed = useCallback(
    async (to: string) => {
      const blocker = blockerRef.current;
      if (!blocker || split(to).path === split(currentRef.current).path) return true;
      return confirm({ title: t('router.leaveTitle'), body: blocker.message, confirmLabel: t('router.leave'), cancelLabel: t('router.stay'), tone: 'danger' });
    },
    [confirm, t],
  );

  const navigate = useCallback(
    async (to: string, options: { replace?: boolean } = {}) => {
      if (to === currentRef.current) return true;
      if (!(await shouldProceed(to))) return false;
      commit(to, Boolean(options.replace));
      if (split(to).path !== split(currentRef.current).path) window.scrollTo?.({ top: 0 });
      return true;
    },
    [commit, shouldProceed],
  );

  useEffect(() => {
    if (mode !== 'hash') return;
    const onHash = async () => {
      if (ignoreNextHash.current) {
        ignoreNextHash.current = false;
        return;
      }
      const to = read();
      const previous = currentRef.current;
      if (to === previous) return;
      if (blockerRef.current && split(to).path !== split(previous).path) {
        window.history.replaceState(null, '', `#${previous}`);
        if (await shouldProceed(to)) {
          blockerRef.current = null;
          commit(to, true);
        }
        return;
      }
      setLocation(to);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, commit, shouldProceed]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!blockerRef.current) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  const value = useMemo<RouterValue>(() => {
    const { path, query } = split(location);
    const params = new URLSearchParams(query);
    return {
      path,
      params,
      route: parsePath(path),
      navigate,
      setParams: (updates) => {
        const next = new URLSearchParams(query);
        for (const [k, v] of Object.entries(updates)) {
          if (v === null || v === '') next.delete(k);
          else next.set(k, v);
        }
        const qs = next.toString();
        commit(`${path}${qs ? `?${qs}` : ''}`, true);
      },
      registerBlocker: (blocker) => {
        blockerRef.current = blocker;
      },
    };
  }, [location, navigate, commit]);

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter(): RouterValue {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error('useRouter must be used inside RouterProvider');
  return ctx;
}

/** Warns before leaving the current page while `when` is true (in-app links, back button, tab close). */
export function useNavigationBlocker(when: boolean, message: string) {
  const { registerBlocker } = useRouter();
  useEffect(() => {
    registerBlocker(when ? { message } : null);
    return () => registerBlocker(null);
  }, [when, message, registerBlocker]);
}

interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: string;
  replace?: boolean;
}

export function Link({ to, replace, onClick, children, ...rest }: LinkProps) {
  const { navigate } = useRouter();
  const handle = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    void navigate(to, { replace });
  };
  return (
    <a href={`#${to}`} onClick={handle} {...rest}>
      {children}
    </a>
  );
}
