import {reopenOrdinary,isOrdinaryHttp,ordinarySuccessfulStatus,ordinaryHasContext} from './ordinary-model.mjs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {isDeepStrictEqual as equal} from 'node:util';
import {sketchHash as hash,sketchRequire as need} from './sketch-authority.mjs';
import {requireReviewOriginal,buildReviewRequest,deriveSketchReviewOutcome,REVIEW_PROTOCOL} from './sketch-review-v2.mjs';
import {readManagedLayoutBytes} from './managed-layout-bytes.mjs';
import {imageManifest} from './image-evidence.mjs';

export const SKETCH_REVIEW_ORIGINAL_LIMITS=Object.freeze({jsonBytes:32*1024*1024,responseBytes:32*1024*1024});
export async function verifySketchReviewOriginal(project,run,{executionRoot,imageStore}) {
 const generation=requireReviewOriginal(project,run),dependencies=[],reports=[],imageOccurrences=[];
 const identity={projectId:project.id,reviewRunId:run.id,generationId:run.generationId,sourceHash:run.sourceHash,planHash:run.planHash,packetHash:run.packetHash};
 dependencies.push({kind:'sketch-generation',...identity,index:0});
 dependencies.push({kind:'reference-dossier',...identity,index:0,dossierId:generation.source.dossierId});
 for(const [index,job] of project.jobs.filter(j=>j.reviewRunId===run.id&&j.status!=='succeeded').entries())dependencies.push({kind:'sketch-review-attempt',...identity,index,jobId:job.id,nodeKey:job.nodeKey,status:job.status,attempts:structuredClone(job.attempts)});
 async function originalImage(image,occurrence) {
  need(imageStore&&typeof imageStore.read==='function','REVIEW_IMAGE_MISSING','Managed original image store required');
  const loaded=await imageStore.read({projectId:project.id,imageId:image.imageId,expectedHash:image.sha256});
  need(equal(imageManifest([loaded.descriptor])[0],imageManifest([image])[0])&&loaded.bytes.byteLength===image.byteLength&&createHash('sha256').update(loaded.bytes).digest('hex')===image.sha256,'REVIEW_ATTACHMENT_CHANGED','Actual original image bytes changed');
  if(image.width!==undefined)need(loaded.asset.width===image.width&&loaded.asset.height===image.height,'REVIEW_IMAGE_CHANGED','Frozen actual image dimensions changed');
  if(image.path!==undefined)need(image.path===loaded.descriptor.path,'REVIEW_ATTACHMENT_CHANGED','Receipt must address the managed original image');
  imageOccurrences.push({kind:'image',...identity,...occurrence,...imageManifest([image])[0]});
 }
 for(const [cohortIndex,cohort] of run.cohorts.entries())for(const [index,image] of cohort.images.entries())await originalImage(image,{cohortId:cohort.id,cohortIndex,index});
 for(const [index,report] of run.reports.entries()) {
  const node=run.nodes.find(n=>n.key===report.nodeKey),job=project.jobs.find(j=>j.reviewRunId===run.id&&j.nodeKey===node.key),attempt=job.attempts[0],folder=join(executionRoot,attempt.id);
  const request=buildReviewRequest(run,node,run.reports).request;
  if(isOrdinaryHttp(report.receipt))await reopenOrdinary({executionRoot,binding:job.binding,attemptId:attempt.id,request,images:report.receipt.images??[],runtimePacketBytes:Buffer.from(JSON.stringify({runId:attempt.id,model:job.binding.model,...request})),receipt:report.receipt});
  const packet=await readManagedLayoutBytes(executionRoot,join(folder,'packet.json'),SKETCH_REVIEW_ORIGINAL_LIMITS.jsonBytes);
  const receipt=await readManagedLayoutBytes(executionRoot,join(folder,'receipt.json'),SKETCH_REVIEW_ORIGINAL_LIMITS.jsonBytes);
  const response=await readManagedLayoutBytes(executionRoot,join(folder,'response.txt'),SKETCH_REVIEW_ORIGINAL_LIMITS.responseBytes);
  if(isOrdinaryHttp(report.receipt))need(packet.equals(Buffer.from(JSON.stringify({runId:attempt.id,model:job.binding.model,...request})))&&receipt.equals(Buffer.from(JSON.stringify(report.receipt))),'REVIEW_RECEIPT_CHANGED','Exact HTTP packet and receipt wrapper bytes required');
  need(equal(JSON.parse(packet),{runId:attempt.id,model:job.binding.model,...request})&&equal(JSON.parse(receipt),report.receipt),'REVIEW_RECEIPT_CHANGED','Saved original request and receipt bytes required');
  need(response.equals(Buffer.from(report.receipt.responseText)),'REVIEW_RESPONSE_CHANGED','Original raw response bytes changed');
  for(const [imageIndex,image] of report.receipt.images.entries())await originalImage(image,{reportId:report.id,index:imageIndex});
  const fact={kind:'sketch-review-report',...identity,index,reportId:report.id,nodeKey:node.key,jobId:job.id,attemptId:attempt.id,receiptHash:hash(report.receipt),raw:structuredClone(report.raw),slots:structuredClone(report.slots),diagnostics:structuredClone(report.diagnostics),valid:report.valid,frozenInput:structuredClone(buildReviewRequest(run,node,run.reports).input)};
  reports.push(fact);
  for(const [occurrenceIndex,key] of node.dependencies.entries()) {
   const predecessor=run.reports.find(r=>r.nodeKey===key),originalJob=project.jobs.find(j=>j.reviewRunId===run.id&&j.nodeKey===key);
   dependencies.push({kind:'sketch-review-report',...identity,hostId:report.id,index:occurrenceIndex,nodeKey:key,reportId:predecessor.id,jobId:originalJob.id,attemptId:originalJob.attempts[0].id,receiptHash:hash(predecessor.receipt)});
  }
 }
 const reportOccurrences=reports.flatMap(report=>['findings','dispositions','conditions','challenges','comparisons','limitations'].flatMap(field=>(Array.isArray(report.raw?.[field])?report.raw[field]:[]).map((value,index)=>({reportId:report.reportId,field,index,value:structuredClone(value)}))));
 return {kind:'sketch-review-original',...identity,reports,dependencies,imageOccurrences,reportOccurrences};
}

