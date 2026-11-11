import https from 'node:https';
import net from 'node:net';
import {capturePublicSource,isPublicAddress,httpsTransport} from './source-acquisition.mjs';
import {readManagedCapture} from './source-capture-store.mjs';
import {searchPublicReferences,parseAcquisitionSearchOriginal,acquisitionSearchParserPolicy as parserPolicy} from './reference-http-search.mjs';
import {createIntakeDocumentStore} from './intake-document-store.mjs';
import {acquisitionHash as hash,acquisitionNeed as need} from './research-acquisition.mjs';
import {isDeepStrictEqual as equal} from 'node:util';
const fields=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k));
const pathValid=v=>Array.isArray(v)&&v.length<=8&&v.every(k=>typeof k==='string'&&/^[a-zA-Z0-9_-]{1,64}$/.test(k)&&!['__proto__','prototype','constructor'].includes(k));
export function canonicalResearchUrl(value){
 need(typeof value==='string'&&value.length<=4096&&!/[\u0000-\u0020\u007f\\]/.test(value),'SEARCH_URL_REJECTED','Bounded public HTTPS URL required');
 let u=new URL(value,'https://lite.duckduckgo.com/lite/');
 if(['duckduckgo.com','www.duckduckgo.com','lite.duckduckgo.com'].includes(u.hostname)&&u.pathname==='/l/'){
  need(u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&u.searchParams.getAll('uddg').length===1,'SEARCH_URL_REJECTED','Exact public search redirect wrapper required');
  const raw=u.searchParams.get('uddg');need(raw.startsWith('https://')&&!/[\u0000-\u0020\u007f\\]/.test(raw),'SEARCH_URL_REJECTED','Unsafe wrapped destination');u=new URL(raw);
 }
 const host=u.hostname.replace(/^\[|\]$/g,'').replace(/\.$/,'');
 need(u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&host!=='localhost'&&!/\.(localhost|local|internal|test|invalid|example|home\.arpa)$/.test(host)&&((net.isIP(host)&&isPublicAddress(host))||(!net.isIP(host)&&host.includes('.')&&host.length<=253&&host.split('.').every(k=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(k))))&&host!=='duckduckgo.com'&&!host.endsWith('.duckduckgo.com'),'SEARCH_URL_REJECTED','Destination must be public HTTPS');
 u.hash='';return u.href;
}
export function validateResearchSearchProvider(c){
 need(fields(c,['adapter','endpoint','queryParameter','resultsPath','urlPath','titlePath','bearerCredentialEnv']),'SEARCH_CONFIGURATION_INVALID','Exact bounded search provider configuration required');
 need(['ddg-lite-v1','json-http-v1'].includes(c.adapter),'SEARCH_CONFIGURATION_INVALID','Unsupported discovery adapter');
 if(c.adapter==='ddg-lite-v1')need(Object.keys(c).length===1,'SEARCH_CONFIGURATION_INVALID','DDG adapter has a fixed endpoint');
 else {
  const url=canonicalResearchUrl(c.endpoint);need(url===c.endpoint&&!new URL(url).search&&/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(c.queryParameter??'')&&['resultsPath','urlPath','titlePath'].every(k=>pathValid(c[k])),'SEARCH_CONFIGURATION_INVALID','Fixed endpoint, query parameter and bounded property paths required');
  if(c.bearerCredentialEnv!==undefined)need(c.bearerCredentialEnv==='WORKBENCH_RESEARCH_SEARCH_BEARER','SEARCH_CONFIGURATION_INVALID','Only fixed research-search credential environment reference supported');
 }
 return c;
}
export function researchSearchIdentity(id,c){validateResearchSearchProvider(c);return {providerId:id,adapter:c.adapter,adapterVersion:'research-search-v1',publicConfig:structuredClone(c),publicConfigHash:hash(c),parserPolicy:c.adapter==='ddg-lite-v1'?{...parserPolicy,windowBehavior:'first-50-literal-anchors'}:{maxItems:50,maxDepth:16,maxNodes:100000,maxBytes:1048576}};}
function pinnedTransport(headers){return ({url,address,family,signal,maxBytes})=>new Promise((resolve,reject)=>{
 const request=https.get(url,{agent:false,signal,headers:{'user-agent':'ProposalWorkbenchResearch/1.0',accept:'application/json','accept-encoding':'identity',...headers},lookup:(_host,options,done)=>done(null,options?.all?[{address,family}]:address,family)},response=>{
  const chunks=[];let bytes=0;response.on('data',chunk=>{bytes+=chunk.length;if(bytes>maxBytes)response.destroy(new Error('Search response exceeds cap'));else chunks.push(chunk);});response.on('error',reject);response.on('end',()=>resolve({status:response.statusCode,headers:response.headers,body:Buffer.concat(chunks)}));
 });request.on('error',reject);
});}
function jsonAnchors(raw,c){
 let v;try{v=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}catch{throw Object.assign(new Error('Invalid UTF8 JSON search response'),{code:'SEARCH_JSON_INVALID'});}
 let nodes=0;const walk=(v,depth)=>{need(++nodes<=100000&&depth<=16,'SEARCH_STRUCTURE_LIMIT','Search JSON structure exceeds bounds');if(v&&typeof v==='object')for(const x of Object.values(v))walk(x,depth+1);};walk(v,0);
 const at=(v,p)=>{for(const k of p){if(!v||typeof v!=='object'||!Object.hasOwn(v,k))return undefined;v=v[k];}return v;};
 const rows=at(v,c.resultsPath);need(Array.isArray(rows),'SEARCH_JSON_INVALID','Configured results property is not an array');
 const pointer=p=>'/'+p.map(k=>String(k).replaceAll('~','~0').replaceAll('/','~1')).join('/');
 return {anchors:rows.slice(0,50).map((row,index)=>({href:at(row,c.urlPath),title:at(row,c.titlePath),source:{kind:'json_pointer',index,pointer:pointer([...c.resultsPath,index,...c.urlPath]),titlePointer:pointer([...c.resultsPath,index,...c.titlePath])}})),window:{considered:Math.min(rows.length,50),unexamined:Math.max(rows.length-50,0),maxItems:50}};
}
export async function parseResearchDiscovery(raw,identity,{maxResults,rawSha256,captureRecordHash,query}){
 const c=identity.publicConfig;let parsed;
 if(c.adapter==='ddg-lite-v1')parsed=await parseAcquisitionSearchOriginal(raw);
 else parsed=jsonAnchors(raw,c);
 const seen=new Map();let admitted=0;
 const edges=parsed.anchors.map((a,index)=>{
  const edge={id:`edge-${hash([identity.publicConfigHash,query,rawSha256,index,a.source])}`,rank:index+1,title:typeof a.title==='string'?a.title.slice(0,1024):null,locator:a.source,rawSha256,captureRecordHash,status:'rejected',canonicalUrl:null,reason:null};
  try{
   need(typeof a.title==='string'&&a.title.trim()&&a.title.length<=1024,'SEARCH_ITEM_INVALID','Missing or oversized title');const url=canonicalResearchUrl(a.href);edge.canonicalUrl=url;
   if(seen.has(url)){edge.status='duplicate';edge.duplicateOf=seen.get(url);edge.reason='Canonical URL duplicate retained';}
   else {seen.set(url,edge.id);if(admitted>=maxResults){edge.status='result_limit';edge.reason='Result outside per-query capture selection; original and edge retained';}else {edge.status='selected';admitted++;}}
  }catch(error){edge.reason=error.code??'SEARCH_URL_REJECTED';}
  return edge;
 });
 return {edges,window:{...parsed.window,considered:edges.length},parserIdentity:identity.adapterVersion};
}

