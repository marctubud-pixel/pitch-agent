import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,readFile,writeFile,readdir,rm,symlink,realpath,chmod} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createModelHttpAuthority} from './model-http-authority.mjs';
import {imageManifest} from './image-evidence.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const json=x=>Buffer.from(JSON.stringify(x));
const protocol='workbench-stateless-model-json-v1';
async function fixture(t,handler){
 const root=await realpath(await mkdtemp(join(tmpdir(),'model-http-u1-')));let count=0;const requests=[];
 const server=http.createServer(async(req,res)=>{count++;const chunks=[];for await(const b of req)chunks.push(b);const body=Buffer.concat(chunks);requests.push({body,headers:req.headers});try{await handler(JSON.parse(body),res,req);}catch{res.destroy();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));await rm(root,{recursive:true,force:true});});
 const cfg={adapter:'workbench-model-http-v1',endpoint:`http://127.0.0.1:${server.address().port}/model`,model:'synthetic-model',serviceIdentity:'synthetic-service',authentication:{kind:'none'},allowLoopbackHttp:true,timeoutMs:1000,maxRequestBytes:2*1024*1024,maxResponseBytes:1024*1024,maxOutputBytes:16384,vision:true,envelopes:['sketch-review-v2','final-visual-v1','complete-content-v1']};
 return {root,cfg,requests,count:()=>count,owner:(options={})=>createModelHttpAuthority({rootDir:join(root,'originals'),operatorConfig:cfg,...options})};
}
function completed(req,patch={}){return {protocol,invocationId:req.invocationId,contextMode:'stateless-v1',terminal:'completed',outputText:'{"ok":true}',reportedModel:'reported-other',requestId:'metadata',usage:{inputTokens:null,outputTokens:2},...patch};}
function reply(req,res){res.end(json(completed(req)));}
function call(cfg,patch={}){const request={runId:'run-one',prompt:'Synthetic prompt',outputSchema:{type:'object'}};const binding={providerId:'synthetic',model:cfg.model,role:'worker'};const images=patch.images??[];const imageEnvelope=patch.imageEnvelope;if(imageEnvelope)request.imageEnvelope=imageEnvelope;const logical={runId:request.runId,model:cfg.model,prompt:request.prompt,outputSchema:request.outputSchema,...(images.length?{images:imageManifest(images,imageEnvelope)}:{}),...(imageEnvelope?{imageEnvelope}:{})};return {attemptId:'attempt-one',binding,request,images,logicalInputBytes:json(logical),runtimePacketBytes:Buffer.from(JSON.stringify({attemptId:'attempt-one',task:'synthetic',request},null,2)),...patch};}
async function walk(path){const out=[];for(const e of await readdir(path,{withFileTypes:true})){const p=join(path,e.name);if(e.isDirectory())out.push(...await walk(p));else out.push(await readFile(p));}return out;}

test('physical invoke, exact three bytes, stateless echo and credential-free persisted-origin reopen',async t=>{
 const f=await fixture(t,reply);const c=call(f.cfg);const result=await f.owner().invoke(c);assert.equal(result.kind,'verified');const s=result.savedExecution;assert.equal(s.cost,null);assert.equal(s.reportedModel,'reported-other');for(const k of ['exitCode','threadId','stdout'])assert.equal(Object.hasOwn(s,k),false);
 assert.notEqual(s.inputPacketHash,s.runtimePacketHash);assert.notEqual(s.inputPacketHash,s.wireRequestHash);assert.notEqual(s.runtimePacketHash,s.wireRequestHash);
 const dir=join(f.root,'originals',s.original.rootRelativePath);assert.deepEqual(await readFile(join(dir,'logical.json')),c.logicalInputBytes);assert.deepEqual(await readFile(join(dir,'runtime.json')),c.runtimePacketBytes);assert.deepEqual(await readFile(join(dir,'wire.json')),f.requests[0].body);
 const reopened=await f.owner({operatorConfig:undefined,environment:{}}).reopen({...c,savedExecution:s});assert.deepEqual(reopened.savedExecution,s);assert.equal(f.count(),1);
 assert.equal((await f.owner({operatorConfig:{...f.cfg,model:'replacement'}}).reopen({...c,savedExecution:s})).kind,'verified');
 assert.equal((await f.owner().invoke(c)).kind,'verified');assert.equal(f.count(),1);
 await assert.rejects(f.owner().reopen({...c,runtimePacketBytes:Buffer.from('altered'),savedExecution:s}));
 await assert.rejects(f.owner().reopen({...c,savedExecution:{...s,protocol:'unknown'}}));
});

