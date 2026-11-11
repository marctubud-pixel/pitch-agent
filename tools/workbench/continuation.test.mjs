import {syntheticStrategyV2} from './strategy-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import {createHash} from 'node:crypto';
import {createServer} from './server.mjs';
import {openStore} from './store.mjs';
import {createExecutor} from './executor.mjs';

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

async function httpFixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'handoff-http-')), calls = [], options = {dbPath: join(root, 'db'), rootDir: root, bindings, providers: providerSet(calls)};
  let server = createServer(options);
  t.after(async () => {await server.drain(); server.emit('close'); await rm(root, {recursive: true, force: true});});
  return {calls, drain: () => server.drain(), async reopen() {await server.drain(); server.emit('close'); server = createServer(options);}, async request(path, body) {
    const req = Readable.from([Buffer.from(body === undefined ? '' : JSON.stringify(body))]);
    Object.assign(req, {url: path, method: body === undefined ? 'GET' : 'POST', headers: {host: '127.0.0.1:4181', 'content-type': 'application/json'}});
    return new Promise(resolve => server.emit('request', req, {setHeader() {}, writeHead(status) {this.status = status;}, end(payload) {resolve({status: this.status, body: JSON.parse(String(payload))});}}));
  }};
}

async function accepted(t) {
  const fixture = await runtime(t);
  for (const side of ['producer', 'consumer']) assert.equal((await fixture.executor.execute('p', await fixture.executor.enqueueHandoff('p', fixture.artifact.id, side))).status, 'succeeded');
  return fixture;
}
const requestFor = fixture => ({artifactId: fixture.artifact.id, policyVersion: fixture.store.read('p').policies.at(-1).version, commandId: 'continue', expectedRevision: fixture.store.read('p').revision});

test('continuation generates strategy and converges across duplicate requests and executor restart', async t => {
  const f = await accepted(t), request = requestFor(f);
  const id = f.executor.continueResearch('p', request);
  assert.equal(f.executor.continueResearch('p', request), id);
  assert.equal((await f.executor.execute('p', id)).status, 'succeeded');
  const restarted = createExecutor({store: f.store, rootDir: f.root, bindings, providers: providerSet(f.calls)});
  assert.deepEqual(restarted.recoverContinuations('p'), [{jobId: id}]);
  assert.equal(restarted.continueResearch('p', {...request, commandId: 'second-click', expectedRevision: f.store.read('p').revision}), id);
  assert.equal(f.store.read('p').releases.length, 1);
  assert.equal(f.store.read('p').jobs.filter(j => j.stage === 'strategy').length, 1);
  assert.ok(f.store.read('p').activeByStage.strategy);
  assert.ok(f.calls.at(-1).request.prompt.includes('No consumer preference claim.'));
  assert.throws(() => restarted.continueResearch('p', {...request, policyVersion: 2}), {code: 'COMMAND_ID_REUSED'});
});

test('partial release commit survives queue failure and restart without duplicate release or job', async t => {
  const f = await accepted(t), request = requestFor(f);
  const failingStore = {...f.store, command(id, command, context) {
    if (command.kind === 'request-stage') throw new Error('synthetic disk failure before queue commit');
    return f.store.command(id, command, context);
  }};
  const interrupted = createExecutor({store: failingStore, rootDir: f.root, bindings, providers: providerSet(f.calls)});
  assert.throws(() => interrupted.continueResearch('p', request), /synthetic disk failure/);
  assert.equal(f.store.read('p').releases.length, 1);
  assert.equal(f.store.read('p').jobs.filter(j => j.stage === 'strategy').length, 0);
  const reopened = openStore(join(f.root, 'db'));
  try {
    const restarted = createExecutor({store: reopened, rootDir: f.root, bindings, providers: providerSet(f.calls)});
    const recovered = restarted.recoverContinuations('p');
    assert.ok(recovered[0].jobId);
    assert.equal(restarted.continueResearch('p', request), recovered[0].jobId);
    assert.equal((await restarted.execute('p', recovered[0].jobId)).status, 'succeeded');
    assert.equal(reopened.read('p').releases.length, 1);
    assert.equal(reopened.read('p').jobs.filter(j => j.stage === 'strategy').length, 1);
  } finally {reopened.close();}
});

