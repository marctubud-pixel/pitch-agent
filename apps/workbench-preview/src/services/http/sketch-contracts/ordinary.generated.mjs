import {sha256} from '../sha256';
import {equalJsonNative as equal} from './json-equal.mjs';
const hash=sha256;const Buffer={byteLength:s=>new TextEncoder().encode(s).byteLength};
export const HTTP_JSON_PROFILE=Object.freeze({name:'bounded-json-v1',bodyBytes:16*1024*1024,outputBytes:2*1024*1024,manifestBytes:16*1024*1024,depth:128,structuralCharacters:200000,responseInspectionBytes:64*1024*1024,inputInspectionBytes:256*1024*1024,inspectionEntries:200000,decodingGenerations:128});
const legacy=Object.freeze({protocol:'workbench-model-http-original-v1',locatorKind:'http-attempt-locator-v1',suffix:'',bounded:false});
const bounded=Object.freeze({protocol:'workbench-model-http-original-v2',locatorKind:'http-attempt-locator-v2',suffix:'/bounded-json-v1',bounded:true});
const fail=code=>{throw Object.assign(new Error(code),{code});};
export function httpVariantForConfig(config){
 if(!config||typeof config!=='object')fail('configuration');
 if(!Object.hasOwn(config,'resourceProfile'))return legacy;
 if(config.resourceProfile!==HTTP_JSON_PROFILE.name)fail('configuration');
 return bounded;
}
export function httpVariantForProtocol(protocol){return protocol===legacy.protocol?legacy:protocol===bounded.protocol?bounded:null;}
export function precheckHttpJSON(text){
 if(typeof text!=='string')fail('protocol');
 let string=false,escaped=false,structuralCharacters=0,maxDepth=0;
 const stack=[];
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(string){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')string=false;continue;}
  if(c==='"'){string=true;continue;}
  if(c==='{'||c==='['||c==='}'||c===']'||c===','||c===':'){
   if(++structuralCharacters>HTTP_JSON_PROFILE.structuralCharacters)fail('size');
   if(c==='{'||c==='['){stack.push(c);maxDepth=Math.max(maxDepth,stack.length);if(stack.length>HTTP_JSON_PROFILE.depth)fail('size');}
   else if(c==='}'||c===']'){if(stack.pop()!==(c==='}'?'{':'['))fail('protocol');}
  }
 }
 if(string||escaped||stack.length)fail('protocol');
 return {depth:maxDepth,structuralCharacters};
}
export function parseBoundedHttpJSON(text){precheckHttpJSON(text);return JSON.parse(text);}

export const ORDINARY_HTTP_PROVIDER='workbench-model-http-v1';
export const ORDINARY_HTTP_PROTOCOL='workbench-model-http-original-v1';
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
 if(isOrdinaryHttp(a)||isOrdinaryHttp(b))return isOrdinaryHttp(a)&&isOrdinaryHttp(b)&&a.context?.namespace===b.context?.namespace&&a.context?.invocationId===b.context?.invocationId&&ordinarySuccess(a)&&ordinarySuccess(b);
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
