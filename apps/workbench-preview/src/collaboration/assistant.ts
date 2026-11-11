import { scopeKey, type AssistantService } from '../domain/assistant';
import type { KeyValueStore } from '../services/mock/storage';
import type { LocalTeamStore } from './LocalTeamStore';
import type { HumanActor } from './types';

/** Namespace persistence, never the scope's project id or the evidence it reads. */
export function actorKeyValueStore(storage: KeyValueStore, actorId: string): KeyValueStore {
  const prefix = `proposal-workbench/actor/${encodeURIComponent(actorId)}/`;
  return { get: (key) => storage.get(`${prefix}${key}`), set: (key, value) => storage.set(`${prefix}${key}`, value), remove: (key) => storage.remove(`${prefix}${key}`) };
}

export function actorScopedAssistant(create: (actor: HumanActor) => AssistantService, store: LocalTeamStore): AssistantService {
  const instances = new Map<string, AssistantService>();
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((listener) => listener());
  const current = () => {
    const actor = store.getActor();
    let service = instances.get(actor.id);
    if (!service) { service = create(actor); service.subscribe(emit); instances.set(actor.id, service); }
    return service;
  };
  let previousActor = store.getActor().id;
  store.subscribe(() => {
    const actorId = store.getActor().id;
    if (previousActor !== actorId) { previousActor = actorId; emit(); }
  });
  return {
    get simulated() { return current().simulated; },
    get available() { return current().available; },
    getConversation: (scope) => store.getActor().role === 'guest' ? Promise.resolve({ key: scopeKey(scope), messages: [] }) : current().getConversation(scope),
    suggestions: (scope, context) => current().suggestions(scope, context),
    ask: (scope, question, context) => current().ask(scope, question, context),
    newConversation: (scope) => current().newConversation(scope),
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}
