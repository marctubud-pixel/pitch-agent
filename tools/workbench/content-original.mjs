import {MODEL_VIEW_CONTENT_CONTRACT,planningContentPacket} from './content-contract-versions.mjs';
import {requireContentBytes} from './content-resource-policy.mjs';
import {reopenContentPlanningOriginal} from './content-planning-original.mjs';
import {ordinaryOriginMatches} from './ordinary-model-claims.mjs';
import {readManagedLayoutBytes} from './managed-layout-bytes.mjs';
import {reopenOrdinary,isOrdinaryHttp,ordinarySuccessfulStatus,ordinaryHasContext} from './ordinary-model.mjs';
import {contentRequest,contentPlanningManifest,ingestContent,validateContentReceipt} from './complete-content.mjs';
import {sketchRequire as need} from './sketch-authority.mjs';
import {IMAGE_LIMITS} from './image-evidence.mjs';
import {isDeepStrictEqual as equal} from 'node:util';
import {createHash} from 'node:crypto';
import {realpath,open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve,join,sep} from 'node:path';

const unavailable=['CONTENT_ORIGINAL_BYTES_UNAVAILABLE','Exact bounded bytes in managed execution storage required'];
const changed=['CONTENT_ORIGINAL_BYTES_CHANGED','Original content packet, response and receipt bytes required'];
const attachmentChanged=['CONTENT_ATTACHMENT_CHANGED','Actual original attachment bytes changed'];