test('ordered actual PNG/JPEG occurrences including repeated bytes, finite envelopes',async t=>{
 const f=await fixture(t,reply);const images=[];
 for(const [i,format] of ['PNG','JPEG','PNG'].entries()){
 const b=execFileSync('python3',['-c',`from PIL import Image\nimport io,sys\nf=io.BytesIO();Image.new('RGB',(3,2),'red').save(f,format='${format}');sys.stdout.buffer.write(f.getvalue())`]);const path=join(f.root,`input-${i}`);await writeFile(path,b);images.push({imageId:`img_${i}`,sha256:hash(b),mediaType:format==='PNG'?'image/png':'image/jpeg',byteLength:b.length,path});}
 const c=call(f.cfg,{images,imageEnvelope:{operation:'complete-content-v1',limits:{maxImages:3,maxBytes:10000,maxPixels:18}}});const out=await f.owner().invoke(c);assert.equal(out.kind,'verified');const w=JSON.parse(f.requests[0].body);assert.deepEqual(w.images.map(x=>[x.occurrence,x.width,x.height,x.mediaType]),[[0,3,2,'image/png'],[1,3,2,'image/jpeg'],[2,3,2,'image/png']]);assert.equal(w.images[0].base64,w.images[2].base64);
 const imagePath=join(f.root,'originals',out.savedExecution.original.rootRelativePath,'image-1.jpg');const original=await readFile(imagePath);await chmod(imagePath,0o600);await writeFile(imagePath,Buffer.concat([original,Buffer.from('bad')]));await assert.rejects(f.owner().reopen({...c,savedExecution:out.savedExecution}));await writeFile(imagePath,original);assert.equal((await f.owner().reopen({...c,savedExecution:out.savedExecution})).kind,'verified');
 assert.equal((await f.owner({operatorConfig:{...f.cfg,vision:false}}).invoke({...c,attemptId:'no-vision'})).kind,'refused');
 const tiny=call(f.cfg,{images,imageEnvelope:{operation:'complete-content-v1',limits:{maxImages:3,maxBytes:10000,maxPixels:17}}});assert.equal((await f.owner().invoke({...tiny,attemptId:'too-many-pixels'})).kind,'refused');assert.equal(f.count(),1);
});

test('every physical file mutation after successful first read fails without HTTP',async t=>{
 const f=await fixture(t,reply);const c=call(f.cfg);const out=await f.owner().invoke(c);assert.equal(out.kind,'verified');const args={...c,savedExecution:out.savedExecution};const dir=join(f.root,'originals',out.savedExecution.original.rootRelativePath);
 for(const name of await readdir(dir)){const p=join(dir,name);const b=await readFile(p);await chmod(p,0o600);await writeFile(p,Buffer.concat([b,Buffer.from('x')]));await assert.rejects(f.owner().reopen(args),name);await writeFile(p,b);assert.equal((await f.owner().reopen(args)).kind,'verified');}
 const p=join(dir,'response.bin'),b=await readFile(p);await rm(p);await symlink(join(f.root,'elsewhere'),p);await assert.rejects(f.owner().reopen(args));await rm(p);await writeFile(p,b);assert.equal(f.count(),1);
});

