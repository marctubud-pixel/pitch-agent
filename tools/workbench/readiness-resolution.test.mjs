import {diskReceipt} from './selected-stage-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir,hostname} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {openStore} from './store.mjs';
import {createExecutor} from './executor.mjs';
import {createServer} from './server.mjs';
import {buildResearchReadinessRequest} from './research-readiness.mjs';
import {applyCommand,validatedResearchAssessment,revisionSources,researchRevisionAuthority,releaseReadiness,readinessReplacementProposal} from './project.mjs';
import {loadSavedReadinessProof} from './readiness-evidence.mjs';
import {recoverInterruptedJobs} from './recovery.mjs';
const hash = text => createHash('sha256').update(text).digest('hex');
const source = {id: 's1', url: 'https://example.test/blue', text: 'Synthetic blue package.', scopeRelation: 'background', verification: 'captured'};
const production = {outputKind: 'research_findings', status: 'draft', title: 'Synthetic research', summary: 'Only a packaging excerpt.', sections: [{heading: 'Case', body: source.text, evidenceIds: ['s1']}], claims: [{text: 'Supplied excerpt describes a blue package.', kind: 'fact', evidenceRefs: ['s1'], limitations: ['Supplied excerpt only.']}], gaps: ['Missing audience research.'], evidenceClassifications: [{sourceId: 's1', scopeRelation: 'background', reason: 'A bounded example.'}]};
const bindings = {research: {providerId: 'author', model: 'synthetic', role: 'research-lead'}, readiness: {providerId: 'reviewer', model: 'synthetic', role: 'readiness-reviewer'}};
const receipt = (output, threadId) => ({requestedModel: 'synthetic', threadId, inputPacketHash: hash(threadId), exitCode: 0, parsedOutput: output});
function needsResearch(input) {
  const {packet, outputSchema} = buildResearchReadinessRequest(input);
  return {...Object.fromEntries(Object.entries(outputSchema.properties).filter(([, value]) => value.enum).map(([key, value]) => [key, value.enum[0]])), verdict: 'needs_research',
    coverage: packet.expectedCoverage.map(item => ({questionId: item.id, status: 'gap', rationale: 'One excerpt cannot establish coverage.', refs: [{location: '/taskCard/brief', quote: input.taskCard.brief}], downstreamImpact: 'Strategy remains unsupported.', researchNeeded: 'Research users and use cases.'})),
    sourceAssessments: [{sourceId: source.id, textHash: hash(source.text), use: 'usable_with_limits', relevance: 'Packaging example.', provenance: 'Supplied excerpt.', limitations: ['Not authenticated.'], refs: [{location: '/sourceRecords/0/text', quote: source.text}]}], findings: [], downstreamUse: {allowed: ['Plan further research.'], prohibited: ['Do not infer audience preference.']}, limitations: ['Synthetic fixture, no real research.']};
}

