import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {deflateRawSync} from 'node:zlib';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,readFile,writeFile,chmod,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {createServer} from './server.mjs';
import {createAssistantRuntime} from './assistant-runtime.mjs';
import {openStore} from './store.mjs';
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const human={actorType:'human',actorId:'owned-operator',runId:'owned-human-run',contextId:'owned-human-context'};
const project=id=>({id,name:'Synthetic '+id,brief:'Synthetic brief. Product capacity and age are unknown.'});
async function fixture(t,{secret=null,brief=null}={}){
 const root=await realpath(await mkdtemp(join(tmpdir(),'assistant-owned-'))),dbPath=join(root,'projects.sqlite');let calls=0,output=()=>({protocol:'assistant-answer-v1',blocks:[{kind:'interpretation',text:'Synthetic interpretation. Capacity remains unknown.',items:[],referenceIds:['stage:research']}]}),lost=false,httpStatus=200;
 const gateway=http.createServer(async(req,res)=>{const chunks=[];for await(const c of req)chunks.push(c);const wire=JSON.parse(Buffer.concat(chunks));calls++;await writeFile(join(root,`request-${calls}.json`),JSON.stringify(wire));if(lost){req.socket.destroy();return;}const answer=await output(wire);if(answer==='disconnect'){req.socket.destroy();return;}res.statusCode=httpStatus;res.end(JSON.stringify({protocol:'workbench-stateless-model-json-v1',invocationId:wire.invocationId,contextMode:'stateless-v1',terminal:'completed',outputText:JSON.stringify(answer),reportedModel:'owned-synthetic-model',requestId:null,usage:{inputTokens:null,outputTokens:null}}));});
 await new Promise(r=>gateway.listen(0,'127.0.0.1',r));
 const operatorConfig={adapter:'workbench-model-http-v1',endpoint:`http://127.0.0.1:${gateway.address().port}/model`,model:'synthetic',serviceIdentity:'owned-assistant-provider',authentication:{kind:'none'},allowLoopbackHttp:true,timeoutMs:10000,maxRequestBytes:262144,maxResponseBytes:196608,maxOutputBytes:32768,vision:false,envelopes:[]};
 if(secret)operatorConfig.authentication={kind:'bearer-env',name:'SYNTHETIC_ASSISTANT_RETENTION_TOKEN'};
 const provider={adapter:operatorConfig.adapter,model:operatorConfig.model,operatorConfig,...(secret?{environment:{SYNTHETIC_ASSISTANT_RETENTION_TOKEN:secret}}:{})},binding={providerId:'owned',model:'synthetic',role:'assistant-lead'},options={dbPath,rootDir:join(root,'executions'),providers:{owned:provider},bindings:{assistant:binding},assistantReadAuthorization:id=>id!=='denied'};
 let server;
 const start=async configured=>{server=createServer({...options,...(configured===false?{providers:{},bindings:{}}:{})});await new Promise(r=>server.listen(0,'127.0.0.1',r));};
 const stop=async()=>{if(server){await new Promise((r,j)=>server.close(e=>e?j(e):r()));server=null;}};
 await start();
 const request=async(path,body)=>{const response=await fetch(`http://127.0.0.1:${server.address().port}${path}`,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};};
 const store=openStore(dbPath);for(const id of ['p','q','denied'])store.create({...project(id),...(brief?{brief}:{})},human);
 t.after(async()=>{store.close();await stop();gateway.closeAllConnections();await new Promise(r=>gateway.close(r));console.log(JSON.stringify({retainedAssistantRoot:root,providerCalls:calls}));});
 const scope={kind:'project',projectId:'p'},conversation=async(s=scope)=>(await request('/api/v1/assistant/'+(s.kind==='project'?'projects/'+s.projectId:s.kind)+'/conversation')).body;
 const ask=async(intent='interpret',extra={})=>request('/api/v1/assistant/questions',{scope,conversationId:(await conversation()).conversationId,requestId:'owned-'+Math.random().toString(36).slice(2),question:'Explain current blockers and unknown capacity',intent,...extra});
 return {root,store,scope,request,conversation,ask,provider,operatorConfig,server:()=>server,calls:()=>calls,setOutput:fn=>output=fn,setLost:v=>lost=v,setStatus:v=>httpStatus=v,start,stop};
}
test('actual HTTP system and model requests preserve business records, scopes and originals across restart',async t=>{
 const f=await fixture(t),before=Object.fromEntries(f.store.list().map(({id})=>[id,digest(f.store.read(id))]));
 const cap=await f.request('/api/v1/assistant/capabilities');assert.equal(cap.body.modelAvailable,true);
 for(const intent of ['status','blockers','next_step','evidence']){const r=await f.ask(intent);assert.equal(r.status,200);assert.equal(r.body.outputProvenance,'system_records');assert.equal(r.body.basedOn.revision,0);}
 assert.equal(f.calls(),0);
 const conversation=await f.conversation(),request={scope:f.scope,conversationId:conversation.conversationId,requestId:'exact-request',question:'Interpret the actual record',intent:'interpret'},answer=await f.request('/api/v1/assistant/questions',request);assert.equal(answer.status,200,JSON.stringify(answer.body));assert.equal(answer.body.state,'complete');assert.equal(answer.body.blocks[0].verification,'unverified_model_interpretation');assert.equal(answer.body.blocks[0].refs[0].id,'stage:research');assert.equal(answer.body.blocks[0].refs[0].projectId,'p');assert.equal(answer.body.blocks[0].refs[0].target.params.projectId,'p');assert.ok(answer.body.original.manifestHash);assert.equal(f.calls(),1);
 assert.deepEqual((await f.request('/api/v1/assistant/questions',request)).body,answer.body);assert.equal(f.calls(),1);
 assert.equal((await f.request('/api/v1/assistant/questions',{...request,question:'changed'})).status,409);
 assert.equal((await f.conversation({kind:'project',projectId:'q'})).answers.length,0);assert.equal((await f.conversation({kind:'general'})).answers.length,0);assert.equal((await f.conversation({kind:'draft'})).answers.length,0);
 const reset={scope:f.scope,conversationId:conversation.conversationId,requestId:'clear-once'},cleared=await f.request('/api/v1/assistant/conversations',reset);assert.equal(cleared.status,200);assert.deepEqual((await f.request('/api/v1/assistant/conversations',reset)).body,cleared.body);assert.equal((await f.conversation()).answers.length,0);
 const second=await f.ask();assert.equal(second.status,200);assert.equal(f.calls(),2);
 assert.deepEqual(Object.fromEntries(f.store.list().map(({id})=>[id,digest(f.store.read(id))])),before);
 await f.stop();await f.start(false);assert.equal((await f.request('/api/v1/assistant/capabilities')).body.modelAvailable,false);const reopened=await f.conversation();assert.equal(reopened.answers.length,1);assert.equal(reopened.answers[0].state,'complete');assert.equal(f.calls(),2);
 assert.equal((await f.ask()).status,503);assert.equal(f.calls(),2);
 f.store.command('p',{kind:'revise-task-card',taskCardId:'p:scope:2',brief:'New synthetic scope',commandId:'owned-revision',expectedRevision:0},human);assert.equal((await f.conversation()).answers[0].stale,true);assert.equal((await f.conversation()).answers[0].basedOn.revision,0);
 const path=join(f.root,'executions','assistant','ordinary-model-http',second.body.original.rootRelativePath,'response.bin'),bytes=await readFile(path);await chmod(path,0o600);await writeFile(path,Buffer.concat([bytes,Buffer.from('x')]));const corrupt=await f.conversation();assert.equal(corrupt.error.code,'ASSISTANT_ORIGINAL_INVALID');assert.equal(f.calls(),2);
 console.log(JSON.stringify({ownedAssistantRoot:f.root,calls:f.calls(),businessHashes:before}));
});
test('unknown provider results are durable and never resend after config changes or explicit reconciliation',async t=>{
 const f=await fixture(t);f.setLost(true);const r=await f.ask('interpret',{requestId:'unknown-request'});assert.equal(r.status,202);assert.equal(r.body.state,'unknown');assert.equal(f.calls(),1);
 await f.stop();await f.start(false);const prior=await f.conversation();assert.equal(prior.answers[0].state,'unknown');
 const reconcile=await f.request('/api/v1/assistant/reconciliations',{scope:f.scope,requestId:'unknown-request'});assert.equal(reconcile.body.state,'unknown');assert.equal(f.calls(),1);
 const repeat=await f.ask('interpret',{requestId:'unknown-request'});assert.equal(repeat.body.state,'unknown');assert.equal(f.calls(),1);
 console.log(JSON.stringify({unknownRoot:f.root,calls:f.calls()}));
});
test('saved terminal result recovers without configuration and without another provider call',async t=>{
 const f=await fixture(t);f.provider.failpoint=async name=>{if(name==='manifest-synced')throw Error('Owned lost terminal return');};const r=await f.ask('interpret',{requestId:'lost-terminal'});assert.equal(r.body.state,'unknown');assert.equal(f.calls(),1);await f.stop();await f.start(false);
 const recovered=await f.request('/api/v1/assistant/reconciliations',{scope:f.scope,requestId:'lost-terminal'});assert.equal(recovered.status,200,JSON.stringify(recovered.body));assert.equal(recovered.body.state,'complete');assert.equal(f.calls(),1);assert.equal((await f.conversation()).answers[0].state,'complete');
});
test('closed contracts reject fabricated refs, commands, fact upgrades, nested fields and scope injection',async t=>{
 const f=await fixture(t),before=digest(f.store.read('p'));
 for(const output of [
  {protocol:'assistant-answer-v1',blocks:[{kind:'interpretation',text:'Synthetic',items:[],referenceIds:['q:private']}]},
  {protocol:'assistant-answer-v1',blocks:[{kind:'fact',text:'Capacity is 500ml',items:[],referenceIds:[]}]},
  {protocol:'assistant-answer-v1',blocks:[{kind:'interpretation',text:'Synthetic',items:[],referenceIds:[],command:{kind:'confirm-task-card'}}]},
  {protocol:'assistant-answer-v1',blocks:[{kind:'interpretation',text:'Synthetic',items:[{text:'nested'}],referenceIds:[]}]},
  {protocol:'assistant-answer-v1',blocks:[],commands:['release-stage']}
 ]){f.setOutput(()=>output);const r=await f.ask();assert.equal(r.status,422,JSON.stringify(r.body));assert.equal(r.body.state,'rejected');}
 assert.equal((await f.conversation()).answers.length,5);
 assert.equal((await f.ask('status',{scope:{kind:'project',projectId:'p',projectName:'Untrusted'}})).status,400);
 assert.equal((await f.ask('status',{scope:{kind:'project',projectId:'denied'}})).status,403);
 assert.equal((await f.ask('status',{scope:{kind:'project',projectId:'missing'}})).status,404);
 assert.equal((await f.ask('status',{draft:{fields:{age:'18'}}})).status,400);
 assert.equal((await f.request('/api/v1/assistant/questions',{scope:f.scope})).status,400);
 assert.equal((await f.request('/api/v1/assistant/general/conversation?projectId=p')).status,400);
 const g=await f.conversation({kind:'draft'});f.setOutput(()=>({protocol:'assistant-answer-v1',blocks:[{kind:'interpretation',text:'The supplied age is unconfirmed.',items:[],referenceIds:[]}]}));const draft=await f.ask('interpret',{scope:{kind:'draft'},conversationId:g.conversationId,draft:{fields:{age:'18'}}});assert.equal(draft.status,200);assert.equal(draft.body.basedOn,null);assert.equal(draft.body.blocks[0].verification,'unverified_model_interpretation');assert.equal(digest(f.store.read('p')),before);
 const wire=JSON.parse(await readFile(join(f.root,'request-6.json'),'utf8'));assert.match(wire.prompt,/unconfirmed_user_input/);assert.doesNotMatch(wire.prompt,/Synthetic brief/);
});
test('concurrent duplicate requests never dispatch twice and a mid-answer revision remains stale',async t=>{
 const f=await fixture(t);let release;const gate=new Promise(r=>release=r);f.setOutput(async()=>{await gate;return {protocol:'assistant-answer-v1',blocks:[{kind:'interpretation',text:'Synthetic interpretation of frozen revision zero.',items:[],referenceIds:['stage:research']}]};});
 const conversation=await f.conversation(),body={scope:f.scope,conversationId:conversation.conversationId,requestId:'concurrent-once',question:'Explain status',intent:'interpret'},pending=f.request('/api/v1/assistant/questions',body);
 while(f.calls()===0)await new Promise(r=>setImmediate(r));
 const duplicate=await f.request('/api/v1/assistant/questions',body);assert.equal(duplicate.status,202);assert.equal(f.calls(),1);
 f.store.command('p',{kind:'revise-task-card',taskCardId:'p:scope:2',brief:'Changed while request is active',commandId:'mid-answer',expectedRevision:0},human);
 release();const r=await pending;assert.equal(r.status,200);assert.equal(r.body.stale,true);assert.equal(r.body.basedOn.revision,0);assert.equal(r.body.basedOn.taskCardId,'p:scope:1');assert.equal(f.calls(),1);
});
test('credential configuration and echo boundaries do not publish or persist configured secrets',async t=>{
 const f=await fixture(t),secret='owned-assistant-test-"credential';f.operatorConfig.authentication={kind:'bearer-env',name:'OWNED_ASSISTANT_TOKEN'};f.provider.environment={};
 assert.equal((await f.request('/api/v1/assistant/capabilities')).body.modelAvailable,false);assert.equal((await f.ask()).status,503);assert.equal(f.calls(),0);
 f.provider.environment={OWNED_ASSISTANT_TOKEN:secret};assert.equal((await f.request('/api/v1/assistant/capabilities')).body.modelAvailable,true);
 const denied=await f.ask('interpret',{question:secret});assert.equal(denied.status,400);assert.equal(denied.body.error.code,'ASSISTANT_SECRET_ECHO');assert.equal(f.calls(),0);
 const bytes=await readFile(join(f.root,'executions','assistant','assistant.sqlite'));assert.equal(bytes.includes(Buffer.from(secret)),false);
 const wal=await readFile(join(f.root,'executions','assistant','assistant.sqlite-wal'));assert.equal(wal.includes(Buffer.from(secret)),false);
});
test('all four conversation scopes persist separately and expose the closed machine schema',async t=>{
 const f=await fixture(t),scopes=[f.scope,{kind:'project',projectId:'q'},{kind:'general'},{kind:'draft'}],ids=[];
 for(const [index,scope]of scopes.entries()){const c=await f.conversation(scope);ids.push(c.conversationId);const r=await f.ask('status',{scope,conversationId:c.conversationId,requestId:'scope-'+index});assert.equal(r.status,200);}
 assert.equal(new Set(ids).size,4);await f.stop();await f.start(false);
 for(const [index,scope]of scopes.entries()){const c=await f.conversation(scope);assert.equal(c.conversationId,ids[index]);assert.equal(c.answers.length,1);assert.equal(c.answers[0].requestId,'scope-'+index);}
 const schema=await f.request('/api/v1/assistant/schema');assert.equal(schema.status,200);assert.equal(schema.body.question.additionalProperties,false);assert.equal(schema.body.modelOutput.properties.blocks.items.additionalProperties,false);assert.equal(f.calls(),0);
});
test('registered source text stays unverified and known provider failures remain terminal without resend',async t=>{
 const f=await fixture(t);f.store.command('p',{kind:'register-research-source',source:{title:'Owned source',publisher:'Synthetic publisher',url:'https://synthetic.invalid/source',excerpt:'Owned source text. Capacity has not been supplied.',intendedUse:'category',attachToClaimId:null},commandId:'register-source',expectedRevision:0},human);
 const before=digest(f.store.read('p')),sources=await f.ask('evidence');assert.equal(sources.body.blocks[0].refs.length,1);assert.match(sources.body.blocks[0].text,/does not certify/);
 f.setOutput(wire=>{const packet=JSON.parse(wire.prompt.split('UNTRUSTED_JSON_DATA\n')[1].split('\nEND_UNTRUSTED_JSON_DATA')[0]),ref=packet.context.registry.find(r=>r.kind==='source');assert.equal(ref.record.excerpt,'Owned source text. Capacity has not been supplied.');assert.equal(ref.record.verificationStatus,'unverified');return {protocol:'assistant-answer-v1',blocks:[{kind:'interpretation',text:'The registered excerpt does not establish capacity.',items:[],referenceIds:[ref.id]}]};});
 const interpretation=await f.ask();assert.equal(interpretation.status,200);assert.equal(interpretation.body.blocks[0].verification,'unverified_model_interpretation');assert.equal(digest(f.store.read('p')),before);
 f.setStatus(503);const failure=await f.ask('interpret',{requestId:'known-provider-failure'});assert.equal(failure.status,502);assert.equal(failure.body.state,'failed');assert.equal(failure.body.error.code,'ASSISTANT_PROVIDER_FAILED');const calls=f.calls();await f.stop();await f.start(false);const retry=await f.ask('interpret',{requestId:'known-provider-failure'});assert.equal(retry.body.state,'failed');assert.equal(f.calls(),calls);
});

