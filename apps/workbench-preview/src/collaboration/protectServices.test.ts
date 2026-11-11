import { describe, expect, it } from 'vitest';
import type { AssistantContext, AssistantScope } from '../domain/assistant';
import { LocalIntakeService } from '../services/intake/LocalIntakeService';
import { isDemoControls } from '../services/demo';
import { MockAssistantService } from '../services/mock/MockAssistantService';
import { MockWorkbenchService } from '../services/mock/MockWorkbenchService';
import { memoryStore } from '../services/mock/storage';
import { MemoryBrandResourceTestRepository } from '../services/proposal/BrandResourceRepository';
import { MockProposalService } from '../services/proposal/MockProposalService';
import { actorKeyValueStore, actorScopedAssistant } from './assistant';
import { LocalTeamStore } from './LocalTeamStore';
import { protectServices } from './protectServices';
import { TestStorage } from './testSupport';

function setup(writeLatency = 0) {
  const data = memoryStore();
  const team = new LocalTeamStore({ storage: new TestStorage(), sessionStorage: new TestStorage(), autoStart: false });
  const workbench = new MockWorkbenchService({ store: data, latency: { read: 0, write: writeLatency }, autoTick: false });
  const proposals = new MockProposalService(workbench, data, { latency: 0, agentDelay: 0, brandResources: new MemoryBrandResourceTestRepository() });
  const assistant = actorScopedAssistant((actor) => new MockAssistantService(workbench, actorKeyValueStore(data, actor.id), 0, proposals), team);
  const raw = { workbench, proposals, intake: new LocalIntakeService(), assistant };
  return { api: protectServices(raw, team), team, raw, data };
}
const meta = { commandId: 'policy-command', expectedRevision: 0 };
const source = { title: '测试来源', publisher: '测试机构', url: '', excerpt: '原始材料保存此段，不把当前操作者伪装成材料作者。', intendedUse: 'audience', attachToClaimId: null } satisfies Parameters<MockWorkbenchService['addSource']>[1];
const scope: AssistantScope = { kind: 'project', projectId: 'luma', projectName: 'Luma' };
const context: AssistantContext = { view: 'overview', draft: null };

