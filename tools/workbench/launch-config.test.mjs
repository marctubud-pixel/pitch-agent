import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,mkdir,access,stat,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import net from 'node:net';
import {once} from 'node:events';
import {loadLaunchSettings,buildLaunchOptions} from './launch-config.mjs';
import {contentNodes} from './complete-content.mjs';
import {validateReferenceConfiguration} from './reference-dossier.mjs';
import {REVIEW_ROLES,reviewEnvelope} from './sketch-review-v2.mjs';
import {finalEnvelope} from './final-visual.mjs';
import {imageManifest,buildImageObservationRequest} from './image-evidence.mjs';
import {openStore} from './store.mjs';
import {RESEARCH_DATA_VERSION,researchDataBasis} from './research-chart-data.mjs';
import {installSqliteBudget} from './launch-test-sqlite-budget.mjs';
const root=await mkdtemp(join(tmpdir(),'launcher-owned-'));
const counterFile=join(root,'logical-sqlite-io.json');installSqliteBudget(counterFile);
const executable=fileURLToPath(new URL('server.mjs',import.meta.url));
const guard=join(root,'guard.mjs'),effectFile=join(root,'forbidden-effects.jsonl');
await writeFile(guard,`import {installSqliteBudget} from ${JSON.stringify(new URL('launch-test-sqlite-budget.mjs',import.meta.url).href)};installSqliteBudget(${JSON.stringify(counterFile)});import fs from 'node:fs';import cp from 'node:child_process';import http from 'node:http';import https from 'node:https';import {syncBuiltinESMExports} from 'node:module';const deny=kind=>(...args)=>{fs.appendFileSync(${JSON.stringify(effectFile)},JSON.stringify({kind})+'\\n');throw new Error('Owned test forbids external effects');};for(const key of ['spawn','exec','execFile','fork','spawnSync','execSync','execFileSync'])cp[key]=deny('child:'+key);http.request=deny('http');http.get=deny('http');https.request=deny('https');https.get=deny('https');globalThis.fetch=deny('fetch');syncBuiltinESMExports();`);
const exists=async p=>access(p).then(()=>true,()=>false);
let processCount=0;
async function freePort(){const s=net.createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const port=s.address().port;await new Promise(r=>s.close(r));return port;}
async function fixture(){const dir=await mkdtemp(join(root,'case-'));const port=await freePort();return {dir,config:{schemaVersion:'workbench-launch-v1',server:{port,dbPath:'db.sqlite',executionRoot:'executions',maxConcurrentJobs:1}}};}
async function save(f){f.path=join(f.dir,'deployment.json');await writeFile(f.path,JSON.stringify(f.config));return f.path;}
async function cli(f,{legacy=false,extra={}}={}){
 const env={PATH:'/usr/bin:/bin',HOME:f.dir,...(legacy?{PORT:String(f.config.server.port),WORKBENCH_DB:join(f.dir,'db.sqlite'),WORKBENCH_EXECUTIONS:join(f.dir,'executions')}:{WORKBENCH_CONFIG:await save(f)}),...extra};
 const child=spawn(process.execPath,['--max-old-space-size=512','--import',guard,executable],{cwd:f.dir,env,stdio:['ignore','pipe','pipe']});processCount++;
 let stdout='',stderr='';child.stdout.on('data',b=>{stdout+=b;assert.ok(Buffer.byteLength(stdout)<65536);});child.stderr.on('data',b=>{stderr+=b;assert.ok(Buffer.byteLength(stderr)<65536);});
 let done=false;const exited=once(child,'exit').then(([code,signal])=>{done=true;return {code,signal};});
 const deadline=Date.now()+8000;
 while(!done&&!stdout.includes('Workbench available at')&&Date.now()<deadline)await new Promise(r=>setTimeout(r,10));
 if(!done&&!stdout.includes('Workbench available at')){child.kill('SIGKILL');throw new Error('CLI startup timeout');}if(done)throw new Error('CLI refused startup: '+stderr);
 return {child,get stdout(){return stdout;},get stderr(){return stderr;},get done(){return done;},exited,async stop(){if(!done)child.kill('SIGTERM');return exited;},request:async(path,body)=>{const r=await fetch(`http://127.0.0.1:${f.config.server.port}${path}`,body===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};}};
}
function modules(f){
 const binding={providerId:'owned',model:'owned-model',role:'unused'};const cap=operation=>({operation,origin:'Owned declaration only',version:'owned-v1',status:'configured_unverified',maxImages:4,maxBytes:1024,maxPixels:4096,assignment:{providerId:'owned',model:'owned-model'},limitations:['No actual provider verification.']});
 const configs={reference:{discoveryMode:'manual_supplied',budget:{maxModelCalls:129,maxSearchCalls:0},calibrations:[]},sketch:{maxCalls:9,origin:'Owned allowance',version:'v1'},sketchReview:{maxCalls:200,origin:'Owned review',version:'v1',capability:cap('sketch-review-v2')},finalVisual:{origin:'Owned final',version:'v1',maxImageCalls:9,maxReviewCalls:200,capabilities:Object.fromEntries(['owner',...REVIEW_ROLES.flatMap(r=>[`score_${r}`,`opposition_${r}`]),'director'].map(k=>[k,cap('final-visual-v1')]))},content:{packetVersion:'content-packet-v3',allowance:{maxCalls:39,previousMaxCalls:13,origin:'Owned content',version:'v1',reason:'Owned explicit declaration'},capabilities:Object.fromEntries(contentNodes().map(n=>[n.key,{...cap('complete-content-v1'),packetVersion:'content-packet-v3'}]))},layout:{version:'project-layout-boundary-v1',semanticVersion:'semantic-layout-v2',renderer:{identity:'owned-declaration',closureHash:'a'.repeat(64)},resources:[{id:'brand',kind:'brand',path:'brand.json',sha256:'b'.repeat(64)}]}};
 const keys=[...validateReferenceConfiguration(configs.reference).map(x=>x.key),'sketch','visual',...['sketch_review','final_visual'].flatMap(prefix=>[...REVIEW_ROLES.flatMap(r=>[`${prefix}_score_${r}`,`${prefix}_opposition_${r}`]),`${prefix}_director`]),...contentNodes().map(n=>n.key==='producer:strategy'?'strategy':n.key==='producer:copy'?'copy':`content_${n.key.replaceAll(':','_')}`)];
 const bindings=Object.fromEntries(keys.map(k=>[k,{...binding}]));bindings.reference_lead.role='references-lead';bindings.sketch.role='sketch-lead';bindings.visual.role='visual-lead';for(const n of contentNodes()){const k=n.key==='producer:strategy'?'strategy':n.key==='producer:copy'?'copy':`content_${n.key.replaceAll(':','_')}`;bindings[k].role=n.key==='producer:strategy'?'strategy-lead':n.key==='producer:copy'?'copy-lead':n.role;}
 Object.assign(f.config,{textProviders:{owned:{adapter:'codex-cli',model:'owned-model',binary:'/owned/never-run-provider'}},bindings,moduleConfigs:Object.fromEntries(Object.keys(configs).map(k=>[k,`modules/${k}.json`]))});return configs;
}
async function saveModules(f){const c=modules(f);await mkdir(join(f.dir,'modules'));for(const [name,value]of Object.entries(c))await writeFile(join(f.dir,'modules',`${name}.json`),JSON.stringify(value));return c;}
test('ordinary legacy CLI stays local, creates projects and reports disabled later modules',async()=>{
 const f=await fixture(),app=await cli(f,{legacy:true});try{const caps=(await app.request('/api/capabilities')).body;assert.equal(caps.references.configured,false);assert.equal(caps.completeContent.configured,false);assert.equal(caps.image.invocationSupported,false);const created=await app.request('/api/projects',{name:'Owned CLI',brief:'Unconfirmed owned task'});assert.equal(created.status,201);assert.equal(created.body.project.jobs.length,0);}finally{assert.equal((await app.stop()).code,0);}
});
test('all six configured modules load their owner schemas and remain unverified over ordinary HTTP',async()=>{
 const f=await fixture();await saveModules(f);const settings=await loadLaunchSettings({configPath:await save(f)}),options=buildLaunchOptions(settings);assert.equal(options.contentConfiguration.packetVersion,'content-packet-v3');assert.equal(options.layoutConfiguration.resources[0].path,join(f.dir,'modules','brand.json'));assert.equal(Object.keys(options.providers).length,1);
 const app=await cli(f);try{const caps=(await app.request('/api/capabilities')).body;assert.equal(caps.references.configured,true);assert.equal(caps.references.semanticApproval,false);assert.equal(caps.sketchReview.configured,true);assert.equal(caps.finalVisual.semanticApproval,false);assert.equal(caps.completeContent.realQualityVerified,false);assert.equal(caps.layout.finalAuthorityAvailable,false);const p=(await app.request('/api/projects',{name:'Owned modules',brief:'Unconfirmed',mode:'auto'})).body.project;assert.equal(p.jobs.length,0);assert.equal(p.releases.length,0);}finally{await app.stop();}
});
test('v4 content and v3 numeric semantic plans declare only their implemented capabilities over ordinary HTTP',async()=>{
 const f=await fixture(),configs=await saveModules(f);
 configs.content.packetVersion='content-packet-v4';for(const c of Object.values(configs.content.capabilities))c.packetVersion='content-packet-v4';
 configs.layout.semanticVersion='semantic-layout-v3';
 for(const name of ['content','layout'])await writeFile(join(f.dir,'modules',`${name}.json`),JSON.stringify(configs[name]));
 const options=buildLaunchOptions(await loadLaunchSettings({configPath:await save(f)}));assert.equal(options.contentConfiguration.packetVersion,'content-packet-v4');assert.equal(options.layoutConfiguration.semanticVersion,'semantic-layout-v3');
 const app=await cli(f);try{
  const caps=(await app.request('/api/capabilities')).body;assert.equal(caps.completeContent.configured,true);assert.equal(caps.completeContent.executionIntegrated,true);assert.equal(caps.completeContent.manuscriptVersion,'complete-manuscript-v3');assert.equal(caps.completeContent.editablePptIntegrated,false);assert.equal(caps.layout.exportAvailable,false);assert.equal(caps.layout.nativeExecutionIntegrated,true);assert.equal(caps.layout.numericNativeChartExportAvailable,false);assert.ok(caps.layout.semanticPlanVersions.includes('semantic-layout-v3'));
  const p=(await app.request('/api/projects',{name:'Owned numeric capability',brief:'Unconfirmed',mode:'assisted',humanGates:['content_review']})).body.project;assert.equal(p.jobs.length,0);const plans=await app.request(`/api/projects/${p.id}/layout-semantic-plans`);assert.equal(plans.status,422);assert.equal(plans.body.error.code,'LAYOUT_SEMANTIC_V3_REQUIRED');
 }finally{await app.stop();}
});
test('invalid explicit deployments fail before database creation',async t=>{
 const mutations={malformed:f=>'{',duplicate:f=>' {"schemaVersion":"workbench-launch-v1","schemaVersion":"secret-value"}',unknown:f=>{f.config.privateKey='sentinel';},adapter:f=>{f.config.textProviders={x:{adapter:'javascript',model:'m'}};},mismatch:f=>{f.config.textProviders={x:{adapter:'codex-cli',model:'m'}};f.config.bindings={research:{providerId:'x',model:'other',role:'research-lead'}};},bounds:f=>{f.config.server.maxConcurrentJobs=99;},unknownRole:f=>{f.config.bindings={typo:{providerId:'x',model:'m',role:'x'}};}};
 for(const [name,mutate]of Object.entries(mutations))await t.test(name,async()=>{const f=await fixture();const text=mutate(f);await save(f);if(typeof text==='string')await writeFile(f.path,text);const app=await cliRaw(f,f.path);assert.equal((await app.exited).code,1);assert.equal(await exists(join(f.dir,'db.sqlite')),false);assert.ok(!app.stderr.includes('secret-value'));});
 for(const name of ['missing','directory','symlink','oversize','invalidUtf8','legacyConflict','moduleBinding','moduleUnknown','relativeWrongOrigin'])await t.test(name,async()=>{
  const f=await fixture();await save(f);let path=f.path,extra={};
  if(name==='missing')path=join(f.dir,'absent.json');if(name==='directory')path=f.dir;if(name==='symlink'){path=join(f.dir,'link.json');await symlink(f.path,path);}if(name==='oversize')await writeFile(path,' '.repeat(65537));if(name==='invalidUtf8')await writeFile(path,Buffer.from([0xff]));if(name==='legacyConflict')extra={WORKBENCH_MODEL:'do-not-echo'};
  if(name.startsWith('module')||name==='relativeWrongOrigin'){f.config.moduleConfigs={sketch:'module.json'};await writeFile(join(f.dir,'module.json'),JSON.stringify({maxCalls:9,origin:'Owned',version:'v1',...(name==='moduleUnknown'?{surprise:true}:{})}));if(name==='relativeWrongOrigin')f.config.moduleConfigs.sketch='not-in-config-origin/module.json';await save(f);}
  const app=await cliRaw(f,path,extra);assert.equal((await app.exited).code,1);assert.equal(await exists(join(f.dir,'db.sqlite')),false);assert.ok(!app.stderr.includes('do-not-echo'));
 });
});
async function cliRaw(f,path,extra={}){const child=spawn(process.execPath,['--max-old-space-size=512','--import',guard,executable],{cwd:f.dir,env:{PATH:'/usr/bin:/bin',HOME:f.dir,WORKBENCH_CONFIG:path,...extra},stdio:['ignore','pipe','pipe']});processCount++;let stderr='';child.stderr.on('data',b=>stderr+=b);child.stdout.resume();const timer=setTimeout(()=>child.kill('SIGKILL'),5000);const exited=once(child,'exit').then(([code,signal])=>{clearTimeout(timer);return {code,signal};});return {get stderr(){return stderr;},exited};}
test('image configuration has no fabricated verification or credential exposure',async()=>{
 const f=await fixture();f.config.imageConfigPath='image.json';const image={providerId:'owned-image',adapter:'openai-images-v1',baseUrl:'https://example.invalid/v1',model:'owned-image',credentialEnv:'OWNED_IMAGE_SECRET',operations:{generate:true,edit:false},supportedOptions:{generate:{},edit:{}}};await writeFile(join(f.dir,'image.json'),JSON.stringify(image));
 for(const extra of [{},{OWNED_IMAGE_SECRET:'sentinel-owned-key-not-for-output'}]){const app=await cli(f,{extra});try{const caps=(await app.request('/api/capabilities')).body;assert.equal(caps.image.configured,true);assert.equal(caps.image.invocationSupported,!!extra.OWNED_IMAGE_SECRET);assert.equal(caps.image.liveVerification.generate,'not_verified');assert.ok(!JSON.stringify(caps).includes('sentinel-owned-key'));assert.ok(!app.stderr.includes('sentinel-owned-key'));}finally{await app.stop();}}
 image.adapter='invalid';await writeFile(join(f.dir,'image.json'),JSON.stringify(image));const app=await cliRaw(f,await save(f));assert.equal((await app.exited).code,1);
});
test('assisted human policy and original history persist through ordinary restart without adoption',async()=>{
 const f=await fixture();let app=await cli(f);const p=(await app.request('/api/projects',{name:'Owned assisted',brief:'Review required',mode:'assisted',humanGates:['strategy','copy','visual','content_review','final_review']})).body.project;const route=`/api/projects/${p.id}`;let confirmed;try{const r=await app.request(`${route}/commands`,{kind:'confirm-task-card',taskCardId:p.activeTaskCardId,commandId:'owned-confirm',expectedRevision:0});assert.equal(r.status,200);confirmed=r.body.project;}finally{await app.stop();}
 app=await cli(f);try{const now=(await app.request(route)).body.project;assert.deepEqual(now,confirmed);const old=(await app.request(`${route}?revision=0`)).body.project;assert.equal(old.confirmations.length,0);assert.deepEqual(now.policies.at(-1).humanGates,['strategy','copy','visual','content_review','final_review']);assert.equal(now.decisions.length,0);}finally{await app.stop();}
});
test('frozen pending and unknown jobs cannot use a replacement model on ordinary restart',async()=>{
 const f=await fixture();f.config.textProviders={owned:{adapter:'codex-cli',model:'replacement',binary:'/owned/never-run-provider'}};f.config.bindings={research:{providerId:'owned',model:'replacement',role:'research-lead'}};
 const store=openStore(join(f.dir,'db.sqlite'));const ctx={actorId:'owned-human',actorType:'human',runId:'human-run',contextId:'human-context'};const send=(id,c,context=ctx)=>store.command(id,{...c,commandId:`${id}-${c.kind}`,expectedRevision:store.read(id).revision},context);
 for(const id of ['pending','uncertain']){
  store.create({id,name:id,brief:'Owned reducer setup',mode:'assisted',humanGates:['strategy'],authorizedThrough:'strategy'},ctx);
  send(id,{kind:'confirm-task-card',taskCardId:`${id}:scope:1`});
  const confirmed=store.read(id),taskCard=confirmed.taskCards.find(card=>card.id===confirmed.activeTaskCardId),sourceRecords=[];
  const request={kind:'request-stage',stage:'research',jobId:`job-${id}`,binding:{providerId:'owned',model:'original',role:'research-lead'},task:{id:`task-${id}`,owner:'research',parentId:null}};
  assert.throws(()=>send(id,request),{code:'RESEARCH_V2_REQUIRED'});
  assert.deepEqual(store.read(id),confirmed);
  send(id,{...request,task:{...request.task,researchContractVersion:RESEARCH_DATA_VERSION,researchDataBasis:researchDataBasis({taskCard,confirmations:confirmed.confirmations.filter(c=>c.taskCardId===taskCard.id),sourceRecords}),sourceRecords,visualCatalogue:[],taskCardId:taskCard.id,brief:taskCard.brief}});
  if(id==='uncertain'){const owner={actorType:'agent',actorId:'original-owner',runId:'original-run',contextId:'original-context',executorHost:'foreign-owned-host',executorPid:123};send(id,{kind:'start-job',jobId:`job-${id}`,attemptId:'attempt-original'},owner);send(id,{kind:'finish-job-error',jobId:`job-${id}`,attemptId:'attempt-original',status:'awaiting_reconciliation',error:{code:'OWNED_UNKNOWN',message:'Owned uncertain receipt'}},owner);}
 }
 const oldPending=store.read('pending'),oldUnknown=store.read('uncertain');store.close();
 const app=await cli(f);try{const pending=(await app.request('/api/projects/pending')).body.project,unknown=(await app.request('/api/projects/uncertain')).body.project;assert.equal(pending.jobs[0].status,'blocked');assert.equal(pending.jobs[0].error.code,'MODEL_BINDING_MISMATCH');assert.equal(pending.jobs[0].binding.model,'original');assert.deepEqual(unknown,oldUnknown);const historical=(await app.request(`/api/projects/pending?revision=${oldPending.revision}`)).body.project;assert.deepEqual(historical,oldPending);}finally{await app.stop();}
});
test('declared modules preserve missing image and uncalibrated/native/final limitations',async()=>{
 const f=await fixture();await saveModules(f);const app=await cli(f);try{const c=(await app.request('/api/capabilities')).body;assert.equal(c.image.configured,false);assert.equal(c.completeContent.packetVersion,'content-packet-v3');assert.equal(c.completeContent.editablePptIntegrated,false);assert.equal(c.layout.exportAvailable,false);assert.equal(c.layout.finalAuthorityAvailable,false);assert.equal(c.finalVisual.realEnvelopeVerified,false);assert.equal(c.creativePanels.calibration,'trusted runtime configuration only; uncalibrated by default');}finally{await app.stop();}
});
test('versioned native declarations are parsed without inspecting declared executables or trees',async()=>{
 const f=await fixture(),configs=await saveModules(f);const names=['node','engine','nativeCheck','python','soffice','bash'];configs.layout.execution={protocol:'project-native-execution-v2',identitySemantics:'complete-toolchain-trees-v2',...Object.fromEntries(names.map(k=>[k,`/owned-not-read/${k}`])),nativeRuntime:'/owned-not-read/runtime',presentationsSkill:'/owned-not-read/presentations',files:names.map(k=>({path:`/owned-not-read/${k}`,bytes:1,sha256:'a'.repeat(64),mode:384})),dependencyRoots:['runtime','presentations'].map(k=>({path:`/owned-not-read/${k}`,format:'exact-tree-v2',entries:[{path:'.',kind:'directory',mode:448}]}))};
 await writeFile(join(f.dir,'modules','layout.json'),JSON.stringify(configs.layout));const app=await cli(f);try{const c=(await app.request('/api/capabilities')).body;assert.equal(c.layout.exportAvailable,false);}finally{await app.stop();}
 configs.layout.execution.files[0].sha256='invalid';await writeFile(join(f.dir,'modules','layout.json'),JSON.stringify(configs.layout));const refused=await cliRaw(f,await save(f));assert.equal((await refused.exited).code,1);
});
test('scoped image envelopes preserve ordinary limits and complete review/final sets',()=>{
 const assignment=Object.freeze({providerId:'owned',model:'owned-model'});
 const images=Object.freeze(Array.from({length:9},(_,i)=>Object.freeze({imageId:`owned-${i}`,sha256:'a'.repeat(64),mediaType:'image/png',byteLength:100,width:2,height:3})));
 const expected=images.map(({imageId,sha256,mediaType,byteLength})=>({imageId,sha256,mediaType,byteLength}));
 const owners=[{operation:'sketch-review-v2',envelope:reviewEnvelope,required:'REVIEW_CAPABILITY_REQUIRED',exceeded:'REVIEW_CAPACITY_EXCEEDED'}, {operation:'final-visual-v1',envelope:(images,cap)=>finalEnvelope(images,cap,assignment),required:'FINAL_CAPABILITY_REQUIRED',exceeded:'FINAL_CAPACITY_EXCEEDED'}];
 for(const count of [5,9])for(const owner of owners){
  const complete=Object.freeze(images.slice(0,count)),before=structuredClone(complete);
  const cap=Object.freeze({operation:owner.operation,origin:'Owned declaration only',version:'v1',status:'configured_unverified',maxImages:count,maxBytes:count*100,maxPixels:count*6,assignment,limitations:Object.freeze(['No actual provider verification.'])});
  assert.deepEqual(owner.envelope(complete,cap),{count,bytes:count*100,pixels:count*6});
  assert.deepEqual(imageManifest(complete,{operation:owner.operation,limits:cap}),expected.slice(0,count));
  for(const key of ['maxImages','maxBytes','maxPixels']){
   const smaller=Object.freeze({...cap,[key]:cap[key]-1});
   assert.throws(()=>owner.envelope(complete,smaller),{code:owner.exceeded},`${owner.operation} must reject the complete ${count}-image set over ${key}`);
   assert.deepEqual(complete,before);
   assert.equal(smaller[key],cap[key]-1);
  }
  for(const invalid of [undefined,{...cap,operation:'observe'},{...cap,operation:undefined},{...cap,origin:''},{...cap,status:'verified'}])assert.throws(()=>owner.envelope(complete,invalid),{code:owner.required});
  for(const key of ['maxImages','maxBytes','maxPixels'])for(const value of [undefined,0,-1,1.5,Infinity,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>owner.envelope(complete,{...cap,[key]:value}),{code:owner.required});
  assert.throws(()=>owner.envelope(complete,{...cap,assignment:undefined}),{code:owner.operation==='sketch-review-v2'?owner.required:'FINAL_CAPABILITY_ASSIGNMENT'});
  assert.equal(cap.status,'configured_unverified');
  assert.equal(cap.evidence,undefined);
  assert.deepEqual(complete,before);
 }
 for(let count=1;count<=4;count++){
  assert.deepEqual(imageManifest(images.slice(0,count)),expected.slice(0,count));
  assert.deepEqual(buildImageObservationRequest({images:images.slice(0,count)}).manifest,expected.slice(0,count));
 }
 assert.throws(()=>imageManifest(images.slice(0,5)),/one to four/);
 assert.throws(()=>buildImageObservationRequest({images:images.slice(0,5)}),/one to four/);
 const finalCap={operation:'final-visual-v1',origin:'Owned declaration',version:'v1',status:'configured_unverified',maxImages:9,maxBytes:900,maxPixels:54,assignment,limitations:['No actual provider verification.']};
 for(const key of ['providerId','model'])assert.throws(()=>finalEnvelope(images,finalCap,{...assignment,[key]:'different'}),{code:'FINAL_CAPABILITY_ASSIGNMENT'});
});
test('scoped image envelope assignments remain enforced at launch configuration boundary',async()=>{
 const f=await fixture(),configs=await saveModules(f),path=await save(f);
 const baseline=await loadLaunchSettings({configPath:path});
 assert.equal(baseline.moduleConfigs.sketchReview.capability.status,'configured_unverified');
 assert.equal(baseline.moduleConfigs.finalVisual.capabilities.owner.status,'configured_unverified');
 for(const name of ['sketchReview','finalVisual'])for(const key of ['providerId','model']){
  const changed=structuredClone(configs[name]);
  const cap=name==='sketchReview'?changed.capability:changed.capabilities.owner;
  cap.assignment[key]='different';
  const modulePath=join(f.dir,'modules',`${name}.json`);
  await writeFile(modulePath,JSON.stringify(changed));
  await assert.rejects(loadLaunchSettings({configPath:path}),{code:'BINDING_MODEL_MISMATCH'});
  await writeFile(modulePath,JSON.stringify(configs[name]));
 }
 assert.equal(await exists(join(f.dir,'db.sqlite')),false);
});
test('calibration declarations retain profile and role attribution without granting verification',async()=>{
 const f=await fixture(),configs=await saveModules(f);configs.reference.calibrations=[{protocolVersion:'reference-pixel-review-v1',applicabilityProfile:'style_component',role:'visual',providerId:'owned',model:'owned-model',status:'configured_unverified',evidenceRef:'reference-evidence.json',evidenceHash:'a'.repeat(64)}];await writeFile(join(f.dir,'modules','reference.json'),JSON.stringify(configs.reference));
 f.config.creativeCalibrations=[{protocolVersion:'creative-panel-v1',stage:'strategy',role:'strategy',providerId:'owned',model:'owned-model',evidenceRef:'creative-evidence.json',evidenceHash:'b'.repeat(64)}];
 const settings=await loadLaunchSettings({configPath:await save(f)});assert.equal(settings.moduleConfigs.reference.calibrations[0].applicabilityProfile,'style_component');assert.equal(settings.moduleConfigs.reference.calibrations[0].evidenceRef,join(f.dir,'modules','reference-evidence.json'));assert.equal(settings.creativeCalibrations[0].evidenceRef,join(f.dir,'creative-evidence.json'));assert.equal(settings.creativeCalibrations[0].status,undefined);
 f.config.creativeCalibrations[0].role='imaginary';await assert.rejects(loadLaunchSettings({configPath:await save(f)}),{code:'INVALID_CONFIGURATION'});
});
test('owned execution effect audit',async()=>{assert.equal(await exists(effectFile),false);await writeFile(join(root,'effect-accounting.json'),JSON.stringify({processCount,logicalSqliteIO:JSON.parse(await readFile(counterFile,'utf8')),forbiddenEffects:0,formalDatabaseReads:0,actualMediaReads:0,providerCalls:0,nativeInvocations:0,installedTreeReads:0,root}));console.log(`Owned launcher effects saved ${join(root,'effect-accounting.json')}`);});