test('configuration, credential and logical mismatch refuse before dispatch',async t=>{
 const f=await fixture(t,reply);const c=call(f.cfg);
 for(const cfg of [{...f.cfg,extra:1},{...f.cfg,endpoint:'http://localhost:123/a'},{...f.cfg,allowLoopbackHttp:false},{...f.cfg,endpoint:'https://a.test/?secret=x'},{...f.cfg,authentication:{kind:'bearer-env',name:'TOKEN'}}]){
 const out=await f.owner({operatorConfig:cfg,environment:{}}).invoke(c);assert.equal(out.kind,'refused');}
 assert.equal((await f.owner().invoke({...c,logicalInputBytes:Buffer.from('{}')})).kind,'refused');assert.equal(f.count(),0);
});

test('strict failures, bounded retention, zero automatic redispatch',async t=>{
 const cases=[['malformed',(_q,r)=>r.end('{')],['utf8',(_q,r)=>r.end(Buffer.from([255]))],['identity',(q,r)=>r.end(json(completed(q,{invocationId:'wrong'})))],['unknown-field',(q,r)=>r.end(json({...completed(q),extra:1}))],['bad-output',(q,r)=>r.end(json(completed(q,{outputText:'not-json'})))],['oversized',(_q,r)=>r.end(Buffer.alloc(1024*1024+1,65))],['encoding',(_q,r)=>{r.setHeader('Content-Encoding','gzip');r.end('abc');}],['deadline',()=>{}],['invalid-utf8-rejection',(_q,r)=>{r.statusCode=400;r.end(Buffer.from([255]));}],['connection',(_q,r)=>r.destroy()],['duplicate-keys',(q,r)=>r.end(Buffer.from(JSON.stringify(completed(q)).replace('"terminal":"completed"','"terminal":"bad","terminal":"completed"')))]];
 for(const [name,handler] of cases)await t.test(name,async t=>{const f=await fixture(t,handler);const c={...call(f.cfg),timeoutMs:50};const out=await f.owner().invoke(c);assert.equal(out.kind,'unknown');assert.equal((await f.owner().invoke(c)).kind,'unknown');assert.equal(f.count(),1);});
});

test('complete explicit rejection is durable and credential-free, never success',async t=>{const f=await fixture(t,(_q,r)=>{r.statusCode=429;r.end('Synthetic rejected');});const c=call(f.cfg);const out=await f.owner().invoke(c);assert.equal(out.kind,'rejected');assert.equal((await f.owner({operatorConfig:undefined}).reopen({...c,savedExecution:out.savedFailure})).kind,'rejected');assert.equal((await f.owner().invoke(c)).kind,'rejected');assert.equal(f.count(),1);});

test('secret raw and escaped echoes never persist any response bytes',async t=>{
 for(const escaped of [false,true])await t.test(String(escaped),async t=>{const secret='SYNTHETIC_SECRET_567';const f=await fixture(t,(q,r)=>{let s=JSON.stringify(completed(q,{outputText:JSON.stringify({echo:secret})}));if(escaped)s=s.replaceAll(secret,[...secret].map(x=>'\\u'+x.charCodeAt(0).toString(16).padStart(4,'0')).join(''));r.end(s);});const cfg={...f.cfg,authentication:{kind:'bearer-env',name:'SYNTHETIC_TOKEN'}};const out=await f.owner({operatorConfig:cfg,environment:{SYNTHETIC_TOKEN:secret}}).invoke(call(cfg));assert.equal(out.kind,'unknown');assert.equal(out.code,'secret-echo');await assert.rejects(f.owner({operatorConfig:undefined,environment:{}}).reopen({...call(cfg),attemptLocator:out.attemptLocator}));const files=await walk(join(f.root,'originals'));assert.equal(files.some(b=>b.includes(Buffer.from(secret))),false);const dirs=await readdir(join(f.root,'originals'));assert.equal((await readdir(join(f.root,'originals',dirs[0]))).includes('response.bin'),false);});
});

