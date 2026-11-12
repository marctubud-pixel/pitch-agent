import test from 'node:test';
import assert from 'node:assert/strict';
import {freezeStep, requireStepBoundary, capability} from './visual-b-admission.mjs';

// Deliberately tiny data-only fixtures, never a review ticket or business completion.
function fixture() {
  const sha = 'a'.repeat(64);
  const target = {phase: 'final_visual', targetId: 'fixture-only-final-run', sourceHash: sha};
  const request = {commandId: 'fixture-command', expectedRevision: 1, phase: target.phase, targetId: target.targetId, sourceHash: sha, jobIds: ['job1', 'job2']};
  const jobs = ['job1', 'job2'].map(id => ({id, finalVisualRunId: target.targetId, purpose: 'final_visual_image', node: {key: `image:${id}`, phase: 'image'}, binding: {providerId: 'disabled-fixture', model: 'none'}, target: {id}, status: 'queued', attempts: []}));
  const method = {path: 'skills/visual-development-lead/SKILL.md', version: '1.0.0', sha256: sha, carrier: 'packaging', appendices: ['stage-review', 'records', 'packaging'].map(name => ({path: `skills/visual-development-lead/references/${name}.md`, sha256: sha}))};
  const snapshot = {task: 'fixture-task', policy: {authorizedThrough: 'visual'}, Q: 'fixture-Q', researchReleaseHash: sha, copyHash: sha, sourceHash: sha};
  const args = {request, target, snapshot, method, jobs};
  return {...args, ledger: freezeStep(args), jobId: 'job1'};
}
const fails = (args, code) => assert.throws(() => requireStepBoundary(args), {code});

