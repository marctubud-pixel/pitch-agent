import { describe, expect, it } from 'vitest';
import type { BriefInput } from '../../domain/models';
import type { HumanActor } from '../../collaboration/types';
import { adoptedObjectives } from '../../domain/briefRequirements';
import { editField, fromBrief, preserveHiddenFields, toBriefInput } from '../../intake/taskCard';
import { briefVersionDescription } from '../../proposal/briefVersions';
import { MockProposalService } from '../proposal/MockProposalService';
import { MockWorkbenchService } from './MockWorkbenchService';
import { memoryStore } from './storage';

const editor: HumanActor = { id: 'editor', name: '沈禾', role: 'operator' };
const owner: HumanActor = { id: 'owner', name: '林予', role: 'pitch_owner' };
const initial: BriefInput = { proposalType: 'packaging', background: '本地工程品牌的包装项目。', audience: '成年购买者', objectives: [], deliverables: ['包装提案'], constraints: ['保留品牌标志'], changeNote: '' };

async function setup(input = initial) {
  let now = Date.parse('2026-11-09T01:00:00Z');
  const store = memoryStore();
  const workbench = new MockWorkbenchService({ store, latency: { read: 0, write: 0 }, autoTick: false, clock: () => now });
  const created = await workbench.createProject({ name: '本地任务卡工程测试', client: '测试品牌', summary: '', mode: 'supervised', researchOwner: owner.name, strategyOwner: owner.name, brief: input }, { commandId: 'create', expectedRevision: (await workbench.listProjects({})).catalogRevision, actor: editor });
  const id = created.data.id;
  const revision = async () => (await workbench.getProjectOverview(id)).project.revision;
  return { store, workbench, id, revision, advance: () => { now += 60000; } };
}

