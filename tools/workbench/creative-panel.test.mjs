import {syntheticStrategyV2} from './strategy-fixtures.mjs';
import {feedbackHash} from './human-feedback.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {openStore} from './store.mjs';
import {createExecutor} from './executor.mjs';
import {LEGACY_COPY_CREATIVE_PROTOCOL,creativePlan,COPY_CREATIVE_PROTOCOL,CREATIVE_PROTOCOL,CREATIVE_ROLES,creativeHash,creativeDecision,validateCreativeOutput,creativeNodeInput} from './creative-panel.mjs';
import {releaseReadiness,revisionPlan,revisionSources} from './project.mjs';
import {context,stageDraft,panelFixtureOutput,createPanelFixture} from './creative-test-fixtures.mjs';
async function runAll(f){for(let i=0;i<10;i++){const jobs=f.executor.advanceCreativePanels('p');if(!jobs.length)break;await Promise.all(jobs.map(id=>f.executor.execute('p',id)));}return f.store.read('p');}

test('full copy panel dispatches 17 actual provider-shaped calls with anonymous first reads and original receipts; uncalibrated cannot pass',async t=>{
 const f=await createPanelFixture(t),request=f.request(),id=await f.executor.enqueueCreativePanel('p',request);
 assert.equal(await f.executor.enqueueCreativePanel('p',request),id);let p=await runAll(f);
 assert.equal(p.creativeReports.filter(r=>r.artifactId===f.artifactId).length,17,JSON.stringify(p.jobs.map(j=>j.error)));assert.equal(f.calls.length,18);assert.equal(p.reviews.length,10);
 assert.equal(creativeDecision(p.creativePanels.find(panel=>panel.packet.artifactId===f.artifactId),p.creativeReports).status,'cannot_assess');assert.equal(p.releases.length,2);assert.equal(p.decisions.filter(d=>d.human).length,0);
 const first=f.calls.find(c=>c.input.phase==='score_first_read').input;assert.equal(Object.hasOwn(first,'taskCard'),false);assert.equal(JSON.stringify(first).includes('rationale'),false);assert.equal(JSON.stringify(first).includes('steady'),false);
 for(const call of f.calls.filter(c=>c.input.phase==='opposition_first_read'))assert.equal(Object.hasOwn(call.input,'pairedScore'),false);
 assert.equal(new Set(p.creativeReports.filter(r=>r.artifactId===f.artifactId).map(r=>r.executionReceipt.threadId)).size,17);
 assert.equal(releaseReadiness(p,f.artifactId).blockedReasons[0],'CREATIVE_PANEL_NOT_PASSED');
 const again=await f.executor.enqueueCreativePanel('p',f.request());assert.equal(again,id);f.executor=f.makeExecutor();await runAll(f);assert.equal(f.calls.length,18);
});

test('strategy panel has one strategy seat and five actual calls, no user role or visual averages',async t=>{
 const f=await createPanelFixture(t,{stage:'strategy'});await f.executor.enqueueCreativePanel('p',f.request());const p=await runAll(f);
 assert.equal(p.creativeReports.filter(r=>r.artifactId===f.artifactId).length,5,JSON.stringify(p.jobs.map(j=>j.error)));assert.deepEqual(p.creativePanels.find(panel=>panel.packet.artifactId===f.artifactId).nodes.map(n=>n.role),['strategy','strategy','strategy','strategy','director']);assert.equal(p.reviews.every(r=>r.score===undefined),true);
});

test('new human feedback stops queued creative phases and never normalizes late reports',async t=>{
 let signal,release;const started=new Promise(r=>signal=r),wait=new Promise(r=>release=r);
 const f=await createPanelFixture(t,{handler:async input=>{if(input.phase==='score_first_read'){signal();await wait;}return input.phase?panelFixtureOutput(input):stageDraft('copy');}});
 await f.executor.enqueueCreativePanel('p',f.request());const ids=f.executor.advanceCreativePanels('p');const run=f.executor.execute('p',ids[0]);await started;
 f.send({kind:'submit-feedback',artifactId:f.artifactId,feedbackId:'new',instructions:'改变主题',themes:[],materials:[]});release();
 const result=await run;assert.equal(result.status,'awaiting_reconciliation');assert.equal(result.error.code,'STALE_CREATIVE_PANEL');assert.equal(f.store.read('p').creativeReports.filter(r=>r.artifactId===f.artifactId).length,0);
 await f.executor.execute('p',ids[1]);assert.equal(f.store.read('p').jobs.find(j=>j.id===ids[1]).status,'blocked');assert.equal(f.calls.length,2);
});

