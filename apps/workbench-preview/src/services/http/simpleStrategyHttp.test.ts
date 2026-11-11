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
// These cases include the full isolated research setup; provider deadlines remain unchanged.
const HTTP_WORKFLOW_TIMEOUT=120_000;
const cleanup:Array<()=>Promise<void>>=[];afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn();});
interface ReleasedFixture{id:string;root:string;dbPath:string;artifactId:string;bindings:Record<string,unknown>;providers:Record<string,unknown>;wirePackets:unknown[];store:{read:(id:string)=>unknown}}
function fixtureShape(v:unknown):v is ReleasedFixture{if(!v||typeof v!=='object')return false;return 'id'in v&&typeof v.id==='string'&&'root'in v&&typeof v.root==='string'&&'dbPath'in v&&typeof v.dbPath==='string'&&'artifactId'in v&&typeof v.artifactId==='string'&&'bindings'in v&&!!v.bindings&&typeof v.bindings==='object'&&'providers'in v&&!!v.providers&&typeof v.providers==='object'&&'wirePackets'in v&&Array.isArray(v.wirePackets)&&'store'in v&&!!v.store&&typeof v.store==='object'&&'read'in v.store&&typeof v.store.read==='function';}
async function host(options:{authorizedThrough?:string;disabled?:boolean;brief?:string;blockedStrategy?:boolean}={}){
 const require=createRequire(import.meta.url),path=process.env.PITCH_SIMPLE_STRATEGY_TEST_SERVER??fileURLToPath(new URL('../../../../../tools/workbench/brief-server.mjs',import.meta.url));
 const fixtures=object(require(join(dirname(path),'simple-strategy-http-fixture.mjs'))),module=object(require(path));if(typeof fixtures.released!=='function'||typeof module.createBriefServer!=='function')throw Error('Missing actual native fixture/server');
 const operator=object(object(require(join(dirname(path),'research-operator-fixture.mjs'))).human),previousNow=operator.now;operator.now=new Date().toISOString();cleanup.push(async()=>{if(previousNow===undefined)delete operator.now;else operator.now=previousNow;});
 const value:unknown=await fixtures.released({after:(fn:()=>Promise<void>)=>cleanup.push(fn)},options);if(!fixtureShape(value))throw Error('Invalid actual released fixture');const f=value;
 const factory=module.createBriefServer,servers:Server[]=[];
 function service(disabled=options.disabled??false){const server:unknown=factory({dbPath:f.dbPath,researchOptions:{rootDir:f.root,...(disabled?{}:{bindings:f.bindings,providers:f.providers,executionAllowed:true})}});if(!(server instanceof Server))throw Error('Invalid actual server');servers.push(server);return server;}
 const server=service();cleanup.push(async()=>{for(const server of servers)await new Promise<void>(resolve=>server.close(()=>resolve()));});
 let mode:'normal'|'lost'|'wrong'|'content'='normal';const bodies:string[]=[],storage=new StorageJournal();
 function client(active:Server=server){const fetchImpl:typeof fetch=async(input,init)=>{const url=new URL(String(input));if(init?.method==='POST')bodies.push(String(init.body));const req=Readable.from([Buffer.from(typeof init?.body==='string'?init.body:'')]);Object.assign(req,{url:url.pathname+url.search,method:init?.method??'GET',headers:{host:url.host,...Object.fromEntries(new Headers(init?.headers))}});
 const response=await new Promise<Response>(resolve=>{let status=200;const headers:Record<string,string>={};active.emit('request',req,{setHeader(k:string,v:string){headers[k]=v;},writeHead(s:number,h:Record<string,string>={}){status=s;Object.assign(headers,h);},end(raw?:string){resolve(new Response(raw??null,{status,headers}));}});});
 if(mode==='content'&&init?.method!=='POST'&&url.pathname.endsWith('/simple-strategy')&&response.ok){mode='normal';const value=object(await response.json());const strategy=object(value.strategy);object(strategy.content??object(strategy.blockedOutput).content).summary='篡改的原稿摘要';return Response.json(value);}
 if(mode!=='normal'&&init?.method==='POST'&&response.ok){const action=mode;mode='normal';if(action==='lost')return new Response(new ReadableStream({start(c){c.error(Error('Synthetic response lost'));}}),{status:200});const value=object(await response.json());object(value.receipt).jobId='wrong-original-job';return Response.json(value);}return response;};
 return new HttpWorkbenchService({baseUrl:'http://127.0.0.1:4182/api/v1',fetchImpl,recovery:{actorKey:()=> 'owner',storage:()=>storage,authorize:()=>{}}});}
 return {f,s:client(),client,disabled:()=>client(service(true)),bodies,lose(){mode='lost';},wrong(){mode='wrong';},corrupt(){mode='content';}};
}
it('default research authorization and disabled execution never create a SIMPLE job',async()=>{
 const h=await host({authorizedThrough:undefined,disabled:true}),before=h.f.wirePackets.length,state=await h.s.simpleStrategy.get(h.f.id);expect(state.available).toBe(false);expect(state.canContinue).toBe(false);
 await expect(h.s.simpleStrategy.continue(h.f.id,{artifactId:h.f.artifactId,policyVersion:state.policyVersion},{commandId:'disabled',expectedRevision:state.revision})).rejects.toBeDefined();
 expect(h.f.wirePackets).toHaveLength(before);expect((await h.s.snapshot(h.f.id)).jobs.some(j=>j.stage==='strategy')).toBe(false);
},HTTP_WORKFLOW_TIMEOUT);
it('projects actual unique SIMPLE three-block SHA content and independent full-text verification without copy',async()=>{
 const brief=writeBrief({proposalType:'kv',background:'只核合成蓝色产品，不推断购买偏好。',audience:'未验证人群',objectives:['探索有界方向'],deliverables:['KV策略工程稿'],constraints:['不代表客户批准'],changeNote:''},{client:'合成工程',summary:'策略UI类型接线',researchOwner:'工程研究负责人',strategyOwner:'工程策略负责人',type:'kv'},new Date().toISOString());
 const h=await host({brief}),state=await h.s.simpleStrategy.get(h.f.id);expect((await new HttpProposalService(h.s).getProposal(h.f.id)).type).toBe('kv');expect(state.canContinue).toBe(true);const body={artifactId:h.f.artifactId,policyVersion:state.policyVersion},meta={commandId:'continue',expectedRevision:state.revision};
 const produced=await h.s.simpleStrategy.continue(h.f.id,body,meta);expect(produced.data.content?.strategy).toMatchObject({researchConclusions:expect.any(Array),intersection:expect.objectContaining({kind:'inference'}),focus:expect.objectContaining({kind:'inference'})});expect(produced.data.current).toBe(true);const proposal=await new HttpProposalService(h.s).getProposal(h.f.id);expect(proposal.currentStage).toBe('strategy');expect(proposal.stages.research.summary).not.toContain('未启动策略生产');const count=h.f.wirePackets.length;
 await h.s.simpleStrategy.continue(h.f.id,body,meta);expect(h.f.wirePackets).toHaveLength(count);const artifactId=produced.data.artifactId;if(!artifactId)throw Error('Missing actual SIMPLE artifact');
 const verified=await h.s.simpleStrategy.verify(h.f.id,{artifactId},{commandId:'strategy-verify',expectedRevision:produced.revision});expect(verified.data.verification).toMatchObject({hasBlockingFindings:false});expect(verified.data.contentHash).toBe(produced.data.contentHash);const accepted=await new HttpProposalService(h.s).getProposal(h.f.id);expect(accepted.stages.strategy.status).toBe('in_progress');expect(accepted.stages.strategy.summary).toContain('待双方负责人接收');expect((await h.s.snapshot(h.f.id)).jobs.some(j=>j.stage==='copy')).toBe(false);h.corrupt();await expect(h.s.simpleStrategy.get(h.f.id)).rejects.toMatchObject({kind:'response_lost',outcomeUnknown:true});
},HTTP_WORKFLOW_TIMEOUT);
it('recovers lost continuation and wrong verification receipt with exact original bodies and no redispatch',async()=>{
 const h=await host(),state=await h.s.simpleStrategy.get(h.f.id);h.lose();await expect(h.s.simpleStrategy.continue(h.f.id,{artifactId:h.f.artifactId,policyVersion:state.policyVersion},{commandId:'lost-continue',expectedRevision:state.revision})).rejects.toMatchObject({outcomeUnknown:true});const original=h.bodies.at(-1),calls=h.f.wirePackets.length;
 await h.client().briefRecovery?.retry();expect(h.bodies.at(-1)).toBe(original);expect(h.f.wirePackets).toHaveLength(calls);const produced=await h.s.simpleStrategy.get(h.f.id);if(!produced.artifactId)throw Error('Missing actual artifact');
 h.wrong();await expect(h.s.simpleStrategy.verify(h.f.id,{artifactId:produced.artifactId},{commandId:'wrong-verify',expectedRevision:produced.revision})).rejects.toMatchObject({outcomeUnknown:true});expect(h.s.briefRecovery?.getPending()?.kind).toBe('verify_simple_strategy');const verifyBody=h.bodies.at(-1),after=h.f.wirePackets.length;await h.client().briefRecovery?.retry();expect(h.bodies.at(-1)).toBe(verifyBody);expect(h.f.wirePackets).toHaveLength(after);expect(h.s.briefRecovery?.getPending()).toBeNull();
},HTTP_WORKFLOW_TIMEOUT);
it('keeps native producer unknown distinct from transport and reconciles exact saved IO with providers disabled',async()=>{
 const h=await host(),provider=object(h.f.providers.strategist);let failed=false;h.f.providers.strategist={...provider,failpoint:(name:string)=>{if(name==='manifest-synced'&&!failed){failed=true;throw Error('Synthetic original saved; return lost');}}};
 const state=await h.s.simpleStrategy.get(h.f.id),input={artifactId:h.f.artifactId,policyVersion:state.policyVersion},meta={commandId:'unknown-producer',expectedRevision:state.revision},result=await h.s.simpleStrategy.continue(h.f.id,input,meta);expect(result.data.producerStatus).toBe('awaiting_reconciliation');expect(h.s.briefRecovery?.getPending()).toBeNull();const count=h.f.wirePackets.length;
 await h.s.simpleStrategy.continue(h.f.id,input,meta);expect(h.f.wirePackets).toHaveLength(count);if(!result.data.producerJobId)throw Error('No original producer');const recovered=await h.disabled().simpleStrategy.reconcile(h.f.id,{jobId:result.data.producerJobId},{commandId:'recover-original',expectedRevision:result.revision});expect(recovered.data.producerStatus).toBe('succeeded');expect(recovered.data.content).not.toBeNull();expect(h.f.wirePackets).toHaveLength(count);},HTTP_WORKFLOW_TIMEOUT);

