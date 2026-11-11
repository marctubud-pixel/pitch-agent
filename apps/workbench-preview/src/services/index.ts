import {pendingWriteAction} from '../collaboration/types';
import type { AssistantService } from '../domain/assistant';
import type { BriefIntakeService } from '../domain/intake';
import type { ProposalService } from '../domain/proposal';
import type { WorkbenchService } from '../domain/service';
import { HttpAssistantService } from './http/HttpAssistantService';
import { HttpWorkbenchService } from './http/HttpWorkbenchService';
import { HttpProposalService } from './http/HttpProposalService';
import { LocalIntakeService } from './intake/LocalIntakeService';
import { MockAssistantService } from './mock/MockAssistantService';
import { MockWorkbenchService } from './mock/MockWorkbenchService';
import { browserStore } from './mock/storage';
import { MockProposalService } from './proposal/MockProposalService';
import { IndexedDBBrandResourceRepository } from './proposal/BrandResourceRepository';
import { LocalTeamStore } from '../collaboration/LocalTeamStore';
import { protectServices } from '../collaboration/protectServices';
import { actorScopedAssistant, actorKeyValueStore } from '../collaboration/assistant';

/** Everything the interface talks to. Components only see these interfaces. */
export interface Services {
  team: LocalTeamStore;
  workbench: WorkbenchService;
  intake: BriefIntakeService;
  assistant: AssistantService;
  /** Proposal projection; HTTP mode currently supports Brief snapshots only. */
  proposals: ProposalService;
}

/**
 * The single place that decides which services the app uses.
 *
 * Set VITE_WORKBENCH_API_URL to switch to the restricted Brief HTTP adapters.
 * Without it, the app runs entirely in the browser: mock project data, real local text
 * extraction with simulated mapping for the bundled samples, and a simulated WorkBot.
 */
export function createServices(): Services {
  const team = new LocalTeamStore();
  const configured: unknown = import.meta.env.VITE_WORKBENCH_API_URL;
  const baseUrl = typeof configured === 'string' ? configured.trim() : '';
  const persistence = browserStore();
  const proposalOptions = { brandResources: new IndexedDBBrandResourceRepository(), metadataPersistence: persistence.persistence };
  if (baseUrl) {
    const workbench = new HttpWorkbenchService({ baseUrl, recovery: {actorKey: () => team.getActor().id, storage: () => sessionStorage, authorize: kind => {team.require(pendingWriteAction(kind));}} });
    // HTTP mode reads actual project snapshots; unsupported stages never synthesize results.
    return { ...protectServices({ workbench, intake: new LocalIntakeService(), assistant: new HttpAssistantService({ baseUrl }), proposals: new HttpProposalService(workbench) }, team), team };
  }
  const workbench = new MockWorkbenchService();
  const store = persistence.store;
  const proposals = new MockProposalService(workbench, store, proposalOptions);
  const assistant = actorScopedAssistant(actor => new MockAssistantService(workbench, actorKeyValueStore(store, actor.id), 650, proposals), team);
  return { ...protectServices({ workbench, intake: new LocalIntakeService(), assistant, proposals }, team), team };
}

/** @deprecated Kept for older callers; use createServices. */
export function createWorkbenchService(): WorkbenchService {
  return createServices().workbench;
}