async function originalBytes(path,length,{executionRoot,attachment=false,http=false}={}) {
 const mismatch=attachment?attachmentChanged:changed;
 need(Number.isSafeInteger(length)&&length>=0&&(!attachment||length>0&&length<=IMAGE_LIMITS.bytes),...mismatch);
 if(executionRoot!==undefined&&http){const bytes=await readManagedLayoutBytes(executionRoot,path,Math.max(1,length));need(bytes.length===length,...mismatch);return bytes;}
 const actual=await realpath(path);
 if(executionRoot!==undefined){const base=await realpath(resolve(executionRoot));need(actual.startsWith(base+sep),...unavailable);}
 const handle=await open(actual,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try {
  const info=await handle.stat();
  need(info.isFile()&&Number.isSafeInteger(info.size)&&info.size>=0,...(attachment?attachmentChanged:unavailable));
  need(info.size===length,...mismatch);
  const bytes=Buffer.alloc(length);
  let offset=0;
  while(offset<length){
   const {bytesRead}=await handle.read(bytes,offset,Math.min(64*1024,length-offset),offset);
   if(bytesRead===0)break;
   offset+=bytesRead;
  }
  const probe=await handle.read(Buffer.alloc(1),0,1,length);
  need(offset===length&&probe.bytesRead===0,...mismatch);
  return bytes;
 } finally {await handle.close();}
}

export async function verifyContentOriginal(project,originalRoot,job,{executionRoot,retainInvalidPlan=false}) {
 if(planningContentPacket(originalRoot.task.packetVersion))await reopenContentPlanningOriginal(project,originalRoot,{executionRoot});
 const attempt=job.attempts.at(-1),folder=join(executionRoot,attempt.id),request=contentRequest(project,originalRoot,job.node).request;
 need(ordinaryOriginMatches(attempt.receipt,attempt.httpAttemptLocator,attempt.id),'ORDINARY_ORIGIN_CHANGED','Retained attempt changed persisted HTTP origin');
 const expectedPacket=JSON.stringify({runId:attempt.id,model:job.binding.model,...request});
 if(planningContentPacket(originalRoot.task.packetVersion)){requireContentBytes('runtimeBytes',expectedPacket);requireContentBytes('receiptBytes',attempt.receipt);requireContentBytes('outputBytes',attempt.receipt.responseText);}
 need((await originalBytes(join(folder,'packet.json'),Buffer.byteLength(expectedPacket),{executionRoot,http:isOrdinaryHttp(attempt.receipt)})).equals(Buffer.from(expectedPacket)),...changed);
 const expectedReceipt=JSON.stringify(attempt.receipt);
 need((await originalBytes(join(folder,'receipt.json'),Buffer.byteLength(expectedReceipt),{executionRoot,http:isOrdinaryHttp(attempt.receipt)})).equals(Buffer.from(expectedReceipt)),...changed);
 const response=attempt.receipt.responseText;
 need((await originalBytes(join(folder,'response.txt'),Buffer.byteLength(response),{executionRoot,http:isOrdinaryHttp(attempt.receipt)})).equals(Buffer.from(response)),...changed);
 if(isOrdinaryHttp(attempt.receipt))await reopenOrdinary({executionRoot,binding:job.binding,attemptId:attempt.id,request,images:attempt.receipt.images??[],runtimePacketBytes:Buffer.from(expectedPacket),receipt:attempt.receipt});
 const checkedInput=validateContentReceipt(project,originalRoot,job,attempt,attempt.receipt);
 const parsed=ingestContent(checkedInput,attempt.receipt,contentPlanningManifest(project,originalRoot),originalRoot.task.source);
 if(job.node.phase==='plan'&&!parsed.valid)need(retainInvalidPlan&&parsed.diagnostics.includes('CONTENT_PLAN_ASSIGNMENT_INVALID')&&equal(parsed.raw,job.contentReport.raw),'CONTENT_PLAN_ASSIGNMENT_INVALID','Saved original work order is invalid under exact module binding authority');
 else need(equal(job.contentReport.projection,parsed),'CONTENT_ORIGINAL_CHANGED','Original response projection changed');
 need(equal(job.contentReport.raw,parsed.raw),'CONTENT_ORIGINAL_CHANGED','Original response raw changed');
 for(const image of attempt.receipt.images??[]){
  const bytes=await originalBytes(image.path,image.byteLength,{attachment:true});
  need(createHash('sha256').update(bytes).digest('hex')===image.sha256,...attachmentChanged);
 }
 const historySemantics=contentHistorySemantics(checkedInput,parsed,job.id);
 const identity={projectId:project.id,rootJobId:originalRoot.id,jobId:job.id,attemptId:attempt.id,reportId:job.contentReport.id};
 const dependencies=originalRoot.inputVersionIds.map((artifactId,index)=>{
  const artifact=project.artifacts.find(a=>a.id===artifactId);
  need(artifact,'CONTENT_SOURCE_REQUIRED','Exact content original source registration required');
  return {kind:'artifact',...identity,index,artifactId,contentHash:artifact.contentHash,provenance:artifact.provenance};
 });
 for(const [index,nodeKey] of (job.node.dependencies??[]).entries()){
  const originals=project.jobs.filter(j=>j.contentRootJobId===originalRoot.id&&j.nodeKey===nodeKey);
  need(originals.length===1&&originals[0].contentReport,'CONTENT_PREDECESSOR_REQUIRED','Exact original content predecessor required');
  dependencies.push({kind:'content-job',...identity,index,jobId:originals[0].id,reportId:originals[0].contentReport.id});
 }
 if(planningContentPacket(originalRoot.task.packetVersion))dependencies.push({kind:'content-planning-authority',...identity,descriptor:structuredClone(originalRoot.task.planningManifestRef)});
 if(originalRoot.task.correction)dependencies.push({kind:'content-correction',...identity,original:structuredClone(originalRoot.task.correction)});
 return {kind:'content-original',...identity,raw:structuredClone(parsed.raw),projection:structuredClone(parsed),valid:parsed.valid,historySemantics,dependencies,imageOccurrences:structuredClone(attempt.receipt.images??[]),attachments:structuredClone(attempt.receipt.images??[])};

}

export function contentHistorySemantics(input,parsed,jobId) {
 if(!parsed.valid)return null;
 return {authority:'content-original-v2',...(input.planningManifestRef?{planningManifestRef:structuredClone(input.planningManifestRef)}:{}),sourceHash:input.sourceHash,sourceObligations:structuredClone(input.neutral.obligations),...(['content-packet-v3','content-packet-v4','content-packet-v5','content-packet-v6'].includes(input.packetVersion)?{projectedSource:{kind:['content-packet-v4','content-packet-v5','content-packet-v6'].includes(input.packetVersion)?'content-source-location-v2':'content-source-location-v1',rootJobId:input.rootJobId,visibility:structuredClone(input.neutral.visibility),sourceLocations:structuredClone(input.sourceLocations)}}:{}),manuscript:structuredClone(input.manuscript),findings:['findings',...(input.phase==='challenge'?['challenges']:[])].flatMap(field=>(parsed.raw[field]??[]).map((value,index)=>({pointer:`/${field}/${index}`,value:structuredClone(value),...(field==='findings'?{domainFindingId:`${jobId}#${value.id}`}:{})}))),dispositions:(input.phase==='director'?parsed.raw.dispositions??[]:[]).map((value,index)=>({pointer:`/dispositions/${index}`,value:structuredClone(value),domainFindingId:value.findingOriginId})),predecessors:structuredClone(input.predecessors??[])};
}
