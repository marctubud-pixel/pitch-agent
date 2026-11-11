import { useCallback, useEffect, useRef, useState } from 'react';
import { toServiceError, type ServiceError, type WorkbenchService } from '../domain/service';
import { useServiceContext } from './services';

export interface QueryState<T> {
  status: 'loading' | 'error' | 'success';
  data: T | undefined;
  error: ServiceError | null;
  /** A background refresh is in flight while data is shown. */
  refreshing: boolean;
  /** The last background refresh failed; data shown is the last good copy. */
  refreshError: ServiceError | null;
  refetch: () => void;
}

interface Options {
  /** Only refresh on changes to this project (or global changes). */
  projectId?: string;
  /** Keep showing the previous key's data while the new key loads (search boxes, filters). */
  keepPreviousData?: boolean;
}

/**
 * Reads data through the service with loading, error and refresh handling, a shared cache
 * and automatic refresh when the service reports changes.
 */
export function useServiceQuery<T>(key: string, fetcher: (service: WorkbenchService) => Promise<T>, options: Options = {}): QueryState<T> {
  const { service, cache, epoch, refreshToken } = useServiceContext();
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const requestRef = useRef(0);
  const cached = cache.get(key) as T | undefined;
  const [state, setState] = useState<Omit<QueryState<T>, 'refetch'>>(() => ({
    status: cached !== undefined ? 'success' : 'loading',
    data: cached,
    error: null,
    refreshing: false,
    refreshError: null,
  }));
  const { projectId, keepPreviousData } = options;

  const run = useCallback(
    (mode: 'initial' | 'background' | 'reset') => {
      const id = ++requestRef.current;
      const hit = cache.get(key) as T | undefined;
      setState((prev) => {
        if (mode === 'background') return { ...prev, refreshing: true };
        if (hit !== undefined) return { status: 'success', data: hit, error: null, refreshing: true, refreshError: null };
        if (mode === 'initial' && keepPreviousData && prev.data !== undefined) return { ...prev, refreshing: true, error: null };
        return { status: 'loading', data: undefined, error: null, refreshing: false, refreshError: null };
      });
      fetcherRef.current(service).then(
        (data) => {
          if (id !== requestRef.current) return;
          cache.set(key, data);
          setState({ status: 'success', data, error: null, refreshing: false, refreshError: null });
        },
        (raw) => {
          if (id !== requestRef.current) return;
          const error = toServiceError(raw);
          setState((prev) =>
            prev.data !== undefined && (mode === 'background' || (mode === 'initial' && keepPreviousData))
              ? { ...prev, refreshing: false, refreshError: error }
              : { status: 'error', data: undefined, error, refreshing: false, refreshError: null },
          );
        },
      );
    },
    [cache, key, service, keepPreviousData],
  );

  // A new epoch means the data source was swapped (demo scenario, reset): never show old data.
  const lastEpoch = useRef(epoch);
  useEffect(() => {
    const reset = lastEpoch.current !== epoch;
    lastEpoch.current = epoch;
    run(reset ? 'reset' : 'initial');
  }, [run, epoch]);

  const firstToken = useRef(refreshToken);
  useEffect(() => {
    if (refreshToken !== firstToken.current) run('background');
  }, [refreshToken, run]);

  useEffect(
    () =>
      service.subscribe((event) => {
        if (event.type !== 'data-changed') return;
        if (projectId && event.projectId && event.projectId !== projectId) return;
        run('background');
      }),
    [service, run, projectId],
  );

  useEffect(() => () => void (requestRef.current += 1), []);

  const refetch = useCallback(() => run(state.data !== undefined ? 'background' : 'initial'), [run, state.data]);
  return { ...state, refetch };
}