const human={actorId:'development-simulation-human',actorType:'human',runId:'simulation-human-run',contextId:'simulation-human-context'};
async function fixture(t,{saved=false,receiptOutcome={},initialVerdict='needs_research',remoteTimeout=false}={}){
 const root=await mkdtemp(join(tmpdir(),'readiness-resolution-test-')),db=join(root,'db');let store=openStore(db),calls=0,mode=remoteTimeout?'uncertain':'local_commit_failure',verdict=initialVerdict;
 const command=store.command.bind(store);assert.equal(Object.isFrozen(store),true);const commandStore={...store,command:(projectId,cmd,...args)=>{if(mode==='local_commit_failure'&&cmd.kind==='complete-readiness')throw Object.assign(new Error('Synthetic local commit failure after successful provider response'),{code:'SYNTHETIC_LOCAL_COMMIT_FAILURE'});return command(projectId,cmd,...args);}};
 const config={rootDir:root,bindings:{...bindings,readiness_alternate:{providerId:'alternate',model:'alternate-model',role:'readiness-reviewer'}},providers:{author:{model:'synthetic',execute:async request=>{const parsedOutput={...production,researchContractVersion:'research-data-v2',chartData:null,quantitativeClaims:[]},responseText=JSON.stringify(parsedOutput);return diskReceipt(root,request,{runId:request.runId,model:'synthetic',requestedModel:'synthetic',threadId:'author-thread',inputPacketHash:hash(JSON.stringify({runId:request.runId,model:'synthetic',prompt:request.prompt,outputSchema:request.outputSchema})),exitCode:0,responseText,parsedOutput,cost:null});}}}};
 const review=model=>({model,execute:async request=>{
  calls++;const job=store.read('p').jobs.find(j=>j.attempts.some(a=>a.id===request.runId)),input=job.task.readinessInput;
  const refs=[{location:'/content/sections/0/body',quote:source.text}];
  const output={...needsResearch(input),generationHash:request.packet.applicability.generationHash,obligationAssessments:request.packet.applicability.origins.map(o=>({originKey:o.key,preservation:{state:'retained',reason:'Original limitation retained.',refs},procurement:{kind:'required_now',state:'missing',material:'Audience evidence.',reason:'Present task still incomplete.',refs,decisionDependency:'Bounded strategy.'},requirementRefs:[{location:'/taskCard/brief',quote:input.taskCard.brief}],replacement:{originKeys:[],reason:'none',refs:[]},reason:'Synthetic test.'})),useScan:{contentHash:input.contentHash,assessedOriginKeys:[],findings:[]}};
  if(verdict==='ready'){output.verdict='ready';output.coverage=output.coverage.map(c=>({...c,status:'ready',researchNeeded:'none',refs:[{location:'/content/sections/0/body',quote:source.text}]}));}
  const raw=JSON.stringify(output),inputText=JSON.stringify({runId:request.runId,model,prompt:request.prompt,outputSchema:request.outputSchema});
  const folder=join(root,'provider',request.runId);await mkdir(folder,{recursive:true});const paths=Object.fromEntries(['input','receipt','stdout','output','schema'].map(k=>[k,join(folder,k+'.json')]));
  const disk={provider:'codex-cli',runId:request.runId,requestedModel:model,model,providerRequestId:'thread-'+request.runId,threadId:'thread-'+request.runId,inputPacketHash:hash(inputText),exitCode:mode==='uncertain'?null:0,signal:mode==='uncertain'?'SIGKILL':null,reason:mode==='uncertain'?'timeout':null,usage:null,cost:null,...receiptOutcome,paths};
  await writeFile(paths.schema,JSON.stringify(request.outputSchema));await writeFile(paths.input,inputText);await writeFile(paths.receipt,JSON.stringify(disk,null,2));await writeFile(paths.stdout,JSON.stringify({type:'thread.started',thread_id:disk.threadId})+'\n'+JSON.stringify({type:'turn.started'})+'\n');
  if(saved||mode==='success')await completeFiles(disk,raw);
  if(mode!=='uncertain'&&disk.exitCode===0&&['signal','reason','error'].every(k=>disk[k]==null))return {...disk,responseText:raw,parsedOutput:output};
  throw Object.assign(new Error('Synthetic uncertain call'),{code:'INVOCATION_UNCERTAIN',status:'awaiting_reconciliation',receipt:disk});
 }});
 config.providers.reviewer=review('synthetic');config.providers.alternate=review('alternate-model');
 store.create({id:'p',name:'Development simulation only',brief:'Research packaging users and use cases.',mode:'auto',humanGates:['research']},human);
 store.command('p',{kind:'confirm-task-card',taskCardId:'p:scope:1',commandId:'confirm',expectedRevision:0},human);
 let executor=createExecutor({store:commandStore,...config});const produced=await executor.execute('p',executor.enqueue('p','research',{sourceRecords:[source]}));assert.equal(produced.status,'succeeded');
 const artifact=store.read('p').artifacts[0],id=await executor.enqueueReadiness('p',artifact.id,{commandId:'original-request',expectedRevision:store.read('p').revision,protocolVersion:'research-readiness-v2'});assert.equal((await executor.execute('p',id)).status,'awaiting_reconciliation');
 t.after(async()=>{store.close();await rm(root,{recursive:true,force:true});});
 return {root,db,config,id,artifact,get store(){return store;},get executor(){return executor;},get calls(){return calls;},setMode(value){mode=value;},setVerdict(value){verdict=value;},reopen(){store.close();store=openStore(db);executor=createExecutor({store,...config});},origin(){return store.read('p').jobs.find(j=>j.id===id);},async request(action='recover-saved',proposal){const job=this.origin();return {action,jobId:id,attemptId:job.attempts[0].id,commandId:action+'-'+store.read('p').revision,expectedRevision:store.read('p').revision,...(proposal?{proposalId:proposal.proposalId,acknowledgement:true}:{})};},async proposal(model='synthetic'){return (await executor.readinessResolutionView('p',id,this.origin().attempts[0].id)).proposals.find(p=>p.binding.providerId==='reviewer'&&p.binding.model===model)|| (await executor.readinessResolutionView('p',id,this.origin().attempts[0].id)).proposals.find(p=>p.binding.model===model);},async saveLate(){const saved=this.origin().attempts[0].receipt;await completeFiles(saved,saved.responseText);}};
}
async function completeFiles(receipt,raw){await writeFile(receipt.paths.output,raw);await writeFile(receipt.paths.stdout,[{type:'thread.started',thread_id:receipt.threadId},{type:'turn.started'},{type:'item.completed',item:{id:'result',type:'agent_message',text:raw}},{type:'turn.completed',usage:{input_tokens:10,output_tokens:10}}].map(x=>JSON.stringify(x)).join('\n')+'\n');}