export async function retainResearchResponse(files,request,response){
 need(Buffer.isBuffer(response.body)&&response.body.length<=request.maxBytes,'SEARCH_RESPONSE_LIMIT','Actual response exceeds dispatched byte allowance');
 const data={protocol:'research-http-response-v1',url:request.url.href,pinnedAddress:request.address,status:response.status,headers:Object.fromEntries(['content-type','content-encoding','location'].filter(k=>typeof response.headers?.[k]==='string').map(k=>[k,response.headers[k]])),bodyBase64:response.body.toString('base64'),rawSha256:hash(response.body),byteLength:response.body.length,maxBytes:request.maxBytes};
 return files.putResult(data);
}
export async function verifyResearchResponses(files,refs,limit){
 need(Array.isArray(refs)&&refs.length<=1,'ACQUISITION_ORIGINAL_INVALID','At most one actual response per no-redirect dispatch');const out=[];
 for(const ref of refs){const x=await files.readResult(ref),raw=Buffer.from(x.bodyBase64,'base64');need(x.protocol==='research-http-response-v1'&&raw.toString('base64')===x.bodyBase64&&raw.length===x.byteLength&&raw.length<=limit&&x.maxBytes<=limit&&hash(raw)===x.rawSha256&&isPublicAddress(x.pinnedAddress),'ACQUISITION_ORIGINAL_INVALID','Actual bounded HTTP response original changed');out.push({...x,raw});}return out;
}

