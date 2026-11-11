import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {openStore} from './store.mjs';
import {createExecutor} from './executor.mjs';
import {applyCommand,researchWorkflowView,usesResearchOperatorWorkflow} from './project.mjs';
import {buildResearchHandoffRequest,validateResearchHandoffOutput} from './research-handoff.mjs';
import {syntheticResearch,acceptedOperatorResearch,declarationRequest,releaseRequest,continuationRequest,human,bindings,providerSet,output} from './research-operator-fixture.mjs';

async function fixture(t,options){const f=await syntheticResearch(options);t.after(f.close);return f;}
const agent={actorType:'agent',actorId:'synthetic-agent',runId:'new-run',contextId:'new-context'};

test('declarations preserve every field and queue atomic separate owner work, explicit release never queues strategy',async t=>{
  const f=await fixture(t),request=declarationRequest(f,'research_owner',{unresolvedIssues:['Synthetic caveat to classify.'],note:'  Exact operator note\nsecond line.  '});
  const calls=f.calls.length,receipt=await f.executor.recordResearchHandoff('p',request,human),p=f.store.read('p');
  assert.equal(f.calls.length,calls);assert.equal(p.handoffReports.length,0);assert.equal(p.releases.length,0);assert.deepEqual(Object.fromEntries(Object.keys(request.input).map(k=>[k,p.researchHandoffDeclarations[0][k]])),request.input);
  assert.equal(p.jobs.at(-1).id,receipt.jobId);assert.equal(p.jobs.at(-1).purpose,'handoff');assert.equal(p.jobs.at(-1).task.handoffInput.handoffProtocolVersion,'research-handoff-v3');
  assert.deepEqual(f.executor.researchWorkflow('p').checks.map(c=>c.id),['verification','readiness','delivery','acceptance','release']);
  assert.equal(f.executor.researchWorkflow('p').checks.find(c=>c.id==='delivery').passed,false);
  assert.throws(()=>f.executor.enqueue('p','strategy'));
  assert.equal((await f.executor.execute('p',receipt.jobId)).status,'succeeded');
  const consumer=await f.executor.recordResearchHandoff('p',declarationRequest(f,'strategy_owner',{decision:'accepted_with_conditions',unresolvedIssues:request.input.unresolvedIssues}),human);
  assert.equal((await f.executor.execute('p',consumer.jobId)).status,'succeeded');
  const before=f.calls.length,release=await f.executor.releaseResearch('p',releaseRequest(f),human);
  assert.equal(f.calls.length,before);assert.equal(f.store.read('p').jobs.filter(j=>j.stage==='strategy').length,0);
  assert.equal(f.store.read('p').releases[0].id,release.releaseId);assert.equal(f.store.read('p').releases[0].actorType,'human');
  assert.equal(f.executor.researchWorkflow('p').eligible,true);assert.throws(()=>f.executor.enqueue('p','strategy'),{code:'RESEARCH_CONTINUATION_REQUIRED'});
});

test('declaration receipt replay precedes revisions and survives reopening, changed body is rejected',async t=>{
  const f=await fixture(t),request=declarationRequest(f),first=await f.executor.recordResearchHandoff('p',request,human);
  await f.executor.execute('p',first.jobId);const revision=f.store.read('p').revision,calls=f.calls.length;
  const reopened=openStore(join(f.root,'db'));try{
    const executor=createExecutor({store:reopened,rootDir:f.root,bindings,providers:f.providers,imageProvider:null});
    const replay=await executor.recordResearchHandoff('p',request,human);assert.equal(replay.handoffId,first.handoffId);assert.equal(replay.jobId,first.jobId);assert.equal(replay.replayed,true);assert.equal(reopened.read('p').revision,revision);assert.equal(f.calls.length,calls);
    await assert.rejects(()=>executor.recordResearchHandoff('p',{...request,input:{...request.input,note:'different'}},human),{code:'COMMAND_ID_REUSED'});
  }finally{reopened.close();}
});

