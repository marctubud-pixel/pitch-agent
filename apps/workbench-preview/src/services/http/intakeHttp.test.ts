import {afterEach, expect, it} from 'vitest';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {mkdtemp, realpath, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import {Server} from 'node:http';
import {HttpWorkbenchService} from './HttpWorkbenchService';
import {HttpProposalService} from './HttpProposalService';
import {pendingWriteAction} from '../../collaboration/types';
import {bridgeStorageJob, registeredOriginals} from './intakeProjection';
import {mapProject} from './briefModels';
import type {BrandResourceUpload} from '../../domain/brandResources';
class SessionStore implements Storage {
  private values = new Map<string, string>(); get length() {return this.values.size;} key(i: number) {return [...this.values.keys()][i] ?? null;}
  getItem(k: string) {return this.values.get(k) ?? null;} setItem(k: string, v: string) {this.values.set(k, v);} removeItem(k: string) {this.values.delete(k);} clear() {this.values.clear();}
}
const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {for (const fn of cleanup.splice(0).reverse()) await fn();});
const upload = (id = 'client-original'): BrandResourceUpload => {
  const file = new Blob(['%PDF-1.4\nactual tiny original\n%%EOF'], {type: 'application/pdf'});
  return {file, resource: {id, fileName: '品牌手册.pdf', size: file.size, mediaType: file.type, lastModified: 12345, note: '用于核对品牌规范，尚未读取。'}};
};
async function fixture() {
  const module: unknown = createRequire(import.meta.url)(process.env.PITCH_INTAKE_TEST_SERVER ?? fileURLToPath(new URL('../../../../../tools/workbench/brief-server.mjs', import.meta.url)));
  if (!module || typeof module !== 'object' || !('createBriefServer' in module) || typeof module.createBriefServer !== 'function') throw new Error('Actual server missing');
  const native = module.createBriefServer;
  const root = await realpath(await mkdtemp(join(tmpdir(), 'pitch-intake-http-'))), options = {dbPath: join(root, 'fresh.sqlite'), port: 4182};
  const create = () => {const s: unknown = native(options); if (!(s instanceof Server)) throw new Error('Not actual HTTP server'); return s;};
  let server = create();
  const close = () => new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
  cleanup.push(async () => {await close(); await rm(root, {recursive: true, force: true});});
  const posts: Array<{path: string; body: string}> = []; let lose = false, corrupt = false;
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input)), method = init?.method ?? 'GET';
    if (method === 'POST') posts.push({path: url.pathname, body: String(init?.body)});
    const req = Readable.from([Buffer.from(typeof init?.body === 'string' ? init.body : '')]);
    Object.assign(req, {url: url.pathname + url.search, method, headers: {host: url.host, ...Object.fromEntries(new Headers(init?.headers))}});
    const response = await new Promise<Response>(resolve => {
      const headers: Record<string, string> = {};
      const res = {status: 200, setHeader(k: string, v: string) {headers[k] = v;}, writeHead(status: number, values: Record<string, string> = {}) {this.status = status; Object.assign(headers, values);}, end(data?: string | Uint8Array) {resolve(new Response(data === undefined ? null : typeof data === 'string' ? data : new Uint8Array(data), {status: this.status, headers}));}};
      server.emit('request', req, res);
    });
    if (lose && method === 'POST' && response.ok) {lose = false; return new Response(new ReadableStream({start(c) {c.error(new Error('Lost body'));}}), {status: 200});}
    if (corrupt && url.pathname.endsWith('/original')) return new Response('%PDF-altered', {headers: {'content-type': 'application/pdf'}});
    return response;
  };
  const storage = new SessionStore();
  const service = () => new HttpWorkbenchService({baseUrl: 'http://127.0.0.1:4182/api/v1', fetchImpl, recovery: {actorKey: () => 'owner', storage: () => storage, authorize: kind => {expect(pendingWriteAction(kind)).toEqual({kind: 'manage'});}}});
  return {service, posts, storage, lose() {lose = true;}, corrupt() {corrupt = true;}, async reopen() {await close(); server = create();}, async create() {
    const s = service(); const result = await s.createProject({name: '原件接线', client: '客户', summary: '本地工程', mode: 'step_by_step', researchOwner: '研究负责人', strategyOwner: '策略负责人', brief: {proposalType: 'packaging', background: '真实存储测试', audience: '未验证人群', objectives: [], deliverables: ['包装提案'], constraints: [], changeNote: ''}}, {commandId: 'create-original', expectedRevision: 0});
    return {s, id: result.data.id};
  }};
}
it('saves exact PDFs and selected metadata, survives native reopen, and returns verified bytes', async () => {
  const h = await fixture(), {s, id} = await h.create(), p = new HttpProposalService(s), u = upload();
  expect(await p.getBrandResourceUploadPolicy()).toMatchObject({available: true, accept: 'application/pdf', maxBytes: 12 * 1024 * 1024, maxCount: 10});
  await p.ensureBrandResourceStorage([u]); await p.stageBrandResources({workbenchId: id, resources: [u]});
  expect((await p.getProposal(id)).brandResources).toEqual([u.resource]);
  const native = await s.snapshot(id), saved = registeredOriginals(native)[0];
  expect(bridgeStorageJob(native, native.jobs[0])).toBe(true); expect(native.jobs[0]).toMatchObject({status: 'queued', attempts: []});
  expect(saved.document.extraction).toBeUndefined(); expect(await (await p.getBrandResourceFile(id, u.resource.id)).text()).toBe(await u.file.text());
  const n = h.posts.length; await p.stageBrandResources({workbenchId: id, resources: [u]}); expect(h.posts.length).toBe(n);
  await h.reopen(); const next = new HttpProposalService(h.service());
  expect((await next.getProposal(id)).brandResources).toEqual([u.resource]); expect(await (await next.getBrandResourceFile(id, u.resource.id)).text()).toBe(await u.file.text());
  h.corrupt(); await expect(next.getBrandResourceFile(id, u.resource.id)).rejects.toMatchObject({kind: 'validation'});
});
it('refresh recovery replays original body and revision once after accepted response loss', async () => {
  const h = await fixture(), {s, id} = await h.create(), u = upload(); h.lose();
  await expect(new HttpProposalService(s).stageBrandResources({workbenchId: id, resources: [u]})).rejects.toMatchObject({outcomeUnknown: true});
  const fresh = h.service(); expect(fresh.briefRecovery?.getPending()).toMatchObject({kind: 'upload_original'});
  await fresh.briefRecovery?.retry(); expect(h.posts.at(-1)?.body).toBe(h.posts.at(-2)?.body); expect(fresh.briefRecovery?.getPending()).toBeNull();
  await new HttpProposalService(fresh).stageBrandResources({workbenchId: id, resources: [u]});
  expect(registeredOriginals(await fresh.snapshot(id))).toHaveLength(1);
  expect((await fresh.snapshot(id)).jobs).toHaveLength(1);
});
it('preflight rejects unsupported or false PDF selections before project creation, and storage failure sends nothing', async () => {
  const h = await fixture(), s = h.service(), p = new HttpProposalService(s), u = upload();
  const unsupported = {...u, file: new Blob(['image'], {type: 'image/png'}), resource: {...u.resource, fileName: 'photo.png', mediaType: 'image/png', size: 5}};
  await expect(p.ensureBrandResourceStorage([unsupported])).rejects.toMatchObject({kind: 'validation'});
  const falsePdf = {...u, file: new Blob(['not a pdf'], {type: 'application/pdf'}), resource: {...u.resource, size: 9}};
  await expect(p.ensureBrandResourceStorage([falsePdf])).rejects.toMatchObject({kind: 'validation'}); expect(h.posts).toHaveLength(0);
  const {id} = await h.create(); h.storage.setItem = () => {throw new Error('Storage quota');}; const before = h.posts.length;
  await expect(new HttpProposalService(h.service()).stageBrandResources({workbenchId: id, resources: [u]})).rejects.toMatchObject({kind: 'unavailable'}); expect(h.posts).toHaveLength(before);
});
it('rejects unrelated intake jobs, altered metadata, document aliasing, and changed client bytes', async () => {
  const h = await fixture(), {s, id} = await h.create(), u = upload(), p = new HttpProposalService(s);
  await p.stageBrandResources({workbenchId: id, resources: [u]}); const native = await s.snapshot(id);
  const running = structuredClone(native); running.jobs[0].attempts = [{id: 'unallowed'}]; expect(() => mapProject(running)).toThrow();
  const foreign = structuredClone(native); foreign.intakeOperations = []; expect(() => mapProject(foreign)).toThrow();
  const duplicate = structuredClone(native); duplicate.intakeDocuments?.push({...duplicate.intakeDocuments[0]}); expect(() => registeredOriginals(duplicate)).toThrow();
  const tampered = structuredClone(native); if (tampered.intakeDocuments?.[0]) tampered.intakeDocuments[0].projectId = 'other'; expect(() => registeredOriginals(tampered)).toThrow();
  const different = upload(); different.file = new Blob(['%PDF-1.4\nOTHER tiny original!\n%%EOF'], {type: 'application/pdf'}); different.resource.size = different.file.size;
  await expect(p.stageBrandResources({workbenchId: id, resources: [different]})).rejects.toMatchObject({kind: 'conflict'});
});