test('unknown creative provider call is not resumed by graph restart',async t=>{
 const f=await createPanelFixture(t,{handler:async input=>{if(input.phase)throw Object.assign(new Error('uncertain'),{status:'awaiting_reconciliation'});return stageDraft('copy');}});
 await f.executor.enqueueCreativePanel('p',f.request());const ids=f.executor.advanceCreativePanels('p');await f.executor.execute('p',ids[0]);f.executor=f.makeExecutor();assert.equal(f.executor.advanceCreativePanels('p').includes(ids[0]),false);await assert.rejects(()=>f.executor.execute('p',ids[0],{retry:true}));assert.equal(f.calls.length,2);
});

test('director must adjudicate every independent criticism; factual risk remains hard and original scores immutable',async t=>{
 const f=await createPanelFixture(t,{calibrated:true,handler:input=>{if(!input.phase)return stageDraft('copy');const r=panelFixtureOutput(input);if(input.phase==='opposition'&&input.role==='brand')r.challenges=[{id:'risk',targetClaimId:'',targetClaimText:'',novelty:'new',issue:{id:'risk',subjectIds:['A'],category:'factual_risk',severity:'major',finding:'Unsupported benefit',impact:'Could mislead',evidence:[],materialAbsence:'No source supports a health benefit'}}];return r;}});
 await f.executor.enqueueCreativePanel('p',f.request());const p=await runAll(f);assert.equal(p.creativeReports.filter(r=>r.artifactId===f.artifactId).length,17);assert.equal(creativeDecision(p.creativePanels.find(panel=>panel.packet.artifactId===f.artifactId),p.creativeReports).status,'revise');
 const original=structuredClone(p.reviews.filter(r=>r.reviewType==='score'));f.send({kind:'adopt-creative',artifactId:f.artifactId,reason:'synthetic human preference'});assert.deepEqual(f.store.read('p').reviews.filter(r=>r.reviewType==='score'),original);assert.equal(releaseReadiness(f.store.read('p'),f.artifactId).eligible,false);
 const panel=p.creativePanels.find(panel=>panel.packet.artifactId===f.artifactId),node=panel.nodes.at(-1),input=creativeNodeInput(panel,node,p.creativeReports),out=panelFixtureOutput(input);out.adjudications=[];assert.throws(()=>validateCreativeOutput(out,input),/invalid array|exact coverage/);
});

test('similar meanings cannot pass whole-group criterion merely by high individual scores',async t=>{
 const f=await createPanelFixture(t,{calibrated:true,handler:input=>{if(!input.phase)return stageDraft('copy');const r=panelFixtureOutput(input);if(r.groupComparisons)r.groupComparisons[0].verdict='similar';return r;}});await f.executor.enqueueCreativePanel('p',f.request());const p=await runAll(f);assert.equal(creativeDecision(p.creativePanels.find(panel=>panel.packet.artifactId===f.artifactId),p.creativeReports).status,'revise');assert.equal(p.creativeReports.filter(r=>r.phase==='score').every(r=>r.rawReport.items.every(i=>i.dimensions.every(d=>d.score===4))),true);
});

test('exact provider packet, model and fresh thread are mandatory before report normalization',async t=>{
 for(const mode of ['packet','model','thread'])await t.test(mode,async t=>{
   const f=await createPanelFixture(t),original=f.providers.synthetic.execute;
   let priorThread;
   f.providers.synthetic.execute=async req=>{const r=await original(req);if(mode==='packet')r.inputPacketHash='0'.repeat(64);if(mode==='model')r.model='different-model';if(mode==='thread'){if(priorThread)r.threadId=priorThread;else priorThread=r.threadId;}return r;};
   await f.executor.enqueueCreativePanel('p',f.request());const ids=f.executor.advanceCreativePanels('p');await f.executor.execute('p',ids[0]);
   if(mode==='thread'){assert.equal(f.store.read('p').creativeReports.filter(r=>r.artifactId===f.artifactId).length,1);await f.executor.execute('p',ids[1]);}
   const last=f.store.read('p').jobs.find(j=>j.id===ids[mode==='thread'?1:0]);assert.equal(last.status,'awaiting_reconciliation');assert.equal(f.store.read('p').creativeReports.filter(r=>r.artifactId===f.artifactId).length,mode==='thread'?1:0);
 });
});