test('release and continuation replay converge and preserve both human and model restrictions in strategy',async t=>{
  const f=await acceptedOperatorResearch(await fixture(t)),releaseInput=releaseRequest(f),release=await f.executor.releaseResearch('p',releaseInput,human),request=continuationRequest(f),id=f.executor.continueResearch('p',request);
  assert.equal(f.executor.researchWorkflow('p').alreadyContinued,true);assert.equal(f.store.read('p').jobs.find(j=>j.id===id).status,'queued');
  assert.equal(f.executor.continueResearch('p',request),id);assert.equal(f.executor.continueResearch('p',{...continuationRequest(f),commandId:'another-command'}),id);
  assert.equal((await f.executor.releaseResearch('p',releaseInput,human)).releaseId,release.releaseId);
  await assert.rejects(()=>f.executor.releaseResearch('p',{...releaseInput,contentHash:'0'.repeat(64)},human),{code:'COMMAND_ID_REUSED'});
  assert.equal((await f.executor.execute('p',id)).status,'succeeded');
  const frozen=f.calls.at(-1).request.prompt;assert.ok(frozen.includes('No manufactured approval.'));assert.ok(frozen.includes('operatorHandoff'));
  const constraints=f.store.read('p').jobs.find(j=>j.id===id).task.upstreamReviewConstraints[f.artifact.id];assert.equal(constraints.operatorHandoff.declarations.length,2);assert.equal(constraints.handoffs.length,2);assert.equal(constraints.operatorHandoff.release.id,release.releaseId);
  assert.equal(f.store.read('p').jobs.filter(j=>j.stage==='strategy').length,1);
});

test('return is durable, does not dispatch, invalidates authority and new pair retains old history',async t=>{
  const f=await acceptedOperatorResearch(await fixture(t));await f.executor.releaseResearch('p',releaseRequest(f),human);const calls=f.calls.length;
  const request=declarationRequest(f,'strategy_owner',{decision:'returned',permittedUses:[],prohibitedInferences:['Stop downstream.'],unresolvedIssues:['Need another discussion.'],note:'Return this delivery.'});
  const returned=await f.executor.recordResearchHandoff('p',request,human);assert.equal(returned.jobId,null);assert.equal(f.calls.length,calls);
  assert.equal(f.executor.researchWorkflow('p').checks.find(c=>c.id==='release').passed,false);assert.throws(()=>f.executor.enqueue('p','strategy'));
  await acceptedOperatorResearch(f);assert.equal(f.store.read('p').researchHandoffDeclarations.length,5);assert.equal(f.store.read('p').handoffReports.length,4);assert.equal(f.executor.researchWorkflow('p').canRelease.allowed,true);
});

test('actual model blocker cannot be repaired by a new human declaration',async t=>{
  const f=await fixture(t,{transform:(receipt,request)=>{
    if(request.packet?.protocolVersion!=='research-handoff-v3')return receipt;
    const raw={...receipt.parsedOutput,decision:'blocked',unresolvedIssues:[{blocking:true,reason:'Synthetic substantive blocker.',refs:[{location:'/content/sections/0/body',quote:request.packet.content.sections[0].body}]}]};return {...receipt,parsedOutput:raw,responseText:JSON.stringify(raw)};
  }}),first=await f.executor.recordResearchHandoff('p',declarationRequest(f),human);
  assert.equal((await f.executor.execute('p',first.jobId)).status,'succeeded');assert.equal(f.store.read('p').handoffReports[0].decision,'blocked');
  await assert.rejects(()=>f.executor.recordResearchHandoff('p',declarationRequest(f),human));await assert.rejects(()=>f.executor.releaseResearch('p',releaseRequest(f),human));assert.throws(()=>f.executor.continueResearch('p',continuationRequest(f)));
});

test('v3 output binds exact declaration hash and never widens independent, producer or operator restrictions',async t=>{
  const f=await fixture(t),first=await f.executor.recordResearchHandoff('p',declarationRequest(f),human),input=f.store.read('p').jobs.find(j=>j.id===first.jobId).task.handoffInput,request=buildResearchHandoffRequest(input),raw=output(request);
  for(const change of [{declarationId:'other'},{declarationHash:'0'.repeat(64)},{permittedUses:['Invent consumer preferences.']},{prohibitedInferences:['No preference claim.']}])assert.throws(()=>validateResearchHandoffOutput({...raw,...change},input));
  assert.equal(validateResearchHandoffOutput(raw,input).decision,'accept');
  const altered=structuredClone(input);altered.operatorDeclaration.note+='mutated';assert.throws(()=>validateResearchHandoffOutput(raw,altered));
});

test('new workflow cannot be bypassed through direct domain release, generic enqueue, or stale dispatch and completion',async t=>{
  const f=await acceptedOperatorResearch(await fixture(t)),p=f.store.read('p');
  assert.throws(()=>applyCommand(p,{kind:'release-stage',artifactId:f.artifact.id,commandId:'bypass-release',expectedRevision:p.revision},agent),{code:'HUMAN_RESEARCH_RELEASE_REQUIRED'});
  assert.throws(()=>f.executor.enqueue('p','strategy'));
  await f.executor.releaseResearch('p',releaseRequest(f),human);const id=f.executor.continueResearch('p',continuationRequest(f)),before=f.calls.length;
  f.store.command('p',{kind:'set-policy',mode:'auto',humanGates:[],authorizedThrough:'research',commandId:'policy-change',expectedRevision:f.store.read('p').revision},human);
  assert.equal((await f.executor.execute('p',id)).status,'blocked');assert.equal(f.calls.length,before);assert.equal(f.store.read('p').releases.length,1);
});

