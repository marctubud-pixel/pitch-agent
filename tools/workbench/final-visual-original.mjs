import {ordinaryOriginMatches} from './ordinary-model-claims.mjs';
import {reopenOrdinary,isOrdinaryHttp,ordinarySuccessfulStatus,ordinaryHasContext} from './ordinary-model.mjs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual as equal} from 'node:util';
import {sketchHash as hash,sketchRequire as need} from './sketch-authority.mjs';
import {readManagedLayoutBytes} from './managed-layout-bytes.mjs';
import {loadImageProvider} from './image-api-provider.mjs';
import {IMAGE_LIMITS} from './image-evidence.mjs';
import {FINAL_VISUAL_PURPOSES,FINAL_AGGREGATE_PARSER,finalBinding,finalRequest,finalImageTask,validateFinalReceipt,ingestFinalResponse,requireFinalRevisionOwner} from './final-visual.mjs';

const member=(items,id)=>{const found=(items??[]).filter(item=>item.id===id);need(found.length===1,'FINAL_ORIGINAL_MEMBERSHIP_REQUIRED','One exact registered final original required');return found[0];};
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');


export function finalOriginalPacketByteLimit(expectedPacket) {
 const size=Math.max(Buffer.byteLength(JSON.stringify(expectedPacket)),Buffer.byteLength(JSON.stringify(expectedPacket,null,2)));
 need(Number.isSafeInteger(size)&&size>0&&size<=64*1024*1024,'FINAL_ORIGINAL_PACKET_LIMIT','Frozen final packet must fit the bounded ordinary wrapper contract');return size;
}

