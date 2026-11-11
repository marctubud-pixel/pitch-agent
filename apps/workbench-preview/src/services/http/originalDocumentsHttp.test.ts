import {object} from './dto';
import {HttpProposalService} from './HttpProposalService';
import {protectServices} from '../../collaboration/protectServices';
import {LocalTeamStore} from '../../collaboration/LocalTeamStore';
import {TestStorage} from '../../collaboration/testSupport';
import {LocalIntakeService} from '../intake/LocalIntakeService';
import {MockAssistantService} from '../mock/MockAssistantService';
import {memoryStore} from '../mock/storage';
import {afterEach, expect, it} from 'vitest';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {mkdtemp, realpath, rm, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import {Server} from 'node:http';
import {HttpWorkbenchService} from './HttpWorkbenchService';
import {pendingWriteAction} from '../../collaboration/types';
import {bridgeStorageJob} from './intakeProjection';
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
async function fixture(configured=false) {
  const module: unknown = createRequire(import.meta.url)(process.env.PITCH_PDF_TEST_SERVER ?? fileURLToPath(new URL('../../../../../tools/workbench/brief-server.mjs', import.meta.url)));
  if (!module || typeof module !== 'object' || !('createBriefServer' in module) || typeof module.createBriefServer !== 'function') throw new Error('Actual server missing');
  const native = module.createBriefServer;
  const root = await realpath(await mkdtemp(join(tmpdir(), 'pitch-intake-http-'))), options = {dbPath: join(root, 'fresh.sqlite'), port: 4182,intakeConfiguration:configured?{pythonBinary:process.env.PITCH_PDF_TEST_PYTHON}:null};
  const create = () => {const s: unknown = native(options); if (!(s instanceof Server)) throw new Error('Not actual HTTP server'); return s;};
  let server = create();
  const close = () => new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
  cleanup.push(async () => {await close(); await rm(root, {recursive: true, force: true});});
  const posts: Array<{path: string; body: string}> = []; let lose = false, corrupt = false,wrongReceipt=false;
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
    if(wrongReceipt&&method==='POST'&&response.ok){wrongReceipt=false;const value=await response.clone().json();value.jobId='other';return new Response(JSON.stringify(value),{status:200});}
    if (corrupt && url.pathname.endsWith('/original')) return new Response('%PDF-altered', {headers: {'content-type': 'application/pdf'}});
    return response;
  };
  const storage = new SessionStore();
  const service = (isolated=false) => {const session=isolated?new SessionStore():storage;return new HttpWorkbenchService({baseUrl: 'http://127.0.0.1:4182/api/v1', fetchImpl, recovery: {actorKey: () => 'owner', storage: () => session, authorize: kind => {expect(pendingWriteAction(kind)).toEqual(kind==='save_brief'?{kind:'edit_brief'}:{kind: 'manage'});}}});};
  return {dbPath:options.dbPath,service, posts, storage, lose() {lose = true;}, corrupt() {corrupt = true;}, wrongReceipt(){wrongReceipt=true;}, async reopen() {await close(); server = create();}, async create() {
    const s = service(); const result = await s.createProject({name: '原件接线', client: '客户', summary: '本地工程', mode: 'step_by_step', researchOwner: '研究负责人', strategyOwner: '策略负责人', brief: {proposalType: 'packaging', background: '真实存储测试', audience: '未验证人群', objectives: [], deliverables: ['包装提案'], constraints: [], changeNote: ''}}, {commandId: 'create-original', expectedRevision: 0});
    return {s, id: result.data.id};
  }};
}

