import {currentCapturedTextSources} from './captured-text-evidence.mjs';
import {join} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {readManagedCapture} from './source-capture-store.mjs';
import {isOrdinaryHttp} from './ordinary-model.mjs';
import {readStageInvocationOriginal} from './stage-original.mjs';
import {evidenceRecords,evidenceVisualRecords} from './correction-evidence.mjs';

const fail=message=>{throw Object.assign(new Error(message),{code:'INVALID_CORRECTION_ORIGINAL'});};
export async function verifyRegisteredCorrectionOriginals(project,job,{executionRoot,imageStore}){
 const evidence=job.task?.correctionInput?.evidence;
 const records=evidence?evidenceRecords(evidence):(job.task?.sourceRecords??[]);
 const registered=['correction-evidence-v2','correction-evidence-v3'].includes(evidence?.version);
 if(!registered&&!records.some(s=>s.managedCapture))return;
 currentCapturedTextSources(project,records);
 for(const source of records.filter(s=>s.managedCapture)){const capture=project.sourceCaptures.find(c=>c.id===source.managedCapture.captureId);await readManagedCapture(join(executionRoot,'source-captures'),capture);}
 if(!registered)return;
 const checkedJobs=new Set(),checkedImages=new Set(),checkedCaptures=new Set();
 const image=async(id,sha256)=>{const key=id+'\0'+sha256;if(checkedImages.has(key))return;checkedImages.add(key);await imageStore.read({projectId:project.id,imageId:id,expectedHash:sha256});};
 const original=async report=>{
  if(!report)fail('Registered evidence report missing');if(checkedJobs.has(report.jobId))return;checkedJobs.add(report.jobId);
  const producer=project.jobs.find(j=>j.id===report.jobId),attempt=producer?.attempts.find(a=>a.id===report.attemptId);if(!producer||!attempt)fail('Registered evidence execution missing');
  if(attempt.receipt?.provider!=='codex-cli'&&!isOrdinaryHttp(attempt.receipt))fail('Registered evidence original adapter unavailable');
  await readStageInvocationOriginal(project,producer,attempt,{executionRoot});
 };
 for(const entry of evidenceVisualRecords(evidence)){
  await image(entry.imageId,entry.imageSha256);
  const observation=project.imageObservations.find(r=>r.id===entry.observationId);await original(observation);
  const reviews=project.observationReviews.filter(r=>{const j=project.jobs.find(j=>j.id===r.jobId&&j.purpose==='observation_review'),a=j?.attempts.find(a=>a.id===r.attemptId);return r.observationId===observation.id&&isDeepStrictEqual(r.taskCard,observation.taskCard)&&j?.status==='succeeded'&&a?.status==='succeeded'&&j.outputVersionIds?.includes(r.id)&&r.executionReceipt?.exitCode===0&&isDeepStrictEqual(a.receipt,r.executionReceipt);});
  if(!reviews.some(r=>r.id===entry.reviewId))fail('Registered visual review missing');for(const review of reviews)await original(review);
 }
 for(const record of evidenceRecords(evidence).filter(r=>r.identityStatus!==undefined||r.caseIdentity!==undefined)){
  const report=project.caseIdentityReviews.find(r=>r.caseEvidence?.id===record.id);await original(report);
  const producer=project.jobs.find(j=>j.id===report.jobId),input=producer.task.caseIdentityInput;
  for(const capture of [input.pageCapture,input.sourceImageCapture]){if(!checkedCaptures.has(capture.recordHash)){checkedCaptures.add(capture.recordHash);await readManagedCapture(join(executionRoot,'source-captures'),capture);}}
  for(const descriptor of [input.referenceImage,input.sourceImage])await image(descriptor.imageId,descriptor.sha256);
 }
}