test('missing human approval remains mandatory in auto mode; policy and stale input reject continuation', async t => {
  const f = await accepted(t);
  f.store.command('p', {kind: 'set-policy', mode: 'auto', humanGates: ['research'], commandId: 'gate', expectedRevision: f.store.read('p').revision}, human);
  const request = requestFor(f);
  assert.throws(() => f.executor.continueResearch('p', request), {code: 'HUMAN_GATE'});
  assert.equal(f.store.read('p').releases.length, 0);
  f.store.command('p', {kind: 'adopt-creative', artifactId: f.artifact.id, reason: 'Accept bounded synthetic example', commandId: 'adopt', expectedRevision: f.store.read('p').revision}, human);
  assert.throws(() => f.executor.continueResearch('p', request), {code: 'REVISION_CONFLICT'});
  assert.ok(f.executor.continueResearch('p', requestFor(f)));
  f.store.command('p', {kind: 'set-policy', mode: 'auto', humanGates: [], commandId: 'new-policy', expectedRevision: f.store.read('p').revision}, human);
  assert.throws(() => f.executor.continueResearch('p', {...requestFor(f), commandId: 'new-request', policyVersion: 2}), {code: 'STALE_POLICY'});
  f.store.command('p', {kind: 'revise-task-card', taskCardId: 'scope2', brief: 'Different requirements', commandId: 'revise', expectedRevision: f.store.read('p').revision}, human);
  assert.throws(() => f.executor.continueResearch('p', {...requestFor(f), commandId: 'new-request'}), error => ['SCOPE_UNCONFIRMED', 'STALE_ARTIFACT'].includes(error.code));
  assert.equal((await f.executor.execute('p', f.store.read('p').jobs.find(j => j.stage === 'strategy').id)).status, 'blocked');
});

test('recovery does not enqueue a released intent after scope changes', async t => {
  const f = await accepted(t), request = requestFor(f);
  const interrupted = createExecutor({store: {...f.store, command(id, c, context) {if (c.kind === 'request-stage') throw new Error('queue failed'); return f.store.command(id, c, context);}}, rootDir: f.root, bindings, providers: providerSet(f.calls)});
  assert.throws(() => interrupted.continueResearch('p', request), /queue failed/);
  f.store.command('p', {kind: 'revise-task-card', taskCardId: 'scope2', brief: 'Changed', commandId: 'revise', expectedRevision: f.store.read('p').revision}, human);
  assert.equal(f.executor.recoverContinuations('p')[0].blockedReason, 'STALE_ARTIFACT');
  assert.equal(f.store.read('p').jobs.filter(j => j.stage === 'strategy').length, 0);
});

