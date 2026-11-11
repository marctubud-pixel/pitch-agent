import {createHash} from 'node:crypto';
import {isDeepStrictEqual as equal} from 'node:util';
import {HTTP_JSON_PROFILE,httpVariantForConfig,httpVariantForProtocol,parseBoundedHttpJSON} from './model-http-json-profile.mjs';
export const ORDINARY_HTTP_PROVIDER='workbench-model-http-v1';
export const ORDINARY_HTTP_PROTOCOL='workbench-model-http-original-v1';
const hash=value=>createHash('sha256').update(value).digest('hex');
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const text=value=>typeof value==='string'&&value.length>0;
const fields=['provider','protocol','attemptId','runId','requestedModel','reportedModel','inputPacketHash','runtimePacketHash','wireRequestHash','responseText','origin','original','context','usage','cost'];
export const isOrdinaryHttp=receipt=>receipt?.provider===ORDINARY_HTTP_PROVIDER;
export function ordinaryHttpLocator(attemptId,config={}){const variant=httpVariantForConfig(config);return {kind:variant.locatorKind,provider:ORDINARY_HTTP_PROVIDER,protocol:variant.protocol,attemptId,rootRelativePath:hash(attemptId)+variant.suffix};}
export function validOrdinaryHttpLocator(value,attemptId){const variant=httpVariantForProtocol(value?.protocol);return text(attemptId)&&!!variant&&equal(value,{kind:variant.locatorKind,provider:ORDINARY_HTTP_PROVIDER,protocol:variant.protocol,attemptId,rootRelativePath:hash(attemptId)+variant.suffix});}
export function ordinarySuccess(receipt){
 if(!isOrdinaryHttp(receipt))return (receipt?.provider===undefined||receipt.provider==='codex-cli')&&receipt?.exitCode===0&&text(receipt.threadId)&&['signal','reason','error'].every(k=>receipt[k]==null);
 const s=receipt.providerExecution??receipt;
 if(!s||Object.keys(s).length!==fields.length||fields.some(k=>!Object.hasOwn(s,k))||!fields.every(k=>equal(s[k],receipt[k])))return false;
 const variant=httpVariantForProtocol(s.protocol);
 if(s.provider!==ORDINARY_HTTP_PROVIDER||!variant||!text(s.attemptId)||!text(s.runId)||!text(s.requestedModel)||s.reportedModel!==null&&!text(s.reportedModel)||!['inputPacketHash','runtimePacketHash','wireRequestHash'].every(k=>digest(s[k]))||typeof s.responseText!=='string'||s.cost!==null)return false;
 if(['threadId','exitCode','signal','reason','error','paths','verified'].some(k=>Object.hasOwn(receipt,k)))return false;
 if(!equal(Object.keys(s.origin??{}).sort(),['configurationHash','invocationId','serviceIdentity'])||!text(s.origin.serviceIdentity)||!text(s.origin.invocationId)||!digest(s.origin.configurationHash))return false;
 if(!equal(s.original,{rootRelativePath:hash(s.attemptId)+variant.suffix,manifestHash:s.original?.manifestHash})||!digest(s.original.manifestHash))return false;
 if(!equal(s.context,{kind:'isolated-http-call',namespace:s.origin.serviceIdentity,invocationId:s.origin.invocationId,requestHash:s.wireRequestHash,isolation:'stateless-v1'}))return false;
 if(!equal(Object.keys(s.usage??{}).sort(),['inputTokens','outputTokens'])||Object.values(s.usage).some(v=>v!==null&&(!Number.isSafeInteger(v)||v<0)))return false;
 try{if(variant.bounded){if(Buffer.byteLength(s.responseText)>HTTP_JSON_PROFILE.outputBytes)return false;parseBoundedHttpJSON(s.responseText);}else JSON.parse(s.responseText);}catch{return false;}
 return true;
}
export const ordinarySuccessfulStatus=receipt=>isOrdinaryHttp(receipt)?ordinarySuccess(receipt):(receipt?.provider===undefined||receipt.provider==='codex-cli')&&receipt?.exitCode===0;
export function ordinaryHasContext(receipt){return isOrdinaryHttp(receipt)?ordinarySuccess(receipt):text(receipt?.threadId);}
export function ordinarySameContext(a,b){
 if(!a||!b)return false;
 if(isOrdinaryHttp(a)||isOrdinaryHttp(b))return isOrdinaryHttp(a)&&isOrdinaryHttp(b)&&ordinarySuccess(a)&&ordinarySuccess(b)&&a.context.namespace===b.context.namespace&&a.context.invocationId===b.context.invocationId;
 return a.threadId===b.threadId;
}
export function ordinaryExecutionIdentity(context,receipt){
 if(!isOrdinaryHttp(receipt))return {...structuredClone(context),threadId:receipt.threadId};
 const {threadId,...actor}=structuredClone(context);
 return {...actor,version:'ordinary-http-source-identity-v1',modelContext:structuredClone(receipt.context)};
}
export function ordinaryIdentitySameContext(identity,receipt){
 if(isOrdinaryHttp(receipt))return identity?.version==='ordinary-http-source-identity-v1'&&!Object.hasOwn(identity,'threadId')&&ordinarySuccess(receipt)&&equal(identity.modelContext,receipt.context);
 return (receipt?.provider===undefined||receipt.provider==='codex-cli')&&text(identity?.threadId)&&identity.threadId===receipt?.threadId;
}
export function ordinaryOriginMatches(receipt,locator,attemptId){return locator===undefined||validOrdinaryHttpLocator(locator,attemptId)&&(!receipt||isOrdinaryHttp(receipt)&&ordinarySuccess(receipt)&&receipt.attemptId===attemptId&&receipt.protocol===locator.protocol&&receipt.original.rootRelativePath===locator.rootRelativePath);}
export function validOrdinaryContext(value){return value?.kind==='isolated-http-call'&&value.isolation==='stateless-v1'&&text(value.namespace)&&text(value.invocationId)&&digest(value.requestHash)&&equal(Object.keys(value).sort(),['invocationId','isolation','kind','namespace','requestHash']);}
