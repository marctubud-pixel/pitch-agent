import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,realpath,readFile,writeFile,readdir,chmod,rename,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createModelHttpAuthority} from './model-http-authority.mjs';
import {HTTP_JSON_PROFILE,precheckHttpJSON,parseBoundedHttpJSON,httpVariantForConfig} from './model-http-json-profile.mjs';
import {invokeOrdinary,reopenOrdinary,ordinaryHttpLocator,validOrdinaryHttpLocator,ordinarySuccess,ordinaryOriginMatches} from './ordinary-model.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const json=v=>Buffer.from(JSON.stringify(v));
const MiB=1024*1024;
const nested=n=>'['.repeat(n)+'0'+']'.repeat(n);
function completed(q,outputText='{"ok":true}'){return {protocol:q.protocol,invocationId:q.invocationId,contextMode:'stateless-v1',terminal:'completed',outputText,reportedModel:null,requestId:null,usage:{inputTokens:null,outputTokens:null}};}
async function fixture(t,handler=(q,r)=>r.end(json(completed(q))),patch={}){
 const root=await realpath(await mkdtemp('/private/tmp/http-json-profile-'));let calls=0;const wires=[];
 const server=http.createServer(async(req,res)=>{calls++;const chunks=[];for await(const chunk of req)chunks.push(chunk);const bytes=Buffer.concat(chunks);wires.push(bytes);handler(JSON.parse(bytes),res);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));console.log(JSON.stringify({retainedProfileFixture:root,calls}));});
 const cfg={adapter:'workbench-model-http-v1',endpoint:`http://127.0.0.1:${server.address().port}/model`,model:'synthetic',serviceIdentity:'owned-profile',authentication:{kind:'none'},allowLoopbackHttp:true,timeoutMs:30000,maxRequestBytes:64*MiB,maxResponseBytes:16*MiB,maxOutputBytes:2*MiB,vision:false,envelopes:[],resourceProfile:'bounded-json-v1',...patch};
 const owner=(operatorConfig=cfg,other={})=>createModelHttpAuthority({rootDir:join(root,'originals'),operatorConfig,...other});
 const call=(attemptId='owned-attempt',prompt='Owned synthetic prompt')=>({attemptId,binding:{providerId:'owned',model:cfg.model,role:'author'},request:{runId:attemptId,prompt},images:[],logicalInputBytes:json({runId:attemptId,model:cfg.model,prompt}),runtimePacketBytes:json({kind:'owned-runtime',prompt})});
 return {root,cfg,owner,call,wires,calls:()=>calls};
}
async function edit(path,bytes){await chmod(path,0o600);await writeFile(path,bytes);}
async function noReply(f,result){const dir=join(f.root,'originals',result.attemptLocator.rootRelativePath),files=await readdir(dir);for(const name of ['response.bin','output.json','manifest.json'])assert.equal(files.includes(name),false,name);}
async function observeParse(operation,forbidden){const original=JSON.parse;let entries=0;JSON.parse=function(text,...rest){if(forbidden(String(text)))entries++;return original.call(this,text,...rest);};try{const result=await operation();assert.equal(entries,0,'over-limit candidate reached JSON.parse');return result;}finally{JSON.parse=original;}}

test('fixed scanner boundaries count containers and delimiters outside correctly escaped strings',()=>{
 assert.equal(precheckHttpJSON(nested(128)).depth,128);assert.throws(()=>precheckHttpJSON(nested(129)),{code:'size'});
 const exact='['+'0,'.repeat(199998)+'0]';assert.equal(precheckHttpJSON(exact).structuralCharacters,200000);assert.throws(()=>precheckHttpJSON(exact.replace('0]','0,0]')),{code:'size'});
 for(const value of ['quotes " and \\ and []{}:,',String.raw`odd \" quote`,String.raw`even \\`, '中文😀\u0000', '\ud800'])assert.deepEqual(parseBoundedHttpJSON(JSON.stringify({value})),{value});
 assert.deepEqual(parseBoundedHttpJSON('{"\\u0061":["[,]{}:\\\"",0]}'),{a:['[,]{}:"',0]});
 for(const invalid of ['{','[}', '"unterminated', '"escaped\\"','[1,]','{"x":}'])assert.throws(()=>parseBoundedHttpJSON(invalid));
 assert.equal(precheckHttpJSON('[1,]').depth,1);
});

