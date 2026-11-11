import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {afterEach, describe, expect, it} from 'vitest';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import {Server} from 'node:http';
import {HttpWorkbenchService} from './HttpWorkbenchService';
import {BriefWriteJournal, pendingWriteKind} from './briefRecovery';
import {pendingWriteAction} from '../../collaboration/types';
class SessionStore implements Storage {
 private values = new Map<string, string>(); get length() {return this.values.size;} key(i: number) {return [...this.values.keys()][i] ?? null;}
 getItem(k: string) {return this.values.get(k) ?? null;} setItem(k: string,v: string) {this.values.set(k,v);} removeItem(k: string) {this.values.delete(k);} clear() {this.values.clear();}
}
const cleanup: Array<()=>Promise<void>>=[];afterEach(async()=>{for(const fn of cleanup.splice(0))await fn();});
async function fixture() {
 const module: unknown = createRequire(import.meta.url)(fileURLToPath(new URL('../../../../../tools/workbench/brief-server.mjs',import.meta.url)));
 if (!module || typeof module !== 'object' || !('createBriefServer' in module) || typeof module.createBriefServer !== 'function') throw new Error('Missing actual server');
 const factory=module.createBriefServer;
 const createBriefServer=(options:{dbPath:string;port:number}):Server=>{const value:unknown=factory(options);if(!(value instanceof Server))throw new Error('Invalid server');return value;};
 const dir=await mkdtemp(join(tmpdir(),'research-http-candidate-')),server=createBriefServer({dbPath:join(dir,'db.sqlite'),port:4182});
 cleanup.push(async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(dir,{recursive:true,force:true});});
 const bodies:string[]=[];let lose=false;
 const fetchImpl: typeof fetch=async(input,init)=>{
  const url=new URL(String(input));if(init?.method==='POST')bodies.push(String(init.body));
  const req=Readable.from([Buffer.from(typeof init?.body==='string'?init.body:'')]);Object.assign(req,{url:url.pathname+url.search,method:init?.method??'GET',headers:{host:url.host,...Object.fromEntries(new Headers(init?.headers))}});
  const response=await new Promise<Response>(resolve=>{const headers:Record<string,string>={};const res={status:200,setHeader(k:string,v:string){headers[k]=v;},writeHead(status:number,h:Record<string,string>={}){this.status=status;Object.assign(headers,h);},end(data?:string){resolve(new Response(data??null,{status:this.status,headers}));}};server.emit('request',req,res);});
  if(lose&&init?.method==='POST'&&response.ok){lose=false;return new Response(new ReadableStream({start(c){c.error(new Error('lost'));}}),{status:200});}return response;
 };
 const storage=new SessionStore(),service=()=>new HttpWorkbenchService({baseUrl:'http://127.0.0.1:4182/api/v1',fetchImpl,recovery:{actorKey:()=> 'owner',storage:()=>storage,authorize:()=>{}}});
 return {service,bodies,lose(){lose=true;}};
}
describe('candidate actual SQLite source and recovery integration',()=>{
 it('registers sources, reads empty research, and restores exact source write after lost response',async()=>{
  const host=await fixture(),s=host.service();const created=await s.createProject({name:'研究接线',client:'客户',summary:'合成验收',mode:'step_by_step',researchOwner:'研究负责人',strategyOwner:'策略负责人',brief:{proposalType:'packaging',background:'仅验接口',audience:'目标人群',objectives:[],deliverables:['包装提案'],constraints:[],changeNote:''}},{commandId:'new',expectedRevision:0});
  const id=created.data.id,ws=await s.getResearchWorkspace(id);expect(ws.artifact).toBeNull();
  const input={title:'来源原文',publisher:'提交者',url:'https://example.com/report',excerpt:'这只是提交摘录，尚未核验。',intendedUse:'category',attachToClaimId:null} satisfies import('../../domain/models').SourceInput;
  host.lose();await expect(s.addSource(id,input,{commandId:'source-one',expectedRevision:0})).rejects.toMatchObject({outcomeUnknown:true});
  const fresh=host.service();expect(fresh.briefRecovery?.getPending()).toMatchObject({kind:'add_source'});await fresh.briefRecovery?.retry();
  expect(host.bodies.at(-1)).toBe(host.bodies.at(-2));expect((await fresh.listSources(id,{})).items).toHaveLength(1);expect((await fresh.listSources(id,{})).items[0].verificationStatus).toBe('unverified');
  await expect(fresh.generateResearch(id,{commandId:'not-enabled',expectedRevision:1})).rejects.toMatchObject({kind:'unavailable'});
 });
 it('derives stable permissions from path/body and reads old journals without kind',()=>{
  const store=new SessionStore();store.setItem('journal',JSON.stringify({path:'/projects/p/commands',body:JSON.stringify({kind:'revise-task-card',commandId:'old'}),commandId:'old',label:'malicious label'}));
  const journal=new BriefWriteJournal(()=> 'journal',()=>store);expect(journal.getPending()).toMatchObject({kind:'save_brief',label:'保存简报'});
  expect(pendingWriteAction(pendingWriteKind('/projects/p/sources',{}))).toEqual({kind:'edit_research'});
  expect(pendingWriteAction(pendingWriteKind('/projects/p/research-handoffs',{}))).toEqual({kind:'workflow'});
  expect(()=>pendingWriteKind('/projects/p/old-paid-run',{})).toThrow();
 });
});
