import {diskReceipt} from './selected-stage-fixture.mjs';
import {evidenceHash,createCorrectionEvidence,evidenceRecords,evidenceVisualRecords,requireEvidenceProjection} from './correction-evidence.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,realpath,mkdir,writeFile,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {openStore} from './store.mjs';
import {createExecutor} from './executor.mjs';
import {imageManifest,createImageEvidenceStore} from './image-evidence.mjs';
import {revisionPlan,releaseReadiness,applyCommand,revisionSources,projectView} from './project.mjs';
import {evidenceClaimManifest,buildEvidenceReviewRequest} from './evidence-review.mjs';
import {buildStageRequest,validateStageOutput} from './stage-content.mjs';
import {CORRECTION_PROTOCOL,correctionHash,validateCorrectionInput,validateRevisionResponses,requireChangedCorrection,buildCorrectionReviewRequest} from './correction.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex');
const person={actorType:'human',actorId:'person',runId:'human-run',contextId:'human-context'};
const source={id:'s',url:'https://example.org/article',text:'瓶身为蓝色。',verification:'captured',scopeRelation:'background'};
const draft=(summary='旧方法说明')=>({outputKind:'research_findings',status:'draft',title:'有界包装研究',summary,sections:[{heading:'设计比较',body:summary,evidenceIds:['s']}],claims:[{text:'资料描述瓶身为蓝色',kind:'fact',evidenceRefs:['s'],limitations:['仅所供资料描述']}],gaps:['25岁用户审美偏好没有调查'],evidenceClassifications:[{sourceId:'s',scopeRelation:'background',reason:'所供摘录作为背景，非用户偏好证据'}]});
function quoted(prompt){return JSON.parse(prompt.slice(prompt.indexOf('UNTRUSTED_JSON_DATA\n')+20,prompt.lastIndexOf('\nEND_UNTRUSTED_JSON_DATA')));}
function receipt(request,raw){const images=request.images?.length?imageManifest(request.images):[];return {runId:request.runId,requestedModel:'synthetic',model:'synthetic',threadId:randomUUID(),inputPacketHash:sha(JSON.stringify({runId:request.runId,model:'synthetic',prompt:request.prompt,outputSchema:request.outputSchema,...(images.length?{images}:{})})),exitCode:0,responseText:JSON.stringify(raw),parsedOutput:raw,...(images.length?{images}:{}),cost:null};}
function verification(request,negative=false){const d=quoted(request.prompt),schema=request.outputSchema,raw=Object.fromEntries(Object.entries(schema.properties).filter(([,s])=>s.enum).map(([k,s])=>[k,s.enum[0]]));raw.results=evidenceClaimManifest(d.content).filter(c=>c.kind!=='creative').map(c=>({claimKey:c.claimKey,outcome:'supported_excerpt',rationale:'仅核对所供文本',citations:[{sourceId:'s',textHash:sha(source.text),quote:'瓶身为蓝色'}],requirementRefs:[],limitations:['非网站真实性验证']}));raw.wholeTextScan={status:'complete',creativeClaimKeys:[],omissions:negative?[{location:'/summary',quote:d.content.summary,reason:'旧核验器混淆方法与外部事实'}]:[],mismatchedCreative:[],...(schema.properties.wholeTextScan.properties.operationalAssertions?{operationalAssertions:[]}:{})};raw.limitations=['仍无用户偏好调查'];return raw;}
function production(request){const d=quoted(request.prompt);if(d.correctionInput){if(d.content)return {protocolVersion:d.reviewProtocolVersion??'correction-handling-v1',artifactId:d.artifactId,contentHash:d.contentHash,sourceSetHash:d.correctionInput.sourceSetHash,...(d.context?{contextHash:d.context.contextHash}:{}),preservationCheck:{status:'complete',constraintManifestHash:d.correctionInput.constraintManifestHash,violations:[]},findings:d.responses.map(r=>({findingKey:r.findingKey,status:'addressed',category:'correction',reason:'逐项对照新版范围说明，未提升为外部事实',refs:[{location:'/summary',quote:d.content.summary}]})),limitations:['合成测试，不是审美或事实通过']};return {...draft('明确区分系统登记与外部事实，25岁偏好仍未知'),evidenceClassifications:d.sourceRecords.map(s=>({sourceId:s.id,scopeRelation:'background',reason:'仅背景摘录，不代表中国25岁消费者偏好'})),revisionResponses:d.correctionInput.sources.flatMap(s=>s.findings).map(f=>({findingKey:f.key,action:'applied',explanation:'澄清方法并保留证据限制',outputLocations:[{location:'/summary',quote:'25岁偏好仍未知'}]}))};}return draft();}
async function fixture(t,handler){const root=await realpath(await mkdtemp(join(tmpdir(),'typed-correction-'))),store=openStore(join(root,'db')),calls=[];t.after(async()=>{store.close();await rm(root,{recursive:true,force:true});});store.create({id:'p',name:'Synthetic typed correction',brief:'得闲包装，25岁社交使用，度数未定',mode:'assisted',humanGates:['strategy']},person);const send=(c,ctx=person)=>store.command('p',{...c,commandId:randomUUID(),expectedRevision:store.read('p').revision},ctx);send({kind:'confirm-task-card',taskCardId:'p:scope:1'});const bindings=Object.fromEntries(['research','verification','feedback_review','correction_review'].map(s=>[s,{providerId:'synthetic',model:'synthetic',role:s+'-lead'}]));const executor=createExecutor({store,rootDir:root,bindings,providers:{synthetic:{model:'synthetic',execute:async req=>{calls.push(req);const raw=await(handler?handler(req):production(req));if(req.outputSchema.properties.researchContractVersion)Object.assign(raw,{researchContractVersion:req.outputSchema.properties.researchContractVersion.enum[0],chartData:null,quantitativeClaims:[]});if(req.outputSchema.properties.quantitativeResults)raw.quantitativeResults=[];return diskReceipt(root,req,receipt(req,raw));}}}});const initial=executor.enqueue('p','research',{sourceRecords:[source]});const first=await executor.execute('p',initial);assert.equal(first.status,'succeeded',JSON.stringify(first.error));const base=store.read('p').artifacts[0];const content=JSON.parse(await readFile(base.payloadRef,'utf8'));const input={artifactId:base.id,contentHash:base.contentHash,content,sourceRecords:[source],taskCard:store.read('p').taskCards[0],taskCardConfirmed:true};return {root,store,calls,executor,send,base,input,bindings};}
async function setup(t,hook){let verificationCount=0;const f=await fixture(t,async req=>{if(req.outputSchema.properties.checkedFactMeaning)return verification(req,verificationCount++===0);return hook?hook(req):production(req);});const next=await f.executor.enqueueVerification('p',f.base.id,{commandId:'v3',expectedRevision:f.store.read('p').revision});assert.equal((await f.executor.execute('p',next)).status,'succeeded');return f;}
async function revise(f,id='revision'){return f.executor.enqueueRevision('p',{artifactId:f.base.id,commandId:id,expectedRevision:f.store.read('p').revision});}

