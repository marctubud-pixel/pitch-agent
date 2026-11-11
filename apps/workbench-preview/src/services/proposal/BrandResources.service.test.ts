import { describe, expect, it } from 'vitest';
import type { BrandResourceUpload } from '../../domain/brandResources';
import type { CreateProposalInput } from '../../domain/proposal';
import { ServiceError } from '../../domain/service';
import { MockWorkbenchService } from '../mock/MockWorkbenchService';
import { memoryStore } from '../mock/storage';
import { MemoryBrandResourceTestRepository } from './BrandResourceRepository';
import { MockProposalService } from './MockProposalService';

const PROPOSALS_KEY = 'proposal-workbench/demo/proposals/zh-desktop-v1';

async function setup(repository = new MemoryBrandResourceTestRepository()) {
  let rejectMetadataWrite = false;
  const data = memoryStore();
  const store = { ...data, set: (key: string, value: string) => {
    if (rejectMetadataWrite && key === PROPOSALS_KEY) throw new Error('quota');
    data.set(key, value);
  } };
  const workbench = new MockWorkbenchService({ store, latency: { read: 0, write: 0 }, autoTick: false });
  const proposals = new MockProposalService(workbench, store, { latency: 0, brandResources: repository });
  const catalog = await workbench.listProjects({ status: 'all' });
  const receipt = await workbench.createProject({ name: 'Brand reference draft', client: 'Client', summary: '', mode: 'step_by_step', researchOwner: '', strategyOwner: '' }, { commandId: 'brand-create', expectedRevision: catalog.catalogRevision });
  const file = new File(['字节原样保存\n\u0000\uffff'], '品牌规范.pdf', { type: 'application/pdf', lastModified: 1234 });
  const upload: BrandResourceUpload = { file, resource: { id: 'reference-1', fileName: file.name, size: file.size, mediaType: file.type, lastModified: file.lastModified, note: '保留这条用途说明\n供后续参考' } };
  const input: CreateProposalInput = { workbenchId: receipt.data.id, name: receipt.data.name, client: 'Client', type: 'kv', mode: 'assisted', checkpoints: ['strategy'], brandResources: [upload.resource] };
  return { data, store, workbench, proposals, repository, receipt, upload, input, failMetadata: (fail: boolean) => { rejectMetadataWrite = fail; } };
}

