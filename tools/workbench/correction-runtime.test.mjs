import {evidenceHash} from './correction-evidence.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,realpath,mkdir,writeFile} from 'node:fs/promises';
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
async function fixture(t,handler){const root=await realpath(await mkdtemp(join(tmpdir(),'typed-correction-'))),store=openStore(join(root,'db')),calls=[];t.after(async()=>{store.close();await rm(root,{recursive:true,force:true});});store.create({id:'p',name:'Synthetic typed correction',brief:'得闲包装，25岁社交使用，度数未定',mode:'assisted',humanGates:['strategy']},person);const send=(c,ctx=person)=>store.command('p',{...c,commandId:randomUUID(),expectedRevision:store.read('p').revision},ctx);send({kind:'confirm-task-card',taskCardId:'p:scope:1'});const bindings=Object.fromEntries(['research','verification','feedback_review','correction_review'].map(s=>[s,{providerId:'synthetic',model:'synthetic',role:s+'-lead'}]));const executor=createExecutor({store,rootDir:root,bindings,providers:{synthetic:{model:'synthetic',execute:async req=>{calls.push(req);return receipt(req,await(handler?handler(req):production(req)));}}}});const initial=executor.enqueue('p','research',{sourceRecords:[source]});assert.equal((await executor.execute('p',initial)).status,'succeeded');const base=store.read('p').artifacts[0];const content=JSON.parse(await readFile(base.payloadRef,'utf8'));const input={artifactId:base.id,contentHash:base.contentHash,content,sourceRecords:[source],taskCard:store.read('p').taskCards[0],taskCardConfirmed:true};const jobId='legacy-check';send({kind:'request-verification',artifactId:base.id,jobId,binding:bindings.verification,task:{id:jobId,owner:'verifier',parentId:'p',verificationInput:input}},{actorType:'agent',actorId:'coordinator',runId:'coord-run',contextId:'coord-context'});return {root,store,calls,executor,send,base,input,legacyJobId:jobId,bindings};}
async function setup(t,hook){let verificationCount=0;const f=await fixture(t,async req=>{if(req.outputSchema.properties.checkedFactMeaning)return verification(req,verificationCount++===0);return hook?hook(req):production(req);});assert.equal((await f.executor.execute('p',f.legacyJobId)).status,'succeeded');const next=await f.executor.enqueueVerification('p',f.base.id,{commandId:'v3',expectedRevision:f.store.read('p').revision});assert.equal((await f.executor.execute('p',next)).status,'succeeded');return f;}
async function revise(f,id='revision'){return f.executor.enqueueRevision('p',{artifactId:f.base.id,commandId:id,expectedRevision:f.store.read('p').revision});}

test('machine-only correction preserves both protocols, original negative and public content separation; extra check does not replace fresh gates',async t=>{
 const f=await setup(t),before=structuredClone(f.store.read('p')),plan=revisionPlan(before,f.base.id);assert.equal(plan.protocolVersion,CORRECTION_PROTOCOL);assert.equal(plan.sources.length,2);assert.deepEqual(plan.sources.map(s=>s.protocolVersion).sort(),['excerpt-support-v2','excerpt-support-v3']);assert.equal(before.humanFeedback.length,0);
 const id=await revise(f),request=f.store.read('p').jobs.find(j=>j.id===id).task.revisionRequest;assert.equal(await f.executor.enqueueRevision('p',request),id);assert.equal((await f.executor.execute('p',id)).status,'succeeded');
 const p=f.store.read('p'),a=p.artifacts.at(-1);assert.equal(a.revision.revisionOf.artifactId,f.base.id);assert.equal(Object.hasOwn(a.revision,'baseContent'),false);assert.deepEqual(p.artifacts[0],before.artifacts[0]);assert.deepEqual(p.verifications,before.verifications);assert.equal(p.humanFeedback.length,0);assert.equal(p.releases.length,0);assert.equal(releaseReadiness(p,a.id).blockedReasons[0],'CORRECTION_REVIEW_REQUIRED');
 const body=JSON.parse(await readFile(a.payloadRef,'utf8'));assert.equal(Object.hasOwn(body,'revisionResponses'),false);assert.equal(Object.hasOwn(body,'feedbackResponses'),false);assert.equal(body.claims[0].verification,'pending');assert.equal(a.revisionResponses.length,plan.sources.reduce((n,s)=>n+s.findings.length,0));assert.ok(plan.sources.some(s=>s.findings.length===0&&s.constraints.length>0));
 const job=await f.executor.enqueueCorrectionReview('p',{artifactId:a.id,commandId:'independent-check',expectedRevision:p.revision});assert.equal((await f.executor.execute('p',job)).status,'succeeded');assert.equal(f.store.read('p').correctionReviews.length,1);assert.equal(releaseReadiness(f.store.read('p'),a.id).blockedReasons[0],'HARD_BLOCKER');assert.equal(f.store.read('p').verifications.filter(r=>r.artifactId===a.id).length,0);
 const sent=quoted(f.calls.at(-2).prompt);assert.ok(sent.correctionInput);assert.equal(sent.revisionInput,undefined);assert.equal(sent.correctionInput.sources.filter(s=>s.validatedReport.hasBlockingFindings).length,1);
});

