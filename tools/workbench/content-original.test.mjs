import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {contentNodes,contentRequest,contentPlanningManifest,ingestContent} from './complete-content.mjs';
import {sketchHash as hash} from './sketch-authority.mjs';
import {verifyContentOriginal} from './content-original.mjs';
import {legacyOriginal} from './content-original.legacy-probe.mjs';

const digest=b=>createHash('sha256').update(b).digest('hex');
async function fixture(t,{producer=false,image=false,large=false}={}){
 const base=await fs.mkdtemp(join(tmpdir(),'content-original-domain-'));
 t.after(()=>fs.rm(base,{recursive:true,force:true}));
 const executionRoot=join(base,'executions');await fs.mkdir(executionRoot);
 const assignments=Object.fromEntries(contentNodes().map(n=>[n.key,{providerId:'owned',model:'owned',role:n.key==='producer:strategy'?'strategy-lead':n.key==='producer:copy'?'copy-lead':n.role}]));
 const obligations=['strategy','copy','visual'].map(owner=>({originId:owner,artifactId:owner,pointer:'/text',owner:`${owner}-lead`,kind:'limitation',value:`Owned ${owner} limitation`}));
 const source={sourceHash:'owned-source',task:{},strategy:{artifactId:'strategy',contentHash:'s',content:{}},copy:{artifactId:'copy',contentHash:'c',content:{}},visual:{artifactId:'visual',contentHash:'v',payload:{directions:[]}},visualLeg:{jobId:'visual-owner'},obligations,images:[],claims:[],sources:[],directionMap:[],qualifications:{}};
 if(image){const bytes=Buffer.from('owned image bytes');const path=join(base,'independent-image-store','object');await fs.mkdir(join(base,'independent-image-store'));await fs.writeFile(path,bytes);source.images=[{imageId:'owned-image',sha256:digest(bytes),byteLength:bytes.length,mediaType:'image/png'}];source.imagePath=path;}
 const root={id:'root',contentRootJobId:'root',nodeKey:'plan',inputVersionIds:[],node:contentNodes()[0],binding:assignments.plan,task:{packetVersion:'content-packet-v2',source,assignments},attempts:[]};
 const project={id:'owned-domain-unit',jobs:[{id:'visual-owner',binding:{providerId:'owned',model:'owned',role:'visual-lead'},attempts:[]},root]};
 const manifest=contentPlanningManifest(project,root),input=contentRequest(project,root,root.node).input;
 const plan={protocol:input.protocol,envelopeHash:input.envelopeHash,nodeKey:input.nodeKey,findings:[],workOrder:{objective:'Owned domain probe',productionDirector:manifest.productionDirector,moduleOwners:manifest.moduleOwners,specialistRequirements:manifest.requiredSpecialists,limits:manifest.limits,returns:manifest.returns}};
 let job=root;
 function attach(job,raw){const request=contentRequest(project,root,job.node);const id=`attempt-${job.nodeKey.replaceAll(':','-')}`;const receipt={runId:id,requestedModel:'owned',model:'owned',exitCode:0,threadId:`thread-${id}`,inputPacketHash:hash({runId:id,model:job.binding.model,...request.request}),responseText:JSON.stringify(raw),images:source.images.map(i=>({...i,path:source.imagePath}))};job.attempts=[{id,executor:{actorId:`actor-${id}`,runId:`run-${id}`,contextId:`context-${id}`},receipt}];const projection=ingestContent(request.input,receipt,contentPlanningManifest(project,root));job.contentReport={id:`${job.id}-report`,raw:projection.raw,projection,...projection};}
 attach(root,plan);assert.equal(root.contentReport.valid,true);
 if(producer){const node=contentNodes().find(n=>n.key==='producer:strategy');job={id:'producer',contentRootJobId:root.id,nodeKey:node.key,node,binding:assignments[node.key],attempts:[]};project.jobs.push(job);const i=contentRequest(project,root,node).input;attach(job,{protocol:i.protocol,envelopeHash:i.envelopeHash,nodeKey:i.nodeKey,findings:[],decision:'accept',understanding:large?'x'.repeat(1100000):'Owned full obligation reading',acceptedOriginIds:obligations.map(o=>o.originId),restrictions:obligations});assert.equal(job.contentReport.valid,true);}
 const f={base,executionRoot,project,root,job,attach};
 f.save=async()=>{const a=job.attempts.at(-1),folder=join(executionRoot,a.id);await fs.mkdir(folder,{recursive:true});const request=contentRequest(project,root,job.node).request;await fs.writeFile(join(folder,'packet.json'),JSON.stringify({runId:a.id,model:job.binding.model,...request}));await fs.writeFile(join(folder,'receipt.json'),JSON.stringify(a.receipt));await fs.writeFile(join(folder,'response.txt'),a.receipt.responseText);};
 f.path=name=>join(executionRoot,job.attempts.at(-1).id,name);
 f.check=options=>verifyContentOriginal(project,root,job,{executionRoot,...options});
 f.legacy=retain=>legacyOriginal(project,job,root,retain,executionRoot);
 await f.save();return f;
}
async function observe(t,path,{afterStat,readError}={}){
 path=await fs.realpath(path);
 const originalOpen=fs.open,seen={reads:[],closed:0,flags:0};
 t.after(()=>{fs.open=originalOpen;syncBuiltinESMExports();});
 fs.open=async function(actual,...args){const handle=await originalOpen(actual,...args);if(actual!==path)return handle;seen.flags=args[0];const stat=handle.stat.bind(handle),read=handle.read.bind(handle),close=handle.close.bind(handle);handle.stat=async()=>{const info=await stat();await afterStat?.();return info;};handle.read=async(...args)=>{if(readError)throw readError;const result=await read(...args);seen.reads.push({length:args[2],position:args[3],bytesRead:result.bytesRead});return result;};handle.close=async()=>{seen.closed++;return close();};return handle;};syncBuiltinESMExports();return seen;
}
async function sameRefusal(f,code,retain=false){await assert.rejects(f.legacy(retain),{code});await assert.rejects(f.check({retainInvalidPlan:retain}),{code});}