import {buildCaseIdentityRequest} from './case-identity.mjs';
import {projectCaseEvidenceCatalogue,stageVisualCatalogue} from './project.mjs';
async function imageDiskReceipt(root,q,raw){
 const folder=join(root,'image-provider-'+q.runId);await mkdir(folder,{recursive:true});const paths=Object.fromEntries(['input','output','stdout','receipt'].map(n=>[n,join(folder,n+'.json')]));
 const images=imageManifest(q.images),input=JSON.stringify({runId:q.runId,model:'synthetic',prompt:q.prompt,outputSchema:q.outputSchema,images});
 const receipt={runId:q.runId,requestedModel:'synthetic',model:'synthetic',provider:'codex-cli',threadId:randomUUID(),images,inputPacketHash:sha(input),paths,exitCode:0,signal:null,reason:null,error:null};
 await writeFile(paths.input,input);await writeFile(paths.output,JSON.stringify(raw));await writeFile(paths.receipt,JSON.stringify(receipt));await writeFile(paths.stdout,JSON.stringify({type:'thread.started',thread_id:receipt.threadId})+'\n'+JSON.stringify({type:'turn.completed'})+'\n');
 return {...receipt,responseText:JSON.stringify(raw),parsedOutput:raw,schemaValidated:false};
}
async function success(ex,id){const result=await ex.execute('p',id);assert.equal(result.status,'succeeded',JSON.stringify(result.error));return result;}
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAE0lEQVR4nGP8//8/AwMDEwMYAAAkBgMBXaJOiAAAAABJRU5ErkJggg==','base64');
async function registeredFixture(t,{reviewed=true}={}){
 const f=await setup(t),imageStore=createImageEvidenceStore({rootDir:join(f.root,'images')});
 const asset=await imageStore.ingest({projectId:'p',bytes:png,metadata:{representation:'supplied_image'}});f.send({kind:'register-image',asset},{actorType:'agent',actorId:'ingest',runId:randomUUID(),contextId:randomUUID()});
 let negativeReview=false,onProduce=null;
 const provider={model:'synthetic',execute:async q=>{
  let raw;
  if(q.outputSchema.properties.identityMeaning){
   const j=f.store.read('p').jobs.find(x=>x.purpose==='case_identity'&&x.status==='running'),input=j.task.caseIdentityInput,{packet}=buildCaseIdentityRequest(input),ref={location:'/pageCapture/record/extraction/text',quote:'Brand A Product B social baijiu packaging.'},unknown={status:'unknown',value:'unknown',reason:'Not supplied',refs:[],pixels:[]},supported=value=>({status:'supported',value,reason:'Source-attributed',refs:[ref],pixels:[]});
   raw={protocolVersion:packet.protocolVersion,packetHash:packet.packetHash,actualImageManifestHash:packet.actualImageManifestHash,identityMeaning:'captured_page_image_correspondence_not_source_authentication',fields:{brand:supported('Brand A'),product:supported('Product B'),edition:unknown,time:unknown,use:supported('social baijiu packaging')},imageMatch:{status:'supported',reason:'Synthetic matching pixels',refs:[ref],pixels:packet.orderedImages.map(i=>({imageId:i.imageId,imageSha256:i.sha256,region:'center',observation:'Synthetic matching contour'}))},taskFit:{status:'same_use',reason:'Synthetic judgment',refs:[ref,{location:'/taskCard/brief',quote:input.taskCard.brief}]},verdict:'usable',limitations:['Synthetic correspondence only.']};
  }else if(q.outputSchema.properties.observationHash){raw={manifestHash:q.outputSchema.properties.manifestHash.const,observationHash:q.outputSchema.properties.observationHash.const,findings:[{id:'shape',status:negativeReview?'unsupported':'supported',reason:'Synthetic pixel check.'}]};}
  else if(q.outputSchema.properties.manifestHash){raw={manifestHash:q.outputSchema.properties.manifestHash.const,observations:imageManifest(q.images).map(i=>({imageId:i.imageId,imageSha256:i.sha256,visibleFeatures:[{id:'shape',description:'方形轮廓',region:'center'}],legibleText:[],uncertainties:['No handling test'],limitations:['Synthetic pixels only; no preference or physical proof.']}))};}
  else {const d=quoted(q.prompt);raw=production(q);raw.evidenceClassifications=d.sourceRecords.map(s=>({sourceId:s.id,scopeRelation:s.scopeRelation,reason:'Attributed supplied source; limits retained.'}));if(d.visualCatalogue?.length){const v=d.visualCatalogue[0];raw.sections.push({heading:'有限图像观察',body:v.text,evidenceIds:[v.id]});raw.claims.push({text:v.text,kind:'fact',evidenceRefs:[v.id],limitations:v.limits});}if(d.correctionInput?.enrichment&&d.correctionInput.evidence.registeredSourceDelta.length){const item=d.correctionInput.evidence.registeredSourceDelta[0];raw.sections.push({heading:'新增注册案例',body:item.text,evidenceIds:[item.id]});}if(d.correctionInput?.evidence?.capturedTextDelta?.length){const item=d.correctionInput.evidence.capturedTextDelta[0];raw.sections.push({heading:'新增页面文本',body:item.text,evidenceIds:[item.id]});raw.claims.push({text:item.text,kind:'fact',evidenceRefs:[item.id],limitations:['Captured attribution only.']});}if(onProduce)await onProduce();}
  if(q.outputSchema.properties.researchContractVersion)Object.assign(raw,{researchContractVersion:q.outputSchema.properties.researchContractVersion.enum[0],chartData:null,quantitativeClaims:[]});return q.images?.length?imageDiskReceipt(f.root,q,raw):diskReceipt(f.root,q,receipt(q,raw));
 }};
 const bindings={...f.bindings,...Object.fromEntries(['case_identity','observation','observation_review'].map(k=>[k,{providerId:'synthetic',model:'synthetic',role:k}]))};
 const ex=createExecutor({store:f.store,rootDir:f.root,imageStore,bindings,providers:{synthetic:provider},acquisitionDependencies:{lookup:async()=>[{address:'93.184.216.34',family:4}],transport:async({url})=>({status:200,headers:{'content-type':url.pathname.endsWith('.png')?'image/png':'text/html'},body:url.pathname.endsWith('.png')?png:Buffer.from('<p>Brand A Product B social baijiu packaging.</p><img src="/source.png">')})}});
 let id=ex.enqueueSourceCapture('p',{url:'https://example.org/pack',commandId:'case-page',expectedRevision:f.store.read('p').revision});await success(ex,id);
 const cap=f.store.read('p').sourceCaptures.at(-1);id=await ex.enqueueCaseIdentity('p',{captureId:cap.id,sourceImageUrl:'https://example.org/source.png',referenceImageId:asset.id,commandId:'case-id',expectedRevision:f.store.read('p').revision});await success(ex,id);
 id=await ex.enqueueObservation('p',{imageIds:[asset.id],commandId:'observe',expectedRevision:f.store.read('p').revision});await success(ex,id);
 const observation=f.store.read('p').imageObservations.at(-1);
 const review=async(command,negative=false)=>{negativeReview=negative;const j=await ex.enqueueObservationReview('p',{observationId:observation.id,commandId:command,expectedRevision:f.store.read('p').revision});await success(ex,j);};
 if(reviewed)await review('positive');
 const p=f.store.read('p'),caseRecord=projectCaseEvidenceCatalogue(p)[0],visual=stageVisualCatalogue(p,'research')[0];assert(caseRecord&&(reviewed?visual:!visual));
 const request=commandId=>({artifactId:f.base.id,commandId,expectedRevision:f.store.read('p').revision,supplementalCaseSourceIds:[caseRecord.id],supplementalVisualIds:[visual.id]});
 return {...f,ex,bindings,provider,imageStore,caseRecord,visual,observation,request,review,setOnProduce:fn=>{onProduce=fn;}};
}
test('registered case and independently reviewed visual additions enter a typed revision without rewriting parent or negative reports',async t=>{
 const f=await registeredFixture(t),before=f.store.read('p'),request=f.request('new-visual'),id=await f.ex.enqueueRevision('p',request),job=f.store.read('p').jobs.find(j=>j.id===id);
 assert.equal(job.task.correctionInput.evidence.version,'correction-evidence-v2');assert.deepEqual(job.task.correctionInput.evidence.base.sourceRecords,before.artifacts[0].technicalReceipts.sourceCatalogue.records);assert.deepEqual(job.task.correctionInput.evidence.base.visualCatalogue,[]);assert.deepEqual(job.task.sourceRecords,[source,f.caseRecord]);assert.deepEqual(job.task.visualCatalogue,[f.visual]);assert.equal(await f.ex.enqueueRevision('p',request),id);
 assert.equal((await f.ex.execute('p',id)).status,'succeeded');const after=f.store.read('p'),a=after.artifacts.at(-1);assert.deepEqual(after.artifacts[0],before.artifacts[0]);assert.deepEqual(after.verifications,before.verifications);assert.deepEqual(a.technicalReceipts.visualCatalogue,[f.visual]);assert.deepEqual(a.revision.evidence,job.task.correctionInput.evidence);assert.equal(a.revisionResponses.length,job.task.correctionInput.sources.flatMap(s=>s.findings).length);assert.equal(after.releases.length,0);
 for(const change of [{supplementalVisualIds:['unknown']},{supplementalCaseSourceIds:['fake']},{supplementalVisualIds:[f.visual.id,f.visual.id]}])await assert.rejects(()=>f.ex.enqueueRevision('p',{...f.request(randomUUID()),...change}));

});
test('queued visual delta is rejected after an independent negative review removes its accepted observation',async t=>{
 const f=await registeredFixture(t),id=await f.ex.enqueueRevision('p',f.request('queued'));
 const corrupted=structuredClone(f.store.read('p'));corrupted.caseIdentityReviews[0].rawReport.fields.use.value='changed';assert.throws(()=>applyCommand(corrupted,{kind:'start-job',jobId:id,attemptId:randomUUID(),commandId:randomUUID(),expectedRevision:corrupted.revision},{actorType:'agent',actorId:'producer',runId:randomUUID(),contextId:randomUUID()}));
 await f.review('negative',true);const count=f.store.read('p').artifacts.length;
 const result=await f.ex.execute('p',id);assert.notEqual(result.status,'succeeded');assert.equal(f.store.read('p').artifacts.length,count);
 await assert.rejects(()=>f.ex.enqueueRevision('p',f.request('after-negative')),/current|Registered|visual/i);
});
test('visual delta cannot complete when a negative independent review appears during provider execution',async t=>{
 const f=await registeredFixture(t),id=await f.ex.enqueueRevision('p',f.request('during'));f.setOnProduce(()=>f.review('during-negative',true));const count=f.store.read('p').artifacts.length;
 const result=await f.ex.execute('p',id);assert.notEqual(result.status,'succeeded');assert.equal(f.store.read('p').artifacts.length,count);
});
test('evidence delta hashes, exact projection and parent/cross-catalogue identities are immutable',()=>{
 const parent={artifactId:'a',contentHash:'a'.repeat(64)},v={id:'visual:o:f',observationId:'o',reviewId:'r',imageId:'i',imageSha256:'a'.repeat(64),kind:'visibleFeature',text:'shape',region:'center',manifestHash:'b'.repeat(64),observationHash:'c'.repeat(64),reviewHash:'d'.repeat(64),limits:['pixels only']};
 const old=createCorrectionEvidence(parent,[source],[],[]);assert.equal(old.version,'correction-evidence-v1');assert.deepEqual(evidenceVisualRecords(old),[]);
 const e=createCorrectionEvidence(parent,[source],[],[],{visualCatalogue:[v]});requireEvidenceProjection({protocolVersion:'typed-revision-v3',revisionOf:parent,evidence:e},[source],[v]);
 assert.throws(()=>requireEvidenceProjection({protocolVersion:'typed-revision-v3',revisionOf:parent,evidence:e},[source],[]));
 const altered=structuredClone(e);altered.visualDelta[0].text='changed';assert.throws(()=>requireEvidenceProjection({protocolVersion:'typed-revision-v3',revisionOf:parent,evidence:altered},[source],[altered.visualDelta[0]]));
 assert.throws(()=>createCorrectionEvidence(parent,[source],[v],[],{visualCatalogue:[v]}));assert.throws(()=>createCorrectionEvidence(parent,[{...source,id:v.id}],[],[],{visualCatalogue:[v]}));
 assert.throws(()=>createCorrectionEvidence(parent,[],[],[],{sourceRecords:[{...source,scopeRelation:'direct'}]}));
});

