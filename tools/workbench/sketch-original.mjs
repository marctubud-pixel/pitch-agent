import {ordinaryOriginMatches} from './ordinary-model-claims.mjs';
import {reopenOrdinary,isOrdinaryHttp,ordinarySuccessfulStatus,ordinaryHasContext} from './ordinary-model.mjs';
import {join,resolve} from 'node:path';
import {isDeepStrictEqual as equal} from 'node:util';
import {sketchRequire as need,sketchHash,sketchTextInput,sketchTextRequest,imageTask,validateSavedText,validateGeneratedAsset} from './sketch-authority.mjs';
import {readManagedLayoutBytes} from './managed-layout-bytes.mjs';
import {loadImageProvider} from './image-api-provider.mjs';

const member=(items,id)=>{const matches=items.filter(item=>item.id===id);need(matches.length===1,'SKETCH_ORIGINAL_MEMBERSHIP_REQUIRED','Exactly one registered sketch original required');return matches[0];};

export async function verifySketchOriginal(project,generation,job,{executionRoot,imageStore}) {
 need(equal(member(project.sketchGenerations,generation.id),generation)&&equal(member(project.jobs,job.id),job)&&job.generationId===generation.id,'SKETCH_ORIGINAL_MEMBERSHIP_REQUIRED','Exact registered generation and job required');
 const attempt=job.attempts.at(-1);
 need(ordinaryOriginMatches(attempt.receipt,attempt.httpAttemptLocator,attempt.id),'ORDINARY_ORIGIN_CHANGED','Retained attempt changed persisted HTTP origin');
 need(job.status==='succeeded'&&attempt?.status==='succeeded'&&equal(member(job.attempts,attempt.id),attempt),'SKETCH_ORIGINAL_MEMBERSHIP_REQUIRED','Successful original job and final attempt required');
 need(equal(job.binding,generation.bindings[job.purpose==='image_candidate'?'image':job.nodeKey==='producer'?'producer':'consumer'])&&job.task.sourceHash===generation.source.sourceHash,'SKETCH_BINDING_CHANGED','Original generation assignment and source required');
 const identity={projectId:project.id,generationId:generation.id,sourceHash:generation.source.sourceHash,jobId:job.id,attemptId:attempt.id};
 const dependencies=[{kind:'reference-dossier',...identity,index:0,dossierId:generation.source.dossierId,source:structuredClone(generation.source)}];
 for(const [index,original] of (generation.source.referenceHistory??[]).entries())dependencies.push({kind:'reference-dossier',...identity,index:index+1,original:structuredClone(original)});
 if(job.purpose==='image_candidate') {
  const asset=member(project.imageAssets,job.outputVersionIds?.[0]);
  need(equal(job.outputVersionIds,[asset.id]),'SKETCH_ORIGINAL_OUTPUT_CHANGED','Exact generated output membership required');
  validateGeneratedAsset(project,job,attempt,asset);
  await imageStore.read({projectId:project.id,imageId:asset.id,expectedHash:asset.sha256});
  const evidence=loadImageProvider({resolveCredential:()=>undefined});
  const proof=await evidence.recover(imageTask(project,generation,job,attempt.id),attempt.id,join(executionRoot,'image-provider-evidence'),{expectedEvidence:attempt.responseEvidence});
  need(proof.kind==='image'&&equal(proof.receipt,attempt.receipt),'SKETCH_EVIDENCE_UNAVAILABLE','Original output evidence required for review');
  for(const [index,input] of (job.candidate.operation.images??[]).entries())dependencies.push({kind:'image',...identity,index,...structuredClone(input)});
  const planner=project.jobs.filter(item=>item.generationId===generation.id&&item.nodeKey==='planner');
  need(planner.length===1&&planner[0].status==='succeeded'&&equal(generation.plan?.candidates.find(item=>item.id===job.candidate.id),job.candidate),'SKETCH_LINEAGE_CHANGED','Exact successful planner candidate required');
  dependencies.push({kind:'sketch-text',...identity,index:0,originalJobId:planner[0].id,outputVersionId:planner[0].id+':report'});
  return {kind:'sketch-image-original',...identity,outputVersionId:asset.id,sha256:asset.sha256,receiptHash:sketchHash(attempt.receipt),dependencies};
 }
 need(['producer','consumer','planner'].includes(job.nodeKey)&&['sketch_owner','sketch_plan'].includes(job.purpose),'SKETCH_ORIGINAL_KIND_UNSUPPORTED','Supported sketch text original required');
 validateSavedText(project,generation,job);
 need(equal(job.outputVersionIds,[job.id+':report']),'SKETCH_ORIGINAL_OUTPUT_CHANGED','Reducer-defined exact text report output required');
 const folder=join(executionRoot,attempt.id),output=join(folder,'sketch-report.json');
 need(resolve(job.report.payloadRef)===resolve(output),'SKETCH_RECEIPT_CHANGED','Managed report path changed');
 const bytes=await readManagedLayoutBytes(executionRoot,output);
 const packet=await readManagedLayoutBytes(executionRoot,join(folder,'packet.json'));
 const receipt=await readManagedLayoutBytes(executionRoot,join(folder,'receipt.json'));
 const request=sketchTextRequest(sketchTextInput(project,generation,job));
 if(isOrdinaryHttp(attempt.receipt))need(packet.equals(Buffer.from(JSON.stringify({runId:attempt.id,model:job.binding.model,...request})))&&receipt.equals(Buffer.from(JSON.stringify(attempt.receipt))),'SKETCH_RECEIPT_CHANGED','Exact HTTP packet and receipt wrapper bytes required');
 if(isOrdinaryHttp(attempt.receipt))await reopenOrdinary({executionRoot,binding:job.binding,attemptId:attempt.id,request,runtimePacketBytes:Buffer.from(JSON.stringify({runId:attempt.id,model:job.binding.model,...request})),receipt:attempt.receipt});
 need(equal(JSON.parse(receipt.toString('utf8')),job.report.receipt),'SKETCH_RECEIPT_CHANGED','Saved original text receipt changed');
 need(sketchHash(bytes.toString('utf8'))===job.report.hash&&equal(JSON.parse(bytes.toString('utf8')),job.report.raw)&&equal(JSON.parse(packet.toString('utf8')),{runId:attempt.id,model:job.binding.model,...sketchTextRequest(sketchTextInput(project,generation,job))}),'SKETCH_RECEIPT_CHANGED','Original managed owner report or request bytes changed');
 for(const [index,nodeKey] of (job.nodeKey==='planner'?['producer','consumer']:job.nodeKey==='consumer'?['producer']:[]).entries()) {
  const original=project.jobs.filter(item=>item.generationId===generation.id&&item.nodeKey===nodeKey);
  need(original.length===1&&original[0].status==='succeeded','SKETCH_ORIGINAL_MEMBERSHIP_REQUIRED','Exact upstream text original required');
  dependencies.push({kind:'sketch-text',...identity,index,originalJobId:original[0].id,outputVersionId:original[0].id+':report'});
 }
 return {kind:'sketch-text-original',...identity,nodeKey:job.nodeKey,outputVersionId:job.id+':report',reportHash:job.report.hash,receiptHash:sketchHash(attempt.receipt),dependencies};
}
