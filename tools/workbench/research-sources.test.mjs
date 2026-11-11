import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from './server.mjs';
import {diskReceipt} from './selected-stage-fixture.mjs';
import {randomUUID,createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {validateSourceInput,registerSource,registeredSources} from './research-sources.mjs';
const input={title:'用户提供的资料',publisher:'用户指定出版者',url:'',excerpt:'<script>literal text</script>\n原文不变。',intendedUse:'audience',attachToClaimId:null};
test('pure source boundary is exact, bounded, neutral and immutable',()=>{
 assert.deepEqual(validateSourceInput(input),input);
 for(const patch of [{verification:'verified'},{actorId:'forged'},{score:5},{attachToClaimId:'claim'},{url:'file:///tmp/source'},{url:'https://user:secret@example.test'},{excerpt:'x'.repeat(20001)}])assert.throws(()=>validateSourceInput({...input,...patch}));
 const p={id:'test',activeTaskCardId:'card',sourceEntries:[]};
 const source=registerSource(p,{commandId:'one',source:input},{now:'synthetic-time',actorId:'synthetic-user'});p.sourceEntries.push(source);
 assert.equal(source.verificationStatus,'unverified');
 const records=registeredSources(p,[source.id],'http://127.0.0.1:1234');
 assert.equal(records[0].text,input.excerpt);assert.equal(records[0].provenance.originalUrl,'');assert.equal(records[0].scopeRelation,'background');
 assert.throws(()=>registeredSources(p,[source.id,source.id],'http://127.0.0.1:1234'));
 assert.throws(()=>registeredSources({...p,activeTaskCardId:'new'},[source.id],'http://127.0.0.1:1234'));
 assert.throws(()=>registeredSources({...p,sourceEntries:[{...source,excerpt:'changed'}]},[source.id],'http://127.0.0.1:1234'));
 const large={...p,sourceEntries:Array.from({length:8},(_,i)=>registerSource(p,{commandId:String(i),source:{...input,excerpt:'字'.repeat(19000)}},{now:'t',actorId:'u'}))};
 assert.throws(()=>registeredSources(large,large.sourceEntries.map(s=>s.id),'http://127.0.0.1:1234'),/128 KiB/);
});
async function fixture(t,options={}){
 const dir=await mkdtemp(join(tmpdir(),'source-wire-'));let server;let base;
 async function open(){server=createServer({port:0,dbPath:join(dir,'state.sqlite'),imageProvider:null,...options});await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;}
 async function close(){await server.drain();await new Promise((r,j)=>server.close(e=>e?j(e):r()));}
 await open();t.after(async()=>{await close();await rm(dir,{recursive:true,force:true});});
 return {get dir(){return dir;},async executionFiles(){try{return await readdir(join(dir,'executions'),{recursive:true});}catch(error){if(error.code==='ENOENT')return [];throw error;}},get base(){return base;},async reopen(){await close();await open();},async request(path,body){const res=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Origin:base},...(body===undefined?{}:{body:JSON.stringify(body)})});const text=await res.text();return {status:res.status,headers:res.headers,body:res.headers.get('content-type')?.includes('application/json')?JSON.parse(text):text};}};
}
test('actual HTTP persistence, neutral content, idempotency, scope and frozen research survive another port',async t=>{
 let calls=0;const app=await fixture(t,{bindings:{research:{providerId:'synthetic',model:'synthetic',role:'research-lead'}},providers:{synthetic:{model:'synthetic',async execute(){calls++;throw new Error('No provider execution is needed in persistence test');}}}});const created=await app.request('/api/projects',{name:'Synthetic only',brief:'Synthetic packaging',mode:'assisted',humanGates:[],commandId:'create'});assert.equal(created.status,201);
 const p=created.body.project,route=`/api/projects/${p.id}`;
 const save={...input,commandId:'source-one',expectedRevision:0};const saved=await app.request(route+'/sources',save);assert.equal(saved.status,200);
 const entry=saved.body.project.sourceEntries[0];assert.equal(entry.url,'');assert.equal(entry.verificationStatus,'unverified');assert.equal(saved.body.project.jobs.length,0);
 assert.deepEqual((await app.request(route+'/sources',save)).body.project.sourceEntries,[entry]);
 assert.equal((await app.request(route+'/sources',{...save,title:'changed'})).status,409);
 assert.equal((await app.request(route+'/sources',{...save,commandId:'stale'})).status,409);
 for(const patch of [{verified:true},{actor:'forged'},{score:5},{attachToClaimId:'claim'}])assert.ok([400,422].includes((await app.request(route+'/sources',{...save,commandId:'invalid-'+JSON.stringify(patch),expectedRevision:1,...patch})).status));
 assert.equal((await app.request(route)).body.project.revision,1);
 const run={stage:'research',sourceEntryIds:[entry.id],commandId:'run',expectedRevision:1};
 const beforeRejected=(await app.request(route)).body.project,filesBefore=await app.executionFiles();
 const rejected=await app.request(route+'/jobs',run);assert.equal(rejected.status,422);assert.equal(rejected.body.error.code,'SCOPE_UNCONFIRMED');
 assert.deepEqual((await app.request(route)).body.project,beforeRejected);assert.equal(calls,0);assert.deepEqual(await app.executionFiles(),filesBefore);
 const confirmed=await app.request(route+'/commands',{kind:'confirm-task-card',taskCardId:p.activeTaskCardId,commandId:'confirm',expectedRevision:1});assert.equal(confirmed.status,200);
 run.expectedRevision=2;const queued=await app.request(route+'/jobs',run);assert.equal(queued.status,202);
 const frozen=queued.body.project.jobs[0].task.request.sourceRecords;assert.equal(frozen[0].provenance.sourceEntryHash,entry.recordHash);
 const internal=new URL(frozen[0].url);assert.equal(internal.origin,app.base);
 const content=await app.request(internal.pathname);assert.equal(content.body,input.excerpt);assert.match(content.headers.get('content-type'),/^text\/plain/);assert.equal(content.headers.get('x-content-type-options'),'nosniff');
 assert.equal((await app.request(route+'/sources/missing/content')).status,404);
 const before=(await app.request(route)).body.project;const extra=await app.request(route+'/sources',{...input,title:'second',commandId:'second',expectedRevision:before.revision});assert.equal(extra.status,200);
 assert.deepEqual(extra.body.project.jobs[0].task.request.sourceRecords,frozen);
 assert.equal((await app.request(route+'/jobs',run)).body.jobId,queued.body.jobId);
 assert.equal((await app.request(route+'/jobs',{...run,sourceEntryIds:[]})).status,409);
 assert.equal((await app.request(route+'/jobs',{...run,sourceRecords:[]})).status,400);
 const port=app.base;await app.reopen();assert.notEqual(app.base,port);
 const replay=await app.request(route+'/jobs',run);assert.equal(replay.status,202);assert.deepEqual(replay.body.project.jobs[0].task.request.sourceRecords,frozen);
 const current=(await app.request(route)).body.project;await app.request(route+'/commands',{kind:'revise-task-card',taskCardId:'new-card',brief:'Changed scope',commandId:'scope',expectedRevision:current.revision});
 const revised=(await app.request(route)).body.project,scopeCalls=calls,scopeFiles=await app.executionFiles();const scopeRejected=await app.request(route+'/jobs',{...run,commandId:'new-run',expectedRevision:revised.revision});assert.equal(scopeRejected.status,422);assert.equal(scopeRejected.body.error.code,'SOURCE_ENTRY_INVALID');assert.deepEqual((await app.request(route)).body.project,revised);assert.equal(calls,scopeCalls);assert.deepEqual(await app.executionFiles(),scopeFiles);
 const oldReplay=await app.request(route+'/jobs',run);assert.equal(oldReplay.status,202);assert.equal(oldReplay.body.jobId,queued.body.jobId);assert.deepEqual(oldReplay.body.project.jobs[0].task.request.sourceRecords,frozen);
 assert.equal((await app.request(route+'/jobs',{...run,sourceEntryIds:[]})).status,409);assert.deepEqual((await app.request(route)).body.project,revised);assert.equal(calls,scopeCalls);assert.deepEqual(await app.executionFiles(),scopeFiles);
 assert.equal((await app.request(route)).body.project.sourceEntries.length,2);
});