test('registered observation without independent review is not admissible visual evidence',async t=>{
 const f=await registeredFixture(t,{reviewed:false});assert.deepEqual(stageVisualCatalogue(f.store.read('p'),'research'),[]);
 await assert.rejects(()=>f.ex.enqueueRevision('p',{artifactId:f.base.id,commandId:'unreviewed',expectedRevision:f.store.read('p').revision,supplementalVisualIds:[`visual:${f.observation.id}:shape`]}),/current|Registered/);
});

test('completion rejects changed requested evidence IDs against its exact saved producer receipt',async t=>{
 const f=await registeredFixture(t),id=await f.ex.enqueueRevision('p',f.request('intent'));let originalState,completion,context;const command=f.store.command,wrappedStore={...f.store,command:(...args)=>{const [projectId,c,ctx]=args;if(c.kind==='complete-stage'&&c.jobId===id){originalState=f.store.read('p');completion=structuredClone(c);context=structuredClone(ctx);}return command(...args);}};
 const completing=createExecutor({store:wrappedStore,rootDir:f.root,bindings:f.bindings,providers:{synthetic:f.provider},imageStore:f.imageStore});
 assert.equal((await completing.execute('p',id)).status,'succeeded');assert(originalState&&completion);const before=originalState.artifacts.length;
 originalState.jobs.find(j=>j.id===id).task.revisionRequest.supplementalVisualIds=[];
 assert.throws(()=>applyCommand(originalState,completion,context),{code:'INVALID_CORRECTION'});assert.equal(originalState.artifacts.length,before);
});