test('crash between continuation intent and queue commit recovers one deterministic job and no extra release',async t=>{
  const f=await acceptedOperatorResearch(await fixture(t));await f.executor.releaseResearch('p',releaseRequest(f),human);const request=continuationRequest(f);
  const interrupted=createExecutor({store:{...f.store,command(id,c,ctx){if(c.kind==='request-stage')throw new Error('Synthetic queue interruption.');return f.store.command(id,c,ctx);}},rootDir:f.root,bindings,providers:f.providers,imageProvider:null});
  assert.throws(()=>interrupted.continueResearch('p',request),/Synthetic queue interruption/);assert.equal(f.store.read('p').researchContinuationIntents.length,1);assert.equal(f.store.read('p').jobs.filter(j=>j.stage==='strategy').length,0);
  const recovered=f.executor.recoverContinuations('p');assert.ok(recovered[0].jobId);assert.equal(f.executor.continueResearch('p',request),recovered[0].jobId);assert.equal(f.store.read('p').releases.length,1);assert.equal(f.store.read('p').jobs.filter(j=>j.stage==='strategy').length,1);
});

test('unknown owner outcome blocks replacement declarations, release, continuation and model invocation',async t=>{
  const f=await fixture(t,{transform:(receipt,request)=>request.packet?.protocolVersion==='research-handoff-v3'?{...receipt,inputPacketHash:'0'.repeat(64)}:receipt}),request=declarationRequest(f),first=await f.executor.recordResearchHandoff('p',request,human);
  assert.equal((await f.executor.execute('p',first.jobId)).status,'awaiting_reconciliation');const calls=f.calls.length;
  assert.equal((await f.executor.recordResearchHandoff('p',request,human)).jobId,first.jobId);
  await assert.rejects(()=>f.executor.recordResearchHandoff('p',declarationRequest(f),human),{code:'HANDOFF_PENDING'});assert.equal(f.executor.researchWorkflow('p').canDeliver.allowed,false);assert.equal(f.calls.length,calls);
});

test('changed source bytes prevent dispatch and do not rewrite operator history',async t=>{
  const f=await fixture(t),request=declarationRequest(f),first=await f.executor.recordResearchHandoff('p',request,human),before=f.calls.length;
  await writeFile(f.artifact.payloadRef,(await readFile(f.artifact.payloadRef,'utf8'))+'\n');
  assert.equal((await f.executor.execute('p',first.jobId)).status,'failed');assert.equal(f.calls.length,before);assert.equal(f.store.read('p').researchHandoffDeclarations[0].note,request.input.note);
});

test('operator workflow selection preserves automatic model owners and legacy selected human gates',async t=>{
  const f=await fixture(t);assert.equal(usesResearchOperatorWorkflow(f.store.read('p')),false);
  for(const side of ['producer','consumer'])assert.equal((await f.executor.execute('p',await f.executor.enqueueHandoff('p',f.artifact.id,side,{protocolVersion:'research-handoff-v2'}))).status,'succeeded');
  assert.equal(f.executor.researchWorkflow('p').authorizationPath,'model-owners');assert.equal(f.executor.researchWorkflow('p').checks.find(c=>c.id==='delivery').passed,true);
  assert.ok(f.executor.continueResearch('p',continuationRequest(f)));assert.equal((f.store.read('p').researchHandoffDeclarations??[]).length,0);assert.equal(f.store.read('p').releases[0].actorId,'proposal-director');
});

test('operator opt-in cannot be removed by changing policy and old releases never become explicit human approval',async t=>{
  const f=await fixture(t);await f.executor.recordResearchHandoff('p',declarationRequest(f),human);
  f.store.command('p',{kind:'set-policy',mode:'auto',humanGates:[],commandId:'switch-auto',expectedRevision:f.store.read('p').revision},human);
  assert.equal(usesResearchOperatorWorkflow(f.store.read('p')),true);assert.throws(()=>f.executor.continueResearch('p',continuationRequest(f)));assert.throws(()=>f.executor.enqueue('p','strategy'));
  const forged=structuredClone(f.store.read('p'));forged.releases.push({artifactId:f.artifact.id,policyVersion:forged.policies.at(-1).version,actorId:'proposal-director'});
  assert.equal(researchWorkflowView(forged,{bindings,providers:f.providers}).checks.find(c=>c.id==='release').passed,false);
});