export async function discoverResearch({query,storeRoot,identity,limits},dependencies={}){
 need(typeof query==='string'&&query.trim()===query&&query.length>0&&query.length<=256&&Buffer.byteLength(query)<=1024,'SEARCH_QUERY_INVALID','Bounded trimmed query required');
 const files=createIntakeDocumentStore(storeRoot),c=identity.publicConfig;
 let capture,legacyAttempt=null,status='available',reason=null;const responseOriginals=[];const underlying=dependencies.transport??httpsTransport;const retainingTransport=async request=>{const response=await underlying(request);responseOriginals.push(await retainResearchResponse(files,request,response));return response;};
 try{
 if(c.adapter==='ddg-lite-v1'){
  const found=await searchPublicReferences({query,storeRoot,limits:{timeoutMs:limits.timeoutMs,maxBytes:limits.searchBytes,maxResults:limits.resultsPerQuery}},{...dependencies,transport:retainingTransport});
  legacyAttempt=found;
  if(found.receipt.capture)capture=await readManagedCapture(storeRoot,{recordHash:found.receipt.capture.recordSha256});
  if(!capture)status='unavailable',reason=found.receipt.reason?.code??'SEARCH_UNAVAILABLE';
 }else {
  const url=new URL(c.endpoint);url.searchParams.set(c.queryParameter,query);const headers={};
  if(c.bearerCredentialEnv){const secret=dependencies.resolveCredential?dependencies.resolveCredential(c.bearerCredentialEnv):process.env[c.bearerCredentialEnv];need(typeof secret==='string'&&secret.length>0&&secret.length<=4096&&!/[\r\n]/.test(secret),'SEARCH_CREDENTIAL_UNAVAILABLE','Configured search credential is unavailable');headers.authorization=`Bearer ${secret}`;}
  const actualTransport=dependencies.transport?request=>dependencies.transport({...request,headers}):pinnedTransport(headers);
  const transport=async request=>{const response=await actualTransport(request);if(headers.authorization){const secret=headers.authorization.slice(7);need(!response.body.includes(Buffer.from(secret))&&!JSON.stringify(response.headers).includes(secret),'SEARCH_SECRET_RESPONSE','Response contains a credential and cannot be persisted');}responseOriginals.push(await retainResearchResponse(files,request,response));return response;};
  const saved=await capturePublicSource({url:url.href,storeRoot,limits:{maxBytes:limits.searchBytes,timeoutMs:limits.timeoutMs,maxRedirects:0}},{...dependencies,transport,pdfExtractor:undefined});capture=await readManagedCapture(storeRoot,saved);
 }
 }catch(error){status='unavailable';reason=error.code??error.reasonCode??'SEARCH_CAPTURE_FAILED';}
 let parsed={edges:[],window:{considered:0,unexamined:'Search unavailable',maxItems:50},parserIdentity:identity.adapterVersion};
 if(capture){
  const allowed=c.adapter==='ddg-lite-v1'?['text/html']:['application/json'];
  if(capture.record.httpStatus!==200||!allowed.includes(capture.record.mimeType)){status='unavailable';reason='SEARCH_HTTP_OR_MIME';}
  else try{parsed=await parseResearchDiscovery(capture.raw,identity,{maxResults:limits.resultsPerQuery,rawSha256:capture.record.raw.sha256,captureRecordHash:capture.recordHash,query});}catch(error){status='unavailable';reason=error.code??error.reasonCode??'SEARCH_PARSE_FAILED';}
 }
 const outcome={status,reason,query,identity:structuredClone(identity),limits:structuredClone(limits),capture:capture?{recordHash:capture.recordHash}:null,legacyAttempt,responseOriginals,...parsed};
 const original=await files.putResult(outcome);return {outcome,original};
}
export async function verifyResearchDiscovery(storeRoot,outcome,{readBudget}={}){
 const files=createIntakeDocumentStore(storeRoot);if(readBudget){const read=files.readResult;files.readResult=ref=>{readBudget.reserve(ref?.byteLength+1);return read(ref);};}
 const responses=await verifyResearchResponses(files,outcome.responseOriginals??[],outcome.limits.searchBytes);
 if(!outcome.capture){need(outcome.status==='unavailable'&&!outcome.edges.length,'ACQUISITION_ORIGINAL_INVALID','Unavailable search cannot provide evidence');return;}
 const c=await readManagedCapture(storeRoot,outcome.capture,readBudget?.captureAccounting());need(responses.length===1&&responses[0].raw.equals(c.raw)&&responses[0].status===c.record.httpStatus&&responses[0].url===c.record.finalUrl,'ACQUISITION_ORIGINAL_INVALID','Search response differs from actual capture original');
 if(outcome.legacyAttempt){const a=outcome.legacyAttempt;const {checkedBytes}=await import('./intake-document-store.mjs');if(readBudget)readBudget.reserve(a.attemptRecord.byteLength+1);const bytes=await checkedBytes(a.attemptRecord.path,{sha256:a.attemptRecord.sha256,byteLength:a.attemptRecord.byteLength,maxBytes:4194304});need(equal(JSON.parse(bytes),a.receipt)&&a.receipt.capture?.recordSha256===c.recordHash,'ACQUISITION_ORIGINAL_INVALID','Original legacy discovery attempt changed');}
 if(outcome.status==='available'){
  const expected=await parseResearchDiscovery(c.raw,outcome.identity,{maxResults:outcome.limits.resultsPerQuery,rawSha256:c.record.raw.sha256,captureRecordHash:c.recordHash,query:outcome.query});need(equal(expected.edges,outcome.edges)&&equal(expected.window,outcome.window),'ACQUISITION_ORIGINAL_INVALID','Considered search edges do not match bounded raw response');
 }
}