test('new v2 enqueue and absent-selector v1 replay keep independent frozen packets and mixed registered sources',async t=>{
 const f=await setup(t),legacyPlan=revisionPlan(f.store.read('p'),f.base.id),legacyInput={...legacyPlan,baseContent:JSON.parse(await readFile(f.base.payloadRef,'utf8')),materials:[]},revision=f.executor.enqueue('p','research',{sourceRecords:[source],correctionInput:legacyInput,revisionInputArtifacts:[]});assert.equal((await f.executor.execute('p',revision)).status,'succeeded');
 const before=f.store.read('p'),a=before.artifacts.at(-1),producer=before.jobs.find(j=>j.id===revision),commandId='saved-v1-check',request={artifactId:a.id,commandId,expectedRevision:before.revision};
 const id=`job-${sha(JSON.stringify(['p',commandId]))}`,input={artifactId:a.id,contentHash:a.contentHash,content:JSON.parse(await readFile(a.payloadRef,'utf8')),correctionInput:producer.task.correctionInput,responses:a.revisionResponses};
 f.send({kind:'request-correction-review',artifactId:a.id,jobId:id,binding:f.bindings.correction_review,task:{id,parentId:'p',owner:'legacy-reviewer',correctionReviewInput:input,enqueueRequest:request}},{actorType:'agent',actorId:'legacy-director',runId:'legacy-director-run',contextId:'legacy-director-context'});
 const frozen=structuredClone(f.store.read('p').jobs.find(j=>j.id===id).task),count=f.calls.length;
 assert.equal(await f.executor.enqueueCorrectionReview('p',request),id);assert.equal(f.calls.length,count);assert.deepEqual(f.store.read('p').jobs.find(j=>j.id===id).task,frozen);
 assert.equal((await f.executor.execute('p',id)).status,'succeeded');assert.equal(Object.hasOwn(quoted(f.calls.at(-1).prompt),'reviewProtocolVersion'),false);
 const v2=await f.executor.enqueueCorrectionReview('p',{artifactId:a.id,commandId:'fresh-v2-check',expectedRevision:f.store.read('p').revision}),queued=f.store.read('p').jobs.find(j=>j.id===v2);
 assert.equal(queued.task.correctionReviewInput.reviewProtocolVersion,'correction-handling-v2');
 assert.equal((await f.executor.execute('p',v2)).status,'succeeded');
 const p=f.store.read('p'),sent=quoted(f.calls.at(-1).prompt),report=p.correctionReviews.at(-1);
 assert.deepEqual(sent,JSON.parse(buildCorrectionReviewRequest(queued.task.correctionReviewInput).prompt.split('UNTRUSTED_JSON_DATA\n')[1].split('\nEND_UNTRUSTED_JSON_DATA')[0]));
 assert.equal(report.protocolVersion,'correction-handling-v2');
 assert.deepEqual(revisionSources(p,a.id).map(s=>s.protocolVersion).sort(),['correction-handling-v1','correction-handling-v2']);
 assert.equal(releaseReadiness(p,a.id).blockedReasons[0],'HARD_BLOCKER');assert.equal(p.releases.length,0);
 for(const mutate of [q=>delete q.jobs.find(j=>j.id===v2).task.correctionReviewInput.reviewProtocolVersion,q=>q.jobs.find(j=>j.id===v2).task.correctionReviewInput.reviewProtocolVersion='unknown',q=>q.jobs.find(j=>j.id===v2).task.correctionReviewInput.content.summary+='tampered',q=>q.correctionReviews.at(-1).executionReceipt.inputPacketHash='0'.repeat(64)]){
  const q=structuredClone(p);mutate(q);assert.throws(()=>revisionSources(q,a.id));
 }
 const finalCount=f.calls.length;assert.equal(await f.executor.enqueueCorrectionReview('p',request),id);assert.equal(f.calls.length,finalCount);assert.deepEqual(f.store.read('p').jobs.find(j=>j.id===id).task,frozen);
});

test('v3 wrong envelope prefix preserves failed raw provider bytes and cannot register or release a correction',async t=>{
 const f=await setup(t,req=>{const raw=production(req);if(quoted(req.prompt).content&&quoted(req.prompt).correctionInput)raw.findings.forEach(finding=>finding.refs[0].location='/content/summary');return raw;});
 const id=await revise(f);assert.equal((await f.executor.execute('p',id)).status,'succeeded');
 const a=f.store.read('p').artifacts.at(-1),check=await f.executor.enqueueCorrectionReview('p',{artifactId:a.id,commandId:'invalid-prefix',expectedRevision:f.store.read('p').revision}),result=await f.executor.execute('p',check);
 assert.equal(result.status,'awaiting_reconciliation');const p=f.store.read('p'),job=p.jobs.find(j=>j.id===check),count=f.calls.length;
 assert.equal(job.task.correctionReviewInput.reviewProtocolVersion,'correction-handling-v3');
 assert.ok(JSON.parse(job.attempts[0].receipt.responseText).findings.every(finding=>finding.refs[0].location==='/content/summary'));
 assert.equal(p.correctionReviews.length,0);assert.equal(releaseReadiness(p,a.id).blockedReasons[0],'CORRECTION_REVIEW_REQUIRED');
 await assert.rejects(()=>f.executor.execute('p',check,{retry:true}));assert.equal(f.calls.length,count);
});

test('v3 completion rejects a provider receipt for a changed location schema',async t=>{
 const f=await setup(t,req=>{
  if(quoted(req.prompt).content&&quoted(req.prompt).correctionInput)req.outputSchema.properties.findings.items.properties.refs.items.properties.location.enum.push('/content/summary');
  return production(req);
 });
 const id=await revise(f);assert.equal((await f.executor.execute('p',id)).status,'succeeded');
 const a=f.store.read('p').artifacts.at(-1),check=await f.executor.enqueueCorrectionReview('p',{artifactId:a.id,commandId:'changed-schema',expectedRevision:f.store.read('p').revision}),result=await f.executor.execute('p',check);
 assert.equal(result.status,'awaiting_reconciliation');
 assert.ok(['INVALID_EXECUTION_RECEIPT','INVALID_CORRECTION'].includes(result.error.code));assert.equal(f.store.read('p').correctionReviews.length,0);
 assert.equal(releaseReadiness(f.store.read('p'),a.id).blockedReasons[0],'CORRECTION_REVIEW_REQUIRED');
});

test('machine and actual human direction coexist; no fictitious feedback or machine factual authority',async t=>{
 const f=await setup(t);f.send({kind:'submit-feedback',artifactId:f.base.id,feedbackId:'human-theme',instructions:'主题轻松一些，不能假设低度或健康功效',themes:[{text:'得闲一起坐坐',intendedUse:'创意建议'}],materials:[]});
 const id=await revise(f);const input=f.store.read('p').jobs.find(j=>j.id===id).task.correctionInput;assert.equal(input.sources.filter(s=>s.kind==='human').length,1);assert.equal(input.sources.length,3);assert.ok(input.sources.find(s=>s.kind==='human').findings.every(f=>f.authority==='human_creative_preference'));assert.equal((await f.executor.execute('p',id)).status,'succeeded');assert.equal(f.store.read('p').decisions.length,0);
});