test('60 MiB engineering projection stays bounded and history reads do not decode project snapshots',async t=>{
 const f=await fixture(t),p=structuredClone(f.store.read('p'));
 p.taskCards[0].brief+='界'.repeat(9000);
 p.sourceEntries=Array.from({length:260},(_,i)=>({id:'source-'+i,title:'Engineering projection fixture '+i,excerpt:'Unverified synthetic excerpt '+i,verificationStatus:'unverified'}));
 p.artifacts=[{id:'current-artifact',stage:'research',contentHash:'engineering-hash',claims:[{text:'Synthetic claim'}],technicalReceipts:{engineeringFixture:true,raw:'DO_NOT_SEND_FULL_RECEIPTS'+'.'.repeat(61*1024*1024)}}];
 p.activeByStage={research:'current-artifact'};
 const raw=JSON.stringify(p),snapshotHash=createHash('sha256').update(raw).digest('hex'),db=new DatabaseSync(join(f.root,'projects.sqlite'));
 const payload=deflateRawSync(Buffer.from(raw)),header=Buffer.alloc(84);
 Buffer.from([0x57,0x42,0x53,0x53,0x00,0x0d,0x0a,0xff]).copy(header);header[8]=1;header[9]=1;header.writeBigUInt64BE(BigInt(Buffer.byteLength(raw)),12);Buffer.from(snapshotHash,'hex').copy(header,20);createHash('sha256').update(payload).digest().copy(header,52);
 const encoded=Buffer.concat([header,payload]),encodedHash=createHash('sha256').update(encoded).digest('hex');
 db.prepare('UPDATE revisions SET snapshot=? WHERE project_id=? AND revision=0').run(encoded,'p');
 const c=await f.conversation();assert.ok(c.conversationId);
 const status=await f.ask('status');assert.equal(status.status,200,JSON.stringify(status.body));assert.equal(status.body.basedOn.snapshotHash,snapshotHash);assert.ok(status.body.coverage.omittedRecords>60);assert.equal(status.body.coverage.gateEvaluation,'not_performed');assert.equal(status.body.coverage.fieldTruncations,1);
 let contextBytes=0;
 f.setOutput(wire=>{const packet=JSON.parse(wire.prompt.split('UNTRUSTED_JSON_DATA\n')[1].split('\nEND_UNTRUSTED_JSON_DATA')[0]);contextBytes=Buffer.byteLength(JSON.stringify(packet.context));assert.ok(contextBytes<=128*1024);assert.doesNotMatch(wire.prompt,/DO_NOT_SEND_FULL_RECEIPTS/);assert.ok(packet.context.registry.some(r=>r.id==='artifacts:current-artifact'));assert.ok(packet.context.registry.length>0&&packet.context.registry.length<=200);assert.equal(packet.context.registry.length,packet.context.coverage.selectedRecords);return {protocol:'assistant-answer-v1',blocks:[{kind:'interpretation',text:'Only the selected engineering metadata was read.',items:[],referenceIds:['artifacts:current-artifact']}]};});
 const answer=await f.ask();assert.equal(answer.status,200);assert.equal(answer.body.blocks[0].refs[0].sourcePointer,'/artifacts/0');
 f.setOutput(()=>({protocol:'assistant-answer-v1',blocks:[{kind:'interpretation',text:'Attempt to cite omitted source',items:[],referenceIds:['sourceEntries:source-259']}]}));
 const denied=await f.ask();assert.equal(denied.status,422);assert.equal(denied.body.error.code,'ASSISTANT_REFERENCE_INVALID');
 const stored=db.prepare('SELECT snapshot FROM revisions WHERE project_id=? AND revision=0').get('p').snapshot;assert.equal(createHash('sha256').update(stored).digest('hex'),encodedHash);
 const old=c.conversationId;await f.request('/api/v1/assistant/conversations',{scope:f.scope,conversationId:old,requestId:'large-clear'});
 const history=await f.request('/api/v1/assistant/projects/p/history');assert.ok(history.body.conversations.some(c=>c.conversationId===old));
 db.prepare('UPDATE revisions SET snapshot=? WHERE project_id=? AND revision=0').run('deliberately unreadable owned fixture','p');
 const reopened=await f.request('/api/v1/assistant/projects/p/conversation?conversationId='+old);assert.equal(reopened.status,200);assert.equal(reopened.body.answers.length,3);assert.equal(reopened.body.answers[1].state,'complete');assert.equal(f.calls(),2);
 assert.equal((await f.request('/api/v1/assistant/projects/q/conversation?conversationId='+old)).status,404);assert.equal((await f.request('/api/v1/assistant/projects/denied/history')).status,403);
 assert.equal((await f.request('/api/v1/assistant/projects/p/history?cursor=bad')).status,400);assert.equal((await f.request('/api/v1/assistant/projects/p/history?cursor=1&cursor=2')).status,400);
 db.close();console.log(JSON.stringify({engineeringProjectionRoot:f.root,rawSnapshotBytes:Buffer.byteLength(raw),contextBytes,snapshotHash,coverage:answer.body.coverage}));
});
test('scoped history and answers paginate without dropping retained rows',async t=>{
 const f=await fixture(t),c=await f.conversation();
 for(let i=0;i<23;i++)assert.equal((await f.ask('status',{requestId:'page-'+i})).status,200);
 const first=await f.conversation(),second=await f.request('/api/v1/assistant/projects/p/conversation?cursor='+first.nextCursor);assert.equal(first.answers.length,20);assert.equal(second.body.answers.length,3);assert.equal(second.body.nextCursor,null);assert.equal(new Set([...first.answers,...second.body.answers].map(a=>a.requestId)).size,23);
 for(let i=0;i<21;i++){const active=await f.conversation();await f.request('/api/v1/assistant/conversations',{scope:f.scope,conversationId:active.conversationId,requestId:'reset-page-'+i});}
 const h1=await f.request('/api/v1/assistant/projects/p/history'),h2=await f.request('/api/v1/assistant/projects/p/history?cursor='+h1.body.nextCursor);assert.equal(h1.body.conversations.length,20);assert.equal(h2.body.conversations.length,2);assert.ok(h2.body.conversations.some(x=>x.conversationId===c.conversationId));assert.equal(f.calls(),0);
});

