import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prepareLocalAcceptanceRuntime} from './local-acceptance-runtime.mjs';
test('reference runtime requires an explicit boolean and refuses alias roots before any store dispatch',async t=>{
 await assert.rejects(()=>prepareLocalAcceptanceRuntime({includeReferences:'enabled'}),{code:'LOCAL_REFERENCE_FLAG_INVALID'});
 const raw=await mkdtemp(join(tmpdir(),'local-ref-gate-')),root=await realpath(raw);t.after(()=>rm(raw,{recursive:true,force:true}));
 await assert.rejects(()=>prepareLocalAcceptanceRuntime({executionRoot:root+'/.',includeReferences:true}),{code:'LOCAL_REFERENCE_CANONICAL_ROOT_REQUIRED'});
});