test('authoritative report inventory rejects omitted negative, wrong target, changed raw/normalized/receipt/protocol and unknown report kinds',async t=>{
 const f=await setup(t),p=f.store.read('p');
 for(const mutate of [q=>q.verifications.shift(),q=>q.verifications[0].artifactId='other',q=>q.verifications[0].rawReport.limitations.push('tampered'),q=>q.verifications[0].hasBlockingFindings=false,q=>q.verifications[0].reportHash='0'.repeat(64),q=>q.jobs.find(j=>j.id===f.legacyJobId).attempts[0].receipt.threadId='forged',q=>q.jobs.find(j=>j.id===f.legacyJobId).task.verificationInput.reviewProtocolVersion='unknown']){const q=structuredClone(p);mutate(q);assert.throws(()=>revisionPlan(q,f.base.id),undefined,String(mutate));}
 const q=structuredClone(p);q.jobs.push({id:'unknown',purpose:'new_unhandled_review',targetArtifactId:f.base.id,status:'succeeded',outputVersionIds:['unhandled'],task:{},attempts:[]});assert.throws(()=>revisionPlan(q,f.base.id),{code:'UNSUPPORTED_CORRECTION_SOURCE'});
 const id=await revise(f);const task=structuredClone(f.store.read('p').jobs.find(j=>j.id===id).task);task.correctionInput.sources.shift();assert.throws(()=>applyCommand(p,{kind:'request-stage',stage:'research',jobId:'forged',binding:f.bindings.research,task,commandId:'forged-command',expectedRevision:p.revision},{actorType:'agent',actorId:'caller',runId:'caller-r',contextId:'caller-c'}));
});

test('new human input and newly completed reports prevent queued dispatch or stale activation without redispatch',async t=>{
 let arrived,release;const started=new Promise(r=>arrived=r),wait=new Promise(r=>release=r);const f=await setup(t,async req=>{if(quoted(req.prompt).correctionInput&&!quoted(req.prompt).content){arrived();await wait;}return production(req);});
 const id=await revise(f);const running=f.executor.execute('p',id);await started;f.send({kind:'submit-feedback',artifactId:f.base.id,feedbackId:'new',instructions:'保持未知度数',themes:[],materials:[]});release();assert.equal((await running).status,'succeeded_stale');assert.equal(f.store.read('p').activeByStage.research,f.base.id);assert.equal(f.store.read('p').artifacts.length,2);
 const id2=await revise(f,'queued');f.send({kind:'submit-feedback',artifactId:f.base.id,feedbackId:'newer',instructions:'保留来源',themes:[],materials:[]});const n=f.calls.length;assert.equal((await f.executor.execute('p',id2)).status,'blocked');assert.equal(f.calls.length,n);
});

test('consumed reviewer identity cannot author correction and source consumption does not turn reviewer into creator',async t=>{
 const f=await setup(t),id=await revise(f),p=f.store.read('p'),ctx=p.verifications[0].context;
 assert.throws(()=>applyCommand(p,{kind:'start-job',jobId:id,attemptId:'reuse',commandId:'reuse',expectedRevision:p.revision},ctx),{code:'SELF_REVIEW'});
 assert.equal((await f.executor.execute('p',id)).status,'succeeded');const q=f.store.read('p'),a=q.artifacts.at(-1);const check=await f.executor.enqueueCorrectionReview('p',{artifactId:a.id,commandId:'check',expectedRevision:q.revision});
 assert.throws(()=>applyCommand(f.store.read('p'),{kind:'start-job',jobId:check,attemptId:'old-author',commandId:'old-author',expectedRevision:f.store.read('p').revision},q.artifacts[0].author),{code:'SELF_REVIEW'});
});

test('response coverage and normalized no-op reject omissions, duplicate keys, false pointers, punctuation and response-only edits',async t=>{
 const f=await setup(t),id=await revise(f),input=f.store.read('p').jobs.find(j=>j.id===id).task.correctionInput,content=draft('changed');validateCorrectionInput(input);
 const rs=input.sources.flatMap(s=>s.findings).map(f=>({findingKey:f.key,action:'applied',explanation:'changed',outputLocations:[{location:'/summary',quote:'changed'}]}));validateRevisionResponses(rs,input,content);
 for(const mutate of [r=>r.pop(),r=>r[0].findingKey='unknown',r=>r.push(structuredClone(r[0])),r=>r[0].outputLocations[0].location='/content/summary',r=>r[0].outputLocations[0].quote='absent']){const r=structuredClone(rs);mutate(r);assert.throws(()=>validateRevisionResponses(r,input,content));}
 assert.throws(()=>requireChangedCorrection(input,input.baseContent));const unchanged=structuredClone(input.baseContent);unchanged.summary+='！';assert.throws(()=>requireChangedCorrection(input,unchanged));
});

test('unresolved factual-risk handling cannot be waived by human creative adoption',async t=>{
 const f=await setup(t,req=>{const output=production(req),d=quoted(req.prompt);if(d.content&&d.correctionInput){output.findings[0]={...output.findings[0],status:'unresolved',category:'factual_risk',reason:'新版仍把创意当成用户偏好证据'};}return output;});
 const id=await revise(f);assert.equal((await f.executor.execute('p',id)).status,'succeeded');const a=f.store.read('p').artifacts.at(-1),check=await f.executor.enqueueCorrectionReview('p',{artifactId:a.id,commandId:'risk-check',expectedRevision:f.store.read('p').revision});assert.equal((await f.executor.execute('p',check)).status,'succeeded');
 f.send({kind:'adopt-creative',artifactId:a.id,reason:'选择创意，不能确认事实'});assert.equal(releaseReadiness(f.store.read('p'),a.id).blockedReasons[0],'HARD_BLOCKER');assert.equal(f.store.read('p').correctionReviews[0].findings[0].status,'unresolved');assert.equal(f.store.read('p').releases.length,0);
});