test('queued strategy requires unchanged exact declarations, assessment, report set, policy and release',async t=>{
  const f=await acceptedOperatorResearch(await fixture(t));await f.executor.releaseResearch('p',releaseRequest(f),human);const id=f.executor.continueResearch('p',continuationRequest(f)),p=f.store.read('p');
  const mutations=[
    x=>x.taskCards.find(c=>c.id===x.activeTaskCardId).brief+=' New scope.',
    x=>x.artifacts.find(a=>a.id===f.artifact.id).technicalReceipts.sourceCatalogue.records[0].text+=' changed',
    x=>x.readinessReports[0].rawReport.limitations.push('changed'),
    x=>x.handoffReports[0].rawReport.prohibitedInferences.push('changed'),
    x=>x.policies.at(-1).version++,
    x=>x.researchHandoffDeclarations[0].note+=' changed',
    x=>x.releases[0].consumerDeclarationId='other',
  ];
  for(const mutate of mutations){const changed=structuredClone(p);mutate(changed);assert.throws(()=>applyCommand(changed,{kind:'start-job',jobId:id,attemptId:'fresh-attempt',commandId:'start-stale',expectedRevision:changed.revision},agent));assert.equal(researchWorkflowView(changed,{bindings,providers:f.providers}).eligible,false);}
});

test('selected human gate permits the new explicit release without fabricating adoption or provider execution',async t=>{
  const f=await acceptedOperatorResearch(await fixture(t,{humanGates:['research']})),calls=f.calls.length;
  assert.equal(f.store.read('p').decisions.length,0);await f.executor.releaseResearch('p',releaseRequest(f),human);
  assert.equal(f.store.read('p').decisions.length,0);assert.equal(f.calls.length,calls);assert.ok(f.executor.continueResearch('p',continuationRequest(f)));
});

test('consumer conditions require conditional declaration and preserve producer concerns',async t=>{
  const f=await fixture(t),first=await f.executor.recordResearchHandoff('p',declarationRequest(f,'research_owner',{unresolvedIssues:['Synthetic disclosed uncertainty.']}),human);
  assert.equal((await f.executor.execute('p',first.jobId)).status,'succeeded');
  await assert.rejects(()=>f.executor.recordResearchHandoff('p',declarationRequest(f,'strategy_owner'),human),{code:'CONDITIONAL_ACCEPTANCE_REQUIRED'});
  const request=declarationRequest(f,'strategy_owner',{decision:'accepted_with_conditions',unresolvedIssues:['Synthetic disclosed uncertainty.']}),consumer=await f.executor.recordResearchHandoff('p',request,human);
  assert.equal((await f.executor.execute('p',consumer.jobId)).status,'succeeded');
});

test('release rejects changed saved research bytes and a bound owner result cannot publish after mid-call drift',async t=>{
  const f=await acceptedOperatorResearch(await fixture(t)),original=await readFile(f.artifact.payloadRef,'utf8');
  await writeFile(f.artifact.payloadRef,original+'\n');await assert.rejects(()=>f.executor.releaseResearch('p',releaseRequest(f),human));assert.equal(f.store.read('p').releases.length,0);
  await writeFile(f.artifact.payloadRef,original);await f.executor.releaseResearch('p',releaseRequest(f),human);const id=f.executor.continueResearch('p',continuationRequest(f));
  const providers=providerSet(f.calls,(receipt,request)=>{
    if(request.outputSchema.properties.outputKind?.enum[0]==='strategy')f.store.command('p',{kind:'set-policy',mode:'auto',humanGates:[],authorizedThrough:'research',commandId:'mid-call-policy',expectedRevision:f.store.read('p').revision},human);
    return receipt;
  }),executor=createExecutor({store:f.store,rootDir:f.root,bindings,providers,imageProvider:null});
  const result=await executor.execute('p',id);assert.equal(result.status,'awaiting_reconciliation');assert.equal(f.store.read('p').activeByStage.strategy,undefined);assert.equal(f.store.read('p').releases.length,1);assert.ok(f.store.read('p').jobs.find(j=>j.id===id).attempts[0].receipt);
});

test('changed runtime strategy binding blocks declaration-authorized dispatch before any invocation',async t=>{
  const f=await acceptedOperatorResearch(await fixture(t));await f.executor.releaseResearch('p',releaseRequest(f),human);const id=f.executor.continueResearch('p',continuationRequest(f)),before=f.calls.length;
  const executor=createExecutor({store:f.store,rootDir:f.root,bindings:{...bindings,strategy:{...bindings.strategy,role:'changed-strategy-role'}},providers:f.providers,imageProvider:null});
  assert.equal((await executor.execute('p',id)).status,'blocked');assert.equal(f.calls.length,before);
});
