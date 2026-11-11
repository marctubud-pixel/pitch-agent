import {createHash, randomUUID} from 'node:crypto';
import {constants} from 'node:fs';
import {open,mkdir,realpath,lstat} from 'node:fs/promises';
import {resolve,join,dirname,isAbsolute} from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import http from 'node:http';
import https from 'node:https';
import {imageManifest} from './image-evidence.mjs';
import {HTTP_JSON_PROFILE,httpVariantForConfig,httpVariantForProtocol,precheckHttpJSON,parseBoundedHttpJSON} from './model-http-json-profile.mjs';

const PROTOCOL='workbench-stateless-model-json-v1';
const ADAPTER='workbench-model-http-v1';
const CAP=64*1024*1024;
const ENVELOPES=['sketch-review-v2','final-visual-v1','complete-content-v1'];
const hash=b=>createHash('sha256').update(b).digest('hex');
const json=v=>Buffer.from(JSON.stringify(v));
const same=(a,b)=>json(a).equals(json(b));
const invalid=()=>Object.assign(new Error('Invalid model transport original'),{code:'original-invalid'});
const fail=code=>{throw Object.assign(new Error(code),{code});};
function keys(o,required,optional=[]){if(!o||typeof o!=='object'||Array.isArray(o)||required.some(k=>!Object.hasOwn(o,k))||Object.keys(o).some(k=>![...required,...optional].includes(k)))fail('protocol');}
function text(s,max=2000){return typeof s==='string'&&s.length>0&&Buffer.byteLength(s)<=max&&!/[\u0000-\u001f]/.test(s);}
function decode(b){try{return new TextDecoder('utf-8',{fatal:true}).decode(b);}catch{fail('utf8');}}
function parse(b,variant){try{const text=decode(b);return variant?.bounded?parseBoundedHttpJSON(text):JSON.parse(text);}catch(e){if(e.code)throw e;fail('protocol');}}
function strictJSON(b,variant){const v=parse(b,variant);if(!json(v).equals(b))fail('protocol');return v;}
export {config as validateModelHttpConfiguration};
function config(raw){
 keys(raw,['adapter','endpoint','model','serviceIdentity','authentication','allowLoopbackHttp','timeoutMs','maxRequestBytes','maxResponseBytes','maxOutputBytes','vision','envelopes'],['resourceProfile']);
 httpVariantForConfig(raw);
 if(raw.adapter!==ADAPTER||!text(raw.model)||!text(raw.serviceIdentity)||typeof raw.allowLoopbackHttp!=='boolean'||typeof raw.vision!=='boolean'||!Array.isArray(raw.envelopes)||raw.envelopes.some(e=>!ENVELOPES.includes(e))||new Set(raw.envelopes).size!==raw.envelopes.length)fail('configuration');
 let u;try{u=new URL(raw.endpoint);}catch{fail('configuration');}
 if(u.username||u.password||u.search||u.hash||!['https:','http:'].includes(u.protocol)||u.protocol==='http:'&&(!raw.allowLoopbackHttp||!['127.0.0.1','[::1]'].includes(u.hostname)))fail('configuration');
 for(const [k,max] of [['timeoutMs',300000],['maxRequestBytes',CAP],['maxResponseBytes',CAP],['maxOutputBytes',2*1024*1024]])if(!Number.isSafeInteger(raw[k])||raw[k]<1||raw[k]>max)fail('configuration');
 keys(raw.authentication,['kind'],raw.authentication?.kind==='bearer-env'?['name']:[]);
 if(raw.authentication.kind!=='none'&&(raw.authentication.kind!=='bearer-env'||!/^[A-Z][A-Z0-9_]{0,99}$/.test(raw.authentication.name)))fail('configuration');
 if(raw.authentication.kind==='bearer-env'&&!Object.hasOwn(raw.authentication,'name'))fail('configuration');
 return {...structuredClone(raw),endpoint:u.href};
}
async function safeRoot(root,create=false){if(!isAbsolute(root)||resolve(root)!==root)throw invalid();if(create)await mkdir(root,{recursive:true,mode:0o700});if(await realpath(root)!==root)throw invalid();}
async function read(path,max){
 if(await realpath(dirname(path))!==dirname(path))throw invalid();
 const f=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{const st=await f.stat();if(!st.isFile()||st.size<0||st.size>max)throw invalid();const b=Buffer.alloc(st.size+1);let n=0;while(n<b.length){const r=await f.read(b,n,b.length-n,n);if(!r.bytesRead)break;n+=r.bytesRead;}const after=await f.stat();if(n!==st.size||after.size!==st.size||after.ino!==st.ino||after.mtimeMs!==st.mtimeMs)throw invalid();return b.subarray(0,n);}finally{await f.close();}
}
async function syncDir(path){const f=await open(path,'r');try{await f.sync();}finally{await f.close();}}
function descriptor(path,bytes){return {path,byteLength:bytes.length,sha256:hash(bytes)};}
async function readDescriptor(dir,d,max){keys(d,['path','byteLength','sha256']);if(!/^[a-zA-Z0-9.-]+$/.test(d.path)||!Number.isSafeInteger(d.byteLength)||d.byteLength<0||d.byteLength>max||!/^[a-f0-9]{64}$/.test(d.sha256))throw invalid();const b=await read(join(dir,d.path),max);if(b.length!==d.byteLength||hash(b)!==d.sha256)throw invalid();return b;}
function secretFound(bytes,secret){
 if(!secret)return false;
 if(bytes.includes(Buffer.from(secret)))return true;
 let value;try{value=parse(bytes);}catch{return false;}
 const pending=[value];
 while(pending.length){
  const item=pending.pop();
  if(typeof item==='string'){
   if(item.includes(secret))return true;
   try{const decoded=JSON.parse(item);if(decoded!==item)pending.push(decoded);}catch{}
  }else if(item&&typeof item==='object'){
   for(const [key,entry] of Object.entries(item))pending.push(key,entry);
  }
 }
 return false;
}
function inspectBoundedJSON(bytes,secret,scope,cfg){
 const ceiling=scope==='response'?HTTP_JSON_PROFILE.bodyBytes:CAP;
 const allowance=scope==='response'?HTTP_JSON_PROFILE.responseInspectionBytes:HTTP_JSON_PROFILE.inputInspectionBytes;
 if(bytes.length>ceiling)fail('size');
 let work=bytes.length,entries=1;
 const source=decode(bytes);
 if(secret&&source.includes(secret))return true;
 let value;try{value=parseBoundedHttpJSON(source);}catch(error){if(error.code==='size')throw error;return false;}
 if(scope==='response'&&typeof value?.outputText==='string'&&Buffer.byteLength(value.outputText)>Math.min(cfg.maxOutputBytes,HTTP_JSON_PROFILE.outputBytes))fail('size');
 const pending=[{value,generation:0}];
 function* children(object){for(const key in object)if(Object.hasOwn(object,key))yield [key,object[key]];}
 while(pending.length){
  const frame=pending.pop();
  if(frame.iterator){
   const next=frame.iterator.next();if(next.done)continue;
   entries+=2;if(entries>HTTP_JSON_PROFILE.inspectionEntries)fail('size');
   pending.push(frame,{value:next.value[1],generation:frame.generation},{value:next.value[0],generation:frame.generation});
   continue;
  }
  const item=frame.value;
  if(typeof item==='string'){
   const size=Buffer.byteLength(item);work+=size;if(work>allowance)fail('size');
   if(secret&&item.includes(secret))return true;
   let decoded;try{decoded=parseBoundedHttpJSON(item);}catch(error){if(error.code==='size')throw error;continue;}
   if(decoded!==item){if(frame.generation>=HTTP_JSON_PROFILE.decodingGenerations||++entries>HTTP_JSON_PROFILE.inspectionEntries)fail('size');pending.push({value:decoded,generation:frame.generation+1});}
  }else if(item&&typeof item==='object')pending.push({iterator:children(item),generation:frame.generation});
 }
 return false;
}
function inspectJSON(bytes,secret,variant,scope='input',cfg){return variant.bounded?inspectBoundedJSON(bytes,secret,scope,cfg):secretFound(bytes,secret);}
function responseLimit(cfg){return httpVariantForConfig(cfg).bounded?Math.min(cfg.maxResponseBytes,HTTP_JSON_PROFILE.bodyBytes):cfg.maxResponseBytes;}
function response(bytes,status,invocationId,cfg){
 const variant=httpVariantForConfig(cfg),bodyText=decode(bytes);
 if(variant.bounded){if(bytes.length>responseLimit(cfg))fail('size');precheckHttpJSON(bodyText);}
 if(status!==200){if(cfg.authentication.kind==='bearer-env')strictJSON(bytes,variant);return {kind:'rejected',code:'http-status'};}
 const v=strictJSON(bytes,variant);keys(v,['protocol','invocationId','contextMode','terminal','outputText','reportedModel','requestId','usage']);keys(v.usage,['inputTokens','outputTokens']);
 if(v.protocol!==PROTOCOL||v.invocationId!==invocationId||v.contextMode!=='stateless-v1'||v.terminal!=='completed'||typeof v.outputText!=='string'||Buffer.byteLength(v.outputText)>cfg.maxOutputBytes||[v.reportedModel,v.requestId].some(x=>x!==null&&!text(x))||Object.values(v.usage).some(x=>x!==null&&(!Number.isSafeInteger(x)||x<0)))fail('protocol');
 if(variant.bounded){try{parseBoundedHttpJSON(v.outputText);}catch(error){if(error.code)throw error;fail('protocol');}}else parse(Buffer.from(v.outputText));return {kind:'verified',value:v};
}
function preflight(cfg,call){
 const end=Date.now()+Math.min(cfg.timeoutMs,call.timeoutMs??cfg.timeoutMs);
 const check=()=>{if(call.signal?.aborted)fail('abort');if(Date.now()>=end)fail('deadline');};
 return {check,remaining:()=>Math.max(1,end-Date.now()),signal:call.signal};
}
function snapshot(call){
 if(!(call.logicalInputBytes instanceof Uint8Array)||!(call.runtimePacketBytes instanceof Uint8Array)||call.logicalInputBytes.byteLength>CAP||call.runtimePacketBytes.byteLength>CAP)fail('unsupported-input');
 return {...call,binding:structuredClone(call.binding),request:structuredClone(call.request),images:structuredClone(call.images??[]),logicalInputBytes:Buffer.from(call.logicalInputBytes),runtimePacketBytes:Buffer.from(call.runtimePacketBytes)};
}
async function sourceImage(image,budget){
 budget.check();
 if(!isAbsolute(image.path)||resolve(image.path)!==image.path||await realpath(dirname(image.path))!==dirname(image.path))fail('unsupported-input');
 const before=await lstat(image.path);
 if(!before.isFile()||before.isSymbolicLink())fail('unsupported-input');
 budget.check();
 const f=await open(image.path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{
  const st=await f.stat();
  if(!st.isFile()||st.dev!==before.dev||st.ino!==before.ino||st.size!==image.byteLength||st.size<1||st.size>8*1024*1024)fail('unsupported-input');
  const bytes=Buffer.alloc(st.size+1);let n=0;
  while(n<bytes.length){budget.check();const result=await f.read(bytes,n,bytes.length-n,n);if(!result.bytesRead)break;n+=result.bytesRead;}
  const after=await f.stat();
  if(n!==st.size||after.size!==st.size||after.ino!==st.ino||after.dev!==st.dev||after.mtimeMs!==st.mtimeMs||hash(bytes.subarray(0,n))!==image.sha256)fail('unsupported-input');
  const named=await lstat(image.path);
  if(!named.isFile()||named.isSymbolicLink()||named.ino!==st.ino||named.dev!==st.dev||await realpath(dirname(image.path))!==dirname(image.path))fail('unsupported-input');
  budget.check();return bytes.subarray(0,n);
 }finally{await f.close();}
}
function dimensions(bytes,budget){
 budget.check();
 return new Promise((accept,reject)=>{
  let child,timer,reason=null,output=Buffer.alloc(0);
  const stop=code=>{
   if(reason)return;reason=code;
   try{if(process.platform!=='win32'&&child.pid>1)process.kill(-child.pid,'SIGKILL');else child.kill('SIGKILL');}catch{}
  };
  const abort=()=>stop('abort');
  const cleanup=()=>{clearTimeout(timer);budget.signal?.removeEventListener('abort',abort);};
  try{
   child=spawn(process.execPath,[fileURLToPath(new URL('./model-http-image-check.mjs',import.meta.url))],{stdio:['pipe','pipe','ignore'],detached:process.platform!=='win32'});
   child.stdout.on('data',chunk=>{if(output.length+chunk.length>4096)stop('unsupported-input');else output=Buffer.concat([output,chunk]);});
   child.stdin.on('error',()=>{});
   child.on('error',()=>{cleanup();reject(Object.assign(new Error('unsupported-input'),{code:'unsupported-input'}));});
   child.on('close',code=>{
    cleanup();
    try{
     if(reason)fail(reason);if(code!==0)fail('unsupported-input');budget.check();
     const result=parse(output);keys(result,['mediaType','width','height']);
     if(!['image/png','image/jpeg'].includes(result.mediaType)||![result.width,result.height].every(n=>Number.isSafeInteger(n)&&n>0)||result.width*result.height>20_000_000)fail('unsupported-input');
     accept(result);
    }catch(error){reject(error);}
   });
   timer=setTimeout(()=>stop('deadline'),budget.remaining());
   budget.signal?.addEventListener('abort',abort,{once:true});
   if(budget.signal?.aborted)abort();
   child.stdin.end(bytes);
  }catch{cleanup();reject(Object.assign(new Error('unsupported-input'),{code:'unsupported-input'}));}
 });
}

async function inputs(call,cfg,budget=preflight(cfg,call)){
 budget.check();
 keys(call.binding,['providerId','model','role']);if(Object.values(call.binding).some(v=>!text(v))||call.binding.model!==cfg.model||!text(call.attemptId)||!call.request)fail('unsupported-input');
 keys(call.request,['runId','prompt'],['outputSchema','imageEnvelope']);const r=call.request;
 if(!text(r.runId)||typeof r.prompt!=='string'||!r.prompt.trim()||Buffer.byteLength(r.prompt)>cfg.maxRequestBytes)fail('unsupported-input');
 if(r.outputSchema!==undefined&&(!r.outputSchema||typeof r.outputSchema!=='object'||Array.isArray(r.outputSchema)))fail('unsupported-input');
 const images=call.images??[];if(!Array.isArray(images)||images.length>32||images.length&&!cfg.vision||r.imageEnvelope&&!cfg.envelopes.includes(r.imageEnvelope.operation))fail('unsupported-input');
 if(r.imageEnvelope&&!images.length)fail('unsupported-input');
 const manifest=images.length?imageManifest(images,r.imageEnvelope):[];let pixels=0,total=0;const captured=[];
 for(let i=0;i<images.length;i++){const b=await sourceImage(images[i],budget);const decoded=await dimensions(b,budget);if(decoded.mediaType!==manifest[i].mediaType)fail('unsupported-input');pixels+=decoded.width*decoded.height;total+=b.length;if(total>CAP||pixels>(r.imageEnvelope?.limits.maxPixels??20_000_000))fail('unsupported-input');captured.push({...manifest[i],...decoded,bytes:b,occurrence:i});}
 const logical=json({runId:r.runId,model:cfg.model,prompt:r.prompt,...(r.outputSchema===undefined?{}:{outputSchema:r.outputSchema}),...(manifest.length?{images:manifest}:{}),...(r.imageEnvelope?{imageEnvelope:r.imageEnvelope}:{})});
 if(!(call.logicalInputBytes instanceof Uint8Array)||!logical.equals(Buffer.from(call.logicalInputBytes))||!(call.runtimePacketBytes instanceof Uint8Array)||call.runtimePacketBytes.length<1||call.runtimePacketBytes.length>CAP)fail('unsupported-input');
 const runtime=Buffer.from(call.runtimePacketBytes);
 return {logical,runtime,captured};
}
function wire(call,captured,id){return json({protocol:PROTOCOL,model:call.binding.model,invocationId:id,contextMode:'stateless-v1',prompt:call.request.prompt,...(call.request.outputSchema===undefined?{}:{outputSchema:call.request.outputSchema}),images:captured.map(({bytes,occurrence,imageId,sha256,mediaType,byteLength,width,height})=>({occurrence,imageId,sha256,mediaType,byteLength,width,height,base64:bytes.toString('base64')})),...(call.request.imageEnvelope?{imageEnvelope:call.request.imageEnvelope}:{})});}
function exchange(cfg,body,secret,signal,timeoutMs){
 return new Promise((accept,reject)=>{
 let settled=false,req,timer;const chunks=[];let total=0;const done=(e,v)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);if(e){req?.destroy();reject(Object.assign(new Error(e),{code:e}));}else accept(v);};const abort=()=>done('abort');
 try{req=(new URL(cfg.endpoint).protocol==='http:'?http:https).request(cfg.endpoint,{method:'POST',agent:false,headers:{'Content-Type':'application/json','Accept':'application/json','Accept-Encoding':'identity','Content-Length':body.length,...(secret?{Authorization:`Bearer ${secret}`}:{})}},res=>{
 if(res.headers['content-encoding']&&res.headers['content-encoding']!=='identity'){res.destroy();return done('protocol');}
 res.on('data',b=>{total+=b.length;if(total>responseLimit(cfg)){res.destroy();done('size');}else chunks.push(b);});
 res.on('aborted',()=>done('connection'));res.on('error',()=>done('connection'));res.on('end',()=>{if(!res.complete)return done('connection');done(null,{status:res.statusCode,bytes:Buffer.concat(chunks,total)});});
 });req.on('error',()=>done('connection'));timer=setTimeout(()=>done('deadline'),timeoutMs);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted){abort();return;}req.end(body);}catch{done('connection');}
 });
}
function execution(m,manifestBytes,dir){
 const v=m.result;return {provider:ADAPTER,protocol:m.origin,attemptId:m.attemptId,runId:m.runId,requestedModel:m.config.model,reportedModel:v?.reportedModel??null,inputPacketHash:m.logical.sha256,runtimePacketHash:m.runtime.sha256,wireRequestHash:m.wire.sha256,responseText:v?.outputText??null,origin:{serviceIdentity:m.config.serviceIdentity,configurationHash:m.configurationHash,invocationId:m.invocationId},original:{rootRelativePath:dir,manifestHash:hash(manifestBytes)},context:{kind:'isolated-http-call',namespace:m.config.serviceIdentity,invocationId:m.invocationId,requestHash:m.wire.sha256,isolation:'stateless-v1'},usage:v?.usage??null,cost:null};
}
function boundedManifestSize(value){
 let bytes=0;
 const add=n=>{bytes+=n;if(bytes>HTTP_JSON_PROFILE.manifestBytes)fail('size');};
 function stringSize(s){
  add(2);
  for(let i=0;i<s.length;i++){
   const c=s.charCodeAt(i);
   if(c===34||c===92||[8,9,10,12,13].includes(c))add(2);
   else if(c<32)add(6);
   else if(c<128)add(1);
   else if(c<2048)add(2);
   else if(c>=0xd800&&c<=0xdbff&&s.charCodeAt(i+1)>=0xdc00&&s.charCodeAt(i+1)<=0xdfff){add(4);i++;}
   else if(c>=0xd800&&c<=0xdfff)add(6);
   else add(3);
  }
 }
 function visit(v){
  if(typeof v==='string')return stringSize(v);
  if(v===null||typeof v!=='object'){add(JSON.stringify(v).length);return;}
  add(2);let first=true;
  if(Array.isArray(v)){for(const item of v){if(!first)add(1);first=false;visit(item);}}
  else for(const key of Object.keys(v)){if(!first)add(1);first=false;stringSize(key);add(1);visit(v[key]);}
 }
 visit(value);return bytes;
}
function reserveManifest(call,cfg,inp,id){
 const d=path=>({path,byteLength:CAP,sha256:'0'.repeat(64)});
 const images=inp.captured.map(({bytes,...meta},i)=>({...meta,file:d(`image-${i}.${meta.mediaType==='image/png'?'png':'jpg'}`)}));
 const m={origin:httpVariantForConfig(cfg).protocol,attemptId:call.attemptId,runId:call.request.runId,binding:call.binding,config:cfg,configurationHash:'0'.repeat(64),invocationId:id,logical:d('logical.json'),runtime:d('runtime.json'),wire:d('wire.json'),images,intent:d('intent.json'),status:d('status.json'),body:d('response.bin'),output:d('output.json'),result:{protocol:PROTOCOL,invocationId:id,contextMode:'stateless-v1',terminal:'completed',outputText:'',reportedModel:null,requestId:null,usage:{inputTokens:null,outputTokens:null}},outcome:'verified'};
 if(boundedManifestSize(m)+cfg.maxOutputBytes*6+24032>HTTP_JSON_PROFILE.manifestBytes)fail('size');
}

