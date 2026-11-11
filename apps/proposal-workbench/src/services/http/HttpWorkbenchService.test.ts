import { describe, expect, it } from 'vitest';
import { HttpWorkbenchService } from './HttpWorkbenchService';
import type { CreateProjectInput } from '../../domain/models';

function brokenResponse(status: number): Response {
  return new Response(new ReadableStream({
    start(controller) { controller.error(new TypeError('Response body connection closed.')); },
  }), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('successful HTTP headers followed by a lost response body', () => {
  it('warns that creation may have happened and retries the identical command body', async () => {
    const bodies: string[] = [];
    const service = new HttpWorkbenchService({ baseUrl: '/api', fetchImpl: async (_url, init) => {
      if (typeof init?.body !== 'string') throw new Error('Expected an encoded mutation body.');
      bodies.push(init.body);
      if (bodies.length === 1) return brokenResponse(201);
      return Response.json({ project: { id: 'project-retry', name: '保留重试身份', revision: 0, activeTaskCardId: 'card-one', taskCards: [{ id: 'card-one', brief: '{}', createdBy: 'local-operator' }], confirmations: [], jobs: [], artifacts: [], audit: [], processedCommands: {} }, view: { policy: { mode: 'assisted', humanGates: [], authorizedThrough: 'final_review' }, stages: [], complete: false } });
    } });
    const input: CreateProjectInput = { name: '保留重试身份', client: '', summary: '', mode: 'step_by_step', researchOwner: '', strategyOwner: '' };
    const meta = { commandId: 'unchanged-create-command', expectedRevision: 0 };
    await expect(service.createProject(input, meta)).rejects.toMatchObject({ kind: 'response_lost', retryable: true, outcomeUnknown: true });
    const result = await service.createProject(input, meta);
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toBe(bodies[0]);
    expect(result.commandId).toBe(meta.commandId);
  });

  it('keeps a failed GET body retryable without an unknown mutation outcome', async () => {
    const service = new HttpWorkbenchService({ baseUrl: '/api', fetchImpl: async () => brokenResponse(200) });
    await expect(service.request('GET', '/projects')).rejects.toMatchObject({ kind: 'network', retryable: true, outcomeUnknown: false });
  });
});