for(const when of ['before enqueue','before dispatch','during provider'])test(`registered visual bytes changed ${when} reject without new artifact`,async t=>{
 const f=await registeredFixture(t),path=join(f.root,'images','objects',f.visual.imageSha256),damage=async()=>{await chmod(path,0o600);await writeFile(path,'changed registered image bytes');};const count=f.store.read('p').artifacts.length;
 if(when==='before enqueue'){await damage();await assert.rejects(()=>f.ex.enqueueRevision('p',f.request('bytes-before')));}
 else{const id=await f.ex.enqueueRevision('p',f.request('bytes-'+when));if(when==='before dispatch')await damage();else f.setOnProduce(damage);const result=await f.ex.execute('p',id);assert.notEqual(result.status,'succeeded');}
 assert.equal(f.store.read('p').artifacts.length,count);
});
test('changed registered identity capture bytes reject supplemental case before enqueue',async t=>{
 const f=await registeredFixture(t),report=f.store.read('p').caseIdentityReviews[0],producer=f.store.read('p').jobs.find(j=>j.id===report.jobId),page=f.store.read('p').sourceCaptures.find(c=>c.recordHash===producer.task.caseIdentityInput.pageCapture.recordHash);
 const path=join(f.root,'source-captures',page.record.raw.file);await chmod(path,0o600);await writeFile(path,'changed captured bytes');await assert.rejects(()=>f.ex.enqueueRevision('p',f.request('capture-corrupt')));
});