test('registered supplied text reaches a synthetic research artifact without claiming website proof',async t=>{
 let calls=0, registeredId;
 const app=await fixture(t,{bindings:{research:{providerId:'synthetic',model:'synthetic',role:'research-lead'}},providers:{synthetic:{model:'synthetic',async execute(request){
  calls++;
  const output={researchContractVersion:'research-data-v2',chartData:null,quantitativeClaims:[],outputKind:'research_findings',status:'draft',title:'Synthetic only',summary:'No external evidence',sections:[{heading:'Supplied text',body:'User-provided text only',evidenceIds:[registeredId]}],claims:[{text:'Supplied text contains a literal script string.',kind:'fact',evidenceRefs:[registeredId],limitations:['User-provided, not authenticated']}],gaps:['No independently verified evidence'],evidenceClassifications:[{sourceId:registeredId,scopeRelation:'background',reason:'Supplied text only'}]};
  return diskReceipt(join(app.dir,'executions'),request,{runId:request.runId,model:'synthetic',threadId:randomUUID(),responseText:JSON.stringify(output),parsedOutput:output});
 }}}});
 const p=(await app.request('/api/projects',{name:'Synthetic',brief:'Synthetic',mode:'assisted',humanGates:[],commandId:'create'})).body.project,route=`/api/projects/${p.id}`;
 const saved=await app.request(route+'/sources',{...input,commandId:'save',expectedRevision:0});registeredId=saved.body.sourceId;
 await app.request(route+'/commands',{kind:'confirm-task-card',taskCardId:p.activeTaskCardId,commandId:'confirm',expectedRevision:1});
 await app.request(route+'/jobs',{stage:'research',sourceEntryIds:[saved.body.sourceId],commandId:'run',expectedRevision:2});
 let current;for(let i=0;i<30;i++){current=(await app.request(route)).body.project;if(!['queued','running'].includes(current.jobs[0].status))break;await new Promise(r=>setImmediate(r));}
 assert.equal(calls,1);assert.equal(current.artifacts.length,1,JSON.stringify(current.jobs));
 assert.equal(current.jobs[0].status,'succeeded');assert.equal(current.artifacts[0].researchData.version,'research-data-v2');assert.equal(current.jobs[0].task.researchDataBasis.taskCard.id,p.activeTaskCardId);assert.equal(current.jobs[0].task.researchDataBasis.confirmations.length,1);
 assert.equal(current.artifacts[0].technicalReceipts.sourceCatalogue.records[0].provenance.kind,'user_provided');
 assert.equal(current.sourceEntries[0].verificationStatus,'unverified');
});

