import { useCallback, useEffect, useRef, useState } from 'react';
import type { ID } from '../domain/models';
import type { Proposal, ProposalService, ProposalSummary } from '../domain/proposal';
import { useT } from '../i18n';
import { useFeedback } from './feedback';
import { useServiceContext } from './services';

export interface ProposalQuery<T> {
  status: 'loading' | 'error' | 'success';
  data: T | undefined;
  error: Error | null;
  refetch: () => void;
}

/** Reads from the proposal service and refreshes when it, or the linked Workbench data, changes. */
function useProposalRead<T>(read: (svc: ProposalService) => Promise<T>, deps: unknown[], match: (changed: ID | null) => boolean): ProposalQuery<T> {
  const { proposals, service, epoch } = useServiceContext();
  const [state, setState] = useState<Omit<ProposalQuery<T>, 'refetch'>>({ status: 'loading', data: undefined, error: null });
  const readRef = useRef(read);
  readRef.current = read;
  const seq = useRef(0);
  const load = useCallback(
    (quiet: boolean) => {
      const id = ++seq.current;
      if (!quiet) setState((s) => (s.data === undefined ? { status: 'loading', data: undefined, error: null } : s));
      readRef.current(proposals).then(
        (data) => id === seq.current && setState({ status: 'success', data, error: null }),
        (error: Error) => id === seq.current && setState((s) => (s.data !== undefined && quiet ? s : { status: 'error', data: undefined, error })),
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [proposals, ...deps],
  );
  useEffect(() => load(false), [load, epoch]);
  const matchRef = useRef(match);
  matchRef.current = match;
  useEffect(() => proposals.subscribe((changed) => matchRef.current(changed) && load(true)), [proposals, load]);
  useEffect(() => service.subscribe((e) => (e.type === 'data-changed' || e.type === 'reset' || e.type === 'scenario-changed') && load(true)), [service, load]);
  return { ...state, refetch: () => load(false) };
}

export function useProposalList() {
  return useProposalRead<ProposalSummary[]>((s) => s.listProposals(), [], () => true);
}

/** The proposal linked to a Workbench project (URLs use the Workbench project ID). */
export function useProposalFor(workbenchId: ID) {
  const idRef = useRef<ID | null>(null);
  const q = useProposalRead<Proposal | null>(
    async (s) => {
      const p = await s.findByWorkbenchId(workbenchId);
      idRef.current = p?.id ?? null;
      return p;
    },
    [workbenchId],
    // Until a proposal exists, any change may be the one that creates it.
    (changed) => changed === null || idRef.current === null || changed === idRef.current,
  );
  return q;
}

/** Runs a proposal mutation with pending and error state, and a toast on success. */
export function useProposalAction() {
  const { proposals } = useServiceContext();
  const { notify } = useFeedback();
  const t = useT();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(
    async (key: string, fn: (svc: ProposalService) => Promise<unknown>, success?: string) => {
      if (pending) return false;
      setPending(key);
      setError(null);
      try {
        await fn(proposals);
        if (success) notify({ tone: 'success', message: success });
        return true;
      } catch (e) {
        setError((e as Error).message || t('common.failed'));
        return false;
      } finally {
        setPending(null);
      }
    },
    [proposals, notify, pending, t],
  );
  return { run, pending, error, clearError: () => setError(null) };
}
