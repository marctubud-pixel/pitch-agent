import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {EventEmitter} from 'node:events';
import {mkdtemp,realpath,readFile,writeFile,chmod,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {loadImageProvider} from './image-api-provider.mjs';
import {createImageEvidenceStore} from './image-evidence.mjs';
import {verifySketchOriginal} from './sketch-original.mjs';
import {imageTask} from './sketch-authority.mjs';
import {createSketchRuntime} from './sketch-runtime.mjs';
import {selectedOriginalCommandIndex,verifySelectedOriginals} from './final-selected-originals.mjs';
import {local} from './repair-helper.mjs';
import {openStore} from './store.mjs';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAE0lEQVR4nGP8//8/AwMDEwMYAAAkBgMBXaJOiAAAAABJRU5ErkJggg==','base64');

test('managed sketch generated original uses actual adapter and image store with socket-free local transport',async t=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'sketch-managed-image-'))),requests=[];
 const original=http.request;
 http.request=(url,options,callback)=>{assert.equal(url.hostname,'127.0.0.1');const req=new EventEmitter();req.destroy=()=>{};req.end=body=>{requests.push({url:url.href,body:JSON.parse(body)});queueMicrotask(()=>{const res=new EventEmitter();res.statusCode=200;res.headers={'content-type':'application/json'};res.destroy=()=>{};callback(res);res.emit('data',Buffer.from(JSON.stringify({data:[{b64_json:png.toString('base64')}]})));res.emit('end');});};return req;};
 t.after(()=>{http.request=original;});
 const provider=loadImageProvider({config:{providerId:'owned-fixture',adapter:'openai-images-v1',baseUrl:'http://127.0.0.1:1/v1',model:'owned-local',credentialEnv:'OWNED_TEST_KEY',operations:{generate:true,edit:false},supportedOptions:{generate:{},edit:{}},timeoutMs:2000},allowLoopbackHttp:true,resolveCredential:()=> 'fixture-only-key-8294'});
 const candidate={id:'candidate',operation:{kind:'generate',prompt:'Constructed fixture geometry',options:{}}};
 const g={id:'generation',bindings:{image:provider.capability().binding},source:{sourceHash:'constructed-source',dossierId:'constructed-dossier'},plan:{candidates:[candidate]}};
 const job={id:'image-job',generationId:g.id,purpose:'image_candidate',nodeKey:candidate.id,status:'succeeded',binding:g.bindings.image,task:{sourceHash:g.source.sourceHash},candidate,attempts:[]};
 const p={id:'owned-project',sketchGenerations:[g],jobs:[job,{id:'planner',generationId:g.id,nodeKey:'planner',status:'succeeded'}],imageAssets:[]};
 const task=imageTask(p,g,job,'owned-attempt'),prepared=await provider.prepare(task);assert.equal(prepared.kind,'prepared');
 const result=await provider.execute(prepared,{evidenceDir:join(root,'image-provider-evidence')});assert.equal(result.kind,'image');assert.deepEqual(result.bytes,png);assert.equal(requests.length,1);
 const imageRoot=join(root,'images'),imageStore=createImageEvidenceStore({rootDir:imageRoot}),asset=await imageStore.ingestGenerated({projectId:p.id,result});
 p.imageAssets.push(asset);job.outputVersionIds=[asset.id];job.attempts.push({id:'owned-attempt',status:'succeeded',dispatchStarted:true,requestHash:prepared.requestHash,receipt:result.receipt,responseEvidence:result.receipt.responseEvidence});
 const verify=project=>verifySketchOriginal(project,project.sketchGenerations[0],project.jobs[0],{executionRoot:root,imageStore});
 const fact=await verify(p);assert.equal(fact.kind,'sketch-image-original');assert.equal(fact.outputVersionId,asset.id);assert.equal(requests.length,1);
 await t.test('wrong asset and ambiguous identity refused',async()=>{let x=structuredClone(p);x.jobs[0].outputVersionIds=['wrong'];await assert.rejects(verify(x),{code:'SKETCH_ORIGINAL_MEMBERSHIP_REQUIRED'});x=structuredClone(p);x.imageAssets.push(structuredClone(asset));await assert.rejects(verify(x),{code:'SKETCH_ORIGINAL_MEMBERSHIP_REQUIRED'});});
 await t.test('unknown final attempt refused',async()=>{const x=structuredClone(p);x.jobs[0].attempts.push({id:'unknown-attempt',dispatchStarted:true,status:'unknown'});await assert.rejects(verify(x),{code:'SKETCH_ORIGINAL_MEMBERSHIP_REQUIRED'});});
 await t.test('generated object tamper refused and restored',async()=>{const path=join(imageRoot,'objects',asset.sha256),bytes=await readFile(path);await chmod(path,0o600);await writeFile(path,Buffer.from('tampered image'));await assert.rejects(verify(p));await writeFile(path,bytes);await chmod(path,0o400);assert.equal((await verify(p)).kind,'sketch-image-original');});
 const evidence=join(root,'image-provider-evidence'),folders=await readdir(evidence),folder=join(evidence,folders[0]);
 await t.test('managed manifest tamper refused and restored',async()=>{const path=join(folder,'manifest.json'),bytes=await readFile(path);await chmod(path,0o600);await writeFile(path,'{}');await assert.rejects(verify(p),{code:'SKETCH_EVIDENCE_UNAVAILABLE'});await writeFile(path,bytes);await chmod(path,0o400);assert.equal((await verify(p)).kind,'sketch-image-original');});
 await t.test('unsupported recovery refused',async()=>{const x=structuredClone(p);x.jobs[0].attempts[0].responseEvidence.protocol='unsupported';x.jobs[0].attempts[0].receipt.responseEvidence.protocol='unsupported';await assert.rejects(verify(x),{code:'SKETCH_EVIDENCE_UNAVAILABLE'});});
 await t.test('live review caller preserves current reference gate',async()=>{const runtime=createSketchRuntime({store:{read:()=>p},root,references:{checkedSelection:async()=>({state:{status:'blocked',reason:'OWNED_CURRENT_GATE'}})},providers:{},bindings:{},imageStore});await assert.rejects(runtime.sketchReviewInput(p.id,g.id),{code:'SKETCH_REFERENCE_REQUIRED'});});
 assert.equal(requests.length,1);
 console.log(JSON.stringify({ownedImageRoot:root,adapterOperations:['prepare','execute','recover'],imageId:asset.id,sha256:asset.sha256,actualPngBytes:png.length,transportRequests:requests.length,upstream:'constructed_registered_metadata_not_reducer_or_creative_proof'}));
});