test('new completed report changes frozen source set before dispatch and during production',async t=>{
 let arrived,release;const wait=new Promise(r=>release=r),started=new Promise(r=>arrived=r);const f=await setup(t,async req=>{if(quoted(req.prompt).correctionInput&&!quoted(req.prompt).content){arrived();await wait;}return production(req);});
 const id=await revise(f),run=f.executor.execute('p',id);await started;const extra=await f.executor.enqueueVerification('p',f.base.id,{commandId:'new-report',expectedRevision:f.store.read('p').revision});assert.equal((await f.executor.execute('p',extra)).status,'succeeded');release();assert.equal((await run).status,'succeeded_stale');assert.equal(f.store.read('p').activeByStage.research,f.base.id);assert.equal(f.store.read('p').artifacts.length,2);
});

test('typed unknown dispatch stays unknown and exact command replay returns original frozen request',async t=>{
 const f=await setup(t,req=>{if(quoted(req.prompt).correctionInput)throw Object.assign(new Error('Unknown remote result'),{status:'awaiting_reconciliation'});return production(req);});const id=await revise(f),job=f.store.read('p').jobs.find(j=>j.id===id),original=structuredClone(job.task);
 assert.equal((await f.executor.execute('p',id)).status,'awaiting_reconciliation');await assert.rejects(()=>f.executor.execute('p',id,{retry:true}));const n=f.calls.length;
 f.send({kind:'submit-feedback',artifactId:f.base.id,feedbackId:'after-unknown',instructions:'仍保留事实限制',themes:[],materials:[]});assert.equal(await f.executor.enqueueRevision('p',job.task.revisionRequest),id);assert.deepEqual(f.store.read('p').jobs.find(j=>j.id===id).task,original);assert.equal(f.calls.length,n);
});

function readiness(request){const d=quoted(request.prompt),raw=Object.fromEntries(Object.entries(request.outputSchema.properties).filter(([,s])=>s.enum).map(([k,s])=>[k,s.enum[0]]));return {...raw,verdict:'needs_research',coverage:d.expectedCoverage.map(q=>({questionId:q.id,status:'gap',rationale:'仅有一个背景来源，不足以支持用户偏好',refs:[{location:'/taskCard/brief',quote:d.taskCard.brief}],downstreamImpact:'不能作用户偏好结论',researchNeeded:'补充同用途与人群资料'})),sourceAssessments:d.sourceRecords.map((s,i)=>({sourceId:s.id,textHash:s.textHash,use:'usable_with_limits',relevance:'仅背景',provenance:'captured',limitations:['不验证来源真实性'],refs:[{location:`/sourceRecords/${i}/text`,quote:s.text}]})),findings:[],downstreamUse:{allowed:[],prohibited:['不得推断25岁人群偏好']},limitations:['未完成覆盖']};}
function handoff(request){const d=quoted(request.prompt),raw=Object.fromEntries(Object.entries(request.outputSchema.properties).filter(([,s])=>s.enum).map(([k,s])=>[k,s.enum[0]]));return {...raw,side:d.side,targetStage:d.targetStage,ownerBinding:d.ownerBinding,decision:'blocked',understoodFindings:[{finding:'仅背景所述包装外观',refs:[{location:'/content/claims/0/text',quote:d.content.claims[0].text}]}],permittedUses:[],prohibitedInferences:['不能据此推断偏好'],unresolvedIssues:[{blocking:true,reason:'完整调研尚不足',refs:[{location:'/content/gaps/0',quote:d.content.gaps[0]}]}],limitations:['负责人交接非独立审美评审']};}
test('readiness gaps and blocked owner handoff are immutable typed sources, not silent skipped kinds',async t=>{
 const f=await setup(t,req=>req.outputSchema.properties.coverage?readiness(req):req.outputSchema.properties.ownerBinding?handoff(req):production(req));
 f.bindings.readiness={providerId:'synthetic',model:'synthetic',role:'readiness-lead'};
 const readinessJob=await f.executor.enqueueReadiness('p',f.base.id,{commandId:'coverage',expectedRevision:f.store.read('p').revision});
 const result=await f.executor.execute('p',readinessJob);assert.equal(result.status,'succeeded',JSON.stringify(result.error));
 const h=await f.executor.enqueueHandoff('p',f.base.id,'producer',{commandId:'blocked-owner',expectedRevision:f.store.read('p').revision});const hresult=await f.executor.execute('p',h);assert.equal(hresult.status,'succeeded',JSON.stringify(hresult.error));
 const plan=revisionPlan(f.store.read('p'),f.base.id);assert.equal(plan.sources.filter(s=>s.kind==='readiness').length,1);assert.equal(plan.sources.filter(s=>s.kind==='handoff').length,1);assert.equal(plan.sources.find(s=>s.kind==='handoff').validatedReport.decision,'blocked');assert.ok(plan.sources.find(s=>s.kind==='readiness').findings.some(x=>x.location.startsWith('/coverage/')));
});