describe('protected legacy service entry points', () => {
  it('rejects every guest mutator including intake, WorkBot and raw demo controls', async () => {
    const { api, team, raw } = setup();
    const doc = await raw.intake.extractText({ kind: 'request', text: '请设计一个新产品发布提案。' });
    team.selectActor('human-guest');
    const w = api.workbench;
    const p = api.proposals;
    const operations: Array<() => Promise<unknown>> = [
      () => w.createProject({ name: 'forbidden', client: '', summary: '', mode: 'supervised', researchOwner: '', strategyOwner: '' }, meta),
      () => w.saveBrief('luma', { background: '', audience: '', objectives: [], deliverables: [], constraints: [], changeNote: '' }, meta),
      () => w.confirmBrief('luma', meta),
      () => w.addSource('luma', source, meta),
      () => w.linkSourceToClaim('luma', 'claim', 'source', meta),
      () => w.addClaim('luma', { sectionId: 'section', text: 'test', topic: 'audience', sourceIds: [] }, meta),
      () => w.uploadImage('luma', { name: 'test', dataUrl: '', sourceNote: '', width: 1, height: 1, dominantColors: [] }, meta),
      () => w.requestObservation('luma', 'image', meta),
      () => w.reviewObservation('luma', { observationId: 'observation', decision: 'confirmed', note: '' }, meta),
      () => w.generateResearch('luma', meta),
      () => w.startVerification('luma', meta),
      () => w.startReadinessReview('luma', meta),
      () => w.recordHandoff('luma', { side: 'research_owner', decision: 'delivered', permittedUses: [], prohibitedInferences: [], unresolvedIssues: [], note: '' }, meta),
      () => w.releaseResearch('luma', meta),
      () => w.continueToStrategy('luma', meta),
      () => w.retryJob('luma', 'job', meta),
      () => w.reconcileJob('luma', 'job', meta),
      () => p.ensureBrandResourceStorage(),
      () => p.stageBrandResources({ workbenchId: 'luma', resources: [] }),
      () => p.createProposal({ workbenchId: 'luma', name: 'forbidden', client: '', type: 'kv', mode: 'automatic', checkpoints: [] }),
      () => p.setMode('proposal', 'automatic', [], meta),
      () => p.decide('proposal', 'visual', { kind: 'approve', comment: '' }, meta),
      () => p.contribute('proposal', 'visual', { kind: 'comment', text: 'guest comment', borrow: null }, meta),
      () => p.resolveContribution('proposal', 'contribution', { status: 'used', reason: 'guest decision' }, meta),
      () => p.editNarrative('proposal', 'section', 'guest edit', meta),
      () => p.chooseLayout('proposal', 'editorial', meta),
      () => api.intake.extractText({ kind: 'request', text: 'guest intake' }),
      () => api.intake.mapToTaskCard(doc),
      () => api.assistant.ask(scope, { text: 'guest chat', suggestionId: null }, context),
      () => api.assistant.newConversation(scope),
    ];
    for (const operation of operations) await expect(operation()).rejects.toMatchObject({ kind: 'forbidden', retryable: false });
    const protectedDemo = api.workbench;
    if (!isDemoControls(protectedDemo)) throw new Error('Protected demo controls missing');
    expect(() => protectedDemo.setScenario('empty')).toThrow(/权限/);
    expect(() => protectedDemo.setDropNextResponse(true)).toThrow(/权限/);
    expect(() => protectedDemo.armConflict()).toThrow(/权限/);
    await expect(protectedDemo.resetDemoData()).rejects.toMatchObject({ kind: 'forbidden' });
    expect((await api.workbench.listProjects({})).items.length).toBeGreaterThan(0);
    expect((await api.assistant.getConversation(scope)).messages).toHaveLength(0);
    team.destroy();
  });

  it('allows guests to download proposal member originals while denying upload and storage preparation', async () => {
    const { api, team } = setup();
    const catalog = await api.workbench.listProjects({ status: 'all' });
    const created = await api.workbench.createProject({ name: 'Resources', client: '', summary: '', mode: 'step_by_step', researchOwner: '', strategyOwner: '' }, { commandId: 'guest-files', expectedRevision: catalog.catalogRevision });
    const file = new File(['原始资料'], 'manual.pdf', { type: 'application/pdf', lastModified: 10 });
    const resource = { id: 'brand-file', fileName: file.name, size: file.size, mediaType: file.type, lastModified: 10, note: '只读参考' };
    await api.proposals.ensureBrandResourceStorage();
    await api.proposals.stageBrandResources({ workbenchId: created.data.id, resources: [{ resource, file }] });
    const saved = await api.proposals.createProposal({ workbenchId: created.data.id, name: created.data.name, client: '', type: 'kv', mode: 'assisted', checkpoints: [], brandResources: [resource] });
    team.selectActor('human-guest');
    expect(await (await api.proposals.getBrandResourceFile(saved.id, resource.id)).text()).toBe('原始资料');
    await expect(api.proposals.getBrandResourceFile(saved.id, 'foreign-file')).rejects.toMatchObject({ kind: 'not_found' });
    await expect(api.proposals.ensureBrandResourceStorage()).rejects.toMatchObject({ kind: 'forbidden' });
    await expect(api.proposals.stageBrandResources({ workbenchId: created.data.id, resources: [{ resource, file }] })).rejects.toMatchObject({ kind: 'forbidden' });
    team.destroy();
  });

  it('holds the invocation identity throughout an awaited write and overrides spoofed actor metadata', async () => {
    const { api, team } = setup(10);
    team.selectActor('human-operator');
    const before = await api.workbench.getProjectOverview('luma');
    const pending = api.workbench.addSource('luma', source, { commandId: 'operator-source', expectedRevision: before.project.revision, actor: { id: 'spoof-owner', name: '伪造负责人' } });
    expect(team.getSnapshot().pendingWrites).toBe(1);
    expect(() => team.selectActor('human-owner')).toThrow(/操作进行中/);
    const result = await pending;
    expect(result.data.addedBy).toBe('周宁');
    expect(team.getSnapshot().pendingWrites).toBe(0);
    team.selectActor('human-owner');
    const proposal = await api.proposals.findByWorkbenchId('northline');
    if (!proposal) throw new Error('Missing fixture');
    const after = await api.proposals.contribute(proposal.id, 'themes', { kind: 'comment', text: '新意见', borrow: null }, { expectedRevision: proposal.revision, actor: { id: 'spoof', name: '伪造署名' } });
    expect(after.contributions.at(-1)).toMatchObject({ by: '林予', authorId: 'human-owner', text: '新意见' });
    team.destroy();
  });

  it('lets the visual lead approve visual work while reserving final delivery and mode management for owner', async () => {
    const { api, team } = setup();
    const proposal = await api.proposals.findByWorkbenchId('plumtide');
    if (!proposal) throw new Error('Missing fixture');
    team.selectActor('human-visual');
    await expect(api.proposals.setMode(proposal.id, 'automatic', [], { expectedRevision: proposal.revision })).rejects.toMatchObject({ kind: 'forbidden' });
    const approved = await api.proposals.decide(proposal.id, 'visual', { kind: 'approve', comment: '视觉确认' }, { expectedRevision: proposal.revision });
    expect(approved.decisions.at(-1)).toMatchObject({ by: '陈澄', stage: 'visual' });
    const ready = await api.proposals.getProposal(proposal.id);
    expect(ready.stages.delivery.status).toBe('waiting_for_you');
    await expect(api.proposals.decide(ready.id, 'delivery', { kind: 'approve', comment: '越权交付' }, { expectedRevision: ready.revision })).rejects.toMatchObject({ kind: 'forbidden' });
    team.selectActor('human-owner');
    const delivered = await api.proposals.decide(ready.id, 'delivery', { kind: 'approve', comment: '确认交付' }, { expectedRevision: ready.revision });
    expect(delivered.decisions.at(-1)).toMatchObject({ by: '林予', stage: 'delivery' });
    team.destroy();
  });

  it('lets designers select layout and discuss, but denies narrative writes and nonvisual content changes', async () => {
    const { api, team } = setup();
    team.selectActor('human-designer');
    const proposal = await api.proposals.findByWorkbenchId('northline');
    if (!proposal?.layout) throw new Error('Missing fixture');
    const updated = await api.proposals.chooseLayout(proposal.id, proposal.layout.styles[0].id, { expectedRevision: proposal.revision });
    const commented = await api.proposals.contribute(updated.id, 'strategy', { kind: 'comment', text: '设计师的跨岗位交流', borrow: null }, { expectedRevision: updated.revision });
    expect(commented.contributions.at(-1)?.by).toBe('许言');
    await expect(api.proposals.contribute(updated.id, 'themes', { kind: 'slogan', text: '越界文案', borrow: null }, { expectedRevision: commented.revision })).rejects.toMatchObject({ kind: 'forbidden' });
    await expect(api.proposals.editNarrative(updated.id, 'section', '越界叙事', { expectedRevision: commented.revision })).rejects.toMatchObject({ kind: 'forbidden' });
    team.destroy();
  });

  it('requires explicit revision on protected proposal updates and emits no stage-derived completion notification', async () => {
    const { api, team } = setup();
    const proposal = await api.proposals.findByWorkbenchId('northline');
    if (!proposal) throw new Error('Missing fixture');
    await expect(api.proposals.contribute(proposal.id, 'themes', { kind: 'comment', text: 'missing revision', borrow: null })).rejects.toMatchObject({ kind: 'validation' });
    expect(proposal.currentStage).toBe('delivery');
    await api.proposals.getProposal(proposal.id);
    await api.proposals.listProposals();
    expect(team.getSnapshot().notifications).toHaveLength(0);
    await expect(team.simulateCompletion(proposal)).rejects.toMatchObject({ kind: 'not_eligible' });
    const automatic = await api.proposals.setMode(proposal.id, 'automatic', [], { expectedRevision: proposal.revision });
    const before = JSON.stringify(await api.proposals.getProposal(proposal.id));
    const notification = await team.simulateCompletion(automatic);
    expect(notification?.event.origin).toBe('explicit-dev-simulation');
    expect(JSON.stringify(await api.proposals.getProposal(proposal.id))).toBe(before);
    await team.simulateCompletion(automatic);
    expect(team.getSnapshot().notifications).toHaveLength(1);
    team.destroy();
  });
});

