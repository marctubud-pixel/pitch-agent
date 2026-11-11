import http from 'node:http';
import {chmod} from 'node:fs/promises';
import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir,cp,appendFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {gzipSync,gunzipSync} from 'node:zlib';
const originalVisual=await import('./final-visual.mjs');
let pureVisual;
mock.module('./final-visual.mjs',{namedExports:{...originalVisual,requireFinalVisual(){assert.ok(pureVisual);return structuredClone(pureVisual.run);},finalPayload(){return structuredClone(pureVisual.payload);}}});
// A bounded runtime component test. Visual production/specialist acceptance is deliberately unavailable.
mock.module('./content-specialists.mjs',{namedExports:{contentSpecialistWork(){return {availableSavedWork:[],requiredSpecialists:[]};}}});
const {createImageEvidenceStore}=await import('./image-evidence.mjs');
const {referenceFixturePng}=await import('./reference-dossier-fixtures.mjs');
const {actualNumericContentUpstream}=await import('./content-numeric-source-fixture.mjs');
const {createCompleteContentRuntime,validateContentConfiguration}=await import('./complete-content-runtime.mjs');
const {contentNodes,contentRequest,ingestContent,validateManuscript,contentSourceLocations,requireContentCurrent,neutralContent,requireCompleteContent,reduceCompleteContent}=await import('./complete-content.mjs');
const {contentSourceEnvelope}=await import('./project.mjs');
const {openStore}=await import('./store.mjs');
const {numericRuntimeConfiguration,syntheticNumericContentResponse,numericManuscript}=await import('./content-numeric-runtime-fixture.mjs');
const {sketchHash:hash}=await import('./sketch-authority.mjs');
const {verifyContentOriginal}=await import('./content-original.mjs');
const clone=structuredClone;
function fixtureVisual(p){
 const directions=JSON.parse(p.artifacts.find(a=>a.id===p.activeByStage.copy)._text).directions.map((d,i)=>({directionId:d.id,approvedCopy:clone(d),explanation:'Pure visual explanation.',presentationIntent:'Pure visual intent.',claims:[],limitations:['Pure fixture only. No final visual authority.'],targets:[{imageId:`pure-image-${i}`,targetId:`pure-target-${i}`,sha256:hash(`pure-image-${i}`),mediaType:'image/png',byteLength:Buffer.byteLength(`pure-image-${i}`),width:10,height:10}],preservedFindings:[]}));
 const payload={directions,sourceImages:[]},run={id:'pure-visual',source:{neutralReferences:{referenceBoundaries:[],referenceQualifications:[]}},reports:[{id:'pure-aggregate',nodeKey:'aggregate',phase:'aggregate',raw:{understanding:'Explicit bounded visual test fixture.',payload}}]};
 if(p.activeByStage.visual==='pure-visual-artifact'){pureVisual={payload,run};return p;}
 p.activeByStage.visual='pure-visual-artifact';p.artifacts.push({id:'pure-visual-artifact',stage:'visual',contentHash:hash(payload)});p.releases.push({artifactId:'pure-visual-artifact',policyVersion:p.policies.at(-1).version});p.jobs.push({id:'pure-visual-owner',binding:{role:'visual-lead',providerId:'pure-visual',model:'unexecuted'},finalVisualRunId:run.id,nodeKey:'aggregate',attempts:[]});pureVisual={payload,run};return p;
}
function replace(file,p){const db=new DatabaseSync(file);try{db.exec('BEGIN IMMEDIATE');db.prepare('INSERT INTO revisions(project_id,revision,snapshot) VALUES(?,?,?) ON CONFLICT(project_id,revision) DO UPDATE SET snapshot=excluded.snapshot').run(p.id,p.revision,JSON.stringify(p));db.prepare('INSERT INTO heads(project_id,revision) VALUES(?,?) ON CONFLICT(project_id) DO UPDATE SET revision=excluded.revision').run(p.id,p.revision);db.prepare('DELETE FROM revisions WHERE project_id=? AND revision>?').run(p.id,p.revision);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}finally{db.close();}}
const actor=()=>({actorType:'agent',actorId:randomUUID(),runId:randomUUID(),contextId:randomUUID()});