test('disabled capability cannot imply execution or quality', () => {
  assert.deepEqual(capability(), {protocol: 'simple-visual-b-candidate-v1', executionAllowed: false, integrated: false, unknownRecoverySupported: false, semanticApproval: false});
});
test('fresh fixed target and job can pass pure boundary only', () => {
  const args = fixture();
  assert.equal(requireStepBoundary(args).id, 'job1');
  assert.equal(requireStepBoundary({...args, boundary: {kind: 'actual_claim'}}).id, 'job1');
});
for (const status of ['running', 'awaiting_reconciliation', 'unknown']) {
  test(`same target ${status} outside selected jobs stops dispatch and actual claim`, () => {
    const args = fixture();
    args.jobs.push({...structuredClone(args.jobs[0]), id: 'unselected', status});
    fails(args, 'VISUAL_B_OUTCOME_UNKNOWN');
    fails({...args, boundary: {kind: 'actual_claim'}}, 'VISUAL_B_OUTCOME_UNKNOWN');
    assert.throws(() => freezeStep(args), {code: 'VISUAL_B_OUTCOME_UNKNOWN'});
  });
  test(`unrelated target ${status} does not stop this target`, () => {
    const args = fixture();
    args.jobs.push({...structuredClone(args.jobs[0]), finalVisualRunId: 'other', id: 'unrelated', status});
    assert.equal(requireStepBoundary(args).id, 'job1');
  });
}
test('already reconciled SIMPLE upstream is not treated as an unresolved B job', () => {
  const args = fixture();
  args.jobs.push({id: 'simple-restored', purpose: 'simple_strategy', status: 'succeeded', attempts: [{status: 'awaiting_reconciliation'}]});
  assert.equal(requireStepBoundary(args).id, 'job1');
});
test('own-running exception is limited to exact anchor attempt and executor', () => {
  const args = fixture(), executor = {actorId: 'a', runId: 'r', contextId: 'c'};
  Object.assign(args.jobs[0], {status: 'running', attempts: [{id: 'attempt1', executor}]});
  const boundary = {kind: 'anchor_own_result', jobId: 'job1', attemptId: 'attempt1', executor};
  assert.equal(requireStepBoundary({...args, boundary}).id, 'job1');
  fails(args, 'VISUAL_B_OUTCOME_UNKNOWN');
  fails({...args, boundary: {...boundary, attemptId: 'different'}}, 'VISUAL_B_OUTCOME_UNKNOWN');
  fails({...args, boundary: {...boundary, executor: {...executor, contextId: 'different'}}}, 'VISUAL_B_OUTCOME_UNKNOWN');
  fails({...args, boundary: {...boundary, kind: 'actual_claim'}}, 'VISUAL_B_OUTCOME_UNKNOWN');
});
test('own anchor never exempts another same-target running job', () => {
  const args = fixture(), executor = {actorId: 'a', runId: 'r', contextId: 'c'};
  for (const job of args.jobs) Object.assign(job, {status: 'running', attempts: [{id: 'attempt1', executor}]});
  fails({...args, boundary: {kind: 'anchor_own_result', jobId: 'job1', attemptId: 'attempt1', executor}}, 'VISUAL_B_OUTCOME_UNKNOWN');
});
test('missing attempt or executor identity cannot create an own-running exemption', () => {
  const args = fixture(); args.jobs[0].status = 'running';
  fails({...args, boundary: {kind: 'anchor_own_result', jobId: 'job1'}}, 'VISUAL_B_OUTCOME_UNKNOWN');
});
for (const key of ['task', 'policy', 'Q', 'researchReleaseHash', 'copyHash', 'sourceHash']) {
  test(`changed ${key} invalidates frozen boundary`, () => {
    const args = fixture(); args.snapshot[key] = 'changed'; fails(args, 'VISUAL_B_STALE');
  });
}
test('Skill and carrier appendix bytes remain frozen', () => {
  const args = fixture(); args.method.appendices[0].sha256 = 'b'.repeat(64); fails(args, 'VISUAL_B_STALE');
});
test('binding or target mutation cannot dispatch', () => {
  const args = fixture(); args.jobs[0].binding.model = 'changed'; fails(args, 'VISUAL_B_JOB_CHANGED');
  const other = fixture(); other.jobs[0].target.id = 'changed'; fails(other, 'VISUAL_B_JOB_CHANGED');
});
test('replay cannot add an eligible later job or change request bytes', () => {
  const args = fixture(); args.request.jobIds.push('job3'); fails(args, 'VISUAL_B_REQUEST_CHANGED');
});
test('outside fixed job set fails even with otherwise identical metadata', () => {
  const args = fixture(); args.jobs.push({...structuredClone(args.jobs[0]), id: 'job3'});
  fails({...args, jobId: 'job3'}, 'VISUAL_B_JOB_CHANGED');
});
test('completed or previously attempted job cannot redispatch', () => {
  const args = fixture(); args.jobs[0].attempts.push({id: 'old'}); fails(args, 'VISUAL_B_NOT_FRESH_QUEUED');
  const done = fixture(); done.jobs[0].status = 'succeeded'; fails(done, 'VISUAL_B_NOT_FRESH_QUEUED');
});
test('freeze rejects duplicate ids, excessive batch and missing method annex', () => {
  const args = fixture(); args.request.jobIds = ['job1', 'job1']; assert.throws(() => freezeStep(args), {code: 'VISUAL_B_JOB_SET_INVALID'});
  const many = fixture(); many.request.jobIds = Array(5).fill(0).map((_, i) => `j${i}`); assert.throws(() => freezeStep(many), {code: 'VISUAL_B_JOB_SET_INVALID'});
  const missing = fixture(); missing.method.appendices.pop(); assert.throws(() => freezeStep(missing), {code: 'VISUAL_B_METHOD_REQUIRED'});
});
test('freeze captures immutable copies', () => {
  const args = fixture(); args.jobs[0].node.key = 'changed'; args.snapshot.task = 'changed';
  assert.equal(args.ledger.jobs[0].node.key, 'image:job1'); assert.equal(args.ledger.snapshot.task, 'fixture-task');
});
