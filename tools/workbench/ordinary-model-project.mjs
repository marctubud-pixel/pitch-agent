import {verifySplitProjectOriginals} from './readiness-split-runtime.mjs';
import {buildSemanticRequest} from './research-semantic-review.mjs';
import {buildResearchReaderRequest} from './research-reader-loop.mjs';
import {applyResearchMethod} from './research-method.mjs';
import {MODEL_VIEW_CONTENT_CONTRACT,planningContentPacket} from './content-contract-versions.mjs';
import {reopenContentPlanningOriginal} from './content-planning-original.mjs';
import {createHash} from 'node:crypto';
import {verifyReferenceOriginalDossiers} from './reference-original.mjs';
import {randomUUID} from 'node:crypto';
import {open,realpath} from 'node:fs/promises';
import {join,dirname,sep} from 'node:path';
import {isDeepStrictEqual as equal} from 'node:util';
import {isOrdinaryHttp,reopenOrdinary,ordinaryOriginMatches} from './ordinary-model.mjs';
import {readManagedLayoutBytes} from './managed-layout-bytes.mjs';
import {readArtifactContent} from './artifact-content.mjs';
import {buildOwnerRequest} from './owner-edge.mjs';
import {buildCorrectionReviewRequest} from './correction.mjs';
import {buildFeedbackReviewRequest} from './human-feedback.mjs';
import {buildCreativeRequest} from './creative-panel.mjs';
import {buildCaseIdentityRequest} from './case-identity.mjs';
import {buildImageObservationReviewRequest} from './image-observation-review.mjs';
import {buildImageObservationRequest,imageManifest} from './image-evidence.mjs';
import {buildResearchHandoffRequest} from './research-handoff.mjs';
import {buildResearchReadinessRequest} from './research-readiness.mjs';
import {buildEvidenceReviewRequest} from './evidence-review.mjs';
import {buildStageRequest} from './stage-content.mjs';
import {referenceRequest,referenceNodePlan,referenceNodeInput,referencePriorHistoryGaps} from './reference-dossier.mjs';
import {sketchTextRequest,sketchTextInput} from './sketch-authority.mjs';
import {buildReviewRequest} from './sketch-review-v2.mjs';
import {finalRequest} from './final-visual.mjs';
import {contentRequest} from './complete-content.mjs';
const need=value=>{if(!value)throw Object.assign(new Error('Frozen ordinary domain request changed'),{code:'ORDINARY_DOMAIN_CHANGED'});};