describe('identity-scoped assistant storage', () => {
  it('preserves conversation keys and correct-project evidence, isolating history across identity switches and reload', async () => {
    const { api, team, raw, data } = setup();
    const result = await api.assistant.ask(scope, { text: '这个项目缺什么证据？', suggestionId: 'evidence' }, context);
    expect(result.key).toBe('project:luma');
    expect(result.messages.at(-1)?.basedOn?.projectId).toBe('luma');
    team.selectActor('human-operator');
    expect((await api.assistant.getConversation(scope)).messages).toHaveLength(0);
    await api.assistant.ask(scope, { text: '下一步做什么？', suggestionId: 'next' }, context);
    const reloaded = actorScopedAssistant((actor) => new MockAssistantService(raw.workbench, actorKeyValueStore(data, actor.id), 0, raw.proposals), team);
    expect((await reloaded.getConversation(scope)).messages).toHaveLength(2);
    team.selectActor('human-owner');
    expect((await api.assistant.getConversation(scope)).messages[0].text).toBe('这个项目缺什么证据？');
    expect((await reloaded.getConversation(scope)).key).toBe('project:luma');
    team.destroy();
  });
});

 it('forwards frozen original selections through manage guard and reads upload policy without writing', async () => {
   const f = setup();
   const calls: unknown[] = [];
   const policy = {available: true, accept: 'application/pdf', maxBytes: 1024, maxCount: 1, hint: '仅PDF'} satisfies import('../domain/proposal').BrandResourceUploadPolicy;
   const proposals = {...f.api.proposals, ensureBrandResourceStorage: async (resources?: import('../domain/brandResources').BrandResourceUpload[]) => {calls.push(resources);}, getBrandResourceUploadPolicy: async () => policy};
   const api = protectServices({...f.raw, proposals}, f.team);
   const resources: import('../domain/brandResources').BrandResourceUpload[] = [];
   try {
     expect(await api.proposals.getBrandResourceUploadPolicy?.()).toEqual(policy); expect(calls).toHaveLength(0);
     await api.proposals.ensureBrandResourceStorage(resources); expect(calls).toEqual([resources]); expect(calls[0]).toBe(resources);
     f.team.selectActor('human-guest');
     expect(await api.proposals.getBrandResourceUploadPolicy?.()).toEqual(policy);
     await expect(api.proposals.ensureBrandResourceStorage(resources)).rejects.toMatchObject({kind: 'forbidden'}); expect(calls).toHaveLength(1);
   } finally {f.team.destroy();}
 });

