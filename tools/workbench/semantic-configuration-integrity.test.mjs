import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from './store.mjs';
import {SEMANTIC_PROTOCOL} from './semantic-authority.mjs';
const configuration={readinessBinding:{providerId:'local',model:'synthetic',role:'primary'},challengeBinding:{providerId:'local',model:'synthetic',role:'critic'},rubricVersion:SEMANTIC_PROTOCOL};
async function fixture(t){const root=await mkdtemp(join(tmpdir(),'semantic-integrity-')),path=join(root,'db'),store=openStore(path),db=new DatabaseSync(path);t.after(async()=>{db.close();store.close();await rm(root,{recursive:true,force:true});});const lease=store.registerSemanticConfiguration(configuration,{expectedEpoch:0});return {store,db,lease};}
for(const [name,change] of [
 ['changed binding with retained hash',db=>db.prepare('UPDATE semantic_configuration SET configuration=?').run(JSON.stringify({...configuration,challengeBinding:{...configuration.challengeBinding,model:'unregistered'}}))],
 ['incorrect hash',db=>db.prepare('UPDATE semantic_configuration SET hash=?').run('bad')],
 ['JSON metadata injection',db=>db.prepare('UPDATE semantic_configuration SET configuration=?').run(JSON.stringify({...configuration,epoch:99,configurationHash:'injected'}))],
 ['extra binding field',db=>db.prepare('UPDATE semantic_configuration SET configuration=?').run(JSON.stringify({...configuration,challengeBinding:{...configuration.challengeBinding,extra:'x'}}))],
 ['invalid JSON',db=>db.prepare('UPDATE semantic_configuration SET configuration=?').run('{')],
 ...[0,-1,1.5,Number.MAX_SAFE_INTEGER+1,'invalid'].map(epoch=>[`invalid epoch ${epoch}`,db=>db.prepare('UPDATE semantic_configuration SET epoch=?').run(epoch)])
])test(`persisted authority refuses ${name} for read, attach and old lease`,async t=>{const {store,db,lease}=await fixture(t);change(db);for(const read of [()=>store.semanticConfiguration(),()=>store.attachSemanticConfiguration(configuration),()=>store.requireSemanticLease(lease),()=>store.registerSemanticConfiguration(configuration,{expectedEpoch:1})])assert.throws(read,{code:'SEMANTIC_CONFIGURATION_CORRUPT'});});
test('valid reordered configuration preserves canonical hash, lease and epoch',async t=>{const {store,db,lease}=await fixture(t),before=store.semanticConfiguration();const reorder={rubricVersion:SEMANTIC_PROTOCOL,challengeBinding:{role:'critic',model:'synthetic',providerId:'local'},readinessBinding:{role:'primary',providerId:'local',model:'synthetic'}};db.prepare('UPDATE semantic_configuration SET configuration=?').run(JSON.stringify(reorder));assert.deepEqual(store.semanticConfiguration(),before);assert.deepEqual(store.requireSemanticLease(lease),before);assert.equal(store.attachSemanticConfiguration(reorder).epoch,1);assert.equal(store.registerSemanticConfiguration(reorder,{expectedEpoch:1}).epoch,1);});