export async function ordinaryJobInput(project,job,attempt,{executionRoot}){
 let request,packet,imageRefs=[];
 if(job.purpose==='reference'){
  const dossier=project.referenceDossiers.find(d=>d.id===job.dossierId),node=referenceNodePlan(dossier,project).find(n=>n.key===job.nodeKey);need(node);request=referenceRequest(dossier,node,project);imageRefs=referenceNodeInput(dossier,node,project).images;
  packet=JSON.stringify({projectId:project.id,jobId:job.id,attemptId:attempt.id,...request,...(imageRefs.length?{images:imageRefs}:{})},null,2);
 }else if(['sketch_owner','sketch_plan'].includes(job.purpose)){
  const generation=project.sketchGenerations.find(g=>g.id===job.generationId);need(generation);request=sketchTextRequest(sketchTextInput(project,generation,job));
 }else if(job.reviewRunId){
  const run=project.sketchReviewRuns.find(r=>r.id===job.reviewRunId),node=run?.nodes.find(n=>n.key===job.nodeKey);need(node);request=buildReviewRequest(run,node,run.reports).request;
 }else if(job.finalVisualRunId){
  const run=project.finalVisualRuns.find(r=>r.id===job.finalVisualRunId);need(run&&job.purpose!=='final_visual_image');request=finalRequest(project,run,job.node).request;
 }else if(job.contentRootJobId){
  const root=project.jobs.find(j=>j.id===job.contentRootJobId);need(root);request=contentRequest(project,root,job.node).request;
 }else{
  const task=job.task;
  if(job.purpose==='research_reader')request=buildResearchReaderRequest(task.readerInput);
  else if(job.purpose==='owner_acceptance')request=buildOwnerRequest(task.ownerInput);
  else if(job.purpose==='correction_review')request=buildCorrectionReviewRequest(task.correctionReviewInput);
  else if(job.purpose==='feedback_review')request=buildFeedbackReviewRequest(task.feedbackReviewInput);
  else if(job.purpose==='creative_review')request=buildCreativeRequest(task.creativeInput);
  else if(job.purpose==='case_identity'){request=buildCaseIdentityRequest(task.caseIdentityInput);imageRefs=[task.caseIdentityInput.referenceImage,task.caseIdentityInput.sourceImage];}
  else if(job.purpose==='observation_review')request=buildImageObservationReviewRequest(task.observationReviewInput);
  else if(job.purpose==='observation')request=buildImageObservationRequest({images:task.observationInput.images});
  else if(job.purpose==='handoff')request=buildResearchHandoffRequest(task.handoffInput);
  else if(job.purpose==='coverage_challenge')request=buildSemanticRequest(task.semanticInput);
  else if(job.purpose==='readiness')request=buildResearchReadinessRequest(task.readinessInput);
  else if(job.purpose==='verification')request=buildEvidenceReviewRequest(task.verificationInput);
  else{
   need(!job.purpose||job.purpose==='stage');
   const inputArtifacts=[];
   for(const id of job.inputVersionIds){const artifact=project.artifacts.find(a=>a.id===id);if(!artifact)continue;const loaded=await readArtifactContent(project,id,executionRoot);inputArtifacts.push({id,stage:artifact.stage,content:loaded.content,...(task.upstreamReviewConstraints?.[id]?{reviewConstraints:task.upstreamReviewConstraints[id]}:{})});}
   request=buildStageRequest({stage:job.stage,brief:task.brief,inputArtifacts,sourceRecords:task.sourceRecords??[],visualCatalogue:task.visualCatalogue??[],revisionInput:task.revisionInput,correctionInput:task.correctionInput,copyContractVersion:task.copyContractVersion,strategyContractVersion:task.strategyContractVersion,strategyBasis:task.strategyBasis,researchContractVersion:task.researchContractVersion,researchDataBasis:task.researchDataBasis,researchRevision:task.researchRevision});
   if(job.stage==='research'&&task.researchMethod)request=applyResearchMethod(request,task.researchMethod,task.researchQuestionRegistration);
  }
  imageRefs=imageRefs.length?imageRefs:job.purpose==='observation'?task.observationInput.images:job.purpose==='observation_review'?task.observationReviewInput.images:job.purpose==='feedback_review'?task.feedbackReviewInput.revisionInput.materials:job.purpose==='correction_review'?task.correctionReviewInput.correctionInput.materials:(task.correctionInput??task.revisionInput)?.materials??[];
  packet=JSON.stringify({projectId:project.id,jobId:job.id,attemptId:attempt.id,inputVersionIds:job.inputVersionIds,sourceRecords:task.sourceRecords??[],...request},null,2);
 }
 packet??=JSON.stringify({runId:attempt.id,model:job.binding.model,...request});
 return {request,imageRefs:imageRefs.length?imageRefs:request.images??[],runtimePacketBytes:Buffer.from(packet)};
}
async function verifyRetainedDomainWrappers(project,job,attempt,receipt,executionRoot){
 const checkBytes=async(path,expected)=>need((await readManagedLayoutBytes(executionRoot,path,64*1024*1024)).equals(Buffer.from(expected)));
 if(receipt.validatedOutputPath!==undefined){
  const bytes=await readManagedLayoutBytes(executionRoot,receipt.validatedOutputPath,64*1024*1024);
  need(createHash('sha256').update(bytes).digest('hex')===receipt.validatedOutputHash,'Normalized ordinary wrapper changed');
 }
 if(job.generationId||job.reviewRunId||job.finalVisualRunId||job.contentRootJobId){
  await checkBytes(join(executionRoot,attempt.id,'receipt.json'),JSON.stringify(receipt));
  if(!['sketch_owner','sketch_plan'].includes(job.purpose))await checkBytes(join(executionRoot,attempt.id,'response.txt'),receipt.responseText);
 }
 if(job.report){need(equal(job.report.receipt,receipt));await checkBytes(job.report.payloadRef,JSON.stringify(JSON.parse(receipt.responseText)));}
 for(const descriptor of [attempt.referenceResult,attempt.referenceNormalized].filter(Boolean)){
  const bytes=await readManagedLayoutBytes(executionRoot,descriptor.path,64*1024*1024);
  need(bytes.length===descriptor.byteLength&&createHash('sha256').update(bytes).digest('hex')===descriptor.sha256,'Retained reference wrapper changed');
 }
}
export async function reopenOrdinaryJob(project,job,attempt,{executionRoot,receipt=attempt.receipt,attemptLocator,imageStore}={}){
 need(ordinaryOriginMatches(receipt,attempt.httpAttemptLocator,attempt.id),'Retained receipt changed persisted HTTP origin');
 if(attemptLocator!==undefined)need(equal(attemptLocator,attempt.httpAttemptLocator),'Recovery locator changed persisted HTTP origin');
 if(job.contentRootJobId){const root=project.jobs.find(j=>j.id===job.contentRootJobId);if(planningContentPacket(root?.task.packetVersion))await reopenContentPlanningOriginal(project,root,{executionRoot});}
 const input=await ordinaryJobInput(project,job,{...attempt,receipt},{executionRoot});
 const disk=await readManagedLayoutBytes(executionRoot,join(executionRoot,attempt.id,'packet.json'),64*1024*1024);need(disk.equals(input.runtimePacketBytes));
 const images=receipt?.images??[];if(receipt)need(equal(images.length?imageManifest(images,input.request.imageEnvelope):[],input.imageRefs.length?imageManifest(input.imageRefs,input.request.imageEnvelope):[]));if(!receipt&&input.imageRefs.length){need(imageStore);for(const image of input.imageRefs)images.push((await imageStore.read({projectId:project.id,imageId:image.imageId,expectedHash:image.sha256})).descriptor);}
 const result=await reopenOrdinary({executionRoot,binding:job.binding,attemptId:attempt.id,...input,images,...(receipt?{receipt}:{attemptLocator})});
 if(receipt)await verifyRetainedDomainWrappers(project,job,attempt,receipt,executionRoot);
 return result;
}
async function verifyOrdinaryProjectWithin(project,{executionRoot,referenceFacts=[]}){
 await verifySplitProjectOriginals(project,{executionRoot});
 const coveredReferenceAttempts=new Set();
 for(const {reports} of referenceFacts)for(const {attempt,job} of reports)if(isOrdinaryHttp(attempt.receipt))coveredReferenceAttempts.add(`${job.id}\0${attempt.id}`);
 for(const job of project.jobs)for(const attempt of job.attempts??[]){need(ordinaryOriginMatches(attempt.receipt,attempt.httpAttemptLocator,attempt.id),'Retained attempt changed persisted HTTP origin');if(isOrdinaryHttp(attempt.receipt)&&!coveredReferenceAttempts.has(`${job.id}\0${attempt.id}`))await reopenOrdinaryJob(project,job,attempt,{executionRoot});}
 for(const resolution of project.readinessResolutions??[])if(resolution.kind==='recovered-result'&&isOrdinaryHttp(resolution.proof?.executionReceipt)){
  const job=project.jobs.find(j=>j.id===resolution.jobId),attempt=job?.attempts.find(a=>a.id===resolution.attemptId);need(attempt);await reopenOrdinaryJob(project,job,attempt,{executionRoot,receipt:resolution.proof.executionReceipt});
 }
}