describe('simplified task cards and truthful versions', () => {
  it('confirms the visible requirements without requiring or inventing a business objective', async () => {
    const { workbench, id, revision } = await setup();
    await workbench.confirmBrief(id, { commandId: 'confirm', expectedRevision: await revision(), actor: owner });
    const overview = await workbench.getProjectOverview(id);
    expect(overview.brief?.confirmedAt).toBeTruthy();
    expect(overview.project.taskCard.goal).toBe('');
    expect(overview.project.taskCard.successCriteria).toEqual(['交付：包装提案']);
  });
  it('keeps hidden pending content unresolved and out of adopted objectives and task-card goals', async () => {
    const { workbench, id, revision } = await setup({ ...initial, objectives: ['尚未接受的建议'], deliverableType: '旧的建议类型', provenance: { objectives: { origin: 'suggested', reason: 'inferred', spans: [] }, deliverableType: { origin: 'suggested', reason: 'inferred', spans: [] } } });
    await workbench.confirmBrief(id, { commandId: 'confirm', expectedRevision: await revision(), actor: owner });
    const brief = (await workbench.getBriefHistory(id)).current;
    expect(brief?.objectives).toEqual(['尚未接受的建议']);
    expect(brief?.provenance.objectives?.origin).toBe('suggested');
    expect(adoptedObjectives(brief)).toEqual([]);
    expect((await workbench.getProjectOverview(id)).project.taskCard.goal).toBe('');
  });
  it('preserves hidden values and absent provenance entries during a visible edit', async () => {
    const { workbench, id, revision } = await setup({ ...initial, objectives: ['已存的旧目标'], budget: '旧预算', timeline: '旧安排', references: ['旧参考'], openQuestions: ['旧问题'] });
    const original = (await workbench.getBriefHistory(id)).current;
    if (!original) throw new Error('expected saved brief');
    const card = editField(fromBrief(original, '本地任务卡工程测试'), 'audience', '25至30岁的成年人');
    const input = preserveHiddenFields(toBriefInput(card, null), original);
    const saved = await workbench.saveBrief(id, input, { commandId: 'edit', expectedRevision: await revision(), actor: editor });
    for (const field of ['objectives', 'budget', 'timeline', 'references', 'openQuestions', 'deliverableType'] as const) expect(saved.data[field]).toEqual(original[field]);
    expect(saved.data.provenance.objectives).toBeUndefined();
    expect(saved.data.provenance.audience?.origin).toBe('edited');
    expect(saved.data.provenance.brand).toBeUndefined();
  });
  it('saves a type-only change once, records the actual editor, and keeps confirmation separate', async () => {
    const { workbench, id, revision, advance } = await setup();
    const first = (await workbench.getBriefHistory(id)).current;
    await workbench.confirmBrief(id, { commandId: 'confirm-1', expectedRevision: await revision(), actor: owner });
    expect((await workbench.getBriefHistory(id)).current?.editedBy).toBe(editor.name);
    const input: BriefInput = { ...initial, proposalType: 'kv', changeNote: '本地测试：客户要求调整为主视觉提案。' };
    advance();
    const meta = { commandId: 'change-type', expectedRevision: await revision(), actor: editor };
    const result = await workbench.saveBrief(id, input, meta);
    const replay = await workbench.saveBrief(id, input, meta);
    expect(result.data).toMatchObject({ version: 2, proposalType: 'kv', confirmedAt: null, editedBy: editor.name, changeNote: input.changeNote });
    expect(replay.replayed).toBe(true);
    expect((await workbench.getBriefHistory(id)).versions).toHaveLength(2);
    expect((await workbench.getBriefHistory(id)).versions.find(v => v.version === 1)?.proposalType).toBe('packaging');
    expect(result.data.editedAt).not.toBe(first?.editedAt);
    advance();
    await workbench.confirmBrief(id, { commandId: 'confirm-2', expectedRevision: await revision(), actor: owner });
    const confirmed = (await workbench.getBriefHistory(id)).current;
    expect(confirmed?.editedAt).toBe(result.data.editedAt);
    expect(confirmed?.editedBy).toBe(editor.name);
    expect(confirmed?.confirmedBy).toBe(owner.name);
  });
  it('derives type consistently in proposal details, lists and workbench lookup without a second type write', async () => {
    const { workbench, store, id, revision } = await setup();
    const proposals = new MockProposalService(workbench, store, { latency: 0, agentDelay: 0 });
    const proposal = await proposals.createProposal({ workbenchId: id, name: '本地任务卡工程测试', client: '测试品牌', type: 'packaging', mode: 'automatic', checkpoints: [] });
    await workbench.saveBrief(id, { ...initial, proposalType: 'kv' }, { commandId: 'type', expectedRevision: await revision(), actor: editor });
    expect((await proposals.getProposal(proposal.id)).type).toBe('kv');
    expect((await proposals.findByWorkbenchId(id))?.type).toBe('kv');
    expect((await proposals.listProposals()).find(p => p.workbenchId === id)?.type).toBe('kv');
    await workbench.saveBrief(id, { ...initial, proposalType: undefined }, { commandId: 'old-client', expectedRevision: await revision(), actor: editor });
    expect((await workbench.getBriefHistory(id)).current?.proposalType).toBe('kv');
  });
  it('uses saved notes and factual differences without inventing an editor or a client message', async () => {
    const { workbench, id, revision } = await setup();
    const first = (await workbench.getBriefHistory(id)).current;
    if (!first) throw new Error('expected saved brief');
    expect(briefVersionDescription(first, undefined)).toEqual({ kind: 'created' });
    await workbench.confirmBrief(id, { commandId: 'confirm', expectedRevision: await revision(), actor: owner });
    const next = await workbench.saveBrief(id, { ...initial, audience: '25至30岁的成年人' }, { commandId: 'audience', expectedRevision: await revision(), actor: editor });
    expect(briefVersionDescription(next.data, first)).toEqual({ kind: 'changes', fields: ['audience'] });
    expect(briefVersionDescription({ ...next.data, changeNote: '客户电话沟通后，收窄受众。' }, first)).toEqual({ kind: 'note', text: '客户电话沟通后，收窄受众。' });
  });
  it('preserves raw legacy content inside the scoped transaction even if a client submits translated hidden text', async () => {
    const { workbench, id, revision } = await setup({ ...initial, objectives: ['Original objective.'], budget: 'Original budget', provenance: { objectives: { origin: 'suggested', reason: 'inferred', spans: [] } } });
    const before = (await workbench.getBriefHistory(id)).current;
    const saved = await workbench.saveBrief(id, { ...initial, editScope: 'task_card', audience: '25至30岁的成年人', objectives: ['客户端翻译后的旧目标'], budget: '客户端重新整理的预算', provenance: { objectives: { origin: 'accepted', reason: 'stated', spans: [] } } }, { commandId: 'scoped', expectedRevision: await revision(), actor: editor });
    expect(saved.data.objectives).toEqual(before?.objectives);
    expect(saved.data.budget).toEqual(before?.budget);
    expect(saved.data.provenance.objectives).toEqual(before?.provenance.objectives);
    expect(saved.data.audience).toBe('25至30岁的成年人');
  });
});