test('creator ancestry in frozen reviewer seat is rejected before any creative call',async t=>{
 const f=await createPanelFixture(t);await f.executor.enqueueCreativePanel('p',f.request());const p=f.store.read('p'),panel=p.creativePanels.find(panel=>panel.packet.artifactId===f.artifactId),node=panel.nodes[0];
 const input=creativeNodeInput(panel,node,[]);const command={kind:'request-creative-node',panelId:panel.id,nodeKey:node.key,commandId:randomUUID(),expectedRevision:p.revision};
 f.store.command('p',command,context('coordinator'));
 const creator=p.artifacts.find(a=>a.id===f.artifactId).author;
 assert.throws(()=>f.store.command('p',{kind:'start-job',jobId:node.jobId,attemptId:node.context.runId,commandId:randomUUID(),expectedRevision:f.store.read('p').revision},{...node.context,parentRunIds:[creator.runId]}),{code:'SELF_REVIEW'});
 assert.equal(f.calls.length,1);assert.equal(input.subjects[0].slogan,'得闲，坐一桌');
});

test('calibrated scoring retains all exact dimensions; a director cannot upgrade a score below four',async t=>{
 const f=await createPanelFixture(t,{calibrated:true,handler:input=>{if(!input.phase)return stageDraft('copy');const r=panelFixtureOutput(input);if(r.items&&input.role==='copy'){r.items[0].dimensions[0].score=3;r.items[0].verdict='revise';}return r;}});
 await f.executor.enqueueCreativePanel('p',f.request());const p=await runAll(f),outcome=creativeDecision(p.creativePanels.find(panel=>panel.packet.artifactId===f.artifactId),p.creativeReports);
 assert.equal(outcome.status,'revise');assert.equal(p.creativeReports.find(r=>r.nodeKey==='copy:score').rawReport.items[0].dimensions[0].score,3);assert.equal(p.reviews.find(r=>r.role==='copy'&&r.reviewType==='score').verdict,'reject');
});

test('HTTP only accepts panel request and resumes exact graph after reopen without duplicate provider calls',async t=>{
 const {createServer}=await import('./server.mjs'),{Readable}=await import('node:stream');
 const f=await createPanelFixture(t),uiPath=join(f.root,'ui.html');await writeFile(uiPath,'<h1>test</h1>');
 let server=createServer({dbPath:f.dbPath,rootDir:f.root,uiPath,providers:f.providers,bindings:f.bindings});t.after(()=>server.emit('close'));
 async function request(path,body){const req=Readable.from([Buffer.from(body===undefined?'':JSON.stringify(body))]);Object.assign(req,{url:path,method:body===undefined?'GET':'POST',headers:{host:'127.0.0.1:4181','content-type':'application/json'}});return new Promise(resolve=>{const res={setHeader(){},writeHead(status){this.status=status;},end(payload){resolve({status:this.status,body:JSON.parse(String(payload))});}};server.emit('request',req,res);});}
 const req=f.request(),route='/api/projects/p/creative-panels';for(const extra of [{scores:[]},{calibration:{status:'verified'}},{rawReport:{}},{model:'forged'}])assert.equal((await request(route,{...req,...extra})).status,400);
 const result=await request(route,req);assert.equal(result.status,202);await server.drain();assert.equal(f.calls.length,18);
 assert.equal((await request(route,req)).status,202);await server.drain();assert.equal(f.calls.length,18);
 server.emit('close');server=createServer({dbPath:f.dbPath,rootDir:f.root,uiPath,providers:f.providers,bindings:f.bindings});await server.drain();assert.equal(f.calls.length,18);
 const latest=(await request('/api/projects/p')).body.project;assert.equal(latest.creativeReports.filter(r=>r.artifactId===f.artifactId).length,17);assert.equal(latest.decisions.filter(x=>x.human).length,0);assert.equal(latest.releases.length,2);
});