test('saved typed correction recovery reconstructs original packet and responses while retaining a now-stale generation',async t=>{
 const f=await setup(t),id=await f.executor.enqueueRevision('p',{artifactId:f.base.id,commandId:'saved-with-delta',expectedRevision:f.store.read('p').revision,supplementalSourceRecords:[{id:'saved-social',url:'https://example.org/saved',text:'Saved bounded source excerpt.',scopeRelation:'background'}]}),job=f.store.read('p').jobs.find(j=>j.id===id),attemptId='saved-typed-attempt',author={actorType:'agent',actorId:'saved-typed-author',runId:'saved-typed-run',contextId:'saved-typed-context'};
 f.send({kind:'start-job',jobId:id,attemptId},author);
 const request=buildStageRequest({stage:job.stage,brief:job.task.brief,inputArtifacts:job.task.revisionInputArtifacts,sourceRecords:job.task.sourceRecords,visualCatalogue:job.task.visualCatalogue,correctionInput:job.task.correctionInput,copyContractVersion:job.task.copyContractVersion});
 const raw=production(request),output=validateStageOutput('research',raw,{sourceRecords:job.task.sourceRecords,correctionInput:job.task.correctionInput});
 const folder=join(f.root,attemptId);await mkdir(folder);const paths=Object.fromEntries(['input','output','receipt','stdout'].map(k=>[k,join(folder,k+'.json')]));
 const packet={runId:attemptId,model:'synthetic',prompt:request.prompt,outputSchema:request.outputSchema};
 const disk={runId:attemptId,provider:'codex-cli',model:'synthetic',requestedModel:'synthetic',threadId:'saved-typed-thread',inputPacketHash:sha(JSON.stringify(packet)),paths,exitCode:0,signal:null,reason:null,error:null};
 const providerExecution={...disk,responseText:JSON.stringify(raw),parsedOutput:raw,schemaValidated:false};const original={...providerExecution,providerExecution,...job.binding,attemptId,taskId:job.task.id};
 await writeFile(paths.input,JSON.stringify(packet));await writeFile(paths.output,original.responseText);await writeFile(paths.receipt,JSON.stringify(disk));await writeFile(paths.stdout,'{"type":"thread.started","thread_id":"saved-typed-thread"}\n{"type":"turn.completed"}\n');
 await writeFile(join(folder,'packet.json'),JSON.stringify({attemptId,jobId:id,projectId:'p',prompt:request.prompt,outputSchema:request.outputSchema,sourceRecords:job.task.sourceRecords,inputVersionIds:job.inputVersionIds}));
 f.send({kind:'finish-job-error',jobId:id,attemptId,status:'awaiting_reconciliation',error:{code:'INVALID_STAGE_OUTPUT',message:'Synthetic historical validator rejection'},receipt:original},author);
 f.send({kind:'submit-feedback',artifactId:f.base.id,feedbackId:'after-saved',instructions:'后补意见只进入下一版',themes:[],materials:[]});const count=f.calls.length;
 const options={commandId:'recover-typed',expectedRevision:f.store.read('p').revision,reason:'只核对保存字节，不重新调用'};
 const result=await f.executor.reconcile('p',id,options);assert.equal(result.status,'succeeded_stale');assert.equal(f.calls.length,count);const p=f.store.read('p'),a=p.artifacts.at(-1);
 assert.equal(p.activeByStage.research,f.base.id);assert.deepEqual(a.revisionResponses,output.revisionResponses);assert.deepEqual(a.revision.sources,job.task.correctionInput.sources);assert.deepEqual(a.revision.evidence,job.task.correctionInput.evidence);assert.deepEqual(a.technicalReceipts.sourceCatalogue.records,job.task.sourceRecords);assert.equal(a.revision.evidence.delta[0].id,'saved-social');assert.deepEqual(a.executionReceipt,original);assert.equal(p.releases.length,0);
 assert.deepEqual(await f.executor.reconcile('p',id,options),result);assert.equal(f.calls.length,count);
});

test('HTTP correction entrypoint selects full machine inventory and independent check route without client protocol selectors',async t=>{
 const f=await setup(t),{createServer}=await import('./server.mjs'),{Readable}=await import('node:stream');
 const server=createServer({dbPath:join(f.root,'db'),rootDir:f.root,bindings:f.bindings,providers:{synthetic:{model:'synthetic',execute:async req=>receipt(req,production(req))}}});
 t.after(async()=>{await server.drain();server.emit('close');});
 async function post(path,body){return await new Promise(resolve=>{const req=Readable.from([Buffer.from(JSON.stringify(body))]);Object.assign(req,{url:path,method:'POST',headers:{host:'127.0.0.1:4181','content-type':'application/json'}});const res={setHeader(){},writeHead(status){this.status=status;},end(payload){resolve({status:this.status,body:JSON.parse(String(payload))});}};server.emit('request',req,res);});}
 const request={artifactId:f.base.id,commandId:'http-typed',expectedRevision:f.store.read('p').revision,supplementalSourceRecords:[{id:'http-social',url:'https://example.org/http',text:'Bounded HTTP admitted source.',scopeRelation:'background'}]};
 assert.equal((await post('/api/projects/p/revisions',{...request,supplementalSourceRecords:request.supplementalSourceRecords.map(s=>({...s,verification:'captured'}))})).status,422);
 assert.equal((await post('/api/projects/p/revisions',{...request,protocolVersion:'legacy'})).status,400);
 const result=await post('/api/projects/p/revisions',request);assert.equal(result.status,202);await server.drain();
 const p=f.store.read('p'),job=p.jobs.find(j=>j.id===result.body.jobId);assert.equal(job.status,'succeeded');assert.equal(job.task.revisionInput,undefined);assert.equal(job.task.correctionInput.sources.length,2);assert.equal(job.task.sourceRecords.at(-1).id,'http-social');assert.equal(job.task.sourceRecords.at(-1).verification,'captured');
});


test('mixed correction sends every registered human image in canonical source order through production and independent handling',async t=>{
 const f=await setup(t),images=createImageEvidenceStore({rootDir:join(f.root,'images')}),png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAE0lEQVR4nGP8//8/AwMDEwMYAAAkBgMBXaJOiAAAAABJRU5ErkJggg==','base64'),assets=[];
 for(const id of ['z-first','a-second']){const asset=await images.ingest({projectId:'p',bytes:png,metadata:{representation:'supplied_image',description:id}});assets.push(asset);f.send({kind:'register-image',asset},{actorType:'agent',actorId:'ingest-'+id,runId:'ingest-'+id,contextId:'ingest-'+id});f.send({kind:'submit-feedback',artifactId:f.base.id,feedbackId:id,instructions:'只借鉴布局',themes:[],materials:[{imageId:asset.id,intendedUse:'构图参考',borrowingNotes:'不作事实证据'}]});}
 const id=await revise(f),job=await f.executor.execute('p',id);assert.equal(job.status,'succeeded',JSON.stringify(job.error));const production=f.calls.at(-1);assert.deepEqual(production.images.map(i=>i.imageId),[assets[1].id,assets[0].id]);for(const image of production.images)assert.deepEqual(await readFile(image.path),png);
 const a=f.store.read('p').artifacts.at(-1),check=await f.executor.enqueueCorrectionReview('p',{artifactId:a.id,commandId:'image-check',expectedRevision:f.store.read('p').revision});assert.equal((await f.executor.execute('p',check)).status,'succeeded');assert.deepEqual(f.calls.at(-1).images.map(i=>i.imageId),[assets[1].id,assets[0].id]);
});

