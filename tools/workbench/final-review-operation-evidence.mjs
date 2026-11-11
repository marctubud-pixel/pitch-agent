import {isDeepStrictEqual as equal} from 'node:util';
import {stat} from 'node:fs/promises';
import {assertOperationBasis} from './final-operation-basis.mjs';
import {compileOperationDuties,partitionOperationDuties,operationHash} from './final-operation-manifest.mjs';
import {createOperationOriginalReader,operationAdapterIdentity} from './final-operation-original.mjs';
import {finalOperationAuthorizationIdentity,finalReviewCallAccounting,finalReviewAllowance} from './final-review-authority.mjs';
export async function verifyFinalOperationEvidence({project,planning,basis,launchConfiguration,store,current}){
 const blockers=[],evidence=[],missing=[],invalid=code=>blockers.push({code});
 if(typeof current!=='function')throw Object.assign(Error('FINAL_OPERATION_FRESHNESS_GUARD_REQUIRED'),{code:'FINAL_OPERATION_FRESHNESS_GUARD_REQUIRED'});
 current();assertOperationBasis(basis);
 if(basis.projectId!==project.id||basis.sourceIdentity!==await operationAdapterIdentity()||basis.configurationIdentity!==operationHash(launchConfiguration))invalid('FINAL_OPERATION_BASIS_STALE');
 if(operationHash(planning.plan.calls)!==operationHash(basis.planning.plan.calls))invalid('FINAL_OPERATION_CALL_TABLE_CHANGED');
 const executable=await stat(basis.executable.path);if(!equal(basis.executable,{path:basis.executable.path,size:executable.size,mtimeMs:executable.mtimeMs,ino:executable.ino,version:null}))invalid('FINAL_OPERATION_EXECUTABLE_CHANGED');
 const rows=compileOperationDuties(basis,launchConfiguration),batches=partitionOperationDuties(rows,{captureIdentity:basis.identity}),readOriginal=createOperationOriginalReader({store,launchConfiguration});
 const accounting=finalReviewCallAccounting(project),allowance=finalReviewAllowance(project);
 if(accounting.unknown.length)invalid('FINAL_UNKNOWN_BLOCKS');if(!allowance||accounting.consumedCalls+accounting.reservedOtherCalls+accounting.ownHeldCalls>allowance.totalCalls)invalid('FINAL_CUMULATIVE_ALLOWANCE');
 for(const batch of batches){
  const context={finalOperation:{launchConfiguration,manifest:batch.manifest,basis}},authorizationId=finalOperationAuthorizationIdentity(project,context),authority=project.finalOperationAuthorizations?.find(a=>a.id===authorizationId);
  for(const row of batch.rows){const job=project.jobs.find(j=>j.purpose==='final_operation_observation'&&j.task.authorizationId===authorizationId&&j.task.requirementIdentity===row.requirement.identity);
   if(!authority||!job||job.status!=='succeeded'){missing.push(row.requirement.identity);continue;}
   try{const proof=await readOriginal(project.id,job.id,current);if(proof.outcome!=='succeeded'||proof.adapterSourceIdentity!==basis.sourceIdentity||proof.requirementIdentity!==row.requirement.identity||proof.duties?.captureIdentity!==basis.identity||proof.duties?.observedBranch!==row.shape.successKind||!equal(proof.executable,basis.executable))throw Object.assign(Error('FINAL_OPERATION_CURRENT_PROOF_CHANGED'),{code:'FINAL_OPERATION_CURRENT_PROOF_CHANGED'});evidence.push({dutyId:row.requirement.identity,callId:row.kind==='call'?row.shape.callId:null,batchSequence:batch.manifest.sequence,authorizationId,jobId:job.id,attemptId:proof.attemptId,proof});}catch(error){blockers.push({code:error.code??'FINAL_OPERATION_ORIGINAL_INVALID',jobId:job.id});}
  }
 }
 for(const job of project.jobs.filter(j=>j.purpose==='final_operation_observation'&&!evidence.some(e=>e.jobId===j.id))){try{await readOriginal(project.id,job.id,current);}catch(error){blockers.push({code:error.code??'FINAL_OPERATION_HISTORY_ORIGINAL_INVALID',jobId:job.id});}}
 if(missing.length)blockers.push({code:'FINAL_OPERATION_DUTIES_MISSING',missing});current();
 return {kind:blockers.length?(missing.length?'missing':'invalid'):'verified',requirements:rows.map(r=>r.requirement),blockers,evidence,missing,validationLevel:'fixed_host_originals',genuineVerified:blockers.length===0};
}