test('upstream feedback blocks an already queued downstream panel before dispatch',async t=>{
 const f=await createPanelFixture(t);await f.executor.enqueueCreativePanel('p',f.request());const ids=f.executor.advanceCreativePanels('p');
 f.send({kind:'submit-feedback',artifactId:f.store.read('p').activeByStage.strategy,feedbackId:'strategy-change',instructions:'策略需要调整',themes:[],materials:[]});
 const result=await f.executor.execute('p',ids[0]);assert.equal(result.status,'blocked');assert.equal(result.error.code,'DEPENDENCY_BLOCKED');assert.equal(f.calls.length,1);assert.equal(f.store.read('p').creativeReports.filter(r=>r.artifactId===f.artifactId).length,0);
});

test('score schema rejects invented quotes, omitted dimensions and first-read omission of actual slogan',async t=>{
 const f=await createPanelFixture(t);await f.executor.enqueueCreativePanel('p',f.request());const p=f.store.read('p'),panel=p.creativePanels.find(panel=>panel.packet.artifactId===f.artifactId),node=panel.nodes[0],input=creativeNodeInput(panel,node,[]),out=panelFixtureOutput(input);
 out.readings[0].evidence[0].quote='not present';assert.throws(()=>validateCreativeOutput(out,input),/quote absent/);
 const missing=panelFixtureOutput(input);missing.readings[0].evidence=missing.readings[0].evidence.filter(r=>!r.location.endsWith('/slogan'));assert.throws(()=>validateCreativeOutput(missing,input),/slogan evidence/);
 await f.executor.execute('p',f.executor.advanceCreativePanels('p')[0]);const scoreNode=panel.nodes.find(n=>n.key==='copy:score'),scoreInput=creativeNodeInput(panel,scoreNode,f.store.read('p').creativeReports),score=panelFixtureOutput(scoreInput);score.items[0].dimensions.pop();assert.throws(()=>validateCreativeOutput(score,scoreInput),/invalid array/);
});

test('explicit undispatched configuration failure can resume with durable fresh attempt; unknown cannot',async t=>{
 const f=await createPanelFixture(t);await f.executor.enqueueCreativePanel('p',f.request());const ids=f.executor.advanceCreativePanels('p'),provider=f.providers.synthetic;delete f.providers.synthetic;
 const failed=await f.executor.execute('p',ids[0]);assert.equal(failed.status,'blocked');assert.equal(failed.attempts[0].dispatchStarted,false);const prior=structuredClone(failed.attempts[0]);
 f.providers.synthetic=provider;const request=f.request();await f.executor.enqueueCreativePanel('p',request);const resumed=f.store.read('p').jobs.find(j=>j.id===ids[0]);assert.equal(resumed.assignedContexts.length,2);assert.equal(resumed.status,'queued');
 assert.equal((await f.executor.execute('p',ids[0])).status,'succeeded');assert.deepEqual(f.store.read('p').jobs.find(j=>j.id===ids[0]).attempts[0],prior);
 assert.equal(await f.executor.enqueueCreativePanel('p',request),f.store.read('p').creativePanels.find(panel=>panel.packet.artifactId===f.artifactId).id);assert.equal(f.calls.length,2);
 const unknown=f.store.read('p').jobs.find(j=>j.id===ids[0]);assert.equal(unknown.attempts[1].dispatchStarted,true);assert.notEqual(unknown.attempts[0].id,unknown.attempts[1].id);
});

test('v2 scored/unknown/null semantics and strategy explicit judgment do not borrow copy threshold',async t=>{
 const f=await createPanelFixture(t,{stage:'strategy',calibrated:true,handler:input=>{if(!input.phase)return syntheticStrategyV2(input);const r=panelFixtureOutput(input);if(r.items)r.items[0].dimensions[0].score=3;return r;}});await f.executor.enqueueCreativePanel('p',f.request());const p=await runAll(f),panel=p.creativePanels.find(panel=>panel.packet.artifactId===f.artifactId);assert.equal(creativeDecision(panel,p.creativeReports).status,'pass');
 const input=creativeNodeInput(panel,panel.nodes.find(n=>n.phase==='score'),p.creativeReports),out=panelFixtureOutput(input);out.items[0].dimensions[0].status='unknown';assert.throws(()=>validateCreativeOutput(out,input),/requires null/);out.items[0].dimensions[0].score=null;out.items[0].verdict='cannot_assess';assert.equal(validateCreativeOutput(out,input).items[0].dimensions[0].score,null);
 out.items[0].dimensions[0].status='not_applicable';assert.throws(()=>validateCreativeOutput(out,input),/Required dimension/);out.items[0].dimensions[0].status='assessed';assert.throws(()=>validateCreativeOutput(out,input),/invalid string/);
});

