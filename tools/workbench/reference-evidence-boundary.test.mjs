import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rename,rm} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {gunzipSync} from 'node:zlib';
import {openStore} from './store.mjs';
const {createServer}=await import(process.env.REFERENCE_REPAIR_BASELINE==='1'?'/private/tmp/reference-dossier-snapshot/tools/workbench/server.mjs':'./server.mjs');
import {createExecutor} from './executor.mjs';
import {createImageEvidenceStore} from './image-evidence.mjs';

const fixtureFile=process.env.REFERENCE_COMPLETE_FIXTURE;

test('complete synthetic dossier rejects missing managed evidence before HTTP adoption and current readiness', {skip:!fixtureFile}, async t=>{
 let fixture,snapshot;
 if(fixtureFile.endsWith('/db')||fixtureFile.endsWith('.sqlite')){
  const source=openStore(fixtureFile);fixture=source.read('p');source.close();
  const sourceDb=new DatabaseSync(fixtureFile,{readOnly:true});snapshot=sourceDb.prepare('SELECT snapshot FROM revisions JOIN heads USING(project_id,revision) WHERE project_id=?').get('p').snapshot;sourceDb.close();
 }else{const fileBytes=await readFile(fixtureFile);fixture=JSON.parse(fixtureFile.endsWith('.gz')?gunzipSync(fileBytes):fileBytes);}
 const project=fixture.project??fixture,root=fixture.root??dirname(project.referenceDossiers[0].reports[0].payloadRef).replace(/\/[^/]+$/u,'');
 console.log('Synthetic single-head fixture loaded');
 const dossier=project.referenceDossiers[0];
 assert.equal(dossier.reports.length,129);assert.equal(dossier.adoptions.length,0);assert.ok(project.jobs.every(j=>j.status!=='running'&&j.status!=='queued'));
 const directory=await mkdtemp(join(tmpdir(),'reference-evidence-repair-')),dbPath=join(directory,'fixture.sqlite');
 let server,store;
 t.after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));store?.close();await rm(directory,{recursive:true,force:true});});
 const seed=openStore(dbPath);seed.close();const db=new DatabaseSync(dbPath);
 db.prepare('INSERT INTO revisions(project_id,revision,snapshot) VALUES(?,?,?)').run(project.id,project.revision,snapshot??JSON.stringify(project));db.prepare('INSERT INTO heads(project_id,revision) VALUES(?,?)').run(project.id,project.revision);db.close();
 console.log('Isolated HTTP replay database seeded');
 const bindings={...dossier.envelope.bindings,copy:dossier.envelope.source.producerAssignment.binding};
 let dispatches=0;const providers=Object.fromEntries(Object.values(bindings).map(b=>[b.providerId,{model:b.model,execute:async()=>{dispatches++;throw new Error('Replay must never dispatch a provider');}}]));
 const options={dbPath,rootDir:root,bindings,providers,referenceConfiguration:dossier.envelope.configuration};
 console.log('Starting isolated HTTP replay server');
 server=createServer(options);await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const url=`http://127.0.0.1:${server.address().port}/api/projects/${project.id}`;
 const get=async()=>{const response=await fetch(url);assert.equal(response.status,200);return response.json();};
 const post=async body=>{const response=await fetch(`${url}/reference-actions`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};};
 console.log('Reading initial HTTP dossier state');
 const original=await get(),state=original.view.references.find(d=>d.dossierId===dossier.id);
 assert.equal(state.status,'diagnostic');
 const request=()=>({action:'adopt',dossierId:dossier.id,selectionHash:state.selectionHash,reason:'Synthetic development HTTP adoption only; not actual user approval.',commandId:randomUUID(),expectedRevision:project.revision});
 const capture=dossier.tools.find(slot=>slot.kind==='page'&&slot.state==='completed').result;
 const missing=[
  ['image',join(root,'images','objects',dossier.candidates[0].image.sha256)],
  ['report',dossier.reports[0].payloadRef],
  ['packet',join(dirname(dossier.reports[0].payloadRef),'packet.json')],
  ['capture-record',join(root,'source-captures','captures',`${capture.recordHash}.json`)],
  ['capture-original',join(root,'source-captures',capture.record.raw.file)],
 ];
 if(process.env.REFERENCE_REPAIR_BASELINE==='1'){
  const [label,path]=missing[0],away=`${path}.repair-missing`;await rename(path,away);
  try{const displayed=await get(),adopted=await post(request());assert.equal(adopted.status,200);assert.equal(adopted.body.view.references[0].status,'ready_for_sketch');console.log(JSON.stringify({baseline:'unsafe_adoption_reproduced',missing:label,displayed:displayed.view.references[0].status,adoptStatus:adopted.status,ready:adopted.body.view.references[0].status,adoptions:adopted.body.project.referenceDossiers[0].adoptions.length}));}
  finally{await rename(away,path);}return;
 }
 for(const [label,path]of missing){
  const away=`${path}.repair-missing`;await rename(path,away);
  try{
   const displayed=await get();assert.equal(displayed.view.references[0].status,'blocked',label);
   const adopted=await post(request());assert.equal(adopted.status,422,label);assert.equal(adopted.body.error.code,'REFERENCE_EVIDENCE_UNAVAILABLE',label);
   const unchanged=await get();assert.equal(unchanged.project.revision,project.revision,label);assert.equal(unchanged.project.referenceDossiers[0].adoptions.length,0,label);assert.equal(unchanged.view.references[0].status,'blocked',label);
  }finally{await rename(away,path);}
  const restored=await get();assert.equal(restored.view.references[0].status,'diagnostic',label);assert.equal(restored.view.references[0].selectionHash,state.selectionHash,label);
 }
 store=openStore(dbPath);
 const actualImages=createImageEvidenceStore({rootDir:join(root,'images')});
 let entered,release,armed=false;const gate=new Promise(resolve=>entered=resolve),wait=new Promise(resolve=>release=resolve);
 const imageStore={...actualImages,read:async input=>{const result=await actualImages.read(input);if(armed){armed=false;entered();await wait;}return result;}};
 const executor=createExecutor({...options,store,imageStore});
 const human={actorType:'human',actorId:'synthetic-development',runId:randomUUID(),contextId:randomUUID(),now:new Date().toISOString()};
 const command=(paused)=>store.command(project.id,{kind:'set-reference-pause',dossierId:dossier.id,paused,commandId:randomUUID(),expectedRevision:store.read(project.id).revision},human);
 armed=true;const adoption=executor.adoptReferences(project.id,request(),human);await gate;command(true);release();await assert.rejects(adoption,{code:'REFERENCE_EVIDENCE_UNAVAILABLE'});assert.equal(store.read(project.id).referenceDossiers[0].adoptions.length,0);command(false);
 const finalRequest={...request(),expectedRevision:store.read(project.id).revision},adopted=await post(finalRequest);assert.equal(adopted.status,200,JSON.stringify(adopted.body));assert.equal(adopted.body.view.references[0].status,'ready_for_sketch');assert.equal(adopted.body.project.referenceDossiers[0].adoptions.length,1);
 const replay=await post(finalRequest);assert.equal(replay.status,200);assert.equal(replay.body.project.revision,adopted.body.project.revision);assert.equal(replay.body.project.referenceDossiers[0].adoptions.length,1);
 const [label,path]=missing[0],away=`${path}.repair-missing`;await rename(path,away);try{assert.equal((await get()).view.references[0].status,'blocked',label);assert.equal((await executor.referenceStatus(project.id)).status,'blocked');}finally{await rename(away,path);}
 assert.equal((await get()).view.references[0].status,'ready_for_sketch');assert.equal(dispatches,0);
});