test('saved negative result preserves uncertain original and becomes correction evidence through every V2 reader',async t=>{
 const f=await fixture(t,{saved:true}),before=f.origin(),request=await f.request();
 const result=await f.executor.resolveReadiness('p',request);assert.equal(result.kind,'recovered');assert.deepEqual(f.origin(),before);assert.equal(f.calls,1);
 const p=f.store.read('p'),report=p.readinessReports[0],assessment=validatedResearchAssessment(p,f.artifact.id);
 assert.equal(assessment.rawReport.verdict,'needs_research');assert.equal(revisionSources(p,f.artifact.id)[0].reportId,report.id);assert.equal(researchRevisionAuthority(p,f.artifact.id).assessmentId,report.id);assert.equal(releaseReadiness(p,f.artifact.id).eligible,false);assert.equal(p.releases.length,0);assert.deepEqual(report.context,before.attempts[0].executor);assert.notEqual(p.readinessResolutions[0].recordedBy.runId,report.context.runId);assert.equal(report.executionReceipt.cost,null);
 assert.equal(hash(await readFile(report.payloadRef)),report.reportHash);assert.equal((await f.executor.resolveReadiness('p',request)).reportId,report.id);assert.equal(f.store.read('p').revision,p.revision);
 for(const alter of [p=>p.readinessReports[0].rawReport.limitations.push('tamper'),p=>p.readinessResolutions[0].proof.inputText+=' ',p=>p.readinessReports[0].context.actorId=f.artifact.author.actorId,p=>p.artifacts[0].executionReceipt.threadId=report.executionReceipt.threadId]){const copy=structuredClone(p);alter(copy);assert.throws(()=>validatedResearchAssessment(copy,f.artifact.id));assert.throws(()=>revisionSources(copy,f.artifact.id));}
});

test('start-only saved evidence stays unknown without an extra invocation and protocol/model bypass fails',async t=>{
 const f=await fixture(t,{remoteTimeout:true}),before=f.store.read('p');assert.equal((await f.executor.resolveReadiness('p',await f.request())).kind,'still_unknown');assert.deepEqual(f.store.read('p'),before);assert.equal(f.calls,1);
 for(const protocolVersion of [undefined,'research-readiness-v2']){const other=createExecutor({store:f.store,...f.config,bindings:{...f.config.bindings,readiness:f.config.bindings.readiness_alternate}});await assert.rejects(()=>other.enqueueReadiness('p',f.artifact.id,{commandId:'bypass-'+protocolVersion,expectedRevision:before.revision,...(protocolVersion?{protocolVersion}:{})}),{code:'READINESS_OUTCOME_UNKNOWN'});}
 const stale=await f.proposal();f.store.command('p',{kind:'adopt-creative',artifactId:f.artifact.id,reason:'Synthetic UI decision',commandId:'change',expectedRevision:before.revision},human);const req=await f.request('authorize-one-replacement',stale);await assert.rejects(()=>f.executor.resolveReadiness('p',req,human),{code:'STALE_READINESS_PROPOSAL'});assert.equal(f.calls,1);
});

