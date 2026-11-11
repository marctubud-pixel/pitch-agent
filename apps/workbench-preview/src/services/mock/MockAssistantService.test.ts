import { describe, expect, it } from 'vitest';
import { MockAssistantService } from './MockAssistantService';
import { MockWorkbenchService } from './MockWorkbenchService';
import { memoryStore } from './storage';

function setup() {
  const store = memoryStore();
  const workbench = new MockWorkbenchService({ store, latency: { read: 0, write: 0 }, autoTick: false });
  const assistant = new MockAssistantService(workbench, store, 0);
  return { workbench, assistant, store };
}
const luma = { kind: 'project' as const, projectId: 'luma', projectName: 'Luma Social Spirits' };
const morrow = { kind: 'project' as const, projectId: 'morrow', projectName: 'Morrow Home' };
const ctx = { view: 'overview' as const, draft: null };

describe('MockAssistantService', () => {
  it('keeps conversations separate per project and scope', async () => {
    const { assistant } = setup();
    await assistant.ask(luma, { text: '这个项目被什么卡住了？', suggestionId: 'blockers' }, ctx);
    expect((await assistant.getConversation(luma)).messages).toHaveLength(2);
    expect((await assistant.getConversation(morrow)).messages).toHaveLength(0);
    expect((await assistant.getConversation({ kind: 'general' })).messages).toHaveLength(0);
  });

  it('answers from the project records with references and the revision it used', async () => {
    const { assistant, workbench } = setup();
    const convo = await assistant.ask(luma, { text: '这个项目被什么卡住了？', suggestionId: null }, ctx);
    const answer = convo.messages[1];
    expect(answer.status).toBe('answer');
    expect(answer.simulated).toBe(true);
    expect(answer.basedOn?.revision).toBe((await workbench.getProjectOverview('luma')).project.revision);
    expect(answer.blocks.flatMap((b) => b.refs).length).toBeGreaterThan(0);
  });

  it('never changes project data', async () => {
    const { assistant, workbench } = setup();
    const before = (await workbench.getProjectOverview('luma')).project.revision;
    for (const id of ['blockers', 'next', 'brief', 'evidence', 'returned', 'pitch', 'history', 'progress']) await assistant.ask(luma, { text: id, suggestionId: id }, ctx);
    expect((await workbench.getProjectOverview('luma')).project.revision).toBe(before);
  });

  it('falls back honestly on questions it does not recognise', async () => {
    const { assistant } = setup();
    const convo = await assistant.ask({ kind: 'general' }, { text: 'zxq banana', suggestionId: null }, ctx);
    expect(convo.messages[1].status).toBe('fallback');
  });

  it('describes an unconfirmed draft as a draft and lists suggestions as needing a decision', async () => {
    const { assistant } = setup();
    const empty = { value: '', provenance: { origin: 'missing' as const, reason: 'not_stated' as const, spans: [] } };
    const fields = Object.fromEntries(
      ['projectName', 'brand', 'background', 'objectives', 'researchQuestions', 'audience', 'deliverableType', 'deliverables', 'constraints', 'timeline', 'budget', 'references', 'openQuestions'].map((f) => [f, empty]),
    );
    fields.researchQuestions = { value: ['Which audience cues need research?'], provenance: { origin: 'suggested', reason: 'inferred', spans: [] } } as never;
    const draft = { projectId: null, fields: fields as never, mapping: 'none' as const, simulated: false, fileName: 'notes.txt' };
    const convo = await assistant.ask({ kind: 'draft' }, { text: 'Explain this brief draft', suggestionId: 'brief' }, { view: 'new', draft });
    const text = convo.messages[1].blocks.map((b) => b.text).join(' ');
    expect(text).toMatch(/未保存草稿/);
    expect(text).toMatch(/系统建议/);
  });

  it('is cleared by a demo reset', async () => {
    const { assistant, workbench } = setup();
    await assistant.ask(luma, { text: 'next', suggestionId: 'next' }, ctx);
    await (workbench as unknown as { resetDemoData(): Promise<void> }).resetDemoData();
    expect((await assistant.getConversation(luma)).messages).toHaveLength(0);
  });
});