test('store-owned metadata and projection preserve admission isolation and failure accounting',()=>{
 const store=openStore(':memory:');try{
  store.create(project('p'),human);store.create(project('q'),human);
  const limits={readAttempts:1,snapshotBytes:1,decodedBytes:1,storedBytes:1};
  assert.throws(()=>store.readHead('p'),{code:'SNAPSHOT_READ_ADMISSION_REQUIRED'});
  assert.throws(()=>store.readAssistantProjection('p'),{code:'SNAPSHOT_READ_ADMISSION_REQUIRED'});
  const head=store.withReadAdmission('p',limits,()=>store.readHead('p'));assert.equal(head.kind,'complete');assert.equal(head.usage.fetchedSnapshots,0);assert.equal(head.usage.reservedDecodedBytes,0);assert.equal(head.value.revision,0);
  const cross=store.withReadAdmission('p',limits,()=>{try{store.readHead('q');}catch{}return 'caught';});assert.equal(cross.kind,'refused');assert.equal(cross.code,'SNAPSHOT_READ_SCOPE_MISMATCH');
  const missing=store.withReadAdmission('missing',limits,()=>{try{store.readHead('missing');}catch{}return 'caught';});assert.equal(missing.kind,'failed');assert.equal(missing.code,'NOT_FOUND');
  const small=store.withReadAdmission('p',limits,()=>store.readAssistantProjection('p'));assert.equal(small.kind,'refused');assert.equal(small.usage.fetchedSnapshots,0);
  const effect=store.withReadAdmission('p',limits,()=>{store.readHead('p');store.create(project('other'),human);});assert.equal(effect.code,'SNAPSHOT_READ_WRITE_FORBIDDEN');assert.equal(store.list().length,2);
 }finally{store.close();}
});