test('abort and concurrent exclusive claims produce at most one dispatch',async t=>{const f=await fixture(t,async(q,r)=>{await new Promise(resolve=>setTimeout(resolve,30));reply(q,r);});const c=call(f.cfg);const both=await Promise.all([f.owner().invoke(c),f.owner().invoke(c)]);assert.equal(both.filter(x=>x.kind==='verified').length,1);assert.equal(f.count(),1);const controller=new AbortController();controller.abort();assert.equal((await f.owner().invoke({...c,attemptId:'abort-before',signal:controller.signal})).kind,'refused');const pending=f.owner().invoke({...c,attemptId:'abort-during',signal:(()=>{const a=new AbortController();setTimeout(()=>a.abort(),10);return a.signal;})()});assert.equal((await pending).kind,'unknown');});

test('failpoints at every durability boundary never cause redispatch',async t=>{
 const points=['logical.json','runtime.json','wire.json','intent.json','intent-synced','status.json','response.bin','output.json','manifest.json','manifest-synced'];
 for(const point of points)await t.test(point,async t=>{const f=await fixture(t,reply);const c=call(f.cfg);let hit=false;const a=f.owner({failpoint:name=>{if(name===point){hit=true;throw new Error('synthetic crash');}}});assert.equal((await a.invoke(c)).kind,'unknown');assert.equal(hit,true);const count=f.count();const again=await f.owner().invoke(c);assert.equal(again.kind,point.startsWith('manifest')?'verified':'unknown');assert.equal(f.count(),count);assert.ok(count<=1);});
});

test('non-authoritative locator recovers committed terminal without config or credential and rejects downgrade',async t=>{
 const f=await fixture(t,reply);const cfg={...f.cfg,authentication:{kind:'bearer-env',name:'SYNTHETIC_TOKEN'}};const c=call(cfg);const out=await f.owner({operatorConfig:cfg,environment:{SYNTHETIC_TOKEN:'only-synthetic-credential'},failpoint:name=>{if(name==='manifest-synced')throw new Error('synthetic crash');}}).invoke(c);assert.equal(out.kind,'unknown');const a=f.owner({operatorConfig:undefined,environment:{}});const recovered=await a.reopen({...c,attemptLocator:out.attemptLocator});assert.equal(recovered.kind,'verified');assert.equal(f.count(),1);
 for(const patch of [{protocol:'unknown'},{attemptId:'wrong'},{rootRelativePath:'../escape'},{kind:'other'},{manifestHash:null}])await assert.rejects(a.reopen({...c,attemptLocator:{...out.attemptLocator,...patch}}));
 for(const manifestHash of [undefined,null,'0'.repeat(64)])await assert.rejects(a.reopen({...c,savedExecution:{...recovered.savedExecution,original:{...recovered.savedExecution.original,manifestHash}}}));
 await assert.rejects(a.reopen({...c,savedExecution:recovered.savedExecution,attemptLocator:out.attemptLocator}));
 const rejected=await f.owner({operatorConfig:cfg,environment:{SYNTHETIC_TOKEN:'only-synthetic-credential'},failpoint:name=>{if(name==='intent-synced')throw new Error('before-network');}}).invoke({...c,attemptId:'incomplete'});await assert.rejects(a.reopen({...c,attemptId:'incomplete',attemptLocator:rejected.attemptLocator}));assert.equal(f.count(),1);
});


test('escaped credential in decoded JSON property names cannot enter rejection originals',async t=>{
 const secret='SYNTHETIC_PROPERTY_SECRET';const f=await fixture(t,(_q,r)=>{r.statusCode=400;const encoded=[...secret].map(x=>'\\u'+x.charCodeAt(0).toString(16).padStart(4,'0')).join('');r.end('{"'+encoded+'":"safe"}');});const cfg={...f.cfg,authentication:{kind:'bearer-env',name:'SYNTHETIC_TOKEN'}};const out=await f.owner({operatorConfig:cfg,environment:{SYNTHETIC_TOKEN:secret}}).invoke(call(cfg));assert.equal(out.kind,'unknown');assert.equal(out.code,'secret-echo');
});