test('domain units preserve valid plan, producer and attachment outside execution storage',async t=>{
 for(const options of [{},{producer:true},{image:true},{producer:true,large:true}]){const f=await fixture(t,options);assert.equal(await f.legacy(false),undefined);const checked=await f.check();assert.equal(checked.kind,'content-original');assert.equal(checked.projectId,f.project.id);assert.equal(checked.rootJobId,f.root.id);assert.equal(checked.jobId,f.job.id);assert.equal(checked.attemptId,f.job.attempts.at(-1).id);assert.equal(checked.reportId,f.job.contentReport.id);assert.deepEqual(checked.raw,JSON.parse(await fs.readFile(f.path('response.txt'),'utf8')));assert.deepEqual(checked.projection,f.job.contentReport.projection);}
});
test('a later invocation reopens the physical original after an earlier success',async t=>{
 const f=await fixture(t);
 await f.check();
 const path=f.path('response.txt'),bytes=await fs.readFile(path);
 bytes[0]^=1;
 await fs.writeFile(path,bytes);
 await assert.rejects(f.check(),{code:'CONTENT_ORIGINAL_BYTES_CHANGED'});
});
for(const name of ['packet.json','receipt.json','response.txt'])test(`domain unit refuses exact ${name} substitution`,async t=>{const f=await fixture(t);const bytes=await fs.readFile(f.path(name));bytes[0]^=1;await fs.writeFile(f.path(name),bytes);await sameRefusal(f,'CONTENT_ORIGINAL_BYTES_CHANGED');});
test('domain unit independently validates receipt despite matching saved originals',async t=>{const f=await fixture(t);f.job.attempts[0].receipt.model='substitution';await f.save();await sameRefusal(f,'CONTENT_RECEIPT_INVALID');});
for(const kind of ['thread','executor'])test(`domain unit retains ${kind} independence checks across other jobs`,async t=>{const f=await fixture(t);const a=f.job.attempts[0];f.project.jobs.push({id:'other',attempts:[{executor:kind==='executor'?a.executor:{actorId:'other',runId:'other',contextId:'other'},receipt:{threadId:kind==='thread'?a.receipt.threadId:'other'}}]});await sameRefusal(f,'CONTENT_CONTEXT_REUSED');});
test('domain unit refuses altered saved projection',async t=>{const f=await fixture(t);f.job.contentReport.projection.raw.workOrder.objective='changed';await sameRefusal(f,'CONTENT_ORIGINAL_CHANGED');});
test('domain unit retains only exact invalid assignment plan with explicit retention',async t=>{const f=await fixture(t);const raw=structuredClone(f.job.contentReport.raw);raw.workOrder.productionDirector.model='wrong';f.attach(f.job,raw);assert.deepEqual(f.job.contentReport.diagnostics,['CONTENT_PLAN_ASSIGNMENT_INVALID']);await f.save();await sameRefusal(f,'CONTENT_PLAN_ASSIGNMENT_INVALID');await f.legacy(true);await f.check({retainInvalidPlan:true});f.job.contentReport.raw=structuredClone(raw);f.job.contentReport.raw.workOrder.objective='altered';await sameRefusal(f,'CONTENT_PLAN_ASSIGNMENT_INVALID',true);});
test('domain unit cannot retain unrelated invalid planning diagnostics',async t=>{const f=await fixture(t);f.attach(f.job,{invalid:true});await f.save();await sameRefusal(f,'CONTENT_PLAN_ASSIGNMENT_INVALID',true);});
test('domain unit preserves matching invalid non-plan projection',async t=>{const f=await fixture(t,{producer:true});const raw=structuredClone(f.job.contentReport.raw);raw.understanding='';f.attach(f.job,raw);assert.equal(f.job.contentReport.valid,false);await f.save();await f.legacy(false);await f.check();});
for(const kind of ['same-size','missing','oversized','nonregular','invalid-length'])test(`domain unit refuses ${kind} original attachment`,async t=>{const f=await fixture(t,{image:true}),image=f.job.attempts[0].receipt.images[0];if(kind==='same-size')await fs.writeFile(image.path,Buffer.alloc(image.byteLength));if(kind==='missing')await fs.unlink(image.path);if(kind==='oversized')await fs.truncate(image.path,8*1024*1024+1);if(kind==='nonregular'){await fs.unlink(image.path);await fs.mkdir(image.path);}if(kind==='invalid-length'){image.byteLength=8*1024*1024+1;f.root.task.source.images[0].byteLength=image.byteLength;const raw=structuredClone(f.job.contentReport.raw);raw.envelopeHash=contentRequest(f.project,f.root,f.job.node).input.envelopeHash;f.attach(f.job,raw);f.job.attempts[0].receipt.images[0].byteLength=image.byteLength;await f.save();}await assert.rejects(f.check(),{code:kind==='missing'?'ENOENT':'CONTENT_ATTACHMENT_CHANGED'});});
test('domain unit permits canonical in-root alias and refuses out-of-root text',async t=>{const f=await fixture(t),path=f.path('packet.json'),bytes=await fs.readFile(path),inside=f.path('alias.json');await fs.writeFile(inside,bytes);await fs.unlink(path);await fs.symlink(inside,path);await f.check();const outside=join(f.base,'outside');await fs.writeFile(outside,bytes);await fs.unlink(path);await fs.symlink(outside,path);await assert.rejects(f.check(),{code:'CONTENT_ORIGINAL_BYTES_UNAVAILABLE'});});
for(const kind of ['growth','short','EIO','nonregular','length'])test(`descriptor boundary closes after ${kind} refusal`,async t=>{const f=await fixture(t),path=f.path('packet.json');if(kind==='nonregular'){await fs.unlink(path);await fs.mkdir(path);}if(kind==='length')await fs.appendFile(path,' ');const seen=await observe(t,path,{afterStat:kind==='growth'?()=>fs.appendFile(path,'x'):kind==='short'?()=>fs.writeFile(path,'{}'):undefined,readError:kind==='EIO'?Object.assign(new Error('owned read error'),{code:'EIO'}):undefined});await assert.rejects(f.check(),{code:kind==='EIO'?'EIO':kind==='nonregular'?'CONTENT_ORIGINAL_BYTES_UNAVAILABLE':'CONTENT_ORIGINAL_BYTES_CHANGED'});assert.equal(seen.closed,1);assert.ok(seen.reads.every(r=>r.length<=64*1024));if(['length','nonregular','EIO'].includes(kind))assert.equal(seen.reads.length,0);if(kind==='growth')assert.equal(seen.reads.at(-1).bytesRead,1);});
test('descriptor boundary uses bounded positional reads and growth probe',async t=>{const f=await fixture(t,{producer:true,large:true}),path=f.path('response.txt'),size=(await fs.stat(path)).size,seen=await observe(t,path);await f.check();assert.equal(seen.closed,1);assert.ok(seen.flags&constants.O_NOFOLLOW);assert.ok(seen.flags&constants.O_NONBLOCK);assert.ok(seen.reads.every(r=>r.length<=64*1024&&Number.isInteger(r.position)));assert.equal(seen.reads.reduce((n,r)=>n+r.bytesRead,0),size);assert.deepEqual(seen.reads.at(-1),{length:1,position:size,bytesRead:0});});
test('domain unit preserves native missing execution file error',async t=>{const f=await fixture(t);await fs.unlink(f.path('receipt.json'));await sameRefusal(f,'ENOENT');});
test('domain unit rejects receipt attachment descriptor substitution before reading image',async t=>{const f=await fixture(t,{image:true});f.job.attempts[0].receipt.images[0].sha256='0'.repeat(64);await f.save();await sameRefusal(f,'CONTENT_RECEIPT_INVALID');});
for(const kind of ['growth','short','EACCES'])test(`attachment descriptor boundary closes after ${kind}`,async t=>{const f=await fixture(t,{image:true}),path=f.job.attempts[0].receipt.images[0].path,seen=await observe(t,path,{afterStat:kind==='growth'?()=>fs.appendFile(path,'x'):kind==='short'?()=>fs.writeFile(path,'x'):undefined,readError:kind==='EACCES'?Object.assign(new Error('owned denied read'),{code:'EACCES'}):undefined});await assert.rejects(f.check(),{code:kind==='EACCES'?'EACCES':'CONTENT_ATTACHMENT_CHANGED'});assert.equal(seen.closed,1);assert.ok(seen.reads.every(r=>r.length<=64*1024));});
test('descriptor boundary closes valid originals exactly once',async t=>{const f=await fixture(t),seen=await observe(t,f.path('packet.json'));await f.check();assert.equal(seen.closed,1);});
