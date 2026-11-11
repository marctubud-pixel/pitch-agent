import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,realpath,mkdir,readFile,writeFile,chmod,readdir,rename,symlink,unlink,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {fixture as reviewFixture} from './ordinary-review-constructed-fixture.mjs';
import {fixture as finalFixture} from './ordinary-final-constructed-fixture.mjs';
import {invokeOrdinary} from './ordinary-model.mjs';
import {sketchHash as hash,SKETCH_PROTOCOL,sketchTextRequest,sketchTextInput} from './sketch-authority.mjs';
import {buildReviewRequest} from './sketch-review-v2.mjs';
import {finalRequest} from './final-visual.mjs';
import {verifySketchOriginal} from './sketch-original.mjs';
import {verifySketchReviewOriginal} from './sketch-review-original.mjs';
import {verifyFinalVisualOriginal} from './final-visual-original.mjs';
async function sketchFixture(){
 const root=await realpath(await mkdtemp(join(tmpdir(),'ordinary-sketch-text-original-'))),binding={providerId:'owned',model:'synthetic',role:'references-lead'},g={id:'generation',source:{dossierId:'constructed',sourceHash:'source'},bindings:{producer:binding}},job={id:'producer',generationId:g.id,nodeKey:'producer',purpose:'sketch_owner',binding,task:{sourceHash:'source'},status:'succeeded',attempts:[]},p={id:'p',jobs:[job],sketchGenerations:[g]},id=randomUUID(),folder=join(root,id),context={actorId:randomUUID(),runId:id,contextId:randomUUID()},raw={protocol:SKETCH_PROTOCOL,kind:'handoff',sourceHash:'source',side:'producer',ownerBinding:binding,decision:'accept',understanding:'Constructed upstream; actual HTTP original only.',findings:[],limitations:['No full sketch runtime established.']},receipt={responseText:JSON.stringify(raw)};
 const request=sketchTextRequest(sketchTextInput(p,g,job));await mkdir(folder);await writeFile(join(folder,'packet.json'),JSON.stringify({runId:id,model:binding.model,...request}));job.attempts=[{id,status:'succeeded',executor:context,receipt}];job.outputVersionIds=[job.id+':report'];job.report={raw,hash:hash(JSON.stringify(raw)),context,receipt,payloadRef:join(folder,'sketch-report.json')};await writeFile(job.report.payloadRef,JSON.stringify(raw));
 return {root,p,job,folder,request,receipt,wrappers:['packet.json','receipt.json','sketch-report.json'],read:q=>verifySketchOriginal(q,q.sketchGenerations[0],q.jobs[0],{executionRoot:root}),mutate:q=>q.jobs[0].task.sourceHash='changed-source'};
}
function transform(root,fn){const seen=new Set();function visit(value){if(!value||typeof value!=='object'||seen.has(value))return;seen.add(value);for(const [key,entry] of Object.entries(value)){const replacement=fn(entry);if(replacement!==entry)value[key]=replacement;else visit(entry);}}visit(root);}
async function actualReceipt(t,f,request,images){
 const job=f.job,attempt=job.attempts.at(-1),old=attempt.receipt;let calls=0;
 const server=http.createServer(async(req,res)=>{calls++;const chunks=[];for await(const c of req)chunks.push(c);const bytes=Buffer.concat(chunks),wire=JSON.parse(bytes);await writeFile(join(f.root,'owned-http-request.json'),bytes);const response=JSON.stringify({protocol:'workbench-stateless-model-json-v1',invocationId:wire.invocationId,contextMode:'stateless-v1',terminal:'completed',outputText:old.responseText,reportedModel:null,requestId:null,usage:{inputTokens:null,outputTokens:null}});await writeFile(join(f.root,'owned-http-response.json'),response);res.end(response);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));console.log(JSON.stringify({retainedRoot:f.root,httpCalls:calls,coverage:'genuine HTTP originals with constructed registered prerequisites; full runtime not established'}));});
 const binding=job.binding,provider={adapter:'workbench-model-http-v1',model:binding.model,operatorConfig:{adapter:'workbench-model-http-v1',endpoint:`http://127.0.0.1:${server.address().port}/model`,model:binding.model,serviceIdentity:'owned-original-reader',authentication:{kind:'none'},allowLoopbackHttp:true,timeoutMs:300000,maxRequestBytes:8*1024*1024,maxResponseBytes:4*1024*1024,maxOutputBytes:1024*1024,vision:true,envelopes:['sketch-review-v2','final-visual-v1']}};
 const receipt=await invokeOrdinary({executionRoot:f.root,provider,binding,attemptId:attempt.id,request,images,runtimePacketBytes:Buffer.from(JSON.stringify({runId:attempt.id,model:binding.model,...request})),persistLocator:async locator=>{attempt.httpAttemptLocator=locator;await writeFile(join(f.folder,'http-locator.json'),JSON.stringify(locator),{flag:'wx'});}});
 transform(f.p,value=>value===old?receipt:value);f.receipt=receipt;await writeFile(join(f.folder,'receipt.json'),JSON.stringify(receipt));if(f.wrappers.includes('response.txt'))await writeFile(join(f.folder,'response.txt'),receipt.responseText);return ()=>calls;
}
for(const family of ['sketch text','sketch review','ordinary final visual vision'])test(family+' genuine HTTP original and frozen-domain corruption',{timeout:180000},async t=>{
 let f;
 if(family==='sketch text')f=await sketchFixture();
 else if(family==='sketch review'){
  const x=await reviewFixture(true),job=x.p.jobs.at(-1),node=x.run.nodes.find(n=>n.key===job.nodeKey);f={...x,job,request:buildReviewRequest(x.run,node,x.run.reports).request,receipt:job.attempts.at(-1).receipt,wrappers:['packet.json','receipt.json','response.txt'],read:q=>verifySketchReviewOriginal(q,q.sketchReviewRuns[0],{executionRoot:x.root,imageStore:x.imageStore}),mutate:q=>q.sketchReviewRuns[0].neutral.task.brief='changed-task'};
 }else{
  const x=await finalFixture(),originalRoot=x.root,root=await realpath(originalRoot);transform(x.p,v=>typeof v==='string'&&v.startsWith(originalRoot)?root+v.slice(originalRoot.length):v);x.root=root;const attempt=x.job.attempts.at(-1);f={...x,folder:join(root,attempt.id),request:finalRequest(x.p,x.run,x.job.node).request,receipt:attempt.receipt,wrappers:['packet.json','receipt.json','response.txt'],read:q=>{const receipt=q.jobs[0].attempts[0].receipt;return verifyFinalVisualOriginal(q,q.finalVisualRuns[0],q.jobs[0],{executionRoot:root,imageStore:{read:async({imageId})=>{const d=receipt.images.find(i=>i.imageId===imageId);return {asset:{...d,id:d.imageId,projectId:q.id},descriptor:d,bytes:await readFile(d.path)};}}});},mutate:q=>q.finalVisualRuns[0].source.task.brief='changed-task'};
 }
 const images=f.receipt.images??[],calls=await actualReceipt(t,f,f.request,images),read=()=>f.read(f.p);await read();await read();assert.equal(calls(),1);
 async function corruptions(label,path){
  const original=await readFile(path),mode=(await stat(path)).mode&0o777;
  for(const mutation of ['append','truncate','same-size','missing','symlink'])await t.test(label+' '+mutation,async()=>{
   const backup=path+'.owned-backup';await chmod(path,0o600);let moved=false;
   try{
    if(mutation==='append')await writeFile(path,Buffer.concat([original,Buffer.from(' ')]));
    else if(mutation==='truncate')await writeFile(path,original.subarray(0,Math.max(0,original.length-1)));
    else if(mutation==='same-size'){const bytes=Buffer.from(original);bytes[0]^=1;await writeFile(path,bytes);}
    else{await rename(path,backup);moved=true;if(mutation==='symlink')await symlink(backup,path);}
    await assert.rejects(read);
   }finally{if(moved){if(mutation==='symlink')await unlink(path);await rename(backup,path);}else await writeFile(path,original);await chmod(path,mode);}
  });
 }
 for(const name of await readdir(join(f.root,'ordinary-model-http',f.receipt.original.rootRelativePath)))await corruptions('transport '+name,join(f.root,'ordinary-model-http',f.receipt.original.rootRelativePath,name));
 for(const name of f.wrappers)await corruptions('wrapper '+name,join(f.folder,name));
 for(const [index,image] of (f.receipt.images??[]).entries())await corruptions('source attachment '+index,image.path);
 await f.read(JSON.parse(JSON.stringify(f.p)));assert.equal(calls(),1);
 await t.test('frozen domain substitution',async()=>{const q=structuredClone(f.p);f.mutate(q);await assert.rejects(()=>f.read(q));});
 await t.test('frozen model substitution',async()=>{const q=structuredClone(f.p);q.jobs.find(j=>j.id===f.job.id).binding.model='wrong';await assert.rejects(()=>f.read(q));});
 assert.equal(calls(),1);
});
