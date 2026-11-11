import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from './store.mjs';
import {openLocalAcceptanceCoordinator,readAcceptanceCaseRegistration} from './local-acceptance-coordinator.mjs';
import {prepareLocalReferenceResponseContract,LOCAL_REFERENCE_ENGINEERING_CONTRACT} from './local-reference-engineering-contract.mjs';
async function setup(t){
 const root=await realpath(await mkdtemp(join(tmpdir(),'dynamic-case-small-'))),store=openStore(join(root,'projects.sqlite'));let coordinator;
 t.after(async()=>{coordinator?.close();store.close();await rm(root,{recursive:true,force:true});});
 const router=await prepareLocalReferenceResponseContract({projectStore:store,executionRoot:root,selection:{version:LOCAL_REFERENCE_ENGINEERING_CONTRACT,projectIds:[],registrationMode:'acceptance-case-initializer'}});
 function open(initializer=({registration})=>router.registerProject(registration)){coordinator=openLocalAcceptanceCoordinator({databasePath:join(root,'cases.sqlite'),projectStore:store,executor:{},executionRoot:root,caseInitializer:initializer});return coordinator;}
 return {root,store,router,open,close:()=>{coordinator.close();coordinator=null;},request:{caseId:'dexian',brief:'得闲，25岁轻松社交包装，度数未定。',commandId:'new-case'}};
}
test('actual new UUID gets private initialization grant, immutable contract and synchronous case metadata',async t=>{
 const f=await setup(t);let calls=0,token;const c=f.open(async({registration,project})=>{calls++;token=registration;assert.equal(f.store.read(project.id).id,project.id);return f.router.registerProject(registration);});
 const state=await c.create(f.request);assert.equal(calls,1);assert.equal(state.nextAction.module,'brief');assert.equal(state.nextAction.status,'awaiting_user');assert.equal(state.jobs.length,0);assert.equal(state.complete,false);
 const m=c.caseRegistrationForProject(state.projectId);assert.deepEqual(m,{id:state.id,projectId:state.projectId,caseId:'dexian',initializationState:'ready'});assert.ok(Object.isFrozen(m));assert.equal(readAcceptanceCaseRegistration(token).caseId,'dexian');
 await assert.rejects(f.router.registerProject(m),{code:'ACCEPTANCE_CASE_REGISTRATION_REQUIRED'});const descriptor=await f.router.registrationForProject(state.projectId);assert.equal(descriptor.projectId,state.projectId);
 assert.equal((await c.create(f.request)).id,state.id);assert.equal(calls,1);assert.equal(f.store.list().length,1);
});
test('initializer failure leaves actual project pending and blocks read, advance and decisions until exact replay',async t=>{
 const f=await setup(t);let first=true,initCalls=0;const c=f.open(async({registration})=>{initCalls++;if(first)throw Object.assign(Error('not ready'),{code:'TEST_INITIALIZER_FAILURE'});return f.router.registerProject(registration);});
 await assert.rejects(c.create(f.request),{code:'TEST_INITIALIZER_FAILURE'});const id=f.store.list()[0].id;assert.equal(c.caseRegistrationForProject(id).initializationState,'pending');
 assert.equal((await c.read(id)).initializationState,'pending');assert.equal((await c.read(id)).nextAction.reason,'ACCEPTANCE_CASE_INITIALIZATION_PENDING');await assert.rejects(c.advance(id),{code:'ACCEPTANCE_CASE_INITIALIZATION_PENDING'});await assert.rejects(c.decide(id,{module:'brief',decision:'approve',commandId:'decision',expectedBasisHash:'a'.repeat(64)}),{code:'ACCEPTANCE_CASE_INITIALIZATION_PENDING'});
 first=false;assert.equal((await c.create(f.request)).projectId,id);assert.equal(initCalls,2);assert.equal(f.store.list().length,1);assert.equal(f.store.read(id).confirmations.length,0);
});
test('reopen after interrupted initialization recovers same project and contract; unknown project cannot receive positive routing',async t=>{
 const f=await setup(t);let c=f.open(async({registration})=>{await f.router.registerProject(registration);throw Error('lost initialization response');});await assert.rejects(c.create(f.request));const id=f.store.list()[0].id,before=await f.router.registrationForProject(id);f.close();c=f.open();assert.equal((await c.create(f.request)).projectId,id);assert.deepEqual(await f.router.registrationForProject(id),before);
 const restarted=await prepareLocalReferenceResponseContract({projectStore:f.store,executionRoot:f.root,selection:{version:LOCAL_REFERENCE_ENGINEERING_CONTRACT,projectIds:[],registrationMode:'acceptance-case-initializer'}});assert.deepEqual(await restarted.registrationForProject(id),before);
 await assert.rejects(restarted.response({project:{id:'unregistered'},job:{purpose:'reference',binding:{providerId:'local-synthetic',model:'synthetic'}}}),{code:'LOCAL_REFERENCE_ENGINEERING_CASE_REGISTRATION_REQUIRED'});
});
test('same create requests share initializer; conflicting body never receives a second grant',async t=>{
 const f=await setup(t);let release,entered,calls=0;const ready=new Promise(r=>entered=r),wait=new Promise(r=>release=r),c=f.open(async({registration})=>{calls++;entered();await wait;return f.router.registerProject(registration);});
 const a=c.create(f.request);await ready;const b=c.create({...f.request});await assert.rejects(c.create({...f.request,brief:'conflicting brief'}),{code:'ACCEPTANCE_COMMAND_REUSED'});release();const [x,y]=await Promise.all([a,b]);assert.equal(x.id,y.id);assert.equal(calls,1);assert.equal(f.store.list().length,1);
});
test('default coordinator behavior needs no initializer and metadata is not a registration capability',async t=>{
 const f=await setup(t),c=f.open(null),state=await c.create(f.request);assert.equal(state.nextAction.module,'brief');assert.throws(()=>readAcceptanceCaseRegistration(c.caseRegistrationForProject(state.id)),{code:'ACCEPTANCE_CASE_REGISTRATION_REQUIRED'});assert.throws(()=>c.caseRegistrationForProject('missing'),{code:'ACCEPTANCE_CASE_REGISTRATION_REQUIRED'});
});

