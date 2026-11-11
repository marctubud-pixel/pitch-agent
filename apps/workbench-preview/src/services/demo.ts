/**
 * Demo-only controls. These are deliberately outside WorkbenchService: a real backend has no
 * scenarios or reset. The UI only shows the demo panel when the active service provides them.
 */

export type DemoScenario = 'normal' | 'empty' | 'loading' | 'network_error' | 'conflict';

export const SCENARIOS: Array<{ id: DemoScenario; label: string; description: string }> = [
  { id: 'normal', label: 'Normal data', description: 'Three seeded projects with research, reviews, handoffs and jobs.' },
  { id: 'empty', label: 'Empty data', description: 'A separate empty workspace. Projects you create here stay separate from the normal data.' },
  { id: 'loading', label: 'Loading', description: 'Every read waits indefinitely so you can inspect loading states.' },
  { id: 'network_error', label: 'Network error', description: 'Every read and save fails as if the service were unreachable.' },
  { id: 'conflict', label: 'Revision conflict', description: 'The next save on a project collides with a simulated collaborator’s change.' },
];

export interface DemoState {
  scenario: DemoScenario;
  /** The next successful save applies on the server but its response is dropped. */
  dropNextResponse: boolean;
  /** A collaborator change will be injected before the next project save. */
  conflictArmed: boolean;
  persistence: 'local' | 'memory';
  storageWarning: string | null;
}

export interface DemoControls {
  getDemoState(): DemoState;
  setScenario(scenario: DemoScenario): void;
  setDropNextResponse(enabled: boolean): void;
  armConflict(): void;
  resetDemoData(): Promise<void>;
}

export function isDemoControls(value: unknown): value is DemoControls {
  return typeof value === 'object' && value !== null && 'getDemoState' in value && 'resetDemoData' in value;
}
