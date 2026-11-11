import { createContext, useCallback, useContext, useSyncExternalStore, type ReactNode } from 'react';
import type { LocalTeamStore } from './LocalTeamStore';
import type { TeamAction } from './types';

const TeamContext = createContext<LocalTeamStore | null>(null);
export function TeamProvider({ store, children }: { store: LocalTeamStore; children: ReactNode }) {
  return <TeamContext.Provider value={store}>{children}</TeamContext.Provider>;
}
export function useTeam() {
  const store = useContext(TeamContext);
  if (!store) throw new Error('useTeam must be used inside TeamProvider');
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const can = useCallback((action: TeamAction) => store.can(action), [store, snapshot.actor]);
  return { store, snapshot, can };
}
