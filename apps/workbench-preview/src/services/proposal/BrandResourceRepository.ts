import { brandResourceMetadata, isBrandResource, sameBrandResource, validateBrandResources, validateBrandUploads, type BrandResource, type BrandResourceRepository, type BrandResourceUpload } from '../../domain/brandResources';
import { ServiceError } from '../../domain/service';

export const BRAND_RESOURCE_DB = 'proposal-workbench-brand-resources';
export const BRAND_RESOURCE_STORE = 'originals';

interface OriginalRecord {
  workbenchId: string;
  resourceId: string;
  metadata: BrandResource;
  sha256: string;
  blob: Blob;
}

function unavailable() {
  return new ServiceError('unavailable', '品牌资料原件无法保存或读取。请检查浏览器存储空间及网站数据权限后重试。', { retryable: true });
}

function requireOwner(workbenchId: string) {
  if (typeof workbenchId !== 'string' || !workbenchId.trim() || workbenchId.length > 200) {
    throw new ServiceError('validation', '品牌资料缺少有效的所属项目。');
  }
}

export async function brandResourceDigest(blob: Blob) {
  if (!globalThis.crypto?.subtle) throw unavailable();
  const digest = await globalThis.crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function isOriginalRecord(value: unknown): value is OriginalRecord {
  if (typeof value !== 'object' || value === null) return false;
  return 'workbenchId' in value && typeof value.workbenchId === 'string'
    && 'resourceId' in value && typeof value.resourceId === 'string'
    && 'metadata' in value && isBrandResource(value.metadata) && value.metadata.id === value.resourceId
    && 'sha256' in value && typeof value.sha256 === 'string' && /^[a-f0-9]{64}$/.test(value.sha256)
    && 'blob' in value && value.blob instanceof Blob;
}

async function records(input: { workbenchId: string; resources: BrandResourceUpload[] }): Promise<OriginalRecord[]> {
  requireOwner(input.workbenchId);
  validateBrandUploads(input.resources);
  const result: OriginalRecord[] = [];
  for (const { resource, file } of input.resources) {
    result.push({ workbenchId: input.workbenchId, resourceId: resource.id, metadata: brandResourceMetadata(resource), sha256: await brandResourceDigest(file), blob: file });
  }
  return result;
}

function mergeBatch(existing: OriginalRecord[], incoming: OriginalRecord[]) {
  const merged = new Map(existing.map((record) => [record.resourceId, record]));
  for (const record of incoming) {
    const previous = merged.get(record.resourceId);
    if (previous && (previous.workbenchId !== record.workbenchId || !sameBrandResource(previous.metadata, record.metadata)
      || previous.sha256 !== record.sha256 || previous.blob.size !== record.blob.size || previous.blob.type !== record.blob.type)) {
      throw new ServiceError('conflict', '同一品牌资料标识已保存不同原件或说明，请保留当前输入并核对。');
    }
    merged.set(record.resourceId, record);
  }
  validateBrandResources([...merged.values()].map((record) => record.metadata));
}

async function original(value: unknown, workbenchId: string, resource: BrandResource): Promise<Blob> {
  if (!isOriginalRecord(value) || value.workbenchId !== workbenchId || !sameBrandResource(value.metadata, resource)
    || value.blob.size !== resource.size || value.blob.type !== resource.mediaType
    || await brandResourceDigest(value.blob) !== value.sha256) {
    throw new ServiceError('unavailable', '此资料原件缺失或校验失败，无法下载。请联系资料提供人补充原件。');
  }
  return value.blob;
}

export class IndexedDBBrandResourceRepository implements BrandResourceRepository {
  readonly persistence = 'indexeddb' as const;

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      try {
        if (!globalThis.indexedDB || !globalThis.crypto?.subtle) throw unavailable();
        const request = globalThis.indexedDB.open(BRAND_RESOURCE_DB, 1);
        let failed = false;
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(BRAND_RESOURCE_STORE)) {
            const store = db.createObjectStore(BRAND_RESOURCE_STORE, { keyPath: ['workbenchId', 'resourceId'] });
            store.createIndex('by-workbench', 'workbenchId');
          }
        };
        request.onerror = request.onblocked = () => { failed = true; reject(unavailable()); };
        request.onsuccess = () => {
          if (failed) { request.result.close(); return; }
          request.result.onversionchange = () => request.result.close();
          resolve(request.result);
        };
      } catch { reject(unavailable()); }
    });
  }

  async ensureReady() {
    const db = await this.open();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(BRAND_RESOURCE_STORE, 'readwrite');
        transaction.oncomplete = () => resolve();
        transaction.onerror = transaction.onabort = () => reject(unavailable());
        const store = transaction.objectStore(BRAND_RESOURCE_STORE);
        const resourceId = globalThis.crypto.randomUUID();
        store.put({ workbenchId: '__readiness__', resourceId, blob: new Blob(['probe']) });
        store.delete(['__readiness__', resourceId]);
      });
    } catch { throw unavailable(); }
    finally { db.close(); }
  }

  async stage(input: { workbenchId: string; resources: BrandResourceUpload[] }) {
    // Hash outside the transaction so native IndexedDB cannot commit between awaits.
    const incoming = await records(input);
    const db = await this.open();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(BRAND_RESOURCE_STORE, 'readwrite');
        let failure: unknown;
        transaction.oncomplete = () => resolve();
        transaction.onerror = transaction.onabort = () => reject(failure ?? unavailable());
        const store = transaction.objectStore(BRAND_RESOURCE_STORE);
        const request = store.index('by-workbench').getAll(input.workbenchId);
        request.onsuccess = () => {
          try {
            const existing: unknown = request.result;
            if (!Array.isArray(existing) || !existing.every(isOriginalRecord)) throw unavailable();
            mergeBatch(existing, incoming);
            for (const record of incoming) store.put(record);
          } catch (error) { failure = error; transaction.abort(); }
        };
      });
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw unavailable();
    } finally { db.close(); }
  }

  async get({ workbenchId, resource }: { workbenchId: string; resource: BrandResource }) {
    requireOwner(workbenchId);
    validateBrandResources([resource]);
    const db = await this.open();
    let value: unknown;
    try {
      value = await new Promise<unknown>((resolve, reject) => {
        const transaction = db.transaction(BRAND_RESOURCE_STORE, 'readonly');
        const request = transaction.objectStore(BRAND_RESOURCE_STORE).get([workbenchId, resource.id]);
        transaction.oncomplete = () => resolve(request.result);
        transaction.onerror = transaction.onabort = () => reject(unavailable());
      });
    } catch { throw unavailable(); }
    finally { db.close(); }
    return original(value, workbenchId, resource);
  }
}

export class MemoryBrandResourceTestRepository implements BrandResourceRepository {
  readonly persistence = 'test-memory' as const;
  private data = new Map<string, OriginalRecord>();
  async ensureReady() {}
  async stage(input: { workbenchId: string; resources: BrandResourceUpload[] }) {
    const incoming = await records(input);
    const existing = [...this.data.values()].filter((record) => record.workbenchId === input.workbenchId);
    mergeBatch(existing, incoming);
    for (const record of incoming) this.data.set(JSON.stringify([record.workbenchId, record.resourceId]), structuredClone(record));
  }
  async get({ workbenchId, resource }: { workbenchId: string; resource: BrandResource }) {
    requireOwner(workbenchId);
    validateBrandResources([resource]);
    return original(this.data.get(JSON.stringify([workbenchId, resource.id])), workbenchId, resource);
  }
}