describe('proposal brand references with an explicit memory test port', () => {
  it('requires staged originals, persists only metadata, and reopens exact original bytes', async () => {
    const { proposals, workbench, store, repository, upload, input } = await setup();
    await expect(proposals.createProposal(input)).rejects.toThrow(/缺失/);
    expect(await proposals.findByWorkbenchId(input.workbenchId)).toBeNull();
    await proposals.ensureBrandResourceStorage();
    await proposals.stageBrandResources({ workbenchId: input.workbenchId, resources: [upload] });
    const saved = await proposals.createProposal(input);
    const reopened = new MockProposalService(workbench, store, { latency: 0, brandResources: repository });
    expect((await reopened.getProposal(saved.id)).brandResources).toEqual([upload.resource]);
    expect(await (await reopened.getBrandResourceFile(saved.id, upload.resource.id)).arrayBuffer()).toEqual(await upload.file.arrayBuffer());
    const summary = (await reopened.listProposals()).find((item) => item.id === saved.id);
    expect(summary).not.toHaveProperty('brandResources');
    expect(summary).not.toHaveProperty('file');
    expect(store.get(PROPOSALS_KEY)).toContain('"schema":4');
    expect(store.get(PROPOSALS_KEY)).not.toContain('字节原样保存');
    expect(saved.stages.brief.status).toBe('in_progress');
    expect(saved.stages.research.status).toBe('not_started');
    expect((await workbench.getProjectOverview(input.workbenchId)).brief?.confirmedAt).toBeNull();
  });

  it('keeps staged originals and the first project receipt after metadata failure for a same-owner retry', async () => {
    const { proposals, workbench, upload, input, receipt, failMetadata } = await setup();
    await proposals.stageBrandResources({ workbenchId: input.workbenchId, resources: [upload] });
    failMetadata(true);
    await expect(proposals.createProposal(input)).rejects.toMatchObject({ kind: 'unavailable', retryable: true });
    expect(await proposals.findByWorkbenchId(input.workbenchId)).toBeNull();
    failMetadata(false);
    await proposals.stageBrandResources({ workbenchId: receipt.data.id, resources: [upload] });
    const saved = await proposals.createProposal(input);
    expect(await (await proposals.getBrandResourceFile(saved.id, upload.resource.id)).text()).toBe(await upload.file.text());
    expect((await workbench.listProjects({ status: 'all' })).items.filter((project) => project.id === receipt.data.id)).toHaveLength(1);
    expect((await proposals.listProposals()).filter((proposal) => proposal.workbenchId === receipt.data.id)).toHaveLength(1);
  });

  it('keeps a stage failure recoverable without creating proposal metadata', async () => {
    class FailOnceRepository extends MemoryBrandResourceTestRepository {
      fail = true;
      override async stage(input: Parameters<MemoryBrandResourceTestRepository['stage']>[0]) {
        if (this.fail) { this.fail = false; throw new ServiceError('unavailable', '原件保存失败', { retryable: true }); }
        return super.stage(input);
      }
    }
    const { proposals, upload, input } = await setup(new FailOnceRepository());
    await expect(proposals.stageBrandResources({ workbenchId: input.workbenchId, resources: [upload] })).rejects.toMatchObject({ kind: 'unavailable' });
    expect(await proposals.findByWorkbenchId(input.workbenchId)).toBeNull();
    await proposals.stageBrandResources({ workbenchId: input.workbenchId, resources: [upload] });
    expect((await proposals.createProposal(input)).brandResources).toEqual([upload.resource]);
  });

  it('checks project ownership, membership and immutable metadata', async () => {
    const { proposals, upload, input } = await setup();
    await expect(proposals.stageBrandResources({ workbenchId: 'missing-project', resources: [upload] })).rejects.toThrow();
    await proposals.stageBrandResources({ workbenchId: input.workbenchId, resources: [upload] });
    const saved = await proposals.createProposal(input);
    await expect(proposals.getBrandResourceFile(saved.id, 'not-a-member')).rejects.toMatchObject({ kind: 'not_found' });
    await expect(proposals.getBrandResourceFile('northline-kv', upload.resource.id)).rejects.toMatchObject({ kind: 'not_found' });
    await expect(proposals.stageBrandResources({ workbenchId: input.workbenchId, resources: [{ ...upload, resource: { ...upload.resource, note: 'changed' } }] })).rejects.toMatchObject({ kind: 'conflict' });
  });

  it('rejects missing durable storage but keeps resource-free creation compatible', async () => {
    const store = memoryStore();
    const workbench = new MockWorkbenchService({ store, latency: { read: 0, write: 0 }, autoTick: false });
    const proposals = new MockProposalService(workbench, store, { latency: 0 });
    await expect(proposals.ensureBrandResourceStorage()).rejects.toMatchObject({ kind: 'unavailable' });
    const created = await proposals.createProposal({ workbenchId: 'legacy', name: 'No files', client: '', type: 'kv', mode: 'assisted', checkpoints: [] });
    expect(created).not.toHaveProperty('brandResources');
    expect((await proposals.findByWorkbenchId('northline'))?.name).toBeTruthy();
  });

  it('checks both metadata write/read readiness and the Workbench persistence capability', async () => {
    const store = memoryStore();
    const workbench = new MockWorkbenchService({ store, latency: { read: 0, write: 0 }, autoTick: false });
    const testPort = new MemoryBrandResourceTestRepository();
    const unreadableStore = { ...store, get: (key: string) => key.includes('/brand-resource-probe/') ? null : store.get(key) };
    const unreadable = new MockProposalService(workbench, unreadableStore, { latency: 0, brandResources: testPort });
    await expect(unreadable.ensureBrandResourceStorage()).rejects.toMatchObject({ kind: 'unavailable' });
    const nativeCapability = {
      persistence: 'indexeddb' as const,
      ensureReady: () => testPort.ensureReady(),
      stage: (input: Parameters<MemoryBrandResourceTestRepository['stage']>[0]) => testPort.stage(input),
      get: (input: Parameters<MemoryBrandResourceTestRepository['get']>[0]) => testPort.get(input),
    };
    const memoryWorkbench = new MockProposalService(workbench, store, { latency: 0, metadataPersistence: 'local', brandResources: nativeCapability });
    await expect(memoryWorkbench.ensureBrandResourceStorage()).rejects.toMatchObject({ kind: 'unavailable' });
    expect(await memoryWorkbench.findByWorkbenchId('no-project-was-created')).toBeNull();
  });
});
