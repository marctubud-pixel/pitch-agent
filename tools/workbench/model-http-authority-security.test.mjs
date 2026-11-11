import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,realpath,readdir,readFile,rm,writeFile} from 'node:fs/promises';
import {execFileSync,spawn} from 'node:child_process';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const modulePath=process.env.MODEL_HTTP_U1_MODULE??fileURLToPath(new URL('./model-http-authority.mjs',import.meta.url));
const {createModelHttpAuthority}=await import(modulePath);
const hash=b=>createHash('sha256').update(b).digest('hex');
const j=x=>Buffer.from(JSON.stringify(x));
const secret='ONLY_SYNTHETIC_SPEC_SECRET_901';
async function fixture(t,handler){
 const root=await realpath(await mkdtemp('/private/tmp/u1-fix-security-'));let count=0;
 const server=http.createServer(async(req,res)=>{count++;const chunks=[];for await(const b of req)chunks.push(b);handler(JSON.parse(Buffer.concat(chunks)),res);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));await rm(root,{recursive:true,force:true});});
 const cfg={adapter:'workbench-model-http-v1',endpoint:`http://127.0.0.1:${server.address().port}/`,model:'SYN',serviceIdentity:'SYN-service',authentication:{kind:'bearer-env',name:'SYN_TOKEN'},allowLoopbackHttp:true,timeoutMs:1000,maxRequestBytes:1048576,maxResponseBytes:4096,maxOutputBytes:512,vision:true,envelopes:[]};
 const make=attemptId=>({attemptId,binding:{providerId:'SYN',model:'SYN',role:'SYN'},request:{runId:'SYN-run',prompt:'SYN prompt'},images:[],logicalInputBytes:j({runId:'SYN-run',model:'SYN',prompt:'SYN prompt'}),runtimePacketBytes:Buffer.from('SYN runtime unchanged')});
 return {root,cfg,make,count:()=>count,owner:(rootDir=join(root,'originals'))=>createModelHttpAuthority({rootDir,operatorConfig:cfg,environment:{SYN_TOKEN:secret}})};
}
const success=(q,r)=>r.end(j({protocol:q.protocol,invocationId:q.invocationId,contextMode:q.contextMode,terminal:'completed',outputText:'{"ok":1}',reportedModel:null,requestId:null,usage:{inputTokens:null,outputTokens:null}}));

test('review P1 exact malformed non200 Unicode-escaped credential leaves no response or terminal manifest',async t=>{
 const escaped=[...secret].map(c=>'\\u'+c.charCodeAt().toString(16).padStart(4,'0')).join('');
 const f=await fixture(t,(_q,r)=>{r.statusCode=400;r.end('{"echo":"'+escaped+'"} trailing');});
 const c=f.make('SYN-malformed-secret'),result=await f.owner().invoke(c);
 assert.equal(result.kind,'unknown');
 const names=await readdir(join(f.root,'originals',hash(c.attemptId)));
 assert.equal(names.includes('response.bin'),false);assert.equal(names.includes('manifest.json'),false);
 for(const name of names){const b=await readFile(join(f.root,'originals',hash(c.attemptId),name));assert.equal(b.includes(Buffer.from(secret)),false);assert.equal(b.includes(Buffer.from(escaped)),false);}
 assert.equal((await f.owner().invoke(c)).kind,'unknown');assert.equal(f.count(),1);
 await assert.rejects(createModelHttpAuthority({rootDir:join(f.root,'originals')}).reopen({...c,attemptLocator:result.attemptLocator}));
});

test('review P2 exact credential-valued attemptId refuses before any managed filesystem effects',async t=>{
 const f=await fixture(t,success);const c=f.make(secret);const result=await f.owner().invoke(c);
 assert.equal(result.kind,'refused');assert.equal(result.code,'secret-echo');assert.equal(Object.hasOwn(result,'attemptLocator'),false);
 assert.deepEqual(await readdir(f.root),[]);assert.equal(f.count(),0);
});

