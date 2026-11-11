import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {applyCommand, createProject} from './project.mjs';
import {validateStageOutput} from './stage-content.mjs';
import {openStore} from './store.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const human = {actorType: 'human', actorId: 'human', runId: 'human-run', contextId: 'human-context'};
const author = {actorType: 'agent', actorId: 'author', runId: 'author-run', contextId: 'author-context', parentRunIds: ['parent-run']};
const reconciler = {actorType: 'agent', actorId: 'reconciler', runId: 'recovery-run', contextId: 'recovery-context', now: '2026-10-24T00:00:00Z'};
const binding = {providerId: 'codex', model: 'synthetic', role: 'researcher'};
const sourceRecords = [{id: 'source', url: 'https://example.com/source', text: 'Captured package details', verification: 'captured', scopeRelation: 'direct'}];
const rawOutput = {outputKind: 'research_findings', status: 'complete', title: 'Research', summary: 'Background', sections: [{heading: 'Source', body: 'Background detail', evidenceIds: ['source']}], claims: [{text: 'Background detail', kind: 'fact', evidenceRefs: ['source'], limitations: ['Captured excerpt only']}], gaps: [], evidenceClassifications: [{sourceId: 'source', scopeRelation: 'background', reason: 'Conservative treatment'}]};
function fixture({stage = 'research', output = rawOutput, store} = {}) {
  const input = {id: 'project', name: 'Recovery', brief: 'Synthetic brief', mode: 'auto'};
  let p = store ? store.create(input, human) : createProject(input, human);
  const send = (c, context = human) => {
    const command = {...c, commandId: `command-${p.revision}`, expectedRevision: p.revision};
    return p = store ? store.command(p.id, command, context) : applyCommand(p, command, context);
  };
  send({kind: 'confirm-task-card', taskCardId: p.activeTaskCardId});
  if (stage === 'strategy') {
    send({kind: 'request-stage', stage: 'research', jobId: 'upstream-job'});
    send({kind: 'complete-stage', jobId: 'upstream-job', artifactId: 'upstream', payloadRef: 'synthetic://upstream', contentHash: 'synthetic'}, author);
    send({kind: 'acknowledge-handoff', artifactId: 'upstream', side: 'producer', nextStage: 'strategy'}, author);
    send({kind: 'acknowledge-handoff', artifactId: 'upstream', side: 'consumer', nextStage: 'strategy'});
    send({kind: 'release-stage', artifactId: 'upstream'});
  }
  const task={id:'task',parentId:null,owner:'author',sourceRecords};
  if(stage==='strategy'){p=structuredClone(p);p.jobs.push({id:'job',stage,inputVersionIds:['upstream'],status:'queued',binding,task,attempts:[],requestedBy:human.actorId});}
  else send({kind:'request-stage',stage,jobId:'job',binding,task});
  send({kind: 'start-job', jobId: 'job', attemptId: 'attempt'}, author);
  const providerExecution = {runId: 'attempt', model: binding.model, requestedModel: binding.model, threadId: 'thread', inputPacketHash: hash('packet'), exitCode: 0, signal: null, responseText: JSON.stringify(output), parsedOutput: structuredClone(output)};
  const receipt = {...providerExecution, providerExecution, ...binding, attemptId: 'attempt', taskId: 'task'};
  send({kind: 'finish-job-error', jobId: 'job', attemptId: 'attempt', status: 'awaiting_reconciliation', error: {code: 'INVALID_STAGE_OUTPUT', message: 'Old validator rejected downgrade'}, receipt}, author);
  const command = {kind: 'reconcile-stage', commandId: 'recover', expectedRevision: p.revision, jobId: 'job', attemptId: 'attempt', artifactId: 'recovered', reconciliationId: 'reconciliation', payloadRef: 'synthetic://recovered', contentHash: hash(JSON.stringify(validateStageOutput(stage, output, {sourceRecords}).content, null, 2)), receiptHash: hash(JSON.stringify(receipt)), reason: 'Source downgrade is now accepted', validatorVersion: 'stage-content-v2'};
  return {get p() {return p;}, send, command};
}
const job = p => p.jobs.find(item => item.id === 'job');