test('typed final reducer witnesses coexist with raw selected commands and keep final originals unsupported',async t=>{
 const f=local(t,{selected:false}),x=f.packetFor(f.o.full.calls[0]);f.charge(x);f.settle(x,f.completion(x));
 const p=f.state(),idx=selectedOriginalCommandIndex(p);assert.equal(idx.digestWitnesses.length,2);assert.ok(idx.digestWitnesses.every(x=>x.classification==='digest_only_not_raw_command'));assert.ok(idx.entries.some(x=>x.command.kind==='reserve-final-review-plan'));assert.ok(!idx.entries.some(x=>x.command.protocol==='final-command-witness-v2'));
 const store=openStore(':memory:');t.after(()=>store.close());store.read=()=>{throw Error('unsupported final must not read snapshot');};
 const job=p.jobs.find(j=>j.finalCallResult),outcome=await store.withReadAdmission(p.id,{readAttempts:128,snapshotBytes:256*1024**2,decodedBytes:16*1024**3,storedBytes:16*1024**3},()=>verifySelectedOriginals({store,planning:p,index:{nodes:[{identity:'final',domain:'job',recordId:job.id}]},selected:{nodeIdentities:['final']},executionRoot:f.root,imageStore:{},current:()=>{}}));
 assert.equal(outcome.kind,'complete');assert.equal(outcome.usage.fetchedSnapshots,0);const result=outcome.value;
 assert.equal(result.facts.length,0);assert.equal(result.digestWitnesses.length,2);assert.ok(result.blockers.some(b=>b.code==='FINAL_HISTORY_UNSUPPORTED_JOB_ORIGINAL'));assert.equal(result.blockers.some(b=>b.code==='FINAL_HISTORY_SNAPSHOT_ALLOCATION_ADMISSION_REQUIRED'),false);assert.equal(result.accounting.allocationAdmission,'outer_store_read_admission');
 for(const kind of ['complete-reference-node','complete-sketch-text','complete-owner']){const q={revision:1,audit:[{kind,commandId:'raw',revision:1}],processedCommands:{raw:JSON.stringify({kind,commandId:'raw',jobId:'j',attemptId:'a'})}};assert.equal(selectedOriginalCommandIndex(q).entries[0].command.kind,kind);}
 const bad=structuredClone(p),entry=idx.digestWitnesses[0];bad.processedCommands[entry.audit.commandId]=JSON.stringify({...entry.witness,representation:'raw_command'});assert.throws(()=>selectedOriginalCommandIndex(bad),{code:'FINAL_HISTORY_WITNESS_CONFLICT'});
});
