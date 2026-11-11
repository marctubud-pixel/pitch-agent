import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createProject, applyCommand} from './project.mjs';
import {buildImageObservationRequest, imageManifest} from './image-evidence.mjs';
const digest = value => createHash('sha256').update(value).digest('hex');
const human = {actorType: 'human', actorId: 'human', runId: 'human-run', contextId: 'human-context'};
const agent = {actorType: 'agent', actorId: 'observer', runId: 'observer-run', contextId: 'observer-context'};
const asset = {id: 'img_one', projectId: 'project', sha256: 'a'.repeat(64), mediaType: 'image/png', byteLength: 100, width: 10, height: 10, uploadedAt: '2026-10-24', provenance: {representation: 'screenshot', originalFilename: 'example.png'}};
function fixture() {
  let p = createProject({id: 'project', name: 'Project', brief: 'Brief'}, human);
  let seq = 0;
  const send = (c, context = agent) => p = applyCommand(p, {...c, commandId: `command-${++seq}`, expectedRevision: p.revision}, context);
  send({kind: 'confirm-task-card', taskCardId: p.activeTaskCardId}, human);
  send({kind: 'register-image', asset});
  const images = imageManifest([asset]);
  const request = buildImageObservationRequest({images});
  const binding = {providerId: 'codex', model: 'model', role: 'image-observer'};
  const task = {id: 'task', owner: 'observer', parentId: null, observationInput: {taskCard: p.taskCards[0], images}, request};
  const queue = {kind: 'request-observation', jobId: 'job', binding, task};
  const rawReport = {manifestHash: request.manifestHash, observations: [{imageId: asset.id, imageSha256: asset.sha256, visibleFeatures: [{id: 'f1', description: 'A circle', region: 'center'}], legibleText: [], uncertainties: ['Text unreadable'], limitations: ['Screenshot does not establish physical properties']}]};
  const executionReceipt = {attemptId: 'attempt', runId: 'attempt', providerId: 'codex', model: 'model', requestedModel: 'model', role: 'image-observer', taskId: 'task', threadId: 'thread', exitCode: 0, images: images.map(i => ({...i, path: '/private/image.png'})), responseText: JSON.stringify(rawReport), inputPacketHash: digest(JSON.stringify({runId: 'attempt', model: 'model', prompt: request.prompt, outputSchema: request.outputSchema, images}))};
  const complete = {kind: 'complete-observation', jobId: 'job', attemptId: 'attempt', reportId: 'report', rawReport, payloadRef: 'payload.json', contentHash: digest(JSON.stringify(rawReport, null, 2)), executionReceipt};
  return {send, get: () => p, queue, complete};
}
test('observation preserves frozen assets and appends reports without stage promotion', () => {
  const f = fixture(); f.send(f.queue); f.send({kind: 'start-job', jobId: 'job', attemptId: 'attempt'}); f.send(f.complete);
  const p = f.get(); assert.equal(p.imageObservations.length, 1); assert.equal(p.jobs[0].status, 'succeeded');
  assert.deepEqual(p.artifacts, []); assert.deepEqual(p.releases, []); assert.deepEqual(p.activeByStage, {});
  assert.ok(Object.isFrozen(p.imageAssets[0])); assert.ok(Object.isFrozen(p.imageObservations[0].rawReport));
  assert.throws(() => f.send(f.complete), /Running job required/);
});
test('registration is trusted and cannot replace assets or cross projects', () => {
  const f = fixture(); assert.throws(() => f.send({kind: 'register-image', asset: {...asset, id: 'img_two'}}, human), /trusted ingestion/);
  assert.throws(() => f.send({kind: 'register-image', asset}), /Unique project-bound/);
  assert.throws(() => f.send({kind: 'register-image', asset: {...asset, id: 'img_two', projectId: 'other'}}), /Unique project-bound/);
});
test('request requires exact registered manifest and current confirmed card', () => {
  const f = fixture(); const bad = structuredClone(f.queue); bad.task.observationInput.images[0].sha256 = 'b'.repeat(64);
  assert.throws(() => f.send(bad), /immutable assets/);
  f.send(f.queue); f.send({kind: 'revise-task-card', taskCardId: 'scope2', brief: 'New'}, human);
  assert.throws(() => f.send({kind: 'start-job', jobId: 'job', attemptId: 'attempt'}), /confirmed task card/);
});
test('completion rejects forged reports, manifest, request hash and human executor', () => {
  const f = fixture(); f.send(f.queue); f.send({kind: 'start-job', jobId: 'job', attemptId: 'attempt'});
  for (const mutate of [c => c.executionReceipt.images[0].sha256 = 'b'.repeat(64), c => c.executionReceipt.inputPacketHash = 'x', c => c.rawReport.observations[0].visibleFeatures[0].description = 'invented', c => c.contentHash = '0'.repeat(64)]) {
    const bad = structuredClone(f.complete); mutate(bad); assert.throws(() => f.send(bad));
  }
  assert.throws(() => f.send(f.complete, human), /claiming executor/);
  assert.equal(f.get().imageObservations.length, 0);
});
test('same request command is idempotent and old snapshots initialize image collections', () => {
  const f = fixture(); const p = f.get(); const command = {...f.queue, commandId: 'fixed', expectedRevision: p.revision};
  const next = applyCommand(p, command, human); assert.equal(applyCommand(next, command, human), next);
  const old = structuredClone(createProject({id: 'old', name: 'Old', brief: 'Brief'}, human)); delete old.imageAssets; delete old.imageObservations;
  const migrated = applyCommand(old, {kind: 'confirm-task-card', taskCardId: old.activeTaskCardId, commandId: 'migrate', expectedRevision: 0}, human);
  assert.deepEqual(migrated.imageAssets, []); assert.deepEqual(migrated.imageObservations, []);
});
test('failed observation can retry with a new attempt while retaining its failure', () => {
  const f = fixture(); f.send(f.queue); f.send({kind: 'start-job', jobId: 'job', attemptId: 'attempt'});
  f.send({kind: 'finish-job-error', jobId: 'job', attemptId: 'attempt', status: 'failed', error: {code: 'FAILED', message: 'failure'}});
  f.send({kind: 'retry-job', jobId: 'job', attemptId: 'retry'});
  assert.deepEqual(f.get().jobs[0].attempts.map(a => a.status), ['failed', 'running']);
});
test('observer execution and thread cannot be reused by research or another observation', () => {
  const f = fixture(); f.send(f.queue); f.send({kind: 'start-job', jobId: 'job', attemptId: 'attempt'}); f.send(f.complete);
  f.send({kind: 'request-stage', stage: 'research', jobId: 'research-job', binding: f.queue.binding, task: {id: 'research-task', parentId: null, owner: 'researcher'}});
  assert.throws(() => f.send({kind: 'start-job', jobId: 'research-job', attemptId: 'research-attempt'}), /cannot author or review/);
  f.send({...f.queue, jobId: 'second'}); f.send({kind: 'start-job', jobId: 'second', attemptId: 'second-attempt'});
  const bad = structuredClone(f.complete); bad.jobId = 'second'; bad.attemptId = 'second-attempt'; bad.reportId = 'second-report'; bad.executionReceipt.attemptId = 'second-attempt';
  assert.throws(() => f.send(bad), /thread must be independent/);
});
test('observation cannot use a prior research executor context', () => {
  const f = fixture(); f.send({kind: 'request-stage', stage: 'research', jobId: 'research-job', binding: f.queue.binding, task: {id: 'research-task', parentId: null, owner: 'researcher'}});
  f.send({kind: 'start-job', jobId: 'research-job', attemptId: 'research-attempt'}); f.send(f.queue);
  assert.throws(() => f.send({kind: 'start-job', jobId: 'job', attemptId: 'attempt'}), /separate from research/);
});
