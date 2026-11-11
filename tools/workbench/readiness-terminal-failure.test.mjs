import {loadTerminalFailureWitness,validateTerminalFailureWitness,trustedTerminalFailureWitness} from './readiness-terminal-failure.mjs';
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
 const root=await mkdtemp(join(tmpdir(),'readiness-resolution-test-')),db=join(root,'db');let store=openStore(db),calls=0,mode='terminal',verdict=initialVerdict;
 const command=store.command.bind(store);assert.equal(Object.isFrozen(store),true);const commandStore={...store,command:(projectId,cmd,...args)=>{if(mode==='local_commit_failure'&&cmd.kind==='complete-readiness')throw Object.assign(new Error('Synthetic local commit failure after successful provider response'),{code:'SYNTHETIC_LOCAL_COMMIT_FAILURE'});return command(projectId,cmd,...args);}};
 const config={rootDir:root,bindings:{...bindings,readiness_alternate:{providerId:'alternate',model:'alternate-model',role:'readiness-reviewer'}},providers:{author:{model:'synthetic',execute:async request=>{const parsedOutput={...production,researchContractVersion:'research-data-v2',chartData:null,quantitativeClaims:[]},responseText=JSON.stringify(parsedOutput);return diskReceipt(root,request,{runId:request.runId,model:'synthetic',requestedModel:'synthetic',threadId:'author-thread',inputPacketHash:hash(JSON.stringify({runId:request.runId,model:'synthetic',prompt:request.prompt,outputSchema:request.outputSchema})),exitCode:0,responseText,parsedOutput,cost:null});}}}};
 const review=model=>({model,reasoningEffort:undefined,execute:async request=>{
  calls++;const job=store.read('p').jobs.find(j=>j.attempts.some(a=>a.id===request.runId)),input=job.task.readinessInput;
  const refs=[{location:'/content/sections/0/body',quote:source.text}];
  const output={...needsResearch(input),generationHash:request.packet.applicability.generationHash,obligationAssessments:request.packet.applicability.origins.map(o=>({originKey:o.key,preservation:{state:'retained',reason:'Original limitation retained.',refs},procurement:{kind:'required_now',state:'missing',material:'Audience evidence.',reason:'Present task still incomplete.',refs,decisionDependency:'Bounded strategy.'},requirementRefs:[{location:'/taskCard/brief',quote:input.taskCard.brief}],replacement:{originKeys:[],reason:'none',refs:[]},reason:'Synthetic test.'})),useScan:{contentHash:input.contentHash,assessedOriginKeys:[],findings:[]}};
  if(verdict==='ready'){output.verdict='ready';output.coverage=output.coverage.map(c=>({...c,status:'ready',researchNeeded:'none',refs:[{location:'/content/sections/0/body',quote:source.text}]}));}
  const raw=JSON.stringify(output),inputText=JSON.stringify({runId:request.runId,model,prompt:request.prompt,outputSchema:request.outputSchema});
  const folder=join(root,'provider',request.runId);await mkdir(folder,{recursive:true});const paths=Object.fromEntries(['input','receipt','stdout','output','schema'].map(k=>[k,join(folder,k+'.json')]));
  const disk={provider:'codex-cli',runId:request.runId,requestedModel:model,model,providerRequestId:'thread-'+request.runId,threadId:'thread-'+request.runId,inputPacketHash:hash(inputText),contextHash:hash(inputText),...(config.providers.reviewer?.reasoningEffort?{requestedReasoningEffort:config.providers.reviewer.reasoningEffort}:{}),exitCode:mode==='terminal'?1:mode==='uncertain'?null:0,signal:mode==='uncertain'?'SIGKILL':null,reason:mode==='uncertain'?'timeout':null,usage:null,cost:null,...receiptOutcome,paths};
  if(config.omitReasoningProfile)delete disk.requestedReasoningEffort;
  await writeFile(paths.schema,JSON.stringify(request.outputSchema));await writeFile(paths.input,inputText);await writeFile(paths.receipt,JSON.stringify(disk,null,2));await writeFile(paths.stdout,JSON.stringify({type:'thread.started',thread_id:disk.threadId})+'\n'+JSON.stringify({type:'turn.started'})+'\n');
  if(mode==='terminal')await writeFile(paths.stdout,[{type:'thread.started',thread_id:disk.threadId},{type:'turn.started'},{type:'error',message:'Incomplete response returned, reason: max_output_tokens'},{type:'turn.failed',error:{message:'Incomplete response returned, reason: max_output_tokens'}}].map(x=>JSON.stringify(x)).join('\n')+'\n');
  if(saved||mode==='success')await completeFiles(disk,raw);
  if(config.testOnReview)await config.testOnReview();
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


async function observe(f){const j=f.origin();return f.executor.observeReadinessTerminalFailure('p',{jobId:j.id,attemptId:j.attempts[0].id,commandId:'local-observation',expectedRevision:f.store.read('p').revision});}
async function diagnostic(f,id){return f.executor.enqueueReadinessDiagnostic('p',id,{commandId:'diagnostic-request',expectedRevision:f.store.read('p').revision});}
test('strict local terminal observation preserves original and only explicit diagnostic makes one job',async t=>{
 const f=await fixture(t),original=structuredClone(f.origin()),count=f.calls;
 const result=await observe(f);assert.equal(result.additionalCalls,0);assert.equal(f.calls,count);assert.deepEqual(f.origin(),original);assert.equal(f.store.read('p').readinessReports.length,0);
 assert.deepEqual(await observe(f),result);assert.equal(f.store.read('p').readinessResolutions.length,1);
 await assert.rejects(()=>diagnostic(f,result.resolutionId),{code:'DIAGNOSTIC_MITIGATION_REQUIRED'});
 f.config.providers.reviewer.reasoningEffort='low';const id=await diagnostic(f,result.resolutionId);assert.equal(f.calls,count);assert.equal(await diagnostic(f,result.resolutionId),id);
 f.reopen();assert.equal(await diagnostic(f,result.resolutionId),id);assert.deepEqual(f.origin(),original);
 const j=f.store.read('p').jobs.find(j=>j.id===id);assert.equal(j.status,'queued');assert.deepEqual(j.task.readinessInput,original.task.readinessInput);
 await assert.rejects(()=>f.executor.enqueueReadiness('p',f.artifact.id,{commandId:'generic-bypass'}),{code:'READINESS_OUTCOME_UNKNOWN'});
 f.setMode('success');const done=await f.executor.execute('p',id);assert.equal(done.status,'succeeded');assert.equal(f.calls,count+1);
 assert.equal(validatedResearchAssessment(f.store.read('p'),f.artifact.id).rawReport.verdict,'needs_research');assert.deepEqual(f.origin(),original);
 await assert.rejects(()=>f.executor.execute('p',id));assert.equal(f.calls,count+1);
});
test('a diagnostic failure cannot grant another diagnostic and unknowns keep their original human guard',async t=>{
 const f=await fixture(t),observed=await observe(f);f.config.providers.reviewer.reasoningEffort='low';const id=await diagnostic(f,observed.resolutionId);
 assert.equal((await f.executor.execute('p',id)).status,'awaiting_reconciliation');const j=f.store.read('p').jobs.find(j=>j.id===id),count=f.calls;
 await assert.rejects(()=>f.executor.observeReadinessTerminalFailure('p',{jobId:id,attemptId:j.attempts[0].id,commandId:'recursive',expectedRevision:f.store.read('p').revision}),{code:'INVALID_READINESS_TERMINAL_FAILURE'});
 assert.equal(await diagnostic(f,observed.resolutionId),id);assert.equal(f.calls,count);
 const reused=await f.executor.enqueueReadiness('p',f.artifact.id,{commandId:'generic-new',expectedRevision:f.store.read('p').revision,protocolVersion:'research-readiness-v2'});assert.equal(reused,f.id);assert.equal(f.calls,count);
 await assert.rejects(()=>f.executor.enqueueReadiness('p',f.artifact.id,{commandId:'generic-legacy',expectedRevision:f.store.read('p').revision}),{code:'READINESS_OUTCOME_UNKNOWN'});
 assert.throws(()=>readinessReplacementProposal(f.store.read('p'),f.id,f.origin().attempts[0].id,bindings.readiness),{code:'READINESS_RESOLUTION_EXISTS'});
});
test('loader-issued witnesses are immutable and cannot be forged by JSON or rebound',async t=>{
 const f=await fixture(t),j=f.origin(),a=j.attempts[0],w=await loadTerminalFailureWitness(f.root,'p',j,a);
 assert.equal(trustedTerminalFailureWitness(w),true);assert.equal(Object.isFrozen(w),true);assert.equal(Object.isFrozen(w.binding),true);
 assert.throws(()=>{w.jobId='other'});assert.throws(()=>{w.binding.model='other'});
 const clone=structuredClone(w);assert.equal(trustedTerminalFailureWitness(clone),false);
 assert.throws(()=>f.store.command('p',{kind:'observe-readiness-terminal-failure',jobId:j.id,attemptId:a.id,failureWitness:clone,commandId:'forged',expectedRevision:f.store.read('p').revision},{actorType:'agent'}),{code:'INVALID_READINESS_TERMINAL_FAILURE'});
 for(const alter of [w=>w.jobId='other',w=>w.inputHash='0'.repeat(64),w=>w.receiptHash='0'.repeat(64),w=>w.binding.role='other',w=>w.stdoutText+='{}\n']){const x=structuredClone(w);alter(x);assert.throws(()=>validateTerminalFailureWitness('p',j,a,x));}
});
for(const mutation of ['output','extra-event','completed','signal','timeout','exit-zero','thread','no-failure','wrong-message','receipt','input','schema','packet','symlink'])test(`terminal failure rejects ambiguous or changed originals: ${mutation}`,async t=>{
 const f=await fixture(t),j=f.origin(),a=structuredClone(j.attempts[0]),receipt=a.receipt,path=receipt.paths;
 if(mutation==='output')await writeFile(path.output,'');
 if(mutation==='extra-event')await writeFile(path.stdout,(await readFile(path.stdout,'utf8'))+'{}\n');
 if(mutation==='completed')await writeFile(path.stdout,(await readFile(path.stdout,'utf8'))+JSON.stringify({type:'turn.completed'})+'\n');
 if(mutation==='signal')receipt.signal='SIGKILL';
 if(mutation==='timeout')receipt.reason='timeout';
 if(mutation==='exit-zero')receipt.exitCode=0;
 if(mutation==='thread')await writeFile(path.stdout,(await readFile(path.stdout,'utf8')).replace(receipt.threadId,'other-thread'));
 if(mutation==='no-failure')await writeFile(path.stdout,(await readFile(path.stdout,'utf8')).split('\n').slice(0,2).join('\n'));
 if(mutation==='wrong-message')await writeFile(path.stdout,(await readFile(path.stdout,'utf8')).replaceAll('max_output_tokens','network_error'));
 if(['receipt','input','schema'].includes(mutation))await writeFile(path[mutation],'{}');
 if(mutation==='packet')await writeFile(join(f.root,a.id,'packet.json'),'{}');
 if(mutation==='symlink'){const {symlink}=await import('node:fs/promises');const original=await readFile(path.stdout);await rm(path.stdout);const other=join(f.root,'other-file');await writeFile(other,original);await symlink(other,path.stdout);}
 await assert.rejects(()=>loadTerminalFailureWitness(f.root,'p',j,a));assert.equal(f.calls,1);assert.equal(f.store.read('p').readinessResolutions.length,0);
});
test('originals changing after enqueue block before dispatch without spending a call',async t=>{
 const f=await fixture(t),r=await observe(f);f.config.providers.reviewer.reasoningEffort='low';const id=await diagnostic(f,r.resolutionId);await writeFile(f.origin().attempts[0].receipt.paths.stdout,'changed');
 await assert.rejects(()=>f.executor.execute('p',id));assert.equal(f.calls,1);
});

test('store admission rejects cached immutable witness when current originals change',async t=>{
 const f=await fixture(t),j=f.origin(),a=j.attempts[0],w=await loadTerminalFailureWitness(f.root,'p',j,a);
 await writeFile(a.receipt.paths.stdout,'changed');assert.equal(trustedTerminalFailureWitness(w),false);
 assert.throws(()=>f.store.command('p',{kind:'observe-readiness-terminal-failure',jobId:j.id,attemptId:a.id,failureWitness:w,commandId:'cached',expectedRevision:f.store.read('p').revision},{actorType:'agent'}),{code:'INVALID_READINESS_TERMINAL_FAILURE'});
 assert.equal(f.store.read('p').readinessResolutions.length,0);
});
for(const variant of ['changed-original','missing-profile'])test(`a returned diagnostic cannot commit a judgment with ${variant}`,async t=>{
 const f=await fixture(t),r=await observe(f);f.config.providers.reviewer.reasoningEffort='low';const id=await diagnostic(f,r.resolutionId);f.setMode('success');
 if(variant==='changed-original')f.config.testOnReview=()=>writeFile(f.origin().attempts[0].receipt.paths.stdout,'changed');
 else f.config.omitReasoningProfile=true;
 const done=await f.executor.execute('p',id);assert.equal(done.status,'awaiting_reconciliation');assert.equal(f.calls,2);assert.equal(f.store.read('p').readinessReports.length,0);
 assert.equal(done.error.code,variant==='missing-profile'?'DIAGNOSTIC_MITIGATION_REQUIRED':'INVALID_READINESS_TERMINAL_FAILURE');
});