for(const model of ['synthetic','alternate-model'])test(`one ${model} replacement grant is atomic, replayable and resumes queued after restart`,async t=>{
 const f=await fixture(t),original=f.origin(),proposal=await f.proposal(model),request=await f.request('authorize-one-replacement',proposal);
 await assert.rejects(()=>f.executor.resolveReadiness('p',request),{code:'HUMAN_REQUIRED'});
 const requests=[request,{...request,commandId:'concurrent-grant'}];if(model==='alternate-model')requests.reverse();
 const results=await Promise.allSettled(requests.map(value=>f.executor.resolveReadiness('p',value,human)));assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const winner=results.findIndex(r=>r.status==='fulfilled'),winningRequest=requests[winner],result=results[winner].value;assert.deepEqual((await f.executor.resolveReadiness('p',winningRequest,human)),result);assert.equal(f.store.read('p').jobs.filter(j=>j.readinessResolutionId).length,1);
 await assert.rejects(()=>f.executor.resolveReadiness('p',{...winningRequest,acknowledgement:false},human),{code:'COMMAND_ID_REUSED'});
 f.reopen();f.setMode('success');const runs=await Promise.allSettled([f.executor.execute('p',result.jobId),f.executor.execute('p',result.jobId)]);assert.equal(runs.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.calls,2);assert.deepEqual(f.origin(),original);
 const p=f.store.read('p'),replacement=p.jobs.find(j=>j.id===result.jobId);assert.equal(replacement.status,'succeeded',JSON.stringify(replacement.error));assert.equal(validatedResearchAssessment(p,f.artifact.id).rawReport.verdict,'needs_research');assert.equal(revisionSources(p,f.artifact.id).length,1);assert.equal(p.readinessResolutions.filter(r=>r.kind==='replacement-dispatch-claimed').length,1);
 await assert.rejects(()=>f.executor.execute('p',result.jobId,{retry:true}));assert.equal(f.calls,2);
});

test('claim then crash consumes permission even before dispatch and failed or blocked retry cannot replenish it',async t=>{
 for(const status of ['failed','blocked','awaiting_reconciliation']){
  const f=await fixture(t),req=await f.request('authorize-one-replacement',await f.proposal()),result=await f.executor.resolveReadiness('p',req,human),ctx={actorId:'crashed-worker',actorType:'agent',runId:'crashed-run',contextId:'crashed-context',executorHost:hostname(),executorPid:99999999};
  f.store.command('p',{kind:'start-job',jobId:result.jobId,attemptId:'claimed',commandId:'claim',expectedRevision:f.store.read('p').revision},ctx);
  if(status==='awaiting_reconciliation')recoverInterruptedJobs(f.store,{inspectProcess:()=> 'dead'});else f.store.command('p',{kind:'finish-job-error',jobId:result.jobId,attemptId:'claimed',status,error:{code:'SYNTHETIC_CRASH',message:'Development simulation only'},commandId:'crash',expectedRevision:f.store.read('p').revision},ctx);
  f.reopen();await assert.rejects(()=>f.executor.execute('p',result.jobId,{retry:true}));assert.equal(f.calls,1);assert.equal(f.store.read('p').readinessResolutions.filter(r=>r.kind==='replacement-dispatch-claimed').length,1);
 }
});

