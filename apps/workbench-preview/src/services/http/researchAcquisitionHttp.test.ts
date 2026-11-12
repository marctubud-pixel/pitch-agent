import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {Server} from 'node:http';
import {Readable} from 'node:stream';
import {join,dirname} from 'node:path';
import {readFile} from 'node:fs/promises';
import {afterEach,expect,it} from 'vitest';
import {HttpWorkbenchService} from './HttpWorkbenchService';
import {pendingWriteKind} from './briefRecovery';
import {pendingWriteAction} from '../../collaboration/types';
import {object,parseSnapshot} from './dto';
import {acquisitionState} from './researchAcquisitionProjection';
class Store implements Storage{values=new Map<string,string>();get length(){return this.values.size;}key(i:number){return [...this.values.keys()][i]??null;}getItem(k:string){return this.values.get(k)??null;}setItem(k:string,v:string){this.values.set(k,v);}removeItem(k:string){this.values.delete(k);}clear(){this.values.clear();}}
const cleanup:Array<()=>Promise<void>>=[];afterEach(async()=>{for(const close of cleanup.splice(0))await close();});
interface NativeFixture{root:string;options:Record<string,unknown>;calls:unknown[];tools:unknown[];close:()=>Promise<void>}
function fixtureShape(f:unknown):f is NativeFixture{if(!f||typeof f!=='object')return false;return 'root'in f&&typeof f.root==='string'&&'options'in f&&typeof f.options==='object'&&f.options!==null&&'calls'in f&&Array.isArray(f.calls)&&'tools'in f&&Array.isArray(f.tools)&&'close'in f&&typeof f.close==='function';}
async function host(enabled=true,pdf=false){
 const require=createRequire(import.meta.url),serverPath=process.env.PITCH_ACQUISITION_TEST_SERVER??fileURLToPath(new URL('../../../../../tools/workbench/brief-server.mjs',import.meta.url)),native=object(require(join(dirname(serverPath),'research-acquisition-fixture.mjs'))),serverModule=object(require(serverPath));
 if(typeof native.acquisitionFixture!=='function'||typeof serverModule.createBriefServer!=='function')throw Error('Missing native fixture/server');
 const f:unknown=await native.acquisitionFixture();if(!fixtureShape(f))throw Error('Invalid native fixture');
 if(pdf){const helpers=object(require(join(dirname(serverPath),'selected-stage-fixture.mjs'))),receipt=helpers.diskReceipt;if(typeof receipt!=='function')throw Error('Missing actual disk receipt');const providers=object(f.options.providers);for(const [key,value]of Object.entries(providers)){const provider=object(value),execute=provider.execute;if(typeof execute!=='function')throw Error('Missing fixture provider');providers[key]={...provider,execute:async(request:unknown)=>receipt(join(f.root,'db.originals'),request,await execute(request))};}}
 const server:unknown=serverModule.createBriefServer({dbPath:join(f.root,'db'),researchOptions:enabled?{...f.options,rootDir:pdf?join(f.root,'db.originals'):f.root,executionAllowed:true}:undefined,intakeConfiguration:pdf?{pythonBinary:process.env.PITCH_PDF_TEST_PYTHON}:undefined});if(!(server instanceof Server))throw Error('Invalid actual server');
 cleanup.push(async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));await f.close();});
 let mode:'normal'|'lost'|'wrong'='normal';const bodies:string[]=[],storage=new Store();
 const fetchImpl:typeof fetch=async(input,init)=>{const url=new URL(String(input));if(init?.method==='POST')bodies.push(String(init.body));const req=Readable.from([Buffer.from(typeof init?.body==='string'?init.body:'')]);Object.assign(req,{url:url.pathname+url.search,method:init?.method??'GET',headers:{host:url.host,...Object.fromEntries(new Headers(init?.headers))}});
 const response=await new Promise<Response>(resolve=>{let status=200;const headers:Record<string,string>={};server.emit('request',req,{setHeader(k:string,v:string){headers[k]=v;},writeHead(s:number,h:Record<string,string>={}){status=s;Object.assign(headers,h);},end(raw?:string){resolve(new Response(raw??null,{status,headers}));}});});
 if(mode!=='normal'&&init?.method==='POST'&&response.ok){const current=mode;mode='normal';if(current==='lost')return new Response(new ReadableStream({start(c){c.error(Error('Synthetic dropped response'));}}),{status:200});const value=object(await response.json());object(value.receipt).jobIds=['forged'];return Response.json(value);}return response;};
 const service=()=>new HttpWorkbenchService({baseUrl:'http://127.0.0.1:4182/api/v1',fetchImpl,recovery:{actorKey:()=> 'operator',storage:()=>storage,authorize:()=>{}}});
 const s=service(),created=await s.createProject({name:'合成采集验收',client:'本地',summary:'无外网行业研究',mode:'step_by_step',researchOwner:'研究负责人',strategyOwner:'策略负责人',brief:{proposalType:'packaging',background:'合成蓝色包装',audience:'仅接口验收',objectives:[],deliverables:['包装'],constraints:[],changeNote:''}},{commandId:'new',expectedRevision:0}),id=created.data.id;
 await s.confirmBrief(id,{commandId:'confirm',expectedRevision:0});await s.researchReader.register(id,{questions:[{id:'q1',question:'原资料能支持什么？',critical:true}],readerCount:1},{commandId:'questions',expectedRevision:1});
 return {s,id,service,bodies,f,fetchImpl,lose(){mode='lost';},wrong(){mode='wrong';}};
}
const target=(state:Awaited<ReturnType<HttpWorkbenchService['researchAcquisition']['get']>>)=>({taskCardId:state.taskCardId,taskCardHash:state.taskCardHash});
it('executes the native fixed sets through planner, four branches, seal and exactly one r7 producer',async()=>{
 const h=await host(),{s,id}=h;let state=await s.researchAcquisition.get(id);expect(state.registered).toBe(true);expect(state.generationId).toBeNull();
 state=(await s.researchAcquisition.start(id,{...target(state),sourceEntryIds:[],materialIds:[]},{commandId:'start',expectedRevision:state.revision})).data;
 for(let n=0;n<3;n++){if(!state.generationId)throw Error('No native generation');const input={...target(state),generationId:state.generationId,jobIds:state.queuedJobIds},meta={commandId:`step-${n}`,expectedRevision:state.revision};state=(await s.researchAcquisition.step(id,input,meta)).data;const calls=h.f.calls.length,tools=h.f.tools.length;await s.researchAcquisition.step(id,input,meta);expect(h.f.calls.length).toBe(calls);expect(h.f.tools.length).toBe(tools);}
 expect(state.producerStatus).toBe('succeeded');expect(state.branches).toHaveLength(4);expect(h.f.calls).toHaveLength(2);const ws=await s.getResearchWorkspace(id);expect(ws.artifact).not.toBeNull();expect(ws.artifact?.release).toBeNull();expect(s.briefRecovery?.getPending()).toBeNull();
});
it('retains original start and step bodies after loss/wrong receipt and never substitutes later eligible jobs',async()=>{
 const h=await host();let state=await h.s.researchAcquisition.get(h.id);h.lose();await expect(h.s.researchAcquisition.start(h.id,{...target(state),sourceEntryIds:[],materialIds:[]},{commandId:'start',expectedRevision:state.revision})).rejects.toMatchObject({outcomeUnknown:true});const start=h.bodies.at(-1);await h.service().briefRecovery?.retry();expect(h.bodies.at(-1)).toBe(start);
 state=await h.s.researchAcquisition.get(h.id);if(!state.generationId)throw Error('Missing generation');h.wrong();await expect(h.s.researchAcquisition.step(h.id,{...target(state),generationId:state.generationId,jobIds:state.queuedJobIds},{commandId:'plan',expectedRevision:state.revision})).rejects.toMatchObject({outcomeUnknown:true});expect(h.s.briefRecovery?.getPending()?.kind).toBe('step_acquisition');const body=h.bodies.at(-1);await h.service().briefRecovery?.retry();expect(h.bodies.at(-1)).toBe(body);expect(h.f.calls).toHaveLength(1);expect(h.f.tools).toHaveLength(0);expect((await h.s.researchAcquisition.get(h.id)).branches).toHaveLength(4);
});
it('default stays unavailable without jobs or attempts; acquisition recovery permissions are workflow',async()=>{const h=await host(false),state=await h.s.researchAcquisition.get(h.id);expect(state.available).toBe(false);expect(state.reason).not.toBe('');await expect(h.s.researchAcquisition.start(h.id,{...target(state),sourceEntryIds:[],materialIds:[]},{commandId:'disabled',expectedRevision:state.revision})).rejects.toBeDefined();expect((await h.s.snapshot(h.id)).jobs).toHaveLength(0);expect(h.f.calls).toHaveLength(0);for(const operation of ['start','step','reconcile'])expect(pendingWriteAction(pendingWriteKind(`/projects/p/research-acquisition/${operation}`,{}))).toEqual({kind:'workflow'});});
it('clears a known original plan receipt as history after card replacement without dispatching new jobs',async()=>{
 const h=await host();let state=await h.s.researchAcquisition.get(h.id);state=(await h.s.researchAcquisition.start(h.id,{...target(state),sourceEntryIds:[],materialIds:[]},{commandId:'start',expectedRevision:state.revision})).data;if(!state.generationId)throw Error('No generation');
 h.lose();await expect(h.s.researchAcquisition.step(h.id,{...target(state),generationId:state.generationId,jobIds:state.queuedJobIds},{commandId:'plan',expectedRevision:state.revision})).rejects.toMatchObject({outcomeUnknown:true});
 // Change via the actual native store to model another operator while this browser retains its pending request.
 const store=object(h.f.options.store);if(typeof store.read!=='function'||typeof store.command!=='function')throw Error('Missing actual store');const project=object(store.read(h.id));store.command(h.id,{kind:'revise-task-card',taskCardId:'replacement',brief:'Changed confirmed scope',commandId:'other-operator',expectedRevision:project.revision},{actorType:'human',actorId:'other',runId:'local',contextId:'local'});
 await expect(h.service().briefRecovery?.retry()).rejects.toMatchObject({kind:'conflict',outcomeUnknown:false});expect(h.s.briefRecovery?.getPending()).toBeNull();expect(h.f.calls).toHaveLength(1);expect(h.f.tools).toHaveLength(0);expect((await h.s.researchAcquisition.get(h.id)).current).toBe(false);
});
it('clears known step transport while preserving native unknown for explicit original reconciliation',async()=>{
 const h=await host();let state=await h.s.researchAcquisition.get(h.id);state=(await h.s.researchAcquisition.start(h.id,{...target(state),sourceEntryIds:[],materialIds:[]},{commandId:'start',expectedRevision:state.revision})).data;if(!state.generationId)throw Error('No generation');const generationId=state.generationId;
 const providers=object(h.f.options.providers);let dispatches=0;providers.planner={model:'synthetic',execute:async()=>{dispatches++;throw Error('Synthetic unknown planner transport');}};
 const result=await h.s.researchAcquisition.step(h.id,{...target(state),generationId,jobIds:state.queuedJobIds},{commandId:'plan',expectedRevision:state.revision});state=result.data;expect(state.state).toBe('awaiting_reconciliation');expect(h.s.briefRecovery?.getPending()).toBeNull();expect(dispatches).toBe(1);expect(h.f.tools).toHaveLength(0);
 if(!state.generationTarget)throw Error('Missing frozen target');await expect(h.s.researchAcquisition.reconcile(h.id,{...state.generationTarget,generationId,jobId:state.reconciliation[0].jobId},{commandId:'reconcile',expectedRevision:state.revision})).rejects.toBeDefined();expect(dispatches).toBe(1);expect(h.s.briefRecovery?.getPending()?.kind).toBe('reconcile_acquisition');
});
it.skipIf(!process.env.PITCH_PDF_TEST_PYTHON)('only selects current physically verified parsed PDF materials and binds them into actual r7 producer',async()=>{
 const h=await host(true,true),path=process.env.PITCH_ACQUISITION_TEST_SERVER??fileURLToPath(new URL('../../../../../tools/workbench/brief-server.mjs',import.meta.url)),bytes=await readFile(join(dirname(path),'fixtures/intake/mixed.pdf'));
 const file=new File([new Uint8Array(bytes)],'mixed.pdf',{type:'application/pdf'}),resource={id:'pdf-resource',fileName:'mixed.pdf',size:file.size,mediaType:file.type,lastModified:file.lastModified,note:''};
 await h.s.saveBrandResources(h.id,[{resource,file}]);
 let state=await h.s.researchAcquisition.get(h.id);expect(state.materials).toHaveLength(1);expect(state.materials[0].eligible).toBe(false);const materialId=state.materials[0].id;
 await h.s.originalDocuments.extract(h.id,{documentId:materialId,...target(state),action:'extract'},{commandId:'pdf-extract',expectedRevision:state.revision});
 state=await h.s.researchAcquisition.get(h.id);expect(state.materials[0].eligible).toBe(true);expect(state.materials[0].reason).toContain('部分页面');
 state=(await h.s.researchAcquisition.start(h.id,{...target(state),sourceEntryIds:[],materialIds:[materialId]},{commandId:'start-pdf',expectedRevision:state.revision})).data;
 for(let n=0;n<3;n++){if(!state.generationId)throw Error('Missing native generation');state=(await h.s.researchAcquisition.step(h.id,{...target(state),generationId:state.generationId,jobIds:state.queuedJobIds},{commandId:`pdf-step-${n}`,expectedRevision:state.revision})).data;}
 expect(state.producerStatus).toBe('succeeded');const snapshot=await h.s.snapshot(h.id),producer=snapshot.jobs.find(j=>object(object(j.task).researchDataBasis??{}).acquisition);expect(object(producer?.task).sourceRecords).toEqual(expect.arrayContaining([expect.objectContaining({provenance:expect.objectContaining({kind:'registered_intake_material',documentId:materialId})})]));
},30_000);

