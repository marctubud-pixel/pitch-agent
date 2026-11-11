import {join} from 'node:path';
import {isDeepStrictEqual as equal} from 'node:util';
import {createModelHttpAuthority} from './model-http-authority.mjs';
import {imageManifest} from './image-evidence.mjs';

const need=(value,message)=>{if(!value)throw Object.assign(new Error(message),{code:'ORDINARY_ORIGINAL_INVALID'});};
export * from './ordinary-model-claims.mjs';
import {ORDINARY_HTTP_PROVIDER,isOrdinaryHttp,ordinaryHttpLocator,validOrdinaryHttpLocator,ordinarySuccess,ordinaryOriginMatches} from './ordinary-model-claims.mjs';
export function ordinaryLogicalBytes({attemptId,binding,request,images=[]}){
 const manifest=images.length?imageManifest(images,request.imageEnvelope):[];
 return Buffer.from(JSON.stringify({runId:attemptId,model:binding.model,prompt:request.prompt,...(request.outputSchema===undefined?{}:{outputSchema:request.outputSchema}),...(manifest.length?{images:manifest}:{}),...(request.imageEnvelope?{imageEnvelope:request.imageEnvelope}:{})}));
}
function callInput(call){
 const {attemptId,binding,request,images=[],runtimePacketBytes,timeoutMs,signal}=call;
 need(runtimePacketBytes instanceof Uint8Array,'Domain-owned exact runtime packet bytes required');
 return {attemptId,binding,request:{runId:attemptId,prompt:request.prompt,...(request.outputSchema===undefined?{}:{outputSchema:request.outputSchema}),...(request.imageEnvelope?{imageEnvelope:request.imageEnvelope}:{})},images,logicalInputBytes:ordinaryLogicalBytes(call),runtimePacketBytes,...(timeoutMs===undefined?{}:{timeoutMs}),...(signal===undefined?{}:{signal})};
}
function domainResult(saved,call){return {...saved,providerExecution:structuredClone(saved),model:call.binding.model,...(call.images?.length?{images:structuredClone(call.images)}:{})};}
export async function invokeOrdinary(call){
 const {provider,binding,attemptId,request,images=[],maxOutputBytes}=call;
 need(provider&&provider.model===binding.model,'Configured provider must match frozen binding');
 if(provider.adapter!==ORDINARY_HTTP_PROVIDER){const value=await provider.execute({runId:attemptId,...request,...(images.length?{images}:{}),...(call.timeoutMs===undefined?{}:{timeoutMs:call.timeoutMs}),...(maxOutputBytes===undefined?{}:{maxOutputBytes}),...(call.signal===undefined?{}:{signal:call.signal})});need(!isOrdinaryHttp(value),'A legacy execute adapter cannot supply HTTP saved authority');return value;}
 const input=callInput(call);
 need(typeof call.persistLocator==='function','Persisted attempt locator callback required before dispatch');
 if(maxOutputBytes!==undefined)need(Number.isSafeInteger(maxOutputBytes)&&maxOutputBytes>0&&provider.operatorConfig?.maxOutputBytes<=maxOutputBytes&&provider.operatorConfig?.maxResponseBytes<=maxOutputBytes*6+8192,'Configured HTTP transport limits exceed finite domain output envelope');
 await call.persistLocator(ordinaryHttpLocator(attemptId,provider.operatorConfig));
 const owner=createModelHttpAuthority({rootDir:join(call.executionRoot,'ordinary-model-http'),operatorConfig:provider.operatorConfig,...(provider.environment===undefined?{}:{environment:provider.environment}),...(provider.failpoint===undefined?{}:{failpoint:provider.failpoint})});
 const result=await owner.invoke(input);
 if(result.kind!=='verified')throw Object.assign(new Error(`Ordinary HTTP ${result.kind}`),{code:`MODEL_HTTP_${result.kind.toUpperCase()}`,status:result.kind==='refused'?'blocked':'awaiting_reconciliation'});
 const value=domainResult(result.savedExecution,call);need(ordinarySuccess(value),'Invalid saved HTTP execution');return value;
}
export async function reopenOrdinary(call){
 const {receipt,attemptLocator}=call;
 need(ordinaryOriginMatches(receipt,attemptLocator,call.attemptId),'Retained receipt cannot change persisted HTTP origin');
 need(isOrdinaryHttp(receipt)||!receipt&&validOrdinaryHttpLocator(attemptLocator,call.attemptId),'Exact saved HTTP origin or explicit locator required');
 if(receipt)need(ordinarySuccess(receipt),'Invalid saved HTTP success claim');
 const input=callInput(call),owner=createModelHttpAuthority({rootDir:join(call.executionRoot,'ordinary-model-http'),environment:{}});
 const result=await owner.reopen({...input,...(receipt?{savedExecution:receipt.providerExecution??receipt}:{attemptLocator})});
 need(result.kind==='verified','Committed successful HTTP original required');
 if(receipt)need(equal(result.savedExecution,receipt.providerExecution??receipt),'Changed saved HTTP original');
 return domainResult(result.savedExecution,call);
}