test('late original negative keeps both histories and invalidates replacement authority until a fresh assessment',async t=>{
 const f=await fixture(t),result=await f.executor.resolveReadiness('p',await f.request('authorize-one-replacement',await f.proposal()),human);f.setMode('success');assert.equal((await f.executor.execute('p',result.jobId)).status,'succeeded');await f.saveLate();await f.executor.resolveReadiness('p',await f.request());
 const p=f.store.read('p');assert.equal(p.readinessReports.length,2);assert.equal(revisionSources(p,f.artifact.id).length,2);assert.throws(()=>validatedResearchAssessment(p,f.artifact.id),{code:'RESEARCH_ASSESSMENT_REQUIRED'});assert.equal(releaseReadiness(p,f.artifact.id).eligible,false);
 const next=await f.executor.enqueueReadiness('p',f.artifact.id,{commandId:'fresh',expectedRevision:p.revision,protocolVersion:'research-readiness-v2'});assert.equal((await f.executor.execute('p',next)).status,'succeeded');assert.equal(validatedResearchAssessment(f.store.read('p'),f.artifact.id).id,f.store.read('p').readinessReports.at(-1).id);assert.equal(revisionSources(f.store.read('p'),f.artifact.id).length,3);assert.equal(f.store.read('p').releases.length,0);
});

test('recovery rejects changed registered packet, provider input, receipt, raw output, event identity and output hash',async t=>{
 for(const kind of ['input','packet','receipt','output','stdout','schema']){
  const f=await fixture(t,{saved:true}),origin=f.origin(),attempt=origin.attempts[0],path=kind==='packet'?join(f.root,attempt.id,'packet.json'):attempt.receipt.paths[kind];
  const text=await readFile(path,'utf8');await writeFile(path,['input','schema'].includes(kind)?text+' ':kind==='packet'?text.replace('"projectId": "p"','"projectId": "wrong"'):kind==='receipt'?text.replace('"cost": null','"cost": 0'):kind==='output'?text+' ':text.replace('thread-'+attempt.id,'wrong-thread'));
  await assert.rejects(()=>f.executor.resolveReadiness('p',awaitableRequest(f)));assert.equal(f.store.read('p').readinessReports.length,0);assert.deepEqual(f.origin(),origin);assert.equal(f.calls,1);
 }
});
function awaitableRequest(f){const p=f.store.read('p');return {action:'recover-saved',jobId:f.id,attemptId:f.origin().attempts[0].id,commandId:'recover',expectedRevision:p.revision};}


test('real loopback HTTP development simulation displays exact proposal, rejects injected authority and spends only one grant',async t=>{
 const f=await fixture(t);f.setMode('success');let server=createServer({dbPath:f.db,...f.config});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let base='http://127.0.0.1:'+server.address().port;
 t.after(async()=>{await server.drain();await new Promise(resolve=>server.close(resolve));});
 const route='/api/projects/p/readiness-resolutions',get=async()=>{const response=await fetch(base+route+'?jobId='+f.id+'&attemptId='+f.origin().attempts[0].id);assert.equal(response.status,200);return response.json();};
 const post=async body=>{const response=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};};
 const view=await get(),proposal=view.proposals.find(p=>p.binding.providerId==='reviewer'),request=await f.request('authorize-one-replacement',proposal);
 assert.equal(view.originalCost,null);assert.equal(view.originalOutcome,'unknown');assert.equal(view.providerLookup,'unsupported');assert.equal(proposal.additionalCalls,1);assert.deepEqual(proposal.readinessInput,f.origin().task.readinessInput);
 for(const [key,value] of Object.entries({rawReport:{verdict:'ready'},executionReceipt:{exitCode:0},evidencePath:'/tmp/forged',actorType:'human',actorId:'human',binding:{model:'forged'},readinessInput:{},success:true})){assert.equal((await post({...request,[key]:value})).status,400);}
 assert.equal((await post({...request,acknowledgement:false})).status,400);assert.equal((await post({...request,proposalId:'forged'})).status,422);assert.equal(f.calls,1);
 const pair=await Promise.all([post(request),post(request)]);assert.deepEqual(pair.map(r=>r.status),[200,200]);assert.equal(pair[0].body.resolution.jobId,pair[1].body.resolution.jobId);await server.drain();assert.equal(f.calls,2);
 const p=f.store.read('p');assert.equal(p.readinessResolutions.filter(r=>r.kind==='replacement-authorized').length,1);assert.equal(p.readinessResolutions.filter(r=>r.kind==='replacement-dispatch-claimed').length,1);assert.equal(p.releases.length,0);assert.equal(p.jobs.find(j=>j.readinessResolutionId).status,'succeeded');
 await new Promise(resolve=>server.close(resolve));server=createServer({dbPath:f.db,...f.config});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;
 assert.equal((await post(request)).status,200);await server.drain();assert.equal(f.calls,2);
 const html=await (await fetch(base+'/')).text();assert.match(html,/原调用可能仍完成并计费/);assert.match(html,/代理不得代为授权/);
});

