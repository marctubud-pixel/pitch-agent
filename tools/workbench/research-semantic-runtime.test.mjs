import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore} from './store.mjs';
import {createExecutor} from './executor.mjs';
import {syntheticResearch,acceptedOperatorResearch,releaseRequest,continuationRequest,human,bindings,providerSet} from './research-operator-fixture.mjs';
import {requireSemanticCoverage,revisionSources,revisionPlan,researchAssessmentState} from './project.mjs';
import {SEMANTIC_PROTOCOL} from './semantic-authority.mjs';
import {readStageInvocationOriginal} from './stage-original.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
function mutateOutcome(value,request,outcome){if(request.outputSchema.properties.protocolVersion?.enum[0]!==SEMANTIC_PROTOCOL)return value;const raw=JSON.parse(value.responseText);raw.relations[0].outcome=outcome;raw.relations[0].explanation='Blue packaging does not establish user preference.';return {...value,responseText:JSON.stringify(raw),parsedOutput:raw};}
const enqueue=async f=>f.executor.enqueueSemanticChallenge('p',f.artifact.id,{commandId:`critic-${f.store.read('p').revision}`,expectedRevision:f.store.read('p').revision});

test('independent positive pair permits handoff release and strategy; original contexts and evidence remain separate',async t=>{
 const f=await acceptedOperatorResearch(await syntheticResearch());t.after(f.close);
 const p=f.store.read('p'),critic=p.jobs.find(j=>j.purpose==='coverage_challenge'),primary=p.jobs.find(j=>j.purpose==='readiness');
 assert.notEqual(critic.attempts[0].receipt.threadId,primary.attempts[0].receipt.threadId);
 assert.notEqual(critic.attempts[0].receipt.inputPacketHash,primary.attempts[0].receipt.inputPacketHash);
 assert.ok(critic.task.semanticInput.sourceLimitations.length);assert.equal(Object.hasOwn(critic.task.semanticInput,'verdict'),false);
 assert.ok(!f.calls.find(c=>c.request.outputSchema.properties.protocolVersion?.enum[0]===SEMANTIC_PROTOCOL).request.prompt.includes('Bounded synthetic task.'));
 await f.executor.releaseResearch('p',releaseRequest(f),human);assert.equal(f.executor.researchWorkflow('p').eligible,true);
 const result=await f.executor.continueResearch('p',continuationRequest(f));assert.ok(result);
});
test('negative semantics blocks release and survives later positive and changed reviewer configuration',async t=>{
 let negative=true;const f=await syntheticResearch({semanticReview:false,transform:(v,r)=>mutateOutcome(v,r,negative?'insufficient':'supported')});t.after(f.close);
 const id=await enqueue(f);assert.equal((await f.executor.execute('p',id)).status,'succeeded');
 assert.throws(()=>requireSemanticCoverage(f.store.read('p'),f.artifact.id),{code:'SEMANTIC_REVIEW_BLOCKED'});
 assert.equal(f.executor.researchWorkflow('p').canDeliver.allowed,false);assert.equal(f.executor.researchWorkflow('p').canRelease.allowed,false);
 const sources=revisionSources(f.store.read('p'),f.artifact.id);assert.ok(sources.some(s=>s.kind==='coverage_challenge'));assert.ok(revisionPlan(f.store.read('p'),f.artifact.id).sources.some(s=>s.kind==='coverage_challenge'));
 negative=false;const again=await enqueue(f);assert.equal((await f.executor.execute('p',again)).status,'succeeded');
 assert.throws(()=>requireSemanticCoverage(f.store.read('p'),f.artifact.id),{code:'SEMANTIC_REVIEW_BLOCKED'});
 const cfg={...f.semanticConfiguration,challengeBinding:{...bindings.semantic,role:'new-semantic-reviewer'}};const lease=f.store.registerSemanticConfiguration(cfg,{expectedEpoch:1});
 const current=createExecutor({store:f.store,rootDir:f.root,bindings:{...bindings,semantic:cfg.challengeBinding},providers:f.providers,semanticLease:lease,imageProvider:null});
 const changed=await current.enqueueSemanticChallenge('p',f.artifact.id);assert.equal((await current.execute('p',changed)).status,'succeeded');
 assert.throws(()=>requireSemanticCoverage(f.store.read('p'),f.artifact.id),{code:'SEMANTIC_REVIEW_BLOCKED'});
});
test('configuration CAS, live old-object view and old instance cannot send after epoch change',async t=>{
 const f=await syntheticResearch();t.after(f.close);const cached=f.store.read('p');requireSemanticCoverage(cached,f.artifact.id);
 const queued=await enqueue(f),count=f.calls.length,other=openStore(join(f.root,'db'));t.after(()=>other.close());
 const cfg={...f.semanticConfiguration,challengeBinding:{...bindings.semantic,model:'changed'}};
 other.registerSemanticConfiguration(cfg,{expectedEpoch:1});
 assert.throws(()=>requireSemanticCoverage(cached,f.artifact.id),{code:'SEMANTIC_REVIEW_REQUIRED'});
 assert.throws(()=>f.store.registerSemanticConfiguration(f.semanticConfiguration,{expectedEpoch:1}),{code:'SEMANTIC_CONFIGURATION_CONFLICT'});
 assert.throws(()=>f.store.attachSemanticConfiguration(f.semanticConfiguration),{code:'SEMANTIC_CONFIGURATION_CHANGED'});
 const result=await f.executor.execute('p',queued);assert.equal(result.status,'blocked');assert.equal(f.calls.length,count);
});
test('configuration change during invocation retains receipt as unresolved and never sends it again',async t=>{
 let f;f=await syntheticResearch({semanticReview:false,transform:(v,r)=>{if(r.outputSchema.properties.protocolVersion?.enum[0]===SEMANTIC_PROTOCOL)f.store.registerSemanticConfiguration({...f.semanticConfiguration,challengeBinding:{...bindings.semantic,role:'changed'}},{expectedEpoch:1});return v;}});t.after(f.close);
 const id=await enqueue(f),result=await f.executor.execute('p',id);assert.equal(result.status,'awaiting_reconciliation');assert.ok(result.attempts[0].receipt.responseText);
 const restored=f.store.read('p').jobs.find(j=>j.id===id);
 const original=await readStageInvocationOriginal(f.store.read('p'),restored,restored.attempts[0],{executionRoot:f.root});assert.equal(original.outputText,restored.attempts[0].receipt.responseText);
 const count=f.calls.length;await assert.rejects(()=>f.executor.execute('p',id));assert.equal(f.calls.length,count);assert.equal(f.executor.researchWorkflow('p').eligible,false);
});
test('uncertain challenge and missing challenge never imply readiness',async t=>{
 const f=await syntheticResearch({semanticReview:false,transform:(v,r)=>mutateOutcome(v,r,'uncertain')});t.after(f.close);
 assert.throws(()=>requireSemanticCoverage(f.store.read('p'),f.artifact.id),{code:'SEMANTIC_REVIEW_REQUIRED'});
 const id=await enqueue(f);await f.executor.execute('p',id);assert.equal(researchAssessmentState(f.store.read('p'),f.artifact.id).ready,false);
});

