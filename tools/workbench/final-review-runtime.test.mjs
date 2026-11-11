import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {owned,configure,reserve} from './final-review-phase-fixture.mjs';
import {selectFinalBusinessAction,readFinalDeliveryBytes,createFinalReviewRuntime} from './final-review-runtime.mjs';
import {codexDescriptor} from './final-review-codex-original.mjs';
import {createServer} from './server.mjs';

test('business action follows real reserved topology and refuses stale numerical and unknown metadata',()=>{
 const o=owned(),setup=configure(o),p=reserve(setup,o.plan);assert.equal(selectFinalBusinessAction(p).callId,'owner:layoutProducer');
 const changed=structuredClone(p);changed.activeTaskCardId='changed';assert.equal(selectFinalBusinessAction(changed).blockers[0].code,'FINAL_STALE_BASIS');
 for(const version of ['content-packet-v4','content-packet-v5','content-packet-v6']){const numeric=structuredClone(p);numeric.jobs.find(j=>j.purpose==='complete_content_plan').task.packetVersion=version;const action=selectFinalBusinessAction(numeric);assert.equal(action.kind,'blocked');assert.deepEqual(action.blockers.map(blocker=>blocker.code),['CONTENT_CONTRACT_INVALID']);}
 const operation=structuredClone(p);operation.jobs.push({id:'operation-unknown',purpose:'final_operation_observation',status:'awaiting_reconciliation'});assert.deepEqual(selectFinalBusinessAction(operation),{kind:'reconcile_operation',jobId:'operation-unknown'});
 const pending=structuredClone(p);pending.jobs.push({id:'unknown',purpose:'final_review_call',status:'awaiting_reconciliation'});assert.deepEqual(selectFinalBusinessAction(pending),{kind:'reconcile',jobId:'unknown'});
 for(const status of ['returned','failed','closed','waiting_for_human']){const stopped=structuredClone(p);stopped.finalReviewReservations[0].status=status;assert.equal(selectFinalBusinessAction(stopped).kind,status);}
});

test('production composition rejects substituted reader authority',()=>{
 assert.throws(()=>createFinalReviewRuntime({store:{read(){}},reader:{readSnapshot(){}},operations:{},launchConfiguration:{}}),{code:'FINAL_OPERATION_READER_REQUIRED'});
});

test('exact owned delivery byte reader rejects corruption escape and symlink without treating bytes as native proof',async t=>{
 const root=await mkdtemp(join(tmpdir(),'final-owned-bytes-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const bytes=Buffer.from('explicit synthetic byte-custody fixture, not a certified PPT'),path=join(root,'original.pptx');await writeFile(path,bytes);
 const descriptor={originalPath:path,...codexDescriptor(bytes)};assert.deepEqual(await readFinalDeliveryBytes(root,descriptor),bytes);
 await writeFile(path,Buffer.from('corrupted'));await assert.rejects(readFinalDeliveryBytes(root,descriptor),{code:'FINAL_DELIVERY_BYTES_CHANGED'});
 await writeFile(path,bytes);await symlink(path,join(root,'linked.pptx'));await assert.rejects(readFinalDeliveryBytes(root,{...descriptor,originalPath:join(root,'linked.pptx')}),{code:'LAYOUT_SYMLINK_REFUSED'});
 await assert.rejects(readFinalDeliveryBytes(root,{...descriptor,originalPath:join(root,'..','other.pptx')}),{code:'LAYOUT_MANAGED_BYTES_REQUIRED'});
 await assert.rejects(readFinalDeliveryBytes(root,{...descriptor,bytes:256*1024**2+1}),{code:'FINAL_DELIVERY_DESCRIPTOR_REQUIRED'});
});

test('actual local v1 final API exposes configuration separately and refuses approvals paths and release without owner config',async t=>{
 const root=await mkdtemp(join(tmpdir(),'final-api-'));const server=createServer({dbPath:join(root,'test.sqlite'),rootDir:join(root,'executions'),port:0,imageProvider:null});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(async()=>{await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});});
 const base=`http://127.0.0.1:${server.address().port}`;
 const post=(path,body,headers={})=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
 const created=await post('/api/projects',{name:'Synthetic final HTTP',brief:'Synthetic project, no provider effects',commandId:'create-final-api',mode:'auto',humanGates:[]});assert.equal(created.status,201);const {project}=await created.json();
 const path=`/api/v1/projects/${project.id}`,statusResponse=await fetch(base+path+'/final-review-status');assert.equal(statusResponse.status,200);const status=await statusResponse.json();assert.equal(status.configuration.reader,false);assert.equal(status.implementation.ownedDelivery,true);assert.equal(status.deliveryAvailable,false);
 for(const suffix of ['/final-deliveries','/final-deliveries/'+'a'.repeat(64)+'/editorial.pptx']){const response=await fetch(base+path+suffix);assert.equal(response.status,422);assert.equal((await response.json()).error.code,'FINAL_CONFIGURATION_REQUIRED');}
 const release=await post(path+'/final-deliveries',{commandId:'release',expectedRevision:project.revision});assert.equal(release.status,422);assert.equal((await release.json()).error.code,'FINAL_CONFIGURATION_REQUIRED');
 for(const body of [{commandId:'forged',expectedRevision:project.revision,approval:{human:true}},{commandId:'forged',expectedRevision:project.revision,path:'/etc/passwd'}]){const response=await post(path+'/final-deliveries',body);assert.equal(response.status,422);assert.equal((await response.json()).error.code,'INVALID_FINAL_INTENT');}
 const decision=await post(path+'/final-review-decisions',{commandId:'decision',expectedRevision:project.revision,kind:'accept-final-review-delivery'});assert.equal(decision.status,422);
 const cross=await post(path+'/final-deliveries',{commandId:'cross',expectedRevision:0},{origin:'https://untrusted.invalid'});assert.equal(cross.status,403);
 const query=await fetch(base+path+'/final-review-status?path=/etc/passwd');assert.equal(query.status,422);
 const before=await (await fetch(base+`/api/projects/${project.id}`)).json();assert.equal(before.project.revision,project.revision);assert.equal(before.project.jobs.length,0);
});

test('v1 delivery HTTP protocol emits only selected owned style bytes on an explicitly synthetic service',async()=>{
 const {handleFinalReviewHttp}=await import('./final-review-http.mjs'),calls=[],bytes=Buffer.from('synthetic response transport only');
 const deliveryId='b'.repeat(64),url=new URL(`http://127.0.0.1/api/v1/projects/project/final-deliveries/${deliveryId}/stage.pptx`);
 const executor={async downloadFinalDelivery(...args){calls.push(args);return bytes;}};
 const res={writeHead(status,headers){this.status=status;this.headers=headers;},end(body){this.body=body;}};
 assert.equal(await handleFinalReviewHttp({req:{method:'GET'},res,url,executor}),true);
 assert.deepEqual(calls,[['project',deliveryId,'stage']]);assert.equal(res.status,200);assert.deepEqual(res.body,bytes);assert.equal(res.headers['Content-Disposition'],'attachment; filename="proposal-stage.pptx"');
 assert.equal(await handleFinalReviewHttp({req:{method:'GET'},res,url:new URL('http://127.0.0.1/api/v1/projects/project/final-deliveries/'+deliveryId+'/arbitrary.pptx'),executor}),false);assert.equal(calls.length,1);
});
