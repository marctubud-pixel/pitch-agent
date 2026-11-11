/** Key-value persistence for the mock service. Only the mock touches browser storage. */

export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export function memoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    get: (key) => map.get(key) ?? null,
    set: (key, value) => void map.set(key, value),
    remove: (key) => void map.delete(key),
  };
}

/**
 * Uses localStorage when it is available and writable; otherwise falls back to memory
 * (private windows, blocked site data, embedded previews).
 */
export function browserStore(): { store: KeyValueStore; persistence: 'local' | 'memory' } {
  try {
    const ls = globalThis.localStorage;
    const probe = '__pw_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return {
      persistence: 'local',
      store: {
        get: (key) => {
          try {
            return ls.getItem(key);
          } catch {
            return null;
          }
        },
        set: (key, value) => ls.setItem(key, value),
        remove: (key) => {
          try {
            ls.removeItem(key);
          } catch {
            /* ignore */
          }
        },
      },
    };
  } catch {
    return { store: memoryStore(), persistence: 'memory' };
  }
}