test('affirmative and negative evidence sources keep separate action and preservation manifests with immutable nested limits',async t=>{
 const f=await setup(t),plan=revisionPlan(f.store.read('p'),f.base.id),input={...plan,baseContent:JSON.parse(await readFile(f.base.payloadRef,'utf8')),materials:[]};
 const positive=plan.sources.find(s=>!s.validatedReport.hasBlockingFindings),negative=plan.sources.find(s=>s.validatedReport.hasBlockingFindings);
 assert.equal(positive.findings.length,0);assert.equal(negative.findings.length,1);assert.ok(positive.constraints.some(c=>c.location==='/results/0'));assert.ok(positive.constraints.some(c=>c.location==='/results/0/limitations/0'));assert.ok(positive.constraints.some(c=>c.location.startsWith('/limitations/')));
 validateCorrectionInput(input);const changed=structuredClone(input);changed.sources.find(s=>s.key===positive.key).constraints.pop();changed.sourceSetHash=correctionHash(changed.sources);assert.throws(()=>validateCorrectionInput(changed),{code:'INVALID_CORRECTION'});
 const unknown=structuredClone(input);unknown.sources[0].protocolVersion='unknown-original-protocol';assert.throws(()=>validateCorrectionInput(unknown),/Unsupported correction source/);
});

for(const kind of ['omission','expanded_fact'])test(`preservation ${kind} blocks correction despite all actionable findings addressed and human adoption`,async t=>{
 const f=await setup(t,req=>{const d=quoted(req.prompt),out=production(req);if(d.correctionInput&&!d.content){if(kind==='omission')out.claims[0].limitations=[];else {out.summary='25岁用户都喜欢这种包装';for(const response of out.revisionResponses)response.outputLocations=[{location:'/sections/0/body',quote:out.sections[0].body}];}}
 if(d.correctionInput&&d.content){const constraint=d.correctionInput.sources.flatMap(s=>s.constraints).find(c=>c.location==='/results/0/limitations/0');out.preservationCheck.violations=[{constraintKey:constraint.key,kind,reason:kind==='omission'?`删除原有资格限制 ${constraint.originalValue}`:'将有界外观描述扩张为25岁人群偏好',refs:kind==='omission'?[]:[{location:'/summary',quote:d.content.summary}]}];}return out;});
 const id=await revise(f);const generated=await f.executor.execute('p',id);assert.equal(generated.status,'succeeded',JSON.stringify(generated.error));const a=f.store.read('p').artifacts.at(-1),check=await f.executor.enqueueCorrectionReview('p',{artifactId:a.id,commandId:'preservation-check',expectedRevision:f.store.read('p').revision});assert.equal((await f.executor.execute('p',check)).status,'succeeded');
 const report=f.store.read('p').correctionReviews[0];assert.ok(report.findings.every(f=>f.status==='addressed'));assert.equal(report.hasBlockingFindings,true);assert.equal(report.preservationCheck.violations.length,1);
 f.send({kind:'adopt-creative',artifactId:a.id,reason:'审美选择不能豁免证据限制'});assert.equal(releaseReadiness(f.store.read('p'),a.id).blockedReasons[0],'HARD_BLOCKER');assert.equal(f.store.read('p').releases.length,0);
});


test('typed completion cannot replace its frozen source catalogue or promote captured sources',async t=>{
 const f=await setup(t),id=await revise(f),job=f.store.read('p').jobs.find(j=>j.id===id),ctx={actorType:'agent',actorId:'manual-correction-executor',runId:'manual-r',contextId:'manual-c'},attemptId='manual-attempt';
 f.send({kind:'start-job',jobId:id,attemptId},ctx);const request=buildStageRequest({stage:job.stage,brief:job.task.brief,inputArtifacts:job.task.revisionInputArtifacts,sourceRecords:job.task.sourceRecords,visualCatalogue:job.task.visualCatalogue,correctionInput:job.task.correctionInput});const raw=production(request),output=validateStageOutput('research',raw,{sourceRecords:job.task.sourceRecords,correctionInput:job.task.correctionInput});
 const r={...receipt({...request,runId:attemptId},raw),...job.binding,taskId:job.task.id,attemptId};
 const c={kind:'complete-stage',jobId:id,attemptId,artifactId:'manual-artifact',payloadRef:'synthetic-only',contentHash:sha(JSON.stringify(output.content,null,2)),claims:output.claims,revisionResponses:output.revisionResponses,technicalReceipts:{sourceCatalogue:{version:1,records:job.task.sourceRecords},visualCatalogue:[]},executionReceipt:r,commandId:'manual-complete',expectedRevision:f.store.read('p').revision};
 const p=f.store.read('p'),tampered=structuredClone(c);tampered.technicalReceipts.sourceCatalogue.records[0].verification='verified';assert.throws(()=>applyCommand(p,tampered,ctx),{code:'INVALID_REVISION_OUTPUT'});assert.equal(applyCommand(p,c,ctx).artifacts.at(-1).technicalReceipts.sourceCatalogue.records[0].verification,'captured');
});

for(const label of ['creative_preference','factual_risk'])test(`original verification obligation remains nonwaivable when handling labels it ${label}`,async t=>{
 const f=await setup(t,req=>{const out=production(req),d=quoted(req.prompt);if(d.content&&d.correctionInput)out.findings[0]={...out.findings[0],status:'unresolved',category:label,reason:'未解决原始证据缺口',refs:[]};return out;});
 const id=await revise(f);assert.equal((await f.executor.execute('p',id)).status,'succeeded');const a=f.store.read('p').artifacts.at(-1);
 const check=await f.executor.enqueueCorrectionReview('p',{artifactId:a.id,commandId:'relabel-check',expectedRevision:f.store.read('p').revision});const result=await f.executor.execute('p',check);
 f.send({kind:'adopt-creative',artifactId:a.id,reason:'采用创意不得绕过原始证据缺口'});
 assert.equal(f.store.read('p').releases.length,0);
 if(label==='creative_preference'){assert.notEqual(result.status,'succeeded');assert.equal(f.store.read('p').correctionReviews.length,0);assert.equal(releaseReadiness(f.store.read('p'),a.id).blockedReasons[0],'CORRECTION_REVIEW_REQUIRED');}
 else {assert.equal(result.status,'succeeded');assert.equal(releaseReadiness(f.store.read('p'),a.id).blockedReasons[0],'HARD_BLOCKER');}
});