test('reconciliation derives claims, preserves failure and author, and still requires evidence review', () => {
  const f = fixture();
  const before = JSON.stringify(job(f.p).attempts[0]);
  const recovered = applyCommand(f.p, f.command, reconciler);
  assert.equal(job(recovered).status, 'succeeded');
  assert.equal(job(recovered).error, undefined);
  assert.equal(JSON.stringify(job(recovered).attempts[0]), before);
  assert.equal(recovered.activeByStage.research, 'recovered');
  const artifact = recovered.artifacts[0];
  assert.deepEqual(artifact.author, author);
  assert.deepEqual(artifact.executionReceipt, job(f.p).attempts[0].receipt);
  assert.deepEqual(artifact.technicalReceipts.sourceCatalogue.records, sourceRecords);
  assert.equal(artifact.claims[0].verification, 'pending');
  assert.equal(artifact.reconciliationId, recovered.reconciliations[0].id);
  assert.deepEqual(recovered.reconciliations[0].context, reconciler);
  assert.equal(recovered.reconciliations[0].rawOutputHash, hash(job(f.p).attempts[0].receipt.responseText));
  assert.equal(recovered.releases.length, 0);
  assert.equal(recovered.reviews.length, 0);
  assert.equal(recovered.verifications.length, 0);
  assert.throws(() => applyCommand(recovered, {kind: 'release-stage', artifactId: 'recovered', commandId: 'release', expectedRevision: recovered.revision}, human), {code: 'HARD_BLOCKER'});
  const context = {...author, inputPacketHash: 'hash', ancestorActorIds: [], exposedReviewIds: [], authorRecommendations: [], priorScores: []};
  assert.throws(() => applyCommand(recovered, {kind: 'record-review', artifactId: 'recovered', reviewId: 'self', verdict: 'pass', findings: [], commandId: 'review', expectedRevision: recovered.revision}, context), {code: 'SELF_REVIEW'});
});

test('same recovery command is idempotent and altered payload or revision fails', () => {
  const f = fixture();
  const recovered = applyCommand(f.p, f.command, reconciler);
  assert.equal(applyCommand(recovered, f.command, reconciler), recovered);
  assert.throws(() => applyCommand(recovered, {...f.command, reason: 'Changed reason'}, reconciler), {code: 'COMMAND_ID_REUSED'});
  assert.throws(() => applyCommand(f.p, {...f.command, expectedRevision: f.p.revision - 1}, reconciler), {code: 'REVISION_CONFLICT'});
  assert.equal(recovered.reconciliations.length, 1);
  assert.equal(recovered.artifacts.length, 1);
});

test('receipt identity, hash, parsed response, nested execution, and output hash tampering all fail', () => {
  const changes = [
    receipt => {receipt.attemptId = 'other';}, receipt => {receipt.taskId = 'other';},
    receipt => {receipt.providerId = 'other';}, receipt => {receipt.model = 'other';},
    receipt => {receipt.role = 'other';}, receipt => {receipt.runId = 'other';},
    receipt => {receipt.requestedModel = 'other';}, receipt => {receipt.threadId = '';},
    receipt => {receipt.inputPacketHash = '';}, receipt => {receipt.exitCode = 1;},
    receipt => {receipt.signal = 'SIGTERM';}, receipt => {receipt.error = 'failed';},
    receipt => {receipt.reason = 'aborted';}, receipt => {receipt.responseText = '';},
    receipt => {receipt.responseText = 'not JSON';}, receipt => {receipt.parsedOutput.summary = 'changed';},
    receipt => {receipt.providerExecution.responseText = '{}';}, receipt => {receipt.providerExecution.threadId = 'other';},
  ];
  for (const change of changes) {
    const f = fixture(), p = structuredClone(f.p), receipt = job(p).attempts[0].receipt;
    change(receipt);
    const before = JSON.stringify(p);
    assert.throws(() => applyCommand(p, {...f.command, receiptHash: hash(JSON.stringify(receipt))}, reconciler));
    assert.equal(JSON.stringify(p), before);
  }
  const f = fixture();
  for (const patch of [{receiptHash: 'wrong'}, {contentHash: 'wrong'}, {attemptId: 'wrong'}, {reason: ''}, {validatorVersion: ''}]) {
    assert.throws(() => applyCommand(f.p, {...f.command, ...patch}, reconciler));
  }
  for (const patch of [{author}, {sourceRecords: []}, {claims: []}, {responseText: '{}'}, {executionReceipt: {}}]) {
    assert.throws(() => applyCommand(f.p, {...f.command, ...patch}, reconciler), {code: 'INVALID_RECONCILIATION'});
  }
});

