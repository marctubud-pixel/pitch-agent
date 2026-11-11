import {isOrdinaryHttp} from './ordinary-model-claims.mjs';
import {readManagedLayoutBytes} from './managed-layout-bytes.mjs';
import {realpath,open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {DomainError} from './project.mjs';

export async function readArtifactContent(project,artifactId,rootDir) {
  const artifact=project.artifacts.find(item=>item.id===artifactId);
  if(!artifact)throw new DomainError('NOT_FOUND','Artifact not found in this project');
  if(isOrdinaryHttp(artifact.executionReceipt)){
    const raw=await readManagedLayoutBytes(rootDir,artifact.payloadRef,1024*1024);
    if(createHash('sha256').update(raw).digest('hex')!==artifact.contentHash)throw new DomainError('ARTIFACT_INTEGRITY','Saved HTTP artifact does not match its recorded hash');
    const contentText=raw.toString('utf8');let content;try{content=JSON.parse(contentText);}catch{throw new DomainError('ARTIFACT_UNAVAILABLE','Artifact is not structured text');}
    return {artifactId,contentHash:artifact.contentHash,content,contentText};
  }
  const root=await realpath(resolve(rootDir));
  const path=await realpath(artifact.payloadRef);
  if(!path.startsWith(root+sep))throw new DomainError('ARTIFACT_UNAVAILABLE','Artifact is outside managed storage');
  const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  let raw;
  try {
    const info=await handle.stat();
    if(!info.isFile()||info.size>1024*1024)throw new DomainError('ARTIFACT_UNAVAILABLE','Artifact exceeds readable content limit');
    const bytes=Buffer.alloc(info.size);
    let offset=0;
    while(offset<bytes.length){
      const {bytesRead}=await handle.read(bytes,offset,Math.min(64*1024,bytes.length-offset),offset);
      if(bytesRead===0)break;
      offset+=bytesRead;
    }
    const probe=await handle.read(Buffer.alloc(1),0,1,info.size);
    if(probe.bytesRead!==0)throw new DomainError('ARTIFACT_UNAVAILABLE','Artifact exceeds readable content limit');
    raw=bytes.subarray(0,offset);
  } finally {await handle.close();}
  if(createHash('sha256').update(raw).digest('hex')!==artifact.contentHash)throw new DomainError('ARTIFACT_INTEGRITY','Saved artifact does not match its recorded hash');
  let content;
  const contentText=raw.toString('utf8');
  try {content=JSON.parse(contentText);}
  catch {throw new DomainError('ARTIFACT_UNAVAILABLE','Artifact is not structured text');}
  return {artifactId,contentHash:artifact.contentHash,content,contentText};
}

export async function readArtifactLineageContents(project,artifactId,rootDir) {
  if(!project.artifacts.some(a=>a.id===artifactId))throw new DomainError('NOT_FOUND','Lineage root must be a registered artifact');
  const contents=[],seen=new Set(),visiting=new Set();
  async function visit(id) {
    if(seen.has(id))return;
    if(visiting.has(id))throw new DomainError('ARTIFACT_LINEAGE_CYCLE','Artifact lineage cannot contain a cycle');
    const artifact=project.artifacts.find(a=>a.id===id);
    if(!artifact){
      if((project.taskCards??[]).some(card=>card.id===id))return;
      throw new DomainError('ARTIFACT_LINEAGE_MISSING','Artifact lineage contains an unregistered parent');
    }
    visiting.add(id);
    const loaded=await readArtifactContent(project,id,rootDir);
    contents.push({artifactId:id,contentText:loaded.contentText});
    const parents=[...(artifact.inputVersionIds??[]),...(artifact.revision?[artifact.revision.revisionOf.artifactId]:[])];
    for(const parent of parents)await visit(parent);
    visiting.delete(id);seen.add(id);
  }
  await visit(artifactId);
  return contents;
}
