import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Readable} from 'node:stream';
import {Server} from 'node:http';
import {afterEach,expect,it} from 'vitest';
import {HttpWorkbenchService} from './HttpWorkbenchService';
import {HttpProposalService} from './HttpProposalService';
import {writeBrief} from './briefEnvelope';
import {object} from './dto';
class StorageJournal implements Storage{values=new Map<string,string>();get length(){return this.values.size;}key(i:number){return [...this.values.keys()][i]??null;}getItem(k:string){return this.values.get(k)??null;}setItem(k:string,v:string){this.values.set(k,v);}removeItem(k:string){this.values.delete(k);}clear(){this.values.clear();}}
const cleanup:Array<()=>Promise<void>>=[];afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn();});
interface ReleasedFixture{id:string;root:string;dbPath:string;artifactId:string;creativeCalibrations:unknown[];bindings:Record<string,unknown>;providers:Record<string,unknown>;wirePackets:unknown[];packets:unknown[];store:{read:(id:string)=>unknown}}
function fixtureShape(v:unknown):v is ReleasedFixture{if(!v||typeof v!=='object')return false;return 'id'in v&&typeof v.id==='string'&&'root'in v&&typeof v.root==='string'&&'dbPath'in v&&typeof v.dbPath==='string'&&'artifactId'in v&&typeof v.artifactId==='string'&&'creativeCalibrations'in v&&Array.isArray(v.creativeCalibrations)&&'bindings'in v&&!!v.bindings&&typeof v.bindings==='object'&&'providers'in v&&!!v.providers&&typeof v.providers==='object'&&'packets'in v&&Array.isArray(v.packets)&&'wirePackets'in v&&Array.isArray(v.wirePackets)&&'store'in v&&!!v.store&&typeof v.store==='object'&&'read'in v.store&&typeof v.store.read==='function';}
async function host(options:{authorizedThrough?:string;disabled?:boolean;brief?:string}={}){
 const require=createRequire(import.meta.url),path=process.env.PITCH_SIMPLE_STRATEGY_TEST_SERVER??fileURLToPath(new URL('../../../../../tools/workbench/brief-server.mjs',import.meta.url));
 const fixtures=object(require(fileURLToPath(new URL('../../test-support/simpleCopyFixture.mjs',import.meta.url)))),module=object(require(path));if(typeof fixtures.prepare!=='function'||typeof module.createBriefServer!=='function')throw Error('Missing actual native fixture/server');
 const operator=object(object(require(join(dirname(path),'research-operator-fixture.mjs'))).human),previousNow=operator.now;operator.now=new Date().toISOString();cleanup.push(async()=>{if(previousNow===undefined)delete operator.now;else operator.now=previousNow;});
 const value:unknown=await fixtures.prepare({after:(fn:()=>Promise<void>)=>cleanup.push(fn)},{...options,brief:writeBrief({proposalType:'kv',background:'只核合成蓝色产品，不推断购买偏好。',audience:'未验证人群',objectives:['探索有界方向'],deliverables:['KV工程稿'],constraints:['不代表客户批准'],changeNote:''},{client:'合成工程',summary:'文案HTTP接线',researchOwner:'研究负责人',strategyOwner:'策略负责人',type:'kv'},new Date().toISOString())});if(!fixtureShape(value))throw Error('Invalid actual released fixture');const f=value;
 const factory=module.createBriefServer,servers:Server[]=[];
 function service(disabled=options.disabled??false){const server:unknown=factory({dbPath:f.dbPath,researchOptions:{rootDir:f.root,...(disabled?{}:{bindings:f.bindings,providers:f.providers,executionAllowed:true,creativeCalibrations:f.creativeCalibrations})}});if(!(server instanceof Server))throw Error('Invalid actual server');servers.push(server);return server;}
 const server=service();cleanup.push(async()=>{for(const server of servers)await new Promise<void>(resolve=>server.close(()=>resolve()));});
 let mode:'normal'|'lost'|'wrong'|'content'='normal';const bodies:string[]=[],storage=new StorageJournal();
 function client(active:Server=server){const fetchImpl:typeof fetch=async(input,init)=>{const url=new URL(String(input));if(init?.method==='POST')bodies.push(String(init.body));const req=Readable.from([Buffer.from(typeof init?.body==='string'?init.body:'')]);Object.assign(req,{url:url.pathname+url.search,method:init?.method??'GET',headers:{host:url.host,...Object.fromEntries(new Headers(init?.headers))}});
 const response=await new Promise<Response>(resolve=>{let status=200;const headers:Record<string,string>={};active.emit('request',req,{setHeader(k:string,v:string){headers[k]=v;},writeHead(s:number,h:Record<string,string>={}){status=s;Object.assign(headers,h);},end(raw?:string){resolve(new Response(raw??null,{status,headers}));}});});
 if(mode==='content'&&init?.method!=='POST'&&url.pathname.endsWith('/copy-workflow')&&response.ok){mode='normal';const value=object(await response.json());object(object(value.copyWorkflow).content).summary='篡改的原稿摘要';return Response.json(value);}
 if(mode!=='normal'&&init?.method==='POST'&&response.ok){const action=mode;mode='normal';if(action==='lost')return new Response(new ReadableStream({start(c){c.error(Error('Synthetic response lost'));}}),{status:200});const value=object(await response.json());object(value.receipt).jobIds=['wrong-original-job'];return Response.json(value);}return response;};
 return new HttpWorkbenchService({baseUrl:'http://127.0.0.1:4182/api/v1',fetchImpl,recovery:{actorKey:()=> 'owner',storage:()=>storage,authorize:()=>{}}});}
 return {f,s:client(),client,disabled:()=>client(service(true)),bodies,lose(){mode='lost';},wrong(){mode='wrong';},corrupt(){mode='content';}};
}