export async function verifyReviewedSketchOriginal(project,artifact,{executionRoot,imageStore}) {
 const run=project.sketchReviewRuns?.find(r=>r.id===artifact.sketchGeneration?.reviewRunId);
 need(run,'REVIEW_V2_REQUIRED','Actual registered v2 run required');
 const checked=await verifySketchReviewOriginal(project,run,{executionRoot,imageStore}),outcome=deriveSketchReviewOutcome(project,run);
 need(outcome.status==='reviewed'&&equal(artifact.sketchGeneration,{protocol:REVIEW_PROTOCOL,reviewRunId:run.id,generationId:run.generationId,sourceHash:run.sourceHash,planHash:run.planHash,packetHash:run.packetHash,selected:outcome.selected})&&equal(artifact.inputVersionIds,[project.sketchGenerations.find(g=>g.id===run.generationId).source.referenceSource.source.artifactId]),'REVIEW_V2_REQUIRED','Exact original reviewed selection required');
 const expected=join(executionRoot,run.id,'reviewed-sketch.json');
 need(artifact.payloadRef===expected,'REVIEW_ARTIFACT_CHANGED','Exact managed reviewed artifact path required');
 const bytes=await readManagedLayoutBytes(executionRoot,expected,SKETCH_REVIEW_ORIGINAL_LIMITS.jsonBytes);
 need(hash(bytes.toString('utf8'))===artifact.contentHash&&equal(JSON.parse(bytes),artifact.sketchGeneration),'REVIEW_ARTIFACT_CHANGED','Original exact reviewed draft required');
 return checked;
}