import {verifyRegisteredCorrectionOriginals} from './registered-correction-originals.mjs';
test('base registered cases retain their captured-original dependency when the new delta is visual only',async t=>{
 const f=await registeredFixture(t),p=f.store.read('p'),report=p.caseIdentityReviews[0],producer=p.jobs.find(j=>j.id===report.jobId),page=p.sourceCaptures.find(c=>c.recordHash===producer.task.caseIdentityInput.pageCapture.recordHash);
 const parent={artifactId:'prior-corrected-artifact',contentHash:'b'.repeat(64)},evidence=createCorrectionEvidence(parent,[source,f.caseRecord],[],[],{visualCatalogue:[f.visual]}),job={task:{correctionInput:{evidence}}};
 assert.deepEqual(evidence.registeredSourceDelta,[]);await verifyRegisteredCorrectionOriginals(p,job,{executionRoot:f.root,imageStore:f.imageStore});
 const path=join(f.root,'source-captures',page.record.raw.file);await chmod(path,0o600);await writeFile(path,'changed inherited case capture');
 await assert.rejects(()=>verifyRegisteredCorrectionOriginals(p,job,{executionRoot:f.root,imageStore:f.imageStore}));
});
test('every accepted independent visual review keeps its original-file dependency',async t=>{
 const f=await registeredFixture(t);await f.review('second-positive');const p=f.store.read('p'),second=p.observationReviews.at(-1);assert.notEqual(second.id,f.visual.reviewId);
 const path=second.executionReceipt.paths.output;await writeFile(path,'changed second positive review original');
 await assert.rejects(()=>f.ex.enqueueRevision('p',f.request('second-review-corrupt')));
});

test('later research verification reopens the completed correction registered-image originals',async t=>{
 const f=await registeredFixture(t),id=await f.ex.enqueueRevision('p',f.request('completed'));assert.equal((await f.ex.execute('p',id)).status,'succeeded');const a=f.store.read('p').artifacts.at(-1);
 const path=join(f.root,'images','objects',f.visual.imageSha256);await chmod(path,0o600);await writeFile(path,'changed after correction completion');
 await assert.rejects(()=>f.ex.enqueueVerification('p',a.id));
});