test('exact two-method API, closed profile config and v2 saved tuple do not change gateway grammar',async t=>{
 const f=await fixture(t),c=f.call(),owner=f.owner();assert.deepEqual(Object.keys(owner),['invoke','reopen']);
 for(const resourceProfile of [undefined,null,'unknown',{},false]){const result=await f.owner({...f.cfg,resourceProfile}).invoke(c);assert.equal(result.kind,'refused');}
 assert.equal((await f.owner({...f.cfg,unknown:1}).invoke(c)).kind,'refused');assert.equal(f.calls(),0);
 const out=await owner.invoke(c);assert.equal(out.kind,'verified');const saved=out.savedExecution,locator=ordinaryHttpLocator(c.attemptId,f.cfg);
 assert.equal(saved.protocol,'workbench-model-http-original-v2');assert.equal(saved.original.rootRelativePath,hash(c.attemptId)+'/bounded-json-v1');assert.equal(ordinarySuccess(saved),true);assert.equal(validOrdinaryHttpLocator(locator,c.attemptId),true);
 assert.equal(f.wires[0].includes(Buffer.from('resourceProfile')),false);
 const m=JSON.parse(await readFile(join(f.root,'originals',saved.original.rootRelativePath,'manifest.json')));assert.deepEqual(m.config,f.cfg);assert.equal(m.configurationHash,hash(json(f.cfg)));assert.equal(m.origin,saved.protocol);
 const before=f.calls();for(const cfg of [null,{...f.cfg,model:'unrelated',resourceProfile:'unknown'}]){assert.deepEqual((await f.owner(cfg,{environment:{}}).reopen({...c,savedExecution:saved})).savedExecution,saved);assert.deepEqual((await f.owner(cfg,{environment:{}}).reopen({...c,attemptLocator:locator})).savedExecution,saved);}assert.equal(f.calls(),before);
 for(const patch of [{kind:'http-attempt-locator-v1'},{protocol:'workbench-model-http-original-v1'},{rootRelativePath:hash(c.attemptId)},{extra:1}])await assert.rejects(owner.reopen({...c,attemptLocator:{...locator,...patch}}));
 await assert.rejects(owner.reopen({...c,savedExecution:{...saved,original:{rootRelativePath:saved.original.rootRelativePath}},attemptLocator:locator}));
});

test('UTF8 output and configured body limits admit exact bytes and reject plus one before retention',async t=>{
 const output=JSON.stringify('中文😀');
 for(const delta of [0,-1]){const f=await fixture(t,(q,r)=>r.end(json(completed(q,output))),{maxOutputBytes:Buffer.byteLength(output)+delta});const result=await f.owner().invoke(f.call());assert.equal(result.kind,delta===0?'verified':'unknown');if(delta)await noReply(f,result);}
 for(const delta of [0,1]){const f=await fixture(t,(_q,r)=>{r.statusCode=429;r.end('"'+'x'.repeat(1022+delta)+'"');},{maxResponseBytes:1024});const result=await f.owner().invoke(f.call());assert.equal(result.kind,delta===0?'rejected':'unknown');if(delta)await noReply(f,result);}
 for(const delta of [0,1]){const f=await fixture(t,(_q,r)=>{r.statusCode=429;r.end('"'+'x'.repeat(16*MiB-2+delta)+'"');},{maxResponseBytes:64*MiB});const result=await f.owner().invoke(f.call());assert.equal(result.kind,delta===0?'rejected':'unknown');if(delta)await noReply(f,result);}
 const full=JSON.stringify('a'.repeat(2*MiB-2)),f=await fixture(t,(q,r)=>r.end(json(completed(q,full))));assert.equal((await f.owner().invoke(f.call())).kind,'verified');
 const too=await fixture(t,(q,r)=>r.end(json(completed(q,full+' '))));const result=await observeParse(()=>too.owner().invoke(too.call()),text=>text===full+' ');assert.equal(result.kind,'unknown');await noReply(too,result);
});

