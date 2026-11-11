import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createProject, applyCommand, projectView} from './project.mjs';
import {openStore} from './store.mjs';

const human = {actorId: 'human', actorType: 'human', runId: 'human-run', contextId: 'human-context'};
const executor = {actorId: 'worker', actorType: 'agent', runId: 'run', contextId: 'context'};
const binding = {providerId: 'fake', model: 'synthetic', role: 'researcher'};
const task = {id: 'task', parentId: null, owner: 'worker'};
const receipt = {attemptId: 'attempt-1', ...binding, taskId: task.id};
const request = {kind: 'request-stage', stage: 'research', jobId: 'job', binding, task};
const start = {kind: 'start-job', jobId: 'job', attemptId: 'attempt-1'};
const complete = {kind: 'complete-stage', jobId: 'job', attemptId: 'attempt-1', artifactId: 'output', payloadRef: 'synthetic://output', contentHash: 'synthetic', executionReceipt: receipt};
function fixture() {
  let p = createProject({id: 'project', name: 'Synthetic lifecycle', brief: 'Synthetic', mode: 'auto'}, human);
  let serial = 0;
  const send = (command, context = human) => (p = applyCommand(p, {...command, commandId: `c${++serial}`, expectedRevision: p.revision}, context));
  send({kind: 'confirm-task-card', taskCardId: p.activeTaskCardId});
  send(request);
  return {get p() {return p;}, send};
}
test('claim is exclusive; completion needs exact executor, attempt and provenance', () => {
  const f = fixture();
  assert.throws(() => f.send(complete, executor), {code: 'EXECUTION_REQUIRED'});
  f.send(start, executor);
  assert.equal(projectView(f.p).stages[0].status, 'running');
  assert.throws(() => f.send({...start, attemptId: 'second'}, executor), {code: 'INVALID_JOB'});
  assert.throws(() => f.send(complete, {...executor, contextId: 'other'}), {code: 'WRONG_EXECUTOR'});
  assert.throws(() => f.send({...complete, attemptId: 'other'}, executor), {code: 'ATTEMPT_MISMATCH'});
  for (const key of ['attemptId', 'providerId', 'model', 'role', 'taskId']) {
    assert.throws(() => f.send({...complete, executionReceipt: {...receipt, [key]: 'other'}}, executor), {code: 'INVALID_EXECUTION_RECEIPT'});
  }
  f.send(complete, executor);
  assert.equal(f.p.jobs[0].status, 'succeeded');
  assert.equal(f.p.artifacts[0].provenance, 'provider_execution');
  assert.deepEqual(f.p.artifacts[0].executionReceipt, receipt);
});
test('failures preserve attempt history; only known safe failures permit explicit retry', () => {
  for (const status of ['failed', 'blocked', 'awaiting_reconciliation']) {
    const f = fixture(); f.send(start, executor);
    assert.throws(() => f.send({kind: 'finish-job-error', jobId: 'job', attemptId: 'attempt-1', status: 'unknown', error: {code: 'E', message: 'error'}}, executor), {code: 'INVALID_JOB_STATUS'});
    f.send({kind: 'finish-job-error', jobId: 'job', attemptId: 'attempt-1', status, error: {code: 'E', message: 'error'}, receipt}, executor);
    assert.equal(projectView(f.p).jobs[0].error.code, 'E');
    assert.equal(projectView(f.p).stages[0].status, status);
    const retry = {kind: 'retry-job', jobId: 'job', attemptId: 'attempt-2'};
    if (status === 'awaiting_reconciliation') assert.throws(() => f.send(retry, executor), {code: 'INVALID_JOB'});
    else {
      assert.throws(() => f.send({...retry, attemptId: 'attempt-1'}, executor), {code: 'INVALID_ATTEMPT'});
      f.send(retry, executor);
      assert.equal(f.p.jobs[0].attempts[0].status, status);
      assert.equal(f.p.jobs[0].attempts[1].status, 'running');
    }
  }
});
test('dispatch rechecks scope freshness and released dependencies after policy changes', () => {
  const f = fixture();
  f.send({kind: 'revise-task-card', taskCardId: 'new-scope', brief: 'New brief'});
  assert.throws(() => f.send(start, executor), {code: 'SCOPE_UNCONFIRMED'});
  f.send({kind: 'confirm-task-card', taskCardId: 'new-scope'});
  assert.throws(() => f.send(start, executor), {code: 'STALE_JOB'});

  const g = fixture();
  g.send({kind:'request-stage',stage:'research',jobId:'metadata'});
  g.send({kind:'complete-stage',jobId:'metadata',artifactId:'output',payloadRef:'synthetic://output',contentHash:'synthetic'},executor);
  g.send({kind: 'acknowledge-handoff', artifactId: 'output', side: 'producer', nextStage: 'strategy'}, executor);
  g.send({kind: 'acknowledge-handoff', artifactId: 'output', side: 'consumer', nextStage: 'strategy'});
  g.send({kind: 'release-stage', artifactId: 'output'});
  g.send({...request, stage: 'strategy', jobId: 'strategy'});
  g.send({kind: 'set-policy', mode: 'auto', humanGates: ['research']});
  assert.throws(() => g.send({...start, jobId: 'strategy', attemptId: 'strategy-attempt'}, executor), {code: 'DEPENDENCY_BLOCKED'});
  g.send({kind: 'set-policy', mode: 'auto', authorizedThrough: 'research'});
  assert.throws(() => g.send({...start, jobId: 'strategy', attemptId: 'strategy-attempt'}, executor), {code: 'AUTHORIZATION_ENDPOINT'});
});
test('interruption survives store reopen and cannot become success or be retried', () => {
  const dir = mkdtempSync(join(tmpdir(), 'workbench-job-'));
  let store;
  try {
    const path = join(dir, 'jobs.sqlite'); store = openStore(path);
    let p = store.create({id: 'project', name: 'Durable job', brief: 'Synthetic', mode: 'auto'}, human);
    const send = (c, context = human) => (p = store.command(p.id, {...c, commandId: `r${p.revision}`, expectedRevision: p.revision}, context));
    send({kind: 'confirm-task-card', taskCardId: p.activeTaskCardId}); send(request); send(start, executor);
    store.close(); store = openStore(path); p = store.read('project');
    assert.equal(p.jobs[0].status, 'running');
    assert.throws(() => send({...start, attemptId: 'duplicate'}, executor), {code: 'INVALID_JOB'});
    send({kind: 'mark-interrupted', jobId: 'job', attemptId: 'attempt-1'}, executor);
    store.close(); store = openStore(path); p = store.read('project');
    assert.equal(p.jobs[0].status, 'awaiting_reconciliation');
    assert.throws(() => send(complete, executor), {code: 'INVALID_JOB'});
    assert.throws(() => send({kind: 'retry-job', jobId: 'job', attemptId: 'attempt-2'}, executor), {code: 'INVALID_JOB'});
  } finally {store?.close(); rmSync(dir, {recursive: true, force: true});}
});
test('unknown stage and partial bindings are rejected; imports cannot claim execution provenance', () => {
  const f = fixture();
  for (const stage of ['toString', '__proto__', 'unknown']) assert.throws(() => f.send({...request, jobId: 'invalid', stage}), {code: 'INVALID_JOB'});
  assert.throws(() => f.send({...request, jobId: 'invalid', task: undefined}), {code: 'INVALID_JOB'});
  f.send({kind: 'request-stage', jobId: 'import', stage: 'research'});
  assert.throws(() => f.send({...start, jobId: 'import'}, executor), {code: 'EXECUTION_BINDING_REQUIRED'});
  f.send({...complete, jobId: 'import', attemptId: undefined, executionReceipt: undefined, provenance: 'provider_execution'}, executor);
  assert.equal(f.p.artifacts[0].provenance, 'imported_metadata');
});
