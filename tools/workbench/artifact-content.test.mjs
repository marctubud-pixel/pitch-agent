import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,mkdir,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {readArtifactContent} from './artifact-content.mjs';

test('reads exact registered content, rejects changed bytes and cross-project IDs',async()=>{
 const root=await mkdtemp(join(tmpdir(),'artifact-read-'));
 try {
  const raw=JSON.stringify({title:'Generated draft',sections:[]}),path=join(root,'output.json');await writeFile(path,raw);
  const p={artifacts:[{id:'a',payloadRef:path,contentHash:createHash('sha256').update(raw).digest('hex')}]};
  assert.equal((await readArtifactContent(p,'a',root)).content.title,'Generated draft');
  await assert.rejects(()=>readArtifactContent(p,'other',root),{code:'NOT_FOUND'});
  await writeFile(path,'{}');await assert.rejects(()=>readArtifactContent(p,'a',root),{code:'ARTIFACT_INTEGRITY'});
 }finally{await rm(root,{recursive:true,force:true});}
});
test('registered paths cannot expose outside files through symlinks or root-prefix siblings',async()=>{
 const base=await mkdtemp(join(tmpdir(),'artifact-boundary-')),root=join(base,'root'),outside=join(base,'root-other');
 try {
  await mkdir(root);await mkdir(outside);const file=join(outside,'secret.json');await writeFile(file,'{}');
  const link=join(root,'link');await symlink(file,link);
  for(const path of [file,link])await assert.rejects(()=>readArtifactContent({artifacts:[{id:'a',payloadRef:path}]},'a',root),{code:'ARTIFACT_UNAVAILABLE'});
 }finally{await rm(base,{recursive:true,force:true});}
});
