import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runCheckpointed,invalidOutput,independentCalls} from './call-checkpoints.mjs';

test('a rejected parallel voter retries only that role and keeps its sibling’s original receipt', async t=>{
  const dir=await mkdtemp(join(tmpdir(),'call-roles-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const calls=[];
  const votes=await runCheckpointed(dir,cached=>independentCalls(['brand','user'],async role=>{
    const row=await cached({role},async reason=>{
      calls.push(role);
      return {role,score:role==='brand' && !reason?42:4};
    });
    if(row.score>5) throw invalidOutput('score outside range');
    return row;
  }));
  assert.deepEqual(votes,[{role:'brand',score:4},{role:'user',score:4}]);
  assert.deepEqual(calls.sort(),['brand','brand','user']);
});

for(const stage of ['copy','visual']) test(stage+' resumes exact calls and retries only invalid output once',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'call-check-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  let stop=true;
  const calls=[];
  const run=(version,alwaysBad=false)=>runCheckpointed(dir,async cached=>{
    const first=await cached({stage,version,step:'one'},async()=>{calls.push('one');return {original:{bytes:Buffer.from('png')},threadId:'original'};});
    assert.ok(first.original.bytes.equals(Buffer.from('png')));
    if(stop) throw Error('killed between calls');
    const score=await cached({stage,version,step:'two'},async reason=>{
      calls.push('two');return {score:reason && !alwaysBad ? 4 : 7};
    });
    if(score.score>5) throw invalidOutput('score must be 1–5');
    return score;
  });
  await assert.rejects(run('v1'),/killed/);stop=false;
  assert.deepEqual(await run('v1'),{score:4});
  assert.deepEqual(calls,['one','two','two']);
  await assert.rejects(run('v2',true),/score/);
  assert.deepEqual(calls,['one','two','two','one','two','two']);
});
