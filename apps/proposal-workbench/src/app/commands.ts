import { useCallback, useRef, useState } from 'react';
import type { CommandMeta, MutationResult } from '../domain/models';
import { toServiceError, type ServiceError } from '../domain/service';
import { useT } from '../i18n';
import { useFeedback } from './feedback';

export interface CommandSpec<T> {
  /** Short human label, used in feedback ("Run verification"). */
  label: string;
  /** Everything that defines the request. An unchanged retry has an identical payload. */
  payload: unknown;
  expectedRevision: number;
  execute: (meta: CommandMeta) => Promise<MutationResult<T>>;
  /** Toast text on success. null for no toast. */
  success?: string | null | ((result: MutationResult<T>) => string | null);
  onSuccess?: (result: MutationResult<T>) => void;
}

export interface CommandState {
  status: 'idle' | 'pending' | 'success' | 'error' | 'conflict';
  label: string | null;
  error: ServiceError | null;
  commandId: string | null;
  /** The next run of the same request will reuse commandId. */
  willReuseCommandId: boolean;
}

const IDLE: CommandState = { status: 'idle', label: null, error: null, commandId: null, willReuseCommandId: false };

function fingerprint(label: string, payload: unknown): string {
  return JSON.stringify([label, payload]);
}

export function newCommandId(): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `cmd-${random}`;
}

interface LastAttempt {
  spec: CommandSpec<unknown>;
  fingerprint: string;
  commandId: string;
  outcome: 'pending' | 'done' | 'retryable' | 'final';
}

/**
 * The one place mutations run. It generates command IDs, reuses the ID for an unchanged retry,
 * blocks double submission, reports conflicts to the shared dialog and shows feedback.
 */
export function useCommand() {
  const { notify, reportConflict } = useFeedback();
  const t = useT();
  const [state, setState] = useState<CommandState>(IDLE);
  const lastRef = useRef<LastAttempt | null>(null);
  const pendingRef = useRef(false);

  const run = useCallback(
    async <T>(spec: CommandSpec<T>): Promise<MutationResult<T> | null> => {
      if (pendingRef.current) return null;
      const fp = fingerprint(spec.label, spec.payload);
      const last = lastRef.current;
      // An unchanged retry after an uncertain failure must be the same request: same command ID,
      // same payload and the same expected revision, even if the view has refreshed since.
      const reuse = Boolean(last && last.fingerprint === fp && last.outcome === 'retryable');
      const commandId = reuse && last ? last.commandId : newCommandId();
      if (reuse && last) spec = { ...spec, expectedRevision: last.spec.expectedRevision };
      const attempt: LastAttempt = { spec: spec as CommandSpec<unknown>, fingerprint: fp, commandId, outcome: 'pending' };
      lastRef.current = attempt;
      pendingRef.current = true;
      setState({ status: 'pending', label: spec.label, error: null, commandId, willReuseCommandId: false });
      try {
        const result = await spec.execute({ commandId, expectedRevision: spec.expectedRevision });
        attempt.outcome = 'done';
        setState({ status: 'success', label: spec.label, error: null, commandId, willReuseCommandId: false });
        const message = result.replayed
          ? t('command.replayed', { label: spec.label })
          : typeof spec.success === 'function'
            ? spec.success(result)
            : spec.success === undefined
              ? t('command.done', { label: spec.label })
              : spec.success;
        if (message) notify({ tone: result.replayed ? 'info' : 'success', message });
        spec.onSuccess?.(result);
        return result;
      } catch (raw) {
        const error = toServiceError(raw);
        attempt.outcome = error.retryable ? 'retryable' : 'final';
        if (error.kind === 'conflict') {
          setState({ status: 'conflict', label: spec.label, error, commandId, willReuseCommandId: false });
          reportConflict({ label: spec.label, error });
        } else {
          setState({ status: 'error', label: spec.label, error, commandId, willReuseCommandId: error.retryable });
        }
        return null;
      } finally {
        pendingRef.current = false;
      }
    },
    [notify, reportConflict, t],
  );

  const retry = useCallback(() => {
    const last = lastRef.current;
    if (last) void run(last.spec);
  }, [run]);

  const reset = useCallback(() => setState(IDLE), []);

  return { run, retry, reset, state, pending: state.status === 'pending' };
}

export type Command = ReturnType<typeof useCommand>;