test('evidence arriving after grant but before claim cancels dispatch without refund or authority release',async t=>{
 const f=await fixture(t),grant=await f.executor.resolveReadiness('p',await f.request('authorize-one-replacement',await f.proposal()),human);await f.saveLate();await f.executor.resolveReadiness('p',await f.request());
 const job=await f.executor.execute('p',grant.jobId);assert.equal(job.status,'blocked');assert.equal(job.error.code,'READINESS_RESULT_RECOVERED');assert.equal(f.calls,1);await assert.rejects(()=>f.executor.execute('p',grant.jobId,{retry:true}),{code:'READINESS_CALL_LIMIT'});assert.equal(f.store.read('p').releases.length,0);
});


test('pure recovery command refuses forged IDs, canonical schema, response hash and creator ancestry atomically',async t=>{
 const f=await fixture(t,{saved:true}),before=f.store.read('p'),original=f.origin(),attempt=original.attempts[0],proof=await loadSavedReadinessProof(f.root,'p',original,attempt);
 const command={kind:'recover-readiness',jobId:f.id,attemptId:attempt.id,resolutionId:'r',reportId:'report',payloadRef:join(f.root,'report.json'),proof,request:await f.request(),commandId:'domain-proof',expectedRevision:before.revision},resolver={actorType:'agent',actorId:'resolver',runId:'resolver-run',contextId:'resolver-context'};
 for(const mutate of [c=>c.attemptId='wrong',c=>c.jobId='wrong',c=>c.proof.schemaText+=' ',c=>c.proof.rawResponseHash='0'.repeat(64),c=>c.proof.normalizedReportHash='0'.repeat(64),c=>c.proof.packetText=c.proof.packetText.replace(attempt.id,'wrong'),c=>c.proof.stdoutText=c.proof.stdoutText.replace('turn.completed','turn.failed')]){const c=structuredClone(command);mutate(c);assert.throws(()=>applyCommand(before,c,resolver));assert.equal(before.readinessReports.length,0);}
 const inherited=structuredClone(before);inherited.jobs.find(j=>j.id===f.id).attempts[0].executor.ancestorActorIds=[f.artifact.author.actorId];assert.throws(()=>applyCommand(inherited,command,resolver),{code:'SELF_REVIEW'});
});


test('late original negative while a positive replacement is running preserves both reports without latest-positive authority',async t=>{
 const f=await fixture(t),grant=await f.executor.resolveReadiness('p',await f.request('authorize-one-replacement',await f.proposal()),human);f.setMode('success');f.setVerdict('ready');
 let release,started;const waiting=new Promise(resolve=>{release=resolve;}),entered=new Promise(resolve=>{started=resolve;}),originalExecute=f.config.providers.reviewer.execute;
 f.config.providers.reviewer.execute=async request=>{const result=await originalExecute(request);started();await waiting;return result;};
 const run=f.executor.execute('p',grant.jobId);await entered;await f.saveLate();await f.executor.resolveReadiness('p',await f.request());release();const completed=await run;assert.equal(completed.status,'succeeded',JSON.stringify(completed.error));
 const p=f.store.read('p');assert.deepEqual(p.readinessReports.map(r=>r.verdict),['needs_research','ready']);assert.equal(revisionSources(p,f.artifact.id).length,2);assert.throws(()=>validatedResearchAssessment(p,f.artifact.id),{code:'RESEARCH_ASSESSMENT_REQUIRED'});assert.equal(releaseReadiness(p,f.artifact.id).eligible,false);assert.equal(p.releases.length,0);
});

