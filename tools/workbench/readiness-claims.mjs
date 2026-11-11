import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {ordinarySuccess,isOrdinaryHttp,validOrdinaryHttpLocator,ordinaryOriginMatches} from './ordinary-model-claims.mjs';
import {buildResearchReadinessRequest,validateResearchReadinessOutput} from './research-readiness.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
function successful(receipt){return receipt?.exitCode===0&&['signal','reason','error'].every(k=>receipt[k]==null);}
function check(value,message){if(!value)throw Object.assign(new Error(message),{code:'INVALID_READINESS_EVIDENCE'});}
export function savedReadinessReceipt(attempt,proof){
 if(proof?.kind!=='saved-readiness-http-v1')return attempt.receipt;
 const receipt=attempt.receipt??proof.executionReceipt;
 check(ordinarySuccess(receipt)&&isOrdinaryHttp(receipt),'Exact saved HTTP success claim required');
 check(isDeepStrictEqual(receipt,proof.executionReceipt)&&proof.originalReceiptHash===hash(JSON.stringify(attempt.receipt??null)),'Retained original receipt changed');
 check(validOrdinaryHttpLocator(attempt.httpAttemptLocator,attempt.id)&&ordinaryOriginMatches(receipt,attempt.httpAttemptLocator,attempt.id)&&isDeepStrictEqual(attempt.httpAttemptLocator,proof.attemptLocator),'Exact persisted recovery locator required');
 return receipt;
}
function validateHttpProof(projectId,job,attempt,proof){
 const receipt=savedReadinessReceipt(attempt,proof),request=buildResearchReadinessRequest(job.task.readinessInput);
 check(job.task.readinessInput.reviewProtocolVersion==='research-readiness-v2','Exact readiness domain required');
 check(receipt.attemptId===attempt.id&&receipt.runId===attempt.id&&receipt.requestedModel===job.binding.model&&receipt.providerId===job.binding.providerId&&receipt.model===job.binding.model&&receipt.role===job.binding.role&&receipt.taskId===job.task.id,'Frozen HTTP domain binding required');
 const inputText=JSON.stringify({runId:attempt.id,model:job.binding.model,prompt:request.prompt,...(request.outputSchema===undefined?{}:{outputSchema:request.outputSchema})});
 const packetText=JSON.stringify({projectId,jobId:job.id,attemptId:attempt.id,inputVersionIds:job.inputVersionIds,sourceRecords:job.task.sourceRecords??[],...request},null,2);
 check(proof.inputText===inputText&&receipt.inputPacketHash===hash(inputText)&&proof.packetText===packetText&&receipt.runtimePacketHash===hash(packetText),'Exact reconstructed logical and runtime HTTP bytes required');
 check(proof.responseText===receipt.responseText&&proof.rawResponseHash===hash(receipt.responseText),'Exact saved response required');
 const raw=JSON.parse(proof.responseText),normalized=validateResearchReadinessOutput(raw,job.task.readinessInput);
 check(proof.normalizedReportHash===hash(JSON.stringify(normalized,null,2)),'Exact normalized HTTP readiness required');
 return {raw,normalized};
}
export function validateSavedReadinessProof(projectId,job,attempt,proof){
 if(proof?.kind==='saved-readiness-http-v1')return validateHttpProof(projectId,job,attempt,proof);
 const receipt=attempt.receipt,request=buildResearchReadinessRequest(job.task.readinessInput);
 check(proof?.kind==='saved-readiness-v2'&&job.task.readinessInput.reviewProtocolVersion==='research-readiness-v2','Exact V2 evidence required');
 check(successful(receipt)&&successful(receipt.providerExecution),'Successful original saved invocation required');
 check(Object.entries(receipt.providerExecution).every(([k,v])=>isDeepStrictEqual(v,receipt[k])),'Original provider receipt changed');
 check(proof.originalReceiptHash===hash(JSON.stringify(receipt)),'Original receipt changed');
 const inputText=JSON.stringify({runId:attempt.id,model:job.binding.model,prompt:request.prompt,outputSchema:request.outputSchema});
 check(proof.schemaText===JSON.stringify(request.outputSchema),'Exact canonical schema bytes required');
 check(proof.inputText===inputText&&hash(inputText)===receipt.inputPacketHash,'Exact provider input bytes required');
 check(proof.packetText===JSON.stringify({projectId,jobId:job.id,attemptId:attempt.id,inputVersionIds:job.inputVersionIds,sourceRecords:job.task.sourceRecords??[],...request},null,2),'Original execution packet bytes changed');
 const {responseText,parsedOutput,schemaValidated,...disk}=receipt.providerExecution??{};
 check(receipt.provider==='codex-cli'&&proof.receiptText===JSON.stringify(disk,null,2),'Original disk receipt changed');
 check(['runId','threadId','inputPacketHash','requestedModel'].every(k=>disk[k]===receipt[k])&&disk.runId===attempt.id&&disk.requestedModel===job.binding.model&&disk.model===job.binding.model&&disk.providerRequestId===disk.threadId&&receipt.providerRequestId===disk.providerRequestId&&typeof disk.threadId==='string'&&disk.threadId.length>0,'Original request identity required');
 const events=proof.stdoutText.split('\n').filter(x=>x.trim()).map(x=>JSON.parse(x));
 const threads=events.filter(x=>x.type==='thread.started'),completed=events.filter(x=>x.type==='turn.completed');
 check(threads.length===1&&threads[0].thread_id===receipt.threadId&&completed.length===1&&events.indexOf(threads[0])<events.indexOf(completed[0])&&!events.some(x=>['error','turn.failed'].includes(x.type)),'Exact completed provider thread required');
 const messages=events.filter(x=>x.type==='item.completed'&&x.item?.type==='agent_message');
 check(messages.length===1&&messages[0].item.text===proof.responseText&&events.indexOf(messages[0])>events.indexOf(threads[0])&&events.indexOf(messages[0])<events.indexOf(completed[0]),'Completed assistant bytes must equal saved output');
 if(receipt.responseText!==undefined)check(receipt.responseText===proof.responseText,'Original response bytes changed');
 check(proof.rawResponseHash===hash(proof.responseText),'Raw response byte hash changed');
 const raw=JSON.parse(proof.responseText);
 if(parsedOutput!==undefined)check(isDeepStrictEqual(parsedOutput,raw),'Original parsed response changed');
 const normalized=validateResearchReadinessOutput(raw,job.task.readinessInput);
 check(proof.normalizedReportHash===hash(JSON.stringify(normalized,null,2)),'Normalized report changed');
 check(isDeepStrictEqual(proof.paths,receipt.paths),'Registered evidence paths changed');
 return {raw,normalized};
}
