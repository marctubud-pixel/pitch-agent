import {reopenOrdinary,isOrdinaryHttp,ordinarySuccessfulStatus,ordinaryHasContext} from './ordinary-model.mjs';
import {createHash} from 'node:crypto';
import {open,realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve,join,sep} from 'node:path';
import {isDeepStrictEqual as equal} from 'node:util';
import {ownerHash} from './owner-edge.mjs';
import {referenceHash as hash,referenceRequire as need} from './reference-review.mjs';
import {requireReferenceOriginalHistory,referenceOriginalReports} from './reference-dossier.mjs';
import {readArtifactContent} from './artifact-content.mjs';
import {imageManifest} from './image-evidence.mjs';
import {readManagedCapture,CAPTURE_READ_LIMITS} from './source-capture-store.mjs';

const changed=['REFERENCE_CAPTURE_CHANGED','Original reference bytes or attribution changed'];
// Arbitrary JSON whitespace has no protocol ceiling. Packet size is an admission policy.
// Calibrations have no declared byte length. Apply the acquisition admission ceiling.
export const REFERENCE_ORIGINAL_LIMITS=Object.freeze({packetBytes:32*1024*1024,calibrationBytes:CAPTURE_READ_LIMITS.rawBytes});
export {originalBytes as readReferenceOriginalBytes};
async function originalBytes(path,{root,length,limit=length,accounting}) {
  const requested=resolve(path),actual=await realpath(requested);
  need(actual===requested&&(!root||actual.startsWith(root+sep)),...changed);
  const handle=await open(requested,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try {
    const info=await handle.stat();
    need(info.isFile()&&Number.isSafeInteger(info.size)&&info.size>=0&&Number.isSafeInteger(limit)&&limit>=0&&info.size<=limit&&(length===undefined||info.size===length),...changed);
    accounting.reservedBytes+=info.size+1;accounting.descriptorReads++;
    const bytes=Buffer.alloc(info.size);let offset=0;
    while(offset<bytes.length){const {bytesRead}=await handle.read(bytes,offset,Math.min(64*1024,bytes.length-offset),offset);accounting.actualBytes+=bytesRead;if(!bytesRead)break;offset+=bytesRead;}
    const probe=await handle.read(Buffer.alloc(1),0,1,info.size);accounting.actualBytes+=probe.bytesRead;
    need(offset===info.size&&probe.bytesRead===0,...changed);
    return bytes;
  } finally {await handle.close();}
}

export function referenceTaskCardTerminal(project,id,parent){
  const cards=(project.taskCards??[]).filter(card=>card.id===id);
  const parents=(project.artifacts??[]).filter(artifact=>artifact.id===parent?.id);
  need(cards.length===1&&parents.length===1&&equal(parent,parents[0])&&Array.isArray(parent.inputVersionIds)&&parent.inputVersionIds.includes(id)&&!(project.artifacts??[]).some(artifact=>artifact.id===id),'REFERENCE_HISTORY_MISSING','Exact registered source task-card terminal required');
  return cards[0];
}

export async function verifyReferenceOriginal(project,dossier,options) {
  requireReferenceOriginalHistory(project,dossier);
  return verifyReferenceOriginalWithin(project,dossier,referenceOriginalReports(project,dossier),options);
}

export async function verifyReferenceOriginalDossiers(project,dossiers,options,verifyOrdinary) {
  const facts=Object.freeze(dossiers.map(dossier=>Object.freeze({dossier,reports:Object.freeze(referenceOriginalReports(project,dossier).map(Object.freeze))})));
  await verifyOrdinary(facts);
  for(const {dossier,reports} of facts){
    requireReferenceOriginalHistory(project,dossier);
    await verifyReferenceOriginalWithin(project,dossier,reports,options);
  }
}

async function verifyReferenceOriginalWithin(project,dossier,reports,{executionRoot,imageStore}) {
  const root=await realpath(resolve(executionRoot));
  const dependencies=[],io={descriptorReads:0,reservedBytes:0,actualBytes:0,jsonParses:0,artifactReader:{calls:0,maximumReservedBytes:0,contentBytes:0},imageStore:{calls:0,declaredBytes:0,returnedBytes:0}};
  const host={projectId:project.id,dossierId:dossier.id,envelopeHash:dossier.envelope.envelopeHash};
  for(const [index,anchor] of (dossier.priorChoiceHistory??[]).entries())dependencies.push({kind:'reference-dossier',...host,index,original:anchor});
  for(const [index,calibration] of (dossier.envelope.configuration.calibrations??[]).entries()){
    const resolvedPath=await realpath(resolve(calibration.evidenceRef));
    const bytes=await originalBytes(resolvedPath,{limit:REFERENCE_ORIGINAL_LIMITS.calibrationBytes,accounting:io});
    need(createHash('sha256').update(bytes).digest('hex')===calibration.evidenceHash,'INVALID_REFERENCE_CALIBRATION','Actual calibration evidence changed');
    dependencies.push({kind:'calibration',...host,index,path:calibration.evidenceRef,resolvedPath,sha256:calibration.evidenceHash});
  }
  let rootContent;
  const contents=[],seen=new Set(),pending=[{artifactId:dossier.envelope.source.source.artifactId,from:null,index:0}];
  while(pending.length){
    const edge=pending.pop(),matches=(project.artifacts??[]).filter(a=>a.id===edge.artifactId),artifact=matches[0];
    need(matches.length<=1&&!(artifact&&(project.taskCards??[]).some(card=>card.id===edge.artifactId)),'REFERENCE_HISTORY_MISSING','Source ancestry identity is ambiguous');
    if(!artifact){
      need(edge.from!==null&&!edge.revision,'REFERENCE_HISTORY_MISSING','Original reached source artifact missing');
      const parent=project.artifacts.find(a=>a.id===edge.from),card=referenceTaskCardTerminal(project,edge.artifactId,parent),source=dossier.envelope.source;
      const frozenParents=(source.sourceArtifacts??[]).filter(a=>a.id===edge.from),targets=(source.returnTargets??[]).filter(t=>t.artifactId===card.id);
      need(equal(card,source.taskCard)&&ownerHash(card)===source.taskCardHash&&frozenParents.length===1&&equal(parent,frozenParents[0])&&targets.length===1&&targets[0].responsibleRole==='proposal-director'&&equal(targets[0].content,card),'REFERENCE_CAPTURE_CHANGED','Frozen source task-card identity changed');
      const {artifactId,...occurrence}=edge;dependencies.push({kind:'task-card',...host,...occurrence,taskCardId:card.id,taskCardHash:source.taskCardHash});
      continue;
    }
    const {revision,...artifactEdge}=edge;
    dependencies.push({kind:'artifact',...host,...artifactEdge,contentHash:artifact.contentHash,path:artifact.payloadRef});
    if(seen.has(artifact.id))continue;seen.add(artifact.id);
    need(Array.isArray(artifact.inputVersionIds),'REFERENCE_HISTORY_MISSING','Original source ancestry required');
    io.artifactReader.calls++;io.artifactReader.maximumReservedBytes+=1024*1024+1;
    const original=await readArtifactContent(project,artifact.id,root);io.artifactReader.contentBytes+=Buffer.byteLength(original.contentText);
    if(contents.length===0)rootContent=original.content;
    contents.push({artifactId:artifact.id,contentText:original.contentText});
    const parents=[...artifact.inputVersionIds,...(artifact.revision?[artifact.revision.revisionOf.artifactId]:[])];
    for(let index=parents.length-1;index>=0;index--)pending.push({artifactId:parents[index],from:artifact.id,index,...(index>=artifact.inputVersionIds.length?{revision:true}:{})});
  }
  need(equal(contents,dossier.sourceContents),...changed);
  const source=contents[0];
  need(source&&equal(rootContent,dossier.envelope.source.source.content),...changed);
  if(Object.hasOwn(dossier.envelope.source.source,'contentText'))need(source.contentText===dossier.envelope.source.source.contentText,...changed);
  const images=new Set();
  async function originalImage(image,edge){
    const manifest=imageManifest([image])[0];dependencies.push({kind:'image',...host,...edge,...manifest});
    const key=JSON.stringify(manifest);if(images.has(key))return;images.add(key);
    io.imageStore.calls++;io.imageStore.declaredBytes+=manifest.byteLength;
    const actual=await imageStore.read({projectId:project.id,imageId:manifest.imageId,expectedHash:manifest.sha256});
    io.imageStore.returnedBytes+=actual.bytes.byteLength;
    need(equal(imageManifest([actual.descriptor])[0],manifest)&&actual.bytes.byteLength===manifest.byteLength&&createHash('sha256').update(actual.bytes).digest('hex')===manifest.sha256,...changed);
  }
  for(const [index,material] of (dossier.envelope.source.manualReferences??[]).entries())await originalImage(material.image,{owner:'manual-reference',index,materialId:material.id});
  for(const fact of reports){
    const {stored,attempt,job,request,images:attachments}=fact,folder=join(root,attempt.id);
    need(stored.payloadRef===join(folder,'reference-report.json'),...changed);
    const expectedReport=JSON.stringify(fact.normalized,null,2),bytes=await originalBytes(stored.payloadRef,{root,length:Buffer.byteLength(expectedReport),accounting:io});
    need(hash(bytes.toString('utf8'))===stored.reportHash&&equal(JSON.parse(bytes),stored.rawReport),...changed);io.jsonParses++;
    const packet={projectId:project.id,jobId:job.id,attemptId:attempt.id,...request,...(attachments.length?{images:attachments}:{})};
    const packetBytes=await originalBytes(join(folder,'packet.json'),{root,limit:REFERENCE_ORIGINAL_LIMITS.packetBytes,accounting:io});
    if(isOrdinaryHttp(attempt.receipt))need(packetBytes.equals(Buffer.from(JSON.stringify(packet,null,2))),...changed);
    const originalPacket=JSON.parse(packetBytes);io.jsonParses++;
    need(equal(originalPacket,packet),...changed);
    if(isOrdinaryHttp(attempt.receipt))await reopenOrdinary({executionRoot:root,binding:job.binding,attemptId:attempt.id,request,images:attempt.receipt.images??[],runtimePacketBytes:Buffer.from(JSON.stringify(packet,null,2)),receipt:attempt.receipt});
    if(attempt.referenceResult){
      const descriptor=attempt.referenceResult;
      need(descriptor.path===join(folder,'reference-result.json'),...changed);
      const savedBytes=await originalBytes(descriptor.path,{root,length:descriptor.byteLength,limit:REFERENCE_ORIGINAL_LIMITS.packetBytes,accounting:io});
      need(hash(savedBytes.toString('utf8'))===descriptor.sha256,...changed);
      const saved=JSON.parse(savedBytes);io.jsonParses++;
      need(saved.protocolVersion==='reference-result-v1'&&saved.projectId===project.id&&saved.dossierId===dossier.id&&saved.envelopeHash===dossier.envelope.envelopeHash&&saved.jobId===job.id&&saved.nodeKey===job.nodeKey&&saved.attemptId===attempt.id&&equal(saved.binding,job.binding)&&equal(saved.executor,attempt.executor)&&equal(saved.executionReceipt,attempt.receipt)&&saved.packetBytes===packetBytes.toString('utf8'),...changed);
      need(attempt.referenceNormalized?.path===stored.payloadRef&&attempt.referenceNormalized.sha256===stored.reportHash&&attempt.referenceNormalized.byteLength===Buffer.byteLength(expectedReport),...changed);
    }
    dependencies.push({kind:'reference-report',...host,reportId:stored.id,nodeKey:stored.nodeKey,jobId:job.id,attemptId:attempt.id,reportHash:stored.reportHash,receiptHash:fact.receiptHash});
    for(const [index,image] of attachments.entries())await originalImage(image,{owner:'report',reportId:stored.id,index});
  }
  for(const [index,candidate] of dossier.candidates.entries())await originalImage(candidate.image,{owner:'candidate',candidateId:candidate.id,index});
  for(const [index,slot] of dossier.tools.entries()){
    dependencies.push({kind:'reference-tool',...host,index,toolId:slot.id,state:slot.state,toolKind:slot.kind});
    if(slot.state!=='completed')continue;
    if(slot.kind==='search'){
      const {attemptRecord,receipt}=slot.result,expected=JSON.stringify(receipt,null,2)+'\n';
      need(attemptRecord.path===join(root,'reference-search','search-attempts',`${receipt.attemptId}.json`)&&attemptRecord.byteLength===Buffer.byteLength(expected),...changed);
      const bytes=await originalBytes(attemptRecord.path,{root,length:attemptRecord.byteLength,accounting:io});
      need(hash(bytes.toString('utf8'))===attemptRecord.sha256&&bytes.equals(Buffer.from(expected))&&receipt.query===slot.argument&&receipt.queryUrl===`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(slot.argument)}`,...changed);
      if(receipt.capture){
        const captured=await readManagedCapture(join(root,'reference-search'),{recordHash:receipt.capture.recordSha256},io),record=captured.record,capture=receipt.capture;
        need(capture.recordPath===captured.recordPath&&capture.requestedUrl===record.requestedUrl&&record.requestedUrl===receipt.queryUrl&&capture.finalUrl===record.finalUrl&&capture.responseOrigin===new URL(record.finalUrl).origin&&capture.httpStatus===record.httpStatus&&capture.mimeType===record.mimeType&&capture.retrievedAt===record.retrievedAt&&equal(capture.raw,record.raw),...changed);
        dependencies.push({kind:'capture',...host,toolId:slot.id,recordHash:captured.recordHash,recordPath:captured.recordPath,raw:record.raw});
        for(const result of receipt.results)need(result.source.rawSha256===record.raw.sha256&&result.source.captureRecordSha256===captured.recordHash,...changed);
      }
    }else{
      const actual=await readManagedCapture(join(root,'source-captures'),slot.result,io);
      dependencies.push({kind:'capture',...host,toolId:slot.id,recordHash:actual.recordHash,recordPath:actual.recordPath,raw:actual.record.raw});
      need(equal(actual.record,slot.result.record)&&actual.record.requestedUrl===slot.argument,...changed);
    }
  }
  return {dossier,envelope:dossier.envelope,reports,dependencies,io};
}
