import {ordinaryOriginMatches} from './ordinary-model-claims.mjs';
import {reopenOrdinaryCompletion} from './ordinary-model-project.mjs';
import {isOrdinaryHttp} from './ordinary-model-claims.mjs';
import {reopenOrdinaryJob,ordinaryDomainReceipt} from './ordinary-model-project.mjs';
import {verifyResearchAcquisitionOriginal} from './research-acquisition-original.mjs';
import {createHash,randomUUID} from 'node:crypto';
import {open,mkdir,realpath,writeFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join,sep} from 'node:path';
import {DomainError} from './project.mjs';
import {validateStageOutput} from './stage-content.mjs';
import {readStageInvocationOriginal} from './stage-original.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const fail=message=>{throw new DomainError('INVALID_RECONCILIATION',message);};
async function readManaged(root,path){
 const base=await realpath(root),file=await realpath(path);
 if(!file.startsWith(base+sep))fail('Receipt file outside execution storage');
 const handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
 try {
  const stat=await handle.stat();
  if(!stat.isFile()||stat.size>8*1024*1024)fail('Invalid receipt file');
  return await handle.readFile('utf8');
 }finally{await handle.close();}
}
export async function reconcileStage({store,root,projectId,jobId,commandId,expectedRevision,reason}){
 if(typeof commandId!=='string'||!commandId.trim()||typeof reason!=='string'||!reason.trim())fail('Recovery ID and reason required');
 let project=store.read(projectId);const id=`recovery-${hash(JSON.stringify([projectId,commandId]))}`;
 const existing=project.reconciliations?.find(r=>r.id===id);
 if(existing){
  if(existing.jobId!==jobId||existing.reason!==reason)throw new DomainError('COMMAND_ID_REUSED','Recovery ID reused for another request');
  const job=project.jobs.find(j=>j.id===jobId),attempt=job?.attempts.at(-1);if(!ordinaryOriginMatches(attempt?.receipt,attempt?.httpAttemptLocator,attempt?.id))fail('Retained stage origin changed');if(isOrdinaryHttp(attempt?.receipt))await readStageInvocationOriginal(project,job,attempt,{executionRoot:root});
  return job;
 }
 if(project.revision!==expectedRevision)throw new DomainError('REVISION_CONFLICT','Project changed before recovery');
 let job=project.jobs.find(j=>j.id===jobId),attempt=job?.attempts?.at(-1),receipt=attempt?.receipt;
 if(job?.status==='awaiting_reconciliation'&&!receipt&&attempt.httpAttemptLocator){
  const result=await reopenOrdinaryJob(project,job,attempt,{executionRoot:root,attemptLocator:attempt.httpAttemptLocator});
  receipt=ordinaryDomainReceipt(job,result);
  store.command(projectId,{kind:'restore-ordinary-http-attempt',jobId,attemptId:attempt.id,receipt,commandId:`restore-${attempt.id}`,expectedRevision:project.revision},{actorType:'agent',actorId:'http-original-restorer',runId:randomUUID(),contextId:randomUUID()});
  project=store.read(projectId);expectedRevision=project.revision;job=project.jobs.find(j=>j.id===jobId);attempt=job.attempts.at(-1);
 }
 if(job?.status!=='awaiting_reconciliation'||['verification','coverage_challenge'].includes(job.purpose)||(attempt?.error?.code!=='INVALID_STAGE_OUTPUT'&&!isOrdinaryHttp(receipt))||!receipt?.responseText)fail('No successful saved stage response to reconcile');
 if(job.task.researchDataBasis?.acquisition)await verifyResearchAcquisitionOriginal(project,job.task.researchDataBasis.acquisition,{executionRoot:root,historical:false});
 let outputText;
 try{({outputText}=await readStageInvocationOriginal(project,job,attempt,{executionRoot:root}));}catch(error){fail(error.message);}
 const output=validateStageOutput(job.stage,JSON.parse(outputText),{sourceRecords:job.task.sourceRecords??[],visualCatalogue:job.task.visualCatalogue??[],revisionInput:job.task.revisionInput,correctionInput:job.task.correctionInput,copyContractVersion:job.task.copyContractVersion,strategyContractVersion:job.task.strategyContractVersion,strategyBasis:job.task.strategyBasis,researchContractVersion:job.task.researchContractVersion,researchDataBasis:job.task.researchDataBasis,researchRevision:job.task.researchRevision});
 const raw=JSON.stringify(output.content,null,2),folder=join(root,id),file=join(folder,'output.json');
 await mkdir(folder,{recursive:true});
 if(!(await realpath(folder)).startsWith((await realpath(root))+sep))fail('Recovery directory outside execution storage');
 try{await writeFile(file,raw,{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;if(await readManaged(root,file)!==raw)fail('Recovery output differs from existing file');}
 const context={actorId:'result-reconciler',actorType:'agent',runId:randomUUID(),contextId:randomUUID(),now:new Date().toISOString()};
 await reopenOrdinaryCompletion(project,job,attempt,{executionRoot:root,receipt,wrappers:[[file,raw]]});
 store.command(projectId,{kind:'reconcile-stage',jobId,attemptId:attempt.id,artifactId:`artifact-${id}`,reconciliationId:id,payloadRef:file,contentHash:hash(raw),receiptHash:hash(JSON.stringify(receipt)),reason,validatorVersion:'stage-content-conservative-scope-v1',commandId,expectedRevision},context);
 return store.read(projectId).jobs.find(j=>j.id===jobId);
}
