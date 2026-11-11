import type { AssistantService } from '../domain/assistant';
import type { BriefIntakeService } from '../domain/intake';
import type { ProposalService } from '../domain/proposal';
import type { WorkbenchService } from '../domain/service';
import { HttpAssistantService } from './http/HttpAssistantService';
import { HttpIntakeService } from './http/HttpIntakeService';
import { HttpProposalService } from './http/HttpProposalService';
import { HttpWorkbenchService } from './http/HttpWorkbenchService';
import { LocalIntakeService } from './intake/LocalIntakeService';
import { MockAssistantService } from './mock/MockAssistantService';
import { MockWorkbenchService } from './mock/MockWorkbenchService';
import { browserStore } from './mock/storage';
import { MockProposalService } from './proposal/MockProposalService';

/** Everything the interface talks to. Components only see these interfaces. */
export interface Services {
  workbench: WorkbenchService;
  intake: BriefIntakeService;
  assistant: AssistantService;
  /** Creative-stage projection and persisted mode policy. */
  proposals: ProposalService;
}

/**
 * The single place that decides which services the app uses.
 *
 * Set VITE_WORKBENCH_API_URL=/api for the live local backend.
 * Without it, the app runs entirely in the browser: mock project data, real local text
 * extraction with simulated mapping for the bundled samples, and a simulated WorkBot.
 */
export function createServices(): Services {
  const configuredUrl: unknown = import.meta.env.VITE_WORKBENCH_API_URL;
  const baseUrl = typeof configuredUrl === 'string' ? configuredUrl : '';
  if (baseUrl) {
    const workbench = new HttpWorkbenchService({ baseUrl });
    return { workbench, intake: new HttpIntakeService({ baseUrl }), assistant: new HttpAssistantService({ baseUrl }), proposals: new HttpProposalService(workbench) };
  }
  const workbench = new MockWorkbenchService();
  const store = browserStore().store;
  const proposals = new MockProposalService(workbench, store);
  return { workbench, intake: new LocalIntakeService(), assistant: new MockAssistantService(workbench, store, 650, proposals), proposals };
}

/** @deprecated Kept for older callers; use createServices. */
export function createWorkbenchService(): WorkbenchService {
  return createServices().workbench;
}