test('confirmed scope with a corrupted exact task basis stays a numeric integrity rejection without execution',async t=>{
 let calls=0;const app=await fixture(t,{bindings:{research:{providerId:'synthetic',model:'synthetic',role:'research-lead'}},providers:{synthetic:{model:'synthetic',async execute(){calls++;throw new Error('Corrupt basis must not execute');}}}});
 const p=(await app.request('/api/projects',{name:'Synthetic integrity only',brief:'Unknown product parameters remain unknown.',mode:'assisted',humanGates:[],commandId:'create'})).body.project,route=`/api/projects/${p.id}`;
 const confirmed=await app.request(route+'/commands',{kind:'confirm-task-card',taskCardId:p.activeTaskCardId,commandId:'confirm',expectedRevision:0});assert.equal(confirmed.status,200);
 const damaged=structuredClone(confirmed.body.project),card=damaged.taskCards[0],hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
 card.protocol='task-card-v1';card.decisions=[];damaged.confirmations[0].taskCardHash=hash(card);damaged.confirmations[0].decisionSetHash='0'.repeat(64);
 const db=new DatabaseSync(join(app.dir,'state.sqlite'));try{db.prepare('UPDATE revisions SET snapshot=? WHERE project_id=? AND revision=?').run(JSON.stringify(damaged),p.id,damaged.revision);}finally{db.close();}
 const before=(await app.request(route)).body,files=await app.executionFiles();assert.equal(before.project.confirmations[0].taskCardId,before.project.activeTaskCardId);assert.deepEqual(before.view.stages.find(s=>s.stage==='research').blockedReasons,[]);
 const rejected=await app.request(route+'/jobs',{stage:'research',commandId:'corrupt-basis',expectedRevision:damaged.revision});assert.equal(rejected.status,422);assert.equal(rejected.body.error.code,'INVALID_RESEARCH_CHART_DATA');
 assert.deepEqual((await app.request(route)).body.project,before.project);assert.equal(calls,0);assert.deepEqual(await app.executionFiles(),files);assert.equal(before.project.jobs.length,0);
});