test('registered enrichment needs true new evidence and keeps parent unknown and ancestor findings',async t=>{
 const f=await registeredFixture(t);
 const oldNegative=structuredClone(f.store.read('p').verifications[0]);
 const oldRevision=await f.ex.enqueueRevision('p',{artifactId:f.base.id,commandId:'old-correction',expectedRevision:f.store.read('p').revision});
 await success(f.ex,oldRevision);
 const parent=f.store.read('p').artifacts.at(-1);
 const verified=await f.executor.enqueueVerification('p',parent.id,{commandId:'parent-positive',expectedRevision:f.store.read('p').revision});await success(f.executor,verified);
 assert.throws(()=>revisionPlan(f.store.read('p'),parent.id),{code:'NO_CORRECTION_REQUIRED'});
 const uncertain=createExecutor({store:f.store,rootDir:f.root,imageStore:f.imageStore,bindings:{...f.bindings,readiness:{providerId:'uncertain',model:'synthetic',role:'readiness'}},providers:{uncertain:{model:'synthetic',execute:async q=>diskReceipt(f.root,q,receipt(q,{}))}}});
 const assessment=await uncertain.enqueueReadiness('p',parent.id,{commandId:'original-unknown',protocolVersion:'research-readiness-v2',expectedRevision:f.store.read('p').revision});const unknown=await uncertain.execute('p',assessment);assert.equal(unknown.status,'awaiting_reconciliation');
 const frozenUnknown=structuredClone(f.store.read('p').jobs.find(j=>j.id===assessment));
 const mode={artifactId:parent.id,revisionMode:'registered-evidence-enrichment',supplementalCaseSourceIds:[f.caseRecord.id],supplementalVisualIds:[f.visual.id]};
 await assert.rejects(()=>f.ex.enqueueRevision('p',{...mode,supplementalCaseSourceIds:[],supplementalVisualIds:[],commandId:'empty-enrichment',expectedRevision:f.store.read('p').revision}),{code:'INVALID_EVIDENCE_ENRICHMENT'});
 const request={...mode,commandId:'adopt-new-evidence',expectedRevision:f.store.read('p').revision},jobId=await f.ex.enqueueRevision('p',request);assert.equal(await f.ex.enqueueRevision('p',request),jobId);
 const queued=f.store.read('p').jobs.find(j=>j.id===jobId),input=queued.task.correctionInput;
 assert(input.enrichment.retainedContext.sources.some(s=>s.reportId===oldNegative.id));assert(input.enrichment.unknownReviews.some(j=>j.jobId===assessment));assert.equal(input.sources.flatMap(s=>s.findings).length,0);
 const {requireEnrichmentAdoption}=await import('./evidence-enrichment.mjs');assert.throws(()=>requireEnrichmentAdoption(input,{sections:[{body:'Changed prose without new evidence',evidenceIds:['s']}],claims:[]}),{code:'INVALID_EVIDENCE_ENRICHMENT'});
 const start={kind:'start-job',jobId,attemptId:randomUUID(),commandId:randomUUID(),expectedRevision:f.store.read('p').revision},context={actorType:'agent',actorId:'enrichment-producer',runId:randomUUID(),contextId:randomUUID()};
 for(const change of [j=>delete j.task.revisionRequest.revisionMode,j=>j.task.correctionInput.enrichment.unknownReviews=[],j=>j.task.correctionInput.enrichment.evidenceManifestHash='0'.repeat(64)]){const state=structuredClone(f.store.read('p'));change(state.jobs.find(j=>j.id===jobId));assert.throws(()=>applyCommand(state,start,context));}
 assert.equal((await f.ex.execute('p',jobId)).status,'succeeded');
 const after=f.store.read('p'),child=after.artifacts.at(-1);assert.notEqual(child.id,parent.id);assert.equal(child.revision.revisionOf.artifactId,parent.id);assert.deepEqual(child.revisionResponses,[]);assert.deepEqual(after.jobs.find(j=>j.id===assessment),frozenUnknown);assert.deepEqual(after.verifications[0],oldNegative);assert.deepEqual(after.artifacts.find(a=>a.id===parent.id),parent);
 assert(child.technicalReceipts.visualCatalogue.some(v=>v.id===f.visual.id));assert(JSON.parse(await readFile(child.payloadRef,'utf8')).sections.some(s=>s.evidenceIds.includes(f.visual.id)));
 const next=await uncertain.enqueueReadiness('p',child.id,{commandId:'child-new-assessment',protocolVersion:'research-readiness-v2',expectedRevision:after.revision});assert.equal(f.store.read('p').jobs.find(j=>j.id===next).status,'queued');
 assert.equal(f.store.read('p').jobs.find(j=>j.id===assessment).status,'awaiting_reconciliation');
});
test('enrichment material novelty ignores new IDs and tracking URLs',async()=>{
 const {artifactId,contentHash}={artifactId:'parent',contentHash:'c'.repeat(64)},revisionOf={artifactId,contentHash};
 const v={id:'visual:o:f',observationId:'o',reviewId:'r',imageId:'i',imageSha256:'a'.repeat(64),kind:'visibleFeature',text:'shape',region:'center',manifestHash:'b'.repeat(64),observationHash:'c'.repeat(64),reviewHash:'d'.repeat(64),limits:['pixels only']};
 const repeat={...v,id:'visual:o2:f',observationId:'o2',reviewId:'r2',text:'A differently worded shape observation'};
 const {requireNovelRegisteredEvidence}=await import('./evidence-enrichment.mjs');
 const identical=createCorrectionEvidence(revisionOf,[source],[v],[],{visualCatalogue:[repeat]});assert.throws(()=>requireNovelRegisteredEvidence(identical,revisionOf),{code:'INVALID_EVIDENCE_ENRICHMENT'});
 const c={...source,id:'case:1',scopeRelation:'direct',identityStatus:'identity_checked',caseIdentity:{imageMatch:{pixels:[{imageSha256:v.imageSha256}]}}};
 const clone={...c,id:'case:2',url:c.url+'?tracking=new'};const aliased=createCorrectionEvidence(revisionOf,[c],[],[],{sourceRecords:[clone]});assert.throws(()=>requireNovelRegisteredEvidence(aliased,revisionOf),{code:'INVALID_EVIDENCE_ENRICHMENT'});
 const upgrade=createCorrectionEvidence(revisionOf,[source],[],[],{sourceRecords:[c]});requireNovelRegisteredEvidence(upgrade,revisionOf);
});