test('HTTP continuation rejects forged proof, reports blockers, generates once and replays across server restart', async t => {
  const app = await httpFixture(t);
  const created = await app.request('/api/projects', {name: 'Synthetic', brief: 'Explore the blue example.', mode: 'auto', humanGates: ['research'], commandId: 'create'});
  const route = `/api/projects/${created.body.project.id}`;
  await app.request(`${route}/commands`, {kind: 'confirm-task-card', taskCardId: created.body.project.activeTaskCardId, expectedRevision: 0, commandId: 'confirm'});
  const {verification, ...captured} = source;
  await app.request(`${route}/jobs`, {stage: 'research', sourceRecords: [captured], commandId: 'produce', expectedRevision: 1}); await app.drain();
  assert.deepEqual((await app.request(route)).body.view.stages[0].blockedReasons, ['HARD_BLOCKER']);
  for (const endpoint of ['verifications', 'readiness', 'producer', 'consumer']) {
    const p = (await app.request(route)).body.project;
    const side = ['producer', 'consumer'].includes(endpoint) ? endpoint : null;
    const queued = await app.request(`${route}/${side ? 'handoffs' : endpoint}`, {artifactId: p.activeByStage.research, commandId: endpoint, expectedRevision: p.revision, ...(side ? {side} : {})});
    assert.equal(queued.status, 202, JSON.stringify(queued.body)); await app.drain();
  }
  let p = (await app.request(route)).body.project;
  let request = {artifactId: p.activeByStage.research, policyVersion: 1, commandId: 'continue', expectedRevision: p.revision};
  for (const field of ['binding', 'rawReport', 'executionReceipt', 'context', 'reviewIds', 'approved']) assert.equal((await app.request(`${route}/continuations`, {...request, [field]: true})).status, 400);
  assert.equal((await app.request(`${route}/continuations`, request)).body.error.code, 'HUMAN_GATE');
  assert.deepEqual((await app.request(route)).body.view.stages[0].blockedReasons, ['HUMAN_GATE']);
  await app.request(`${route}/commands`, {kind: 'adopt-creative', artifactId: request.artifactId, reason: 'Accept synthetic bounded research.', commandId: 'adopt', expectedRevision: p.revision});
  p = (await app.request(route)).body.project; request = {...request, expectedRevision: p.revision};
  const queued = await app.request(`${route}/continuations`, request);
  assert.equal(queued.status, 202, JSON.stringify(queued.body));
  assert.equal((await app.request(`${route}/continuations`, request)).body.jobId, queued.body.jobId);
  await app.drain(); await app.reopen();
  assert.equal((await app.request(`${route}/continuations`, request)).body.jobId, queued.body.jobId);
  await app.drain();
  p = (await app.request(route)).body.project;
  assert.equal(p.releases.length, 1);
  assert.ok(p.activeByStage.strategy);
  assert.equal(p.jobs.filter(j => j.stage === 'strategy').length, 1);
  assert.equal(app.calls.filter(call => call.request.outputSchema.properties.outputKind?.enum[0] === 'strategy').length, 1);
  const unsupported = {...request, artifactId: p.activeByStage.strategy, expectedRevision: p.revision, commandId: 'unsupported'};
  assert.equal((await app.request(`${route}/continuations`, unsupported)).status, 422);
});

test('missing owner acceptance and a changed strategy provider cannot release research', async t => {
  const f = await runtime(t);
  assert.throws(() => f.executor.continueResearch('p', requestFor(f)), {code: 'HANDOFF_REQUIRED'});
  assert.equal(f.store.read('p').releases.length, 0);
  for (const side of ['producer', 'consumer']) await f.executor.execute('p', await f.executor.enqueueHandoff('p', f.artifact.id, side));
  const changed = createExecutor({store: f.store, rootDir: f.root, bindings: {...bindings, strategy: {...bindings.strategy, role: 'replacement-strategy-owner'}}, providers: providerSet(f.calls)});
  assert.throws(() => changed.continueResearch('p', requestFor(f)), {code: 'HANDOFF_REQUIRED'});
  const unavailable = createExecutor({store: f.store, rootDir: f.root, bindings, providers: {}});
  assert.throws(() => unavailable.continueResearch('p', requestFor(f)), {code: 'PROVIDER_MISSING'});
  assert.equal(f.store.read('p').releases.length, 0);
});

test('lost queue acknowledgement replays the committed job without a second provider invocation', async t => {
  const f = await accepted(t), request = requestFor(f);
  const uncertain = createExecutor({store: {...f.store, command(id, command, context) {
    const result = f.store.command(id, command, context);
    if (command.kind === 'request-stage') throw new Error('queue committed; response lost');
    return result;
  }}, rootDir: f.root, bindings, providers: providerSet(f.calls)});
  assert.throws(() => uncertain.continueResearch('p', request), /response lost/);
  const recovered = f.executor.recoverContinuations('p')[0].jobId;
  assert.ok(recovered);
  assert.equal((await f.executor.execute('p', recovered)).status, 'succeeded');
  assert.equal(f.store.read('p').releases.length, 1);
  assert.equal(f.store.read('p').jobs.filter(j => j.stage === 'strategy').length, 1);
});
