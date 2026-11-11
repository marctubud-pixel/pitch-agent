import {readManagedLayoutBytes} from './managed-layout-bytes.mjs';
import {ordinaryOriginMatches} from './ordinary-model-claims.mjs';
import {reopenOrdinary,isOrdinaryHttp,ordinarySuccess,ordinaryLogicalBytes,validOrdinaryHttpLocator} from './ordinary-model.mjs';
import {createHash} from 'node:crypto';
import {open,realpath,mkdir,writeFile,lstat} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join,sep} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {buildResearchReadinessRequest,validateResearchReadinessOutput} from './research-readiness.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
function successful(receipt){return receipt?.exitCode===0&&['signal','reason','error'].every(k=>receipt[k]==null);}
function check(value,message){if(!value)throw Object.assign(new Error(message),{code:'INVALID_READINESS_EVIDENCE'});}
export {savedReadinessReceipt,validateSavedReadinessProof} from './readiness-claims.mjs';
import {savedReadinessReceipt,validateSavedReadinessProof} from './readiness-claims.mjs';
async function managed(root,path){
 const base=await realpath(root),file=await realpath(path);check(file.startsWith(base+sep),'Evidence outside execution storage');
 const fd=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const stat=await fd.stat();check(stat.isFile()&&stat.size<=8*1024*1024,'Invalid evidence file');return new TextDecoder('utf-8',{fatal:true}).decode(await fd.readFile());}finally{await fd.close();}
}
export async function loadSavedReadinessProof(root,projectId,job,attempt){
 let receipt=attempt.receipt;
 check(ordinaryOriginMatches(receipt,attempt.httpAttemptLocator,attempt.id),'Retained readiness result changed persisted HTTP origin');
 if(isOrdinaryHttp(receipt)||!receipt&&attempt.httpAttemptLocator){
  const request=buildResearchReadinessRequest(job.task.readinessInput),packetText=JSON.stringify({projectId,jobId:job.id,attemptId:attempt.id,inputVersionIds:job.inputVersionIds,sourceRecords:job.task.sourceRecords??[],...request},null,2);
  check(validOrdinaryHttpLocator(attempt.httpAttemptLocator,attempt.id),'Exact persisted HTTP locator required');
  if(!receipt){try{await lstat(join(root,'ordinary-model-http',attempt.httpAttemptLocator.rootRelativePath,'manifest.json'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
  const reopened=await reopenOrdinary({executionRoot:root,binding:job.binding,attemptId:attempt.id,request,runtimePacketBytes:Buffer.from(packetText),...(receipt?{receipt}:{attemptLocator:attempt.httpAttemptLocator})});
  receipt=receipt??{...reopened,providerId:job.binding.providerId,model:job.binding.model,role:job.binding.role,taskId:job.task.id,attemptId:attempt.id};
  check((await readManagedLayoutBytes(root,join(root,attempt.id,'packet.json'))).toString('utf8')===packetText,'Runtime packet changed');
  const normalized=validateResearchReadinessOutput(JSON.parse(receipt.responseText),job.task.readinessInput);
  const proof={kind:'saved-readiness-http-v1',originalReceiptHash:hash(JSON.stringify(attempt.receipt??null)),attemptLocator:structuredClone(attempt.httpAttemptLocator),executionReceipt:structuredClone(receipt),inputText:ordinaryLogicalBytes({binding:job.binding,attemptId:attempt.id,request}).toString('utf8'),packetText,responseText:receipt.responseText,rawResponseHash:hash(receipt.responseText),normalizedReportHash:hash(JSON.stringify(normalized,null,2))};
  validateSavedReadinessProof(projectId,job,attempt,proof);return proof;
 }
 if(receipt?.provider!=='codex-cli'||!receipt.paths||!successful(receipt)||!successful(receipt.providerExecution))return null;
 let output,stdout;
 try{output=await managed(root,receipt.paths.output);stdout=await managed(root,receipt.paths.stdout);}catch(error){if(error.code==='ENOENT')return null;throw error;}
 const events=stdout.split('\n').filter(x=>x.trim()).map(x=>JSON.parse(x));
 if(!events.some(x=>x.type==='turn.completed'))return null;
 const normalized=validateResearchReadinessOutput(JSON.parse(output),job.task.readinessInput);
 const proof={kind:'saved-readiness-v2',originalReceiptHash:hash(JSON.stringify(receipt)),paths:structuredClone(receipt.paths),inputText:await managed(root,receipt.paths.input),schemaText:await managed(root,receipt.paths.schema),packetText:await managed(root,join(root,attempt.id,'packet.json')),receiptText:await managed(root,receipt.paths.receipt),stdoutText:stdout,responseText:output,rawResponseHash:hash(output),normalizedReportHash:hash(JSON.stringify(normalized,null,2))};
 validateSavedReadinessProof(projectId,job,attempt,proof);return proof;
}
export async function persistRecoveredReadiness(root,id,normalized){
 const folder=join(root,id),file=join(folder,'readiness.json'),raw=JSON.stringify(normalized,null,2);
 await mkdir(folder,{recursive:true});check((await realpath(folder)).startsWith((await realpath(root))+sep),'Recovery storage escaped');
 try{await writeFile(file,raw,{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;check(await managed(root,file)===raw,'Recovery bytes changed');}
 return file;
}