test('body, output, recursive strings and non200 responses are guarded before parser entry',async t=>{
 for(const authentication of [{kind:'none'},{kind:'bearer-env',name:'SYNTHETIC_TOKEN'}])for(const scenario of ['body','output','nested','non200']){
  const deep=nested(129);let forbidden='';const f=await fixture(t,(q,r)=>{const body=scenario==='body'?deep:scenario==='nested'?JSON.stringify({inner:JSON.stringify({nested:deep})}):scenario==='non200'?JSON.stringify({inner:deep}):JSON.stringify(completed(q,deep));if(scenario==='non200'||scenario==='nested')r.statusCode=400;forbidden=scenario==='body'?body:deep;r.end(body);},{authentication});
  const result=await observeParse(()=>f.owner(f.cfg,{environment:{SYNTHETIC_TOKEN:'synthetic-secret'}}).invoke(f.call()),text=>text===forbidden&&forbidden!=='');assert.equal(result.kind,'unknown',scenario);await noReply(f,result);
 }
});

test('secret work and entry exhaustion retain only bounded unknown and never redispatch',async t=>{
 let nestedText='x'.repeat(10*MiB);for(let i=0;i<7;i++)nestedText=JSON.stringify(nestedText);
 for(const response of [nestedText,JSON.stringify(Array.from({length:100001},()=>0))]){
  const f=await fixture(t,(_q,r)=>{r.statusCode=400;r.end(response);});const result=await f.owner().invoke(f.call());assert.equal(result.kind,'unknown');assert.equal(result.code,'size');await noReply(f,result);assert.equal((await f.owner().invoke(f.call())).kind,'unknown');assert.equal(f.calls(),1);
 }
 const secret='SYNTHETIC_ESCAPED_SECRET',escaped=[...secret].map(c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0')).join('');
 const f=await fixture(t,(_q,r)=>{r.statusCode=400;r.end(JSON.stringify({inner:'{"'+escaped+'":1}'}));},{authentication:{kind:'bearer-env',name:'SYNTHETIC_TOKEN'}});const result=await f.owner(f.cfg,{environment:{SYNTHETIC_TOKEN:secret}}).invoke(f.call());assert.equal(result.code,'secret-echo');await noReply(f,result);
});

test('request inspections have separate input allowances and do not inherit the body ceiling',async t=>{
 const f=await fixture(t),c=f.call('large-input','x'.repeat(17*MiB));assert.equal((await f.owner().invoke(c)).kind,'verified');assert.ok(f.wires[0].length>16*MiB);
 const deep=nested(129),blocked=f.call('deep-runtime');blocked.runtimePacketBytes=Buffer.from(deep);const before=f.calls();const result=await observeParse(()=>f.owner().invoke(blocked),text=>text===deep);assert.equal(result.kind,'refused');assert.equal(f.calls(),before);
});

test('large operator metadata cannot exhaust a reserved manifest after dispatch',async t=>{
 const f=await fixture(t),large={...f.cfg,endpoint:f.cfg.endpoint+'x'.repeat(5*MiB)};const result=await f.owner(large).invoke(f.call());assert.equal(result.kind,'refused');assert.equal(result.code,'size');assert.equal(f.calls(),0);assert.deepEqual(await readdir(f.root),[]);
});

test('fully escaped decoded output is refused as grammar or size without output retention',async t=>{
 for(const delta of [0,1]){
  const output='\u0001'.repeat(2*MiB+delta);assert.equal(Buffer.byteLength(JSON.stringify(output)),6*(2*MiB+delta)+2);
  const f=await fixture(t,(q,r)=>r.end(json(completed(q,output))));const result=delta?await observeParse(()=>f.owner().invoke(f.call()),text=>text===output):await f.owner().invoke(f.call());assert.equal(result.kind,'unknown');await noReply(f,result);
 }
});

test('one attempt claim spans both profiles, concurrency and every interrupted durability point',async t=>{
 for(const firstBounded of [false,true]){
  const f=await fixture(t),legacy={...f.cfg};delete legacy.resourceProfile;const first=firstBounded?f.cfg:legacy,second=firstBounded?legacy:f.cfg;assert.equal((await f.owner(first).invoke(f.call())).kind,'verified');assert.equal((await f.owner(second).invoke(f.call())).kind,'unknown');assert.equal(f.calls(),1);
 }
 const f=await fixture(t,async(q,r)=>{await new Promise(resolve=>setTimeout(resolve,20));r.end(json(completed(q)));}),legacy={...f.cfg};delete legacy.resourceProfile;const results=await Promise.all([f.owner().invoke(f.call()),f.owner(legacy).invoke(f.call())]);assert.equal(results.filter(r=>r.kind==='verified').length,1);assert.equal(f.calls(),1);
 for(const point of ['logical.json','runtime.json','wire.json','intent.json','intent-synced','status.json','response.bin','output.json','manifest.json','manifest-synced']){
  const f=await fixture(t),result=await f.owner(f.cfg,{failpoint:name=>{if(name===point)throw Error('owned interruption');}}).invoke(f.call());assert.equal(result.kind,'unknown');const count=f.calls();
  if(point.startsWith('manifest'))assert.equal((await f.owner(null,{environment:{}}).reopen({...f.call(),attemptLocator:result.attemptLocator})).kind,'verified');else await assert.rejects(f.owner(null).reopen({...f.call(),attemptLocator:result.attemptLocator}));
  assert.equal((await f.owner().invoke(f.call())).kind,point.startsWith('manifest')?'verified':'unknown');assert.equal(f.calls(),count);
 }
});

test('fresh physical reads reject changed identities, descriptors and malformed manifests with no legacy fallback',async t=>{
 const f=await fixture(t),c=f.call(),result=await f.owner().invoke(c),saved=result.savedExecution,locator=ordinaryHttpLocator(c.attemptId,f.cfg),dir=join(f.root,'originals',locator.rootRelativePath),path=join(dir,'manifest.json'),original=await readFile(path),manifest=JSON.parse(original);
 const mutate=[m=>{delete m.config.resourceProfile;},m=>{m.config.resourceProfile=null;},m=>{m.config.resourceProfile='other';},m=>{m.origin='workbench-model-http-original-v1';},m=>{m.configurationHash='0'.repeat(64);},m=>{m.body.sha256='0'.repeat(64);},m=>{m.output.byteLength++;},m=>{m.result.outputText='{}';}];
 for(const change of mutate){const m=structuredClone(manifest);change(m);await edit(path,json(m));await assert.rejects(f.owner(null).reopen({...c,attemptLocator:locator}));await edit(path,original);assert.equal((await f.owner(null).reopen({...c,savedExecution:saved})).kind,'verified');}
 for(const bytes of [Buffer.from('{"origin":'+nested(129)+'}'),Buffer.from('{"origin":1,"origin":2}'),Buffer.from('{"\\u006frigin":1}'),original.subarray(0,original.length-1),Buffer.alloc(16*MiB+1,32)]){await edit(path,bytes);await observeParse(()=>assert.rejects(f.owner(null).reopen({...c,attemptLocator:locator})),text=>bytes.length>16*MiB||bytes.includes(Buffer.from(nested(129)))?text===bytes.toString():false);}
 await edit(path,original);
 for(const name of ['intent.json','status.json','response.bin','output.json','logical.json','runtime.json','wire.json']){const p=join(dir,name),bytes=await readFile(p);await edit(p,Buffer.concat([bytes,Buffer.from('x')]));await assert.rejects(f.owner(null).reopen({...c,savedExecution:saved}));await edit(p,bytes);}
 for(const key of ['intent','status']){const p=join(dir,key+'.json'),bytes=await readFile(p),deep=Buffer.from(nested(129)),m=structuredClone(manifest);m[key]={path:key+'.json',byteLength:deep.length,sha256:hash(deep)};await edit(p,deep);await edit(path,json(m));await observeParse(()=>assert.rejects(f.owner(null).reopen({...c,attemptLocator:locator})),text=>text===deep.toString());await edit(p,bytes);await edit(path,original);}
 for(const delta of [0,1]){const bytes=Buffer.from('{}'+' '.repeat(HTTP_JSON_PROFILE.manifestBytes-2+delta));await edit(path,bytes);let parses=0;const parse=JSON.parse;JSON.parse=function(text,...args){if(text===bytes.toString())parses++;return parse.call(this,text,...args);};try{await assert.rejects(f.owner(null).reopen({...c,attemptLocator:locator}));assert.equal(parses,delta===0?1:0);}finally{JSON.parse=parse;}await edit(path,original);}
 const intentPath=join(dir,'intent.json'),intentBytes=await readFile(intentPath),m=structuredClone(manifest),intent=JSON.parse(intentBytes);intent.origin='workbench-model-http-original-v1';await edit(intentPath,json(intent));m.intent.byteLength=json(intent).length;m.intent.sha256=hash(json(intent));await edit(path,json(m));await assert.rejects(f.owner(null).reopen({...c,attemptLocator:locator}));await edit(intentPath,intentBytes);await edit(path,original);
 await rename(path,path+'.retained');await assert.rejects(f.owner(null).reopen({...c,savedExecution:saved}));await rename(path+'.retained',path);
 await rename(dir,dir+'.retained');await symlink(dir+'.retained',dir);await assert.rejects(f.owner(null).reopen({...c,savedExecution:saved}));assert.equal(f.calls(),1);
});

test('ordinary adapter persists v2 locator before dispatch and rejects crossed receipt/locator pairs',async t=>{
 const f=await fixture(t),c=f.call(),call={executionRoot:f.root,provider:{adapter:f.cfg.adapter,model:f.cfg.model,operatorConfig:f.cfg},binding:c.binding,attemptId:c.attemptId,request:c.request,runtimePacketBytes:c.runtimePacketBytes,persistLocator:async locator=>{assert.equal(f.calls(),0);assert.deepEqual(locator,ordinaryHttpLocator(c.attemptId,f.cfg));}};
 const receipt=await invokeOrdinary(call),locator=ordinaryHttpLocator(c.attemptId,f.cfg);assert.deepEqual(await reopenOrdinary({...call,provider:undefined,receipt,attemptLocator:locator}),receipt);assert.equal(ordinaryOriginMatches(receipt,locator,c.attemptId),true);
 const legacyLocator=ordinaryHttpLocator(c.attemptId),legacyReceipt={...receipt,protocol:legacyLocator.protocol,original:{...receipt.original,rootRelativePath:legacyLocator.rootRelativePath}};legacyReceipt.providerExecution={...legacyReceipt};delete legacyReceipt.providerExecution.providerExecution;delete legacyReceipt.providerExecution.model;
 assert.equal(ordinarySuccess(legacyReceipt),true);
 assert.equal(ordinaryOriginMatches(receipt,legacyLocator,c.attemptId),false);assert.equal(ordinaryOriginMatches(legacyReceipt,locator,c.attemptId),false);
 for(const [r,l] of [[receipt,legacyLocator],[legacyReceipt,locator]])await assert.rejects(reopenOrdinary({...call,receipt:r,attemptLocator:l}));
 const deep={...receipt,responseText:nested(129),providerExecution:{...receipt.providerExecution,responseText:nested(129)}};assert.equal(ordinarySuccess(deep),false);
 for(const patch of [{provider:'unknown'},{protocol:legacyLocator.protocol},{original:{rootRelativePath:locator.rootRelativePath}}])assert.equal(ordinarySuccess({...receipt,...patch}),false);
 assert.equal(f.calls(),1);
});