test('director can reject an unsupported factual accusation by exact task evidence without changing independent verification',async t=>{
 const f=await createPanelFixture(t,{calibrated:true,handler:input=>{if(!input.phase)return stageDraft('copy');const r=panelFixtureOutput(input);if(input.phase==='opposition'&&input.role==='brand')r.challenges=[{id:'false-risk',targetClaimId:'',targetClaimText:'',novelty:'new',issue:{id:'false-risk',subjectIds:['A'],category:'scope',severity:'major',finding:'品牌得闲未确认',impact:'任务范围疑问',evidence:[],materialAbsence:'声称品牌未定'}}];if(input.phase==='director')r.adjudications=r.adjudications.map(a=>({...a,disposition:'rejected',reason:'任务卡已明确品牌得闲，批评不成立',evidence:[{location:'/taskCard/brief',quote:'得闲'}]}));return r;}});
 await f.executor.enqueueCreativePanel('p',f.request());const p=await runAll(f);assert.equal(creativeDecision(p.creativePanels.find(panel=>panel.packet.artifactId===f.artifactId),p.creativeReports).status,'pass');assert.equal(p.verifications.filter(r=>r.artifactId===f.artifactId).length,0);assert.throws(()=>f.send({kind:'release-stage',artifactId:f.artifactId}),error=>error.code==='HARD_BLOCKER'&&error.message==='Unresolved evidence-backed blocking problems require correction');
 const panel=p.creativePanels.find(panel=>panel.packet.artifactId===f.artifactId),input=creativeNodeInput(panel,panel.nodes.at(-1),p.creativeReports),out=panelFixtureOutput(input);out.adjudications[0].disposition='rejected';out.adjudications[0].evidence=[{location:'/sources/0/reason',quote:'forged note'}];assert.throws(()=>validateCreativeOutput(out,input),/literal source text/);
 const sourced={...input,sources:[{text:'真实的冻结来源摘录',reason:'非来源证明'}]};out.adjudications[0].evidence=[{location:'/sources/0/text',quote:'冻结来源摘录'}];assert.equal(validateCreativeOutput(out,sourced).adjudications[0].disposition,'rejected');
});

test('review regression: scoring cannot use another subject or a third subject as pair evidence',async t=>{
 for(const fault of ['item','pair'])await t.test(fault,async t=>{
   const f=await createPanelFixture(t,{calibrated:true,handler:input=>{if(!input.phase)return stageDraft('copy');const r=panelFixtureOutput(input);if(input.phase==='score'&&input.role==='copy'){if(fault==='item')for(const item of r.items.slice(1))for(const d of item.dimensions)d.evidence=[{location:'/subjects/0/slogan',quote:input.subjects[0].slogan}];else r.groupComparisons.find(p=>p.pair.join('')==='BC').evidence=[{location:'/subjects/0/slogan',quote:input.subjects[0].slogan}];}return r;}});
   await f.executor.enqueueCreativePanel('p',f.request());const p=await runAll(f),job=p.jobs.find(j=>j.nodeKey==='copy:score');
   assert.equal(job.status,'awaiting_reconciliation');assert.match(job.error.message,fault==='item'?/own subject/:/both compared subjects/);assert.equal(p.creativeReports.some(r=>r.nodeKey==='copy:score'),false);assert.equal(p.reviews.some(r=>r.creativePanelId&&r.role==='copy'),false);
 });
});