test('missing receipts, interruptions, verification jobs and invalid or blocked output cannot reconcile', () => {
  const plan = fixture({output: {...rawOutput, outputKind: 'research_plan', status: 'blocked', claims: [], gaps: ['Need sources']}});
  assert.throws(() => applyCommand(plan.p, plan.command, reconciler), {code: 'STAGE_INPUT_GAP'});
  for (const mutate of [
    p => {delete job(p).attempts[0].receipt;},
    p => {job(p).attempts[0].error.code = 'INTERRUPTED';},
    p => {job(p).purpose = 'verification';},
    p => {job(p).attemptId = 'other';},
    p => {job(p).attempts[0].status = 'failed';},
  ]) {
    const f = fixture(), p = structuredClone(f.p); mutate(p);
    assert.throws(() => applyCommand(p, f.command, reconciler));
  }
  for (const mutate of [output => {output.status = 'blocked';}, output => {output.extra = 'invalid';}, output => {output.evidenceClassifications[0].scopeRelation = 'direct';}]) {
    const f = fixture(), p = structuredClone(f.p), receipt = job(p).attempts[0].receipt;
    const output = structuredClone(rawOutput); mutate(output);
    receipt.responseText = JSON.stringify(output); receipt.parsedOutput = output;
    receipt.providerExecution.responseText = receipt.responseText; receipt.providerExecution.parsedOutput = structuredClone(output);
    assert.throws(() => applyCommand(p, {...f.command, receiptHash: hash(JSON.stringify(receipt))}, reconciler));
  }
});

test('newer jobs and changed task cards preserve recovered artifacts without activating them', () => {
  for (const change of [
    f => f.send({kind: 'request-stage', stage: 'research', jobId: 'new-job'}),
    f => f.send({kind: 'revise-task-card', taskCardId: 'new-card', brief: 'Changed scope'}),
  ]) {
    const f = fixture(); change(f);
    const p = applyCommand(f.p, {...f.command, expectedRevision: f.p.revision}, reconciler);
    assert.equal(job(p).status, 'succeeded_stale');
    assert.equal(p.artifacts.at(-1).id, 'recovered');
    assert.equal(p.activeByStage.research, undefined);
  }
});

test('historical absent-version queued strategy remains recoverable and stale after superseded upstream', () => {
  const output = {...rawOutput, outputKind: 'strategy'}; delete output.evidenceClassifications;
  const f = fixture({stage: 'strategy', output});
  f.send({kind: 'request-stage', stage: 'research', jobId: 'new-research'});
  f.send({kind: 'complete-stage', jobId: 'new-research', artifactId: 'new-upstream', payloadRef: 'synthetic://new', contentHash: 'synthetic'}, author);
  const p = applyCommand(f.p, {...f.command, expectedRevision: f.p.revision}, reconciler);
  assert.equal(job(p).status, 'succeeded_stale');
  assert.equal(p.activeByStage.strategy, undefined);
  assert.deepEqual(p.artifacts.at(-1).inputVersionIds, ['upstream']);
});

test('SQLite reopen retains recovery links and original history, including idempotent retries', () => {
  const folder = mkdtempSync(join(tmpdir(), 'workbench-reconcile-'));
  let store;
  try {
    const file = join(folder, 'project.sqlite');
    store = openStore(file);
    const f = fixture({store}), before = store.read('project');
    const recovered = store.command('project', f.command, reconciler);
    store.close(); store = openStore(file);
    const saved = store.read('project');
    assert.deepEqual(saved, recovered);
    assert.deepEqual(store.read('project', before.revision), before);
    assert.deepEqual(job(saved).attempts, job(before).attempts);
    assert.equal(saved.artifacts[0].reconciliationId, saved.reconciliations[0].id);
    assert.deepEqual(store.command('project', f.command, reconciler), saved);
    assert.equal(store.read('project').revision, before.revision + 1);
    assert.throws(() => store.command('project', {...f.command, reason: 'Changed payload'}, reconciler), {code: 'COMMAND_ID_REUSED'});
  } finally {store?.close(); rmSync(folder, {recursive: true, force: true});}
});
