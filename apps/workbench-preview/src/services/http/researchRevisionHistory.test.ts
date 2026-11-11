import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {afterEach,  expect, it} from 'vitest';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import {Server} from 'node:http';
import {object,records} from './dto';
import {pathToFileURL} from 'node:url';
import {HttpWorkbenchService} from './HttpWorkbenchService';
class SessionStore implements Storage {
 private values = new Map<string, string>(); get length() {return this.values.size;} key(i: number) {return [...this.values.keys()][i] ?? null;}
 getItem(k: string) {return this.values.get(k) ?? null;} setItem(k: string,v: string) {this.values.set(k,v);} removeItem(k: string) {this.values.delete(k);} clear() {this.values.clear();}
}
const cleanup: Array<()=>Promise<void>>=[];afterEach(async()=>{for(const fn of cleanup.splice(0))await fn();});
async function fixture(configure?:(root:string)=>Record<string,unknown>) {
 const module: unknown = createRequire(import.meta.url)(process.env.PITCH_READER_TEST_SERVER??fileURLToPath(new URL('../../../../../tools/workbench/brief-server.mjs',import.meta.url)));
 if (!module || typeof module !== 'object' || !('createBriefServer' in module) || typeof module.createBriefServer !== 'function') throw new Error('Missing actual server');
 const factory=module.createBriefServer;
 const createBriefServer=(options:{dbPath:string;port:number;researchOptions?:Record<string,unknown>}):Server=>{const value:unknown=factory(options);if(!(value instanceof Server))throw new Error('Invalid server');return value;};
 const dir=await mkdtemp(join(tmpdir(),'research-http-candidate-')),server=createBriefServer({dbPath:join(dir,'db.sqlite'),port:4182,researchOptions:configure?.(dir)});
 cleanup.push(async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(dir,{recursive:true,force:true});});
 const bodies:string[]=[];let lose=false,wrongReceipt=false;
 const fetchImpl: typeof fetch=async(input,init)=>{
  const url=new URL(String(input));if(init?.method==='POST')bodies.push(String(init.body));
  const req=Readable.from([Buffer.from(typeof init?.body==='string'?init.body:'')]);Object.assign(req,{url:url.pathname+url.search,method:init?.method??'GET',headers:{host:url.host,...Object.fromEntries(new Headers(init?.headers))}});
  const response=await new Promise<Response>(resolve=>{const headers:Record<string,string>={};const res={status:200,setHeader(k:string,v:string){headers[k]=v;},writeHead(status:number,h:Record<string,string>={}){this.status=status;Object.assign(headers,h);},end(data?:string){resolve(new Response(data??null,{status:this.status,headers}));}};server.emit('request',req,res);});
  if(wrongReceipt&&init?.method==='POST'&&response.ok){wrongReceipt=false;const value=await response.clone().json();value.receipt.jobId='wrong-job';return new Response(JSON.stringify(value),{status:200});}
  if(lose&&init?.method==='POST'&&response.ok){lose=false;return new Response(new ReadableStream({start(c){c.error(new Error('lost'));}}),{status:200});}return response;
 };
 const storage=new SessionStore(),service=(anotherWindow=false)=>{const session=anotherWindow?new SessionStore():storage;return new HttpWorkbenchService({baseUrl:'http://127.0.0.1:4182/api/v1',fetchImpl,recovery:{actorKey:()=> 'owner',storage:()=>session,authorize:()=>{}}});};
 return {service,bodies,lose(){lose=true;},wrongReceipt(){wrongReceipt=true;}};
}
async function createConfirmed(s:HttpWorkbenchService){const created=await s.createProject({name:'跨卡恢复工程测试',client:'本地',summary:'合成验收',mode:'step_by_step',researchOwner:'研究负责人',strategyOwner:'策略负责人',brief:{proposalType:'packaging',background:'合成蓝色包装',audience:'未知',objectives:[],deliverables:['包装'],constraints:[],changeNote:''}},{commandId:'create',expectedRevision:0});await s.confirmBrief(created.data.id,{commandId:'confirm',expectedRevision:0});return created.data.id;}
it('recovers a replaced same-card question plan as known history',async()=>{
 const host=await fixture(),s=host.service(),id=await createConfirmed(s),input={questions:[{id:'q1',question:'原问题是什么？',critical:true}],readerCount:1} satisfies Parameters<typeof s.researchReader.register>[1];host.lose();
 await expect(s.researchReader.register(id,input,{commandId:'old-questions',expectedRevision:1})).rejects.toMatchObject({outcomeUnknown:true});const original=host.bodies.at(-1);
 const other=host.service(true);await other.researchReader.register(id,{questions:[{id:'q2',question:'当前问题是什么？',critical:true}],readerCount:1},{commandId:'new-questions',expectedRevision:(await other.snapshot(id)).revision});
 const fresh=host.service();await expect(fresh.briefRecovery?.retry()).rejects.toMatchObject({kind:'conflict',outcomeUnknown:false});
 expect(host.bodies.at(-1)).toBe(original);expect(fresh.briefRecovery?.getPending()).toBeNull();
 const state=await fresh.researchReader.get(id);expect(state.plan?.questions[0].id).toBe('q2');expect((await fresh.snapshot(id)).readerPlans).toHaveLength(2);
});
it('recovers a superseded same-card revision as known history and retains an unbound receipt as unknown',async()=>{
 let sourceId='',executionRoot='';const nativePath=process.env.PITCH_READER_TEST_SERVER??fileURLToPath(new URL('../../../../../tools/workbench/brief-server.mjs',import.meta.url)),require=createRequire(import.meta.url);
 const fixtureModule=object(require(fileURLToPath(new URL('./research-operator-fixture.mjs',pathToFileURL(nativePath))))),diskModule=object(require(fileURLToPath(new URL('./selected-stage-fixture.mjs',pathToFileURL(nativePath)))));
 if(typeof fixtureModule.providerSet!=='function'||typeof diskModule.diskReceipt!=='function')throw Error('Missing actual native fixtures');const providerSet=fixtureModule.providerSet,diskReceipt=diskModule.diskReceipt;
 const host=await fixture(root=>{executionRoot=join(root,'execution');const providers=object(providerSet([],(value:unknown,rawRequest:unknown)=>{const result=object(value),request=object(rawRequest),output=object(structuredClone(result.parsedOutput)),schema=object(object(request.outputSchema).properties);
  if(schema.revisionResponses){const prompt=String(request.prompt),marker='\nUNTRUSTED_JSON_DATA\n',input=object(JSON.parse(prompt.slice(prompt.lastIndexOf(marker)+marker.length,prompt.lastIndexOf('\nEND_UNTRUSTED_JSON_DATA'))));output.title='修订研究';output.summary='Synthetic package is blue. 不能证明人群偏好。';const sections=Array.isArray(output.sections)?output.sections:[];if(sections[0])object(sections[0]).body=output.summary;output.revisionResponses=records(object(input.correctionInput).sources).flatMap((s:unknown)=>{const source=object(s);return (Array.isArray(source.findings)?source.findings:[]).map((f:unknown)=>({findingKey:object(f).key,action:'applied',explanation:'明确产品事实与人群偏好边界。',outputLocations:[{location:'/summary',quote:'不能证明人群偏好。'}]}));});}
  const responseText=JSON.stringify(output).replaceAll('s1',sourceId);return {...result,responseText,parsedOutput:JSON.parse(responseText)};},executionRoot));
  providers.reader={model:'synthetic',execute:async(raw:unknown)=>{const request=object(raw),packet=object(request.packet),recheck=packet.phase==='recheck',locations=[{location:'/summary',quote:'Synthetic package is blue.'}];const parsedOutput={protocolVersion:'research-reader-loop-v1',packetHash:packet.packetHash,phase:packet.phase,retellings:['market','audience','competition','product','carrier','synthesis'].map(dimension=>({dimension,understanding:'合成颜色材料不证明人群偏好。',classification:'mixed',locations})),answers:[{questionId:'q1',status:recheck?'answered':'unresolved',answer:'产品蓝色不等于人群偏好。',locations}],connections:[{dimensions:['product','audience'],explanation:'需要保留事实与偏好边界。',strategyConstraint:'不能推偏好。',limitations:'仅工程合成。',locations}],issues:recheck?[]:[{id:'clarity',type:'understanding',severity:'major',questionIds:['q1'],detail:'需要明确颜色事实与偏好推论的边界。',locations}],rechecks:recheck?[{issueId:'clarity',status:'resolved',explanation:'已读新稿中的明确限制，不证明真实偏好。',locations:[{location:'/summary',quote:'不能证明人群偏好。'}]}]:[],limitations:['工程合成，非人类批准。']};return diskReceipt(executionRoot,request,{runId:request.runId,model:'synthetic',requestedModel:'synthetic',threadId:`reader-${request.runId}`,exitCode:0,responseText:JSON.stringify(parsedOutput),parsedOutput});}};
  return {rootDir:executionRoot,executionAllowed:true,providers,bindings:{...object(fixtureModule.bindings),reader:{providerId:'reader',model:'synthetic',role:'independent-reader'}}};});
 const s=host.service(),id=await createConfirmed(s);await s.researchReader.register(id,{questions:[{id:'q1',question:'蓝色能否证明偏好？',critical:true}],readerCount:1},{commandId:'plan',expectedRevision:1});const source=await s.addSource(id,{title:'Synthetic',publisher:'Engineering',url:'https://example.test/blue',excerpt:'Synthetic package is blue.',intendedUse:'category',attachToClaimId:null},{commandId:'source',expectedRevision:(await s.snapshot(id)).revision});sourceId=source.data.id;
 await s.generateResearch(id,{commandId:'produce',expectedRevision:source.revision});let state=await s.researchReader.get(id);if(!state.plan||!state.artifactId)throw Error('Missing actual source');const oldArtifactId=state.artifactId;
 await s.researchReader.start(id,{artifactId:oldArtifactId,registrationId:state.plan.id,seat:0},{commandId:'read',expectedRevision:state.revision});state=await s.researchReader.get(id);const old=state.reports[0],report=await s.researchReader.report(id,old.id);expect(report.understandingComplete).toBe(false);expect(report.issues).toHaveLength(1);
 host.lose();
 await expect(s.researchReader.revise(id,oldArtifactId,{commandId:'revise',expectedRevision:state.revision})).rejects.toMatchObject({outcomeUnknown:true});
 const original=host.bodies.at(-1),other=host.service(true);
 await other.generateResearch(id,{commandId:'newer-production',expectedRevision:(await other.snapshot(id)).revision});
 const before=await other.snapshot(id),revisionJob=before.jobs.find(j=>object(j.task).revisionRequest),active=before.stages.find(s=>s.stage==='research')?.activeArtifactId;
 expect(revisionJob?.status).toBe('succeeded');expect(revisionJob?.outputVersionIds).not.toEqual([active]);
 const fresh=host.service();host.wrongReceipt();
 await expect(fresh.briefRecovery?.retry()).rejects.toMatchObject({outcomeUnknown:true});
 expect(fresh.briefRecovery?.getPending()?.body).toBe(original);
 await expect(fresh.briefRecovery?.retry()).rejects.toMatchObject({kind:'conflict',outcomeUnknown:false});
 expect(host.bodies.at(-1)).toBe(original);expect(fresh.briefRecovery?.getPending()).toBeNull();
 const after=await fresh.snapshot(id);expect(after.jobs).toHaveLength(before.jobs.length);expect(after.stages.find(s=>s.stage==='research')?.activeArtifactId).toBe(active);
});