test('review P2 actual FIFO source refuses in owned child without parent forced timeout or network effects',async t=>{
 const root=await realpath(await mkdtemp('/private/tmp/u1-fix-fifo-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const fifo=join(root,'input.png');execFileSync('mkfifo',[fifo]);
 let count=0;const server=http.createServer((_q,r)=>{count++;r.end('{}');});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));});
 const script=`import {createModelHttpAuthority} from ${JSON.stringify(modulePath)};const cfg={adapter:'workbench-model-http-v1',endpoint:'http://127.0.0.1:${server.address().port}/',model:'SYN',serviceIdentity:'SYN',authentication:{kind:'none'},allowLoopbackHttp:true,timeoutMs:20,maxRequestBytes:4096,maxResponseBytes:4096,maxOutputBytes:100,vision:true,envelopes:[]};const images=[{imageId:'img',sha256:'0'.repeat(64),mediaType:'image/png',byteLength:1,path:${JSON.stringify(fifo)}}];console.log('enter-invoke');console.log(JSON.stringify(await createModelHttpAuthority({rootDir:${JSON.stringify(join(root,'originals'))},operatorConfig:cfg}).invoke({attemptId:'SYN',binding:{providerId:'SYN',model:'SYN',role:'SYN'},request:{runId:'SYN',prompt:'SYN'},images,logicalInputBytes:Buffer.from('{}'),runtimePacketBytes:Buffer.from('SYN')})));`;
 const child=spawn(process.execPath,['--input-type=module','-e',script],{stdio:['ignore','pipe','pipe']});let output='',error='',forced=false;
 child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>error+=b);
 const timer=setTimeout(()=>{forced=true;child.kill('SIGKILL');},1000);
 const closed=await new Promise(r=>child.on('close',(code,signal)=>r({code,signal})));clearTimeout(timer);
 assert.equal(forced,false,JSON.stringify({output,error,closed}));assert.equal(closed.code,0,error);assert.match(output,/"kind":"refused"/);assert.equal(count,0);assert.deepEqual(await readdir(root),['input.png']);
});

test('complete authenticated canonical JSON rejection remains durable and reopens without credentials',async t=>{
 const f=await fixture(t,(_q,r)=>{r.statusCode=429;r.end(j({error:'synthetic safe rejection'}));});const c=f.make('safe-json-rejection');const result=await f.owner().invoke(c);assert.equal(result.kind,'rejected');
 assert.equal((await createModelHttpAuthority({rootDir:join(f.root,'originals')}).reopen({...c,savedExecution:result.savedFailure})).kind,'rejected');assert.equal(f.count(),1);
});

test('root and source path credential metadata refuse before managed writes and disclosure',async t=>{
 const f=await fixture(t,success);assert.equal((await f.owner(join(f.root,secret)).invoke(f.make('root-path'))).kind,'refused');
 const c=f.make('source-path');c.images=[{imageId:'img',sha256:'0'.repeat(64),mediaType:'image/png',byteLength:1,path:join(f.root,secret)}];
 assert.equal((await f.owner().invoke(c)).kind,'refused');assert.deepEqual(await readdir(f.root),[]);assert.equal(f.count(),0);
});


test('actual image preflight obeys deadline and abort without managed effects or HTTP',async t=>{
 const f=await fixture(t,success);
 const bytes=execFileSync('python3',['-c',"from PIL import Image\nimport io,sys\nb=io.BytesIO();Image.new('RGB',(3,2),'red').save(b,format='PNG');sys.stdout.buffer.write(b.getvalue())"]);
 const path=join(f.root,'source.png');await writeFile(path,bytes);
 const image={imageId:'img',sha256:hash(bytes),mediaType:'image/png',byteLength:bytes.length,path};
 const build=id=>{const c=f.make(id);c.images=[image];c.logicalInputBytes=j({runId:c.request.runId,model:'SYN',prompt:c.request.prompt,images:[{imageId:'img',sha256:image.sha256,mediaType:image.mediaType,byteLength:image.byteLength}]});return c;};
 const deadline=await f.owner().invoke({...build('decode-deadline'),timeoutMs:1});assert.equal(deadline.kind,'refused');assert.equal(deadline.code,'deadline');
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20);const aborted=await f.owner().invoke({...build('decode-abort'),signal:controller.signal});clearTimeout(timer);assert.equal(aborted.kind,'refused');assert.equal(aborted.code,'abort');
 assert.equal(f.count(),0);assert.deepEqual(await readdir(f.root),['source.png']);
});

test('final physical reopen shares the original invocation deadline and preserves zero-call recovery',async t=>{
 const f=await fixture(t,success),c={...f.make('final-reopen-deadline'),timeoutMs:250};
 const started=Date.now();
 const owner=createModelHttpAuthority({rootDir:join(f.root,'originals'),operatorConfig:f.cfg,environment:{SYN_TOKEN:secret},failpoint:async phase=>{
  if(phase==='manifest-synced')await new Promise(resolve=>setTimeout(resolve,Math.max(0,started+300-Date.now())));
 }});
 const result=await owner.invoke(c);
 assert.equal(result.kind,'unknown');assert.equal(result.code,'deadline');assert.equal(f.count(),1);
 const recovered=await createModelHttpAuthority({rootDir:join(f.root,'originals')}).reopen({...c,attemptLocator:result.attemptLocator});
 assert.equal(recovered.kind,'verified');assert.equal(f.count(),1);
});