for(const outcome of ['complete','unknown'])test(`disconnected assistant ${outcome} drains once across concurrent and repeated server close`,{timeout:10000},async t=>{
 const f=await fixture(t),conversation=await f.conversation();let entered,release;
 const received=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve);
 f.setOutput(async()=>{entered();await gate;return outcome==='unknown'?'disconnect':{protocol:'assistant-answer-v1',blocks:[{kind:'interpretation',text:'Owned delayed original',items:[],referenceIds:['stage:research']}]};});
 const body=JSON.stringify({scope:f.scope,conversationId:conversation.conversationId,requestId:'disconnected-owned',question:'Read frozen records',intent:'interpret'}),server=f.server();
 const request=http.request({hostname:'127.0.0.1',port:server.address().port,path:'/api/v1/assistant/questions',method:'POST',agent:false,headers:{'content-type':'application/json','content-length':Buffer.byteLength(body)}});
 request.on('error',()=>{});request.end(body);await received;
 const disconnected=new Promise(resolve=>request.once('close',resolve));request.destroy();await disconnected;
 let callbacks=0;const closing=()=>new Promise((resolve,reject)=>{assert.equal(server.close(error=>{callbacks++;error?reject(error):resolve();}),server);});
 const first=closing(),second=closing();await new Promise(resolve=>setTimeout(resolve,30));assert.equal(callbacks,0);assert.equal(f.calls(),1);
 const db=new DatabaseSync(join(f.root,'executions/assistant/assistant.sqlite'),{readOnly:true});assert.equal(JSON.parse(db.prepare('SELECT record FROM asks').get().record).state,'reserved');db.close();
 release();await Promise.all([first,second]);assert.equal(callbacks,2);await closing();assert.equal(callbacks,3);assert.equal(server.listening,false);assert.equal(f.calls(),1);
 await f.stop();await f.start(false);const restored=await f.conversation();assert.equal(restored.answers.length,1);assert.equal(restored.answers[0].state,outcome);assert.equal(restored.answers[0].question,'Read frozen records');
 if(outcome==='complete'){assert.ok(restored.answers[0].original.manifestHash);assert.equal(restored.answers[0].blocks[0].text,'Owned delayed original');}
 else{assert.equal((await f.request('/api/v1/assistant/reconciliations',{scope:f.scope,requestId:'disconnected-owned'})).body.state,'unknown');}
 assert.equal(f.calls(),1);
});
for(const unavailable of [false,true])test(`all intents reject configured credential duplication before retention when model unavailable=${unavailable}`,async t=>{
 const secret='SYNTHETIC_RETENTION_ONLY_20261101',f=await fixture(t,{secret,brief:'Previously entered synthetic credential '+secret});
 if(unavailable)f.operatorConfig.maxOutputBytes=32769;
 assert.equal((await f.request('/api/v1/assistant/capabilities')).body.modelAvailable,!unavailable);
 for(const intent of ['status','blockers','next_step','evidence','interpret']){
  const result=await f.ask(intent);assert.equal(result.status,400);assert.equal(result.body.error.code,'ASSISTANT_SECRET_ECHO');assert.equal(JSON.stringify(result.body).includes(secret),false);
  for(const kind of ['general','draft']){
   const scope={kind},conversation=await f.conversation(scope);
   const result=await f.ask(intent,{scope,conversationId:conversation.conversationId,question:kind==='general'?secret:'Clean question',...(kind==='draft'?{draft:{fields:{note:secret}}}:{})});
   assert.equal(result.status,400);assert.equal(result.body.error.code,'ASSISTANT_SECRET_ECHO');assert.equal(JSON.stringify(result.body).includes(secret),false);
  }
 }
 const db=new DatabaseSync(join(f.root,'executions/assistant/assistant.sqlite'),{readOnly:true});assert.equal(db.prepare('SELECT count(*) AS n FROM asks').get().n,0);db.close();assert.equal(f.calls(),0);
});

