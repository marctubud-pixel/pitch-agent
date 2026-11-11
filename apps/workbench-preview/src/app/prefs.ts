/**
 * Per-browser interface preferences (language). Kept apart from workbench data: this is the
 * only place outside the mock service that touches browser storage, and it tolerates storage
 * being unavailable (private windows, sandboxed previews).
 */
const PREFIX = 'proposal-workbench/prefs/';

export function readPreference(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(PREFIX + key) ?? null;
  } catch {
    return null;
  }
}

export function writePreference(key: string, value: string) {
  try {
    globalThis.localStorage?.setItem(PREFIX + key, value);
  } catch {
    // Not persisted; the choice still applies until the page reloads.
  }
}
