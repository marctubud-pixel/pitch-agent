import {isFinalCodexProtocol} from './final-review-codex-original.mjs';
import {join,resolve} from 'node:path';
import {readManagedLayoutBytes} from './managed-layout-bytes.mjs';
import {FINAL_CALL_LIMITS,finalCallHash,validateFinalCallOriginal,finalCallOriginalFileSpec} from './final-review-call.mjs';
import {FINAL_CODEX_PROTOCOL,FINAL_CODEX_FILES,finalCodexExecutionSpec,decodeCodexJSON,finalCodexAttachmentReads} from './final-review-codex-original.mjs';
const need=(v,code)=>{if(!v)throw Object.assign(Error(code),{code});};
async function readOriginals(executionRoot,attemptId,stage,pin,providerRoot){
  need(typeof attemptId==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(attemptId),'FINAL_ATTEMPT_PATH_INVALID');
  let codex=isFinalCodexProtocol(pin?.adapterProtocol);
  const originals={};
  const read=async(name,spec)=>{originals[name]=await readManagedLayoutBytes(executionRoot,join(executionRoot,attemptId,spec.suffix),spec.limit);};
  if(stage==='mark'){
    for(const name of ['input','plan','packet'])await read(name,{suffix:`${name}.json`,limit:FINAL_CALL_LIMITS[name]});
    for(const name of ['providerRequest','providerSchema']){try{await read(name,finalCodexExecutionSpec('mark')[name]);}catch(error){if(error.code!=='ENOENT')throw error;}}
    codex=Object.hasOwn(originals,'providerRequest')||Object.hasOwn(originals,'providerSchema');
    if(codex)need(Object.hasOwn(originals,'providerRequest')&&Object.hasOwn(originals,'providerSchema'),'FINAL_REQUEST_CHANGED');
  }else if(codex){for(const [name,spec] of Object.entries(finalCallOriginalFileSpec(pin,stage)))await read(name,spec);}
  else{for(const name of stage==='reconcile'?['receipt','events']:Object.keys(FINAL_CALL_LIMITS))await read(name,{suffix:`${name}.json`,limit:FINAL_CALL_LIMITS[name]});}
  if(codex&&stage!=='mark'){
    need(typeof providerRoot==='string','FINAL_PROVIDER_ROOT_REQUIRED');originals.providerRoot=resolve(providerRoot);originals.codex={};
    const sidecar=decodeCodexJSON(originals.providerOriginals,1024**2);
    need(sidecar?.protocol==='final-codex-originals-v1'&&sidecar.files&&Object.keys(sidecar.files).length===Object.keys(FINAL_CODEX_FILES).length,'FINAL_CODEX_ORIGINAL_INVALID');
    for(const [name,spec] of Object.entries(FINAL_CODEX_FILES)){
      const ref=sidecar.files[name];if(name==='output'&&ref===null){originals.codex.output=null;continue;}
      need(ref&&typeof ref.relativePath==='string'&&/^run-[A-Za-z0-9_-]+\//.test(ref.relativePath)&&ref.relativePath.split('/').length===2&&ref.relativePath.split('/')[1]===spec.suffix,'FINAL_CODEX_ORIGINAL_INVALID');
      originals.codex[name]=await readManagedLayoutBytes(providerRoot,join(providerRoot,ref.relativePath),spec.limit);
    }
    const run=sidecar.files.input.relativePath.split('/')[0];
    need(Object.values(sidecar.files).every(ref=>ref===null||ref.relativePath.split('/')[0]===run),'FINAL_CODEX_ORIGINAL_INVALID');
    const attachments=finalCodexAttachmentReads({packetText:originals.packet,adapterProtocol:pin.adapterProtocol,providerRoot:resolve(providerRoot),run,receiptBytes:originals.codex.receipt});
    originals.codex.images=[];
    for(const a of attachments)originals.codex.images.push(await readManagedLayoutBytes(providerRoot,a.path,a.byteLength));
  }
  if(!codex)for(const [name,bytes] of Object.entries(originals)){try{originals[name]=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{need(false,'FINAL_INVALID_JSON');}}
  return originals;
}
export async function verifyFinalCallOriginal(project,job,{executionRoot,providerRoot}) {
  const originals=await readOriginals(executionRoot,job.attempts[0].id,'settle',job.task.originalRequest,providerRoot);
  const result=validateFinalCallOriginal(project,job,originals);
  need(job.finalCallResult?.id===result.id,'FINAL_RESULT_CONFLICT');return result;
}
export function createFinalCallSettlement({store,executionRoot,providerRoot}) {
  async function command(projectId,intent,context,kind,stage){
    const before=store.read(projectId),guard=finalCallHash(before);need(intent.expectedRevision===before.revision,'REVISION_CONFLICT');
    const jobs=before.jobs.filter(j=>j.task?.reservationId===intent.reservationId&&j.task?.id===(intent.callId??'owner:layoutProducer'));
    need(stage==='mark'||jobs.length===1,'FINAL_CALL_REQUIRED');
    const originals=await readOriginals(executionRoot,intent.attemptId,stage,jobs[0]?.task.originalRequest,providerRoot);
    need(finalCallHash(store.read(projectId))===guard,'REVISION_CONFLICT');
    return store.command(projectId,{...intent,kind,callId:intent.callId??'owner:layoutProducer',originals},context);
  }
  const mark=(id,intent,context)=>command(id,intent,context,'mark-final-review-dispatched','mark');
  const settle=(id,intent,context)=>command(id,intent,context,'settle-final-review-call','settle');
  return {markCallDispatched:mark,settleCall:settle,markLayoutProducerDispatched:mark,settleLayoutProducer:settle,reconcileCall:(id,intent,context)=>command(id,intent,context,'reconcile-final-review-call','reconcile')};
}
