/**
 * Placeholder for a real assistant backend. Until one is connected the UI shows WorkBot as
 * unavailable rather than inventing answers. A real implementation should keep the same rules:
 * answer from project records the caller may see, return references, never change data.
 */
import type { AssistantService, Conversation } from '../../domain/assistant';
import { scopeKey } from '../../domain/assistant';

export class HttpAssistantService implements AssistantService {
  readonly simulated = false;
  readonly available = false;
  constructor(private readonly options: { baseUrl: string }) {}
  async getConversation(scope: Parameters<AssistantService['getConversation']>[0]): Promise<Conversation> {
    void this.options;
    return { key: scopeKey(scope), messages: [] };
  }
  async suggestions() {
    return [];
  }
  async ask(): Promise<Conversation> {
    throw new Error('The assistant is not connected to a backend yet.');
  }
  async newConversation(scope: Parameters<AssistantService['newConversation']>[0]): Promise<Conversation> {
    return { key: scopeKey(scope), messages: [] };
  }
  subscribe() {
    return () => {};
  }
}