test('affirmative-only inventory rejects correction before enqueue or provider dispatch, while actual human improvement enables it',async t=>{
 const f=await fixture(t,req=>req.outputSchema.properties.checkedFactMeaning?verification(req,false):production(req));assert.equal((await f.executor.execute('p',f.legacyJobId)).status,'succeeded');
 const before=structuredClone(f.store.read('p')),count=f.calls.length;
 assert.throws(()=>revisionPlan(before,f.base.id),{code:'NO_CORRECTION_REQUIRED'});assert.deepEqual(projectView(before).stages.find(s=>s.stage==='research').correctionAvailability,{available:false,reason:'NO_CORRECTION_REQUIRED'});
 await assert.rejects(()=>revise(f),{code:'NO_CORRECTION_REQUIRED'});assert.deepEqual(f.store.read('p'),before);assert.equal(f.calls.length,count);
 const {createServer}=await import('./server.mjs'),{Readable}=await import('node:stream');let httpCalls=0;
 const server=createServer({dbPath:join(f.root,'db'),rootDir:f.root,bindings:f.bindings,providers:{synthetic:{model:'synthetic',execute:async req=>{httpCalls++;return receipt(req,production(req));}}}});t.after(async()=>{await server.drain();server.emit('close');});
 const http=await new Promise(resolve=>{const req=Readable.from([Buffer.from(JSON.stringify({artifactId:f.base.id,commandId:'no-action-http',expectedRevision:before.revision}))]);Object.assign(req,{url:'/api/projects/p/revisions',method:'POST',headers:{host:'127.0.0.1:4181','content-type':'application/json'}});const res={setHeader(){},writeHead(status){this.status=status;},end(body){resolve({status:this.status,body:JSON.parse(String(body))});}};server.emit('request',req,res);});
 assert.equal(http.status,422);assert.equal(http.body.error.code,'NO_CORRECTION_REQUIRED');await server.drain();assert.equal(httpCalls,0);assert.deepEqual(f.store.read('p'),before);

 const sources=revisionSources(before,f.base.id),input={protocolVersion:CORRECTION_PROTOCOL,revisionOf:{artifactId:f.base.id,contentHash:f.base.contentHash},taskCardId:before.activeTaskCardId,policyVersion:before.policies.at(-1).version,baseContent:JSON.parse(await readFile(f.base.payloadRef,'utf8')),sources,sourceSetHash:correctionHash(sources),constraintManifestHash:correctionHash(sources.flatMap(s=>s.constraints)),materials:[]};
 assert.throws(()=>validateCorrectionInput(input),{code:'NO_CORRECTION_REQUIRED'});
 assert.throws(()=>f.executor.enqueue('p','research',{sourceRecords:[source],correctionInput:input}),{code:'NO_CORRECTION_REQUIRED'});assert.deepEqual(f.store.read('p'),before);assert.equal(f.calls.length,count);
 f.send({kind:'submit-feedback',artifactId:f.base.id,feedbackId:'real-improvement',instructions:'保持依据与未知限制，简化方法介绍',themes:[],materials:[]});
 const plan=revisionPlan(f.store.read('p'),f.base.id);assert.equal(plan.sources.filter(s=>s.kind==='human').length,1);assert.equal(plan.sources.find(s=>s.kind==='verification').findings.length,0);assert.ok(plan.sources.find(s=>s.kind==='verification').constraints.length);
 const id=await revise(f,'real-improvement');assert.equal((await f.executor.execute('p',id)).status,'succeeded');
});

test('genuine human creative disagreement remains explicitly adoptable without granting ordinary evidence approval',async t=>{
 const f=await fixture(t,req=>{if(req.outputSchema.properties.checkedFactMeaning)return verification(req,false);const out=production(req),d=quoted(req.prompt);if(d.content&&d.correctionInput)for(const finding of out.findings)Object.assign(finding,{status:'unresolved',category:'creative_preference',reason:'人类与独立评审对标题风格有不同取舍',refs:[]});return out;});assert.equal((await f.executor.execute('p',f.legacyJobId)).status,'succeeded');
 f.send({kind:'submit-feedback',artifactId:f.base.id,feedbackId:'creative-choice',instructions:'采用更口语的主题',themes:[{text:'得闲一起坐坐',intendedUse:'主题建议'}],materials:[]});
 const id=await revise(f);assert.equal((await f.executor.execute('p',id)).status,'succeeded');const a=f.store.read('p').artifacts.at(-1);
 const check=await f.executor.enqueueCorrectionReview('p',{artifactId:a.id,commandId:'human-choice-review',expectedRevision:f.store.read('p').revision});assert.equal((await f.executor.execute('p',check)).status,'succeeded');
 assert.equal(releaseReadiness(f.store.read('p'),a.id).blockedReasons[0],'FEEDBACK_UNRESOLVED');f.send({kind:'adopt-creative',artifactId:a.id,reason:'保留独立异议，选择口语主题'});
 assert.equal(releaseReadiness(f.store.read('p'),a.id).blockedReasons[0],'HARD_BLOCKER');assert.equal(f.store.read('p').correctionReviews[0].findings[0].category,'creative_preference');assert.equal(f.store.read('p').releases.length,0);
});