test('review regression: calibrated unknown dimension or pair remains cannot_assess, not revise',async t=>{
 for(const fault of ['dimension','pair'])await t.test(fault,async t=>{
   const f=await createPanelFixture(t,{calibrated:true,handler:input=>{if(!input.phase)return stageDraft('copy');const r=panelFixtureOutput(input);if(input.phase==='score'&&input.role==='copy'){if(fault==='dimension'){r.items[0].dimensions[0].status='unknown';r.items[0].dimensions[0].score=null;r.items[0].verdict='cannot_assess';}else r.groupComparisons[0].verdict='cannot_assess';}return r;}});
   await f.executor.enqueueCreativePanel('p',f.request());const p=await runAll(f),result=creativeDecision(p.creativePanels.find(panel=>panel.packet.artifactId===f.artifactId),p.creativeReports);assert.equal(result.status,'cannot_assess');assert.equal(result.reasons.some(r=>r.startsWith('uncalibrated')),false);
 });
});

test('review regression: narrowed authorization stops old panel without stopping server startup',async t=>{
 const {createServer}=await import('./server.mjs');const f=await createPanelFixture(t);await f.executor.enqueueCreativePanel('p',f.request());const [id]=f.executor.advanceCreativePanels('p');await f.executor.execute('p',id);
 const reports=structuredClone(f.store.read('p').creativeReports);f.send({kind:'set-policy',mode:'assisted',humanGates:[],authorizedThrough:'research'});
 const uiPath=join(f.root,'ui.html');await writeFile(uiPath,'<h1>test</h1>');const server=createServer({dbPath:f.dbPath,rootDir:f.root,uiPath,providers:f.providers,bindings:f.bindings});t.after(()=>server.emit('close'));await server.drain();
 assert.equal(f.calls.length,2);assert.deepEqual(f.store.read('p').creativeReports,reports);assert.equal(f.store.read('p').jobs.some(j=>j.purpose==='creative_review'&&j.status==='blocked'&&j.error?.code==='AUTHORIZATION_ENDPOINT'),true);
});

test('review regression: provider blocked error after durable dispatch settles as unknown and retains error plus original receipt',async t=>{
 const f=await createPanelFixture(t);await f.executor.enqueueCreativePanel('p',f.request());const [id]=f.executor.advanceCreativePanels('p');let attempts=0;
 f.providers.synthetic.execute=async request=>{attempts++;throw Object.assign(new Error('Codex executable is unavailable'),{code:'BINARY_UNAVAILABLE',status:'blocked',receipt:{runId:request.runId,model:'synthetic',requestedModel:'synthetic',threadId:'failure-thread',inputPacketHash:'unknown-packet',exitCode:null,usage:null,cost:null}});};
 const result=await f.executor.execute('p',id);assert.equal(result.status,'awaiting_reconciliation');assert.equal(result.error.code,'BINARY_UNAVAILABLE');assert.equal(result.error.message,'Codex executable is unavailable');assert.equal(result.attempts.at(-1).dispatchStarted,true);assert.equal(result.attempts.at(-1).receipt.providerExecution.threadId,'failure-thread');
 await f.executor.enqueueCreativePanel('p',f.request());assert.equal(f.executor.advanceCreativePanels('p').includes(id),false);await assert.rejects(()=>f.executor.execute('p',id,{retry:true}));assert.equal(attempts,1);
});

test('review regression: subject IDs or titles cannot replace actual copy expression in dimensions or pairs',async t=>{
 for(const leaf of ['id','title'])await t.test(leaf,async t=>{
   const f=await createPanelFixture(t,{calibrated:true,handler:input=>{if(!input.phase)return stageDraft('copy');const r=panelFixtureOutput(input);if(input.phase==='score'){for(const item of r.items){const index=input.subjects.findIndex(s=>s.id===item.subjectId);for(const d of item.dimensions)d.evidence=[{location:`/subjects/${index}/${leaf}`,quote:input.subjects[index][leaf]}];}for(const pair of r.groupComparisons)pair.evidence=pair.pair.map(id=>{const index=input.subjects.findIndex(s=>s.id===id);return {location:`/subjects/${index}/${leaf}`,quote:input.subjects[index][leaf]};});}return r;}});
   await f.executor.enqueueCreativePanel('p',f.request());const p=await runAll(f);assert.equal(p.creativeReports.some(r=>r.artifactId===f.artifactId&&r.phase==='score'),false);assert.equal(p.jobs.filter(j=>j.targetArtifactId===f.artifactId&&j.nodeKey?.endsWith(':score')).every(j=>j.status==='awaiting_reconciliation'),true);
 });
});