test('managed text capture creates a real enrichment child and preserves unknown parent without promoting authority',async t=>{
 const f=await registeredFixture(t),ordinary=await revise(f,'ordinary-before-text');await success(f.ex,ordinary);const parent=f.store.read('p').artifacts.at(-1);
 const verified=await f.executor.enqueueVerification('p',parent.id,{commandId:'parent-text-positive',expectedRevision:f.store.read('p').revision});await success(f.executor,verified);
 const unknownProvider={model:'synthetic',execute:async q=>diskReceipt(f.root,q,receipt(q,{}))};
 const uncertain=createExecutor({store:f.store,rootDir:f.root,bindings:{...f.bindings,readiness:{providerId:'uncertain',model:'synthetic',role:'readiness'}},providers:{uncertain:unknownProvider}});
 const unknownId=await uncertain.enqueueReadiness('p',parent.id,{protocolVersion:'research-readiness-v2',commandId:'unknown-before-text',expectedRevision:f.store.read('p').revision});assert.equal((await uncertain.execute('p',unknownId)).status,'awaiting_reconciliation');
 const before=f.store.read('p'),unknown=structuredClone(before.jobs.find(j=>j.id===unknownId)),cap=before.sourceCaptures.find(c=>c.record.mimeType==='text/html');
 const request={artifactId:parent.id,commandId:'text-enrichment',expectedRevision:before.revision,revisionMode:'registered-evidence-enrichment',supplementalCaptureIds:[cap.id]};
 const jobId=await f.ex.enqueueRevision('p',request);assert.equal(await f.ex.enqueueRevision('p',request),jobId);
 const job=f.store.read('p').jobs.find(j=>j.id===jobId),e=job.task.correctionInput.evidence,source=e.capturedTextDelta[0];
 assert.equal(e.version,'correction-evidence-v3');assert.equal(source.text,cap.record.extraction.text);assert.equal(source.verification,'captured');assert.equal(source.scopeRelation,'background');assert.equal(source.identityStatus,undefined);assert.equal(source.caseIdentity,undefined);
 const start={kind:'start-job',jobId,attemptId:randomUUID(),commandId:randomUUID(),expectedRevision:f.store.read('p').revision},context={actorType:'agent',actorId:'start',runId:randomUUID(),contextId:randomUUID()};
 for(const change of [j=>j.task.revisionRequest.supplementalCaptureIds=[],j=>j.task.correctionInput.evidence.capturedTextDelta[0].verification='verified']){const p=structuredClone(f.store.read('p'));change(p.jobs.find(j=>j.id===jobId));assert.throws(()=>applyCommand(p,start,context));}
 await success(f.ex,jobId);const after=f.store.read('p'),child=after.artifacts.at(-1);assert.deepEqual(after.jobs.find(j=>j.id===unknownId),unknown);assert.deepEqual(after.artifacts.find(a=>a.id===parent.id),parent);assert.equal(child.revision.revisionOf.artifactId,parent.id);assert(child.technicalReceipts.sourceCatalogue.records.some(s=>s.id===source.id));assert(JSON.parse(await readFile(child.payloadRef,'utf8')).sections.some(s=>s.evidenceIds.includes(source.id)));
 const next=await uncertain.enqueueReadiness('p',child.id,{protocolVersion:'research-readiness-v2',commandId:'child-after-text',expectedRevision:after.revision});assert.equal(f.store.read('p').jobs.find(j=>j.id===next).status,'queued');
 await assert.rejects(()=>f.ex.enqueueRevision('p',{...request,artifactId:child.id,commandId:'same-capture-again',expectedRevision:f.store.read('p').revision}));
});
test('managed text rejects unknown/image captures and modified actual bytes before and after revision',async t=>{
 const f=await registeredFixture(t),p=f.store.read('p'),cap=p.sourceCaptures.find(c=>c.record.mimeType==='text/html'),image=p.sourceCaptures.find(c=>c.record.mimeType==='image/png');
 const request={artifactId:f.base.id,commandId:'captured-bytes',expectedRevision:p.revision,supplementalCaptureIds:[cap.id]};
 for(const ids of [['unknown'],[image.id],[cap.id,cap.id]])await assert.rejects(()=>f.ex.enqueueRevision('p',{...request,commandId:randomUUID(),supplementalCaptureIds:ids}));
 const rawPath=join(f.root,'source-captures',cap.record.raw.file),original=await readFile(rawPath);await chmod(rawPath,0o600);await writeFile(rawPath,'changed');
 await assert.rejects(()=>f.ex.enqueueRevision('p',request),{code:'INVALID_CORRECTION_ORIGINAL'});await writeFile(rawPath,original);
 const job=await f.ex.enqueueRevision('p',{...request,commandId:'before-complete',expectedRevision:f.store.read('p').revision});f.setOnProduce(()=>writeFile(rawPath,'changed-during'));const count=f.store.read('p').artifacts.length;assert.notEqual((await f.ex.execute('p',job)).status,'succeeded');assert.equal(f.store.read('p').artifacts.length,count);await writeFile(rawPath,original);
 f.setOnProduce(null);const fresh=await f.ex.enqueueRevision('p',{...request,commandId:'good-complete',expectedRevision:f.store.read('p').revision});await success(f.ex,fresh);const child=f.store.read('p').artifacts.at(-1);await writeFile(rawPath,'changed-after');await assert.rejects(()=>f.ex.enqueueVerification('p',child.id),{code:'INVALID_CORRECTION_ORIGINAL'});
});