test('assistant drain rejects new operations and close shares one completion while accepted work settles',async t=>{
 const f=await fixture(t),rootDir=join(f.root,'owned-runtime-drain'),runtime=createAssistantRuntime({store:f.store,rootDir});
 const scope={kind:'general'},conversation=await runtime.conversation(scope);
 const accepted=runtime.ask({scope,conversationId:conversation.conversationId,requestId:'accepted-before-drain',question:'Accepted before shutdown',intent:'status'});
 const draining=runtime.drain();assert.equal(runtime.drain(),draining);
 const close=runtime.close();assert.equal(runtime.close(),close);
 for(const invoke of [()=>runtime.ask({}),()=>runtime.reconcile({}),()=>runtime.conversation(scope),()=>runtime.history(scope),()=>runtime.clear({}),()=>runtime.suggestions(scope),()=>runtime.capability(),()=>runtime.schema()])assert.throws(invoke,{code:'ASSISTANT_CLOSING',status:503});
 assert.equal((await accepted).state,'complete');await close;assert.equal(runtime.close(),close);
 const db=new DatabaseSync(join(rootDir,'assistant.sqlite'),{readOnly:true});const record=JSON.parse(db.prepare('SELECT record FROM asks').get().record);assert.equal(record.state,'complete');assert.equal(record.request.question,'Accepted before shutdown');db.close();assert.equal(f.calls(),0);
});