test('reopen cannot bypass a required failed initializer by omitting its configuration',async t=>{
 const f=await setup(t);let c=f.open(async()=>{throw Error('initializer failed');});await assert.rejects(c.create(f.request));const id=f.store.list()[0].id;f.close();c=f.open(null);await assert.rejects(c.create(f.request),{code:'ACCEPTANCE_CASE_INITIALIZER_REQUIRED'});assert.equal((await c.read(id)).initializationState,'pending');assert.equal((await c.read(id)).nextAction.reason,'ACCEPTANCE_CASE_INITIALIZATION_PENDING');assert.equal(f.store.list().length,1);
});

test('one failed initializer stays visible without breaking the ready projects list',async t=>{
 const f=await setup(t),c=f.open(async({registration})=>{const record=readAcceptanceCaseRegistration(registration);if(record.caseId==='m6')throw Error('init failed');return f.router.registerProject(registration);});
 const ready=await c.create(f.request);await assert.rejects(c.create({...f.request,caseId:'m6',commandId:'failed-case'}));const rows=await c.list();assert.equal(rows.length,2);const failed=rows.find(x=>x.id!==ready.id);assert.equal(rows.find(x=>x.id===ready.id).nextAction.status,'awaiting_user');assert.equal(failed.initializationState,'pending');assert.equal(failed.retryRequired,true);assert.equal(failed.complete,false);assert.equal(failed.editorDocumentId,null);assert.ok(failed.states.every(s=>s.status!=='complete'));
 await assert.rejects(c.advance(failed.id,{commandId:'advance-pending'}),{code:'ACCEPTANCE_CASE_INITIALIZATION_PENDING'});assert.equal(f.store.read(failed.id).jobs.length,0);
});
test('static response source identity excludes unrelated coordinator while dynamic grant identity includes it',async t=>{
 const f=await setup(t),staticContract=await prepareLocalReferenceResponseContract({projectStore:f.store,executionRoot:f.root,selection:{version:LOCAL_REFERENCE_ENGINEERING_CONTRACT,projectIds:['future-project']}});
 assert.equal(staticContract.descriptor.sources.length,4);assert.ok(!staticContract.descriptor.sources.some(s=>s.file==='local-acceptance-coordinator.mjs'));assert.equal(f.router.descriptor.sources.length,5);assert.ok(f.router.descriptor.sources.some(s=>s.file==='local-acceptance-coordinator.mjs'));
});
