import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,mkdir,realpath} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {host} from './simple-strategy-http-fixture.mjs';
const sha='a'.repeat(64);
async function setup(t,options={}) {
  const evidence=join(dirname(fileURLToPath(import.meta.url)),'../../.scratch/visual-b-http-evidence');await mkdir(evidence,{recursive:true});
  const root=await realpath(await mkdtemp(join(evidence,'http-boundary-'))),h=await host({dbPath:join(root,'db'),...options});
  t.after(()=>h.close());t.diagnostic('Retained empty boundary DB: '+root);
  const created=await h.request('/api/v1/projects',{name:'B HTTP boundary only; no upstream production',brief:'Only route and refusal checks',commandId:'create'});
  assert.equal(created.status,201,JSON.stringify(created.body));
  const base='/api/v1/projects/'+created.body.project.id;
  const body={commandId:'fixed',expectedRevision:0,phase:'final_visual',targetId:'missing-original-run',sourceHash:sha,jobIds:['missing-job']};
  return {...h,base,body,root};
}
test('B HTTP defaults disabled and GET has no advance/recovery writes',async t=>{
  const f=await setup(t,{researchOptions:{executionAllowed:true}});
  const before=(await f.request(f.base)).body.project;
  const status=await f.request(f.base+'/final-visual-workflow');assert.equal(status.status,200,JSON.stringify(status.body));
  assert.equal(status.body.capability.executionAllowed,false);
  const result=await f.request(f.base+'/final-visual-workflow/step',f.body);
  assert.equal(result.status,422);assert.equal(result.body.error.code,'VISUAL_B_EXECUTION_UNAVAILABLE');
  const after=(await f.request(f.base)).body.project;assert.equal(after.revision,before.revision);assert.deepEqual(after.jobs,[]);
});
test('HTTP rejects undeclared fields, invalid phase, duplicate jobs, query and route-method mismatch',async t=>{
  const f=await setup(t);
  for(const body of [{...f.body,approved:true},{...f.body,phase:'content_review'},{...f.body,jobIds:['j','j']},{...f.body,sourceHash:'bad'}])assert.equal((await f.request(f.base+'/final-visual-workflow/step',body)).status,400);
  assert.equal((await f.request(f.base+'/final-visual-workflow?advance=true')).status,400);
  assert.equal((await f.request(f.base+'/final-visual-continuations')).status,405);
  assert.equal((await f.request(f.base)).body.project.revision,0);
});
test('explicit B enable still rejects default research authority with domain 422',async t=>{
  const f=await setup(t,{researchOptions:{executionAllowed:true,visualBExecutionAllowed:true}});
  const r=await f.request(f.base+'/final-visual-workflow/step',f.body);assert.equal(r.status,422,JSON.stringify(r.body));assert.equal(r.body.error.code,'VISUAL_B_AUTHORIZATION_ENDPOINT');
  assert.equal((await f.request(f.base)).body.project.revision,0);
});
test('authorized surface cannot invent missing native B source, no ledger or job created',async t=>{
  const f=await setup(t,{researchOptions:{executionAllowed:true,visualBExecutionAllowed:true},creationAuthorizedThrough:'final_review'});
  const step=await f.request(f.base+'/final-visual-workflow/step',f.body);assert.equal(step.status,422,JSON.stringify(step.body));assert.equal(step.body.error.code,'FINAL_SKETCH_REQUIRED');
  const continuation=await f.request(f.base+'/final-visual-continuations',{commandId:'cont',expectedRevision:0,sketchArtifactId:'missing',sketchContentHash:sha,sourceHash:sha});
  assert.equal(continuation.status,422,JSON.stringify(continuation.body));assert.equal(continuation.body.error.code,'FINAL_SKETCH_REQUIRED');
  const p=(await f.request(f.base)).body.project;assert.equal(p.revision,0);assert.equal(p.visualBHttpRequests,undefined);assert.deepEqual(p.jobs,[]);
});
test('B CORS does not acquire image-upload metadata permission',async t=>{
  const f=await setup(t),port=f.server.address().port;
  const result=await new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port,path:f.base+'/final-visual-workflow/step',method:'OPTIONS',headers:{origin:`http://127.0.0.1:${port}`,'access-control-request-method':'POST','access-control-request-headers':'content-type,x-workbench-image-meta'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end();});
  assert.equal(result,400);
});
test('dedicated adoption and final release cannot bypass missing original authority',async t=>{
  const f=await setup(t,{researchOptions:{executionAllowed:true,visualBExecutionAllowed:true},creationAuthorizedThrough:'final_review'});
  const request={commandId:'human-or-release',expectedRevision:0,artifactId:'missing',runId:'missing',sourceHash:sha,draftHash:sha};
  const adoption=await f.request(f.base+'/final-visual-adoptions',{...request,reason:'Fixture refusal only'});
  assert.equal(adoption.status,422,JSON.stringify(adoption.body));assert.equal(adoption.body.error.code,'VISUAL_B_TARGET_REQUIRED');
  const release=await f.request(f.base+'/final-visual-release',request);
  assert.equal(release.status,422,JSON.stringify(release.body));assert.equal(release.body.error.code,'FINAL_ADOPTION_STALE');
  assert.equal((await f.request(f.base)).body.project.revision,0);
});
