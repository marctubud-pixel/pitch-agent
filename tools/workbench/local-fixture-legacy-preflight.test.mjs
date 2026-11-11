import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {assertLocalFixtureWorkflowProfile,openLocalAcceptanceCoordinator} from './local-acceptance-coordinator.mjs';

const identity={protocol:'local-fixture-identity-v1',fixtureProfile:'case-aware-grouped-v1',closureHash:'a'.repeat(64)};
test('legacy read-only store adapters retain the missing-workflow preflight contract',async t=>{
 const root=await mkdtemp(join(tmpdir(),'legacy-fixture-preflight-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const databasePath=join(root,'missing.sqlite'),projectStore={read:()=>assert.fail('preflight must not read a legacy project')};
 assert.equal(assertLocalFixtureWorkflowProfile({databasePath,projectStore}),true);assert.equal(existsSync(databasePath),false);
 assert.throws(()=>assertLocalFixtureWorkflowProfile({databasePath,projectStore,fixtureIdentity:identity}),{code:'LOCAL_FIXTURE_PROJECT_LIST_REQUIRED'});assert.equal(existsSync(databasePath),false);
});

test('legacy adapters cannot create schema in a partial new-profile workflow database',async t=>{
 const root=await mkdtemp(join(tmpdir(),'legacy-new-profile-refusal-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const databasePath=join(root,'workflow.sqlite'),db=new DatabaseSync(databasePath);
 db.exec('CREATE TABLE acceptance_creations(id TEXT,payload TEXT,state TEXT)');db.prepare('INSERT INTO acceptance_creations VALUES(?,?,?)').run('case-new',JSON.stringify({id:'case-new',fixtureIdentity:identity}),'pending');db.close();
 const before=await readFile(databasePath),projectStore={read:()=>assert.fail('identity scan needs no legacy project read')};
 assert.throws(()=>openLocalAcceptanceCoordinator({databasePath,projectStore,executor:{}}),{code:'LOCAL_FIXTURE_PROFILE_CHANGED'});
 assert.deepEqual(await readFile(databasePath),before);
 const reopened=new DatabaseSync(databasePath,{readOnly:true});try{assert.deepEqual(reopened.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name),['acceptance_creations']);}finally{reopened.close();}
});