export async function verifyOrdinaryProject(project,{executionRoot}){return verifyOrdinaryProjectWithin(project,{executionRoot});}
export async function verifyOrdinaryReferenceProject(project,dossier,{executionRoot,imageStore}){
 need(!referencePriorHistoryGaps(project,dossier).length,'Original reference history is unresolved');
 const dossiers=[],visited=new Set(),active=new Set();
 function visit(d){
  need(d&&!active.has(d.id),'Reference history contains a missing dossier or cycle');
  if(visited.has(d.id))return;
  active.add(d.id);
  for(const anchor of d.priorChoiceHistory??[])visit(project.referenceDossiers.find(prior=>prior.id===anchor.dossierId));
  active.delete(d.id);visited.add(d.id);dossiers.push(d);
 }
 visit(dossier);
 await verifyReferenceOriginalDossiers(project,dossiers,{executionRoot,imageStore},async referenceFacts=>{
  for(const {dossier:d,reports} of referenceFacts)for(const {attempt,job} of reports){
   need(job.purpose==='reference'&&job.dossierId===d.id&&attempt.status==='succeeded'&&project.jobs.filter(j=>j.id===job.id).length===1&&project.jobs.flatMap(j=>j.attempts??[]).filter(a=>a.id===attempt.id).length===1);
  }
  await verifyOrdinaryProjectWithin(project,{executionRoot,referenceFacts});
 });
}