test('review regression: strategy body leaves are evidence while metadata and director ID-only rejections are not',async t=>{
 const f=await createPanelFixture(t,{stage:'strategy'});await f.executor.enqueueCreativePanel('p',f.request());const panel=f.store.read('p').creativePanels.find(panel=>panel.packet.artifactId===f.artifactId),firstNode=panel.nodes[0],input=creativeNodeInput(panel,firstNode,[]),out=panelFixtureOutput(input);
 for(const leaf of ['id','sections/0/evidenceIds/0','claims/0/kind']){const value={...input,subjects:[{...input.subjects[0],sections:[{heading:'目标',body:'实际策略表达',evidenceIds:['metadata']}],claims:[{text:'实际断言',kind:'creative'}]}]},r=panelFixtureOutput(value);r.readings[0].evidence=[{location:'/subjects/0/'+leaf,quote:leaf==='id'?'A':leaf.includes('evidenceIds')?'metadata':'creative'}];assert.throws(()=>validateCreativeOutput(r,value),/Evidence requires exact/);}
 for(const leaf of ['summary','strategy/coreQuestion/text','strategy/candidateCuts/0/proposition','strategy/answer/text','claims/0/text']){const value=structuredClone(input),r=panelFixtureOutput(value);r.readings[0].evidence=[{location:'/subjects/0/'+leaf,quote:leaf.split('/').reduce((v,k)=>v[k],value.subjects[0])}];assert.equal(validateCreativeOutput(r,value).readings.length,1);}
 const directorInput={...input,phase:'director',role:'director',reports:[{nodeKey:'strategy:opposition',report:{challenges:[{id:'challenge'}]}}]},director=panelFixtureOutput(directorInput);director.adjudications[0]={...director.adjudications[0],disposition:'rejected',evidence:[{location:'/subjects/0/id',quote:'A'}]};assert.throws(()=>validateCreativeOutput(director,directorInput),/Evidence requires exact/);
 assert.equal(out.readings[0].subjectId,'A');
});

test('frozen v2 pending graph completes unchanged beside fresh v3 but cannot approve current delivery',async t=>{
 const f=await createPanelFixture(t,{calibrated:true}),p=f.store.read('p'),a=p.artifacts.find(a=>a.id===f.artifactId),request=f.request();
 const packet={protocolVersion:LEGACY_COPY_CREATIVE_PROTOCOL,artifactId:a.id,contentHash:a.contentHash,stage:a.stage,copyContractVersion:a.copyContract.version,content:JSON.parse(await readFile(a.payloadRef,'utf8')),taskCard:p.taskCards.find(c=>c.id===p.activeTaskCardId),policyVersion:p.policies.at(-1).version,feedbackHash:feedbackHash([]),sources:a.technicalReceipts.sourceCatalogue.records,upstreamConstraints:[]};
 const plan=creativePlan(packet,f.bindings,[]),id=`creative-${creativeHash(JSON.stringify(['p',request.commandId]))}`;
 const panel={id,request,...plan,nodes:plan.nodes.map(n=>({...n,jobId:randomUUID(),context:context(randomUUID())}))};
 f.store.command('p',{kind:'request-creative-panel',artifactId:a.id,panel,bindings:f.bindings,commandId:request.commandId,expectedRevision:request.expectedRevision},context('synthetic-old-coordinator'));
 const queued=f.executor.advanceCreativePanels('p');assert.ok(queued.length);
 const original=structuredClone(f.store.read('p').creativePanels.find(panel=>panel.packet.artifactId===f.artifactId));const calls=f.calls.length;
 assert.equal(await f.executor.enqueueCreativePanel('p',request),id);assert.equal(f.calls.length,calls);
 const fresh=await f.executor.enqueueCreativePanel('p',f.request());assert.notEqual(fresh,id);
 for(const jobId of queued)assert.equal((await f.executor.execute('p',jobId)).status,'succeeded');
 const done=await runAll(f);assert.deepEqual(done.creativePanels.find(panel=>panel.packet.artifactId===f.artifactId),original);assert.equal(done.creativeReports.filter(r=>r.panelId===id).length,17);assert.equal(done.creativeReports.filter(r=>r.panelId===fresh).length,17);
 assert.equal(creativeDecision(done.creativePanels.find(panel=>panel.packet.artifactId===f.artifactId),done.creativeReports).reasons.includes('obsolete_anonymous_protocol'),true);
 for(const call of f.calls.filter(c=>c.input.protocolVersion===COPY_CREATIVE_PROTOCOL))assert.ok(call.input.subjects.every(s=>JSON.stringify(Object.keys(s))===JSON.stringify(['id','slogan','supportingCopy'])));
 const historical=structuredClone(done);historical.creativePanels=historical.creativePanels.filter(p=>p.id===id||p.packet.artifactId!==a.id);historical.decisions.push({human:true,kind:'adopt-creative',artifactId:a.id,creativePanelId:id,policyVersion:packet.policyVersion,reviewIds:historical.reviews.map(r=>r.id)});
 assert.equal(releaseReadiness(historical,a.id).blockedReasons[0],'CREATIVE_PANEL_PROTOCOL_OBSOLETE');
 assert.equal(await f.executor.enqueueCreativePanel('p',request),id);assert.equal(f.store.read('p').creativePanels.filter(panel=>panel.packet.artifactId===f.artifactId).length,2);
});