it('default parser stays disabled while exact PDF storage and manage recovery remain available',async()=>{
 const h=await fixture(),{s,id}=await h.create(),u=upload();await s.saveBrandResources(id,[u]);
 const state=await s.originalDocuments.get(id,u.resource.id);expect(state).toMatchObject({available:false,current:true,jobStatus:'queued',result:null});
 const posts=h.posts.length;await expect(s.originalDocuments.extract(id,{documentId:state.documentId,taskCardId:state.taskCardId,taskCardHash:state.taskCardHash,action:'extract'},{commandId:'extract',expectedRevision:state.revision})).rejects.toMatchObject({kind:'unavailable'});expect(h.posts).toHaveLength(posts);
 expect(pendingWriteAction('extract_original')).toEqual({kind:'manage'});
 const p=await s.snapshot(id),foreign=structuredClone(p);foreign.jobs[0].purpose='intake_taskcard';expect(()=>mapProject(foreign)).toThrow();
});
const local=process.env.PITCH_PDF_TEST_PYTHON?it:it.skip;
async function actualUpload(){const path=process.env.PITCH_PDF_TEST_SERVER??fileURLToPath(new URL('../../../../../tools/workbench/brief-server.mjs',import.meta.url)),bytes=await readFile(new URL('./fixtures/intake/emoji.pdf',`file://${path}`)),file=new Blob([new Uint8Array(bytes)],{type:'application/pdf'});return {file,resource:{...upload().resource,size:file.size}};}
local('actual local PDF keeps upload available, exact readable page bytes and strict bridge identity',async()=>{
 const h=await fixture(true),{s,id}=await h.create(),u=await actualUpload();expect(await s.originalUploadPolicy()).toMatchObject({available:true});await s.saveBrandResources(id,[u]);
 const state=await s.originalDocuments.get(id,u.resource.id);expect(state.available).toBe(true);
 const result=await s.originalDocuments.extract(id,{documentId:state.documentId,taskCardId:state.taskCardId,taskCardHash:state.taskCardHash,action:'extract'},{commandId:'extract',expectedRevision:state.revision});
 expect(result.data.result?.status).toBe('text_extracted');expect(result.data.result?.pages[0].text).toBe('😀 Age 25');
 const p=await s.snapshot(id);expect(bridgeStorageJob(p,p.jobs[0])).toBe(true);const forged=structuredClone(p);forged.jobs[0].binding={providerId:'fake',model:'pdf-extraction-v1',role:'document-parser'};expect(()=>mapProject(forged)).toThrow();
 await h.reopen();expect(await h.service().originalDocuments.get(id,u.resource.id)).toMatchObject({result:{status:'text_extracted'}});
});
local('lost extraction response keeps same claim; wrong receipt stays unknown; historical recovery clears without adopting',async()=>{
 const h=await fixture(true),{s,id}=await h.create(),u=await actualUpload();await s.saveBrandResources(id,[u]);const state=await s.originalDocuments.get(id,u.resource.id),input={documentId:state.documentId,taskCardId:state.taskCardId,taskCardHash:state.taskCardHash,action:'extract'} satisfies Parameters<typeof s.originalDocuments.extract>[1];h.lose();
 await expect(s.originalDocuments.extract(id,input,{commandId:'extract-lost',expectedRevision:state.revision})).rejects.toMatchObject({outcomeUnknown:true});const original=h.posts.at(-1)?.body;
 await h.reopen();const fresh=h.service();h.wrongReceipt();await expect(fresh.briefRecovery?.retry()).rejects.toMatchObject({outcomeUnknown:true});expect(fresh.briefRecovery?.getPending()?.body).toBe(original);
 const other=h.service(true);await other.saveBrief(id,{background:'另一版',audience:'未知',objectives:[],deliverables:['包装'],constraints:[],changeNote:'历史测试'},{commandId:'new-card',expectedRevision:(await other.snapshot(id)).revision});
 await expect(fresh.briefRecovery?.retry()).rejects.toMatchObject({kind:'conflict',outcomeUnknown:false});expect(h.posts.at(-1)?.body).toBe(original);expect(fresh.briefRecovery?.getPending()).toBeNull();
 const p=await fresh.snapshot(id);expect(p.jobs[0].attempts).toHaveLength(1);expect(await fresh.originalDocuments.get(id,u.resource.id)).toMatchObject({current:false,result:{status:'text_extracted'}});
});

local('original upload receipt remains recoverable after another window has parsed the retained PDF',async()=>{
 const h=await fixture(true),{s,id}=await h.create(),u=await actualUpload();h.lose();await expect(s.saveBrandResources(id,[u])).rejects.toMatchObject({outcomeUnknown:true});const original=h.posts.at(-1)?.body;
 const other=h.service(true),state=await other.originalDocuments.get(id,u.resource.id);await other.originalDocuments.extract(id,{documentId:state.documentId,taskCardId:state.taskCardId,taskCardHash:state.taskCardHash,action:'extract'},{commandId:'parse-after-upload',expectedRevision:state.revision});
 const fresh=h.service();await fresh.briefRecovery?.retry();expect(h.posts.at(-1)?.body).toBe(original);expect(fresh.briefRecovery?.getPending()).toBeNull();expect((await fresh.snapshot(id)).jobs).toHaveLength(1);
});

