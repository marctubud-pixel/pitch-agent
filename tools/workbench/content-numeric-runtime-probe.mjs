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
const {actualNumericContentUpstream}=await import('./content-numeric-source-fixture.mjs');
const {createCompleteContentRuntime,validateContentConfiguration}=await import('./complete-content-runtime.mjs');
const {contentNodes,contentRequest,ingestContent,validateManuscript,contentSourceLocations,requireContentCurrent,neutralContent,requireCompleteContent,reduceCompleteContent}=await import('./complete-content.mjs');
const {contentSourceEnvelope}=await import('./project.mjs');
const {openStore}=await import('./store.mjs');
const {numericRuntimeConfiguration,syntheticNumericContentResponse,numericManuscript}=await import('./content-numeric-runtime-fixture.mjs');
const {sketchHash:hash}=await import('./sketch-authority.mjs');
const {normalizeManuscript}=await import('../auto-layout/semantic-input.mjs');
const {planDeck}=await import('../auto-layout/layout.mjs');
const {freezeLayoutInput}=await import('./layout-boundary.mjs');
const {verifyContentOriginal}=await import('./content-original.mjs');
const {createCanvas}=await import('../auto-layout/node_modules/@napi-rs/canvas/index.js');
const {validateNumericChartPlan}=await import('../auto-layout/semantic-charts.mjs');
const clone=structuredClone;
function fixtureVisual(p){
 const directions=JSON.parse(p.artifacts.find(a=>a.id===p.activeByStage.copy)._text).directions.map((d,i)=>({directionId:d.id,approvedCopy:clone(d),explanation:'Pure visual explanation.',presentationIntent:'Pure visual intent.',claims:[],limitations:['Pure fixture only. No final visual authority.'],targets:[{imageId:`pure-image-${i}`,targetId:`pure-target-${i}`,sha256:hash(`pure-image-${i}`),mediaType:'image/png',byteLength:Buffer.byteLength(`pure-image-${i}`),width:10,height:10}],preservedFindings:[]}));
 const payload={directions,sourceImages:[]},run={id:'pure-visual',source:{neutralReferences:{referenceBoundaries:[],referenceQualifications:[]}},reports:[{id:'pure-aggregate',nodeKey:'aggregate',phase:'aggregate',raw:{understanding:'Explicit bounded visual test fixture.',payload}}]};
 if(p.activeByStage.visual==='pure-visual-artifact'){pureVisual={payload,run};return p;}
 p.activeByStage.visual='pure-visual-artifact';p.artifacts.push({id:'pure-visual-artifact',stage:'visual',contentHash:hash(payload)});p.releases.push({artifactId:'pure-visual-artifact',policyVersion:p.policies.at(-1).version});p.jobs.push({id:'pure-visual-owner',binding:{role:'visual-lead',providerId:'pure-visual',model:'unexecuted'},finalVisualRunId:run.id,nodeKey:'aggregate',attempts:[]});pureVisual={payload,run};return p;
}
function replace(file,p){const db=new DatabaseSync(file);try{db.exec('BEGIN IMMEDIATE');db.prepare('INSERT INTO revisions(project_id,revision,snapshot) VALUES(?,?,?) ON CONFLICT(project_id,revision) DO UPDATE SET snapshot=excluded.snapshot').run(p.id,p.revision,JSON.stringify(p));db.prepare('INSERT INTO heads(project_id,revision) VALUES(?,?) ON CONFLICT(project_id) DO UPDATE SET revision=excluded.revision').run(p.id,p.revision);db.prepare('DELETE FROM revisions WHERE project_id=? AND revision>?').run(p.id,p.revision);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}finally{db.close();}}
const actor=()=>({actorType:'agent',actorId:randomUUID(),runId:randomUUID(),contextId:randomUUID()});
test('Unit2B actual numeric runtime component dispatch, originals, owners and three semantic plans',{timeout:3570000},async t=>{
 const cache=process.env.NUMERIC_CONTENT_RUNTIME_CACHE;let saved;try{if(cache)saved=JSON.parse(gunzipSync(await readFile(cache)));}catch(error){if(error.code!=='ENOENT')throw error;}
 const f=saved?{...saved,store:openStore(join(saved.root,'content-citations.sqlite')),close:async()=>{}}:await actualNumericContentUpstream();
 if(cache&&!saved)await writeFile(cache,gzipSync(JSON.stringify({root:f.root,p:f.store.read('p'),upstreamCalls:f.calls.length})));
 t.after(cache?()=>f.store.close():f.close);
 const dbFile=saved?join(f.root,'content-citations.sqlite'):join(f.root,'db');
 if(saved&&!process.env.NUMERIC_CONTENT_RUNTIME_RESUME)replace(dbFile,saved.p);
 console.log(saved?'Replaying owned upstream with actual still-live managed originals. Zero new upstream calls.':'Fresh owned upstream executed. 33 synthetic calls and actual live original readers.');
 let p=f.store.read('p');p.artifacts.find(a=>a.id===p.activeByStage.copy)._text=await readFile(p.artifacts.find(a=>a.id===p.activeByStage.copy).payloadRef,'utf8');fixtureVisual(p);delete p.artifacts.find(a=>a.id===p.activeByStage.copy)._text;
 replace(dbFile,p);
 for(let i=0;i<3;i++)await writeFile(join(f.root,`image-${i}.png`),`pure-image-${i}`);
 const options=numericRuntimeConfiguration(),calls=[];
 const provider={model:'synthetic-content',async execute(request){const input=JSON.parse(request.prompt.slice(request.prompt.indexOf('UNTRUSTED_JSON_DATA\n')+20,request.prompt.lastIndexOf('\nEND_UNTRUSTED_JSON_DATA')));calls.push({node:input.nodeKey,phase:input.phase});const raw=syntheticNumericContentResponse(input);if(input.phase==='author'&&!input.productionCorrection)for(const intent of raw.manuscript.pageIntents)if(intent.central.kind==='text'&&!intent.id.startsWith('chart-'))intent.central.exactText=raw.manuscript.narrativeBlocks.find(b=>b.id===intent.blockIds[0]).text.slice(0,50);return {runId:request.runId,requestedModel:this.model,model:this.model,exitCode:0,threadId:randomUUID(),inputPacketHash:hash({runId:request.runId,model:this.model,...request,images:input.images}),responseText:JSON.stringify(raw),images:request.images.map((i,n)=>({...i,path:join(f.root,`image-${n}.png`)}))};}};
 const images=pureVisual.payload.directions.flatMap(d=>d.targets),imageStore={async read({imageId,expectedHash}){const i=images.find(i=>i.imageId===imageId);assert.equal(i.sha256,expectedHash);return {descriptor:clone(i)};}};
 const runtime=()=>createCompleteContentRuntime({store:f.store,root:f.root,providers:{'numeric-content-synthetic':provider},imageStore,finalVisuals:{async verifyFinalVisual(){return {componentFixtureOnly:true};}},...options});
 const command=c=>f.store.command('p',{commandId:randomUUID(),expectedRevision:f.store.read('p').revision,...c},actor());
 await t.test('exact v4 config and source-derived initial graph',async()=>{
  assert.equal(runtime().capability().configured,true);assert.equal(runtime().capability().editablePptIntegrated,false);assert.equal(validateContentConfiguration(options.configuration).length,13);
  const result=await runtime().continueContent('p',{commandId:'numeric-initial',expectedRevision:p.revision});if(process.env.NUMERIC_CONTENT_RUNTIME_RESUME)assert.notEqual(result.status,'blocked',JSON.stringify(result));else assert.equal(result.status,'planning',JSON.stringify(result));
  const r=f.store.read('p').jobs.findLast(j=>j.purpose==='complete_content_plan');assert.equal(r.task.packetVersion,'content-packet-v4');assert.equal(r.task.source.schemaVersion,'content-source-v3');assert.equal(r.task.source.chartContent.charts[0].requirements.length,1279);
  validateManuscript(numericManuscript(neutralContent(r.task.source)),r.task.source);
 });
 async function drain(){let result;for(let i=0;i<18;i++){result=await runtime().advanceContent('p');if(!result.queuedJobIds.length)return result;for(const id of result.queuedJobIds){const j=await runtime().execute('p',id);if(process.env.NUMERIC_CONTENT_RUNTIME_CHECKPOINT)await appendFile(process.env.NUMERIC_CONTENT_RUNTIME_CHECKPOINT,JSON.stringify({at:new Date().toISOString(),jobId:j.id,nodeKey:j.nodeKey,status:j.status,rootJobId:j.contentRootJobId,attemptId:j.attempts.at(-1)?.id,receiptSaved:!!j.attempts.at(-1)?.receipt,inputPacketHash:j.attempts.at(-1)?.receipt?.inputPacketHash,responseHash:j.attempts.at(-1)?.receipt?hash(j.attempts.at(-1).receipt.responseText):null,sourceHash:f.store.read('p').jobs.find(r=>r.id===j.contentRootJobId).task.source.sourceHash})+'\n');assert.equal(j.status,'succeeded',JSON.stringify(j.error));assert.equal(j.contentReport.valid,true,JSON.stringify({node:j.nodeKey,diagnostics:j.contentReport.diagnostics,message:j.contentReport.message,details:j.contentReport.details}));}}throw Error('bounded graph did not settle');}
 await t.test('all thirteen actual model calls remain independent and both original owners hand off',async()=>{
  const result=await drain();assert.equal(result.status,'ready_for_layout',JSON.stringify(result));const jobs=f.store.read('p').jobs.filter(j=>j.contentRootJobId===result.rootJobId);assert.equal(jobs.length,13);assert.equal(jobs.reduce((n,j)=>n+j.attempts.filter(a=>a.dispatchStarted).length,0),13);assert.deepEqual(new Set(jobs.map(j=>j.nodeKey)),new Set(contentNodes().map(n=>n.key)));
 });
 let completed=f.store.read('p'),contentRoot=completed.jobs.findLast(j=>j.purpose==='complete_content_plan');
 await t.test('source-addressed semantic return renews a full numeric revision without reusing old approvals',async()=>{
  const author=completed.jobs.find(j=>j.contentRootJobId===contentRoot.id&&j.nodeKey==='author');
  if(author.contentReport.raw.manuscript.pageIntents.some(i=>i.central.kind==='text'&&i.central.exactText.length>8&& !i.id.startsWith('chart-'))){
   const priorRoot=clone(contentRoot),priorReportHashes=completed.jobs.filter(j=>j.contentRootJobId===contentRoot.id).map(j=>({id:j.id,hash:hash(j.contentReport)}));
   const result=await runtime().reviseContent('p',{commandId:'numeric-semantic-revision',expectedRevision:completed.revision});assert.notEqual(result.status,'blocked',JSON.stringify(result));
   assert.equal(runtime().contentStatus('p').creativeStatus,'pending');
   assert.throws(()=>requireContentCurrent(f.store.read('p'),priorRoot,contentSourceEnvelope),{code:'CONTENT_NUMERIC_PREDECESSOR_STALE'});
   const revised=await drain();assert.equal(revised.status,'ready_for_layout',JSON.stringify(revised));assert.notEqual(revised.rootJobId,priorRoot.id);
   completed=f.store.read('p');contentRoot=completed.jobs.find(j=>j.id===revised.rootJobId);
   assert.equal(contentRoot.task.correction.kind,'numeric_content_revision');assert.equal(contentRoot.task.correction.originalReports.length,13);
   for(const old of priorReportHashes)assert.equal(hash(completed.jobs.find(j=>j.id===old.id).contentReport),old.hash);
  }
 });
 let trusted,input,prepared;
 await t.test('actual thirteen original packets and both original layout owners reconstruct on disk',async()=>{
  for(const j of completed.jobs.filter(j=>j.contentRootJobId===contentRoot.id)){const checked=await verifyContentOriginal(completed,contentRoot,j,{executionRoot:f.root});assert.equal(checked.valid,true);}
  trusted=await runtime().contentLayoutInput('p');
  assert.equal(trusted.contract.packetVersion,'content-packet-v4');assert.equal(trusted.contract.sourceLocationVersion,'content-source-location-v2');assert.equal(trusted.ownerReports.producer.raw.decision,'accept');assert.equal(trusted.ownerReports.consumer.raw.decision,'accept');
  prepared=freezeLayoutInput(completed,{...trusted,resources:[]},{version:'project-layout-boundary-v1',semanticVersion:'semantic-layout-v3',renderer:{identity:'component-only',closureHash:'a'.repeat(64)}});
  const assets=Object.fromEntries(trusted.source.images.map(i=>[i.imageId,{...i,role:'art'}]));
  input={semantic:normalizeManuscript(JSON.parse(prepared.ledgerText),assets),assets,brand:{name:'Synthetic component',font:{family:'Arial',files:['/System/Library/Fonts/Supplemental/Arial.ttf']},colors:{paper:'#ffffff',ink:'#111111',primary:'#112233',muted:'#444444',accent:'#bb9900'},minBodySize:22},cases:{},audience:{findings:[]}};
 });
 await t.test('three independently measured semantic styles keep every chart and exact local distinct clause',async()=>{
  assert.ok(input,'Actual trusted layout input is required');const plans={};
  for(const style of ['editorial','stage','evidence']){
   const plan=planDeck(input,style),chartSlide=plan.slides.find(s=>s.elements.some(e=>e.type==='chart'));
   assert.ok(chartSlide);assert.equal(chartSlide.elements.filter(e=>e.type==='chart').length,1);
   const metadata=chartSlide.elements.filter(e=>e.contentRefs?.chartMetadata);
   assert.equal(metadata.length,33);assert.equal(new Set(metadata.flatMap(e=>e.contentRefs.chartMetadata.map(r=>r.originId))).size,1279);
   assert.ok(metadata.every(e=>e.size>=16&&e.x>=0&&e.y>=0&&e.x+e.w<=1280&&e.y+e.h<=720));
   assert.equal(chartSlide.elements[0].values,undefined);assert.equal(chartSlide.elements[0].data,undefined);
   const ctx=createCanvas(1,1).getContext('2d');validateNumericChartPlan(input,plan,ctx);
   for(const alter of [x=>x.slides.find(s=>s.elements.some(e=>e.type==='chart')).elements.pop(),x=>x.slides.find(s=>s.elements.some(e=>e.type==='chart')).elements[0].chartRef.dataHash='0'.repeat(64),x=>x.slides.find(s=>s.elements.some(e=>e.type==='chart')).elements[1].size=8,x=>x.slides.find(s=>s.elements.some(e=>e.type==='chart')).elements.push(clone(x.slides.find(s=>s.elements.some(e=>e.type==='chart')).elements[0]))]){const changed=clone(plan);alter(changed);assert.throws(()=>validateNumericChartPlan(input,changed,ctx));}
   plans[style]=plan;
  }
  assert.notDeepEqual(plans.editorial.slides.find(s=>s.elements[0]?.type==='chart').elements[0],plans.stage.slides.find(s=>s.elements[0]?.type==='chart').elements[0]);
  if(process.env.NUMERIC_CONTENT_RUNTIME_EVIDENCE){await mkdir(process.env.NUMERIC_CONTENT_RUNTIME_EVIDENCE,{recursive:true});for(const [style,plan]of Object.entries(plans))await writeFile(join(process.env.NUMERIC_CONTENT_RUNTIME_EVIDENCE,`${style}-plan.json`),JSON.stringify(plan));}
 });
 await t.test('actual managed PNG decode and font inspection execute the public semantic plan method with an explicit standalone content adapter',async()=>{
  const {exerciseNumericSemanticResources}=await import('./content-numeric-semantic-fixture.mjs');
  const result=await exerciseNumericSemanticResources(completed,contentRoot.task.source,join(f.root,'standalone-semantic-resource-fixture'));
  assert.equal(result.styles.length,3);assert.equal(result.nativeExport,false);
  if(process.env.NUMERIC_CONTENT_RUNTIME_EVIDENCE){await mkdir(process.env.NUMERIC_CONTENT_RUNTIME_EVIDENCE,{recursive:true});await writeFile(join(process.env.NUMERIC_CONTENT_RUNTIME_EVIDENCE,'semantic-resource-result.json'),JSON.stringify(result,null,2));}
 });
 await t.test('a pure repeated-occurrence geometry fork keeps each complete metadata group on its own chart slide',()=>{
  assert.ok(input);const ledger=JSON.parse(prepared.ledgerText),m=ledger.manuscript,first=m.chartPlacements[0],second={...clone(first),occurrenceId:'pure-second-occurrence',pageIntentId:'pure-second-chart-intent'},ids=new Map();
  for(const id of new Set(first.visibleBlockRefs.map(r=>r.blockId))){const b=clone(m.narrativeBlocks.find(b=>b.id===id));b.id+='-second';ids.set(id,b.id);m.narrativeBlocks.push(b);}
  second.visibleBlockRefs.forEach(r=>r.blockId=ids.get(r.blockId));m.chartPlacements.push(second);
  m.pageIntents.push({id:second.pageIntentId,central:{kind:'text',exactText:m.narrativeBlocks.find(b=>b.id===ids.values().next().value).text},heroImageId:null,blockIds:[...ids.values()],imageIds:[],allowedSplitAfterBlockIds:[]});
  ledger.contentBinding.manuscriptHash=hash(m);const fork={...input,semantic:normalizeManuscript(ledger,input.assets)};
  for(const style of ['editorial','stage','evidence']){const plan=planDeck(fork,style),slides=plan.slides.filter(s=>s.elements.some(e=>e.type==='chart'));assert.equal(slides.length,2);assert.deepEqual(new Set(slides.map(s=>s.elements[0].chartRef.occurrenceId)),new Set([first.occurrenceId,second.occurrenceId]));for(const slide of slides)assert.equal(new Set(slide.elements.flatMap(e=>e.contentRefs?.chartMetadata?.map(r=>r.originId)??[])).size,1279);}
 });
 await t.test('local chart atom overflow returns original owner and exact origin without truncation',()=>{
  assert.ok(input);const oversized=clone(input),p=oversized.semantic.chartPlacements[0],bid=p.visibleBlockRefs[0].blockId;
  oversized.semantic.blocksById[bid].text+=' '.repeat(10)+'excessively long metadata '.repeat(3000);
  for(const style of ['editorial','stage','evidence'])assert.throws(()=>planDeck(oversized,style),e=>e.code==='SEMANTIC_CHART_ATOM_OVERFLOW'&&e.issues[0].originIds.includes(p.visibleBlockRefs[0].originId)&&e.issues[0].responsibleOwner==='research-lead');
 });
 await t.test('full-source ingest rejects a neutral DTO, rewritten neutral metadata and tuple mixing',()=>{
  const job=completed.jobs.find(j=>j.contentRootJobId===contentRoot.id&&j.nodeKey==='author'),request=contentRequest(completed,contentRoot,job.node),receipt=job.contentReport.receipt;
  assert.equal(ingestContent(request.input,receipt,undefined).valid,false);
  assert.equal(ingestContent(request.input,receipt,undefined,request.input.neutral).valid,false);
  const locations=clone(request.input);locations.sourceLocations.pop();assert.equal(ingestContent(locations,receipt,undefined,contentRoot.task.source).valid,false);
  const changed=clone(request.input);changed.neutral.chartContent.charts[0].requirements.pop();assert.equal(ingestContent(changed,receipt,undefined,contentRoot.task.source).valid,false);
  const root=clone(contentRoot);root.task.packetVersion='content-packet-v3';assert.throws(()=>contentRequest(completed,root,job.node),{code:'CONTENT_CONTRACT_INVALID'});
  for(const alter of [x=>x.chartPlacements[0].visibleBlockRefs.pop(),x=>x.chartPlacements[0].dataHash='0'.repeat(64),x=>x.chartPlacements[0].values=[9],x=>x.chartPlacements[0].approved=true,x=>x.chartPlacements.push(clone(x.chartPlacements[0])),x=>x.chartPlacements[0].visibleBlockRefs[0].blockId='other-page']){const m=clone(job.contentReport.raw.manuscript);alter(m);assert.throws(()=>validateManuscript(m,contentRoot.task.source));}
 });
 await t.test('both policy modes retain exact selected-human content gate in a fixed-source component probe',()=>{
  // This probes the gate only. The fixed source builder is explicit and cannot prove a policy renewal.
  for(const mode of ['auto','assisted']){
   const p=clone(completed),artifact=p.artifacts.find(a=>a.id===p.activeByStage.content_review),basis=contentRoot.task.source.immutableBasis,builder=()=>basis;
   Object.assign(p.policies.at(-1),{mode,humanGates:['content_review']});
   assert.throws(()=>requireCompleteContent(p,artifact,builder),{code:'HUMAN_GATE'});
   const request={kind:'adopt-complete-content',artifactId:artifact.id,draftHash:artifact.contentHash,reason:'Synthetic policy gate component only. No actual human approval.'};
   reduceCompleteContent(p,request,{actorType:'human',actorId:'synthetic-policy-gate-human'},builder);
   assert.equal(p.decisions.at(-1).creativeStatus,'user_designated');assert.equal(p.decisions.at(-1).factualVerification,'not_granted_by_adoption');
   assert.equal(requireCompleteContent(p,artifact,builder).id,contentRoot.id);
   const changed=clone(p);changed.decisions.at(-1).draftHash='0'.repeat(64);assert.throws(()=>requireCompleteContent(changed,artifact,builder),{code:'HUMAN_GATE'});
  }
 });
 await t.test('actual source currentness rejects changed policy and upstream support without reusing approvals',()=>{
  for(const mutate of [p=>p.policies.at(-1).humanGates.push('content_review'),p=>p.verifications[0].rawReport.quantitativeResults[0].outcome='unsupported']){
   const changed=clone(completed);mutate(changed);assert.throws(()=>requireContentCurrent(changed,contentRoot,contentSourceEnvelope));
  }
 });
 await t.test('changed original normalized bytes block content consumption before another dispatch',async()=>{
  const artifact=completed.artifacts.find(a=>a.id===completed.activeByStage.copy),bytes=await readFile(artifact.payloadRef);
  try{await writeFile(artifact.payloadRef,Buffer.concat([bytes,Buffer.from(' ')]));await assert.rejects(()=>runtime().contentDraft('p'));}finally{await writeFile(artifact.payloadRef,bytes);}
 });
 await t.test('saved anchored unknown original recovers locally without another model call',async()=>{
  const saved=clone(f.store.read('p')),j=saved.jobs.find(j=>j.contentRootJobId===contentRoot.id&&j.nodeKey==='layout:consumer');j.status=j.attempts.at(-1).status='awaiting_reconciliation';delete j.attempts.at(-1).receipt;delete j.contentReport;j.outputVersionIds=[];
  replace(dbFile,saved);const before=calls.length,result=await runtime().advanceContent('p');assert.equal(result.status,'ready_for_layout',JSON.stringify(result));assert.equal(calls.length,before);assert.equal(f.store.read('p').jobs.find(x=>x.id===j.id).status,'succeeded');
 });
 if(process.env.NUMERIC_CONTENT_RUNTIME_EVIDENCE){await mkdir(process.env.NUMERIC_CONTENT_RUNTIME_EVIDENCE,{recursive:true});await writeFile(join(process.env.NUMERIC_CONTENT_RUNTIME_EVIDENCE,'executed-content-project.json.gz'),gzipSync(JSON.stringify(f.store.read('p'))));await writeFile(join(process.env.NUMERIC_CONTENT_RUNTIME_EVIDENCE,'runtime-summary.json'),JSON.stringify({scope:'component only',upstreamCalls:saved?0:f.calls.length,contentCalls:f.store.read('p').jobs.filter(j=>j.contentRootJobId).reduce((n,j)=>n+j.attempts.filter(a=>a.dispatchStarted).length,0),newContentCalls:calls.length,resumed:!!process.env.NUMERIC_CONTENT_RUNTIME_RESUME,actualVisual:false,specialistPrerequisiteMock:true,actualContentOriginalReaders:true,policyGateProbe:'fixed-source component only; no actual human approval',nativeChartExport:false,root:f.root,nodes:calls},null,2));}
 console.log('Content graph completed with explicitly mocked visual and specialist prerequisites only. No native PPT or final visual approval.');
});