it('reads blocked original conclusions and gaps while retaining no strategy artifact or verification',async()=>{
 const h=await host({blockedStrategy:true}),before=await h.s.simpleStrategy.get(h.f.id),input={artifactId:h.f.artifactId,policyVersion:before.policyVersion},meta={commandId:'blocked-continue',expectedRevision:before.revision};
 const result=await h.s.simpleStrategy.continue(h.f.id,input,meta);expect(result.data.producerStatus).toBe('blocked');expect(result.data.artifactId).toBeNull();expect(result.data.content).toBeNull();expect(result.data.blockedOutput?.content.strategy.researchConclusions).toHaveLength(1);expect(result.data.blockedOutput?.content.gaps).toEqual(['缺少产品特质资料，请向任务负责人补充。']);expect(result.data.failure?.code).toBe('STAGE_INPUT_GAP');expect(result.data.verification).toBeNull();
 const calls=h.f.wirePackets.length;await h.s.simpleStrategy.continue(h.f.id,input,meta);expect(h.f.wirePackets).toHaveLength(calls);expect((await h.s.snapshot(h.f.id)).jobs.some(j=>j.stage==='copy')).toBe(false);h.corrupt();await expect(h.s.simpleStrategy.get(h.f.id)).rejects.toMatchObject({kind:'response_lost',outcomeUnknown:true});
},HTTP_WORKFLOW_TIMEOUT);