test('saved result after scope changes remains historical with no current authority',async t=>{
 const f=await fixture(t,{saved:true});f.store.command('p',{kind:'revise-task-card',taskCardId:'new-scope',brief:'Changed research task.',commandId:'change-scope',expectedRevision:f.store.read('p').revision},human);
 assert.equal((await f.executor.resolveReadiness('p',await f.request())).kind,'recovered');const p=f.store.read('p');assert.equal(revisionSources(p,f.artifact.id).length,1);assert.throws(()=>validatedResearchAssessment(p,f.artifact.id),{code:'RESEARCH_ASSESSMENT_REQUIRED'});assert.equal(p.releases.length,0);
});

const unsuccessfulOutcomes=[
 ['timeout',{exitCode:null,signal:'SIGKILL',reason:'timeout'}],
 ['nonzero exit',{exitCode:1,signal:null,reason:null}],
 ['signal despite zero exit',{exitCode:0,signal:'SIGTERM',reason:null}],
 ['reason despite zero exit',{exitCode:0,signal:null,reason:'aborted'}],
 ['error despite zero exit',{exitCode:0,signal:null,reason:null,error:'provider failure'}],
];
for(const initialVerdict of ['needs_research','ready']){
 for(const [name,receiptOutcome] of unsuccessfulOutcomes)test(`saved ${initialVerdict} with ${name} cannot gain authority from completed events`,async t=>{
  const f=await fixture(t,{saved:true,initialVerdict,receiptOutcome}),before=f.store.read('p');
  assert.equal((await f.executor.resolveReadiness('p',await f.request())).kind,'still_unknown');
  assert.deepEqual(f.store.read('p'),before);assert.equal(f.calls,1);assert.equal(before.readinessReports.length,0);
  assert.throws(()=>validatedResearchAssessment(before,f.artifact.id),{code:'RESEARCH_ASSESSMENT_REQUIRED'});
  assert.deepEqual(revisionSources(before,f.artifact.id),[]);assert.throws(()=>researchRevisionAuthority(before,f.artifact.id));assert.equal(releaseReadiness(before,f.artifact.id).eligible,false);assert.equal(before.releases.length,0);
  assert.equal((await f.executor.readinessResolutionView('p',f.id,f.origin().attempts[0].id)).savedEvidence,'still_unknown');
 });
 test(`successful provider ${initialVerdict} with local commit failure recovers without changing original outcome`,async t=>{
  const f=await fixture(t,{saved:true,initialVerdict}),before=f.origin(),attempt=before.attempts[0];
  assert.equal(before.status,'awaiting_reconciliation');assert.equal(before.error.code,'SYNTHETIC_LOCAL_COMMIT_FAILURE');
  assert.equal(attempt.receipt.exitCode,0);assert.equal(attempt.receipt.providerExecution.exitCode,0);
  assert.equal((await f.executor.resolveReadiness('p',await f.request())).kind,'recovered');
  assert.deepEqual(f.origin(),before);assert.equal(f.calls,1);
  const p=f.store.read('p');assert.equal(validatedResearchAssessment(p,f.artifact.id).rawReport.verdict,initialVerdict);assert.equal(revisionSources(p,f.artifact.id).length,1);assert.equal(p.releases.length,0);
 });
}

