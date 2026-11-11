import { useEffect, useRef, useState } from 'react';
import type { Proposal } from '../domain/proposal';
import { Link, projectPath } from '../app/router';
import { exportDeckStudio, prepareProposalDeck, proposalReady, type Deck } from './deck-studio';
import '../styles/deck-studio-ui.css';

type Preparation<T> = { kind: 'loading' } | { kind: 'ready'; value: T } | { kind: 'error'; message: string };
type DownloadState = { kind: 'idle' } | { kind: 'pending'; style: string } | { kind: 'saved'; fileName: string } | { kind: 'error'; message: string };
const loading = { kind: 'loading' } as const;
function message(error: unknown) { return error instanceof Error && error.message ? error.message : '版式准备失败，请重试。'; }

export function useStudioPreparation<T>(context: string, prepare: (signal: AbortSignal) => Promise<T>) {
  const latest = useRef({ context, prepare, epoch: 0 });
  latest.current = { context, prepare, epoch: latest.current.epoch + (latest.current.context === context ? 0 : 1) };
  const epoch = latest.current.epoch;
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ epoch: number; state: Preparation<T> }>({ epoch, state: loading });
  useEffect(() => {
    const controller = new AbortController();
    setResult({ epoch, state: loading });
    void latest.current.prepare(controller.signal).then(value => {
      if (!controller.signal.aborted && latest.current.epoch === epoch) setResult({ epoch, state: { kind: 'ready', value } });
    }, error => {
      if (!controller.signal.aborted && latest.current.epoch === epoch) setResult({ epoch, state: { kind: 'error', message: message(error) } });
      controller.abort();
    });
    return () => controller.abort();
  }, [context, retry]);
  return { state: result.epoch === epoch ? result.state : loading, retry: () => setRetry(n => n + 1) };
}

export function useProposalStudio(proposal: Proposal) {
  const context = JSON.stringify(proposal);
  const prepared = useStudioPreparation(context, async signal => {
    if (!proposalReady(proposal) || !proposal.layout) return [];
    return await Promise.all(proposal.layout.styles.map(async style => ({ style, deck: await prepareProposalDeck(proposal, style, signal) })));
  });
  return { ...prepared, context };
}

export function useStudioDownload(context: string) {
  const latest = useRef({ context, epoch: 0 });
  latest.current = { context, epoch: latest.current.epoch + (latest.current.context === context ? 0 : 1) };
  const epoch = latest.current.epoch;
  const pending = useRef<AbortController | null>(null);
  const [result, setResult] = useState<{ epoch: number; state: DownloadState }>({ epoch, state: { kind: 'idle' } });
  useEffect(() => {
    setResult({ epoch, state: { kind: 'idle' } });
    return () => { pending.current?.abort(); pending.current = null; };
  }, [context]);
  async function download(deck: Deck) {
    if (pending.current || latest.current.epoch !== epoch) return;
    const controller = new AbortController();
    pending.current = controller;
    setResult({ epoch, state: { kind: 'pending', style: deck.style } });
    try {
      const blob = await exportDeckStudio(deck, controller.signal);
      controller.signal.throwIfAborted();
      if (latest.current.epoch !== epoch || pending.current !== controller) return;
      const href = URL.createObjectURL(blob), anchor = document.createElement('a');
      anchor.href = href; anchor.download = deck.fileName;
      document.body.append(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      setResult({ epoch, state: { kind: 'saved', fileName: deck.fileName } });
    } catch (error) {
      if (!controller.signal.aborted && latest.current.epoch === epoch && pending.current === controller) setResult({ epoch, state: { kind: 'error', message: message(error) } });
    } finally { if (pending.current === controller) pending.current = null; }
  }
  return { state: result.epoch === epoch ? result.state : { kind: 'idle' } satisfies DownloadState, download };
}

export function StudioPreparationStatus({ state, retry }: { state: Preparation<unknown>; retry: () => void }) {
  if (state.kind === 'ready') return null;
  return <div className="studio-status" role={state.kind === 'error' ? 'alert' : 'status'} aria-live="polite">
    <p>{state.kind === 'loading' ? '正在核对资源与准备版式…' : state.message}</p>
    {state.kind === 'error' && <button type="button" className="btn btn--secondary btn--sm" onClick={retry}>重新准备</button>}
  </div>;
}

export function StudioCapability({ proposal }: { proposal: Proposal }) {
  return <aside className="studio-capability" data-studio-capability="true"><strong>版式工坊已接入</strong><p>完整方案尚未就绪。已有内容可复用固定图版，并以同一版式预览和导出。</p>{proposal.workbenchId === 'qingyu' && <Link to={projectPath(proposal.workbenchId, 'proposal', { stage: 'research' })}>查看现有调研图版 ↗</Link>}</aside>;
}
