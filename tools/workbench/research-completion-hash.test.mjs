import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {openStore} from './store.mjs';
import {createExecutor} from './executor.mjs';
import {source, bindings, human, providerSet} from './research-operator-fixture.mjs';

const hash = text => createHash('sha256').update(text).digest('hex');
async function runtime(t, transform) {
  const root = await mkdtemp(join(tmpdir(), 'handoff-runtime-')), store = openStore(join(root, 'db')), calls = [];
  store.create({id: 'p', name: 'Synthetic', brief: 'Explore the supplied blue packaging example, without audience claims.', mode: 'auto', humanGates: []}, human);
  store.command('p', {kind: 'confirm-task-card', taskCardId: 'p:scope:1', commandId: 'confirm', expectedRevision: 0}, human);
  const executor = createExecutor({store, rootDir: root, bindings, providers: providerSet(calls, transform, root)});
  t.after(async () => {store.close(); await rm(root, {recursive: true, force: true});});
  const produced = await executor.execute('p', executor.enqueue('p', 'research', {sourceRecords: [source]}));
  assert.equal(produced.status, 'succeeded', JSON.stringify(produced.error));
  const artifact = store.read('p').artifacts[0];
  for (const enqueue of ['enqueueVerification', 'enqueueReadiness']) {
    const job = await executor.execute('p', await executor[enqueue]('p', artifact.id));
    assert.equal(job.status, 'succeeded', JSON.stringify(job.error));
  }
  return {root, store, executor, calls, artifact};
}


import {applyCommand} from './project.mjs';
import {validateResearchReadinessOutput} from './research-readiness.mjs';
import {validateResearchHandoffOutput} from './research-handoff.mjs';

for (const [purpose, decision] of [['readiness', 'ready'], ['readiness', 'needs_research'], ['handoff', 'accept'], ['handoff', 'blocked']]) {
  test(`v2 ${purpose} ${decision} rejects forged completion atomically and accepts original bytes`, async t => {
    const {store, executor, artifact} = await runtime(t, (receipt, request) => {
      if (!request.packet?.protocolVersion) return receipt;
      const parsedOutput = structuredClone(receipt.parsedOutput);
      if (purpose === 'readiness' && decision === 'needs_research' && request.packet.protocolVersion === 'research-readiness-v2') {
        parsedOutput.verdict = 'needs_research';
        parsedOutput.coverage = parsedOutput.coverage.map(item => ({...item, status: 'gap', researchNeeded: 'Research users and use cases.'}));
      }
      if (purpose === 'handoff' && decision === 'blocked' && request.packet.protocolVersion === 'research-handoff-v2') {
        parsedOutput.decision = 'blocked';
        parsedOutput.unresolvedIssues = [{reason: 'Synthetic bounded owner concern.', blocking: true, refs: [{location: '/content/sections/0/body', quote: source.text}]}];
      }
      return {...receipt, model: 'synthetic', parsedOutput, responseText: JSON.stringify(parsedOutput), inputPacketHash: hash(JSON.stringify({runId: request.runId, model: 'synthetic', prompt: request.prompt, outputSchema: request.outputSchema}))};
    });
    const assess = await executor.enqueueReadiness('p', artifact.id, {commandId: 'v2', expectedRevision: store.read('p').revision, protocolVersion: 'research-readiness-v2'});
    if (purpose === 'handoff') assert.equal((await executor.execute('p', assess)).status, 'succeeded');
    const jobId = purpose === 'readiness' ? assess : await executor.enqueueHandoff('p', artifact.id, 'producer', {commandId: 'owner-v2', expectedRevision: store.read('p').revision, protocolVersion: 'research-handoff-v2'});
    const originalCommand = store.command.bind(store);
    let inspected = 0, reducerRejections = 0, storeRejections = 0;
    store.command = (projectId, command, context) => {
      if (command.kind !== `complete-${purpose}`) return originalCommand(projectId, command, context);
      inspected++;
      const before = store.read(projectId), baseline = structuredClone(before);
      const job = before.jobs.find(item => item.id === jobId);
      const input = job.task[purpose === 'readiness' ? 'readinessInput' : 'handoffInput'];
      const validate = purpose === 'readiness' ? validateResearchReadinessOutput : validateResearchHandoffOutput;
      const forged = structuredClone(command.rawReport);
      forged.limitations.push('Forged material absent from the original response.');
      const mutations = [
        {...command, contentHash: '0'.repeat(64)},
        {...command, rawReport: forged, contentHash: hash(JSON.stringify(validate(forged, input), null, 2))},
        {...command, executionReceipt: {...command.executionReceipt, inputPacketHash: '0'.repeat(64)}}
      ];
      for (const [index, mutation] of mutations.entries()) {
        const code = index === 0 ? `INVALID_RESEARCH_${purpose.toUpperCase()}` : 'INVALID_EXECUTION_RECEIPT';
        assert.throws(() => applyCommand(before, mutation, context), error => error.code === code);
        reducerRejections++;
        assert.deepEqual(before, baseline, 'Reducer rejection must leave input state unchanged.');
        assert.throws(() => originalCommand(projectId, mutation, context), error => error.code === code);
        storeRejections++;
        assert.deepEqual(store.read(projectId), baseline, 'Store rejection must leave all durable state unchanged.');
      }
      return originalCommand(projectId, command, context);
    };
    const completed = await executor.execute('p', jobId);
    assert.equal(completed.status, 'succeeded', JSON.stringify(completed.error));
    assert.equal(inspected, 1);
    assert.equal(reducerRejections, 3);
    assert.equal(storeRejections, 3);
    t.diagnostic(`Completion intercepted ${inspected}; reducer attacks rejected ${reducerRejections}; store attacks rejected ${storeRejections}.`);
    const after = store.read('p'), reports = after[purpose === 'readiness' ? 'readinessReports' : 'handoffReports'];
    const saved = reports.find(item => item.jobId === jobId);
    assert.equal(saved[purpose === 'readiness' ? 'verdict' : 'decision'], decision);
    const input = after.jobs.find(item => item.id === jobId).task[purpose === 'readiness' ? 'readinessInput' : 'handoffInput'];
    const validate = purpose === 'readiness' ? validateResearchReadinessOutput : validateResearchHandoffOutput;
    assert.equal(saved.reportHash, hash(JSON.stringify(validate(saved.rawReport, input), null, 2)));
    assert.deepEqual(saved.rawReport, JSON.parse(saved.executionReceipt.responseText));
    assert.equal(await readFile(saved.payloadRef, 'utf8'), JSON.stringify(validate(saved.rawReport, input), null, 2));
    assert.equal(await readFile(saved.executionReceipt.paths.output, 'utf8'), saved.executionReceipt.responseText);
    assert.equal(after.releases.length, 0);
  });
}
