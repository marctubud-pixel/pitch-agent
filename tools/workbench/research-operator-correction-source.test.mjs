import test from 'node:test';
import assert from 'node:assert/strict';
import {syntheticResearch,acceptedOperatorResearch,declarationRequest,human} from './research-operator-fixture.mjs';
import {revisionSources,revisionPlan} from './project.mjs';
import {correctionSources} from './correction.mjs';
for(const protocol of ['research-handoff-v2','research-handoff-v3'])test(`${protocol} retains exact assessed handoff evidence in correction inventory`,async t=>{
 const f=await syntheticResearch();t.after(f.close);
 if(protocol==='research-handoff-v3')await acceptedOperatorResearch(f);
 else for(const side of ['producer','consumer'])assert.equal((await f.executor.execute('p',await f.executor.enqueueHandoff('p',f.artifact.id,side,{protocolVersion:protocol}))).status,'succeeded');
 const p=f.store.read('p'),sources=revisionSources(p,f.artifact.id),handoffs=sources.filter(s=>s.protocolVersion===protocol);
 assert.equal(handoffs.length,2);
 for(const source of handoffs){
  assert.deepEqual(source.handoffInput,p.jobs.find(j=>j.id===source.jobId).task.handoffInput);
  assert(source.constraints.some(c=>c.location==='/handoffInput'&&c.originalValue.assessment.id===source.handoffInput.assessment.id));
  for(const field of ['permittedUses','prohibitedInferences','restrictionDispositions'])assert(source.constraints.some(c=>c.location.startsWith(`/${field}/`))||!source.validatedReport[field].length);
  for(const mutate of [s=>delete s.handoffInput,s=>s.handoffInput.assessment.reportHash='0'.repeat(64),s=>s.rawReport.assessmentId='forged']){const changed=structuredClone(sources);mutate(changed.find(s=>s.key===source.key));assert.throws(()=>correctionSources(changed));}
 }
 if(protocol==='research-handoff-v3')assert(handoffs.every(s=>s.constraints.some(c=>c.location==='/declarationHash')));
});
test('actual blocked declaration-bound owner report remains an actionable immutable correction source',async t=>{
 const f=await syntheticResearch({transform:(receipt,request)=>{
  if(request.packet?.protocolVersion!=='research-handoff-v3')return receipt;
  const raw={...receipt.parsedOutput,decision:'blocked',unresolvedIssues:[{blocking:true,reason:'Synthetic missing research.',refs:[{location:'/content/sections/0/body',quote:request.packet.content.sections[0].body}]}]};
  return {...receipt,parsedOutput:raw,responseText:JSON.stringify(raw)};
 }});t.after(f.close);
 const saved=await f.executor.recordResearchHandoff('p',declarationRequest(f),human);assert.equal((await f.executor.execute('p',saved.jobId)).status,'succeeded');
 const plan=revisionPlan(f.store.read('p'),f.artifact.id),source=plan.sources.find(s=>s.protocolVersion==='research-handoff-v3');
 assert.equal(source.findings.length,1);assert.equal(source.findings[0].originalValue.blocking,true);assert.equal(source.handoffInput.operatorDeclaration.id,f.store.read('p').researchHandoffDeclarations[0].id);
 assert.throws(()=>f.executor.continueResearch('p',{artifactId:f.artifact.id,policyVersion:f.store.read('p').policies.at(-1).version,commandId:'blocked-continuation',expectedRevision:f.store.read('p').revision}));
});