it('protects optional independent-reader commands and passes the actual operator identity',async()=>{
 const {raw,team}=setup(),calls:unknown[][]=[];
 const stop=async(...args:unknown[]):Promise<never>=>{calls.push(args);throw Error('reached test boundary');};
 const reader={excerpts:stop,revise:stop,dispose:stop,get:stop,report:stop,register:stop,start:stop,reconcile:stop} satisfies import('../domain/researchReader').ResearchReaderService;
 const api=protectServices({...raw,workbench:Object.assign(raw.workbench,{researchReader:reader})},team),protectedReader=api.workbench.researchReader;
 if(!protectedReader)throw Error('Missing optional reader');
 team.selectActor('human-guest');const input={questions:[{id:'q',question:'事实边界？',critical:true}],readerCount:1} satisfies {questions:import('../domain/researchReader').ReaderQuestion[];readerCount:1|2};
 await expect(protectedReader.register('luma',input,meta)).rejects.toMatchObject({kind:'forbidden'});await expect(protectedReader.start('luma',{artifactId:'a',registrationId:'r',seat:0},meta)).rejects.toMatchObject({kind:'forbidden'});await expect(protectedReader.reconcile('luma','job',meta)).rejects.toMatchObject({kind:'forbidden'});await expect(protectedReader.revise('luma','artifact',meta)).rejects.toMatchObject({kind:'forbidden'});await expect(protectedReader.dispose('luma',{artifactId:'new',previousReportId:'old',dispositions:[]},meta)).rejects.toMatchObject({kind:'forbidden'});expect(calls).toEqual([]);
 team.selectActor('human-owner');await expect(protectedReader.register('luma',input,meta)).rejects.toThrow('reached test boundary');expect(calls[0][2]).toMatchObject({actor:{id:'human-owner'}});team.destroy();
});
it('protects optional acquisition start, fixed step and reconcile as workflow commands',async()=>{
 const {raw,team}=setup(),calls:unknown[][]=[];
 const stop=async(...args:unknown[]):Promise<never>=>{calls.push(args);throw Error('reached acquisition boundary');};
 const acquisition={get:stop,start:stop,step:stop,reconcile:stop} satisfies import('../domain/researchAcquisition').ResearchAcquisitionService;
 const api=protectServices({...raw,workbench:Object.assign(raw.workbench,{researchAcquisition:acquisition})},team).workbench.researchAcquisition;if(!api)throw Error('Missing optional acquisition');
 try{team.selectActor('human-guest');const target={taskCardId:'card',taskCardHash:'hash'};
 await expect(api.start('p',{...target,sourceEntryIds:[],materialIds:[]},meta)).rejects.toMatchObject({kind:'forbidden'});await expect(api.step('p',{...target,generationId:'g',jobIds:['job']},meta)).rejects.toMatchObject({kind:'forbidden'});await expect(api.reconcile('p',{...target,generationId:'g',jobId:'job'},meta)).rejects.toMatchObject({kind:'forbidden'});expect(calls).toEqual([]);
 team.selectActor('human-owner');await expect(api.step('p',{...target,generationId:'g',jobIds:['job']},meta)).rejects.toThrow('reached acquisition boundary');expect(calls[0][2]).toMatchObject({actor:{id:'human-owner'}});
 }finally{team.destroy();}
});