export async function verifyFinalVisualOriginal(project,run,job,{executionRoot,imageStore}) {
 need(equal(member(project.finalVisualRuns,run.id),run)&&equal(member(project.jobs,job.id),job)&&job.finalVisualRunId===run.id&&FINAL_VISUAL_PURPOSES.includes(job.purpose),'FINAL_ORIGINAL_MEMBERSHIP_REQUIRED','Exact registered final run and job required');
 need(project.jobs.filter(item=>item.finalVisualRunId===run.id&&item.nodeKey===job.nodeKey).length===1&&job.node.key===job.nodeKey,'FINAL_ORIGINAL_MEMBERSHIP_REQUIRED','Unambiguous registered node required');
 const attempt=job.attempts.at(-1);
 need(ordinaryOriginMatches(attempt.receipt,attempt.httpAttemptLocator,attempt.id),'ORDINARY_ORIGIN_CHANGED','Retained attempt changed persisted HTTP origin');
 need(job.status==='succeeded'&&attempt?.status==='succeeded'&&attempt.dispatchStarted===true&&equal(member(job.attempts,attempt.id),attempt)&&attempt.receipt&&project.jobs.flatMap(item=>item.attempts??[]).filter(item=>item.id===attempt.id).length===1,'FINAL_ORIGINAL_MEMBERSHIP_REQUIRED','Successful exact final attempt and receipt required');
 need(equal(job.inputVersionIds,[run.source.copyArtifactId,run.source.sketchArtifact.id])&&equal(job.binding,job.purpose==='final_visual_image'?run.assignments.image:finalBinding(run,job.node)),'FINAL_BINDING_CHANGED','Exact original assignment and source inputs required');
 const purpose={planner:'final_visual_plan',revision:'final_visual_revision',aggregate:'final_visual_aggregate',image:'final_visual_image',score:'final_visual_review',blind:'final_visual_review',challenge:'final_visual_review',director:'final_visual_review'};
 need(purpose[job.node.phase]===job.purpose,'FINAL_ORIGINAL_KIND_UNSUPPORTED','Exact phase and purpose required');
 const copy=member(project.artifacts,run.source.copyArtifactId),sketch=member(project.artifacts,run.source.sketchArtifact.id);
 need(copy.contentHash===run.source.copyHash&&sketch.contentHash===run.source.sketchArtifact.contentHash&&equal(sketch.sketchGeneration,run.source.sketchArtifact.authority),'FINAL_SOURCE_BYTES_CHANGED','Exact registered original copy and sketch required');
 const identity={projectId:project.id,runId:run.id,sourceHash:run.source.sourceHash,jobId:job.id,attemptId:attempt.id};
 const dependencies=[{kind:'artifact',...identity,index:0,stage:'copy',artifactId:run.source.copyArtifactId,contentHash:run.source.copyHash},{kind:'sketch-review',...identity,index:0,artifactId:run.source.sketchArtifact.id,contentHash:run.source.sketchArtifact.contentHash,generationId:run.source.sketchArtifact.authority.generationId,reviewRunId:run.source.sketchArtifact.authority.reviewRunId}];
 for(const [index,report] of run.source.handoffs.entries())dependencies.push({kind:'sketch-review-report',...identity,index,reviewRunId:run.source.sketchArtifact.authority.reviewRunId,reportId:report.id,reportHash:hash(report)});
 if(run.parentRunId){const owner=requireFinalRevisionOwner(project,run);dependencies.push({kind:'final-visual-report',...identity,index:0,originalRunId:owner.parent.id,originalJobId:owner.job.id,originalAttemptId:owner.job.attempts.at(-1).id,reportId:owner.report.id,reportHash:hash(owner.report)});}
 const referenceSource=run.source.referenceSource;
 if(referenceSource?.dossierId)dependencies.push({kind:'reference-dossier',...identity,index:0,dossierId:referenceSource.dossierId,source:structuredClone(referenceSource)});
 for(const [index,original] of (referenceSource?.referenceHistory??[]).entries())dependencies.push({kind:'reference-dossier',...identity,index:index+1,dossierId:original.dossierId,original:structuredClone(original)});
 for(const [index,original] of (run.source.referenceRecords?.reports??[]).entries())dependencies.push({kind:'reference-report',...identity,index,dossierId:original.dossierId??referenceSource?.dossierId,reportId:original.id,reportHash:hash(original)});
 for(const [index,nodeKey] of (job.node.dependencies??[]).entries()){
  const originals=run.reports.filter(report=>report.nodeKey===nodeKey);need(originals.length===1,'FINAL_DEPENDENCY_MISSING','Exact predecessor report occurrence required');
  const report=originals[0],producer=project.jobs.filter(item=>item.finalVisualRunId===run.id&&item.nodeKey===nodeKey);
  need(producer.length===1&&equal(producer[0].outputVersionIds,[report.id]),'FINAL_DEPENDENCY_MISSING','Exact predecessor producer required');
  dependencies.push({kind:'final-visual-report',...identity,index,originalRunId:run.id,originalJobId:producer[0].id,originalAttemptId:producer[0].attempts.at(-1)?.id,reportId:report.id,reportHash:hash(report)});
 }
 if(job.purpose==='final_visual_image') {
  const targets=run.plan?.directions.flatMap(direction=>direction.targets).filter(target=>`image:${target.id}`===job.nodeKey);
  need(targets?.length===1&&equal(targets[0],job.target),'FINAL_ORIGINAL_OUTPUT_CHANGED','Exact planned original image target required');
  const asset=member(project.imageAssets,job.outputVersionIds?.[0]);
  need(equal(job.outputVersionIds,[asset.id])&&asset.projectId===project.id&&asset.provenance?.attemptId===attempt.id&&asset.provenance.requestHash===attempt.requestHash&&equal(job.binding,attempt.receipt.binding),'FINAL_IMAGE_ANCHOR_CHANGED','Exact generated output membership and assignment required');
  const result=await loadImageProvider({resolveCredential:()=>undefined}).recover(finalImageTask(project,run,job,attempt.id),attempt.id,join(executionRoot,'image-provider-evidence'),{expectedEvidence:attempt.receipt.responseEvidence});
  need(result.kind==='image'&&equal(result.receipt,attempt.receipt)&&asset.sha256===result.receipt.generated.sha256&&asset.byteLength===result.receipt.generated.byteLength&&asset.width===result.receipt.generated.width&&asset.height===result.receipt.generated.height,'FINAL_IMAGE_ANCHOR_CHANGED','Historical local generated bytes and success anchor required');
  const loaded=await imageStore.read({projectId:project.id,imageId:asset.id,expectedHash:asset.sha256});
  need(equal(loaded.asset,asset),'FINAL_IMAGE_ANCHOR_CHANGED','Actual managed generated record required');
  for(const [index,input] of (job.target.operation.images??[]).entries())dependencies.push({kind:'image',...identity,index,...structuredClone(input)});
  return {kind:'final-visual-image-original',...identity,outputVersionId:asset.id,sha256:asset.sha256,receiptHash:hash(attempt.receipt),dependencies};
 }
 const report=member(run.reports,`${attempt.id}:report`);
 need(report.nodeKey===job.nodeKey&&report.phase===job.node.phase&&report.role===job.node.role&&equal(report.receipt,attempt.receipt)&&equal(job.outputVersionIds,[report.id]),'FINAL_ORIGINAL_OUTPUT_CHANGED','Exact original report output and receipt required');
 const folder=join(executionRoot,attempt.id),request=finalRequest(project,run,job.node).request;
 const packet=await readManagedLayoutBytes(executionRoot,join(folder,'packet.json'),finalOriginalPacketByteLimit({runId:attempt.id,model:job.binding.model,...request}));
 const receipt=await readManagedLayoutBytes(executionRoot,join(folder,'receipt.json'));
 const response=await readManagedLayoutBytes(executionRoot,join(folder,'response.txt'));
 if(isOrdinaryHttp(attempt.receipt))need(packet.equals(Buffer.from(JSON.stringify({runId:attempt.id,model:job.binding.model,...request})))&&receipt.equals(Buffer.from(JSON.stringify(attempt.receipt))),'FINAL_RECEIPT_CHANGED','Exact HTTP packet and receipt wrapper bytes required');
 need(equal(JSON.parse(packet.toString('utf8')),{runId:attempt.id,model:job.binding.model,...request})&&equal(JSON.parse(receipt.toString('utf8')),attempt.receipt)&&response.toString('utf8')===attempt.receipt.responseText,'FINAL_RECEIPT_CHANGED','Original request, receipt and raw response bytes required');
 if(isOrdinaryHttp(attempt.receipt))await reopenOrdinary({executionRoot,binding:job.binding,attemptId:attempt.id,request,images:attempt.receipt.images??[],runtimePacketBytes:Buffer.from(JSON.stringify({runId:attempt.id,model:job.binding.model,...request})),receipt:attempt.receipt});
 validateFinalReceipt(project,run,job,attempt,attempt.receipt);
 const projection=ingestFinalResponse(finalRequest(project,run,job.node).input,attempt.receipt);
 const repairable=report.phase==='aggregate'&&!report.valid&&report.aggregateParser!==FINAL_AGGREGATE_PARSER&&equal(report.raw,projection.raw)&&equal(report.slots,projection.slots)&&equal(report.diagnostics,['incomplete_or_invalid_original']);
 need(equal(Object.fromEntries(['raw','valid','slots','diagnostics'].map(k=>[k,report[k]])),projection)||repairable,'FINAL_ORIGINAL_CHANGED','Original response projection cannot change except the typed archive-score parser correction');
 for(const [index,image] of (attempt.receipt.images??[]).entries()){
  need(Number.isSafeInteger(image.byteLength)&&image.byteLength>0&&image.byteLength<=IMAGE_LIMITS.bytes,'FINAL_ATTACHMENT_CHANGED','Finite original attachment bytes required');
  const loaded=await imageStore.read({projectId:project.id,imageId:image.imageId,expectedHash:image.sha256});
  need(equal(loaded.descriptor,image)&&loaded.asset.id===image.imageId&&loaded.asset.projectId===project.id&&loaded.asset.sha256===image.sha256&&loaded.asset.byteLength===image.byteLength&&loaded.asset.mediaType===image.mediaType,'FINAL_ATTACHMENT_CHANGED','Exact managed original attachment identity and descriptor required');
  need(loaded.bytes instanceof Uint8Array&&loaded.bytes.byteLength===image.byteLength&&digest(loaded.bytes)===image.sha256,'FINAL_ATTACHMENT_CHANGED','Original attached actual bytes changed');
  dependencies.push({kind:'image',...identity,index,imageId:image.imageId,sha256:image.sha256});
 }
 return {kind:'final-visual-text-original',...identity,nodeKey:job.nodeKey,reportId:report.id,outputVersionId:report.id,reportHash:hash(report),receiptHash:hash(attempt.receipt),raw:structuredClone(report.raw),frozenInput:structuredClone(finalRequest(project,run,job.node).input),imageOccurrences:dependencies.filter(d=>d.kind==='image'),dependencies};
}
