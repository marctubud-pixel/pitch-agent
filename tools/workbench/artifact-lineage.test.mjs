import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {readArtifactLineageContents} from './artifact-content.mjs';
test('lineage reads physical artifact bytes, includes revisions and permits registered task-card parents',async t=>{
  const root=await mkdtemp(join(tmpdir(),'artifact-lineage-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const artifact=async(id,parents=[])=>{const text=JSON.stringify({title:id}),payloadRef=join(root,id+'.json');await writeFile(payloadRef,text);return {id,inputVersionIds:parents,payloadRef,contentHash:createHash('sha256').update(text).digest('hex')};};
  const original=await artifact('original',['task']),research=await artifact('research',['task']),strategy=await artifact('strategy',['research']);
  research.revision={revisionOf:{artifactId:'original'}};
  const project={artifacts:[original,research,strategy],taskCards:[{id:'task'}]};
  const contents=await readArtifactLineageContents(project,'strategy',root);
  assert.deepEqual(contents.map(c=>c.artifactId),['strategy','research','original']);
  assert(contents.every(c=>JSON.parse(c.contentText).title===c.artifactId));
  await writeFile(research.payloadRef,'{}');await assert.rejects(()=>readArtifactLineageContents(project,'strategy',root),{code:'ARTIFACT_INTEGRITY'});
});
test('unknown parents, cycles and task-card roots are rejected without silently dropping provenance',async t=>{
  const root=await mkdtemp(join(tmpdir(),'artifact-lineage-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const text='{}',payloadRef=join(root,'source.json');await writeFile(payloadRef,text);
  const source={id:'a',inputVersionIds:['missing'],payloadRef,contentHash:createHash('sha256').update(text).digest('hex')};
  const project={artifacts:[source],taskCards:[{id:'task'}]};
  await assert.rejects(()=>readArtifactLineageContents(project,'a',root),{code:'ARTIFACT_LINEAGE_MISSING'});
  source.inputVersionIds=['a'];await assert.rejects(()=>readArtifactLineageContents(project,'a',root),{code:'ARTIFACT_LINEAGE_CYCLE'});
  await assert.rejects(()=>readArtifactLineageContents(project,'task',root),{code:'NOT_FOUND'});
});