it('guest can read original state but cannot invoke extraction or recover an original write',async()=>{
 const h=await fixture(),{s,id}=await h.create(),u=upload();await s.saveBrandResources(id,[u]);
 const team=new LocalTeamStore({storage:new TestStorage(),sessionStorage:new TestStorage(),autoStart:false}),proposals=new HttpProposalService(s),api=protectServices({workbench:s,proposals,intake:new LocalIntakeService(),assistant:new MockAssistantService(s,memoryStore(),0,proposals)},team).workbench;
 team.selectActor('human-guest');const state=await api.originalDocuments?.get(id,u.resource.id);if(!state)throw Error('Missing protected original');const count=h.posts.length;
 await expect(api.originalDocuments?.extract(id,{documentId:state.documentId,taskCardId:state.taskCardId,taskCardHash:state.taskCardHash,action:'extract'},{commandId:'guest',expectedRevision:state.revision})).rejects.toMatchObject({kind:'forbidden'});expect(h.posts).toHaveLength(count);
});

async function seed(h:Awaited<ReturnType<typeof fixture>>,id:string,body:Record<string,unknown>,failed:boolean){
 const serverPath=process.env.PITCH_PDF_TEST_SERVER??fileURLToPath(new URL('../../../../../tools/workbench/brief-server.mjs',import.meta.url)),module=object(createRequire(import.meta.url)(fileURLToPath(new URL('./store.mjs',`file://${serverPath}`))));if(typeof module.openStore!=='function')throw Error('Missing native store');const store=object(module.openStore(h.dbPath));
 const read=store.read,command=store.command,close=store.close;if(typeof read!=='function'||typeof command!=='function'||typeof close!=='function')throw Error('Missing actual store methods');
 const context={actorType:'agent',actorId:'synthetic-parser',runId:'seed-attempt',contextId:'synthetic-context'};
 try{const p=object(read(id)),jobs=Array.isArray(p.jobs)?p.jobs:[],job=object(jobs[0]);command(id,{kind:'intake-start',jobId:job.id,attemptId:'seed-attempt',request:body,commandId:body.commandId,expectedRevision:body.expectedRevision},context);if(failed)command(id,{kind:'intake-fail',jobId:job.id,attemptId:'seed-attempt',error:{code:'SYNTHETIC_FAILURE',message:'Local interrupted'},commandId:'seed-failure',expectedRevision:object(read(id)).revision},context);}finally{close();}
}
local('explicit retry of a genuinely failed local job preserves its prior attempt',async()=>{
 const h=await fixture(true),{s,id}=await h.create(),u=await actualUpload();await s.saveBrandResources(id,[u]);const state=await s.originalDocuments.get(id,u.resource.id),input={documentId:state.documentId,taskCardId:state.taskCardId,taskCardHash:state.taskCardHash,action:'extract'};
 await seed(h,id,{...input,commandId:'first-claim',expectedRevision:state.revision},true);const failed=await s.originalDocuments.get(id,u.resource.id);expect(failed.jobStatus).toBe('failed');await s.originalDocuments.extract(id,{...input,action:'retry_local'},{commandId:'retry-local',expectedRevision:failed.revision});const p=await s.snapshot(id);expect(p.jobs[0].attempts).toHaveLength(2);expect(p.jobs[0].status).toBe('succeeded');
});
local('durable running claim stays unknown through same-body recovery and guest cannot recover it',async()=>{
 const h=await fixture(true),{s,id}=await h.create(),u=await actualUpload();await s.saveBrandResources(id,[u]);const state=await s.originalDocuments.get(id,u.resource.id),input={documentId:state.documentId,taskCardId:state.taskCardId,taskCardHash:state.taskCardHash,action:'extract'} satisfies Parameters<typeof s.originalDocuments.extract>[1];await seed(h,id,{...input,commandId:'running-claim',expectedRevision:state.revision},false);
 await expect(s.originalDocuments.extract(id,input,{commandId:'running-claim',expectedRevision:state.revision})).rejects.toMatchObject({outcomeUnknown:true});
 const team=new LocalTeamStore({storage:new TestStorage(),sessionStorage:new TestStorage(),autoStart:false}),proposals=new HttpProposalService(s),api=protectServices({workbench:s,proposals,intake:new LocalIntakeService(),assistant:new MockAssistantService(s,memoryStore(),0,proposals)},team).workbench;team.selectActor('human-guest');const count=h.posts.length;await expect(api.briefRecovery?.retry()).rejects.toMatchObject({kind:'forbidden'});expect(h.posts).toHaveLength(count);
 await expect(h.service().briefRecovery?.retry()).rejects.toMatchObject({outcomeUnknown:true});expect(s.briefRecovery?.getPending()?.kind).toBe('extract_original');expect((await s.snapshot(id)).jobs[0].attempts).toHaveLength(1);
});