test('typed correction consumes complete copy scoring, opposition and director with original receipts and complete public message',async t=>{
 const f=await createPanelFixture(t,{handler:(input)=>input.phase?panelFixtureOutput(input):input.correctionInput?{...stageDraft('copy'),summary:'按全部独立报告明确三方向边界',revisionResponses:input.correctionInput.sources.flatMap(s=>s.findings).map(f=>({findingKey:f.key,action:'applied',explanation:'保留肯定与限制并改善全稿',outputLocations:[{location:'/summary',quote:'明确三方向边界'}]}))}:stageDraft('copy')});
 await f.executor.enqueueCreativePanel('p',f.request());await runAll(f);assert.throws(()=>revisionPlan(f.store.read('p'),f.artifactId),{code:'NO_CORRECTION_REQUIRED'});
 f.send({kind:'submit-feedback',artifactId:f.artifactId,feedbackId:'copy-refinement',instructions:'进一步明确三方向表达边界，保留现有评审限定',themes:[],materials:[]});const p=f.store.read('p'),plan=revisionPlan(p,f.artifactId);
 assert.equal(plan.sources.length,18);assert.equal(plan.sources.filter(s=>s.kind==='creative_panel').every(s=>s.panelState.complete),true);assert.ok(plan.sources.some(s=>s.panelState?.phase==='director'));assert.ok(plan.sources.some(s=>s.panelState?.phase==='opposition'));
 const id=await f.executor.enqueueRevision('p',{artifactId:f.artifactId,commandId:'copy-correction',expectedRevision:p.revision});const job=await f.executor.execute('p',id);assert.equal(job.status,'succeeded',JSON.stringify(job.error));
 const a=f.store.read('p').artifacts.at(-1);assert.equal(a.copyContract.status,'complete');assert.equal(a.revision.sources.length,18);assert.equal(releaseReadiness(f.store.read('p'),a.id).blockedReasons[0],'CORRECTION_REVIEW_REQUIRED');assert.equal(f.store.read('p').creativeReports.filter(r=>r.artifactId===a.id).length,0);
});

test('partial creative panel remains explicit advisory source and never becomes a complete final panel',async t=>{
 const f=await createPanelFixture(t,{stage:'strategy'});await f.executor.enqueueCreativePanel('p',f.request());const jobs=f.executor.advanceCreativePanels('p');assert.equal((await f.executor.execute('p',jobs[0])).status,'succeeded');const p=f.store.read('p'),sources=revisionSources(p,f.artifactId),plan={sources};assert.throws(()=>revisionPlan(p,f.artifactId),{code:'NO_CORRECTION_REQUIRED'});
 assert.equal(plan.sources.length,1);assert.equal(plan.sources[0].kind,'creative_panel');assert.equal(plan.sources[0].panelState.complete,false);assert.equal(plan.sources[0].panelState.phase,'score_first_read');assert.notEqual(releaseReadiness(p,f.artifactId).eligible,true);
});
