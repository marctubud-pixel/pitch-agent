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
