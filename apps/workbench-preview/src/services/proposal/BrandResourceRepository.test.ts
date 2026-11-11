import { describe, expect, it } from 'vitest';
import { validateBrandResources, validateBrandUploads, type BrandResourceUpload } from '../../domain/brandResources';
import { IndexedDBBrandResourceRepository, MemoryBrandResourceTestRepository } from './BrandResourceRepository';

function brandUpload(name = '品牌手册.PDF', content = '原始品牌资料\n未经解析', id = 'brand-1'): BrandResourceUpload {
  const file = new File([content], name, { type: 'application/pdf', lastModified: 1700000000000 });
  return { file, resource: { id, fileName: file.name, size: file.size, mediaType: file.type, lastModified: file.lastModified, note: '参考品牌配色' } };
}

describe('brand resource limits and file boundary', () => {
  it('accepts uppercase extensions, unknown MIME and opaque design/font/archive sources', () => {
    for (const name of ['Manual.PDF', 'Design.AI', 'Print.EPS', 'Source.PSD', 'Type.OTF', 'Archive.ZIP', 'Old.DOC', 'Slides.PPT', '规范.md']) {
      const file = new File(['opaque'], name, { type: '', lastModified: 1 });
      expect(() => validateBrandUploads([{ resource: { id: 'file', fileName: name, size: file.size, mediaType: '', lastModified: 1, note: '' }, file }])).not.toThrow();
    }
  });

  it('rejects duplicate IDs, executable extensions, oversized/count/total batches and long notes', () => {
    const { resource } = brandUpload();
    for (const resources of [
      [resource, resource],
      [{ ...resource, fileName: 'installer.exe' }],
      [{ ...resource, size: 50 * 1024 * 1024 + 1 }],
      [{ ...resource, note: 'x'.repeat(1001) }],
      Array.from({ length: 11 }, (_, index) => ({ ...resource, id: `file-${index}` })),
      Array.from({ length: 5 }, (_, index) => ({ ...resource, id: `file-${index}`, size: 50 * 1024 * 1024 })),
    ]) expect(() => validateBrandResources(resources)).toThrow();
    const upload = brandUpload();
    expect(() => validateBrandUploads([{ ...upload, resource: { ...upload.resource, size: 999 } }])).toThrow(/不一致/);
  });
});

describe('explicit in-memory resource test port, not native IndexedDB persistence', () => {
  it('retains byte-exact originals for the right owner and allows identical retries', async () => {
    const repository = new MemoryBrandResourceTestRepository();
    const upload = brandUpload();
    const batch = { workbenchId: 'owner-a', resources: [upload] };
    await repository.ensureReady();
    await repository.stage(batch);
    await repository.stage(batch);
    const read = await repository.get({ workbenchId: 'owner-a', resource: upload.resource });
    expect(await read.arrayBuffer()).toEqual(await upload.file.arrayBuffer());
    expect(read.type).toBe(upload.file.type);
    await expect(repository.get({ workbenchId: 'owner-b', resource: upload.resource })).rejects.toThrow(/缺失或校验失败/);
    await expect(repository.get({ workbenchId: 'owner-a', resource: { ...upload.resource, note: 'changed' } })).rejects.toThrow(/校验失败/);
  });

  it('rejects changed bytes or metadata at an existing key and leaves the whole batch unchanged', async () => {
    const repository = new MemoryBrandResourceTestRepository();
    const upload = brandUpload('same.pdf', 'abcd');
    await repository.stage({ workbenchId: 'owner', resources: [upload] });
    const extra = brandUpload('extra.pdf', 'new file', 'extra');
    await expect(repository.stage({ workbenchId: 'owner', resources: [extra, brandUpload('same.pdf', 'wxyz')] })).rejects.toMatchObject({ kind: 'conflict' });
    await expect(repository.get({ workbenchId: 'owner', resource: extra.resource })).rejects.toThrow(/缺失/);
    await expect(repository.stage({ workbenchId: 'owner', resources: [{ ...upload, resource: { ...upload.resource, note: 'new note' } }] })).rejects.toMatchObject({ kind: 'conflict' });
    expect(await (await repository.get({ workbenchId: 'owner', resource: upload.resource })).text()).toBe('abcd');
  });

  it('enforces limits across separately staged batches for the same owner', async () => {
    const repository = new MemoryBrandResourceTestRepository();
    const uploads = Array.from({ length: 10 }, (_, index) => brandUpload(`file-${index}.pdf`, 'file', `file-${index}`));
    await repository.stage({ workbenchId: 'owner', resources: uploads });
    await expect(repository.stage({ workbenchId: 'owner', resources: [brandUpload('eleventh.pdf', 'file', 'eleventh')] })).rejects.toMatchObject({ kind: 'validation' });
    expect(await (await repository.get({ workbenchId: 'owner', resource: uploads[0].resource })).text()).toBe('file');
  });
});

describe('native storage capability boundary', () => {
  it('rejects unsupported IndexedDB rather than claiming an in-memory save', async () => {
    expect(globalThis.indexedDB).toBeUndefined();
    await expect(new IndexedDBBrandResourceRepository().ensureReady()).rejects.toMatchObject({ kind: 'unavailable' });
  });
});