test('primary gap blocks challenge enqueue without provider invocation',async t=>{
 const f=await syntheticResearch({semanticReview:false,transform:(v,r)=>{if(r.outputSchema.properties.protocolVersion?.enum[0]!=='research-readiness-v2')return v;const raw=JSON.parse(v.responseText);raw.verdict='needs_research';raw.coverage[0].status='gap';raw.coverage[0].researchNeeded='User evidence needed.';return {...v,responseText:JSON.stringify(raw),parsedOutput:raw};}});t.after(f.close);
 const count=f.calls.length;await assert.rejects(()=>enqueue(f));assert.equal(f.calls.length,count);
});
test('a negative challenge invalidates already queued strategy and frozen restrictions carry challenger limits',async t=>{
 let negative=false;const f=await acceptedOperatorResearch(await syntheticResearch({transform:(v,r)=>mutateOutcome(v,r,negative?'insufficient':'supported')}));t.after(f.close);
 await f.executor.releaseResearch('p',releaseRequest(f),human);const strategy=f.executor.continueResearch('p',continuationRequest(f));
 const frozen=f.store.read('p').jobs.find(j=>j.id===strategy);assert.ok(frozen.task.upstreamReviewConstraints[f.artifact.id].semantic.length);
 negative=true;await f.executor.execute('p',await enqueue(f));const count=f.calls.length;
 const result=await f.executor.execute('p',strategy);assert.notEqual(result.status,'succeeded');assert.equal(f.calls.length,count);
});
test('changed original research bytes block preclaim and retain in-flight result without authority',async t=>{
 for(const inflight of [false,true]){let f;f=await syntheticResearch({semanticReview:false,transform:async(v,r)=>{if(inflight&&r.outputSchema.properties.protocolVersion?.enum[0]===SEMANTIC_PROTOCOL)await writeFile(f.artifact.payloadRef,'{}');return v;}});t.after(f.close);
 const id=await enqueue(f),before=f.calls.length;if(!inflight)await writeFile(f.artifact.payloadRef,'{}');const result=await f.executor.execute('p',id);
 assert.notEqual(result.status,'succeeded');assert.equal(f.calls.length,before+(inflight?1:0));assert.equal(f.store.read('p').coverageChallenges?.length??0,0);
 }
});

test('trusted service startup registers explicitly, attaches without epoch mutation and sends no calls',async t=>{
 const {createServer}=await import('./server.mjs');const f=await syntheticResearch({semanticReview:false});t.after(f.close);const before=f.calls.length;
 const server=createServer({dbPath:join(f.root,'db'),rootDir:f.root,providers:f.providers,bindings,imageProvider:null,semanticReview:{configuration:f.semanticConfiguration}});
 await new Promise(resolve=>server.close(resolve));assert.equal(f.calls.length,before);assert.equal(f.store.semanticConfiguration().epoch,1);
 assert.throws(()=>createServer({dbPath:join(f.root,'db'),rootDir:f.root,bindings,imageProvider:null,semanticReview:{configuration:f.semanticConfiguration,expectedEpoch:0}}),{code:'SEMANTIC_CONFIGURATION_CONFLICT'});
});