test('recomputed proof hashes cannot promote failed retained or provider receipt views through the domain or readers',async t=>{
 const f=await fixture(t,{saved:true}),before=f.store.read('p'),origin=f.origin(),attempt=origin.attempts[0],proof=await loadSavedReadinessProof(f.root,'p',origin,attempt);
 const request=await f.request(),resolver={actorType:'agent',actorId:'resolver',runId:'resolver-run',contextId:'resolver-context'};
 const command={kind:'recover-readiness',jobId:f.id,attemptId:attempt.id,resolutionId:'r',reportId:'report',payloadRef:join(f.root,'report.json'),proof,request,commandId:request.commandId,expectedRevision:before.revision};
 await f.executor.resolveReadiness('p',request);const recovered=f.store.read('p');
 for(const view of ['retained','provider','both'])for(const [,outcome] of unsuccessfulOutcomes){
  function change(p,savedProof){const receipt=p.jobs.find(j=>j.id===f.id).attempts[0].receipt;
   if(view!=='provider')Object.assign(receipt,outcome);if(view!=='retained')Object.assign(receipt.providerExecution,outcome);
   savedProof.originalReceiptHash=hash(JSON.stringify(receipt));const {responseText,parsedOutput,schemaValidated,...disk}=receipt.providerExecution;savedProof.receiptText=JSON.stringify(disk,null,2);
   if(p.readinessReports.length){p.readinessReports[0].executionReceipt=structuredClone(receipt);p.readinessResolutions[0].proofHash=hash(JSON.stringify(savedProof));}
  }
  const p=structuredClone(before),c=structuredClone(command);change(p,c.proof);assert.throws(()=>applyCommand(p,c,resolver),{code:'INVALID_READINESS_EVIDENCE'});assert.equal(p.readinessReports.length,0);
  const consumer=structuredClone(recovered);change(consumer,consumer.readinessResolutions[0].proof);assert.throws(()=>validatedResearchAssessment(consumer,f.artifact.id),{code:'INVALID_READINESS_EVIDENCE'});assert.throws(()=>revisionSources(consumer,f.artifact.id),{code:'INVALID_READINESS_EVIDENCE'});assert.throws(()=>researchRevisionAuthority(consumer,f.artifact.id));assert.equal(releaseReadiness(consumer,f.artifact.id).eligible,false);
 }
 assert.deepEqual(f.origin(),origin);assert.equal(f.calls,1);
});

test('completed output cannot drift from retained successful original response or parsed provider output',async t=>{
 const f=await fixture(t,{saved:true}),origin=f.origin(),attempt=origin.attempts[0],raw=JSON.parse(attempt.receipt.responseText);raw.limitations.push('Altered saved judgment.');await completeFiles(attempt.receipt,JSON.stringify(raw));
 await assert.rejects(()=>f.executor.resolveReadiness('p',awaitableRequest(f)),{code:'INVALID_READINESS_EVIDENCE'});assert.equal(f.store.read('p').readinessReports.length,0);assert.deepEqual(f.origin(),origin);assert.equal(f.calls,1);
 await completeFiles(attempt.receipt,attempt.receipt.responseText);
 const before=f.store.read('p'),proof=await loadSavedReadinessProof(f.root,'p',origin,attempt),receipt=before.jobs.find(j=>j.id===f.id).attempts[0].receipt;
 receipt.parsedOutput=raw;receipt.providerExecution.parsedOutput=structuredClone(raw);proof.originalReceiptHash=hash(JSON.stringify(receipt));
 assert.throws(()=>applyCommand(before,{kind:'recover-readiness',jobId:f.id,attemptId:attempt.id,resolutionId:'r',reportId:'report',payloadRef:join(f.root,'report.json'),proof,request:awaitableRequest(f),commandId:'parsed-drift',expectedRevision:before.revision},{actorType:'agent',actorId:'resolver',runId:'resolver-run',contextId:'resolver-context'}),{code:'INVALID_READINESS_EVIDENCE'});
 assert.equal(f.store.read('p').readinessReports.length,0);
});

test('failed disk receipts cannot override successful retained receipt views',async t=>{
 for(const [,outcome] of unsuccessfulOutcomes){
  const f=await fixture(t,{saved:true}),before=f.store.read('p'),path=f.origin().attempts[0].receipt.paths.receipt,disk=JSON.parse(await readFile(path,'utf8'));
  await writeFile(path,JSON.stringify({...disk,...outcome},null,2));
  await assert.rejects(()=>f.executor.resolveReadiness('p',awaitableRequest(f)),{code:'INVALID_READINESS_EVIDENCE'});assert.deepEqual(f.store.read('p'),before);assert.equal(f.calls,1);
 }
});
