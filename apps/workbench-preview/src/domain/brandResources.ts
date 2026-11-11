import { ServiceError } from './service';

/** Original bytes live in a separate repository. This metadata is safe to serialize. */
export interface BrandResource {
  id: string;
  fileName: string;
  size: number;
  mediaType: string;
  lastModified: number;
  note: string;
}

export interface BrandResourceUpload {
  resource: BrandResource;
  file: Blob;
}

export interface BrandResourceRepository {
  readonly persistence: 'indexeddb' | 'test-memory';
  ensureReady(): Promise<void>;
  stage(input: { workbenchId: string; resources: BrandResourceUpload[] }): Promise<void>;
  get(input: { workbenchId: string; resource: BrandResource }): Promise<Blob>;
}

export const BRAND_RESOURCE_LIMITS = { fileSize: 50 * 1024 * 1024, count: 10, totalSize: 200 * 1024 * 1024, noteLength: 1000 };
export const BRAND_RESOURCE_EXTENSIONS = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'csv', 'txt', 'md', 'rtf', 'odt', 'ods', 'odp', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'tif', 'tiff', 'bmp', 'svg', 'ai', 'eps', 'psd', 'otf', 'ttf', 'woff', 'woff2', 'zip'] as const;
export const BRAND_RESOURCE_ACCEPT = BRAND_RESOURCE_EXTENSIONS.map((extension) => `.${extension}`).join(',');

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isBrandResource(value: unknown): value is BrandResource {
  if (!object(value)) return false;
  const fileName = value.fileName;
  return typeof value.id === 'string' && /^[\w-]{1,100}$/.test(value.id)
    && typeof fileName === 'string' && fileName.length > 0 && fileName.length <= 255
    && !/[/\\\u0000-\u001f]/.test(fileName)
    && BRAND_RESOURCE_EXTENSIONS.some((extension) => fileName.toLowerCase().endsWith(`.${extension}`))
    && typeof value.size === 'number' && Number.isSafeInteger(value.size) && value.size >= 0 && value.size <= BRAND_RESOURCE_LIMITS.fileSize
    && typeof value.mediaType === 'string' && value.mediaType.length <= 255
    && typeof value.lastModified === 'number' && Number.isSafeInteger(value.lastModified) && value.lastModified >= 0
    && typeof value.note === 'string' && value.note.length <= BRAND_RESOURCE_LIMITS.noteLength;
}

export function validateBrandResources(resources: unknown): asserts resources is BrandResource[] {
  if (!Array.isArray(resources) || resources.length > BRAND_RESOURCE_LIMITS.count) {
    throw new ServiceError('validation', '品牌资料最多 10 份。');
  }
  if (!resources.every(isBrandResource)) {
    throw new ServiceError('validation', '请检查资料格式、文件名和说明。每份不超过 50 MB，说明不超过 1000 字。');
  }
  if (new Set(resources.map((resource) => resource.id)).size !== resources.length) {
    throw new ServiceError('validation', '品牌资料标识重复，请重新选择文件。');
  }
  if (resources.reduce((sum, resource) => sum + resource.size, 0) > BRAND_RESOURCE_LIMITS.totalSize) {
    throw new ServiceError('validation', '品牌资料合计不能超过 200 MB。');
  }
}

export function validateBrandUploads(resources: BrandResourceUpload[]) {
  validateBrandResources(resources.map((upload) => upload.resource));
  for (const { resource, file } of resources) {
    if (!(file instanceof Blob) || file.size !== resource.size || file.type !== resource.mediaType
      || (typeof File !== 'undefined' && file instanceof File && (file.name !== resource.fileName || file.lastModified !== resource.lastModified))) {
      throw new ServiceError('validation', '资料原件与文件信息不一致，请重新选择。');
    }
  }
}

export function sameBrandResource(a: BrandResource, b: BrandResource) {
  return a.id === b.id && a.fileName === b.fileName && a.size === b.size && a.mediaType === b.mediaType
    && a.lastModified === b.lastModified && a.note === b.note;
}

export function brandResourceMetadata({ id, fileName, size, mediaType, lastModified, note }: BrandResource): BrandResource {
  return { id, fileName, size, mediaType, lastModified, note };
}

export function sameBrandResources(a: BrandResource[] = [], b: BrandResource[] = []) {
  return a.length === b.length && a.every((resource, index) => sameBrandResource(resource, b[index]));
}

export function brandResourceSize(size: number) {
  return size < 1024 * 1024 ? `${Math.max(1, Math.ceil(size / 1024))} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;
}
