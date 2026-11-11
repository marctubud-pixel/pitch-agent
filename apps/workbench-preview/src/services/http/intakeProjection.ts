import {ServiceError} from '../../domain/service';
import {isBrandResource, type BrandResource, type BrandResourceUpload, validateBrandUploads} from '../../domain/brandResources';
import {object, text, integer, type Snapshot} from './dto';

const invalid = (message: string): never => {throw new ServiceError('validation', message);};
export async function originalHash(bytes: Uint8Array): Promise<string> {
  const buffer = new Uint8Array(bytes).buffer;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))].map(n => n.toString(16).padStart(2, '0')).join('');
}
export interface RegisteredOriginal {
  id: string; resource: BrandResource | null; sha256: string; taskCardId: string; taskCardHash: string;
  operation: Record<string, unknown>; document: Record<string, unknown>;
}
export function registeredOriginals(p: Snapshot): RegisteredOriginal[] {
  const documents = p.intakeDocuments ?? [], operations = (p.intakeOperations ?? []).filter(op => op.kind === 'intake-register' && object(op.request).bridgeProtocol === 'brief-original-v1');
  const ids = new Set<string>(), clients = new Set<string>();
  return operations.map(operation => {
    const request = object(operation.request), response = object(operation.response), id = text(response.documentId);
    const matches = documents.filter(doc => doc.id === id);
    if (!id || ids.has(id) || matches.length !== 1) return invalid('原件登记缺失或重复，请核对原记录。');
    ids.add(id);
    const document = matches[0], raw = object(document.raw), origin = object(document.origin), metadata = request.metadata === undefined ? {} : object(request.metadata);
    const resource = {id: text(metadata.clientResourceId), fileName: text(origin.originalFilename), size: integer(raw.byteLength), mediaType: text(metadata.declaredMediaType), lastModified: metadata.lastModified === undefined ? 0 : integer(metadata.lastModified), note: text(metadata.note)};
    if (document.projectId !== p.id || document.kind !== 'pdf' || document.protocol !== 'intake-document-v1' || origin.kind !== 'upload' || raw.mediaType !== 'application/pdf'
      || origin.originalFilename !== request.originalFilename || !/^[a-f0-9]{64}$/.test(text(raw.sha256)) || raw.sha256 !== request.sha256 || raw.byteLength !== request.byteLength
      || resource.size < 5 || resource.size > 12 * 1024 * 1024 || !p.cards.some(c => c.id === request.taskCardId) || !/^[a-f0-9]{64}$/.test(text(request.taskCardHash)) || metadata.clientResourceId !== undefined && (!isBrandResource(resource) || clients.has(resource.id) || !['', 'application/pdf'].includes(resource.mediaType))) return invalid('原件与资料身份不一致，未采用。');
    if (metadata.clientResourceId !== undefined) clients.add(resource.id);
    return {id, resource: metadata.clientResourceId === undefined ? null : resource, sha256: text(raw.sha256), taskCardId: text(request.taskCardId), taskCardHash: text(request.taskCardHash), operation, document};
  });
}
export function bridgeStorageJob(p: Snapshot, job: Record<string, unknown>): boolean {
  if (p.workflowVersion !== 'proposal-seven-v1' || job.stage !== 'intake' || job.purpose !== 'intake_document'
    || !Array.isArray(job.attempts)) return false;
  const binding = object(job.binding), task = object(job.task);
  if (binding.providerId !== 'local-pdf' || binding.model !== 'pdf-extraction-v1' || binding.role !== 'document-parser' || task.kind !== 'pdf' || task.id !== job.documentId) return false;
  const originals = registeredOriginals(p).filter(d => d.id === job.documentId && object(d.operation.response).jobId === job.id);
  if(originals.length!==1||p.jobs.filter(j=>j.documentId===job.documentId).length!==1)return false;
  const document=originals[0].document;
  if(job.status==='queued'&&!job.attempts.length)return document.status==='queued'&&!document.extraction;
  if(!['queued','running','succeeded','failed','blocked'].includes(text(job.status))||!job.attempts.length)return false;
  const commands=Object.values(p.processedCommands).map(raw=>{try{return object(JSON.parse(text(raw)));}catch{return {};}});
  if(!commands.some(c=>c.kind==='intake-start'&&c.jobId===job.id&&c.request&&object(c.request).documentId===job.documentId&&object(c.request).taskCardId===originals[0].taskCardId&&object(c.request).taskCardHash===originals[0].taskCardHash))return false;
  if(job.attempts.some(raw=>{const a=object(raw);return typeof a.id!=='string'||a.dispatchStarted!==false||a.httpAttemptLocator!==undefined||a.resultEvidence!==undefined||a.requestEvidence!==undefined;}))return false;
  if(job.status==='succeeded')return document.status==='ready'&&Boolean(document.extraction)&&JSON.stringify(job.outputVersionIds)===JSON.stringify([document.id])&&object(job.attempts.at(-1)).status==='succeeded'&&JSON.stringify(object(job.attempts.at(-1)).documentSnapshot)===JSON.stringify(document);
  return job.status==='running'?document.status==='queued'&&object(job.attempts.at(-1)).status==='running':job.status==='queued'?document.status==='queued':document.status==='failed'&&object(job.attempts.at(-1)).status===job.status;
}
export function originalCapability(value: unknown) {
  if (value === undefined) throw new ServiceError('unavailable', '资料原件存储尚未接通。');
  const c = object(value);
  if (c.protocol !== 'brief-original-v1' || c.originalStorage !== true || !Array.isArray(c.mediaTypes) || !c.mediaTypes.includes('application/pdf')
    || integer(c.maxBytes) < 1 || integer(c.maxBytes) > 12 * 1024 * 1024 || integer(c.maxDocuments) < 1
    || typeof c.localExtractionAvailable !== 'boolean' || c.modelExtractionAvailable !== false) return invalid('资料原件存储尚未接通。');
  return {maxBytes: integer(c.maxBytes), maxDocuments: integer(c.maxDocuments), accept: c.mediaTypes.filter(type => type === 'application/pdf').join(',')};
}
export async function validateOriginalUploads(resources: BrandResourceUpload[], capability: ReturnType<typeof originalCapability>) {
  validateBrandUploads(resources);
  if (resources.length > capability.maxDocuments) return invalid('资料数量超过当前服务上限。');
  for (const {resource, file} of resources) {
    if (!resource.fileName.toLowerCase().endsWith('.pdf') || !['', 'application/pdf'].includes(resource.mediaType) || file.size < 5 || file.size > capability.maxBytes) return invalid('当前服务只保存不超过12 MB的PDF原件；尚未解析或由模型读取。');
    const header = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    if (String.fromCharCode(...header) !== '%PDF-') return invalid('文件内容不是PDF原件，未发送。');
  }
}
export function originalBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
