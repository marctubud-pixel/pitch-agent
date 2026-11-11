import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,rm,readFile,chmod,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {freezeReferenceLibrary} from './reference-library.mjs';
import {persistLocalReferenceLibrary} from './local-acceptance-reference-driver.mjs';
test('curated catalogue snapshot is immutable, replayable and separate from official captures',async t=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'local-library-snapshot-')));t.after(()=>rm(root,{recursive:true,force:true}));
 const library=freezeReferenceLibrary({schemaVersion:'local-acceptance-assets-v1',m6:{posters:[{id:'a',sha256:'a'.repeat(64),role:'same-use-master-kv',sourceUrl:'https://example.test/reference',provenanceState:'legacy-not-verified',limitations:['No new source capture.']}]},dexian:{packaging:[]}});
 const first=await persistLocalReferenceLibrary({executionRoot:root,library}),again=await persistLocalReferenceLibrary({executionRoot:root,library});
 assert.deepEqual(again,first);assert.equal(first.origin,'local-curated-configuration-not-network-capture');const bytes=await readFile(first.path);assert.equal(createHash('sha256').update(bytes).digest('hex'),first.sha256);assert.equal(bytes.length,first.byteLength);assert.deepEqual(JSON.parse(bytes),library);
 const mutable=structuredClone(library),pending=persistLocalReferenceLibrary({executionRoot:root,library:mutable});mutable.entries[0].sourceUrl='https://example.test/changed-during-await';assert.deepEqual(await pending,first);
 await chmod(first.path,0o600);await writeFile(first.path,'changed');await assert.rejects(()=>persistLocalReferenceLibrary({executionRoot:root,library}),{code:'LOCAL_REFERENCE_LIBRARY_SNAPSHOT_CHANGED'});assert.equal(await readFile(first.path,'utf8'),'changed');
});