it('projects the original generation as history after same-card question replacement',async()=>{
 const h=await host();let state=await h.s.researchAcquisition.get(h.id);
 state=(await h.s.researchAcquisition.start(h.id,{...target(state),sourceEntryIds:[],materialIds:[]},{commandId:'start-q1',expectedRevision:state.revision})).data;
 await h.s.researchReader.register(h.id,{questions:[{id:'q2',question:'新的预登记问题',critical:true}],readerCount:1},{commandId:'questions-q2',expectedRevision:state.revision});
 const historical=await h.s.researchAcquisition.get(h.id);expect(historical).toMatchObject({current:false,generationId:state.generationId,taskCardId:state.taskCardId,generationTarget:state.generationTarget});expect(h.f.calls).toHaveLength(0);expect(h.f.tools).toHaveLength(0);
 const raw=object(await(await h.fetchImpl(`http://127.0.0.1:4182/api/v1/projects/${h.id}/research-acquisition`)).json());object(raw.acquisition).current=true;
 await expect(acquisitionState(raw,parseSnapshot(raw))).rejects.toMatchObject({kind:'response_lost',outcomeUnknown:true});
});
it('clears a known lost original step as history after another operator preregisters Q2 on the same card',async()=>{
 const h=await host();let state=await h.s.researchAcquisition.get(h.id);
 state=(await h.s.researchAcquisition.start(h.id,{...target(state),sourceEntryIds:[],materialIds:[]},{commandId:'start-q-history',expectedRevision:state.revision})).data;if(!state.generationId)throw Error('No generation');
 h.lose();await expect(h.s.researchAcquisition.step(h.id,{...target(state),generationId:state.generationId,jobIds:state.queuedJobIds},{commandId:'plan-q-history',expectedRevision:state.revision})).rejects.toMatchObject({outcomeUnknown:true});const originalBody=h.bodies.at(-1);
 const store=object(h.f.options.store);if(typeof store.read!=='function'||typeof store.command!=='function')throw Error('No store');const p=object(store.read(h.id)),plans=p.researchQuestionRegistrations;if(!Array.isArray(plans))throw Error('No original registration');
 store.command(h.id,{kind:'register-research-questions',taskCardId:p.activeTaskCardId,method:object(plans[0]).method,registrationId:'other-Q2',questions:[{id:'q2',question:'其他操作者的新问题',critical:true}],readerCount:1,commandId:'other-question',expectedRevision:p.revision},{actorType:'human',actorId:'other',runId:'local',contextId:'local'});
 await expect(h.service().briefRecovery?.retry()).rejects.toMatchObject({kind:'conflict',outcomeUnknown:false});expect(h.bodies.at(-1)).toBe(originalBody);expect(h.s.briefRecovery?.getPending()).toBeNull();expect((await h.s.researchAcquisition.get(h.id)).current).toBe(false);expect(h.f.calls).toHaveLength(1);expect(h.f.tools).toHaveLength(0);
});
it('keeps current=true conditional on frozen selected source bytes and policy',async()=>{
 const h=await host(),before=await h.s.snapshot(h.id);
 const source=await h.s.addSource(h.id,{title:'已登记来源',publisher:'本地合成',url:'',excerpt:'原始选入文本',intendedUse:'category',attachToClaimId:null},{commandId:'selected-source',expectedRevision:before.revision});
 let state=await h.s.researchAcquisition.get(h.id);state=(await h.s.researchAcquisition.start(h.id,{...target(state),sourceEntryIds:[source.data.id],materialIds:[]},{commandId:'start-source',expectedRevision:state.revision})).data;
 const raw=object(await(await h.fetchImpl(`http://127.0.0.1:4182/api/v1/projects/${h.id}/research-acquisition`)).json());expect((await acquisitionState(raw,parseSnapshot(raw))).current).toBe(true);
 const changedSource=structuredClone(raw),project=object(changedSource.project);if(!Array.isArray(project.sourceEntries))throw Error('No source');object(project.sourceEntries[0]).excerpt='变化文本';
 await expect(acquisitionState(changedSource,parseSnapshot(changedSource))).rejects.toMatchObject({kind:'response_lost'});
 const changedPolicy=structuredClone(raw),policies=object(changedPolicy.project).policies;if(!Array.isArray(policies))throw Error('No policy');object(policies.at(-1)).authorizedThrough='strategy';
 await expect(acquisitionState(changedPolicy,parseSnapshot(changedPolicy))).rejects.toMatchObject({kind:'response_lost'});
});
