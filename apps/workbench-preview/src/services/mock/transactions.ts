import { ServiceError } from '../../domain/service';
import type { KeyValueStore } from './storage';

const queues = new WeakMap<KeyValueStore, Map<string, Promise<unknown>>>();
const shared = new WeakSet<KeyValueStore>();
const listeners = new WeakMap<KeyValueStore, Map<string, Set<() => void>>>();

/** The backing store, rather than a project, is the atomic write boundary. */
export function markSharedStore(store: KeyValueStore, isShared: boolean) {
  if (isShared) shared.add(store);
}

export async function storeTransaction<T>(store: KeyValueStore, key: string, apply: () => T | Promise<T>): Promise<T> {
  if (shared.has(store)) {
    if (!globalThis.navigator?.locks) {
      throw new ServiceError('unavailable', '此浏览器不支持安全的跨窗口写入，请在支持 Web Locks 的浏览器中编辑。');
    }
    return navigator.locks.request(`proposal-workbench:${key}`, apply);
  }
  let byKey = queues.get(store);
  if (!byKey) { byKey = new Map(); queues.set(store, byKey); }
  const previous = byKey.get(key) ?? Promise.resolve();
  const result = previous.catch(() => undefined).then(apply);
  byKey.set(key, result);
  try { return await result; }
  finally { if (byKey.get(key) === result) byKey.delete(key); }
}

export function publishStoreChange(store: KeyValueStore, key: string) {
  if (shared.has(store) && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pw-store-change', { detail: key }));
  } else listeners.get(store)?.get(key)?.forEach((listener) => listener());
}

export function subscribeStoreChanges(store: KeyValueStore, key: string, listener: () => void) {
  let byKey = listeners.get(store);
  if (!byKey) { byKey = new Map(); listeners.set(store, byKey); }
  let callbacks = byKey.get(key);
  if (!callbacks) { callbacks = new Set(); byKey.set(key, callbacks); }
  callbacks.add(listener);
  const storage = (event: StorageEvent) => { if (event.key === key || event.key === null) listener(); };
  const local = (event: Event) => { if (event instanceof CustomEvent && event.detail === key) listener(); };
  if (shared.has(store) && typeof window !== 'undefined') {
    window.addEventListener('storage', storage);
    window.addEventListener('pw-store-change', local);
  }
  return () => {
    callbacks.delete(listener);
    if (typeof window !== 'undefined') { window.removeEventListener('storage', storage); window.removeEventListener('pw-store-change', local); }
  };
}
