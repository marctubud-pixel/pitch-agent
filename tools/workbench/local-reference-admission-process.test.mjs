import test from 'node:test';import assert from 'node:assert/strict';import {fork} from 'node:child_process';import {once} from 'node:events';import {DatabaseSync} from 'node:sqlite';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {openStore} from './store.mjs';import {openReferenceAdmission} from './local-reference-admission.mjs';
test('a late separate-process writer cannot dispatch after durable rejection',async t=>{
 const root=await mkdtemp(join(tmpdir(),'reference-late-process-')),native=join(root,'native.sqlite'),workflow=join(root,'workflow.sqlite'),store=openStore(native),db=new DatabaseSync(workflow);
 t.after(async()=>{db.close();store.close();await rm(root,{recursive:true,force:true});});
 store.create({id:'project',name:'Synthetic process race',brief:'Engineering fixture',mode:'assisted'},{actorType:'human',actorId:'test',runId:'test',contextId:'test'});
 const admission=openReferenceAdmission(db,{nativeCommandExists:(id,c)=>Object.hasOwn(store.read(id).processedCommands,c)}),reservation=admission.reserve({caseId:'case',projectId:'project',operation:'reference_upload',request:{commandId:'late',expectedRevision:0}}),before=store.read('project');
 const child=fork(new URL('./fixtures/reference-late-writer.mjs',import.meta.url),{stdio:['ignore','ignore','pipe','ipc']});t.after(()=>{if(child.exitCode===null)child.kill();});
 assert.equal(admission.reject(reservation.lease,'SOURCE_CHANGED'),true);
 const message=once(child,'message'),exited=once(child,'exit');child.send({workflow,native,lease:reservation.lease});const [result]=await message;await exited;
 assert.equal(result.error,'REFERENCE_ADMISSION_NOT_RESERVED');assert.equal(result.invoked,false);assert.deepEqual(store.read('project'),before);assert.equal(admission.receipt('case','late').reason,'SOURCE_CHANGED');
});
