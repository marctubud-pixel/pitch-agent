import {syntheticStrategyV2} from './strategy-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {openStore} from './store.mjs';
import {createExecutor} from './executor.mjs';
import {createServer} from './server.mjs';

const hash = text => createHash('sha256').update(text).digest('hex');
const source = {id: 's1', url: 'https://example.test/blue', text: 'Synthetic package is blue.', scopeRelation: 'background', verification: 'captured'};
const production = {outputKind: 'research_findings', status: 'complete', title: 'Synthetic research', summary: source.text, sections: [{heading: 'Finding', body: source.text, evidenceIds: ['s1']}], claims: [{text: source.text, kind: 'fact', evidenceRefs: ['s1'], limitations: ['Supplied excerpt only.']}], gaps: [], evidenceClassifications: [{sourceId: 's1', scopeRelation: 'background', reason: 'Bounded example.'}]};
const bindings = {research: {providerId: 'author', model: 'synthetic', role: 'research-lead'}, verification: {providerId: 'reviewer', model: 'synthetic', role: 'evidence-reviewer'}, readiness: {providerId: 'reviewer', model: 'synthetic', role: 'readiness-reviewer'}, strategy: {providerId: 'strategist', model: 'synthetic', role: 'strategy-lead'}};
const human = {actorId: 'human', actorType: 'human', runId: 'human', contextId: 'human'};
function output(request) {
  const p = request.packet ?? (request.outputSchema.properties.outputKind ? null : JSON.parse(request.prompt.split("UNTRUSTED_JSON_DATA\n")[1].split("\nEND_UNTRUSTED_JSON_DATA")[0]));
  const fixed = Object.fromEntries(Object.entries(request.outputSchema.properties).filter(([, value]) => value.enum).map(([key, value]) => [key, value.enum[0]]));
  if (!p) {
    if (request.outputSchema.properties.outputKind.enum[0] === 'strategy') {
      if(request.outputSchema.properties.strategyContractVersion)return syntheticStrategyV2(JSON.parse(request.prompt.slice(request.prompt.indexOf('UNTRUSTED_JSON_DATA\n')+20,request.prompt.lastIndexOf('\nEND_UNTRUSTED_JSON_DATA'))));
      const {evidenceClassifications, ...strategy} = production;
      return {...strategy, outputKind: 'strategy'};
    }
    return production;
  }
  if (p.protocolVersion === 'research-handoff-v1') return {...fixed, ownerBinding: p.ownerBinding, decision: 'accept', understoodFindings: [{finding: source.text, refs: [{location: '/content/sections/0/body', quote: source.text}]}], permittedUses: ['Explore the supplied blue example.'], prohibitedInferences: ['No consumer preference claim.'], unresolvedIssues: [], limitations: ['Synthetic test only.']};
  if (p.protocolVersion === 'research-readiness-v1') return {...fixed, verdict: 'ready', coverage: p.expectedCoverage.map(item => ({questionId: item.id, status: 'ready', rationale: 'Bounded synthetic task.', refs: [{location: '/content/sections/0/body', quote: source.text}], downstreamImpact: 'Explore blue.', researchNeeded: 'none'})), sourceAssessments: [{sourceId: source.id, textHash: hash(source.text), use: 'usable_with_limits', relevance: 'Supplied example.', provenance: 'Captured excerpt.', limitations: ['Not authenticated.'], refs: [{location: '/sourceRecords/0/text', quote: source.text}]}], findings: [], downstreamUse: {allowed: ['Explore blue.'], prohibited: ['No preference claim.']}, limitations: ['Synthetic test only.']};
  return {...fixed, results: p.claimManifest.filter(c=>c.claim.kind!=='creative').map(item => ({claimKey: item.claimKey, outcome: 'supported_excerpt', rationale: 'Exact supplied text.', citations: [{sourceId: source.id, textHash: hash(source.text), quote: source.text}], requirementRefs: [], limitations: []})), wholeTextScan: {status: 'complete', creativeClaimKeys: p.claimManifest.filter(c=>c.claim.kind==='creative').map(c=>c.claimKey), omissions: [], mismatchedCreative: [], ...(fixed.protocolVersion === 'excerpt-support-v3' ? {operationalAssertions: []} : {})}, limitations: []};
}
function providerSet(calls, transform = value => value) {
  return Object.fromEntries(['author', 'reviewer', 'strategist'].map(id => [id, {model: 'synthetic', execute: async request => {
    calls.push({id, request});
    const parsedOutput = output(request);
    return transform({runId: request.runId, requestedModel: 'synthetic', threadId: `${id}-${request.runId}`, inputPacketHash: hash(JSON.stringify((request.outputSchema.properties.protocolVersion?.enum[0] === 'excerpt-support-v3'||request.outputSchema.properties.strategyContractVersion) ? {runId: request.runId, model: 'synthetic', prompt: request.prompt, outputSchema: request.outputSchema} : request)), exitCode: 0, responseText: JSON.stringify(parsedOutput), parsedOutput}, request);
  }}]));
}
async function runtime(t, transform) {
  const root = await mkdtemp(join(tmpdir(), 'handoff-runtime-')), store = openStore(join(root, 'db')), calls = [];
  store.create({id: 'p', name: 'Synthetic', brief: 'Explore the supplied blue packaging example, without audience claims.', mode: 'auto', humanGates: []}, human);
  store.command('p', {kind: 'confirm-task-card', taskCardId: 'p:scope:1', commandId: 'confirm', expectedRevision: 0}, human);
  const executor = createExecutor({store, rootDir: root, bindings, providers: providerSet(calls, transform)});
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

async function accepted(t) {
  const fixture = await runtime(t);
  for (const side of ['producer', 'consumer']) assert.equal((await fixture.executor.execute('p', await fixture.executor.enqueueHandoff('p', fixture.artifact.id, side))).status, 'succeeded');
  return fixture;
}
const requestFor = fixture => ({artifactId: fixture.artifact.id, policyVersion: fixture.store.read('p').policies.at(-1).version, commandId: 'continue', expectedRevision: fixture.store.read('p').revision});

test('strategy jobs cannot use an owner that has not accepted released research', async t => {
  const f = await accepted(t);
  f.executor.continueResearch('p', requestFor(f));
  const changed = createExecutor({store: f.store, rootDir: f.root, bindings: {...bindings, strategy: {...bindings.strategy, providerId: 'replacement-provider'}}, providers: {...providerSet(f.calls), 'replacement-provider': providerSet(f.calls).strategist}});
  assert.throws(() => changed.enqueue('p', 'strategy', {commandId: 'replacement', expectedRevision: f.store.read('p').revision}), {code: 'HANDOFF_REQUIRED'});
});

test('queued continuation cannot execute after its configured strategy owner changes', async t => {
  const f = await accepted(t);
  const jobId = f.executor.continueResearch('p', requestFor(f));
  const changed = createExecutor({store: f.store, rootDir: f.root, bindings: {...bindings, strategy: {...bindings.strategy, providerId: 'replacement-provider'}}, providers: {...providerSet(f.calls), 'replacement-provider': providerSet(f.calls).strategist}});
  assert.equal(changed.recoverContinuations('p')[0].blockedReason, 'MODEL_BINDING_MISMATCH');
  const count = f.calls.length;
  const job = await changed.execute('p', jobId);
  assert.equal(job.status, 'blocked');
  assert.equal(job.error.code, 'MODEL_BINDING_MISMATCH');
  assert.deepEqual(job.attempts, []);
  await assert.rejects(changed.execute('p', jobId, {retry: true}), {code: 'MODEL_BINDING_MISMATCH'});
  assert.equal(f.calls.length, count);
});

for (const field of ['model', 'role']) test(`generic strategy enqueue requires the accepted consumer ${field}`, async t => {
  const f = await accepted(t);
  f.executor.continueResearch('p', requestFor(f));
  const changed = createExecutor({store: f.store, rootDir: f.root, bindings: {...bindings, strategy: {...bindings.strategy, [field]: 'replacement'}}, providers: providerSet(f.calls)});
  assert.throws(() => changed.enqueue('p', 'strategy'), {code: 'HANDOFF_REQUIRED'});
});

test('generic queued strategy validates the consumer again at start and retry', async t => {
  const f = await accepted(t);
  f.executor.continueResearch('p', requestFor(f));
  const jobId = f.executor.enqueue('p', 'strategy');
  const changed = createExecutor({store: f.store, rootDir: f.root, bindings: {...bindings, strategy: {...bindings.strategy, providerId: 'replacement-provider'}}, providers: {...providerSet(f.calls), 'replacement-provider': providerSet(f.calls).strategist}});
  assert.equal((await changed.execute('p', await changed.enqueueHandoff('p', f.artifact.id, 'consumer'))).status, 'succeeded');
  const count = f.calls.length;
  const job = await f.executor.execute('p', jobId);
  assert.equal(job.status, 'blocked');
  assert.equal(job.error.code, 'HANDOFF_REQUIRED');
  assert.deepEqual(job.attempts, []);
  await assert.rejects(f.executor.execute('p', jobId, {retry: true}), {code: 'HANDOFF_REQUIRED'});
  assert.equal(f.calls.length, count);
});

test('startup blocks a queued continuation and preserves it across another restart', async t => {
  const f = await accepted(t);
  const jobId = f.executor.continueResearch('p', requestFor(f));
  const original = f.store.read('p').jobs.find(job => job.id === jobId);
  const count = f.calls.length;
  const options = {dbPath: join(f.root, 'db'), rootDir: f.root, bindings: {...bindings, strategy: {...bindings.strategy, providerId: 'replacement-provider'}}, providers: {...providerSet(f.calls), 'replacement-provider': providerSet(f.calls).strategist}};
  for (let restart = 0; restart < 2; restart++) {
    const server = createServer(options);
    await server.drain();
    await new Promise(resolve => server.close(resolve));
    const job = f.store.read('p').jobs.find(item => item.id === jobId);
    assert.equal(job.status, 'blocked');
    assert.equal(job.error.code, 'MODEL_BINDING_MISMATCH');
    assert.deepEqual(job.task, original.task);
    assert.deepEqual(job.binding, original.binding);
    assert.deepEqual(job.attempts, []);
    assert.equal(f.store.read('p').jobs.filter(item => item.stage === 'strategy').length, 1);
    assert.equal(f.calls.length, count);
  }
});

for (const workflow of ['legacy', 'operator']) {
  async function fixture(t) {
    if (workflow === 'legacy') return accepted(t);
    const {syntheticResearch, acceptedOperatorResearch, releaseRequest} = await import('./research-operator-fixture.mjs');
    const f = await acceptedOperatorResearch(await syntheticResearch());
    t.after(f.close);
    await f.executor.releaseResearch('p', releaseRequest(f), human);
    return f;
  }

  for (const drift of ['binding', 'provider', 'policy', 'source']) test(`${workflow} recovery diagnoses queued ${drift} drift without changing replay or dispatching`, async t => {
    const f = await fixture(t), request = requestFor(f), id = f.executor.continueResearch('p', request);
    let configuredBindings = bindings, providers = providerSet(f.calls);
    if (drift === 'binding') configuredBindings = {...bindings, strategy: {...bindings.strategy, role: 'replacement'}};
    if (drift === 'provider') providers = {};
    if (drift === 'policy') f.store.command('p', {kind: 'set-policy', mode: 'auto', humanGates: [], commandId: 'policy-drift', expectedRevision: f.store.read('p').revision}, human);
    if (drift === 'source') f.store.command('p', {kind: 'revise-task-card', taskCardId: 'scope2', brief: 'Changed synthetic scope', commandId: 'source-drift', expectedRevision: f.store.read('p').revision}, human);
    const restarted = createExecutor({store: f.store, rootDir: f.root, bindings: configuredBindings, providers});
    const before = f.store.read('p'), calls = f.calls.length;
    const reasons = {binding: 'MODEL_BINDING_MISMATCH', provider: 'PROVIDER_MISSING', policy: 'STALE_POLICY', source: 'STALE_ARTIFACT'};
    assert.deepEqual(restarted.recoverContinuations('p'), [{artifactId: f.artifact.id, blockedReason: reasons[drift]}]);
    assert.equal(restarted.continueResearch('p', request), id);
    assert.deepEqual(f.store.read('p'), before);
    assert.equal(f.calls.length, calls);
  });

  for (const status of ['succeeded', 'awaiting_reconciliation', 'blocked']) test(`${workflow} recovery preserves ${status} history after configuration and policy drift`, async t => {
    const f = await fixture(t), request = requestFor(f), id = f.executor.continueResearch('p', request);
    const executing = createExecutor({store: f.store, rootDir: f.root, bindings, providers: status === 'blocked' ? {} : providerSet(f.calls, receipt => {
      if (status === 'awaiting_reconciliation') throw new Error('Synthetic unknown strategy outcome');
      return receipt;
    })});
    assert.equal((await executing.execute('p', id)).status, status);
    f.store.command('p', {kind: 'set-policy', mode: 'auto', humanGates: [], commandId: 'history-policy-drift', expectedRevision: f.store.read('p').revision}, human);
    const restarted = createExecutor({store: f.store, rootDir: f.root, bindings: {...bindings, strategy: {...bindings.strategy, role: 'replacement'}}, providers: {}});
    const before = f.store.read('p'), calls = f.calls.length;
    assert.deepEqual(restarted.recoverContinuations('p'), [{jobId: id}]);
    assert.equal(restarted.continueResearch('p', request), id);
    assert.deepEqual(f.store.read('p'), before);
    assert.equal(f.calls.length, calls);
    if (status === 'awaiting_reconciliation') {
      await assert.rejects(executing.execute('p', id, {retry: true}));
      assert.deepEqual(f.store.read('p'), before);
      assert.equal(f.calls.length, calls);
    }
  });
}