test('captured text shape and novelty reject overlarge, duplicate and promoted source records',async()=>{
 const {capturedTextRecord,validateCapturedTextShape,currentCapturedTextSources}=await import('./captured-text-evidence.mjs');
 const {requireNovelRegisteredEvidence}=await import('./evidence-enrichment.mjs');
 const make=(text='Actual captured source',mime='text/html')=>{const record={requestedUrl:'https://example.org/a',finalUrl:'https://example.org/a',httpStatus:200,mimeType:mime,raw:{sha256:sha('html'),file:'raw/'+sha('html')+'.bin',byteLength:4},extraction:{method:'static-html-tokenizer-v1',text,textHash:sha(text)}};const recordHash=sha(JSON.stringify(record,null,2)+'\n'),id='capture_'+recordHash,recordPath='/managed/captures/'+recordHash+'.json';return {id:'p',sourceCaptures:[{id,projectId:'p',recordHash,recordPath,record}],jobs:[{purpose:'source_capture',status:'succeeded',outputVersionIds:[id],task:{url:record.requestedUrl},attempts:[{status:'succeeded',acquisitionReceipt:{recordHash,recordPath,rawHash:record.raw.sha256}}]}]};};
 const p=make(),source=capturedTextRecord(p,p.sourceCaptures[0].id);validateCapturedTextShape(source);currentCapturedTextSources(p,[source]);
 for(const mutate of [s=>s.verification='verified',s=>s.scopeRelation='direct',s=>s.identityStatus='identity_checked',s=>s.managedCapture.textHash='0'.repeat(64),s=>s.extra='authority']){const s=structuredClone(source);mutate(s);assert.throws(()=>validateCapturedTextShape(s));assert.throws(()=>currentCapturedTextSources(p,[s]));}
 for(const fixture of [make('x'.repeat(20001)),make('','text/html'),make('PDF','application/pdf')])assert.throws(()=>capturedTextRecord(fixture,fixture.sourceCaptures[0].id));
 const parent={artifactId:'parent',contentHash:'b'.repeat(64)};
 const first=createCorrectionEvidence(parent,[],[],[],{capturedText:[source]});requireNovelRegisteredEvidence(first,parent);
 const sameText=createCorrectionEvidence(parent,[{...source,id:'old',url:source.url+'?tracking=1'}],[],[],{capturedText:[source]});assert.throws(()=>requireNovelRegisteredEvidence(sameText,parent));
 const another=make('Different text');const next=capturedTextRecord(another,another.sourceCaptures[0].id);const sameRaw=createCorrectionEvidence(parent,[source],[],[],{capturedText:[next]});assert.throws(()=>requireNovelRegisteredEvidence(sameRaw,parent));
});
