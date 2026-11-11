import test from 'node:test';
import assert from 'node:assert/strict';
import {syntheticResearch,bindings} from './research-operator-fixture.mjs';
import {researchAssessmentContext,researchAssessmentState,validatedResearchAssessment} from './project.mjs';

test('historical readiness remains readable but cannot authorize current progression or silently retry', async t => {
  const f=await syntheticResearch(); t.after(f.close);
  const p=f.store.read('p'),original=p.jobs.find(j=>j.purpose==='readiness');
  const input=structuredClone(original.task.readinessInput);
  delete input.evidenceLinkPolicy;
  input.applicability=researchAssessmentContext(p,f.artifact.id,bindings.readiness);
  const jobId='explicit-legacy-fixture';
  f.store.command('p',{kind:'request-readiness',artifactId:f.artifact.id,jobId,binding:bindings.readiness,
    task:{id:jobId,parentId:'p',owner:bindings.readiness.role,readinessInput:input},
    commandId:'legacy-fixture',expectedRevision:p.revision},{actorType:'agent',actorId:'fixture',runId:'legacy-fixture',contextId:'legacy-fixture'});
  const result=await f.executor.execute('p',jobId);
  assert.equal(result.status,'succeeded',JSON.stringify(result.error));
  const snapshot=f.store.read('p'),before=JSON.stringify(snapshot),calls=f.calls.length;
  assert.equal(validatedResearchAssessment(snapshot,f.artifact.id).input.evidenceLinkPolicy,undefined);
  assert.equal(researchAssessmentState(snapshot,f.artifact.id).blockedReason,'RESEARCH_READINESS_UPGRADE_REQUIRED');
  assert.equal(f.executor.researchWorkflow('p').checks.find(c=>c.id==='readiness').passed,false);
  assert.equal(f.executor.researchWorkflow('p').eligible,false);
  assert.equal(f.calls.length,calls);
  assert.equal(JSON.stringify(f.store.read('p')),before);
  const newId=await f.executor.enqueueReadiness('p',f.artifact.id,{commandId:'explicit-upgrade',expectedRevision:snapshot.revision,protocolVersion:'research-readiness-v2'});
  assert.notEqual(newId,jobId);
  assert.equal(f.calls.length,calls);
  assert.equal(f.store.read('p').jobs.find(j=>j.id===newId).task.readinessInput.evidenceLinkPolicy,'adopted-source-text-v1');
  const upgraded=await f.executor.execute('p',newId);
  assert.equal(upgraded.status,'succeeded',JSON.stringify(upgraded.error));
  assert.equal(researchAssessmentState(f.store.read('p'),f.artifact.id).blockedReason,'SEMANTIC_REVIEW_REQUIRED');
  const challenge=await f.executor.enqueueSemanticChallenge('p',f.artifact.id);
  assert.equal((await f.executor.execute('p',challenge)).status,'succeeded');
  assert.equal(f.executor.researchWorkflow('p').checks.find(c=>c.id==='readiness').passed,true);
  assert.equal(researchAssessmentState(f.store.read('p'),f.artifact.id).ready,true);
  assert.ok(f.store.read('p').readinessReports.some(r=>r.jobId===jobId));
});