test('ordinary HTTP content v4 executes every phase and both layout owners with explicit bounded visual prerequisites',{timeout:600000},async t=>{
 const f=await actualNumericContentUpstream({retainRoot:true});t.after(()=>f.store.close());console.log(JSON.stringify({retainedContentRoot:f.root,upstreamCalls:f.calls.length,prerequisites:'actual numeric research strategy copy; constructed visual prerequisite, unavailable specialist creation'}));
 let p=f.store.read('p');p.artifacts.find(a=>a.id===p.activeByStage.copy)._text=await readFile(p.artifacts.find(a=>a.id===p.activeByStage.copy).payloadRef,'utf8');fixtureVisual(p);delete p.artifacts.find(a=>a.id===p.activeByStage.copy)._text;
 const imageStore=createImageEvidenceStore({rootDir:join(f.root,'images')});
 for(const [n,d] of pureVisual.payload.directions.entries()){
  const asset=await imageStore.ingest({projectId:'p',bytes:referenceFixturePng(n+100),metadata:{representation:'supplied_image',description:'Owned real decoded PNG in bounded constructed visual prerequisite.'}});p.imageAssets.push(asset);
  d.targets=[{...d.targets[0],imageId:asset.id,sha256:asset.sha256,mediaType:asset.mediaType,byteLength:asset.byteLength,width:asset.width,height:asset.height}];
 }
 p.artifacts.find(a=>a.id===p.activeByStage.visual).contentHash=hash(pureVisual.payload);replace(join(f.root,'db'),p);
 const options=numericRuntimeConfiguration(),calls=[];let loseNode='producer:strategy',lastNode;
 const server=http.createServer(async(req,res)=>{try{const chunks=[];for await(const c of req)chunks.push(c);const wireBytes=Buffer.concat(chunks),wire=JSON.parse(wireBytes),input=JSON.parse(wire.prompt.slice(wire.prompt.indexOf('UNTRUSTED_JSON_DATA\n')+20,wire.prompt.lastIndexOf('\nEND_UNTRUSTED_JSON_DATA')));lastNode=input.nodeKey;calls.push(input.nodeKey);await writeFile(join(f.root,`content-http-${calls.length}-request.json`),wireBytes);const raw=syntheticNumericContentResponse(input);const response=JSON.stringify({protocol:'workbench-stateless-model-json-v1',invocationId:wire.invocationId,contextMode:'stateless-v1',terminal:'completed',outputText:JSON.stringify(raw),reportedModel:'synthetic-content-reported',requestId:null,usage:{inputTokens:null,outputTokens:null}});await writeFile(join(f.root,`content-http-${calls.length}-response.json`),response);res.end(response);}catch(error){console.error(error);res.destroy();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
 const operatorConfig={adapter:'workbench-model-http-v1',endpoint:`http://127.0.0.1:${server.address().port}/model`,model:'synthetic-content',serviceIdentity:'owned-content-http',authentication:{kind:'none'},allowLoopbackHttp:true,timeoutMs:300000,maxRequestBytes:64*1024*1024,maxResponseBytes:16*1024*1024,maxOutputBytes:2*1024*1024,vision:true,envelopes:['complete-content-v1']};
 const provider={adapter:'workbench-model-http-v1',model:'synthetic-content',operatorConfig,failpoint:async name=>{if(name==='manifest-synced'&&loseNode===lastNode){loseNode=null;throw Error('Owned content terminal return loss');}}};
 const runtime=(providers={'numeric-content-synthetic':provider},bindings=options.bindings)=>createCompleteContentRuntime({store:f.store,root:f.root,providers,bindings,imageStore,finalVisuals:{async verifyFinalVisual(){return {componentFixtureOnly:true};}},configuration:options.configuration});
 const initial=await runtime().continueContent('p',{commandId:'owned-http-content',expectedRevision:p.revision});assert.equal(initial.status,'planning',JSON.stringify(initial));let recovered=false,result;
 for(let turn=0;turn<18;turn++){
  result=await runtime().advanceContent('p');if(!result.queuedJobIds.length)break;
  for(const id of result.queuedJobIds){let j=await runtime().execute('p',id);if(j.status==='awaiting_reconciliation'){
   await writeFile(join(f.root,'content-http-awaiting-job.json'),JSON.stringify(j));assert.equal(j.nodeKey,'producer:strategy',JSON.stringify(j.error));assert.ok(j.attempts.at(-1).httpAttemptLocator);assert.equal(j.attempts.at(-1).receipt,undefined);const before=calls.length;await runtime({},{}).advanceContent('p');j=f.store.read('p').jobs.find(j=>j.id===id);assert.equal(j.status,'succeeded',JSON.stringify(j.error));assert.equal(calls.length,before);recovered=true;
  }
  await appendFile(join(f.root,'content-http-checkpoints.jsonl'),JSON.stringify({at:new Date().toISOString(),jobId:j.id,nodeKey:j.nodeKey,status:j.status,httpCalls:calls.length})+'\n');assert.equal(j.status,'succeeded',JSON.stringify(j.error));assert.equal(j.contentReport.valid,true,JSON.stringify(j.contentReport.diagnostics));}
 }
 assert.equal(recovered,true);assert.equal(result.status,'ready_for_layout',JSON.stringify(result));p=f.store.read('p');const r=p.jobs.find(j=>j.id===result.rootJobId),jobs=p.jobs.filter(j=>j.contentRootJobId===r.id);assert.equal(jobs.length,13);assert.equal(calls.length,13);assert.deepEqual(new Set(calls),new Set(contentNodes().map(n=>n.key)));
 await writeFile(join(f.root,'content-http-completed-project.json'),JSON.stringify(p));
 for(const j of jobs)assert.equal((await verifyContentOriginal(p,r,j,{executionRoot:f.root})).valid,true);
 const before=calls.length,producer=jobs.find(j=>j.nodeKey==='layout:producer'),consumer=jobs.find(j=>j.nodeKey==='layout:consumer');assert.equal(producer.contentReport.raw.decision,'accept');assert.equal(consumer.contentReport.raw.decision,'accept');
 for(const j of jobs){const a=j.attempts.at(-1),file=join(f.root,a.id,'response.txt'),bytes=await readFile(file);await writeFile(file,Buffer.concat([bytes,Buffer.from(' ')]));await assert.rejects(()=>verifyContentOriginal(p,r,j,{executionRoot:f.root}));await writeFile(file,bytes);}
 for(const mutate of [q=>q.jobs.find(j=>j.id===r.id).task.source.visibility.fieldCoverage.pop(),q=>q.jobs.find(j=>j.id===producer.id).binding.model='wrong-model',q=>q.jobs.find(j=>j.id===consumer.id).node.phase='author']){const q=clone(p);mutate(q);await assert.rejects(()=>verifyContentOriginal(q,q.jobs.find(j=>j.id===r.id),q.jobs.find(j=>j.id===consumer.id),{executionRoot:f.root}));}
 assert.equal(calls.length,before);console.log(JSON.stringify({ownedRoot:f.root,actualContentHttpCalls:calls.length,allThirteenPhases:true,layoutOwners:2,terminalLossRecovered:true,completeBackendApproval:false}));
});
