import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AssistantService } from '../domain/assistant';
import type { BriefIntakeService } from '../domain/intake';
import type { ProposalService } from '../domain/proposal';
import type { WorkbenchService } from '../domain/service';
import { isDemoControls, type DemoControls, type DemoState } from '../services/demo';

interface ServiceContextValue {
  service: WorkbenchService;
  intake: BriefIntakeService;
  assistant: AssistantService;
  proposals: ProposalService;
  demo: DemoControls | null;
  demoState: DemoState | null;
  /** Shared read cache, cleared when the demo scenario changes or data is reset. */
  cache: Map<string, unknown>;
  /** Increments when cached data must be thrown away (scenario switch, reset). */
  epoch: number;
  /** Increments when views should refresh in place (for example after a conflict). */
  refreshToken: number;
  reloadAll: () => void;
}

const ServiceContext = createContext<ServiceContextValue | null>(null);

export function ServiceProvider({
  service,
  intake,
  assistant,
  proposals,
  children,
}: {
  service: WorkbenchService;
  intake: BriefIntakeService;
  assistant: AssistantService;
  proposals: ProposalService;
  children: ReactNode;
}) {
  const demo = isDemoControls(service) ? service : null;
  const cacheRef = useRef(new Map<string, unknown>());
  const [epoch, setEpoch] = useState(0);
  const [refreshToken, setRefreshToken] = useState(0);
  const [demoState, setDemoState] = useState<DemoState | null>(() => demo?.getDemoState() ?? null);

  useEffect(
    () =>
      service.subscribe((event) => {
        if (event.type === 'scenario-changed' || event.type === 'reset') {
          cacheRef.current.clear();
          setEpoch((e) => e + 1);
        }
        if (event.type === 'data-changed') {
          // Drop cached reads that may now be out of date, so views mounted later load fresh data
          // instead of acting on an old revision. Mounted views refresh themselves in place.
          for (const key of [...cacheRef.current.keys()]) {
            if (!event.projectId || key.includes(event.projectId) || key.startsWith('projects:')) cacheRef.current.delete(key);
          }
        }
        if (demo && event.type !== 'data-changed') setDemoState(demo.getDemoState());
        if (demo && event.type === 'data-changed') {
          const next = demo.getDemoState();
          setDemoState((prev) => (prev && prev.storageWarning === next.storageWarning ? prev : next));
        }
      }),
    [service, demo],
  );

  const value = useMemo<ServiceContextValue>(
    () => ({
      service,
      intake,
      assistant,
      proposals,
      demo,
      demoState,
      cache: cacheRef.current,
      epoch,
      refreshToken,
      reloadAll: () => setRefreshToken((t) => t + 1),
    }),
    [service, intake, assistant, proposals, demo, demoState, epoch, refreshToken],
  );

  return <ServiceContext.Provider value={value}>{children}</ServiceContext.Provider>;
}

export function useServiceContext(): ServiceContextValue {
  const ctx = useContext(ServiceContext);
  if (!ctx) throw new Error('useServiceContext must be used inside ServiceProvider');
  return ctx;
}

export const useService = () => useServiceContext().service;
export const useIntake = () => useServiceContext().intake;
export const useAssistant = () => useServiceContext().assistant;
export const useProposals = () => useServiceContext().proposals;