test('v3 public additive correction freezes parent plus captured delta and checker binds complete registered producer context',async t=>{
 const f=await setup(t),supplementalSourceRecords=[{id:'social-study',url:'https://example.org/social',text:'Adults in this limited study described social use. No Chinese population estimate.',scopeRelation:'background',reason:'Operational limit only, not an additional source assertion.'}],request={artifactId:f.base.id,commandId:'supplemented',expectedRevision:f.store.read('p').revision,supplementalSourceRecords};
 const id=await f.executor.enqueueRevision('p',request),queued=f.store.read('p').jobs.find(j=>j.id===id),input=queued.task.correctionInput;
 assert.equal(input.protocolVersion,'typed-revision-v3');assert.equal(input.sourceSetHash,revisionPlan(f.store.read('p'),f.base.id).sourceSetHash);assert.deepEqual(input.evidence.base.sourceRecords,[source]);assert.equal(input.evidence.delta[0].verification,'captured');assert.deepEqual(queued.task.sourceRecords,[source,{...supplementalSourceRecords[0],verification:'captured'}]);
 assert.equal(await f.executor.enqueueRevision('p',request),id);
 for(const change of [d=>d[0].text+=' altered',d=>d[0].reason+=' altered',d=>d.push({...d[0],id:'second'})]){const changed=structuredClone(request);change(changed.supplementalSourceRecords);await assert.rejects(()=>f.executor.enqueueRevision('p',changed),{code:'COMMAND_ID_REUSED'});}
 const context={actorType:'agent',actorId:'admission-check',runId:'admission-r',contextId:'admission-c'};
 for(const mutate of [j=>j.task.sourceRecords.pop(),j=>j.task.visualCatalogue.push({id:'implicit'}),j=>{j.task.correctionInput.evidence.base.sourceRecords[0].text+=' omitted original';const {manifestHash,...body}=j.task.correctionInput.evidence;j.task.correctionInput.evidence.manifestHash=evidenceHash(body);j.task.sourceRecords[0].text+=' omitted original';},j=>j.task.correctionInput.taskCardSnapshot.brief+=' forged']){
  const p=structuredClone(f.store.read('p'));mutate(p.jobs.find(j=>j.id===id));assert.throws(()=>applyCommand(p,{kind:'start-job',jobId:id,attemptId:'reject',commandId:randomUUID(),expectedRevision:p.revision},context));
 }
 assert.equal((await f.executor.execute('p',id)).status,'succeeded');const p=f.store.read('p'),a=p.artifacts.at(-1);assert.deepEqual(a.revision.evidence,input.evidence);assert.deepEqual(a.technicalReceipts.sourceCatalogue.records,queued.task.sourceRecords);
 const check=await f.executor.enqueueCorrectionReview('p',{artifactId:a.id,commandId:'complete-context',expectedRevision:p.revision}),review=f.store.read('p').jobs.find(j=>j.id===check),d=quoted(buildCorrectionReviewRequest(review.task.correctionReviewInput).prompt);
 assert.equal(d.reviewProtocolVersion,'correction-handling-v3');assert.deepEqual(d.correctionInput.evidence,input.evidence);assert.match(d.context.producerInputPacket,/Adults in this limited study/);assert.deepEqual(d.context.taskCard,p.taskCards[0]);assert.deepEqual(d.context.upstreamArtifacts,queued.task.revisionInputArtifacts);assert.equal(d.context.materialManifestHash,sha('[]'));assert.ok(!buildCorrectionReviewRequest(review.task.correctionReviewInput).outputSchema.properties.findings.items.properties.refs.items.properties.location.enum.some(p=>p.startsWith('/correctionInput')));
 for(const mutate of [i=>delete i.context,i=>{i.context.producerAttemptId+=' forged';const {contextHash,...body}=i.context;i.context.contextHash=evidenceHash(body);},i=>i.context.upstreamArtifacts.push({id:'forged'}),i=>i.correctionInput.evidence.delta[0].text+=' forged']){
  const q=structuredClone(f.store.read('p'));mutate(q.jobs.find(j=>j.id===check).task.correctionReviewInput);assert.throws(()=>applyCommand(q,{kind:'start-job',jobId:check,attemptId:'reject',commandId:randomUUID(),expectedRevision:q.revision},context));
 }
 assert.equal((await f.executor.execute('p',check)).status,'succeeded');const after=f.store.read('p'),report=after.correctionReviews.at(-1);assert.equal(report.contextHash,d.context.contextHash);assert.equal(report.protocolVersion,'correction-handling-v3');assert.equal(revisionSources(after,a.id)[0].protocolVersion,'correction-handling-v3');
 const forged=structuredClone(after),original=forged.jobs.find(j=>j.id===id);original.task.sourceRecords[0].text+=' forged';assert.throws(()=>revisionSources(forged,a.id));assert.equal(after.releases.length,0);
});

test('v3 supplemental overlap, forged authority and human-only supplementation never enqueue or call provider',async t=>{
 const f=await setup(t),before=f.store.read('p'),count=f.calls.length;
 const basic={id:'new',url:'https://example.org/new',text:'bounded text',scopeRelation:'background'};
 for(const delta of [[{...basic,id:'s'}],[basic,basic],[{...basic,verification:'verified'}],[{...basic,caseIdentity:{}}],[{...basic,scopeRelation:'direct'}]])await assert.rejects(()=>f.executor.enqueueRevision('p',{artifactId:f.base.id,commandId:randomUUID(),expectedRevision:before.revision,supplementalSourceRecords:delta}));
 assert.deepEqual(f.store.read('p'),before);assert.equal(f.calls.length,count);
 const only=await fixture(t);only.send({kind:'submit-feedback',artifactId:only.base.id,feedbackId:'real-human',instructions:'简化文字',themes:[],materials:[]});await assert.rejects(()=>only.executor.enqueueRevision('p',{artifactId:only.base.id,commandId:'human-supplement',expectedRevision:only.store.read('p').revision,supplementalSourceRecords:[basic]}),/machine-backed/);
});

test('empty delta normalizes replay while source envelope cannot silently admit later records',async t=>{
 const f=await setup(t),request={artifactId:f.base.id,commandId:'empty-delta',expectedRevision:f.store.read('p').revision},id=await f.executor.enqueueRevision('p',request);
 assert.equal(await f.executor.enqueueRevision('p',{...request,supplementalSourceRecords:[]}),id);const job=f.store.read('p').jobs.find(j=>j.id===id);assert.deepEqual(job.task.correctionInput.evidence.delta,[]);assert.deepEqual(job.task.sourceRecords,[source]);
});

test('delta order is part of exact repeated command identity',async t=>{
 const f=await setup(t),delta=['first','second'].map(id=>({id,url:'https://example.org/'+id,text:'Bounded text '+id,scopeRelation:'background'})),request={artifactId:f.base.id,commandId:'ordered-delta',expectedRevision:f.store.read('p').revision,supplementalSourceRecords:delta},id=await f.executor.enqueueRevision('p',request);
 assert.equal(await f.executor.enqueueRevision('p',request),id);await assert.rejects(()=>f.executor.enqueueRevision('p',{...request,supplementalSourceRecords:[...delta].reverse()}),{code:'COMMAND_ID_REUSED'});assert.deepEqual(f.store.read('p').jobs.find(j=>j.id===id).task.sourceRecords.map(s=>s.id),['s','first','second']);
});