export function createModelHttpAuthority({rootDir,operatorConfig,environment=process.env,failpoint=()=>{}}){
 if(typeof rootDir!=='string'||!isAbsolute(rootDir))fail('configuration');
 const root=resolve(rootDir);let current;try{if(operatorConfig!==undefined)current=config(operatorConfig);}catch{current=null;}
 async function reopenWithin(call,budget){
 const invoked=budget!==undefined;
 try{
 call=snapshot(call);
 const s=call.savedExecution,locator=call.attemptLocator,variant=httpVariantForProtocol(s?.protocol??locator?.protocol);
 if(!variant)throw invalid();
 const name=hash(call.attemptId)+variant.suffix;
 if(locator!==undefined){keys(locator,['kind','provider','protocol','attemptId','rootRelativePath']);if(s!==undefined||locator.kind!==variant.locatorKind||locator.provider!==ADAPTER||locator.protocol!==variant.protocol||locator.attemptId!==call.attemptId||locator.rootRelativePath!==name)throw invalid();}
 else if(s?.provider!==ADAPTER||s.protocol!==variant.protocol||s.original?.rootRelativePath!==name||!/^[a-f0-9]{64}$/.test(s.original.manifestHash))throw invalid();await safeRoot(root);const dir=join(root,name);await safeRoot(dir);
 const mb=await read(join(dir,'manifest.json'),variant.bounded?HTTP_JSON_PROFILE.manifestBytes:CAP);if(s&&hash(mb)!==s.original.manifestHash)throw invalid();const m=strictJSON(mb,variant);
 keys(m,['origin','attemptId','runId','binding','config','configurationHash','invocationId','logical','runtime','wire','images','intent','status','body','output','result','outcome']);
 const cfg=config(m.config);if(httpVariantForConfig(cfg)!==variant||m.origin!==variant.protocol||m.attemptId!==call.attemptId||m.runId!==call.request.runId||!same(m.binding,call.binding)||m.configurationHash!==hash(json(cfg))||!text(m.invocationId,100)||!['verified','rejected'].includes(m.outcome))throw invalid();
 for(const [key,path] of [['logical','logical.json'],['runtime','runtime.json'],['wire','wire.json'],['intent','intent.json'],['status','status.json'],['body','response.bin'],['output','output.json']])if(m[key]?.path!==path)throw invalid();
 budget??=preflight(cfg,call);budget.check();
 const inp=await inputs(call,cfg,budget);const logical=await readDescriptor(dir,m.logical,CAP),runtime=await readDescriptor(dir,m.runtime,CAP),wb=await readDescriptor(dir,m.wire,cfg.maxRequestBytes);
 if(variant.bounded)for(const bytes of [logical,runtime,wb])inspectJSON(bytes,undefined,variant);
 if(!logical.equals(inp.logical)||!runtime.equals(inp.runtime)||!wb.equals(wire(call,inp.captured,m.invocationId))||!Array.isArray(m.images)||m.images.length!==inp.captured.length)throw invalid();
 for(let i=0;i<m.images.length;i++){const {bytes,...meta}=inp.captured[i];const expected={...meta,file:descriptor(`image-${i}.${meta.mediaType==='image/png'?'png':'jpg'}`,bytes)};if(!same(m.images[i],expected)||(await readDescriptor(dir,m.images[i].file,8*1024*1024)).equals(bytes)===false)throw invalid();}
 const intent=strictJSON(await readDescriptor(dir,m.intent,16384),variant);if(!same(intent,{origin:variant.protocol,attemptId:m.attemptId,invocationId:m.invocationId,wireHash:m.wire.sha256}))throw invalid();
 const st=strictJSON(await readDescriptor(dir,m.status,16384),variant);keys(st,['status','complete']);if(!Number.isInteger(st.status)||st.status<100||st.status>599||st.complete!==true)throw invalid();
 const body=await readDescriptor(dir,m.body,responseLimit(cfg));if(variant.bounded)inspectJSON(body,undefined,variant,'response',cfg);const decoded=response(body,st.status,m.invocationId,cfg);if(decoded.kind!==m.outcome||!same(decoded.value??null,m.result))throw invalid();
 const output=await readDescriptor(dir,m.output,cfg.maxOutputBytes*6+2);if(!output.equals(json(decoded.value?.outputText??null)))throw invalid();const saved=execution(m,mb,name);if(s&&!same(saved,s))throw invalid();
 budget.check();
 if(decoded.kind==='rejected')return {kind:'rejected',code:'http-status',savedFailure:saved};
 return {kind:'verified',success:Object.freeze({attemptId:m.attemptId,requestedModel:cfg.model,reportedModel:m.result.reportedModel,inputPacketHash:m.logical.sha256,runtimePacketHash:m.runtime.sha256,wireRequestHash:m.wire.sha256,responseText:m.result.outputText,context:Object.freeze(saved.context),imageOccurrences:Object.freeze(m.images)}),savedExecution:saved};
 }catch(error){if(invoked&&['deadline','abort'].includes(error.code))throw error;throw invalid();}
 }
 const reopen=call=>reopenWithin(call);
 async function invoke(call){
 let cfg,variant,inp,secret,wb,id,dir,name,claimed=false;
 try{
 if(!current)fail('configuration');cfg=current;variant=httpVariantForConfig(cfg);call=snapshot(call);
 if(call.signal!==undefined&&!(call.signal instanceof AbortSignal))fail('unsupported-input');if(call.signal?.aborted)fail('abort');
 if(call.timeoutMs!==undefined&&(!Number.isSafeInteger(call.timeoutMs)||call.timeoutMs<1))fail('unsupported-input');
 const budget=preflight(cfg,call);budget.check();
 if(cfg.authentication.kind==='bearer-env'){secret=environment[cfg.authentication.name];if(!text(secret,8192))fail('credential');}
 if([json({attemptId:call.attemptId,rootDir:root,binding:call.binding,request:call.request,images:call.images}),json(cfg),call.logicalInputBytes,call.runtimePacketBytes].some(bytes=>inspectJSON(bytes,secret,variant)))fail('secret-echo');
 inp=await inputs(call,cfg,budget);
 id=randomUUID();wb=wire(call,inp.captured,id);if(wb.length>cfg.maxRequestBytes)fail('size');
 if([inp.logical,inp.runtime,wb,json(cfg),json(call.binding)].some(b=>inspectJSON(b,secret,variant))||inp.captured.some(image=>variant.bounded?secret&&image.bytes.includes(Buffer.from(secret)):secretFound(image.bytes,secret)))fail('secret-echo');
 if(variant.bounded)reserveManifest(call,cfg,inp,id);
 budget.check();await safeRoot(root,true);const claim=join(root,hash(call.attemptId));name=hash(call.attemptId)+variant.suffix;dir=join(root,name);
 try{await mkdir(claim,{mode:0o700});claimed=true;await syncDir(root);}catch(e){if(e.code==='EEXIST'){try{return await reopenWithin({...call,attemptLocator:{kind:variant.locatorKind,provider:ADAPTER,protocol:variant.protocol,attemptId:call.attemptId,rootRelativePath:name}},budget);}catch{return {kind:'unknown',code:'existing-attempt'};}}throw e;}
 if(variant.bounded){await mkdir(dir,{mode:0o700});await syncDir(claim);}
 const put=async(path,b)=>{budget.check();const f=await open(join(dir,path),'wx',0o400);try{await f.writeFile(b);await f.sync();}finally{await f.close();}await failpoint(path);budget.check();return descriptor(path,b);};
 const logical=await put('logical.json',inp.logical),runtime=await put('runtime.json',inp.runtime),wireFile=await put('wire.json',wb);const images=[];
 for(let i=0;i<inp.captured.length;i++){const {bytes,...meta}=inp.captured[i];const file=await put(`image-${i}.${meta.mediaType==='image/png'?'png':'jpg'}`,bytes);images.push({...meta,file});}
 const intent=await put('intent.json',json({origin:variant.protocol,attemptId:call.attemptId,invocationId:id,wireHash:wireFile.sha256}));await syncDir(dir);await failpoint('intent-synced');budget.check();
 const reply=await exchange(cfg,wb,secret,call.signal,budget.remaining());
 if(inspectJSON(reply.bytes,secret,variant,'response',cfg))fail('secret-echo');const decoded=response(reply.bytes,reply.status,id,cfg);
 const status=await put('status.json',json({status:reply.status,complete:true}));const body=await put('response.bin',reply.bytes);const output=await put('output.json',json(decoded.value?.outputText??null));
 const m={origin:variant.protocol,attemptId:call.attemptId,runId:call.request.runId,binding:call.binding,config:cfg,configurationHash:hash(json(cfg)),invocationId:id,logical,runtime,wire:wireFile,images,intent,status,body,output,result:decoded.value??null,outcome:decoded.kind};
 await syncDir(dir);if(variant.bounded)boundedManifestSize(m);const mb=json(m);if(variant.bounded){if(mb.length>HTTP_JSON_PROFILE.manifestBytes)fail('size');precheckHttpJSON(decode(mb));}await put('manifest.json',mb);await syncDir(dir);await failpoint('manifest-synced');return await reopenWithin({...call,savedExecution:execution(m,mb,name)},budget);
 }catch(e){const codes=['configuration','credential','unsupported-input','deadline','abort','connection','size','utf8','protocol','secret-echo'];const code=codes.includes(e.code)?e.code:'original-invalid';if(claimed){try{const f=await open(join(dir,'unknown.json'),'wx',0o400);try{await f.writeFile(json({origin:variant.protocol,outcome:'unknown',code}));await f.sync();}finally{await f.close();}await syncDir(dir);}catch{}return {kind:'unknown',code,attemptLocator:{kind:variant.locatorKind,provider:ADAPTER,protocol:variant.protocol,attemptId:call.attemptId,rootRelativePath:name}};}return {kind:'refused',code,dispatch:'not-started'};}
 }
 return Object.freeze({invoke,reopen});
}