it('actual HTTP and SQLite preserve the owner edge, unique three-direction copy and 17 original review nodes',async()=>{
 const h=await host(),s=h.s.copyWorkflow,id=h.f.id,state=await s.get(id);expect(state.current).toBe(true);
 const initial=await s.continue(id,{artifactId:h.f.artifactId},{commandId:'owners',expectedRevision:state.revision});expect(initial.data.edgeId).toBeTruthy();
 let current=initial.data;
 for(let n=0;n<3&&current.queuedJobIds.length;n++){if(!current.edgeId)throw Error('Missing original edge');current=(await s.step(id,{edgeId:current.edgeId,jobIds:current.queuedJobIds.slice(0,4)},{commandId:`step-${n}`,expectedRevision:current.revision})).data;}
 const proposal=await new HttpProposalService(h.s).getProposal(id);expect(proposal.type).toBe('kv');expect(proposal.currentStage).toBe('themes');expect(proposal.stages.strategy.status).toBe('done');expect(current.directions).toHaveLength(3);expect(current.ownerReports).toHaveLength(2);const artifactId=current.artifactId;if(!artifactId)throw Error('Missing copy');
 for(const op of ['verify','review'] satisfies Array<'verify'|'review'>){current=(await s[op](id,{artifactId},{commandId:`copy-${op}`,expectedRevision:current.revision})).data;for(let n=0;n<8&&current.queuedJobIds.length;n++){if(!current.edgeId)throw Error('No edge');current=(await s.step(id,{edgeId:current.edgeId,jobIds:current.queuedJobIds.slice(0,4)},{commandId:`copy-${op}-${n}`,expectedRevision:current.revision})).data;}}
 expect(current.creativeReports).toHaveLength(17);expect(current.verification).toContain('hasBlockingFindings');expect(current.creativeDecision).toContain('pass');const reviewed=await new HttpProposalService(h.s).getProposal(id);expect(reviewed.stages.themes.status).toBe('in_progress');expect(reviewed.stages.themes.summary).toContain('待交接到视觉开发');h.corrupt();await expect(s.get(id)).rejects.toMatchObject({kind:'response_lost',outcomeUnknown:true});
},600_000);
it('lost and corrupt receipts keep the exact original body and re-read without dispatch',async()=>{
 const h=await host(),s=h.s.copyWorkflow,id=h.f.id,current=await s.get(id);h.lose();await expect(s.continue(id,{artifactId:h.f.artifactId},{commandId:'lost',expectedRevision:current.revision})).rejects.toMatchObject({outcomeUnknown:true});const body=h.bodies.at(-1);
 await h.client().briefRecovery?.retry();expect(h.bodies.at(-1)).toBe(body);expect(h.s.briefRecovery?.getPending()).toBeNull();const next=await s.get(id);if(!next.edgeId)throw Error('No edge');h.wrong();await expect(s.step(id,{edgeId:next.edgeId,jobIds:next.queuedJobIds.slice(0,4)},{commandId:'wrong',expectedRevision:next.revision})).rejects.toMatchObject({outcomeUnknown:true});const frozen=h.bodies.at(-1),count=h.f.packets.length;await h.client().briefRecovery?.retry();expect(h.bodies.at(-1)).toBe(frozen);expect(h.f.packets).toHaveLength(count);
},240000);
