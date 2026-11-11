import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openStore} from './store.mjs';

const actor={actorId:'fixture-user',actorType:'human',runId:'fixture-run',contextId:'fixture-context'};
const input={id:'fixture-project',name:'Persistence fixture',brief:'Synthetic verification only',mode:'assisted',humanGates:['copy']};
const confirm={commandId:'confirm-1',expectedRevision:0,kind:'confirm-task-card',taskCardId:'fixture-project:scope:1'};
test('reopen preserves revisions, human policy, history and command idempotency',()=>{
  const dir=mkdtempSync(join(tmpdir(),'proposal-store-')),file=join(dir,'projects.sqlite');
  let store=openStore(file);
  try {
    store.create(input,actor);store.command(input.id,confirm,actor);store.close();store=openStore(file);
    assert.equal(store.read(input.id).revision,1);
    assert.deepEqual(store.read(input.id).policies[0].humanGates,['copy']);
    assert.equal(store.read(input.id,0).confirmations.length,0);
    assert.equal(store.command(input.id,confirm,actor).revision,1);
    assert.deepEqual(store.list(),[{id:input.id,revision:1}]);
    assert.throws(()=>store.create(input,actor),{code:'PROJECT_EXISTS'});
  } finally {store.close();rmSync(dir,{recursive:true,force:true});}
});
test('two connections reject stale edits and rejected commands leave no partial state',()=>{
  const dir=mkdtempSync(join(tmpdir(),'proposal-store-')),file=join(dir,'projects.sqlite');
  const a=openStore(file),b=openStore(file);
  try {
    a.create(input,actor);
    a.command(input.id,confirm,actor);
    assert.throws(()=>b.command(input.id,{...confirm,commandId:'other'},actor),{code:'REVISION_CONFLICT'});
    const before=b.read(input.id);
    assert.throws(()=>b.command(input.id,{commandId:'invalid',expectedRevision:1,kind:'request-stage',stage:'layout',jobId:'bad'},actor));
    assert.deepEqual(a.read(input.id),before);
    const changed=b.command(input.id,{commandId:'policy',expectedRevision:1,kind:'set-policy',mode:'assisted',humanGates:['strategy','copy']},actor);
    assert.equal(changed.revision,2);
    assert.deepEqual(a.read(input.id).policies.at(-1).humanGates,['strategy','copy']);
    assert.equal(a.read(input.id,1).policies.length,1);
  } finally {a.close();b.close();rmSync(dir,{recursive:true,force:true});}
});