export function ordinaryDomainReceipt(job,result){
 if(job.purpose==='reference'||!job.generationId&&!job.reviewRunId&&!job.finalVisualRunId&&!job.contentRootJobId)return {...result,providerId:job.binding.providerId,model:job.binding.model,role:job.binding.role,taskId:job.purpose==='reference'?job.id:job.task.id};
 return result;
}

async function retainedText(root,path,bytes){
 need(await realpath(root)===root&&await realpath(dirname(path))===dirname(path)&&path.startsWith(root+sep));
 try{const file=await open(path,'wx',0o400);try{await file.writeFile(bytes);await file.sync();}finally{await file.close();}}
 catch(error){if(error.code!=='EEXIST')throw error;need((await readManagedLayoutBytes(root,path,64*1024*1024)).equals(Buffer.from(bytes)));}
}
export async function restoreOrdinaryJob(store,executionRoot,projectId,jobId,{imageStore}={}){
 let project=store.read(projectId),job=project.jobs.find(j=>j.id===jobId),attempt=job?.attempts.at(-1);need(attempt);
 need(ordinaryOriginMatches(attempt.receipt,attempt.httpAttemptLocator,attempt.id),'Retained receipt changed persisted HTTP origin');
 if(attempt.receipt){if(isOrdinaryHttp(attempt.receipt))await reopenOrdinaryJob(project,job,attempt,{executionRoot});return attempt.receipt;}
 need(['running','awaiting_reconciliation'].includes(job.status)&&attempt.httpAttemptLocator);
 const result=await reopenOrdinaryJob(project,job,attempt,{executionRoot,attemptLocator:attempt.httpAttemptLocator,imageStore}),receipt=ordinaryDomainReceipt(job,result);
 if(job.generationId||job.reviewRunId||job.finalVisualRunId||job.contentRootJobId){
  await retainedText(executionRoot,join(executionRoot,attempt.id,'receipt.json'),JSON.stringify(receipt));
  if(!['sketch_owner','sketch_plan'].includes(job.purpose))await retainedText(executionRoot,join(executionRoot,attempt.id,'response.txt'),receipt.responseText);
 }
 project=store.read(projectId);
 store.command(projectId,{kind:'restore-ordinary-http-attempt',jobId,attemptId:attempt.id,receipt,commandId:`restore-http-${attempt.id}`,expectedRevision:project.revision},{actorType:'agent',actorId:'ordinary-http-original-restorer',runId:randomUUID(),contextId:randomUUID()});
 return receipt;
}

export async function reopenOrdinaryCompletion(project,job,attempt,{executionRoot,receipt,wrappers=[],imageStore}){
 if(!isOrdinaryHttp(receipt))return;
 if(job.purpose==='reference')await verifyOrdinaryReferenceProject(project,project.referenceDossiers.find(d=>d.id===job.dossierId),{executionRoot,imageStore});
 else await verifyOrdinaryProject(project,{executionRoot});
 for(const [path,expected] of wrappers){const bytes=await readManagedLayoutBytes(executionRoot,path,64*1024*1024);need(bytes.equals(Buffer.from(expected)));}
 await reopenOrdinaryJob(project,job,attempt,{executionRoot,receipt});
}
