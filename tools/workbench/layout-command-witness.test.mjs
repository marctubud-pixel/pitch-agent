import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {openStore} from './store.mjs';
import {applyCommand} from './project.mjs';
import {layoutCommandWitness,layoutFingerprintHash} from './layout-command-witness.mjs';
import {selectedOriginalCommandIndex} from './final-selected-originals.mjs';
const actor={actorId:'fixture',actorType:'agent',runId:'fixture',contextId:'fixture'};
const binding={fixture:'synthetic only'},hash=layoutFingerprintHash(JSON.stringify(binding));
const command={kind:'prepare-project-layout',commandId:'layout-cmd',revisionIntent:false,prepared:{binding,bindingHash:hash,ledgerText:'x'.repeat(30000)}};
const raw=JSON.stringify(command),request={kind:'compact-legacy-layout-command',commandId:'migration',targetCommandId:'layout-cmd',sourceRevision:1,expectedRevision:1};
function fixture(t,change=()=>{}){
 const dir=mkdtempSync(join(tmpdir(),'layout-fixture-')),file=join(dir,'x.sqlite');let s=openStore(file);const p=s.create({id:'fixture',name:'fixture',brief:'synthetic fixture only',mode:'auto'},actor);s.close();
 const prior=structuredClone(p),current=structuredClone(p);current.revision=1;current.jobs.push({id:`layout-${hash}`,purpose:'layout_export',task:{binding,bindingHash:hash,input:structuredClone(command.prepared)}});current.audit.push({commandId:'layout-cmd',kind:command.kind,actorId:'fixture',revision:1,at:null});current.processedCommands['layout-cmd']=raw;change(current,prior);
 const db=new DatabaseSync(file);db.prepare('UPDATE revisions SET snapshot=? WHERE project_id=? AND revision=0').run(JSON.stringify(prior),'fixture');db.prepare('INSERT INTO revisions VALUES(?,?,?)').run('fixture',1,JSON.stringify(current));db.prepare('UPDATE heads SET revision=1 WHERE project_id=?').run('fixture');db.close();s=openStore(file);t.after(()=>{s.close();rmSync(dir,{recursive:true,force:true});});return {s,current};
}
test('compact witnesses preserve exact replay and classify digest only',()=>{
 const p={revision:1,processedCommands:{'layout-cmd':layoutCommandWitness(command,raw)},audit:[{commandId:'layout-cmd',kind:command.kind,revision:1}]};
 assert.equal(applyCommand(p,{...command,expectedRevision:0},actor),p);
 assert.throws(()=>applyCommand(p,{...command,prepared:{...command.prepared,ledgerText:'different'},expectedRevision:0},actor),{code:'COMMAND_ID_REUSED'});
 const legacy={...p,processedCommands:{'layout-cmd':raw}};assert.equal(applyCommand(legacy,{...command,expectedRevision:0},actor),legacy);
 assert.throws(()=>applyCommand(legacy,{...command,prepared:{...command.prepared,ledgerText:'different'},expectedRevision:0},actor),{code:'COMMAND_ID_REUSED'});
 const index=selectedOriginalCommandIndex(p);assert.equal(index.entries.length,0);assert.equal(index.digestWitnesses[0].classification,'digest_only_not_raw_command');
});
test('SQLite migration preserves immutable revision and reduces successor bytes',t=>{
 const {s,current}=fixture(t);const old=JSON.stringify(current);const after=s.compactLegacyLayoutCommand('fixture',request,actor);assert.equal(s.read('fixture',1).processedCommands['layout-cmd'],raw);assert.deepEqual(after.jobs,current.jobs);assert.ok(Buffer.byteLength(JSON.stringify(after))<Buffer.byteLength(old)-20000);assert.equal(s.compactLegacyLayoutCommand('fixture',request,actor).revision,2);assert.equal(JSON.parse(after.processedCommands['layout-cmd']).oldRawSha256,layoutFingerprintHash(raw));
 assert.equal(s.command('fixture',{...command,expectedRevision:0},actor).revision,2);
});
test('migration refuses stale CAS, wrong source, foreign kind, changed job and final operation',async t=>{
 for(const [name,change,req,code] of [
 ['CAS',()=>{},{expectedRevision:0},'REVISION_CONFLICT'],['source',()=>{},{sourceRevision:2},'LAYOUT_CACHE_HISTORY_INVALID'],
 ['foreign',p=>{p.processedCommands['layout-cmd']=JSON.stringify({...command,kind:'other'});},{},'LAYOUT_CACHE_ORIGINAL_INVALID'],
 ['job',p=>{p.jobs[0].task.input.ledgerText='changed';},{},'LAYOUT_CACHE_JOB_INVALID'],
 ['final',p=>{p.finalOperationCaptures=[{fixture:true}];},{},'LAYOUT_CACHE_FINAL_OPERATION_EXISTS']])await t.test(name,t=>{const {s}=fixture(t,change);assert.throws(()=>s.compactLegacyLayoutCommand('fixture',{...request,...req},actor),{code});assert.equal(s.read('fixture').revision,1);});
});
